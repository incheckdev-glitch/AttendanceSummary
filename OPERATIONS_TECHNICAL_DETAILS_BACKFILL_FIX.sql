-- Operations / Technical details backfill fix.
-- Safe to run more than once.
-- Purpose:
-- 1) Keep Agreement Signed -> no Operations row.
-- 2) Keep Invoice -> Operations row only.
-- 3) Keep Technical Admin -> manual request only from the clicked Operations row.
-- 4) Add any missing display columns and backfill blank Operations/Technical rows from invoice/agreement data.

BEGIN;

ALTER TABLE IF EXISTS public.operations_onboarding
  ADD COLUMN IF NOT EXISTS agreement_number text NULL,
  ADD COLUMN IF NOT EXISTS client_name text NULL,
  ADD COLUMN IF NOT EXISTS agreement_status text NULL,
  ADD COLUMN IF NOT EXISTS signed_date date NULL,
  ADD COLUMN IF NOT EXISTS source_invoice_id uuid NULL,
  ADD COLUMN IF NOT EXISTS invoice_id uuid NULL,
  ADD COLUMN IF NOT EXISTS source_invoice_number text NULL,
  ADD COLUMN IF NOT EXISTS invoice_number text NULL,
  ADD COLUMN IF NOT EXISTS invoiced_location_names text NULL,
  ADD COLUMN IF NOT EXISTS invoiced_agreement_item_ids text NULL,
  ADD COLUMN IF NOT EXISTS request_message text NULL,
  ADD COLUMN IF NOT EXISTS request_details text NULL,
  ADD COLUMN IF NOT EXISTS request_status text NULL,
  ADD COLUMN IF NOT EXISTS technical_request_status text NULL,
  ADD COLUMN IF NOT EXISTS technical_request_type text NULL,
  ADD COLUMN IF NOT EXISTS technical_request_details text NULL,
  ADD COLUMN IF NOT EXISTS location_count integer NULL,
  ADD COLUMN IF NOT EXISTS number_of_locations integer NULL,
  ADD COLUMN IF NOT EXISTS service_start_date date NULL,
  ADD COLUMN IF NOT EXISTS service_end_date date NULL,
  ADD COLUMN IF NOT EXISTS billing_frequency text NULL,
  ADD COLUMN IF NOT EXISTS payment_term text NULL;

ALTER TABLE IF EXISTS public.technical_admin_requests
  ADD COLUMN IF NOT EXISTS agreement_number text NULL,
  ADD COLUMN IF NOT EXISTS client_name text NULL,
  ADD COLUMN IF NOT EXISTS source_invoice_id uuid NULL,
  ADD COLUMN IF NOT EXISTS invoice_id uuid NULL,
  ADD COLUMN IF NOT EXISTS source_invoice_number text NULL,
  ADD COLUMN IF NOT EXISTS invoice_number text NULL,
  ADD COLUMN IF NOT EXISTS invoiced_location_names text NULL,
  ADD COLUMN IF NOT EXISTS invoiced_agreement_item_ids text NULL,
  ADD COLUMN IF NOT EXISTS request_message text NULL,
  ADD COLUMN IF NOT EXISTS request_details text NULL,
  ADD COLUMN IF NOT EXISTS request_status text NULL,
  ADD COLUMN IF NOT EXISTS technical_request_status text NULL,
  ADD COLUMN IF NOT EXISTS technical_request_type text NULL,
  ADD COLUMN IF NOT EXISTS technical_request_details text NULL,
  ADD COLUMN IF NOT EXISTS location_count integer NULL,
  ADD COLUMN IF NOT EXISTS number_of_locations integer NULL,
  ADD COLUMN IF NOT EXISTS service_start_date date NULL,
  ADD COLUMN IF NOT EXISTS service_end_date date NULL,
  ADD COLUMN IF NOT EXISTS billing_frequency text NULL,
  ADD COLUMN IF NOT EXISTS payment_term text NULL;

-- Drop old agreement-signing trigger paths that may still create onboarding directly on agreement signature.
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

-- Preserve multiple invoice batches for the same agreement.
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

-- Backfill Operations display fields from invoices when the row is invoice-scoped.
UPDATE public.operations_onboarding o
SET
  agreement_number = COALESCE(NULLIF(o.agreement_number, ''), NULLIF(i.agreement_number, ''), NULLIF(i.agreement_id::text, '')),
  client_name = COALESCE(NULLIF(o.client_name, ''), NULLIF(i.customer_legal_name, ''), NULLIF(i.customer_name, '')),
  billing_frequency = COALESCE(NULLIF(o.billing_frequency, ''), NULLIF(i.billing_frequency, '')),
  payment_term = COALESCE(NULLIF(o.payment_term, ''), NULLIF(i.payment_term, '')),
  source_invoice_number = COALESCE(NULLIF(o.source_invoice_number, ''), NULLIF(i.invoice_number, ''), NULLIF(i.invoice_id, '')),
  invoice_number = COALESCE(NULLIF(o.invoice_number, ''), NULLIF(i.invoice_number, ''), NULLIF(i.invoice_id, '')),
  updated_at = COALESCE(o.updated_at, now())
