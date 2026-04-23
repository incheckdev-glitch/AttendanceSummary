-- Full role_permissions seed based on BASE_PERMISSION_MATRIX defaults.
-- Safe to re-run: clears target matrix rows for the seeded roles/resources/actions, then upserts.

WITH permission_matrix AS (
  SELECT ' {
    "tickets": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev","viewer","hoo"], "update": ["admin","dev"], "delete": ["admin","dev"], "internal_filters": ["admin","dev"]},
    "events": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev"], "update": ["admin","dev"], "delete": ["admin","dev"]},
    "csm": {"list": ["admin","viewer","hoo"], "get": ["admin","viewer","hoo"], "create": ["admin","hoo"], "update": ["admin","hoo"], "delete": ["admin","hoo"]},
    "leads": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev","viewer","hoo"], "update": ["admin","dev"], "delete": ["admin","dev"], "convert_to_deal": ["admin","dev"]},
    "deals": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev"], "update": ["admin","dev"], "delete": ["admin","dev"]},
    "proposal_catalog": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev"], "update": ["admin","dev"], "delete": ["admin","dev"]},
    "proposals": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev"], "update": ["admin","dev"], "delete": ["admin","dev"], "create_from_deal": ["admin","dev"], "generate_proposal_html": ["admin","dev","viewer","hoo"]},
    "agreements": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev"], "update": ["admin","dev"], "delete": ["admin","dev"], "create_from_proposal": ["admin","dev"], "generate_agreement_html": ["admin","dev","viewer","hoo"], "send_to_operations": ["admin","hoo"], "request_incheck_lite": ["admin","hoo"], "request_incheck_full": ["admin","hoo"], "assign_csm": ["admin","hoo"], "update_onboarding_status": ["admin","hoo"]},
    "operations_onboarding": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","hoo"], "update": ["admin","hoo"], "delete": ["admin"]},
    "technical_admin_requests": {"list": ["admin","dev","hoo"], "get": ["admin","dev","hoo"], "create": ["admin","dev","hoo"], "update_status": ["admin","dev","hoo"]},
    "invoices": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev"], "update": ["admin","dev"], "delete": ["admin","dev"], "create_from_agreement": ["admin","dev"], "generate_invoice_html": ["admin","dev","viewer","hoo"]},
    "receipts": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev"], "update": ["admin","dev"], "delete": ["admin","dev"], "create_from_invoice": ["admin","dev"], "generate_receipt_html": ["admin","dev","viewer","hoo"]},
    "clients": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev","hoo"], "update": ["admin","dev","hoo"], "delete": ["admin","dev"]},
    "analytics": {"list": ["admin","dev","viewer","hoo"]},
    "insights": {"list": ["admin","dev","viewer","hoo"]},
    "notifications": {"list": ["admin","dev","viewer","hoo"], "get_unread_count": ["admin","dev","viewer","hoo"], "mark_read": ["admin","dev","viewer","hoo"], "mark_all_read": ["admin","dev","viewer","hoo"]},
    "users": {"list": ["admin"], "get": ["admin"], "create": ["admin"], "update": ["admin"], "delete": ["admin"], "activate": ["admin"], "deactivate": ["admin"]},
    "roles": {"list": ["admin"], "get": ["admin"], "create": ["admin"], "update": ["admin"], "delete": ["admin"]},
    "role_permissions": {"list": ["admin"], "get": ["admin"], "create": ["admin"], "update": ["admin"], "delete": ["admin"]},
    "workflow": {"list": ["admin","dev"], "get": ["admin","dev"], "save": ["admin","dev"], "delete": ["admin"], "request_approval": ["admin","dev","hoo"], "approve": ["admin","hoo"], "reject": ["admin","hoo"], "list_pending_approvals": ["admin","dev","hoo"], "list_audit": ["admin","dev"]}
  }'::jsonb AS data
),
expanded AS (
  SELECT
    lower(role_value.value::text)::text AS role_key,
    resource_entry.key::text AS resource,
    action_entry.key::text AS action
  FROM permission_matrix pm
  CROSS JOIN LATERAL jsonb_each(pm.data) AS resource_entry(key, value)
  CROSS JOIN LATERAL jsonb_each(resource_entry.value) AS action_entry(key, value)
  CROSS JOIN LATERAL jsonb_array_elements_text(action_entry.value) AS role_value(value)
),
scoped_rows AS (
  SELECT DISTINCT role_key, resource, action
  FROM expanded
  WHERE role_key IN ('admin', 'dev', 'viewer', 'hoo')
)
DELETE FROM role_permissions rp
USING scoped_rows s
WHERE rp.role_key = s.role_key
  AND rp.resource = s.resource
  AND rp.action = s.action;

