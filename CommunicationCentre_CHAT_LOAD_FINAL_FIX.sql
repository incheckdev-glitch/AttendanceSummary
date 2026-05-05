-- =========================================================
-- Communication Centre chat-load final fix
-- Goal:
-- - Prevent conversation list/message load from failing because Phase 2/3 columns or tables are missing
-- - Keep strict RLS visibility based on existing can_view_communication_centre_conversation()
-- - Keep delete separate from normal manage actions
-- Safe to run multiple times
-- =========================================================

-- 1. Conversation optional columns used by the advanced UI
alter table if exists public.communication_centre_conversations
  add column if not exists is_pinned boolean not null default false;

alter table if exists public.communication_centre_conversations
  add column if not exists pinned_at timestamptz;

alter table if exists public.communication_centre_conversations
  add column if not exists pinned_by uuid;

alter table if exists public.communication_centre_conversations
  add column if not exists is_archived boolean not null default false;

alter table if exists public.communication_centre_conversations
  add column if not exists archived_at timestamptz;

alter table if exists public.communication_centre_conversations
  add column if not exists archived_by uuid;

alter table if exists public.communication_centre_conversations
  add column if not exists last_message_preview text;

alter table if exists public.communication_centre_conversations
  add column if not exists last_message_at timestamptz;

alter table if exists public.communication_centre_conversations
  add column if not exists participant_count integer not null default 0;

alter table if exists public.communication_centre_conversations
  add column if not exists unread_count integer not null default 0;

alter table if exists public.communication_centre_conversations
  add column if not exists is_assigned_to_me integer not null default 0;

alter table if exists public.communication_centre_conversations
  add column if not exists follow_up_at timestamptz;

alter table if exists public.communication_centre_conversations
  add column if not exists follow_up_by uuid;

alter table if exists public.communication_centre_conversations
  add column if not exists follow_up_status text not null default 'pending';

alter table if exists public.communication_centre_conversations
  add column if not exists is_escalated boolean not null default false;

alter table if exists public.communication_centre_conversations
  add column if not exists escalated_at timestamptz;

alter table if exists public.communication_centre_conversations
  add column if not exists escalated_by uuid;

-- 2. Message optional columns used by the advanced UI
alter table if exists public.communication_centre_messages
  add column if not exists reply_to_message_id uuid;

alter table if exists public.communication_centre_messages
  add column if not exists edited_at timestamptz;

alter table if exists public.communication_centre_messages
  add column if not exists edited_by uuid;

alter table if exists public.communication_centre_messages
  add column if not exists is_deleted boolean not null default false;

alter table if exists public.communication_centre_messages
  add column if not exists deleted_at timestamptz;

alter table if exists public.communication_centre_messages
  add column if not exists deleted_by uuid;

alter table if exists public.communication_centre_messages
  add column if not exists message_type text not null default 'message';

-- 3. Optional Phase 3 tables. They must not block chat loading if empty.
create table if not exists public.communication_centre_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  conversation_id uuid not null,
  user_id uuid,
  reaction text not null,
  created_at timestamptz not null default now(),
  unique(message_id, user_id, reaction)
);

create table if not exists public.communication_centre_action_items (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  source_message_id uuid,
  title text not null,
  assigned_to uuid,
  due_at timestamptz,
  status text not null default 'open',
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid
);

alter table public.communication_centre_message_reactions enable row level security;
alter table public.communication_centre_action_items enable row level security;

-- 4. RLS policies for optional tables using the existing strict visibility helper.
drop policy if exists "cc reactions select" on public.communication_centre_message_reactions;
create policy "cc reactions select"
on public.communication_centre_message_reactions
for select
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists "cc reactions insert" on public.communication_centre_message_reactions;
create policy "cc reactions insert"
on public.communication_centre_message_reactions
for insert
to authenticated
with check (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists "cc reactions delete own" on public.communication_centre_message_reactions;
create policy "cc reactions delete own"
on public.communication_centre_message_reactions
for delete
to authenticated
using (
  public.can_view_communication_centre_conversation(conversation_id)
  and (
    user_id = auth.uid()
    or public.cc_is_admin()
  )
);

drop policy if exists "cc action items select" on public.communication_centre_action_items;
create policy "cc action items select"
on public.communication_centre_action_items
for select
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists "cc action items insert" on public.communication_centre_action_items;
create policy "cc action items insert"
on public.communication_centre_action_items
for insert
to authenticated
with check (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists "cc action items update" on public.communication_centre_action_items;
create policy "cc action items update"
on public.communication_centre_action_items
for update
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id))
with check (public.can_view_communication_centre_conversation(conversation_id));

-- 5. Make normal Communication Centre actions easy and keep delete separate.
create or replace function public.cc_has_permission(p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.cc_current_role_key();
  v_allowed boolean := false;
begin
  if lower(coalesce(p_action, '')) = 'delete' then
    if v_role is null or v_role in ('authenticated', 'anon', 'service_role') then
      return false;
    end if;

    select exists (
      select 1
      from public.role_permissions rp
      where lower(rp.role_key) = lower(v_role)
        and rp.resource = 'communication_centre'
        and rp.action = 'delete'
        and coalesce(rp.is_allowed, false) = true
        and coalesce(rp.is_active, true) = true
    ) into v_allowed;

    return coalesce(v_allowed, false);
  end if;

  -- Normal actions are allowed for authenticated app users; record visibility is still enforced by RLS.
  return auth.uid() is not null;
end;
$$;

grant execute on function public.cc_has_permission(text) to authenticated;

-- 6. Pin/archive RPCs used by Phase 2 UI. Do not fail if clicked.
create or replace function public.pin_communication_centre_conversation(p_conversation_id uuid, p_is_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_view_communication_centre_conversation(p_conversation_id) then
    raise exception 'Forbidden: conversation access is required';
  end if;

  update public.communication_centre_conversations
  set
    is_pinned = coalesce(p_is_pinned, false),
    pinned_at = case when coalesce(p_is_pinned, false) then now() else null end,
    pinned_by = case when coalesce(p_is_pinned, false) then public.cc_current_app_user_id() else null end,
    updated_at = coalesce(updated_at, now())
  where id = p_conversation_id;
end;
$$;

create or replace function public.archive_communication_centre_conversation(p_conversation_id uuid, p_is_archived boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_view_communication_centre_conversation(p_conversation_id) then
    raise exception 'Forbidden: conversation access is required';
  end if;

  update public.communication_centre_conversations
  set
    is_archived = coalesce(p_is_archived, false),
    archived_at = case when coalesce(p_is_archived, false) then now() else null end,
    archived_by = case when coalesce(p_is_archived, false) then public.cc_current_app_user_id() else null end,
    updated_at = coalesce(updated_at, now())
  where id = p_conversation_id;
end;
$$;

grant execute on function public.pin_communication_centre_conversation(uuid, boolean) to authenticated;
grant execute on function public.archive_communication_centre_conversation(uuid, boolean) to authenticated;

-- 7. Keep PostgREST schema current.
notify pgrst, 'reload schema';
