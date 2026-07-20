# CS360 Location Fix + Special Brand Report V2

## Included changes

### Corrected CS360 location names
The frontend display override and the Supabase migration cover the actual saved variants:

- `LR muroo` / `LR Muroor` → `LR Muroor`
- `LR Defence` / `ZL Defence` → `LR Motor City`
- `ZL Khalidya` / `ZL Khalidiya` → `ZL al Forsan Cloud Kitchen`

These changes apply only inside Customer Success 360. Invoice, agreement, CRM, accounting, and other source-module names are not modified.

### Special CS Client Brand Completion Report
A new report type is available under **Export Completion Report**:

- `Special CS Client Brand Completion Report`
- Select the Special CS Client.
- Select one of its configured brands.
- The export includes only locations assigned to that brand.

Each configured brand also has a direct **Export [Brand Name]** button in the Special CS Client **Brand Management** tab.

### Brand-page rule
The brand page remains hidden in a Special CS Client export when no brand is configured or no locations are assigned to a brand.

## Installation

1. Run `sql/migrations/20260720_cs360_location_name_correction_v2.sql` once in the Supabase SQL Editor.
2. Replace the deployed root files:
   - `client-success.js`
   - `index.html`
3. Redeploy the platform.
4. Perform a hard refresh with `Ctrl + Shift + R`.

The updated `index.html` contains a new cache-busting version for `client-success.js`, so the browser loads this correction instead of the previous cached file.

## Validation

- JavaScript syntax validation passed.
- SQL migration safety validation passed.
- All 37 ERP regression tests passed.
