import OpenAI from 'npm:openai@4.104.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-5.6-luna';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_SCAN_ROWS = 1000;
const MAX_MESSAGE_CHARS = 12000;

const ERP_WRITE_ACTIONS: Record<string, string[]> = {
  companies: ['create', 'update', 'delete', 'verify', 'verify_company'],
  contacts: ['create', 'update', 'delete'],
  leads: ['create', 'update', 'delete', 'convert', 'convert_to_deal'],
  deals: ['create', 'update', 'delete'],
  proposal_catalog: ['create', 'update', 'delete'],
  proposals: ['create', 'save', 'update', 'delete', 'create_from_deal', 'accept_expired'],
  agreements: ['create', 'update', 'delete', 'create_from_proposal', 'send_to_operations', 'request_incheck_lite', 'request_incheck_full', 'assign_csm', 'update_onboarding_status'],
  clients: ['create', 'update', 'delete', 'create_proposal', 'create_agreement', 'create_invoice', 'create_from_previous_agreement'],
  invoices: ['create', 'update', 'delete', 'create_from_agreement', 'create_payment_schedule', 'recalculate_payment_schedule', 'save_payment_schedule', 'update_payment_schedule_reminder', 'create_operations_onboarding'],
  receipts: ['create', 'update', 'delete', 'create_from_invoice'],
  credit_notes: ['create', 'cancel', 'recalculate_invoice_totals'],
  tickets: ['create', 'update', 'delete'],
  events: ['create', 'update', 'delete'],
  csm: ['create', 'update', 'delete'],
  operations_onboarding: ['create', 'update', 'delete', 'assign_csm'],
  technical_admin_requests: ['create', 'update', 'update_status', 'delete'],
  payment_forecast: ['save_followup', 'mark_followed_up', 'create_followup_log', 'add_followup_note'],
  biners: ['create', 'update', 'delete', 'record_scheduled_payment'],
  workflow: ['create_approval', 'request_approval', 'approve', 'reject'],
  communication_centre_messages: ['update_message', 'soft_delete_message']
};
const ALWAYS_CONFIRM_ACTIONS = new Set(['delete','cancel','approve','reject','accept_expired','create_from_agreement','create_from_invoice','create_invoice','create_agreement','create_proposal']);
const FINANCIAL_OR_LEGAL_RESOURCES = new Set(['proposals','agreements','invoices','receipts','credit_notes','workflow','biners']);
const ACTION_POLICY_TEXT = Object.entries(ERP_WRITE_ACTIONS).map(([resource, actions]) => `${resource}: ${actions.join(', ')}`).join('\n');

const SYSTEM = `You are the InCheck360 ERP AI Assistant.
Your job is to understand the signed-in user's request, inspect ERP data with read tools, and when requested, plan controlled ERP actions.

Rules:
1. Never write directly to the database. For a requested change, call execute_erp_action. The authenticated ERP client will execute it using the user's real permissions and existing business rules.
2. Before a write, inspect the relevant record when needed. Never invent UUIDs, business references, client names, amounts, statuses, dates, or IDs.
3. Use business reference numbers in your response (Proposal#..., Agreement#..., SA/..., RV/..., etc.) whenever available.
4. If required data is missing, ask for exactly what is missing instead of guessing.
5. Security administration is excluded: never propose changes to users, roles, role_permissions, authentication, secrets, RLS, or API keys.
6. For destructive, financial, legal, approval, or irreversible actions, mark risk=high and requires_confirmation=true.
7. For normal operational edits, use risk=medium or low. A user's explicit request to change data is authorization to plan the action, but the ERP permission layer remains authoritative.
8. One execute_erp_action call must represent one ERP resource/action pair. Multiple calls are allowed for multi-step workflows.
9. payload_json must be valid JSON matching the existing ERP Api.requestWithSession(resource, action, payload) conventions.
10. Never put raw SQL in an action.
11. You may only use these controlled ERP action pairs:
${ACTION_POLICY_TEXT}

Examples:
- "Create invoice from Agreement#00120" -> inspect agreement -> execute_erp_action resource=invoices action=create_from_agreement payload_json={"agreement_id":"..."} risk=high confirmation=true.
- "Mark Proposal#00058 accepted" -> inspect proposal -> execute_erp_action resource=proposals action=update payload_json={"id":"...","updates":{"status":"accepted"}} risk=high confirmation=true.
- "Change lead follow-up to tomorrow" -> inspect lead -> execute_erp_action resource=leads action=update with the resolved id and updates.

When action results are supplied to you, summarize what actually succeeded, failed, was blocked, or was cancelled. Never claim success unless the result says success.`;

