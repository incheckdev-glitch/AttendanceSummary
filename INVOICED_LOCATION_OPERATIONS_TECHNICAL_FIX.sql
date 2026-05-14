-- Invoiced-location based Operations + Technical request support.
-- Safe to run more than once.

BEGIN;

-- Optional tracking columns. The app also works without these because it writes the core
-- technical_request_details/request fields, but these columns make each invoice batch auditable.
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
  ADD COLUMN IF NOT EXISTS location_count integer NULL,
  ADD COLUMN IF NOT EXISTS number_of_locations integer NULL;

-- The new behavior needs multiple Operations rows for the same agreement when different
-- locations are invoiced at different times. Drop single-column agreement_id uniqueness if it exists.
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
        SELECT array_agg(a.attname ORDER BY u.ord)
        FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
      ) = ARRAY['agreement_id']::text[]
  LOOP
    EXECUTE format('ALTER TABLE public.operations_onboarding DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

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
        SELECT array_agg(a.attname ORDER BY u.ord)
        FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
      ) = ARRAY['agreement_id']::text[]
  LOOP
    EXECUTE format('ALTER TABLE public.technical_admin_requests DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- Allow users who already create invoices to trigger the automatic Operations/Technical rows.
-- This avoids FK errors by only inserting for roles that actually exist.
WITH existing_roles AS (
  SELECT role_key
  FROM public.roles
  WHERE role_key IN ('admin', 'dev', 'hoo', 'accounting', 'sales_executive')
), needed_permissions AS (
  SELECT role_key, resource, action
  FROM existing_roles
  CROSS JOIN (VALUES
    ('operations_onboarding', 'create'),
    ('operations_onboarding', 'list'),
    ('operations_onboarding', 'get'),
    ('technical_admin_requests', 'create'),
    ('technical_admin_requests', 'list'),
    ('technical_admin_requests', 'get')
  ) AS p(resource, action)
)
INSERT INTO public.role_permissions (
  permission_id,
  role_key,
  resource,
  action,
  is_allowed,
  is_active,
  allowed_roles,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  role_key,
  resource,
  action,
  true,
  true,
  ARRAY[role_key]::text[],
  now(),
  now()
FROM needed_permissions
ON CONFLICT (role_key, resource, action)
DO UPDATE SET
  is_allowed = true,
  is_active = true,
  updated_at = now();

COMMIT;
