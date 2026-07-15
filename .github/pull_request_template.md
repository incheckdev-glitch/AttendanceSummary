## Summary

Describe the change and the business problem it solves.

## Scope

- Modules affected:
- Runtime files changed:
- Database migration required: Yes / No
- Production data correction included: Yes / No

## Safety and data integrity

- [ ] The change is isolated to a feature branch.
- [ ] Existing behavior was reviewed before implementation.
- [ ] No secrets, passwords, service-role keys, or database credentials are committed.
- [ ] Database writes fail visibly; the UI does not report success for local-only data.
- [ ] Multi-table financial or payroll changes are transactional or have a documented recovery path.
- [ ] Role permissions and Supabase RLS were reviewed for every changed table or RPC.

## Validation

- [ ] `npm run ci` passes.
- [ ] Affected roles were tested.
- [ ] Affected create, edit, view, print/export, and refresh flows were tested.
- [ ] Mobile/PWA behavior was checked when relevant.
- [ ] Agreement, invoice, receipt, payroll, or accounting totals were compared before and after when relevant.

## SQL and deployment

- Migration file(s):
- Required execution order:
- Backup required before deployment: Yes / No
- Cache/service-worker version change required: Yes / No

## Rollback

Explain exactly how to restore the previous frontend and database behavior.

## Evidence

Add screenshots, logs, test output, or calculation comparisons as appropriate.
