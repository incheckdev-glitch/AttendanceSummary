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
  tickets: ['create','update','delete'], events: ['create','update','delete'], csm: ['create','update','delete'],
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
  contact:['contacts'], lead:['leads'], deal:['deals'], proposal:['proposals'], quote:['proposals'], agreement:['agreements'], contract:['agreements'],
  invoice:['invoices'], receipt:['receipts'], 'credit note':['credit_notes'], ticket:['tickets'], event:['events'], onboarding:['operations_onboarding'],
  'technical request':['technical_admin_requests'], workflow:['workflow_approvals'], approval:['workflow_approvals'],
  biners:['biners_entries','biners_payment_schedules'], payable:['biners_entries','biners_payment_schedules'], csm:['csm_activities'],
  'payment forecast':['payment_forecast_followups']
};

const HIGH_RISK_RESOURCES = new Set(['proposals','agreements','invoices','receipts','credit_notes','workflow','biners']);
const HIGH_RISK_ACTIONS = new Set(['delete','cancel','approve','reject','accept_expired','create_from_deal','create_from_proposal','create_from_agreement','create_from_invoice','create_invoice','create_agreement','create_proposal']);

const SOURCE_CONFIG: Record<string, { table:string; businessKeys:string[] }> = {
  lead:{table:'leads',businessKeys:['lead_id']}, deal:{table:'deals',businessKeys:['deal_id']},
  proposal:{table:'proposals',businessKeys:['proposal_id','proposal_number']}, agreement:{table:'agreements',businessKeys:['agreement_id','agreement_number']},
  invoice:{table:'invoices',businessKeys:['invoice_id','invoice_number']}, receipt:{table:'receipts',businessKeys:['receipt_id','receipt_number']}
};
const SELF_SOURCE_BY_RESOURCE: Record<string,string> = { leads:'lead', deals:'deal', proposals:'proposal', agreements:'agreement', invoices:'invoice', receipts:'receipt' };
const PROPOSAL_UPDATE_FIELDS = new Set([
  'proposal_title','proposal_date','valid_until','proposal_valid_until','customer_name','customer_legal_name','company_id','company_name','contact_id','customer_contact_id',
  'contact_name','contact_email','contact_phone','contact_mobile','customer_address','customer_contact_name','customer_contact_mobile','customer_contact_email',
  'provider_contact_name','provider_contact_mobile','provider_contact_email','service_start_date','contract_term','account_number','billing_frequency','payment_term','po_number',
  'is_poc','poc_location_count','poc_license_count','poc_license_months','poc_service_start_date','poc_service_end_date','poc_success_kpis','poc_conversion_commitment',
  'currency','terms_conditions','internal_notes','customer_signatory_name','customer_signatory_title','customer_signature_name','customer_signature_title','customer_sign_date',
  'customer_signed_at','provider_signatory_user_id','provider_signatory_name','provider_signatory_title','provider_sign_date','status',
  'subtotal_locations','subtotal_one_time','total_discount','grand_total'
]);

const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const respond = (body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json'}});

function adminKey(){
  const legacy=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); if(legacy)return legacy;
  const raw=Deno.env.get('SUPABASE_SECRET_KEYS'); if(!raw)return '';
  try{const parsed=JSON.parse(raw);return parsed.default||Object.values(parsed)[0]||'';}catch{return '';}
}
function jsonObject(value:unknown){
  if(value&&typeof value==='object'&&!Array.isArray(value))return value as Record<string,unknown>;
  try{const p=JSON.parse(String(value||'{}'));return p&&typeof p==='object'&&!Array.isArray(p)?p:null;}catch{return null;}
}
function objectValue(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?{...(value as Record<string,unknown>)}:{};}
function normalizeResource(value:unknown){return String(value||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');}
function isUuid(value:unknown){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||'').trim());}
function num(value:unknown,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback;}
function money(value:number){return Math.round((value+Number.EPSILON)*100)/100;}
function text(value:unknown){return String(value??'').trim();}
function normalizeCompanyFields(input:Record<string,unknown>){
  const out={...input}; const candidate=out.company_name??out.companyName??out.name;
  if(candidate!==undefined&&candidate!==null&&text(candidate))out.company_name=text(candidate); delete out.companyName; delete out.name; return out;
}

