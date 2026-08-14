-- InCheck360 - Remove AI Assistant database objects
-- Date: 2026-08-14
-- AI Insights is removed separately by 20260814_remove_ai_insights.sql.

begin;

-- Remove any runtime role-permission entries for the retired AI Assistant resource.
do $$
begin
  if to_regclass('public.role_permissions') is not null then
    delete from public.role_permissions
    where lower(trim(coalesce(resource::text, ''))) = 'ai_assistant';
  end if;
end
$$;

-- Chat messages reference sessions, so drop messages first.
drop table if exists public.ai_chat_messages cascade;
drop table if exists public.ai_chat_sessions cascade;

commit;

-- IMPORTANT: Supabase Edge Functions are not removed by SQL.
-- Delete the deployed function named: incheck360-ai-assistant
-- Also remove unused secrets OPENAI_API_KEY and AI_CHAT_ENCRYPTION_KEY / CHAT_ENCRYPTION_KEY
-- only if no other deployed function uses them.
