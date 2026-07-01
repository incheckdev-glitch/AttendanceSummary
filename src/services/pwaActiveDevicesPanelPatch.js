(function installInCheck360PwaActiveDevicesPanelPatch(global) {
  function escapeHtml(value = '') {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function endpointPreview(endpoint = '') {
    const value = String(endpoint || '').trim();
    if (!value) return '—';
    if (value.length <= 26) return value;
    return `${value.slice(0, 12)}…${value.slice(-12)}`;
  }

  function formatDateTime(push, value = '') {
    const text = String(value || '').trim();
    if (!text) return '—';
    try {
      return push?.formatDateTime?.(text) || global.U?.formatAppDateTime?.(text, { fallback: text }) || text;
    } catch (_) {
      return text;
    }
  }

  async function getCurrentEndpoint(push) {
    try {
      const registration = await push.getRegistration?.() || await navigator.serviceWorker.ready;
      const subscription = await registration?.pushManager?.getSubscription?.();
      return String(subscription?.endpoint || '').trim();
    } catch (_) {
      return '';
    }
  }

  async function safeQuery(builder) {
    try {
      const { data, error } = await builder;
      if (error) return [];
      return Array.isArray(data) ? data : [];
    } catch (_) {
      return [];
    }
  }

  async function loadCurrentUserRows(push) {
    const client = global.SupabaseClient?.getClient?.();
    const userId = String(global.Session?.userId?.() || '').trim();
    if (!client || !userId) return [];

    const endpoint = await getCurrentEndpoint(push);
    const tables = ['user_push_subscriptions', 'push_subscriptions'];
    const rows = [];

    for (const table of tables) {
      rows.push(...(await safeQuery(
        client.from(table).select('*').eq('user_id', userId).eq('is_active', true).order('last_seen_at', { ascending: false })
      )).map(row => ({ ...row, __table: table })));

      if (endpoint) {
        rows.push(...(await safeQuery(
          client.from(table).select('*').eq('endpoint', endpoint).eq('is_active', true).order('last_seen_at', { ascending: false })
        )).map(row => ({ ...row, __table: table })));
      }
    }

    const seen = new Set();
    return rows.filter(row => {
      const key = String(row.endpoint || row.id || '').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function renderRows(push, rows = []) {
    const list = Array.isArray(rows) ? rows : [];
    push.state = push.state || {};
    push.state.activeDeviceRows = list;

    if (push.els?.activeDevicesPanel) {
      push.els.activeDevicesPanel.hidden = false;
      push.els.activeDevicesPanel.style.display = '';
      push.els.activeDevicesPanel.removeAttribute('aria-hidden');
    }

    if (push.els?.activeDevicesState) {
      push.els.activeDevicesState.textContent = list.length
        ? `${list.length} active device subscription${list.length === 1 ? '' : 's'} for current user.`
        : 'No active push subscriptions found for current user.';
    }

    if (!push.els?.activeDevicesTbody) return;

    push.els.activeDevicesTbody.innerHTML = list.length
      ? list.map(row => `
        <tr>
          <td>${escapeHtml(String(row.id || '—'))}</td>
          <td>${escapeHtml(String(row.device_label || '—'))}</td>
          <td title="${escapeHtml(String(row.user_agent || ''))}">${escapeHtml(String(row.user_agent || row.browser_name || '—').slice(0, 52))}</td>
          <td title="${escapeHtml(String(row.endpoint || ''))}">${escapeHtml(endpointPreview(row.endpoint))}</td>
          <td>${escapeHtml(push.guessPlatform?.(row) || row.platform || '—')}</td>
          <td>${escapeHtml(String(row.is_active ?? row.active ?? row.enabled ?? '—'))}</td>
          <td>${escapeHtml(formatDateTime(push, row.last_seen_at || row.updated_at || row.created_at))}</td>
          <td>${escapeHtml(formatDateTime(push, row.created_at))}</td>
          <td>${escapeHtml(formatDateTime(push, row.updated_at))}</td>
          <td>${row.id ? `<button class="btn ghost sm" type="button" data-push-test-subscription-id="${escapeHtml(String(row.id))}">Test this device</button>` : '—'}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="10" class="muted" style="text-align:center;">No active subscriptions for this user.</td></tr>';
  }

  async function refreshActiveDevices(push) {
    if (!push || !global.Session?.isAuthenticated?.()) return [];
    const rows = await loadCurrentUserRows(push);
    renderRows(push, rows);
    return rows;
  }

  function patch(attempt = 0) {
    const push = global.PushNotifications;
    if (!push) {
      if (attempt < 160) global.setTimeout(() => patch(attempt + 1), 250);
      return;
    }
    if (push.__incheck360ActiveDevicesPanelPatch) return;
    push.__incheck360ActiveDevicesPanelPatch = true;

    const originalList = typeof push.listActiveDeviceSubscriptions === 'function'
      ? push.listActiveDeviceSubscriptions.bind(push)
      : null;
    const originalSave = typeof push.savePushSubscription === 'function'
      ? push.savePushSubscription.bind(push)
      : null;
    const originalRenderCurrent = typeof push.renderCurrentDeviceSubscription === 'function'
      ? push.renderCurrentDeviceSubscription.bind(push)
      : null;
    const originalSync = typeof push.syncExistingSubscription === 'function'
      ? push.syncExistingSubscription.bind(push)
      : null;
    const originalEnable = typeof push.enablePush === 'function'
      ? push.enablePush.bind(push)
      : null;
    const originalRefresh = typeof push.refreshPushSubscription === 'function'
      ? push.refreshPushSubscription.bind(push)
      : null;

    push.listActiveDeviceSubscriptions = async function patchedListActiveDeviceSubscriptions(...args) {
      const rows = await refreshActiveDevices(this);
      if (rows.length) return rows;
      if (!originalList) return rows;
      const fallback = await originalList(...args).catch(() => []);
      if (Array.isArray(fallback) && fallback.length) renderRows(this, fallback);
      return Array.isArray(fallback) ? fallback : rows;
    };

    if (originalSave) {
      push.savePushSubscription = async function patchedSavePushSubscription(...args) {
        const result = await originalSave(...args);
        await refreshActiveDevices(this).catch(() => []);
        return result;
      };
    }

    if (originalRenderCurrent) {
      push.renderCurrentDeviceSubscription = async function patchedRenderCurrentDeviceSubscription(...args) {
        const result = await originalRenderCurrent(...args);
        await refreshActiveDevices(this).catch(() => []);
        return result;
      };
    }

    if (originalSync) {
      push.syncExistingSubscription = async function patchedSyncExistingSubscription(...args) {
        const result = await originalSync(...args);
        await refreshActiveDevices(this).catch(() => []);
        return result;
      };
    }

    if (originalEnable) {
      push.enablePush = async function patchedEnablePush(...args) {
        const result = await originalEnable(...args);
        await refreshActiveDevices(this).catch(() => []);
        return result;
      };
    }

    if (originalRefresh) {
      push.refreshPushSubscription = async function patchedRefreshPushSubscription(...args) {
        const result = await originalRefresh(...args);
        await refreshActiveDevices(this).catch(() => []);
        return result;
      };
    }

    global.setTimeout(() => refreshActiveDevices(push).catch(() => []), 1000);
    global.addEventListener?.('focus', () => refreshActiveDevices(push).catch(() => []));
    document.addEventListener?.('visibilitychange', () => {
      if (!document.hidden) refreshActiveDevices(push).catch(() => []);
    });
  }

  patch();
  global.addEventListener?.('DOMContentLoaded', () => patch());
  global.addEventListener?.('load', () => patch());
})(window);
