-- Customer Success 360 strict customizable role permissions
-- Fixes: roles accidentally getting all actions because of broad/global permission checks.
--
-- Resource: client_success
-- Actions:
--   view, list, get, export, create, update, delete, manage
--
-- Default seed:
--   admin + csm = full access
--   gm / general_manager / sfc / senior_financial_controller / senior_finanical_controller / viewer = view/export only
--
-- To customize later:
--   update public.role_permissions
--   set is_allowed = true
--   where role_key = '<role>' and resource = 'client_success' and action = '<action>';
--
-- This migration inserts rows only for roles that already exist in public.roles.

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

create or replace function public.cs360_has_permission(p_allow_actions text[], p_deny_actions text[] default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.cs360_current_role_key();
  v_allow_actions text[] := coalesce(p_allow_actions, array[]::text[]);
  v_deny_actions text[] := coalesce(p_deny_actions, p_allow_actions, array[]::text[]);
begin
  if v_role = 'admin' then
    return true;
  end if;

  if v_role = '' then
    return false;
  end if;

  if to_regclass('public.role_permissions') is null then
    return false;
  end if;

  -- Strict exact role_key only. This prevents broad allowed_roles/global rows
  -- from accidentally granting all roles write access.
  -- Deny is action-specific: a denied manage row does not block create/update
  -- if that role is explicitly allowed for create/update later.
  if exists (
    select 1
    from public.role_permissions rp
    where lower(coalesce(rp.role_key, '')) = v_role
      and lower(coalesce(rp.resource, '')) in ('client_success', 'customer_success')
      and lower(coalesce(rp.action, '')) = any(v_deny_actions)
      and coalesce(rp.is_active, true) = true
      and coalesce(rp.is_allowed, true) = false
  ) then
    return false;
  end if;

  return exists (
    select 1
    from public.role_permissions rp
    where lower(coalesce(rp.role_key, '')) = v_role
      and lower(coalesce(rp.resource, '')) in ('client_success', 'customer_success')
      and lower(coalesce(rp.action, '')) = any(v_allow_actions || array['manage'])
      and coalesce(rp.is_active, true) = true
      and coalesce(rp.is_allowed, true) = true
  );
end;
$$;

create or replace function public.cs360_can_select()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cs360_has_permission(
    array['view','list','get','export','create','update','delete','manage'],
    array['view','list','get','export']
  );
$$;

create or replace function public.cs360_can_insert()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cs360_has_permission(
    array['create','insert','add','manage'],
    array['create','insert','add']
  );
$$;

create or replace function public.cs360_can_update()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cs360_has_permission(
    array['update','edit','move','manage'],
    array['update','edit','move']
  );
$$;

create or replace function public.cs360_can_delete()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cs360_has_permission(
    array['delete','remove','manage'],
    array['delete','remove']
  );
$$;

-- Backward-compatible function names
create or replace function public.cs360_can_view()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cs360_can_select();
$$;

create or replace function public.cs360_can_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cs360_has_permission(array['manage'], array['manage']);
$$;

-- Reset only CS permissions and seed strict per-role rows.
do $$
declare
  item record;
begin
  if to_regclass('public.role_permissions') is not null then
    delete from public.role_permissions
    where lower(coalesce(resource, '')) in ('client_success', 'customer_success');

    for item in
      with wanted(role_key, resource, action, is_allowed) as (
        values
          -- Admin full
          ('admin','client_success','view',true),('admin','client_success','list',true),('admin','client_success','get',true),('admin','client_success','export',true),('admin','client_success','create',true),('admin','client_success','update',true),('admin','client_success','delete',true),('admin','client_success','manage',true),

          -- CSM full
          ('csm','client_success','view',true),('csm','client_success','list',true),('csm','client_success','get',true),('csm','client_success','export',true),('csm','client_success','create',true),('csm','client_success','update',true),('csm','client_success','delete',true),('csm','client_success','manage',true),

          -- GM view/export only, write rows explicit false but customizable later
          ('gm','client_success','view',true),('gm','client_success','list',true),('gm','client_success','get',true),('gm','client_success','export',true),('gm','client_success','create',false),('gm','client_success','update',false),('gm','client_success','delete',false),
          ('general_manager','client_success','view',true),('general_manager','client_success','list',true),('general_manager','client_success','get',true),('general_manager','client_success','export',true),('general_manager','client_success','create',false),('general_manager','client_success','update',false),('general_manager','client_success','delete',false),

          -- SFC view/export only, write rows explicit false but customizable later
          ('sfc','client_success','view',true),('sfc','client_success','list',true),('sfc','client_success','get',true),('sfc','client_success','export',true),('sfc','client_success','create',false),('sfc','client_success','update',false),('sfc','client_success','delete',false),
          ('senior_financial_controller','client_success','view',true),('senior_financial_controller','client_success','list',true),('senior_financial_controller','client_success','get',true),('senior_financial_controller','client_success','export',true),('senior_financial_controller','client_success','create',false),('senior_financial_controller','client_success','update',false),('senior_financial_controller','client_success','delete',false),
          ('senior_finanical_controller','client_success','view',true),('senior_finanical_controller','client_success','list',true),('senior_finanical_controller','client_success','get',true),('senior_finanical_controller','client_success','export',true),('senior_finanical_controller','client_success','create',false),('senior_finanical_controller','client_success','update',false),('senior_finanical_controller','client_success','delete',false),

          -- Viewer view/export only, write rows explicit false but customizable later
          ('viewer','client_success','view',true),('viewer','client_success','list',true),('viewer','client_success','get',true),('viewer','client_success','export',true),('viewer','client_success','create',false),('viewer','client_success','update',false),('viewer','client_success','delete',false)
      )
      select w.role_key, w.resource, w.action, w.is_allowed
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
        item.resource,
        item.action,
        item.is_allowed,
        true,
        array[item.role_key]::text[],
        now(),
        now()
      )
      on conflict (role_key, resource, action)
      do update set
        is_allowed = excluded.is_allowed,
        is_active = true,
        allowed_roles = array[excluded.role_key]::text[],
        updated_at = now();
    end loop;
  end if;
end $$;

-- Replace CS table policies with permission-driven policies.
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
        'create policy %I on public.%I for select using (public.cs360_can_select())',
        t || '_cs360_select',
        t
      );

      execute format(
        'create policy %I on public.%I for insert with check (public.cs360_can_insert())',
        t || '_cs360_insert',
        t
      );

      execute format(
        'create policy %I on public.%I for update using (public.cs360_can_update()) with check (public.cs360_can_update())',
        t || '_cs360_update',
        t
      );

      execute format(
        'create policy %I on public.%I for delete using (public.cs360_can_delete())',
        t || '_cs360_delete',
        t
      );
    end if;
  end loop;
end $$;

-- Verification table: expected after default seed
select
  rp.role_key,
  rp.resource,
  rp.action,
  rp.is_allowed,
  rp.is_active
from public.role_permissions rp
where lower(coalesce(rp.resource, '')) in ('client_success', 'customer_success')
order by rp.role_key, rp.action;

-- Verification for currently logged-in user running this query
select
  public.cs360_current_role_key() as current_role_key,
  public.cs360_can_select() as can_view_customer_success,
  public.cs360_can_insert() as can_create_customer_success,
  public.cs360_can_update() as can_update_customer_success,
  public.cs360_can_delete() as can_delete_customer_success,
  public.cs360_can_manage() as can_manage_customer_success;

commit;
