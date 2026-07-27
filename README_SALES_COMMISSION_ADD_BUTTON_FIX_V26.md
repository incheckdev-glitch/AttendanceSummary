# Sales Commission Tracker — Add Commission Modal Fix V26

## Fixed

The **Add Commission** click handler was working, but the form did not appear because the Commission Tracker added the CSS class `show` while the platform's shared modal stylesheet displays modals with the class `open`.

V26 now adds both `open` and `show` when opening a commission modal and removes both when closing it.

## Updated files

- `commission-tracker.js`
- `index.html`

## Installation

1. Replace the two files in the project root.
2. Redeploy.
3. Sign out and sign back in.
4. Press **Ctrl + Shift + R**.

No SQL migration is required. The V24 Sales Commission database migration must already be installed.
