import { Router } from 'express';
import { all } from '../db/index.js';
import { badRequest, notFound, wrap } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { patientForUser } from '../services/access.js';
import { assistantAnswer } from '../services/assistant.js';

const router = Router();

// Patient-facing assistant. Hospital staff never call this endpoint.
router.use(requireAuth);

async function requireSelfPatient(req) {
  if (req.user.role !== 'patient') throw badRequest('Bu funksiya faqat bemorlar uchun.');
  const patient = await patientForUser(req.user.id);
  if (!patient) throw badRequest('Hisobingiz bemor kartasiga bog‘lanmagan.');
  return patient;
}

/**
 * Ask the assistant a question. The answer is either objective statistics
 * backed by approved thresholds, or a refusal that is queued for staff.
 */
router.post(
  '/ask',
  wrap(async (req, res) => {
    const patient = await requireSelfPatient(req);
    const question = String(req.body?.question ?? '').trim();
    if (!question) throw badRequest('Savolingizni kiriting.');
    if (question.length > 2000) throw badRequest('Savol juda uzun.');

    const outcome = await assistantAnswer({
      patientId: patient.id,
      question,
      language: ['uz', 'ru'].includes(req.body?.language) ? req.body.language : patient.language ?? 'uz',
      user: req.user,
      glucoseDays: Math.min(Number(req.body?.days) || 7, 30),
      staffOnly: req.body?.staff_only === true,
    });
    res.status(200).json(outcome);
  }),
);

/** The patient's own question history, newest first. */
router.get(
  '/questions',
  wrap(async (req, res) => {
    const patient = await requireSelfPatient(req);
    const rows = await all(
      `SELECT q.*, u.full_name AS answered_by_name
         FROM patient_questions q
         LEFT JOIN users u ON u.id = q.answered_by
        WHERE q.patient_id = ? ORDER BY q.created_at DESC LIMIT 50`,
      patient.id,
    );
    res.json({
      questions: rows.map((r) => ({
        ...r,
        references: [],
      })),
    });
  }),
);

router.get(
  '/questions/:id',
  wrap(async (req, res) => {
    const patient = await requireSelfPatient(req);
    const [row] = await all(
      `SELECT q.*, u.full_name AS answered_by_name
         FROM patient_questions q
         LEFT JOIN users u ON u.id = q.answered_by
        WHERE q.id = ? AND q.patient_id = ?`,
      Number(req.params.id),
      patient.id,
    );
    if (!row) throw notFound('Savol topilmadi.');
    row.references = await all(
      'SELECT * FROM question_references WHERE question_id = ? ORDER BY id',
      row.id,
    );
    res.json(row);
  }),
);

export default router;
