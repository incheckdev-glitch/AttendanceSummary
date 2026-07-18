# Company verification save fix

Updated files:

- `companies.js`
- `supabase-data.js`
- `index.html`

Fixes:

- Verification and re-verification now complete immediately after the core company update succeeds.
- Audit-log failures no longer cancel an already successful company verification save.
- Company verification updates retry safely when an optional verification column is missing from the Supabase schema cache.
- The verification button no longer remains stuck while the company list and selector caches refresh.
- Added cache-busting versions for the updated scripts.
