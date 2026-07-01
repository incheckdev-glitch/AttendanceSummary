(function installInCheck360DarkModeSafetyPatch() {
  const id = 'incheck360-dark-mode-safety-css';
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = '/dark-mode-safety.css?v=20260701-clear-dark2';
  document.head.appendChild(link);
})();
