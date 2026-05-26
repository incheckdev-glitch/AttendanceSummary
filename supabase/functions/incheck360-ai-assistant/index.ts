import OpenAI from 'npm:openai@4.104.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const SYSTEM = `You are the InCheck360 AI Assistant. Answer only using data available from InCheck360 tools. Be concise, professional, and practical. If data is missing, say what is missing. Do not invent records. Use business reference numbers instead of UUIDs. Do not perform write actions.`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json',
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed. Use POST.' }, 405);
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!OPENAI_API_KEY) {
      return jsonResponse({ error: 'Missing OPENAI_API_KEY' }, 500);
    }

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: 'Missing Supabase function secrets' }, 500);
    }

    const { session_id, message, current_user, currentUser } = await req.json();
    const resolvedCurrentUser = current_user || currentUser || {};
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const role = String(
      resolvedCurrentUser?.role_key ||
      resolvedCurrentUser?.roleKey ||
      resolvedCurrentUser?.role ||
      resolvedCurrentUser?.user_role ||
      ''
    ).trim().toLowerCase();

    if (role !== 'admin') {
      return jsonResponse({ error: 'You do not have permission to use AI Assistant.' }, 403);
    }

    const sid = session_id || crypto.randomUUID();
    await db.from('ai_chat_sessions').upsert({ id: sid, user_id: resolvedCurrentUser.id || '', title: 'AI Assistant', updated_at: new Date().toISOString() });
    await db.from('ai_chat_messages').insert({ session_id: sid, user_id: resolvedCurrentUser.id || '', role: 'user', content: message });

    const toolResult = async (name: string, args: any) => ({ name, args, rows: [] });

    const response = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: String(message || '') }
      ],
      tools: [
        { type: 'function', name: 'get_client_summary', description: 'Get client summary', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
        { type: 'function', name: 'get_overdue_payments', description: 'Overdue payments', parameters: { type: 'object', properties: {} } },
        { type: 'function', name: 'get_renewals_due', description: 'Renewals due', parameters: { type: 'object', properties: { days: { type: 'number' } } } },
        { type: 'function', name: 'get_agreements_needing_invoice', description: 'Agreements signed not invoiced', parameters: { type: 'object', properties: {} } },
        { type: 'function', name: 'get_signed_agreements', description: 'Signed agreements', parameters: { type: 'object', properties: {} } },
        { type: 'function', name: 'get_open_technical_requests', description: 'Open technical requests', parameters: { type: 'object', properties: {} } },
        { type: 'function', name: 'get_onboarding_summary', description: 'Onboarding summary', parameters: { type: 'object', properties: {} } },
        { type: 'function', name: 'get_lead_followups_today', description: 'Lead followups today', parameters: { type: 'object', properties: {} } },
        { type: 'function', name: 'get_deal_followups_today', description: 'Deal followups today', parameters: { type: 'object', properties: {} } },
        { type: 'function', name: 'search_records', description: 'Search records', parameters: { type: 'object', properties: { resource: { type: 'string' }, query: { type: 'string' } }, required: ['resource', 'query'] } }
      ]
    });

    for (const item of response.output || []) {
      if (item.type === 'function_call') await toolResult(item.name, JSON.parse(item.arguments || '{}'));
    }

    const answer = response.output_text || 'No data found from allowed tools.';
    await db.from('ai_chat_messages').insert({ session_id: sid, user_id: resolvedCurrentUser.id || '', role: 'assistant', content: answer });

    return jsonResponse({ ok: true, answer, session_id: sid }, 200);
  } catch (error) {
    console.error('[incheck360-ai-assistant] failed', error);
    return jsonResponse({ error: error?.message || String(error) }, 500);
  }
});
