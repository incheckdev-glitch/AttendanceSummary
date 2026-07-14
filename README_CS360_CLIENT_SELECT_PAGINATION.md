# CS360 Client Selector Pagination

## Overview

Client Success 360 now paginates client selector data in the browser after the CS360 client list has been loaded. This keeps the existing signed-agreement, active invoice location, group, brand, completion entry, report, export, and special-client flows intact while avoiding oversized selector/list rendering.

## Behavior

- Default page size is **25** clients.
- Supported page sizes are **25**, **50**, and **100**.
- Client rows are sorted alphabetically by client/company name.
- Search resets pagination to page 1.
- Search matches client/company name, group name, brand name, and location name across the full loaded CS360 client set, not only the current page.
- Previous is disabled on page 1.
- Next is disabled on the last page.
- Empty search results display **No clients found.**
- If a selected client is outside the current page, form selectors keep that client available at the top as `Selected: Client Name` so changing pages does not drop the current selection.

## Frontend Helpers

The pagination implementation adds these client helpers in `client-success.js`:

- `getFilteredCsClients(search = '')`
- `getPaginatedCsClients(search = '', page = 1, pageSize = 25)`
- `renderClientSelectPagination(meta)`
- `updateClientSelectPage(nextPage)`
- `updateClientSelectSearch(value)`

Special CS client filtering/pagination helpers and controls are also present. They use `STATE.specialClientSelectPagination` so special-client data stays separate from normal CS clients.

## Actions / Handlers

The UI uses the CS360 action router/data-action pattern:

- `data-cs-action="client-select-prev-page"`
- `data-cs-action="client-select-next-page"`
- `data-cs-action="client-select-page-size"`
- `data-cs-action="client-select-search"`
- `data-cs-action="special-client-select-prev-page"`
- `data-cs-action="special-client-select-next-page"`
- `data-cs-action="special-client-select-page-size"`
- `data-cs-action="special-client-select-search"`

Selecting a client updates `STATE.selectedCompanyId` and the hidden `company_id` form field. In completion entry, changing the selected client rebuilds location completion rows so locations continue loading for the selected page/client.

## Styling

`client-success.css` adds compact styling for:

- `.cs-client-select-pagination`
- `.cs-client-select-search`
- `.cs-client-select-page-info`
- `.cs-client-select-page-size`

## Notes

No database query is run when clicking Previous/Next. Pagination uses the loaded CS360 client list in memory.
