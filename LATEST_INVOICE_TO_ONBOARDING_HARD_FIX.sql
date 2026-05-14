-- Latest invoice -> Operations Onboarding hard fix
-- Safe to run more than once.
-- Enforces:
--   Agreement signed = no Operations row.
--   Invoice created from selected Annual SaaS locations = Operations row only for that invoice batch.
--   Technical Admin remains manual from the Operations row.

BEGIN;

-- Core columns used by the frontend and by the backfill.
ALTER TABLE IF EXISTS public.invoices
  ADD COLUMN IF NOT EXISTS agreement_uuid uuid NULL,
  ADD COLUMN IF NOT EXISTS agreement_id text NULL,
  ADD COLUMN IF NOT EXISTS agreement_number text NULL,
  ADD COLUMN IF NOT EXISTS billing_frequency text NULL,
  ADD COLUMN IF NOT EXISTS payment_term text NULL;

ALTER TABLE IF EXISTS public.invoice_items
  ADD COLUMN IF NOT EXISTS source_agreement_item_id uuid NULL,
  ADD COLUMN IF NOT EXISTS source_agreement_id uuid NULL;

ALTER TABLE IF EXISTS public.operations_onboarding
  ADD COLUMN IF NOT EXISTS onboarding_id text NULL,
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
  ADD COLUMN IF NOT EXISTS notes text NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.technical_admin_requests
  ADD COLUMN IF NOT EXISTS source_invoice_id uuid NULL,
  ADD COLUMN IF NOT EXISTS invoice_id uuid NULL,
  ADD COLUMN IF NOT EXISTS source_invoice_number text NULL,
  ADD COLUMN IF NOT EXISTS invoice_number text NULL,
  ADD COLUMN IF NOT EXISTS invoiced_location_names text NULL,
  ADD COLUMN IF NOT EXISTS invoiced_agreement_item_ids text NULL,
  ADD COLUMN IF NOT EXISTS location_count integer NULL,
  ADD COLUMN IF NOT EXISTS number_of_locations integer NULL,
  ADD COLUMN IF NOT EXISTS service_start_date date NULL,
  ADD COLUMN IF NOT EXISTS service_end_date date NULL,
  ADD COLUMN IF NOT EXISTS billing_frequency text NULL,
  ADD COLUMN IF NOT EXISTS payment_term text NULL;

-- Remove old agreement-signed trigger paths that may still create Operations rows.
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

-- App permission rows for users who can create invoices / manage operations.
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

