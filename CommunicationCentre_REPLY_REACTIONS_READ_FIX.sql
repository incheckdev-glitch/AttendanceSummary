-- =========================================================
-- Communication Centre reply/reactions/read receipt final fix
-- Fixes:
-- - Unable to send reply
-- - Emoji/reaction buttons not working
-- - Adds received/read support through read receipts
-- - Keeps delete separate from normal manage/use actions
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- Safe helper functions ----------
create or replace function public.cc_auth_email()
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  v_email := lower(coalesce(auth.jwt()->>'email', ''));
  if v_email <> '' then return v_email; end if;

  select lower(email) into v_email
  from auth.users
  where id = auth.uid()
  limit 1;

  return nullif(v_email, '');
exception when others then
  return nullif(lower(coalesce(auth.jwt()->>'email', '')), '');
end;
$$;

create or replace function public.cc_current_profile_json()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_email text := public.cc_auth_email();
  v_table regclass;
  v_profile jsonb;
begin
  if v_auth_uid is null then return null; end if;

  foreach v_table in array array[
    to_regclass('public.profile'),
    to_regclass('public.profiles'),
    to_regclass('public.users')
  ] loop
    if v_table is not null then
      execute format($q$
        select to_jsonb(x)
        from %s x
        where coalesce(to_jsonb(x)->>'id','') = $1
           or coalesce(to_jsonb(x)->>'auth_user_id','') = $1
           or coalesce(to_jsonb(x)->>'user_id','') = $1
           or coalesce(to_jsonb(x)->>'auth_id','') = $1
           or coalesce(to_jsonb(x)->>'supabase_user_id','') = $1
           or ($2 <> '' and lower(coalesce(to_jsonb(x)->>'email','')) = $2)
        limit 1
      $q$, v_table)
      into v_profile
      using v_auth_uid::text, coalesce(v_email, '');

      if v_profile is not null then return v_profile; end if;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.cc_current_app_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_profile jsonb := public.cc_current_profile_json();
  v_id text;
begin
  if v_auth_uid is null then return null; end if;

  v_id := coalesce(
    nullif(v_profile->>'id',''),
    nullif(v_profile->>'user_id',''),
    nullif(v_profile->>'auth_user_id',''),
    nullif(v_profile->>'auth_id',''),
    nullif(v_profile->>'supabase_user_id','')
  );

  if v_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_id::uuid;
  end if;

  return v_auth_uid;
end;
$$;

create or replace function public.cc_current_user_name()
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_profile jsonb := public.cc_current_profile_json();
  v_email text := public.cc_auth_email();
  v_name text;
begin
  v_name := coalesce(
    nullif(v_profile->>'full_name',''),
    nullif(v_profile->>'name',''),
    nullif(v_profile->>'display_name',''),
    nullif(v_profile->>'user_name',''),
    nullif(v_profile->>'username',''),
    nullif(v_profile->>'email',''),
    v_email,
    auth.uid()::text
  );
  return v_name;
end;
$$;

create or replace function public.cc_current_role_key()
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_profile jsonb := public.cc_current_profile_json();
  v_role text;
begin
  v_role := lower(coalesce(
    nullif(v_profile->>'role_key',''),
    nullif(v_profile->>'app_role',''),
    nullif(v_profile->>'role',''),
    nullif(v_profile->>'user_role',''),
    nullif(v_profile->>'role_name','')
  ));

  if v_role in ('authenticated','anon','service_role','') then
    return null;
  end if;
  return nullif(v_role, '');
end;
$$;

create or replace function public.cc_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(public.cc_current_role_key(), '')) in ('admin','administrator','super_admin');
$$;