const ERP_CATALOG = [
  'companies','contacts','clients','leads','deals','proposals','proposal_items','proposal_catalog_items',
  'agreements','agreement_items','invoices','invoice_items','receipts','receipt_items','credit_notes','tickets','events',
  'operations_onboarding','technical_admin_requests','notifications','workflow_approvals','biners_entries','csm_activities'
];

const RESOURCE_ALIASES: Record<string, string[]> = {
  company: ['companies'], companies: ['companies'], customer: ['companies','clients'], client: ['clients','companies'],
  contact: ['contacts'], lead: ['leads'], deal: ['deals'], proposal: ['proposals'], quote: ['proposals'],
  agreement: ['agreements'], contract: ['agreements'], invoice: ['invoices'], receipt: ['receipts'],
  'credit note': ['credit_notes'], ticket: ['tickets'], event: ['events'], onboarding: ['operations_onboarding'],
  'technical request': ['technical_admin_requests'], workflow: ['workflow_approvals'], approval: ['workflow_approvals'],
  biners: ['biners_entries'], payable: ['biners_entries'], csm: ['csm_activities']
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
const normalizeLimit = (n?: number) => Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(n) ? Number(n) : DEFAULT_LIMIT));
const safeNum = (v: unknown) => Number(v ?? 0) || 0;
const normalizeText = (value: unknown) => String(value ?? '').toLowerCase().trim().replace(/[^\p{L}\p{N}\s\-_.#\/]/gu, ' ').replace(/\s+/g, ' ');
const maybeFields = (row: any, fields: string[]) => fields.map(f => row?.[f]).find(v => v !== null && v !== undefined && String(v).trim() !== '');
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let encryptionKeyPromise: Promise<CryptoKey> | null = null;

const bytesToBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const base64ToBytes = (base64: string) => Uint8Array.from(atob(base64), c => c.charCodeAt(0));

async function getEncryptionKey() {
  if (encryptionKeyPromise) return encryptionKeyPromise;
  const keyRaw = Deno.env.get('AI_CHAT_ENCRYPTION_KEY') || Deno.env.get('CHAT_ENCRYPTION_KEY') || '';
  if (!keyRaw) throw new Error('Missing AI chat encryption key');
  const keyBytes = keyRaw.includes('=') ? base64ToBytes(keyRaw) : encoder.encode(keyRaw.padEnd(32, '0').slice(0, 32));
  encryptionKeyPromise = crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return encryptionKeyPromise;
}

async function encryptText(plainText: string) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plainText));
  return { content_encrypted: bytesToBase64(new Uint8Array(encrypted)), content_iv: bytesToBase64(iv) };
}
async function decryptText(row: any) {
  if (!row?.content_encrypted || !row?.content_iv) return row?.content && row.content !== '[encrypted]' ? String(row.content) : '';
  const key = await getEncryptionKey();
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(row.content_iv) }, key, base64ToBytes(row.content_encrypted));
  return decoder.decode(decrypted);
}

