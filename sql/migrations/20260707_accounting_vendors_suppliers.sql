-- InCheck360 Accounting - Vendors / Suppliers Master (Admin Only)
-- Adds vendor/supplier creation, vendor bills, vendor payments, payable balances,
-- and ledger posting support for Accounts Payable.
-- Safe to run multiple times after Accounting Phase 1/2/4 migrations.

create extension if not exists pgcrypto;

-- Make sure the required AP/expense accounts exist.
insert into public.accounting_accounts (account_code, account_name, account_type, currency, is_active)
values
  ('2100','Accounts Payable','Liability','USD',true),
  ('5400','General Operating Expense','Expense','USD',true),
  ('1400','VAT Receivable','Asset','USD',true)
on conflict (account_code) do update set
  account_name = excluded.account_name,
  account_type = excluded.account_type,
  currency = excluded.currency,
  is_active = true,
  updated_at = now();

create table if not exists public.accounting_vendors (
  id uuid primary key default gen_random_uuid(),
  vendor_code text not null unique,
  vendor_name text not null,
  vendor_type text not null default 'Supplier',
  email text,
  phone text,
  address text,
  tax_number text,
  payment_terms text,
  currency text not null default 'USD',
  opening_balance numeric(14,2) not null default 0,
  payable_account_id uuid references public.accounting_accounts(id) on delete set null,
  default_expense_account_id uuid references public.accounting_accounts(id) on delete set null,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.accounting_vendors add column if not exists vendor_code text;
alter table public.accounting_vendors add column if not exists vendor_name text;
alter table public.accounting_vendors add column if not exists vendor_type text not null default 'Supplier';
alter table public.accounting_vendors add column if not exists email text;
alter table public.accounting_vendors add column if not exists phone text;
alter table public.accounting_vendors add column if not exists address text;
alter table public.accounting_vendors add column if not exists tax_number text;
alter table public.accounting_vendors add column if not exists payment_terms text;
alter table public.accounting_vendors add column if not exists currency text not null default 'USD';
alter table public.accounting_vendors add column if not exists opening_balance numeric(14,2) not null default 0;
alter table public.accounting_vendors add column if not exists payable_account_id uuid references public.accounting_accounts(id) on delete set null;
alter table public.accounting_vendors add column if not exists default_expense_account_id uuid references public.accounting_accounts(id) on delete set null;
alter table public.accounting_vendors add column if not exists is_active boolean not null default true;
alter table public.accounting_vendors add column if not exists notes text;
alter table public.accounting_vendors add column if not exists created_at timestamptz not null default now();
alter table public.accounting_vendors add column if not exists updated_at timestamptz not null default now();

create table if not exists public.accounting_vendor_bills (
  id uuid primary key default gen_random_uuid(),
  bill_no text not null unique,
  vendor_id uuid not null references public.accounting_vendors(id) on delete restrict,
  bill_date date not null default current_date,
  due_date date,
  reference_no text,
  description text,
  expense_account_id uuid references public.accounting_accounts(id) on delete set null,
  cost_center_id uuid references public.accounting_cost_centers(id) on delete set null,
  amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  currency text not null default 'USD',
  status text not null default 'draft' check (status in ('draft','approved','paid','partially_paid','locked','cancelled')),
  journal_id uuid references public.accounting_journal_entries(id) on delete set null,
  posted_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.accounting_vendor_bills add column if not exists bill_no text;
alter table public.accounting_vendor_bills add column if not exists vendor_id uuid references public.accounting_vendors(id) on delete restrict;
alter table public.accounting_vendor_bills add column if not exists bill_date date not null default current_date;
alter table public.accounting_vendor_bills add column if not exists due_date date;
alter table public.accounting_vendor_bills add column if not exists reference_no text;
alter table public.accounting_vendor_bills add column if not exists description text;
alter table public.accounting_vendor_bills add column if not exists expense_account_id uuid references public.accounting_accounts(id) on delete set null;
alter table public.accounting_vendor_bills add column if not exists cost_center_id uuid references public.accounting_cost_centers(id) on delete set null;
alter table public.accounting_vendor_bills add column if not exists amount numeric(14,2) not null default 0;
alter table public.accounting_vendor_bills add column if not exists tax_amount numeric(14,2) not null default 0;
alter table public.accounting_vendor_bills add column if not exists total_amount numeric(14,2) not null default 0;
alter table public.accounting_vendor_bills add column if not exists currency text not null default 'USD';
alter table public.accounting_vendor_bills add column if not exists status text not null default 'draft';
alter table public.accounting_vendor_bills add column if not exists journal_id uuid references public.accounting_journal_entries(id) on delete set null;
alter table public.accounting_vendor_bills add column if not exists posted_at timestamptz;
alter table public.accounting_vendor_bills add column if not exists created_by text;
alter table public.accounting_vendor_bills add column if not exists created_at timestamptz not null default now();
alter table public.accounting_vendor_bills add column if not exists updated_at timestamptz not null default now();

create table if not exists public.accounting_vendor_payments (
  id uuid primary key default gen_random_uuid(),
  payment_no text not null unique,
  vendor_id uuid not null references public.accounting_vendors(id) on delete restrict,
  vendor_bill_id uuid references public.accounting_vendor_bills(id) on delete set null,
  payment_date date not null default current_date,
  amount numeric(14,2) not null default 0,
  currency text not null default 'USD',
  bank_account_id uuid references public.accounting_bank_accounts(id) on delete set null,
  reference_no text,
  status text not null default 'draft' check (status in ('draft','paid','locked','cancelled')),
  notes text,
  journal_id uuid references public.accounting_journal_entries(id) on delete set null,
  posted_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.accounting_vendor_payments add column if not exists payment_no text;
alter table public.accounting_vendor_payments add column if not exists vendor_id uuid references public.accounting_vendors(id) on delete restrict;
alter table public.accounting_vendor_payments add column if not exists vendor_bill_id uuid references public.accounting_vendor_bills(id) on delete set null;
alter table public.accounting_vendor_payments add column if not exists payment_date date not null default current_date;
alter table public.accounting_vendor_payments add column if not exists amount numeric(14,2) not null default 0;
alter table public.accounting_vendor_payments add column if not exists currency text not null default 'USD';
alter table public.accounting_vendor_payments add column if not exists bank_account_id uuid references public.accounting_bank_accounts(id) on delete set null;
alter table public.accounting_vendor_payments add column if not exists reference_no text;
alter table public.accounting_vendor_payments add column if not exists status text not null default 'draft';
alter table public.accounting_vendor_payments add column if not exists notes text;
alter table public.accounting_vendor_payments add column if not exists journal_id uuid references public.accounting_journal_entries(id) on delete set null;
alter table public.accounting_vendor_payments add column if not exists posted_at timestamptz;
alter table public.accounting_vendor_payments add column if not exists created_by text;
alter table public.accounting_vendor_payments add column if not exists created_at timestamptz not null default now();
alter table public.accounting_vendor_payments add column if not exists updated_at timestamptz not null default now();

-- Link expenses to a vendor master when useful, while keeping old vendor_name intact.
alter table public.accounting_expenses add column if not exists vendor_id uuid references public.accounting_vendors(id) on delete set null;

create index if not exists idx_accounting_vendors_name on public.accounting_vendors(vendor_name);
create index if not exists idx_accounting_vendors_active on public.accounting_vendors(is_active);
create index if not exists idx_accounting_vendor_bills_vendor on public.accounting_vendor_bills(vendor_id);
create index if not exists idx_accounting_vendor_bills_date on public.accounting_vendor_bills(bill_date);
create index if not exists idx_accounting_vendor_bills_due_status on public.accounting_vendor_bills(due_date, status);
create index if not exists idx_accounting_vendor_payments_vendor on public.accounting_vendor_payments(vendor_id);
create index if not exists idx_accounting_vendor_payments_bill on public.accounting_vendor_payments(vendor_bill_id);
create index if not exists idx_accounting_vendor_payments_date on public.accounting_vendor_payments(payment_date);

create or replace view public.v_accounting_vendor_statement as
with bill_rows as (
  select
    b.vendor_id,
    v.vendor_code,
    v.vendor_name,
    b.bill_date as transaction_date,
    b.bill_no as reference,
    'Vendor Bill'::text as transaction_type,
    coalesce(b.description, 'Vendor bill') as description,
    coalesce(b.total_amount, b.amount, 0)::numeric(14,2) as debit_amount,
    0::numeric(14,2) as credit_amount,
    b.currency,
    b.status,
    b.id as source_id,
    'accounting_vendor_bills'::text as source_table,
    b.created_at
  from public.accounting_vendor_bills b
  join public.accounting_vendors v on v.id = b.vendor_id
  where coalesce(b.status, 'draft') <> 'cancelled'
), payment_rows as (
  select
    p.vendor_id,
    v.vendor_code,
    v.vendor_name,
    p.payment_date as transaction_date,
    p.payment_no as reference,
    'Vendor Payment'::text as transaction_type,
    coalesce(p.notes, 'Vendor payment') as description,
    0::numeric(14,2) as debit_amount,
    coalesce(p.amount, 0)::numeric(14,2) as credit_amount,
    p.currency,
    p.status,
    p.id as source_id,
    'accounting_vendor_payments'::text as source_table,
    p.created_at
  from public.accounting_vendor_payments p
  join public.accounting_vendors v on v.id = p.vendor_id
  where coalesce(p.status, 'draft') <> 'cancelled'
)
select * from bill_rows
union all
select * from payment_rows;

-- Basic updated_at helper, safe if not already present.
create or replace function public.accounting_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['accounting_vendors','accounting_vendor_bills','accounting_vendor_payments'] loop
    execute format('drop trigger if exists %I on public.%I', tbl || '_touch_updated_at', tbl);
    execute format('create trigger %I before update on public.%I for each row execute function public.accounting_touch_updated_at()', tbl || '_touch_updated_at', tbl);
  end loop;
end $$;

-- RLS follows existing accounting migrations: frontend permissions keep admin-only.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['accounting_vendors','accounting_vendor_bills','accounting_vendor_payments'] loop
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

-- Admin-only role permissions. Join roles to avoid FK errors.
do $$
declare
  perm record;
begin
  if to_regclass('public.role_permissions') is not null and to_regclass('public.roles') is not null then
    delete from public.role_permissions
    where resource in ('accounting_vendors','accounting_vendor_bills','accounting_vendor_payments','accounting_ap')
      and lower(role_key) <> 'admin';

    for perm in
      select * from (values
        ('accounting_vendors','view'),('accounting_vendors','list'),('accounting_vendors','create'),('accounting_vendors','update'),('accounting_vendors','delete'),('accounting_vendors','manage'),('accounting_vendors','export'),
        ('accounting_vendor_bills','view'),('accounting_vendor_bills','list'),('accounting_vendor_bills','create'),('accounting_vendor_bills','update'),('accounting_vendor_bills','delete'),('accounting_vendor_bills','post'),('accounting_vendor_bills','manage'),('accounting_vendor_bills','export'),
        ('accounting_vendor_payments','view'),('accounting_vendor_payments','list'),('accounting_vendor_payments','create'),('accounting_vendor_payments','update'),('accounting_vendor_payments','delete'),('accounting_vendor_payments','post'),('accounting_vendor_payments','manage'),('accounting_vendor_payments','export'),
        ('accounting_ap','view'),('accounting_ap','list'),('accounting_ap','create'),('accounting_ap','update'),('accounting_ap','post'),('accounting_ap','manage'),('accounting_ap','export')
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
