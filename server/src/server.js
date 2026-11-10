import 'dotenv/config';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';

const env = process.env;
const port = Number(env.PORT) || 4000;
const app = createApp({ env }); const httpServer = createServer(app);
if (env.NODE_ENV === 'production' && (!env.CLIENT_URL || env.CLIENT_URL.split(',').some(origin => !origin.trim().startsWith('https://')))) throw new Error('Production requires CLIENT_URL to contain HTTPS origins.');
const origins = (env.CLIENT_URL || 'http://localhost:5173,http://localhost:5174').split(',').map(x => x.trim());
const io = new Server(httpServer, { cors: { origin: origins }, maxHttpBufferSize: 1e6 });
const peers = new Map();
const receiverAttempts = new Map();
const expirySweep = setInterval(() => app.locals.store.purge(), 60_000);
expirySweep.unref();
const iceServers = [{ urls: env.STUN_URL || 'stun:stun.l.google.com:19302' }];
if (env.TURN_URL && env.TURN_USERNAME && env.TURN_CREDENTIAL) iceServers.push({ urls: env.TURN_URL, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });

io.on('connection', socket => {
  socket.on('sender:join', ({ code, ownerToken } = {}, ack = () => {}) => {
    const session = app.locals.store.get(code);
    if (!session || session.ownerToken !== ownerToken || session.status === 'cancelled') return ack({ error: 'This sender session is no longer available.' });
    socket.data.role = 'sender'; socket.data.code = code; socket.join(code); peers.set(code, { sender: socket.id, receiver: peers.get(code)?.receiver });
    ack({ ok: true, iceServers }); const peer = peers.get(code); if (peer?.receiver) io.to(peer.receiver).emit('peer:ready');
  });
  socket.on('receiver:join', ({ code } = {}, ack = () => {}) => {
    const ip = socket.handshake.address || 'unknown'; const now = Date.now();
    if (receiverAttempts.size > 10_000) for (const [address, attempt] of receiverAttempts) if (now - attempt.started >= 60_000) receiverAttempts.delete(address);
    const bucket = receiverAttempts.get(ip) || { started: now, count: 0 };
    if (now - bucket.started >= 60_000) { bucket.started = now; bucket.count = 0; }
    bucket.count++; receiverAttempts.set(ip, bucket);
    if (bucket.count > 20) return ack({ error: 'Too many connection attempts. Wait a minute and try again.' });
    if (socket.data.role) return ack({ error: 'This connection has already joined a sharing session.' });
    const session = app.locals.store.get(code); const peer = peers.get(code);
    if (!session || session.status !== 'waiting') return ack({ error: 'This code is unavailable or has expired.' });
    if (peer?.receiver) return ack({ error: 'Someone is already connected to this sharing code.' });
    socket.data.role = 'receiver'; socket.data.code = code; socket.join(code); peers.set(code, { ...peer, receiver: socket.id }); ack({ ok: true, iceServers });
    if (peer?.sender) io.to(peer.sender).emit('peer:ready');
  });
  for (const event of ['signal:offer', 'signal:answer', 'signal:ice', 'transfer:accepted', 'transfer:declined', 'transfer:complete', 'transfer:cancel']) socket.on(event, payload => {
    const { code } = socket.data; if (!code || payload?.code !== code) return;
    const peer = peers.get(code); const target = socket.data.role === 'sender' ? peer?.receiver : peer?.sender;
    if (target) io.to(target).emit(event, { ...payload, code });
    if (event === 'transfer:complete' || event === 'transfer:cancel' || event === 'transfer:declined') { app.locals.store.delete(code); peers.delete(code); io.in(code).emit('session:ended', { reason: event }); }
  });
  socket.on('disconnect', () => { const code = socket.data.code; if (!code) return; const peer = peers.get(code); if (!peer) return; const other = socket.data.role === 'sender' ? peer.receiver : peer.sender; if (other) io.to(other).emit('peer:disconnected'); if (socket.data.role === 'sender') app.locals.store.delete(code); peers.delete(code); });
});

httpServer.listen(port, () => console.log(`MYDROP server listening on port ${port}`));
