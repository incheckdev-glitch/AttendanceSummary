# Client Success 360 Patch

Admin-only Customer Success module.

Apply order:

1. Run `sql/migrations/20260708_client_success_360_admin_only.sql` in Supabase.
2. Upload the changed frontend files from this zip to the deployed project.
3. Clear browser cache / redeploy Vercel.

Scope included:
- Client Success 360 workspace
- Weekly/monthly Client Pulse Review
- Satisfaction and CS effort levels
- Tasks and follow-ups
- Risks and escalations
- Onboarding follow-up visibility
- Renewal relationship/status visibility
- QBRs
- Client contacts/champions
- Client timeline
- Admin-only permission matrix and RLS

Excluded by design:
- Invoices
- Receipts
- Payments
- Pending amounts
- Collection follow-ups
- Accounting visibility
