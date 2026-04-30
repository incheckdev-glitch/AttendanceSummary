(function initPushNotifications(global) {
  const WEB_PUSH_FUNCTION_NAME = 'send-web-push-v2';
  const IN_APP_SOUND_STORAGE_KEY = 'incheck360_in_app_notification_sound_enabled';
  const FOREGROUND_PUSH_BANNER_DEDUPE_WINDOW_MS = 15000;
  const FOREGROUND_PUSH_BANNER_AUTO_DISMISS_MS = 10000;
  function getPushVapidPublicKey() {
    return String(
      global.RUNTIME_CONFIG?.PUSH_VAPID_PUBLIC_KEY ||
        global.RUNTIME_CONFIG?.VAPID_PUBLIC_KEY ||
        global.INCHECK360_PUSH_CONFIG?.vapidPublicKey ||
        global.APP_CONFIG?.PUSH_VAPID_PUBLIC_KEY ||
        ''
    ).trim();
  }

  const PushNotifications = {
    state: {
      supported: false,
      enabled: false,
      busy: false,
      permission: 'default',
      message: '',
      initialized: false,
      wired: false,
      messageListenerWired: false,
      lastPushReceivedAt: '',
      lastShowNotificationAt: '',
      lastShowNotificationError: '',
      lastPushPayload: null,
      latestServerTestResult: null,
      pwaInstallCheck: null,
      activeDeviceRows: [],
      foregroundBannerTimers: new Map(),
      foregroundBannerDedup: new Map(),
      inAppSoundEnabled: false,
      inAppSoundUnlocked: false,
      inAppSoundAudio: null,
      sessionSubscriptionWired: false
    },

    els: {
      toggleBtn: null,
      statusText: null,
      iosHint: null,
      refreshSubscriptionBtn: null,
      inAppSoundToggleBtn: null,
      localTestBtn: null,
      serverTestBtn: null,
      serverTestResult: null,
      readDiagnosticsBtn: null,
      pwaInstallCheckBtn: null,
      forceSwUpdateBtn: null,
      diagnosticsPanel: null,
      diagnosticsText: null,
      pwaInstallStatusMessage: null,
      pwaInstallCheckResult: null,
      activeDevicesPanel: null,
      activeDevicesState: null,
      activeDevicesTbody: null,
      testAllDevicesBtn: null,
      deviceTestResult: null
    },

    normalizeKey(value) {
      return typeof value === 'string' ? value.trim() : '';
    },

    normalizeRole(value) {
      return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
    },

    getCurrentUserRole() {
      const candidates = [
        global.Session?.state?.profile?.role_key,
        global.Session?.state?.profile?.role,
        global.Session?.state?.profile?.user_role,
        global.Session?.state?.profile?.app_role,

        global.Session?.state?.user?.role_key,
        global.Session?.state?.user?.role,
        global.Session?.state?.user?.user_role,
        global.Session?.state?.user?.app_role,

        global.Session?.user?.()?.role_key,
        global.Session?.user?.()?.role,
        global.Session?.user?.()?.user_role,
        global.Session?.user?.()?.app_role,

        global.currentUser?.role_key,
        global.currentUser?.role,
        global.currentUser?.user_role,
        global.currentUser?.app_role,

        global.currentProfile?.role_key,
        global.currentProfile?.role,
        global.currentProfile?.user_role,
        global.currentProfile?.app_role
      ];

      for (const value of candidates) {
        const role = this.normalizeRole(value);
        if (role) return role;
      }

      return '';
    },

    canManageNotificationHub() {
      const role = this.getCurrentUserRole();
      return ['admin', 'administrator', 'super_admin', 'dev'].includes(role);
    },

    requireNotificationAdmin() {
      if (this.canManageNotificationHub()) return true;
      if (global.toast?.warning) {
        global.toast.warning('You do not have permission to manage global notification settings.');
      } else {
        this.setMessage('You do not have permission to manage global notification settings.');
      }
      return false;
    },

    isDebugEnabled() {
      try {
        return (
          Boolean(global.RUNTIME_CONFIG?.DEBUG_PUSH || global.RUNTIME_CONFIG?.DEBUG) ||
          global.localStorage?.getItem('INCHECK360_DEBUG_PUSH') === '1'
        );
      } catch (_) {
        return Boolean(global.RUNTIME_CONFIG?.DEBUG_PUSH || global.RUNTIME_CONFIG?.DEBUG);
      }
    },

    debugLog(...args) {
      if (!this.isDebugEnabled()) return;
      console.log('[push:debug]', ...args);
    },


    escapeHtml(value = '') {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    getVapidPublicKey() {
      return this.normalizeKey(getPushVapidPublicKey());
    },



    getVapidKeyStorageKey() {
      return 'INCHECK360_PUSH_VAPID_PUBLIC_KEY_LAST_USED';
    },

    getStoredVapidPublicKey() {
      try {
        return this.normalizeKey(global.localStorage?.getItem(this.getVapidKeyStorageKey()) || '');
      } catch (_) {
        return '';
      }
    },

    setStoredVapidPublicKey(vapidPublicKey = '') {
      const value = this.normalizeKey(vapidPublicKey);
      try {
        if (!value) {
          global.localStorage?.removeItem(this.getVapidKeyStorageKey());
          return;
        }
        global.localStorage?.setItem(this.getVapidKeyStorageKey(), value);
      } catch (_) {
        // Ignore storage errors.
      }
    },

    getApplicationServerKey(vapidPublicKey = '') {
      const normalized = this.normalizeKey(vapidPublicKey);
      if (!normalized) return null;
      try {
        return this.urlBase64ToUint8Array(normalized);
      } catch (error) {
        console.warn('[push] Invalid VAPID public key', error);
        return null;
      }
    },

    isLocalhost(hostname = '') {
      const host = String(hostname || '').toLowerCase();
      return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    },

    isSecureContextAllowed() {
      if (global.isSecureContext) return true;
      return this.isLocalhost(global.location?.hostname || '');
    },

    isSupported() {
      return (
        'serviceWorker' in navigator &&
        'PushManager' in global &&
        'Notification' in global &&
        this.isSecureContextAllowed()
      );
    },

    isIosSafari() {
      const ua = String(navigator.userAgent || '');
      const iOS = /iPad|iPhone|iPod/.test(ua);
      const webkit = /WebKit/i.test(ua);
      const notCriOS = !/CriOS/i.test(ua);
      const notFxiOS = !/FxiOS/i.test(ua);
      return iOS && webkit && notCriOS && notFxiOS;
    },

    isStandalonePwa() {
      return Boolean(global.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true);
    },

    urlBase64ToUint8Array(base64String = '') {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = global.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    },

    getElements() {
      this.els.toggleBtn = document.getElementById('pushToggleBtn');
      this.els.statusText = document.getElementById('pushStatusText');
      this.els.iosHint = document.getElementById('pushIosHint');
      this.els.refreshSubscriptionBtn = document.getElementById('pushRefreshSubscriptionBtn');
      this.els.inAppSoundToggleBtn = document.getElementById('pushInAppSoundToggleBtn');
      this.els.localTestBtn = document.getElementById('pushLocalTestBtn');
      this.els.serverTestBtn = document.getElementById('pushServerTestBtn');
      this.els.serverTestResult = document.getElementById('pushServerTestResult');
      this.els.readDiagnosticsBtn = document.getElementById('pushReadDiagnosticsBtn');
      this.els.pwaInstallCheckBtn = document.getElementById('pwaInstallCheckBtn');
      this.els.copyDiagnosticsBtn = document.getElementById('pushCopyDiagnosticsBtn');
      this.els.forceSwUpdateBtn = document.getElementById('pushForceSwUpdateBtn');
      this.els.diagnosticsPanel = document.getElementById('pushDiagnosticsPanel');
      this.els.diagnosticsText = document.getElementById('pushDiagnosticsText');
      this.els.pwaInstallStatusMessage = document.getElementById('pwaInstallStatusMessage');
      this.els.pwaInstallCheckResult = document.getElementById('pwaInstallCheckResult');
      this.els.activeDevicesPanel = document.getElementById('pushActiveDevicesPanel');
      this.els.activeDevicesState = document.getElementById('pushActiveDevicesState');
      this.els.activeDevicesTbody = document.getElementById('pushActiveDevicesTbody');
      this.els.testAllDevicesBtn = document.getElementById('pushTestAllDevicesBtn');
      this.els.deviceTestResult = document.getElementById('pushDeviceTestResult');
    },

    setMessage(message = '') {
      this.state.message = String(message || '').trim();
      if (this.els.statusText) this.els.statusText.textContent = this.state.message;
    },

    setBusy(isBusy) {
      this.state.busy = Boolean(isBusy);
      if (!this.els.toggleBtn) return;
      this.els.toggleBtn.disabled = this.state.busy || !this.state.supported;
      if (this.els.refreshSubscriptionBtn) this.els.refreshSubscriptionBtn.disabled = this.state.busy || !this.state.supported;
      if (this.els.inAppSoundToggleBtn) this.els.inAppSoundToggleBtn.disabled = this.state.busy;
      if (this.els.localTestBtn) this.els.localTestBtn.disabled = this.state.busy || !this.state.supported;
      if (this.els.serverTestBtn) this.els.serverTestBtn.disabled = this.state.busy || !this.state.supported;
      if (this.els.readDiagnosticsBtn) this.els.readDiagnosticsBtn.disabled = this.state.busy || !this.state.supported;
      if (this.els.pwaInstallCheckBtn) this.els.pwaInstallCheckBtn.disabled = this.state.busy;
      if (this.els.testAllDevicesBtn) this.els.testAllDevicesBtn.disabled = this.state.busy || !global.Session?.isAuthenticated?.();
      if (this.els.copyDiagnosticsBtn) this.els.copyDiagnosticsBtn.disabled = this.state.busy || !this.state.supported;
      if (this.els.forceSwUpdateBtn) this.els.forceSwUpdateBtn.disabled = this.state.busy || !this.state.supported;
      this.els.toggleBtn.setAttribute('aria-busy', this.state.busy ? 'true' : 'false');
      this.renderButtonLabel();
    },

    getPwaInstallRuntimeState() {
      const state = global.__INCHECK360_PWA_INSTALL_STATE || {};
      return {
        beforeInstallPromptFired: state.beforeInstallPromptFired === true,
        appInstalledFired: state.appInstalledFired === true
      };
    },

    getDisplayModeLabel() {
      const standalone = Boolean(global.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true);
      return standalone ? 'standalone' : 'browser';
    },

    async fetchPathStatus(path = '') {
      const target = String(path || '').trim();
      if (!target) return 'n/a';
      try {
        const response = await fetch(target, { method: 'GET', cache: 'no-store' });
        return `${response.status} ${response.ok ? 'OK' : 'ERROR'}`;
      } catch (error) {
        return `fetch failed: ${String(error?.message || 'unknown error')}`;
      }
    },

    async runPwaInstallCheck({ source = 'manual' } = {}) {
      const swSupported = 'serviceWorker' in navigator;
      const registration = swSupported ? await this.getRegistration().catch(() => null) : null;
      const runtimeState = this.getPwaInstallRuntimeState();
      const manifestStatus = await this.fetchPathStatus('/manifest.webmanifest');
      const swStatus = await this.fetchPathStatus('/service-worker.js');
      const icon192Status = await this.fetchPathStatus('/icons/icon-192.png');
      const icon512Status = await this.fetchPathStatus('/icons/icon-512.png');
      const maskableStatus = await this.fetchPathStatus('/icons/maskable-icon-512.png');
      const manifestLink = document.querySelector('link[rel="manifest"]');

      const result = {
        source,
        swSupported,
        swRegistered: Boolean(registration),
        swController: Boolean(navigator.serviceWorker?.controller),
        activeWorkerUrl: registration?.active?.scriptURL || '—',
        manifestLinkExists: Boolean(manifestLink),
        displayMode: this.getDisplayModeLabel(),
        beforeInstallPromptFired: runtimeState.beforeInstallPromptFired,
        appInstalledFired: runtimeState.appInstalledFired,
        manifestStatus,
        swStatus,
        icon192Status,
        icon512Status,
        maskableStatus
      };
      this.state.pwaInstallCheck = result;

      if (this.els.pwaInstallCheckResult) {
        const lines = [
          `PWA install check source: ${source}`,
          `/manifest.webmanifest: ${manifestStatus}`,
          `/service-worker.js: ${swStatus}`,
          `/icons/icon-192.png: ${icon192Status}`,
          `/icons/icon-512.png: ${icon512Status}`,
          `/icons/maskable-icon-512.png: ${maskableStatus}`,
          `display mode: ${result.displayMode}`,
          `service worker registration exists: ${result.swRegistered ? 'yes' : 'no'}`,
          `beforeinstallprompt fired: ${result.beforeInstallPromptFired ? 'yes' : 'no'}`
        ];
        this.els.pwaInstallCheckResult.textContent = lines.join('\n');
      }

      if (this.els.pwaInstallStatusMessage) {
        this.els.pwaInstallStatusMessage.textContent = result.beforeInstallPromptFired
          ? 'Install prompt is available when Chrome marks this app installable.'
          : 'Install prompt is not available yet. Chrome does not currently consider this app installable. Check manifest, icons, service worker, and HTTPS.';
      }

      return result;
    },

    renderButtonLabel() {
      if (!this.els.toggleBtn) return;
      if (!this.state.supported) {
        this.els.toggleBtn.textContent = 'Enable push notifications';
        return;
      }
      if (this.state.busy) {
        this.els.toggleBtn.textContent = this.state.enabled ? 'Disabling…' : 'Enabling…';
        return;
      }
      this.els.toggleBtn.textContent = this.state.enabled
        ? 'Disable push notifications'
        : 'Enable push notifications';
    },

    renderIosHint() {
      if (!this.els.iosHint) return;
      const showHint = this.isIosSafari() && !this.isStandalonePwa();
      this.els.iosHint.style.display = showHint ? '' : 'none';
    },

    updatePermissionState() {
      this.state.permission = String(global.Notification?.permission || 'default').toLowerCase();
    },

    canViewDiagnostics() {
      return this.canManageNotificationHub();
    },

    applyNotificationHubPermissions() {
      const canManage = this.canManageNotificationHub();
      console.info('[NotificationHub] permission state', {
        role: this.getCurrentUserRole(),
        canManage,
        profile: global.Session?.state?.profile || null
      });
      document.querySelectorAll('[data-admin-push-control="true"]').forEach(el => {
        el.hidden = !canManage;
        el.style.display = canManage ? '' : 'none';
        if ('disabled' in el) el.disabled = !canManage;
      });
      document.querySelectorAll('[data-user-push-control="true"]').forEach(el => {
        el.hidden = false;
        el.style.display = '';
        if ('disabled' in el) el.disabled = false;
      });
    },

    getEndpointPreview(endpoint = '') {
      const value = String(endpoint || '').trim();
      if (!value) return '—';
      if (value.length <= 26) return value;
      return `${value.slice(0, 12)}…${value.slice(-12)}`;
    },

    guessPlatform(device = {}) {
      const ua = String(device?.user_agent || '').toLowerCase();
      const label = String(device?.device_label || '').toLowerCase();
      if (/\bandroid\b/.test(ua) || /\bandroid\b/.test(label)) return 'Android';
      if (/\biphone\b|\bipad\b|\bios\b/.test(ua) || /\bios\b/.test(label)) return 'iOS';
      if (/windows|macintosh|linux|x11|cros/.test(ua) || /\bdesktop\b/.test(label)) return 'Desktop';
      return 'Unknown';
    },

    deriveDeviceLabel() {
      const ua = String(navigator.userAgent || '').toLowerCase();
      const standalone = this.isStandalonePwa();
      if (/android/.test(ua) && /chrome|crios/.test(ua)) return 'Android Chrome';
      if (/(iphone|ipad|ipod)/.test(ua) && standalone) return 'iOS PWA';
      if (/edg\//.test(ua) && /(windows|macintosh|linux|x11|cros)/.test(ua)) return 'Desktop Edge';
      if (/chrome|crios/.test(ua) && /(windows|macintosh|linux|x11|cros)/.test(ua)) return 'Desktop Chrome';
      return 'Unknown Device';
    },

    formatDateTime(value = '') {
      const text = String(value || '').trim();
      if (!text) return '—';
      const dt = new Date(text);
      if (Number.isNaN(dt.getTime())) return text;
      return dt.toLocaleString();
    },

    async getPushDbStatusByEndpoint(endpoint = '') {
      const value = String(endpoint || '').trim();
      if (!value) return false;
      const client = global.SupabaseClient?.getClient?.();
      if (!client) return false;
      const { data } = await client
        .from('push_subscriptions')
        .select('endpoint,is_active')
        .eq('endpoint', value)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      return Boolean(data?.endpoint);
    },

    setServerTestResultMessage(message = '') {
      if (!this.els.serverTestResult) return;
      this.els.serverTestResult.textContent = String(message || '').trim() || 'Server push test: not run yet.';
    },

    getFunctionsUrl(functionName = '') {
      const baseUrl = String(global.SupabaseClient?.getUrl?.() || '').trim().replace(/\/+$/g, '');
      const normalizedName = String(functionName || '').trim().replace(/^\/+/g, '');
      if (!baseUrl || !normalizedName) return '';
      return `${baseUrl}/functions/v1/${normalizedName}`;
    },

    async findCurrentUserSubscriptionTarget(userId = '') {
      const value = String(userId || '').trim();
      const client = global.SupabaseClient?.getClient?.();
      if (!client || !value) return null;
      const registration = await this.getRegistration().catch(() => null);
      const activeSubscription = registration?.pushManager
        ? await registration.pushManager.getSubscription().catch(() => null)
        : null;
      const endpoint = String(activeSubscription?.endpoint || '').trim();

      let query = client
        .from('push_subscriptions')
        .select('id,user_id,endpoint,is_active,last_seen_at,updated_at,created_at')
        .eq('user_id', value)
        .eq('is_active', true)
        .order('last_seen_at', { ascending: false })
        .limit(1);

      if (endpoint) query = query.eq('endpoint', endpoint);
      const { data } = await query.maybeSingle();
      if (data?.id) return data;

      if (endpoint) {
        const { data: byEndpoint } = await client
          .from('push_subscriptions')
          .select('id,user_id,endpoint,is_active,last_seen_at,updated_at,created_at')
          .eq('endpoint', endpoint)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        if (byEndpoint?.id) return byEndpoint;
      }

      const { data: fallback } = await client
        .from('push_subscriptions')
        .select('id,user_id,endpoint,is_active,last_seen_at,updated_at,created_at')
        .eq('user_id', value)
        .eq('is_active', true)
        .order('last_seen_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return fallback?.id ? fallback : null;
    },

    formatServerPushFailureMessage({
      status = 'unknown',
      message = 'Unknown error',
      responseBody = '',
      responseData = null,
      functionUrl = '',
      functionName = WEB_PUSH_FUNCTION_NAME,
      hasToken = false,
      targetLabel = ''
    } = {}) {
      const serializedData =
        responseData == null
          ? '—'
          : typeof responseData === 'string'
            ? responseData
            : JSON.stringify(responseData);
      return [
        'Server push failed:',
        `Status: ${status}`,
        `Message: ${message}`,
        `Response body: ${responseBody || '—'}`,
        `Data: ${serializedData || '—'}`,
        `Function: ${functionName || WEB_PUSH_FUNCTION_NAME}`,
        `URL: ${functionUrl || '—'}`,
        `Has token: ${hasToken ? 'yes' : 'no'}`,
        `Target: ${targetLabel || 'none'}`
      ].join('\n');
    },

    async getRegistration() {
      const existing = await navigator.serviceWorker.getRegistration();
      if (existing) return existing;
      return navigator.serviceWorker.ready;
    },

    async upsertSubscription(subscription, { isActive = true } = {}) {
      const endpoint = String(subscription?.endpoint || '').trim();
      if (!endpoint) throw new Error('Missing push endpoint.');
      const auth = subscription?.getKey ? subscription.getKey('auth') : null;
      const p256dh = subscription?.getKey ? subscription.getKey('p256dh') : null;
      const sessionUser = global.Session?.user?.() || {};
      const nowIso = new Date().toISOString();
      const payload = {
        endpoint,
        user_id: String(global.Session?.userId?.() || sessionUser.user_id || '').trim() || null,
        role: String(global.Session?.role?.() || sessionUser.role || sessionUser.profile?.role_key || '').trim() || null,
        email: String(sessionUser.email || global.Session?.state?.profile?.email || '').trim().toLowerCase() || null,
        p256dh: p256dh ? global.btoa(String.fromCharCode(...new Uint8Array(p256dh))) : null,
        auth: auth ? global.btoa(String.fromCharCode(...new Uint8Array(auth))) : null,
        user_agent: String(navigator.userAgent || '').trim() || null,
        device_label: this.deriveDeviceLabel(),
        origin: String(global.location?.origin || '').trim() || null,
        app_context: this.isStandalonePwa() ? 'pwa' : 'web',
        is_active: Boolean(isActive),
        last_seen_at: nowIso
      };

      const client = global.SupabaseClient.getClient();
      const { error } = await client.from('push_subscriptions').upsert(payload, { onConflict: 'endpoint' });
      if (error) throw new Error(error.message || 'Unable to save push subscription.');
      return payload;
    },

    async markSubscriptionInactive(endpoint = '') {
      const value = String(endpoint || '').trim();
      if (!value) return;
      const client = global.SupabaseClient.getClient();
      const { error } = await client
        .from('push_subscriptions')
        .update({ is_active: false, last_seen_at: new Date().toISOString() })
        .eq('endpoint', value);
      if (error) throw new Error(error.message || 'Unable to disable push subscription.');
    },

    async markSubscriptionInactiveByUser() {
      const client = global.SupabaseClient?.getClient?.();
      const userId = String(global.Session?.userId?.() || '').trim();
      if (!client || !userId) return;
      await client
        .from('push_subscriptions')
        .update({ is_active: false, last_seen_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_active', true);
    },

    async syncExistingSubscription({ silent = false } = {}) {
      if (!this.state.supported || !global.Session?.isAuthenticated?.()) {
        this.state.enabled = false;
        this.renderButtonLabel();
        if (!silent) this.setMessage('Push notifications are not enabled on this device.');
        return false;
      }
      try {
        const registration = await this.getRegistration();
        const subscription = await registration.pushManager.getSubscription();
        const vapidPublicKey = this.getVapidPublicKey();
        const hasVapidPublicKey = Boolean(vapidPublicKey);
        this.updatePermissionState();
        if (subscription) {
          const storedVapidPublicKey = this.getStoredVapidPublicKey();
          if (vapidPublicKey && storedVapidPublicKey !== vapidPublicKey) {
            await this.refreshPushSubscription({ skipBusyState: true, reason: 'vapid_public_key_changed' });
            return true;
          }

          await this.upsertSubscription(subscription, { isActive: true });
          this.setStoredVapidPublicKey(vapidPublicKey);
          await this.logDiagnostics({ source: 'syncExistingSubscription', registration, subscription });
          this.state.enabled = true;
          this.renderButtonLabel();
          if (!silent) this.setMessage('Push notifications enabled on this device.');
          return true;
        }
        this.state.enabled = false;
        this.renderButtonLabel();
        if (!silent) {
          if (!hasVapidPublicKey) {
            this.setMessage('Push notifications are not configured yet. Contact your administrator.');
          } else if (this.state.permission === 'denied') {
            this.setMessage('Notifications are blocked in browser settings.');
          } else {
            this.setMessage('Push notifications disabled on this device.');
          }
        }
      } catch (error) {
        console.warn('[push] Failed to sync existing subscription', error);
        this.state.enabled = false;
        this.renderButtonLabel();
        if (!silent) this.setMessage('Unable to verify push notification status right now.');
      }
      return false;
    },



    async registerCurrentDevicePushSubscription(options = {}) {
      const forceRefresh = options?.forceRefresh === true;
      if (forceRefresh) {
        return this.refreshPushSubscription({ skipBusyState: false, reason: 'manual_force_refresh' });
      }
      return this.enablePush();
    },

    async enablePush() {
      if (!this.state.supported) {
        this.setMessage('Push notifications are not supported on this browser/device.');
        return;
      }
      if (!global.Session?.isAuthenticated?.()) {
        this.setMessage('Please log in first to enable push notifications.');
        return;
      }

      const vapidPublicKey = this.getVapidPublicKey();
      const applicationServerKey = this.getApplicationServerKey(vapidPublicKey);
      if (!applicationServerKey) {
        this.setMessage('Push notifications are not configured yet. Contact your administrator.');
        return;
      }

      this.setBusy(true);
      try {
        const registration = await this.getRegistration();
        const permission = await Notification.requestPermission();
        this.state.permission = String(permission || 'default').toLowerCase();
        if (this.state.permission !== 'granted') {
          this.state.enabled = false;
          this.renderButtonLabel();
          if (this.state.permission === 'denied') {
            this.setMessage('Notifications are blocked in browser settings.');
          } else {
            this.setMessage('Push notifications were not enabled.');
          }
          return;
        }

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey
          });
        }

        await this.upsertSubscription(subscription, { isActive: true });
        this.setStoredVapidPublicKey(vapidPublicKey);
        await this.logDiagnostics({ source: 'enablePush', registration, subscription });
        this.state.enabled = true;
        this.setMessage('Push notifications enabled on this device.');
      } catch (error) {
        console.warn('[push] Enable failed', error);
        this.setMessage(`Unable to enable push notifications: ${String(error?.message || 'Unknown error')}`);
      } finally {
        this.setBusy(false);
      }
    },

    async disablePush() {
      if (!this.state.supported) {
        this.setMessage('Push notifications are not supported on this browser/device.');
        return;
      }
      this.setBusy(true);
      try {
        const registration = await this.getRegistration();
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const endpoint = subscription.endpoint;
          await subscription.unsubscribe();
          await this.markSubscriptionInactive(endpoint);
        }
        await this.logDiagnostics({ source: 'disablePush', registration, subscription: null });
        this.state.enabled = false;
        this.setMessage('Push notifications disabled on this device.');
      } catch (error) {
        console.warn('[push] Disable failed', error);
        this.setMessage(`Unable to disable push notifications: ${String(error?.message || 'Unknown error')}`);
      } finally {
        this.setBusy(false);
      }
    },

    async refreshPushSubscription({ skipBusyState = false } = {}) {
      if (!this.state.supported) {
        this.setMessage('Push notifications are not supported on this browser/device.');
        return;
      }
      const vapidPublicKey = this.getVapidPublicKey();
      const applicationServerKey = this.getApplicationServerKey(vapidPublicKey);
      if (!applicationServerKey) {
        this.setMessage('Push notifications are not configured yet. Contact your administrator.');
        return;
      }

      if (!skipBusyState) this.setBusy(true);
      try {
        const registration = await this.getRegistration();
        const oldSubscription = await registration.pushManager.getSubscription();
        const oldEndpoint = String(oldSubscription?.endpoint || '').trim();
        if (oldSubscription) {
          await oldSubscription.unsubscribe();
        }
        if (oldEndpoint) {
          await this.markSubscriptionInactive(oldEndpoint);
        } else {
          await this.markSubscriptionInactiveByUser();
        }

        const permission = await Notification.requestPermission();
        this.state.permission = String(permission || 'default').toLowerCase();
        if (this.state.permission !== 'granted') {
          this.setMessage('Notification permission is required to refresh push subscription.');
          this.state.enabled = false;
          this.renderButtonLabel();
          return;
        }

        const newSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
        await this.upsertSubscription(newSubscription, { isActive: true });
        this.setStoredVapidPublicKey(vapidPublicKey);
        this.state.enabled = true;
        this.setMessage('Push subscription refreshed successfully. Running server push test…');
        await this.renderDiagnostics({ source: 'refreshPushSubscription' });
        await this.testServerPush();
      } catch (error) {
        this.setMessage(`Unable to refresh subscription: ${String(error?.message || 'Unknown error')}`);
      } finally {
        if (!skipBusyState) this.setBusy(false);
      }
    },

    async testLocalNotification() {
      if (!this.requireNotificationAdmin()) return;
      if (!this.state.supported) {
        this.setMessage('Push notifications are not supported on this browser/device.');
        return;
      }
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification('InCheck360 Local Test', {
          body: 'Local notification works on this device.',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          silent: false,
          vibrate: [200, 100, 200],
          data: { url: '/' }
        });
        this.setMessage('Local notification test dispatched. A system banner should appear if OS/browser allows it.');
      } catch (error) {
        this.setMessage(`Local notification test failed: ${String(error?.message || 'Unknown error')}`);
      }
    },

    async testServerPush() {
      if (!this.requireNotificationAdmin()) return;
      if (!global.Session?.isAuthenticated?.()) {
        this.setMessage('Please log in first to run server push test.');
        return;
      }
      this.setBusy(true);
      this.setServerTestResultMessage('Server push test: sending…');
      try {
        const client = global.SupabaseClient?.getClient?.();
        if (!client) throw new Error('Supabase client unavailable.');
        const userId = String(global.Session?.userId?.() || '').trim();
        if (!userId) throw new Error('Missing current user id.');
        const functionUrl = this.getFunctionsUrl(WEB_PUSH_FUNCTION_NAME);
        const anonKey = String(global.RUNTIME_CONFIG?.SUPABASE_ANON_KEY || global.SUPABASE_ANON_KEY || '').trim();
        const sessionResult = await client.auth.getSession();
        const accessToken = String(sessionResult?.data?.session?.access_token || '').trim();
        const subscriptionRow = await this.findCurrentUserSubscriptionTarget(userId);
        const targetPayload = subscriptionRow?.id
          ? { subscription_ids: [String(subscriptionRow.id)] }
          : { user_ids: [userId] };
        const targetLabel = subscriptionRow?.id
          ? `subscription_id ${String(subscriptionRow.id)}`
          : `user_id ${userId}`;
        const payload = {
          ...targetPayload,
          title: 'InCheck360 Server Test',
          body: 'Server push is working.',
          url: '/?pushTest=1',
          tag: 'server-test-push',
          data: { test: true, source: 'push-settings-test' }
        };

        this.debugLog('server push test request', {
          functionUrl,
          hasSupabaseUrl: Boolean(global.SupabaseClient?.getUrl?.()),
          hasAnonKey: Boolean(anonKey),
          hasAccessToken: Boolean(accessToken),
          currentUserId: userId,
          subscriptionRowId: subscriptionRow?.id || null,
          payload
        });

        const { data, error } = await client.functions.invoke(WEB_PUSH_FUNCTION_NAME, { body: payload });
        if (error) {
          const status = Number(error?.context?.status || error?.status || 0) || 'unknown';
          const errorMessage = String(error?.message || error?.name || 'Unknown invoke error');
          let responseBodyText = '';
          let responseJson = null;
          const context = error?.context || null;
          if (context) {
            try {
              if (typeof context.text === 'function') {
                responseBodyText = await context.clone().text();
              } else if (typeof context.response?.text === 'function') {
                responseBodyText = await context.response.clone().text();
              } else if (typeof context.body === 'string') {
                responseBodyText = context.body;
              } else if (typeof context.responseBody === 'string') {
                responseBodyText = context.responseBody;
              }
            } catch (_) {
              responseBodyText = '';
            }
            try {
              if (responseBodyText) {
                responseJson = JSON.parse(responseBodyText);
              } else if (context.data && typeof context.data === 'object') {
                responseJson = context.data;
              } else if (context.error && typeof context.error === 'object') {
                responseJson = context.error;
              }
            } catch (_) {
              responseJson = null;
            }
          }
          const responseData = data ?? responseJson ?? null;
          const messageDetail = String(responseJson?.error || responseJson?.message || errorMessage).trim() || errorMessage;
          this.debugLog('server push test response', {
            functionName: WEB_PUSH_FUNCTION_NAME,
            errorMessage,
            status,
            errorContextStatus: error?.context?.status || null,
            responseBodyText: responseBodyText || null,
            responseJson,
            data: data ?? null
          });
          if (status === 404) {
            throw new Error(
              `${WEB_PUSH_FUNCTION_NAME} Edge Function was not found. Confirm it is deployed in Supabase.\nStatus: ${status}\nResponse body: ${responseBodyText || '—'}\nURL: ${functionUrl}\nTarget: ${targetLabel}\nHas token: ${accessToken ? 'yes' : 'no'}`
            );
          }
          throw new Error(
            this.formatServerPushFailureMessage({
              status,
              message: messageDetail,
              responseBody: responseBodyText,
              responseData,
              functionUrl,
              functionName: WEB_PUSH_FUNCTION_NAME,
              hasToken: Boolean(accessToken),
              targetLabel
            })
          );
        }

        this.debugLog('server push test response', {
          status: 200,
          responseBody: data || null
        });
        this.state.latestServerTestResult = data || null;
        const attempted = Number(data?.attempted || 0);
        const sent = Number(data?.sent || 0);
        const failed = Number(data?.failed || 0);
        this.setServerTestResultMessage(
          `Server push test result: attempted=${attempted}, sent=${sent}, failed=${failed}. Target: ${targetLabel}.`
        );
        if (attempted > 0 && sent === 0 && failed > 0) {
          this.setMessage('The saved device subscription may be stale. Refresh your push subscription.');
        } else {
          this.setMessage('Server push test completed. If no banner appears while closed, check OS settings, iOS Home Screen requirement, and active service worker version.');
        }
        await this.renderDiagnostics({ source: 'testServerPush' });
      } catch (error) {
        this.setServerTestResultMessage(`Server push test failed: ${String(error?.message || 'Unknown error')}`);
        this.setMessage(`Server push test failed: ${String(error?.message || 'Unknown error')}`);
      } finally {
        this.setBusy(false);
      }
    },

    setDeviceTestResult(details = {}) {
      if (!this.els.deviceTestResult) return;
      const attempted = Number(details?.attempted || 0);
      const sent = Number(details?.sent || 0);
      const failed = Number(details?.failed || 0);
      const targetSubscriptionId = String(details?.targetSubscriptionId || '').trim() || '—';
      const errors = Array.isArray(details?.errors) ? details.errors : (details?.errors ? [details.errors] : []);
      const lines = [
        `target subscription_id: ${targetSubscriptionId}`,
        `attempted: ${attempted}`,
        `sent: ${sent}`,
        `failed: ${failed}`,
        `errors: ${errors.length ? JSON.stringify(errors, null, 2) : '[]'}`
      ];
      this.els.deviceTestResult.textContent = lines.join('\n');
    },

    async listActiveDeviceSubscriptions() {
      const canView = this.canViewDiagnostics();
      if (!canView || !this.els.activeDevicesPanel) return [];
      this.els.activeDevicesPanel.style.display = '';
      const userId = String(global.Session?.userId?.() || '').trim();
      if (!userId || !global.Session?.isAuthenticated?.()) {
        if (this.els.activeDevicesState) this.els.activeDevicesState.textContent = 'Log in to view active subscriptions.';
        if (this.els.activeDevicesTbody) this.els.activeDevicesTbody.innerHTML = '';
        return [];
      }
      const client = global.SupabaseClient?.getClient?.();
      if (!client) return [];
      const { data, error } = await client
        .from('push_subscriptions')
        .select('id,device_label,user_agent,endpoint,is_active,last_seen_at,created_at,updated_at')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('last_seen_at', { ascending: false });
      if (error) {
        if (this.els.activeDevicesState) this.els.activeDevicesState.textContent = `Unable to load active push devices: ${error.message || 'Unknown error'}`;
        if (this.els.activeDevicesTbody) this.els.activeDevicesTbody.innerHTML = '';
        return [];
      }
      const rows = Array.isArray(data) ? data : [];
      this.state.activeDeviceRows = rows;
      if (this.els.activeDevicesState) {
        this.els.activeDevicesState.textContent = `${rows.length} active device subscription${rows.length === 1 ? '' : 's'} for current user.`;
      }
      if (this.els.activeDevicesTbody) {
        this.els.activeDevicesTbody.innerHTML = rows.length
          ? rows.map(row => `
            <tr>
              <td>${this.escapeHtml(String(row.id || '—'))}</td>
              <td>${this.escapeHtml(String(row.device_label || '—'))}</td>
              <td title="${this.escapeHtml(String(row.user_agent || ''))}">${this.escapeHtml(String(row.user_agent || '—').slice(0, 52))}</td>
              <td title="${this.escapeHtml(String(row.endpoint || ''))}">${this.escapeHtml(this.getEndpointPreview(row.endpoint))}</td>
              <td>${this.escapeHtml(this.guessPlatform(row))}</td>
              <td>${row.is_active === true ? 'true' : 'false'}</td>
              <td>${this.escapeHtml(this.formatDateTime(row.last_seen_at))}</td>
              <td>${this.escapeHtml(this.formatDateTime(row.created_at))}</td>
              <td>${this.escapeHtml(this.formatDateTime(row.updated_at))}</td>
              <td><button class="btn ghost sm" type="button" data-push-test-subscription-id="${this.escapeHtml(String(row.id || ''))}">Test this device</button></td>
            </tr>
          `).join('')
          : '<tr><td colspan="10" class="muted" style="text-align:center;">No active subscriptions for this user.</td></tr>';
      }
      return rows;
    },

    async testSingleDevice(subscriptionId = '') {
      if (!this.requireNotificationAdmin()) return;
      const normalizedId = String(subscriptionId || '').trim();
      if (!normalizedId) return;
      const client = global.SupabaseClient?.getClient?.();
      if (!client) return;
      this.setBusy(true);
      try {
        const payload = {
          title: 'InCheck360 Device Test',
          body: 'Testing push to this device.',
          url: '/',
          subscription_ids: [normalizedId],
          tag: 'device-test-push',
          data: { test: true, subscription_id: normalizedId }
        };
        const { data, error } = await client.functions.invoke(WEB_PUSH_FUNCTION_NAME, { body: payload });
        if (error) throw error;
        this.setDeviceTestResult({
          targetSubscriptionId: normalizedId,
          attempted: data?.attempted,
          sent: data?.sent,
          failed: data?.failed,
          errors: data?.errors
        });
        await this.renderDiagnostics({ source: 'testSingleDevice' });
      } catch (error) {
        this.setDeviceTestResult({
          targetSubscriptionId: normalizedId,
          attempted: 0,
          sent: 0,
          failed: 1,
          errors: [String(error?.message || 'Unknown error')]
        });
      } finally {
        this.setBusy(false);
      }
    },

    async testAllMyDevices() {
      if (!this.requireNotificationAdmin()) return;
      if (!global.Session?.isAuthenticated?.()) return;
      const userId = String(global.Session?.userId?.() || '').trim();
      if (!userId) return;
      const client = global.SupabaseClient?.getClient?.();
      if (!client) return;
      this.setBusy(true);
      try {
        const payload = {
          title: 'InCheck360 Multi-device Test',
          body: 'Testing push to all active devices.',
          url: '/',
          user_ids: [userId],
          tag: 'multi-device-test',
          data: { test: true }
        };
        const { data, error } = await client.functions.invoke(WEB_PUSH_FUNCTION_NAME, { body: payload });
        if (error) throw error;
        this.setDeviceTestResult({
          targetSubscriptionId: `all for user_id ${userId}`,
          attempted: data?.attempted,
          sent: data?.sent,
          failed: data?.failed,
          errors: data?.errors
        });
        await this.listActiveDeviceSubscriptions();
        await this.renderDiagnostics({ source: 'testAllMyDevices' });
      } catch (error) {
        this.setDeviceTestResult({
          targetSubscriptionId: `all for user_id ${userId}`,
          attempted: 0,
          sent: 0,
          failed: 1,
          errors: [String(error?.message || 'Unknown error')]
        });
      } finally {
        this.setBusy(false);
      }
    },

    async handleToggleClick() {
      if (this.state.busy) return;
      if (this.state.enabled) {
        await this.disablePush();
        return;
      }
      await this.enablePush();
    },

    async readServiceWorkerDiagnostics() {
      if (!this.requireNotificationAdmin()) return null;
      if (!this.state.supported) return null;
      try {
        const registration = await this.getRegistration();
        const activeWorker = registration?.active || navigator.serviceWorker?.controller || null;
        if (!activeWorker) {
          throw new Error('No active service worker is available.');
        }

        const diagnostics = await new Promise((resolve, reject) => {
          const timeout = global.setTimeout(() => {
            reject(new Error('Timed out waiting for service worker diagnostics.'));
          }, 5000);

          const onMessage = event => {
            const data = event?.data || {};
            if (data.type !== 'INCHECK360_PUSH_DIAGNOSTICS') return;
            global.clearTimeout(timeout);
            navigator.serviceWorker.removeEventListener('message', onMessage);
            resolve(data.payload || {});
          };

          navigator.serviceWorker.addEventListener('message', onMessage);
          activeWorker.postMessage({ type: 'INCHECK360_READ_PUSH_DIAGNOSTICS' });
        });

        this.state.lastPushReceivedAt = String(diagnostics?.lastPushReceivedAt || '').trim();
        this.state.lastShowNotificationAt = String(diagnostics?.lastShowNotificationAt || '').trim();
        this.state.lastShowNotificationError = String(diagnostics?.lastShowNotificationError || '').trim();
        this.state.lastPushPayload = diagnostics?.lastPushPayload || null;
        return diagnostics;
      } catch (error) {
        this.state.lastShowNotificationError = String(error?.message || error || 'Unknown error');
        return null;
      }
    },

    async forceServiceWorkerUpdate() {
      if (!this.requireNotificationAdmin()) return;
      if (!this.state.supported) return;
      try {
        const isFormBeingEdited = () => {
          const activeElement = document.activeElement;
          return Boolean(
            activeElement &&
              (activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.tagName === 'SELECT' ||
                activeElement.isContentEditable)
          );
        };
        const registration = await this.getRegistration();
        let reloadTriggered = false;
        const onControllerChange = () => {
          if (reloadTriggered) return;
          reloadTriggered = true;
          if (isFormBeingEdited()) {
            this.setMessage('Service worker updated. Reopen the app if push banners still do not appear.');
            return;
          }
          global.location.reload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, { once: true });

        await registration.update();
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        } else if (registration.installing) {
          registration.installing.addEventListener('statechange', () => {
            if (registration.waiting) {
              registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        } else if (!navigator.serviceWorker.controller) {
          if (!isFormBeingEdited()) {
            global.location.reload();
            return;
          }
          this.setMessage('Service worker updated. Reopen the app if push banners still do not appear.');
          return;
        }
        this.setMessage('Service worker updated. Reopen the app if push banners still do not appear.');
      } catch (error) {
        this.setMessage(`Service worker update failed: ${String(error?.message || 'Unknown error')}`);
      }
    },

    async copyPushDiagnostics() {
      if (!this.requireNotificationAdmin()) return;
      const diagnosticsText = String(this.els.diagnosticsText?.textContent || '').trim();
      if (!diagnosticsText) {
        this.setMessage('No diagnostics text is available yet. Read diagnostics first.');
        return;
      }
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(diagnosticsText);
        } else {
          const textArea = document.createElement('textarea');
          textArea.value = diagnosticsText;
          textArea.setAttribute('readonly', 'readonly');
          textArea.style.position = 'fixed';
          textArea.style.left = '-9999px';
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
        }
        this.setMessage('Push diagnostics copied to clipboard.');
      } catch (error) {
        this.setMessage(`Unable to copy diagnostics: ${String(error?.message || 'Unknown error')}`);
      }
    },


    ensureForegroundBannerContainer() {
      let container = document.getElementById('pushForegroundBannerStack');
      if (container) return container;
      container = document.createElement('div');
      container.id = 'pushForegroundBannerStack';
      container.className = 'push-foreground-banner-stack';
      document.body.appendChild(container);
      return container;
    },

    getForegroundPushDedupKey(payload = {}) {
      const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
      return String(
        payload?.tag ||
        data?.tag ||
        data?.id ||
        data?.notification_id ||
        payload?.id ||
        `${payload?.title || ''}|${payload?.body || ''}|${payload?.url || data?.url || ''}`
      ).trim();
    },

    isDuplicateForegroundPush(payload = {}) {
      const key = this.getForegroundPushDedupKey(payload);
      if (!key) return false;
      const now = Date.now();
      const lastSeenAt = Number(this.state.foregroundBannerDedup.get(key) || 0);
      this.state.foregroundBannerDedup.set(key, now);
      for (const [entryKey, ts] of this.state.foregroundBannerDedup.entries()) {
        if (now - Number(ts || 0) > FOREGROUND_PUSH_BANNER_DEDUPE_WINDOW_MS) {
          this.state.foregroundBannerDedup.delete(entryKey);
        }
      }
      return now - lastSeenAt < FOREGROUND_PUSH_BANNER_DEDUPE_WINDOW_MS;
    },

    removeForegroundBanner(bannerId = '') {
      const normalizedId = String(bannerId || '').trim();
      if (!normalizedId) return;
      const timer = this.state.foregroundBannerTimers.get(normalizedId);
      if (timer) {
        clearTimeout(timer);
        this.state.foregroundBannerTimers.delete(normalizedId);
      }
      const banner = document.getElementById(normalizedId);
      if (banner?.parentNode) banner.parentNode.removeChild(banner);
    },

    readInAppSoundPreference() {
      try {
        return global.localStorage?.getItem(IN_APP_SOUND_STORAGE_KEY) === 'true';
      } catch (_) {
        return false;
      }
    },

    setInAppSoundPreference(enabled) {
      this.state.inAppSoundEnabled = Boolean(enabled);
      try {
        global.localStorage?.setItem(IN_APP_SOUND_STORAGE_KEY, this.state.inAppSoundEnabled ? 'true' : 'false');
      } catch (_) {
        // Ignore storage errors.
      }
      if (this.els.inAppSoundToggleBtn) {
        this.els.inAppSoundToggleBtn.textContent = this.state.inAppSoundEnabled
          ? 'Disable in-app notification sound'
          : 'Enable in-app notification sound';
        this.els.inAppSoundToggleBtn.setAttribute('aria-pressed', this.state.inAppSoundEnabled ? 'true' : 'false');
      }
    },

    async unlockInAppSound() {
      if (this.state.inAppSoundUnlocked) return true;
      try {
        if (!this.state.inAppSoundAudio) {
          this.state.inAppSoundAudio = new Audio('/assets/notification.mp3');
          this.state.inAppSoundAudio.preload = 'auto';
          this.state.inAppSoundAudio.volume = 0.75;
        }
        const maybePromise = this.state.inAppSoundAudio.play();
        if (maybePromise && typeof maybePromise.then === 'function') {
          await maybePromise;
        }
        this.state.inAppSoundAudio.pause();
        this.state.inAppSoundAudio.currentTime = 0;
        this.state.inAppSoundUnlocked = true;
      } catch (_) {
        this.state.inAppSoundUnlocked = false;
      }
      return this.state.inAppSoundUnlocked;
    },

    playInAppSoundIfEnabled() {
      if (!this.state.inAppSoundEnabled || !this.state.inAppSoundUnlocked) return;
      try {
        if (!this.state.inAppSoundAudio) {
          this.state.inAppSoundAudio = new Audio('/assets/notification.mp3');
          this.state.inAppSoundAudio.preload = 'auto';
          this.state.inAppSoundAudio.volume = 0.75;
        }
        this.state.inAppSoundAudio.currentTime = 0;
        const maybePromise = this.state.inAppSoundAudio.play();
        if (maybePromise && typeof maybePromise.catch === 'function') maybePromise.catch(() => {});
      } catch (_) {
        // Ignore audio playback errors.
      }
    },

    async openPushTarget(payload = {}) {
      const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
      const url = payload?.url || data?.url || '';
      const ticketId = String(data.ticket_id || data.ticketId || payload.ticket_id || '').trim();
      const approvalId = String(data.approval_id || data.workflow_approval_id || payload.approval_id || '').trim();
      const onboardingId = String(data.onboarding_id || data.operations_onboarding_id || payload.onboarding_id || '').trim();

      if (ticketId && global.Notifications?.routeToResourceTarget) {
        await global.Notifications.routeToResourceTarget('issues', ticketId, { meta: data, resource_id: ticketId });
        return;
      }
      if (approvalId && global.Notifications?.routeToResourceTarget) {
        await global.Notifications.routeToResourceTarget('workflow', approvalId, { meta: data, resource_id: approvalId });
        return;
      }
      if (onboardingId && global.Notifications?.routeToResourceTarget) {
        await global.Notifications.routeToResourceTarget('operations_onboarding', onboardingId, { meta: data, resource_id: onboardingId });
        return;
      }
      if (url) {
        global.location.assign(new URL(String(url), global.location.origin).toString());
        return;
      }
      if (typeof global.setActiveView === 'function') global.setActiveView('notifications');
    },

    showForegroundPushBanner(payload = {}) {
      if (this.isDuplicateForegroundPush(payload)) return;
      const container = this.ensureForegroundBannerContainer();
      const title = String(payload?.title || 'InCheck360 MonitorCore').trim() || 'InCheck360 MonitorCore';
      const body = String(payload?.body || 'You have a new notification.').trim();
      const bannerId = `pushBanner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const banner = document.createElement('article');
      banner.id = bannerId;
      banner.className = 'push-foreground-banner';
      banner.innerHTML = `
        <div class="push-foreground-banner__title">${this.escapeHtml(title)}</div>
        <div class="push-foreground-banner__body">${this.escapeHtml(body)}</div>
        <div class="push-foreground-banner__actions">
          <button class="btn ghost sm" type="button" data-banner-dismiss="${this.escapeHtml(bannerId)}">Dismiss</button>
          <button class="btn sm" type="button" data-banner-open="${this.escapeHtml(bannerId)}">Open</button>
        </div>
      `;
      container.prepend(banner);
      const dismissBtn = banner.querySelector(`[data-banner-dismiss="${bannerId}"]`);
      const openBtn = banner.querySelector(`[data-banner-open="${bannerId}"]`);
      dismissBtn?.addEventListener('click', () => this.removeForegroundBanner(bannerId));
      openBtn?.addEventListener('click', async () => {
        this.removeForegroundBanner(bannerId);
        await this.openPushTarget(payload);
      });
      const timer = global.setTimeout(() => this.removeForegroundBanner(bannerId), FOREGROUND_PUSH_BANNER_AUTO_DISMISS_MS);
      this.state.foregroundBannerTimers.set(bannerId, timer);
      this.playInAppSoundIfEnabled();
    },

    async logDiagnostics({ source = 'unknown', registration = null, subscription = null } = {}) {
      if (!this.isDebugEnabled()) return;
      try {
        const resolvedRegistration = registration || (await this.getRegistration());
        const resolvedSubscription =
          subscription || (await resolvedRegistration?.pushManager?.getSubscription?.()) || null;
        const endpoint = String(resolvedSubscription?.endpoint || '').trim();
        const client = global.SupabaseClient?.getClient?.();

        let dbRow = null;
        if (endpoint && client) {
          const { data } = await client
            .from('push_subscriptions')
            .select('endpoint,last_seen_at,saved_at,updated_at,created_at')
            .eq('endpoint', endpoint)
            .order('last_seen_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          dbRow = data || null;
        }

        this.debugLog('diagnostics', {
          source,
          permission: global.Notification?.permission || 'default',
          swController: Boolean(navigator.serviceWorker?.controller),
          hasRegistration: Boolean(resolvedRegistration),
          hasSubscription: Boolean(endpoint),
          subscriptionEndpoint: endpoint || null,
          last_seen_at: dbRow?.last_seen_at || null,
          saved_at: dbRow?.saved_at || dbRow?.updated_at || dbRow?.created_at || null
        });
      } catch (error) {
        this.debugLog('diagnostics failed', error?.message || error);
      }
    },

    handleServiceWorkerMessage(event) {
      const data = event?.data;
      if (!data) return;

      if (data.type === 'INCHECK360_NOTIFICATION_SHOWN') {
        const shownPayload = data.payload || {};
        this.state.lastShowNotificationAt =
          String(shownPayload.timestamp || '').trim() || new Date().toISOString();
        this.debugLog('notification shown by service worker', {
          title: shownPayload.title || 'InCheck360 MonitorCore',
          timestamp: this.state.lastShowNotificationAt
        });
        this.renderDiagnostics({ source: 'serviceWorkerNotificationShown' });
        return;
      }

      if (data.type === 'INCHECK360_PUSH_DIAGNOSTICS') {
        const payload = data.payload || {};
        this.state.lastPushReceivedAt = String(payload.lastPushReceivedAt || '').trim();
        this.state.lastShowNotificationAt = String(payload.lastShowNotificationAt || '').trim();
        this.state.lastShowNotificationError = String(payload.lastShowNotificationError || '').trim();
        this.state.lastPushPayload = payload.lastPushPayload || null;
        this.renderDiagnostics({ source: 'serviceWorkerDiagnosticsMessage' });
        return;
      }

      if (data.type !== 'INCHECK360_PUSH_RECEIVED') return;

      const payload = data.payload || {};
      const title = String(payload.title || 'InCheck360 MonitorCore').trim() || 'InCheck360 MonitorCore';
      const body = String(payload.body || 'You have a new notification.').trim();
      const url = payload.url || payload?.data?.url || '/';

      this.debugLog('foreground push message received', { title, url });
      this.state.lastPushReceivedAt = String(payload.timestamp || '').trim() || this.state.lastPushReceivedAt || new Date().toISOString();
      this.showForegroundPushBanner({ ...payload, title, body, url });
      if (global.Notifications?.upsertForegroundPushPayload) {
        global.Notifications.upsertForegroundPushPayload({ ...payload, title, body, url });
      }
      if (global.Notifications?.refreshUnreadCount) {
        global.Notifications.refreshUnreadCount();
      }
      if (global.Notifications?.fetchPreview) {
        global.Notifications.fetchPreview(true);
      }
      if (global.Notifications?.loadHub && document.getElementById('notificationsView')?.classList.contains('active')) {
        global.Notifications.loadHub(true);
      }
      this.renderDiagnostics({ source: 'serviceWorkerMessage' });
    },

    wireMessageListener() {
      if (this.state.messageListenerWired) return;
      this.state.messageListenerWired = true;
      if (!navigator.serviceWorker?.addEventListener) return;
      navigator.serviceWorker.addEventListener('message', event => {
        this.handleServiceWorkerMessage(event);
      });
    },

    async onAuthStateChanged() {
      this.renderIosHint();
      this.applyNotificationHubPermissions();
      if (!global.Session?.isAuthenticated?.()) {
        this.state.enabled = false;
        this.renderButtonLabel();
        this.setMessage('Log in to manage push notifications on this device.');
        return;
      }
      await this.syncExistingSubscription();
      this.applyNotificationHubPermissions();
      await this.renderDiagnostics({ source: 'onAuthStateChanged' });
    },

    async renderDiagnostics({ source = 'unknown' } = {}) {
      if (!this.els.diagnosticsPanel || !this.els.diagnosticsText) return;
      const canView = this.canViewDiagnostics();
      this.els.diagnosticsPanel.style.display = canView ? '' : 'none';
      if (this.els.activeDevicesPanel) this.els.activeDevicesPanel.style.display = canView ? '' : 'none';
      if (!canView) return;

      try {
        const swSupported = 'serviceWorker' in navigator;
        const pushManagerSupported = 'PushManager' in global;
        const controller = navigator.serviceWorker?.controller || null;
        const registration = swSupported ? await this.getRegistration().catch(() => null) : null;
        const swRegistered = Boolean(registration);
        const subscription = registration?.pushManager ? await registration.pushManager.getSubscription() : null;
        const endpoint = String(subscription?.endpoint || '').trim();
        const rowSaved = await this.getPushDbStatusByEndpoint(endpoint);
        const platformHint = this.isIosSafari()
          ? 'iOS'
          : /android/i.test(String(navigator.userAgent || ''))
            ? 'Android'
            : 'Desktop/Other';
        const browserHint = (() => {
          const ua = String(navigator.userAgent || '');
          if (/Edg\//i.test(ua)) return 'Edge';
          if (/CriOS|Chrome\//i.test(ua)) return 'Chrome';
          if (/FxiOS|Firefox\//i.test(ua)) return 'Firefox';
          if (/Version\/.*Safari\//i.test(ua)) return 'Safari';
          return 'Unknown browser';
        })();
        const latestServerResult = this.state.latestServerTestResult;
        const pwaCheck = this.state.pwaInstallCheck || (await this.runPwaInstallCheck({ source: 'renderDiagnostics' }));
        const serverResultText = latestServerResult
          ? `attempted=${Number(latestServerResult?.attempted || 0)}, sent=${Number(latestServerResult?.sent || 0)}, failed=${Number(latestServerResult?.failed || 0)}`
          : 'not run yet';
        const attempted = Number(latestServerResult?.attempted || 0);
        const sent = Number(latestServerResult?.sent || 0);
        const failed = Number(latestServerResult?.failed || 0);
        const pushReceived = Boolean(this.state.lastPushReceivedAt);
        const showNotificationLogged = Boolean(this.state.lastShowNotificationAt);
        const showNotificationErrored = Boolean(this.state.lastShowNotificationError);
        let interpretation = '';
        if (sent >= 1 && pushReceived && showNotificationLogged && !showNotificationErrored) {
          interpretation = 'Push was received and displayed by the service worker. If no system banner appeared, the OS/browser suppressed the visible banner. Use in-app banner/sound or check OS notification channel.';
        } else if (sent >= 1 && !pushReceived) {
          interpretation = 'Push was accepted by push provider but this device did not receive it. Refresh subscription or reinstall PWA.';
        } else if (attempted >= 1 && failed >= 1) {
          interpretation = 'Push provider rejected this subscription. Refresh subscription.';
        }
        const lines = [
          `Source: ${source}`,
          `Notification.permission: ${global.Notification?.permission || 'default'}`,
          `serviceWorker.controller: ${controller ? 'yes' : 'no'}`,
          `Active service worker URL: ${registration?.active?.scriptURL || '—'}`,
          `Manifest link exists: ${pwaCheck?.manifestLinkExists ? 'yes' : 'no'}`,
          `Manifest fetch status: ${pwaCheck?.manifestStatus || 'not checked'}`,
          `Icon fetch status (192/512/maskable): ${pwaCheck?.icon192Status || 'not checked'} / ${pwaCheck?.icon512Status || 'not checked'} / ${pwaCheck?.maskableStatus || 'not checked'}`,
          `Display mode: ${pwaCheck?.displayMode || this.getDisplayModeLabel()}`,
          `beforeinstallprompt fired: ${pwaCheck?.beforeInstallPromptFired ? 'yes' : 'no'}`,
          `appinstalled fired: ${pwaCheck?.appInstalledFired ? 'yes' : 'no'}`,
          `Current subscription endpoint preview: ${this.getEndpointPreview(endpoint)}`,
          `lastPushReceivedAt: ${this.state.lastPushReceivedAt || '—'}`,
          `lastShowNotificationAt: ${this.state.lastShowNotificationAt || '—'}`,
          `lastShowNotificationError: ${this.state.lastShowNotificationError || '—'}`,
          `Last server push result: ${serverResultText}`,
          `Platform/browser hint: ${platformHint} / ${browserHint}`,
          `Service worker supported: ${swSupported ? 'yes' : 'no'}`,
          `Service worker registered: ${swRegistered ? 'yes' : 'no'}`,
          `pushManager supported: ${pushManagerSupported ? 'yes' : 'no'}`,
          `Current subscription exists: ${subscription ? 'yes' : 'no'}`,
          `push_subscriptions row saved: ${rowSaved ? 'yes' : 'no'}`,
          (!controller && registration?.active)
            ? 'Warning: Your service worker is active, but this page is not currently controlled by it. Close all app tabs/windows and reopen the installed PWA, or click Force service worker update.'
            : '',
          interpretation,
          'Background system banners and sounds are controlled by Android/iOS/browser settings. InCheck360 sends the push and the service worker displays the notification, but the OS may still suppress banners or sounds due to notification channel, focus mode, battery rules, or PWA/browser limitations. In-app banners and sound work while the app is open.',
          'Android note: install from Chrome, open from app icon, use Alerting notification channel, and disable battery optimization for reliable background delivery.',
          'iOS note: requires iOS 16.4+ and launching from installed Home Screen app.'
        ].filter(Boolean);
        this.els.diagnosticsText.textContent = lines.join('\n');
        await this.listActiveDeviceSubscriptions();
      } catch (error) {
        this.els.diagnosticsText.textContent = `Diagnostics unavailable: ${String(error?.message || 'Unknown error')}`;
      }
    },

    async init() {
      if (this.state.initialized) return;
      this.state.initialized = true;
      this.getElements();
      this.applyNotificationHubPermissions();
      this.state.supported = this.isSupported();
      this.setInAppSoundPreference(this.readInAppSoundPreference());
      this.renderIosHint();
      this.wireMessageListener();

      if (!this.els.toggleBtn || !this.els.statusText) return;

      if (!this.state.supported) {
        this.renderButtonLabel();
        this.setMessage('Push notifications are not supported on this browser/device.');
        this.els.toggleBtn.disabled = true;
        if (this.els.refreshSubscriptionBtn) this.els.refreshSubscriptionBtn.disabled = true;
        if (this.els.localTestBtn) this.els.localTestBtn.disabled = true;
        if (this.els.serverTestBtn) this.els.serverTestBtn.disabled = true;
        if (this.els.copyDiagnosticsBtn) this.els.copyDiagnosticsBtn.disabled = true;
        if (this.els.pwaInstallCheckBtn) this.els.pwaInstallCheckBtn.disabled = false;
        return;
      }

      this.els.toggleBtn.disabled = false;
      this.renderButtonLabel();
      this.setInAppSoundPreference(this.state.inAppSoundEnabled);
      await this.onAuthStateChanged();
      setTimeout(() => this.applyNotificationHubPermissions(), 0);
      await this.runPwaInstallCheck({ source: 'init' });
      await this.readServiceWorkerDiagnostics();
      await this.renderDiagnostics({ source: 'init' });
      await this.logDiagnostics({ source: 'init' });
    },

    wire() {
      if (this.state.wired) return;
      this.state.wired = true;
      this.getElements();
      this.applyNotificationHubPermissions();
      if (!this.els.toggleBtn) return;
      this.els.toggleBtn.addEventListener('click', () => {
        this.handleToggleClick();
      });
      this.els.refreshSubscriptionBtn?.addEventListener('click', () => {
        this.registerCurrentDevicePushSubscription({ forceRefresh: true });
      });
      this.els.inAppSoundToggleBtn?.addEventListener('click', async () => {
        if (!this.state.inAppSoundEnabled) {
          await this.unlockInAppSound();
        }
        this.setInAppSoundPreference(!this.state.inAppSoundEnabled);
      });
      this.els.localTestBtn?.addEventListener('click', () => {
        this.testLocalNotification();
      });
      this.els.serverTestBtn?.addEventListener('click', () => {
        this.testServerPush();
      });
      this.els.readDiagnosticsBtn?.addEventListener('click', async () => {
        await this.readServiceWorkerDiagnostics();
        await this.runPwaInstallCheck({ source: 'readServiceWorkerDiagnosticsButton' });
        await this.renderDiagnostics({ source: 'readServiceWorkerDiagnosticsButton' });
      });
      this.els.pwaInstallCheckBtn?.addEventListener('click', async () => {
        await this.runPwaInstallCheck({ source: 'pwaInstallCheckButton' });
        await this.renderDiagnostics({ source: 'pwaInstallCheckButton' });
      });
      this.els.copyDiagnosticsBtn?.addEventListener('click', () => {
        this.copyPushDiagnostics();
      });
      if (!this.state.sessionSubscriptionWired && global.Session?.subscribe) {
        this.state.sessionSubscriptionWired = true;
        global.Session.subscribe(() => {
          setTimeout(() => this.applyNotificationHubPermissions(), 0);
        });
      }
      document.addEventListener('click', event => {
        if (event?.target?.id === 'notificationOpenHubBtn') {
          setTimeout(() => this.applyNotificationHubPermissions(), 0);
        }
      });
      this.els.forceSwUpdateBtn?.addEventListener('click', () => {
        this.forceServiceWorkerUpdate();
      });
      this.els.testAllDevicesBtn?.addEventListener('click', () => {
        this.testAllMyDevices();
      });
      this.els.activeDevicesTbody?.addEventListener('click', event => {
        const button = event.target?.closest?.('[data-push-test-subscription-id]');
        if (!button) return;
        const subscriptionId = String(button.getAttribute('data-push-test-subscription-id') || '').trim();
        if (!subscriptionId) return;
        this.testSingleDevice(subscriptionId);
      });
    }
  };

  global.PushNotifications = PushNotifications;
})(window);
