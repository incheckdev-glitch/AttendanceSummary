Final module loading fix - 2026-07-03

What was fixed:
1. Clients module no longer sends display references like Company#00032 to clients.id UUID filters.
2. Client total persistence is disabled during normal dashboard/module loading to avoid repeated 400/RLS errors.
3. Signed-agreement client rows with non-UUID ids are kept for UI only and not used for DB UUID updates.
4. Proposal display reference enrichment in Agreements remains optional and non-blocking.
5. Company option dropdown fallback no longer depends on created_at/updated_at ordering.
6. Script cache-busting versions were updated in index.html.
7. Service worker static cache version was increased so browsers fetch the new scripts.

Apply steps:
1. Replace the updated files.
2. Redeploy frontend/Vercel.
3. Open the app in incognito or hard refresh.
4. If the app is installed as PWA, close/reopen or clear site data once.

Expected console result:
- No repeated /clients?id=eq.Company#000xx 400 errors.
- Modules should load normally.
- Optional enrichment warnings should not block module loading.
