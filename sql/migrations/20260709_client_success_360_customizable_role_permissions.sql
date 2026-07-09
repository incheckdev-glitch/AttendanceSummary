-- Customer Success 360 customizable role permissions
-- Resource: client_success
-- Actions supported in Roles & Permissions:
-- view, list, get, export, create, update, delete, manage
--
-- Default seed:
-- admin + csm = full
-- gm / sfc / viewer = view/export only
--
-- After running this, access is customizable from role_permissions.
-- RLS reads role_permissions dynamically, so changing role permissions changes DB access too.

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

create or replace function public.cs360_has_permission(p_actions text[])
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.cs360_current_role_key();
  v_actions text[] := coalesce(p_actions, array[]::text[]);
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

  -- Explicit deny wins.
  if exists (
    select 1
    from public.role_permissions rp
    where lower(coalesce(rp.role_key, '')) = v_role
      and lower(coalesce(rp.resource, '')) in ('client_success', 'customer_success')
      and lower(coalesce(rp.action, '')) = any(v_actions || array['manage'])
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
      and lower(coalesce(rp.action, '')) = any(v_actions || array['manage'])
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
  select public.cs360_has_permission(array['view','list','get','export','create','update','delete','manage']);
$$;

create or replace function public.cs360_can_insert()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cs360_has_permission(array['create','insert','add','manage']);
$$;

create or replace function public.cs360_can_update()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cs360_has_permission(array['update','edit','manage']);
$$;

create or replace function public.cs360_can_delete()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cs360_has_permission(array['delete','remove','manage']);
$$;

-- Backward-compatible function names used by older policies/code.
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
  select public.cs360_has_permission(array['manage','create','update','delete']);
$$;

-- Reset and seed default runtime permissions for this module.
do $$
declare
  item record;
begin
  if to_regclass('public.role_permissions') is not null then
    delete from public.role_permissions
    where lower(coalesce(resource, '')) in ('client_success', 'customer_success');

    for item in
      with wanted(role_key, resource, action) as (
        values
          -- Admin full
          ('admin','client_success','view'),('admin','client_success','list'),('admin','client_success','get'),('admin','client_success','export'),('admin','client_success','create'),('admin','client_success','update'),('admin','client_success','delete'),('admin','client_success','manage'),
          -- CSM full
          ('csm','client_success','view'),('csm','client_success','list'),('csm','client_success','get'),('csm','client_success','export'),('csm','client_success','create'),('csm','client_success','update'),('csm','client_success','delete'),('csm','client_success','manage'),
          -- GM/SFC/Viewer view/export only
          ('gm','client_success','view'),('gm','client_success','list'),('gm','client_success','get'),('gm','client_success','export'),
          ('general_manager','client_success','view'),('general_manager','client_success','list'),('general_manager','client_success','get'),('general_manager','client_success','export'),
          ('sfc','client_success','view'),('sfc','client_success','list'),('sfc','client_success','get'),('sfc','client_success','export'),
          ('senior_financial_controller','client_success','view'),('senior_financial_controller','client_success','list'),('senior_financial_controller','client_success','get'),('senior_financial_controller','client_success','export'),
          ('senior_finanical_controller','client_success','view'),('senior_finanical_controller','client_success','list'),('senior_finanical_controller','client_success','get'),('senior_finanical_controller','client_success','export'),
          ('viewer','client_success','view'),('viewer','client_success','list'),('viewer','client_success','get'),('viewer','client_success','export')
      )
      select w.role_key, w.resource, w.action
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

select
  public.cs360_current_role_key() as current_role_key,
  public.cs360_can_select() as can_view_customer_success,
  public.cs360_can_insert() as can_create_customer_success,
  public.cs360_can_update() as can_update_customer_success,
  public.cs360_can_delete() as can_delete_customer_success,
  public.cs360_can_manage() as can_manage_customer_success;

commit;
