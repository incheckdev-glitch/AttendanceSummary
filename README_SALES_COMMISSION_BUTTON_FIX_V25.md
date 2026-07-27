# Sales Commission Tracker — Button Fix V25

## Issue fixed
The Sales Commission Tracker view could be displayed through grouped CRM navigation or a restored hash/view without calling the module initializer. In that state, the interface was visible but Add Commission, Refresh, Export, Clear Filters, pagination, row actions, and modal buttons had no event handlers.

## Updated files
- `commission-tracker.js`
- `app.js`
- `index.html`

## Changes
- Added idempotent UI initialization and event binding.
- Added automatic startup when the Commission Tracker tab or view becomes active.
- Added a first-click fallback for controls when the normal view loader has not yet run.
- Updated the app loader to call `window.SalesCommissionTracker.init()` directly.
- Updated cache versions in `index.html`.

## Installation
1. Replace the three files in the project root.
2. Redeploy.
3. Sign out and sign back in.
4. Press `Ctrl + Shift + R`.

No Supabase SQL is required for V25. The original V24 commission migration must already be installed.
