import OpenAI from 'npm:openai@4.104.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const SYSTEM = `You are the InCheck360 AI Assistant. Answer only using data available from InCheck360 tools. Be concise, professional, and practical. If data is missing, say what is missing. Do not invent records. Use business reference numbers instead of UUIDs. Do not perform write actions.`;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok');
  try {
    const { session_id, message, current_user } = await req.json();
    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! });
    const db = createClient(url, key);

    const hasView = !!current_user?.role;
    if (!hasView) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

    const sid = session_id || crypto.randomUUID();
    await db.from('ai_chat_sessions').upsert({ id: sid, user_id: current_user.id || '', title: 'AI Assistant', updated_at: new Date().toISOString() });
    await db.from('ai_chat_messages').insert({ session_id: sid, user_id: current_user.id || '', role: 'user', content: message });

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
    await db.from('ai_chat_messages').insert({ session_id: sid, user_id: current_user.id || '', role: 'assistant', content: answer });
    return new Response(JSON.stringify({ session_id: sid, answer }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
});
