import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TZ = Deno.env.get('BUSINESS_TIMEZONE') || 'Asia/Beirut';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const APP_BASE_URL = (Deno.env.get('APP_BASE_URL') || Deno.env.get('PUBLIC_APP_URL') || 'https://monitor.app.incheck360.nl').replace(/\/+$/, '');

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function toYmd(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function todayInTimezone() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date())
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {} as Record<string, string>);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseDateOnly(value: unknown) {
  const raw = String(value || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function differenceInCalendarDays(dueDate: unknown, today: string) {
  const due = parseDateOnly(dueDate);
  const base = parseDateOnly(today);
  if (!due || !base) return null;
  return Math.round((due.getTime() - base.getTime()) / 86400000);
}

function normalizeDays(value: unknown) {
  const allowed = new Set([30, 14, 7]);
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  const days = [...new Set(source.map(day => Number(day)).filter(day => allowed.has(day)))];
  return days.length ? days : [30, 14, 7];
}

function normalizeIds(value: unknown) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(source.map(id => String(id || '').trim()).filter(Boolean))];
}

function money(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0';
}

async function loadRule() {
  const { data, error } = await sb
    .from('notification_rules')
    .select('*')
    .eq('resource', 'invoice_payment_schedule')
    .eq('action', 'payment_due_reminder')
    .maybeSingle();
  if (error) console.warn('[payment-schedule-reminders] unable to load notification rule', error);
  return data || null;
}

function channelEnabled(rule: Record<string, unknown> | null, channel: 'in_app' | 'pwa' | 'email') {
  if (rule && (rule.is_enabled === false || String(rule.is_enabled).toLowerCase() === 'false')) return false;
  const value = channel === 'pwa'
    ? (rule?.pwa_enabled ?? rule?.push_enabled ?? true)
    : channel === 'email'
      ? (rule?.email_enabled ?? false)
      : (rule?.in_app_enabled ?? true);
  return value === true || String(value).toLowerCase() === 'true' || String(value) === '1';
}


