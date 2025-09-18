const CACHE_NAME = 'sveltesync-v2';
// Only precache assets we are sure exist under /static and the app shell
const APP_ASSETS = [
  '/',
  '/vendor/pouchdb.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_ASSETS);
    } catch (e) {
      // ignore failures; SW will still install and runtime caching will fill gaps
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET; ignore POST/PUT/DELETE and others
  if (request.method !== 'GET') {
    return;
  }

  // Skip Vite dev assets to avoid interfering with HMR when SW is enabled in dev
  // e.g. /@vite, /__vite, /vite, etc.
  const isViteDevAsset = url.pathname.startsWith('/@vite') || url.pathname.startsWith('/__vite') || url.pathname.startsWith('/vite');
  if (isViteDevAsset) {
    return;
  }

  // network-first for same-origin navigations and HTML
  if (request.mode === 'navigate' || (url.origin === self.location.origin && request.headers.get('accept')?.includes('text/html'))) {
    event.respondWith(
      fetch(request).then((r) => {
        const copy = r.clone();
        caches.open(CACHE_NAME).then((c) => c.put(request, copy));
        return r;
      }).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // If root '/' was cached earlier, try it; otherwise return a simple offline response
        const root = await caches.match('/');
        if (root) return root;
        return new Response('<h1>Offline</h1><p>This page is not cached yet.</p>', { status: 503, headers: { 'content-type': 'text/html' } });
      })
    );
    return;
  }

  // cache-first for same-origin static files
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((r) => {
        const copy = r.clone();
        caches.open(CACHE_NAME).then((c) => c.put(request, copy));
        return r;
      }).catch(() => cached))
    );
  }
});
