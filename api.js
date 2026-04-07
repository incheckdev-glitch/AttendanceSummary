const Api = {
  async get(resource, params = {}) {
    return this.post(resource, 'list', params || {});
  },

  async post(resource, action, payload = {}) {
    if (typeof window.apiRequest !== 'function') {
      throw new Error('apiRequest is not available. Ensure legacyApi.js is loaded.');
    }

    const response = await window.apiRequest({
      resource,
      action,
      ...(payload && typeof payload === 'object' ? payload : {})
    });

    if (!response || response.ok === false) {
      throw new Error(response?.error || 'API request failed.');
    }

    if (response.data !== undefined) return response.data;
    if (response.events !== undefined) return response.events;
    return response;
  },

  async postAuthenticated(resource, action, payload = {}, options = {}) {
    const requireAuth = options?.requireAuth !== false;
    const role = typeof Session?.role === 'function' ? Session.role() : null;
    if (requireAuth && !role) {
      throw new Error('Missing authentication session.');
    }

    return this.post(resource, action, payload);
  }
};
