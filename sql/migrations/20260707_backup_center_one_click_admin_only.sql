-- InCheck360 Backup Center - admin-only support tables
-- Safe/idempotent migration. This stores backup logs/settings only.
-- It does NOT store database passwords, service keys, or backup file contents.

create extension if not exists pgcrypto;

create table if not exists public.backup_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value text null,
  notes text null,
  updated_by uuid null,
  updated_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.backup_logs (
  id uuid primary key default gen_random_uuid(),
  backup_type text not null default 'full',
  backup_scope text null,
  status text not null default 'success',
  backup_date date not null default current_date,
  started_at timestamptz null,
  finished_at timestamptz null,
  file_name text null,
  file_path text null,
  storage_location text null,
  file_size_mb numeric(14,2) null default 0,
  checksum text null,
  notes text null,
  created_by uuid null,
  created_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint backup_logs_backup_type_check check (backup_type in ('full','database','storage')),
  constraint backup_logs_status_check check (status in ('success','failed','running','partial'))
);

alter table public.backup_settings add column if not exists setting_key text;
alter table public.backup_settings add column if not exists setting_value text;
alter table public.backup_settings add column if not exists notes text;
alter table public.backup_settings add column if not exists updated_by uuid;
alter table public.backup_settings add column if not exists updated_by_name text;
alter table public.backup_settings add column if not exists created_at timestamptz not null default now();
alter table public.backup_settings add column if not exists updated_at timestamptz not null default now();

alter table public.backup_logs add column if not exists backup_type text not null default 'full';
alter table public.backup_logs add column if not exists backup_scope text;
alter table public.backup_logs add column if not exists status text not null default 'success';
alter table public.backup_logs add column if not exists backup_date date not null default current_date;
alter table public.backup_logs add column if not exists started_at timestamptz;
alter table public.backup_logs add column if not exists finished_at timestamptz;
alter table public.backup_logs add column if not exists file_name text;
alter table public.backup_logs add column if not exists file_path text;
alter table public.backup_logs add column if not exists storage_location text;
alter table public.backup_logs add column if not exists file_size_mb numeric(14,2) default 0;
alter table public.backup_logs add column if not exists checksum text;
alter table public.backup_logs add column if not exists notes text;
alter table public.backup_logs add column if not exists created_by uuid;
alter table public.backup_logs add column if not exists created_by_name text;
alter table public.backup_logs add column if not exists created_at timestamptz not null default now();
alter table public.backup_logs add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_backup_logs_date on public.backup_logs (backup_date desc);
create index if not exists idx_backup_logs_type on public.backup_logs (backup_type);
create index if not exists idx_backup_logs_status on public.backup_logs (status);
create index if not exists idx_backup_logs_created_at on public.backup_logs (created_at desc);

create or replace function public.set_backup_center_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_backup_settings_updated_at on public.backup_settings;
create trigger trg_backup_settings_updated_at
before update on public.backup_settings
for each row execute function public.set_backup_center_updated_at();

drop trigger if exists trg_backup_logs_updated_at on public.backup_logs;
create trigger trg_backup_logs_updated_at
before update on public.backup_logs
for each row execute function public.set_backup_center_updated_at();

insert into public.backup_settings (setting_key, setting_value, notes)
values
  ('preferred_destination', 'Google Drive / External Drive', 'Where admin stores backup ZIP files outside Supabase.'),
  ('bucket_method', 'rclone / S3 protocol', 'Recommended method for backing up Supabase Storage buckets.'),
  ('retention_daily', '7', 'Number of daily backups to keep.'),
  ('retention_weekly', '4', 'Number of weekly backups to keep.'),
  ('retention_monthly', '12', 'Number of monthly archive backups to keep.'),
  ('project_ref', '', 'Optional Supabase project ref for generating local backup commands.')
on conflict (setting_key)
do nothing;

-- Admin-only role_permissions rows. Insert only if both tables and admin role exist.
do $$
declare
  item record;
begin
  if to_regclass('public.role_permissions') is null then
    return;
  end if;

  if to_regclass('public.roles') is not null and not exists (select 1 from public.roles where role_key = 'admin') then
    return;
  end if;

  for item in
    select * from (values
      ('backup_center','view'),
      ('backup_center','list'),
      ('backup_center','create'),
      ('backup_center','update'),
      ('backup_center','delete'),
      ('backup_center','export'),
      ('backup_center','print'),
      ('backup_center','settings'),
      ('backup_center','manage')
    ) as p(resource, action)
  loop
    update public.role_permissions
       set is_allowed = true,
           is_active = true,
           allowed_roles = array['admin']::text[],
           updated_at = now()
     where role_key = 'admin'
       and resource = item.resource
       and action = item.action;

    if not found then
      insert into public.role_permissions
        (permission_id, role_key, resource, action, is_allowed, is_active, allowed_roles, created_at, updated_at)
      values
        (gen_random_uuid(), 'admin', item.resource, item.action, true, true, array['admin']::text[], now(), now());
    end if;
  end loop;
end $$;

comment on table public.backup_settings is 'Admin-only Backup Center settings. No secrets/passwords should be stored here.';
comment on table public.backup_logs is 'Admin-only manual backup log history for database and Supabase Storage bucket backups.';

-- One-click backup support RPC.
-- Used by Vercel serverless endpoint api/backup/download.js with SUPABASE_SERVICE_ROLE_KEY.
-- It exports public schema table DATA as JSON. It is not a pg_dump replacement for roles/schema/RLS/functions.
create or replace function public.backup_center_export_public_data(
  p_include_tables text[] default null,
  p_exclude_tables text[] default array['spatial_ref_sys']::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  t record;
  rows_json jsonb;
  result_tables jsonb := '{}'::jsonb;
  row_count bigint;
  table_counts jsonb := '{}'::jsonb;
begin
  for t in
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    order by table_name
  loop
    if p_include_tables is not null and not (t.table_name = any(p_include_tables)) then
      continue;
    end if;

    if p_exclude_tables is not null and t.table_name = any(p_exclude_tables) then
      continue;
    end if;

    begin
      execute format('select coalesce(jsonb_agg(to_jsonb(src)), ''[]''::jsonb), count(*) from (select * from public.%I) src', t.table_name)
      into rows_json, row_count;

      result_tables := result_tables || jsonb_build_object(t.table_name, coalesce(rows_json, '[]'::jsonb));
      table_counts := table_counts || jsonb_build_object(t.table_name, coalesce(row_count, 0));
    exception when others then
      result_tables := result_tables || jsonb_build_object(t.table_name, jsonb_build_object('error', sqlerrm));
      table_counts := table_counts || jsonb_build_object(t.table_name, null);
    end;
  end loop;

  return jsonb_build_object(
    'generated_at', now(),
    'schema', 'public',
    'format', 'jsonb_table_export',
    'warning', 'This is an application data export for one-click ERP download. Use Supabase CLI pg_dump for full schema/roles/RLS/function disaster recovery backups.',
    'table_counts', table_counts,
    'tables', result_tables
  );
end;
$$;

revoke all on function public.backup_center_export_public_data(text[], text[]) from public;
revoke all on function public.backup_center_export_public_data(text[], text[]) from anon;
revoke all on function public.backup_center_export_public_data(text[], text[]) from authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.backup_center_export_public_data(text[], text[]) to service_role;
  end if;
end $$;

comment on function public.backup_center_export_public_data(text[], text[]) is 'Admin Backup Center one-click export RPC. Intended for service-role backend only. Returns public table data as JSON; not a pg_dump replacement.';
