-- CS360 FINAL SAVE/PERSISTENCE FIX
-- Run once in Supabase SQL Editor, then deploy client-success.js/client-success.css.
-- Fixes Special CS Client save and completion report save.

begin;

create extension if not exists pgcrypto;

create table if not exists public.cs_special_clients (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  description text,
  status text not null default 'active',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cs_special_clients
  add column if not exists client_name text,
  add column if not exists description text,
  add column if not exists status text default 'active',
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.cs_special_client_groups (
  id uuid primary key default gen_random_uuid(),
  special_client_id uuid not null references public.cs_special_clients(id) on delete cascade,
  group_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.cs_special_client_groups
  add column if not exists special_client_id uuid,
  add column if not exists group_name text,
  add column if not exists sort_order integer default 0,
  add column if not exists created_at timestamptz default now();

create table if not exists public.cs_special_client_brands (
  id uuid primary key default gen_random_uuid(),
  special_client_id uuid not null references public.cs_special_clients(id) on delete cascade,
  group_id uuid references public.cs_special_client_groups(id) on delete set null,
  brand_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.cs_special_client_brands
  add column if not exists special_client_id uuid,
  add column if not exists group_id uuid,
  add column if not exists brand_name text,
  add column if not exists sort_order integer default 0,
  add column if not exists created_at timestamptz default now();

create table if not exists public.cs_special_client_locations (
  id uuid primary key default gen_random_uuid(),
  special_client_id uuid not null references public.cs_special_clients(id) on delete cascade,
  group_id uuid references public.cs_special_client_groups(id) on delete set null,
  brand_id uuid references public.cs_special_client_brands(id) on delete set null,
  location_name text not null,
  location_code text,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cs_special_client_locations
  add column if not exists special_client_id uuid,
  add column if not exists group_id uuid,
  add column if not exists brand_id uuid,
  add column if not exists location_name text,
  add column if not exists location_code text,
  add column if not exists status text default 'active',
  add column if not exists sort_order integer default 0,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists cs_special_clients_name_lower_uidx
  on public.cs_special_clients (lower(btrim(client_name)));
create unique index if not exists cs_special_client_groups_name_lower_uidx
  on public.cs_special_client_groups (special_client_id, lower(btrim(group_name)));
create unique index if not exists cs_special_client_brands_name_lower_uidx
  on public.cs_special_client_brands (special_client_id, lower(btrim(brand_name)));
create unique index if not exists cs_special_client_locations_name_lower_uidx
  on public.cs_special_client_locations (special_client_id, lower(btrim(location_name)));

-- Special completion columns.
alter table if exists public.cs_location_completions
  add column if not exists source_type text default 'normal',
  add column if not exists special_client_id uuid,
  add column if not exists special_location_id uuid,
  add column if not exists special_group_id uuid,
  add column if not exists special_brand_id uuid,
  add column if not exists group_name text,
  add column if not exists brand_name text;

-- Standalone Special CS Clients have no CRM company. Allow null, while the RPC
-- still stores special_client_id in company_id when the existing schema expects it.
alter table if exists public.cs_location_completions
  alter column company_id drop not null;

do $$
begin
  if to_regclass('public.cs_location_completions') is not null then
    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.cs_location_completions'::regclass
        and conname = 'cs_location_completions_source_type_chk'
    ) then
      alter table public.cs_location_completions
        drop constraint cs_location_completions_source_type_chk;
    end if;

    alter table public.cs_location_completions
      add constraint cs_location_completions_source_type_chk
      check (source_type is null or source_type in ('normal','special_client'));
  end if;
end $$;

create unique index if not exists cs_location_completions_special_client_uidx
  on public.cs_location_completions
    (source_type, special_client_id, special_location_id, review_type, period_start, period_end)
  where source_type = 'special_client';

-- Reliable application-role lookup. It supports JWT metadata, public.profiles,
-- and public.users instead of assuming profiles.id always equals auth.uid().
create or replace function public.cs360_save_current_role_key()
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_role text;
  v_table regclass;
begin
  if v_auth_uid is null then
    return null;
  end if;

  v_role := lower(coalesce(
    nullif(auth.jwt()->'app_metadata'->>'role_key', ''),
    nullif(auth.jwt()->'app_metadata'->>'role', ''),
    nullif(auth.jwt()->'user_metadata'->>'role_key', ''),
    nullif(auth.jwt()->'user_metadata'->>'role', '')
  ));

  if v_role in ('authenticated','anon','service_role','supabase_admin') then
    v_role := null;
  end if;

  if nullif(v_role, '') is not null then
    return regexp_replace(replace(v_role, '-', '_'), '\s+', '_', 'g');
  end if;

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
        where
          coalesce(to_jsonb(x)->>'id', '') = $1
          or coalesce(to_jsonb(x)->>'auth_user_id', '') = $1
          or coalesce(to_jsonb(x)->>'user_id', '') = $1
          or coalesce(to_jsonb(x)->>'auth_id', '') = $1
          or ($2 <> '' and lower(coalesce(to_jsonb(x)->>'email', '')) = $2)
        limit 1
        $q$,
        v_table
      )
      into v_role
      using v_auth_uid::text, v_email;

      if nullif(v_role, '') is not null
         and v_role not in ('authenticated','anon','service_role','supabase_admin') then
        return regexp_replace(replace(v_role, '-', '_'), '\s+', '_', 'g');
      end if;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.cs360_save_can_read()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(public.cs360_save_current_role_key(), '');
  v_allowed boolean := false;
begin
  if v_role in (
    'admin','administrator','super_admin',
    'csm','customer_success',
    'gm','general_manager',
    'sfc','senior_financial_controller','senior_finanical_controller',
    'viewer'
  ) then
    return true;
  end if;

  if to_regclass('public.role_permissions') is not null and v_role <> '' then
    execute $q$
      select exists (
        select 1
        from public.role_permissions rp
        where lower(coalesce(rp.role_key, '')) = $1
          and lower(coalesce(rp.resource, '')) in ('client_success','customer_success')
          and lower(coalesce(rp.action, '')) in ('view','list','get','export','create','update','delete','manage')
          and coalesce(rp.is_active, true) = true
          and coalesce(rp.is_allowed, true) = true
      )
    $q$ into v_allowed using v_role;
  end if;

  return coalesce(v_allowed, false);
end;
$$;

create or replace function public.cs360_save_can_write()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(public.cs360_save_current_role_key(), '');
  v_allowed boolean := false;
begin
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
          and lower(coalesce(rp.action, '')) in ('create','insert','add','update','edit','manage')
          and coalesce(rp.is_active, true) = true
          and coalesce(rp.is_allowed, true) = true
      )
    $q$ into v_allowed using v_role;
  end if;

  return coalesce(v_allowed, false);
end;
$$;

alter table public.cs_special_clients enable row level security;
alter table public.cs_special_client_groups enable row level security;
alter table public.cs_special_client_brands enable row level security;
alter table public.cs_special_client_locations enable row level security;

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'cs_special_clients',
    'cs_special_client_groups',
    'cs_special_client_brands',
    'cs_special_client_locations'
  ]
  loop
    for p in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.cs360_save_can_read())',
      t || '_read', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.cs360_save_can_write())',
      t || '_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.cs360_save_can_write()) with check (public.cs360_save_can_write())',
      t || '_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.cs360_save_can_write())',
      t || '_delete', t
    );

    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Atomic Special CS Client save. The entire client/group/brand/location write
