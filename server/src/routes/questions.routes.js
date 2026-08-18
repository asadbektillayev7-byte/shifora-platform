import { Router } from 'express';
import { all, get, run } from '../db/index.js';
import { badRequest, notFound, wrap } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { requireAuth, requireHospitalStaff } from '../middleware/auth.js';
import { getActivePlan } from '../services/carePlan.js';
import { notify } from '../services/notifications.js';
import { glucoseTrend } from '../services/assistant.js';

const router = Router();

router.use(requireAuth, requireHospitalStaff);

const QUESTION_STATUSES = ['unanswered', 'assigned', 'answered', 'closed'];
const QUESTION_PRIORITIES = ['normal', 'high', 'urgent'];

/**
 * The staff queue. Scoped to the caller's own hospital — a staff member can
 * never see another hospital's questions.
 */
router.get(
  '/',
  wrap(async (req, res) => {
    const hospitalId = req.user.hospital_id;
    const status = req.query.status && QUESTION_STATUSES.includes(req.query.status) ? req.query.status : null;
    const priority = req.query.priority && QUESTION_PRIORITIES.includes(req.query.priority) ? req.query.priority : null;
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const params = [hospitalId];
    let sql = `
      SELECT q.*, p.first_name, p.last_name, p.phone AS patient_phone,
             a.full_name AS assigned_name, b.full_name AS answered_name
        FROM patient_questions q
        JOIN patients p ON p.id = q.patient_id
        LEFT JOIN users a ON a.id = q.assigned_to
        LEFT JOIN users b ON b.id = q.answered_by
       WHERE p.hospital_id = ?`;
    if (status) { sql += ' AND q.status = ?'; params.push(status); }
    if (priority) { sql += ' AND q.priority = ?'; params.push(priority); }
    sql += ' ORDER BY CASE q.priority WHEN \'urgent\' THEN 0 WHEN \'high\' THEN 1 ELSE 2 END, q.created_at DESC LIMIT ?';
    params.push(limit);

    const counts = await get(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE q.status = 'unanswered') AS unanswered,
         COUNT(*) FILTER (WHERE q.status = 'assigned') AS assigned,
         COUNT(*) FILTER (WHERE q.status = 'answered') AS answered,
         COUNT(*) FILTER (WHERE q.status = 'closed') AS closed
       FROM patient_questions q JOIN patients p ON p.id = q.patient_id
       WHERE p.hospital_id = ?`,
      hospitalId,
    );

    res.json({
      questions: await all(sql, ...params),
      counts: {
        total: counts?.total ?? 0,
        unanswered: counts?.unanswered ?? 0,
        assigned: counts?.assigned ?? 0,
        answered: counts?.answered ?? 0,
        closed: counts?.closed ?? 0,
      },
    });
  }),
);

/**
 * Patient context shown to staff when resolving a question: glucose trend,
 * medications, latest labs, recent alerts, and the retrieval trail.
 */
async function buildPatientContext(patientId) {
  const trendAll = await glucoseTrend(patientId, { days: 14 });
  const trendFasting = await glucoseTrend(patientId, { days: 14, context: 'fasting' });
  const active = await getActivePlan(patientId);
  const medications = active
    ? await all(
        `SELECT m.name, m.dose, m.unit, m.priority, m.notes, m.reminders_enabled,
                s.time_of_day
           FROM medications m
           LEFT JOIN medication_schedules s ON s.medication_id = m.id
          WHERE m.care_plan_id = ? ORDER BY m.id, s.time_of_day`,
        active.id,
      )
    : [];
  const labResults = await all(
    `SELECT 'glucose' AS kind, value, unit, context, measured_at FROM glucose_readings
      WHERE patient_id = ? ORDER BY measured_at DESC LIMIT 5`,
    patientId,
  );
  const recentAlerts = await all(
    `SELECT a.id, a.title, a.severity, a.status, a.created_at
       FROM alerts a WHERE a.patient_id = ? ORDER BY a.created_at DESC LIMIT 5`,
    patientId,
  );
  return {
    glucose_trend: { all: trendAll, fasting: trendFasting },
    medications,
    active_plan: active ? { id: active.id, version: active.version, approved_at: active.approved_at } : null,
    lab_results: labResults,
    recent_alerts: recentAlerts,
  };
}

router.get(
  '/:id',
  wrap(async (req, res) => {
    const row = await get(
      `SELECT q.*, p.first_name, p.last_name, p.phone AS patient_phone, p.birth_date, p.gender,
              p.status AS patient_status, p.hospital_id,
              a.full_name AS assigned_name, b.full_name AS answered_name
         FROM patient_questions q
         JOIN patients p ON p.id = q.patient_id
         LEFT JOIN users a ON a.id = q.assigned_to
         LEFT JOIN users b ON b.id = q.answered_by
        WHERE q.id = ?`,
      Number(req.params.id),
    );
    if (!row) throw notFound('Savol topilmadi.');
    if (row.hospital_id !== req.user.hospital_id) {
      throw badRequest('Bu savol boshqa shifoxonaga tegishli.');
    }
    row.references = await all('SELECT * FROM question_references WHERE question_id = ? ORDER BY id', row.id);
    row.notes = await all(
      `SELECT n.*, u.full_name AS author FROM question_notes n
        JOIN users u ON u.id = n.created_by WHERE n.question_id = ? ORDER BY n.created_at`,
      row.id,
    );
    row.patient_context = await buildPatientContext(row.patient_id);
    res.json(row);
  }),
);

/** Assign, switch priority, answer, or close a question. */
router.patch(
  '/:id',
  wrap(async (req, res) => {
    const existing = await get(
      `SELECT q.*, p.hospital_id, p.user_id AS patient_user_id
         FROM patient_questions q JOIN patients p ON p.id = q.patient_id
        WHERE q.id = ?`,
      Number(req.params.id),
    );
    if (!existing) throw notFound('Savol topilmadi.');
    if (existing.hospital_id !== req.user.hospital_id) {
      throw badRequest('Bu savol boshqa shifoxonaga tegishli.');
    }

    const status = req.body?.status;
    const priority = req.body?.priority;
    const assignedTo = req.body?.assigned_to ? Number(req.body.assigned_to) : undefined;
    const answer = req.body?.answer;

    if (priority && !QUESTION_PRIORITIES.includes(priority)) throw badRequest("Noto'g'ri ustuvorlik.");
    if (status && !QUESTION_STATUSES.includes(status)) throw badRequest("Noto'g'ri holat.");

    const sets = [];
    const params = [];

    if (assignedTo !== undefined) {
      sets.push('assigned_to = ?');
      params.push(assignedTo);
    }
    if (priority) {
      sets.push('priority = ?');
      params.push(priority);
    }
    if (status === 'assigned') {
      sets.push("status = 'assigned'");
    }
    if (status === 'answered') {
      if (!answer?.trim()) throw badRequest('Bemorga javob matnini kiriting.');
      sets.push("status = 'answered', answer = ?, answered_by = ?, answered_at = datetime('now'), answer_source = 'hospital_staff_answer'");
      params.push(answer.trim(), req.user.id);
    }
    if (status === 'closed') {
      sets.push("status = 'closed'");
    }

    if (sets.length === 0) throw badRequest('Hech qanday o‘zgarish berilmagan.');
    sets.push("updated_at = datetime('now')");
    params.push(existing.id);

    await run(`UPDATE patient_questions SET ${sets.join(', ')} WHERE id = ?`, ...params);
    await audit(req, 'question.update', 'patient_question', existing.id, {
      status: status ?? null,
      priority: priority ?? null,
      assigned_to: assignedTo ?? null,
      answered: status === 'answered',
    });

    // A staff answer reaches the patient as an in-app notification.
    if (status === 'answered' && existing.patient_user_id) {
      await notify({
        userId: existing.patient_user_id,
        patientId: existing.patient_id,
        type: 'question_answer',
        title: 'Savolingizga javob tayyor',
        body: `${String(existing.question).slice(0, 120)} — javobni «Savollarim» bo‘limida ko‘ring.`,
        entityType: 'patient_question',
        entityId: existing.id,
      });
    }

    res.json(await get('SELECT * FROM patient_questions WHERE id = ?', existing.id));
  }),
);

/** Internal notes — visible to staff only, never to the patient. */
router.post(
  '/:id/notes',
  wrap(async (req, res) => {
    const existing = await get(
      `SELECT q.id, p.hospital_id FROM patient_questions q JOIN patients p ON p.id = q.patient_id WHERE q.id = ?`,
      Number(req.params.id),
    );
    if (!existing) throw notFound('Savol topilmadi.');
    if (existing.hospital_id !== req.user.hospital_id) {
      throw badRequest('Bu savol boshqa shifoxonaga tegishli.');
    }
    const note = String(req.body?.note ?? '').trim();
    if (!note) throw badRequest('Izoh matnini kiriting.');

    const noteId = await (await import('../db/index.js')).insert(
      'INSERT INTO question_notes (question_id, note, created_by) VALUES (?, ?, ?)',
      existing.id,
      note,
      req.user.id,
    );
    await audit(req, 'question.note', 'patient_question', existing.id, { note_id: noteId });
    res.status(201).json({ id: noteId, note, created_by: req.user.id });
  }),
);

export default router;