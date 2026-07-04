-- InCheck360 Accounting Phase 4 - Advanced Controls (Admin Only)
-- Adds deferred revenue schedules, monthly SaaS revenue recognition, expense management,
-- tax/VAT settings, cost centers, closing periods, bank reconciliation, and audit log.
-- Safe to re-run after Accounting Phase 1 and Phase 2 migrations.

create extension if not exists pgcrypto;

-- Advanced accounting accounts.
insert into public.accounting_accounts (account_code, account_name, account_type, currency, is_active)
values
  ('1400','VAT Receivable','Asset','USD',true),
  ('2400','Deferred Revenue','Liability','USD',true),
  ('5500','Other Operating Expense','Expense','USD',true),
  ('5600','Bank Charges / Finance Fees','Expense','USD',true)
on conflict (account_code) do update set
  account_name = excluded.account_name,
  account_type = excluded.account_type,
  currency = excluded.currency,
  is_active = true,
  updated_at = now();

-- Optional advanced columns on existing accounting tables.
alter table public.accounting_journal_entries add column if not exists cost_center_id uuid;
alter table public.accounting_journal_entries add column if not exists source_reference text;
alter table public.accounting_journal_entries add column if not exists source_table text;
alter table public.accounting_journal_entries add column if not exists auto_generated boolean not null default false;

alter table public.accounting_journal_lines add column if not exists cost_center_id uuid;
alter table public.accounting_ledger_entries add column if not exists cost_center_id uuid;
alter table public.accounting_ledger_entries add column if not exists source_reference text;
alter table public.accounting_ledger_entries add column if not exists source_table text;
alter table public.accounting_ledger_entries add column if not exists source_label text;
alter table public.accounting_ledger_entries add column if not exists synced_at timestamptz;

create table if not exists public.accounting_tax_rates (
  id uuid primary key default gen_random_uuid(),
  tax_name text not null,
  tax_rate numeric(10,4) not null default 0,
  tax_type text not null default 'both' check (tax_type in ('sales','purchase','both')),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tax_name)
);

insert into public.accounting_tax_rates (tax_name, tax_rate, tax_type, is_active)
values ('VAT 0%', 0, 'both', true)
on conflict (tax_name) do update set tax_rate = excluded.tax_rate, tax_type = excluded.tax_type, is_active = true, updated_at = now();

create table if not exists public.accounting_cost_centers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  manager_name text,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_no text not null unique,
  expense_date date not null default current_date,
  vendor_name text not null,
  category text,
  description text,
  expense_account_id uuid references public.accounting_accounts(id) on delete set null,
  cost_center_id uuid references public.accounting_cost_centers(id) on delete set null,
  amount numeric(14,2) not null default 0,
  tax_rate_id uuid references public.accounting_tax_rates(id) on delete set null,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  currency text not null default 'USD',
  payment_status text not null default 'draft' check (payment_status in ('draft','approved','paid','locked','cancelled')),
  payment_account_id uuid references public.accounting_bank_accounts(id) on delete set null,
  source_document_url text,
  journal_id uuid references public.accounting_journal_entries(id) on delete set null,
  posted_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_accounting_expenses_date on public.accounting_expenses(expense_date);
create index if not exists idx_accounting_expenses_status on public.accounting_expenses(payment_status);
create index if not exists idx_accounting_expenses_vendor on public.accounting_expenses(vendor_name);

create table if not exists public.accounting_revenue_schedules (
  id uuid primary key default gen_random_uuid(),
  source_invoice_ref text not null,
  source_invoice_id uuid,
  customer_name text,
  recognition_date date not null,
  service_start_date date,
  service_end_date date,
  amount numeric(14,2) not null default 0,
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending','recognized','cancelled')),
  journal_id uuid references public.accounting_journal_entries(id) on delete set null,
  recognized_at timestamptz,
  recognized_by text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_invoice_ref, recognition_date)
);

create index if not exists idx_accounting_revenue_schedules_ref on public.accounting_revenue_schedules(source_invoice_ref);
create index if not exists idx_accounting_revenue_schedules_date_status on public.accounting_revenue_schedules(recognition_date, status);

