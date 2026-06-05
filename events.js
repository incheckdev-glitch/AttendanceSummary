(function initEventHelpers(global) {
  function isCancelledEvent(event) {
    const status = String(event?.status || event?.event_status || '').trim().toLowerCase();
    return status === 'cancelled' || status === 'canceled';
  }

  global.isCancelledEvent = isCancelledEvent;
})(typeof window !== 'undefined' ? window : globalThis);
