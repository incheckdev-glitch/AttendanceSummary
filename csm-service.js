(function initCsmService(global) {
  const TABLE = 'csm_activities';
  const MUTATION_ROLES = new Set(['admin', 'hoo']);
  const CSM_COLUMNS = new Set([
    'activity_code',
    'timestamp',
    'csm_name',
    'client',
    'time_spent_minutes',
    'type_of_support',
    'effort_requirement',
    'support_channel',
    'notes_optional',
    'created_by',
    'updated_by'
  ]);

  const CSM_NAME_OPTIONS = ['Omar Chatila', 'Thomas Moujaly', 'Dina Makouyan'];
  const CLIENT_OPTIONS = [
    'ALL',
    'Global Catering Solution',
    'Dekerco Foods and Processing SAL',
    'The Chain SA',
    'IEX Recreational Playground LLC',
    'Al Naif Icecream Industry',
    'Kareem Trading LLC',
    'NAST',
    'Bachir Trading SARL',
    'Shawarmer Foods Company LTD',
    'Advanced Foods',
    'KCal Management DMMC',
    'Independent Restaurant Management LLC',
    'Mamaesh Pastry L.L.C',
    'Blackspoon Management FZ-LLC',
    'Shababik',
    'Fig Tree Ventures',
    'Boubess Group',
    'WHIZLINK SPORTS & RECREATIONAL CLUB L.L.C',
    'Brosco Restaurant L.L.C. Company',
    'The Bros S.A.R.L',
    'Yummy Junction International Investment LLC',
    'Incheck Sales Demo Account',
    'Uni S.A.L',
    'Mint & Spice SARL',
    'Sibon'
  ];
  const SUPPORT_TYPE_OPTIONS = [
    'Onboarding Setup',
    'Onboarding Meeting',
    'Onboarding Training',
    'Regular Support Setup',
    'Regular Support Call',
    'Weekly Completion Report'
  ];
  const EFFORT_OPTIONS = ['Low (Repetitive Task)', 'Medium', 'High (Analytical Effort)'];
  const CHANNEL_OPTIONS = ['Email', 'Whatsapp', 'Teams Meeting', 'Web App'];

  function getClient() {
    return global.SupabaseClient.getClient();
  }

  function currentRole() {
    return String(global.Session?.role?.() || '').trim().toLowerCase();
  }

  function canMutate() {
    return MUTATION_ROLES.has(currentRole());
  }

  function readableError(prefix, error) {
    const message = String(error?.message || error?.error_description || 'Unknown error');
    return new Error(`${prefix}: ${message}`);
  }

  function cleanString(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
  }

  function parseDateValue(value) {
    const raw = cleanString(value);
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(raw)) return raw.replace(/\s+/, 'T');
    return raw;
  }

  function sanitizeColumns(record = {}) {
    const sanitized = {};
    Object.entries(record).forEach(([key, value]) => {
      if (!CSM_COLUMNS.has(key)) return;
      if (value === undefined || value === null) return;
      sanitized[key] = value;
    });
    return sanitized;
  }

  function normalizeCsmRow(row = {}) {
    const raw = row && typeof row === 'object' ? row : {};
    const id = cleanString(raw.id || raw.activity_id);
    const activityCode = cleanString(raw.activity_code || raw.activityCode);
    const displayCode = activityCode || id;
    const timestamp = parseDateValue(raw.timestamp || raw.date || raw.created_at);

    return {
      ...raw,
      id,
      activity_code: activityCode,
      activityCode,
      displayCode,
      timestamp,
      csm_name: cleanString(raw.csm_name || raw.csmName),
      csmName: cleanString(raw.csm_name || raw.csmName),
      client: cleanString(raw.client),
      time_spent_minutes: Number.parseFloat(raw.time_spent_minutes ?? raw.timeSpentMinutes ?? 0) || 0,
      timeSpentMinutes: Number.parseFloat(raw.time_spent_minutes ?? raw.timeSpentMinutes ?? 0) || 0,
      type_of_support: cleanString(raw.type_of_support || raw.supportType),
      supportType: cleanString(raw.type_of_support || raw.supportType),
      effort_requirement: cleanString(raw.effort_requirement || raw.effortRequirement),
      effortRequirement: cleanString(raw.effort_requirement || raw.effortRequirement),
      support_channel: cleanString(raw.support_channel || raw.supportChannel),
      supportChannel: cleanString(raw.support_channel || raw.supportChannel),
      notes_optional: cleanString(raw.notes_optional || raw.notes),
      notes: cleanString(raw.notes_optional || raw.notes),
      created_by: cleanString(raw.created_by || raw.createdBy),
      updated_by: cleanString(raw.updated_by || raw.updatedBy),
      created_at: cleanString(raw.created_at),
      updated_at: cleanString(raw.updated_at)
    };
  }

  async function getCurrentUserId(client) {
    try {
      const { data, error } = await client.auth.getUser();
      if (error) return '';
      return cleanString(data?.user?.id);
    } catch {
      return '';
    }
  }

  async function toInsertPayload(input = {}) {
    const client = getClient();
    const userId = await getCurrentUserId(client);
    const mapped = {
      activity_code: input.activity_code || input.activityCode,
      timestamp: parseDateValue(input.timestamp) || new Date().toISOString(),
      csm_name: input.csm_name ?? input.csmName,
      client: input.client,
      time_spent_minutes: input.time_spent_minutes ?? input.timeSpentMinutes,
      type_of_support: input.type_of_support ?? input.supportType,
      effort_requirement: input.effort_requirement ?? input.effortRequirement,
      support_channel: input.support_channel ?? input.supportChannel,
      notes_optional: input.notes_optional ?? input.notes,
      created_by: input.created_by || input.createdBy || userId || undefined,
      updated_by: input.updated_by || input.updatedBy || userId || undefined
    };
    return sanitizeColumns(mapped);
  }

  async function toUpdatePayload(input = {}) {
    const client = getClient();
    const userId = await getCurrentUserId(client);
    const mapped = {
      activity_code: input.activity_code ?? input.activityCode,
      timestamp: input.timestamp !== undefined ? parseDateValue(input.timestamp) : undefined,
      csm_name: input.csm_name ?? input.csmName,
      client: input.client,
      time_spent_minutes: input.time_spent_minutes ?? input.timeSpentMinutes,
      type_of_support: input.type_of_support ?? input.supportType,
      effort_requirement: input.effort_requirement ?? input.effortRequirement,
      support_channel: input.support_channel ?? input.supportChannel,
      notes_optional: input.notes_optional ?? input.notes,
      updated_by: input.updated_by || input.updatedBy || userId || undefined
    };
    return sanitizeColumns(mapped);
  }

  async function listActivities() {
    const client = getClient();
    const { data, error } = await client.from(TABLE).select('*').order('updated_at', { ascending: false });
    if (error) throw readableError('Unable to load CSM activities', error);
    return Array.isArray(data) ? data.map(normalizeCsmRow) : [];
  }

  async function getActivityDetails(id) {
    const activityId = cleanString(id);
    if (!activityId) throw new Error('CSM activity id is required.');
    const client = getClient();
    const { data, error } = await client.from(TABLE).select('*').eq('id', activityId).single();
    if (error) throw readableError('Unable to load CSM activity details', error);
    return normalizeCsmRow(data);
  }

  async function createActivity(input = {}) {
    const payload = await toInsertPayload(input);
    const client = getClient();
    const { data, error } = await client.from(TABLE).insert(payload).select('*').single();
    if (error) throw readableError('Unable to create CSM activity', error);
    return normalizeCsmRow(data);
  }

  async function updateActivity(id, updates = {}) {
    if (!canMutate()) throw new Error('Only admin/hoo can update CSM activities.');
    const activityId = cleanString(id || updates.id);
    if (!activityId) throw new Error('CSM activity id is required.');
    const payload = await toUpdatePayload(updates);
    const client = getClient();
    const { data, error } = await client.from(TABLE).update(payload).eq('id', activityId).select('*').single();
    if (error) throw readableError('Unable to update CSM activity', error);
    return normalizeCsmRow(data);
  }

  async function deleteActivity(id) {
    if (!canMutate()) throw new Error('Only admin/hoo can delete CSM activities.');
    const activityId = cleanString(id);
    if (!activityId) throw new Error('CSM activity id is required.');
    const client = getClient();
    const { error } = await client.from(TABLE).delete().eq('id', activityId);
    if (error) throw readableError('Unable to delete CSM activity', error);
    return true;
  }

  global.CsmActivityService = {
    CSM_NAME_OPTIONS,
    CLIENT_OPTIONS,
    SUPPORT_TYPE_OPTIONS,
    EFFORT_OPTIONS,
    CHANNEL_OPTIONS,
    canMutate,
    normalizeCsmRow,
    toInsertPayload,
    toUpdatePayload,
    listActivities,
    getActivityDetails,
    createActivity,
    updateActivity,
    deleteActivity
  };
})(window);
