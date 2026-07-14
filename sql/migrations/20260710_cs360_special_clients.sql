-- Customer Success 360 Special CS Clients
-- Standalone CS360 clients for special cases, separated from CRM/company/agreement/invoice/payment flows.

create table if not exists public.cs_special_clients (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  description text null,
  status text default 'active',
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint cs_special_clients_status_chk check (status in ('active','archived')),
  constraint cs_special_clients_client_name_uidx unique (client_name)
);

create table if not exists public.cs_special_client_groups (
  id uuid primary key default gen_random_uuid(),
  special_client_id uuid references public.cs_special_clients(id) on delete cascade,
  group_name text not null,
  sort_order integer default 0,
  created_at timestamptz default now(),
  constraint cs_special_client_groups_name_uidx unique (special_client_id, group_name)
);

create table if not exists public.cs_special_client_brands (
  id uuid primary key default gen_random_uuid(),
  special_client_id uuid references public.cs_special_clients(id) on delete cascade,
  group_id uuid references public.cs_special_client_groups(id) on delete set null,
  brand_name text not null,
  sort_order integer default 0,
  created_at timestamptz default now(),
  constraint cs_special_client_brands_name_uidx unique (special_client_id, brand_name)
);

create table if not exists public.cs_special_client_locations (
  id uuid primary key default gen_random_uuid(),
  special_client_id uuid references public.cs_special_clients(id) on delete cascade,
  group_id uuid references public.cs_special_client_groups(id) on delete set null,
  brand_id uuid references public.cs_special_client_brands(id) on delete set null,
  location_name text not null,
  location_code text null,
  status text default 'active',
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint cs_special_client_locations_status_chk check (status in ('active','inactive')),
  constraint cs_special_client_locations_name_uidx unique (special_client_id, location_name)
);

alter table if exists public.cs_location_completions add column if not exists source_type text default 'normal';
alter table if exists public.cs_location_completions add column if not exists special_client_id uuid null references public.cs_special_clients(id) on delete set null;
alter table if exists public.cs_location_completions add column if not exists special_location_id uuid null references public.cs_special_client_locations(id) on delete set null;
alter table if exists public.cs_location_completions add column if not exists special_group_id uuid null references public.cs_special_client_groups(id) on delete set null;
alter table if exists public.cs_location_completions add column if not exists special_brand_id uuid null references public.cs_special_client_brands(id) on delete set null;
alter table if exists public.cs_location_completions add column if not exists group_name text null;
alter table if exists public.cs_location_completions add column if not exists brand_name text null;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'cs_location_completions_source_type_chk') then
    alter table public.cs_location_completions drop constraint cs_location_completions_source_type_chk;
  end if;
  alter table public.cs_location_completions
    add constraint cs_location_completions_source_type_chk check (source_type is null or source_type in ('normal','special_client'));
end $$;

create unique index if not exists cs_location_completions_special_client_uidx
  on public.cs_location_completions(source_type, special_client_id, special_location_id, review_type, period_start, period_end)
  where source_type = 'special_client';
create index if not exists cs_location_completions_special_client_idx
  on public.cs_location_completions(special_client_id, period_end desc) where source_type = 'special_client';

alter table public.cs_special_clients enable row level security;
alter table public.cs_special_client_groups enable row level security;
alter table public.cs_special_client_brands enable row level security;
alter table public.cs_special_client_locations enable row level security;

do $$
declare t text;
begin
  foreach t in array array['cs_special_clients','cs_special_client_groups','cs_special_client_brands','cs_special_client_locations'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select using (public.cs360_can_select())', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (public.cs360_can_insert())', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.cs360_can_update()) with check (public.cs360_can_update())', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (public.cs360_can_delete())', t || '_delete', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
