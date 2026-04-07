import { isSupabaseConfigured, supabase } from './supabaseClient.js';

const RESOURCES = { AUTH: 'auth', TICKETS: 'tickets', EVENTS: 'events' };
const ACTIONS = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  SESSION: 'session',
  LIST: 'list',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  SAVE: 'save'
};

const RESTRICTED_VIEWER_FIELDS = [
  'youtrack_reference',
  'dev_team_status',
  'issue_related',
  'notes'
];

const PUBLIC_TICKET_FIELDS = [
  'ticket_id',
  'name',
  'department',
  'module',
  'title',
  'description',
  'link',
  'email_addressee',
  'notification_sent',
  'notification_under_review',
  'priority',
  'status',
  'category',
  'date',
  'log'
];

const TICKET_ALIAS_MAP = {
  id: 'ticket_id',
  ticketId: 'ticket_id',
  ticket_id: 'ticket_id',
  desc: 'description',
  description: 'description',
  type: 'category',
  category: 'category',
  emailAddressee: 'email_addressee',
  email: 'email_addressee',
  email_addressee: 'email_addressee',
  file: 'link',
  link: 'link',
  businessPriority: 'business_priority',
  business_priority: 'business_priority',
  youtrackReference: 'youtrack_reference',
  youtrack_reference: 'youtrack_reference',
  devTeamStatus: 'dev_team_status',
  dev_team_status: 'dev_team_status',
  issueRelated: 'issue_related',
  issue_related: 'issue_related'
};

function normalizeResource(resource = '') {
  const value = String(resource || '').trim().toLowerCase();
  if ([RESOURCES.AUTH, RESOURCES.TICKETS, RESOURCES.EVENTS].includes(value)) return value;
  return value;
}

function normalizeAction(action = '') {
  const value = String(action || '').trim().toLowerCase();
  const aliases = {
    get: ACTIONS.LIST,
    remove: ACTIONS.DELETE,
    insert: ACTIONS.CREATE
  };
  return aliases[value] || value;
}

function ensureSupabaseConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or runtime equivalents).'
    );
  }
}

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user || null;
}

async function getCurrentProfile(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function pickRole(profile) {
  const role = String(profile?.role || '').toLowerCase();
  return role === 'admin' ? 'admin' : 'viewer';
}

function ensureRole(role, allowedRoles, message = 'Forbidden') {
  if (!allowedRoles.includes(role)) {
    throw new Error(message);
  }
}

function normalizeTicketPayload(payload = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(payload || {})) {
    const mapped = TICKET_ALIAS_MAP[key] || key;
    if (value === undefined) continue;
    normalized[mapped] = value;
  }
  return normalized;
}

function toLegacyTicket(row = {}, role = 'viewer') {
  const data = {
    ...row,
    id: row.ticket_id,
    ticketId: row.ticket_id,
    desc: row.description,
    type: row.category,
    emailAddressee: row.email_addressee,
    email: row.email_addressee,
    file: row.link,
    businessPriority: row.business_priority,
    youtrackReference: row.youtrack_reference,
    devTeamStatus: row.dev_team_status,
    issueRelated: row.issue_related
  };

  if (role !== 'admin') {
    RESTRICTED_VIEWER_FIELDS.forEach(field => delete data[field]);
    delete data.youtrackReference;
    delete data.devTeamStatus;
    delete data.issueRelated;
    delete data.notes;
  }

  return data;
}

function cleanUpdateFields(payload = {}, role = 'viewer') {
  const mapped = normalizeTicketPayload(payload);
  const cleaned = {};

  Object.entries(mapped).forEach(([key, value]) => {
    if (['resource', 'action', 'authToken', 'sheetName', 'tabName', 'key', 'updates', 'event'].includes(key)) {
      return;
    }
    if (key === 'id') {
      cleaned.ticket_id = value;
      return;
    }
    cleaned[key] = value;
  });

  if (role !== 'admin') {
    RESTRICTED_VIEWER_FIELDS.forEach(field => delete cleaned[field]);
  }

  return cleaned;
}

async function authRequest(action, payload = {}) {
  if (action === ACTIONS.LOGIN) {
    const email = String(payload.email || '').trim();
    const password = String(payload.password || payload.passcode || '').trim();
    if (!email || !password) throw new Error('Email and password are required.');

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const user = data?.user || null;
    const session = data?.session || null;
    const profile = await getCurrentProfile(user?.id);

    return {
      ok: true,
      resource: RESOURCES.AUTH,
      action: ACTIONS.LOGIN,
      session,
      user,
      profile
    };
  }

  if (action === ACTIONS.LOGOUT) {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { ok: true, resource: RESOURCES.AUTH, action: ACTIONS.LOGOUT };
  }

  if (action === ACTIONS.SESSION) {
    const [{ data: sessionData, error: sessionError }, user, profile] = await Promise.all([
      supabase.auth.getSession(),
      getCurrentUser(),
      getCurrentUser().then(u => getCurrentProfile(u?.id))
    ]);
    if (sessionError) throw sessionError;
    return {
      ok: true,
      resource: RESOURCES.AUTH,
      action: ACTIONS.SESSION,
      session: sessionData?.session || null,
      user,
      profile
    };
  }

  throw new Error(`Unsupported auth action: ${action}`);
}

