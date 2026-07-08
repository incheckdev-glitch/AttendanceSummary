-- Client Success 360 v2 — signed clients + location completion
-- Run after 20260708_client_success_360_admin_only.sql if you already applied v1.
-- Scope: adds operational location completion counts. Completion = done_on_time + done_late.
-- Still intentionally excludes invoices, receipts, pending amounts, collections, and payment tables.

create extension if not exists pgcrypto;

create table if not exists public.cs_location_completions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  company_name_snapshot text,
  location_name text not null,
  review_type text not null default 'weekly' check (review_type in ('weekly','monthly')),
  period_start date not null,
  period_end date not null,
  done_on_time numeric(12,2) not null default 0 check (done_on_time >= 0),
  done_late numeric(12,2) not null default 0 check (done_late >= 0),
  partially_done numeric(12,2) not null default 0 check (partially_done >= 0),
  missed numeric(12,2) not null default 0 check (missed >= 0),
  source_note text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, location_name, review_type, period_start, period_end)
);

create index if not exists cs_location_completions_company_period_idx
  on public.cs_location_completions(company_id, review_type, period_start, period_end);

create or replace function public.set_client_success_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists set_cs_location_completions_updated_at on public.cs_location_completions;
create trigger set_cs_location_completions_updated_at
before update on public.cs_location_completions
for each row execute function public.set_client_success_updated_at();

alter table public.cs_location_completions enable row level security;

drop policy if exists cs_location_completions_admin_select on public.cs_location_completions;
drop policy if exists cs_location_completions_admin_all on public.cs_location_completions;

create policy cs_location_completions_admin_select
on public.cs_location_completions
for select to authenticated
using (public.client_success_is_admin());

create policy cs_location_completions_admin_all
on public.cs_location_completions
for all to authenticated
using (public.client_success_is_admin())
with check (public.client_success_is_admin());

grant select, insert, update, delete on public.cs_location_completions to authenticated;

-- Runtime permission matrix seed: Admin only for the new resource.
do $$
declare
  actions text[] := array['view','list','get','create','update','delete','manage','export'];
  a text;
begin
  if to_regclass('public.role_permissions') is null then
    raise notice 'role_permissions table not found; frontend base matrix still keeps Client Success admin-only.';
    return;
  end if;

  update public.role_permissions
     set is_allowed = false,
         is_active = false,
         updated_at = now()
   where resource = 'cs_location_completions'
     and lower(trim(coalesce(role_key, ''))) <> 'admin';

  foreach a in array actions loop
    if exists (select 1 from public.role_permissions where lower(trim(coalesce(role_key,''))) = 'admin' and resource = 'cs_location_completions' and action = a) then
      update public.role_permissions
         set is_allowed = true,
             is_active = true,
             allowed_roles = array['admin']::text[],
             updated_at = now()
       where lower(trim(coalesce(role_key,''))) = 'admin'
         and resource = 'cs_location_completions'
         and action = a;
    else
      insert into public.role_permissions (permission_id, role_key, resource, action, is_allowed, is_active, allowed_roles, created_at, updated_at)
      values (gen_random_uuid(), 'admin', 'cs_location_completions', a, true, true, array['admin']::text[], now(), now());
    end if;
  end loop;
end $$;
