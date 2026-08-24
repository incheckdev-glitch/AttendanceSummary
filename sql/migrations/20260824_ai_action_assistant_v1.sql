-- InCheck360 AI Action Assistant V1
-- Date: 2026-08-24
-- Reintroduces the AI Assistant as an admin-only action copilot.
-- OpenAI plans actions; the browser executes them through the signed-in ERP action layer.

begin;

create table if not exists public.ai_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  user_email text null,
  title text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_chat_sessions(id) on delete cascade,
  user_id uuid null,
  user_email text null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '[encrypted]',
  content_encrypted text null,
  content_iv text null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_action_audit (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  action_id uuid not null,
  session_id uuid null references public.ai_chat_sessions(id) on delete set null,
  user_id uuid null,
  user_email text null,
  user_role text null,
  resource text not null,
  action text not null,
  payload_json jsonb not null default '{}'::jsonb,
  summary text null,
  risk text not null default 'medium' check (risk in ('low', 'medium', 'high')),
  requires_confirmation boolean not null default false,
  status text not null default 'planned',
  result_json jsonb null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  unique (plan_id, action_id)
);

create index if not exists ai_chat_sessions_user_updated_idx
  on public.ai_chat_sessions (user_id, updated_at desc);
create index if not exists ai_chat_messages_session_created_idx
  on public.ai_chat_messages (session_id, created_at desc);
create index if not exists ai_action_audit_user_created_idx
  on public.ai_action_audit (user_id, created_at desc);
create index if not exists ai_action_audit_plan_idx
  on public.ai_action_audit (plan_id, action_id);

alter table public.ai_chat_sessions enable row level security;
alter table public.ai_chat_messages enable row level security;
alter table public.ai_action_audit enable row level security;

-- These tables are intentionally Edge-Function-only in V1. No browser role receives table access.
revoke all on table public.ai_chat_sessions from anon, authenticated;
revoke all on table public.ai_chat_messages from anon, authenticated;
revoke all on table public.ai_action_audit from anon, authenticated;
grant all on table public.ai_chat_sessions to service_role;
grant all on table public.ai_chat_messages to service_role;
grant all on table public.ai_action_audit to service_role;

-- Keep the assistant admin-only while its read tools use the service-role client.
do $$
declare
  a text;
begin
  if to_regclass('public.role_permissions') is not null then
    delete from public.role_permissions
     where lower(trim(coalesce(resource::text, ''))) = 'ai_assistant'
       and lower(trim(coalesce(role_key::text, ''))) <> 'admin';

    foreach a in array array['view','list','use','execute']::text[] loop
      if exists (
        select 1 from public.role_permissions
         where lower(trim(coalesce(role_key::text, ''))) = 'admin'
           and lower(trim(coalesce(resource::text, ''))) = 'ai_assistant'
           and lower(trim(coalesce(action::text, ''))) = a
      ) then
        update public.role_permissions
           set is_allowed = true,
               is_active = true,
               allowed_roles = array['admin']::text[],
               updated_at = now()
         where lower(trim(coalesce(role_key::text, ''))) = 'admin'
           and lower(trim(coalesce(resource::text, ''))) = 'ai_assistant'
           and lower(trim(coalesce(action::text, ''))) = a;
      else
        insert into public.role_permissions
          (permission_id, role_key, resource, action, is_allowed, is_active, allowed_roles, created_at, updated_at)
        values
          (gen_random_uuid(), 'admin', 'ai_assistant', a, true, true, array['admin']::text[], now(), now());
      end if;
    end loop;
  end if;
end $$;

commit;
