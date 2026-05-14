-- Strict invoice-only Operations Onboarding + Technical Admin fix.
-- Safe to run more than once.
-- Business rule:
--   1) Signing an agreement must NOT create Operations Onboarding.
--   2) Operations Onboarding is created only when an invoice is created from selected Annual SaaS agreement-location rows.
--   3) Technical Admin requests must be tied to the invoice-scoped Operations row.
--   4) Partial invoices create partial Operations/Technical rows only for the newly invoiced locations.

BEGIN;

ALTER TABLE IF EXISTS public.operations_onboarding
  ADD COLUMN IF NOT EXISTS source_invoice_id uuid NULL,
  ADD COLUMN IF NOT EXISTS source_invoice_number text NULL,
  ADD COLUMN IF NOT EXISTS invoice_number text NULL,
  ADD COLUMN IF NOT EXISTS invoiced_location_names text NULL,
  ADD COLUMN IF NOT EXISTS invoiced_agreement_item_ids text NULL,
  ADD COLUMN IF NOT EXISTS request_message text NULL,
  ADD COLUMN IF NOT EXISTS request_details text NULL,
  ADD COLUMN IF NOT EXISTS location_count integer NULL,
  ADD COLUMN IF NOT EXISTS number_of_locations integer NULL;

ALTER TABLE IF EXISTS public.technical_admin_requests
  ADD COLUMN IF NOT EXISTS source_invoice_id uuid NULL,
  ADD COLUMN IF NOT EXISTS source_invoice_number text NULL,
  ADD COLUMN IF NOT EXISTS invoice_number text NULL,
  ADD COLUMN IF NOT EXISTS invoiced_location_names text NULL,
  ADD COLUMN IF NOT EXISTS invoiced_agreement_item_ids text NULL,
  ADD COLUMN IF NOT EXISTS request_message text NULL,
  ADD COLUMN IF NOT EXISTS request_details text NULL,
  ADD COLUMN IF NOT EXISTS location_count integer NULL,
  ADD COLUMN IF NOT EXISTS number_of_locations integer NULL;

-- Allow multiple onboarding/technical rows for the same agreement because each invoice batch can create its own row.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'operations_onboarding'
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname::text ORDER BY u.ord)
        FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
      ) = ARRAY['agreement_id']::text[]
  LOOP
    EXECUTE format('ALTER TABLE public.operations_onboarding DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'technical_admin_requests'
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname::text ORDER BY u.ord)
        FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
      ) = ARRAY['agreement_id']::text[]
  LOOP
    EXECUTE format('ALTER TABLE public.technical_admin_requests DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- Prevent duplicate Operations rows for the same invoice batch while still allowing multiple invoices per agreement.
CREATE UNIQUE INDEX IF NOT EXISTS operations_onboarding_source_invoice_unique_idx
  ON public.operations_onboarding (source_invoice_id)
  WHERE source_invoice_id IS NOT NULL;

-- Prevent duplicate Technical Admin rows for the same invoice batch while still allowing multiple invoices per agreement.
CREATE UNIQUE INDEX IF NOT EXISTS technical_admin_requests_source_invoice_unique_idx
  ON public.technical_admin_requests (source_invoice_id)
  WHERE source_invoice_id IS NOT NULL;

-- Drop old database triggers that create Operations/Technical rows directly from agreement signing.
-- This targets only triggers on public.agreements whose function body references Operations/Technical tables.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tg.tgname AS trigger_name
    FROM pg_trigger tg
    JOIN pg_class tbl ON tbl.oid = tg.tgrelid
    JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
    JOIN pg_proc fn ON fn.oid = tg.tgfoid
    JOIN pg_namespace fns ON fns.oid = fn.pronamespace
    WHERE ns.nspname = 'public'
      AND tbl.relname = 'agreements'
      AND NOT tg.tgisinternal
      AND (
        lower(coalesce(pg_get_functiondef(fn.oid), '')) LIKE '%operations_onboarding%'
        OR lower(coalesce(pg_get_functiondef(fn.oid), '')) LIKE '%technical_admin_requests%'
        OR lower(fn.proname) LIKE '%operation%onboard%'
        OR lower(fn.proname) LIKE '%technical%admin%'
      )
  LOOP
    RAISE NOTICE 'Dropping old agreement trigger that bypasses invoice scope: %', r.trigger_name;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.agreements', r.trigger_name);
  END LOOP;
END $$;

-- Optional manual cleanup after review only:
-- Delete old legacy rows that were created from agreement signing without invoice scope.
-- Uncomment only if you want to remove already-created wrong rows from the UI/database.
-- DELETE FROM public.technical_admin_requests
-- WHERE source_invoice_id IS NULL
--   AND coalesce(invoiced_location_names, '') = ''
--   AND coalesce(invoiced_agreement_item_ids, '') = ''
--   AND agreement_id IS NOT NULL;
--
-- DELETE FROM public.operations_onboarding
-- WHERE source_invoice_id IS NULL
--   AND coalesce(invoiced_location_names, '') = ''
--   AND coalesce(invoiced_agreement_item_ids, '') = ''
--   AND agreement_id IS NOT NULL;

COMMIT;
