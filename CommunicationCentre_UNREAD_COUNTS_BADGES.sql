-- =========================================================
-- Communication Centre unread counts support
-- Safe migration: uses existing Communication Centre table names.
-- =========================================================

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

create index if not exists idx_comm_centre_reads_conversation_id
on public.communication_centre_read_receipts (conversation_id);

create index if not exists idx_comm_centre_reads_user_id
on public.communication_centre_read_receipts (user_id);

create index if not exists idx_comm_centre_messages_conversation_created
on public.communication_centre_messages (conversation_id, created_at);

notify pgrst, 'reload schema';

drop function if exists public.get_communication_centre_unread_counts(uuid[]);

create or replace function public.get_communication_centre_unread_counts(
  p_conversation_ids uuid[]
)
returns table (
  conversation_id uuid,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with current_user_row as (
    select public.cc_current_app_user_id() as user_id
  ), requested_conversations as (
    select distinct unnest(coalesce(p_conversation_ids, array[]::uuid[])) as conversation_id
  )
  select
    rc.conversation_id,
    count(m.id)::bigint as unread_count
  from requested_conversations rc
  cross join current_user_row cur
  left join public.communication_centre_read_receipts r
    on r.conversation_id = rc.conversation_id
   and r.user_id = cur.user_id
  left join public.communication_centre_messages m
    on m.conversation_id = rc.conversation_id
   and coalesce(m.is_system_message, false) = false
   and (m.sender_id is null or m.sender_id <> cur.user_id)
   and (r.last_read_at is null or m.created_at > r.last_read_at)
  where cur.user_id is not null
    and public.can_view_communication_centre_conversation(rc.conversation_id)
  group by rc.conversation_id;
$$;

grant execute on function public.get_communication_centre_unread_counts(uuid[]) to authenticated;

notify pgrst, 'reload schema';
