# Client Success 360 Patch

Admin-only Customer Success module.

Apply order for a fresh install:

1. Run `sql/migrations/20260708_client_success_360_admin_only.sql` in Supabase.
2. Upload the changed frontend files from this zip to the deployed project.
3. Clear browser cache / redeploy Vercel.

If you already applied the first CS patch, run these extra SQL files in order:

1. `sql/migrations/20260708_client_success_360_signed_clients_location_completion_fix.sql`
2. `sql/migrations/20260708_client_success_360_client_groups_admin_only.sql`

Latest updates:

- Client list now shows only companies that have signed/active/executed agreements.
- Added **Location Completion** tab.
- Completion is calculated as:

`Completion = Done On-Time + Done Late`

- Location table shows:
  - Location
  - Done On-Time
  - Done Late
  - Completion
  - Partially Done
  - Missed
- Added **CS Client Groups**:
  - Create a parent CS group.
  - Add multiple signed-agreement company clients under the same group.
  - Filter client list by group.
  - Show group members with health, CS effort, and completion.

Scope included:

- Client Success 360 workspace
- Signed-agreement clients only
- Client Groups / parent account grouping
- Weekly/monthly Client Pulse Review
- Location completion monitoring
- Satisfaction and CS effort levels
- Tasks and follow-ups
- Risks and escalations
- Onboarding follow-up visibility
- Renewal relationship/status visibility
- QBRs
- Client contacts/champions
- Client timeline
- Admin-only permission matrix and RLS

Excluded by design:

- Invoices
- Receipts
- Payments
- Pending amounts
- Collection follow-ups
- Accounting visibility

## Decimal Completion Fix

If the CS module was already installed and decimals are rejected in Location Completion, run this migration after the previous CS migrations:

```sql
sql/migrations/20260708_client_success_360_completion_decimal_fix.sql
```

Frontend change included: Location Completion inputs now use `step="0.01"`, accept comma or dot decimals, and display percentages with two digits after the decimal.



## v5 updates

- Moved **CSM Daily Activity** under the **Customer Success** menu group, directly below **Client Success 360**.
- Added CSM Daily Activity scope: **Signed Client**, **CS Client Group**, or **Manual Client**.
- Added group-level activity creation from the Client Success 360 Groups tab.
- Customer Success contacts now come from the main **Contacts** module.
- Creating a contact from Client Success 360 also creates it in the main **Contacts** module, then adds CS-specific relationship metadata.

If you already installed the previous CS module, run only:

```sql
sql/migrations/20260708_client_success_360_csm_group_contacts_sync.sql
```

## v6 updates

- Location Completion now supports **Current Client** or **CS Client Group** scope.
- When **CS Client Group** is selected, the user enters Done On-Time, Done Late, Partially Done, and Missed **one time only**.
- All group company/location lines are generated automatically.
- Every location line auto-calculates Completion using:

`Completion = Done On-Time + Done Late`

- No SQL migration is required for this v6 change if the previous CS migrations are already installed.
- Still Admin-only and still excludes all payment/accounting data.

## v7 updates

- Group Location Completion changed to the requested behavior:
  - Select **CS Client Group** once.
  - Enter results for each company/location in the group from one screen.
  - The **All Group Locations** line is read-only and auto-calculated from all rows below.
  - The top group totals are the sum of Done On-Time, Done Late, Partially Done, and Missed from all displayed locations.
  - Group Completion remains: `Done On-Time + Done Late`.
- Removed editable/duplicate pseudo location rows like **All locations** from the saved location target list.
- Active client locations are now deduplicated by normalized location name.
- For duplicated locations across older agreements, the latest service period row is used.
- Active locations are preferred from `invoice_items` Annual SaaS service rows because they represent the actually invoiced/live locations. This is used only for location/service-date detection, not for payments, totals, receipts, collections, or accounting.
- No SQL migration is required for this v7 change.

## v8 updates

- Location Completion values are now handled as **percentages**, not counts.
- Validation added so that for each location:
  - `Done On-Time + Done Late + Partially Done + Missed` cannot exceed **100%**.
- In group scope:
  - The **All Group Locations** line is auto-calculated as the **average percentage** from all location rows below.
  - Group Completion is the average of `(Done On-Time + Done Late)` across all listed group locations.
- Added **Export Completion Report** button in the Location Completion tab.
- The export opens a branded, UI-friendly **InCheck 360 Completion Report** with:
  - InCheck 360 logo
  - client details
  - period / group chips
  - summary cards
  - completion breakdown bars
  - location-level completion table
  - print / save PDF support
