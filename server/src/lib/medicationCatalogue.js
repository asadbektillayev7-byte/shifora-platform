import { badRequest, notFound } from './http.js';

const TEXT_FIELDS = {
  name: 160,
  generic_name: 160,
  strength: 80,
  form: 80,
  unit: 30,
  notes: 2000,
};
const ALLOWED_FIELDS = new Set([...Object.keys(TEXT_FIELDS), 'is_active']);
const COLUMNS = 'id, name, generic_name, strength, form, unit, notes, is_active, created_at';

export function catalogueId(raw, label = 'Dori') {
  if (!['string', 'number'].includes(typeof raw) || !/^\d+$/.test(String(raw))) throw badRequest(`${label} identifikatori noto‘g‘ri.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) {
    throw badRequest(`${label} identifikatori noto‘g‘ri.`);
  }
  return value;
}

/** Catalogue metadata only. Patient doses and times belong to approved care plans. */
export function validateCatalogueInput(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('Dori ma’lumotlarini obyekt sifatida kiriting.');
  }
  const errors = Object.create(null);
  const values = Object.create(null);
  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) errors[key] = 'Bu maydonni o‘zgartirish mumkin emas.';
  }
  for (const [field, max] of Object.entries(TEXT_FIELDS)) {
    const provided = Object.hasOwn(body, field);
    if (partial && !provided) continue;
    const raw = provided ? body[field] : field === 'unit' ? 'mg' : '';
    if (typeof raw !== 'string') {
      errors[field] = 'Matn kiriting.';
      continue;
    }
    const value = raw.trim();
    if (field === 'name' && !value) errors.name = 'Dori nomini kiriting.';
    else if (value.length > max) errors[field] = `Ko‘pi bilan ${max} ta belgi kiriting.`;
    else if (value.includes('\0')) errors[field] = 'Matnda yaroqsiz belgi bor.';
    else values[field] = value;
  }
  if (Object.hasOwn(body, 'is_active')) {
    if (![true, false, 0, 1].includes(body.is_active)) errors.is_active = 'Faollik qiymati true, false, 0 yoki 1 bo‘lishi kerak.';
    else values.is_active = body.is_active ? 1 : 0;
  } else if (!partial) values.is_active = 1;
  if (partial && !Object.keys(body).length) throw badRequest('O‘zgartirish uchun kamida bitta maydon kiriting.');
  if (Object.keys(errors).length) throw badRequest('Dori ma’lumotlarini tekshiring.', errors);
  return values;
}

export function catalogueListOptions(query = {}) {
  if (query.query !== undefined && typeof query.query !== 'string') throw badRequest('Qidiruv matni noto‘g‘ri.');
  const search = (query.query ?? '').trim();
  if (search.length > 160 || search.includes('\0')) throw badRequest('Qidiruv matni 160 ta belgidan oshmasin.');
  let active = 1;
  if (query.include_inactive !== undefined) {
    if (typeof query.include_inactive !== 'string' || !['true', 'false', '1', '0'].includes(query.include_inactive)) throw badRequest('include_inactive qiymati noto‘g‘ri.');
    if (['true', '1'].includes(String(query.include_inactive))) active = null;
  }
  if (query.is_active !== undefined) {
    if (typeof query.is_active !== 'string' || !['0', '1', 'all'].includes(query.is_active)) throw badRequest('is_active qiymati 0, 1 yoki all bo‘lsin.');
    active = String(query.is_active) === 'all' ? null : Number(query.is_active);
  }
  const limit = query.limit === undefined ? 500 : catalogueId(query.limit, 'Natijalar soni');
  if (limit > 1000) throw badRequest('Ko‘pi bilan 1000 ta natija so‘rash mumkin.');
  return { search, active, limit };
}

/** Injected DB helpers keep authorization queries testable without a network database. */
export function createMedicationCatalogue({ all, get, insert, run }) {
  async function find(hospitalId, rawId) {
    const hospital = catalogueId(hospitalId, 'Shifoxona');
    const medicationId = catalogueId(rawId);
    const medication = await get(
      `SELECT ${COLUMNS} FROM medication_catalog WHERE id = ? AND hospital_id = ?`,
      medicationId, hospital,
    );
    if (!medication) throw notFound('Dori topilmadi.');
    return medication;
  }
  return {
    find,
    async list(hospitalId, query) {
      const hospital = catalogueId(hospitalId, 'Shifoxona');
      const { search, active, limit } = catalogueListOptions(query);
      const params = [hospital];
      let sql = `SELECT ${COLUMNS} FROM medication_catalog WHERE hospital_id = ?`;
      if (active !== null) { sql += ' AND is_active = ?'; params.push(active); }
      if (search) {
        // Escape LIKE metacharacters: a search for '%' is literal, never all records.
        sql += " AND LOWER(name || ' ' || generic_name || ' ' || strength || ' ' || form) LIKE LOWER(?) ESCAPE '\\'";
        params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
      }
      sql += ' ORDER BY LOWER(name), id LIMIT ?';
      params.push(limit);
      return all(sql, ...params);
    },
    async create(hospitalId, userId, body) {
      const hospital = catalogueId(hospitalId, 'Shifoxona');
      const author = catalogueId(userId, 'Xodim');
      const values = validateCatalogueInput(body);
      const medicationId = await insert(
        `INSERT INTO medication_catalog
         (hospital_id, name, generic_name, strength, form, unit, notes, is_active, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        hospital, values.name, values.generic_name, values.strength, values.form,
        values.unit, values.notes, values.is_active, author, author,
      );
      return find(hospital, medicationId);
    },
    async update(hospitalId, userId, rawId, body) {
      const hospital = catalogueId(hospitalId, 'Shifoxona');
      const author = catalogueId(userId, 'Xodim');
      const medicationId = catalogueId(rawId);
      const values = validateCatalogueInput(body, { partial: true });
      // The existence check and the write independently enforce hospital ownership.
      await find(hospital, medicationId);
      const fields = Object.keys(values);
      const result = await run(
        `UPDATE medication_catalog SET ${fields.map(field => `${field} = ?`).join(', ')},
         updated_at = datetime('now'), updated_by = ? WHERE id = ? AND hospital_id = ?`,
        ...fields.map(field => values[field]), author, medicationId, hospital,
      );
      if (!result.changes) throw notFound('Dori topilmadi.');
      return find(hospital, medicationId);
    },
  };
}
