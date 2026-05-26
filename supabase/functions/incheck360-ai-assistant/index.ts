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
const normalizeText = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s\-_.#]/gu, ' ')
    .replace(/([\-_.#])\1+/g, '$1')
    .replace(/\s+/g, ' ');
const safeNum = (v: unknown) => Number(v ?? 0) || 0;
const maybeFields = (row: any, fields: string[]) => fields.map((f) => row?.[f]).find((v) => v !== null && v !== undefined && String(v).trim() !== '');

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
    const rowMatches = (row: any, fields: string[], queryNorm: string) => fields.some((f) => normalizeText(row?.[f]).includes(queryNorm));
    const annualSaasRow = (row: any) => {
      const section = normalizeText(row?.section || row?.item_section);
      const text = normalizeText(`${row?.name || ''} ${row?.description || ''} ${row?.item_name || ''}`);
      return section === 'annual_saas' || (text.includes('saas') && (text.includes('annual') || text.includes('year')));
    };
    const getClientSummary = async (args: any) => {
      const query = String(args?.query || '').trim();
      const queryNorm = normalizeText(query);
      if (!queryNorm) return { error: 'query is required' };

      const tables = ['clients', 'companies', 'agreements', 'invoices', 'receipts', 'invoice_items', 'receipt_items', 'operations_onboarding', 'technical_admin_requests', 'tickets'];
      const fetched: Record<string, any[]> = {};
      for (const t of tables) {
        const { data } = await db.from(t).select('*').limit(MAX_LIMIT);
        fetched[t] = data || [];
      }
      const matchesByName = (rows: any[], fields: string[]) => rows.filter((r) => rowMatches(r, fields, queryNorm));
      const clientRows = matchesByName(fetched.clients, ['name', 'client_name', 'company_name', 'legal_name', 'customer_name']);
      const companyRows = matchesByName(fetched.companies, ['legal_name', 'company_name', 'name', 'display_name']);
      const agreementRows = matchesByName(fetched.agreements, ['customer_name', 'company_name', 'client_name', 'customer_legal_name']);
      const invoiceRows = matchesByName(fetched.invoices, ['customer_name', 'company_name', 'client_name', 'customer_legal_name']);
      const receiptRows = matchesByName(fetched.receipts, ['customer_name', 'company_name', 'client_name', 'customer_legal_name']);

      const clientIds = new Set<string>([...clientRows, ...agreementRows, ...invoiceRows].map((r) => String(r?.client_id || '')).filter(Boolean));
      const companyIds = new Set<string>([...companyRows, ...agreementRows, ...invoiceRows].map((r) => String(r?.company_id || '')).filter(Boolean));
      const agreementNums = new Set<string>(agreementRows.map((r) => String(r?.agreement_number || r?.agreement_id || '')).filter(Boolean));

      const relatedAgreements = fetched.agreements.filter((r) =>
        agreementNums.has(String(r?.agreement_number || r?.agreement_id || '')) ||
        clientIds.has(String(r?.client_id || '')) || companyIds.has(String(r?.company_id || '')));
      const relatedInvoices = fetched.invoices.filter((r) =>
        clientIds.has(String(r?.client_id || '')) || companyIds.has(String(r?.company_id || '')) ||
        agreementNums.has(String(r?.agreement_number || r?.agreement_id || '')) ||
        relatedAgreements.some((a) => String(a?.id || a?.agreement_id || '') === String(r?.agreement_id || '')));
      const invoiceNumbers = new Set<string>(relatedInvoices.map((r) => String(r?.invoice_number || r?.id || '')).filter(Boolean));
      const relatedReceipts = fetched.receipts.filter((r) =>
        invoiceNumbers.has(String(r?.invoice_number || r?.invoice_id || '')) ||
        agreementNums.has(String(r?.agreement_number || '')) ||
        clientIds.has(String(r?.client_id || '')) || companyIds.has(String(r?.company_id || '')));
      const relatedOnboarding = fetched.operations_onboarding.filter((r) =>
        agreementNums.has(String(r?.agreement_number || r?.agreement_id || '')) || clientIds.has(String(r?.client_id || '')) || companyIds.has(String(r?.company_id || '')));
      const relatedTech = fetched.technical_admin_requests.filter((r) =>
        agreementNums.has(String(r?.agreement_number || r?.agreement_id || '')) || clientIds.has(String(r?.client_id || '')) || companyIds.has(String(r?.company_id || '')));
      const relatedTickets = fetched.tickets.filter((r) =>
        rowMatches(r, ['customer_name', 'company_name', 'client_name', 'title', 'subject'], queryNorm) ||
        clientIds.has(String(r?.client_id || '')) || companyIds.has(String(r?.company_id || '')));

      const relatedInvoiceItems = fetched.invoice_items.filter((r) =>
        !r?.is_superseded && (invoiceNumbers.has(String(r?.invoice_number || r?.invoice_id || '')) || relatedInvoices.some((i) => String(i?.id || '') === String(r?.invoice_id || ''))));
      const renewalRows = relatedInvoiceItems.filter(annualSaasRow).map((row) => {
        const inv = relatedInvoices.find((i) => String(i?.invoice_number || i?.id || '') === String(row?.invoice_number || row?.invoice_id || '') || String(i?.id || '') === String(row?.invoice_id || '')) || {};
        return {
          location_name: maybeFields(row, ['location_name', 'branch_name', 'site_name']) || maybeFields(inv, ['location_name', 'branch_name']) || '',
          agreement_number: maybeFields(inv, ['agreement_number', 'agreement_id']) || '',
          invoice_number: maybeFields(inv, ['invoice_number', 'id']) || '',
          service_start_date: maybeFields(row, ['service_start_date']) || maybeFields(inv, ['service_start_date']) || '',
          service_end_date: maybeFields(row, ['service_end_date']) || maybeFields(inv, ['service_end_date']) || '',
          renewal_due_date: maybeFields(inv, ['due_date', 'renewal_due_date']) || '',
          renewal_status: maybeFields(inv, ['status']) || '',
          payment_status: maybeFields(inv, ['payment_status', 'status']) || '',
          amount: safeNum(maybeFields(row, ['line_total', 'total', 'amount'])),
          deep_link: `#clients?client_id=${maybeFields(inv, ['client_id']) || ''}&tab=payment-renewals`,
        };
      });

      const baseClient = clientRows[0] || companyRows[0] || relatedAgreements[0] || relatedInvoices[0] || {};
      const agreementOut = relatedAgreements.map((r) => ({
        agreement_number: maybeFields(r, ['agreement_number', 'id']) || '',
        status: maybeFields(r, ['status']) || '',
        signed_date: maybeFields(r, ['signed_date']) || '',
        service_start_date: maybeFields(r, ['service_start_date']) || '',
        service_end_date: maybeFields(r, ['service_end_date']) || '',
        agreement_value: safeNum(maybeFields(r, ['agreement_value', 'total_amount', 'amount'])),
        deep_link: `#agreements?agreement_id=${maybeFields(r, ['agreement_number', 'id']) || ''}`,
      }));
      const invoiceOut = relatedInvoices.map((r) => {
        const grandTotal = safeNum(r?.grand_total ?? r?.total_amount ?? r?.total ?? r?.amount ?? 0);
        const amountPaid = safeNum(r?.amount_paid ?? r?.paid_amount ?? r?.received_amount ?? 0);
        const balanceDue = safeNum(r?.balance_due ?? r?.pending_amount ?? r?.amount_due ?? Math.max(grandTotal - amountPaid, 0));
        return {
          invoice_number: maybeFields(r, ['invoice_number', 'id']) || '',
          agreement_number: maybeFields(r, ['agreement_number', 'agreement_id']) || '',
          status: maybeFields(r, ['status']) || '',
          invoice_date: maybeFields(r, ['invoice_date', 'created_at']) || '',
          due_date: maybeFields(r, ['due_date']) || '',
          grand_total: grandTotal,
          amount_paid: amountPaid,
          balance_due: balanceDue,
          payment_status: maybeFields(r, ['payment_status', 'status']) || '',
          deep_link: `#invoices?invoice_id=${maybeFields(r, ['invoice_number', 'id']) || ''}`,
        };
      });
      const receiptOut = relatedReceipts.map((r) => ({
        receipt_number: maybeFields(r, ['receipt_number', 'id']) || '',
        invoice_number: maybeFields(r, ['invoice_number', 'invoice_id']) || '',
        received_amount: safeNum(maybeFields(r, ['received_amount', 'amount', 'paid_amount'])),
        receipt_date: maybeFields(r, ['receipt_date', 'created_at']) || '',
        payment_status: maybeFields(r, ['payment_status', 'status']) || '',
        deep_link: `#receipts?receipt_id=${maybeFields(r, ['receipt_number', 'id']) || ''}`,
      }));

      const totalInvoiced = invoiceOut.reduce((a, b) => a + safeNum(b.grand_total), 0);
      const totalPaid = invoiceOut.reduce((a, b) => a + safeNum(b.amount_paid), 0);
      const totalDue = invoiceOut.reduce((a, b) => a + safeNum(b.balance_due), 0);
      const overdue = invoiceOut.filter((i) => safeNum(i.balance_due) > 0 && i.due_date && new Date(i.due_date).getTime() < Date.now()).length;
      const renewalSoon = renewalRows.filter((r) => r.renewal_due_date && (new Date(r.renewal_due_date).getTime() - Date.now()) <= 30 * 86400000).length;

      return {
        client: {
          name: maybeFields(baseClient, ['name', 'client_name', 'company_name', 'customer_name']) || query,
          legal_name: maybeFields(baseClient, ['legal_name', 'customer_legal_name']) || '',
          email: maybeFields(baseClient, ['email', 'contact_email']) || '',
          phone: maybeFields(baseClient, ['phone', 'mobile']) || '',
          country: maybeFields(baseClient, ['country']) || '',
          city: maybeFields(baseClient, ['city']) || '',
          address: maybeFields(baseClient, ['address']) || '',
          contact_name: maybeFields(baseClient, ['contact_name']) || '',
          contact_email: maybeFields(baseClient, ['contact_email', 'email']) || '',
          deep_link: `#clients?client_id=${maybeFields(baseClient, ['client_id', 'id']) || ''}&tab=overview`,
        },
        agreements: agreementOut,
        invoices: invoiceOut,
        receipts: receiptOut,
        renewals: renewalRows,
        onboarding: relatedOnboarding.map((r) => ({ onboarding_number: maybeFields(r, ['onboarding_number', 'id']) || '', agreement_number: maybeFields(r, ['agreement_number', 'agreement_id']) || '', status: maybeFields(r, ['status']) || '', assigned_csm: maybeFields(r, ['assigned_csm', 'assigned_to']) || '', locations: maybeFields(r, ['locations', 'location_name']) || '', deep_link: `#operations-onboarding?onboarding_id=${maybeFields(r, ['onboarding_number', 'id']) || ''}` })),
        technical_requests: relatedTech.map((r) => ({ request_number: maybeFields(r, ['request_number', 'id']) || '', agreement_number: maybeFields(r, ['agreement_number', 'agreement_id']) || '', status: maybeFields(r, ['status']) || '', location_name: maybeFields(r, ['location_name']) || '', assigned_to: maybeFields(r, ['assigned_to']) || '', deep_link: `#technical-admin-requests?request_id=${maybeFields(r, ['request_number', 'id']) || ''}` })),
        tickets: relatedTickets,
        totals: { agreements_count: agreementOut.length, invoices_count: invoiceOut.length, receipts_count: receiptOut.length, total_invoiced: totalInvoiced, total_paid: totalPaid, total_due: totalDue, active_locations: renewalRows.filter((r) => r.location_name).length, overdue_payments: overdue, renewal_due_soon: renewalSoon },
        note: !clientRows.length && (agreementOut.length || invoiceOut.length) ? 'No standalone client profile was found, but related agreements/invoices were found.' : undefined,
      };
    };

    const toolHandlers: Record<string, (args: any) => Promise<any>> = {
      search_erp_records: searchERP,
      search_by_client_name: (a) => getClientSummary({ query: a?.client_name || a?.query }),
      search_by_reference: async (a) => {
        const ref = normalizeText(a?.reference || '');
        if (!ref) return { error: 'reference is required' };
        const summary = await getClientSummary({ query: String(a?.reference || '') });
        const agreements = (summary?.agreements || []).filter((r: any) => normalizeText(r?.agreement_number).includes(ref));
        const invoices = (summary?.invoices || []).filter((r: any) => normalizeText(r?.invoice_number).includes(ref) || normalizeText(r?.agreement_number).includes(ref));
        const receipts = (summary?.receipts || []).filter((r: any) => normalizeText(r?.receipt_number).includes(ref) || normalizeText(r?.invoice_number).includes(ref));
        return { reference: a?.reference, agreements, invoices, receipts, onboarding: summary?.onboarding || [], technical_requests: summary?.technical_requests || [], renewals: summary?.renewals || [] };
      },
      get_unpaid_invoices: () => searchERP({ resource: 'invoices', status: 'unpaid', limit: MAX_LIMIT }),
      get_overdue_payments: () => searchERP({ resource: 'invoices', query: '', limit: MAX_LIMIT }),
      get_open_tickets: () => searchERP({ resource: 'tickets', status: 'open', limit: MAX_LIMIT }),
      get_open_technical_requests: () => searchERP({ resource: 'technical_admin_requests', status: 'open', limit: MAX_LIMIT }),
      get_pending_approval_proposals: () => searchERP({ resource: 'proposals', status: 'pending', limit: MAX_LIMIT }),
      get_onboarding_summary: () => searchERP({ resource: 'operations_onboarding', limit: MAX_LIMIT }),
      get_signed_agreements: () => searchERP({ resource: 'agreements', status: 'signed', limit: MAX_LIMIT }),
      get_expired_agreements: () => searchERP({ resource: 'agreements', status: 'expired', limit: MAX_LIMIT }),
      get_agreements_needing_invoice: () => searchERP({ resource: 'agreements', query: 'signed', limit: MAX_LIMIT }),
      get_client_summary: getClientSummary,
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
