// utils.js
// =========== UTILITIES MODULE ===========
// Shared functions: theme, debounce, toasts, fragments, spinners, etc.

// ---------- THEME ----------
export function initTheme() {
  const root = document.documentElement;
  const savedTheme = localStorage.getItem('theme') || 'dark';
  root.dataset.theme = savedTheme;
  applyTheme(savedTheme);

  const themeBtn = document.querySelector('#themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', nextTheme);
      applyTheme(nextTheme);
    });
  }
}

function applyTheme(mode) {
  const root = document.documentElement;
  root.dataset.theme = mode;
  showToast(`Switched to ${mode} mode`);
}

// ---------- TOOLBAR ----------
export function initToolbar() {
  const drawerBtn = document.querySelector('#drawerToggle');
  const sidebar = document.querySelector('.sidebar');
  if (drawerBtn && sidebar) {
    drawerBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }

  const accentPicker = document.querySelector('#accentColor');
  if (accentPicker) {
    accentPicker.addEventListener('input', e => {
      document.documentElement.style.setProperty('--accent', e.target.value);
      showToast('Accent color updated');
    });
  }
}

// ---------- DEBOUNCE ----------
export function debounce(fn, delay = 250) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// ---------- DOCUMENT FRAGMENT ----------
export function createFragment() {
  return document.createDocumentFragment();
}

// ---------- TOAST ----------
let toastTimeout;
export function showToast(message, type = 'info', duration = 2500) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.display = 'block';
  toast.style.borderColor = toastColor(type);
  toast.style.color = toastColor(type);

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.style.display = 'none';
  }, duration);
}

function toastColor(type) {
  switch (type) {
    case 'error': return 'var(--danger)';
    case 'warn': return 'var(--warn)';
    case 'success': return 'var(--ok)';
    default: return 'var(--accent)';
  }
}

// ---------- SPINNER ----------
export function showSpinner(show = true) {
  let spinner = document.querySelector('.spinner');
  if (!spinner) {
    spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.innerHTML = '<div class="ring"></div>';
    document.body.appendChild(spinner);
  }

  spinner.style.display = show ? 'flex' : 'none';
}

// ---------- STORAGE HELPERS ----------
export function saveToStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error('Error saving to storage:', err);
  }
}

export function loadFromStorage(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch (err) {
    console.error('Error reading from storage:', err);
    return fallback;
  }
}
