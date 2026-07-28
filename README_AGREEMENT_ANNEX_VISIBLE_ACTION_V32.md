# Agreement Annex Visible Action — V32

## Fix
The annex flow was installed, but the action was only available in a lower section inside the agreement modal and could remain unavailable when the deployed permission model did not expose direct agreement creation.

V32 makes the action easy to find and uses the existing agreement-management permissions.

## Where the action appears
For every eligible signed parent agreement:

1. A visible **Create Annex** button appears directly in the Agreements table beside **View**.
2. A **Create Annex · Add Location** button appears in the agreement modal header.
3. The original **Agreement Annex · Additional Locations** section remains inside the agreement view.

The action does not appear on annex rows because another annex must be created from the parent agreement.

## Eligibility
The agreement is considered signed using the platform's signed-agreement lock logic, signed status, uploaded signed document, or signature dates.

Users may create an annex when they have agreement creation, agreement update, or create-invoice-from-agreement access.

## Installation
Replace:

- `agreement-annex.js`
- `index.html`

Redeploy, sign out and back in, then hard refresh with `Ctrl + Shift + R`.

No new SQL is required. The V31 annex SQL migration must already be installed.
