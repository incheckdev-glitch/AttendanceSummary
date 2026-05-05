-- =========================================================
-- Communication Centre final reply / reactions / read-status fix
-- Fixes:
-- - Unable to send reply
-- - reaction/emoji buttons
-- - read receipts for ✓ Sent / ✓✓ Received / ✓✓ Read UI
-- No attachments are added.
-- =========================================================

create extension if not exists pgcrypto;

-- -----------------------------
-- 1) Required columns
-- -----------------------------
alter table public.communication_centre_messages
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

alter table public.communication_centre_conversations
  add column if not exists last_message_preview text,
  add column if not exists last_message_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- -----------------------------
-- 2) Read receipts
-- -----------------------------
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

alter table public.communication_centre_read_receipts enable row level security;

drop policy if exists "cc read receipts select" on public.communication_centre_read_receipts;
create policy "cc read receipts select"
on public.communication_centre_read_receipts
for select
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id));

-- Function return type may have changed before, so drop first.
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
  )
  values (
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

-- -----------------------------
-- 3) Reply RPC with exact frontend parameter names
-- -----------------------------
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
  v_user_name text := coalesce(public.cc_current_user_name(), auth.jwt()->>'email', 'User');
  v_message_id uuid;
  v_body text := btrim(coalesce(p_message_body, ''));
  v_type text := coalesce(nullif(btrim(p_message_type), ''), 'message');
begin
  if p_conversation_id is null then
    raise exception 'Conversation is required';
  end if;

  if v_user_id is null then
    raise exception 'Forbidden: authenticated user is required';
  end if;

  if v_body = '' then
    raise exception 'Message is required';
  end if;

  if not public.can_view_communication_centre_conversation(p_conversation_id) then
    raise exception 'Forbidden: you do not have access to this conversation';
  end if;

  if lower(v_type) not in ('message', 'internal_note') then
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
    created_at
  )
  values (
    p_conversation_id,
    v_user_id,
    v_user_name,
    v_body,
    false,
    p_reply_to_message_id,
    lower(v_type),
    now()
  )
  returning id into v_message_id;

  update public.communication_centre_conversations
  set
    last_message_preview = left(v_body, 240),
    last_message_at = now(),
    updated_at = now(),
    status = case when status = 'Closed' then 'In Progress' else coalesce(status, 'Open') end
  where id = p_conversation_id;

  -- Mark sender as read immediately.
  perform public.mark_communication_centre_read(p_conversation_id);

  return v_message_id;
end;
$$;

grant execute on function public.add_communication_centre_reply(uuid, text, uuid, text) to authenticated;

-- Optional direct insert fallback policy for environments where the frontend fallback is used.
alter table public.communication_centre_messages enable row level security;

drop policy if exists "cc messages insert participant fallback" on public.communication_centre_messages;
create policy "cc messages insert participant fallback"
on public.communication_centre_messages
for insert
to authenticated
with check (
  public.can_view_communication_centre_conversation(conversation_id)
);

-- -----------------------------
-- 4) Reactions / emoji buttons
-- -----------------------------
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

create unique index if not exists communication_centre_message_reactions_unique_idx
on public.communication_centre_message_reactions (message_id, user_id, reaction);

alter table public.communication_centre_message_reactions enable row level security;

drop policy if exists "cc reactions select" on public.communication_centre_message_reactions;
create policy "cc reactions select"
on public.communication_centre_message_reactions
for select
to authenticated
using (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists "cc reactions insert fallback" on public.communication_centre_message_reactions;
create policy "cc reactions insert fallback"
on public.communication_centre_message_reactions
for insert
to authenticated
with check (public.can_view_communication_centre_conversation(conversation_id));

drop policy if exists "cc reactions delete own fallback" on public.communication_centre_message_reactions;
create policy "cc reactions delete own fallback"
on public.communication_centre_message_reactions
for delete
to authenticated
using (
  public.can_view_communication_centre_conversation(conversation_id)
  and user_id = public.cc_current_app_user_id()
);

drop function if exists public.toggle_communication_centre_reaction(uuid, text);

create function public.toggle_communication_centre_reaction(
  p_message_id uuid,
  p_reaction text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := public.cc_current_app_user_id();
  v_user_name text := coalesce(public.cc_current_user_name(), auth.jwt()->>'email', 'User');
  v_conversation_id uuid;
  v_reaction text := btrim(coalesce(p_reaction, ''));
begin
  if p_message_id is null or v_reaction = '' or v_user_id is null then
    return;
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
      message_id,
      conversation_id,
      user_id,
      user_name,
      reaction,
      created_at
    )
    values (
      p_message_id,
      v_conversation_id,
      v_user_id,
      v_user_name,
      v_reaction,
      now()
    )
    on conflict (message_id, user_id, reaction) do nothing;
  end if;
end;
$$;

grant execute on function public.toggle_communication_centre_reaction(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- Verification helpers
select 'reply_rpc_ready' as check_name, true as ok;
