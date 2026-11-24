// Only a generic reconnect page is stored. Never cache admin pages, APIs or files.
const OFFLINE_CACHE = 'sendrack-admin-offline-v2';
const OFFLINE_URL = '/admin/offline.html';
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.add(new Request(OFFLINE_URL, {cache: 'reload'}));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('sendrack-admin-offline-') && key !== OFFLINE_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' ||
      url.origin !== self.location.origin || !url.pathname.startsWith('/admin/')) return;
  event.respondWith((async () => {
    try {
      // HTTP errors remain visible. A network failure gets a generic reconnect screen.
      return await fetch(event.request, {cache: 'no-store'});
    } catch {
      return await caches.match(OFFLINE_URL, {cacheName: OFFLINE_CACHE}) ||
        new Response('Connect to the internet, then reopen SendRack Admin.', {
          status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'}
        });
    }
  })());
});
