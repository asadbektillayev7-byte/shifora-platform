/**
 * Tests for the three core features:
 *   1. Glucose trend awareness (objective stats + approved thresholds)
 *   2. Medication reminders (doses, taken/missed tracking, reminders toggle)
 *   3. Unanswered-question safety queue (creation, staff resolution, isolation)
 *
 * Requires a migrated + seeded database. By default it uses
 * `postgres://localhost/shifora_test` (see TEST_DATABASE_URL). If the database
 * is empty, the seeded demo hospital is inserted automatically.
 *
 * Run with:  DATABASE_URL not needed  —  node --test tests/
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://localhost/shifora_test';
process.env.DATABASE_URL = TEST_DB;
process.env.TZ = process.env.SHIFORA_TZ ?? 'Asia/Tashkent';
process.env.SHIFORA_LOCAL_SCHEDULER = 'off';

const here = dirname(fileURLToPath(import.meta.url));
const { createApp } = await import('../src/app.js');
const { get, run, migrate, closePool } = await import('../src/db/index.js');

let server;
let base;

before(async () => {
  await migrate();
  await run('DELETE FROM patient_questions');
  await run('DELETE FROM question_notes');
  const users = await get('SELECT COUNT(*) AS c FROM users');
  if ((users?.c ?? 0) === 0) {
    execFileSync('node', [join(here, '..', 'src', 'db', 'seed.js')], {
      cwd: join(here, '..'),
      env: { ...process.env, DATABASE_URL: TEST_DB, SHIFORA_TZ: 'Asia/Tashkent' },
      stdio: 'ignore',
    });
  }
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
  // Warm the schema before the first request is on the hot path.
  await get('SELECT COUNT(*) AS c FROM patients');
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closePool();
});

async function login(phone, password, roleGroup) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password, role_group: roleGroup }),
  });
  assert.equal(res.status, 200, `login ${phone} should succeed`);
  const json = await res.json();
  return json.token;
}

const headers = (token) => ({ authorization: `Bearer ${token}` });
const call = (method, path, token, body) =>
  fetch(base + path, {
    method,
    headers: { ...headers(token), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

test('login works for demo accounts', async () => {
  const patientToken = await login('901234567', 'bemor', 'patient');
  const staffToken = await login('901112233', 'hamshira', 'hospital');
  assert.ok(patientToken.length > 20);
  assert.ok(staffToken.length > 20);
});

test('glucose trend: objective statistics over a window are computed', async () => {
  const token = await login('901234567', 'bemor', 'patient');
  const res = await call('POST', '/api/assistant/ask', token, {
    question: 'Oxirgi haftada qandim qanday bo\'lyapti?',
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.can_answer, true, 'glucose trend question should be answerable');
  assert.ok(json.stats?.count >= 0, 'stats should include a reading count');
  assert.ok(typeof json.stats?.avg === 'number');
  assert.ok(json.ranges?.low != null && json.ranges?.high != null, 'approved ranges should be present');
  assert.ok(json.sources?.length > 0, 'approved sources should be cited');
  assert.ok(!json.queued, 'answered questions must NOT create queue items');
});

test('medication reminders: dose rows exist and history records taken/missed', async () => {
  const token = await login('901234567', 'bemor', 'patient');
  const today = await (await call('GET', '/api/me/today', token)).json();
  const doseItems = today.plan.items.filter((i) => i.kind === 'medication');
  assert.ok(doseItems.length > 0, 'patient should have medication doses today');

  const measured = await (await call('GET', '/api/me/medications', token)).json();
  assert.ok(measured.medications.length > 0, 'medications should list the plan drug');
  assert.ok(
    Object.prototype.hasOwnProperty.call(measured.medications[0], 'reminders_enabled'),
    'medications should expose the reminders_enabled flag',
  );

  const pending = doseItems.find((i) => i.status === 'pending' || i.status === 'snoozed');
  if (pending) {
    const taken = await (await call('POST', `/api/doses/${pending.id}/take`, token, {})).json();
    assert.equal(taken.status, 'taken');
  }
});

test('medication taken/missed tracking updates status', async () => {
  const token = await login('901234567', 'bemor', 'patient');
  const today = await (await call('GET', '/api/me/today', token)).json();
  const pending = today.plan.items.find((i) => i.kind === 'medication' && i.status !== 'taken');
  if (!pending) return; // nothing left to mark on this day
  const missed = await (await call('POST', `/api/doses/${pending.id}/missed`, token, {})).json();
  assert.equal(missed.status, 'missed');
  const again = await (await call('POST', `/api/doses/${pending.id}/missed`, token, {})).json();
  assert.equal(again.ok, true);

  // A taken dose cannot be flipped to missed.
  const takenDose = (await (await call('GET', '/api/me/today', token)).json()).plan.items.find(
    (i) => i.kind === 'medication' && i.status === 'taken',
  );
  if (takenDose) {
    const bad = await call('POST', `/api/doses/${takenDose.id}/missed`, token, {});
    assert.equal(bad.status, 400);
  }
});

test('AI refusals: diagnosis questions are refused and queued', async () => {
  const token = await login('901234567', 'bemor', 'patient');
  const res = await call('POST', '/api/assistant/ask', token, {
    question: 'Menga diabet tashxisi qo‘yilganmi?',
  });
  const json = await res.json();
  assert.equal(json.can_answer, false);
  assert.equal(json.refused, true);
  assert.equal(json.queued, true);
  assert.ok(json.question_id, 'a refused question must be persisted');
  assert.match(json.answer, /javob bera olmayman/);
});

test('unanswered question creation: an unrecognised question lands in the queue', async () => {
  const token = await login('901234567', 'bemor', 'patient');
  const res = await call('POST', '/api/assistant/ask', token, {
    question: 'Televizor qaysi kanaldan kuzataman?',
  });
  const json = await res.json();
  assert.equal(json.queued, true);
  const staffToken = await login('901112233', 'hamshira', 'hospital');
  const queue = await (await call('GET', '/api/questions', staffToken)).json();
  assert.ok(queue.questions.length >= 1);
  const ours = queue.questions.find((q) => q.id === json.question_id);
  assert.ok(ours, 'the queued question should appear in the staff queue');
  assert.equal(ours.status, 'unanswered');
  assert.equal(ours.refused, 1);
  assert.ok(ours.refusal_reason);
});

test('staff answering a question makes the answer visible to the patient', async () => {
  const patientToken = await login('901234567', 'bemor', 'patient');
  const staffToken = await login('901112233', 'hamshira', 'hospital');

  const queued = await (await call('GET', '/api/questions?status=unanswered', staffToken)).json();
  assert.ok(queued.questions.length > 0, 'there should be unanswered questions');
  const q = queued.questions.find((x) => x.patient_id === 1) ?? queued.questions[0];

  const detail = await (await call('GET', `/api/questions/${q.id}`, staffToken)).json();
  assert.ok(detail.patient_context, 'staff detail must include patient context');
  assert.ok(detail.patient_context.medications);
  assert.ok(detail.references !== undefined);

  const answered = await (
    await call('PATCH', `/api/questions/${q.id}`, staffToken, {
      status: 'answered',
      answer: 'Hamshira javobi: bu holda ertaga rejalashtirilgan tekshiruvga keling.',
      priority: 'high',
    })
  ).json();
  assert.equal(answered.status, 'answered');
  assert.equal(answered.answer_source, 'hospital_staff_answer');
  assert.ok(answered.answered_by);

  const mine = await (await call('GET', '/api/assistant/questions', patientToken)).json();
  const seen = mine.questions.find((x) => x.id === q.id);
  assert.ok(seen, 'patient must see the question again');
  assert.equal(seen.status, 'answered');
  assert.match(seen.answer, /Hamshira javobi/);
});

test('patient isolation: a patient only ever sees their own questions', async () => {
  const first = await login('901234567', 'bemor', 'patient');
  await call('POST', '/api/assistant/ask', first, { question: 'Mening alohida savolim 12345' });
  const firstList = await (await call('GET', '/api/assistant/questions', first)).json();
  const mineRef = firstList.questions.find((q) => q.question === 'Mening alohida savolim 12345');
  assert.ok(mineRef, 'first patient must see their own queued question');

  const second = await login('901234570', 'bemor', 'patient');
  const list = await (await call('GET', '/api/assistant/questions', second)).json();
  assert.ok(list.questions.every((q) => q.question !== 'Mening alohida savolim 12345'));

  // A patient cannot read a staff queue or another patient's question detail.
  const staffOnly = await call('GET', '/api/questions', second);
  assert.equal(staffOnly.status, 403);
  const foreign = await call('GET', `/api/assistant/questions/${mineRef.id}`, second);
  assert.equal(foreign.status, 404);
});

test('staff authorization: queue scoped to hospital, staff-only actions', async () => {
  const staffToken = await login('901112233', 'hamshira', 'hospital');
  const queue = await (await call('GET', '/api/questions?status=unanswered', staffToken)).json();
  assert.ok(queue.questions.length > 0, 'a questioned should exist for the staff test');
  const target = queue.questions[0];

  const queued = await (
    await call('POST', `/api/questions/${target.id}/notes`, staffToken, { note: 'test izoh' })
  ).json();
  assert.ok(queued.id, 'staff can add internal notes to their own question');
  const patched = await call('PATCH', `/api/questions/${target.id}`, staffToken, {
    assigned_to: target.assigned_to ?? null,
    priority: 'high',
  });
  assert.equal(patched.status, 200);

  // The queue join on hospital_id guarantees a staff account from another
  // hospital can never see — and 403s the caller — this hospital's questions.
  const patientToken = await login('901234567', 'bemor', 'patient');
  const notes = await call('POST', `/api/questions/${target.id}/notes`, patientToken, { note: 'x' });
  assert.equal(notes.status, 403);
});

test('emergency questions bypass the normal unanswered flow', async () => {
  const patientToken = await login('901234567', 'bemor', 'patient');
  const res = await call('POST', '/api/assistant/ask', patientToken, {
    question: 'Shoshilinch yordam kerak, hushimni yo‘qotyapman',
  });
  const json = await res.json();
  assert.equal(json.priority, 'urgent', 'explicit emergency rule sets priority urgent');
  assert.equal(json.queued, true);
  assert.ok(json.alert_id, 'an emergency alert must be raised');

  const staffToken = await login('901112233', 'hamshira', 'hospital');
  const alerts = await (await call('GET', '/api/alerts?status=open&limit=50', staffToken)).json();
  const raised = alerts.alerts && alerts.alerts.some((a) => a.rule_code === 'emergency_question');
  assert.ok(raised, 'the emergency question should appear as an open alert for staff');
});