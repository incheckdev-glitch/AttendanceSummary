# Client Success 360 Patch

Admin-only Customer Success module.

Apply order for a fresh install:

1. Run `sql/migrations/20260708_client_success_360_admin_only.sql` in Supabase.
2. Upload the changed frontend files from this zip to the deployed project.
3. Clear browser cache / redeploy Vercel.

If you already applied the first CS patch, run these extra SQL files in order:

1. `sql/migrations/20260708_client_success_360_signed_clients_location_completion_fix.sql`
2. `sql/migrations/20260708_client_success_360_client_groups_admin_only.sql`

Latest updates:

- Client list now shows only companies that have signed/active/executed agreements.
- Added **Location Completion** tab.
- Completion is calculated as:

`Completion = Done On-Time + Done Late`

- Location table shows:
  - Location
  - Done On-Time
  - Done Late
  - Completion
  - Partially Done
  - Missed
- Added **CS Client Groups**:
  - Create a parent CS group.
  - Add multiple signed-agreement company clients under the same group.
  - Filter client list by group.
  - Show group members with health, CS effort, and completion.

Scope included:

- Client Success 360 workspace
- Signed-agreement clients only
- Client Groups / parent account grouping
- Weekly/monthly Client Pulse Review
- Location completion monitoring
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

## Decimal Completion Fix

If the CS module was already installed and decimals are rejected in Location Completion, run this migration after the previous CS migrations:

```sql
sql/migrations/20260708_client_success_360_completion_decimal_fix.sql
```

Frontend change included: Location Completion inputs now use `step="0.01"`, accept comma or dot decimals, and display percentages with two digits after the decimal.

