-- Enforce Communication Centre privacy for every role, including admins.
-- A user can read a conversation only when they are a participant, explicitly
-- assigned/owner/requester/creator by id or email, or included by assigned role.

begin;

create or replace function public.cc_normalize_role_key(p_role text)
returns text
language sql
immutable
as $$
  select regexp_replace(replace(lower(btrim(coalesce(p_role, ''))), '-', '_'), '\s+', '_', 'g');
$$;

create or replace function public.can_view_communication_centre_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := public.cc_current_app_user_id();
  v_auth_uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(auth.jwt()->>'email', '')));
  v_role text := public.cc_normalize_role_key(public.cc_current_role_key());
  v_conversation jsonb;
  v_assigned_roles text[];
begin
  if p_conversation_id is null or v_auth_uid is null then
    return false;
  end if;

  select to_jsonb(c)
  into v_conversation
  from public.communication_centre_conversations c
  where c.id = p_conversation_id
  limit 1;

  if v_conversation is null then
    return false;
  end if;

  -- Explicit participant rows grant access. Match by app user id, auth uid, or email-like columns.
  if exists (
    select 1
    from public.communication_centre_participants p
    where p.conversation_id = p_conversation_id
      and (
        (v_user_id is not null and coalesce(to_jsonb(p)->>'user_id', '') = v_user_id::text)
        or coalesce(to_jsonb(p)->>'user_id', '') = v_auth_uid::text
        or coalesce(to_jsonb(p)->>'profile_id', '') in (coalesce(v_user_id::text, ''), v_auth_uid::text)
        or coalesce(to_jsonb(p)->>'auth_user_id', '') = v_auth_uid::text
        or (
          v_email <> ''
          and lower(coalesce(to_jsonb(p)->>'email', to_jsonb(p)->>'participant_email', to_jsonb(p)->>'user_email', '')) = v_email
        )
      )
  ) then
    return true;
  end if;

  -- Direct id assignment fields on the conversation row grant access.
  if coalesce(v_user_id::text, '') <> '' and coalesce(v_user_id::text, '') = any(array[
    coalesce(v_conversation->>'assigned_to', ''),
    coalesce(v_conversation->>'assigned_to_id', ''),
    coalesce(v_conversation->>'assignee_id', ''),
    coalesce(v_conversation->>'owner_id', ''),
    coalesce(v_conversation->>'created_by', ''),
    coalesce(v_conversation->>'requested_by', '')
  ]) then
    return true;
  end if;

  if v_auth_uid::text = any(array[
    coalesce(v_conversation->>'assigned_to', ''),
    coalesce(v_conversation->>'assigned_to_id', ''),
    coalesce(v_conversation->>'assignee_id', ''),
    coalesce(v_conversation->>'owner_id', ''),
    coalesce(v_conversation->>'created_by', ''),
    coalesce(v_conversation->>'requested_by', '')
  ]) then
    return true;
  end if;

  -- Email assignment fields on the conversation row grant access.
  if v_email <> '' and v_email = any(array[
    lower(coalesce(v_conversation->>'assigned_to_email', '')),
    lower(coalesce(v_conversation->>'assignee_email', '')),
    lower(coalesce(v_conversation->>'owner_email', '')),
    lower(coalesce(v_conversation->>'created_by_email', '')),
    lower(coalesce(v_conversation->>'requested_by_email', ''))
  ]) then
    return true;
  end if;

  -- Support both text/comma assigned_roles and the legacy assigned_role field.
  v_assigned_roles := array(
    select public.cc_normalize_role_key(value)
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(v_conversation->'assigned_roles') = 'array' then v_conversation->'assigned_roles'
        else to_jsonb(string_to_array(coalesce(nullif(v_conversation->>'assigned_roles', ''), v_conversation->>'assigned_role', ''), ','))
      end
    ) as value
    where public.cc_normalize_role_key(value) <> ''
  );

  if v_role <> '' and v_role = any(coalesce(v_assigned_roles, array[]::text[])) then
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.cc_normalize_role_key(text) to authenticated;
grant execute on function public.can_view_communication_centre_conversation(uuid) to authenticated;

alter table if exists public.communication_centre_conversations enable row level security;
alter table if exists public.communication_centre_participants enable row level security;
alter table if exists public.communication_centre_messages enable row level security;
alter table if exists public.communication_centre_read_receipts enable row level security;
alter table if exists public.communication_centre_message_reactions enable row level security;
alter table if exists public.communication_centre_action_items enable row level security;

-- Remove older policies that explicitly allowed admins to read every conversation.
drop policy if exists communication_centre_conversations_select_access on public.communication_centre_conversations;
drop policy if exists communication_centre_participants_select_access on public.communication_centre_participants;
drop policy if exists "cc conversations realtime select" on public.communication_centre_conversations;
drop policy if exists "cc participants realtime select" on public.communication_centre_participants;
drop policy if exists "cc messages realtime select" on public.communication_centre_messages;
drop policy if exists "cc read receipts realtime select" on public.communication_centre_read_receipts;
drop policy if exists "cc reactions realtime select" on public.communication_centre_message_reactions;

drop policy if exists "cc conversations assigned participant select" on public.communication_centre_conversations;
create policy "cc conversations assigned participant select"
on public.communication_centre_conversations
for select
to authenticated
using (public.can_view_communication_centre_conversation(id));

drop policy if exists "cc participants assigned participant select" on public.communication_centre_participants;
create policy "cc participants assigned participant select"
on public.communication_centre_participants
for select
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists "cc messages assigned participant select" on public.communication_centre_messages;
create policy "cc messages assigned participant select"
on public.communication_centre_messages
for select
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists "cc read receipts assigned participant select" on public.communication_centre_read_receipts;
create policy "cc read receipts assigned participant select"
on public.communication_centre_read_receipts
for select
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists "cc reactions assigned participant select" on public.communication_centre_message_reactions;
create policy "cc reactions assigned participant select"
on public.communication_centre_message_reactions
for select
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists "cc action items assigned participant select" on public.communication_centre_action_items;
create policy "cc action items assigned participant select"
on public.communication_centre_action_items
for select
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id));

notify pgrst, 'reload schema';

commit;
