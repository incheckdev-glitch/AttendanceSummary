# InCheck360 Agreement Annex · Additional Location (V30)

## What was added

A signed agreement now includes an **Agreement Annex · Additional Locations** section.

The flow is:

1. Open an existing **Signed** agreement.
2. Select **Create Annex · Add Location**.
3. Enter the location, service period, SaaS price, discount, and optional one-time setup fee.
4. Review the prepared annex in the normal agreement editor and save it as a separate draft.
5. Complete the annex signatures and upload its signed document.
6. Select **Create Invoice** from the annex list to issue an invoice for the additional location.

The signed parent agreement is never edited or recalculated. Every annex remains linked to it and receives a reference such as `Agreement#00098-AN-01`.

## Included files

- `agreement-annex.js`
- `supabase-data.js`
- `index.html`
- `20260728_agreement_annex_extra_location_v30.sql`

## Installation

1. Run `20260728_agreement_annex_extra_location_v30.sql` in Supabase SQL Editor.
2. Replace `supabase-data.js` and `index.html`.
3. Add `agreement-annex.js` to the project root.
4. Redeploy the platform.
5. Sign out and back in, then use **Ctrl + Shift + R**.

## Notes

- Annex creation uses the existing agreement permissions.
- Invoice creation uses the existing invoice-from-agreement flow and its permission checks.
- Hardware or additional one-time lines can be added manually in the annex agreement editor before saving.
- The annex must be signed before its invoice can be issued.