async function resolveSourceRecord(db:any,source:string,payload:Record<string,unknown>){
  const config=SOURCE_CONFIG[source]; if(!config)return null;
  const selectCols=['id',...config.businessKeys].join(',');
  const direct=[payload.id,payload.uuid,payload[`${source}_uuid`],payload[`${source}Uuid`],payload[`${source}_id`],payload[`${source}Id`]];
  for(const candidate of direct){const value=text(candidate);if(!isUuid(value))continue;const {data,error}=await db.from(config.table).select(selectCols).eq('id',value).limit(1).maybeSingle();if(!error&&data?.id)return data;}
  const refs=[payload.id,payload.uuid,payload[`${source}_id`],payload[`${source}Id`],payload[`${source}_number`],payload[`${source}Number`],payload[`${source}_reference`],payload[`${source}Reference`],payload.reference].map(text).filter(Boolean);
  for(const ref of refs){if(isUuid(ref))continue;for(const key of config.businessKeys){const {data,error}=await db.from(config.table).select(selectCols).eq(key,ref).limit(1).maybeSingle();if(!error&&data?.id)return data;}}
  return null;
}
async function normalizeSourcePayload(db:any,source:string,payload:Record<string,unknown>){
  const out={...payload};const row=await resolveSourceRecord(db,source,out);if(!row?.id)return out;
  const uuid=String(row.id);out.id=uuid;out[`${source}_uuid`]=uuid;const config=SOURCE_CONFIG[source];const business=config.businessKeys.map(k=>row[k]).find(v=>text(v));if(business)out[`${source}_id`]=text(business);return out;
}