-- Final business rule: all authenticated app users can use normal CC actions.
-- Delete remains explicit only.
create or replace function public.cc_has_permission(p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.cc_current_role_key();
  v_action text := lower(coalesce(p_action, ''));
  v_allowed boolean := false;
begin
  if auth.uid() is null then return false; end if;

  if v_action = 'delete' then
    select exists (
      select 1
      from public.role_permissions rp
      where lower(rp.role_key) = lower(coalesce(v_role,''))
        and rp.resource = 'communication_centre'
        and rp.action = 'delete'
        and coalesce(rp.is_allowed,false) = true
        and coalesce(rp.is_active,true) = true
    ) into v_allowed;
    return coalesce(v_allowed,false);
  end if;

  return true;
end;
$$;

create or replace function public.can_view_communication_centre_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_app_uid uuid := public.cc_current_app_user_id();
  v_auth_uid uuid := auth.uid();
begin
  if v_auth_uid is null then return false; end if;
  if public.cc_is_admin() then return true; end if;

  if exists (
    select 1
    from public.communication_centre_conversations c
    where c.id = p_conversation_id
      and (c.created_by = v_app_uid or c.created_by = v_auth_uid)
  ) then return true; end if;

  if exists (
    select 1
    from public.communication_centre_participants p
    where p.conversation_id = p_conversation_id
      and (p.user_id = v_app_uid or p.user_id = v_auth_uid)
  ) then return true; end if;

  return false;
end;
$$;

-- ---------- Tables / columns ----------
alter table if exists public.communication_centre_messages
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists message_body text,
  add column if not exists sender_id uuid,
  add column if not exists sender_name text,
  add column if not exists is_system_message boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists reply_to_message_id uuid null,
  add column if not exists edited_at timestamptz null,
  add column if not exists edited_by uuid null,
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists message_type text not null default 'message';

alter table if exists public.communication_centre_conversations
  add column if not exists last_message_preview text,
  add column if not exists last_message_at timestamptz,
  add column if not exists updated_at timestamptz default now();

create table if not exists public.communication_centre_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  conversation_id uuid not null,
  user_id uuid not null,
  user_name text,
  reaction text not null,
  created_at timestamptz not null default now(),
  unique(message_id, user_id, reaction)
);

create table if not exists public.communication_centre_read_receipts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null,
  user_name text,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(conversation_id, user_id)
);

