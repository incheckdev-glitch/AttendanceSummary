-- Client Success 360 v3 — CS client groups / parent account grouping
-- Run after 20260708_client_success_360_admin_only.sql if you already applied the CS module.
-- Scope: lets Admin group multiple signed-agreement client companies under one CS group.
-- Still intentionally excludes invoices, receipts, pending amounts, collections, and payment tables.

create extension if not exists pgcrypto;

create or replace function public.client_success_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (
       select 1
       from public.profiles p
       where p.id = auth.uid()
         and lower(trim(coalesce(to_jsonb(p)->>'role_key', to_jsonb(p)->>'role', ''))) = 'admin'
     );
$$;

grant execute on function public.client_success_is_admin() to authenticated;

create table if not exists public.cs_client_groups (
  id uuid primary key default gen_random_uuid(),
  group_name text not null,
  group_code text,
  owner_user_id uuid,
  owner_name text,
  owner_email text,
  status text not null default 'Active' check (status in ('Active','Watch','At Risk','Archived')),
  description text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(group_name)
);

create index if not exists cs_client_groups_status_idx on public.cs_client_groups(status, group_name);

create table if not exists public.cs_client_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.cs_client_groups(id) on delete cascade,
  company_id uuid not null,
  group_name_snapshot text,
  company_name_snapshot text,
  member_role text,
  notes text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(group_id, company_id)
);

create index if not exists cs_client_group_members_group_idx on public.cs_client_group_members(group_id);
create index if not exists cs_client_group_members_company_idx on public.cs_client_group_members(company_id);

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

drop trigger if exists set_cs_client_groups_updated_at on public.cs_client_groups;
create trigger set_cs_client_groups_updated_at
before update on public.cs_client_groups
for each row execute function public.set_client_success_updated_at();

drop trigger if exists set_cs_client_group_members_updated_at on public.cs_client_group_members;
create trigger set_cs_client_group_members_updated_at
before update on public.cs_client_group_members
for each row execute function public.set_client_success_updated_at();

alter table public.cs_client_groups enable row level security;
alter table public.cs_client_group_members enable row level security;

drop policy if exists cs_client_groups_admin_select on public.cs_client_groups;
drop policy if exists cs_client_groups_admin_all on public.cs_client_groups;
create policy cs_client_groups_admin_select
on public.cs_client_groups
for select to authenticated
using (public.client_success_is_admin());
create policy cs_client_groups_admin_all
on public.cs_client_groups
for all to authenticated
using (public.client_success_is_admin())
with check (public.client_success_is_admin());

drop policy if exists cs_client_group_members_admin_select on public.cs_client_group_members;
drop policy if exists cs_client_group_members_admin_all on public.cs_client_group_members;
create policy cs_client_group_members_admin_select
on public.cs_client_group_members
for select to authenticated
using (public.client_success_is_admin());
create policy cs_client_group_members_admin_all
on public.cs_client_group_members
for all to authenticated
using (public.client_success_is_admin())
with check (public.client_success_is_admin());

grant select, insert, update, delete on public.cs_client_groups to authenticated;
grant select, insert, update, delete on public.cs_client_group_members to authenticated;

-- Runtime permission matrix seed: Admin only for CS groups.
do $$
declare
  resources text[] := array['cs_client_groups','cs_client_group_members'];
  actions text[] := array['view','list','get','create','update','delete','manage','export'];
  r text;
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
   where resource = any(resources)
     and lower(trim(coalesce(role_key, ''))) <> 'admin';

  foreach r in array resources loop
    foreach a in array actions loop
      if exists (select 1 from public.role_permissions where lower(trim(coalesce(role_key,''))) = 'admin' and resource = r and action = a) then
        update public.role_permissions
           set is_allowed = true,
               is_active = true,
               allowed_roles = array['admin']::text[],
               updated_at = now()
         where lower(trim(coalesce(role_key,''))) = 'admin'
           and resource = r
           and action = a;
      else
        insert into public.role_permissions (permission_id, role_key, resource, action, is_allowed, is_active, allowed_roles, created_at, updated_at)
        values (gen_random_uuid(), 'admin', r, a, true, true, array['admin']::text[], now(), now());
      end if;
    end loop;
  end loop;
end $$;
