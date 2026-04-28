do $$
declare
  table_name text;
  target_tables text[] := array[
    'leads',
    'deals',
    'proposals',
    'agreements',
    'invoices',
    'receipts',
    'clients',
    'operations_onboarding',
    'technical_admin_requests'
  ];
begin
  foreach table_name in array target_tables loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and columns.table_name = table_name
        and column_name = 'created_at'
    ) then
      execute format('alter table public.%I alter column created_at set default now();', table_name);
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and columns.table_name = table_name
        and column_name = 'updated_at'
    ) then
      execute format('alter table public.%I alter column updated_at set default now();', table_name);
    end if;
  end loop;
end
$$;

notify pgrst, 'reload schema';
