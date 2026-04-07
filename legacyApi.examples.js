import { apiRequest } from './legacyApi.js';

// before -> after examples
// Before:
// await fetch(API_BASE_URL, { method: 'POST', body: JSON.stringify({ resource: 'auth', action: 'login', email, password }) });
// After:
await apiRequest({ resource: 'auth', action: 'login', email: 'admin@example.com', password: 'secret123' });

await apiRequest({ resource: 'auth', action: 'logout' });
await apiRequest({ resource: 'auth', action: 'session' });

await apiRequest({ resource: 'tickets', action: 'list', filters: { status: 'Under Development' } });
await apiRequest({ resource: 'tickets', action: 'create', title: 'New issue', desc: 'Details', module: 'POS' });
await apiRequest({ resource: 'tickets', action: 'update', ticketId: 'INC-1001', desc: 'Updated details' });
await apiRequest({ resource: 'tickets', action: 'delete', ticketId: 'INC-1001' });

await apiRequest({ resource: 'events', action: 'list' });
await apiRequest({ resource: 'events', action: 'save', event: { id: 'ev_1', title: 'Release', start: '2026-04-15T10:00:00Z' } });
await apiRequest({ resource: 'events', action: 'delete', id: 'ev_1' });
