# CS360 Special Case Templates Click Fix

## Summary

This change makes the visible **Special Case Templates** control open the Special Case Templates panel in Customer Success 360.

## What changed

- Added a concrete `data-cs-action="special-templates-open"` action to the header button.
- Routed that action through the main Customer Success delegated click handler.
- Added `openSpecialCaseTemplates()` to switch to the Special Case Templates panel and force-refresh template data.
- Added `loadSpecialCaseTemplates({ force: true })` to reload:
  - `cs_special_case_templates`
  - `cs_special_case_groups`
  - `cs_special_case_brands`
  - `cs_special_case_locations`
- Updated Special Case Template table action attributes:
  - `special-template-create`
  - `special-template-edit`
  - `special-template-archive`
  - `special-template-use-completion`
  - `special-template-view-report`
- Updated permission mapping so view/list/get/export users can open and view templates, while create/update/delete remain restricted to their matching actions.
- Kept normal client, group, brand, completion entry, report export, and existing CS360 flows unchanged.

## Validation notes

Recommended checks in the browser:

1. Click **Special Case Templates** from the CS360 header.
2. Confirm the Special Case Templates panel opens.
3. Confirm templates load and the table renders.
4. Confirm users with view/list/get/export can open and view templates.
5. Confirm users without create/update/delete do not see restricted Create/Edit/Archive actions.
6. Confirm Admin/CSM users can create, edit, archive, use in completion, and view reports.
7. Confirm normal client completion and export still work.