FROM public.invoices i
WHERE
  (o.source_invoice_id IS NOT NULL AND o.source_invoice_id::text = i.id::text)
  OR (o.invoice_id IS NOT NULL AND o.invoice_id::text = i.id::text)
  OR (NULLIF(o.source_invoice_number, '') IS NOT NULL AND NULLIF(i.invoice_number, '') IS NOT NULL AND o.source_invoice_number = i.invoice_number)
  OR (NULLIF(o.invoice_number, '') IS NOT NULL AND NULLIF(i.invoice_number, '') IS NOT NULL AND o.invoice_number = i.invoice_number);

-- Backfill Operations display fields from agreements where linked by UUID or agreement number.
UPDATE public.operations_onboarding o
SET
  agreement_number = COALESCE(NULLIF(o.agreement_number, ''), NULLIF(a.agreement_number, ''), NULLIF(a.agreement_id, '')),
  client_name = COALESCE(NULLIF(o.client_name, ''), NULLIF(a.customer_legal_name, ''), NULLIF(a.customer_name, '')),
  agreement_status = COALESCE(NULLIF(o.agreement_status, ''), NULLIF(a.status, '')),
  signed_date = COALESCE(o.signed_date, a.customer_sign_date, a.customer_official_sign_date),
  service_start_date = COALESCE(o.service_start_date, a.service_start_date),
  service_end_date = COALESCE(o.service_end_date, a.service_end_date),
  billing_frequency = COALESCE(NULLIF(o.billing_frequency, ''), NULLIF(a.billing_frequency, '')),
  payment_term = COALESCE(NULLIF(o.payment_term, ''), NULLIF(a.payment_term, '')),
  updated_at = COALESCE(o.updated_at, now())
FROM public.agreements a
WHERE
  (o.agreement_id IS NOT NULL AND o.agreement_id::text = a.id::text)
  OR (NULLIF(o.agreement_number, '') IS NOT NULL AND (o.agreement_number = a.agreement_number OR o.agreement_number = a.agreement_id));

-- If the UI has location names but no count, calculate the count from only that invoice batch.
UPDATE public.operations_onboarding o
SET
  location_count = COALESCE(NULLIF(o.location_count, 0), array_length(regexp_split_to_array(o.invoiced_location_names, '\s*[,;|\n]+\s*'), 1)),
  number_of_locations = COALESCE(NULLIF(o.number_of_locations, 0), array_length(regexp_split_to_array(o.invoiced_location_names, '\s*[,;|\n]+\s*'), 1))
WHERE NULLIF(o.invoiced_location_names, '') IS NOT NULL
  AND (COALESCE(o.location_count, 0) = 0 OR COALESCE(o.number_of_locations, 0) = 0);

-- Operations rows created from invoices stay Operations-only until manually requested.
UPDATE public.operations_onboarding o
SET
  request_status = COALESCE(NULLIF(o.request_status, ''), 'Not Requested'),
  technical_request_status = COALESCE(NULLIF(o.technical_request_status, ''), 'Not Requested')
WHERE (o.source_invoice_id IS NOT NULL OR NULLIF(o.source_invoice_number, '') IS NOT NULL OR NULLIF(o.invoice_number, '') IS NOT NULL);

-- Backfill Technical requests from their linked Operations row.
UPDATE public.technical_admin_requests t
SET
  agreement_number = COALESCE(NULLIF(t.agreement_number, ''), NULLIF(o.agreement_number, '')),
  client_name = COALESCE(NULLIF(t.client_name, ''), NULLIF(o.client_name, '')),
  source_invoice_id = COALESCE(t.source_invoice_id, o.source_invoice_id),
  invoice_id = COALESCE(t.invoice_id, o.invoice_id),
  source_invoice_number = COALESCE(NULLIF(t.source_invoice_number, ''), NULLIF(o.source_invoice_number, '')),
  invoice_number = COALESCE(NULLIF(t.invoice_number, ''), NULLIF(o.invoice_number, '')),
  invoiced_location_names = COALESCE(NULLIF(t.invoiced_location_names, ''), NULLIF(o.invoiced_location_names, '')),
  invoiced_agreement_item_ids = COALESCE(NULLIF(t.invoiced_agreement_item_ids, ''), NULLIF(o.invoiced_agreement_item_ids, '')),
  location_count = COALESCE(NULLIF(t.location_count, 0), NULLIF(o.location_count, 0), NULLIF(o.number_of_locations, 0)),
  number_of_locations = COALESCE(NULLIF(t.number_of_locations, 0), NULLIF(o.number_of_locations, 0), NULLIF(o.location_count, 0)),
  service_start_date = COALESCE(t.service_start_date, o.service_start_date),
  service_end_date = COALESCE(t.service_end_date, o.service_end_date),
  billing_frequency = COALESCE(NULLIF(t.billing_frequency, ''), NULLIF(o.billing_frequency, '')),
  payment_term = COALESCE(NULLIF(t.payment_term, ''), NULLIF(o.payment_term, '')),
  request_status = COALESCE(NULLIF(t.request_status, ''), 'Requested'),
  technical_request_status = COALESCE(NULLIF(t.technical_request_status, ''), COALESCE(NULLIF(t.request_status, ''), 'Requested'))
FROM public.operations_onboarding o
WHERE t.onboarding_id IS NOT NULL
  AND (t.onboarding_id::text = o.id::text OR t.onboarding_id::text = o.onboarding_id::text);

COMMIT;
