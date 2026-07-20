# CS360 — Special CS Client in CSM Activity (V9)

## What changed

- Added **Special CS Client** to the **Activity Scope** selector in **Add CSM Activity**.
- Added searchable Special CS Client selection.
- Saves the selected Special CS Client UUID and name on the activity.
- Special CS Client activities appear correctly in the CSM activity table, filters, details, KPI calculations, charts, and CSV export.
- Editing an existing Special CS Client activity restores the selected client.
- Signed-client, group, and manual-client activity flows remain unchanged.

## Installation order

1. Run `20260720_csm_activity_special_client_target.sql` once in the Supabase SQL Editor.
2. Replace these frontend files:
   - `api.js`
   - `app.js`
   - `csm-service.js`
   - `index.html`
   - `supabase-data.js`
   - `ui.js`
3. Redeploy the platform.
4. Hard-refresh with **Ctrl + Shift + R**.

## Usage

Open **CSM Daily Activity → Add Activity**, then select:

`Activity Scope → Special CS Client`

Choose the Special CS Client and complete the activity form normally.

## Validation

- JavaScript syntax validation passed for 98 deployed scripts.
- SQL migration validation passed.
- All 37 ERP regression tests passed, including Special CS Client activity payload and relationship checks.
