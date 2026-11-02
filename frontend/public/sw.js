// DispatchGrid Field Ops Service Worker (v2)
// Offline-first PWA caching & operational sync resilience

const CACHE_VERSION = 'dispatchgrid-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/vite.svg',
];

// Endpoints that should NEVER be cached (SSE streams, ticket handshakes, auth)
const NO_CACHE_ROUTES = [
  '/api/dispatch/stream',
  '/api/dispatch/stream/auth',
  '/api/auth',
];

// Install: Pre-cache core shell & offline fallback
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(CORE_ASSETS).catch((err) => {
        console.warn('[SW] Core assets pre-cache warning:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: Purge older version caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== DATA_CACHE) {
            console.log('[SW] Purging outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event listener
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Never cache non-GET requests or streaming/auth endpoints
  if (
    request.method !== 'GET' ||
    NO_CACHE_ROUTES.some((route) => url.pathname.startsWith(route))
  ) {
    return;
  }

  // 2. Operational API Requests (Network First with Cache Fallback)
  if (url.pathname.startsWith('/api/')) {
    // Only cache GET operational schedule and jobs queries for offline viewing
    const isCacheableApi =
      url.pathname.startsWith('/api/scheduling/current') ||
      url.pathname.startsWith('/api/jobs') ||
      url.pathname.startsWith('/api/technicians');

    if (!isCacheableApi) {
      return;
    }

    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(DATA_CACHE).then((cache) => {
              cache.put(request, clone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          return new Response(
            JSON.stringify({
              success: false,
              message: 'Device is offline. Serving localized IndexedDB cache.',
              offline: true,
              data: [],
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            }
          );
        })
    );
    return;
  }

  // 3. Navigation requests (HTML pages): Stale While Revalidate with Offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => {
          return caches.match('/offline.html');
        })
    );
    return;
  }

  // 4. Static assets (JS, CSS, images, fonts): Cache First with Network Fallback
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (url.pathname.endsWith('.js') ||
            url.pathname.endsWith('.css') ||
            url.pathname.endsWith('.svg') ||
            url.pathname.endsWith('.png') ||
            url.pathname.endsWith('.woff2'))
        ) {
          const clone = networkResponse.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, clone);
          });
        }
        return networkResponse;
      });
    })
  );
});
