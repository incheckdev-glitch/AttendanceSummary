const STATIC_CACHE_NAME = 'incheck360-monitorcore-static-v18-module-hotfix-inject';
const PUSH_DIAGNOSTICS_CACHE_NAME = 'incheck360-monitorcore-push-diagnostics-v1';
const PUSH_DIAGNOSTICS_PREFIX = '/__incheck360_push_diagnostics__/';
const MODULE_HOTFIX_SCRIPT = '<script src="/module-hotfix.js?v=20260703-module-blank-screen-fix1"></script>';
const STATIC_ASSETS = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-icon-512.png',
  '/icons/apple-touch-icon.png',
  '/favicon.ico',
  '/assets/incheck360-ui-logo.png'
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
            .filter(key => key !== STATIC_CACHE_NAME && key !== PUSH_DIAGNOSTICS_CACHE_NAME)
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

function shouldInjectHotfix(requestUrl, request) {
  if (request.method !== 'GET') return false;
  if (requestUrl.origin !== self.location.origin) return false;
  const pathname = (requestUrl.pathname || '').toLowerCase();
  const accept = String(request.headers.get('accept') || '').toLowerCase();
  return request.mode === 'navigate' || pathname === '/' || pathname.endsWith('/index.html') || accept.includes('text/html');
}

async function fetchHtmlWithModuleHotfix(request) {
  try {
    const networkResponse = await fetch(request, { cache: 'no-store' });
    const contentType = String(networkResponse.headers.get('content-type') || '');
    if (!networkResponse.ok || !contentType.includes('text/html')) return networkResponse;

    let html = await networkResponse.text();
    if (!html.includes('/module-hotfix.js')) {
      html = html.includes('</body>')
        ? html.replace('</body>', `${MODULE_HOTFIX_SCRIPT}\n</body>`)
        : `${html}\n${MODULE_HOTFIX_SCRIPT}`;
    }

    const headers = new Headers(networkResponse.headers);
    headers.set('cache-control', 'no-store, no-cache, must-revalidate');
    headers.set('x-incheck360-module-hotfix', 'injected');
    return new Response(html, {
      status: networkResponse.status,
      statusText: networkResponse.statusText,
      headers
    });
  } catch (error) {
    const cached = await caches.match('/offline.html');
    if (cached) return cached;
    throw error;
  }
}

function isBlockedRequest(requestUrl, requestMethod) {
  if (requestMethod !== 'GET') return true;

  const pathname = requestUrl.pathname || '';
  const host = requestUrl.hostname || '';
  const lowerPath = pathname.toLowerCase();

  if (host.includes('supabase.co')) return true;

  // Critical ERP shell/module files must never be served stale from the PWA cache.
  if (requestUrl.origin === self.location.origin) {
    if (
      lowerPath === '/' ||
      lowerPath.endsWith('/index.html') ||
      lowerPath.endsWith('.html') ||
      lowerPath.endsWith('.js') ||
      lowerPath.endsWith('.css')
    ) {
      return true;
    }
  }

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

  if (shouldInjectHotfix(requestUrl, request)) {
    event.respondWith(fetchHtmlWithModuleHotfix(request));
    return;
  }

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
    const defaultPayload = {
      title: 'InCheck360 MonitorCore',
      body: 'You have a new notification.',
      url: '/'
    };

    let payload = {};
    let textPayload = '';

    try {
      payload = event.data ? event.data.json() : {};
    } catch {
      try {
        textPayload = event.data ? event.data.text() : '';
        payload = textPayload ? JSON.parse(textPayload) : {};
      } catch {
        payload = {
          ...defaultPayload,
          body: textPayload || defaultPayload.body
        };
      }
    }

    const notificationPayload = payload?.notification || {};
    const dataPayload = payload?.data || {};

    const title =
      payload?.title ||
      notificationPayload?.title ||
      dataPayload?.title ||
      defaultPayload.title;
    const body =
      payload?.body ||
      notificationPayload?.body ||
      dataPayload?.body ||
      defaultPayload.body;

    const conversationId =
      payload?.conversation_id ||
      payload?.conversationId ||
      dataPayload?.conversation_id ||
      dataPayload?.conversationId ||
      payload?.record_id ||
      dataPayload?.record_id ||
      null;

    let url = payload?.deep_link || dataPayload?.deep_link || payload?.url || dataPayload?.url || defaultPayload.url;
    if (!url && conversationId) {
      url = `#communication-centre?conversation_id=${encodeURIComponent(String(conversationId))}`;
    } else if (
      conversationId &&
      (String(url).includes('communication_centre') ||
        String(url).includes('communication-centre') ||
        String(payload?.resource || '').toLowerCase() === 'communication_centre' ||
        String(dataPayload?.resource || '').toLowerCase() === 'communication_centre')
    ) {
      url = `#communication-centre?conversation_id=${encodeURIComponent(String(conversationId))}`;
    }

    const derivedTag = [payload?.resource, payload?.action, payload?.record_id, conversationId]
      .filter(Boolean)
      .map(value => String(value).trim())
      .filter(Boolean)
      .join('-');
    const tag = payload?.tag || derivedTag || `incheck360-${Date.now()}`;

    const options = {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag,
      data: {
        url,
        payload,
        receivedAt: new Date().toISOString()
      }
    };

    try {
      await savePushDiagnostic('lastPushReceivedAt', new Date().toISOString());
      await savePushDiagnostic('lastPushPayload', payload);
      await self.registration.showNotification(title, options);
      await savePushDiagnostic('lastShowNotificationAt', new Date().toISOString());
      await savePushDiagnostic('lastShowNotificationError', null);
      pushDebugLog('notification shown', { title, url, tag });
    } catch (error) {
      await savePushDiagnostic('lastShowNotificationError', error?.message || String(error));
      pushDebugLog('showNotification failed', error);
      throw error;
    }
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const rawUrl = event.notification?.data?.url || '/';
  const targetUrl = new URL(rawUrl, self.location.origin).toString();

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin && 'focus' in client) {
          if ('navigate' in client) await client.navigate(targetUrl);
          await client.focus();
          return;
        }
      } catch {}
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});

self.addEventListener('message', event => {
  const type = event.data && event.data.type;
  if (type === 'GET_PUSH_DIAGNOSTICS') {
    event.waitUntil((async () => {
      const diagnostics = await readAllPushDiagnostics();
      event.source?.postMessage?.({
        type: 'PUSH_DIAGNOSTICS',
        diagnostics
      });
    })());
  }
});
