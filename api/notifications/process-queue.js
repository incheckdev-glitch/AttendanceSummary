import { createClient } from '@supabase/supabase-js';
import { processNotificationDeliveryQueue } from '../notification-delivery-worker.js';

function text(value = '') {
  return String(value ?? '').trim();
}

function extractBearerToken(req) {
  return text(req.headers?.authorization || req.headers?.Authorization)
    .replace(/^Bearer\s+/i, '')
    .trim();
}

async function authorize(req, supabaseAdmin) {
  const configuredSecret = text(process.env.NOTIFICATION_QUEUE_WORKER_SECRET || process.env.CRON_SECRET);
  const providedSecret = text(req.headers?.['x-worker-secret'] || req.headers?.['x-cron-secret'] || req.query?.secret);
  if (configuredSecret && providedSecret && providedSecret === configuredSecret) {
    return { ok: true, type: 'secret' };
  }

  const token = extractBearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'Missing notification worker authorization.' };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401, error: 'Invalid notification worker authorization.' };

  // Any authenticated ERP user may trigger processing of already-created queue rows.
  // The endpoint does not accept arbitrary notification payloads; it only drains the DB queue using the server service role.
  return { ok: true, type: 'user', userId: data.user.id, email: data.user.email || null };
}

export default async function handler(req, res) {
  if (!['POST', 'GET'].includes(req.method)) {
    res.setHeader('Allow', 'POST, GET');
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
  if (!auth?.ok) {
    return res.status(auth?.status || 401).json({ ok: false, error: auth?.error || 'Unauthorized.' });
  }

  try {
    const result = await processNotificationDeliveryQueue({ supabaseAdmin, limit: Number(req.query?.limit || 50) });
    return res.status(200).json({ ok: true, auth: auth.type, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: text(error?.message || error) || 'Notification queue processing failed.' });
  }
}
