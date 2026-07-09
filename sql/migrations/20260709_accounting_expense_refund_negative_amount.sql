-- InCheck360 Accounting - Expense Refund / Credit negative amounts
-- Allows expense refunds and credits to be stored as signed negative expenses.

do $$
begin
  if to_regclass('public.accounting_expenses') is not null then
    alter table public.accounting_expenses
      add column if not exists expense_type text not null default 'expense';

    update public.accounting_expenses
    set expense_type = 'expense'
    where expense_type is null;
  end if;
end $$;

do $$
declare
  con record;
begin
  if to_regclass('public.accounting_expenses') is null then
    return;
  end if;

  -- Drop positive-only CHECK constraints on expense amount columns. Constraint names
  -- vary across deployments, so inspect each CHECK expression safely.
  for con in
    select c.conname, pg_get_constraintdef(c.oid) as definition
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'accounting_expenses'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ~* '\m(amount|net_amount|total_amount|gross_amount)\M'
      and pg_get_constraintdef(c.oid) ~ '(>\s*0|>=\s*0)'
  loop
    execute format('alter table public.accounting_expenses drop constraint if exists %I', con.conname);
  end loop;
end $$;

do $$
begin
  if to_regclass('public.accounting_expenses') is null then
    return;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.accounting_expenses'::regclass
      and conname = 'accounting_expenses_expense_type_check'
  ) then
    alter table public.accounting_expenses
      add constraint accounting_expenses_expense_type_check
      check (expense_type in ('expense', 'refund_credit'));
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'accounting_expenses' and column_name = 'amount')
     and not exists (select 1 from pg_constraint where conrelid = 'public.accounting_expenses'::regclass and conname = 'accounting_expenses_amount_nonzero_check') then
    alter table public.accounting_expenses
      add constraint accounting_expenses_amount_nonzero_check check (amount <> 0) not valid;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'accounting_expenses' and column_name = 'net_amount')
     and not exists (select 1 from pg_constraint where conrelid = 'public.accounting_expenses'::regclass and conname = 'accounting_expenses_net_amount_nonzero_check') then
    alter table public.accounting_expenses
      add constraint accounting_expenses_net_amount_nonzero_check check (net_amount <> 0) not valid;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'accounting_expenses' and column_name = 'total_amount')
     and not exists (select 1 from pg_constraint where conrelid = 'public.accounting_expenses'::regclass and conname = 'accounting_expenses_total_amount_nonzero_check') then
    alter table public.accounting_expenses
      add constraint accounting_expenses_total_amount_nonzero_check check (total_amount <> 0) not valid;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'accounting_expenses' and column_name = 'gross_amount')
     and not exists (select 1 from pg_constraint where conrelid = 'public.accounting_expenses'::regclass and conname = 'accounting_expenses_gross_amount_nonzero_check') then
    alter table public.accounting_expenses
      add constraint accounting_expenses_gross_amount_nonzero_check check (gross_amount <> 0) not valid;
  end if;
end $$;

create index if not exists idx_accounting_expenses_expense_type
  on public.accounting_expenses(expense_type);
