import OpenAI from 'npm:openai@4.104.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const SYSTEM = `You are the InCheck360 AI Assistant. Answer read-only questions about ERP data in InCheck360. Use controlled data tools only. Do not invent records. Do not run or generate raw SQL. Do not perform write actions. Use business reference numbers instead of UUIDs. If data is missing, say what is missing.

Formatting rules:
- Never return long inline numbered paragraphs for record lists.
- If listing more than 2 records, use a markdown table.
- Start with a short summary sentence.
- Then show a table with useful columns.
- Keep answers concise and professional.
- Include reference number, customer/client, status, date, amount, and deep link when available.
- If there are more than 20 records, show the first 20 and say how many more exist.
- Use readable dates.
- Do not show UUIDs.

For signed agreements not invoiced:
- Summary: "Found {count} signed agreements without invoices."
- Table columns: Agreement | Client | Signed Date | Status | Link

For overdue payments:
- Table columns: Invoice | Client | Due Date | Pending Amount | Status | Link

For renewals:
- Table columns: Client | Location | Agreement | Invoice | Renewal Due Date | Renewal Status | Link

For technical requests:
- Table columns: Request | Client | Location | Status | Days Open | Link

For tickets:
- Table columns: Ticket | Title | Status | Dev Status | Related To | Link

For client summary (example: "Summarize GT Karting"):
- Use grouped sections with headings:
  - Client Overview
  - Agreements
  - Invoices
  - Receipts
  - Renewals / Payments

