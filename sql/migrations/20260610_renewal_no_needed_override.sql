-- Manual "No Renewal Needed" overrides for Monthly Renewal Forecast.
-- The source invoice item, invoice, and agreement are intentionally never modified.

create table if not exists public.crm_renewal_no_needed_overrides (
  invoice_item_id text primary key,
  invoice_number text,
  client_name text,
  location_name text,
  service_start_date date,
  service_end_date date,
  reason text not null check (reason in ('Location cancelled', 'Client cancelled service', 'Location closed', 'Duplicate / wrong renewal row', 'Other')),
  note text,
  marked_by uuid not null references auth.users(id),
  marked_at timestamptz not null default now(),
  active boolean not null default true,
  unmarked_by uuid references auth.users(id),
  unmarked_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.crm_renewal_no_needed_overrides enable row level security;
revoke all on table public.crm_renewal_no_needed_overrides from public, anon, authenticated;

create or replace function public.crm_require_renewal_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_key text := '';
begin
  select lower(trim(coalesce(profile.role_key, '')))
    into v_role_key
  from public.profiles profile
  where profile.id = auth.uid()
  limit 1;

  if auth.uid() is null or v_role_key <> 'admin' then
    raise exception 'Access denied. Admin only.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.crm_mark_renewal_no_needed(
  p_invoice_item_id text,
  p_invoice_number text,
  p_client_name text,
  p_location_name text,
  p_service_start_date date,
  p_service_end_date date,
  p_reason text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.crm_require_renewal_admin();
  if nullif(trim(p_invoice_item_id), '') is null then raise exception 'invoice_item_id is required'; end if;
  if p_reason not in ('Location cancelled', 'Client cancelled service', 'Location closed', 'Duplicate / wrong renewal row', 'Other') then raise exception 'Invalid No Renewal Needed reason'; end if;

  insert into public.crm_renewal_no_needed_overrides (
    invoice_item_id, invoice_number, client_name, location_name, service_start_date, service_end_date, reason, note, marked_by
  ) values (
    p_invoice_item_id, nullif(trim(p_invoice_number), ''), nullif(trim(p_client_name), ''), nullif(trim(p_location_name), ''), p_service_start_date, p_service_end_date, p_reason, nullif(trim(p_note), ''), auth.uid()
  )
  on conflict (invoice_item_id) do update set
    invoice_number = excluded.invoice_number,
    client_name = excluded.client_name,
    location_name = excluded.location_name,
    service_start_date = excluded.service_start_date,
    service_end_date = excluded.service_end_date,
    reason = excluded.reason,
    note = excluded.note,
    marked_by = auth.uid(),
    marked_at = now(),
    active = true,
    unmarked_by = null,
    unmarked_at = null,
    updated_at = now();
end;
$$;

create or replace function public.crm_unmark_renewal_override(p_invoice_item_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.crm_require_renewal_admin();
  update public.crm_renewal_no_needed_overrides
    set active = false, unmarked_by = auth.uid(), unmarked_at = now(), updated_at = now()
    where invoice_item_id = p_invoice_item_id;
end;
$$;

create or replace function public.crm_get_renewal_no_needed_overrides(p_start_date date, p_end_date date)
returns table (
  invoice_item_id text,
  invoice_number text,
  client_name text,
  location_name text,
  service_start_date date,
  service_end_date date,
  reason text,
  note text,
  marked_at timestamptz,
  marked_by_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.crm_require_renewal_admin();
  return query
    select override_row.invoice_item_id, override_row.invoice_number, override_row.client_name, override_row.location_name,
      override_row.service_start_date, override_row.service_end_date, override_row.reason, override_row.note, override_row.marked_at,
      override_row.marked_by::text
    from public.crm_renewal_no_needed_overrides override_row
    where override_row.active = true
      and (p_start_date is null or override_row.service_end_date is null or override_row.service_end_date >= p_start_date)
      and (p_end_date is null or override_row.service_end_date is null or override_row.service_end_date <= p_end_date);
end;
$$;

revoke all on function public.crm_require_renewal_admin() from public, anon, authenticated;
revoke all on function public.crm_mark_renewal_no_needed(text, text, text, text, date, date, text, text) from public, anon;
revoke all on function public.crm_unmark_renewal_override(text) from public, anon;
revoke all on function public.crm_get_renewal_no_needed_overrides(date, date) from public, anon;
grant execute on function public.crm_mark_renewal_no_needed(text, text, text, text, date, date, text, text) to authenticated;
grant execute on function public.crm_unmark_renewal_override(text) to authenticated;
grant execute on function public.crm_get_renewal_no_needed_overrides(date, date) to authenticated;
