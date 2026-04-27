(function initPushNotifications(global) {
  const WEB_PUSH_FUNCTION_NAME = 'send-web-push-v2';
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
      latestServerTestResult: null
    },

    els: {
      toggleBtn: null,
      statusText: null,
      iosHint: null,
      refreshSubscriptionBtn: null,
      localTestBtn: null,
      serverTestBtn: null,
      serverTestResult: null,
      readDiagnosticsBtn: null,
      forceSwUpdateBtn: null,
      diagnosticsPanel: null,
      diagnosticsText: null
    },

    normalizeKey(value) {
      return typeof value === 'string' ? value.trim() : '';
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
      this.els.localTestBtn = document.getElementById('pushLocalTestBtn');
      this.els.serverTestBtn = document.getElementById('pushServerTestBtn');
      this.els.serverTestResult = document.getElementById('pushServerTestResult');
      this.els.readDiagnosticsBtn = document.getElementById('pushReadDiagnosticsBtn');
      this.els.copyDiagnosticsBtn = document.getElementById('pushCopyDiagnosticsBtn');
      this.els.forceSwUpdateBtn = document.getElementById('pushForceSwUpdateBtn');
      this.els.diagnosticsPanel = document.getElementById('pushDiagnosticsPanel');
      this.els.diagnosticsText = document.getElementById('pushDiagnosticsText');
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
      if (this.els.localTestBtn) this.els.localTestBtn.disabled = this.state.busy || !this.state.supported;
      if (this.els.serverTestBtn) this.els.serverTestBtn.disabled = this.state.busy || !this.state.supported;
      if (this.els.readDiagnosticsBtn) this.els.readDiagnosticsBtn.disabled = this.state.busy || !this.state.supported;
      if (this.els.copyDiagnosticsBtn) this.els.copyDiagnosticsBtn.disabled = this.state.busy || !this.state.supported;
      if (this.els.forceSwUpdateBtn) this.els.forceSwUpdateBtn.disabled = this.state.busy || !this.state.supported;
      this.els.toggleBtn.setAttribute('aria-busy', this.state.busy ? 'true' : 'false');
      this.renderButtonLabel();
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
      const role = String(global.Session?.role?.() || '').trim().toLowerCase();
      return role === 'admin' || role === 'dev';
    },

    getEndpointPreview(endpoint = '') {
      const value = String(endpoint || '').trim();
      if (!value) return '—';
      if (value.length <= 26) return value;
      return `${value.slice(0, 12)}…${value.slice(-12)}`;
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
        p256dh: p256dh ? global.btoa(String.fromCharCode(...new Uint8Array(p256dh))) : null,
        auth: auth ? global.btoa(String.fromCharCode(...new Uint8Array(auth))) : null,
        user_agent: String(navigator.userAgent || '').trim() || null,
        device_label: String(navigator.platform || navigator.userAgent || '').trim() || null,
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
        this.setMessage('Push subscription refreshed successfully.');
        await this.renderDiagnostics({ source: 'refreshPushSubscription' });
      } catch (error) {
        this.setMessage(`Unable to refresh subscription: ${String(error?.message || 'Unknown error')}`);
      } finally {
        if (!skipBusyState) this.setBusy(false);
      }
    },

    async testLocalNotification() {
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

    async handleToggleClick() {
      if (this.state.busy) return;
      if (this.state.enabled) {
        await this.disablePush();
        return;
      }
      await this.enablePush();
    },

    async readServiceWorkerDiagnostics() {
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
      let container = document.getElementById('pushForegroundBanner');
      if (container) return container;
      container = document.createElement('div');
      container.id = 'pushForegroundBanner';
      container.style.cssText = [
        'position:fixed',
        'right:12px',
        'bottom:12px',
        'z-index:3000',
        'max-width:min(92vw,360px)',
        'padding:12px',
        'border-radius:12px',
        'border:1px solid var(--line)',
        'background:var(--card)',
        'box-shadow:0 6px 20px rgba(0,0,0,0.25)',
        'display:none'
      ].join(';');
      document.body.appendChild(container);
      return container;
    },

    showForegroundBanner({ title = 'Notification', body = '', url = '/' } = {}) {
      const container = this.ensureForegroundBannerContainer();
      const absoluteUrl = new URL(String(url || '/'), global.location.origin).toString();
      container.innerHTML = `
        <div style="font-weight:700;margin-bottom:4px;">${this.escapeHtml(title || 'Notification')}</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:10px;">${this.escapeHtml(body || '')}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="pushBannerDismissBtn" class="btn ghost sm" type="button">Dismiss</button>
          <button id="pushBannerOpenBtn" class="btn sm" type="button">Open</button>
        </div>
      `;
      container.style.display = 'block';

      const dismissBtn = document.getElementById('pushBannerDismissBtn');
      const openBtn = document.getElementById('pushBannerOpenBtn');

      if (dismissBtn) {
        dismissBtn.onclick = () => {
          container.style.display = 'none';
        };
      }

      if (openBtn) {
        openBtn.onclick = () => {
          container.style.display = 'none';
          global.location.assign(absoluteUrl);
        };
      }

      global.setTimeout(() => {
        if (container) container.style.display = 'none';
      }, 9000);
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
      this.showForegroundBanner({ title, body, url });
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
      if (!global.Session?.isAuthenticated?.()) {
        this.state.enabled = false;
        this.renderButtonLabel();
        this.setMessage('Log in to manage push notifications on this device.');
        return;
      }
      await this.syncExistingSubscription();
      await this.renderDiagnostics({ source: 'onAuthStateChanged' });
    },

    async renderDiagnostics({ source = 'unknown' } = {}) {
      if (!this.els.diagnosticsPanel || !this.els.diagnosticsText) return;
      const canView = this.canViewDiagnostics();
      this.els.diagnosticsPanel.style.display = canView ? '' : 'none';
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
        const serverResultText = latestServerResult
          ? `attempted=${Number(latestServerResult?.attempted || 0)}, sent=${Number(latestServerResult?.sent || 0)}, failed=${Number(latestServerResult?.failed || 0)}`
          : 'not run yet';
        const lines = [
          `Source: ${source}`,
          `Notification.permission: ${global.Notification?.permission || 'default'}`,
          `serviceWorker.controller: ${controller ? 'yes' : 'no'}`,
          `Active service worker URL: ${registration?.active?.scriptURL || '—'}`,
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
          'If server push returns sent=1 but lastPushReceivedAt stays empty after reopening mobile, the mobile OS/browser did not deliver the background push to the service worker. Reinstall the PWA and check OS notification settings.',
          'iOS push note: requires iOS 16.4+ and launching from installed Home Screen app.'
        ].filter(Boolean);
        this.els.diagnosticsText.textContent = lines.join('\n');
      } catch (error) {
        this.els.diagnosticsText.textContent = `Diagnostics unavailable: ${String(error?.message || 'Unknown error')}`;
      }
    },

    async init() {
      if (this.state.initialized) return;
      this.state.initialized = true;
      this.getElements();
      this.state.supported = this.isSupported();
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
        return;
      }

      this.els.toggleBtn.disabled = false;
      this.renderButtonLabel();
      await this.onAuthStateChanged();
      await this.readServiceWorkerDiagnostics();
      await this.renderDiagnostics({ source: 'init' });
      await this.logDiagnostics({ source: 'init' });
    },

    wire() {
      if (this.state.wired) return;
      this.state.wired = true;
      this.getElements();
      if (!this.els.toggleBtn) return;
      this.els.toggleBtn.addEventListener('click', () => {
        this.handleToggleClick();
      });
      this.els.refreshSubscriptionBtn?.addEventListener('click', () => {
        this.refreshPushSubscription();
      });
      this.els.localTestBtn?.addEventListener('click', () => {
        this.testLocalNotification();
      });
      this.els.serverTestBtn?.addEventListener('click', () => {
        this.testServerPush();
      });
      this.els.readDiagnosticsBtn?.addEventListener('click', async () => {
        await this.readServiceWorkerDiagnostics();
        await this.renderDiagnostics({ source: 'readServiceWorkerDiagnosticsButton' });
      });
      this.els.copyDiagnosticsBtn?.addEventListener('click', () => {
        this.copyPushDiagnostics();
      });
      this.els.forceSwUpdateBtn?.addEventListener('click', () => {
        this.forceServiceWorkerUpdate();
      });
    }
  };

  global.PushNotifications = PushNotifications;
})(window);
