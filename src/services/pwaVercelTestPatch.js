(function installInCheck360PwaVercelTestPatch(global) {
  let pushConfigPromise = null;
  let cachedVapidPublicKey = '';

  function setRuntimeVapidPublicKey(publicKey = '') {
    const key = String(publicKey || '').trim();
    if (!key) return '';

    cachedVapidPublicKey = key;
    global.RUNTIME_CONFIG = global.RUNTIME_CONFIG || {};
    global.INCHECK360_CONFIG = global.INCHECK360_CONFIG || {};
    global.APP_CONFIG = global.APP_CONFIG || {};
    global.__INCHECK360_VITE_ENV__ = global.__INCHECK360_VITE_ENV__ || {};

    global.RUNTIME_CONFIG.VAPID_PUBLIC_KEY = key;
    global.RUNTIME_CONFIG.PUSH_VAPID_PUBLIC_KEY = key;
    global.INCHECK360_CONFIG.VAPID_PUBLIC_KEY = key;
    global.APP_CONFIG.PUSH_VAPID_PUBLIC_KEY = key;
    global.__INCHECK360_VITE_ENV__.VITE_VAPID_PUBLIC_KEY = key;
    global.VAPID_PUBLIC_KEY = key;

    try {
      global.localStorage?.setItem('INCHECK360_PUSH_VAPID_PUBLIC_KEY_LAST_USED', key);
    } catch (_) {}

    return key;
  }

  async function loadBackendPushConfig({ force = false } = {}) {
    if (cachedVapidPublicKey && !force) return cachedVapidPublicKey;
    if (!pushConfigPromise || force) {
      pushConfigPromise = fetch('/api/notifications/push-config', { method: 'GET', cache: 'no-store' })
        .then(async response => {
          const result = await response.json().catch(() => ({}));
          if (!response.ok || result?.ok === false) {
            throw new Error(String(result?.error || `Push config failed with HTTP ${response.status}`));
          }
          const key = String(result?.vapidPublicKey || result?.publicKey || '').trim();
          if (!key) throw new Error('Push config did not return VAPID public key.');
          return setRuntimeVapidPublicKey(key);
        })
        .catch(error => {
          pushConfigPromise = null;
          throw error;
        });
    }
    return pushConfigPromise;
  }

  async function getToken(client) {
    try {
      const apiToken = await global.Api?.getCurrentAccessToken?.();
      if (apiToken) return String(apiToken || '').trim();
    } catch (_) {}
    try {
      const result = await client?.auth?.getSession?.();
      return String(result?.data?.session?.access_token || '').trim();
    } catch (_) {
      return '';
    }
  }

  async function postTestPush(payload) {
    const client = global.SupabaseClient?.getClient?.();
    const token = await getToken(client);
    const response = await fetch('/api/notifications/test-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}`, 'X-Supabase-Access-Token': token } : {})
      },
      body: JSON.stringify(payload || {})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) {
      throw new Error(String(result?.error || `Request failed with HTTP ${response.status}`));
    }
    return result;
  }

  async function unsubscribeCurrentBrowserSubscription(push) {
    try {
      const registration = await push.getRegistration?.() || await global.navigator?.serviceWorker?.ready;
      const subscription = await registration?.pushManager?.getSubscription?.();
      if (subscription) await subscription.unsubscribe();
    } catch (_) {}
    try {
      global.localStorage?.removeItem('INCHECK360_PUSH_VAPID_PUBLIC_KEY_LAST_USED');
    } catch (_) {}
  }

  function patch(attempt = 0) {
    const push = global.PushNotifications;
    if (!push) {
      if (attempt < 120) global.setTimeout(() => patch(attempt + 1), 250);
      return;
    }
    if (push.__incheck360PwaVercelDevicePatch) return;
    push.__incheck360PwaVercelDevicePatch = true;

    const originalGetVapidPublicKey = typeof push.getVapidPublicKey === 'function'
      ? push.getVapidPublicKey.bind(push)
      : null;
    const originalEnablePush = typeof push.enablePush === 'function'
      ? push.enablePush.bind(push)
      : null;
    const originalRefreshPushSubscription = typeof push.refreshPushSubscription === 'function'
      ? push.refreshPushSubscription.bind(push)
      : null;

    push.getVapidPublicKey = function patchedGetVapidPublicKey() {
      return cachedVapidPublicKey || originalGetVapidPublicKey?.() || '';
    };

    if (originalEnablePush) {
      push.enablePush = async function patchedEnablePush(...args) {
        await loadBackendPushConfig({ force: true });
        return originalEnablePush(...args);
      };
    }

    if (originalRefreshPushSubscription) {
      push.refreshPushSubscription = async function patchedRefreshPushSubscription(...args) {
        const backendKey = await loadBackendPushConfig({ force: true });
        const currentKey = String(originalGetVapidPublicKey?.() || '').trim();
        if (currentKey && backendKey && currentKey !== backendKey) {
          await unsubscribeCurrentBrowserSubscription(this);
        }
        return originalRefreshPushSubscription(...args);
      };
    }

    push.testSingleDevice = async function patchedTestSingleDevice(subscriptionId = '') {
      if (!this.requireNotificationAdmin?.()) return;
      const id = String(subscriptionId || '').trim();
      if (!id) return;
      this.setBusy?.(true);
      try {
        await loadBackendPushConfig({ force: true });
        const result = await postTestPush({
          subscription_ids: [id],
          title: 'InCheck360 Device Test',
          body: 'Testing push to this device.',
          url: '/',
          tag: 'device-test-push',
          data: { test: true, subscription_id: id, source: 'vercel-device-test' }
        });
        this.setDeviceTestResult?.({
          targetSubscriptionId: id,
          attempted: result?.attempted,
          sent: result?.sent,
          failed: result?.failed,
          errors: result?.errors
        });
        await this.renderDiagnostics?.({ source: 'testSingleDeviceVercel' });
      } catch (error) {
        this.setDeviceTestResult?.({
          targetSubscriptionId: id,
          attempted: 0,
          sent: 0,
          failed: 1,
          errors: [String(error?.message || error || 'Unknown error')]
        });
      } finally {
        this.setBusy?.(false);
      }
    };

    push.testAllMyDevices = async function patchedTestAllMyDevices() {
      if (!this.requireNotificationAdmin?.()) return;
      const userId = String(global.Session?.userId?.() || '').trim();
      if (!userId) return;
      this.setBusy?.(true);
      try {
        await loadBackendPushConfig({ force: true });
        const result = await postTestPush({
          user_ids: [userId],
          title: 'InCheck360 Multi-device Test',
          body: 'Testing push to all active devices.',
          url: '/',
          tag: 'multi-device-test',
          data: { test: true, source: 'vercel-all-devices-test' }
        });
        this.setDeviceTestResult?.({
          targetSubscriptionId: `all for user_id ${userId}`,
          attempted: result?.attempted,
          sent: result?.sent,
          failed: result?.failed,
          errors: result?.errors
        });
        await this.listActiveDeviceSubscriptions?.();
        await this.renderDiagnostics?.({ source: 'testAllMyDevicesVercel' });
      } catch (error) {
        this.setDeviceTestResult?.({
          targetSubscriptionId: `all for user_id ${userId}`,
          attempted: 0,
          sent: 0,
          failed: 1,
          errors: [String(error?.message || error || 'Unknown error')]
        });
      } finally {
        this.setBusy?.(false);
      }
    };

    loadBackendPushConfig().catch(error => {
      console.warn('[push] Unable to load backend VAPID public key', error);
    });
  }

  patch();
  global.addEventListener?.('DOMContentLoaded', () => patch());
  global.addEventListener?.('load', () => patch());
})(window);
