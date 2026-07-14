# CS360 Special CS Clients

Adds standalone **Special CS Client** support to Customer Success 360.

## What changed

- Special CS Clients are stored in standalone `cs_special_clients` tables and are not linked to CRM companies, agreements, invoices, subscriptions, payments, or active invoice periods.
- Completion rows use `source_type = 'special_client'` and store the special client/location/group/brand identifiers and display names for historical reporting.
- The Customer Success UI includes a **Special CS Clients** section and an **Add Special CS Client** action.
- Special clients can be used in completion entry, completion reports, exports, brand comparison, and group/location aggregation.
- Archiving a special client hides it from active completion selection while preserving historical completion rows and reports.

## Permission model

The UI uses existing Customer Success 360 permissions:

- view/list/get/export: view and report special clients
- create: create special clients and save completions
- update: edit special clients
- delete: archive special clients
- manage: full access

RLS policies call the existing helpers: `cs360_can_select()`, `cs360_can_insert()`, `cs360_can_update()`, and `cs360_can_delete()`.

## Migration

Run `sql/migrations/20260710_cs360_special_clients.sql` after the base CS360 migrations.
