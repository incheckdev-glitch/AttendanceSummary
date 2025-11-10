// utils.js
// Shared helper utilities for InCheck Pro

/* =========================================================
   Core helpers (U)
   ========================================================= */

const _UBase = {
  q(sel, root = document) {
    return root.querySelector(sel);
  },

  qAll(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  },

  escapeHtml(value) {
    const s = String(value == null ? '' : value);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  escapeAttr(value) {
    // For attributes and URLs
    const s = String(value == null ? '' : value);
    return s
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - Number(n || 0));
    d.setHours(0, 0, 0, 0);
    return d;
  },

  dateAddDays(date, delta) {
    const d = safeDate(date);
    if (!d) return null;
    const copy = new Date(d.getTime());
    copy.setDate(copy.getDate() + Number(delta || 0));
    return copy;
  },

  /**
   * Check if a date is in [from, to).
   * dateVal can be Date or string.
   * from/to can be Date or null.
   */
  isBetween(dateVal, from, to) {
    if (!dateVal) return false;
    const d = dateVal instanceof Date ? dateVal : safeDate(dateVal);
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d >= to) return false;
    return true;
  },

  /**
   * Pretty timestamp: "Jan 3, 14:20"
   */
  fmtTS(val) {
    if (!val) return '';
    const d = val instanceof Date ? val : safeDate(val);
    if (!d) return '';
    try {
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return d.toISOString();
    }
  }
};

// Safety net: if some code calls a missing U.foo(), it becomes a no-op
export const U = new Proxy(_UBase, {
  get(target, prop, receiver) {
    if (prop in target) return Reflect.get(target, prop, receiver);
    // Unknown helpers become a harmless no-op function
    return function noop() {};
  }
});

/* =========================================================
   Dates
   ========================================================= */

/**
 * safeDate: returns a Date or null instead of "Invalid Date".
 */
export function safeDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * For <input type="datetime-local">
 * Returns "YYYY-MM-DDTHH:MM" in local time, or "" if invalid.
 */
export function toLocalInputValue(value) {
  const d = safeDate(value);
  if (!d) return '';
  const pad = n => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

/**
 * For <input type="date">
 * Returns "YYYY-MM-DD" in local time, or "" if invalid.
 */
export function toLocalDateValue(value) {
  const d = safeDate(value);
  if (!d) return '';
  const pad = n => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

/* =========================================================
   Priority helpers
   ========================================================= */

// Normalized numeric priority scale
export const prioMap = {
  // Common labels
  high: 3,
  medium: 2,
  low: 1,
  // Sometimes people use P0 / P1 / P2
  p0: 4,
  p1: 3,
  p2: 2,
  p3: 1
};

/**
 * Gap between two textual priorities like "High" vs "Low".
 * Returns an absolute numeric difference (0 if unknown).
 */
export function prioGap(suggested, actual) {
  if (!suggested || !actual) return 0;
  const norm = v => String(v || '').trim().toLowerCase();
  const sVal = prioMap[norm(suggested)];
  const aVal = prioMap[norm(actual)];
  if (!sVal || !aVal) return 0;
  return Math.abs(sVal - aVal);
}

/* =========================================================
   debounce
   ========================================================= */

export function debounce(fn, wait = 200) {
  let t = null;
  return function debounced(...args) {
    const ctx = this;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn.apply(ctx, args);
    }, wait);
  };
}

/* =========================================================
   Focus trapping for modals
   ========================================================= */

/**
 * trapFocus(container)
 * Keeps keyboard focus inside a modal/dialog while it is open.
 * Fixes the "reading 'shiftKey'" error by using the event argument correctly.
 */
export function trapFocus(container) {
  if (!container) return;

  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  container.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;

    const focusable = Array.from(container.querySelectorAll(focusableSelector))
      .filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));

    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const isShift = !!e.shiftKey;

    if (isShift && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!isShift && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

/* =========================================================
   Modules normalizer
   ========================================================= */

/**
 * normalizeModules(input)
 * Accepts string like "POS, Payments" or an array, and returns
 * a cleaned array of unique module names.
 */
export function normalizeModules(input) {
  if (!input) return [];
  let arr = [];

  if (Array.isArray(input)) {
    arr = input;
  } else if (typeof input === 'string') {
    // split on comma, semicolon, slash
    arr = input.split(/[,;/]/);
  } else {
    arr = [String(input)];
  }

  const seen = new Set();
  const out = [];
  arr.forEach(v => {
    const trimmed = String(v || '').trim();
    if (!trimmed) return;
    if (/^unspecified$/i.test(trimmed)) return;
    if (!seen.has(trimmed.toLowerCase())) {
      seen.add(trimmed.toLowerCase());
      out.push(trimmed);
    }
  });

  return out;
}

/* =========================================================
   UndefaultCount (used by datastore.js)
   ========================================================= */

/**
 * Count items in an array that are not null/undefined/empty/"Unspecified".
 */
export function UndefaultCount(arr) {
  if (!Array.isArray(arr)) return 0;
  let count = 0;
  for (const v of arr) {
    if (
      v !== null &&
      v !== undefined &&
      v !== '' &&
      String(v).trim() !== '' &&
      String(v).trim().toLowerCase() !== 'unspecified'
    ) {
      count++;
    }
  }
  return count;
}
