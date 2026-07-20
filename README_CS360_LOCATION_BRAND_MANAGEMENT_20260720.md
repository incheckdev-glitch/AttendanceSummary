# CS360 Location Names and Brand Management — 2026-07-20

## Included changes

### CS360-only location labels

The Customer Success 360 display now uses:

- `Lr muroo` → `LR Muroor`
- `LR Defence` → `LR Motor City`
- `ZL khalidya` → `ZL al Forsan Cloud Kitchen`

The frontend override covers locations loaded from invoices, agreements, completion history, brand assignments, special clients, and exports without renaming the source commercial/accounting records.

Run `sql/migrations/20260720_cs360_location_names_and_brand_management.sql` once to correct already-saved CS360 snapshots.

### Normal-client brand management

- An assigned location now shows an explicit **Unassign** button in the Available Locations table.
- The Assigned Locations table also uses **Unassign** instead of **Remove**.
- After assign, move, or unassign, the Manage Brand Locations dialog reopens on the same brand.

### Export behavior

The Brand Completion Insights page is generated only when at least one brand is actually configured for the selected client, group, or Special CS Client. A report with no configured brands now skips the brand page completely.

### Special CS Client brand management

Standalone Special CS Clients now include a **Brand Management** tab where authorized users can:

- assign an unassigned location to a brand;
- move a location to another brand;
- unassign a location from its current brand.

When a Special CS Client is edited, matching existing assignments are preserved. Newly added locations start unassigned so they can be assigned intentionally from Brand Management.
