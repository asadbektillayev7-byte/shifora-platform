import { Router } from 'express';
import { all, get, run } from '../db/index.js';
import { badRequest, notFound, wrap } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { patientForUser } from '../services/access.js';
import {
  startChat,
  getChatSession,
  sendChatMessage,
  endChat,
  suggestedQuestions,
} from '../services/chat.js';

const router = Router();

// All chat routes require a patient.
router.use(requireAuth);

async function requireSelfPatient(req, res, next) {
  if (req.user.role !== 'patient') throw badRequest('Bu funksiya faqat bemorlar uchun.');
  const patient = await patientForUser(req.user.id);
  if (!patient) throw badRequest('Hisobingiz bemor kartasiga bog\'lanmagan.');
  req.patient = patient;
  next();
}

// Pre-chat: suggested questions.
router.get('/questions', requireSelfPatient, wrap(async (req, res) => {
  res.json({ questions: await suggestedQuestions() });
}));

// Start a new chat session.
router.post('/session', requireSelfPatient, wrap(async (req, res) => {
  const { sessionId, suggestions } = await startChat(req.patient.id, req.user);
  res.status(201).json({ sessionId, suggestions });
}));

// Get a session's conversation.
router.get('/session/:id', requireSelfPatient, wrap(async (req, res) => {
  const session = await getChatSession(Number(req.params.id), req.patient.id);
  if (!session) throw notFound('Suhbu topilmadi.');
  res.json(session);
}));

// Send a message in a session.
router.post('/session/:id/message', requireSelfPatient, wrap(async (req, res) => {
  const text = String(req.body?.text ?? '').trim();
  if (!text) throw badRequest('Xabar matnini kiriting.');
  const { outcome } = await sendChatMessage(Number(req.params.id), text, req.user);
  res.json(outcome);
}));

// End a session.
router.post('/session/:id/end', requireSelfPatient, wrap(async (req, res) => {
  const result = await endChat(Number(req.params.id), req.patient.id);
  if (!result) throw notFound('Suhbu topilmadi.');
  res.json({ ok: true });
}));

export default router;