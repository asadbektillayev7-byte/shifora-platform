import { all, get, insert, run, transaction, closePool } from '../db/index.js';
import { assistantAnswer, normalizeText } from './assistant.js';
import { audit } from '../lib/audit.js';

// ---------------------------------------------------------------------------
// Suggested questions shown to the patient before the first message.
// Ordered by how frequently patients have asked each question (popularity).
// ---------------------------------------------------------------------------
export async function suggestedQuestions() {
  const rows = await all(
    'SELECT id, question, category, frequency FROM suggested_questions ORDER BY frequency DESC, id LIMIT 8'
  );
  return rows.map((r) => ({
    id: r.id,
    question: r.question,
    category: r.category,
    frequency: r.frequency,
  }));
}

/** Start a new Hamshira AI chat for this patient. */
export async function startChat(patientId, user) {
  const sessionId = await insert(
    'INSERT INTO chat_sessions (patient_id) VALUES (?)',
    patientId,
  );
  const suggestions = await suggestedQuestions();
  await audit(user, 'chat.start', 'chat_session', sessionId, { patient_id: patientId });
  return { sessionId, suggestions };
}

/** Fetch a session and its messages (newest first, reversed to chronological). */
export async function getChatSession(sessionId, patientId) {
  const [session] = await all(
    'SELECT * FROM chat_sessions WHERE id = ? AND patient_id = ?',
    sessionId,
    patientId,
  );
  if (!session) return null;
  const rows = await all(
    'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at',
    sessionId,
  );
  return {
    session: {
      id: session.id,
      patient_id: session.patient_id,
      created_at: session.created_at,
    },
    messages: rows.map((r) => ({
      id: r.id,
      role: r.role,
      text: r.text,
      questionId: r.question_id,
      createdAt: r.created_at,
    })),
  };
}

/** Record that a suggested question was asked (bump its frequency). */
async function bumpFrequency(text) {
  const norm = normalizeText(text);
  const [row] = await all(
    'SELECT id FROM suggested_questions WHERE question = ?',
    norm,
  );
  if (row) {
    await run(
      'UPDATE suggested_questions SET frequency = frequency + 1 WHERE id = ?',
      row.id,
    );
  }
}

/**
 * Send a message in a chat session. Stores the patient message, runs the
 * assistant intelligence (which already creates a patient_questions row for
 * refusals), then stores the assistant reply linked to that question row.
 */
export async function sendChatMessage(sessionId, text, user) {
  const session = await get(
    'SELECT * FROM chat_sessions WHERE id = ?',
    sessionId,
  );
  if (!session) throw Object.assign(new Error('Chat session not found.'), { status: 404 });

  // Patient message
  await insert(
    'INSERT INTO chat_messages (session_id, role, text) VALUES (?, ?, ?)',
    sessionId,
    'patient',
    text,
  );
  await bumpFrequency(text);
  await audit(user, 'chat.message', 'chat_session', sessionId, { text });

  // Assistant intelligence + persistence (refusals -> patient_questions row).
  const outcome = await assistantAnswer({
    patientId: session.patient_id,
    question: text,
    language: 'uz',
    user,
    glucoseDays: 7,
  });

  // Store the assistant reply; link to the patient_questions row when it exists.
  await insert(
    'INSERT INTO chat_messages (session_id, role, text, question_id) VALUES (?, ?, ?, ?)',
    sessionId,
    'assistant',
    outcome.answer,
    outcome.question_id ?? null,
  );

  return { outcome };
}

export async function endChat(sessionId, patientId) {
  const [row] = await all(
    'SELECT id FROM chat_sessions WHERE id = ? AND patient_id = ?',
    sessionId,
    patientId,
  );
  if (!row) return null;
  await run('UPDATE chat_sessions SET updated_at = datetime(\'now\') WHERE id = ?', sessionId);
  return row;
}