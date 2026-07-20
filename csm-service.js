(function initCsmService(global) {
  const TABLE = 'csm_activities';
  const CSM_ADMIN_ROLE_KEYS = new Set(['admin']);
  // The deployed csm_activities table stores the note in notes_optional. Keep
  // activity.notes as the frontend canonical field and only translate at the DB boundary.
  const DB_NOTE_COLUMN = 'notes_optional';
  const NOTE_COLUMN_CANDIDATES = [DB_NOTE_COLUMN, 'notes', 'note', 'activity_notes', 'activity_note', 'remarks', 'comments', 'comment', 'description'];
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
    'company_id',
    'agreement_id',
    'agreement_number',
    'invoice_id',
    'location_id',
    'location_name',
    'activity_context',
    'manual_client_name',
    'manual_location_name',
    'cs_group_id',
    'cs_group_name',
    'special_client_id',
    'special_client_name',
    'time_spent_minutes',
    'type_of_support',
    'effort_requirement',
    'support_channel',
    ...NOTE_COLUMN_CANDIDATES,
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

  function normalizeRoleKey(role) {
    return String(role || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/-/g, '_')
      .replace(/_+/g, '_');
  }

  function getCurrentUserForPermission() {
    const sessionUser = global.Session?.user?.() || {};
    const authContext = global.Session?.authContext?.() || {};
    const profile = sessionUser.profile || authContext.profile || {};
    const user = sessionUser.user || authContext.user || {};
    const role = sessionUser.role || authContext.role || global.Session?.role?.() || profile.role_key || profile.role || '';
    return {
      ...sessionUser,
      id: sessionUser.id || sessionUser.user_id || user.id || profile.id || '',
      email: sessionUser.email || profile.email || user.email || '',
      role,
      role_key: sessionUser.role_key || profile.role_key || role,
      user_role: sessionUser.user_role || profile.user_role || profile.role || '',
      profile: { ...profile, role_key: profile.role_key || role },
      user
    };
  }

  function canCreateCsmActivity(currentUser = getCurrentUserForPermission()) {
    const role =
      currentUser?.role_key ||
      currentUser?.role ||
      currentUser?.user_role ||
      currentUser?.profile?.role_key ||
      currentUser?.profile?.role ||
      '';

    const roleKey = normalizeRoleKey(role);

    if (global.Permissions?.can) {
      const resources = ['csm_activities', 'csm_daily_activity', 'csm_daily_activity_tracker'];
      const hasExplicitMatrixRows = typeof global.Permissions.getMatchedRows === 'function' && global.Permissions.isReady?.();
      if (hasExplicitMatrixRows) {
        const matrixRows = resources.flatMap(resource => global.Permissions.getMatchedRows(resource, 'create', roleKey, { includeDenied: true }) || []);
        if (matrixRows.some(row => row.is_active === true && row.is_allowed === false)) return false;
        if (matrixRows.some(row => row.is_active === true && row.is_allowed === true)) return true;
      }
      if (global.Permissions.can('csm_activities', 'create')) return true;
      if (global.Permissions.can('csm_daily_activity', 'create')) return true;
      if (global.Permissions.can('csm_daily_activity_tracker', 'create')) return true;
    }

    if (global.PermissionService?.can) {
      if (global.PermissionService.can('csm_activities', 'create')) return true;
      if (global.PermissionService.can('csm_daily_activity', 'create')) return true;
      if (global.PermissionService.can('csm_daily_activity_tracker', 'create')) return true;
    }

    return CSM_ADMIN_ROLE_KEYS.has(roleKey);
  }

  function canManageExistingCsmActivity(action, currentUser = getCurrentUserForPermission()) {
    const role = currentUser?.role_key || currentUser?.role || currentUser?.user_role || currentUser?.profile?.role_key || currentUser?.profile?.role || '';
    const roleKey = normalizeRoleKey(role);
    const normalizedAction = String(action || '').trim().toLowerCase();

    if (global.Permissions?.can) {
      const hasExplicitMatrixRows = typeof global.Permissions.getMatchedRows === 'function' && global.Permissions.isReady?.();
      if (hasExplicitMatrixRows) {
        const matrixRows = global.Permissions.getMatchedRows('csm_activities', normalizedAction, roleKey, { includeDenied: true }) || [];
        if (matrixRows.some(row => row.is_active === true && row.is_allowed === false)) return false;
        if (matrixRows.some(row => row.is_active === true && row.is_allowed === true)) return true;
      }
      if (global.Permissions.can('csm_activities', normalizedAction)) return true;
    }

    if (global.PermissionService?.can && global.PermissionService.can('csm_activities', normalizedAction)) return true;

    return CSM_ADMIN_ROLE_KEYS.has(roleKey);
  }

  function canUpdateCsmActivity(currentUser = getCurrentUserForPermission()) {
    return canManageExistingCsmActivity('update', currentUser);
  }

  function canDeleteCsmActivity(currentUser = getCurrentUserForPermission()) {
    return canManageExistingCsmActivity('delete', currentUser);
  }

  function canMutate() {
    return canCreateCsmActivity();
  }

  function readableError(prefix, error) {
    const message = String(error?.message || error?.error_description || 'Unknown error');
    return new Error(`${prefix}: ${message}`);
  }

  function cleanString(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
  }

  function getActivityNotes(record = {}) {
    return cleanString(
      record.notes ||
      record.note ||
      record.activity_notes ||
      record.activity_note ||
      record.notes_optional ||
      record.description ||
      record.remarks ||
      record.comments ||
      record.comment
    );
  }

  function getSuppliedActivityNotes(record = {}) {
    const aliases = ['notes', 'note', 'activity_notes', 'activity_note', 'notes_optional', 'description', 'remarks', 'comments', 'comment'];
    const suppliedKeys = aliases.filter(key => Object.prototype.hasOwnProperty.call(record, key));
    if (!suppliedKeys.length) return undefined;
    const populatedKey = suppliedKeys.find(key => cleanString(record[key]));
    return populatedKey ? record[populatedKey] : record[suppliedKeys[0]];
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

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanString(value));
  }

  function nullableUuid(value) {
    const raw = cleanString(value);
    return isUuid(raw) ? raw : null;
  }

  function normalizeActivityContext(value) {
    const key = cleanString(value);
    if (key === 'manual_client') return 'manual_client';
    if (key === 'cs_group') return 'cs_group';
    if (key === 'special_client') return 'special_client';
    return 'agreement_client';
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
    // Keep the database UUID separate from the display/business activity_id.
    // Mutations must never fall back to activity_id because it is not guaranteed unique.
    const id = isUuid(raw.id) ? cleanString(raw.id) : '';
    const activityId = cleanString(raw.activity_id || raw.activityId);
    const activityCode = cleanString(raw.activity_code || raw.activityCode);
    const displayCode = activityCode || activityId || id;
    const timestamp = parseDateValue(raw.timestamp || raw.date || raw.created_at);
    const activityContext = normalizeActivityContext(raw.activity_context || raw.activityContext);
    const manualClientName = cleanString(raw.manual_client_name || raw.manualClientName);
    const manualLocationName = cleanString(raw.manual_location_name || raw.manualLocationName || raw.location_name || raw.locationName);
    const csGroupId = cleanString(raw.cs_group_id || raw.csGroupId);
    const csGroupName = cleanString(raw.cs_group_name || raw.csGroupName);
    const specialClientId = cleanString(raw.special_client_id || raw.specialClientId);
    const specialClientName = cleanString(raw.special_client_name || raw.specialClientName);
    const displayClientName = activityContext === 'manual_client'
      ? manualClientName
      : activityContext === 'cs_group'
      ? csGroupName || cleanString(raw.client_name || raw.clientName || raw.client || raw.company_name || raw.companyName)
      : activityContext === 'special_client'
      ? specialClientName || cleanString(raw.client_name || raw.clientName || raw.client || raw.company_name || raw.companyName)
      : cleanString(raw.client_name || raw.clientName || raw.client || raw.company_name || raw.companyName);
    const displayCompanyName = activityContext === 'manual_client'
      ? manualClientName
      : activityContext === 'cs_group'
      ? csGroupName || displayClientName
      : activityContext === 'special_client'
      ? specialClientName || displayClientName
      : cleanString(raw.company_name || raw.companyName || raw.client_name || raw.client || raw.clientName);

    return {
      ...raw,
      id,
      activity_id: activityId,
      activityId,
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
      client: displayClientName,
      client_name: displayClientName,
      clientName: displayClientName,
      company_id: cleanString(raw.company_id || raw.companyId),
      companyId: cleanString(raw.company_id || raw.companyId),
      company_name: displayCompanyName,
      companyName: displayCompanyName,
      agreement_id: cleanString(raw.agreement_id || raw.agreementId),
      agreementId: cleanString(raw.agreement_id || raw.agreementId),
      agreement_number: cleanString(raw.agreement_number || raw.agreementNumber),
      agreementNumber: cleanString(raw.agreement_number || raw.agreementNumber),
      invoice_id: cleanString(raw.invoice_id || raw.invoiceId),
      invoiceId: cleanString(raw.invoice_id || raw.invoiceId),
      location_id: cleanString(raw.location_id || raw.locationId),
      locationId: cleanString(raw.location_id || raw.locationId),
      location_name: manualLocationName || cleanString(raw.location_name || raw.locationName),
      locationName: manualLocationName || cleanString(raw.location_name || raw.locationName),
      activity_context: activityContext,
      activityContext,
      manual_client_name: manualClientName,
      manualClientName,
      manual_location_name: manualLocationName,
      manualLocationName,
      cs_group_id: csGroupId,
      csGroupId,
      cs_group_name: csGroupName,
      csGroupName,
      special_client_id: specialClientId,
      specialClientId,
      special_client_name: specialClientName,
      specialClientName,
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
      status: cleanString(raw.status || raw.activity_status),
      notes: getActivityNotes(raw),
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
    const activityContext = normalizeActivityContext(input.activity_context ?? input.activityContext);
    const manualClientName = toReadableClientName(input.manual_client_name ?? input.manualClientName);
    const manualLocationName = toReadableClientName(input.manual_location_name ?? input.manualLocationName ?? input.location_name ?? input.locationName);
    const csGroupId = nullableUuid(input.cs_group_id ?? input.csGroupId);
    const csGroupName = toReadableClientName(input.cs_group_name ?? input.csGroupName);
    const specialClientId = nullableUuid(input.special_client_id ?? input.specialClientId);
    const specialClientName = toReadableClientName(input.special_client_name ?? input.specialClientName);
    const selectedClientName = activityContext === 'manual_client'
      ? manualClientName
      : activityContext === 'cs_group'
      ? csGroupName
      : activityContext === 'special_client'
      ? specialClientName
      : cleanString(input.client_name ?? input.clientName ?? input.company_name ?? input.companyName ?? input.client);
    const mapped = {
      csm_user_id: (input.csm_user_id ?? input.csmUserId ?? identity.csm_user_id) || undefined,
      csm_email: (input.csm_email ?? input.csmEmail ?? identity.csm_email) || undefined,
      csm_name: input.csm_name ?? input.csmName ?? identity.csm_name,
      activity_context: activityContext,
      manual_client_name: activityContext === 'manual_client' ? manualClientName : null,
      manual_location_name: activityContext === 'manual_client' ? manualLocationName || null : null,
      cs_group_id: activityContext === 'cs_group' ? csGroupId : null,
      cs_group_name: activityContext === 'cs_group' ? csGroupName : null,
      special_client_id: activityContext === 'special_client' ? specialClientId : null,
      special_client_name: activityContext === 'special_client' ? specialClientName : null,
      client: selectedClientName,
      client_id: activityContext === 'agreement_client' ? nullableUuid(input.client_id ?? input.clientId) : null,
      client_name: selectedClientName,
      company_id: activityContext === 'agreement_client' ? nullableUuid(input.company_id ?? input.companyId) : null,
      company_name: activityContext === 'cs_group'
        ? csGroupName
        : activityContext === 'special_client'
        ? specialClientName
        : (input.company_name ?? input.companyName ?? selectedClientName),
      agreement_id: activityContext === 'agreement_client' ? nullableUuid(input.agreement_id ?? input.agreementId) : null,
      agreement_number: activityContext === 'agreement_client' ? (input.agreement_number ?? input.agreementNumber ?? null) : null,
      invoice_id: activityContext === 'agreement_client' ? nullableUuid(input.invoice_id ?? input.invoiceId) : null,
      location_id: activityContext === 'agreement_client' ? nullableUuid(input.location_id ?? input.locationId) : null,
      location_name: activityContext === 'manual_client' ? manualLocationName || null : (activityContext === 'agreement_client' ? (input.location_name ?? input.locationName ?? null) : null),
      time_spent_minutes: input.time_spent_minutes ?? input.timeSpentMinutes,
      type_of_support: input.type_of_support ?? input.supportType,
      effort_requirement: input.effort_requirement ?? input.effortRequirement,
      support_channel: input.support_channel ?? input.supportChannel,
      [DB_NOTE_COLUMN]: getSuppliedActivityNotes(input),
      created_by: input.created_by || input.createdBy || userId || undefined,
      updated_by: input.updated_by || input.updatedBy || userId || undefined
    };
    return filterCsmActivityRecord(mapped);
  }

  async function toUpdatePayload(input = {}) {
    const client = getClient();
    const userId = await getCurrentUserId(client);
    const identity = getCurrentUserIdentity();
    const activityContext = normalizeActivityContext(input.activity_context ?? input.activityContext);
    const manualClientName = toReadableClientName(input.manual_client_name ?? input.manualClientName);
    const manualLocationName = toReadableClientName(input.manual_location_name ?? input.manualLocationName ?? input.location_name ?? input.locationName);
    const csGroupId = nullableUuid(input.cs_group_id ?? input.csGroupId);
    const csGroupName = toReadableClientName(input.cs_group_name ?? input.csGroupName);
    const specialClientId = nullableUuid(input.special_client_id ?? input.specialClientId);
    const specialClientName = toReadableClientName(input.special_client_name ?? input.specialClientName);
    const selectedClientName = activityContext === 'manual_client'
      ? manualClientName
      : activityContext === 'cs_group'
      ? csGroupName
      : activityContext === 'special_client'
      ? specialClientName
      : cleanString(input.client_name ?? input.clientName ?? input.company_name ?? input.companyName ?? input.client);
    const mapped = {
      csm_user_id: (input.csm_user_id ?? input.csmUserId ?? identity.csm_user_id) || undefined,
      csm_email: (input.csm_email ?? input.csmEmail ?? identity.csm_email) || undefined,
      csm_name: input.csm_name ?? input.csmName ?? identity.csm_name,
      activity_context: activityContext,
      manual_client_name: activityContext === 'manual_client' ? manualClientName : null,
      manual_location_name: activityContext === 'manual_client' ? manualLocationName || null : null,
      cs_group_id: activityContext === 'cs_group' ? csGroupId : null,
      cs_group_name: activityContext === 'cs_group' ? csGroupName : null,
      special_client_id: activityContext === 'special_client' ? specialClientId : null,
      special_client_name: activityContext === 'special_client' ? specialClientName : null,
      client: selectedClientName || undefined,
      client_id: activityContext === 'agreement_client' ? nullableUuid(input.client_id ?? input.clientId) : null,
      client_name: selectedClientName || undefined,
      company_id: activityContext === 'agreement_client' ? nullableUuid(input.company_id ?? input.companyId) : null,
      company_name: activityContext === 'cs_group'
        ? csGroupName
        : activityContext === 'special_client'
        ? specialClientName
        : ((input.company_name ?? input.companyName ?? selectedClientName) || undefined),
      agreement_id: activityContext === 'agreement_client' ? nullableUuid(input.agreement_id ?? input.agreementId) : null,
      agreement_number: activityContext === 'agreement_client' ? (input.agreement_number ?? input.agreementNumber ?? null) : null,
      invoice_id: activityContext === 'agreement_client' ? nullableUuid(input.invoice_id ?? input.invoiceId) : null,
      location_id: activityContext === 'agreement_client' ? nullableUuid(input.location_id ?? input.locationId) : null,
      location_name: activityContext === 'manual_client' ? manualLocationName || null : (activityContext === 'agreement_client' ? (input.location_name ?? input.locationName ?? null) : null),
      time_spent_minutes: input.time_spent_minutes ?? input.timeSpentMinutes,
      type_of_support: input.type_of_support ?? input.supportType,
      effort_requirement: input.effort_requirement ?? input.effortRequirement,
      support_channel: input.support_channel ?? input.supportChannel,
      [DB_NOTE_COLUMN]: getSuppliedActivityNotes(input),
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
    const attemptedNoteColumns = new Set(NOTE_COLUMN_CANDIDATES.filter(column => column in working));
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const result = await operation(working);
      const unsupportedColumn = getUnsupportedColumn(result?.error?.message || '');
      if (!unsupportedColumn || !(unsupportedColumn in working)) return result;

      const unsupportedValue = working[unsupportedColumn];
      delete working[unsupportedColumn];

      // Some environments still expose a legacy note column. If the known
      // notes_optional column is unavailable, retry the same value against the
      // next supported note alias rather than silently saving without a note.
      if (NOTE_COLUMN_CANDIDATES.includes(unsupportedColumn)) {
        const fallbackNoteColumn = NOTE_COLUMN_CANDIDATES.find(column => !attemptedNoteColumns.has(column));
        if (fallbackNoteColumn) {
          attemptedNoteColumns.add(fallbackNoteColumn);
          working[fallbackNoteColumn] = unsupportedValue;
        }
      }
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
        client_id: isUuid(row.client_id || row.clientId) ? (row.client_id || row.clientId) : row.id,
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
          client_id: isUuid(row.client_id) ? row.client_id : row.id,
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
      const { data } = await client.from(TABLE).select('client,client_name,company_name,client_id,manual_client_name,activity_context').order('updated_at', { ascending: false }).limit(500);
      (Array.isArray(data) ? data : []).forEach(row => {
        const context = normalizeActivityContext(row.activity_context);
        if (context === 'special_client' || context === 'cs_group') return;
        mergeClientOption(optionMap, {
          client_id: row.client_id,
          client_name: context === 'manual_client' ? row.manual_client_name : row.client_name || row.company_name || row.client,
          company_name: row.company_name || row.client_name || row.client,
          source: 'csm_activities'
        });
      });
    } catch {}
    try {
      const { data } = await client.from('agreements').select('agreement_id,customer_name,customer_legal_name').order('updated_at', { ascending: false }).limit(500);
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

  async function loadSpecialClientOptionsForCsmActivity() {
    const client = getClient();
    const { data, error } = await client
      .from('cs_special_clients')
      .select('id,client_name,description,status')
      .neq('status', 'archived')
      .order('client_name', { ascending: true });
    if (error) throw readableError('Unable to load Special CS Clients', error);
    return (Array.isArray(data) ? data : [])
      .map(row => ({
        value: cleanString(row.id),
        special_client_id: cleanString(row.id),
        special_client_name: toReadableClientName(row.client_name),
        client_name: toReadableClientName(row.client_name),
        company_name: toReadableClientName(row.client_name),
        label: toReadableClientName(row.client_name),
        status: cleanString(row.status || 'active'),
        description: cleanString(row.description),
        search_text: [row.client_name, row.description, row.status]
          .map(value => cleanString(value).toLowerCase())
          .filter(Boolean)
          .join(' ')
      }))
      .filter(row => row.value && row.label);
  }

  async function listActivities(options = {}) {
    const page = Math.max(1, Number(options.page) || 1);
    const uiPageSize = Math.max(1, Math.min(200, Number(options.limit || options.pageSize) || 50));
    const fetchSize = 1000;
    const client = getClient();
    const allRows = [];
    let from = 0;

    // Load the full CSM activity dataset in batches. The UI applies search/date/filter
    // rules locally against the complete dataset, then paginates only the visible table.
    // This prevents the old "first 50 rows only" problem and keeps KPI/cards/charts/export accurate.
    while (true) {
      const to = from + fetchSize - 1;
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw readableError('Unable to load CSM activities', error);

      const batch = Array.isArray(data) ? data : [];
      const normalizedBatch = batch.map(normalizeCsmRow);
      normalizedBatch.forEach(activity => console.log('[CSM Activity] loaded note:', activity.notes || ''));
      allRows.push(...normalizedBatch);

      if (batch.length < fetchSize) break;
      from += fetchSize;
    }

    return {
      rows: allRows,
      page,
      limit: uiPageSize,
      offset: 0,
      returned: allRows.length,
      total: allRows.length,
      hasMore: false
    };
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
    if (!canCreateCsmActivity(getCurrentUserForPermission())) throw new Error('You do not have permission to create CSM activities.');
    const payload = await toInsertPayload(input);
    console.log('[CSM Activity] save payload:', payload);
    const client = getClient();
    const { data, error } = await withColumnFallback(
      nextPayload => client.from(TABLE).insert(nextPayload).select('*').single(),
      payload
    );
    if (error) throw readableError('Unable to create CSM activity', error);
    return normalizeCsmRow(data);
  }

  async function updateActivity(id, updates = {}) {
    if (!canUpdateCsmActivity(getCurrentUserForPermission())) throw new Error('You do not have permission to update CSM activities.');
    const realUuid = cleanString(id || updates.id);
    if (!isUuid(realUuid)) throw new Error('Missing CSM activity UUID. Please reload and try again.');
    const payload = await toUpdatePayload(updates);
    console.log('[CSM update] real uuid:', realUuid);
    console.log('[CSM update] payload:', payload);
    const client = getClient();
    const { data, error } = await withColumnFallback(
      nextPayload => client.from(TABLE).update(nextPayload).eq('id', realUuid).select('*').maybeSingle(),
      payload
    );
    if (error) throw readableError('Unable to update CSM activity', error);
    if (!data) throw new Error('CSM activity was not found or you do not have permission to update it.');
    return normalizeCsmRow(data);
  }

  async function deleteActivity(id) {
    if (!canDeleteCsmActivity(getCurrentUserForPermission())) throw new Error('You do not have permission to delete CSM activities.');
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
    normalizeRoleKey,
    canCreateCsmActivity,
    canUpdateCsmActivity,
    canDeleteCsmActivity,
    canMutate,
    getCurrentUserIdentity,
    loadClientOptionsForCsmActivity,
    loadSpecialClientOptionsForCsmActivity,
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
