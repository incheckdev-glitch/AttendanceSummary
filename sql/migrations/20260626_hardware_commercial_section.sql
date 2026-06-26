-- Adds support for the Hardware commercial section in Proposal Catalog,
-- Proposal Items, and Agreement Items.
--
-- The frontend saves Hardware rows with section = 'hardware'. This migration
-- removes older CHECK constraints that only allowed annual_saas/one_time_fee,
-- so existing environments do not reject Hardware catalog/items.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN (
        'public.proposal_catalog_items'::regclass,
        'public.proposal_items'::regclass,
        'public.agreement_items'::regclass
      )
      AND pg_get_constraintdef(oid) ILIKE '%section%'
      AND pg_get_constraintdef(oid) ILIKE '%annual_saas%'
      AND pg_get_constraintdef(oid) ILIKE '%one_time_fee%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.table_name, r.conname);
  END LOOP;
END $$;

-- Optional validation queries after running the migration:
-- select section, count(*) from public.proposal_catalog_items group by section order by section;
-- select section, count(*) from public.proposal_items group by section order by section;
-- select section, count(*) from public.agreement_items group by section order by section;
