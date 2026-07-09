-- Customer Success 360 final role access reset
-- Admin + CSM = full create/edit/delete/manage
-- GM + Senior Financial Controller + Viewer = view/export only
-- This script avoids FK errors by only inserting permissions for roles that exist in public.roles.

begin;

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
  select public.cs360_current_role_key() in ('admin', 'csm');
$$;

create or replace function public.cs360_can_view()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cs360_can_manage()
      or public.cs360_current_role_key() in (
        'gm',
        'general_manager',
        'sfc',
        'senior_financial_controller',
        'senior_finanical_controller',
        'viewer'
      );
$$;

-- Reset runtime permissions for Customer Success resources.
do $$
declare
  item record;
  v_resource text;
begin
  if to_regclass('public.role_permissions') is not null then
    delete from public.role_permissions
    where resource in ('client_success', 'customer_success');

    for v_resource in select unnest(array['client_success', 'customer_success'])
    loop
      for item in
        with wanted(role_key, action) as (
          values
            -- Admin full
            ('admin','view'),('admin','list'),('admin','get'),('admin','export'),('admin','create'),('admin','update'),('admin','delete'),('admin','manage'),
            -- CSM full
            ('csm','view'),('csm','list'),('csm','get'),('csm','export'),('csm','create'),('csm','update'),('csm','delete'),('csm','manage'),
            -- GM/SFC/Viewer view/export only
            ('gm','view'),('gm','list'),('gm','get'),('gm','export'),
            ('general_manager','view'),('general_manager','list'),('general_manager','get'),('general_manager','export'),
            ('sfc','view'),('sfc','list'),('sfc','get'),('sfc','export'),
            ('senior_financial_controller','view'),('senior_financial_controller','list'),('senior_financial_controller','get'),('senior_financial_controller','export'),
            ('senior_finanical_controller','view'),('senior_finanical_controller','list'),('senior_finanical_controller','get'),('senior_finanical_controller','export'),
            ('viewer','view'),('viewer','list'),('viewer','get'),('viewer','export')
        )
        select w.role_key, w.action
        from wanted w
        join public.roles r on r.role_key = w.role_key
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
          v_resource,
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
    end loop;
  end if;
end $$;

-- Reset CS table policies.
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

-- Verification: runtime permission rows
select
  rp.role_key,
  rp.resource,
  rp.action,
  rp.is_allowed,
  rp.is_active
from public.role_permissions rp
where rp.resource in ('client_success', 'customer_success')
order by rp.resource, rp.role_key, rp.action;

-- Verification for current logged-in user
select
  public.cs360_current_role_key() as current_role_key,
  public.cs360_can_view() as can_view_customer_success,
  public.cs360_can_manage() as can_manage_customer_success;

commit;
