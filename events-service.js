(function initEventsService(global) {
  const TABLE = 'events';
  const EVENT_COLUMNS = new Set([
    'event_code',
    'title',
    'description',
    'start_at',
    'end_at',
    'location',
    'status',
    'type',
    'environment',
    'owner',
    'modules',
    'impact_type',
    'issue_id',
    'all_day',
    'readiness',
    'created_by',
    'updated_by'
  ]);

  function getClient() {
    return global.SupabaseClient.getClient();
  }

  function getCurrentRole() {
    return String(global.Session?.role?.() || '').trim().toLowerCase();
  }

  function canWrite(action = 'update') {
    return Boolean(global.Permissions?.canPerformAction?.('events', action));
  }

  function readableError(prefix, error) {
    const message = String(error?.message || error?.error_description || 'Unknown error');
    return new Error(`${prefix}: ${message}`);
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function dateToLocalStorageValue(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
  }

  function parseDisplayDateTimeToLocalStorage(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const match = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return '';
    const [, dd, mon, yyyy, hh, mm, ampm] = match;
    const months = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const month = months[String(mon || '').toLowerCase()];
    if (!month) return '';
    let hour = Number(hh);
    if (!Number.isFinite(hour) || hour < 1 || hour > 12) return '';
    const suffix = String(ampm || '').toUpperCase();
    if (suffix === 'PM' && hour < 12) hour += 12;
    if (suffix === 'AM' && hour === 12) hour = 0;
    return `${yyyy}-${month}-${pad2(dd)}T${pad2(hour)}:${mm}:00`;
  }

  function parseDateValue(value, allDay = false) {
    if (value === undefined || value === null) return '';
    if (value instanceof Date) {
      const local = dateToLocalStorageValue(value);
      return allDay ? local.slice(0, 10) : local;
    }
    const raw = String(value).trim();
    if (!raw) return '';
    if (allDay) {
      const dateOnly = raw.match(/^(\d{4}-\d{2}-\d{2})/);
      if (dateOnly) return dateOnly[1];
    }
    const localDateTime = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::(\d{2}))?/);
    if (localDateTime) return `${localDateTime[1]}T${localDateTime[2]}:${localDateTime[3] || '00'}`;
    return parseDisplayDateTimeToLocalStorage(raw) || raw;
  }

  function generateEventCode() {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `EV-${yyyy}${mm}${dd}-${Date.now()}-${rand}`;
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

  function parseTicketIds(value) {
    if (Array.isArray(value)) {
      return Array.from(
        new Set(
          value
            .map(v => String(v || '').trim())
            .filter(Boolean)
        )
      );
    }
    return Array.from(
      new Set(
        String(value || '')
          .split(',')
          .map(v => v.trim())
          .filter(Boolean)
      )
    );
  }

  function normalizeEventRow(row = {}) {
    const raw = row && typeof row === 'object' ? row : {};
    const id = String(raw.id || raw.event_id || '').trim();
    const eventCode = String(raw.event_code || raw.code || '').trim();
    const allDay = Boolean(raw.all_day || raw.allDay);
    const start = parseDateValue(raw.start_at ?? raw.start ?? raw.startDate ?? raw.date, allDay);
    const end = parseDateValue(raw.end_at ?? raw.end ?? raw.endDate ?? raw.finish, allDay);
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
      env: String(raw.environment || raw.env || 'Prod').trim() || 'Prod',
      owner: String(raw.owner || '').trim(),
      modules: String(raw.modules || '').trim(),
      impactType: String(raw.impact_type || raw.impactType || raw.impact || 'No downtime expected').trim() || 'No downtime expected',
      ticketIds: parseTicketIds(raw.issue_id || raw.issueId || raw.ticketId || raw.ticketIds),
      issueId: String(raw.issue_id || raw.issueId || '').trim(),
      ticketId: String(raw.ticketId || '').trim(),
      allDay,
      notificationStatus: String(raw.notificationStatus || raw.notification_status || '').trim(),
      readiness,
      checklist: readiness
    };
  }



  function eventPwaRecordId(event = {}, fallback = '') {
    return String(
      event?.event_code ||
      event?.eventCode ||
      event?.displayId ||
      event?.id ||
      fallback ||
      ''
    ).trim();
  }

  function eventPwaUrl(recordId = '') {
    const normalizedId = String(recordId || '').trim();
    return normalizedId ? `/#events?id=${encodeURIComponent(normalizedId)}` : '/#events';
  }

  function eventPwaBody(event = {}, fallbackRecordId = '', suffix = 'was updated') {
    const label = String(event?.title || eventPwaRecordId(event, fallbackRecordId) || 'Event').trim();
    return `Event ${label} ${suffix}.`;
  }

  async function safeSendEventPwaPush(args = {}) {
    const api = global.Api;
    if (!api || typeof api.safeSendBusinessPwaPush !== 'function') {
      console.warn('[events:pwa] skipped direct PWA push: Api.safeSendBusinessPwaPush is unavailable', args);
      return null;
    }
    try {
      console.info('[events:pwa] sending direct PWA push', args);
      const result = await api.safeSendBusinessPwaPush(args);
      console.info('[events:pwa] direct PWA push result', {
        resource: args?.resource,
        action: args?.action,
        recordId: args?.recordId,
        result
      });
      return result;
    } catch (error) {
      console.warn('[events:pwa] direct PWA push failed but event save will continue', { args, error });
      return {
        attempted: true,
        sent: false,
        error: String(error?.message || error)
      };
    }
  }

  function changedEventFields(previous = {}, next = {}, submittedUpdates = {}) {
    const fields = [
      'title',
      'description',
      'start',
      'end',
      'location',
      'status',
      'type',
      'env',
      'owner',
      'modules',
      'impactType',
      'issueId',
      'allDay'
    ];
    const changed = [];
    fields.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(submittedUpdates || {}, field)) {
        changed.push(field);
        return;
      }
      const before = JSON.stringify(previous?.[field] ?? '');
      const after = JSON.stringify(next?.[field] ?? '');
      if (before !== after) changed.push(field);
    });
    return Array.from(new Set(changed));
  }

  function chooseEventUpdateAction(previous = {}, next = {}, submittedUpdates = {}) {
    const previousStatus = String(previous?.status || '').trim().toLowerCase();
    const nextStatus = String(next?.status || '').trim().toLowerCase();
    const previousStart = String(previous?.start || previous?.start_at || '').trim();
    const nextStart = String(next?.start || next?.start_at || '').trim();
    const previousEnd = String(previous?.end || previous?.end_at || '').trim();
    const nextEnd = String(next?.end || next?.end_at || '').trim();

    if ((previousStart && nextStart && previousStart !== nextStart) || (previousEnd && nextEnd && previousEnd !== nextEnd)) {
      return 'event_schedule_changed';
    }
    if (previousStatus && nextStatus && previousStatus !== nextStatus) {
      return 'event_status_changed';
    }
    if (Object.prototype.hasOwnProperty.call(submittedUpdates || {}, 'start') || Object.prototype.hasOwnProperty.call(submittedUpdates || {}, 'end')) {
      return 'event_schedule_changed';
    }
    if (Object.prototype.hasOwnProperty.call(submittedUpdates || {}, 'status')) {
      return 'event_status_changed';
    }
    return 'event_updated';
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
    const providedEventCode = String(input.event_code ?? input.eventCode ?? '').trim();

    const allDay = !!(input.all_day ?? input.allDay);
    const mapped = {
      event_code: providedEventCode || generateEventCode(),
      title: input.title || input.eventTitle || '',
      description: input.description || input.notes || '',
      start_at: parseDateValue(input.start_at ?? input.start ?? input.startDate ?? input.date, allDay),
      end_at: parseDateValue(input.end_at ?? input.end ?? input.endDate ?? input.finish, allDay),
      location: input.location || '',
      status: input.status || 'Planned',
      type: input.type || input.eventType || 'Other',
      environment: input.environment || input.env || 'Prod',
      owner: input.owner || '',
      modules: Array.isArray(input.modules) ? input.modules.join(', ') : String(input.modules || '').trim(),
      impact_type: input.impact_type || input.impactType || input.impact || 'No downtime expected',
      issue_id: Array.isArray(input.ticketIds)
        ? input.ticketIds.filter(Boolean).join(', ')
        : String(input.issue_id || input.issueId || input.ticketId || '').trim(),
      all_day: allDay,
      readiness: input.readiness ?? input.checklist ?? {},
      created_by: input.created_by || input.createdBy || userId || undefined,
      updated_by: input.updated_by || input.updatedBy || userId || undefined
    };
    return stripUnknownColumns(mapped);
  }

  async function toUpdatePayload(input = {}) {
    const userId = await getCurrentUserId(getClient());
    const providedEventCode = input.event_code ?? input.eventCode;
    const normalizedEventCode =
      providedEventCode === undefined || providedEventCode === null
        ? undefined
        : String(providedEventCode).trim() || undefined;

    const allDay = input.all_day !== undefined || input.allDay !== undefined
      ? !!(input.all_day ?? input.allDay)
      : undefined;

    const mapped = {
      event_code: normalizedEventCode,
      title: input.title ?? input.eventTitle,
      description: input.description ?? input.notes,
      start_at: input.start_at !== undefined || input.start !== undefined || input.startDate !== undefined || input.date !== undefined
        ? parseDateValue(input.start_at ?? input.start ?? input.startDate ?? input.date, !!allDay)
        : undefined,
      end_at: input.end_at !== undefined || input.end !== undefined || input.endDate !== undefined || input.finish !== undefined
        ? parseDateValue(input.end_at ?? input.end ?? input.endDate ?? input.finish, !!allDay)
        : undefined,
      location: input.location,
      status: input.status,
      type: input.type ?? input.eventType,
      environment: input.environment ?? input.env,
      owner: input.owner,
      modules: input.modules !== undefined
        ? (Array.isArray(input.modules) ? input.modules.join(', ') : String(input.modules || '').trim())
        : undefined,
      impact_type: input.impact_type ?? input.impactType ?? input.impact,
      issue_id:
        input.ticketIds !== undefined
          ? (Array.isArray(input.ticketIds)
              ? input.ticketIds.filter(Boolean).join(', ')
              : String(input.ticketIds || '').trim())
          : (input.issue_id ?? input.issueId ?? input.ticketId),
      all_day: allDay,
      readiness: input.readiness ?? input.checklist,
      updated_by: input.updated_by || input.updatedBy || userId || undefined
    };
    return stripUnknownColumns(mapped);
  }

  async function listEvents(options = {}) {
    const page = Math.max(1, Number(options.page) || 1);
    const pageSize = Math.max(1, Math.min(200, Number(options.limit || options.pageSize) || 200));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const client = getClient();
    const { data, error } = await client.from(TABLE).select('*').order('updated_at', { ascending: false }).range(from, to);
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
    if (!canWrite('create')) throw new Error('You do not have permission to create events.');
    const payload = await toCreatePayload(input);
    console.log('[events] create payload', payload);
    const client = getClient();
    const { data, error } = await client.from(TABLE).insert(payload).select('*').single();
    if (error) throw readableError('Unable to create event', error);

    const savedEvent = normalizeEventRow(data);
    const recordId = eventPwaRecordId(savedEvent);
    await safeSendEventPwaPush({
      resource: 'events',
      action: 'event_created',
      recordId,
      title: 'Event created',
      body: eventPwaBody(savedEvent, recordId, 'was created'),
      roles: ['admin', 'dev'],
      url: eventPwaUrl(recordId),
      data: {
        event_id: savedEvent.id || undefined,
        event_code: savedEvent.event_code || savedEvent.eventCode || undefined,
        status: savedEvent.status || undefined,
        type: savedEvent.type || undefined,
        start: savedEvent.start || undefined,
        end: savedEvent.end || undefined
      }
    });

    return savedEvent;
  }

  async function updateEvent(id, updates = {}) {
    if (!canWrite('update')) throw new Error('You do not have permission to update events.');
    const eventId = String(id || updates.id || '').trim();
    if (!eventId) throw new Error('Event id is required.');
    const payload = await toUpdatePayload(updates);
    const client = getClient();

    let previousEvent = null;
    try {
      const { data: previousRow, error: previousError } = await client.from(TABLE).select('*').eq('id', eventId).maybeSingle();
      if (previousError) console.warn('[events:pwa] unable to load previous event before update', previousError);
      previousEvent = previousRow ? normalizeEventRow(previousRow) : null;
    } catch (previousLoadError) {
      console.warn('[events:pwa] unable to load previous event before update', previousLoadError);
    }

    const { data, error } = await client.from(TABLE).update(payload).eq('id', eventId).select('*').single();
    if (error) throw readableError('Unable to update event', error);

    const savedEvent = normalizeEventRow(data);
    const recordId = eventPwaRecordId(savedEvent, eventId);
    const action = chooseEventUpdateAction(previousEvent || {}, savedEvent, updates || {});
    const changedFields = changedEventFields(previousEvent || {}, savedEvent, updates || {});
    const title = action === 'event_schedule_changed'
      ? 'Event schedule changed'
      : action === 'event_status_changed'
        ? 'Event status changed'
        : 'Event updated';

    await safeSendEventPwaPush({
      resource: 'events',
      action,
      recordId,
      title,
      body: eventPwaBody(savedEvent, recordId, 'was updated'),
      roles: ['admin', 'dev'],
      url: eventPwaUrl(recordId),
      data: {
        event_id: savedEvent.id || eventId,
        event_code: savedEvent.event_code || savedEvent.eventCode || undefined,
        status: savedEvent.status || undefined,
        type: savedEvent.type || undefined,
        start: savedEvent.start || undefined,
        end: savedEvent.end || undefined,
        changed_fields: changedFields
      }
    });

    return savedEvent;
  }

  async function deleteEvent(id) {
    if (!canWrite('delete')) throw new Error('You do not have permission to delete events.');
    const eventId = String(id || '').trim();
    if (!eventId) throw new Error('Event id is required.');
    const client = getClient();

    let previousEvent = null;
    try {
      const { data: previousRow, error: previousError } = await client.from(TABLE).select('*').eq('id', eventId).maybeSingle();
      if (previousError) console.warn('[events:pwa] unable to load previous event before delete', previousError);
      previousEvent = previousRow ? normalizeEventRow(previousRow) : null;
    } catch (previousLoadError) {
      console.warn('[events:pwa] unable to load previous event before delete', previousLoadError);
    }

    const { error } = await client.from(TABLE).delete().eq('id', eventId);
    if (error) throw readableError('Unable to delete event', error);

    const recordId = eventPwaRecordId(previousEvent || {}, eventId);
    await safeSendEventPwaPush({
      resource: 'events',
      action: 'event_deleted',
      recordId,
      title: 'Event deleted',
      body: eventPwaBody(previousEvent || {}, recordId, 'was deleted'),
      roles: ['admin', 'dev'],
      url: '/#events',
      data: {
        event_id: previousEvent?.id || eventId,
        event_code: previousEvent?.event_code || previousEvent?.eventCode || undefined,
        status: previousEvent?.status || undefined,
        type: previousEvent?.type || undefined
      }
    });

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
