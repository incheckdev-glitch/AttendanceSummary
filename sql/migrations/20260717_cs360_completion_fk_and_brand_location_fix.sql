-- CS360 COMPLETION FK + BRAND LOCATION CONFLICT FIX
--
-- Fixes:
-- 1) cs_location_completions_special_location_id_fkey violation
-- 2) no unique or exclusion constraint matching the ON CONFLICT specification
--
-- Run once in Supabase SQL Editor, then deploy the updated client-success.js.

begin;

create extension if not exists pgcrypto;

-------------------------------------------------------------------------------
-- A. Ensure the CURRENT standalone Special CS Client structure exists
-------------------------------------------------------------------------------

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

create table if not exists public.cs_special_client_groups (
  id uuid primary key default gen_random_uuid(),
  special_client_id uuid not null references public.cs_special_clients(id) on delete cascade,
  group_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.cs_special_client_brands (
  id uuid primary key default gen_random_uuid(),
  special_client_id uuid not null references public.cs_special_clients(id) on delete cascade,
  group_id uuid references public.cs_special_client_groups(id) on delete set null,
  brand_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

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

-------------------------------------------------------------------------------
-- B. Repair completion special-client columns and foreign keys
-------------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.cs_location_completions') is null then
    raise exception 'public.cs_location_completions does not exist. Run the base CS360 migration first.';
  end if;
end
$$;

alter table public.cs_location_completions
  add column if not exists source_type text default 'normal',
  add column if not exists special_client_id uuid,
  add column if not exists special_location_id uuid,
  add column if not exists special_group_id uuid,
  add column if not exists special_brand_id uuid,
  add column if not exists group_name text,
  add column if not exists brand_name text;

-- Remove any legacy FK on these columns, including constraints pointing to
-- retired cs_special_case_* tables.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select distinct c.conname
    from pg_constraint c
    join lateral unnest(c.conkey) as key_column(attnum) on true
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = key_column.attnum
    where c.conrelid = 'public.cs_location_completions'::regclass
      and c.contype = 'f'
      and a.attname in (
        'special_client_id',
        'special_location_id',
        'special_group_id',
        'special_brand_id'
      )
  loop
    execute format(
      'alter table public.cs_location_completions drop constraint if exists %I',
      v_constraint.conname
    );
  end loop;
end
$$;

-- Recover special_client_id from company_id where older versions stored the
-- standalone special-client UUID in company_id.
update public.cs_location_completions c
set special_client_id = sc.id
from public.cs_special_clients sc
where lower(coalesce(c.source_type, 'normal')) = 'special_client'
  and c.special_client_id is null
  and c.company_id = sc.id;

-- Recover the CURRENT special location using client + displayed location name.
update public.cs_location_completions c
set special_location_id = loc.id
from public.cs_special_client_locations loc
where lower(coalesce(c.source_type, 'normal')) = 'special_client'
  and c.special_client_id = loc.special_client_id
  and lower(btrim(coalesce(c.location_name, ''))) =
      lower(btrim(coalesce(loc.location_name, '')))
  and (
    c.special_location_id is null
    or not exists (
      select 1
      from public.cs_special_client_locations valid_location
      where valid_location.id = c.special_location_id
    )
  );

-- Preserve old completion history but clear references that no longer exist.
update public.cs_location_completions c
set special_location_id = null
where c.special_location_id is not null
  and not exists (
    select 1
    from public.cs_special_client_locations loc
    where loc.id = c.special_location_id
  );

update public.cs_location_completions c
set special_group_id = null
where c.special_group_id is not null
  and not exists (
    select 1
    from public.cs_special_client_groups grp
    where grp.id = c.special_group_id
  );

update public.cs_location_completions c
set special_brand_id = null
where c.special_brand_id is not null
  and not exists (
    select 1
    from public.cs_special_client_brands brand
    where brand.id = c.special_brand_id
  );

update public.cs_location_completions c
set special_client_id = null
where c.special_client_id is not null
  and not exists (
    select 1
    from public.cs_special_clients sc
    where sc.id = c.special_client_id
  );

alter table public.cs_location_completions
  add constraint cs_location_completions_special_client_id_fkey
    foreign key (special_client_id)
    references public.cs_special_clients(id)
    on delete set null,
  add constraint cs_location_completions_special_location_id_fkey
    foreign key (special_location_id)
    references public.cs_special_client_locations(id)
    on delete set null,
  add constraint cs_location_completions_special_group_id_fkey
    foreign key (special_group_id)
    references public.cs_special_client_groups(id)
    on delete set null,
  add constraint cs_location_completions_special_brand_id_fkey
    foreign key (special_brand_id)
    references public.cs_special_client_brands(id)
    on delete set null;

create unique index if not exists cs_location_completions_special_period_uidx
  on public.cs_location_completions (
    source_type,
    special_client_id,
    special_location_id,
    review_type,
    period_start,
    period_end
  )
  where source_type = 'special_client'
    and special_client_id is not null
    and special_location_id is not null;

-------------------------------------------------------------------------------
-- C. Repair CS brand-location duplicate rows and unique conflict target
-------------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.cs_client_brand_locations') is null then
    raise exception 'public.cs_client_brand_locations does not exist. Run the CS360 brand migration first.';
  end if;
end
$$;

-- Remove exact duplicate assignments, keeping the newest row.
with ranked as (
  select
    ctid,
    row_number() over (
      partition by brand_id, company_id, location_name
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as row_rank
  from public.cs_client_brand_locations
)
delete from public.cs_client_brand_locations target
using ranked
where target.ctid = ranked.ctid
  and ranked.row_rank > 1;

-- This exact non-expression unique index matches:
-- ON CONFLICT (brand_id, company_id, location_name)
create unique index if not exists cs_client_brand_locations_brand_company_location_uidx
  on public.cs_client_brand_locations (
    brand_id,
    company_id,
    location_name
  );

notify pgrst, 'reload schema';

commit;

-- Verification
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.cs_location_completions'::regclass
  and conname in (
    'cs_location_completions_special_client_id_fkey',
    'cs_location_completions_special_location_id_fkey',
    'cs_location_completions_special_group_id_fkey',
    'cs_location_completions_special_brand_id_fkey'
  )
order by conname;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'cs_client_brand_locations'
  and indexname = 'cs_client_brand_locations_brand_company_location_uidx';
