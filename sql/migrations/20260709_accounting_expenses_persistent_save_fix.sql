-- InCheck360 Accounting Expenses persistent database save fix.
-- Safe to re-run. Ensures expenses are stored in Supabase, numbered safely, and protected by RLS.

create extension if not exists pgcrypto;

create table if not exists public.accounting_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_no text unique,
  expense_date date not null default current_date,
  vendor_id uuid null,
  vendor_name text null,
  category text null,
  account_id uuid null,
  account_code text null,
  account_name text null,
  expense_account_id uuid null,
  cost_center_id uuid null,
  description text null,
  currency text default 'USD',
  amount numeric not null default 0,
  net_amount numeric not null default 0,
  tax_rate_id uuid null,
  tax_rate numeric default 0,
  tax_amount numeric default 0,
  total_amount numeric not null default 0,
  payment_method text null,
  payment_status text not null default 'draft',
  payment_account_id uuid null,
  reference_no text null,
  source_document_url text null,
  attachment_url text null,
  journal_id uuid null,
  posted_at timestamptz null,
  expense_type text default 'expense',
  status text default 'posted',
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.accounting_expenses add column if not exists expense_no text;
alter table public.accounting_expenses add column if not exists expense_date date not null default current_date;
alter table public.accounting_expenses add column if not exists vendor_id uuid null;
alter table public.accounting_expenses add column if not exists vendor_name text null;
alter table public.accounting_expenses add column if not exists category text null;
alter table public.accounting_expenses add column if not exists account_id uuid null;
alter table public.accounting_expenses add column if not exists account_code text null;
alter table public.accounting_expenses add column if not exists account_name text null;
alter table public.accounting_expenses add column if not exists expense_account_id uuid null;
alter table public.accounting_expenses add column if not exists cost_center_id uuid null;
alter table public.accounting_expenses add column if not exists description text null;
alter table public.accounting_expenses add column if not exists currency text default 'USD';
alter table public.accounting_expenses add column if not exists amount numeric not null default 0;
alter table public.accounting_expenses add column if not exists net_amount numeric not null default 0;
alter table public.accounting_expenses add column if not exists tax_rate_id uuid null;
alter table public.accounting_expenses add column if not exists tax_rate numeric default 0;
alter table public.accounting_expenses add column if not exists tax_amount numeric default 0;
alter table public.accounting_expenses add column if not exists total_amount numeric not null default 0;
alter table public.accounting_expenses add column if not exists payment_method text null;
alter table public.accounting_expenses add column if not exists payment_status text not null default 'draft';
alter table public.accounting_expenses add column if not exists payment_account_id uuid null;
alter table public.accounting_expenses add column if not exists reference_no text null;
alter table public.accounting_expenses add column if not exists source_document_url text null;
alter table public.accounting_expenses add column if not exists attachment_url text null;
alter table public.accounting_expenses add column if not exists journal_id uuid null;
alter table public.accounting_expenses add column if not exists posted_at timestamptz null;
alter table public.accounting_expenses add column if not exists expense_type text default 'expense';
alter table public.accounting_expenses add column if not exists status text default 'posted';
alter table public.accounting_expenses add column if not exists created_by uuid null;
alter table public.accounting_expenses add column if not exists updated_by uuid null;
alter table public.accounting_expenses add column if not exists created_at timestamptz default now();
alter table public.accounting_expenses add column if not exists updated_at timestamptz default now();

update public.accounting_expenses set net_amount = amount where coalesce(net_amount, 0) = 0 and coalesce(amount, 0) <> 0;
update public.accounting_expenses set amount = net_amount where coalesce(amount, 0) = 0 and coalesce(net_amount, 0) <> 0;
update public.accounting_expenses set total_amount = coalesce(net_amount, amount, 0) + coalesce(tax_amount, 0) where coalesce(total_amount, 0) = 0;
update public.accounting_expenses set expense_type = case when coalesce(total_amount, amount, net_amount, 0) < 0 then 'refund_credit' else 'expense' end where expense_type is null;

