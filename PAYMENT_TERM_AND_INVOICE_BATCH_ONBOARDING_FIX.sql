-- Payment Term + Invoice-batch Operations Onboarding fix
-- Safe to run more than once.
-- Purpose:
-- 1) Keep proposal accepted payment term synced to Agreement and Invoice.
-- 2) Ensure invoice-created Operations rows are created/backfilled per invoiced Annual SaaS location batch.
-- 3) Keep Technical Admin requests manual only.

BEGIN;

-- Ensure needed display/link columns exist.
ALTER TABLE IF EXISTS public.agreements
  ADD COLUMN IF NOT EXISTS payment_terms text NULL;

ALTER TABLE IF EXISTS public.invoices
  ADD COLUMN IF NOT EXISTS agreement_uuid uuid NULL,
  ADD COLUMN IF NOT EXISTS agreement_id text NULL,
  ADD COLUMN IF NOT EXISTS agreement_number text NULL,
  ADD COLUMN IF NOT EXISTS company_name text NULL,
  ADD COLUMN IF NOT EXISTS customer_legal_name text NULL,
  ADD COLUMN IF NOT EXISTS customer_name text NULL,
  ADD COLUMN IF NOT EXISTS billing_frequency text NULL,
  ADD COLUMN IF NOT EXISTS payment_term text NULL;

ALTER TABLE IF EXISTS public.invoice_items
  ADD COLUMN IF NOT EXISTS source_agreement_item_id uuid NULL,
  ADD COLUMN IF NOT EXISTS source_agreement_id uuid NULL;

ALTER TABLE IF EXISTS public.operations_onboarding
  ADD COLUMN IF NOT EXISTS onboarding_id text NULL,
  ADD COLUMN IF NOT EXISTS agreement_number text NULL,
  ADD COLUMN IF NOT EXISTS client_id uuid NULL,
  ADD COLUMN IF NOT EXISTS client_name text NULL,
  ADD COLUMN IF NOT EXISTS agreement_status text NULL,
  ADD COLUMN IF NOT EXISTS signed_date date NULL,
  ADD COLUMN IF NOT EXISTS source_invoice_id uuid NULL,
  ADD COLUMN IF NOT EXISTS invoice_id uuid NULL,
  ADD COLUMN IF NOT EXISTS source_invoice_number text NULL,
  ADD COLUMN IF NOT EXISTS invoice_number text NULL,
  ADD COLUMN IF NOT EXISTS invoiced_location_names text NULL,
  ADD COLUMN IF NOT EXISTS invoiced_agreement_item_ids text NULL,
  ADD COLUMN IF NOT EXISTS request_type text NULL,
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
  ADD COLUMN IF NOT EXISTS payment_term text NULL,
  ADD COLUMN IF NOT EXISTS requested_by text NULL,
  ADD COLUMN IF NOT EXISTS requested_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS notes text NULL;

ALTER TABLE IF EXISTS public.technical_admin_requests
  ADD COLUMN IF NOT EXISTS agreement_number text NULL,
  ADD COLUMN IF NOT EXISTS onboarding_id uuid NULL,
  ADD COLUMN IF NOT EXISTS client_id uuid NULL,
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

-- Drop old agreement-signing trigger paths that may create Operations directly on Signed status.
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

-- Grant app-level permissions to existing invoice/operations roles only if those roles exist.
DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.roles') IS NULL OR to_regclass('public.role_permissions') IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT role_key, resource, action
    FROM public.roles
    CROSS JOIN (VALUES
      ('operations_onboarding', 'create'),
      ('operations_onboarding', 'list'),
      ('operations_onboarding', 'get'),
      ('operations_onboarding', 'update'),
      ('technical_admin_requests', 'create'),
      ('technical_admin_requests', 'list'),
      ('technical_admin_requests', 'get')
    ) AS p(resource, action)
    WHERE role_key IN ('admin', 'dev', 'hoo', 'accounting', 'sales_executive')
  LOOP
    UPDATE public.role_permissions
    SET is_allowed = true,
        is_active = true,
        allowed_roles = ARRAY[r.role_key]::text[],
        updated_at = now()
    WHERE role_key = r.role_key
      AND resource = r.resource
      AND action = r.action;

    IF NOT FOUND THEN
      INSERT INTO public.role_permissions (
        permission_id, role_key, resource, action, is_allowed, is_active, allowed_roles, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), r.role_key, r.resource, r.action, true, true, ARRAY[r.role_key]::text[], now(), now()
      );
    END IF;
  END LOOP;
END $$;

