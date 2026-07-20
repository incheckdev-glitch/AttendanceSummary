-- CS360 LOCATION + BRAND MANAGEMENT V3
-- Run once in Supabase SQL Editor, then deploy the included client-success.js and index.html.
--
-- Fixes:
-- 1) Renames CS360 location snapshots, including actual ZL Defence / ZL Khalidya values.
-- 2) Provides atomic normal brand assign/move/unassign RPCs.
-- 3) Provides atomic Special CS Client brand assign/unassign RPC.
-- 4) Makes newly rebuilt Special CS Client locations start unassigned.

begin;

create extension if not exists pgcrypto;

-------------------------------------------------------------------------------
-- A. Reliable CS360 brand-management permission check
-------------------------------------------------------------------------------
create or replace function public.cs360_brand_manage_can_write()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_role text := lower(coalesce(
    nullif(auth.jwt()->'app_metadata'->>'role_key', ''),
    nullif(auth.jwt()->'app_metadata'->>'role', ''),
    nullif(auth.jwt()->'user_metadata'->>'role_key', ''),
    nullif(auth.jwt()->'user_metadata'->>'role', '')
  ));
  v_allowed boolean := false;
  v_table regclass;
begin
  if v_uid is null then return false; end if;

  if v_role in ('authenticated','anon','service_role','supabase_admin') then
    v_role := null;
  end if;

  if nullif(v_role, '') is null then
    foreach v_table in array array[to_regclass('public.profiles'), to_regclass('public.users')]
    loop
      if v_table is not null then
        execute format(
          $q$
          select lower(coalesce(
            nullif(to_jsonb(x)->>'role_key', ''),
            nullif(to_jsonb(x)->>'role', ''),
            nullif(to_jsonb(x)->>'user_role', ''),
            nullif(to_jsonb(x)->>'role_name', '')
          ))
          from %s x
          where coalesce(to_jsonb(x)->>'id', '') = $1
             or coalesce(to_jsonb(x)->>'auth_user_id', '') = $1
             or coalesce(to_jsonb(x)->>'user_id', '') = $1
             or coalesce(to_jsonb(x)->>'auth_id', '') = $1
             or ($2 <> '' and lower(coalesce(to_jsonb(x)->>'email', '')) = $2)
          limit 1
          $q$,
          v_table
        ) into v_role using v_uid::text, v_email;
        exit when nullif(v_role, '') is not null;
      end if;
    end loop;
  end if;

  v_role := regexp_replace(replace(lower(coalesce(v_role, '')), '-', '_'), '\s+', '_', 'g');
  if v_role in ('admin','administrator','super_admin','csm','customer_success') then
    return true;
  end if;

  if to_regclass('public.role_permissions') is not null and v_role <> '' then
    execute $q$
      select exists (
        select 1
        from public.role_permissions rp
        where lower(coalesce(rp.role_key, '')) = $1
          and lower(coalesce(rp.resource, '')) in ('client_success','customer_success')
          and lower(coalesce(rp.action, '')) in ('create','insert','add','update','edit','delete','remove','manage')
          and coalesce(rp.is_active, true) = true
          and coalesce(rp.is_allowed, true) = true
      )
    $q$ into v_allowed using v_role;
  end if;

  return coalesce(v_allowed, false);
end;
$$;

revoke all on function public.cs360_brand_manage_can_write() from public;
grant execute on function public.cs360_brand_manage_can_write() to authenticated;

-------------------------------------------------------------------------------
-- B. Persist corrected names in CS360-owned tables only
-------------------------------------------------------------------------------
-- Normal brand-location snapshots. Remove only a duplicate in the same scope.
do $$
declare
  v_old text;
  v_new text;
begin
  if to_regclass('public.cs_client_brand_locations') is not null then
    for v_old, v_new in
      select * from (values
        ('lr muroo', 'LR Muroor'),
        ('lr muroor', 'LR Muroor'),
        ('lr defence', 'LR Motor City'),
        ('zl defence', 'LR Motor City'),
        ('zl khalidya', 'ZL al Forsan Cloud Kitchen'),
        ('zl khalidiya', 'ZL al Forsan Cloud Kitchen')
      ) as names(old_name, new_name)
    loop
      delete from public.cs_client_brand_locations old_row
      using public.cs_client_brand_locations new_row
      where old_row.id <> new_row.id
        and lower(btrim(coalesce(old_row.location_name, ''))) = v_old
        and lower(btrim(coalesce(new_row.location_name, ''))) = lower(v_new)
        and old_row.brand_id is not distinct from new_row.brand_id
        and old_row.company_id is not distinct from new_row.company_id
        and old_row.group_id is not distinct from new_row.group_id;

      update public.cs_client_brand_locations
      set location_name = v_new,
          updated_at = now()
      where lower(btrim(coalesce(location_name, ''))) = v_old;
    end loop;
  end if;