create or replace function public.generate_accounting_expense_no(target_date date default current_date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yr text := to_char(coalesce(target_date, current_date), 'YYYY');
  seq integer;
begin
  select coalesce(max((regexp_match(expense_no, '^EXP/' || yr || '/([0-9]+)$'))[1]::integer), 0) + 1
    into seq
  from public.accounting_expenses
  where expense_no ~ ('^EXP/' || yr || '/[0-9]+$');

  return 'EXP/' || yr || '/' || lpad(seq::text, 4, '0');
end;
$$;

create or replace function public.accounting_expenses_before_save()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(coalesce(new.expense_no, '')), '') is null then
    loop
      new.expense_no := public.generate_accounting_expense_no(new.expense_date);
      exit when not exists (select 1 from public.accounting_expenses where expense_no = new.expense_no and id <> coalesce(new.id, gen_random_uuid()));
    end loop;
  end if;

  new.net_amount := coalesce(nullif(new.net_amount, 0), new.amount, 0);
  new.amount := coalesce(nullif(new.amount, 0), new.net_amount, 0);
  new.total_amount := coalesce(nullif(new.total_amount, 0), coalesce(new.net_amount, new.amount, 0) + coalesce(new.tax_amount, 0));
  new.expense_type := coalesce(new.expense_type, case when new.total_amount < 0 then 'refund_credit' else 'expense' end);
  new.status := coalesce(new.status, new.payment_status, 'posted');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_accounting_expenses_before_save on public.accounting_expenses;
create trigger trg_accounting_expenses_before_save
before insert or update on public.accounting_expenses
for each row execute function public.accounting_expenses_before_save();

alter table public.accounting_expenses alter column expense_no set not null;
create unique index if not exists accounting_expenses_expense_no_key on public.accounting_expenses(expense_no);
create index if not exists idx_accounting_expenses_date_created on public.accounting_expenses(expense_date desc, created_at desc);
create index if not exists idx_accounting_expenses_vendor_id on public.accounting_expenses(vendor_id);
create index if not exists idx_accounting_expenses_type_status on public.accounting_expenses(expense_type, status);

alter table public.accounting_expenses drop constraint if exists accounting_expenses_net_amount_nonzero_check;
alter table public.accounting_expenses add constraint accounting_expenses_net_amount_nonzero_check check (net_amount <> 0) not valid;
alter table public.accounting_expenses drop constraint if exists accounting_expenses_total_amount_nonzero_check;
alter table public.accounting_expenses add constraint accounting_expenses_total_amount_nonzero_check check (total_amount <> 0) not valid;
alter table public.accounting_expenses drop constraint if exists accounting_expenses_expense_type_check;
alter table public.accounting_expenses add constraint accounting_expenses_expense_type_check check (expense_type in ('expense', 'refund_credit'));

alter table public.accounting_expenses enable row level security;

drop policy if exists accounting_expenses_select_roles on public.accounting_expenses;
drop policy if exists accounting_expenses_write_roles on public.accounting_expenses;

create policy accounting_expenses_select_roles on public.accounting_expenses
for select using (auth.role() = 'authenticated');

create policy accounting_expenses_write_roles on public.accounting_expenses
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Seed role_permissions for role-aware UI/API installations without blocking accountant variants.
do $$
declare
  role_key_value text;
  action_value text;
begin
  if to_regclass('public.role_permissions') is not null then
    foreach role_key_value in array array['admin','accounting','accountant','sfc','senior_financial_controller','senior_finanical_controller','gm','general_manager'] loop
      foreach action_value in array array['view','list','create','update','delete','post','manage','export'] loop
        insert into public.role_permissions (permission_id, role_key, resource, action, is_allowed, is_active, allowed_roles, created_at, updated_at)
        values (gen_random_uuid(), role_key_value, 'accounting_expenses', action_value, true, true, array[role_key_value], now(), now())
        on conflict (role_key, resource, action)
        do update set is_allowed = true, is_active = true, allowed_roles = excluded.allowed_roles, updated_at = now();
      end loop;
    end loop;
  end if;
end $$;
