-- Defense-in-depth for Monthly Renewal Forecast access. Payment Forecast is intentionally untouched.
-- Renewal forecast RPCs must call crm_is_admin_user() directly or crm_require_renewal_admin(), which delegates to it.

create or replace function public.crm_is_admin_user()
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
        and lower(trim(coalesce(profile.role_key, ''))) = 'admin'
    );
$$;

revoke all on function public.crm_is_admin_user() from public, anon;
grant execute on function public.crm_is_admin_user() to authenticated;

create or replace function public.crm_require_renewal_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.crm_is_admin_user() then
    raise exception 'Access denied. Admin only.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.crm_require_renewal_admin() from public, anon, authenticated;

-- The current override table is RPC-only and its RLS policies also enforce exact admin access.
alter table if exists public.crm_renewal_no_needed_overrides enable row level security;
revoke all on table public.crm_renewal_no_needed_overrides from public, anon, authenticated;
grant select, insert, update, delete on table public.crm_renewal_no_needed_overrides to authenticated;
drop policy if exists crm_renewal_no_needed_overrides_admin_select on public.crm_renewal_no_needed_overrides;
drop policy if exists crm_renewal_no_needed_overrides_admin_insert on public.crm_renewal_no_needed_overrides;
drop policy if exists crm_renewal_no_needed_overrides_admin_update on public.crm_renewal_no_needed_overrides;
drop policy if exists crm_renewal_no_needed_overrides_admin_delete on public.crm_renewal_no_needed_overrides;
create policy crm_renewal_no_needed_overrides_admin_select on public.crm_renewal_no_needed_overrides for select to authenticated using (public.crm_is_admin_user());
create policy crm_renewal_no_needed_overrides_admin_insert on public.crm_renewal_no_needed_overrides for insert to authenticated with check (public.crm_is_admin_user());
create policy crm_renewal_no_needed_overrides_admin_update on public.crm_renewal_no_needed_overrides for update to authenticated using (public.crm_is_admin_user()) with check (public.crm_is_admin_user());
create policy crm_renewal_no_needed_overrides_admin_delete on public.crm_renewal_no_needed_overrides for delete to authenticated using (public.crm_is_admin_user());

-- Harden the legacy/alternate table name too when it exists in an installation.
do $$
begin
  if to_regclass('public.monthly_renewal_overrides') is not null then
    execute 'alter table public.monthly_renewal_overrides enable row level security';
    execute 'revoke all on table public.monthly_renewal_overrides from public, anon, authenticated';
    execute 'grant select, insert, update, delete on table public.monthly_renewal_overrides to authenticated';
    execute 'drop policy if exists monthly_renewal_overrides_admin_all on public.monthly_renewal_overrides';
    execute 'create policy monthly_renewal_overrides_admin_all on public.monthly_renewal_overrides for all to authenticated using (public.crm_is_admin_user()) with check (public.crm_is_admin_user())';
  end if;
end;
$$;
