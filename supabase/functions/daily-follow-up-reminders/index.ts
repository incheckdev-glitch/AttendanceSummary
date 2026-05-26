import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TZ = Deno.env.get('BUSINESS_TIMEZONE') || 'Asia/Beirut';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const todayInTz = () => new Date(new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()));
const toYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

Deno.serve(async () => {
  const now = new Date();
  const localHour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ }).format(now));
  if (localHour !== 8) return new Response(JSON.stringify({ ok: true, skipped: 'not_8am_local' }), { headers: { 'content-type': 'application/json' } });

  const date = toYmd(todayInTz());
  const dueLeadStatuses = ['closed','disqualified','converted'];
  const dueDealStatuses = ['closed won','won','closed lost','lost','cancelled'];

  const { data: leads } = await sb.from('leads').select('*');
  const { data: deals } = await sb.from('deals').select('*');

  const leadRows = (leads || []).filter((r: any) => {
    const f = String(r.follow_up_date || r.next_follow_up_date || r.followup_date || r.nextFollowUpDate || r.next_follow_up_at || '').slice(0,10);
    const st = String(r.stage || r.status || '').trim().toLowerCase();
    return f === date && !dueLeadStatuses.some(x => st.includes(x));
  });
  const dealRows = (deals || []).filter((r: any) => {
    const f = String(r.follow_up_date || r.next_follow_up_date || r.followup_date || r.nextFollowUpDate || r.next_follow_up_at || '').slice(0,10);
    const st = String(r.stage || r.status || '').trim().toLowerCase();
    return f === date && !dueDealStatuses.some(x => st.includes(x));
  });

  const send = async (payload: any) => sb.rpc('create_notification_and_push', { p_payload: payload }).catch(() => null);

  for (const row of leadRows) {
    const rid = String(row.id || row.lead_id || 'unknown');
    await send({
      resource: 'leads', action: 'lead_follow_up_due_today', record_id: rid,
      title: 'Lead follow-up reminder',
      message: `You have a follow-up today for lead ${row.lead_name || row.full_name || ''} / ${row.company_name || ''}.`,
      users_from_record: ['assigned_to_email','assignee_email','owner_email','sales_executive_email','assigned_to_id','owner_id'],
      dedupe_key: `lead_follow_up_due_today:${rid}:${date}`
    });
  }
  for (const row of dealRows) {
    const rid = String(row.id || row.deal_id || 'unknown');
    await send({
      resource: 'deals', action: 'deal_follow_up_due_today', record_id: rid,
      title: 'Deal follow-up reminder',
      message: `You have a follow-up today for deal ${row.deal_name || row.full_name || ''} / ${row.company_name || ''}.`,
      users_from_record: ['assigned_to_email','assignee_email','owner_email','sales_executive_email','assigned_to_id','owner_id'],
      dedupe_key: `deal_follow_up_due_today:${rid}:${date}`
    });
  }

  return new Response(JSON.stringify({ ok: true, date, leads: leadRows.length, deals: dealRows.length, timezone: TZ }), { headers: { 'content-type': 'application/json' } });
});
