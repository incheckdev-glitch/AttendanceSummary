# CS360 No Duplicate Client Names

## Fixed

CS360 now guarantees one visible row per normalized client name.

Duplicate matching ignores harmless differences such as:

- Uppercase/lowercase
- Extra spaces
- Accents, such as `Café` and `Cafe`
- Punctuation
- Legal suffix formatting, such as `SAL`, `S.A.L.`, `LLC`, and `L.L.C.`

## How duplicates are handled

- Client registry and Companies-module rows with the same normalized name are merged.
- All original company/client IDs are preserved as aliases.
- Completion history, invoices, agreements, contacts, groups, and other CS360 data continue matching through those alias IDs.
- The client selector and paginated sidebar apply a second defensive dedupe.
- Special CS Client lists are also deduplicated by name.
- Creating a Special CS Client with a name already used by another Special CS Client or a normal CS360 client is blocked.
- Existing duplicate Special CS Client records are not deleted; only one preferred active/newest record is shown.

## Deployment

Replace:

- `client-success.js`
- `client-success.css`

No SQL migration is required.

Hard refresh:

`Ctrl + F5`
