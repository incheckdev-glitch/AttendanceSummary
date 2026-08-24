import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-5.6-luna';
const MAX_MESSAGE_CHARS = 12000;
const MAX_ROWS_PER_TABLE = 1000;
const MAX_RESULTS = 100;

const WRITE_ACTIONS: Record<string, string[]> = {
  companies: ['create','update','delete','verify','verify_company'],
  contacts: ['create','update','delete'],
  leads: ['create','update','delete','convert','convert_to_deal'],
  deals: ['create','update','delete'],
  proposal_catalog: ['create','update','delete'],
  proposals: ['create','save','update','delete','create_from_deal','accept_expired'],
  agreements: ['create','update','delete','create_from_proposal','send_to_operations','request_incheck_lite','request_incheck_full','assign_csm','update_onboarding_status'],
  clients: ['create','update','delete','create_proposal','create_agreement','create_invoice','create_from_previous_agreement'],
  invoices: ['create','update','delete','create_from_agreement','create_payment_schedule','recalculate_payment_schedule','save_payment_schedule','update_payment_schedule_reminder','create_operations_onboarding'],
  receipts: ['create','update','delete','create_from_invoice'],
  credit_notes: ['create','cancel','recalculate_invoice_totals'],
  tickets: ['create','update','delete'],
  events: ['create','update','delete'],
  csm: ['create','update','delete'],
  operations_onboarding: ['create','update','delete','assign_csm'],
  technical_admin_requests: ['create','update','update_status','delete'],
  payment_forecast: ['save_followup','mark_followed_up','create_followup_log','add_followup_note'],
  biners: ['create','update','delete','record_scheduled_payment'],
  workflow: ['create_approval','request_approval','approve','reject'],
  communication_centre_messages: ['update_message','soft_delete_message']
};

const READ_TABLES = [
  'companies','contacts','clients','leads','deals','proposals','proposal_items','proposal_catalog_items',
  'agreements','agreement_items','invoices','invoice_items','invoice_payment_schedule','receipts','receipt_items',
  'credit_notes','tickets','events','operations_onboarding','technical_admin_requests','workflow_approvals',
  'biners_entries','biners_payment_schedules','csm_activities','payment_forecast_followups'
];

const ALIASES: Record<string, string[]> = {
  company:['companies'], companies:['companies'], customer:['companies','clients'], client:['clients','companies'],
  contact:['contacts'], lead:['leads'], deal:['deals'], proposal:['proposals'], quote:['proposals'],
  agreement:['agreements'], contract:['agreements'], invoice:['invoices'], receipt:['receipts'],
  'credit note':['credit_notes'], ticket:['tickets'], event:['events'], onboarding:['operations_onboarding'],
  'technical request':['technical_admin_requests'], workflow:['workflow_approvals'], approval:['workflow_approvals'],
  biners:['biners_entries','biners_payment_schedules'], payable:['biners_entries','biners_payment_schedules'],
  csm:['csm_activities'], 'payment forecast':['payment_forecast_followups']
};

const HIGH_RISK_RESOURCES = new Set(['proposals','agreements','invoices','receipts','credit_notes','workflow','biners']);
const HIGH_RISK_ACTIONS = new Set(['delete','cancel','approve','reject','accept_expired','create_from_agreement','create_from_invoice','create_invoice','create_agreement','create_proposal']);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const respond = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type':'application/json' } });

function adminKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return parsed.default || Object.values(parsed)[0] || '';
  } catch { return ''; }
}

function jsonObject(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

function normalizeResource(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
}

function normalizeCompanyFields(input: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...input };
  const candidate = out.company_name ?? out.companyName ?? out.name;
  if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
    out.company_name = String(candidate).trim();
  }
  delete out.companyName;
  delete out.name;
  return out;
}

function normalizeActionPayload(resource: string, action: string, payload: Record<string, unknown>) {
  if (resource !== 'companies') return payload;

  if (action === 'create') {
    return normalizeCompanyFields(payload);
  }

  if (action === 'update') {
    const out: Record<string, unknown> = { ...payload };
    if (out.updates && typeof out.updates === 'object' && !Array.isArray(out.updates)) {
      out.updates = normalizeCompanyFields(out.updates as Record<string, unknown>);
    } else {
      return normalizeCompanyFields(out);
    }
    return out;
  }

  return payload;
}