- No SQL migration is required for this v8 export/update if previous CS migrations are already installed.

## v9 updates

- Upgraded **Export Advanced Report** for Location Completion.
- The exported report is no longer a plain Excel-style table. It now opens a branded InCheck 360 report page with:
  - InCheck 360 logo / fallback wordmark
  - Completion Report header
  - Scope metadata: client or selected CS group, review type, period, generated date
  - KPI cards for Completion, Done On-Time, Done Late, Partially Done, Missed, and active locations
  - Overall completion donut chart
  - Completion breakdown stacked bar
  - All Client/Group Locations auto-calculated summary card
  - Location Completion Details table with client, location, Done On-Time, Done Late, Partially Done, Missed, and Completion
  - Best performing location callout
  - Locations needing extra CS effort callout
  - Notes section explaining percentage logic
  - Print / Save PDF support
- Report logic remains:

`Completion % = Done On-Time % + Done Late %`

- If a CS group is selected in the Customer Success group filter, the export uses the selected group and averages all group location rows.
- If no group is selected, the export uses the current selected client.
- No SQL migration is required for this v9 export improvement.

## v10 updates

- Fixed the **Completion Breakdown** section in the exported report when using browser **Print / Save PDF**.
- Replaced the CSS flex stacked bar with a print-safe inline SVG stacked bar so the colored segments display correctly in saved PDF, not only in the web preview.
- Added print color preservation rules:
  - `-webkit-print-color-adjust: exact`
  - `print-color-adjust: exact`
- Completion report logic remains unchanged:

`Completion % = Done On-Time % + Done Late %`

- No SQL migration is required for this v10 export/PDF fix.

- Completion export report now uses the same official InCheck 360 document logo used in proposals and agreements.


## 2026-07-08 UI Refresh

Updated the Client Success 360 workspace UI to match the approved modern dashboard mockup:
- cleaner hero header and action buttons
- 6 modern KPI cards
- completion breakdown card with percentage stack
- average completion trend card
- completion-by-status donut card
- AI-style insights / quick-action panel
- compact client/group overview table
- export report button remains available from the dashboard


## 2026-07-08 Landscape A4 Export Fix

Completion export is now optimized for A4 landscape:
- adds `@page { size: A4 landscape }`
- separates the export into a summary page and a location-details page
- removes web-only cramped side panels from table pages
- repeats the official document logo on report pages
- repeats table headers on page breaks
- avoids overlapping small percentage labels in the breakdown chart
- adds an on-screen print hint to use A4 Landscape and disable browser headers/footers


## 2026-07-08 Brand Layer

Added a third Customer Success layer:

```text
Client Group / Client
└── Brand
    └── Locations
```

What changed:
- New Brands tab in Client Success 360
- New `+ Brand` and `+ Brand Location` actions
- Brands can be scoped to the current client or to a CS client group
- Locations can be assigned to a brand
- Completion entry now supports `CS Brand` scope
- Brand result line is auto-calculated from assigned brand locations
- Brand completion export is available from the Brands tab
- Admin-only access remains

Run:

```text
sql/migrations/20260708_client_success_360_brand_layer_admin_only.sql
```


## 2026-07-08 Brand/Sub-group Report Enhancement

Clarified usage:
- Use CS Brands as sub-groups inside a client group.
- Example: `Kcal Group` can be divided into `Kcal KSA` and `Kcal UAE`.
- Assign each active location to the correct brand/sub-group.
- Group completion export now includes an extra `Brand Completion Insights` page before the location details.
- Brand insights show:
  - top performing brand
  - lowest performing brand
  - completion gap between brands
  - brand-level Done On-Time / Done Late / Partially Done / Missed / Completion
  - weak locations under each brand needing extra CS effort

No new SQL is required if the brand layer migration is already installed.


## 2026-07-08 Brand Location Move Fix

Fixes:
- Brand tab action buttons now render as real buttons, not raw HTML text.
- Brand location manager now supports adding, moving, and removing locations.
- A group/client can be divided into multiple brands, but each location belongs to only one brand within the same group/client scope.
- Adding a location to another brand automatically moves it from the previous brand in that same scope.
- Added assigned-locations table inside the brand location manager.

Run this SQL if the brand layer is already installed:

```text
sql/migrations/20260708_client_success_360_brand_location_move_unique_fix.sql
```


## 2026-07-08 Brand Flow Refinement

Brand flow is now:

```text
1. Create brand name only
2. Open Manage Locations / Assign Location to Brand
3. Assign, remove, or move locations between brands
```

