const STATIC_CACHE_NAME = 'incheck360-monitorcore-static-v7-all-pwa';
const PUSH_DIAGNOSTICS_CACHE_NAME = 'incheck360-monitorcore-push-diagnostics-v1';
const PUSH_DIAGNOSTICS_PREFIX = '/__incheck360_push_diagnostics__/';
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

function pushDiagnosticRequestUrl(key = '') {
  return new URL(`${PUSH_DIAGNOSTICS_PREFIX}${encodeURIComponent(String(key || '').trim())}`, self.location.origin).toString();
}

async function savePushDiagnostic(key, value) {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return;
  const cache = await caches.open(PUSH_DIAGNOSTICS_CACHE_NAME);
  const payload = {
    key: normalizedKey,
    value: value ?? null,
    savedAt: new Date().toISOString()
  };
  await cache.put(
    pushDiagnosticRequestUrl(normalizedKey),
    new Response(JSON.stringify(payload), {
      headers: { 'content-type': 'application/json' }
    })
  );
}

async function readPushDiagnostic(key) {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return null;
  const cache = await caches.open(PUSH_DIAGNOSTICS_CACHE_NAME);
  const response = await cache.match(pushDiagnosticRequestUrl(normalizedKey));
  if (!response) return null;
  try {
    const payload = await response.json();
    return payload?.value ?? null;
  } catch {
    return null;
  }
}

async function readAllPushDiagnostics() {
  return {
    lastPushReceivedAt: await readPushDiagnostic('lastPushReceivedAt'),
    lastPushPayload: await readPushDiagnostic('lastPushPayload'),
    lastShowNotificationAt: await readPushDiagnostic('lastShowNotificationAt'),
    lastShowNotificationError: await readPushDiagnostic('lastShowNotificationError')
  };
}

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

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith((async () => {
    try {
      const networkResponse = await fetch(request);
      if (request.method === 'GET' && networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
        const cache = await caches.open(STATIC_CACHE_NAME);
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') return caches.match('/offline.html');
      throw error;
    }
  })());
});

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {};

    try {
      payload = event.data ? event.data.json() : {};
    } catch {
      payload = {
        title: 'InCheck360 MonitorCore',
        body: event.data ? event.data.text() : 'You have a new notification.'
      };
    }

    const title = payload.title || 'InCheck360 MonitorCore';
    const url = payload.url || payload?.data?.url || '/';
    const tag = payload.tag || `incheck360-${Date.now()}`;

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

    await savePushDiagnostic('lastPushReceivedAt', new Date().toISOString());
    await savePushDiagnostic('lastPushPayload', payload);

    try {
      await self.registration.showNotification(title, options);
      await savePushDiagnostic('lastShowNotificationAt', new Date().toISOString());
      await savePushDiagnostic('lastShowNotificationError', null);
    } catch (error) {
      await savePushDiagnostic(
        'lastShowNotificationError',
        error && error.message ? error.message : String(error)
      );
    }

    pushDebugLog('push received', {
      hasEventData: Boolean(event.data),
      permission: self.Notification?.permission || 'unknown',
      title,
      tag,
      url
    });

    const allClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of allClients) {
      client.postMessage({
        type: 'INCHECK360_PUSH_RECEIVED',
        payload: {
          title,
          body: options.body,
          url,
          data: options.data
        }
      });
    }
  })());
});

self.addEventListener('message', event => {
  const data = event?.data || {};
  if (data?.type === 'INCHECK360_READ_PUSH_DIAGNOSTICS') {
    event.waitUntil((async () => {
      const diagnostics = await readAllPushDiagnostics();
      event.source?.postMessage({
        type: 'INCHECK360_PUSH_DIAGNOSTICS',
        payload: diagnostics
      });
    })());
    return;
  }

  if (data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
