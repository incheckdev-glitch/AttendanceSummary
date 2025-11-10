// utils.js

export function trapFocus(container) {
  if (!container) return;

  const selectors =
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

  const getFocusable = () =>
    Array.from(container.querySelectorAll(selectors)).filter(el => {
      if (el.disabled) return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;
      return true;
    });

  const handleKeydown = (e) => {
    // ❗ Use the event argument `e`, not global `event`
    if (e.key !== 'Tab') return;

    const focusable = getFocusable();
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      // Shift+Tab: go backwards
      if (active === first || !container.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab: go forwards
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  container.addEventListener('keydown', handleKeydown);
}
