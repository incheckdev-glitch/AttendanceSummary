(function initCsmService(global) {
  const TABLE = 'csm_activities';
  const MUTATION_ROLES = new Set(['admin', 'hoo']);
  const CSM_COLUMNS = new Set([
    'activity_code',
    'timestamp',
    'csm_user_id',
    'csm_email',
    'csm_name',
    'client_id',
    'client_name',
    'company_name',
    'agreement_id',
    'onboarding_id',
    'client',
    'time_spent_minutes',
    'type_of_support',
    'effort_requirement',
    'support_channel',
    'notes_optional',
    'created_by',
    'updated_by'
  ]);

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

  function normalizeNameKey(value) {
    return cleanString(value)
      .toLowerCase()
      .replace(/[\s\-_]+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  function deriveNameFromEmail(email) {
    const localPart = cleanString(email).split('@')[0] || '';
    return localPart
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function toReadableClientName(value) {
    return cleanString(value).replace(/\s+/g, ' ').trim();
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
      csm_user_id: cleanString(raw.csm_user_id || raw.csmUserId),
      csmUserId: cleanString(raw.csm_user_id || raw.csmUserId),
      csm_email: cleanString(raw.csm_email || raw.csmEmail),
      csmEmail: cleanString(raw.csm_email || raw.csmEmail),
      csm_name: cleanString(raw.csm_name || raw.csmName),
      csmName: cleanString(raw.csm_name || raw.csmName),
      client_id: cleanString(raw.client_id || raw.clientId),
      clientId: cleanString(raw.client_id || raw.clientId),
      client_name: cleanString(raw.client_name || raw.clientName || raw.client),
      clientName: cleanString(raw.client_name || raw.clientName || raw.client),
      company_name: cleanString(raw.company_name || raw.companyName || raw.client_name || raw.client),
      companyName: cleanString(raw.company_name || raw.companyName || raw.client_name || raw.client),
      agreement_id: cleanString(raw.agreement_id || raw.agreementId),
      agreementId: cleanString(raw.agreement_id || raw.agreementId),
      onboarding_id: cleanString(raw.onboarding_id || raw.onboardingId),
      onboardingId: cleanString(raw.onboarding_id || raw.onboardingId),
      client: cleanString(raw.client || raw.client_name || raw.clientName),
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

  function getCurrentUserIdentity() {
    const current = global.Session?.user?.() || {};
    const profile = current.profile || {};
    const user = current.user || {};
    const csmUserId = cleanString(current.user_id || user.id || profile.id);
    const csmEmail = cleanString(current.email || profile.email || user.email).toLowerCase();
    const profileName = cleanString(profile.full_name || profile.name || current.name || user?.user_metadata?.full_name);
    const username = cleanString(current.username || profile.username || user?.user_metadata?.username);
    const fallbackFromEmail = deriveNameFromEmail(csmEmail);
    const csmName = profileName || username || fallbackFromEmail;
    return {
      csm_user_id: csmUserId,
      csm_email: csmEmail,
      csm_name: cleanString(csmName)
    };
  }

  async function toInsertPayload(input = {}) {
    const client = getClient();
    const userId = await getCurrentUserId(client);
    const identity = getCurrentUserIdentity();
    const selectedClientName = cleanString(input.client_name ?? input.clientName ?? input.client);
    const mapped = {
      activity_code: input.activity_code || input.activityCode,
      timestamp: parseDateValue(input.timestamp) || new Date().toISOString(),
      csm_user_id: (input.csm_user_id ?? input.csmUserId ?? identity.csm_user_id) || undefined,
      csm_email: (input.csm_email ?? input.csmEmail ?? identity.csm_email) || undefined,
      csm_name: input.csm_name ?? input.csmName ?? identity.csm_name,
      client_id: input.client_id ?? input.clientId,
      client_name: selectedClientName,
      company_name: input.company_name ?? input.companyName ?? selectedClientName,
      agreement_id: input.agreement_id ?? input.agreementId,
      onboarding_id: input.onboarding_id ?? input.onboardingId,
      client: input.client ?? selectedClientName,
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
    const identity = getCurrentUserIdentity();
    const selectedClientName = cleanString(input.client_name ?? input.clientName ?? input.client);
    const mapped = {
      activity_code: input.activity_code ?? input.activityCode,
      timestamp: input.timestamp !== undefined ? parseDateValue(input.timestamp) : undefined,
      csm_user_id: (input.csm_user_id ?? input.csmUserId ?? identity.csm_user_id) || undefined,
      csm_email: (input.csm_email ?? input.csmEmail ?? identity.csm_email) || undefined,
      csm_name: input.csm_name ?? input.csmName ?? identity.csm_name,
      client_id: input.client_id ?? input.clientId,
      client_name: selectedClientName || undefined,
      company_name: (input.company_name ?? input.companyName ?? selectedClientName) || undefined,
      agreement_id: input.agreement_id ?? input.agreementId,
      onboarding_id: input.onboarding_id ?? input.onboardingId,
      client: input.client ?? selectedClientName,
      time_spent_minutes: input.time_spent_minutes ?? input.timeSpentMinutes,
      type_of_support: input.type_of_support ?? input.supportType,
      effort_requirement: input.effort_requirement ?? input.effortRequirement,
      support_channel: input.support_channel ?? input.supportChannel,
      notes_optional: input.notes_optional ?? input.notes,
      updated_by: input.updated_by || input.updatedBy || userId || undefined
    };
    return sanitizeColumns(mapped);
  }

  function getUnsupportedColumn(message = '') {
    const text = cleanString(message);
    if (!text) return '';
    const patterns = [
      /column\s+"([^"]+)"/i,
      /column\s+'([^']+)'/i,
      /Could not find the ['"]?([^'"\s]+)['"]?\s+column/i
    ];
    for (const pattern of patterns) {
      const matched = text.match(pattern);
      if (matched?.[1]) return cleanString(matched[1]);
    }
    return '';
  }

  async function withColumnFallback(operation, payload = {}) {
    const working = { ...payload };
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const result = await operation(working);
      const unsupportedColumn = getUnsupportedColumn(result?.error?.message || '');
      if (!unsupportedColumn || !(unsupportedColumn in working)) return result;
      delete working[unsupportedColumn];
    }
    return operation(working);
  }

  function mergeClientOption(targetMap, incoming = {}) {
    const clientId = cleanString(incoming.client_id || incoming.clientId);
    const clientName = toReadableClientName(incoming.client_name || incoming.clientName || incoming.company_name || incoming.companyName);
    if (!clientId && !clientName) return;
    const normalizedName = normalizeNameKey(clientName);
    const key = clientId ? `id:${clientId}` : `name:${normalizedName}`;
    const existing = targetMap.get(key) || {};
    const merged = {
      client_id: clientId || existing.client_id || '',
      client_name: clientName || existing.client_name || '',
      company_name: toReadableClientName(incoming.company_name || incoming.companyName || clientName || existing.company_name || existing.client_name),
      agreement_id: cleanString(incoming.agreement_id || incoming.agreementId || existing.agreement_id),
      onboarding_id: cleanString(incoming.onboarding_id || incoming.onboardingId || existing.onboarding_id)
    };
    merged.search_text = [merged.client_name, merged.company_name, merged.client_id, merged.agreement_id]
      .map(value => cleanString(value).toLowerCase())
      .filter(Boolean)
      .join(' ');
    targetMap.set(key, merged);
    if (!clientId && normalizedName) targetMap.set(`name:${normalizedName}`, merged);
  }

  async function loadClientOptionsForCsmActivity() {
    const client = getClient();
    const optionMap = new Map();
    const clientsModuleRows = Array.isArray(global.Clients?.state?.rows) ? global.Clients.state.rows : [];
    clientsModuleRows.forEach(row => {
      mergeClientOption(optionMap, {
        client_id: row.client_id || row.clientId,
        client_name: row.client_name || row.clientName,
        company_name: row.company_name || row.companyName,
        agreement_id: row.source_agreement_id || row.agreement_id || row.agreementId
      });
    });
    try {
      const { data } = await client
        .from('clients')
        .select('id,client_id,client_name,company_name,source_agreement_id')
        .order('client_name', { ascending: true });
      (Array.isArray(data) ? data : []).forEach(row => {
        mergeClientOption(optionMap, {
          client_id: row.client_id || row.id,
          client_name: row.client_name || row.company_name,
          company_name: row.company_name || row.client_name,
          agreement_id: row.source_agreement_id
        });
      });
    } catch {}
    try {
      const { data } = await client
        .from('operations_onboarding')
        .select('onboarding_id,agreement_id,client_name,company_name')
        .order('client_name', { ascending: true });
      (Array.isArray(data) ? data : []).forEach(row => {
        mergeClientOption(optionMap, {
          client_name: row.client_name || row.company_name,
          company_name: row.company_name || row.client_name,
          agreement_id: row.agreement_id,
          onboarding_id: row.onboarding_id
        });
      });
    } catch {}
    try {
      const { data } = await client.from(TABLE).select('client,client_name,company_name,client_id').limit(3000);
      (Array.isArray(data) ? data : []).forEach(row => {
        mergeClientOption(optionMap, {
          client_id: row.client_id,
          client_name: row.client_name || row.company_name || row.client,
          company_name: row.company_name || row.client_name || row.client
        });
      });
    } catch {}
    try {
      const { data } = await client.from('agreements').select('agreement_id,customer_name,customer_legal_name').limit(3000);
      (Array.isArray(data) ? data : []).forEach(row => {
        mergeClientOption(optionMap, {
          client_name: row.customer_name || row.customer_legal_name,
          company_name: row.customer_legal_name || row.customer_name,
          agreement_id: row.agreement_id
        });
      });
    } catch {}
    return [...optionMap.values()]
      .filter(option => cleanString(option.client_name))
      .sort((a, b) => cleanString(a.client_name).localeCompare(cleanString(b.client_name)));
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
    if (!canMutate()) throw new Error('Only admin/hoo can create CSM activities.');
    const payload = await toInsertPayload(input);
    const client = getClient();
    const { data, error } = await withColumnFallback(
      nextPayload => client.from(TABLE).insert(nextPayload).select('*').single(),
      payload
    );
    if (error) throw readableError('Unable to create CSM activity', error);
    return normalizeCsmRow(data);
  }

  async function updateActivity(id, updates = {}) {
    if (!canMutate()) throw new Error('Only admin/hoo can update CSM activities.');
    const activityId = cleanString(id || updates.id);
    if (!activityId) throw new Error('CSM activity id is required.');
    const payload = await toUpdatePayload(updates);
    const client = getClient();
    const { data, error } = await withColumnFallback(
      nextPayload => client.from(TABLE).update(nextPayload).eq('id', activityId).select('*').single(),
      payload
    );
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
    SUPPORT_TYPE_OPTIONS,
    EFFORT_OPTIONS,
    CHANNEL_OPTIONS,
    canMutate,
    getCurrentUserIdentity,
    loadClientOptionsForCsmActivity,
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