-- Sync accepted proposal payment terms to agreements created from those proposals.
UPDATE public.agreements a
SET
  payment_term = p.payment_term,
  payment_terms = p.payment_term,
  billing_frequency = COALESCE(NULLIF(a.billing_frequency, ''), 'Annual'),
  updated_at = now()
FROM public.proposals p
WHERE a.proposal_id = p.id
  AND p.payment_term IN ('Net 7', 'Net 14', 'Net 21', 'Net 30')
  AND COALESCE(NULLIF(a.payment_term, ''), '') IS DISTINCT FROM p.payment_term;

-- Keep invoices aligned with their agreement payment term.
UPDATE public.invoices i
SET
  payment_term = a.payment_term,
  billing_frequency = COALESCE(NULLIF(i.billing_frequency, ''), NULLIF(a.billing_frequency, ''), 'Annual'),
  updated_at = now()
FROM public.agreements a
WHERE a.payment_term IN ('Net 7', 'Net 14', 'Net 21', 'Net 30')
  AND (
    (i.agreement_uuid IS NOT NULL AND i.agreement_uuid = a.id)
    OR (NULLIF(i.agreement_id, '') IS NOT NULL AND (i.agreement_id = a.agreement_id OR i.agreement_id = a.agreement_number OR i.agreement_id = a.id::text))
    OR (NULLIF(i.agreement_number, '') IS NOT NULL AND (i.agreement_number = a.agreement_number OR i.agreement_number = a.agreement_id))
  )
  AND COALESCE(NULLIF(i.payment_term, ''), '') IS DISTINCT FROM a.payment_term;

-- Backfill missing Operations rows from existing invoices + selected invoice_items annual SaaS rows.
WITH invoice_location_batches AS (
  SELECT
    i.id AS invoice_uuid,
    NULLIF(i.invoice_number, '') AS invoice_number,
    NULLIF(i.invoice_id, '') AS invoice_display_id,
    COALESCE(i.agreement_uuid, a.id) AS agreement_uuid,
    COALESCE(NULLIF(i.agreement_number, ''), NULLIF(a.agreement_number, ''), NULLIF(a.agreement_id, '')) AS agreement_number,
    i.client_id,
    COALESCE(NULLIF(i.customer_legal_name, ''), NULLIF(i.customer_name, ''), NULLIF(i.company_name, ''), NULLIF(a.customer_legal_name, ''), NULLIF(a.customer_name, '')) AS client_name,
    COALESCE(NULLIF(a.status, ''), 'Signed') AS agreement_status,
    COALESCE(a.signed_date, a.customer_sign_date, a.customer_official_sign_date) AS signed_date,
    string_agg(DISTINCT COALESCE(NULLIF(ii.location_name, ''), NULLIF(ii.item_name, ''), 'Location'), ', ' ORDER BY COALESCE(NULLIF(ii.location_name, ''), NULLIF(ii.item_name, ''), 'Location')) AS location_names,
    string_agg(DISTINCT ii.source_agreement_item_id::text, ', ' ORDER BY ii.source_agreement_item_id::text) FILTER (WHERE ii.source_agreement_item_id IS NOT NULL) AS source_item_ids,
    count(DISTINCT COALESCE(ii.source_agreement_item_id::text, NULLIF(ii.location_name, ''), ii.id::text))::integer AS location_count,
    min(ii.service_start_date) AS service_start_date,
    max(ii.service_end_date) AS service_end_date,
    COALESCE(NULLIF(i.billing_frequency, ''), NULLIF(a.billing_frequency, ''), 'Annual') AS billing_frequency,
    COALESCE(NULLIF(i.payment_term, ''), NULLIF(a.payment_term, ''), 'Net 30') AS payment_term
  FROM public.invoices i
  JOIN public.invoice_items ii ON ii.invoice_id = i.id
  LEFT JOIN public.agreements a ON (
    (i.agreement_uuid IS NOT NULL AND i.agreement_uuid = a.id)
    OR (NULLIF(i.agreement_id, '') IS NOT NULL AND (i.agreement_id = a.agreement_id OR i.agreement_id = a.agreement_number OR i.agreement_id = a.id::text))
    OR (NULLIF(i.agreement_number, '') IS NOT NULL AND (i.agreement_number = a.agreement_number OR i.agreement_number = a.agreement_id))
    OR (ii.source_agreement_id IS NOT NULL AND ii.source_agreement_id = a.id)
  )
  WHERE lower(replace(COALESCE(ii.section, ''), ' ', '_')) IN ('annual_saas', 'subscription', 'saas', 'recurring')
    AND (ii.source_agreement_item_id IS NOT NULL OR NULLIF(ii.location_name, '') IS NOT NULL)
  GROUP BY
    i.id, i.invoice_number, i.invoice_id, COALESCE(i.agreement_uuid, a.id),
    COALESCE(NULLIF(i.agreement_number, ''), NULLIF(a.agreement_number, ''), NULLIF(a.agreement_id, '')),
    i.client_id, COALESCE(NULLIF(i.customer_legal_name, ''), NULLIF(i.customer_name, ''), NULLIF(i.company_name, ''), NULLIF(a.customer_legal_name, ''), NULLIF(a.customer_name, '')),
    COALESCE(NULLIF(a.status, ''), 'Signed'), COALESCE(a.signed_date, a.customer_sign_date, a.customer_official_sign_date),
    COALESCE(NULLIF(i.billing_frequency, ''), NULLIF(a.billing_frequency, ''), 'Annual'),
    COALESCE(NULLIF(i.payment_term, ''), NULLIF(a.payment_term, ''), 'Net 30')
)
INSERT INTO public.operations_onboarding (
  onboarding_id,
  agreement_id,
  agreement_number,
  client_id,
  client_name,
  agreement_status,
  signed_date,
  onboarding_status,
  request_type,
  request_status,
  technical_request_status,
  request_message,
  request_details,
  source_invoice_id,
  invoice_id,
  source_invoice_number,
  invoice_number,
  invoiced_location_names,
  invoiced_agreement_item_ids,
  location_count,
  number_of_locations,
  service_start_date,
  service_end_date,
  billing_frequency,
  payment_term,
  requested_at,
  notes,
  created_at,
  updated_at
)
SELECT
  'OP-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substr(md5(b.invoice_uuid::text), 1, 6)),
  b.agreement_uuid,
  b.agreement_number,
  b.client_id,
  b.client_name,
  b.agreement_status,
  b.signed_date,
  'Pending',
  'Invoice Onboarding',
  'Not Requested',
  'Not Requested',
  'Please proceed with the invoiced location' || CASE WHEN b.location_count = 1 THEN '' ELSE 's' END || ': ' || b.location_names || '. Invoice ' || COALESCE(b.invoice_number, b.invoice_display_id, b.invoice_uuid::text) || '.',
  'Please proceed with the invoiced location' || CASE WHEN b.location_count = 1 THEN '' ELSE 's' END || ': ' || b.location_names || '. Invoice ' || COALESCE(b.invoice_number, b.invoice_display_id, b.invoice_uuid::text) || '.',
  b.invoice_uuid,
  b.invoice_uuid,
  COALESCE(b.invoice_number, b.invoice_display_id),
  COALESCE(b.invoice_number, b.invoice_display_id),
  b.location_names,
  b.source_item_ids,
  b.location_count,
  b.location_count,
  b.service_start_date,
  b.service_end_date,
  b.billing_frequency,
  b.payment_term,
  now(),
  'Invoice-batch Operations row created/backfilled. Technical Admin request must be sent manually from this Operations row.',
  now(),
  now()