WITH permission_matrix AS (
  SELECT ' {
    "tickets": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev","viewer","hoo"], "update": ["admin","dev"], "delete": ["admin","dev"], "internal_filters": ["admin","dev"]},
    "events": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev"], "update": ["admin","dev"], "delete": ["admin","dev"]},
    "csm": {"list": ["admin","viewer","hoo"], "get": ["admin","viewer","hoo"], "create": ["admin","hoo"], "update": ["admin","hoo"], "delete": ["admin","hoo"]},
    "leads": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev","viewer","hoo"], "update": ["admin","dev"], "delete": ["admin","dev"], "convert_to_deal": ["admin","dev"]},
    "deals": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev"], "update": ["admin","dev"], "delete": ["admin","dev"]},
    "proposal_catalog": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev"], "update": ["admin","dev"], "delete": ["admin","dev"]},
    "proposals": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev"], "update": ["admin","dev"], "delete": ["admin","dev"], "create_from_deal": ["admin","dev"], "generate_proposal_html": ["admin","dev","viewer","hoo"]},
    "agreements": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev"], "update": ["admin","dev"], "delete": ["admin","dev"], "create_from_proposal": ["admin","dev"], "generate_agreement_html": ["admin","dev","viewer","hoo"], "send_to_operations": ["admin","hoo"], "request_incheck_lite": ["admin","hoo"], "request_incheck_full": ["admin","hoo"], "assign_csm": ["admin","hoo"], "update_onboarding_status": ["admin","hoo"]},
    "operations_onboarding": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","hoo"], "update": ["admin","hoo"], "delete": ["admin"]},
    "technical_admin_requests": {"list": ["admin","dev","hoo"], "get": ["admin","dev","hoo"], "create": ["admin","dev","hoo"], "update_status": ["admin","dev","hoo"]},
    "invoices": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev"], "update": ["admin","dev"], "delete": ["admin","dev"], "create_from_agreement": ["admin","dev"], "generate_invoice_html": ["admin","dev","viewer","hoo"]},
    "receipts": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev"], "update": ["admin","dev"], "delete": ["admin","dev"], "create_from_invoice": ["admin","dev"], "generate_receipt_html": ["admin","dev","viewer","hoo"]},
    "clients": {"list": ["admin","dev","viewer","hoo"], "get": ["admin","dev","viewer","hoo"], "create": ["admin","dev","hoo"], "update": ["admin","dev","hoo"], "delete": ["admin","dev"]},
    "analytics": {"list": ["admin","dev","viewer","hoo"]},
    "insights": {"list": ["admin","dev","viewer","hoo"]},
    "notifications": {"list": ["admin","dev","viewer","hoo"], "get_unread_count": ["admin","dev","viewer","hoo"], "mark_read": ["admin","dev","viewer","hoo"], "mark_all_read": ["admin","dev","viewer","hoo"]},
    "users": {"list": ["admin"], "get": ["admin"], "create": ["admin"], "update": ["admin"], "delete": ["admin"], "activate": ["admin"], "deactivate": ["admin"]},
    "roles": {"list": ["admin"], "get": ["admin"], "create": ["admin"], "update": ["admin"], "delete": ["admin"]},
    "role_permissions": {"list": ["admin"], "get": ["admin"], "create": ["admin"], "update": ["admin"], "delete": ["admin"]},
    "workflow": {"list": ["admin","dev"], "get": ["admin","dev"], "save": ["admin","dev"], "delete": ["admin"], "request_approval": ["admin","dev","hoo"], "approve": ["admin","hoo"], "reject": ["admin","hoo"], "list_pending_approvals": ["admin","dev","hoo"], "list_audit": ["admin","dev"]}
  }'::jsonb AS data
),
expanded AS (
  SELECT
    lower(role_value.value::text)::text AS role_key,
    resource_entry.key::text AS resource,
    action_entry.key::text AS action
  FROM permission_matrix pm
  CROSS JOIN LATERAL jsonb_each(pm.data) AS resource_entry(key, value)
  CROSS JOIN LATERAL jsonb_each(resource_entry.value) AS action_entry(key, value)
  CROSS JOIN LATERAL jsonb_array_elements_text(action_entry.value) AS role_value(value)
),
scoped_rows AS (
  SELECT DISTINCT role_key, resource, action
  FROM expanded
  WHERE role_key IN ('admin', 'dev', 'viewer', 'hoo')
)
INSERT INTO role_permissions (
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
FROM scoped_rows
ON CONFLICT (role_key, resource, action)
DO UPDATE SET
  is_allowed = EXCLUDED.is_allowed,
  is_active = EXCLUDED.is_active,
  allowed_roles = EXCLUDED.allowed_roles,
  updated_at = now();
