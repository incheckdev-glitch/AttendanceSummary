# InCheck360 ERP — Phase 1 Safety Foundation

This phase adds development and pull-request safeguards without changing production ERP runtime behavior.

## What this phase adds

1. A regression runner that executes the established ERP tests in their existing order and reports every failure at the end.
2. JavaScript syntax checking for top-level browser scripts, regression tests, and repository safety scripts.
3. SQL migration checks for empty files, merge-conflict markers, possible embedded credentials, and destructive-statement warnings.
4. A GitHub Actions workflow that runs the checks for pull requests targeting `main`.
5. A pull-request checklist covering data integrity, RLS, SQL, backups, testing, and rollback.
6. An update to the stale contact-company dropdown regression assertion so it verifies the current controlled fallback behavior instead of rejecting it.

## Commands

```bash
npm ci --ignore-scripts
npm run check:syntax
npm run check:migrations
npm test
npm run ci
```

`npm run ci` runs all blocking Phase 1 checks.

## Runtime impact

No ERP module, form, calculation, database write path, service worker, or user permission is changed by this phase.

The only existing source file adjusted is a regression test. Its updated assertions preserve the primary company-UUID RPC requirement and verify that fallback contact loading only occurs after the primary RPC returns no rows and remains filtered to the selected company.

## GitHub branch protection after approval

After this pull request is approved and merged, configure the `main` branch so that:

- Pull requests are required before merging.
- The `Regression, syntax, and migration checks` status check is required.
- Required checks must pass before merging.
- Branches must be up to date before merging.
- At least one approval is required for sensitive changes.
- Direct pushes to `main` are restricted.

Repository administrators should retain an emergency process, but emergency changes should still be followed by a documented pull request and regression run.

## Rollback

Revert the Phase 1 pull request. Since this phase includes no database migration and no runtime ERP source changes, rollback requires no SQL or production-data correction.
