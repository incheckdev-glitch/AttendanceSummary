-- =========================================================
-- Communication Centre edit/delete/read/realtime final fix
-- Fixes:
-- - send reply RPC reliability
-- - edit own message
-- - soft-delete own message
-- - emoji/reactions RPC
-- - read receipt ticks / realtime refresh support
-- No attachments are added.
-- =========================================================

create extension if not exists pgcrypto;

-- 1. Ensure required message columns exist
alter table public.communication_centre_messages
  add column if not exists message_body text;

alter table public.communication_centre_messages
  add column if not exists sender_id uuid;

alter table public.communication_centre_messages
  add column if not exists sender_name text;

alter table public.communication_centre_messages
  add column if not exists message_type text not null default 'message';

alter table public.communication_centre_messages
  add column if not exists reply_to_message_id uuid;

alter table public.communication_centre_messages
  add column if not exists edited_at timestamptz;

alter table public.communication_centre_messages
  add column if not exists edited_by uuid;

alter table public.communication_centre_messages
  add column if not exists is_deleted boolean not null default false;

alter table public.communication_centre_messages
  add column if not exists deleted_at timestamptz;

alter table public.communication_centre_messages
  add column if not exists deleted_by uuid;

alter table public.communication_centre_messages
  add column if not exists created_at timestamptz not null default now();

-- 2. Ensure conversation helper columns exist
alter table public.communication_centre_conversations
  add column if not exists last_message_preview text;

alter table public.communication_centre_conversations
  add column if not exists last_message_at timestamptz;

alter table public.communication_centre_conversations
  add column if not exists updated_at timestamptz not null default now();

-- 3. Ensure read receipts table exists
create table if not exists public.communication_centre_read_receipts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.communication_centre_read_receipts
  add column if not exists conversation_id uuid;

alter table public.communication_centre_read_receipts
  add column if not exists user_id uuid;

alter table public.communication_centre_read_receipts
  add column if not exists last_read_at timestamptz not null default now();

alter table public.communication_centre_read_receipts
  add column if not exists created_at timestamptz not null default now();

alter table public.communication_centre_read_receipts
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists communication_centre_read_receipts_conversation_user_idx
  on public.communication_centre_read_receipts (conversation_id, user_id);

-- 4. Ensure reactions table exists
create table if not exists public.communication_centre_message_reactions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  message_id uuid not null,
  user_id uuid not null,
  user_name text,
  reaction text not null,
  created_at timestamptz not null default now()
);

alter table public.communication_centre_message_reactions
  add column if not exists conversation_id uuid;

alter table public.communication_centre_message_reactions
  add column if not exists message_id uuid;

alter table public.communication_centre_message_reactions
  add column if not exists user_id uuid;

alter table public.communication_centre_message_reactions
  add column if not exists user_name text;

alter table public.communication_centre_message_reactions
  add column if not exists reaction text;

alter table public.communication_centre_message_reactions
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists communication_centre_message_reactions_unique_idx
  on public.communication_centre_message_reactions (message_id, user_id, reaction);

-- 5. Helper: actor display name
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
          nullif(to_jsonb(x)->>'user_name', ''),
          nullif(to_jsonb(x)->>'username', ''),
          nullif(to_jsonb(x)->>'email', '')
        )
        from %s x
        where
          coalesce(to_jsonb(x)->>'id', '') = $1
          or coalesce(to_jsonb(x)->>'user_id', '') = $1
          or coalesce(to_jsonb(x)->>'auth_user_id', '') = $1
          or ($2 <> '' and lower(coalesce(to_jsonb(x)->>'email', '')) = $2)
        limit 1
        $q$,
        v_table
      ) into v_name using coalesce(v_user_id::text, ''), coalesce(v_email, '');

      if nullif(v_name, '') is not null then
        return v_name;
      end if;
    end if;
  end loop;

  return coalesce(nullif(v_email, ''), 'User');
exception when others then
  return coalesce(nullif(v_email, ''), 'User');
end;
$$;

grant execute on function public.cc_current_actor_name() to authenticated;

