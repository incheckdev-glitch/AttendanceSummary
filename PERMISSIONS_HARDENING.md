# Permissions hardening checklist

## Role matrix baseline

| Resource | Viewer | HOO | DEV | Admin |
|---|---|---|---|---|
| tickets | view/create | view/create | full | full |
| events | view | view | full | full |
| csm | view | full | no access | full |
| leads | view/create | view/create | full | full |
| deals | view | view | full | full |
| proposal catalog | view | view | full | full |
| proposals | view | view | full | full |
| agreements | view | view + ops actions | full (no ops-only actions) | full |
| invoices | view | view | full | full |
| receipts | view | view | full | full |
| clients | view | view/create/update | full | full |
| operations onboarding | view | create/update | view | full |
| technical admin requests | no access | full | full | full |
| users | no access | no access | no access | full |
| roles / role permissions | no access | no access | no access | full |
| workflow rules | no access | approval actions only | manage (except delete) | full |

## QA spot checks

- Verify each role can only see allowed tabs and actions.
- Verify direct API calls for blocked actions return `Forbidden`.
- Verify technical admin sensitive fields (`request_details`, `notes`) are not returned to viewer.
- Verify ticket internal fields are only returned to admin/dev.
- Verify users and role-permissions data is admin-only in UI and data layer.
