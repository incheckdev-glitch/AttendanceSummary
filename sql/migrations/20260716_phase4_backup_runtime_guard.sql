-- InCheck360 Phase 4 - backup runtime guard and rate limiting.
-- This migration does not change backup contents or permission rows.
-- It provides a service-role-only, database-backed lock so concurrent
-- serverless instances cannot run overlapping one-click backups.

create table if not exists public.backup_runtime_guards (
  guard_key text primary key,
  request_id text null,
  locked_by uuid null,
  locked_until timestamptz null,
  last_started_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.backup_runtime_guards enable row level security;

revoke all on table public.backup_runtime_guards from public;
revoke all on table public.backup_runtime_guards from anon;
revoke all on table public.backup_runtime_guards from authenticated;

create or replace function public.backup_center_acquire_guard(
  p_request_id text,
  p_user_id uuid,
  p_lock_seconds integer default 900,
  p_rate_window_seconds integer default 300
)
returns table (
  acquired boolean,
  reason text,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_guard public.backup_runtime_guards%rowtype;
  v_lock_seconds integer := greatest(60, least(coalesce(p_lock_seconds, 900), 3600));
  v_rate_seconds integer := greatest(30, least(coalesce(p_rate_window_seconds, 300), 3600));
  v_retry integer := 0;
begin
  if nullif(btrim(coalesce(p_request_id, '')), '') is null or p_user_id is null then
    return query select false, 'invalid_request'::text, 0;
    return;
  end if;

  insert into public.backup_runtime_guards (guard_key, created_at, updated_at)
  values ('one_click_full_backup', v_now, v_now)
  on conflict (guard_key) do nothing;

  select *
    into v_guard
    from public.backup_runtime_guards
   where guard_key = 'one_click_full_backup'
   for update;

  if v_guard.locked_until is not null and v_guard.locked_until > v_now then
    v_retry := greatest(1, ceil(extract(epoch from (v_guard.locked_until - v_now)))::integer);
    return query select false, 'backup_in_progress'::text, v_retry;
    return;
  end if;

  if v_guard.last_started_at is not null
     and v_guard.last_started_at > v_now - make_interval(secs => v_rate_seconds) then
    v_retry := greatest(
      1,
      ceil(extract(epoch from ((v_guard.last_started_at + make_interval(secs => v_rate_seconds)) - v_now)))::integer
    );
    return query select false, 'rate_limited'::text, v_retry;
    return;
  end if;

  update public.backup_runtime_guards
     set request_id = btrim(p_request_id),
         locked_by = p_user_id,
         locked_until = v_now + make_interval(secs => v_lock_seconds),
         last_started_at = v_now,
         updated_at = v_now
   where guard_key = 'one_click_full_backup';

  return query select true, 'acquired'::text, 0;
end;
$$;

create or replace function public.backup_center_release_guard(
  p_request_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row_count integer := 0;
begin
  update public.backup_runtime_guards
     set request_id = null,
         locked_by = null,
         locked_until = clock_timestamp(),
         updated_at = clock_timestamp()
   where guard_key = 'one_click_full_backup'
     and request_id = btrim(coalesce(p_request_id, ''));

  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

revoke all on function public.backup_center_acquire_guard(text, uuid, integer, integer) from public;
revoke all on function public.backup_center_acquire_guard(text, uuid, integer, integer) from anon;
revoke all on function public.backup_center_acquire_guard(text, uuid, integer, integer) from authenticated;
revoke all on function public.backup_center_release_guard(text) from public;
revoke all on function public.backup_center_release_guard(text) from anon;
revoke all on function public.backup_center_release_guard(text) from authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.backup_center_acquire_guard(text, uuid, integer, integer) to service_role;
    grant execute on function public.backup_center_release_guard(text) to service_role;
  end if;
end $$;

comment on table public.backup_runtime_guards is 'Service-role-only runtime guard for one-click backup concurrency and rate limiting.';
comment on function public.backup_center_acquire_guard(text, uuid, integer, integer) is 'Atomically acquires the one-click backup guard and rate limit for a service-role backend request.';
comment on function public.backup_center_release_guard(text) is 'Releases the one-click backup guard only when the request id matches the current holder.';
