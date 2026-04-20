(function initEventsService(global) {
  const TABLE = 'events';
  const WRITE_ROLES = new Set(['admin', 'dev']);
  const EVENT_COLUMNS = new Set([
    'event_code',
    'title',
    'description',
    'start_at',
    'end_at',
    'location',
    'status',
    'created_by',
    'updated_by'
  ]);

  function getClient() {
    return global.SupabaseClient.getClient();
  }

  function getCurrentRole() {
    return String(global.Session?.role?.() || '').trim().toLowerCase();
  }

  function canWrite() {
    return WRITE_ROLES.has(getCurrentRole());
  }

  function readableError(prefix, error) {
    const message = String(error?.message || error?.error_description || 'Unknown error');
    return new Error(`${prefix}: ${message}`);
  }

  function parseDateValue(value) {
    if (value === undefined || value === null) return '';
    const raw = String(value).trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(raw)) return raw.replace(/\s+/, 'T');
    return raw;
  }

  function parseModules(value) {
    if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
    if (typeof value !== 'string') return [];
    return value
      .split(/[,\n;|]/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function safeJsonObject(value) {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
    return {};
  }

  function eventDisplayId(event = {}) {
    const code = String(event.event_code || event.eventCode || '').trim();
    const id = String(event.id || '').trim();
    return code || id;
  }

  function normalizeEventRow(row = {}) {
    const raw = row && typeof row === 'object' ? row : {};
    const id = String(raw.id || raw.event_id || '').trim();
    const eventCode = String(raw.event_code || raw.code || '').trim();
    const start = parseDateValue(raw.start_at ?? raw.start ?? raw.startDate ?? raw.date);
    const end = parseDateValue(raw.end_at ?? raw.end ?? raw.endDate ?? raw.finish);
    const metadata = safeJsonObject(raw.metadata || raw.meta || raw.event_meta);
    const readiness = safeJsonObject(metadata.readiness || raw.readiness || raw.checklist);

    return {
      ...raw,
      id,
      event_code: eventCode,
      eventCode,
      displayId: eventDisplayId({ id, event_code: eventCode }),
      title: String(raw.title || raw.eventTitle || raw.name || '').trim(),
      description: String(raw.description || raw.notes || '').trim(),
      start,
      end,
      start_at: start,
      end_at: end,
      location: String(raw.location || '').trim(),
      status: String(raw.status || 'Planned').trim() || 'Planned',
      // Legacy UI fields kept for compatibility, defaulted when not present in public.events.
      type: String(raw.type || raw.eventType || 'Other').trim() || 'Other',
      allDay: Boolean(raw.allDay || raw.all_day),
      issueId: String(raw.issueId || raw.issue_id || raw.ticketId || '').trim(),
      env: String(raw.env || raw.environment || 'Prod').trim() || 'Prod',
      owner: String(raw.owner || '').trim(),
      modules: parseModules(raw.modules),
      impactType: String(raw.impactType || raw.impact || 'No downtime expected').trim() || 'No downtime expected',
      notificationStatus: String(raw.notificationStatus || raw.notification_status || '').trim(),
      readiness,
      checklist: readiness
    };
  }

  function stripUnknownColumns(record = {}) {
    const sanitized = {};
    Object.entries(record || {}).forEach(([key, value]) => {
      if (!EVENT_COLUMNS.has(key)) return;
      if (value === undefined || value === null) return;
      sanitized[key] = value;
    });
    return sanitized;
  }

  async function getCurrentUserId(client) {
    try {
      const { data, error } = await client.auth.getUser();
      if (error) return '';
      return String(data?.user?.id || '').trim();
    } catch {
      return '';
    }
  }

  async function toCreatePayload(input = {}) {
    const userId = await getCurrentUserId(getClient());
    const mapped = {
      event_code: input.event_code || input.eventCode || '',
      title: input.title || input.eventTitle || '',
      description: input.description || input.notes || '',
      start_at: parseDateValue(input.start_at ?? input.start ?? input.startDate ?? input.date),
      end_at: parseDateValue(input.end_at ?? input.end ?? input.endDate ?? input.finish),
      location: input.location || '',
      status: input.status || 'Planned',
      created_by: input.created_by || input.createdBy || userId || undefined,
      updated_by: input.updated_by || input.updatedBy || userId || undefined
    };
    return stripUnknownColumns(mapped);
  }

  async function toUpdatePayload(input = {}) {
    const userId = await getCurrentUserId(getClient());
    const mapped = {
      event_code: input.event_code ?? input.eventCode,
      title: input.title ?? input.eventTitle,
      description: input.description ?? input.notes,
      start_at: input.start_at !== undefined || input.start !== undefined || input.startDate !== undefined || input.date !== undefined
        ? parseDateValue(input.start_at ?? input.start ?? input.startDate ?? input.date)
        : undefined,
      end_at: input.end_at !== undefined || input.end !== undefined || input.endDate !== undefined || input.finish !== undefined
        ? parseDateValue(input.end_at ?? input.end ?? input.endDate ?? input.finish)
        : undefined,
      location: input.location,
      status: input.status,
      updated_by: input.updated_by || input.updatedBy || userId || undefined
    };
    return stripUnknownColumns(mapped);
  }

  async function listEvents() {
    const client = getClient();
    const { data, error } = await client.from(TABLE).select('*').order('updated_at', { ascending: false });
    if (error) throw readableError('Unable to load events', error);
    return Array.isArray(data) ? data.map(normalizeEventRow) : [];
  }

  async function getEventDetails(id) {
    const eventId = String(id || '').trim();
    if (!eventId) throw new Error('Event id is required.');
    const client = getClient();
    const { data, error } = await client.from(TABLE).select('*').eq('id', eventId).single();
    if (error) throw readableError('Unable to load event', error);
    return normalizeEventRow(data);
  }

  async function createEvent(input = {}) {
    if (!canWrite()) throw new Error('Only admin/dev can create events.');
    const payload = await toCreatePayload(input);
    const client = getClient();
    const { data, error } = await client.from(TABLE).insert(payload).select('*').single();
    if (error) throw readableError('Unable to create event', error);
    return normalizeEventRow(data);
  }

  async function updateEvent(id, updates = {}) {
    if (!canWrite()) throw new Error('Only admin/dev can update events.');
    const eventId = String(id || updates.id || '').trim();
    if (!eventId) throw new Error('Event id is required.');
    const payload = await toUpdatePayload(updates);
    const client = getClient();
    const { data, error } = await client.from(TABLE).update(payload).eq('id', eventId).select('*').single();
    if (error) throw readableError('Unable to update event', error);
    return normalizeEventRow(data);
  }

  async function deleteEvent(id) {
    if (!canWrite()) throw new Error('Only admin/dev can delete events.');
    const eventId = String(id || '').trim();
    if (!eventId) throw new Error('Event id is required.');
    const client = getClient();
    const { error } = await client.from(TABLE).delete().eq('id', eventId);
    if (error) throw readableError('Unable to delete event', error);
    return true;
  }

  global.EventsService = {
    canWrite,
    normalizeEventRow,
    listEvents,
    getEventDetails,
    createEvent,
    updateEvent,
    deleteEvent,
    toCreatePayload,
    toUpdatePayload
  };
})(window);