function normalizeProposalUpdateFields(input:Record<string,unknown>){
  const out={...input};
  if(out.payment_term===undefined&&out.payment_terms!==undefined)out.payment_term=out.payment_terms;
  if(out.service_start_date===undefined&&out.start_date!==undefined)out.service_start_date=out.start_date;
  if(out.contract_term===undefined&&out.term_months!==undefined&&num(out.term_months)>0)out.contract_term=`${num(out.term_months)} months`;
  delete out.payment_terms;delete out.start_date;delete out.term_months;delete out.validity_days;delete out.location_count;
  return out;
}
function normalizeProposalItemAliases(raw:Record<string,unknown>){
  const item={...raw};
  if(item.item_name===undefined)item.item_name=item.itemName??item.product??item.product_name??item.name;
  if(item.location_name===undefined)item.location_name=item.locationName??item.location;
  if(item.unit_price===undefined&&item.unitPrice!==undefined)item.unit_price=item.unitPrice;
  if(item.discount_percent===undefined&&item.discountPercent!==undefined)item.discount_percent=item.discountPercent;
  if(item.license_quantity===undefined&&item.licenseQuantity!==undefined)item.license_quantity=item.licenseQuantity;
  if(item.quantity===undefined&&item.qty!==undefined)item.quantity=item.qty;
  let section=text(item.section).toLowerCase();
  const itemType=text(item.item_type??item.itemType??item.type).toLowerCase();
  const name=text(item.item_name).toLowerCase(); const billing=text(item.billing_frequency??item.billingFrequency).toLowerCase();
  if(!section){
    if(['annual_saas','annual saas','subscription','saas'].includes(itemType)||billing.includes('annual')||name.includes('incheck basic'))section='annual_saas';
    else if(['account_setup','account setup','one_time_fee','one-time','one_time'].includes(itemType)||name.includes('account setup'))section='one_time_fee';
    else if(itemType==='hardware')section='hardware';
  }
  if(section==='account_setup'||section==='one-time'||section==='one_time')section='one_time_fee';
  if(section)item.section=section;
  return item;
}
function addMonthsMinusOneDay(dateValue:string,months:number){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)||!Number.isFinite(months)||months<=0)return '';
  const [y,m,d]=dateValue.split('-').map(Number);const dt=new Date(Date.UTC(y,m-1,d));dt.setUTCMonth(dt.getUTCMonth()+months);dt.setUTCDate(dt.getUTCDate()-1);return dt.toISOString().slice(0,10);
}
function normalizeProposalItems(value:unknown,proposalStartDate=''){
  if(!Array.isArray(value))return undefined;
  const normalized:Record<string,unknown>[]=[];
  for(const raw of value){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))continue;
    const seed=normalizeProposalItemAliases(raw as Record<string,unknown>);
    const section=text(seed.section).toLowerCase();const name=text(seed.item_name).toLowerCase();const billing=text(seed.billing_frequency??seed.billingFrequency).toLowerCase();const description=text(seed.description).toLowerCase();
    const explicitMonths=num(seed.license_months??seed.months??seed.duration_months,NaN);const rawQty=num(seed.quantity??seed.qty,NaN);const annualHint=billing.includes('annual')||description.includes('12 months')||description.includes('12-month');
    const seeds:Record<string,unknown>[]=[];
    if(section==='annual_saas'&&name==='incheck basic'&&annualHint&&!Number.isFinite(explicitMonths)&&Number.isInteger(rawQty)&&rawQty>1&&rawQty<=100){
      for(let i=0;i<rawQty;i++)seeds.push({...seed,quantity:12,qty:12,months:12,license_months:12,duration_months:12,license_quantity:1});
    }else seeds.push(seed);
    for(const item of seeds){
      const itemSection=text(item.section).toLowerCase();
      if(itemSection==='annual_saas'){
        const explicit=num(item.license_months??item.months??item.duration_months,NaN);const q=num(item.quantity??item.qty,NaN);const months=Number.isFinite(explicit)&&explicit>0?explicit:(annualHint?12:(Number.isFinite(q)&&q>0?q:12));
        item.quantity=months;item.qty=months;item.months=months;item.license_months=months;item.duration_months=months;item.license_quantity=Math.max(1,Math.round(num(item.license_quantity,1)));
        if(!text(item.service_start_date)&&proposalStartDate)item.service_start_date=proposalStartDate;
        if(!text(item.service_end_date)&&text(item.service_start_date))item.service_end_date=addMonthsMinusOneDay(text(item.service_start_date),months);
      }else{
        const q=num(item.quantity??item.qty,1);item.quantity=q>0?q:1;item.qty=item.quantity;
      }
      const unit=num(item.unit_price);const discount=Math.max(0,Math.min(100,num(item.discount_percent)));const discounted=money(unit*(1-discount/100));
      const qty=num(item.quantity,1);const licenseQty=itemSection==='annual_saas'?Math.max(1,num(item.license_quantity,1)):1;
      const base=itemSection==='annual_saas'?unit*licenseQty*(qty/12):unit*qty;
      const line=itemSection==='annual_saas'?discounted*licenseQty*(qty/12):discounted*qty;
      item.unit_price=unit;item.discount_percent=discount;item.discounted_unit_price=money(discounted);item.line_total=money(line);item.base_total=money(base);
      if(!text(item.item_name)&&text(item.description))item.item_name=text(item.description);
      normalized.push(item);
    }
  }
  return normalized;
}
function proposalTotals(items:Record<string,unknown>[]){
  let saas=0,oneTime=0,discount=0,grand=0;
  for(const item of items){const section=text(item.section).toLowerCase();const line=num(item.line_total);const base=num(item.base_total,line);grand+=line;discount+=Math.max(0,base-line);if(section==='annual_saas')saas+=line;else oneTime+=line;}
  return {subtotal_locations:money(saas),subtotal_one_time:money(oneTime),total_discount:money(discount),grand_total:money(grand)};
}
async function normalizeProposalUpdatePayload(db:any,payload:Record<string,unknown>){
  const out=await normalizeSourcePayload(db,'proposal',payload);const updates=normalizeProposalUpdateFields(objectValue(out.updates));
  const rawItems=Array.isArray(out.items)?out.items:(Array.isArray(out.line_items)?out.line_items:(Array.isArray(out.proposal_items)?out.proposal_items:undefined));
  const aliasMap:Record<string,string>={payment_terms:'payment_term',start_date:'service_start_date'};
  for(const [key,value] of Object.entries(out)){
    if(['id','uuid','proposal_id','proposalId','proposal_uuid','proposalUuid','updates','items','line_items','proposal_items'].includes(key))continue;
    const target=aliasMap[key]||key;if(PROPOSAL_UPDATE_FIELDS.has(target)&&updates[target]===undefined)updates[target]=value;
  }
  let current:any=null;
  if(isUuid(out.id)){const {data}=await db.from('proposals').select('status,service_start_date').eq('id',out.id).limit(1).maybeSingle();current=data||null;}
  const finalUpdates=normalizeProposalUpdateFields(updates);
  if(!text(finalUpdates.status)&&text(current?.status))finalUpdates.status=text(current.status);
  const startDate=text(finalUpdates.service_start_date||current?.service_start_date);
  const result:Record<string,unknown>={id:out.id,proposal_uuid:out.proposal_uuid,proposal_id:out.proposal_id,updates:finalUpdates};
  const items=normalizeProposalItems(rawItems,startDate);
  if(items!==undefined){
    const totals=proposalTotals(items);
    for(const item of items)delete item.base_total;
    result.items=items;
    Object.assign(finalUpdates,totals);
  }
  return result;
}

