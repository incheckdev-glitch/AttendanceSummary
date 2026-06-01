-- Allow CSM users to load company selectors when they can create contacts.
-- Safe to re-run. Ensures companies list/view/get are active and allowed for CSM aliases.

WITH required_permissions(role_key, resource, action) AS (
  VALUES
    ('csm', 'companies', 'list'),
    ('csm', 'companies', 'view'),
    ('csm', 'companies', 'get'),
    ('customer_success', 'companies', 'list'),
    ('customer_success', 'companies', 'view'),
    ('customer_success', 'companies', 'get'),
    ('customer_success_manager', 'companies', 'list'),
    ('customer_success_manager', 'companies', 'view'),
    ('customer_success_manager', 'companies', 'get')
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
FROM required_permissions
ON CONFLICT (role_key, resource, action)
DO UPDATE SET
  is_allowed = true,
  is_active = true,
  allowed_roles = ARRAY[EXCLUDED.role_key]::text[],
  updated_at = now();
