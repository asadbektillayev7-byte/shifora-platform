import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { catalogueId, catalogueListOptions, createMedicationCatalogue, validateCatalogueInput } from '../src/lib/medicationCatalogue.js';

// A private in-memory fixture only. This test never imports app/config/DB code,
// reads connection credentials, migrates a database, or performs network I/O.
let database;
let catalogue;
beforeEach(() => {
  database = new DatabaseSync(':memory:');
  database.exec(`CREATE TABLE medication_catalog (
    id INTEGER PRIMARY KEY, hospital_id INTEGER NOT NULL, name TEXT NOT NULL,
    generic_name TEXT NOT NULL DEFAULT '', strength TEXT NOT NULL DEFAULT '',
    form TEXT NOT NULL DEFAULT '', unit TEXT NOT NULL DEFAULT 'mg', notes TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')), created_by INTEGER, updated_by INTEGER
  )`);
  const db = {
    all: async (sql, ...params) => database.prepare(sql).all(...params),
    get: async (sql, ...params) => database.prepare(sql).get(...params),
    insert: async (sql, ...params) => Number(database.prepare(sql).run(...params).lastInsertRowid),
    run: async (sql, ...params) => ({ changes: Number(database.prepare(sql).run(...params).changes) }),
  };
  catalogue = createMedicationCatalogue(db);
});
afterEach(() => database?.close());

test('catalogue metadata is validated without accepting ownership or prescription fields', () => {
  assert.equal(validateCatalogueInput({ name: '  Sample medicine  ' }).name, 'Sample medicine');
  assert.equal(validateCatalogueInput({ name: 'Sample', is_active: false }).is_active, 0);
  assert.equal(validateCatalogueInput({ notes: '' }, { partial: true }).notes, '');
  for (const payload of [null, [], { name: '' }, { name: 12 }, { name: 'A'.repeat(161) },
    { name: 'Sample', notes: 'A'.repeat(2001) }, { name: 'Sample', unit: 'A'.repeat(31) },
    { name: 'Sample', is_active: 'false' }, { name: 'Sample', is_active: 2 },
    { name: 'Sample', hospital_id: 2 }, { name: 'Sample', dose: '500' },
    JSON.parse('{"name":"Sample","__proto__":{}}'), { name: 'Bad\u0000name' }]) {
    assert.throws(() => validateCatalogueInput(payload), error => error.status === 400);
  }
  assert.throws(() => validateCatalogueInput({}, { partial: true }), error => error.status === 400);
});

test('IDs and catalogue filters reject ambiguous or unbounded inputs', () => {
  assert.equal(catalogueId('12'), 12);
  for (const value of [0, -1, '1.5', '1e2', '1 OR 1=1', 2147483648, [1], null, undefined]) {
    assert.throws(() => catalogueId(value), error => error.status === 400);
  }
  assert.equal(catalogueListOptions().active, 1);
  assert.equal(catalogueListOptions({ include_inactive: 'true' }).active, null);
  assert.equal(catalogueListOptions({ is_active: '0' }).active, 0);
  for (const query of [{ query: ['a'] }, { limit: '1001' }, { include_inactive: ['true'] }, { is_active: 'yes' }]) {
    assert.throws(() => catalogueListOptions(query), error => error.status === 400);
  }
});

test('hospital ownership scopes list, lookup, update and record creation', async () => {
  const own = await catalogue.create(1, 101, { name: 'Hospital one sample', notes: 'First note' });
  const foreign = await catalogue.create(2, 201, { name: 'Hospital two sample' });
  assert.deepEqual((await catalogue.list(1)).map(m => m.id), [own.id]);
  assert.deepEqual((await catalogue.list(2)).map(m => m.id), [foreign.id]);
  assert.equal((await catalogue.find(1, own.id)).hospital_id, undefined, 'Internal ownership metadata is not exposed');
  await assert.rejects(catalogue.find(1, foreign.id), error => error.status === 404);
  await assert.rejects(catalogue.update(1, 101, foreign.id, { name: 'Unauthorized change' }), error => error.status === 404);
  assert.equal((await catalogue.find(2, foreign.id)).name, 'Hospital two sample');
  const updated = await catalogue.update(1, 102, own.id, { notes: 'Revised catalogue note' });
  assert.equal(updated.notes, 'Revised catalogue note');
  assert.equal(updated.name, own.name, 'A partial patch preserves omitted fields');
  const stored = database.prepare('SELECT hospital_id, created_by, updated_by FROM medication_catalog WHERE id = ?').get(own.id);
  assert.equal(stored.hospital_id, 1);
  assert.equal(stored.created_by, 101);
  assert.equal(stored.updated_by, 102);
});

test('disabled entries can be recovered without entering the default prescribing picker', async () => {
  const active = await catalogue.create(1, 101, { name: 'Active sample' });
  const disabled = await catalogue.create(1, 101, { name: 'Disabled sample', is_active: false });
  assert.deepEqual((await catalogue.list(1)).map(m => m.id), [active.id]);
  assert.deepEqual((await catalogue.list(1, { is_active: '0' })).map(m => m.id), [disabled.id]);
  assert.equal((await catalogue.list(1, { include_inactive: 'true' })).length, 2);
  await catalogue.update(1, 101, disabled.id, { is_active: true });
  assert.equal((await catalogue.list(1)).length, 2);
});

test('catalogue search treats LIKE metacharacters and injected text literally', async () => {
  const percent = await catalogue.create(1, 101, { name: 'Demo 10% solution', generic_name: 'SAMPLE' });
  await catalogue.create(1, 101, { name: 'Another sample' });
  await catalogue.create(2, 201, { name: 'Foreign 10% solution' });
  assert.deepEqual((await catalogue.list(1, { query: '%' })).map(m => m.id), [percent.id]);
  assert.deepEqual((await catalogue.list(1, { query: 'sample' })).map(m => m.id), [2, 1]);
  assert.equal((await catalogue.list(1, { query: "' OR 1=1 --" })).length, 0);
});