function base64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function bytes(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
const enc = new TextEncoder();
const dec = new TextDecoder();
let cryptoKey: Promise<CryptoKey> | null = null;
async function chatKey() {
  if (cryptoKey) return cryptoKey;
  const raw = Deno.env.get('AI_CHAT_ENCRYPTION_KEY') || '';
  if (!raw) throw new Error('Missing AI_CHAT_ENCRYPTION_KEY');
  let keyBytes: Uint8Array;
  try { keyBytes = bytes(raw); } catch { keyBytes = enc.encode(raw.padEnd(32,'0').slice(0,32)); }
  if (![16,24,32].includes(keyBytes.length)) keyBytes = enc.encode(raw.padEnd(32,'0').slice(0,32));
  cryptoKey = crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt','decrypt']);
  return cryptoKey;
}
async function encrypt(text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, await chatKey(), enc.encode(text));
  return { content_encrypted: base64(new Uint8Array(out)), content_iv: base64(iv) };
}
async function decrypt(row: any) {
  if (!row?.content_encrypted || !row?.content_iv) return '';
  const out = await crypto.subtle.decrypt({ name:'AES-GCM', iv:bytes(row.content_iv) }, await chatKey(), bytes(row.content_encrypted));
  return dec.decode(out);
}

async function openai(body: any) {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new Error('Missing OPENAI_API_KEY');
  const r = await fetch('https://api.openai.com/v1/responses', {
    method:'POST',
    headers:{ 'content-type':'application/json', authorization:`Bearer ${key}` },
    body:JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `OpenAI request failed (${r.status})`);
  return data;
}

function outputText(response: any) {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) return response.output_text.trim();
  const parts: string[] = [];
  for (const item of response?.output || []) {
    if (item?.type !== 'message') continue;
    for (const c of item?.content || []) if (c?.type === 'output_text' && c?.text) parts.push(c.text);
  }
  return parts.join('\n').trim();
}

async function resolveAdmin(req: Request, db: any) {
  const token = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i,'').trim();
  if (!token) throw Object.assign(new Error('Authentication required.'), { status:401 });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw Object.assign(new Error('Invalid or expired session.'), { status:401 });
  const user = data.user;
  const { data: profile, error: profileError } = await db.from('profiles').select('id,email,name,role_key,is_active').eq('id', user.id).maybeSingle();
  if (profileError) throw Object.assign(new Error('Unable to verify ERP profile.'), { status:403 });
  if (!profile || profile.is_active === false) throw Object.assign(new Error('ERP user is inactive or missing.'), { status:403 });
  if (String(profile.role_key || '').toLowerCase() !== 'admin') throw Object.assign(new Error('AI Assistant action mode is admin-only.'), { status:403 });
  return { id:user.id, email:user.email || profile.email || null, name:profile.name || null, role_key:'admin' };
}

async function ensureSession(db:any, sessionId:string, user:any) {
  const { data } = await db.from('ai_chat_sessions').select('id').eq('id', sessionId).maybeSingle();
  if (data?.id) {
    await db.from('ai_chat_sessions').update({ updated_at:new Date().toISOString() }).eq('id',sessionId);
    return;
  }
  const { error } = await db.from('ai_chat_sessions').insert({ id:sessionId, user_id:user.id, user_email:user.email, updated_at:new Date().toISOString() });
  if (error) throw new Error(`Unable to create AI chat session: ${error.message}`);
}

async function saveMessage(db:any, sessionId:string, role:'user'|'assistant', text:string, user:any) {
  const encrypted = await encrypt(text);
  const { error } = await db.from('ai_chat_messages').insert({ session_id:sessionId, user_id:user.id, user_email:user.email, role, content:'[encrypted]', ...encrypted });
  if (error) console.warn('AI chat save failed', error.message);
}

async function history(db:any, sessionId:string) {
  const { data } = await db.from('ai_chat_messages').select('*').eq('session_id',sessionId).order('created_at',{ascending:false}).limit(12);
  const rows = [...(data || [])].reverse();
  const out:any[] = [];
  for (const row of rows) {
    try {
      const text = await decrypt(row);
      if (text && (row.role === 'user' || row.role === 'assistant')) out.push({ role:row.role, content:text });
    } catch {}
  }
  return out;
}

function matchTable(resource:string) {
  if (!resource) return READ_TABLES;
  const raw = resource.replace(/\s+/g,'_');
  if (READ_TABLES.includes(raw)) return [raw];
  return ALIASES[resource] || [];
}

function compactRow(table:string, row:any) {
  const keep = [
    'id','company_id','contact_id','lead_id','deal_id','proposal_id','proposal_number','agreement_id','agreement_number',
    'invoice_id','invoice_number','receipt_id','receipt_number','credit_note_id','credit_note_number','ticket_id','request_id','onboarding_id',
    'name','title','subject','customer_name','client_name','company_name','status','payment_state','payment_status','approval_status',
    'created_at','updated_at','date','due_date','invoice_date','receipt_date','follow_up_date','service_start_date','service_end_date',
    'currency','amount','total','grand_total','total_amount','balance_due','billing_frequency','payment_terms','notes'
  ];
  const record:any = {};
  for (const k of keep) if (row?.[k] !== undefined && row?.[k] !== null) record[k] = row[k];
  return { resource:table, record };
}

