# CS360 Group Company UUID Fix

## Error fixed

`Unable to add client to group: invalid input syntax for type uuid: "Company#00013"`

The problem was caused by CS360 using a visible client reference such as `Company#00013` as the database `company_id`.

## Changes

- Database writes now use a valid UUID only.
- A linked Companies-module UUID is preferred.
- When no linked company is available, the UUID from the client registry record is used.
- Visible references such as `Company#00013` remain display/reference values and are never sent to UUID columns.
- Duplicate-client merging preserves and resolves all UUID aliases.
- Group membership reads match merged client aliases.
- Normal completion and company-scoped brand writes also use the resolved UUID.
- A clear message appears when a client genuinely has no usable UUID.

## Deployment

Replace:

- `client-success.js`
- `client-success.css`

No SQL migration is required.

Hard refresh:

`Ctrl + F5`
