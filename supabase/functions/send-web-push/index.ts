import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@incheck360.com';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const adminClient =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
      })
    : null;

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
    const payload = buildPushPayload(body);
    const bodySubscription = body.subscription as webpush.PushSubscription | undefined;
    const targetUserId = String(body.user_id || '').trim();
    const targetSubscriptionId = String(body.subscription_id || '').trim();

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(
        JSON.stringify({
          error: 'VAPID keys are not configured',
          payload
        }),
        { status: 500 }
      );
    }

    let subscriptions: webpush.PushSubscription[] = [];

    if (bodySubscription?.endpoint) {
      subscriptions = [bodySubscription];
    } else {
      if (!adminClient) {
        return new Response(
          JSON.stringify({ error: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
          { status: 500, headers: { 'content-type': 'application/json' } }
        );
      }
      let query = adminClient
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('is_active', true);
      if (targetSubscriptionId) query = query.eq('id', targetSubscriptionId);
      if (targetUserId) query = query.eq('user_id', targetUserId);

      const { data: rows, error: fetchError } = await query.limit(50);
      if (fetchError) throw new Error(fetchError.message || 'Unable to load push subscriptions.');
      subscriptions = (rows || [])
        .map(row => ({
          endpoint: String(row.endpoint || '').trim(),
          keys: {
            p256dh: String(row.p256dh || '').trim(),
            auth: String(row.auth || '').trim()
          }
        }))
        .filter(item => item.endpoint && item.keys.p256dh && item.keys.auth);
    }

    if (!subscriptions.length) {
      return new Response(
        JSON.stringify({ ok: false, attempted: 0, sent: 0, failed: 0, error: 'No active push subscriptions found', payload }),
        { status: 404, headers: { 'content-type': 'application/json' } }
      );
    }

    const results = await Promise.allSettled(
      subscriptions.map(subscription => webpush.sendNotification(subscription, JSON.stringify(payload)))
    );
    const attempted = results.length;
    const sent = results.filter(result => result.status === 'fulfilled').length;
    const failed = attempted - sent;

    return new Response(JSON.stringify({ ok: failed === 0, attempted, sent, failed, payload }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String((error as Error)?.message || error || 'Unknown error') }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
});
