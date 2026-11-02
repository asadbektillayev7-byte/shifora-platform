import { badRequest } from './http.js';

const DAY_MS = 86_400_000;

function dateValue(raw, field) {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || raw.startsWith('0000')) {
    throw badRequest('Sanani YYYY-MM-DD shaklida kiriting.', { [field]: 'Yaroqli sanani kiriting.' });
  }
  const value = Date.parse(`${raw}T00:00:00Z`);
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== raw) {
    throw badRequest('Sana mavjud emas.', { [field]: 'Yaroqli sanani kiriting.' });
  }
  return value;
}

/** Inclusive calendar-day range. Never materializes doses or infers adherence. */
export function parseMedicationHistoryRange(query = {}) {
  if (query.from === undefined && query.to === undefined) return null;
  if (query.from === undefined || query.to === undefined) {
    throw badRequest('Davrning boshlanish va tugash sanalarini kiriting.');
  }
  const from = dateValue(query.from, 'from');
  const to = dateValue(query.to, 'to');
  if (from > to) throw badRequest('Boshlanish sanasi tugash sanasidan keyin bo‘lmasin.');
  const days = (to - from) / DAY_MS + 1;
  if (days > 366) throw badRequest('Bir so‘rovda ko‘pi bilan 366 kunni tanlang.');
  return { from: query.from, to: query.to, days };
}
