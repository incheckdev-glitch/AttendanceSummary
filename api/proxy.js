const RESOURCE_ALIASES = {
  operations_onboarding: ['operationsOnboarding', 'operations-onboarding']
};

function parseRequestBody(body) {
  if (body && typeof body === 'object') return body;
  try {
    return typeof body === 'string' && body.trim() ? JSON.parse(body) : {};
  } catch {
    return body ?? {};
  }
}

function parseJsonBody(raw) {
  try {
    return {
      data: raw ? JSON.parse(raw) : {},
      parsedJson: true
    };
  } catch {
    return {
      data: null,
      parsedJson: false
    };
  }
}

function needsResourceAliasRetry(resource, responseData) {
  if (!resource || !RESOURCE_ALIASES[resource]) return false;
  if (!responseData || typeof responseData !== 'object') return false;
  const code = String(responseData.code || '').trim();
  const status = String(responseData.status || '').trim().toLowerCase();
  const message = String(responseData.message || responseData.error || '').trim().toLowerCase();
  return (
    code === 'UNHANDLED_ERROR' &&
    (status === 'error' || status === 'failed' || message.includes('handler is not loaded'))
  );
}

async function forwardToUpstream(targetUrl, payload) {
  const upstream = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(payload)
  });
  const raw = await upstream.text();
  const contentType = upstream.headers.get('content-type') || 'unknown';
  const { data, parsedJson } = parseJsonBody(raw);
  return { upstream, raw, contentType, data, parsedJson };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed. Use POST.' });
  }

  // Keep APPS_SCRIPT_WEBAPP_URL pointed to the latest Apps Script Web App /exec deployment URL.
  // This proxy is only used when frontend API_BASE_URL resolves to /api/proxy.
  const targetUrl = String(process.env.APPS_SCRIPT_WEBAPP_URL || '').trim();
  if (!targetUrl) {
    return res.status(500).json({
      ok: false,
      error: 'Server is missing APPS_SCRIPT_WEBAPP_URL.',
      targetUrl
    });
  }

  const payload = parseRequestBody(req.body);
  const resource = String(payload?.resource || '').trim();
  const action = String(payload?.action || '').trim();
  res.setHeader('X-Upstream-Apps-Script', targetUrl);

  console.log('[proxy] forwarding request', {
    targetUrl,
    resource,
    action
  });

  let upstreamResult;
  try {
    upstreamResult = await forwardToUpstream(targetUrl, payload);
  } catch (error) {
    console.error('[proxy] upstream fetch failed', {
      targetUrl,
      resource,
      action,
      error: String(error?.message || error)
    });
    return res.status(502).json({
      ok: false,
      error: 'Failed to reach Apps Script backend',
      upstreamStatus: 502,
      targetUrl,
      details: String(error?.message || error)
    });
  }

  let attemptedAlias = null;
  if (
    upstreamResult.parsedJson &&
    needsResourceAliasRetry(resource, upstreamResult.data)
  ) {
    const aliases = RESOURCE_ALIASES[resource];
    for (const alias of aliases) {
      try {
        const aliasResult = await forwardToUpstream(targetUrl, {
          ...payload,
          resource: alias
        });
        attemptedAlias = alias;
        upstreamResult = aliasResult;
        if (aliasResult.upstream.ok || (aliasResult.parsedJson && !needsResourceAliasRetry(resource, aliasResult.data))) {
          break;
        }
      } catch (error) {
        console.warn('[proxy] alias retry failed', {
          targetUrl,
          originalResource: resource,
          alias,
          action,
          error: String(error?.message || error)
        });
      }
    }
  }

  console.log('[proxy] upstream response', {
    targetUrl,
    resource,
    action,
    upstreamStatus: upstreamResult.upstream.status,
    contentType: upstreamResult.contentType,
    parsedJson: upstreamResult.parsedJson,
    attemptedAlias
  });

  if (!upstreamResult.parsedJson) {
    return res.status(upstreamResult.upstream.status || 502).json({
      ok: false,
      error: 'Apps Script returned invalid JSON',
      upstreamStatus: upstreamResult.upstream.status || 502,
      targetUrl,
      contentType: upstreamResult.contentType,
      upstreamBodySample: String(upstreamResult.raw || '').slice(0, 500),
      resource,
      action,
      attemptedAlias
    });
  }

  return res.status(upstreamResult.upstream.status).json(upstreamResult.data);
}
