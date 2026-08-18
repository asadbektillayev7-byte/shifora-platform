import { all, get, insert } from '../db/index.js';
import { addDays, toDateKey } from '../lib/time.js';
import { raiseAlert } from './alertEngine.js';
import { getActivePlan } from './carePlan.js';
import { audit } from '../lib/audit.js';

/**
 * Patient-facing assistant for glucose-trend questions, plus the safety queue
 * of unanswered questions.
 *
 * Safety boundaries, enforced here by construction:
 *   - The assistant NEVER diagnoses, never changes/advises a dose, never starts
 *     or stops a medication.
 *   - It only computes objective statistics and compares them against the
 *     per-patient, staff-APPROVED thresholds stored on the active care plan
 *     (`alert_rules`). Those thresholds are the hospital-approved guidance; the
 *     official bodies (WHO/ADA/IDF/NHS/MoH) are referenced as metadata, their
 *     numbers are never hard-coded here.
 *   - When approved, sufficient data is missing the assistant refuses with a
 *     fixed message and lands the question in `patient_questions` for staff.
 *   - Priority is never decided by the assistant: normal by default, and
 *     'urgent' is set only by explicit emergency rules (key words or an open
 *     urgent alert), never from AI judgement.
 */

export const ASSISTANT_REFUSAL =
  'Men bu savolingizga javob bera olmayman. Iltimos, hamshira yoki shifokor javobini kuting.';
export const QUEUED_NOTICE = 'Savolingiz tibbiyot xodimiga yuboriladi.';
export const DISCLAIMER =
  "Bu javob tavsiya emas, tashxis qo'ymaydi va dori dozasini o'zgartirmaydi. Yakuniy qaror tibbiyot xodimiga tegishli.";

// Explicit emergency rules. These are NOT medical judgement — they escalate
// through the alert channel because the words themselves describe an emergency.
const EMERGENCY_PATTERNS = [
  /shoshilinch|tez yordam|favqulodda|\b103\b|\b116\b|yordam bering/i,
  /hushimni yo'qot|hushim ket|hushidan ket/i,
  /bo'g'ilyapman|nafas ola olmay/i,
  /kuchli qon ket/i,
];

