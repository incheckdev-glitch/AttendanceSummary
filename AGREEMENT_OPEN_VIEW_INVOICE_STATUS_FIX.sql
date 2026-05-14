BEGIN;

-- Optional cleanup for old/wrong agreement item invoice flags.
-- It makes the Agreement Open/View screen match real invoice_items.
-- It does NOT touch Operations Onboarding or Technical Admin.

WITH actual_invoiced_items AS (
  SELECT
    ii.source_agreement_item_id::text AS agreement_item_id,
    MIN(ii.invoice_id::text) AS invoice_id
  FROM public.invoice_items ii
  WHERE COALESCE(ii.source_agreement_item_id::text, '') <> ''
  GROUP BY ii.source_agreement_item_id::text
)
UPDATE public.agreement_items ai
SET
  invoice_status = 'invoiced',
  invoiced_invoice_id = actual.invoice_id::uuid,
  invoiced_at = COALESCE(ai.invoiced_at, now())
FROM actual_invoiced_items actual
WHERE ai.id::text = actual.agreement_item_id
  AND LOWER(COALESCE(ai.section::text, '')) = 'annual_saas';

UPDATE public.agreement_items ai
SET
  invoice_status = 'not_invoiced',
  invoiced_invoice_id = NULL,
  invoiced_at = NULL
WHERE LOWER(COALESCE(ai.section::text, '')) = 'annual_saas'
  AND NOT EXISTS (
    SELECT 1
    FROM public.invoice_items ii
    WHERE ii.source_agreement_item_id::text = ai.id::text
  );

COMMIT;