async function ticketsRequest(action, payload = {}) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  const profile = await getCurrentProfile(user.id);
  const role = pickRole(profile);

  if (action === ACTIONS.LIST) {
    ensureRole(role, ['admin', 'viewer']);

    const table = role === 'admin' ? 'tickets' : 'tickets_viewer';
    let query = supabase.from(table).select('*').order('date', { ascending: false, nullsFirst: false });

    const filters = payload.filters && typeof payload.filters === 'object' ? payload.filters : payload;
    if (filters.module) query = query.eq('module', filters.module);
    if (filters.category) query = query.eq('category', filters.category);
    if (filters.priority) query = query.eq('priority', filters.priority);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.search) {
      const q = String(filters.search).trim();
      if (q) query = query.or(`ticket_id.ilike.%${q}%,title.ilike.%${q}%,description.ilike.%${q}%,module.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return {
      ok: true,
      resource: RESOURCES.TICKETS,
      count: Array.isArray(data) ? data.length : 0,
      data: (data || []).map(row => toLegacyTicket(row, role))
    };
  }

  if (action === ACTIONS.CREATE) {
    ensureRole(role, ['admin', 'viewer']);
    const normalized = cleanUpdateFields(payload, role);
    const safePayload = Object.fromEntries(
      Object.entries(normalized).filter(([key]) => PUBLIC_TICKET_FIELDS.includes(key))
    );

    const { data, error } = await supabase.from('tickets').insert([safePayload]).select('*').single();
    if (error) throw error;

    return {
      ok: true,
      resource: RESOURCES.TICKETS,
      action: ACTIONS.CREATE,
      data: toLegacyTicket(data, role)
    };
  }

  if (action === ACTIONS.UPDATE) {
    ensureRole(role, ['admin'], 'Only admin can update tickets.');
    const mergedPayload = {
      ...(payload.updates || {}),
      ...(payload.key || {}),
      ...payload
    };
    const normalized = cleanUpdateFields(mergedPayload, role);
    const ticketId = String(normalized.ticket_id || '').trim();
    if (!ticketId) throw new Error('ticket_id is required for update.');
    delete normalized.ticket_id;

    const { data, error } = await supabase
      .from('tickets')
      .update(normalized)
      .eq('ticket_id', ticketId)
      .select('*')
      .single();
    if (error) throw error;

    return {
      ok: true,
      resource: RESOURCES.TICKETS,
      action: ACTIONS.UPDATE,
      data: toLegacyTicket(data, role)
    };
  }

  if (action === ACTIONS.DELETE) {
    ensureRole(role, ['admin'], 'Only admin can delete tickets.');
    const normalized = cleanUpdateFields(payload, role);
    const ticketId = String(normalized.ticket_id || payload.id || payload.ticketId || '').trim();
    if (!ticketId) throw new Error('ticket_id is required for delete.');

    const { error } = await supabase.from('tickets').delete().eq('ticket_id', ticketId);
    if (error) throw error;

    return {
      ok: true,
      resource: RESOURCES.TICKETS,
      action: ACTIONS.DELETE,
      ticket_id: ticketId
    };
  }

  throw new Error(`Unsupported tickets action: ${action}`);
}

async function eventsRequest(action, payload = {}) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  const profile = await getCurrentProfile(user.id);
  const role = pickRole(profile);

  if (action === ACTIONS.LIST) {
    ensureRole(role, ['admin', 'viewer']);
    const { data, error } = await supabase.from('events').select('*').order('start', { ascending: true });
    if (error) throw error;
    return { ok: true, resource: RESOURCES.EVENTS, events: data || [] };
  }

  if (action === ACTIONS.SAVE) {
    ensureRole(role, ['admin'], 'Only admin can save events.');
    const input = payload.event && typeof payload.event === 'object' ? payload.event : payload;
    const id = String(input.id || '').trim();
    if (!id) throw new Error('Event id is required for save.');

    const { data, error } = await supabase
      .from('events')
      .upsert([{ ...input, id }], { onConflict: 'id' })
      .select('*')
      .single();
    if (error) throw error;

    return { ok: true, resource: RESOURCES.EVENTS, action: ACTIONS.SAVE, event: data };
  }

  if (action === ACTIONS.DELETE) {
    ensureRole(role, ['admin'], 'Only admin can delete events.');
    const id = String(payload.id || '').trim();
    if (!id) throw new Error('Event id is required for delete.');

    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) throw error;

    return { ok: true, resource: RESOURCES.EVENTS, action: ACTIONS.DELETE, id };
  }

  throw new Error(`Unsupported events action: ${action}`);
}

export async function apiRequest(payload = {}) {
  try {
    ensureSupabaseConfigured();
    const resource = normalizeResource(payload.resource);
    const action = normalizeAction(payload.action);

    if (resource === RESOURCES.AUTH) return await authRequest(action, payload);
    if (resource === RESOURCES.TICKETS) return await ticketsRequest(action, payload);
    if (resource === RESOURCES.EVENTS) return await eventsRequest(action, payload);

    return { ok: false, error: `Unsupported resource: ${resource || 'unknown'}` };
  } catch (error) {
    return {
      ok: false,
      resource: normalizeResource(payload.resource),
      action: normalizeAction(payload.action),
      error: String(error?.message || 'Unknown error')
    };
  }
}

export {
  authRequest,
  ticketsRequest,
  eventsRequest,
  getCurrentUser,
  getCurrentProfile,
  normalizeResource,
  normalizeAction
};

if (typeof window !== 'undefined') {
  window.apiRequest = apiRequest;
}
