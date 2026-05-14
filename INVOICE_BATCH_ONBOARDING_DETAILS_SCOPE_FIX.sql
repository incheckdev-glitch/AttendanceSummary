-- Fix old invoice-created Operations rows so details are invoice-batch scoped only.
-- This does NOT create Technical Admin requests automatically.
-- It also corrects old agreement_items invoice flags from actual invoice_items rows.

BEGIN;

ALTER TABLE public.operations_onboarding
  ADD COLUMN IF NOT EXISTS invoice_id uuid,
  ADD COLUMN IF NOT EXISTS source_invoice_id uuid,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS source_invoice_number text,
  ADD COLUMN IF NOT EXISTS agreement_id uuid,
  ADD COLUMN IF NOT EXISTS agreement_number text,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS invoiced_location_count integer,
  ADD COLUMN IF NOT EXISTS location_count integer,
  ADD COLUMN IF NOT EXISTS locations_count integer,
  ADD COLUMN IF NOT EXISTS number_of_locations integer,
  ADD COLUMN IF NOT EXISTS invoiced_location_names text,
  ADD COLUMN IF NOT EXISTS invoiced_locations text,
  ADD COLUMN IF NOT EXISTS location_names text,
  ADD COLUMN IF NOT EXISTS invoiced_agreement_item_ids text,
  ADD COLUMN IF NOT EXISTS request_status text DEFAULT 'Not Requested',
  ADD COLUMN IF NOT EXISTS technical_request_status text DEFAULT 'Not Requested',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.technical_admin_requests
  ADD COLUMN IF NOT EXISTS invoice_id uuid,
  ADD COLUMN IF NOT EXISTS source_invoice_id uuid,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS source_invoice_number text,
  ADD COLUMN IF NOT EXISTS invoiced_location_count integer,
  ADD COLUMN IF NOT EXISTS location_count integer,
  ADD COLUMN IF NOT EXISTS locations_count integer,
  ADD COLUMN IF NOT EXISTS number_of_locations integer,
  ADD COLUMN IF NOT EXISTS invoiced_location_names text,
  ADD COLUMN IF NOT EXISTS invoiced_locations text,
  ADD COLUMN IF NOT EXISTS location_names text,
  ADD COLUMN IF NOT EXISTS invoiced_agreement_item_ids text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Agreement item flags should reflect only actual invoice_items.source_agreement_item_id rows.
UPDATE public.agreement_items ai
SET
  invoice_status = CASE WHEN x.invoice_id IS NULL THEN 'not_invoiced' ELSE 'invoiced' END,
  invoiced_invoice_id = x.invoice_id,
  invoiced_at = CASE WHEN x.invoice_id IS NULL THEN NULL ELSE COALESCE(ai.invoiced_at, now()) END
FROM (
  SELECT
    ai2.id,
    MIN(ii.invoice_id)::uuid AS invoice_id
  FROM public.agreement_items ai2
  LEFT JOIN public.invoice_items ii
    ON (to_jsonb(ii)->>'source_agreement_item_id') = ai2.id::text
  GROUP BY ai2.id
) x
WHERE ai.id = x.id;

WITH invoice_locations AS (
  SELECT
    i.id::uuid AS invoice_id,
    i.agreement_id::uuid AS agreement_id,
    COALESCE(NULLIF(to_jsonb(i)->>'invoice_number', ''), NULLIF(to_jsonb(i)->>'invoice_reference', ''), i.id::text) AS invoice_number,
    COALESCE(NULLIF(to_jsonb(a)->>'agreement_number', ''), NULLIF(to_jsonb(a)->>'agreement_reference', ''), a.id::text) AS agreement_number,
    COALESCE(NULLIF(to_jsonb(i)->>'customer_legal_name', ''), NULLIF(to_jsonb(i)->>'customer_name', ''), NULLIF(to_jsonb(a)->>'customer_legal_name', ''), NULLIF(to_jsonb(a)->>'customer_name', ''), '') AS client_name,
    COALESCE(
      NULLIF(to_jsonb(ii)->>'location_name', ''),
      NULLIF(to_jsonb(ii)->>'location', ''),
      NULLIF(to_jsonb(ii)->>'site_name', ''),
      NULLIF(to_jsonb(ii)->>'store_name', ''),
      NULLIF(to_jsonb(ii)->>'description', ''),
      'Location'
    ) AS location_name,
    NULLIF(to_jsonb(ii)->>'source_agreement_item_id', '') AS source_agreement_item_id,
    LOWER(COALESCE(NULLIF(to_jsonb(ii)->>'section', ''), NULLIF(to_jsonb(ii)->>'category', ''), NULLIF(to_jsonb(ii)->>'item_category', ''), NULLIF(to_jsonb(ii)->>'type', ''), NULLIF(to_jsonb(ii)->>'description', ''), '')) AS item_text
  FROM public.invoices i
  JOIN public.agreements a ON a.id::text = i.agreement_id::text
  JOIN public.invoice_items ii ON ii.invoice_id::text = i.id::text
  WHERE i.agreement_id IS NOT NULL
), batches AS (
  SELECT
    invoice_id,
    agreement_id,
    invoice_number,
    agreement_number,
    client_name,
    COUNT(DISTINCT location_name)::integer AS location_count,
    STRING_AGG(DISTINCT location_name, ', ' ORDER BY location_name) AS location_names,
    STRING_AGG(DISTINCT source_agreement_item_id, ', ' ORDER BY source_agreement_item_id) FILTER (WHERE source_agreement_item_id IS NOT NULL AND source_agreement_item_id <> '') AS source_item_ids
  FROM invoice_locations
  WHERE item_text NOT LIKE '%one%time%'
    AND item_text NOT LIKE '%one-time%'
    AND item_text NOT LIKE '%setup fee%'
    AND item_text NOT LIKE '%implementation fee%'
    AND item_text NOT LIKE '%installation fee%'
  GROUP BY invoice_id, agreement_id, invoice_number, agreement_number, client_name
)
UPDATE public.operations_onboarding o
SET
  invoice_id = b.invoice_id,
  source_invoice_id = COALESCE(o.source_invoice_id, b.invoice_id),
  invoice_number = COALESCE(NULLIF(o.invoice_number, ''), b.invoice_number),
  source_invoice_number = COALESCE(NULLIF(o.source_invoice_number, ''), b.invoice_number),
  agreement_id = COALESCE(o.agreement_id, b.agreement_id),
  agreement_number = COALESCE(NULLIF(o.agreement_number, ''), b.agreement_number),
  client_name = COALESCE(NULLIF(o.client_name, ''), b.client_name),
  invoiced_location_count = b.location_count,
  location_count = b.location_count,
  locations_count = b.location_count,
  number_of_locations = b.location_count,
  invoiced_location_names = b.location_names,
  invoiced_locations = b.location_names,
  location_names = b.location_names,
  invoiced_agreement_item_ids = COALESCE(NULLIF(o.invoiced_agreement_item_ids, ''), b.source_item_ids),
  request_status = COALESCE(NULLIF(o.request_status, ''), 'Not Requested'),
  technical_request_status = COALESCE(NULLIF(o.technical_request_status, ''), 'Not Requested'),
  updated_at = now()
FROM batches b
WHERE COALESCE(o.invoice_id::text, o.source_invoice_id::text, '') = b.invoice_id::text;

COMMIT;
