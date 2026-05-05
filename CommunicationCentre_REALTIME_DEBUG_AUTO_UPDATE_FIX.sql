-- =========================================================
-- Communication Centre realtime + debug + message action fix
-- Fixes:
-- - new messages/status/read ticks not auto-updating on the other side
-- - edit message RPC stability
-- - soft-delete message RPC stability
-- - emoji reaction RPC stability
-- No attachments are added.
-- =========================================================

create extension if not exists pgcrypto;

-- 1. Required columns / tables
alter table if exists public.communication_centre_conversations
  add column if not exists last_message_preview text,
  add column if not exists last_message_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.communication_centre_messages
  add column if not exists sender_id uuid,
  add column if not exists sender_name text,
  add column if not exists message_body text,
  add column if not exists is_system_message boolean not null default false,
  add column if not exists reply_to_message_id uuid,
  add column if not exists message_type text not null default 'message',
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.communication_centre_read_receipts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.communication_centre_read_receipts
  add column if not exists conversation_id uuid,
  add column if not exists user_id uuid,
  add column if not exists last_read_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists communication_centre_read_receipts_conversation_user_idx
on public.communication_centre_read_receipts (conversation_id, user_id);

create table if not exists public.communication_centre_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  conversation_id uuid not null,
  user_id uuid not null,
  user_name text,
  reaction text not null,
  created_at timestamptz not null default now()
);

alter table public.communication_centre_message_reactions
  add column if not exists message_id uuid,
  add column if not exists conversation_id uuid,
  add column if not exists user_id uuid,
  add column if not exists user_name text,
  add column if not exists reaction text,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists communication_centre_reactions_unique_idx
on public.communication_centre_message_reactions (message_id, user_id, reaction);

-- 2. Current actor name helper, independent of the frontend
create or replace function public.cc_current_actor_name()
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := public.cc_current_app_user_id();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_table regclass;
  v_name text;
begin
  foreach v_table in array array[
    to_regclass('public.profile'),
    to_regclass('public.profiles'),
    to_regclass('public.users')
  ]
  loop
    if v_table is not null then
      execute format(
        $q$
        select coalesce(
          nullif(to_jsonb(x)->>'full_name', ''),
          nullif(to_jsonb(x)->>'name', ''),
          nullif(to_jsonb(x)->>'display_name', ''),
          nullif(to_jsonb(x)->>'username', ''),
          nullif(to_jsonb(x)->>'email', '')
        )
        from %s x
        where
          coalesce(to_jsonb(x)->>'id', '') = $1
          or coalesce(to_jsonb(x)->>'auth_user_id', '') = $1
          or coalesce(to_jsonb(x)->>'user_id', '') = $1
          or coalesce(to_jsonb(x)->>'auth_id', '') = $1
          or coalesce(to_jsonb(x)->>'supabase_user_id', '') = $1
          or ($2 <> '' and lower(coalesce(to_jsonb(x)->>'email', '')) = $2)
        limit 1
        $q$,
        v_table
      ) into v_name using coalesce(v_user_id::text, ''), v_email;

      if nullif(v_name, '') is not null then
        return v_name;
      end if;
    end if;
  end loop;

  return coalesce(nullif(v_email, ''), 'User');
end;
$$;

grant execute on function public.cc_current_actor_name() to authenticated;

-- 3. Read receipts / read-status RPC
-- Drop first because return type changed in earlier iterations.
drop function if exists public.mark_communication_centre_read(uuid);

create function public.mark_communication_centre_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := public.cc_current_app_user_id();
begin
  if p_conversation_id is null or v_user_id is null then
    return;
  end if;

  if not public.can_view_communication_centre_conversation(p_conversation_id) then
    return;
  end if;

  insert into public.communication_centre_read_receipts (
    conversation_id,
    user_id,
    last_read_at,
    created_at,
    updated_at
  ) values (
    p_conversation_id,
    v_user_id,
    now(),
    now(),
    now()
  )
  on conflict (conversation_id, user_id)
  do update set
    last_read_at = excluded.last_read_at,
    updated_at = now();