const GLUCOSE_WORDS =
  /(qand|glyukoza|glyukometr|ko'rsatkich|o'lchov|o'lchash|holat|daraja|miqdor)/i;
const TREND_WORDS =
  /(qanday bo'lyapti|qanday bo'lyapti|ko'taril|pasay|tushib|pastroq|yuqori|kamay|oshdi|oshib ket|yaxshilan|yomonlash|o'zgardi|olib boryapman)/i;
const MED_CHANGE_WORDS =
  /(doza|oshir|kamaytir|to'xtat|qo'sh|yana olishim|ikki osh|ikki marta|2 marta|nechi marta|qancha marta|qoldirib)/i;
const DIAGNOSIS_WORDS = /(diagnoz|tashxis|kasalman|kasalligim|nima bo'lgan|shakar\?)/i;

const SOURCE_TITLES = {
  who: 'World Health Organization (WHO)',
  ada: 'American Diabetes Association (ADA)',
  idf: 'International Diabetes Federation (IDF)',
  nhs: 'NHS England',
  uz_moh: "O'zbekiston Respublikasi Sog'liqni saqlash vazirligi",
  hospital_protocol: 'Shifora shifoxona protokoli',
};
const CATALOGUE_KEYS = ['who', 'ada', 'idf', 'nhs', 'uz_moh', 'hospital_protocol'];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Uzbek text mixes apostrophe styles (ʼ, ʻ, ‘, ’); normalise to `'`. */
export function normalizeText(value) {
  return String(value ?? '').replace(/[ʼʻ‘’`´\u2018\u2019\u02BB\u02BC]/g, "'");
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Approved-guidance helpers
// ---------------------------------------------------------------------------

/**
 * Approved thresholds for a patient: the glucose low/high alert rules on the
 * ACTIVE plan. These were configured and approved by staff; nothing here is a
 * hard-coded clinical number.
 */
async function approvedGlucoseRanges(carePlan) {
  if (!carePlan) return { low: null, high: null };
  const rows = await all(
    'SELECT code, value_1 FROM alert_rules WHERE care_plan_id = ? AND enabled = 1 AND code IN (?, ?)',
    carePlan.id,
    'glucose_low',
    'glucose_high',
  );
  return {
    low: rows.find((r) => r.code === 'glucose_low')?.value_1 ?? null,
    high: rows.find((r) => r.code === 'glucose_high')?.value_1 ?? null,
  };
}

/** Catalogue metadata for the sources that back a care plan's approved rules. */
async function catalogueEntries() {
  const rows = await all('SELECT source_key, title, scope FROM guidance_sources ORDER BY id');
  if (rows.length > 0) return rows;
  return CATALOGUE_KEYS.map((key) => ({
    source_key: key,
    title: SOURCE_TITLES[key] ?? key,
    scope: 'glyukoza_monitoring',
  }));
}

// ---------------------------------------------------------------------------
// Objective statistics (feature 1)
// ---------------------------------------------------------------------------

/**
 * Descriptive statistics over a patient's glucose readings for a window.
 * Deliberately objective: averages, extremes, counts and % in range. Clinical
 * interpretation is left to the approved ranges, never computed here.
 */
export async function glucoseTrend(patientId, { days = 7, context = 'all' } = {}) {
  const fromKey = toDateKey(addDays(new Date(), -Math.max(1, days)));
  const params = [patientId, `${fromKey} 00:00`];
  let sql =
    'SELECT value, unit, context, measured_at FROM glucose_readings WHERE patient_id = ? AND measured_at >= ?';
  if (context !== 'all') {
    sql += ' AND context = ?';
    params.push(context);
  }
  sql += ' ORDER BY measured_at ASC';
  const rows = await all(sql, ...params);
  if (rows.length === 0) return { count: 0, unit: 'mg/dL', readings: [] };

  const values = rows.map((r) => Number(r.value));
  const sum = values.reduce((a, b) => a + b, 0);
  const first = rows[0];
  const last = rows[rows.length - 1];

  return {
    count: values.length,
    unit: rows[0].unit ?? 'mg/dL',
    avg: round1(sum / values.length),
    min: Math.min(...values),
    max: Math.max(...values),
    change: round1(last.value - first.value),
    first_value: first.value,
    first_measured_at: first.measured_at,
    last_value: last.value,
    last_measured_at: last.measured_at,
    readings: rows.slice(-20).map((r) => ({ value: r.value, measured_at: r.measured_at, context: r.context })),
  };
}

// ---------------------------------------------------------------------------
// Question classification
// ---------------------------------------------------------------------------

function classify(text) {
  const t = normalizeText(text);
  return {
    emergency: EMERGENCY_PATTERNS.some((re) => re.test(t)),
    medicationChange: MED_CHANGE_WORDS.test(t),
    diagnosis: DIAGNOSIS_WORDS.test(t),
    glucose: GLUCOSE_WORDS.test(t) && TREND_WORDS.test(t),
  };
}

function pctOf(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : null;
}

/** % of readings inside the approved reference band. */
function inRangePct(stats, low, high) {
  if (stats.count === 0 || low == null || high == null) return null;
  const inside = stats.readings.filter((r) => r.value >= low && r.value <= high).length;
  return pctOf(inside, stats.count);
}

function glAnswer(glucose, ranges) {
  const parts = [];
  parts.push(
    `Oxirgi ${glucose.days} kun ichida glyukoza o'lchovlari: ${glucose.stats.count} ta. O'rtacha ${glucose.stats.avg} ${glucose.stats.unit}; eng past ${glucose.stats.min} ${glucose.stats.unit}; eng yuqori ${glucose.stats.max} ${glucose.stats.unit}.`,
  );
  if (glucose.stats.count >= 2) {
    const sign = glucose.stats.change >= 0 ? "ko'tarilgan" : 'pasaygan';
    parts.push(
      `Davr boshidagi ${glucose.stats.first_value} ${glucose.stats.unit}dan oxirgi ${glucose.stats.last_value} ${glucose.stats.unit}ga — bu yo'nalish ${sign}.`,
    );
  }
  const pct = inRangePct(glucose.stats, ranges.low, ranges.high);
  if (pct != null) {
    parts.push(`O'lchovlarning ${pct}% shifoxona tomonidan tasdiqlangan chegaralar ichida qolgan.`);
  }
  const last = glucose.stats.last_value;
  if (ranges.low != null && last < ranges.low) {
    parts.push(
      `Oxirgi o'lchov (${last} ${glucose.stats.unit}) belgilangan pastki chegaradan past. Bu holat reja bo'yicha hamshira uchun qayd etiladi.`,
    );
  } else if (ranges.high != null && last > ranges.high) {
    parts.push(
      `Oxirgi o'lchov (${last} ${glucose.stats.unit}) belgilangan yuqori chegaradan yuqori. Bu holat reja bo'yicha hamshira uchun qayd etiladi.`,
    );
  }
  parts.push(
    `Chegaralar shifoxona tomonidan tasdiqlangan rejangizdan olingan: pastki ${ranges.low ?? '—'}, yuqori ${ranges.high ?? '—'} ${glucose.stats.unit}. Ular WHO, ADA, IDF, NHS va milliy tavsiyalar asosida shifoxona protokoli orqali tasdiqlanadi.`,
  );
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Question handling + safety queue
// ---------------------------------------------------------------------------

async function openUrgentAlert(patientId) {
  const row = await get(
    `SELECT id FROM alerts WHERE patient_id = ? AND status != 'closed' AND severity = 'urgent'
      ORDER BY created_at DESC LIMIT 1`,
    patientId,
  );
  return row?.id ?? null;
}

/**
 * Persists a queued question plus its retrieval trail. Returns the new id.
 * `refs` — array of { source_key, source_title, retrieval_score, note }.
 */
export async function createQuestion({ patientId, question, language = 'uz', ai, refs = [], alertId = null, user }) {
  const id = await insert(
    `INSERT INTO patient_questions
       (patient_id, question, language, status, priority, ai_attempted, ai_answer,
        refused, refusal_reason, answer_source, alert_id, created_by)
     VALUES (?, ?, ?, 'unanswered', ?, 1, ?, ?, ?, NULL, ?, ?)`,
    patientId,
    question,
    language,
    ai.priority ?? 'normal',
    ai.answer ?? null,
    ai.refused ? 1 : 0,
    ai.refusal_reason ?? null,
    alertId,
    user?.id ?? null,
  );
  for (const ref of refs) {
    await insert(
      `INSERT INTO question_references (question_id, source_key, source_title, retrieval_score, note)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      ref.source_key,
      ref.source_title,
      ref.retrieval_score ?? null,
      ref.note ?? null,
    );
  }
  return id;
}

async function queueRefusal({ patientId, question, language, reason, refs, priority, user, alertId = null }) {
  const qid = await createQuestion({
    patientId,
    question,
    language,
    ai: { priority: priority ?? 'normal', answer: ASSISTANT_REFUSAL, refused: true, refusal_reason: reason },
    refs,
    alertId,
    user,
  });
  await audit({ user }, 'question.created', 'patient_question', qid, {
    reason,
    priority: priority ?? 'normal',
  });
  return qid;
}

const refusedReply = (qid, priority) => ({
  question_id: qid,
  answer: `${ASSISTANT_REFUSAL} ${QUEUED_NOTICE}`,
  can_answer: false,
  refused: true,
  queued: true,
  priority: priority ?? 'normal',
  status: 'unanswered',
  disclaimer: DISCLAIMER,
});

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * The assistant entry point. Returns exactly what the client should show.
 * Queued questions are persisted for staff; confidently-answered ones are not.
 */
export async function assistantAnswer({ patientId, question, language = 'uz', user, glucoseDays = 7 }) {
  const patient = await get('SELECT * FROM patients WHERE id = ?', patientId);
  if (!patient) throw Object.assign(new Error('Bemor topilmadi.'), { status: 404 });
  const carePlan = await getActivePlan(patientId);
  const top = classify(question);
  const catalogue = await catalogueEntries();
  const answerMeta = { question: String(question).slice(0, 300), classified: top };

  // ---- Emergency: escalate through the alert channel, never silently. ------
  if (top.emergency) {
    let alertId = await openUrgentAlert(patientId);
    if (!alertId) {
      alertId = await raiseAlert({
        patient,
        carePlanId: carePlan?.id ?? null,
        code: 'emergency_question',
        severity: 'urgent',
        title: 'Bemor shoshilinch savol berdi',
        detail: String(question).slice(0, 500),
        context: { question, emergency_rule: true },
        dedupKey: `emergency_question:${patientId}`,
      });
    }
    const qid = await queueRefusal({
      patientId,
      question,
      language,
      reason: 'emergency_rule',
      refs: catalogue.map((c) => ({
        source_key: c.source_key,
        source_title: c.title,
        retrieval_score: 0,
        note: 'Emergency rules bypass normal retrieval.',
      })),
      priority: 'urgent',
      user,
      alertId,
    });
    return {
      ...refusedReply(qid, 'urgent'),
      answer:
        `${ASSISTANT_REFUSAL} Shoshilinch holatda 103 (tez yordam) yoki yaqin tibbiy yordamga murojaat qiling. ${QUEUED_NOTICE}`,
      alert_id: alertId,
    };
  }

  // ---- Diagnosis questions always go to a clinician. -----------------------
  if (top.diagnosis) {
    const qid = await queueRefusal({
      patientId,
      question,
      language,
      reason: 'clinician_judgment',
      refs: [],
      user,
    });
    await audit({ user }, 'assistant.answer', 'patient', patientId, answerMeta);
    return refusedReply(qid);
  }

  // ---- Medication change: never advised. Repeat a stored doctor instruction
  //      only when the database holds one for the medication in question. ----
  if (top.medicationChange) {
    const planMeds = carePlan
      ? await all('SELECT name, notes FROM medications WHERE care_plan_id = ?', carePlan.id)
      : [];
    const mentioned = planMeds.find((m) => m.name && new RegExp(escapeRegExp(m.name), 'i').test(normalizeText(question)));
    if (mentioned?.notes?.trim()) {
      return {
        question_id: null,
        answer: `${mentioned.name} — shifokor tomonidan berilgan ko'rsatma: ${mentioned.notes.trim()}. ${DISCLAIMER}`,
        can_answer: true,
        refused: false,
        queued: false,
        priority: 'normal',
        status: null,
        sources: [
          {
            source_key: 'hospital_protocol',
            source_title: SOURCE_TITLES.hospital_protocol,
            retrieval_score: 1,
            note: 'dori bo‘yicha shifokor ko‘rsatmasi',
          },
        ],
        disclaimer: DISCLAIMER,
      };
    }
    const qid = await queueRefusal({
      patientId,
      question,
      language,
      reason: 'medication_change_or_instruction_missing',
      refs: [],
      user,
    });
    return refusedReply(qid);
  }

  // ---- Glucose trend (feature 1). ------------------------------------------
  if (top.glucose) {
    const ranges = await approvedGlucoseRanges(carePlan);
    const stats = await glucoseTrend(patientId, { days: glucoseDays });
    const both = ranges.low != null && ranges.high != null;
    const totalReadings = stats.count;

    if (!carePlan) {
      const qid = await queueRefusal({
        patientId,
        question,
        language,
        reason: 'no_active_plan',
        refs: catalogue.map((c) => ({
          source_key: c.source_key,
          source_title: c.title,
          retrieval_score: 0,
          note: 'tasdiqlangan reja topilmadi',
        })),
        user,
      });
      await audit({ user }, 'assistant.answer', 'patient', patientId, answerMeta);
      return { ...refusedReply(qid), stats };
    }
    if (totalReadings === 0) {
      const qid = await queueRefusal({
        patientId,
        question,
        language,
        reason: 'no_readings',
        refs: catalogue.map((c) => ({
          source_key: c.source_key,
          source_title: c.title,
          retrieval_score: 0,
          note: 'o‘lchovlari kiritilmagan',
        })),
        user,
      });
      await audit({ user }, 'assistant.answer', 'patient', patientId, answerMeta);
      return { ...refusedReply(qid), stats };
    }
    if (!both) {
      // Approved reference band is missing → we may describe statistics but
      // cannot interpret them. Per policy that counts as insufficient guidance.
      const qid = await queueRefusal({
        patientId,
        question,
        language,
        reason: 'no_approved_ranges',
        refs: catalogue.map((c) => ({
          source_key: c.source_key,
          source_title: c.title,
          retrieval_score: 0.5,
          note: 'tasdiqlangan chegaralar yo‘q',
        })),
        user,
      });
      await audit({ user }, 'assistant.answer', 'patient', patientId, answerMeta);
      return { ...refusedReply(qid), stats };
    }

    const sources = [
      { source_key: 'hospital_protocol', source_title: SOURCE_TITLES.hospital_protocol, retrieval_score: 1, note: `tasdiqlangan chegaralar` },
      { source_key: 'ada', source_title: SOURCE_TITLES.ada, retrieval_score: 0.8, note: 'reja chegaralari shu manbaga tayanadi' },
      { source_key: 'idf', source_title: SOURCE_TITLES.idf, retrieval_score: 0.8, note: 'reja chegaralari shu manbaga tayanadi' },
      { source_key: 'who', source_title: SOURCE_TITLES.who, retrieval_score: 0.8, note: 'reja chegaralari shu manbaga tayanadi' },
      { source_key: 'nhs', source_title: SOURCE_TITLES.nhs, retrieval_score: 0.8, note: 'reja chegaralari shu manbaga tayanadi' },
      { source_key: 'uz_moh', source_title: SOURCE_TITLES.uz_moh, retrieval_score: 0.8, note: 'milliy protokollar rejaga kiritilgan' },
    ];
    const answer = glAnswer({ days: glucoseDays, stats }, ranges);
    await audit({ user }, 'assistant.answer', 'patient', patientId, {
      ...answerMeta,
      answered: true,
      readings: stats.count,
    });
    return {
      question_id: null,
      answer,
      can_answer: true,
      refused: false,
      queued: false,
      priority: 'normal',
      status: null,
      stats: { ...stats, days: glucoseDays, in_range_pct: inRangePct(stats, ranges.low, ranges.high) },
      sources,
      disclaimer: DISCLAIMER,
      ranges: { low: ranges.low, high: ranges.high, unit: stats.unit },
    };
  }

  // ---- Unrecognised / insufficient → queue. --------------------------------
  const qid = await queueRefusal({
    patientId,
    question,
    language,
    reason: 'insufficient_info',
    refs: [],
    user,
  });
  return refusedReply(qid);
}