-- InCheck360 Accounting Phase 2 - Existing Module Sync (Admin Only)
-- Connects existing ERP source records to Accounting Phase 1 ledger:
-- Invoices, Receipts, Credit Notes, Biners payables/payments, HR payroll, and HR salary receipts.

create extension if not exists pgcrypto;

-- Phase 2 accounts used by automatic source sync.
insert into public.accounting_accounts (account_code, account_name, account_type, currency, is_active)
values
  ('2300','VAT Payable','Liability','USD',true),
  ('4900','Credit Notes / Revenue Contra','Revenue','USD',true),
  ('5400','General Operating Expense','Expense','USD',true)
on conflict (account_code) do update set
  account_name = excluded.account_name,
  account_type = excluded.account_type,
  currency = excluded.currency,
  is_active = true,
  updated_at = now();

-- Source tracking columns for auto-generated journals and ledger rows.
alter table public.accounting_journal_entries add column if not exists source_module text;
alter table public.accounting_journal_entries add column if not exists source_id uuid;
alter table public.accounting_journal_entries add column if not exists source_reference text;
alter table public.accounting_journal_entries add column if not exists source_table text;
alter table public.accounting_journal_entries add column if not exists auto_generated boolean not null default false;

alter table public.accounting_ledger_entries add column if not exists source_reference text;
alter table public.accounting_ledger_entries add column if not exists source_table text;
alter table public.accounting_ledger_entries add column if not exists source_label text;
alter table public.accounting_ledger_entries add column if not exists synced_at timestamptz;

create index if not exists idx_accounting_journal_source on public.accounting_journal_entries(source_module, source_reference);
create index if not exists idx_accounting_ledger_source on public.accounting_ledger_entries(source_module, source_reference);
create index if not exists idx_accounting_ledger_source_table on public.accounting_ledger_entries(source_table, source_reference);

-- Optional audit table for future automatic source-posting controls.
create table if not exists public.accounting_source_sync_log (
  id uuid primary key default gen_random_uuid(),
  source_module text not null,
  source_table text,
  source_id uuid,
  source_reference text,
  journal_id uuid references public.accounting_journal_entries(id) on delete set null,
  status text not null default 'posted' check (status in ('posted','skipped','failed','reversed')),
  message text,
  posted_by text,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_accounting_source_sync_log_source on public.accounting_source_sync_log(source_module, source_reference);

alter table public.accounting_source_sync_log enable row level security;

do $$
begin
  drop policy if exists accounting_source_sync_log_authenticated_select on public.accounting_source_sync_log;
  drop policy if exists accounting_source_sync_log_authenticated_insert on public.accounting_source_sync_log;
  drop policy if exists accounting_source_sync_log_authenticated_update on public.accounting_source_sync_log;
  drop policy if exists accounting_source_sync_log_authenticated_delete on public.accounting_source_sync_log;

  create policy accounting_source_sync_log_authenticated_select
    on public.accounting_source_sync_log for select using (auth.role() = 'authenticated');
  create policy accounting_source_sync_log_authenticated_insert
    on public.accounting_source_sync_log for insert with check (auth.role() = 'authenticated');
  create policy accounting_source_sync_log_authenticated_update
    on public.accounting_source_sync_log for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  create policy accounting_source_sync_log_authenticated_delete
    on public.accounting_source_sync_log for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null;
end $$;

-- Admin-only UI permissions. This joins roles to avoid FK errors if a role key does not exist.
do $$
declare
  perm record;
begin
  if to_regclass('public.role_permissions') is not null and to_regclass('public.roles') is not null then
    delete from public.role_permissions
    where resource in (
      'accounting_integrations','accounting_source_sync','accounting_payables','accounting_payroll','accounting_module_sync'
    )
    and lower(role_key) <> 'admin';

    for perm in
      select * from (values
        ('accounting_integrations','view'),('accounting_integrations','list'),('accounting_integrations','create'),('accounting_integrations','update'),('accounting_integrations','manage'),('accounting_integrations','post'),('accounting_integrations','export'),
        ('accounting_source_sync','view'),('accounting_source_sync','list'),('accounting_source_sync','create'),('accounting_source_sync','post'),('accounting_source_sync','manage'),
        ('accounting_payables','view'),('accounting_payables','list'),('accounting_payables','post'),('accounting_payables','manage'),
        ('accounting_payroll','view'),('accounting_payroll','list'),('accounting_payroll','post'),('accounting_payroll','manage'),
        ('accounting_module_sync','view'),('accounting_module_sync','list'),('accounting_module_sync','post'),('accounting_module_sync','manage')
      ) as t(resource, action)
    loop
      insert into public.role_permissions (permission_id, role_key, resource, action, is_allowed, is_active, allowed_roles, created_at, updated_at)
      select gen_random_uuid(), r.role_key, perm.resource, perm.action, true, true, array[r.role_key]::text[], now(), now()
      from public.roles r
      where lower(r.role_key) = 'admin'
      on conflict (role_key, resource, action)
      do update set is_allowed = true, is_active = true, allowed_roles = excluded.allowed_roles, updated_at = now();
    end loop;
  end if;
end $$;