async function normalizeActionPayload(db:any,resource:string,action:string,payload:Record<string,unknown>){
  if(resource==='companies'){
    if(action==='create')return normalizeCompanyFields(payload);
    if(action==='update'){const out={...payload};if(out.updates&&typeof out.updates==='object'&&!Array.isArray(out.updates)){out.updates=normalizeCompanyFields(out.updates as Record<string,unknown>);return out;}return normalizeCompanyFields(out);}
  }
  if(resource==='proposals'&&action==='update')return await normalizeProposalUpdatePayload(db,payload);
  const selfSource=SELF_SOURCE_BY_RESOURCE[resource];if(selfSource&&['update','delete'].includes(action))return await normalizeSourcePayload(db,selfSource,payload);
  if(resource==='leads'&&['convert','convert_to_deal'].includes(action))return await normalizeSourcePayload(db,'lead',payload);
  if(resource==='proposals'&&action==='create_from_deal')return await normalizeSourcePayload(db,'deal',payload);
  if(resource==='agreements'&&action==='create_from_proposal')return await normalizeSourcePayload(db,'proposal',payload);
  if(resource==='invoices'&&action==='create_from_agreement')return await normalizeSourcePayload(db,'agreement',payload);
  if(resource==='receipts'&&action==='create_from_invoice')return await normalizeSourcePayload(db,'invoice',payload);
  return payload;
}
function requiredSourceForAction(resource:string,action:string){
  if(resource==='leads'&&['convert','convert_to_deal'].includes(action))return 'lead';if(resource==='proposals'&&action==='create_from_deal')return 'deal';
  if(resource==='agreements'&&action==='create_from_proposal')return 'proposal';if(resource==='invoices'&&action==='create_from_agreement')return 'agreement';if(resource==='receipts'&&action==='create_from_invoice')return 'invoice';return '';
}

