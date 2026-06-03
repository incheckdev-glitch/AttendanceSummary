-- Operations Onboarding invoice-scoped uniqueness.
-- Safe to run more than once.
-- Business rule: an agreement can have multiple onboarding rows, one per issued invoice.

BEGIN;

ALTER TABLE IF EXISTS public.operations_onboarding
  ADD COLUMN IF NOT EXISTS invoice_id uuid NULL,
  ADD COLUMN IF NOT EXISTS source_invoice_id uuid NULL,
  ADD COLUMN IF NOT EXISTS invoice_number text NULL,
  ADD COLUMN IF NOT EXISTS source_invoice_number text NULL,
  ADD COLUMN IF NOT EXISTS agreement_number text NULL;

-- Remove the old agreement-only unique index/constraint that blocks later invoices
-- for the same agreement.
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

DROP INDEX IF EXISTS public.idx_operations_onboarding_agreement_unique;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT i.relname AS index_name
    FROM pg_class i
    JOIN pg_index ix ON ix.indexrelid = i.oid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'operations_onboarding'
      AND ix.indisunique
      AND (
        SELECT array_agg(a.attname::text ORDER BY u.ord)
        FROM unnest(ix.indkey) WITH ORDINALITY AS u(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = u.attnum
      ) = ARRAY['agreement_id']::text[]
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.index_name);
  END LOOP;
END $$;

-- Prevent duplicate onboarding rows for the same invoice while allowing multiple
-- invoices under one agreement to create separate onboarding rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_operations_onboarding_invoice_unique
  ON public.operations_onboarding (invoice_id)
  WHERE invoice_id IS NOT NULL;

COMMIT;
