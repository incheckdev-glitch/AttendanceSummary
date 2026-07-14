-- Customer Success 360 Special Case Templates
-- Adds reusable non-accounting completion report sources without changing normal client source logic.

create extension if not exists pgcrypto;

create table if not exists public.cs_special_case_templates (
  id uuid primary key default gen_random_uuid(),
  template_name text not null,
  display_client_name text not null,
  description text null,
  status text not null default 'active',
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cs_special_case_templates_status_chk check (status in ('active','archived'))
);

create table if not exists public.cs_special_case_groups (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.cs_special_case_templates(id) on delete cascade,
  group_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.cs_special_case_brands (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.cs_special_case_templates(id) on delete cascade,
  group_id uuid null references public.cs_special_case_groups(id) on delete cascade,
  brand_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.cs_special_case_locations (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.cs_special_case_templates(id) on delete cascade,
  group_id uuid null references public.cs_special_case_groups(id) on delete set null,
  brand_id uuid null references public.cs_special_case_brands(id) on delete set null,
  location_name text not null,
  location_code text null,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cs_special_case_locations_status_chk check (status in ('active','inactive'))
);

create unique index if not exists cs_special_case_groups_template_name_uidx on public.cs_special_case_groups(template_id, lower(group_name));
create unique index if not exists cs_special_case_brands_template_name_uidx on public.cs_special_case_brands(template_id, lower(brand_name));
create unique index if not exists cs_special_case_locations_template_name_uidx on public.cs_special_case_locations(template_id, lower(location_name));
create index if not exists cs_special_case_templates_status_idx on public.cs_special_case_templates(status, updated_at desc);
create index if not exists cs_special_case_groups_template_idx on public.cs_special_case_groups(template_id, sort_order);
create index if not exists cs_special_case_brands_template_idx on public.cs_special_case_brands(template_id, sort_order);
create index if not exists cs_special_case_locations_template_idx on public.cs_special_case_locations(template_id, status, sort_order);

alter table if exists public.cs_location_completions add column if not exists source_type text default 'normal';
alter table if exists public.cs_location_completions add column if not exists special_template_id uuid null references public.cs_special_case_templates(id) on delete set null;
alter table if exists public.cs_location_completions add column if not exists special_location_id uuid null references public.cs_special_case_locations(id) on delete set null;
alter table if exists public.cs_location_completions add column if not exists brand_name text null;
alter table if exists public.cs_location_completions add column if not exists group_name text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cs_location_completions_source_type_chk'
  ) then
    alter table public.cs_location_completions
      add constraint cs_location_completions_source_type_chk check (source_type is null or source_type in ('normal','special_template'));
  end if;
end $$;

create unique index if not exists cs_location_completions_special_uidx
  on public.cs_location_completions(source_type, special_template_id, special_location_id, review_type, period_start, period_end)
  where source_type = 'special_template';
create index if not exists cs_location_completions_special_template_idx on public.cs_location_completions(special_template_id, period_end desc) where source_type = 'special_template';

alter table public.cs_special_case_templates enable row level security;
alter table public.cs_special_case_groups enable row level security;
alter table public.cs_special_case_brands enable row level security;
alter table public.cs_special_case_locations enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['cs_special_case_templates','cs_special_case_groups','cs_special_case_brands','cs_special_case_locations'] loop
    execute format('drop policy if exists %I on public.%I', t || '_cs360_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_cs360_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_cs360_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_cs360_delete', t);
    execute format('create policy %I on public.%I for select using (public.cs360_can_select())', t || '_cs360_select', t);
    execute format('create policy %I on public.%I for insert with check (public.cs360_can_insert())', t || '_cs360_insert', t);
    execute format('create policy %I on public.%I for update using (public.cs360_can_update()) with check (public.cs360_can_update())', t || '_cs360_update', t);
    execute format('create policy %I on public.%I for delete using (public.cs360_can_delete())', t || '_cs360_delete', t);
  end loop;
end $$;

grant select, insert, update, delete on public.cs_special_case_templates to authenticated;
grant select, insert, update, delete on public.cs_special_case_groups to authenticated;
grant select, insert, update, delete on public.cs_special_case_brands to authenticated;
grant select, insert, update, delete on public.cs_special_case_locations to authenticated;
