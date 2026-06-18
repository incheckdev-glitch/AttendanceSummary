import { createClient } from '@supabase/supabase-js';
import { processNotificationDeliveryQueue } from '../notification-delivery-worker.js';

const ADMIN_ROLES = new Set(['admin', 'administrator', 'super_admin']);

function normalizeRole(value = '') {
  return String(value || '').trim().toLowerCase();
}

function extractBearerToken(req) {
  return String(req.headers?.authorization || req.headers?.Authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
}

async function getCallerProfile(supabaseAdmin, user) {
  if (!user?.id && !user?.email) return null;
  const filters = [];
  if (user.id) filters.push(`id.eq.${user.id}`);
  if (user.email) filters.push(`email.eq.${user.email}`);
  if (!filters.length) return null;

  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id,email,role,role_key,user_role,app_role')
    .or(filters.join(','))
    .maybeSingle();
  return data || null;
}

function getCallerRole(profile, user) {
  return normalizeRole(
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

async function authorize(req, supabaseAdmin) {
  const configuredSecret = String(process.env.NOTIFICATION_QUEUE_WORKER_SECRET || process.env.CRON_SECRET || '').trim();
  const providedSecret = String(req.headers?.['x-worker-secret'] || req.headers?.['x-cron-secret'] || req.query?.secret || '').trim();
  if (configuredSecret && providedSecret && providedSecret === configuredSecret) return { type: 'secret' };

  const token = extractBearerToken(req);
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  const profile = await getCallerProfile(supabaseAdmin, data.user);
  const role = getCallerRole(profile, data.user);
  if (!ADMIN_ROLES.has(role)) return null;
  return { type: 'user', userId: data.user.id, role };
}

export default async function handler(req, res) {
  if (!['POST', 'GET'].includes(req.method)) {
    res.setHeader('Allow', 'POST, GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ ok: false, error: 'Server is missing Supabase admin configuration.' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const authorized = await authorize(req, supabaseAdmin);
  if (!authorized) return res.status(401).json({ ok: false, error: 'Unauthorized notification queue worker request.' });

  try {
    const result = await processNotificationDeliveryQueue({ supabaseAdmin });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}
