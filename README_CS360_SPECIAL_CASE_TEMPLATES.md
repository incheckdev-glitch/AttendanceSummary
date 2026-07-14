# CS360 Special Case Templates

Special Case Templates add an optional Customer Success 360 completion-report source for demos, QA clients, pilots, or other one-off reporting cases that must not depend on signed agreements, invoices, active invoice periods, payment, or accounting data.

## Files

- `sql/migrations/20260710_cs360_special_case_templates.sql`
- `client-success.js`
- `client-success.css`

## Data Model

The migration creates safe, separate template tables:

- `cs_special_case_templates`
- `cs_special_case_groups`
- `cs_special_case_brands`
- `cs_special_case_locations`

Completion values are stored in `cs_location_completions` with:

- `source_type = 'special_template'`
- `special_template_id`
- `special_location_id`
- location, brand, and group snapshots

Normal CS360 completion rows continue to use normal source logic and are not sourced from these tables.

## Permissions

RLS policies use existing CS360 helper functions:

- `cs360_can_select()` for list/view/export
- `cs360_can_insert()` for create
- `cs360_can_update()` for edit
- `cs360_can_delete()` for archive/delete

## Admin Flow

1. Open Customer Success 360.
2. Open **Special Case Templates**.
3. Click **Create Template**.
4. Enter template name, display client name, optional description/status.
5. Paste groups, brands, and locations one per line.
6. Save.
7. Use **Use in Completion Report** to enter completion percentages.
8. Use **View Report** to export a report that marks the source as `Special Case Template`.

## Notes

- Only active templates appear in completion entry and report selection.
- Archived templates are hidden from active selectors but old completion history remains because completions reference nullable template/location ids.
- Completion formula remains `Done On-Time + Done Late`.
- Normal signed-agreement / active-invoice client loading is intentionally unchanged.
