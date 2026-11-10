import { randomInt, randomUUID } from 'node:crypto';

export function createSessionStore({ ttlSeconds = 900, now = () => Date.now() } = {}) {
  const sessions = new Map();
  const purge = () => { for (const [code, session] of sessions) if (session.expiresAt <= now()) sessions.delete(code); };
  function create(metadata = {}) {
    purge();
    if (sessions.size >= 1000) throw new Error('SESSION_CAPACITY');
    let code;
    for (let i = 0; i < 100; i++) { const candidate = String(randomInt(0, 1_000_000)).padStart(6, '0'); if (!sessions.has(candidate)) { code = candidate; break; } }
    if (!code) throw new Error('SESSION_CAPACITY');
    const session = { id: randomUUID(), code, ownerToken: randomUUID(), createdAt: now(), expiresAt: now() + ttlSeconds * 1000, status: 'waiting', metadata };
    sessions.set(code, session); return session;
  }
  return { create, get(code) { purge(); return sessions.get(code); }, delete(code) { return sessions.delete(code); }, purge, size() { purge(); return sessions.size; } };
}