Sensitive ERP fields may be replaced with placeholders like CLIENT_001, CONTACT_001, ADDRESS_001, EMAIL_001, PHONE_001. Use these placeholders naturally in your answer. Do not ask for the real values. The system will restore the real values after your response.`;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const READONLY_BLOCK_MESSAGE = 'Action execution is not enabled yet. I can only provide read-only ERP information.';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64ToBytes(base64: string) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function bytesToBase64(bytes: ArrayBuffer | Uint8Array) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

async function getEncryptionKey() {
  const rawKey = Deno.env.get('AI_CHAT_ENCRYPTION_KEY');
  if (!rawKey) throw new Error('Missing AI_CHAT_ENCRYPTION_KEY');

  return crypto.subtle.importKey(
    'raw',
    base64ToBytes(rawKey),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptText(text: string) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(String(text || '')),
  );

  return {
    content_encrypted: bytesToBase64(encrypted),
    content_iv: bytesToBase64(iv),
    encryption_version: 'aes-gcm-v1',
  };
}

async function decryptText(row: { content_encrypted?: string; content_iv?: string; content?: string | null }) {
  if (!row?.content_encrypted || !row?.content_iv) return row?.content || '';

  const key = await getEncryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(row.content_iv) },
    key,
    base64ToBytes(row.content_encrypted),
  );

  return decoder.decode(decrypted);
}

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


function createPrivacyMasker() {
  const realToToken = new Map<string, string>();
  const tokenToReal = new Map<string, string>();

  const counters: Record<string, number> = {
    CLIENT: 0,
    CONTACT: 0,
    ADDRESS: 0,
    EMAIL: 0,
    PHONE: 0,
    SIGNATORY: 0,
    REGISTRATION: 0,
  };

  const fieldTypeMap: Record<string, string> = {
    customer_name: 'CLIENT',
    company_name: 'CLIENT',
    client_name: 'CLIENT',
    legal_name: 'CLIENT',
    name: 'CLIENT',
    display_name: 'CLIENT',
    customer_legal_name: 'CLIENT',
    contact_name: 'CONTACT',
    primary_contact_name: 'CONTACT',
    requested_by_name: 'CONTACT',
    assigned_to_name: 'CONTACT',
    authorized_signatory_name: 'SIGNATORY',
    signatory_name: 'SIGNATORY',
    email: 'EMAIL',
    contact_email: 'EMAIL',
    primary_contact_email: 'EMAIL',
    assigned_to_email: 'EMAIL',
    owner_email: 'EMAIL',
    sales_executive_email: 'EMAIL',
    phone: 'PHONE',
    mobile: 'PHONE',
    contact_phone: 'PHONE',
    primary_contact_phone: 'PHONE',
    address: 'ADDRESS',
    street_address: 'ADDRESS',
    billing_address: 'ADDRESS',
    city: 'ADDRESS',
    location_address: 'ADDRESS',
    registration_number: 'REGISTRATION',
    company_registration_number: 'REGISTRATION',
    tax_number: 'REGISTRATION',
    vat_number: 'REGISTRATION',
  };

  const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const phoneRegex = /\+?\d[\d\s().-]{6,}\d/g;

  function nextToken(type: string) {
    counters[type] = (counters[type] || 0) + 1;
    return `${type}_${String(counters[type]).padStart(3, '0')}`;
  }

  function add(value: unknown, type: string) {
    const real = String(value || '').trim();
    if (!real) return real;
    if (realToToken.has(real)) return realToToken.get(real)!;
    const token = nextToken(type);
    realToToken.set(real, token);
    tokenToReal.set(token, real);
    return token;
  }

  function registerTextEntities(text: unknown) {
    const value = String(text || '');
    for (const match of value.match(emailRegex) || []) add(match, 'EMAIL');
    for (const match of value.match(phoneRegex) || []) add(match, 'PHONE');
  }

  function maskText(text: unknown) {
    registerTextEntities(text);
    let output = String(text || '');
    const values = Array.from(realToToken.keys()).filter(Boolean).sort((a, b) => b.length - a.length);
    for (const real of values) {
      const token = realToToken.get(real);
      if (token) output = output.split(real).join(token);
    }
    return output;
  }

  function restoreText(text: unknown) {
    let output = String(text || '');
    const tokens = Array.from(tokenToReal.keys()).filter(Boolean).sort((a, b) => b.length - a.length);
    for (const token of tokens) {
      const real = tokenToReal.get(token);
      if (real) output = output.split(token).join(real);
    }
    return output;
  }

  function maskData(data: any): any {
    if (Array.isArray(data)) return data.map(maskData);
    if (!data || typeof data !== 'object') return data;

    const masked: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object') {
        masked[key] = maskData(value);
        continue;
      }

      const type = fieldTypeMap[key];
      if (type) {
        masked[key] = add(value, type);
        continue;
      }

      if (typeof value === 'string') {
        registerTextEntities(value);
        masked[key] = maskText(value);
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }

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
    const role = String(resolvedCurrentUser?.role_key || resolvedCurrentUser?.roleKey || resolvedCurrentUser?.role || resolvedCurrentUser?.user_role || '').trim().toLowerCase();
    if (role !== 'admin') return jsonResponse({ error: 'You do not have permission to use AI Assistant.' }, 403);

    const sid = session_id || crypto.randomUUID();
    const masker = createPrivacyMasker();
    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    await db.from('ai_chat_sessions').upsert({ id: sid, user_id: resolvedCurrentUser.id || '', title: 'AI Assistant', updated_at: new Date().toISOString() });
    const userId = resolvedCurrentUser.id || '';
    const messageText = String(message || '');
    const clientSummaryMatch = messageText.match(/\bsummarize\s+(.+)/i);
    if (clientSummaryMatch?.[1]) masker.add(clientSummaryMatch[1].trim(), 'CLIENT');
    const encryptedUserMessage = await encryptText(messageText);

    await db.from('ai_chat_messages').insert({
      session_id: sid,
      user_id: userId,
      role: 'user',
      content: '[encrypted]',
      content_encrypted: encryptedUserMessage.content_encrypted,
      content_iv: encryptedUserMessage.content_iv,
      encryption_version: encryptedUserMessage.encryption_version,
    });

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
      const encryptedAssistantBlockMessage = await encryptText(READONLY_BLOCK_MESSAGE);
      await db.from('ai_chat_messages').insert({
        session_id: sid,
        user_id: userId,
        role: 'assistant',
        content: '[encrypted]',
        content_encrypted: encryptedAssistantBlockMessage.content_encrypted,
        content_iv: encryptedAssistantBlockMessage.content_iv,
        encryption_version: encryptedAssistantBlockMessage.encryption_version,
      });
      return jsonResponse({ ok: true, answer: READONLY_BLOCK_MESSAGE, session_id: sid }, 200);
    }

    const tools = Object.keys(toolHandlers).map((name) => ({ type: 'function' as const, name, description: name, parameters: { type: 'object', properties: { resource: { type: 'string' }, query: { type: 'string' }, status: { type: 'string' }, client_name: { type: 'string' }, reference: { type: 'string' }, date_from: { type: 'string' }, date_to: { type: 'string' }, limit: { type: 'number' }, days: { type: 'number' } } } }));

    const maskedUserMessage = masker.maskText(messageText);
    let response = await openai.responses.create({ model: 'gpt-4.1-mini', input: [{ role: 'system', content: SYSTEM }, { role: 'user', content: maskedUserMessage }], tools });
    const toolOutputs: any[] = [];
    for (const item of response.output || []) {
      if (item.type !== 'function_call') continue;
      const handler = toolHandlers[item.name];
      const parsedArgs = JSON.parse(item.arguments || '{}');
      const args = JSON.parse(masker.restoreText(JSON.stringify(parsedArgs)));
      const result = handler ? await handler(args) : { error: `Unknown tool ${item.name}` };
      const maskedResult = masker.maskData(result);
      toolOutputs.push({ type: 'function_call_output', call_id: item.call_id, output: JSON.stringify(maskedResult) });
    }
    if (toolOutputs.length) response = await openai.responses.create({ model: 'gpt-4.1-mini', previous_response_id: response.id, input: toolOutputs });

    const maskedAnswer = response.output_text || 'No data found from allowed tools.';
    let answer = masker.restoreText(maskedAnswer);
    if (/"truncated":true/.test(answer)) answer += '\n\nShowing first 100 records.';
    const encryptedAssistantMessage = await encryptText(answer);
    await db.from('ai_chat_messages').insert({
      session_id: sid,
      user_id: userId,
      role: 'assistant',
      content: '[encrypted]',
      content_encrypted: encryptedAssistantMessage.content_encrypted,
      content_iv: encryptedAssistantMessage.content_iv,
      encryption_version: encryptedAssistantMessage.encryption_version,
    });
    return jsonResponse({ ok: true, answer, session_id: sid, privacy_mode: 'masked_before_openai' }, 200);
  } catch (error) {
    console.error('[incheck360-ai-assistant] failed', error);
    return jsonResponse({ error: error?.message || String(error) }, 500);
  }
});
