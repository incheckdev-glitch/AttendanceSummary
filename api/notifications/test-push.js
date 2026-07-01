import { createClient } from '@supabase/supabase-js';
import { loadActiveSubscriptions, loadSubscriptionsByIds, sendWebPushToSubscriptions } from '../notification-delivery-worker.js';

const ADMIN_ROLES = new Set(['admin', 'administrator', 'super_admin', 'dev']);

function text(value = '') {
  return String(value ?? '').trim();
}

function lower(value = '') {
  return text(value).toLowerCase();
}

function extractBearerToken(req) {
  return text(req.headers?.authorization || req.headers?.Authorization)
    .replace(/^Bearer\s+/i, '')
    .trim();
}

function getCallerRole(profile, user) {
  return lower(
    profile?.role_key ||
      profile?.role ||
      profile?.user_role ||
      profile?.app_role ||
      user?.user_metadata?.role_key ||
      user?.user_metadata?.role ||
      user?.app_metadata?.role_key ||
      user?.app_metadata?.role
  );
}

async function loadProfileByColumn(supabaseAdmin, column, value) {
  const normalized = text(value);
  if (!normalized) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq(column, normalized)
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

async function getCallerProfile(supabaseAdmin, user) {
  if (!user?.id && !user?.email) return null;

  const byId = await loadProfileByColumn(supabaseAdmin, 'id', user.id);
  if (byId) return byId;

  const byEmail = await loadProfileByColumn(supabaseAdmin, 'email', user.email);
  if (byEmail) return byEmail;

  return null;
}

async function authorize(req, supabaseAdmin) {
  const configuredSecret = text(process.env.NOTIFICATION_QUEUE_WORKER_SECRET || process.env.CRON_SECRET);
  const providedSecret = text(req.headers?.['x-worker-secret'] || req.headers?.['x-cron-secret'] || req.query?.secret);
  if (configuredSecret && providedSecret && providedSecret === configuredSecret) return { ok: true, type: 'secret' };

  const token = extractBearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'Missing authorization.' };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401, error: 'Invalid authorization.' };

  const profile = await getCallerProfile(supabaseAdmin, data.user);
  const role = getCallerRole(profile, data.user);
  return { ok: true, type: 'user', userId: data.user.id, role, isAdmin: ADMIN_ROLES.has(role) };
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(String(req.body)); } catch { return {}; }
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return String(value).split(',').map(text).filter(Boolean);
}

function subscriptionBelongsToUser(subscription = {}, userId = '') {
  const id = text(userId);
  if (!id) return false;
  return ['user_id', 'recipient_user_id', 'auth_user_id', 'profile_id'].some(column => text(subscription?.[column]) === id);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ ok: false, error: 'Server is missing Supabase admin configuration.' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const auth = await authorize(req, supabaseAdmin).catch(error => ({ ok: false, status: 401, error: text(error?.message || error) || 'Unauthorized.' }));
  if (!auth?.ok) return res.status(auth?.status || 401).json({ ok: false, error: auth?.error || 'Unauthorized.' });

  const body = getBody(req);
  const subscriptionIds = normalizeList(body.subscription_ids || body.subscriptionIds);
  const userIds = normalizeList(body.user_ids || body.userIds || body.user_id || body.userId);

  try {
    let subscriptions = [];
    if (subscriptionIds.length) {
      subscriptions = await loadSubscriptionsByIds(supabaseAdmin, subscriptionIds);
      if (auth.type === 'user' && !auth.isAdmin) {
        const ownSubscriptions = subscriptions.filter(subscription => subscriptionBelongsToUser(subscription, auth.userId));
        if (ownSubscriptions.length !== subscriptions.length) {
          return res.status(403).json({ ok: false, error: 'Cannot test another user/device.' });
        }
        subscriptions = ownSubscriptions;
      }
    }

    const targetUserIds = auth.type === 'user' && !auth.isAdmin
      ? [auth.userId]
      : userIds;

    if (!subscriptions.length && targetUserIds.length) {
      const groups = await Promise.all(targetUserIds.map(userId => loadActiveSubscriptions(supabaseAdmin, userId)));
      subscriptions = groups.flat();
    }

    const result = await sendWebPushToSubscriptions({
      supabase: supabaseAdmin,
      subscriptions,
      payload: {
        title: text(body.title) || 'InCheck360 Server Test',
        body: text(body.body) || 'Server push is working.',
        url: text(body.url) || '/?pushTest=1',
        deep_link: text(body.url) || '/?pushTest=1',
        tag: text(body.tag) || 'server-test-push',
        data: body.data && typeof body.data === 'object' ? body.data : { test: true }
      }
    });

    return res.status(200).json({ ok: true, subscriptions: subscriptions.length, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: text(error?.message || error) || 'Server push test failed.' });
  }
}
