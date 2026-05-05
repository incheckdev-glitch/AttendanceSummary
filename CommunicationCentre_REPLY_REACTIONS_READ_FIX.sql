-- =========================================================
-- Fix mark_communication_centre_read return type conflict
-- Safe: drops only the function, not any data/table
-- =========================================================

drop function if exists public.mark_communication_centre_read(uuid);

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

create or replace function public.mark_communication_centre_read(
  p_conversation_id uuid
)
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

notify pgrst, 'reload schema';
