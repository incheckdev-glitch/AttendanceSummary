(function initCsmService(global) {
  const TABLE = 'csm_activities';
  const MUTATION_ROLES = new Set(['admin', 'hoo']);
  const CSM_ACTIVITY_COLUMNS = new Set([
    'id',
    'activity_id',
    'csm_user_id',
    'csm_email',
    'csm_name',
    'client',
    'client_id',
    'client_name',
    'company_name',
    'time_spent_minutes',
    'type_of_support',
    'effort_requirement',
    'support_channel',
    'notes',
    'created_by',
    'updated_by',
    'created_at',
    'updated_at'
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

  function filterCsmActivityRecord(record = {}) {
    return Object.fromEntries(
      Object.entries(record).filter(([key, value]) => CSM_ACTIVITY_COLUMNS.has(key) && value !== undefined)
    );
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
      client: cleanString(raw.client || raw.client_name || raw.clientName || raw.company_name || raw.companyName),
      client_name: cleanString(raw.client_name || raw.clientName || raw.client || raw.company_name || raw.companyName),
      clientName: cleanString(raw.client_name || raw.clientName || raw.client || raw.company_name || raw.companyName),
      company_name: cleanString(raw.company_name || raw.companyName || raw.client_name || raw.client || raw.clientName),
      companyName: cleanString(raw.company_name || raw.companyName || raw.client_name || raw.client || raw.clientName),
      agreement_id: cleanString(raw.agreement_id || raw.agreementId),
      agreementId: cleanString(raw.agreement_id || raw.agreementId),
      onboarding_id: cleanString(raw.onboarding_id || raw.onboardingId),
      onboardingId: cleanString(raw.onboarding_id || raw.onboardingId),
      time_spent_minutes: Number.parseFloat(raw.time_spent_minutes ?? raw.timeSpentMinutes ?? 0) || 0,
      timeSpentMinutes: Number.parseFloat(raw.time_spent_minutes ?? raw.timeSpentMinutes ?? 0) || 0,
      type_of_support: cleanString(raw.type_of_support || raw.supportType),
      supportType: cleanString(raw.type_of_support || raw.supportType),
      effort_requirement: cleanString(raw.effort_requirement || raw.effortRequirement),
      effortRequirement: cleanString(raw.effort_requirement || raw.effortRequirement),
      support_channel: cleanString(raw.support_channel || raw.supportChannel),
      supportChannel: cleanString(raw.support_channel || raw.supportChannel),
      notes: cleanString(raw.notes || raw.notes_optional),
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
    const selectedClientName = cleanString(
      input.client_name ?? input.clientName ?? input.company_name ?? input.companyName ?? input.client
    );
    const mapped = {
      csm_user_id: (input.csm_user_id ?? input.csmUserId ?? identity.csm_user_id) || undefined,
      csm_email: (input.csm_email ?? input.csmEmail ?? identity.csm_email) || undefined,
      csm_name: input.csm_name ?? input.csmName ?? identity.csm_name,
      client: selectedClientName,
      client_id: input.client_id ?? input.clientId,
      client_name: selectedClientName,
      company_name: input.company_name ?? input.companyName ?? selectedClientName,
      time_spent_minutes: input.time_spent_minutes ?? input.timeSpentMinutes,
      type_of_support: input.type_of_support ?? input.supportType,
      effort_requirement: input.effort_requirement ?? input.effortRequirement,
      support_channel: input.support_channel ?? input.supportChannel,
      notes: input.notes ?? input.notes_optional,
      created_by: input.created_by || input.createdBy || userId || undefined,
      updated_by: input.updated_by || input.updatedBy || userId || undefined
    };
    return filterCsmActivityRecord(mapped);
  }

  async function toUpdatePayload(input = {}) {
    const client = getClient();
    const userId = await getCurrentUserId(client);
    const identity = getCurrentUserIdentity();
    const selectedClientName = cleanString(
      input.client_name ?? input.clientName ?? input.company_name ?? input.companyName ?? input.client
    );
    const mapped = {
      csm_user_id: (input.csm_user_id ?? input.csmUserId ?? identity.csm_user_id) || undefined,
      csm_email: (input.csm_email ?? input.csmEmail ?? identity.csm_email) || undefined,
      csm_name: input.csm_name ?? input.csmName ?? identity.csm_name,
      client: selectedClientName || undefined,
      client_id: input.client_id ?? input.clientId,
      client_name: selectedClientName || undefined,
      company_name: (input.company_name ?? input.companyName ?? selectedClientName) || undefined,
      time_spent_minutes: input.time_spent_minutes ?? input.timeSpentMinutes,
      type_of_support: input.type_of_support ?? input.supportType,
      effort_requirement: input.effort_requirement ?? input.effortRequirement,
      support_channel: input.support_channel ?? input.supportChannel,
      notes: input.notes ?? input.notes_optional,
      updated_by: input.updated_by || input.updatedBy || userId || undefined
    };
    return filterCsmActivityRecord(mapped);
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

  function normalizeClientName(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function chooseRicherText(a = '', b = '') {
    const left = cleanString(a);
    const right = cleanString(b);
    return right.length > left.length ? right : left;
  }

  function mergeUnique(list = [], value) {
    const normalized = cleanString(value);
    if (!normalized) return list;
    return list.includes(normalized) ? list : [...list, normalized];
  }

  function mergeClientOption(targetMap, incoming = {}) {
    const clientId = cleanString(incoming.client_id || incoming.clientId);
    const displayName = toReadableClientName(
      incoming.client_name || incoming.clientName || incoming.company_name || incoming.companyName || incoming.client || incoming.name
    );
    const normalizedKey = normalizeClientName(displayName);
    if (!normalizedKey) return;
    const existing = targetMap.get(normalizedKey) || {};
    const incomingOnboardingId = cleanString(incoming.onboarding_id || incoming.onboardingId);
    const incomingAgreementId = cleanString(incoming.agreement_id || incoming.agreementId);
    const existingSources = Array.isArray(existing.metadata?.sources) ? existing.metadata.sources : [];
    const nextSource = cleanString(incoming.source || '');
    const merged = {
      client_id: clientId || existing.client_id || '',
      client_name: chooseRicherText(existing.client_name, displayName),
      company_name: chooseRicherText(
        existing.company_name || existing.client_name,
        toReadableClientName(incoming.company_name || incoming.companyName || displayName)
      ),
      client: chooseRicherText(existing.client || existing.client_name || existing.company_name, displayName),
      metadata: {
        sources: mergeUnique(existingSources, nextSource),
        onboarding_ids: mergeUnique(existing.metadata?.onboarding_ids || [], incomingOnboardingId),
        agreement_ids: mergeUnique(existing.metadata?.agreement_ids || [], incomingAgreementId)
      }
    };
    const mergedDisplayName = merged.client_name || merged.company_name || merged.client || displayName;
    merged.client_name = mergedDisplayName;
    merged.company_name = mergedDisplayName;
    merged.client = mergedDisplayName;
    merged.label = mergedDisplayName;
    merged.value = merged.client_id || normalizedKey;
    merged.search_text = [merged.client_name, merged.company_name, merged.client_id, ...merged.metadata.agreement_ids]
      .map(value => cleanString(value).toLowerCase())
      .filter(Boolean)
      .join(' ');
    targetMap.set(normalizedKey, merged);
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
        agreement_id: row.source_agreement_id || row.agreement_id || row.agreementId,
        source: 'clients'
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
          agreement_id: row.source_agreement_id,
          source: 'clients'
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
          onboarding_id: row.onboarding_id,
          source: 'operations'
        });
      });
    } catch {}
    try {
      const { data } = await client.from(TABLE).select('client,client_name,company_name,client_id').limit(3000);
      (Array.isArray(data) ? data : []).forEach(row => {
        mergeClientOption(optionMap, {
          client_id: row.client_id,
          client_name: row.client_name || row.company_name || row.client,
          company_name: row.company_name || row.client_name || row.client,
          source: 'csm_activities'
        });
      });
    } catch {}
    try {
      const { data } = await client.from('agreements').select('agreement_id,customer_name,customer_legal_name').limit(3000);
      (Array.isArray(data) ? data : []).forEach(row => {
        mergeClientOption(optionMap, {
          client_name: row.customer_name || row.customer_legal_name,
          company_name: row.customer_legal_name || row.customer_name,
          agreement_id: row.agreement_id,
          source: 'agreements'
        });
      });
    } catch {}
    const beforeCount = optionMap.size;
    const uniqueOptions = Array.from(optionMap.values())
      .filter(option => cleanString(option.label || option.client_name || option.company_name))
      .sort((a, b) => cleanString(a.label || a.client_name).localeCompare(cleanString(b.label || b.client_name)));
    console.log('[csm clients] options before/after dedupe', beforeCount, uniqueOptions.length);
    return uniqueOptions;
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
    console.log('[csm activity] save payload', payload);
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
    console.log('[csm activity] save payload', payload);
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
