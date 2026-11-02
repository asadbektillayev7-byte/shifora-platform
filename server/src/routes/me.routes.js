import { Router } from 'express';
import { all, get, run } from '../db/index.js';
import { forbidden, wrap } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { patientForUser } from '../services/access.js';
import { getActivePlan, getPlanDetail } from '../services/carePlan.js';
import { getDailyPlan } from '../services/dailyPlan.js';
import { adherenceRate } from '../services/reporting.js';
import { toDateKey } from '../lib/time.js';
import { parseMedicationHistoryRange } from '../lib/medicationHistoryRange.js';

const router = Router();

router.use(requireAuth);

async function selfPatient(req) {
  const patient = await patientForUser(req.user.id);
  if (!patient) throw forbidden('Hisobingiz bemor kartasiga bog‘lanmagan.');
  return patient;
}

/** The patient home screen: today's plan, in order. */
router.get(
  '/today',
  wrap(async (req, res) => {
    const patient = await selfPatient(req);
    const dateKey = req.query.date ?? toDateKey();
    res.json({
      patient: { id: patient.id, first_name: patient.first_name, last_name: patient.last_name },
      plan: await getDailyPlan(patient.id, dateKey),
      adherence_7d: await adherenceRate(patient.id, 7),
      has_active_plan: Boolean(await getActivePlan(patient.id)),
    });
  }),
);

router.get(
  '/medications',
  wrap(async (req, res) => {
    const patient = await selfPatient(req);
    const range = parseMedicationHistoryRange(req.query);
    const plan = await getActivePlan(patient.id);
    const detail = plan ? await getPlanDetail(plan.id) : null;
    const params = [patient.id];
    let sql = `SELECT d.id, d.medication_id, d.care_plan_id, d.scheduled_at,
                      d.status, d.taken_at, m.name, m.dose, m.unit
                 FROM medication_doses d JOIN medications m ON m.id = d.medication_id
                WHERE d.patient_id = ?`;
    if (range) {
      // scheduled_at is application-local TEXT. This includes every timestamp
      // on the last day without date arithmetic or creating future task rows.
      sql += ' AND d.scheduled_at >= ? AND d.scheduled_at < ?';
      params.push(`${range.from} 00:00`, `${range.to} 24:00`);
    }
    const limit = range ? 5000 : 40;
    sql += ' ORDER BY d.scheduled_at DESC, d.id DESC LIMIT ?';
    params.push(limit + 1);
    const history = await all(sql, ...params);
    const coverage = await get(
      `SELECT MIN(scheduled_at) AS first_at, MAX(scheduled_at) AS last_at
         FROM medication_doses WHERE patient_id = ?`,
      patient.id,
    );
    res.json({
      plan: plan ? { id: plan.id, version: plan.version, approved_at: plan.approved_at,
        start_date: plan.start_date, end_date: plan.end_date } : null,
      medications: detail?.medications ?? [],
      history: history.slice(0, limit),
      range: range ? { from: range.from, to: range.to } : null,
      coverage: { from: coverage?.first_at?.slice(0, 10) ?? null, to: coverage?.last_at?.slice(0, 10) ?? null },
      truncated: history.length > limit,
    });
  }),
);

router.get(
  '/profile',
  wrap(async (req, res) => {
    const patient = await selfPatient(req);
    const plan = await getActivePlan(patient.id);
    res.json({
      patient,
      profile: await get('SELECT * FROM diabetes_profiles WHERE patient_id = ?', patient.id),
      hospital: await get('SELECT id, name, phone, region FROM hospitals WHERE id = ?', patient.hospital_id),
      care_plan: plan ? { id: plan.id, version: plan.version, approved_at: plan.approved_at } : null,
      caregivers: await all(
        `SELECT c.relation, u.full_name, u.phone FROM caregivers c
           JOIN users u ON u.id = c.user_id
          WHERE c.patient_id = ? AND c.status = 'active'`,
        patient.id,
      ),
    });
  }),
);

// ---------------------------------------------------------------------------
// Notifications (shared by every role)
// ---------------------------------------------------------------------------

router.get(
  '/notifications',
  wrap(async (req, res) => {
    const items = await all(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      req.user.id,
    );
    res.json({
      notifications: items,
      unread: items.filter((n) => !n.read_at).length,
    });
  }),
);

router.post(
  '/notifications/:id/read',
  wrap(async (req, res) => {
    await run(
      `UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?`,
      Number(req.params.id), req.user.id,
    );
    res.json({ ok: true });
  }),
);

router.post(
  '/notifications/read-all',
  wrap(async (req, res) => {
    await run(
      `UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`,
      req.user.id,
    );
    res.json({ ok: true });
  }),
);

export default router;
