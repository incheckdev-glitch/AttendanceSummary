-- Renewal duplicate cleanup and future-prevention helper.
-- Run the SELECT previews first. Only run the UPDATE/DELETE sections after reviewing
-- the preview result set and confirming the duplicate groups are clear technical duplicates.

BEGIN;

-- 1) Preview duplicate renewal snapshot/history rows.
WITH ranked_renewals AS (
  SELECT
    r.*,
    row_number() OVER (
      PARTITION BY
        nullif(client_id, ''),
        nullif(agreement_id, ''),
        lower(trim(coalesce(location_name, ''))),
        coalesce(new_service_start_date, old_service_start_date),
        coalesce(new_service_end_date, old_service_end_date)
      ORDER BY
        (CASE WHEN nullif(invoice_id, '') IS NOT NULL THEN 1 ELSE 0 END) DESC,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS keep_rank,
    count(*) OVER (
      PARTITION BY
        nullif(client_id, ''),
        nullif(agreement_id, ''),
        lower(trim(coalesce(location_name, ''))),
        coalesce(new_service_start_date, old_service_start_date),
        coalesce(new_service_end_date, old_service_end_date)
    ) AS duplicate_count
  FROM renewals r
)
SELECT *
FROM ranked_renewals
WHERE duplicate_count > 1
ORDER BY client_id, agreement_id, location_name, keep_rank;

-- 2) Mark older duplicate renewals inactive when the table has an is_active column.
-- Uncomment only after reviewing the preview above.
-- WITH ranked_renewals AS (
--   SELECT
--     r.id,
--     row_number() OVER (
--       PARTITION BY
--         nullif(client_id, ''),
--         nullif(agreement_id, ''),
--         lower(trim(coalesce(location_name, ''))),
--         coalesce(new_service_start_date, old_service_start_date),
--         coalesce(new_service_end_date, old_service_end_date)
--       ORDER BY
--         (CASE WHEN nullif(invoice_id, '') IS NOT NULL THEN 1 ELSE 0 END) DESC,
--         updated_at DESC NULLS LAST,
--         created_at DESC NULLS LAST,
--         id DESC
--     ) AS keep_rank
--   FROM renewals r
-- )
-- UPDATE renewals r
-- SET is_active = false,
--     updated_at = now(),
--     notes = concat_ws(E'\n', nullif(r.notes, ''), 'Marked inactive by renewal duplicate cleanup on 2026-05-18; newest/most complete duplicate retained.')
-- FROM ranked_renewals d
-- WHERE r.id = d.id
--   AND d.keep_rank > 1;

-- 3) If the renewals table does not have is_active/status columns and the preview confirms
--    rows are exact technical duplicates, use this DELETE instead of the UPDATE above.
--    This never touches invoices, invoice_items, receipts, receipt_items, agreements, or payments.
-- WITH ranked_renewals AS (
--   SELECT
--     r.id,
--     row_number() OVER (
--       PARTITION BY
--         nullif(client_id, ''),
--         nullif(agreement_id, ''),
--         lower(trim(coalesce(location_name, ''))),
--         coalesce(new_service_start_date, old_service_start_date),
--         coalesce(new_service_end_date, old_service_end_date)
--       ORDER BY
--         (CASE WHEN nullif(invoice_id, '') IS NOT NULL THEN 1 ELSE 0 END) DESC,
--         updated_at DESC NULLS LAST,
--         created_at DESC NULLS LAST,
--         id DESC
--     ) AS keep_rank
--   FROM renewals r
-- )
-- DELETE FROM renewals r
-- USING ranked_renewals d
-- WHERE r.id = d.id
--   AND d.keep_rank > 1;

-- 4) Preview duplicate draft renewal invoice headers. These are safe to exclude from totals,
--    but do not delete them automatically; inspect for issued/payment activity first.
WITH renewal_draft_invoice_groups AS (
  SELECT
    i.id,
    i.invoice_number,
    i.client_id,
    i.agreement_id,
    i.renewal_batch_id,
    i.status,
    min(ii.service_start_date) AS service_start_date,
    max(ii.service_end_date) AS service_end_date,
    string_agg(distinct lower(trim(coalesce(ii.source_agreement_item_id::text, ii.renewed_from_invoice_item_id::text, ii.location_name, ''))), '|' ORDER BY lower(trim(coalesce(ii.source_agreement_item_id::text, ii.renewed_from_invoice_item_id::text, ii.location_name, '')))) AS location_license_signature,
    i.invoice_total,
    i.amount_paid,
    i.updated_at,
    i.created_at
  FROM invoices i
  LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
  WHERE i.is_renewal = true
    AND lower(coalesce(i.status, 'draft')) = 'draft'
    AND coalesce(i.amount_paid, 0) = 0
  GROUP BY i.id
), ranked_draft_invoices AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY client_id, agreement_id, service_start_date, service_end_date, location_license_signature
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS keep_rank,
    count(*) OVER (
      PARTITION BY client_id, agreement_id, service_start_date, service_end_date, location_license_signature
    ) AS duplicate_count
  FROM renewal_draft_invoice_groups
)
SELECT *
FROM ranked_draft_invoices
WHERE duplicate_count > 1
ORDER BY client_id, agreement_id, service_start_date, service_end_date, keep_rank;

-- 5) Optional: void older duplicate draft renewal invoice headers only if the preview confirms
--    amount_paid = 0 and there are no receipts/payment records. This does not delete financial records.
-- WITH renewal_draft_invoice_groups AS (...same CTE as above...), ranked_draft_invoices AS (...same CTE as above...)
-- UPDATE invoices i
-- SET status = 'Void',
--     payment_state = 'Void',
--     updated_at = now(),
--     notes = concat_ws(E'\n', nullif(i.notes, ''), 'Voided duplicate renewal draft by cleanup on 2026-05-18; newest matching draft retained.')
-- FROM ranked_draft_invoices d
-- WHERE i.id = d.id
--   AND d.keep_rank > 1
--   AND coalesce(i.amount_paid, 0) = 0
--   AND NOT EXISTS (SELECT 1 FROM receipts r WHERE r.invoice_id = i.id);

COMMIT;

-- 6) Constraint/index phase: run only after duplicates are cleaned.
-- Partial unique index for active renewal rows. Adjust column names if your renewals table
-- uses old_/new_ service dates only.
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS renewals_active_unique_client_period_idx
-- ON renewals (
--   nullif(client_id, ''),
--   nullif(agreement_id, ''),
--   lower(trim(coalesce(location_name, ''))),
--   coalesce(new_service_start_date, old_service_start_date),
--   coalesce(new_service_end_date, old_service_end_date)
-- )
-- WHERE coalesce(is_active, true) = true;
