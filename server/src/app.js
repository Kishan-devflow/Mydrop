import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createSessionStore } from './session-store.js';

export function createApp({ env = process.env, store = createSessionStore({ ttlSeconds: Number(env.SESSION_TTL_SECONDS) || 900 }) } = {}) {
  const app = express();
  const origins = (env.CLIENT_URL || 'http://localhost:5173,http://localhost:5174').split(',').map(x => x.trim());
  app.disable('x-powered-by'); app.use(helmet());
  app.use(cors({ origin(origin, cb) { if (!origin || origins.includes(origin)) cb(null, true); else cb(new Error('Origin not allowed')); } }));
  app.use(express.json({ limit: '16kb' }));
  const lookupLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many code attempts. Wait a minute and try again.' } });
  const createLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'MYDROP' }));
  app.post('/api/transfers', createLimiter, (req, res) => {
    const files = req.body?.files;
    if (!Array.isArray(files) || files.length > 20 || files.some(f => !f || typeof f.name !== 'string' || f.name.length > 255 || /[\\/\0]/.test(f.name) || !Number.isSafeInteger(f.size) || f.size < 0 || f.size > Number(env.MAX_FILE_BYTES || 104857600))) return res.status(400).json({ error: 'Invalid file details. Share up to 20 files, each within the configured size limit.' });
    const text = req.body?.text, hasCode = req.body?.hasCode === true;
    if ((text !== undefined && typeof text !== 'string') || (typeof text === 'string' && text.length > 20_000) || (!files.length && !text?.trim() && !hasCode)) return res.status(400).json({ error: 'Add a file or a message before sharing.' });
    try { const session = store.create({ files: files.map(({ name, size, type }) => ({ name, size, type: typeof type === 'string' ? type.slice(0, 120) : '' })), hasText: Boolean(text?.trim()), hasCode });
      return res.status(201).json({ code: session.code, ownerToken: session.ownerToken, expiresAt: new Date(session.expiresAt).toISOString(), expiresIn: Number(env.SESSION_TTL_SECONDS) || 900 });
    } catch { return res.status(503).json({ error: 'Sharing is temporarily at capacity. Try again shortly.' }); }
  });
  app.get('/api/transfers/:code', lookupLimiter, (req, res) => {
    if (!/^\d{6}$/.test(req.params.code)) return res.status(400).json({ error: 'Enter a valid six-digit code.' });
    const session = store.get(req.params.code);
    if (!session || session.status !== 'waiting') return res.status(404).json({ error: 'This code is unavailable or has expired.' });
    res.json({ code: session.code, expiresAt: new Date(session.expiresAt).toISOString() });
  });
  app.delete('/api/transfers/:code', (req, res) => {
    if (!/^\d{6}$/.test(req.params.code)) return res.status(400).json({ error: 'Invalid code.' });
    const session = store.get(req.params.code);
    if (!session) return res.status(404).json({ error: 'This sharing session has expired.' });
    if (req.get('authorization') !== `Bearer ${session.ownerToken}`) return res.status(403).json({ error: 'Only the sender can cancel this session.' });
    store.delete(req.params.code); res.json({ status: 'cancelled' });
  });
  app.use((_err, _req, res, _next) => res.status(500).json({ error: 'The server could not complete that request.' }));
  app.locals.store = store;
  return app;
}
