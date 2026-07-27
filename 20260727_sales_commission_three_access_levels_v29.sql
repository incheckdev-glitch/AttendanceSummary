-- InCheck360 CRM · Sales Commission Tracker access levels
-- Access levels:
--   manage_all   = view, create, edit, delete, pay, and export every commission
--   view_all     = read-only access to every commission
--   view_related = read-only access only to commissions assigned to the signed-in user
-- A role with none of these permission actions cannot see or query the module.

begin;

create extension if not exists pgcrypto;

-- Resolve the signed-in user's Commission Tracker access from role_permissions.
create or replace function public.sales_commission_access_level()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_level text;
begin
  v_role := lower(regexp_replace(trim(coalesce(
    (select p.role_key::text from public.profiles p where p.id = auth.uid() limit 1),
    auth.jwt()->'app_metadata'->>'role',
    auth.jwt()->'user_metadata'->>'role',
    ''
  )), '[\s-]+', '_', 'g'));

  if v_role = 'admin' then
    return 'manage_all';
  end if;

  if to_regclass('public.role_permissions') is not null then
    execute $query$
      select case
        when coalesce(bool_or(lower(action::text) = 'manage_all'), false) then 'manage_all'
        when coalesce(bool_or(lower(action::text) = 'view_all'), false) then 'view_all'
        when coalesce(bool_or(lower(action::text) = 'view_related'), false) then 'view_related'
        else 'none'
      end
      from public.role_permissions
      where lower(regexp_replace(trim(coalesce(role_key::text, '')), '[\s-]+', '_', 'g')) = $1
        and lower(trim(coalesce(resource::text, ''))) = 'sales_commissions'
        and lower(trim(coalesce(action::text, ''))) in ('manage_all', 'view_all', 'view_related')
        and coalesce(is_active, true) = true
        and coalesce(is_allowed, true) = true
    $query$
    into v_level
    using v_role;
  end if;

  return coalesce(v_level, 'none');
end;
$$;

grant execute on function public.sales_commission_access_level() to authenticated;

-- Make the three levels mutually exclusive per role when permissions are edited.
create or replace function public.enforce_sales_commission_access_level_exclusive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(trim(coalesce(new.resource::text, ''))) = 'sales_commissions'
     and lower(trim(coalesce(new.action::text, ''))) in ('manage_all', 'view_all', 'view_related')
     and coalesce(new.is_active, true) = true
     and coalesce(new.is_allowed, true) = true
  then
    delete from public.role_permissions rp
    where rp.permission_id <> new.permission_id
      and lower(regexp_replace(trim(coalesce(rp.role_key::text, '')), '[\s-]+', '_', 'g')) =
          lower(regexp_replace(trim(coalesce(new.role_key::text, '')), '[\s-]+', '_', 'g'))
      and lower(trim(coalesce(rp.resource::text, ''))) = 'sales_commissions'
      and lower(trim(coalesce(rp.action::text, ''))) in ('manage_all', 'view_all', 'view_related')
      and lower(trim(coalesce(rp.action::text, ''))) <> lower(trim(coalesce(new.action::text, '')));
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.role_permissions') is not null then
    drop trigger if exists trg_sales_commission_access_level_exclusive on public.role_permissions;
    create trigger trg_sales_commission_access_level_exclusive
      after insert or update of resource, action, role_key, is_allowed, is_active
      on public.role_permissions
      for each row
      execute function public.enforce_sales_commission_access_level_exclusive();
  end if;
end;
$$;

-- Replace the old granular Commission Tracker permission rows with the three levels.
do $$
declare
  v_role record;
  v_level text;
