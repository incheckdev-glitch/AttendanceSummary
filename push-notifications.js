(function initPushNotifications(global) {
  const PushNotifications = {
    state: {
      supported: false,
      enabled: false,
      busy: false,
      permission: 'default',
      message: '',
      initialized: false,
      wired: false
    },

    els: {
      toggleBtn: null,
      statusText: null,
      iosHint: null
    },

    getVapidPublicKey() {
      return String(
        global.RUNTIME_CONFIG?.PUSH_VAPID_PUBLIC_KEY ||
          global.RUNTIME_CONFIG?.VAPID_PUBLIC_KEY ||
          global.CONFIG?.PUSH_VAPID_PUBLIC_KEY ||
          global.CONFIG?.VAPID_PUBLIC_KEY ||
          ''
      ).trim();
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
    },

    setMessage(message = '') {
      this.state.message = String(message || '').trim();
      if (this.els.statusText) this.els.statusText.textContent = this.state.message;
    },

    setBusy(isBusy) {
      this.state.busy = Boolean(isBusy);
      if (!this.els.toggleBtn) return;
      this.els.toggleBtn.disabled = this.state.busy || !this.state.supported;
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
        this.updatePermissionState();
        if (subscription) {
          await this.upsertSubscription(subscription, { isActive: true });
          this.state.enabled = true;
          this.renderButtonLabel();
          if (!silent) this.setMessage('Push notifications enabled on this device.');
          return true;
        }
        this.state.enabled = false;
        this.renderButtonLabel();
        if (!silent) {
          if (this.state.permission === 'denied') {
            this.setMessage('Notifications are blocked in browser settings.');
          } else {
            this.setMessage('Push notifications are not enabled on this device.');
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
      if (!vapidPublicKey) {
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
            applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey)
          });
        }

        await this.upsertSubscription(subscription, { isActive: true });
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
        this.state.enabled = false;
        this.setMessage('Push notifications disabled on this device.');
      } catch (error) {
        console.warn('[push] Disable failed', error);
        this.setMessage(`Unable to disable push notifications: ${String(error?.message || 'Unknown error')}`);
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

    async onAuthStateChanged() {
      this.renderIosHint();
      if (!global.Session?.isAuthenticated?.()) {
        this.state.enabled = false;
        this.renderButtonLabel();
        this.setMessage('Log in to manage push notifications on this device.');
        return;
      }
      await this.syncExistingSubscription();
    },

    async init() {
      if (this.state.initialized) return;
      this.state.initialized = true;
      this.getElements();
      this.state.supported = this.isSupported();
      this.renderIosHint();

      if (!this.els.toggleBtn || !this.els.statusText) return;

      if (!this.state.supported) {
        this.renderButtonLabel();
        this.setMessage('Push notifications are not supported on this browser/device.');
        this.els.toggleBtn.disabled = true;
        return;
      }

      this.els.toggleBtn.disabled = false;
      this.renderButtonLabel();
      await this.onAuthStateChanged();
    },

    wire() {
      if (this.state.wired) return;
      this.state.wired = true;
      this.getElements();
      if (!this.els.toggleBtn) return;
      this.els.toggleBtn.addEventListener('click', () => {
        this.handleToggleClick();
      });
    }
  };

  global.PushNotifications = PushNotifications;
})(window);