async function ensureSession(db: any, sessionId: string, user: any) {
  const { data } = await db.from('ai_chat_sessions').select('id').eq('id', sessionId).maybeSingle();
  if (data?.id) {
    await db.from('ai_chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);
    return;
  }
  const { error } = await db.from('ai_chat_sessions').insert({ id: sessionId, user_id: user?.id || null, user_email: user?.email || null, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Unable to create AI chat session: ${error.message}`);
}

async function loadRecentChatHistory(db: any, sessionId: string, limit = 14) {
  if (!sessionId) return [];
  const { data, error } = await db.from('ai_chat_messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(limit);
  if (error) return [];
  const rows = [...(data || [])].reverse();
  const history: any[] = [];
  for (const row of rows) {
    try {
      const content = await decryptText(row);
      if (!content) continue;
      history.push({ role: row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : 'system', content });
    } catch (error) {
      console.warn('[AI Assistant] chat decrypt failed', error);
    }
  }
  return history;
}

async function saveChatMessage(db: any, sid: string, role: 'user' | 'assistant' | 'system', content: string, user: any) {
  const encrypted = await encryptText(content);
  const { error } = await db.from('ai_chat_messages').insert({
    session_id: sid,
    role,
    content: '[encrypted]',
    content_encrypted: encrypted.content_encrypted,
    content_iv: encrypted.content_iv,
    user_id: user?.id || null,
    user_email: user?.email || null
  });
  if (error) console.warn('[AI Assistant] unable to save chat message', error.message);
}

function normalizeErpRow(resource: string, row: any) {
  const reference = maybeFields(row, ['reference','company_id','contact_id','lead_id','deal_id','proposal_id','proposal_number','agreement_id','agreement_number','invoice_id','invoice_number','receipt_id','receipt_number','credit_note_id','credit_note_number','ticket_id','request_id','onboarding_id','id']) || '';
  return {
    resource,
    id: String(row?.id || ''),
    reference: String(reference || ''),
    title: String(maybeFields(row, ['title','name','subject','description','item_name']) || ''),
    customer_name: String(maybeFields(row, ['customer_name','client_name','company_name','customer_legal_name']) || ''),
    status: String(maybeFields(row, ['status','payment_state','payment_status','approval_status','request_status','onboarding_status','dev_team_status']) || ''),
    date: String(maybeFields(row, ['updated_at','created_at','date','due_date','invoice_date','receipt_date','renewal_date','follow_up_date']) || ''),
    amount: safeNum(maybeFields(row, ['amount','total','grand_total','total_amount','balance_due','line_total'])),
    currency: String(maybeFields(row, ['currency']) || ''),
    raw: row
  };
}

function createPrivacyMasker() {
  const realToToken = new Map<string,string>();
  const tokenToReal = new Map<string,string>();
  let count = 0;
  const add = (value: unknown, type = 'MASK') => {
    const real = String(value || '').trim();
    if (!real) return real;
    if (realToToken.has(real)) return realToToken.get(real)!;
    const token = `${type}_${String(++count).padStart(3, '0')}`;
    realToToken.set(real, token); tokenToReal.set(token, real); return token;
  };
  const maskData = (data: any): any => Array.isArray(data)
    ? data.map(maskData)
    : (!data || typeof data !== 'object'
      ? data
      : Object.fromEntries(Object.entries(data).map(([k,v]) => [k,
        typeof v === 'string'
          ? (/email/i.test(k) ? add(v,'EMAIL') : /phone|mobile/i.test(k) ? add(v,'PHONE') : /(name|client|company|contact|signatory|address|registration)/i.test(k) ? add(v,'CLIENT') : v)
          : maskData(v)
      ])));
  const restoreText = (text: unknown) => {
    let out = String(text || '');
    for (const [token, real] of tokenToReal.entries()) out = out.split(token).join(real);
    return out;
  };
  return { maskData, restoreText };
}

async function resolveAuthenticatedUser(req: Request, serviceDb: any) {
  const authHeader = String(req.headers.get('authorization') || '');
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw Object.assign(new Error('Authentication required.'), { status: 401 });
  const { data, error } = await serviceDb.auth.getUser(token);
  if (error || !data?.user) throw Object.assign(new Error('Invalid or expired session.'), { status: 401 });
  const user = data.user;
  const { data: profile } = await serviceDb.from('profiles').select('id,email,name,role_key,is_active').eq('id', user.id).maybeSingle();
  if (profile?.is_active === false) throw Object.assign(new Error('Your ERP user is inactive.'), { status: 403 });
  const role = String(profile?.role_key || user.app_metadata?.role_key || user.app_metadata?.role || '').trim().toLowerCase();
  // V1 is admin-only because read tools use the service-role client. Do not widen this gate
  // until read tools are switched to a user-scoped Supabase client with RLS enforcement.
  if (role !== 'admin') throw Object.assign(new Error('AI Assistant action mode is admin-only.'), { status: 403 });
  return { ...user, ...(profile || {}), role_key: role };
}

function safeActionResultForModel(results: any[]) {
  return (Array.isArray(results) ? results : []).map(row => ({
    action_id: String(row?.action_id || ''),
    status: String(row?.status || ''),
    resource: String(row?.resource || ''),
    action: String(row?.action || ''),
    result: row?.result ?? null,
    error: row?.error ? String(row.error) : null,
    message: row?.message ? String(row.message) : null
  }));
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed. Use POST.' }, 405);

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!OPENAI_API_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: 'Missing required Edge Function secrets.' }, 500);

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const user = await resolveAuthenticatedUser(req, db);
    const body = await req.json().catch(() => ({}));
    const messageText = String(body?.message || '').trim();
    if (!messageText) return jsonResponse({ error: 'Message is required.' }, 400);
    if (messageText.length > MAX_MESSAGE_CHARS) return jsonResponse({ error: `Message is too long. Maximum ${MAX_MESSAGE_CHARS} characters.` }, 400);

    const sid = String(body?.session_id || crypto.randomUUID());
    await ensureSession(db, sid, user);
    const previousHistory = await loadRecentChatHistory(db, sid, 14);
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const masker = createPrivacyMasker();

    const actionResults = Array.isArray(body?.action_results) ? safeActionResultForModel(body.action_results) : null;
    const requestedPlanId = String(body?.plan_id || '').trim();
    if (actionResults) {
      if (requestedPlanId) {
        for (const result of actionResults) {
          if (!result.action_id) continue;
          await db.from('ai_action_audit').update({
            status: result.status || 'unknown',
            result_json: result,
            completed_at: new Date().toISOString()
          }).eq('plan_id', requestedPlanId).eq('action_id', result.action_id).eq('user_id', user.id);
        }
      }
    } else {
      await saveChatMessage(db, sid, 'user', messageText, user);
    }

    const safeSelect = async (table: string, limit = MAX_SCAN_ROWS) => {
      const { data, error } = await db.from(table).select('*').limit(limit);
      if (error) return { table, rows: [], warning: `Resource unavailable: ${table}` };
      return { table, rows: data || [] };
    };

    const searchErpRecords = async (args: any) => {
      const limit = normalizeLimit(args?.limit);
      const resourceIn = normalizeText(args?.resource || '');
      const tables = resourceIn ? (ERP_CATALOG.includes(resourceIn) ? [resourceIn] : (RESOURCE_ALIASES[resourceIn] || [])) : ERP_CATALOG;
      const out: any[] = [];
      const warnings: string[] = [];
      for (const table of tables) {
        const selected = await safeSelect(table, MAX_SCAN_ROWS);
        if (selected.warning) warnings.push(selected.warning);
        for (const row of selected.rows) {
          const haystack = JSON.stringify(row).toLowerCase();
          if (args?.query && !haystack.includes(String(args.query).toLowerCase())) continue;
          if (args?.reference && !haystack.includes(String(args.reference).toLowerCase())) continue;
          if (args?.status && !haystack.includes(String(args.status).toLowerCase())) continue;
          if (args?.date_from || args?.date_to) {
            const d = new Date(maybeFields(row, ['date','due_date','invoice_date','receipt_date','renewal_date','follow_up_date','created_at','updated_at']) || '').getTime();
            if (Number.isFinite(d)) {
              if (args?.date_from && d < new Date(args.date_from).getTime()) continue;
              if (args?.date_to && d > new Date(args.date_to).getTime()) continue;
            }
          }
          out.push(normalizeErpRow(table, row));
        }
      }
      return { rows: out.slice(0, limit), total: out.length, warnings };
    };

    const getByReference = async (reference: string) => searchErpRecords({ reference, limit: MAX_LIMIT });
    const getClientSummary = async (query: string) => searchErpRecords({ query, limit: MAX_LIMIT });
    const getErpOverview = async () => ({
      overdue_payments: (await searchErpRecords({ resource: 'invoices', query: 'overdue', limit: 40 })).rows,
      open_tickets: (await searchErpRecords({ resource: 'tickets', query: 'open', limit: 40 })).rows,
      pending_proposals: (await searchErpRecords({ resource: 'proposals', query: 'pending', limit: 40 })).rows,
      open_technical_requests: (await searchErpRecords({ resource: 'technical request', query: 'open', limit: 40 })).rows
    });

    const readTools: Record<string,(args:any)=>Promise<any>> = {
      search_erp_records: args => searchErpRecords(args || {}),
      get_record_by_reference: args => getByReference(args?.reference || ''),
      get_client_summary: args => getClientSummary(args?.query || args?.client_name || ''),
      get_erp_overview: () => getErpOverview()
    };

    const tools: any[] = [
      {
        type: 'function',
        name: 'search_erp_records',
        description: 'Search ERP records by resource, text, reference, status, or date range. Use before actions when you need the exact record or ID.',
        strict: true,
        parameters: {
          type: 'object', additionalProperties: false,
          properties: {
            resource: { type: ['string','null'] }, query: { type: ['string','null'] }, reference: { type: ['string','null'] },
            status: { type: ['string','null'] }, date_from: { type: ['string','null'] }, date_to: { type: ['string','null'] }, limit: { type: ['number','null'] }
          },
          required: ['resource','query','reference','status','date_from','date_to','limit']
        }
      },
      {
        type: 'function', name: 'get_record_by_reference',
        description: 'Find records related to a business reference such as Agreement#00120, Proposal#00058, SA/2026/71, RV/2026/52, or a ticket reference.',
        strict: true,
        parameters: { type: 'object', additionalProperties: false, properties: { reference: { type: 'string' } }, required: ['reference'] }
      },
      {
        type: 'function', name: 'get_client_summary', description: 'Search all relevant ERP data for a client/company name.', strict: true,
        parameters: { type: 'object', additionalProperties: false, properties: { query: { type: 'string' } }, required: ['query'] }
      },
      {
        type: 'function', name: 'get_erp_overview', description: 'Return a compact ERP operational overview.', strict: true,
        parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] }
      },
      {
        type: 'function',
        name: 'execute_erp_action',
        description: 'Plan one controlled ERP write action. The browser will validate and execute it through the existing authenticated ERP action layer. Never use for users, roles, permissions, auth, secrets, RLS, or SQL.',
        strict: true,
        parameters: {
          type: 'object', additionalProperties: false,
          properties: {
            resource: { type: 'string', enum: ['companies','contacts','leads','deals','proposal_catalog','proposals','agreements','clients','invoices','receipts','credit_notes','tickets','events','csm','operations_onboarding','technical_admin_requests','payment_forecast','biners','workflow','communication_centre_messages'] },
            action: { type: 'string' },
            payload_json: { type: 'string', description: 'Valid JSON object passed to Api.requestWithSession(resource, action, payload).' },
            summary: { type: 'string' },
            reason: { type: 'string' },
            risk: { type: 'string', enum: ['low','medium','high'] },
            requires_confirmation: { type: 'boolean' }
          },
          required: ['resource','action','payload_json','summary','reason','risk','requires_confirmation']
        }
      }
    ];

    const continuationPrompt = actionResults
      ? `Continue completing the original ERP request below. The listed ERP action results are the source of truth. Do not repeat an action that already succeeded or was cancelled. If more work is required, inspect the updated ERP state and propose the next single controlled action. If the request is complete or cannot proceed, answer with a concise final summary.\n\nOriginal request: ${messageText}\n\nERP action results:\n${JSON.stringify(masker.maskData(actionResults))}`
      : messageText;

    let response = await openai.responses.create({
      model: MODEL,
      input: [{ role: 'system', content: SYSTEM }, ...previousHistory, { role: 'user', content: continuationPrompt }],
      tools,
      parallel_tool_calls: false
    });

    const planId = requestedPlanId || crypto.randomUUID();
    const pendingActions: any[] = [];

    for (let step = 0; step < 6; step += 1) {
      const readOutputs: any[] = [];
      let sawFunctionCall = false;
      for (const item of response.output || []) {
        if (item.type !== 'function_call') continue;
        sawFunctionCall = true;
        let args: any = {};
        try { args = JSON.parse(item.arguments || '{}'); } catch { args = {}; }

        if (item.name === 'execute_erp_action') {
          const resource = String(args.resource || '').trim().toLowerCase();
          const actionName = String(args.action || '').trim().toLowerCase();
          const allowedActions = ERP_WRITE_ACTIONS[resource] || [];
          if (!allowedActions.includes(actionName)) {
            readOutputs.push({
              type: 'function_call_output',
              call_id: item.call_id,
              output: JSON.stringify({
                error: `Unsupported controlled ERP action: ${resource}:${actionName}`,
                allowed_actions: allowedActions
              })
            });
            continue;
          }
          const parsedPayload = safeJson(String(args.payload_json || '{}'));
          if (parsedPayload?._invalid_json || !parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
            readOutputs.push({
              type: 'function_call_output',
              call_id: item.call_id,
              output: JSON.stringify({ error: 'payload_json must be a valid JSON object.' })
            });
            continue;
          }
          const forcedConfirmation = FINANCIAL_OR_LEGAL_RESOURCES.has(resource) || ALWAYS_CONFIRM_ACTIONS.has(actionName);
          const actionId = crypto.randomUUID();
          const action = {
            action_id: actionId,
            resource,
            action: actionName,
            payload_json: JSON.stringify(parsedPayload),
            summary: String(args.summary || ''),
            reason: String(args.reason || ''),
            risk: forcedConfirmation ? 'high' : String(args.risk || 'medium'),
            requires_confirmation: forcedConfirmation || args.requires_confirmation === true
          };
          pendingActions.push(action);
          await db.from('ai_action_audit').insert({
            plan_id: planId,
            action_id: actionId,
            session_id: sid,
            user_id: user.id,
            user_email: user.email || null,
            user_role: user.role_key || null,
            resource: action.resource,
            action: action.action,
            payload_json: parsedPayload,
            summary: action.summary,
            risk: action.risk,
            requires_confirmation: action.requires_confirmation,
            status: 'planned'
          });
          continue;
        }

        const tool = readTools[item.name];
        if (!tool) {
          readOutputs.push({ type: 'function_call_output', call_id: item.call_id, output: JSON.stringify({ error: `Unknown read tool: ${item.name}` }) });
          continue;
        }
        const result = await tool(args);
        readOutputs.push({ type: 'function_call_output', call_id: item.call_id, output: JSON.stringify(masker.maskData(result)) });
      }

      if (pendingActions.length) {
        return jsonResponse({
          ok: true,
          answer: null,
          pending_actions: pendingActions,
          plan_id: planId,
          session_id: sid,
          model: MODEL,
          privacy_mode: 'user_prompt_to_openai_tool_results_masked'
        }, 200);
      }

      if (readOutputs.length) {
        response = await openai.responses.create({ model: MODEL, previous_response_id: response.id, input: readOutputs, tools, parallel_tool_calls: false });
        continue;
      }

      if (!sawFunctionCall) break;
    }

    const answer = masker.restoreText(response.output_text || 'I could not complete that request with the available ERP tools.');
    await saveChatMessage(db, sid, 'assistant', answer, user);
    return jsonResponse({ ok: true, answer, pending_actions: [], plan_id: planId, session_id: sid, model: MODEL, privacy_mode: 'user_prompt_to_openai_tool_results_masked' }, 200);
  } catch (error) {
    console.error('[incheck360-ai-assistant] failed', error);
    const status = Number((error as any)?.status || 500);
    return jsonResponse({ error: (error as any)?.message || String(error) }, status >= 400 && status < 600 ? status : 500);
  }
});

function safeJson(value: string) {
  try { return JSON.parse(String(value || '{}')); } catch { return { _invalid_json: String(value || '') }; }
}
