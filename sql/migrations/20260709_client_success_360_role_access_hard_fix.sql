-- Client Success 360 role access hard fix
-- Fixes access when profiles use role_key instead of role, drops old admin-only CS policies,
-- and seeds frontend role_permissions for client_success.

create extension if not exists pgcrypto;

create or replace function public.cs360_current_role_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(
    regexp_replace(
      coalesce(
        (
          select coalesce(
            nullif(to_jsonb(p)->>'role_key', ''),
            nullif(to_jsonb(p)->>'role', ''),
            nullif(to_jsonb(p)->>'roleKey', '')
          )
          from public.profiles p
          where p.id = auth.uid()
          limit 1
        ),
        ''
      ),
      '[\s-]+',
      '_',
      'g'
    )
  );
$$;

create or replace function public.cs360_can_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cs360_current_role_key() in (
    'admin',
    'csm',
    'customer_success',
    'customer_success_manager',
    'gm',
    'general_manager',
    'sfc',
    'senior_financial_controller'
  );
$$;

create or replace function public.cs360_can_view()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cs360_can_manage()
    or public.cs360_current_role_key() in ('viewer');
$$;

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'cs_client_profiles',
    'cs_client_reviews',
    'cs_client_review_answers',
    'cs_tasks',
    'cs_risks',
    'cs_qbrs',
    'cs_client_contacts',
    'cs_review_templates',
    'cs_review_template_questions',
    'cs_location_completions',
    'cs_client_groups',
    'cs_client_group_members',
    'cs_client_brands',
    'cs_client_brand_locations'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);

      -- CS tables are owned by this module; remove old admin-only policies and replace with role-based ones.
      for p in
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = t
      loop
        execute format('drop policy if exists %I on public.%I', p.policyname, t);
      end loop;

      execute format(
        'create policy %I on public.%I for select using (public.cs360_can_view())',
        t || '_cs360_select',
        t
      );

      execute format(
        'create policy %I on public.%I for insert with check (public.cs360_can_manage())',
        t || '_cs360_insert',
        t
      );

      execute format(
        'create policy %I on public.%I for update using (public.cs360_can_manage()) with check (public.cs360_can_manage())',
        t || '_cs360_update',
        t
      );

      execute format(
        'create policy %I on public.%I for delete using (public.cs360_can_manage())',
        t || '_cs360_delete',
        t
      );
    end if;
  end loop;
end $$;

-- Seed frontend runtime permissions if your ERP uses role_permissions.
do $$
declare
  item record;
begin
  if to_regclass('public.role_permissions') is null then
    raise notice 'role_permissions table not found; skipping client_success runtime permission seed.';
    return;
  end if;

  for item in
    select * from (values
      ('admin','view'),('admin','list'),('admin','get'),('admin','export'),('admin','create'),('admin','update'),('admin','delete'),('admin','manage'),
      ('csm','view'),('csm','list'),('csm','get'),('csm','export'),('csm','create'),('csm','update'),('csm','delete'),('csm','manage'),
      ('customer_success','view'),('customer_success','list'),('customer_success','get'),('customer_success','export'),('customer_success','create'),('customer_success','update'),('customer_success','delete'),('customer_success','manage'),
      ('customer_success_manager','view'),('customer_success_manager','list'),('customer_success_manager','get'),('customer_success_manager','export'),('customer_success_manager','create'),('customer_success_manager','update'),('customer_success_manager','delete'),('customer_success_manager','manage'),
      ('gm','view'),('gm','list'),('gm','get'),('gm','export'),('gm','create'),('gm','update'),('gm','delete'),('gm','manage'),
      ('general_manager','view'),('general_manager','list'),('general_manager','get'),('general_manager','export'),('general_manager','create'),('general_manager','update'),('general_manager','delete'),('general_manager','manage'),
      ('sfc','view'),('sfc','list'),('sfc','get'),('sfc','export'),('sfc','create'),('sfc','update'),('sfc','delete'),('sfc','manage'),
      ('senior_financial_controller','view'),('senior_financial_controller','list'),('senior_financial_controller','get'),('senior_financial_controller','export'),('senior_financial_controller','create'),('senior_financial_controller','update'),('senior_financial_controller','delete'),('senior_financial_controller','manage'),
      ('viewer','view'),('viewer','list'),('viewer','get'),('viewer','export')
    ) as v(role_key, action)
  loop
    insert into public.role_permissions (
      permission_id,
      role_key,
      resource,
      action,
      is_allowed,
      is_active,
      allowed_roles,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      item.role_key,
      'client_success',
      item.action,
      true,
      true,
      array[item.role_key]::text[],
      now(),
      now()
    )
    on conflict (role_key, resource, action)
    do update set
      is_allowed = true,
      is_active = true,
      allowed_roles = array[excluded.role_key]::text[],
      updated_at = now();
  end loop;
end $$;

select
  public.cs360_current_role_key() as current_role_key,
  public.cs360_can_view() as can_view_customer_success,
  public.cs360_can_manage() as can_manage_customer_success;
