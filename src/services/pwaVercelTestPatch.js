(function installInCheck360PwaVercelTestPatch(global) {
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

  function patch(attempt = 0) {
    const push = global.PushNotifications;
    if (!push) {
      if (attempt < 120) global.setTimeout(() => patch(attempt + 1), 250);
      return;
    }
    if (push.__incheck360PwaVercelDevicePatch) return;
    push.__incheck360PwaVercelDevicePatch = true;

    push.testSingleDevice = async function patchedTestSingleDevice(subscriptionId = '') {
      if (!this.requireNotificationAdmin?.()) return;
      const id = String(subscriptionId || '').trim();
      if (!id) return;
      this.setBusy?.(true);
      try {
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
  }

  patch();
  global.addEventListener?.('DOMContentLoaded', () => patch());
  global.addEventListener?.('load', () => patch());
})(window);