Behavior:
- If the brand is created under a CS group, the assignment screen shows all locations from that group.
- If the brand is created under one client, the assignment screen shows only that client’s locations.
- A client or group can be divided into multiple brands.
- Moving a location to another brand automatically removes it from the previous brand in the same client/group scope.


## 2026-07-08 Brand Location Visibility Fix

Changed Manage Brand Locations from a single dropdown into two clear tables:

- Available Locations: shows all locations in the selected brand scope immediately
- Assigned Locations: shows locations already assigned to the selected brand

Rules:
- Group-scoped brand: shows all group locations
- Client-scoped brand: shows only that client’s locations
- Each available location shows whether it is unassigned, assigned here, or currently in another brand
- You can Assign, Move Here, Remove, or Move to another brand


## 2026-07-08 Assign Button Click Fix

Fixed Brand Location assignment buttons:
- Added direct click binding inside the Manage Brand Locations modal
- Assign / Move Here now uses `getAttribute` instead of fragile dataset parsing
- Added error handling so assignment failures show a toast instead of silently doing nothing
- Prevented form/table click propagation issues inside the modal


## 2026-07-08 Completion Export Type Selector

Added a dedicated export selector with three report types:

```text
1. Client Completion Report
2. Group Completion Report
3. Brand / Sub-group Completion Report
```

Behavior:
- Client report exports the currently selected signed client.
- Group report exports the selected CS client group and includes brand insights if brands are configured.
- Brand report exports one selected brand/sub-group, for example Kcal KSA or Kcal UAE.
- Existing Brand tab export buttons still export the selected brand directly.


## 2026-07-08 Export Selector Fix

Fixed export not opening:
- Removed unsafe `selectedFilterGroup?.()` call that could throw before the export modal opens
- Added validation for group/brand export selections
- Added user-friendly toast if no locations are found for the selected export type
- Added try/catch around the report popup generation


## 2026-07-09 Export Wording Update

Export report changes:
- Removed the `Scope` card from the export header.
- Replaced `Locations needing extra CS effort` with `Locations needing operational attention`.
- Adjusted export meta layout so remaining header cards stay balanced.


## 2026-07-09 Location Details Export Cleanup

Location Completion Details export page:
- Removed the small summary cards from the page header.
- Removed the subtitle text `no duplicate locations · brand page included when configured`.


## 2026-07-09 Export Footer Text

Export footer changed from:

```text
InCheck 360 · Customer Success 360
```

to:

```text
InCheck 360 · Customer Success
```


## 2026-07-09 Group Brand Export Fix

Group completion report brand page now includes the full brand split:
- brands created directly under the selected group
- brands created under any client inside the selected group
- brands referenced by assigned brand-location rows in the group
- an `Unassigned Locations` row if some group locations are not assigned to any brand

This fixes cases like `Kcal Group` where the report must show `Kcal KSA` and `Kcal UAE`, not only one brand.


## 2026-07-09 Single Brand Export Comparison Fix

Brand/Sub-group export report now hides comparison fields when only one brand is included:
- hides Best Brand
- hides Lowest Brand
- hides Gap
- hides the comparison insight cards

These comparison sections appear only when the report contains 2 or more brands.


## 2026-07-09 Export Top-Left Logo Fix

Completion export now fills the top-left report header with the official InCheck 360 document logo:
- Uses the same `Utils.addIncheckDocumentLogo` helper used by proposal/agreement previews when available.
- Adds a safe fallback logo slot so the top-left area is not blank if the helper is unavailable.
- Adds a `<base>` tag so logo assets resolve correctly in the export popup.


## 2026-07-09 Logo Size and Operational Attention Calculation

Export fixes:
- Enlarged the official InCheck 360 document logo in the top-left header area.
- Fixed the `Needs operational attention` brand insight card so it shows the count of locations needing attention, not the weak brand completion percentage.
- The card now shows, for example: `3 locations` and `3 of 6 locations (50.00%) need operational attention`.


## 2026-07-09 Customer Success Role Access

Access model updated:

```text
Full access:
- admin
- csm
- gm / general_manager
- sfc / senior_financial_controller

View-only:
- viewer
```

Viewer can:
- open Customer Success 360
- view clients, groups, brands, completion, pulse reviews, tasks, risks, QBR, contacts, timeline
- export reports

Viewer cannot:
- create/edit/delete completion
- create/edit groups or brands
- assign/move/remove brand locations
- create pulse reviews, tasks, risks, QBRs, or contacts

Run:

```text
sql/migrations/20260709_client_success_360_role_access_csm_gm_sfc_viewer.sql
```
