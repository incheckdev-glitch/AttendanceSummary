-- CS360 V18: restore ZL Defence for the exact Zahrat Lebnan branch client.
--
-- A previous CS360-only rename incorrectly converted ZL Defence to
-- LR Motor City. This migration changes only CS360 snapshot rows belonging
-- to the exact legal client below. Invoices, agreements and other modules
-- are not modified.

begin;

do $$
declare
  v_company_id public.companies.id%type;
  v_table record;
  v_rows integer := 0;
begin
  select c.id
    into v_company_id
  from public.companies c
  where lower(
          btrim(
            regexp_replace(
              coalesce(c.company_name, ''),
              '[^a-zA-Z0-9]+',
              ' ',
              'g'
            )
          )
        ) = 'zahrat lebnan cafeteria restaurant sole proprietorship l l c branch'
  limit 1;

  if v_company_id is null then
    raise exception
      'CS360 V18 safety stop: Zahrat Lebnan branch company was not found.';
  end if;

  -- Update every CS360-owned table that stores both company_id and location_name.
  for v_table in
    select location_column.table_name
    from information_schema.columns location_column
    join information_schema.columns company_column
      on company_column.table_schema = location_column.table_schema
     and company_column.table_name = location_column.table_name
     and company_column.column_name = 'company_id'
    where location_column.table_schema = 'public'
      and location_column.column_name = 'location_name'
      and location_column.table_name like 'cs\_%' escape '\'
    group by location_column.table_name
  loop
    execute format(
      'update public.%I
          set location_name = $1
        where company_id::text = $2
          and lower(btrim(coalesce(location_name, ''''))) in ($3, $4)',
      v_table.table_name
    )
    using 'ZL Defence', v_company_id::text, 'zl defence', 'lr motor city';

    get diagnostics v_rows = row_count;
    raise notice 'Updated % row(s) in public.%', v_rows, v_table.table_name;
  end loop;
end
$$;

notify pgrst, 'reload schema';
commit;

-- Verification: all matching CS360 rows for this client should now show ZL Defence.
select
  c.company_name,
  completion.location_name,
  count(*) as rows_found
from public.cs_location_completions completion
join public.companies c
  on c.id::text = completion.company_id::text
where lower(
        btrim(
          regexp_replace(
            coalesce(c.company_name, ''),
            '[^a-zA-Z0-9]+',
            ' ',
            'g'
          )
        )
      ) = 'zahrat lebnan cafeteria restaurant sole proprietorship l l c branch'
group by c.company_name, completion.location_name
order by completion.location_name;
