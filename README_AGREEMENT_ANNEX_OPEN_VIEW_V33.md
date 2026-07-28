# Agreement Annex Open / View Fix — V33

## Issue
The annex existed and its banner was visible, but there was no reliable way to reopen it as a read-only agreement. In some deployments annex rows are not returned by the normal Agreements list/RPC, so the standard View action is unavailable.

## Fix
- Adds **View Annex** directly to the blue annex banner.
- Keeps **Preview Annex** beside it.
- Adds **Open Parent Agreement** to return to the signed parent.
- Makes the existing **View Annex / Edit Annex** buttons in the parent's annex table use a direct Supabase fallback.
- The fallback loads the annex and its items by UUID even when the normal Agreements list does not include annex rows.
- Respects the existing agreement view permission.

## Installation
Replace:
- `agreement-annex.js`
- `index.html`

Redeploy, sign out and back in, then hard refresh with `Ctrl + Shift + R`.

No new SQL is required. The V31 annex migration must already be installed.
