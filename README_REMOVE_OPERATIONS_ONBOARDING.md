# Operations Onboarding Module Removal

This change removes the Operations Onboarding module from the user-facing InCheck360 ERP frontend without deleting historical database data.

## What was removed

- Left navigation entry and panel markup from `index.html`.
- Frontend routing, tab activation, deep-link handling, and module hotfix loading for Operations Onboarding.
- Permission matrix entries and tab/resource mappings that exposed the module.
- Runtime script loading for `operations-onboarding.js`.
- Automatic Operations Onboarding row creation from issued invoices.
- Notification routing into Operations Onboarding; legacy notifications now route to Clients.
- Runtime configuration table binding by setting `OPERATIONS_ONBOARDING_TABLE` to an empty string.

## What was preserved

- Historical `public.operations_onboarding` table data is not dropped or deleted.
- Client Success 360, invoices, agreements, clients, and lifecycle analytics remain intact.
- Existing historical SQL files are left unchanged.

## Database migration

Run `sql/migrations/20260709_remove_operations_onboarding_module.sql` to:

- Delete role permissions for `operations_onboarding` and `operations-onboarding`.
- Disable notification settings/event types related to Operations Onboarding when those tables exist.
- Enable RLS on `public.operations_onboarding` if the table exists.

## Legacy routes

Legacy hashes such as `#operations-onboarding` and `#operations_onboarding` are redirected safely to `#clients`.
