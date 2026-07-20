# CS360 Export Client Label V7

## Change
The completion report export header now uses the standard labels:

- Client
- Brand
- Group

For an entire standalone/special CS client report, only one **Client** card is shown. The duplicate Special CS Client card was removed.

For a one-brand or one-group report, the header shows:

- Brand or Group
- Review Type
- Period
- Client

## Installation
1. Replace `client-success.js`.
2. Replace `index.html`.
3. Redeploy.
4. Hard-refresh with `Ctrl + Shift + R`.

No Supabase SQL is required.
