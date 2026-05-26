import OpenAI from 'npm:openai@4.104.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const SYSTEM = `You are the InCheck360 AI Assistant. You answer read-only questions about any ERP data available in InCheck360. Use controlled tools only. Never run raw SQL from the user. Never perform write actions. If asked to modify data, explain that write actions are not enabled. Use business reference numbers instead of UUIDs. If a question is broad, search the ERP catalog and summarize grouped results. If data is missing, say exactly which data was not found.`;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const READONLY_BLOCK_MESSAGE = 'Write actions are not enabled yet. I can only read and summarize ERP data.';

const ERP_CATALOG = ['companies','contacts','clients','leads','deals','proposals','proposal_items','proposal_catalog','agreements','agreement_items','invoices','invoice_items','receipts','receipt_items','tickets','events','operations_onboarding','technical_admin_requests','notifications','notification_rules','workflow','workflow_requests','role_permissions','users','ai_insights','csm_activities'];
const RESOURCE_ALIASES: Record<string, string[]> = {
  company: ['companies', 'clients'], customer: ['companies', 'clients'], client: ['clients', 'companies'],
  contact: ['contacts'], person: ['contacts'], lead: ['leads'], leads: ['leads'], deal: ['deals'], deals: ['deals'], proposal: ['proposals'], quote: ['proposals'],
  agreement: ['agreements'], contract: ['agreements'], 'subscription agreement': ['agreements'], invoice: ['invoices'], payment: ['invoices'], unpaid: ['invoices'], 'overdue payment': ['invoices'],
  'invoice line': ['invoice_items'], renewal: ['invoice_items'], 'saas row': ['invoice_items'], 'location renewal': ['invoice_items'], receipt: ['receipts'], 'payment received': ['receipts'],
  ticket: ['tickets'], issue: ['tickets'], bug: ['tickets'], event: ['events'], calendar: ['events'], onboarding: ['operations_onboarding'], operations: ['operations_onboarding'],
  'technical request': ['technical_admin_requests'], 'admin request': ['technical_admin_requests'], 'technical admin': ['technical_admin_requests'], notification: ['notifications'],
  'communication centre': ['notifications'], workflow: ['workflow', 'workflow_requests'], approval: ['workflow', 'workflow_requests'],
};

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
const normalizeLimit = (n?: number) => Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(n) ? Number(n) : DEFAULT_LIMIT));
const safeNum = (v: unknown) => Number(v ?? 0) || 0;
const maybeFields = (row: any, fields: string[]) => fields.map((f) => row?.[f]).find((v) => v !== null && v !== undefined && String(v).trim() !== '');
const normalizeText = (value: unknown) => String(value ?? '').toLowerCase().trim().replace(/[^\p{L}\p{N}\s\-_.#]/gu, ' ').replace(/\s+/g, ' ');

function looksLikeWriteAction(message: string) {
  const text = String(message || '').toLowerCase();
  return /\b(create|update|delete|remove|approve|reject|assign|send|email|mark|complete|close|edit|change|set)\b/.test(text);
}

function detectReference(message: string) {
  const m = String(message || '').match(/\b(agreement|invoice|receipt|ticket|tr)#?\s*([0-9]{1,8})\b/i);
  if (!m) return null;
  return `${m[1]}#${m[2].padStart(4, '0')}`;
}

function normalizeErpRow(resource: string, row: any) {
  const reference = maybeFields(row, ['reference','agreement_number','invoice_number','receipt_number','ticket_number','request_number','onboarding_number','proposal_number','deal_number','lead_number','id']) || '';
  const refKey = String(reference || '');
  const map: Record<string, string> = {
    companies: `#companies?company_id=${refKey}`,
    contacts: `#contacts?contact_id=${refKey}`,
    leads: `#leads?lead_id=${maybeFields(row, ['lead_number']) || refKey}`,
    deals: `#deals?deal_id=${maybeFields(row, ['deal_number']) || refKey}`,
    proposals: `#proposals?proposal_id=${maybeFields(row, ['proposal_number']) || refKey}`,
    agreements: `#agreements?agreement_id=${maybeFields(row, ['agreement_number']) || refKey}`,
    invoices: `#invoices?invoice_id=${maybeFields(row, ['invoice_number']) || refKey}`,
    receipts: `#receipts?receipt_id=${maybeFields(row, ['receipt_number']) || refKey}`,
    tickets: `#tickets?ticket_id=${maybeFields(row, ['ticket_number']) || refKey}`,
    technical_admin_requests: `#technical-admin-requests?request_id=${maybeFields(row, ['request_number']) || refKey}`,
    operations_onboarding: `#operations-onboarding?onboarding_id=${maybeFields(row, ['onboarding_number']) || refKey}`,
    clients: `#clients?client_id=${maybeFields(row, ['client_name']) || refKey}`,
  };
  return {
    resource,
    reference: String(reference || ''),
    title: String(maybeFields(row, ['title', 'name', 'subject', 'description']) || ''),
    customer_name: String(maybeFields(row, ['customer_name', 'client_name', 'company_name', 'customer_legal_name']) || ''),
    status: String(maybeFields(row, ['status', 'approval_status', 'request_status', 'onboarding_status', 'dev_team_status']) || ''),
    date: String(maybeFields(row, ['updated_at', 'created_at', 'date', 'due_date', 'invoice_date', 'receipt_date']) || ''),
    amount: safeNum(maybeFields(row, ['amount', 'total', 'grand_total', 'total_amount', 'balance_due', 'line_total'])),
    payment_status: String(maybeFields(row, ['payment_status']) || ''),
    deep_link: map[resource] || `#${resource}`,
  };
}

function createPrivacyMasker() { const realToToken = new Map<string, string>(); const tokenToReal = new Map<string, string>(); let c = 0;
  const add = (value: unknown, type = 'MASK') => { const real = String(value || '').trim(); if (!real) return real; if (realToToken.has(real)) return realToToken.get(real)!; const token = `${type}_${String(++c).padStart(3,'0')}`; realToToken.set(real, token); tokenToReal.set(token, real); return token; };
  const maskText = (t: unknown) => { let out = String(t || ''); for (const [r, tk] of realToToken.entries()) out = out.split(r).join(tk); return out; };
  const restoreText = (t: unknown) => { let out = String(t || ''); for (const [tk, r] of tokenToReal.entries()) out = out.split(tk).join(r); return out; };
  const maskData = (data: any): any => Array.isArray(data) ? data.map(maskData) : (!data || typeof data !== 'object' ? data : Object.fromEntries(Object.entries(data).map(([k,v]) => [k, typeof v === 'string' ? add(v, /email/i.test(k)?'EMAIL':/phone/i.test(k)?'PHONE':/(name|client|company|contact|signatory|address|registration)/i.test(k)?'CLIENT':'MASK') : maskData(v)])));
  return { add, maskText, restoreText, maskData };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed. Use POST.' }, 405);
  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!OPENAI_API_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: 'Missing required secrets' }, 500);

    const { session_id, message, current_user, currentUser } = await req.json();
    const resolvedCurrentUser = current_user || currentUser || {};
    const role = String(resolvedCurrentUser?.role_key || resolvedCurrentUser?.roleKey || resolvedCurrentUser?.role || '').trim().toLowerCase();
    if (role !== 'admin') return jsonResponse({ error: 'You do not have permission to use AI Assistant.' }, 403);

    const sid = session_id || crypto.randomUUID();
    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const masker = createPrivacyMasker();

    const messageText = String(message || '');
    const isHowTo = /^\s*how\s+to\b/i.test(messageText);
    if (looksLikeWriteAction(messageText) && !isHowTo) return jsonResponse({ ok: true, answer: READONLY_BLOCK_MESSAGE, session_id: sid }, 200);

    const safeSelect = async (table: string, limit = MAX_LIMIT) => {
      const { data, error } = await db.from(table).select('*').limit(limit);
      if (error) return { table, rows: [], warning: `Table not available: ${table}` };
      return { table, rows: data || [] };
    };

    const searchErpRecords = async (args: any) => {
      const limit = normalizeLimit(args?.limit);
      const resourceIn = normalizeText(args?.resource || '');
      const tables = resourceIn ? (ERP_CATALOG.includes(resourceIn) ? [resourceIn] : (RESOURCE_ALIASES[resourceIn] || [])) : ERP_CATALOG;
      const refs = ['ticket_number','lead_number','deal_number','proposal_number','agreement_number','invoice_number','receipt_number','request_number','onboarding_number','reference'];
      const statuses = ['status','payment_status','approval_status','request_status','onboarding_status','dev_team_status'];
      const out: any[] = []; const warnings: string[] = [];
      for (const t of tables) {
        const r = await safeSelect(t, MAX_LIMIT);
        if (r.warning) warnings.push(r.warning);
        for (const row of r.rows) {
          const s = JSON.stringify(row).toLowerCase();
          if (args?.query && !s.includes(String(args.query).toLowerCase())) continue;
          if (args?.reference && !refs.some((f) => normalizeText(row?.[f]).includes(normalizeText(args.reference)))) continue;
          if (args?.status && !statuses.some((f) => normalizeText(row?.[f]).includes(normalizeText(args.status)))) continue;
          if (args?.date_from || args?.date_to) {
            const d = new Date(maybeFields(row, ['date','due_date','invoice_date','receipt_date','created_at','updated_at']) || '').getTime();
            if (Number.isFinite(d)) {
              if (args?.date_from && d < new Date(args.date_from).getTime()) continue;
              if (args?.date_to && d > new Date(args.date_to).getTime()) continue;
            }
          }
          out.push(normalizeErpRow(t, row));
        }
      }
      return { rows: out.slice(0, limit), total: out.length, warnings };
    };

    const searchByReference = async (reference: string) => {
      const ref = String(reference || '');
      const r = normalizeText(ref);
      const all = await searchErpRecords({ reference: ref, limit: MAX_LIMIT });
      const by = (resource: string) => all.rows.filter((x: any) => x.resource === resource);
      if (r.startsWith('agreement#')) return { agreement: by('agreements'), agreement_items: by('agreement_items'), invoices: by('invoices'), invoice_items: by('invoice_items'), receipts: by('receipts'), operations_onboarding: by('operations_onboarding'), technical_admin_requests: by('technical_admin_requests') };
      if (r.startsWith('invoice#')) return { invoice: by('invoices'), invoice_items: by('invoice_items'), receipts: by('receipts'), receipt_items: by('receipt_items'), agreements: by('agreements') };
      if (r.startsWith('receipt#')) return { receipt: by('receipts'), receipt_items: by('receipt_items'), invoices: by('invoices') };
      if (r.startsWith('ticket#')) return { ticket: by('tickets') };
      if (r.startsWith('tr#')) return { technical_admin_request: by('technical_admin_requests'), operations_onboarding: by('operations_onboarding'), agreements: by('agreements') };
      return { records: all.rows };
    };

    const searchByClientName = async (clientName: string) => {
      const rows = await searchErpRecords({ query: clientName, resource: '', limit: MAX_LIMIT });
      return rows.rows.reduce((acc: any, row: any) => { (acc[row.resource] ||= []).push(row); return acc; }, {});
    };

    const getErpOverview = async () => ({
      overdue_payments: (await searchErpRecords({ resource: 'invoices', status: 'overdue', limit: 50 })).rows,
      renewals_due: (await searchErpRecords({ resource: 'invoice_items', query: 'renewal', limit: 50 })).rows,
      open_tickets: (await searchErpRecords({ resource: 'tickets', status: 'open', limit: 50 })).rows,
      pending_approvals: (await searchErpRecords({ resource: 'proposals', status: 'pending approval', limit: 50 })).rows,
      open_technical_requests: (await searchErpRecords({ resource: 'technical_admin_requests', status: 'open', limit: 50 })).rows,
      onboarding_not_completed: (await searchErpRecords({ resource: 'operations_onboarding', query: 'pending', limit: 50 })).rows,
      lead_deal_followups: [ ...(await searchErpRecords({ resource: 'leads', query: 'follow', limit: 50 })).rows, ...(await searchErpRecords({ resource: 'deals', query: 'follow', limit: 50 })).rows ],
    });

    const tools: Record<string, (args: any) => Promise<any>> = {
      search_erp_records: (a) => searchErpRecords(a || {}),
      search_by_reference: (a) => searchByReference(a?.reference),
      search_by_client_name: (a) => searchByClientName(a?.client_name),
      get_erp_overview: (a) => getErpOverview(),
      get_unpaid_invoices: () => searchErpRecords({ resource: 'invoices', query: 'unpaid', limit: MAX_LIMIT }),
      get_overdue_payments: () => searchErpRecords({ resource: 'invoices', status: 'overdue', limit: MAX_LIMIT }),
      get_open_tickets: () => searchErpRecords({ resource: 'tickets', status: 'open', limit: MAX_LIMIT }),
      get_open_technical_requests: () => searchErpRecords({ resource: 'technical_admin_requests', status: 'open', limit: MAX_LIMIT }),
      get_pending_approval_proposals: () => searchErpRecords({ resource: 'proposals', status: 'pending approval', limit: MAX_LIMIT }),
      get_client_summary: (a) => searchByClientName(a?.query || a?.client_name),
    };

    const lower = messageText.toLowerCase();
    const directRef = detectReference(messageText);
    let directResult: any = null;
    if (directRef) directResult = await tools.search_by_reference({ reference: directRef });
    else if (/^\s*summarize\s+/i.test(messageText)) directResult = await tools.get_client_summary({ query: messageText.replace(/^\s*summarize\s+/i, '').trim() });
    else if (/(client|customer)\s+.+/i.test(messageText)) directResult = await tools.search_by_client_name({ client_name: messageText.replace(/.*?(client|customer)\s+/i, '').trim() });
    else if (lower.includes('overdue payment')) directResult = await tools.get_overdue_payments({});
    else if (lower.includes('unpaid invoice')) directResult = await tools.get_unpaid_invoices({});
    else if (lower.includes('pending approval')) directResult = await tools.get_pending_approval_proposals({});
    else if (lower.includes('open ticket')) directResult = await tools.get_open_tickets({});
    else if (lower.includes('technical request')) directResult = await tools.get_open_technical_requests({});

    if (directResult) return jsonResponse({ ok: true, answer: directResult, session_id: sid }, 200);

    const openAITools = Object.keys(tools).map((name) => ({ type: 'function' as const, name, description: name, parameters: { type: 'object', properties: { resource: { type: 'string' }, query: { type: 'string' }, reference: { type: 'string' }, status: { type: 'string' }, date_from: { type: 'string' }, date_to: { type: 'string' }, limit: { type: 'number' }, client_name: { type: 'string' }, topic: { type: 'string' } } } }));

    let response = await openai.responses.create({ model: 'gpt-4.1-mini', input: [{ role: 'system', content: SYSTEM }, { role: 'user', content: masker.maskText(messageText) }], tools: openAITools });
    const outputs: any[] = [];
    for (const item of response.output || []) {
      if (item.type !== 'function_call') continue;
      const args = JSON.parse(masker.restoreText(item.arguments || '{}'));
      const result = await (tools[item.name] || (async () => ({ error: `Unknown tool: ${item.name}` })))(args);
      outputs.push({ type: 'function_call_output', call_id: item.call_id, output: JSON.stringify(masker.maskData(result)) });
    }
    if (outputs.length) response = await openai.responses.create({ model: 'gpt-4.1-mini', previous_response_id: response.id, input: outputs });
    return jsonResponse({ ok: true, answer: masker.restoreText(response.output_text || 'No data found from allowed tools.'), session_id: sid, privacy_mode: 'masked_before_openai' }, 200);
  } catch (error) {
    console.error('[incheck360-ai-assistant] failed', error);
    return jsonResponse({ error: (error as any)?.message || String(error) }, 500);
  }
});