-- succeeds or rolls back together.
drop function if exists public.cs360_save_special_client(uuid, text, text, text, jsonb, jsonb, jsonb);

create function public.cs360_save_special_client(
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
  v_first_brand_id uuid;
  v_location_count integer := 0;
begin
  if not public.cs360_save_can_write() then
    raise exception 'Forbidden: your role does not have CS360 write permission'
      using errcode = '42501';
  end if;

  if v_client_name = '' then
    raise exception 'Client Name is required';
  end if;

  if v_status not in ('active','archived') then
    raise exception 'Invalid Special CS Client status';
  end if;

  select count(*)
  into v_location_count
  from (
    select lower(btrim(e.value)) as location_key
    from jsonb_array_elements_text(coalesce(p_locations, '[]'::jsonb)) with ordinality e(value, ord)
    where btrim(e.value) <> ''
    group by lower(btrim(e.value))
  ) x;

  if v_location_count = 0 then
    raise exception 'Add at least one active location';
  end if;

  if v_client_id is null then
    insert into public.cs_special_clients (
      client_name, description, status, created_by, updated_by, created_at, updated_at
    )
    values (
      v_client_name,
      nullif(btrim(coalesce(p_description, '')), ''),
      v_status,
      auth.uid(),
      auth.uid(),
      now(),
      now()
    )
    returning id into v_client_id;
  else
    update public.cs_special_clients
    set
      client_name = v_client_name,
      description = nullif(btrim(coalesce(p_description, '')), ''),
      status = v_status,
      updated_by = auth.uid(),
      updated_at = now()
    where id = v_client_id;

    if not found then
      raise exception 'Special CS Client was not found';
    end if;

    delete from public.cs_special_client_locations where special_client_id = v_client_id;
    delete from public.cs_special_client_brands where special_client_id = v_client_id;
    delete from public.cs_special_client_groups where special_client_id = v_client_id;
  end if;

  for v_name, v_order in
    select
      (array_agg(btrim(e.value) order by e.ord))[1] as clean_name,
      min(e.ord) as first_order
    from jsonb_array_elements_text(coalesce(p_groups, '[]'::jsonb)) with ordinality e(value, ord)
    where btrim(e.value) <> ''
    group by lower(btrim(e.value))
    order by min(e.ord)
  loop
    insert into public.cs_special_client_groups (
      special_client_id, group_name, sort_order, created_at
    )
    values (v_client_id, v_name, (v_order - 1)::integer, now())
    returning id into v_inserted_id;

    if v_first_group_id is null then
      v_first_group_id := v_inserted_id;
    end if;
  end loop;

  for v_name, v_order in
    select
      (array_agg(btrim(e.value) order by e.ord))[1] as clean_name,
      min(e.ord) as first_order
    from jsonb_array_elements_text(coalesce(p_brands, '[]'::jsonb)) with ordinality e(value, ord)
    where btrim(e.value) <> ''
    group by lower(btrim(e.value))
    order by min(e.ord)
  loop
    insert into public.cs_special_client_brands (
      special_client_id, group_id, brand_name, sort_order, created_at
    )
    values (v_client_id, v_first_group_id, v_name, (v_order - 1)::integer, now())
    returning id into v_inserted_id;

    if v_first_brand_id is null then
      v_first_brand_id := v_inserted_id;
    end if;
  end loop;

  for v_name, v_order in
    select
      (array_agg(btrim(e.value) order by e.ord))[1] as clean_name,
      min(e.ord) as first_order
    from jsonb_array_elements_text(coalesce(p_locations, '[]'::jsonb)) with ordinality e(value, ord)
    where btrim(e.value) <> ''
    group by lower(btrim(e.value))
    order by min(e.ord)
  loop
    insert into public.cs_special_client_locations (
      special_client_id,
      group_id,
      brand_id,
      location_name,
      status,
      sort_order,
      created_at,
      updated_at
    )
    values (
      v_client_id,
      v_first_group_id,
      v_first_brand_id,
      v_name,
      'active',
      (v_order - 1)::integer,
      now(),
      now()
    );
  end loop;

  return v_client_id;
end;
$$;

revoke all on function public.cs360_save_special_client(uuid, text, text, text, jsonb, jsonb, jsonb) from public;
grant execute on function public.cs360_save_special_client(uuid, text, text, text, jsonb, jsonb, jsonb) to authenticated;

-- Atomic completion report upsert.
drop function if exists public.cs360_upsert_location_completions(jsonb);

create function public.cs360_upsert_location_completions(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  r jsonb;
  v_source_type text;
  v_company_id uuid;
  v_special_client_id uuid;
  v_special_location_id uuid;
  v_review_type text;
  v_period_start date;
  v_period_end date;
  v_location_name text;
  v_done_on_time numeric;
  v_done_late numeric;
  v_partially_done numeric;
  v_missed numeric;
  v_count integer := 0;
begin
  if not public.cs360_save_can_write() then
    raise exception 'Forbidden: your role does not have CS360 write permission'
      using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'Completion rows must be a JSON array';
  end if;

  for r in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_source_type := lower(coalesce(nullif(btrim(r->>'source_type'), ''), 'normal'));
    v_special_client_id := nullif(r->>'special_client_id', '')::uuid;
    v_special_location_id := nullif(r->>'special_location_id', '')::uuid;
    v_company_id := coalesce(
      nullif(r->>'company_id', '')::uuid,
      case when v_source_type = 'special_client' then v_special_client_id else null end
    );
    v_review_type := lower(coalesce(nullif(btrim(r->>'review_type'), ''), 'weekly'));
    v_period_start := nullif(r->>'period_start', '')::date;
    v_period_end := nullif(r->>'period_end', '')::date;
    v_location_name := btrim(coalesce(r->>'location_name', ''));
    v_done_on_time := greatest(coalesce(nullif(r->>'done_on_time', '')::numeric, 0), 0);
    v_done_late := greatest(coalesce(nullif(r->>'done_late', '')::numeric, 0), 0);
    v_partially_done := greatest(coalesce(nullif(r->>'partially_done', '')::numeric, 0), 0);
    v_missed := greatest(coalesce(nullif(r->>'missed', '')::numeric, 0), 0);

    if v_source_type not in ('normal','special_client') then
      raise exception 'Invalid completion source type: %', v_source_type;
    end if;
    if v_review_type not in ('weekly','monthly') then
      raise exception 'Invalid review type: %', v_review_type;
    end if;
    if v_location_name = '' or v_period_start is null or v_period_end is null then
      raise exception 'Location and report period are required';
    end if;
    if v_done_on_time + v_done_late + v_partially_done + v_missed > 100.0001 then
      raise exception 'Total percentage for % cannot exceed 100%%', v_location_name;
    end if;
    if v_source_type = 'special_client'
       and (v_special_client_id is null or v_special_location_id is null) then
      raise exception 'Special client and special location are required';
    end if;
    if v_source_type = 'normal' and v_company_id is null then
      raise exception 'Company is required for normal completion rows';
    end if;

    if v_source_type = 'special_client' then
      insert into public.cs_location_completions (
        company_id,
        company_name_snapshot,
        location_name,
        review_type,
        period_start,
        period_end,
        done_on_time,
        done_late,
        partially_done,
        missed,
        source_note,
        source_type,
        special_client_id,
        special_location_id,
        special_group_id,
        special_brand_id,
        group_name,
        brand_name,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      values (
        v_company_id,
        nullif(r->>'company_name_snapshot', ''),
        v_location_name,
        v_review_type,
        v_period_start,
        v_period_end,
        v_done_on_time,
        v_done_late,
        v_partially_done,
        v_missed,
        nullif(r->>'source_note', ''),
        'special_client',
        v_special_client_id,
        v_special_location_id,
        nullif(r->>'special_group_id', '')::uuid,
        nullif(r->>'special_brand_id', '')::uuid,
        nullif(r->>'group_name', ''),
        nullif(r->>'brand_name', ''),
        auth.uid(),
        auth.uid(),
        now(),
        now()
      )
      on conflict (
        source_type,
        special_client_id,
        special_location_id,
        review_type,
        period_start,
        period_end
      )
      where source_type = 'special_client'
      do update set
        company_id = excluded.company_id,
        company_name_snapshot = excluded.company_name_snapshot,
        location_name = excluded.location_name,
        done_on_time = excluded.done_on_time,
        done_late = excluded.done_late,
        partially_done = excluded.partially_done,
        missed = excluded.missed,
        source_note = excluded.source_note,
        special_group_id = excluded.special_group_id,
        special_brand_id = excluded.special_brand_id,
        group_name = excluded.group_name,
        brand_name = excluded.brand_name,
        updated_by = auth.uid(),
        updated_at = now();
    else
      insert into public.cs_location_completions (
        company_id,
        company_name_snapshot,
        location_name,
        review_type,
        period_start,
        period_end,
        done_on_time,
        done_late,
        partially_done,
        missed,
        source_note,
        source_type,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      values (
        v_company_id,
        nullif(r->>'company_name_snapshot', ''),
        v_location_name,
        v_review_type,
        v_period_start,
        v_period_end,
        v_done_on_time,
        v_done_late,
        v_partially_done,
        v_missed,
        nullif(r->>'source_note', ''),
        'normal',
        auth.uid(),
        auth.uid(),
        now(),
        now()
      )
      on conflict (company_id, location_name, review_type, period_start, period_end)
      do update set
        company_name_snapshot = excluded.company_name_snapshot,
        done_on_time = excluded.done_on_time,
        done_late = excluded.done_late,
        partially_done = excluded.partially_done,
        missed = excluded.missed,
        source_note = excluded.source_note,
        source_type = 'normal',
        updated_by = auth.uid(),
        updated_at = now();
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.cs360_upsert_location_completions(jsonb) from public;
grant execute on function public.cs360_upsert_location_completions(jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;

-- Verification:
select
  to_regclass('public.cs_special_clients') as special_clients_table,
  to_regprocedure('public.cs360_save_special_client(uuid,text,text,text,jsonb,jsonb,jsonb)') as special_client_save_rpc,
  to_regprocedure('public.cs360_upsert_location_completions(jsonb)') as completion_save_rpc;
