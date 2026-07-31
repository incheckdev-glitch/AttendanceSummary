-- Allow fractional License / Month values such as 0.25, 0.50, and 0.75.
-- Apply once in Supabase SQL Editor.

begin;

-- Convert the commercial item quantity fields to decimal where those tables/columns exist.
do $$
declare
  target record;
begin
  for target in
    select * from (values
      ('proposal_items', 'quantity'),
      ('proposal_items', 'months'),
      ('proposal_items', 'license_months'),
      ('proposal_items', 'duration_months'),
      ('agreement_items', 'quantity'),
      ('agreement_items', 'months'),
      ('agreement_items', 'license_months'),
      ('agreement_items', 'duration_months'),
      ('invoice_items', 'quantity'),
      ('invoice_items', 'months'),
      ('invoice_items', 'license_months'),
      ('invoice_items', 'duration_months'),
      ('receipt_items', 'quantity'),
      ('receipt_items', 'months'),
      ('receipt_items', 'license_months'),
      ('receipt_items', 'duration_months')
    ) as x(table_name, column_name)
  loop
    if exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = target.table_name
        and c.column_name = target.column_name
    ) then
      execute format(
        'alter table public.%I alter column %I type numeric(12,4) using %I::numeric',
        target.table_name,
        target.column_name,
        target.column_name
      );
    end if;
  end loop;
end $$;

-- Remove only CHECK constraints on commercial item tables that reject values below 1.
-- Positive-value validation remains enforced by the application (minimum 0.01).
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      con.conname as constraint_name,
      pg_get_constraintdef(con.oid) as definition
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('proposal_items', 'agreement_items', 'invoice_items', 'receipt_items')
      and con.contype = 'c'
      and lower(pg_get_constraintdef(con.oid)) ~ '(quantity|license_months|duration_months|months)'
      and pg_get_constraintdef(con.oid) ~ '(>= 1|> 0\\))'
  loop
    execute format(
      'alter table %I.%I drop constraint %I',
      constraint_row.schema_name,
      constraint_row.table_name,
      constraint_row.constraint_name
    );
  end loop;
end $$;

commit;
