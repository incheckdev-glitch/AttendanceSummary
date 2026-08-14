# Agreement#00099 Blank Customer Signatory — V34

## Fix
For Agreement#00099 only, the Customer Official Signatory remains blank in:

- Agreement web form/view
- Agreement preview
- Extracted/printed PDF

The company authorized-signatory fallback is disabled only for Agreement#00099. All other agreements continue using the existing signatory rules.

## Install
1. Replace `agreements.js`.
2. Replace `index.html`.
3. Redeploy.
4. Press `Ctrl + Shift + R` and reopen Agreement#00099.

No Supabase SQL is required.
