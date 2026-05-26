import OpenAI from 'npm:openai@4.104.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const SYSTEM = `You are the InCheck360 AI Assistant. You answer read-only questions about ERP data in InCheck360. You may use controlled data tools only. Do not invent records. Do not run or generate raw SQL. Do not perform write actions. Use business reference numbers instead of UUIDs. If data is missing, say what is missing. Keep answers concise, professional, and useful. When listing records, include status, amount/date if relevant, and a deep link if available.`;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const READONLY_BLOCK_MESSAGE = 'Action execution is not enabled yet. I can only provide read-only ERP information.';

const RESOURCE_ALIASES: Record<string, string[]> = {
  customer: ['companies', 'clients'], client: ['clients', 'companies'], payment: ['invoices', 'receipts'], renewal: ['invoice_items', 'invoices'],
  'technical request': ['technical_admin_requests'], onboarding: ['operations_onboarding'], issue: ['tickets'], 'agreement line': ['agreement_items'], 'invoice line': ['invoice_items'],
};
const SUPPORTED_RESOURCES = ['companies','contacts','leads','deals','proposals','agreements','agreement_items','invoices','invoice_items','receipts','receipt_items','tickets','events','operations_onboarding','technical_admin_requests','clients','notifications','workflow'];

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
const normalizeLimit = (n?: number) => Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(n) ? Number(n) : DEFAULT_LIMIT));
const hasWriteIntent = (t: string) => /\b(delete|update|insert|create|approve|assign|send|modify|cancel|close|change|edit)\b/i.test(t || '');

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
    const role = String(resolvedCurrentUser?.role_key || resolvedCurrentUser?.roleKey || resolvedCurrentUser?.role || resolvedCurrentUser?.user_role || '').trim().toLowerCase();
    if (role !== 'admin') return jsonResponse({ error: 'You do not have permission to use AI Assistant.' }, 403);

    const sid = session_id || crypto.randomUUID();
    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    await db.from('ai_chat_sessions').upsert({ id: sid, user_id: resolvedCurrentUser.id || '', title: 'AI Assistant', updated_at: new Date().toISOString() });
    await db.from('ai_chat_messages').insert({ session_id: sid, user_id: resolvedCurrentUser.id || '', role: 'user', content: message });

    const searchERP = async (args: any) => {
      const limit = normalizeLimit(args?.limit);
      const resourceInput = String(args?.resource || '').trim().toLowerCase();
      const resources = SUPPORTED_RESOURCES.includes(resourceInput) ? [resourceInput] : (RESOURCE_ALIASES[resourceInput] || []);
      if (!resources.length) return { error: `Unsupported resource: ${resourceInput}`, rows: [] };
      const rows: any[] = [];
      for (const resource of resources) {
        let q = db.from(resource).select('*', { count: 'exact' }).limit(limit);
        if (args?.status) q = q.ilike('status', `%${args.status}%`);
        if (args?.query) q = q.or(`name.ilike.%${args.query}%,title.ilike.%${args.query}%,company_name.ilike.%${args.query}%,client_name.ilike.%${args.query}%`);
        if (args?.client_name) q = q.or(`client_name.ilike.%${args.client_name}%,company_name.ilike.%${args.client_name}%,name.ilike.%${args.client_name}%`);
        if (args?.reference) q = q.or(`reference.ilike.%${args.reference}%,invoice_number.ilike.%${args.reference}%,agreement_number.ilike.%${args.reference}%,proposal_number.ilike.%${args.reference}%,ticket_number.ilike.%${args.reference}%,receipt_number.ilike.%${args.reference}%,lead_number.ilike.%${args.reference}%,deal_number.ilike.%${args.reference}%,request_number.ilike.%${args.reference}%`);
        const { data, count, error } = await q;
        if (!error && data) rows.push({ resource, count, rows: data });
      }
      return { rows, limit, truncated: limit === MAX_LIMIT };
    };

    const toolHandlers: Record<string, (args: any) => Promise<any>> = {
      search_erp_records: searchERP,
      search_by_client_name: (a) => searchERP({ resource: 'client', client_name: a?.client_name, limit: a?.limit }),
      search_by_reference: (a) => searchERP({ resource: 'payment', reference: a?.reference, limit: a?.limit }),
      get_unpaid_invoices: () => searchERP({ resource: 'invoices', status: 'unpaid', limit: MAX_LIMIT }),
      get_overdue_payments: () => searchERP({ resource: 'invoices', query: '', limit: MAX_LIMIT }),
      get_open_tickets: () => searchERP({ resource: 'tickets', status: 'open', limit: MAX_LIMIT }),
      get_open_technical_requests: () => searchERP({ resource: 'technical_admin_requests', status: 'open', limit: MAX_LIMIT }),
      get_pending_approval_proposals: () => searchERP({ resource: 'proposals', status: 'pending', limit: MAX_LIMIT }),
      get_onboarding_summary: () => searchERP({ resource: 'operations_onboarding', limit: MAX_LIMIT }),
      get_signed_agreements: () => searchERP({ resource: 'agreements', status: 'signed', limit: MAX_LIMIT }),
      get_expired_agreements: () => searchERP({ resource: 'agreements', status: 'expired', limit: MAX_LIMIT }),
      get_agreements_needing_invoice: () => searchERP({ resource: 'agreements', query: 'signed', limit: MAX_LIMIT }),
      get_client_summary: (a) => searchERP({ resource: 'client', client_name: a?.query, limit: MAX_LIMIT }),
      get_statement_of_account: (a) => searchERP({ resource: 'payment', client_name: a?.query, limit: MAX_LIMIT }),
      get_payment_renewals: (a) => searchERP({ resource: 'renewal', query: a?.query, limit: MAX_LIMIT }),
      get_renewals_due: (a) => searchERP({ resource: 'renewal', query: `due in ${a?.days || 30} days`, limit: MAX_LIMIT }),
      get_lead_followups_today: () => searchERP({ resource: 'leads', query: 'follow up', limit: MAX_LIMIT }),
      get_deal_followups_today: () => searchERP({ resource: 'deals', query: 'follow up', limit: MAX_LIMIT }),
      get_lifecycle_summary: (a) => searchERP({ resource: 'client', client_name: a?.client_name, limit: MAX_LIMIT }),
    };

    if (hasWriteIntent(String(message || ''))) {
      await db.from('ai_chat_messages').insert({ session_id: sid, user_id: resolvedCurrentUser.id || '', role: 'assistant', content: READONLY_BLOCK_MESSAGE });
      return jsonResponse({ ok: true, answer: READONLY_BLOCK_MESSAGE, session_id: sid }, 200);
    }

    const tools = Object.keys(toolHandlers).map((name) => ({ type: 'function' as const, name, description: name, parameters: { type: 'object', properties: { resource: { type: 'string' }, query: { type: 'string' }, status: { type: 'string' }, client_name: { type: 'string' }, reference: { type: 'string' }, date_from: { type: 'string' }, date_to: { type: 'string' }, limit: { type: 'number' }, days: { type: 'number' } } } }));

    let response = await openai.responses.create({ model: 'gpt-4.1-mini', input: [{ role: 'system', content: SYSTEM }, { role: 'user', content: String(message || '') }], tools });
    const toolOutputs: any[] = [];
    for (const item of response.output || []) {
      if (item.type !== 'function_call') continue;
      const handler = toolHandlers[item.name];
      const result = handler ? await handler(JSON.parse(item.arguments || '{}')) : { error: `Unknown tool ${item.name}` };
      toolOutputs.push({ type: 'function_call_output', call_id: item.call_id, output: JSON.stringify(result) });
    }
    if (toolOutputs.length) response = await openai.responses.create({ model: 'gpt-4.1-mini', previous_response_id: response.id, input: toolOutputs });

    let answer = response.output_text || 'No data found from allowed tools.';
    if (/"truncated":true/.test(answer)) answer += '\n\nShowing first 100 records.';
    await db.from('ai_chat_messages').insert({ session_id: sid, user_id: resolvedCurrentUser.id || '', role: 'assistant', content: answer });
    return jsonResponse({ ok: true, answer, session_id: sid }, 200);
  } catch (error) {
    console.error('[incheck360-ai-assistant] failed', error);
    return jsonResponse({ error: error?.message || String(error) }, 500);
  }
});
