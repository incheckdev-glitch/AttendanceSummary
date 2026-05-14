-- Invoice-batch scoped Operations Onboarding + Technical Admin fields.
-- Safe to run more than once.
-- Purpose: each Operations/Technical row must represent only the newly invoiced
-- Annual SaaS locations from that invoice batch, not the full agreement total.

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

-- Allow multiple onboarding/technical rows for the same agreement.
-- This is required when agreement locations are invoiced in separate batches.
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

COMMIT;
