BEGIN;

-- Fix the FK issue: invoice/company IDs must not block Operations Onboarding.
-- New code no longer sends client_id for invoice-batch onboarding. This cleans any old invalid values.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'operations_onboarding' AND column_name = 'client_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'clients'
  ) THEN
    BEGIN
      EXECUTE $q$
        UPDATE public.operations_onboarding o
        SET client_id = NULL
        WHERE o.client_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id::text = o.client_id::text
          )
      $q$;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not null invalid operations_onboarding.client_id values: %', SQLERRM;
    END;
  END IF;
END $$;

ALTER TABLE public.agreements
  ADD COLUMN IF NOT EXISTS payment_term text;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_term text;

ALTER TABLE public.operations_onboarding
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS agreement_number text,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS signed_date date,
  ADD COLUMN IF NOT EXISTS invoiced_location_count integer,
  ADD COLUMN IF NOT EXISTS number_of_locations integer,
  ADD COLUMN IF NOT EXISTS location_count integer,
  ADD COLUMN IF NOT EXISTS invoiced_locations text,
  ADD COLUMN IF NOT EXISTS location_names text,
  ADD COLUMN IF NOT EXISTS service_start_date text,
  ADD COLUMN IF NOT EXISTS service_end_date text,
  ADD COLUMN IF NOT EXISTS billing_frequency text,
  ADD COLUMN IF NOT EXISTS payment_term text,
  ADD COLUMN IF NOT EXISTS request_status text DEFAULT 'Not Requested',
  ADD COLUMN IF NOT EXISTS technical_request_status text DEFAULT 'Not Requested',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'Not Started',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Add invoice/agreement UUID columns only when missing. If they already exist as text, this will not change them.
ALTER TABLE public.operations_onboarding
  ADD COLUMN IF NOT EXISTS invoice_id uuid,
  ADD COLUMN IF NOT EXISTS agreement_id uuid;

ALTER TABLE public.technical_admin_requests
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS agreement_number text,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS invoiced_location_count integer,
  ADD COLUMN IF NOT EXISTS number_of_locations integer,
  ADD COLUMN IF NOT EXISTS location_count integer,
  ADD COLUMN IF NOT EXISTS invoiced_locations text,
  ADD COLUMN IF NOT EXISTS location_names text,
  ADD COLUMN IF NOT EXISTS service_start_date text,
  ADD COLUMN IF NOT EXISTS service_end_date text,
  ADD COLUMN IF NOT EXISTS billing_frequency text,
  ADD COLUMN IF NOT EXISTS payment_term text;

ALTER TABLE public.technical_admin_requests
  ADD COLUMN IF NOT EXISTS invoice_id uuid,
  ADD COLUMN IF NOT EXISTS agreement_id uuid;

-- Agreement payment term -> Invoice payment term for old invoices.
UPDATE public.invoices i
SET payment_term = COALESCE(NULLIF(to_jsonb(a)->>'payment_term', ''), i.payment_term)
FROM public.agreements a
WHERE i.agreement_id::text = a.id::text
  AND COALESCE(NULLIF(i.payment_term, ''), '') = ''
  AND COALESCE(NULLIF(to_jsonb(a)->>'payment_term', ''), '') <> '';

DO $$
DECLARE
  cols text;
  vals text;