end
$$;

-- Completion snapshots. Remove only a duplicate for the same owner and period.
do $$
declare
  v_old text;
  v_new text;
begin
  if to_regclass('public.cs_location_completions') is not null then
    for v_old, v_new in
      select * from (values
        ('lr muroo', 'LR Muroor'),
        ('lr muroor', 'LR Muroor'),
        ('lr defence', 'LR Motor City'),
        ('zl defence', 'LR Motor City'),
        ('zl khalidya', 'ZL al Forsan Cloud Kitchen'),
        ('zl khalidiya', 'ZL al Forsan Cloud Kitchen')
      ) as names(old_name, new_name)
    loop
      delete from public.cs_location_completions old_row
      using public.cs_location_completions new_row
      where old_row.id <> new_row.id
        and lower(btrim(coalesce(old_row.location_name, ''))) = v_old
        and lower(btrim(coalesce(new_row.location_name, ''))) = lower(v_new)
        and old_row.company_id is not distinct from new_row.company_id
        and old_row.special_client_id is not distinct from new_row.special_client_id
        and old_row.special_location_id is not distinct from new_row.special_location_id
        and old_row.review_type is not distinct from new_row.review_type
        and old_row.period_start is not distinct from new_row.period_start
        and old_row.period_end is not distinct from new_row.period_end;

      update public.cs_location_completions
      set location_name = v_new,
          updated_at = now()
      where lower(btrim(coalesce(location_name, ''))) = v_old;
    end loop;
  end if;
end
$$;

-- Standalone Special CS Client locations. Keep the corrected row if the same
-- Special CS Client already has it.
do $$
declare
  v_old text;
  v_new text;
begin
  if to_regclass('public.cs_special_client_locations') is not null then
    for v_old, v_new in
      select * from (values
        ('lr muroo', 'LR Muroor'),
        ('lr muroor', 'LR Muroor'),
        ('lr defence', 'LR Motor City'),
        ('zl defence', 'LR Motor City'),
        ('zl khalidya', 'ZL al Forsan Cloud Kitchen'),
        ('zl khalidiya', 'ZL al Forsan Cloud Kitchen')
      ) as names(old_name, new_name)
    loop
      delete from public.cs_special_client_locations old_row
      using public.cs_special_client_locations new_row
      where old_row.id <> new_row.id
        and old_row.special_client_id = new_row.special_client_id
        and lower(btrim(coalesce(old_row.location_name, ''))) = v_old
        and lower(btrim(coalesce(new_row.location_name, ''))) = lower(v_new);

      update public.cs_special_client_locations
      set location_name = v_new,
          updated_at = now()
      where lower(btrim(coalesce(location_name, ''))) = v_old;
    end loop;
  end if;
end
$$;

-- Other CS360-owned snapshot tables normally have no location uniqueness rule.
do $$
declare
  v_table record;
  v_old text;
  v_new text;
  v_has_updated_at boolean;
