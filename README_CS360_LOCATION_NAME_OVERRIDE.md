# CS360 Location Name Override

## Café One SAL display override

Customer Success 360 has a display-only location/client label override for one client-specific case:

- Client/customer/company: `Café One SAL` or `Cafe One SAL`
- Source location label: `COSMO ABC`
- CS360 display label: `MET ABC & Napoletana`

This override is intentionally scoped to Customer Success 360 only. It must not rename CRM companies, invoices, agreements, accounting records, or client-module source data.

## Frontend behavior

`client-success.js` normalizes the client and location names, then rewrites the CS360 display object only when the row belongs to Café One SAL and the location is exactly `COSMO ABC` after normalization.

The override is applied in CS360 active-location paths and report paths, including locations derived from:

- `invoice_items`
- `agreement_items`
- `cs_location_completions`
- `cs_client_brand_locations`
- group and brand completion targets
- completion report/export rows

## One-time CS table cleanup

The migration `sql/migrations/20260710_cs360_cafe_one_cosmo_abc_display_override.sql` updates existing CS360 tables only, if those tables and columns exist. It does not update invoices, agreements, CRM companies, accounting, or client-module data.

Run the migration once in environments where CS360 tables may already contain saved `COSMO ABC` rows for Café One SAL.