-- ---------- RPCs ----------
create or replace function public.add_communication_centre_reply(
  p_conversation_id uuid,
  p_message_body text,
  p_reply_to_message_id uuid default null,
  p_message_type text default 'message'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := public.cc_current_app_user_id();
  v_auth_uid uuid := auth.uid();
  v_user_name text := public.cc_current_user_name();
  v_message_id uuid;
  v_body text := nullif(trim(coalesce(p_message_body,'')), '');
  v_status text;
begin
  if v_auth_uid is null then
    raise exception 'Forbidden: authenticated user is required';
  end if;
  if v_body is null then
    raise exception 'Message body is required';
  end if;
  if not public.cc_has_permission('reply') then
    raise exception 'Forbidden: communication_centre:reply permission is required';
  end if;
  if not public.can_view_communication_centre_conversation(p_conversation_id) then
    raise exception 'Forbidden: you do not have access to this conversation';
  end if;

  select status into v_status
  from public.communication_centre_conversations
  where id = p_conversation_id;

  if lower(coalesce(v_status,'')) = 'closed' then
    raise exception 'Conversation is closed';
  end if;

  insert into public.communication_centre_messages (
    conversation_id,
    message_body,
    sender_id,
    sender_name,
    is_system_message,
    created_at,
    reply_to_message_id,
    message_type
  ) values (
    p_conversation_id,
    v_body,
    coalesce(v_user_id, v_auth_uid),
    v_user_name,
    false,
    now(),
    p_reply_to_message_id,
    coalesce(nullif(p_message_type,''), 'message')
  ) returning id into v_message_id;

  update public.communication_centre_conversations
  set last_message_preview = left(v_body, 180),
      last_message_at = now(),
      updated_at = now()
  where id = p_conversation_id;

  perform public.mark_communication_centre_read(p_conversation_id);

  return v_message_id;
end;
$$;

create or replace function public.mark_communication_centre_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := public.cc_current_app_user_id();
  v_auth_uid uuid := auth.uid();
  v_user_name text := public.cc_current_user_name();
begin
  if v_auth_uid is null then return; end if;
  if not public.can_view_communication_centre_conversation(p_conversation_id) then return; end if;

  insert into public.communication_centre_read_receipts (
    conversation_id,
    user_id,
    user_name,
    last_read_at,
    created_at,
    updated_at
  ) values (
    p_conversation_id,
    coalesce(v_user_id, v_auth_uid),
    v_user_name,
    now(),
    now(),
    now()
  )
  on conflict (conversation_id, user_id)
  do update set
    user_name = excluded.user_name,
    last_read_at = excluded.last_read_at,
    updated_at = now();
end;
$$;

create or replace function public.toggle_communication_centre_reaction(
  p_message_id uuid,
  p_reaction text
)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := public.cc_current_app_user_id();
  v_auth_uid uuid := auth.uid();
  v_user_name text := public.cc_current_user_name();
  v_conversation_id uuid;
  v_allowed text[] := array['👍','✅','👀','🙏','🔥'];
  v_existing uuid;
begin
  if v_auth_uid is null then
    raise exception 'Forbidden: authenticated user is required';
  end if;

  if not (p_reaction = any(v_allowed)) then
    raise exception 'Unsupported reaction';
  end if;

  select conversation_id into v_conversation_id
  from public.communication_centre_messages
  where id = p_message_id
  limit 1;

  if v_conversation_id is null then
    raise exception 'Message not found';
  end if;

  if not public.can_view_communication_centre_conversation(v_conversation_id) then
    raise exception 'Forbidden: you do not have access to this conversation';
  end if;

  select id into v_existing
  from public.communication_centre_message_reactions
  where message_id = p_message_id
    and user_id = coalesce(v_user_id, v_auth_uid)
    and reaction = p_reaction
  limit 1;

  if v_existing is not null then
    delete from public.communication_centre_message_reactions where id = v_existing;
    return 'removed';
  end if;

  insert into public.communication_centre_message_reactions (
    message_id,
    conversation_id,
    user_id,
    user_name,
    reaction,
    created_at
  ) values (
    p_message_id,
    v_conversation_id,
    coalesce(v_user_id, v_auth_uid),
    v_user_name,
    p_reaction,
    now()
  );

  return 'added';
end;
$$;

-- ---------- RLS policies ----------
alter table if exists public.communication_centre_messages enable row level security;
alter table if exists public.communication_centre_message_reactions enable row level security;
alter table if exists public.communication_centre_read_receipts enable row level security;

drop policy if exists communication_centre_messages_select_access on public.communication_centre_messages;
create policy communication_centre_messages_select_access
on public.communication_centre_messages
for select
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists communication_centre_message_reactions_select_access on public.communication_centre_message_reactions;
create policy communication_centre_message_reactions_select_access
on public.communication_centre_message_reactions
for select
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists communication_centre_read_receipts_select_access on public.communication_centre_read_receipts;
create policy communication_centre_read_receipts_select_access
on public.communication_centre_read_receipts
for select
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists communication_centre_read_receipts_insert_access on public.communication_centre_read_receipts;
create policy communication_centre_read_receipts_insert_access
on public.communication_centre_read_receipts
for insert
to authenticated
with check (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists communication_centre_read_receipts_update_access on public.communication_centre_read_receipts;
create policy communication_centre_read_receipts_update_access
on public.communication_centre_read_receipts
for update
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id))
with check (public.can_view_communication_centre_conversation(conversation_id));

grant execute on function public.add_communication_centre_reply(uuid,text,uuid,text) to authenticated;
grant execute on function public.mark_communication_centre_read(uuid) to authenticated;
grant execute on function public.toggle_communication_centre_reaction(uuid,text) to authenticated;
grant execute on function public.cc_auth_email() to authenticated;
grant execute on function public.cc_current_profile_json() to authenticated;
grant execute on function public.cc_current_app_user_id() to authenticated;
grant execute on function public.cc_current_user_name() to authenticated;
grant execute on function public.cc_current_role_key() to authenticated;
grant execute on function public.cc_is_admin() to authenticated;
grant execute on function public.cc_has_permission(text) to authenticated;
grant execute on function public.can_view_communication_centre_conversation(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Verification result: from SQL editor role will be null because there is no app auth session.
select
  'communication_centre_reply_reactions_read_fix_installed' as status,
  to_regclass('public.communication_centre_read_receipts') is not null as read_receipts_ready,
  to_regclass('public.communication_centre_message_reactions') is not null as reactions_ready;