end;
$$;

grant execute on function public.mark_communication_centre_read(uuid) to authenticated;

-- 4. Reply RPC with exact frontend parameter names
drop function if exists public.add_communication_centre_reply(uuid, text, uuid, text);

create function public.add_communication_centre_reply(
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
  v_actor_name text := public.cc_current_actor_name();
  v_message_id uuid;
  v_body text := btrim(coalesce(p_message_body, ''));
  v_type text := lower(coalesce(nullif(btrim(p_message_type), ''), 'message'));
begin
  if p_conversation_id is null then
    raise exception 'Conversation is required';
  end if;

  if v_user_id is null then
    raise exception 'Forbidden: authentication is required';
  end if;

  if v_body = '' then
    raise exception 'Message body is required';
  end if;

  if not public.can_view_communication_centre_conversation(p_conversation_id) then
    raise exception 'Forbidden: you do not have access to this conversation';
  end if;

  if v_type not in ('message', 'internal_note', 'system') then
    v_type := 'message';
  end if;

  insert into public.communication_centre_messages (
    conversation_id,
    sender_id,
    sender_name,
    message_body,
    is_system_message,
    reply_to_message_id,
    message_type,
    is_deleted,
    created_at
  ) values (
    p_conversation_id,
    v_user_id,
    v_actor_name,
    v_body,
    false,
    p_reply_to_message_id,
    v_type,
    false,
    now()
  ) returning id into v_message_id;

  update public.communication_centre_conversations
  set
    updated_at = now(),
    last_message_at = now(),
    last_message_preview = left(v_body, 180)
  where id = p_conversation_id;

  perform public.mark_communication_centre_read(p_conversation_id);

  return v_message_id;
end;
$$;

grant execute on function public.add_communication_centre_reply(uuid, text, uuid, text) to authenticated;

-- 5. Edit own message RPC
create or replace function public.edit_communication_centre_message(
  p_message_id uuid,
  p_message_body text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := public.cc_current_app_user_id();
  v_auth_uid uuid := auth.uid();
  v_actor_name text := lower(public.cc_current_actor_name());
  v_conversation_id uuid;
  v_sender_id uuid;
  v_sender_name text;
  v_body text := btrim(coalesce(p_message_body, ''));
begin
  if v_user_id is null then
    raise exception 'Forbidden: authentication is required';
  end if;

  if v_body = '' then
    raise exception 'Message body is required';
  end if;

  select conversation_id, sender_id, lower(coalesce(sender_name, ''))
  into v_conversation_id, v_sender_id, v_sender_name
  from public.communication_centre_messages
  where id = p_message_id
    and coalesce(is_deleted, false) = false
    and coalesce(is_system_message, false) = false
  limit 1;

  if v_conversation_id is null then
    raise exception 'Message not found';
  end if;

  if not public.can_view_communication_centre_conversation(v_conversation_id) then
    raise exception 'Forbidden: you do not have access to this conversation';
  end if;

  if not (
    v_sender_id = v_user_id
    or v_sender_id = v_auth_uid
    or public.cc_is_admin()
    or (v_sender_name <> '' and v_sender_name = v_actor_name)
  ) then
    raise exception 'Forbidden: only the sender can edit this message';
  end if;

  update public.communication_centre_messages
  set
    message_body = v_body,
    edited_at = now(),
    edited_by = v_user_id
  where id = p_message_id;

  update public.communication_centre_conversations
  set
    updated_at = now(),
    last_message_preview = left(v_body, 180)
  where id = v_conversation_id;

  return true;
end;
$$;

grant execute on function public.edit_communication_centre_message(uuid, text) to authenticated;

-- 6. Soft-delete own message RPC
create or replace function public.soft_delete_communication_centre_message(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := public.cc_current_app_user_id();
  v_auth_uid uuid := auth.uid();
  v_actor_name text := lower(public.cc_current_actor_name());
  v_conversation_id uuid;
  v_sender_id uuid;
  v_sender_name text;
begin
  if v_user_id is null then
    raise exception 'Forbidden: authentication is required';
  end if;

  select conversation_id, sender_id, lower(coalesce(sender_name, ''))
  into v_conversation_id, v_sender_id, v_sender_name
  from public.communication_centre_messages
  where id = p_message_id
    and coalesce(is_deleted, false) = false
    and coalesce(is_system_message, false) = false
  limit 1;

  if v_conversation_id is null then
    raise exception 'Message not found';
  end if;

  if not public.can_view_communication_centre_conversation(v_conversation_id) then
    raise exception 'Forbidden: you do not have access to this conversation';
  end if;

  if not (
    v_sender_id = v_user_id
    or v_sender_id = v_auth_uid
    or public.cc_is_admin()
    or (v_sender_name <> '' and v_sender_name = v_actor_name)
  ) then
    raise exception 'Forbidden: only the sender can delete this message';
  end if;

  update public.communication_centre_messages
  set
    is_deleted = true,
    deleted_at = now(),
    deleted_by = v_user_id,
    edited_at = now(),
    edited_by = v_user_id
  where id = p_message_id;

  update public.communication_centre_conversations
  set updated_at = now()
  where id = v_conversation_id;

  return true;
end;
$$;

grant execute on function public.soft_delete_communication_centre_message(uuid) to authenticated;

-- 7. Emoji/reaction toggle RPC
create or replace function public.toggle_communication_centre_reaction(
  p_message_id uuid,
  p_reaction text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := public.cc_current_app_user_id();
  v_actor_name text := public.cc_current_actor_name();
  v_conversation_id uuid;
  v_reaction text := btrim(coalesce(p_reaction, ''));
  v_existing_id uuid;
begin
  if v_user_id is null then
    raise exception 'Forbidden: authentication is required';
  end if;

  if v_reaction not in ('👍', '✅', '👀', '🙏', '🔥') then
    raise exception 'Unsupported reaction';
  end if;

  select conversation_id
  into v_conversation_id
  from public.communication_centre_messages
  where id = p_message_id
  limit 1;

  if v_conversation_id is null then
    raise exception 'Message not found';
  end if;

  if not public.can_view_communication_centre_conversation(v_conversation_id) then
    raise exception 'Forbidden: you do not have access to this conversation';
  end if;

  select id
  into v_existing_id
  from public.communication_centre_message_reactions
  where message_id = p_message_id
    and user_id = v_user_id
    and reaction = v_reaction
  limit 1;

  if v_existing_id is not null then
    delete from public.communication_centre_message_reactions
    where id = v_existing_id;
  else
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
      v_user_id,
      v_actor_name,
      v_reaction,
      now()
    );
  end if;

  update public.communication_centre_conversations
  set updated_at = now()
  where id = v_conversation_id;

  return true;
end;
$$;

grant execute on function public.toggle_communication_centre_reaction(uuid, text) to authenticated;

-- 8. RLS policies needed for realtime-visible selects
alter table if exists public.communication_centre_conversations enable row level security;
alter table if exists public.communication_centre_messages enable row level security;
alter table if exists public.communication_centre_participants enable row level security;
alter table if exists public.communication_centre_read_receipts enable row level security;
alter table if exists public.communication_centre_message_reactions enable row level security;

-- Keep policies additive and scoped to Communication Centre visibility.
drop policy if exists "cc conversations realtime select" on public.communication_centre_conversations;
create policy "cc conversations realtime select"
on public.communication_centre_conversations
for select
to authenticated
using (public.can_view_communication_centre_conversation(id));

drop policy if exists "cc messages realtime select" on public.communication_centre_messages;
create policy "cc messages realtime select"
on public.communication_centre_messages
for select
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists "cc participants realtime select" on public.communication_centre_participants;
create policy "cc participants realtime select"
on public.communication_centre_participants
for select
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists "cc read receipts realtime select" on public.communication_centre_read_receipts;
create policy "cc read receipts realtime select"
on public.communication_centre_read_receipts
for select
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists "cc reactions realtime select" on public.communication_centre_message_reactions;
create policy "cc reactions realtime select"
on public.communication_centre_message_reactions
for select
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id));

-- Reactions insert/delete policies for fallback/direct safety.
drop policy if exists "cc reactions insert own" on public.communication_centre_message_reactions;
create policy "cc reactions insert own"
on public.communication_centre_message_reactions
for insert
to authenticated
with check (
  user_id = public.cc_current_app_user_id()
  and public.can_view_communication_centre_conversation(conversation_id)
);

drop policy if exists "cc reactions delete own" on public.communication_centre_message_reactions;
create policy "cc reactions delete own"
on public.communication_centre_message_reactions
for delete
to authenticated
using (
  user_id = public.cc_current_app_user_id()
  and public.can_view_communication_centre_conversation(conversation_id)
);

-- Read receipts insert/update policies for mark-read RPC and direct visibility.
drop policy if exists "cc read receipts insert own" on public.communication_centre_read_receipts;
create policy "cc read receipts insert own"
on public.communication_centre_read_receipts
for insert
to authenticated
with check (
  user_id = public.cc_current_app_user_id()
  and public.can_view_communication_centre_conversation(conversation_id)
);

drop policy if exists "cc read receipts update own" on public.communication_centre_read_receipts;
create policy "cc read receipts update own"
on public.communication_centre_read_receipts
for update
to authenticated
using (
  user_id = public.cc_current_app_user_id()
  and public.can_view_communication_centre_conversation(conversation_id)
)
with check (
  user_id = public.cc_current_app_user_id()
  and public.can_view_communication_centre_conversation(conversation_id)
);

-- 9. Realtime publication / replica identity
alter table if exists public.communication_centre_conversations replica identity full;
alter table if exists public.communication_centre_messages replica identity full;
alter table if exists public.communication_centre_participants replica identity full;
alter table if exists public.communication_centre_read_receipts replica identity full;
alter table if exists public.communication_centre_message_reactions replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'communication_centre_conversations') then
      alter publication supabase_realtime add table public.communication_centre_conversations;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'communication_centre_messages') then
      alter publication supabase_realtime add table public.communication_centre_messages;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'communication_centre_participants') then
      alter publication supabase_realtime add table public.communication_centre_participants;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'communication_centre_read_receipts') then
      alter publication supabase_realtime add table public.communication_centre_read_receipts;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'communication_centre_message_reactions') then
      alter publication supabase_realtime add table public.communication_centre_message_reactions;
    end if;
  else
    raise notice 'Publication supabase_realtime does not exist in this database.';
  end if;
end $$;

-- 10. Debug helper for browser console / SQL checks while logged in through RPC
create or replace function public.communication_centre_realtime_debug()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := public.cc_current_app_user_id();
  v_role text := public.cc_current_role_key();
  v_result jsonb;
begin
  select jsonb_build_object(
    'auth_uid', auth.uid(),
    'app_user_id', v_user_id,
    'role_key', v_role,
    'can_manage', public.cc_has_permission('manage'),
    'can_create', public.cc_has_permission('create'),
    'can_reply', public.cc_has_permission('reply'),
    'can_delete', public.cc_has_permission('delete'),
    'realtime_tables', coalesce((
      select jsonb_agg(tablename order by tablename)
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename ilike 'communication_centre%'
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.communication_centre_realtime_debug() to authenticated;

notify pgrst, 'reload schema';

-- Verification output
select *
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename ilike 'communication_centre%'
order by tablename;
