-- InCheck360 Accounting Phase 1 - Admin Only
-- Adds Chart of Accounts, Bank/Cash Accounts, Manual Journals, and General Ledger tables.

create extension if not exists pgcrypto;

create table if not exists public.accounting_accounts (
  id uuid primary key default gen_random_uuid(),
  account_code text not null unique,
  account_name text not null,
  account_type text not null check (account_type in ('Asset','Liability','Equity','Revenue','Expense')),
  parent_account_id uuid null references public.accounting_accounts(id) on delete set null,
  currency text not null default 'USD',
  opening_balance numeric(14,2) not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  account_name text not null,
  account_type text not null default 'Bank' check (account_type in ('Bank','Cash','Wallet')),
  currency text not null default 'USD',
  account_number text,
  opening_balance numeric(14,2) not null default 0,
  current_balance numeric(14,2) not null default 0,
  linked_account_id uuid null references public.accounting_accounts(id) on delete set null,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_journal_entries (
  id uuid primary key default gen_random_uuid(),
  journal_no text not null unique,
  entry_date date not null default current_date,
  description text not null,
  reference_no text,
  status text not null default 'draft' check (status in ('draft','posted','locked','cancelled')),
  currency text not null default 'USD',
  total_debit numeric(14,2) not null default 0,
  total_credit numeric(14,2) not null default 0,
  created_by text,
  posted_by text,
  posted_at timestamptz,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounting_journal_balanced check (round(total_debit::numeric,2) = round(total_credit::numeric,2))
);

create table if not exists public.accounting_journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.accounting_journal_entries(id) on delete cascade,
  line_no integer not null default 1,
  account_id uuid not null references public.accounting_accounts(id) on delete restrict,
  account_code text,
  account_name text,
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  currency text not null default 'USD',
  description text,
  cost_center text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounting_line_debit_or_credit check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create index if not exists idx_accounting_journal_lines_journal_id on public.accounting_journal_lines(journal_id);
create index if not exists idx_accounting_journal_lines_account_id on public.accounting_journal_lines(account_id);

create table if not exists public.accounting_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid references public.accounting_journal_entries(id) on delete cascade,
  journal_line_id uuid references public.accounting_journal_lines(id) on delete cascade,
  journal_no text,
  entry_date date not null,
  account_id uuid not null references public.accounting_accounts(id) on delete restrict,
  account_code text,
  account_name text,
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  currency text not null default 'USD',
  description text,
  reference_no text,
  source_module text not null default 'manual_journal',
  source_id uuid,
  status text not null default 'posted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounting_ledger_debit_or_credit check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create index if not exists idx_accounting_ledger_account_date on public.accounting_ledger_entries(account_id, entry_date);
create index if not exists idx_accounting_ledger_journal_id on public.accounting_ledger_entries(journal_id);

insert into public.accounting_accounts (account_code, account_name, account_type, currency, is_active)
values
  ('1000','Assets','Asset','USD',true),
  ('1100','Cash on Hand','Asset','USD',true),
  ('1200','Bank Account','Asset','USD',true),
  ('1300','Accounts Receivable','Asset','USD',true),
  ('2000','Liabilities','Liability','USD',true),
  ('2100','Accounts Payable','Liability','USD',true),
  ('2200','Payroll Payable','Liability','USD',true),
  ('3000','Equity','Equity','USD',true),
  ('4000','Revenue','Revenue','USD',true),
  ('4100','SaaS Revenue','Revenue','USD',true),
  ('4200','Setup Fees Revenue','Revenue','USD',true),
  ('5000','Expenses','Expense','USD',true),
  ('5100','Payroll Expense','Expense','USD',true),
  ('5200','Outsourcing / Biners Expense','Expense','USD',true),
  ('5300','Hosting & Software Expense','Expense','USD',true)
on conflict (account_code) do update set
  account_name = excluded.account_name,
  account_type = excluded.account_type,
  currency = excluded.currency,
  is_active = true,
  updated_at = now();

insert into public.accounting_bank_accounts (account_name, account_type, currency, linked_account_id, is_active)
select 'Main Bank USD', 'Bank', 'USD', a.id, true
from public.accounting_accounts a
where a.account_code = '1200'
and not exists (select 1 from public.accounting_bank_accounts b where lower(b.account_name) = lower('Main Bank USD'));

alter table public.accounting_accounts enable row level security;
alter table public.accounting_bank_accounts enable row level security;
alter table public.accounting_journal_entries enable row level security;
alter table public.accounting_journal_lines enable row level security;
alter table public.accounting_ledger_entries enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['accounting_accounts','accounting_bank_accounts','accounting_journal_entries','accounting_journal_lines','accounting_ledger_entries'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_authenticated_select', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_authenticated_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_authenticated_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_authenticated_delete', table_name);
    execute format('create policy %I on public.%I for select using (auth.role() = ''authenticated'')', table_name || '_authenticated_select', table_name);
    execute format('create policy %I on public.%I for insert with check (auth.role() = ''authenticated'')', table_name || '_authenticated_insert', table_name);
    execute format('create policy %I on public.%I for update using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')', table_name || '_authenticated_update', table_name);
    execute format('create policy %I on public.%I for delete using (auth.role() = ''authenticated'')', table_name || '_authenticated_delete', table_name);
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
      'accounting','accounting_accounts','accounting_journals','accounting_ledger','accounting_bank','accounting_reports'
    )
    and lower(role_key) <> 'admin';

    for perm in
      select * from (values
        ('accounting','view'),('accounting','list'),('accounting','get'),('accounting','create'),('accounting','update'),('accounting','delete'),('accounting','manage'),('accounting','export'),
        ('accounting_accounts','view'),('accounting_accounts','list'),('accounting_accounts','create'),('accounting_accounts','update'),('accounting_accounts','delete'),
        ('accounting_journals','view'),('accounting_journals','list'),('accounting_journals','create'),('accounting_journals','update'),('accounting_journals','delete'),('accounting_journals','post'),
        ('accounting_ledger','view'),('accounting_ledger','list'),('accounting_ledger','export'),
        ('accounting_bank','view'),('accounting_bank','list'),('accounting_bank','create'),('accounting_bank','update'),('accounting_bank','delete'),
        ('accounting_reports','view'),('accounting_reports','export')
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
