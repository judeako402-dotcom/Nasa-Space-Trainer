const CACHE_VERSION = 'spudnaut-cache-v4';
const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/offline.html',
  '/assets/pwa/icon-192.png',
  '/assets/pwa/icon-512.png',
  '/assets/pwa/icon-maskable-512.png',
  '/assets/pwa/apple-touch-icon.png',
  '/assets/loading/loading-poster.png',
];
const MAX_RUNTIME_CACHE_BYTES = 2 * 1024 * 1024;
const STATIC_ASSET_PATTERN = /\.(?:css|js|mjs|json|tmj|svg|png|jpe?g|webp|avif|woff2?|ttf|otf)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(PRECACHE_URLS);
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith('spudnaut-cache-') && name !== CACHE_VERSION)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/@vite') || url.pathname.startsWith('/__vite')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        const response = await fetch(request);
        if (response.ok && response.status === 200) {
          await cache.put('/', response.clone());
        }
        return response;
      } catch {
        return (await cache.match(request))
          ?? (await cache.match('/'))
          ?? (await cache.match('/offline.html'))
          ?? Response.error();
      }
    })());
    return;
  }

  if (!STATIC_ASSET_PATTERN.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      const contentLength = response.headers.get('content-length');
      const withinCacheLimit = !contentLength || Number(contentLength) <= MAX_RUNTIME_CACHE_BYTES;
      if (response.ok && response.type === 'basic' && withinCacheLimit) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