begin
  if to_regclass('public.roles') is null or to_regclass('public.role_permissions') is null then
    return;
  end if;

  delete from public.role_permissions
  where lower(trim(coalesce(resource::text, ''))) in ('sales_commissions', 'sales_commission_installments');

  for v_role in
    select r.role_key::text as role_key,
           lower(regexp_replace(trim(coalesce(r.role_key::text, '')), '[\s-]+', '_', 'g')) as normalized_role
    from public.roles r
    where coalesce(r.is_active, true) = true
  loop
    v_level := case
      when v_role.normalized_role in (
        'admin','dev','developer','head_of_sales','sales_manager',
        'general_manager','gm','senior_financial_controller','senior_fc','sfc',
        'financial_controller','accounting','accountant'
      ) then 'manage_all'
      when v_role.normalized_role = 'viewer' then 'view_all'
      when v_role.normalized_role = 'sales_executive' then 'view_related'
      else null
    end;

    if v_level is not null then
      insert into public.role_permissions(
        permission_id, role_key, resource, action,
        is_allowed, is_active, allowed_roles, created_at, updated_at
      ) values (
        gen_random_uuid(), v_role.role_key, 'sales_commissions', v_level,
        true, true, array[v_role.role_key]::text[], now(), now()
      );
    end if;
  end loop;
end;
$$;

-- Database-level protection. Frontend filtering is not relied upon for security.
alter table public.sales_commissions enable row level security;
alter table public.sales_commission_installments enable row level security;

drop policy if exists sales_commissions_select_policy on public.sales_commissions;
create policy sales_commissions_select_policy
on public.sales_commissions for select
to authenticated
using (
  public.sales_commission_access_level() in ('manage_all', 'view_all')
  or (
    public.sales_commission_access_level() = 'view_related'
    and (
      salesperson_id = auth.uid()
      or lower(trim(coalesce(salesperson_email, ''))) = lower(trim(coalesce(
        auth.jwt()->>'email',
        auth.jwt()->'user_metadata'->>'email',
        ''
      )))
    )
  )
);

drop policy if exists sales_commissions_insert_policy on public.sales_commissions;
create policy sales_commissions_insert_policy
on public.sales_commissions for insert
to authenticated
with check (public.sales_commission_access_level() = 'manage_all');

drop policy if exists sales_commissions_update_policy on public.sales_commissions;
create policy sales_commissions_update_policy
on public.sales_commissions for update
to authenticated
using (public.sales_commission_access_level() = 'manage_all')
with check (public.sales_commission_access_level() = 'manage_all');

drop policy if exists sales_commissions_delete_policy on public.sales_commissions;
create policy sales_commissions_delete_policy
on public.sales_commissions for delete
to authenticated
using (public.sales_commission_access_level() = 'manage_all');

drop policy if exists sales_commission_installments_select_policy on public.sales_commission_installments;
create policy sales_commission_installments_select_policy
on public.sales_commission_installments for select
to authenticated
using (
  exists (
    select 1
    from public.sales_commissions commission
    where commission.id = commission_id
      and (
        public.sales_commission_access_level() in ('manage_all', 'view_all')
        or (
          public.sales_commission_access_level() = 'view_related'
          and (
            commission.salesperson_id = auth.uid()
            or lower(trim(coalesce(commission.salesperson_email, ''))) = lower(trim(coalesce(
              auth.jwt()->>'email',
              auth.jwt()->'user_metadata'->>'email',
              ''
            )))
          )
        )
      )
  )
);

drop policy if exists sales_commission_installments_insert_policy on public.sales_commission_installments;
create policy sales_commission_installments_insert_policy
on public.sales_commission_installments for insert
to authenticated
with check (public.sales_commission_access_level() = 'manage_all');

drop policy if exists sales_commission_installments_update_policy on public.sales_commission_installments;
create policy sales_commission_installments_update_policy
on public.sales_commission_installments for update
to authenticated
using (public.sales_commission_access_level() = 'manage_all')
with check (public.sales_commission_access_level() = 'manage_all');

drop policy if exists sales_commission_installments_delete_policy on public.sales_commission_installments;
create policy sales_commission_installments_delete_policy
on public.sales_commission_installments for delete
to authenticated
using (public.sales_commission_access_level() = 'manage_all');

grant select, insert, update, delete on public.sales_commissions to authenticated;
grant select, insert, update, delete on public.sales_commission_installments to authenticated;

notify pgrst, 'reload schema';

commit;

-- Verification: shows the configured access level for every role that has access.
select
  role_key,
  action as commission_access_level,
  is_allowed,
  is_active
from public.role_permissions
where lower(trim(coalesce(resource::text, ''))) = 'sales_commissions'
  and lower(trim(coalesce(action::text, ''))) in ('manage_all', 'view_all', 'view_related')
order by action, role_key;