create table if not exists public.accounting_closing_periods (
  id uuid primary key default gen_random_uuid(),
  period_key text not null unique,
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open','closed','locked')),
  closed_by text,
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid,
  statement_date date not null,
  statement_balance numeric(14,2) not null default 0,
  erp_balance numeric(14,2) not null default 0,
  difference numeric(14,2) not null default 0,
  status text not null default 'saved' check (status in ('matched','difference','saved','cancelled')),
  reconciled_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_accounting_bank_reconciliations_date on public.accounting_bank_reconciliations(statement_date);

create table if not exists public.accounting_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text,
  entity_id text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_accounting_audit_log_created_at on public.accounting_audit_log(created_at desc);
create index if not exists idx_accounting_audit_log_entity on public.accounting_audit_log(entity_type, entity_id);

-- RLS for new tables; app remains UI admin-only, policies allow authenticated session like the rest of the ERP.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'accounting_tax_rates',
    'accounting_cost_centers',
    'accounting_expenses',
    'accounting_revenue_schedules',
    'accounting_closing_periods',
    'accounting_bank_reconciliations',
    'accounting_audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_authenticated_select', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_authenticated_insert', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_authenticated_update', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_authenticated_delete', tbl);
    execute format('create policy %I on public.%I for select using (auth.role() = ''authenticated'')', tbl || '_authenticated_select', tbl);
    execute format('create policy %I on public.%I for insert with check (auth.role() = ''authenticated'')', tbl || '_authenticated_insert', tbl);
    execute format('create policy %I on public.%I for update using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')', tbl || '_authenticated_update', tbl);
    execute format('create policy %I on public.%I for delete using (auth.role() = ''authenticated'')', tbl || '_authenticated_delete', tbl);
  end loop;
end $$;

-- Admin-only UI permissions. This joins roles to avoid FK errors if a role key does not exist.
do $$
declare
  perm record;
begin
  if to_regclass('public.role_permissions') is not null and to_regclass('public.roles') is not null then
    delete from public.role_permissions
    where resource in (
      'accounting_advanced','accounting_deferred_revenue','accounting_expenses','accounting_tax','accounting_cost_centers','accounting_closing_periods','accounting_reconciliation','accounting_audit_log'
    )
    and lower(role_key) <> 'admin';

    for perm in
      select * from (values
        ('accounting_advanced','view'),('accounting_advanced','list'),('accounting_advanced','create'),('accounting_advanced','update'),('accounting_advanced','delete'),('accounting_advanced','manage'),('accounting_advanced','export'),('accounting_advanced','post'),
        ('accounting_deferred_revenue','view'),('accounting_deferred_revenue','list'),('accounting_deferred_revenue','create'),('accounting_deferred_revenue','update'),('accounting_deferred_revenue','post'),('accounting_deferred_revenue','manage'),('accounting_deferred_revenue','export'),
        ('accounting_expenses','view'),('accounting_expenses','list'),('accounting_expenses','create'),('accounting_expenses','update'),('accounting_expenses','delete'),('accounting_expenses','post'),('accounting_expenses','manage'),('accounting_expenses','export'),
        ('accounting_tax','view'),('accounting_tax','list'),('accounting_tax','create'),('accounting_tax','update'),('accounting_tax','manage'),
        ('accounting_cost_centers','view'),('accounting_cost_centers','list'),('accounting_cost_centers','create'),('accounting_cost_centers','update'),('accounting_cost_centers','manage'),
        ('accounting_closing_periods','view'),('accounting_closing_periods','list'),('accounting_closing_periods','create'),('accounting_closing_periods','update'),('accounting_closing_periods','manage'),
        ('accounting_reconciliation','view'),('accounting_reconciliation','list'),('accounting_reconciliation','create'),('accounting_reconciliation','update'),('accounting_reconciliation','manage'),
        ('accounting_audit_log','view'),('accounting_audit_log','list'),('accounting_audit_log','export')
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
