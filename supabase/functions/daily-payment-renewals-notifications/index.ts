import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TZ = Deno.env.get('BUSINESS_TIMEZONE') || 'Asia/Beirut';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const toYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayInTz = () => new Date(new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()));
const dateOnly = (value: unknown) => String(value || '').slice(0, 10);
const dayDiff = (targetYmd: string, nowYmd: string) => Math.round((new Date(`${targetYmd}T00:00:00Z`).getTime() - new Date(`${nowYmd}T00:00:00Z`).getTime()) / 86400000);

const recipientFields = ['assigned_csm_email', 'csm_email', 'owner_email', 'sales_executive_email', 'assigned_to_email', 'assigned_csm_id', 'owner_id', 'assigned_to_id'];
const FALLBACKS: Record<string, string> = {
  renewal_due_in_7_days: 'Renewal due in 7 days',
  renewal_due_in_30_days: 'Renewal due in 30 days',
  renewal_due_in_60_days: 'Renewal due in 60 days',
  renewal_overdue: 'Renewal overdue',
  payment_due_in_7_days: 'Payment due in 7 days',
  payment_due_in_30_days: 'Payment due in 30 days',
  payment_due_in_60_days: 'Payment due in 60 days',
  payment_overdue: 'Payment overdue'
};

Deno.serve(async () => {
  const localHour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ }).format(new Date()));
  if (localHour !== 8) return new Response(JSON.stringify({ ok: true, skipped: 'not_8am_local' }), { headers: { 'content-type': 'application/json' } });

  const today = toYmd(todayInTz());
  const { data: rules } = await sb.from('notification_rules').select('*').eq('resource', 'clients');
  const ruleByAction = new Map((rules || []).map((r: any) => [String(r.action || ''), r]));

  const { data: invoices } = await sb.from('invoices').select('*').neq('status', 'void');
  const invoiceIds = (invoices || []).map((i: any) => i.id).filter(Boolean);
  const { data: invoiceItems } = await sb.from('invoice_items').select('*').in('invoice_id', invoiceIds.length ? invoiceIds : ['00000000-0000-0000-0000-000000000000']);

  const itemsByInvoice = new Map<string, any[]>();
  for (const it of invoiceItems || []) {
    const key = String(it.invoice_id || '');
    if (!itemsByInvoice.has(key)) itemsByInvoice.set(key, []);
    itemsByInvoice.get(key)!.push(it);
  }

  const annualSaas = (it: any) => {
    const section = String(it.section || it.item_section || '').trim().toLowerCase();
    if (section === 'annual_saas') return true;
    const text = String([it.item_name, it.module_name, it.description, it.billing_frequency, it.billing_cycle].filter(Boolean).join(' ')).toLowerCase();
    return text.includes('saas') && (text.includes('annual') || text.includes('year'));
  };
  const superseded = (it: any) => it.is_superseded === true || String(it.is_superseded || '').trim().toLowerCase() === 'true';

  const rows: any[] = [];
  for (const invoice of invoices || []) {
    for (const item of (itemsByInvoice.get(String(invoice.id || '')) || []).filter((it: any) => annualSaas(it) && !superseded(it))) {
      const renewalDue = dateOnly(item.service_end_date || item.renewal_due_date || item.renewal_date);
      if (!renewalDue) continue;
      rows.push({
        row_id: `${invoice.id}:${item.id}`,
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number || invoice.invoice_no,
        agreement_number: invoice.agreement_number || item.agreement_number,
        customer_name: invoice.customer_name || invoice.customer_legal_name,
        client_id: invoice.client_id || invoice.company_id,
        location_name: item.location_name || 'Unknown Location',
        renewal_due_date: renewalDue,
        due_date: dateOnly(invoice.due_date),
        pending_amount: Number(invoice.pending_amount || invoice.amount_due || 0),
        payment_status: String(invoice.payment_status || invoice.status || '').trim().toLowerCase(),
        renewal_status: String(item.renewal_status || '').trim().toLowerCase()
      });
    }
  }

  let sent = 0;
  const sendEvent = async (row: any, eventKey: string, deepLink: string) => {
    const dedupe = `${eventKey}:${row.invoice_number}:${row.location_name}:${today}`;
    const rule = ruleByAction.get(eventKey) || {};
    if (rule.enabled === false) return;
    const payload = {
      resource: 'clients', action: eventKey, record_id: row.invoice_id || row.row_id,
      record_ref: row.invoice_number, display_ref: row.invoice_number,
      invoice_number: row.invoice_number, agreement_number: row.agreement_number,
      customer_name: row.customer_name, client_id: row.client_id, location_name: row.location_name,
      renewal_due_date: row.renewal_due_date, due_date: row.due_date, pending_amount: row.pending_amount,
      deep_link: deepLink, dedupe_key: dedupe,
      title: rule.title_template || FALLBACKS[eventKey], message: rule.body_template || FALLBACKS[eventKey],
      users_from_record: recipientFields,
      in_app_enabled: rule.in_app_enabled !== false, pwa_enabled: rule.pwa_enabled !== false, email_enabled: rule.email_enabled === true
    };

    const { error } = await sb.rpc('create_notification_and_push', { p_payload: payload });
    if (error) return;
    sent += 1;

    if (payload.pwa_enabled) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-web-push-v2`, {
          method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ resource: payload.resource, action: payload.action, title: payload.title, body: payload.message, data: payload })
        });
      } catch (_) {}
    }
  };

  for (const row of rows) {
    const renewalDays = dayDiff(row.renewal_due_date, today);
    if (renewalDays === 60) await sendEvent(row, 'renewal_due_in_60_days', `#clients?client_id=${encodeURIComponent(row.client_id || '')}&tab=payment-renewals`);
    else if (renewalDays === 30) await sendEvent(row, 'renewal_due_in_30_days', `#clients?client_id=${encodeURIComponent(row.client_id || '')}&tab=payment-renewals`);
    else if (renewalDays === 7) await sendEvent(row, 'renewal_due_in_7_days', `#clients?client_id=${encodeURIComponent(row.client_id || '')}&tab=payment-renewals`);
    else if (renewalDays < 0 && row.renewal_status !== 'renewed') await sendEvent(row, 'renewal_overdue', `#clients?client_id=${encodeURIComponent(row.client_id || '')}&tab=payment-renewals`);

    const hasPending = Number(row.pending_amount || 0) > 0 || ['unpaid', 'partial', 'overdue'].includes(row.payment_status);
    if (!hasPending || !row.due_date) continue;
    const paymentDays = dayDiff(row.due_date, today);
    if (paymentDays === 60) await sendEvent(row, 'payment_due_in_60_days', `#invoices?invoice_id=${encodeURIComponent(row.invoice_number || '')}`);
    else if (paymentDays === 30) await sendEvent(row, 'payment_due_in_30_days', `#invoices?invoice_id=${encodeURIComponent(row.invoice_number || '')}`);
    else if (paymentDays === 7) await sendEvent(row, 'payment_due_in_7_days', `#invoices?invoice_id=${encodeURIComponent(row.invoice_number || '')}`);
    else if (paymentDays < 0) await sendEvent(row, 'payment_overdue', `#invoices?invoice_id=${encodeURIComponent(row.invoice_number || '')}`);
  }

  return new Response(JSON.stringify({ ok: true, date: today, rows: rows.length, sent, timezone: TZ }), { headers: { 'content-type': 'application/json' } });
});