async function searchRecords(db:any, args:any) {
  const resource = normalizeResource(args?.resource);
  const tables = matchTable(resource);
  const query = String(args?.query || '').toLowerCase().trim();
  const reference = String(args?.reference || '').toLowerCase().trim();
  const status = String(args?.status || '').toLowerCase().trim();
  const requested = Math.max(1, Math.min(MAX_RESULTS, Number(args?.limit || 20)));
  const results:any[] = [];
  const warnings:string[] = [];
  for (const table of tables) {
    const { data, error } = await db.from(table).select('*').limit(MAX_ROWS_PER_TABLE);
    if (error) { warnings.push(`${table}: unavailable`); continue; }
    for (const row of data || []) {
      const hay = JSON.stringify(row).toLowerCase();
      if (query && !hay.includes(query)) continue;
      if (reference && !hay.includes(reference)) continue;
      if (status && !hay.includes(status)) continue;
      results.push(compactRow(table,row));
      if (results.length >= requested) return { results, warnings };
    }
  }
  return { results, warnings };
}

const actionPolicyText = Object.entries(WRITE_ACTIONS).map(([r,a]) => `${r}: ${a.join(', ')}`).join('\n');
const SYSTEM = `You are the InCheck360 ERP AI Assistant inside a live business ERP.
Understand the user's request, inspect ERP records, and when a change is requested, propose controlled ERP actions.

STRICT RULES:
- Never run SQL and never change auth, users, roles, role_permissions, RLS, API keys, secrets, or security configuration.
- Never claim an ERP write succeeded unless the caller sends back a success result.
- Before changing an existing record, use search_erp_records when you need the exact ID or current state. Never invent IDs, amounts, references, dates, or statuses.
- To write, call execute_erp_action. The browser will execute it through the existing authenticated Api.requestWithSession layer, so current ERP permissions and business rules remain authoritative.
- One tool call = one resource/action. Multi-step workflows are allowed but proceed sequentially after the caller returns each result.
- Financial, legal, approval, destructive, or irreversible actions must be high risk and require confirmation.
- payload_json must be a valid JSON object compatible with the existing ERP action endpoint.
- IMPORTANT company contract: companies:create requires a FLAT payload with company_name, e.g. {"company_name":"Acme SAL"}. Do not use {"name":"Acme SAL"}. companies:update normally uses {"id":"<uuid>","updates":{"company_name":"Acme SAL"}}.
- If an action failed or was blocked, do not repeat the identical payload. Correct the payload based on the returned error or explain what is missing.
- Allowed writes only:\n${actionPolicyText}`;

const TOOLS:any[] = [
  {
    type:'function', name:'search_erp_records', strict:true,
    description:'Search live ERP records by module, free text, business reference, or status. Use this to resolve exact record IDs and current state.',
    parameters:{
      type:'object', additionalProperties:false,
      properties:{
        resource:{type:['string','null']}, query:{type:['string','null']}, reference:{type:['string','null']}, status:{type:['string','null']}, limit:{type:['number','null']}
      },
      required:['resource','query','reference','status','limit']
    }
  },
  {
    type:'function', name:'execute_erp_action', strict:true,
    description:'Plan exactly one controlled ERP write. The signed-in ERP browser will validate permissions, optionally ask for confirmation, execute it, and return the actual result.',
    parameters:{
      type:'object', additionalProperties:false,
      properties:{
        resource:{type:'string', enum:Object.keys(WRITE_ACTIONS)},
        action:{type:'string'}, payload_json:{type:'string'}, summary:{type:'string'}, reason:{type:'string'},
        risk:{type:'string',enum:['low','medium','high']}, requires_confirmation:{type:'boolean'}
      },
      required:['resource','action','payload_json','summary','reason','risk','requires_confirmation']
    }
  }
];