BEGIN
  SELECT
    string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position),
    string_agg(format('r.%I', c.column_name), ', ' ORDER BY c.ordinal_position)
  INTO cols, vals
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'operations_onboarding'
    AND c.column_name = ANY(ARRAY[
      'invoice_id',
      'invoice_number',
      'agreement_id',
      'agreement_number',
      'client_name',
      'signed_date',
      'invoiced_location_count',
      'number_of_locations',
      'location_count',
      'invoiced_locations',
      'location_names',
      'service_start_date',
      'service_end_date',
      'billing_frequency',
      'payment_term',
      'request_status',
      'technical_request_status',
      'status',
      'created_at',
      'updated_at'
    ]);

  IF cols IS NULL THEN
    RAISE EXCEPTION 'No insertable operations_onboarding columns found.';
  END IF;

  EXECUTE format($sql$
    WITH invoice_location_rows AS (
      SELECT
        i.id::text AS invoice_id,
        COALESCE(
          NULLIF(to_jsonb(i)->>'invoice_number', ''),
          NULLIF(to_jsonb(i)->>'invoice_reference', ''),
          NULLIF(to_jsonb(i)->>'reference', ''),
          i.id::text
        ) AS invoice_number,
        i.agreement_id::text AS agreement_id,
        COALESCE(
          NULLIF(to_jsonb(a)->>'agreement_number', ''),
          NULLIF(to_jsonb(a)->>'agreement_reference', ''),
          NULLIF(to_jsonb(a)->>'reference_number', ''),
          NULLIF(to_jsonb(a)->>'reference', ''),
          a.id::text
        ) AS agreement_number,
        COALESCE(
          NULLIF(to_jsonb(i)->>'client_name', ''),
          NULLIF(to_jsonb(i)->>'customer_legal_name', ''),
          NULLIF(to_jsonb(i)->>'customer_name', ''),
          NULLIF(to_jsonb(i)->>'legal_company_name', ''),
          NULLIF(to_jsonb(i)->>'company_name', ''),
          NULLIF(to_jsonb(a)->>'client_name', ''),
          NULLIF(to_jsonb(a)->>'customer_legal_name', ''),
          NULLIF(to_jsonb(a)->>'customer_name', ''),
          NULLIF(to_jsonb(a)->>'legal_company_name', ''),
          NULLIF(to_jsonb(a)->>'company_name', ''),
          ''
        ) AS client_name,
        COALESCE(
          NULLIF(to_jsonb(a)->>'customer_sign_date', ''),
          NULLIF(to_jsonb(a)->>'customer_official_sign_date', ''),
          NULLIF(to_jsonb(a)->>'provider_official_signatory_2_sign_date', ''),
          NULLIF(to_jsonb(a)->>'signed_date', ''),
          NULLIF(to_jsonb(a)->>'updated_at', ''),
          ''
        ) AS signed_date_raw,
        COALESCE(
          NULLIF(to_jsonb(i)->>'service_start_date', ''),
          NULLIF(to_jsonb(a)->>'service_start_date', ''),
          ''
        ) AS service_start_date_raw,
        COALESCE(
          NULLIF(to_jsonb(i)->>'service_end_date', ''),
          NULLIF(to_jsonb(a)->>'service_end_date', ''),
          ''
        ) AS service_end_date_raw,
        COALESCE(
          NULLIF(to_jsonb(i)->>'billing_frequency', ''),
          NULLIF(to_jsonb(i)->>'frequency', ''),
          NULLIF(to_jsonb(a)->>'billing_frequency', ''),
          NULLIF(to_jsonb(a)->>'frequency', ''),
          ''
        ) AS billing_frequency,
        COALESCE(
          NULLIF(to_jsonb(i)->>'payment_term', ''),
          NULLIF(to_jsonb(a)->>'payment_term', ''),
          ''
        ) AS payment_term,
        COALESCE(
          NULLIF(to_jsonb(ii)->>'location_name', ''),
          NULLIF(to_jsonb(ii)->>'location', ''),
          NULLIF(to_jsonb(ii)->>'site_name', ''),
          NULLIF(to_jsonb(ii)->>'store_name', ''),
          NULLIF(to_jsonb(ii)->>'branch_name', ''),
          NULLIF(to_jsonb(ii)->>'description', ''),
          'Location'
        ) AS location_name,
        LOWER(COALESCE(
          NULLIF(to_jsonb(ii)->>'category', ''),
          NULLIF(to_jsonb(ii)->>'item_category', ''),
          NULLIF(to_jsonb(ii)->>'type', ''),
          NULLIF(to_jsonb(ii)->>'item_type', ''),
          NULLIF(to_jsonb(ii)->>'description', ''),
          NULLIF(to_jsonb(ii)->>'name', ''),
          ''
        )) AS item_text
      FROM public.invoices i
      JOIN public.agreements a
        ON a.id::text = i.agreement_id::text
      JOIN public.invoice_items ii
        ON ii.invoice_id::text = i.id::text
      WHERE i.agreement_id IS NOT NULL
    ),
    invoice_batches AS (
      SELECT
        invoice_id,
        invoice_number,
        agreement_id,
        agreement_number,
        client_name,
        signed_date_raw,
        service_start_date_raw,
        service_end_date_raw,
        billing_frequency,
        payment_term,
        COUNT(DISTINCT location_name)::integer AS location_count,
        STRING_AGG(DISTINCT location_name, ', ' ORDER BY location_name) AS location_names
      FROM invoice_location_rows
      WHERE item_text NOT LIKE '%%one%%time%%'
        AND item_text NOT LIKE '%%one-time%%'
        AND item_text NOT LIKE '%%setup fee%%'
        AND item_text NOT LIKE '%%implementation fee%%'
        AND item_text NOT LIKE '%%installation fee%%'
      GROUP BY
        invoice_id,
        invoice_number,
        agreement_id,
        agreement_number,
        client_name,
        signed_date_raw,
        service_start_date_raw,
        service_end_date_raw,
        billing_frequency,
        payment_term
    )
    INSERT INTO public.operations_onboarding (%s)
    SELECT %s
    FROM invoice_batches b
    CROSS JOIN LATERAL jsonb_populate_record(
      NULL::public.operations_onboarding,
      jsonb_build_object(
        'invoice_id', b.invoice_id,
        'invoice_number', b.invoice_number,
        'agreement_id', b.agreement_id,
        'agreement_number', b.agreement_number,
        'client_name', b.client_name,
        'signed_date', CASE WHEN b.signed_date_raw ~ '^\d{4}-\d{2}-\d{2}' THEN LEFT(b.signed_date_raw, 10) ELSE NULL END,
        'invoiced_location_count', b.location_count,
        'number_of_locations', b.location_count,
        'location_count', b.location_count,
        'invoiced_locations', b.location_names,
        'location_names', b.location_names,
        'service_start_date', CASE WHEN b.service_start_date_raw ~ '^\d{4}-\d{2}-\d{2}' THEN LEFT(b.service_start_date_raw, 10) ELSE NULLIF(b.service_start_date_raw, '') END,
        'service_end_date', CASE WHEN b.service_end_date_raw ~ '^\d{4}-\d{2}-\d{2}' THEN LEFT(b.service_end_date_raw, 10) ELSE NULLIF(b.service_end_date_raw, '') END,
        'billing_frequency', b.billing_frequency,
        'payment_term', b.payment_term,
        'request_status', 'Not Requested',
        'technical_request_status', 'Not Requested',
        'status', 'Not Started',
        'created_at', now(),
        'updated_at', now()
      )
    ) AS r
    WHERE b.location_count > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.operations_onboarding o
        WHERE COALESCE(o.invoice_id::text, '') = b.invoice_id
      );
  $sql$, cols, vals);
END $$;

COMMIT;

-- Check result after running:
-- SELECT invoice_number, agreement_number, client_name, invoiced_location_count, location_names, request_status, technical_request_status, status, created_at
-- FROM public.operations_onboarding
-- ORDER BY created_at DESC NULLS LAST;
