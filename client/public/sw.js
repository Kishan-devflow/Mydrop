const CACHE_NAME = 'mydrop-offline-v1';
const OFFLINE_ASSETS = ['/offline.html', '/favicon.svg', '/mydrop-logo.svg', '/home-flow.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('mydrop-offline-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  event.respondWith(fetch(request).catch(async () => (await caches.match('/offline.html')) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })));
});
