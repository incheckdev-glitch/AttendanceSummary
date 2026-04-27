import webpush from 'npm:web-push@3.6.7';

const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@incheck360.com';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function buildPushPayload(input: Record<string, unknown>) {
  const title = String(input.title || 'InCheck360 MonitorCore').trim() || 'InCheck360 MonitorCore';
  const body = String(input.body || 'You have a new notification.').trim() || 'You have a new notification.';
  const url = String(input.url || '/').trim() || '/';
  const tag = String(input.tag || `incheck360-${Date.now()}`).trim() || `incheck360-${Date.now()}`;
  const data = input.data && typeof input.data === 'object' ? (input.data as Record<string, unknown>) : {};

  return {
    title,
    body,
    url,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag,
    data: {
      ...data,
      url
    }
  };
}

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const subscription = body.subscription as webpush.PushSubscription | undefined;

    if (!subscription?.endpoint) {
      return new Response(JSON.stringify({ error: 'Missing push subscription endpoint' }), { status: 400 });
    }

    const payload = buildPushPayload(body);

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(
        JSON.stringify({
          error: 'VAPID keys are not configured',
          payload
        }),
        { status: 500 }
      );
    }

    await webpush.sendNotification(subscription, JSON.stringify(payload));

    return new Response(JSON.stringify({ ok: true, payload }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String((error as Error)?.message || error || 'Unknown error') }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
});
