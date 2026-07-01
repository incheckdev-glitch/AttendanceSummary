(function installInCheck360PwaAutoUpdateForUsers(global) {
  const UPDATE_INTERVAL_MS = 30 * 60 * 1000;
  const STORAGE_KEY = 'INCHECK360_PWA_LAST_AUTO_SW_UPDATE_AT';

  function shouldRunNow() {
    try {
      const last = Number(global.localStorage?.getItem(STORAGE_KEY) || 0);
      return !last || Date.now() - last > UPDATE_INTERVAL_MS;
    } catch (_) {
      return true;
    }
  }

  function markRun() {
    try {
      global.localStorage?.setItem(STORAGE_KEY, String(Date.now()));
    } catch (_) {}
  }

  async function updateRegistration(registration) {
    if (!registration) return false;
    try {
      await registration.update();
    } catch (_) {}

    try {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch (_) {}

    return true;
  }

  async function autoUpdateServiceWorker({ force = false } = {}) {
    if (!('serviceWorker' in navigator)) return false;
    if (!force && !shouldRunNow()) return false;

    markRun();

    let didUpdate = false;
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations || []) {
        didUpdate = (await updateRegistration(registration)) || didUpdate;
      }
    } catch (_) {}

    try {
      const ready = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise(resolve => setTimeout(() => resolve(null), 5000))
      ]);
      didUpdate = (await updateRegistration(ready)) || didUpdate;
    } catch (_) {}

    return didUpdate;
  }

  global.InCheck360PwaAutoUpdate = {
    autoUpdateServiceWorker,
    forceUpdate: () => autoUpdateServiceWorker({ force: true })
  };

  function scheduleAutoUpdate() {
    global.setTimeout(() => {
      autoUpdateServiceWorker().catch(() => {});
    }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleAutoUpdate, { once: true });
  } else {
    scheduleAutoUpdate();
  }

  global.addEventListener?.('online', scheduleAutoUpdate);
})(window);
