E-Agreement update apply steps

Updated files in this ZIP:
- agreements.js
- app.js
- index.html
- supabase/functions/eproposal-action/index.ts
- supabase/functions/eagreement-action/index.ts
- sql/migrations/20260630_e_agreement_guest_links.sql

Apply steps:
1. Replace the files in your project with the same paths from this ZIP.
2. Run sql/migrations/20260630_e_agreement_guest_links.sql in Supabase SQL Editor.
3. Deploy Edge Functions:
   supabase functions deploy eproposal-action
   supabase functions deploy eagreement-action
4. Run in Supabase SQL Editor:
   notify pgrst, 'reload schema';
5. Redeploy frontend/Vercel.
6. Test in incognito:
   - Agreements menu shows Generate E-Agreement Link.
   - Public URL opens at /e-agreement/<token>.
   - Accept/Reject calls /functions/v1/eagreement-action.
   - agreement_guest_activity_logs stores IP and user agent.

Important:
- eproposal-action was also fixed to call _with_ip RPC wrappers.
- eagreement-action is a new Edge Function and must be deployed separately.
