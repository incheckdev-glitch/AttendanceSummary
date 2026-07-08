-- Client Success 360 - Brand layer
-- Adds a third CS layer: Client / Group -> Brand -> Location.
-- Admin-only policies for now, matching the current CS module access rule.

create extension if not exists pgcrypto;

create table if not exists public.cs_client_brands (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  brand_code text,
  company_id uuid,
  company_name_snapshot text,
  group_id uuid references public.cs_client_groups(id) on delete set null,
  group_name_snapshot text,
  owner_name text,
  status text not null default 'Active',
  description text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cs_client_brand_locations (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.cs_client_brands(id) on delete cascade,
  brand_name_snapshot text,
  group_id uuid,
  group_name_snapshot text,
  company_id uuid not null,
  company_name_snapshot text,
  location_name text not null,
  service_start_date date,
  service_end_date date,
  status text not null default 'Active',
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cs_client_brand_locations_unique
on public.cs_client_brand_locations(brand_id, company_id, lower(trim(location_name)));

create index if not exists cs_client_brands_company_idx on public.cs_client_brands(company_id);
create index if not exists cs_client_brands_group_idx on public.cs_client_brands(group_id);
create index if not exists cs_client_brand_locations_brand_idx on public.cs_client_brand_locations(brand_id);
create index if not exists cs_client_brand_locations_company_idx on public.cs_client_brand_locations(company_id);

alter table public.cs_client_brands enable row level security;
alter table public.cs_client_brand_locations enable row level security;

drop policy if exists "cs_client_brands_admin_select" on public.cs_client_brands;
drop policy if exists "cs_client_brands_admin_insert" on public.cs_client_brands;
drop policy if exists "cs_client_brands_admin_update" on public.cs_client_brands;
drop policy if exists "cs_client_brands_admin_delete" on public.cs_client_brands;

drop policy if exists "cs_client_brand_locations_admin_select" on public.cs_client_brand_locations;
drop policy if exists "cs_client_brand_locations_admin_insert" on public.cs_client_brand_locations;
drop policy if exists "cs_client_brand_locations_admin_update" on public.cs_client_brand_locations;
drop policy if exists "cs_client_brand_locations_admin_delete" on public.cs_client_brand_locations;

create policy "cs_client_brands_admin_select"
on public.cs_client_brands for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'admin'
  )
);

create policy "cs_client_brands_admin_insert"
on public.cs_client_brands for insert
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'admin'
  )
);

create policy "cs_client_brands_admin_update"
on public.cs_client_brands for update
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'admin'
  )
);

create policy "cs_client_brands_admin_delete"
on public.cs_client_brands for delete
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'admin'
  )
);

create policy "cs_client_brand_locations_admin_select"
on public.cs_client_brand_locations for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'admin'
  )
);

create policy "cs_client_brand_locations_admin_insert"
on public.cs_client_brand_locations for insert
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'admin'
  )
);

create policy "cs_client_brand_locations_admin_update"
on public.cs_client_brand_locations for update
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'admin'
  )
);

create policy "cs_client_brand_locations_admin_delete"
on public.cs_client_brand_locations for delete
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'admin'
  )
);
