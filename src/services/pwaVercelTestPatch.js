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

  function escapeHtml(value = '') {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getEndpointPreview(endpoint = '') {
    const value = String(endpoint || '').trim();
    if (!value) return '—';
    if (value.length <= 26) return value;
    return `${value.slice(0, 12)}…${value.slice(-12)}`;
  }

  function formatDateTime(push, value = '') {
    const text = String(value || '').trim();
    if (!text) return '—';
    return push?.formatDateTime?.(text) || global.U?.formatAppDateTime?.(text, { fallback: text }) || text;
  }

  async function getCurrentBrowserEndpoint(push) {
    try {
      const registration = await push.getRegistration?.() || await global.navigator?.serviceWorker?.ready;
      const subscription = await registration?.pushManager?.getSubscription?.();
      return String(subscription?.endpoint || '').trim();
    } catch (_) {
      return '';
    }
  }

  async function queryTableByColumn(client, table, column, value) {
    try {
      const { data, error } = await client
        .from(table)
        .select('*')
        .eq(column, value)
        .eq('is_active', true)
        .order('last_seen_at', { ascending: false, nullsFirst: false });
      if (error) return [];
      return Array.isArray(data) ? data.map(row => ({ ...row, __table: table })) : [];
    } catch (_) {
      return [];
    }
  }

  async function loadCurrentUserDeviceRows(push) {
    const client = global.SupabaseClient?.getClient?.();
    const userId = String(global.Session?.userId?.() || '').trim();
    if (!client || !userId) return [];

    const endpoint = await getCurrentBrowserEndpoint(push);
    const tables = ['user_push_subscriptions', 'push_subscriptions'];
    const userColumns = ['user_id', 'recipient_user_id', 'auth_user_id', 'profile_id'];
    const groups = [];

    for (const table of tables) {
      for (const column of userColumns) {
        groups.push(queryTableByColumn(client, table, column, userId));
      }
      if (endpoint) groups.push(queryTableByColumn(client, table, 'endpoint', endpoint));
    }

    const results = (await Promise.all(groups)).flat();
    const seen = new Set();
    return results.filter(row => {
      const key = String(row.endpoint || row.id || '').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function renderActiveDeviceRows(push, rows = []) {
    const activeRows = Array.isArray(rows) ? rows : [];
    push.state.activeDeviceRows = activeRows;

    if (push.els?.activeDevicesPanel) push.els.activeDevicesPanel.style.display = '';
    if (push.els?.activeDevicesState) {
      push.els.activeDevicesState.textContent = `${activeRows.length} active device subscription${activeRows.length === 1 ? '' : 's'} for current user.`;
    }

    if (!push.els?.activeDevicesTbody) return;

    push.els.activeDevicesTbody.innerHTML = activeRows.length
      ? activeRows.map(row => `
        <tr>
          <td>${escapeHtml(String(row.id || '—'))}</td>
          <td>${escapeHtml(String(row.device_label || '—'))}</td>
          <td>${escapeHtml(String(row.browser_name || '—'))}</td>
          <td>${escapeHtml(String(row.permission_status || '—'))}</td>
          <td>${escapeHtml(String(row.is_active ?? row.active ?? row.enabled ?? '—'))}</td>
          <td>${escapeHtml(formatDateTime(push, row.last_seen_at || row.updated_at || row.created_at))}</td>
          <td>${escapeHtml(getEndpointPreview(row.endpoint || ''))}</td>
          <td>${row.id ? `<button class="btn ghost xs" type="button" data-test-push-subscription-id="${escapeHtml(String(row.id))}">Test</button>` : '—'}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="8" class="muted">No active push subscriptions found for current user.</td></tr>';
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
    const originalListActiveDeviceSubscriptions = typeof push.listActiveDeviceSubscriptions === 'function'
      ? push.listActiveDeviceSubscriptions.bind(push)
      : null;

    push.getVapidPublicKey = function patchedGetVapidPublicKey() {
      return cachedVapidPublicKey || originalGetVapidPublicKey?.() || '';
    };

    if (originalEnablePush) {
      push.enablePush = async function patchedEnablePush(...args) {
        await loadBackendPushConfig({ force: true });
        const result = await originalEnablePush(...args);
        await this.listActiveDeviceSubscriptions?.();
        return result;
      };
    }

    if (originalRefreshPushSubscription) {
      push.refreshPushSubscription = async function patchedRefreshPushSubscription(...args) {
        const backendKey = await loadBackendPushConfig({ force: true });
        const currentKey = String(originalGetVapidPublicKey?.() || '').trim();
        if (currentKey && backendKey && currentKey !== backendKey) {
          await unsubscribeCurrentBrowserSubscription(this);
        }
        const result = await originalRefreshPushSubscription(...args);
        await this.listActiveDeviceSubscriptions?.();
        return result;
      };
    }

    if (originalListActiveDeviceSubscriptions) {
      push.listActiveDeviceSubscriptions = async function patchedListActiveDeviceSubscriptions(...args) {
        const rows = await loadCurrentUserDeviceRows(this);
        if (rows.length) {
          renderActiveDeviceRows(this, rows);
          return rows;
        }
        const originalRows = await originalListActiveDeviceSubscriptions(...args).catch(() => []);
        const fallbackRows = Array.isArray(originalRows) ? originalRows : [];
        if (fallbackRows.length) renderActiveDeviceRows(this, fallbackRows);
        return fallbackRows;
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
