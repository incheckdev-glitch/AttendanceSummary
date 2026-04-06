/**
 * Runtime frontend configuration.
 * Set API_BASE_URL to your backend/proxy endpoint (NOT GitHub Pages URL).
 *
 * IMPORTANT: keep this as a same-origin relative path for Vercel deployments
 * so previews/custom domains do not trigger cross-origin login requests.
 */
window.RUNTIME_CONFIG = {
  API_BASE_URL: '/api/proxy'
};
