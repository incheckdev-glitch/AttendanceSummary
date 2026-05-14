BEGIN;

ALTER TABLE public.operations_onboarding
  ADD COLUMN IF NOT EXISTS invoiced_location_names text,
  ADD COLUMN IF NOT EXISTS invoiced_locations text,
  ADD COLUMN IF NOT EXISTS location_names text,
  ADD COLUMN IF NOT EXISTS invoiced_location_count integer,
  ADD COLUMN IF NOT EXISTS location_count integer,
  ADD COLUMN IF NOT EXISTS number_of_locations integer,
  ADD COLUMN IF NOT EXISTS request_status text DEFAULT 'Not Requested',
  ADD COLUMN IF NOT EXISTS technical_request_status text DEFAULT 'Not Requested';

WITH invoice_location_rows AS (
  SELECT
    ii.invoice_id::text AS invoice_id,
    COALESCE(
      NULLIF(to_jsonb(ii)->>'source_agreement_item_id', ''),
      NULLIF(to_jsonb(ii)->>'agreement_item_id', ''),
      NULLIF(to_jsonb(ii)->>'agreement_item_uuid', ''),
      NULLIF(to_jsonb(ii)->>'source_item_id', ''),
      NULLIF(to_jsonb(ii)->>'source_agreement_item_id', ''),
      NULLIF(to_jsonb(ii)->>'location_name', ''),
      NULLIF(to_jsonb(ii)->>'location', ''),
      NULLIF(to_jsonb(ii)->>'site_name', ''),
      NULLIF(to_jsonb(ii)->>'store_name', ''),
      NULLIF(to_jsonb(ii)->>'branch_name', ''),
      NULLIF(to_jsonb(ii)->>'description', ''),
      ii.id::text
    ) AS location_key,
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
      NULLIF(to_jsonb(ii)->>'section', ''),
      NULLIF(to_jsonb(ii)->>'item_section', ''),
      NULLIF(to_jsonb(ii)->>'category', ''),
      NULLIF(to_jsonb(ii)->>'item_category', ''),
      NULLIF(to_jsonb(ii)->>'type', ''),
      NULLIF(to_jsonb(ii)->>'item_type', ''),
      NULLIF(to_jsonb(ii)->>'item_name', ''),
      NULLIF(to_jsonb(ii)->>'name', ''),
      NULLIF(to_jsonb(ii)->>'description', ''),
      ''
    )) AS item_text
  FROM public.invoice_items ii
  WHERE ii.invoice_id IS NOT NULL
),
invoice_batches AS (
  SELECT
    invoice_id,
    COUNT(DISTINCT location_key)::integer AS location_count,
    STRING_AGG(DISTINCT location_name, ', ' ORDER BY location_name) AS location_names
  FROM invoice_location_rows
  WHERE (
      item_text IN ('annual_saas', 'annual saas', 'saas_annual', 'saas annual', 'subscription', 'subscriptions')
      OR (item_text LIKE '%saas%' AND item_text LIKE '%annual%')
    )
    AND item_text NOT LIKE '%one%time%'
    AND item_text NOT LIKE '%one-time%'
    AND item_text NOT LIKE '%setup fee%'
    AND item_text NOT LIKE '%implementation fee%'
    AND item_text NOT LIKE '%installation fee%'
  GROUP BY invoice_id
)
UPDATE public.operations_onboarding o
SET
  invoiced_location_count = b.location_count,
  location_count = b.location_count,
  number_of_locations = b.location_count,
  invoiced_location_names = b.location_names,
  invoiced_locations = b.location_names,
  location_names = b.location_names,
  request_status = COALESCE(NULLIF(o.request_status, ''), 'Not Requested'),
  technical_request_status = COALESCE(NULLIF(o.technical_request_status, ''), 'Not Requested')
FROM invoice_batches b
WHERE COALESCE(to_jsonb(o)->>'invoice_id', to_jsonb(o)->>'source_invoice_id', '') = b.invoice_id;

COMMIT;

SELECT
  invoice_number,
  agreement_number,
  client_name,
  invoiced_location_count,
  invoiced_location_names,
  invoiced_locations,
  location_names,
  request_status,
  technical_request_status
FROM public.operations_onboarding
ORDER BY created_at DESC NULLS LAST;
