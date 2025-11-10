// utils.js

/* =========================================================
   DOM helpers, dates, formatting, encoding
   ========================================================= */

const pad2 = n => String(n).padStart(2, '0');

function isLocalDateTimeString(s) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s);
}
function isLocalDateString(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parseLocalDateTime(s) {
  // "YYYY-MM-DDTHH:MM" (no timezone) -> Date in local time
  const [d, t] = s.split('T');
  const [yy, mm, dd] = d.split('-').map(Number);
  const [hh, mi] = t.split(':').map(Number);
  return new Date(yy, mm - 1, dd, hh, mi, 0, 0);
}

function parseLocalDate(s) {
  // "YYYY-MM-DD" (no timezone) -> Date in local time 00:00
  const [yy, mm, dd] = s.split('-').map(Number);
  return new Date(yy, mm - 1, dd, 0, 0, 0, 0);
}

/** Safely turn many date-like inputs into a Date (or null if invalid). */
export function safeDate(v) {
  if (!v) return null;
  if (v instanceof Date) {
    const d = new Date(v.getTime());
    return isNaN(d) ? null : d;
  }
  const s = String(v).trim();
  try {
    if (isLocalDateTimeString(s)) return parseLocalDateTime(s);
    if (isLocalDateString(s)) return parseLocalDate(s);
    const d = new Date(s);
    return isNaN(d) ? null : d;
  } catch {
    return null;
  }
}

/** Add days to a date (doesn't mutate input). */
function dateAddDays(date, days) {
  const d0 = date instanceof Date ? date : safeDate(date) || new Date();
  const d = new Date(d0.getTime());
  d.setDate(d.getDate() + (days || 0));
  return d;
}

/** Returns a Date for N days ago from now. */
function daysAgo(n) {
  return dateAddDays(new Date(), -Math.max(0, Number(n) || 0));
}

/** Check if date is between [after, before). Nulls mean open-ended. */
function isBetween(d, after, before) {
  const x = safeDate(d);
  if (!x) return false;
  const a = after ? safeDate(after) : null;
  const b = before ? safeDate(before) : null;
  if (a && x < a) return false;
  if (b && x >= b) return false;
  return true;
}

/** Format timestamp for small status labels. */
function fmtTS(d) {
  const x = safeDate(d);
  if (!x) return '';
  try {
    return x.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    // Fallback "YYYY-MM-DD HH:MM"
    return (
      `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())} ` +
      `${pad2(x.getHours())}:${pad2(x.getMinutes())}`
    );
  }
}

/** Convert a date into an <input type="datetime-local"> value (local time). */
export function toLocalInputValue(d) {
  const x = safeDate(d);
  if (!x) return '';
  return (
    `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}` +
    `T${pad2(x.getHours())}:${pad2(x.getMinutes())}`
  );
}

/** Convert a date into an <input type="date"> value (YYYY-MM-DD). */
export function toLocalDateValue(d) {
  const x = safeDate(d);
  if (!x) return '';
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}

/** Simple debounce helper. */
export function debounce(fn, wait = 200) {
  let t = null;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

/** Trap focus inside a container (fixed to use the event arg). */
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
    if (e.key !== 'Tab') return;

    const focusable = getFocusable();
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      // backwards
      if (active === first || !container.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // forwards
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  container.addEventListener('keydown', handleKeydown);
}

/** Escape HTML entities for safe innerHTML text nodes. */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape for attributes (safe for href, data-*, etc.). */
function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, '&#96;');
}

/** Shortcuts for DOM querying. */
function q(sel, root = document) {
  return root.querySelector(sel);
}
function qAll(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

/* =========================================================
   Priorities & comparison helpers
   ========================================================= */

export const prioMap = {
  // canonical
  High: 3,
  Medium: 2,
  Low: 1,
  // shorthands / synonyms
  H: 3, M: 2, L: 1,
  P0: 3, P1: 3, // treat P0/P1 as High for gap purposes
  P2: 2, P3: 1,
  Critical: 3,
  Major: 2,
  Minor: 1
};

function prioScore(x) {
  if (!x) return null;
  const k = String(x).trim();
  // Try exact
  if (prioMap.hasOwnProperty(k)) return prioMap[k];
  // Try case-insensitive canonical
  const cap = k[0].toUpperCase() + k.slice(1).toLowerCase();
  if (prioMap.hasOwnProperty(cap)) return prioMap[cap];
  // Try first letter H/M/L
  const first = k[0]?.toUpperCase();
  if (first === 'H') return 3;
  if (first === 'M') return 2;
  if (first === 'L') return 1;
  return null;
}

/** Absolute priority gap (0..2). Missing values return 0. */
export function prioGap(a, b) {
  const pa = prioScore(a);
  const pb = prioScore(b);
  if (pa == null || pb == null) return 0;
  return Math.abs(pa - pb);
}

/* =========================================================
   Modules normalization
   ========================================================= */

/**
 * Normalize "modules" input to a clean, unique array.
 * Accepts a string with separators (",", ";", "/", "|") or an array.
 */
export function normalizeModules(mods) {
  if (!mods) return [];
  let arr = [];
  if (Array.isArray(mods)) {
    arr = mods;
  } else if (typeof mods === 'string') {
    arr = mods
      .split(/[,\|/;]+/g)   // split on common separators
      .map(s => s.replace(/\s+/g, ' ').trim());
  } else {
    arr = [String(mods)];
  }
  const uniq = Array.from(
    new Set(
      arr
        .map(s => s.trim())
        .filter(Boolean)
    )
  );
  return uniq;
}

/* =========================================================
   Public util bundle (legacy-style access used in app.js)
   ========================================================= */

export const U = {
  q,
  qAll,
  escapeHtml,
  escapeAttr,
  daysAgo,
  dateAddDays,
  isBetween,
  fmtTS
};