-- Backfill missing Operations rows for already-created invoices, schema-safe.
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
      'onboarding_id',
      'agreement_id',
      'agreement_number',
      'client_id',
      'client_name',
      'agreement_status',
      'signed_date',
      'onboarding_status',
      'status',
      'request_type',
      'request_status',
      'technical_request_status',
      'request_message',
      'request_details',
      'source_invoice_id',
      'invoice_id',
      'source_invoice_number',
      'invoice_number',
      'invoiced_location_names',
      'invoiced_locations',
      'location_names',
      'invoiced_agreement_item_ids',
      'location_count',
      'locations_count',
      'number_of_locations',
      'invoiced_location_count',
      'service_start_date',
      'service_end_date',
      'billing_frequency',
      'payment_term',
      'requested_at',
      'notes',
      'created_at',
      'updated_at'
    ]);

  IF cols IS NULL THEN
    RAISE NOTICE 'No known Operations Onboarding columns found to backfill.';
    RETURN;
  END IF;

  EXECUTE format($sql$
    WITH invoice_location_rows AS (
      SELECT
        i.id::text AS invoice_uuid,
        COALESCE(
          NULLIF(to_jsonb(i)->>'invoice_number', ''),
          NULLIF(to_jsonb(i)->>'invoice_id', ''),
          NULLIF(to_jsonb(i)->>'invoice_reference', ''),
          i.id::text
        ) AS invoice_number,
        COALESCE(
          NULLIF(to_jsonb(i)->>'agreement_uuid', ''),
          NULLIF(to_jsonb(ii)->>'source_agreement_id', ''),
          a.id::text
        ) AS agreement_uuid,
        COALESCE(
          NULLIF(to_jsonb(i)->>'agreement_number', ''),
          NULLIF(to_jsonb(a)->>'agreement_number', ''),
          NULLIF(to_jsonb(a)->>'agreement_id', ''),
          NULLIF(to_jsonb(i)->>'agreement_id', '')
        ) AS agreement_number,
        CASE
          WHEN COALESCE(NULLIF(to_jsonb(i)->>'client_id', ''), NULLIF(to_jsonb(a)->>'client_id', '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$'
          THEN COALESCE(NULLIF(to_jsonb(i)->>'client_id', ''), NULLIF(to_jsonb(a)->>'client_id', ''))
          ELSE NULL
        END AS client_id,
        COALESCE(
          NULLIF(to_jsonb(i)->>'customer_legal_name', ''),
          NULLIF(to_jsonb(i)->>'customer_name', ''),
          NULLIF(to_jsonb(i)->>'company_name', ''),
          NULLIF(to_jsonb(a)->>'customer_legal_name', ''),
          NULLIF(to_jsonb(a)->>'customer_name', ''),
          NULLIF(to_jsonb(a)->>'company_name', ''),
          ''
        ) AS client_name,
        COALESCE(NULLIF(to_jsonb(a)->>'status', ''), 'Signed') AS agreement_status,
        COALESCE(
          NULLIF(to_jsonb(a)->>'signed_date', ''),
          NULLIF(to_jsonb(a)->>'customer_sign_date', ''),
          NULLIF(to_jsonb(a)->>'customer_official_sign_date', ''),
          NULLIF(to_jsonb(a)->>'provider_official_signatory_2_sign_date', ''),
          NULLIF(to_jsonb(a)->>'updated_at', '')
        ) AS signed_date_raw,
        COALESCE(
          NULLIF(to_jsonb(ii)->>'source_agreement_item_id', ''),
          NULLIF(to_jsonb(ii)->>'agreement_item_id', ''),
          NULLIF(to_jsonb(ii)->>'source_item_id', ''),
          ii.id::text
        ) AS source_item_id,
        COALESCE(
          NULLIF(to_jsonb(ii)->>'location_name', ''),
          NULLIF(to_jsonb(ii)->>'location', ''),
          NULLIF(to_jsonb(ii)->>'site_name', ''),
          NULLIF(to_jsonb(ii)->>'store_name', ''),
          NULLIF(to_jsonb(ii)->>'branch_name', ''),
          NULLIF(to_jsonb(ii)->>'item_name', ''),
          NULLIF(to_jsonb(ii)->>'description', ''),
          'Location'
        ) AS location_name,
        COALESCE(NULLIF(to_jsonb(ii)->>'service_start_date', ''), NULLIF(to_jsonb(i)->>'service_start_date', ''), NULLIF(to_jsonb(a)->>'service_start_date', '')) AS service_start_date_raw,
        COALESCE(NULLIF(to_jsonb(ii)->>'service_end_date', ''), NULLIF(to_jsonb(i)->>'service_end_date', ''), NULLIF(to_jsonb(a)->>'service_end_date', '')) AS service_end_date_raw,
        COALESCE(NULLIF(to_jsonb(i)->>'billing_frequency', ''), NULLIF(to_jsonb(a)->>'billing_frequency', ''), 'Annual') AS billing_frequency,
        COALESCE(NULLIF(to_jsonb(i)->>'payment_term', ''), NULLIF(to_jsonb(a)->>'payment_term', ''), NULLIF(to_jsonb(a)->>'payment_terms', ''), 'Net 30') AS payment_term,
        lower(concat_ws(' ',
          NULLIF(to_jsonb(ii)->>'section', ''),
          NULLIF(to_jsonb(ii)->>'category', ''),
          NULLIF(to_jsonb(ii)->>'item_category', ''),
          NULLIF(to_jsonb(ii)->>'type', ''),
          NULLIF(to_jsonb(ii)->>'item_type', ''),
          NULLIF(to_jsonb(ii)->>'item_name', ''),
          NULLIF(to_jsonb(ii)->>'description', '')
        )) AS item_text
      FROM public.invoices i
      JOIN public.invoice_items ii ON ii.invoice_id::text = i.id::text
      LEFT JOIN public.agreements a ON (
        a.id::text = COALESCE(NULLIF(to_jsonb(i)->>'agreement_uuid', ''), NULLIF(to_jsonb(ii)->>'source_agreement_id', ''))
        OR a.id::text = NULLIF(to_jsonb(i)->>'agreement_id', '')
        OR NULLIF(to_jsonb(i)->>'agreement_id', '') IN (NULLIF(to_jsonb(a)->>'agreement_id', ''), NULLIF(to_jsonb(a)->>'agreement_number', ''))
        OR NULLIF(to_jsonb(i)->>'agreement_number', '') IN (NULLIF(to_jsonb(a)->>'agreement_id', ''), NULLIF(to_jsonb(a)->>'agreement_number', ''))
      )
    ),
    invoice_batches AS (
      SELECT
        invoice_uuid,
        invoice_number,
        agreement_uuid,
        agreement_number,
        client_id,
        client_name,
        agreement_status,
        CASE WHEN signed_date_raw ~ '^\d{4}-\d{2}-\d{2}' THEN left(signed_date_raw, 10) ELSE NULL END AS signed_date,
        string_agg(DISTINCT location_name, ', ' ORDER BY location_name) AS location_names,
        string_agg(DISTINCT source_item_id, ', ' ORDER BY source_item_id) AS source_item_ids,
        count(DISTINCT COALESCE(NULLIF(source_item_id, ''), location_name))::integer AS location_count,
        min(CASE WHEN service_start_date_raw ~ '^\d{4}-\d{2}-\d{2}' THEN left(service_start_date_raw, 10) ELSE NULL END) AS service_start_date,
        max(CASE WHEN service_end_date_raw ~ '^\d{4}-\d{2}-\d{2}' THEN left(service_end_date_raw, 10) ELSE NULL END) AS service_end_date,
        billing_frequency,
        payment_term
      FROM invoice_location_rows
      WHERE item_text NOT LIKE '%%one%%time%%'
        AND item_text NOT LIKE '%%one-time%%'
        AND item_text NOT LIKE '%%setup%%'
        AND item_text NOT LIKE '%%implementation%%'
        AND item_text NOT LIKE '%%installation%%'
        AND item_text NOT LIKE '%%activation%%'
      GROUP BY
        invoice_uuid,
        invoice_number,
        agreement_uuid,
        agreement_number,
        client_id,
        client_name,
        agreement_status,
        CASE WHEN signed_date_raw ~ '^\d{4}-\d{2}-\d{2}' THEN left(signed_date_raw, 10) ELSE NULL END,
        billing_frequency,
        payment_term
    )
    INSERT INTO public.operations_onboarding (%s)
    SELECT %s
    FROM invoice_batches b
    CROSS JOIN LATERAL jsonb_populate_record(
      NULL::public.operations_onboarding,
      jsonb_build_object(
        'onboarding_id', 'OP-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substr(md5(b.invoice_uuid || coalesce(b.source_item_ids, '')), 1, 6)),
        'agreement_id', CASE WHEN b.agreement_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$' THEN b.agreement_uuid ELSE NULL END,
        'agreement_number', b.agreement_number,
        'client_id', b.client_id,
        'client_name', b.client_name,
        'agreement_status', b.agreement_status,
        'signed_date', b.signed_date,
        'onboarding_status', 'Pending',
        'status', 'Not Started',
        'request_type', 'Invoice Onboarding',
        'request_status', 'Not Requested',
        'technical_request_status', 'Not Requested',
        'request_message', 'Please proceed with the invoiced location' || CASE WHEN b.location_count = 1 THEN '' ELSE 's' END || ': ' || b.location_names || '. Invoice ' || b.invoice_number || '.',
        'request_details', 'Please proceed with the invoiced location' || CASE WHEN b.location_count = 1 THEN '' ELSE 's' END || ': ' || b.location_names || '. Invoice ' || b.invoice_number || '.',
        'source_invoice_id', b.invoice_uuid,
        'invoice_id', b.invoice_uuid,
        'source_invoice_number', b.invoice_number,
        'invoice_number', b.invoice_number,
        'invoiced_location_names', b.location_names,
        'invoiced_locations', b.location_names,
        'location_names', b.location_names,
        'invoiced_agreement_item_ids', b.source_item_ids,
        'location_count', b.location_count,
        'locations_count', b.location_count,
        'number_of_locations', b.location_count,
        'invoiced_location_count', b.location_count,
        'service_start_date', b.service_start_date,
        'service_end_date', b.service_end_date,
        'billing_frequency', b.billing_frequency,
        'payment_term', b.payment_term,
        'requested_at', now(),
        'notes', 'Invoice-batch Operations row. Technical Admin request must be sent manually from this Operations row.',
        'created_at', now(),
        'updated_at', now()
      )
    ) AS r
    WHERE b.location_count > 0
      AND b.invoice_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$'
      AND NOT EXISTS (
        SELECT 1
        FROM public.operations_onboarding o
        WHERE COALESCE(to_jsonb(o)->>'source_invoice_id', '') = b.invoice_uuid
           OR COALESCE(to_jsonb(o)->>'invoice_id', '') = b.invoice_uuid
           OR (
             COALESCE(to_jsonb(o)->>'invoice_number', '') = b.invoice_number
             AND COALESCE(to_jsonb(o)->>'agreement_id', '') = COALESCE(b.agreement_uuid, '')
           )
      );
  $sql$, cols, vals);
END $$;

-- Clean old wrong rows that were created from signed agreement only with no invoice link.
DELETE FROM public.operations_onboarding
WHERE COALESCE(to_jsonb(operations_onboarding)->>'source_invoice_id', '') = ''
  AND COALESCE(to_jsonb(operations_onboarding)->>'invoice_id', '') = ''
  AND COALESCE(to_jsonb(operations_onboarding)->>'invoice_number', '') = ''
  AND COALESCE(to_jsonb(operations_onboarding)->>'agreement_id', '') <> '';

COMMIT;

-- Check result after running:
-- SELECT onboarding_id, agreement_number, client_name, invoice_number, location_count, invoiced_location_names, request_status, technical_request_status, onboarding_status, created_at
-- FROM public.operations_onboarding
-- ORDER BY created_at DESC NULLS LAST;
