-- Fix Monthly Renewal Forecast No Renewal Needed action wiring and permissions.

alter table if exists public.crm_renewal_no_needed_overrides
  add column if not exists status text not null default 'no_renewal_needed',
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists created_at timestamptz not null default now();

update public.crm_renewal_no_needed_overrides
  set status = 'no_renewal_needed',
      created_by = coalesce(created_by, marked_by),
      updated_by = coalesce(updated_by, marked_by),
      created_at = coalesce(created_at, marked_at, now())
  where status is distinct from 'no_renewal_needed'
     or created_by is null
     or updated_by is null;

alter table if exists public.crm_renewal_no_needed_overrides
  drop constraint if exists crm_renewal_no_needed_overrides_status_check,
  add constraint crm_renewal_no_needed_overrides_status_check check (status = 'no_renewal_needed');

create or replace function public.crm_can_monthly_renewal_forecast_action(p_action text default 'view')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and lower(trim(coalesce(profile.role_key, ''))) in (
          'admin',
          'senior_financial_controller', 'senior fc', 'senior_fc', 'sfc',
          'general_manager', 'general manager', 'gm',
          'accounting', 'accountant'
        )
    );
$$;

create or replace function public.crm_require_monthly_renewal_forecast_action(p_action text default 'view')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.crm_can_monthly_renewal_forecast_action(p_action) then
    raise exception 'Access denied. Missing Monthly Renewal Forecast permission: %', p_action using errcode = '42501';
  end if;
end;
$$;

create or replace function public.crm_mark_monthly_renewal_no_renewal_needed(
  p_invoice_item_id text,
  p_reason text default 'No renewal needed',
  p_note text default null,
  p_invoice_number text default null,
  p_client_name text default null,
  p_location_name text default null,
  p_service_start_date date default null,
  p_service_end_date date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_reason text := coalesce(nullif(trim(p_reason), ''), 'No renewal needed');
begin
  perform public.crm_require_monthly_renewal_forecast_action('mark_no_renewal_needed');
  if nullif(trim(p_invoice_item_id), '') is null then
    raise exception 'invoice_item_id is required';
  end if;

  insert into public.crm_renewal_no_needed_overrides (
    invoice_item_id, invoice_number, client_name, location_name, service_start_date, service_end_date,
    status, reason, note, marked_by, marked_at, active, created_by, updated_by, created_at, updated_at
  ) values (
    trim(p_invoice_item_id), nullif(trim(p_invoice_number), ''), nullif(trim(p_client_name), ''), nullif(trim(p_location_name), ''), p_service_start_date, p_service_end_date,
    'no_renewal_needed', normalized_reason, nullif(trim(p_note), ''), auth.uid(), now(), true, auth.uid(), auth.uid(), now(), now()
  )
  on conflict (invoice_item_id) do update set
    invoice_number = excluded.invoice_number,
    client_name = excluded.client_name,
    location_name = excluded.location_name,
    service_start_date = excluded.service_start_date,
    service_end_date = excluded.service_end_date,
    status = 'no_renewal_needed',
    reason = excluded.reason,
    note = excluded.note,
    marked_by = auth.uid(),
    marked_at = now(),
    active = true,
    unmarked_by = null,
    unmarked_at = null,
    updated_by = auth.uid(),
    updated_at = now();
end;
$$;

create or replace function public.crm_upsert_monthly_renewal_override(
  p_invoice_item_id text,
  p_override_status text,
  p_reason text default 'No renewal needed'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_override_status <> 'no_renewal_needed' then
    raise exception 'Unsupported monthly renewal override status: %', p_override_status;
  end if;
  perform public.crm_mark_monthly_renewal_no_renewal_needed(p_invoice_item_id, p_reason);
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
  perform public.crm_mark_monthly_renewal_no_renewal_needed(
    p_invoice_item_id, p_reason, p_note, p_invoice_number, p_client_name, p_location_name, p_service_start_date, p_service_end_date
  );
end;
$$;

do $$
begin
  if to_regclass('public.role_permissions') is not null then
    update public.role_permissions
      set is_allowed = true,
          allowed_roles = array['admin','senior_financial_controller','general_manager','accounting','accountant']::text[],
          updated_at = now()
      where resource = 'monthly_renewal_forecast'
        and action in ('view','export','view_details','mark_renewed','mark_no_renewal_needed','undo_override','create_renewal_invoice')
        and lower(trim(role_key)) in ('admin','senior_financial_controller','general_manager','accounting','accountant');
  end if;
end $$;

revoke all on function public.crm_can_monthly_renewal_forecast_action(text) from public, anon;
revoke all on function public.crm_require_monthly_renewal_forecast_action(text) from public, anon;
revoke all on function public.crm_mark_monthly_renewal_no_renewal_needed(text, text, text, text, text, text, date, date) from public, anon;
revoke all on function public.crm_upsert_monthly_renewal_override(text, text, text) from public, anon;
grant execute on function public.crm_mark_monthly_renewal_no_renewal_needed(text, text, text, text, text, text, date, date) to authenticated;
grant execute on function public.crm_upsert_monthly_renewal_override(text, text, text) to authenticated;
