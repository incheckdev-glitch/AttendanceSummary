-- CS360 LOCATION DISPLAY NAMES + BRAND MANAGEMENT SUPPORT
-- Run once in Supabase SQL Editor, then deploy the updated client-success.js/index.html.
--
-- Renames persisted Customer Success 360 location snapshots only:
--   Lr muroo    -> LR Muroor
--   LR Defence  -> LR Motor City
--   ZL khalidya -> ZL al Forsan Cloud Kitchen
--
-- Source CRM, invoice, agreement, accounting, and client-module records are not changed.
-- Special-client brand assignment/unassignment uses the existing brand_id column;
-- no additional schema column is required.

begin;

-- Avoid unique-key conflicts when an old and corrected brand assignment both exist.
do $$
declare
  v_old text;
  v_new text;
begin
  if to_regclass('public.cs_client_brand_locations') is not null then
    for v_old, v_new in
      select * from (values
        ('lr muroo', 'LR Muroor'),
        ('lr defence', 'LR Motor City'),
        ('zl khalidya', 'ZL al Forsan Cloud Kitchen')
      ) as names(old_name, new_name)
    loop
      delete from public.cs_client_brand_locations old_row
      using public.cs_client_brand_locations new_row
      where old_row.id <> new_row.id
        and lower(btrim(coalesce(old_row.location_name, ''))) = v_old
        and lower(btrim(coalesce(new_row.location_name, ''))) = lower(v_new)
        and old_row.brand_id is not distinct from new_row.brand_id
        and old_row.company_id is not distinct from new_row.company_id;

      update public.cs_client_brand_locations
      set location_name = v_new,
          updated_at = now()
      where lower(btrim(coalesce(location_name, ''))) = v_old;
    end loop;
  end if;
end
$$;

-- Avoid completion-period unique conflicts before renaming saved completion rows.
do $$
declare
  v_old text;
  v_new text;
begin
  if to_regclass('public.cs_location_completions') is not null then
    for v_old, v_new in
      select * from (values
        ('lr muroo', 'LR Muroor'),
        ('lr defence', 'LR Motor City'),
        ('zl khalidya', 'ZL al Forsan Cloud Kitchen')
      ) as names(old_name, new_name)
    loop
      delete from public.cs_location_completions old_row
      using public.cs_location_completions new_row
      where old_row.id <> new_row.id
        and lower(btrim(coalesce(old_row.location_name, ''))) = v_old
        and lower(btrim(coalesce(new_row.location_name, ''))) = lower(v_new)
        and old_row.company_id is not distinct from new_row.company_id
        and old_row.review_type is not distinct from new_row.review_type
        and old_row.period_start is not distinct from new_row.period_start
        and old_row.period_end is not distinct from new_row.period_end;

      update public.cs_location_completions
      set location_name = v_new,
          updated_at = now()
      where lower(btrim(coalesce(location_name, ''))) = v_old;
    end loop;
  end if;
end
$$;

-- Rename standalone Special CS Client locations when the corrected name is not
-- already present for the same special client. The frontend display override
-- still handles any pre-existing duplicate edge case safely.
do $$
declare
  v_old text;
  v_new text;
begin
  if to_regclass('public.cs_special_client_locations') is not null then
    for v_old, v_new in
      select * from (values
        ('lr muroo', 'LR Muroor'),
        ('lr defence', 'LR Motor City'),
        ('zl khalidya', 'ZL al Forsan Cloud Kitchen')
      ) as names(old_name, new_name)
    loop
      update public.cs_special_client_locations old_row
      set location_name = v_new,
          updated_at = now()
      where lower(btrim(coalesce(old_row.location_name, ''))) = v_old
        and not exists (
          select 1
          from public.cs_special_client_locations corrected
          where corrected.special_client_id = old_row.special_client_id
            and corrected.id <> old_row.id
            and lower(btrim(coalesce(corrected.location_name, ''))) = lower(v_new)
        );
    end loop;
  end if;
end
$$;

-- Update any other CS360-owned table that has a location_name column.
do $$
declare
  v_table record;
  v_old text;
  v_new text;
begin
  for v_table in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'location_name'
      and c.table_name like 'cs\_%' escape '\'
      and c.table_name not in (
        'cs_client_brand_locations',
        'cs_location_completions',
        'cs_special_client_locations'
      )
  loop
    for v_old, v_new in
      select * from (values
        ('lr muroo', 'LR Muroor'),
        ('lr defence', 'LR Motor City'),
        ('zl khalidya', 'ZL al Forsan Cloud Kitchen')
      ) as names(old_name, new_name)
    loop
      execute format(
        'update public.%I set location_name = $1 where lower(btrim(coalesce(location_name, ''''))) = $2',
        v_table.table_name
      ) using v_new, v_old;
    end loop;
  end loop;
end
$$;

notify pgrst, 'reload schema';

commit;

-- Verification: corrected names saved in CS360-owned tables.
select 'cs_location_completions' as source_table, location_name, count(*) as rows_found
from public.cs_location_completions
where lower(btrim(location_name)) in ('lr muroor', 'lr motor city', 'zl al forsan cloud kitchen')
group by location_name
union all
select 'cs_client_brand_locations', location_name, count(*)
from public.cs_client_brand_locations
where lower(btrim(location_name)) in ('lr muroor', 'lr motor city', 'zl al forsan cloud kitchen')
group by location_name
union all
select 'cs_special_client_locations', location_name, count(*)
from public.cs_special_client_locations
where lower(btrim(location_name)) in ('lr muroor', 'lr motor city', 'zl al forsan cloud kitchen')
group by location_name
order by source_table, location_name;