async function processReminders(today: string, dryRun = false) {
  const summary = { ok: true, date: today, scanned: 0, matched: 0, sent: 0, skipped: 0, errors: [] as unknown[] };
  const rule = await loadRule();
  if (rule && channelEnabled(rule, 'in_app') === false && channelEnabled(rule, 'pwa') === false && channelEnabled(rule, 'email') === false) {
    return { ...summary, skipped: 'notification_rule_disabled' };
  }

  const { data: schedules, error } = await sb
    .from('invoice_payment_schedule')
    .select('*, invoices:invoice_id ( id, invoice_number, invoice_id, currency, company_name, customer_name )')
    .eq('reminder_enabled', true)
    .not('due_date', 'is', null);
  if (error) throw error;

  for (const schedule of schedules || []) {
    summary.scanned += 1;
    try {
      const status = String(schedule.status || '').trim().toLowerCase();
      const balance = Number(schedule.balance_due ?? schedule.scheduled_amount ?? 0);
      const recipients = normalizeIds(schedule.reminder_user_ids);
      const daysUntilDue = differenceInCalendarDays(schedule.due_date, today);
      if (status === 'paid' || (Number.isFinite(balance) && balance <= 0) || !recipients.length || !normalizeDays(schedule.reminder_days).includes(Number(daysUntilDue))) {
        summary.skipped += 1;
        continue;
      }
      summary.matched += 1;
      const invoice = schedule.invoices || {};
      const invoiceRef = String(invoice.invoice_number || invoice.invoice_id || schedule.invoice_id || '').trim();
      const currency = String(invoice.currency || schedule.currency || 'USD').trim().toUpperCase();
      const scheduleLabel = String(schedule.schedule_label || (schedule.schedule_no ? `Payment ${schedule.schedule_no}` : 'Payment')).trim();
      const dueDate = String(schedule.due_date || '').slice(0, 10);
      const title = `Scheduled Payment Due in ${daysUntilDue} Days · ${invoiceRef}`;
      const body = `Payment ${scheduleLabel} for invoice ${invoiceRef} is due on ${dueDate}. Scheduled amount: ${money(schedule.scheduled_amount)} ${currency}. Balance due: ${money(schedule.balance_due ?? schedule.scheduled_amount)} ${currency}.`;

      for (const recipientUserId of recipients) {
        try {
          const { data: existing, error: logError } = await sb
            .from('invoice_payment_schedule_reminder_log')
            .select('id')
            .eq('schedule_id', schedule.id)
            .eq('reminder_day', daysUntilDue)
            .eq('recipient_user_id', recipientUserId)
            .limit(1);
          if (logError) throw logError;
          if (existing?.length) { summary.skipped += 1; continue; }

          const deepLink = `#invoices?invoice_id=${schedule.invoice_id}`;
          const dedupeKey = `invoice_payment_schedule:${schedule.id}:${daysUntilDue}:${recipientUserId}`;
          let notificationId = null;
          let deliveryResult = null;
          if (!dryRun) {
            const { data: dispatched, error: dispatchError } = await sb.rpc('dispatch_notification', {
              p_event_key: 'invoice_payment_schedule_payment_due_reminder',
              p_recipient_user_ids: [recipientUserId],
              p_payload: {
                title,
                body,
                invoice_id: schedule.invoice_id,
                invoice_number: invoiceRef,
                schedule_id: schedule.id,
                days_until_due: daysUntilDue,
                dedupe_key: dedupeKey,
                channels: [
                  ...(channelEnabled(rule, 'in_app') ? ['in_app'] : []),
                  ...(channelEnabled(rule, 'pwa') ? ['pwa'] : []),
                  ...(channelEnabled(rule, 'email') ? ['email'] : []),
                ],
              },
              p_resource: 'invoice_payment_schedule',
              p_resource_id: String(schedule.id),
              p_deep_link: deepLink,
            });
            if (dispatchError) throw dispatchError;
            deliveryResult = dispatched || null;
            notificationId = Array.isArray(dispatched) ? (dispatched[0]?.notification_id || dispatched[0]?.id || null) : (dispatched?.notification_id || dispatched?.id || null);
            const { error: insertLogError } = await sb.from('invoice_payment_schedule_reminder_log').insert({
              schedule_id: schedule.id,
              reminder_day: daysUntilDue,
              recipient_user_id: recipientUserId,
              notification_id: notificationId,
              sent_at: new Date().toISOString(),
              status: 'processed',
              error_message: deliveryResult?.error || null
            });
            if (insertLogError) throw insertLogError;
          }
          summary.sent += 1;
        } catch (recipientError) {
          summary.errors.push({ schedule_id: schedule.id, reminder_day: daysUntilDue, recipient_user_id: recipientUserId, error: String(recipientError?.message || recipientError) });
          console.warn('[payment-schedule-reminders] recipient failed', recipientError);
        }
      }
    } catch (scheduleError) {
      summary.errors.push({ schedule_id: schedule?.id || null, error: String(scheduleError?.message || scheduleError) });
      console.warn('[payment-schedule-reminders] schedule failed', scheduleError);
    }
  }
  return summary;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === 'true';
  const body = await req.json().catch(() => ({}));
  const localHour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ }).format(new Date()));
  if (!force && body?.force !== true && localHour !== 8) {
    return new Response(JSON.stringify({ ok: true, skipped: 'not_8am_local', timezone: TZ }), { headers: { 'content-type': 'application/json' } });
  }
  const today = String(body?.today || todayInTimezone() || toYmd(new Date())).slice(0, 10);
  const result = await processReminders(today, body?.dry_run === true);
  return new Response(JSON.stringify({ ...result, timezone: TZ }), { headers: { 'content-type': 'application/json' } });
});