Deno.serve(async (req:Request) => {
  if (req.method === 'OPTIONS') return new Response('ok',{headers:cors});
  if (req.method !== 'POST') return respond({error:'Method not allowed'},405);
  try {
    const url = Deno.env.get('SUPABASE_URL') || '';
    const key = adminKey();
    if (!url || !key) return respond({error:'Supabase server credentials are unavailable.'},500);
    if (!Deno.env.get('OPENAI_API_KEY')) return respond({error:'OPENAI_API_KEY is not configured in Supabase Edge Function Secrets.'},500);
    if (!Deno.env.get('AI_CHAT_ENCRYPTION_KEY')) return respond({error:'AI_CHAT_ENCRYPTION_KEY is not configured in Supabase Edge Function Secrets.'},500);

    const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const user = await resolveAdmin(req,db);
    const body = await req.json().catch(() => ({}));
    const message = String(body?.message || '').trim();
    if (!message) return respond({error:'Message is required.'},400);
    if (message.length > MAX_MESSAGE_CHARS) return respond({error:`Message exceeds ${MAX_MESSAGE_CHARS} characters.`},400);

    const sessionId = String(body?.session_id || crypto.randomUUID());
    await ensureSession(db,sessionId,user);
    const planId = String(body?.plan_id || crypto.randomUUID());
    const actionResults = Array.isArray(body?.action_results) ? body.action_results : null;

    if (actionResults) {
      for (const r of actionResults) {
        if (!r?.action_id) continue;
        await db.from('ai_action_audit').update({ status:String(r.status || 'unknown'), result_json:r, completed_at:new Date().toISOString() })
          .eq('plan_id',planId).eq('action_id',String(r.action_id)).eq('user_id',user.id);
      }
    } else {
      await saveMessage(db,sessionId,'user',message,user);
    }

    const previous = await history(db,sessionId);
    const continuation = actionResults
      ? `Continue the original request using these actual ERP action results. Do not repeat an identical failed, blocked, successful, or cancelled action. If a failure can be corrected, change the payload to address the exact error. If more work is required, inspect the updated state and propose the next action. If complete, summarize the real outcome.\n\nOriginal request: ${message}\n\nAction results: ${JSON.stringify(actionResults).slice(0,12000)}`
      : message;

    let response = await openai({ model:MODEL, input:[{role:'system',content:SYSTEM}, ...previous, {role:'user',content:continuation}], tools:TOOLS, parallel_tool_calls:false });

    for (let step=0; step<6; step++) {
      const outputs:any[] = [];
      const pending:any[] = [];
      for (const item of response?.output || []) {
        if (item?.type !== 'function_call') continue;
        let args:any = {};
        try { args = JSON.parse(item.arguments || '{}'); } catch {}

        if (item.name === 'search_erp_records') {
          const result = await searchRecords(db,args);
          outputs.push({ type:'function_call_output', call_id:item.call_id, output:JSON.stringify(result) });
          continue;
        }

        if (item.name === 'execute_erp_action') {
          const resource = String(args.resource || '').trim().toLowerCase();
          const action = String(args.action || '').trim().toLowerCase();
          const allowed = WRITE_ACTIONS[resource] || [];
          const rawPayload = jsonObject(args.payload_json);
          if (!allowed.includes(action)) {
            outputs.push({type:'function_call_output',call_id:item.call_id,output:JSON.stringify({error:`Action not allowed: ${resource}:${action}`,allowed})});
            continue;
          }
          if (!rawPayload) {
            outputs.push({type:'function_call_output',call_id:item.call_id,output:JSON.stringify({error:'payload_json must be a valid JSON object.'})});
            continue;
          }

          const payload = normalizeActionPayload(resource, action, rawPayload);
          if (resource === 'companies' && action === 'create' && !String(payload.company_name || '').trim()) {
            outputs.push({
              type:'function_call_output',
              call_id:item.call_id,
              output:JSON.stringify({error:'Company create requires company_name. Ask the user for the company name if it is missing.'})
            });
            continue;
          }

          const mustConfirm = HIGH_RISK_RESOURCES.has(resource) || HIGH_RISK_ACTIONS.has(action) || args.requires_confirmation === true;
          const actionId = crypto.randomUUID();
          const planned = {
            action_id:actionId, resource, action, payload_json:JSON.stringify(payload),
            summary:String(args.summary || `${action} ${resource}`), reason:String(args.reason || ''),
            risk:mustConfirm ? 'high' : String(args.risk || 'medium'), requires_confirmation:mustConfirm
          };
          const { error } = await db.from('ai_action_audit').insert({
            plan_id:planId, action_id:actionId, session_id:sessionId, user_id:user.id, user_email:user.email, user_role:'admin',
            resource, action, payload_json:payload, summary:planned.summary, risk:planned.risk,
            requires_confirmation:planned.requires_confirmation, status:'planned'
          });
          if (error) throw new Error(`Unable to audit AI action: ${error.message}`);
          pending.push(planned);
        }
      }

      if (pending.length) return respond({ok:true,answer:null,pending_actions:pending,plan_id:planId,session_id:sessionId,model:MODEL});
      if (outputs.length) {
        response = await openai({ model:MODEL, previous_response_id:response.id, input:outputs, tools:TOOLS, parallel_tool_calls:false });
        continue;
      }
      break;
    }

    const answer = outputText(response) || 'I could not complete that request with the available ERP tools.';
    await saveMessage(db,sessionId,'assistant',answer,user);
    return respond({ok:true,answer,pending_actions:[],plan_id:planId,session_id:sessionId,model:MODEL});
  } catch (e:any) {
    console.error('incheck360-ai-assistant failed',e);
    const status = Number(e?.status || 500);
    return respond({error:e?.message || String(e)}, status >= 400 && status < 600 ? status : 500);
  }
});