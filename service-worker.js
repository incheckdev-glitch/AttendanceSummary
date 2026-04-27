const STATIC_CACHE_NAME = 'incheck360-monitorcore-static-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-icon-512.png',
  '/icons/apple-touch-icon.png',
  '/favicon.ico'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== STATIC_CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isBlockedRequest(requestUrl, requestMethod) {
  if (requestMethod !== 'GET') return true;

  const pathname = requestUrl.pathname || '';
  const host = requestUrl.hostname || '';
  const lowerPath = pathname.toLowerCase();

  if (host.includes('supabase.co')) return true;
  if (lowerPath.includes('/api/')) return true;
  if (lowerPath.includes('/proxy')) return true;
  if (lowerPath.includes('auth/session')) return true;
  if (
    lowerPath.includes('/tickets') ||
    lowerPath.includes('/clients') ||
    lowerPath.includes('/invoices') ||
    lowerPath.includes('/receipts') ||
    lowerPath.includes('/workflow')
  ) {
    return true;
  }

  return false;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  const requestUrl = new URL(request.url);

  if (isBlockedRequest(requestUrl, request.method)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request)
        .then(networkResponse => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(STATIC_CACHE_NAME).then(cache => {
            cache.put(request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => caches.match('/offline.html'));
    })
  );
});
