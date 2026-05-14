-- Manual Technical Admin request only fix.
-- Safe to run more than once.
-- Purpose:
-- 1) Agreement signed still creates nothing in Operations.
-- 2) Invoice creates Operations Onboarding only.
-- 3) Technical Admin request is created only when user manually clicks Technical Admin Request on an Operations row.

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

-- Drop old agreement-signing trigger paths that may auto-create Operations or Technical rows.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tg.tgname, cls.relname
    FROM pg_trigger tg
    JOIN pg_class cls ON cls.oid = tg.tgrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND cls.relname = 'agreements'
      AND NOT tg.tgisinternal
      AND (
        lower(tg.tgname) LIKE '%operation%'
        OR lower(tg.tgname) LIKE '%onboarding%'
        OR lower(tg.tgname) LIKE '%technical%'
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.tgname, r.relname);
  END LOOP;
END $$;

-- Allow multiple invoice-batch Operations rows for the same agreement.
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

-- Allow one Technical request per Operations row instead of one per agreement.
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

-- Rows created by invoice should remain Operations-only until manually requested.
UPDATE public.operations_onboarding
SET
  request_status = COALESCE(NULLIF(request_status, ''), 'Not Requested'),
  technical_request_status = CASE
    WHEN COALESCE(NULLIF(technical_request_status, ''), '') = '' THEN 'Not Requested'
    ELSE technical_request_status
  END,
  updated_at = COALESCE(updated_at, now())
WHERE (source_invoice_id IS NOT NULL OR NULLIF(source_invoice_number, '') IS NOT NULL OR NULLIF(invoice_number, '') IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1
    FROM public.technical_admin_requests t
    WHERE t.onboarding_id IS NOT NULL
      AND t.onboarding_id::text = operations_onboarding.id::text
  );

COMMIT;
