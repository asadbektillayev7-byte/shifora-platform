import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMedicationHistoryRange } from '../src/lib/medicationHistoryRange.js';

test('history ranges include both calendar days and permit a full leap year', () => {
  assert.equal(parseMedicationHistoryRange(), null);
  assert.deepEqual(parseMedicationHistoryRange({ from: '2024-01-01', to: '2024-12-31' }), {
    from: '2024-01-01', to: '2024-12-31', days: 366,
  });
  assert.equal(parseMedicationHistoryRange({ from: '2026-11-02', to: '2026-11-02' }).days, 1);
});

test('history ranges reject nonexistent dates, partial pairs, reversed and oversized windows', () => {
  for (const query of [
    { from: '2023-02-29', to: '2023-03-01' },
    { from: '2026-04-31', to: '2026-05-02' },
    { from: '0000-01-01', to: '0000-01-02' },
    { from: '2026-11-02' },
    { to: '2026-11-02' },
    { from: '2026-11-03', to: '2026-11-02' },
    { from: '2024-01-01', to: '2025-01-01' },
    { from: '2026-1-1', to: '2026-11-02' },
    { from: ['2026-11-01'], to: '2026-11-02' },
  ]) {
    assert.throws(() => parseMedicationHistoryRange(query), error => error.status === 400);
  }
});
