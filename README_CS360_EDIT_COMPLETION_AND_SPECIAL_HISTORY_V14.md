# CS360 V14 — Edit Completion Reports + Special Client History Filters

## Updated files
- `client-success.js`
- `index.html`

## New functionality

### Edit saved completion reports
- Open **Completion History**.
- Find the required period in **Period Summary**.
- Click **Edit Report**.
- Update weekly/monthly type, period dates, source note, or location percentages.
- The original saved rows are updated directly by their database IDs; no duplicate report is created.
- Available for normal clients, client groups, brands, full Special CS Clients, Special CS Client brands, and Special CS Client groups.

### Special CS Client history filters
The Special CS Client **Completion History** tab now supports:
- Entire Client / One Brand / One Group
- Weekly / Monthly
- From and To dates
- Search by location, brand, group, note, or period
- 25 / 50 / 100 rows per page
- Period summary and detailed historical rows

## Installation
1. Replace `client-success.js`.
2. Replace `index.html`.
3. Redeploy the platform.
4. Hard refresh with `Ctrl + Shift + R`.

No Supabase SQL migration is required.

## Validation
- JavaScript syntax validation passed.
- 37 ERP regression tests passed.