-- 6. Drop functions that need a clean return/signature
DROP FUNCTION IF EXISTS public.mark_communication_centre_read(uuid);
DROP FUNCTION IF EXISTS public.add_communication_centre_reply(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.add_communication_centre_reply(uuid, text);
DROP FUNCTION IF EXISTS public.edit_communication_centre_message(uuid, text);
DROP FUNCTION IF EXISTS public.soft_delete_communication_centre_message(uuid);
DROP FUNCTION IF EXISTS public.toggle_communication_centre_reaction(uuid, text);

-- 7. Mark read
create or replace function public.mark_communication_centre_read(p_conversation_id uuid)
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

-- 8. Add reply/message
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
  v_actor_name text := public.cc_current_actor_name();
  v_message_id uuid;
  v_body text := btrim(coalesce(p_message_body, ''));
  v_type text := lower(coalesce(nullif(p_message_type, ''), 'message'));
begin
  if v_user_id is null then
    raise exception 'Forbidden: authentication is required';
  end if;

  if v_body = '' then
    raise exception 'Message body is required';
  end if;

  if not public.can_view_communication_centre_conversation(p_conversation_id) then
    raise exception 'Forbidden: you do not have access to this conversation';
  end if;

  if not public.cc_has_permission('reply') and not public.cc_has_permission('manage') then
    raise exception 'Forbidden: communication_centre:reply permission is required';
  end if;

  if v_type not in ('message', 'internal_note', 'system') then
    v_type := 'message';
  end if;

  insert into public.communication_centre_messages (
    conversation_id,
    sender_id,
    sender_name,
    message_body,
    message_type,
    reply_to_message_id,
    created_at,
    is_deleted
  ) values (
    p_conversation_id,
    v_user_id,
    v_actor_name,
    v_body,
    v_type,
    p_reply_to_message_id,
    now(),
    false
  )
  returning id into v_message_id;

  update public.communication_centre_conversations
  set
    updated_at = now(),
    last_message_at = now(),
    last_message_preview = left(v_body, 180)
  where id = p_conversation_id;

  -- Sender has read their own message.
  perform public.mark_communication_centre_read(p_conversation_id);

  return v_message_id;
end;
$$;

grant execute on function public.add_communication_centre_reply(uuid, text, uuid, text) to authenticated;

-- 9. Edit own message
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
  limit 1;

  if v_conversation_id is null then
    raise exception 'Message not found';
  end if;

  if not public.can_view_communication_centre_conversation(v_conversation_id) then
    raise exception 'Forbidden: you do not have access to this conversation';
  end if;

  if not (v_sender_id = v_user_id or public.cc_is_admin() or (v_sender_name <> '' and v_sender_name = v_actor_name)) then
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

-- 10. Soft-delete own message
create or replace function public.soft_delete_communication_centre_message(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := public.cc_current_app_user_id();
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
  limit 1;

  if v_conversation_id is null then
    raise exception 'Message not found';
  end if;

  if not public.can_view_communication_centre_conversation(v_conversation_id) then
    raise exception 'Forbidden: you do not have access to this conversation';
  end if;

  if not (v_sender_id = v_user_id or public.cc_is_admin() or (v_sender_name <> '' and v_sender_name = v_actor_name)) then
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

-- 11. Toggle emoji/reaction
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
  v_reaction text := coalesce(nullif(p_reaction, ''), '👍');
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

  if exists (
    select 1
    from public.communication_centre_message_reactions
    where message_id = p_message_id
      and user_id = v_user_id
      and reaction = v_reaction
  ) then
    delete from public.communication_centre_message_reactions
    where message_id = p_message_id
      and user_id = v_user_id
      and reaction = v_reaction;
  else
    insert into public.communication_centre_message_reactions (
      conversation_id,
      message_id,
      user_id,
      user_name,
      reaction,
      created_at
    ) values (
      v_conversation_id,
      p_message_id,
      v_user_id,
      v_actor_name,
      v_reaction,
      now()
    )
    on conflict (message_id, user_id, reaction) do nothing;
  end if;

  return true;
end;
$$;

grant execute on function public.toggle_communication_centre_reaction(uuid, text) to authenticated;

-- 12. RLS policies for new/support tables
alter table public.communication_centre_read_receipts enable row level security;
alter table public.communication_centre_message_reactions enable row level security;

drop policy if exists "cc read receipts select" on public.communication_centre_read_receipts;
create policy "cc read receipts select"
on public.communication_centre_read_receipts
for select
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists "cc read receipts write" on public.communication_centre_read_receipts;
create policy "cc read receipts write"
on public.communication_centre_read_receipts
for all
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id))
with check (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists "cc reactions select" on public.communication_centre_message_reactions;
create policy "cc reactions select"
on public.communication_centre_message_reactions
for select
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists "cc reactions write" on public.communication_centre_message_reactions;
create policy "cc reactions write"
on public.communication_centre_message_reactions
for all
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id))
with check (public.can_view_communication_centre_conversation(conversation_id));

-- 13. Realtime support. Ignore if publication is unavailable or tables already added.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'communication_centre_conversations',
    'communication_centre_messages',
    'communication_centre_read_receipts',
    'communication_centre_message_reactions',
    'communication_centre_action_items'
  ]
  loop
    begin
      execute format('alter table public.%I replica identity full', v_table);
    exception when others then
      raise notice 'Could not set replica identity for %: %', v_table, sqlerrm;
    end;

    begin
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    exception
      when duplicate_object then null;
      when undefined_object then raise notice 'supabase_realtime publication not found.';
      when others then raise notice 'Could not add % to realtime publication: %', v_table, sqlerrm;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- 14. Quick verification
select 'communication_centre_edit_delete_read_realtime_fix_applied' as status;