begin
  for v_table in
    select distinct c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'location_name'
      and c.table_name like 'cs\_%' escape '\'
      and c.table_name not in (
        'cs_client_brand_locations',
        'cs_location_completions',
        'cs_special_client_locations'
      )
  loop
    select exists (
      select 1 from information_schema.columns u
      where u.table_schema = 'public'
        and u.table_name = v_table.table_name
        and u.column_name = 'updated_at'
    ) into v_has_updated_at;

    for v_old, v_new in
      select * from (values
        ('lr muroo', 'LR Muroor'),
        ('lr muroor', 'LR Muroor'),
        ('lr defence', 'LR Motor City'),
        ('zl defence', 'LR Motor City'),
        ('zl khalidya', 'ZL al Forsan Cloud Kitchen'),
        ('zl khalidiya', 'ZL al Forsan Cloud Kitchen')
      ) as names(old_name, new_name)
    loop
      execute format(
        'update public.%I set location_name = $1%s where lower(btrim(coalesce(location_name, ''''))) = $2',
        v_table.table_name,
        case when v_has_updated_at then ', updated_at = now()' else '' end
      ) using v_new, v_old;
    end loop;
  end loop;
end
$$;

-------------------------------------------------------------------------------
-- C. Atomic normal-client brand assignment / movement / unassignment
-------------------------------------------------------------------------------
create or replace function public.cs360_assign_brand_location(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_brand public.cs_client_brands%rowtype;
  v_company_id uuid;
  v_location_name text;
  v_location_key text;
  v_location_aliases text[];
  v_id uuid;
begin
  if not public.cs360_brand_manage_can_write() then
    raise exception 'Forbidden: your role does not have CS360 brand-management permission' using errcode = '42501';
  end if;

  select * into v_brand
  from public.cs_client_brands
  where id = nullif(p_payload->>'brand_id', '')::uuid;

  if not found then raise exception 'Selected CS360 brand was not found'; end if;

  begin
    v_company_id := nullif(p_payload->>'company_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'The selected client is not linked to a valid company UUID. Refresh CS360 and retry.';
  end;

  v_location_name := btrim(coalesce(p_payload->>'location_name', ''));
  v_location_key := lower(v_location_name);
  if v_company_id is null or v_location_name = '' then
    raise exception 'A valid client and location are required';
  end if;

  if v_location_key in ('lr muroo', 'lr muroor') then
    v_location_name := 'LR Muroor';
    v_location_aliases := array['lr muroo', 'lr muroor'];
  elsif v_location_key in ('lr defence', 'zl defence', 'lr motor city') then
    v_location_name := 'LR Motor City';
    v_location_aliases := array['lr defence', 'zl defence', 'lr motor city'];
  elsif v_location_key in ('zl khalidya', 'zl khalidiya', 'zl al forsan cloud kitchen') then
    v_location_name := 'ZL al Forsan Cloud Kitchen';
    v_location_aliases := array['zl khalidya', 'zl khalidiya', 'zl al forsan cloud kitchen'];
  else
    v_location_aliases := array[v_location_key];
  end if;

  delete from public.cs_client_brand_locations row_to_remove
  where row_to_remove.company_id = v_company_id
    and lower(btrim(row_to_remove.location_name)) = any(v_location_aliases)
    and (
      (v_brand.group_id is null and row_to_remove.group_id is null)
      or row_to_remove.group_id = v_brand.group_id
    );

  insert into public.cs_client_brand_locations (
    brand_id, brand_name_snapshot, group_id, group_name_snapshot,
    company_id, company_name_snapshot, location_name,
    service_start_date, service_end_date, status, notes,
    created_by, created_at, updated_at
  ) values (
    v_brand.id,
    v_brand.brand_name,
    v_brand.group_id,
    coalesce(nullif(p_payload->>'group_name_snapshot', ''), v_brand.group_name_snapshot),
    v_company_id,
    nullif(p_payload->>'company_name_snapshot', ''),
    v_location_name,
    nullif(p_payload->>'service_start_date', '')::date,
    nullif(p_payload->>'service_end_date', '')::date,
    coalesce(nullif(p_payload->>'status', ''), 'Active'),
    nullif(p_payload->>'notes', ''),
    auth.uid(), now(), now()
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.cs360_unassign_brand_location(p_brand_location_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.cs360_brand_manage_can_write() then
    raise exception 'Forbidden: your role does not have CS360 brand-management permission' using errcode = '42501';
  end if;

  delete from public.cs_client_brand_locations where id = p_brand_location_id;
  return found;
end;
$$;

revoke all on function public.cs360_assign_brand_location(jsonb) from public;
revoke all on function public.cs360_unassign_brand_location(uuid) from public;
grant execute on function public.cs360_assign_brand_location(jsonb) to authenticated;
grant execute on function public.cs360_unassign_brand_location(uuid) to authenticated;

-------------------------------------------------------------------------------
-- D. Atomic Special CS Client brand assignment / unassignment
-------------------------------------------------------------------------------
create or replace function public.cs360_set_special_location_brand(
  p_special_location_id uuid,
  p_brand_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_location public.cs_special_client_locations%rowtype;
  v_brand public.cs_special_client_brands%rowtype;
begin
  if not public.cs360_brand_manage_can_write() then
    raise exception 'Forbidden: your role does not have CS360 brand-management permission' using errcode = '42501';
  end if;

  select * into v_location
  from public.cs_special_client_locations
  where id = p_special_location_id
  for update;

  if not found then raise exception 'Special CS Client location was not found'; end if;

  if p_brand_id is not null then
    select * into v_brand
    from public.cs_special_client_brands
    where id = p_brand_id;

    if not found then raise exception 'Selected Special CS Client brand was not found'; end if;
    if v_brand.special_client_id <> v_location.special_client_id then
      raise exception 'The selected brand does not belong to this Special CS Client';
    end if;
  end if;

  update public.cs_special_client_locations
  set brand_id = p_brand_id,
      updated_at = now()
  where id = p_special_location_id;

  return true;
end;
$$;

revoke all on function public.cs360_set_special_location_brand(uuid, uuid) from public;
grant execute on function public.cs360_set_special_location_brand(uuid, uuid) to authenticated;

-------------------------------------------------------------------------------
-- E. Rebuild Special CS Clients with new locations UNASSIGNED by default
-------------------------------------------------------------------------------
create or replace function public.cs360_save_special_client(
  p_special_client_id uuid default null,
  p_client_name text default null,
  p_description text default null,
  p_status text default 'active',
  p_groups jsonb default '[]'::jsonb,
  p_brands jsonb default '[]'::jsonb,
  p_locations jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_client_id uuid := p_special_client_id;
  v_client_name text := btrim(coalesce(p_client_name, ''));
  v_status text := lower(btrim(coalesce(p_status, 'active')));
  v_name text;
  v_order bigint;
  v_inserted_id uuid;
  v_first_group_id uuid;
  v_location_count integer := 0;
begin
  if not public.cs360_brand_manage_can_write() then
    raise exception 'Forbidden: your role does not have CS360 write permission' using errcode = '42501';
  end if;
  if v_client_name = '' then raise exception 'Client Name is required'; end if;
  if v_status not in ('active','archived') then raise exception 'Invalid Special CS Client status'; end if;

  select count(*) into v_location_count
  from (
    select lower(btrim(e.value))
    from jsonb_array_elements_text(coalesce(p_locations, '[]'::jsonb)) with ordinality e(value, ord)
    where btrim(e.value) <> ''
    group by lower(btrim(e.value))
  ) x;
  if v_location_count = 0 then raise exception 'Add at least one active location'; end if;

  if v_client_id is null then
    insert into public.cs_special_clients (
      client_name, description, status, created_by, updated_by, created_at, updated_at
    ) values (
      v_client_name, nullif(btrim(coalesce(p_description, '')), ''), v_status,
      auth.uid(), auth.uid(), now(), now()
    ) returning id into v_client_id;
  else
    update public.cs_special_clients
    set client_name = v_client_name,
        description = nullif(btrim(coalesce(p_description, '')), ''),
        status = v_status,
        updated_by = auth.uid(),
        updated_at = now()
    where id = v_client_id;
    if not found then raise exception 'Special CS Client was not found'; end if;

    delete from public.cs_special_client_locations where special_client_id = v_client_id;
    delete from public.cs_special_client_brands where special_client_id = v_client_id;
    delete from public.cs_special_client_groups where special_client_id = v_client_id;
  end if;

  for v_name, v_order in
    select (array_agg(btrim(e.value) order by e.ord))[1], min(e.ord)
    from jsonb_array_elements_text(coalesce(p_groups, '[]'::jsonb)) with ordinality e(value, ord)
    where btrim(e.value) <> ''
    group by lower(btrim(e.value))
    order by min(e.ord)
  loop
    insert into public.cs_special_client_groups (special_client_id, group_name, sort_order, created_at)
    values (v_client_id, v_name, (v_order - 1)::integer, now())
    returning id into v_inserted_id;
    if v_first_group_id is null then v_first_group_id := v_inserted_id; end if;
  end loop;

  for v_name, v_order in
    select (array_agg(btrim(e.value) order by e.ord))[1], min(e.ord)
    from jsonb_array_elements_text(coalesce(p_brands, '[]'::jsonb)) with ordinality e(value, ord)
    where btrim(e.value) <> ''
    group by lower(btrim(e.value))
    order by min(e.ord)
  loop
    insert into public.cs_special_client_brands (special_client_id, group_id, brand_name, sort_order, created_at)
    values (v_client_id, v_first_group_id, v_name, (v_order - 1)::integer, now());
  end loop;

  for v_name, v_order in
    select (array_agg(btrim(e.value) order by e.ord))[1], min(e.ord)
    from jsonb_array_elements_text(coalesce(p_locations, '[]'::jsonb)) with ordinality e(value, ord)
    where btrim(e.value) <> ''
    group by lower(btrim(e.value))
    order by min(e.ord)
  loop
    v_name := case lower(v_name)
      when 'lr muroo' then 'LR Muroor'
      when 'lr muroor' then 'LR Muroor'
      when 'lr defence' then 'LR Motor City'
      when 'zl defence' then 'LR Motor City'
      when 'zl khalidya' then 'ZL al Forsan Cloud Kitchen'
      when 'zl khalidiya' then 'ZL al Forsan Cloud Kitchen'
      else v_name
    end;

    insert into public.cs_special_client_locations (
      special_client_id, group_id, brand_id, location_name,
      status, sort_order, created_at, updated_at
    ) values (
      v_client_id, v_first_group_id, null, v_name,
      'active', (v_order - 1)::integer, now(), now()
    );
  end loop;

  return v_client_id;
end;
$$;

revoke all on function public.cs360_save_special_client(uuid, text, text, text, jsonb, jsonb, jsonb) from public;
grant execute on function public.cs360_save_special_client(uuid, text, text, text, jsonb, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Verification
select
  to_regprocedure('public.cs360_assign_brand_location(jsonb)') as normal_assign_rpc,
  to_regprocedure('public.cs360_unassign_brand_location(uuid)') as normal_unassign_rpc,
  to_regprocedure('public.cs360_set_special_location_brand(uuid,uuid)') as special_brand_rpc,
  to_regprocedure('public.cs360_save_special_client(uuid,text,text,text,jsonb,jsonb,jsonb)') as special_save_rpc;
