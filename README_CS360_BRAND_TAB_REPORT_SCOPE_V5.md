# CS360 Brand Management Tab and Report Scope V5

## Included fixes

1. **Brand Management tab click fix**
   - The Special CS Client tabs now use a delegated click handler.
   - Brand Management opens reliably after the detail panel is re-rendered.
   - Overview, Locations, Groups & Brands, and Completion History continue to use the same handler.

2. **View Report asks for the required scope**
   - Entire Special CS Client
   - One Brand
   - One Group

3. **Scoped report rules**
   - One Brand includes only locations assigned to that brand.
   - One Group includes only locations assigned to that group.
   - Entire Special CS Client includes all its active locations.
   - Brand insights are limited to the selected report locations.

4. **Main Export Completion form**
   - Added Special CS Client Group Completion Report.
   - Special Client, Brand, and Group selectors update dynamically.

## Installation

Replace these two files in the project:

- `client-success.js`
- `index.html`

Redeploy, then hard refresh with `Ctrl + Shift + R`.

No new SQL migration is required for this V5 update. The earlier V3 SQL remains required only for brand assignment and unassignment database functions if it has not already been applied.