FROM invoice_location_batches b
WHERE b.location_count > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.operations_onboarding o
    WHERE (o.source_invoice_id IS NOT NULL AND o.source_invoice_id = b.invoice_uuid)
       OR (o.invoice_id IS NOT NULL AND o.invoice_id = b.invoice_uuid)
       OR (NULLIF(o.invoice_number, '') IS NOT NULL AND o.invoice_number = COALESCE(b.invoice_number, b.invoice_display_id))
       OR (
         b.agreement_uuid IS NOT NULL
         AND o.agreement_id::text = b.agreement_uuid::text
         AND COALESCE(NULLIF(o.invoiced_agreement_item_ids, ''), '') = COALESCE(NULLIF(b.source_item_ids, ''), '')
       )
  );

-- Ensure invoice-created rows remain manual Technical only.
UPDATE public.operations_onboarding o
SET
  request_status = COALESCE(NULLIF(o.request_status, ''), 'Not Requested'),
  technical_request_status = COALESCE(NULLIF(o.technical_request_status, ''), 'Not Requested'),
  request_type = COALESCE(NULLIF(o.request_type, ''), 'Invoice Onboarding'),
  updated_at = now()
WHERE (o.source_invoice_id IS NOT NULL OR o.invoice_id IS NOT NULL OR NULLIF(o.invoice_number, '') IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1
    FROM public.technical_admin_requests t
    WHERE t.onboarding_id IS NOT NULL
      AND (t.onboarding_id::text = o.id::text OR t.onboarding_id::text = o.onboarding_id::text)
  );

COMMIT;
