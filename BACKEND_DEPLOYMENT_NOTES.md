# Backend deployment and patch-risk note

This project currently relies on a Google Apps Script backend behind a Vercel proxy (`/api/proxy`).

## Known risks (no behavior change in this patch)

- **Patch-heavy backend growth risk**: repeated route aliases and fallback actions (for example, multiple `workflow` action names) can mask contract drift over time.
- **Layered override risk**: when behavior is spread between Apps Script aliases, frontend fallback logic, and proxy-level parsing, a hotfix in one layer may accidentally conflict with another.
- **Deployment mismatch risk**: Vercel can point at one Apps Script deployment URL while manual Apps Script edits are published to a different deployment/version.

## Operational guidance

- Keep `APPS_SCRIPT_WEBAPP_URL` in Vercel env synced to the intended active Apps Script deployment URL.
- Prefer updating backend route/action compatibility in one place and removing stale aliases once clients are migrated.
- When debugging failures, capture proxy error payload fields (`upstreamStatus`, `contentType`, `upstreamBodySample`, `resource`, `action`) before changing business logic.