function base64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes));}function bytes(value:string){return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
const enc=new TextEncoder();const dec=new TextDecoder();let cryptoKey:Promise<CryptoKey>|null=null;
async function chatKey(){if(cryptoKey)return cryptoKey;const raw=Deno.env.get('AI_CHAT_ENCRYPTION_KEY')||'';if(!raw)throw new Error('Missing AI_CHAT_ENCRYPTION_KEY');let kb:Uint8Array;try{kb=bytes(raw);}catch{kb=enc.encode(raw.padEnd(32,'0').slice(0,32));}if(![16,24,32].includes(kb.length))kb=enc.encode(raw.padEnd(32,'0').slice(0,32));cryptoKey=crypto.subtle.importKey('raw',kb,'AES-GCM',false,['encrypt','decrypt']);return cryptoKey;}
async function encrypt(s:string){const iv=crypto.getRandomValues(new Uint8Array(12));const out=await crypto.subtle.encrypt({name:'AES-GCM',iv},await chatKey(),enc.encode(s));return{content_encrypted:base64(new Uint8Array(out)),content_iv:base64(iv)};}
async function decrypt(row:any){if(!row?.content_encrypted||!row?.content_iv)return'';const out=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(row.content_iv)},await chatKey(),bytes(row.content_encrypted));return dec.decode(out);}
async function openai(body:any){const key=Deno.env.get('OPENAI_API_KEY');if(!key)throw new Error('Missing OPENAI_API_KEY');const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${key}`},body:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.error?.message||`OpenAI request failed (${r.status})`);return data;}
function outputText(response:any){if(typeof response?.output_text==='string'&&response.output_text.trim())return response.output_text.trim();const parts:string[]=[];for(const item of response?.output||[]){if(item?.type!=='message')continue;for(const c of item?.content||[])if(c?.type==='output_text'&&c?.text)parts.push(c.text);}return parts.join('\n').trim();}
async function resolveAdmin(req:Request,db:any){const token=text(req.headers.get('authorization')).replace(/^Bearer\s+/i,'').trim();if(!token)throw Object.assign(new Error('Authentication required.'),{status:401});const {data,error}=await db.auth.getUser(token);if(error||!data?.user)throw Object.assign(new Error('Invalid or expired session.'),{status:401});const user=data.user;const {data:profile,error:pe}=await db.from('profiles').select('id,email,name,role_key,is_active').eq('id',user.id).maybeSingle();if(pe)throw Object.assign(new Error('Unable to verify ERP profile.'),{status:403});if(!profile||profile.is_active===false)throw Object.assign(new Error('ERP user is inactive or missing.'),{status:403});if(text(profile.role_key).toLowerCase()!=='admin')throw Object.assign(new Error('AI Assistant action mode is admin-only.'),{status:403});return{id:user.id,email:user.email||profile.email||null,name:profile.name||null,role_key:'admin'};}
async function ensureSession(db:any,sessionId:string,user:any){const {data}=await db.from('ai_chat_sessions').select('id').eq('id',sessionId).maybeSingle();if(data?.id){await db.from('ai_chat_sessions').update({updated_at:new Date().toISOString()}).eq('id',sessionId);return;}const {error}=await db.from('ai_chat_sessions').insert({id:sessionId,user_id:user.id,user_email:user.email,updated_at:new Date().toISOString()});if(error)throw new Error(`Unable to create AI chat session: ${error.message}`);}
async function saveMessage(db:any,sessionId:string,role:'user'|'assistant',msg:string,user:any){const e=await encrypt(msg);const {error}=await db.from('ai_chat_messages').insert({session_id:sessionId,user_id:user.id,user_email:user.email,role,content:'[encrypted]',...e});if(error)console.warn('AI chat save failed',error.message);}
async function history(db:any,sessionId:string){const {data}=await db.from('ai_chat_messages').select('*').eq('session_id',sessionId).order('created_at',{ascending:false}).limit(12);const rows=[...(data||[])].reverse();const out:any[]=[];for(const row of rows){try{const t=await decrypt(row);if(t&&(row.role==='user'||row.role==='assistant'))out.push({role:row.role,content:t});}catch{}}return out;}
function matchTable(resource:string){if(!resource)return READ_TABLES;const raw=resource.replace(/\s+/g,'_');if(READ_TABLES.includes(raw))return[raw];return ALIASES[resource]||[];}
function compactRow(table:string,row:any){const keep=['id','company_id','contact_id','lead_id','deal_id','proposal_id','proposal_number','agreement_id','agreement_number','invoice_id','invoice_number','receipt_id','receipt_number','credit_note_id','credit_note_number','ticket_id','request_id','onboarding_id','name','title','subject','customer_name','client_name','company_name','status','payment_state','payment_status','approval_status','created_at','updated_at','date','due_date','invoice_date','receipt_date','follow_up_date','next_follow_up_at','service_start_date','service_end_date','currency','amount','total','grand_total','total_amount','balance_due','billing_frequency','payment_terms','payment_term','notes'];const record:any={};for(const k of keep)if(row?.[k]!==undefined&&row?.[k]!==null)record[k]=row[k];return{resource:table,record};}
async function searchRecords(db:any,args:any){const resource=normalizeResource(args?.resource);const tables=matchTable(resource);const query=text(args?.query).toLowerCase();const reference=text(args?.reference).toLowerCase();const status=text(args?.status).toLowerCase();const requested=Math.max(1,Math.min(MAX_RESULTS,num(args?.limit,20)));const results:any[]=[];const warnings:string[]=[];for(const table of tables){const {data,error}=await db.from(table).select('*').limit(MAX_ROWS_PER_TABLE);if(error){warnings.push(`${table}: unavailable`);continue;}for(const row of data||[]){const hay=JSON.stringify(row).toLowerCase();if(query&&!hay.includes(query))continue;if(reference&&!hay.includes(reference))continue;if(status&&!hay.includes(status))continue;results.push(compactRow(table,row));if(results.length>=requested)return{results,warnings};}}return{results,warnings};}

const actionPolicyText=Object.entries(WRITE_ACTIONS).map(([r,a])=>`${r}: ${a.join(', ')}`).join('\n');
const SYSTEM=`You are the InCheck360 ERP AI Assistant inside a live business ERP.\nUnderstand the user's request, inspect ERP records, and when a change is requested, propose controlled ERP actions.\n\nSTRICT RULES:\n- Never run SQL and never change auth, users, roles, role_permissions, RLS, API keys, secrets, or security configuration.\n- Never claim an ERP write succeeded unless the caller sends back a success result.\n- Before changing or converting an existing record, use search_erp_records when you need its exact record or current state. Never invent IDs, amounts, references, dates, or statuses.\n- To write, call execute_erp_action. The browser executes it through the existing authenticated Api.requestWithSession layer, so ERP permissions and business rules remain authoritative.\n- One tool call = one resource/action. Multi-step workflows proceed sequentially after actual results return.\n- Financial, legal, approval, conversion, destructive, or irreversible actions require confirmation.\n- Existing business references such as Lead#..., Deal#..., Proposal#..., Agreement#..., invoice and receipt numbers are resolved server-side. Never invent UUIDs.\n- For proposals:update, use item_name, location_name, section, unit_price, discount_percent and quantity. Annual SaaS quantity means MONTHS; annual = 12 months. The server computes discounted_unit_price, line_total and proposal totals.\n- When updating a proposal without changing status, preserve its current status.\n- Lead→Deal, Deal→Proposal, Proposal→Agreement, Agreement→Invoice, and Invoice→Receipt are sequential conversions. Do not repeat identical failed, blocked, successful or cancelled actions.\n- Allowed writes only:\n${actionPolicyText}`;
const TOOLS:any[]=[
  {type:'function',name:'search_erp_records',strict:true,description:'Search live ERP records by module, text, business reference or status.',parameters:{type:'object',additionalProperties:false,properties:{resource:{type:['string','null']},query:{type:['string','null']},reference:{type:['string','null']},status:{type:['string','null']},limit:{type:['number','null']}},required:['resource','query','reference','status','limit']}},
  {type:'function',name:'execute_erp_action',strict:true,description:'Plan exactly one controlled ERP write.',parameters:{type:'object',additionalProperties:false,properties:{resource:{type:'string',enum:Object.keys(WRITE_ACTIONS)},action:{type:'string'},payload_json:{type:'string'},summary:{type:'string'},reason:{type:'string'},risk:{type:'string',enum:['low','medium','high']},requires_confirmation:{type:'boolean'}},required:['resource','action','payload_json','summary','reason','risk','requires_confirmation']}}
];

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return respond({error:'Method not allowed'},405);
  try{
    const url=Deno.env.get('SUPABASE_URL')||'';const key=adminKey();if(!url||!key)return respond({error:'Supabase server credentials are unavailable.'},500);if(!Deno.env.get('OPENAI_API_KEY'))return respond({error:'OPENAI_API_KEY is not configured in Supabase Edge Function Secrets.'},500);if(!Deno.env.get('AI_CHAT_ENCRYPTION_KEY'))return respond({error:'AI_CHAT_ENCRYPTION_KEY is not configured in Supabase Edge Function Secrets.'},500);
    const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const user=await resolveAdmin(req,db);const body=await req.json().catch(()=>({}));const message=text(body?.message);if(!message)return respond({error:'Message is required.'},400);if(message.length>MAX_MESSAGE_CHARS)return respond({error:`Message exceeds ${MAX_MESSAGE_CHARS} characters.`},400);
    const sessionId=text(body?.session_id)||crypto.randomUUID();await ensureSession(db,sessionId,user);const planId=text(body?.plan_id)||crypto.randomUUID();const actionResults=Array.isArray(body?.action_results)?body.action_results:null;
    if(actionResults){for(const r of actionResults){if(!r?.action_id)continue;await db.from('ai_action_audit').update({status:text(r.status)||'unknown',result_json:r,completed_at:new Date().toISOString()}).eq('plan_id',planId).eq('action_id',text(r.action_id)).eq('user_id',user.id);}}else await saveMessage(db,sessionId,'user',message,user);
    const previous=await history(db,sessionId);const continuation=actionResults?`Continue the original request using these actual ERP action results. Do not repeat an identical failed, blocked, successful or cancelled action. If more work is required, inspect updated state and propose the next action. If complete, summarize the real outcome.\n\nOriginal request: ${message}\n\nAction results: ${JSON.stringify(actionResults).slice(0,12000)}`:message;
    let response=await openai({model:MODEL,input:[{role:'system',content:SYSTEM},...previous,{role:'user',content:continuation}],tools:TOOLS,parallel_tool_calls:false});
    for(let step=0;step<6;step++){
      const outputs:any[]=[];const pending:any[]=[];
      for(const item of response?.output||[]){
        if(item?.type!=='function_call')continue;let args:any={};try{args=JSON.parse(item.arguments||'{}');}catch{}
        if(item.name==='search_erp_records'){const result=await searchRecords(db,args);outputs.push({type:'function_call_output',call_id:item.call_id,output:JSON.stringify(result)});continue;}
        if(item.name==='execute_erp_action'){
          const resource=text(args.resource).toLowerCase();const action=text(args.action).toLowerCase();const allowed=WRITE_ACTIONS[resource]||[];const rawPayload=jsonObject(args.payload_json);
          if(!allowed.includes(action)){outputs.push({type:'function_call_output',call_id:item.call_id,output:JSON.stringify({error:`Action not allowed: ${resource}:${action}`,allowed})});continue;}
          if(!rawPayload){outputs.push({type:'function_call_output',call_id:item.call_id,output:JSON.stringify({error:'payload_json must be a valid JSON object.'})});continue;}
          const payload=await normalizeActionPayload(db,resource,action,rawPayload);
          if(resource==='companies'&&action==='create'&&!text(payload.company_name)){outputs.push({type:'function_call_output',call_id:item.call_id,output:JSON.stringify({error:'Company create requires company_name.'})});continue;}
          if(resource==='proposals'&&action==='update'&&!isUuid(payload.id)){outputs.push({type:'function_call_output',call_id:item.call_id,output:JSON.stringify({error:'Proposal update source could not be resolved to a UUID. Search the exact Proposal# reference first.'})});continue;}
          const requiredSource=requiredSourceForAction(resource,action);if(requiredSource&&!isUuid(payload.id)){outputs.push({type:'function_call_output',call_id:item.call_id,output:JSON.stringify({error:`${requiredSource} conversion source could not be resolved to a UUID. Search the exact business reference first.`})});continue;}
          const mustConfirm=HIGH_RISK_RESOURCES.has(resource)||HIGH_RISK_ACTIONS.has(action)||args.requires_confirmation===true;const actionId=crypto.randomUUID();const planned={action_id:actionId,resource,action,payload_json:JSON.stringify(payload),summary:text(args.summary)||`${action} ${resource}`,reason:text(args.reason),risk:mustConfirm?'high':text(args.risk)||'medium',requires_confirmation:mustConfirm};
          const {error}=await db.from('ai_action_audit').insert({plan_id:planId,action_id:actionId,session_id:sessionId,user_id:user.id,user_email:user.email,user_role:'admin',resource,action,payload_json:payload,summary:planned.summary,risk:planned.risk,requires_confirmation:planned.requires_confirmation,status:'planned'});if(error)throw new Error(`Unable to audit AI action: ${error.message}`);pending.push(planned);
        }
      }
      if(pending.length)return respond({ok:true,answer:null,pending_actions:pending,plan_id:planId,session_id:sessionId,model:MODEL});if(outputs.length){response=await openai({model:MODEL,previous_response_id:response.id,input:outputs,tools:TOOLS,parallel_tool_calls:false});continue;}break;
    }
    const answer=outputText(response)||'I could not complete that request with the available ERP tools.';await saveMessage(db,sessionId,'assistant',answer,user);return respond({ok:true,answer,pending_actions:[],plan_id:planId,session_id:sessionId,model:MODEL});
  }catch(e:any){console.error('incheck360-ai-assistant failed',e);const status=Number(e?.status||500);return respond({error:e?.message||String(e)},status>=400&&status<600?status:500);}
});
