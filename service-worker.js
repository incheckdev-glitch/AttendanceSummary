const STATIC_CACHE_NAME = 'incheck360-monitorcore-static-v5';
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

const DEBUG_PUSH =
  self.location.hostname === 'localhost' ||
  self.location.hostname === '127.0.0.1' ||
  self.location.search.includes('debugPush=1');

function pushDebugLog(...args) {
  if (!DEBUG_PUSH) return;
  console.log('[sw:push]', ...args);
}

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
    lowerPath.includes('/workflow') ||
    lowerPath.includes('/leads') ||
    lowerPath.includes('/deals') ||
    lowerPath.includes('/proposals') ||
    lowerPath.includes('/agreements')
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

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (jsonError) {
    try {
      payload = {
        title: 'InCheck360 MonitorCore',
        body: event.data ? event.data.text() : 'You have a new notification.'
      };
    } catch {
      payload = {
        title: 'InCheck360 MonitorCore',
        body: 'You have a new notification.'
      };
    }
  }

  const title = payload.title || 'InCheck360 MonitorCore';
  const url = payload.url || payload?.data?.url || '/';
  const tag = payload.tag || payload?.data?.tag || `incheck360-${Date.now()}`;

  const options = {
    body: payload.body || 'You have a new notification.',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    tag,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200],
    timestamp: Date.now(),
    data: {
      ...(payload.data || {}),
      url
    }
  };

  event.waitUntil((async () => {
    const pushReceivedAt = new Date().toISOString();
    pushDebugLog('push received', {
      hasEventData: Boolean(event.data),
      permission: self.Notification?.permission || 'unknown',
      title,
      tag,
      url,
      pushReceivedAt
    });

    await self.registration.showNotification(title, options);
    const notificationShownAt = new Date().toISOString();
    pushDebugLog('showNotification called', { title, tag, notificationShownAt });

    const allClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of allClients) {
      client.postMessage({
        type: 'INCHECK360_PUSH_RECEIVED',
        payload: {
          timestamp: pushReceivedAt,
          title,
          body: options.body,
          url,
          data: options.data
        }
      });
      client.postMessage({
        type: 'INCHECK360_NOTIFICATION_SHOWN',
        payload: {
          timestamp: notificationShownAt,
          title,
          body: options.body,
          url,
          data: options.data
        }
      });
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || '/';

  event.waitUntil((async () => {
    const absoluteUrl = new URL(targetUrl, self.location.origin).href;

    const allClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of allClients) {
      try {
        await client.focus();
        if ('navigate' in client) {
          await client.navigate(absoluteUrl);
        }
        return;
      } catch {
        // continue to fallback
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(absoluteUrl);
    }
  })());
});
