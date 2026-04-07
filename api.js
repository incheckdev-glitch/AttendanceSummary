const Api = {
  ensureBaseUrl() {
    const resolved = resolveApiEndpoint(API_BASE_URL);
    if (!resolved) {
      throw new Error('API_BASE_URL is not configured.');
    }
    return resolved;
  },
  buildUrl(resource = '', params = {}) {
    const endpoint = this.ensureBaseUrl();
    const url = new URL(endpoint);
    if (resource) url.searchParams.set('resource', String(resource));
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
    return url.toString();
  },
  async get(resource, params = {}) {
    const endpoint = this.buildUrl(resource, params);
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'GET',
        cache: 'no-store'
      });
    } catch (error) {
      throw buildNetworkRequestError(endpoint, error);
    }
    const rawText = await response.text();
    const data = parseApiJson(rawText, `Backend ${resource || 'api'}`);
    if (!response.ok) {
      throw buildHttpResponseError(response, data, endpoint);
    }
    if (data && typeof data === 'object' && hasExplicitBackendFailure(data)) {
      throw new Error(data.error || data.message || 'Backend rejected request.');
    }
    if (data && typeof data === 'object' && 'data' in data && data.data !== undefined) {
      return data.data;
    }
    return data;
  },
  async post(resource, action, payload = {}) {
    return apiPost({
      resource,
      action,
      ...payload
    });
  },
  async postAuthenticated(resource, action, payload = {}, options = {}) {
    const requireAuth = options?.requireAuth !== false;
    const authToken =
      typeof Session?.getAuthToken === 'function'
        ? Session.getAuthToken()
        : String(Session?.authContext?.().authToken || '');
    if (requireAuth && !authToken) {
      throw new Error('Missing authentication token.');
    }
    return this.post(resource, action, {
      ...payload,
      authToken: authToken || ''
    });
  }
};

async function apiPost(payload = {}) {
  const endpoint = Api.ensureBaseUrl();
  const requestBody = payload && typeof payload === 'object' ? payload : {};
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
  } catch (error) {
    throw buildNetworkRequestError(endpoint, error);
  }

  const rawText = await response.text();
  const data = parseApiJson(rawText, `Backend ${requestBody.resource || 'api'}`);
  if (!response.ok) {
    throw buildHttpResponseError(response, data, endpoint);
  }
  if (data && typeof data === 'object' && hasExplicitBackendFailure(data)) {
    throw new Error(data.error || data.message || 'Backend rejected request.');
  }
  if (data && typeof data === 'object' && 'data' in data && data.data !== undefined) {
    return data.data;
  }
  return data;
}

function buildNetworkRequestError(url, originalError) {
  const rawMessage = String(originalError?.message || '').trim();
  const looksLikeCorsFailure =
    /failed to fetch|networkerror|load failed|err_failed/i.test(rawMessage);
  if (looksLikeCorsFailure) {
    return new Error(
        `Request to ${url} failed before a response was received. ` +
        'This is commonly caused by CORS (missing Access-Control-Allow-Origin) ' +
        'or an unreachable backend/proxy endpoint.'
    );
  }
  return new Error(rawMessage || `Network error while contacting ${url}.`);
}

function hasExplicitBackendFailure(data) {
  const normalizeBool = value => {
    if (typeof value === 'boolean') return value;
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    return null;
  };
  const ok = normalizeBool(data?.ok);
  const success = normalizeBool(data?.success);
  return ok === false || success === false;
}

function buildHttpResponseError(response, data, endpoint) {
  const backendMessage = String(data?.error || data?.message || '').trim();
  if (backendMessage) return new Error(backendMessage);

  const status = Number(response?.status || 0);
  const statusText = String(response?.statusText || '').trim();
  const endpointLabel = String(endpoint || API_BASE_URL || 'backend endpoint');

  if (status === 404) {
    return new Error(
      `HTTP 404 from ${endpointLabel}. Login/auth routes were not found on the configured backend. ` +
      'Verify API_BASE_URL points to a backend/proxy that implements auth.'
    );
  }

  return new Error(
    `HTTP ${status || 'error'}${statusText ? ` ${statusText}` : ''} from ${endpointLabel}.`
  );
}
