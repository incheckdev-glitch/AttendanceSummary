(function initSupabaseData(global) {
  const MIGRATED_RESOURCES = new Set([
    'auth','users','roles','role_permissions','tickets','events','csm','leads','deals','proposal_catalog','proposals','agreements','workflow','clients','invoices','receipts','operations_onboarding'
  ]);

  const TABLE_BY_RESOURCE = {
    users: 'profiles', roles: 'roles', role_permissions: 'role_permissions', tickets: 'tickets',
    events: 'events', csm: 'csm_activities', leads: 'leads', deals: 'deals',
    proposal_catalog: 'proposal_catalog_items', proposals: 'proposals', agreements: 'agreements',
    clients: 'clients', invoices: 'invoices', receipts: 'receipts', operations_onboarding: 'operations_onboarding'
  };

  const PK_KEYS = {
    users: ['user_id','id'], roles: ['role_key','id'], role_permissions: ['permission_id','id'], tickets: ['id','ticket_id'],
    events: ['event_id','id'], csm: ['id','activity_id'], leads: ['lead_id','id'], deals: ['deal_id','id'],
    proposal_catalog: ['catalog_item_id','id'], proposals: ['proposal_id','id'], agreements: ['agreement_id','id'],
    clients: ['client_id','id'], invoices: ['invoice_id','id'], receipts: ['receipt_id','id'], operations_onboarding: ['onboarding_id','id']
  };

  const ITEM_TABLES = { proposals: 'proposal_items', agreements: 'agreement_items', invoices: 'invoice_items', receipts: 'receipt_items' };
  const ITEM_FK = { proposals: 'proposal_id', agreements: 'agreement_id', invoices: 'invoice_id', receipts: 'receipt_id' };
  const TICKET_INTERNAL_FIELDS = ['youtrack_reference', 'dev_team_status', 'issue_related', 'notes'];
  const TICKET_PUBLIC_COLUMNS = new Set([
    'ticket_id',
    'date_submitted',
    'name',
    'department',
    'business_priority',
    'module',
    'link',
    'email_addressee',
    'category',
    'title',
    'description',
    'priority',
    'notification_sent',
    'notification_sent_under_review',
    'created_by',
    'updated_by',
    'status',
    'log',
  ]);

  const devLog = (...args) => {
    try {
      const host = String(window.location.hostname || '').toLowerCase();
      if (window.RUNTIME_CONFIG?.DEBUG_API || host === 'localhost' || host === '127.0.0.1') console.log(...args);
    } catch {}
  };

  function getClient() { return global.SupabaseClient.getClient(); }
  function role() { return String(global.Session?.role?.() || '').toLowerCase(); }
  function isAdminDev() { return ['admin','dev'].includes(role()); }

  function friendlyError(prefix, error) {
    const msg = String(error?.message || error?.error_description || 'Unknown error');
    return new Error(`${prefix}: ${msg}`);
  }

  function normalizeRow(resource, row) {
    if (!row || typeof row !== 'object') return row;
    const out = { ...row };
    for (const key of PK_KEYS[resource] || []) {
      if (out[key] !== undefined && out.id === undefined) out.id = out[key];
    }
    if (resource === 'tickets') {
      out.date = out.date ?? out.date_submitted ?? '';
      out.date_submitted = out.date_submitted ?? out.date ?? '';
      out.ticket_id = out.ticket_id ?? '';
      out.id = out.id ?? '';
      out.desc = out.desc ?? out.description ?? '';
      out.description = out.description ?? out.desc ?? '';
      out.type = out.type ?? out.category ?? '';
      out.category = out.category ?? out.type ?? '';
      out.emailAddressee = out.emailAddressee ?? out.email_addressee ?? out.email ?? '';
      out.email_addressee = out.email_addressee ?? out.emailAddressee ?? out.email ?? '';
      out.link = out.link ?? out.file ?? '';
      out.file = out.file ?? out.link ?? '';
      out.notificationSent = out.notificationSent ?? out.notification_sent ?? '';
      out.notification_sent = out.notification_sent ?? out.notificationSent ?? '';
      out.notificationUnderReview =
        out.notificationUnderReview ??
        out.notification_sent_under_review ??
        out.notification_under_review ??
        out.notificationSentUnderReview ??
        '';
      out.notification_sent_under_review =
        out.notification_sent_under_review ??
        out.notificationUnderReview ??
        out.notification_under_review ??
        out.notificationSentUnderReview ??
        '';
      out.notification_under_review =
        out.notification_under_review ?? out.notification_sent_under_review ?? out.notificationUnderReview ?? '';
      out.business_priority = out.business_priority ?? out.businessPriority ?? '';
      out.businessPriority = out.businessPriority ?? out.business_priority ?? '';
      out.youtrackReference = out.youtrackReference ?? out.youtrack_reference ?? '';
      out.youtrack_reference = out.youtrack_reference ?? out.youtrackReference ?? '';
      out.devTeamStatus = out.devTeamStatus ?? out.dev_team_status ?? '';
      out.dev_team_status = out.dev_team_status ?? out.devTeamStatus ?? '';
      out.issueRelated = out.issueRelated ?? out.issue_related ?? '';
      out.issue_related = out.issue_related ?? out.issueRelated ?? '';
    }
    return out;
  }

  function firstDefined(source = {}, keys = []) {
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      const value = source[key];
      if (value !== undefined) return value;
    }
    return undefined;
  }

  function compactObject(record = {}) {
    const compacted = {};
    Object.entries(record).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      compacted[key] = value;
    });
    return compacted;
  }

  function sanitizeForInsertOrUpdate(record = {}) {
    if (!record || typeof record !== 'object') return {};
    const sanitized = {};
    Object.entries(record).forEach(([key, value]) => {
      if (!TICKET_PUBLIC_COLUMNS.has(key)) return;
      if (value === undefined || value === null) return;
      sanitized[key] = value;
    });
    return sanitized;
  }

  function isBlankValue(value) {
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
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

  function generateTicketId() {
    return `TK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  function toTicketPublicRecord(row = {}, { includeTicketId = true, userId = '' } = {}) {
    const candidateTicketId = firstDefined(row, ['ticket_id', 'ticketCode', 'ticket_code']);
    const nowIso = new Date().toISOString();
    const mapped = compactObject({
      ticket_id: includeTicketId ? (isBlankValue(candidateTicketId) ? generateTicketId() : candidateTicketId) : undefined,
      date_submitted: firstDefined(row, ['date_submitted', 'date', 'timestamp', 'created_at']) || nowIso,
      name: firstDefined(row, ['name']),
      department: firstDefined(row, ['department']),
      business_priority: firstDefined(row, ['business_priority', 'businessPriority']),
      module: firstDefined(row, ['module', 'impactedModule', 'impacted_module', 'impacted module']),
      link: firstDefined(row, ['link', 'file', 'fileUpload', 'file_upload']),
      email_addressee: firstDefined(row, ['email_addressee', 'emailAddressee', 'email']),
      category: firstDefined(row, ['category', 'type', 'issueType', 'issue_type']),
      title: firstDefined(row, ['title']),
      description: firstDefined(row, ['description', 'desc']),
      priority: firstDefined(row, ['priority']),
      status: firstDefined(row, ['status']) || 'new',
      notification_sent: firstDefined(row, ['notification_sent', 'notificationSent']),
      notification_sent_under_review: firstDefined(row, [
        'notification_sent_under_review',
        'notification_under_review',
        'notificationUnderReview',
        'notificationSentUnderReview'
      ]),
      log: firstDefined(row, ['log']),
      created_by: firstDefined(row, ['created_by', 'createdBy']) || userId || undefined,
      updated_by: firstDefined(row, ['updated_by', 'updatedBy']) || userId || undefined
    });

    return sanitizeForInsertOrUpdate(mapped);
  }

  function ticketRowIdFrom(row = {}) {
    return row.id;
  }

  function toTicketInternalRecord(row = {}) {
    return {
      ticket_id: ticketRowIdFrom(row),
      youtrack_reference: row.youtrack_reference ?? row.youtrackReference ?? '',
      dev_team_status: row.dev_team_status ?? row.devTeamStatus ?? '',
      issue_related: row.issue_related ?? row.issueRelated ?? '',
      notes: row.notes ?? ''
    };
  }

  function mergeTicketInternal(ticket = {}, internal = {}) {
    if (!internal || typeof internal !== 'object') return normalizeRow('tickets', ticket);
    const merged = {
      ...ticket,
      youtrack_reference: internal.youtrack_reference ?? internal.youtrackReference ?? '',
      dev_team_status: internal.dev_team_status ?? internal.devTeamStatus ?? '',
      issue_related: internal.issue_related ?? internal.issueRelated ?? '',
      notes: internal.notes ?? ''
    };
    return normalizeRow('tickets', merged);
  }

  function stripTicketInternalFields(row = {}) {
    const clean = { ...(row || {}) };
    TICKET_INTERNAL_FIELDS.forEach(key => {
      delete clean[key];
    });
    delete clean.youtrackReference;
    delete clean.devTeamStatus;
    delete clean.issueRelated;
    return clean;
  }

  async function loadTicketInternalByIds(ids = []) {
    if (!ids.length) return new Map();
    if (!isAdminDev()) return new Map();
    const client = getClient();
    const { data: internalRows, error } = await client
      .from('ticket_internal')
      .select('*')
      .in('ticket_id', ids);
    if (error) throw friendlyError('Unable to load internal ticket fields', error);
    return new Map((internalRows || []).map(r => [String(r.ticket_id || r.id), r]));
  }

  function normalizeList(resource, rows) {
    const normalizedRows = Array.isArray(rows) ? rows.map(r => normalizeRow(resource, r)) : [];
    return { rows: normalizedRows, total: normalizedRows.length, returned: normalizedRows.length, hasMore: false, page: 1, limit: normalizedRows.length || 50, offset: 0 };
  }

  function pickId(resource, payload = {}) {
    for (const key of PK_KEYS[resource] || []) {
      const value = payload[key] ?? payload.id;
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return payload.id;
  }

  function applyFilters(query, payload = {}) {
    const filters = payload.filters && typeof payload.filters === 'object' ? payload.filters : payload;
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '' || ['resource','action','authToken','sheetName','tabName','updates','item'].includes(key)) return;
      if (key === 'search') return;
      query = query.eq(key, value);
    });
    return query;
  }

  async function handleAuth(action, payload) {
    const client = getClient();
    if (action === 'login') {
      const email = String(payload.identifier || payload.email || '').trim();
      const password = String(payload.passcode || payload.password || '').trim();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw friendlyError('Login failed', error);
      return data;
    }
    if (action === 'logout') {
      const { error } = await client.auth.signOut();
      if (error) throw friendlyError('Logout failed', error);
      return { ok: true };
    }
    if (action === 'session') {
      const [{ data: sessionData, error: sessionErr }, { data: userData, error: userErr }] = await Promise.all([
        client.auth.getSession(), client.auth.getUser()
      ]);
      if (sessionErr) throw friendlyError('Session restore failed', sessionErr);
      if (userErr) throw friendlyError('User fetch failed', userErr);
      return { session: sessionData.session, user: userData.user };
    }
    throw new Error(`Unsupported auth action: ${action}`);
  }

  async function withItems(resource, row) {
    if (!ITEM_TABLES[resource] || !row) return normalizeRow(resource, row);
    const fk = ITEM_FK[resource];
    const id = row[fk] || row.id;
    if (!id) return normalizeRow(resource, row);
    const client = getClient();
    const { data, error } = await client.from(ITEM_TABLES[resource]).select('*').eq(fk, id).order('created_at', { ascending: true });
    if (error) throw friendlyError(`Unable to load ${ITEM_TABLES[resource]}`, error);
    const key = ITEM_TABLES[resource];
    return normalizeRow(resource, { ...row, [key]: data || [], items: data || [] });
  }

  async function handleWorkflow(action, payload) {
    const client = getClient();
    if (action === 'list' || action === 'list_rules') {
      const { data, error } = await applyFilters(client.from('workflow_rules').select('*'), payload).order('updated_at', { ascending: false });
      if (error) throw friendlyError('Unable to load workflow rules', error);
      return normalizeList('workflow', data);
    }
    if (action === 'get') {
      const id = payload.workflow_rule_id || payload.id;
      const { data, error } = await client.from('workflow_rules').select('*').eq('workflow_rule_id', id).single();
      if (error) throw friendlyError('Unable to load workflow rule', error);
      return data;
    }
    if (action === 'save' || action === 'save_rule') {
      const row = payload.rule || payload;
      const id = row.workflow_rule_id || row.id;
      const qb = client.from('workflow_rules');
      const resp = id ? await qb.update(row).eq('workflow_rule_id', id).select('*').single() : await qb.insert(row).select('*').single();
      if (resp.error) throw friendlyError('Unable to save workflow rule', resp.error);
      return resp.data;
    }
    if (action === 'delete' || action === 'delete_rule') {
      const id = payload.workflow_rule_id || payload.id;
      const { error } = await client.from('workflow_rules').delete().eq('workflow_rule_id', id);
      if (error) throw friendlyError('Unable to delete workflow rule', error);
      return { ok: true };
    }
    if (action === 'validate_transition') {
      const { data, error } = await client.rpc('validate_workflow_transition', {
        p_resource: payload.target_workflow_resource || payload.resource || payload.target_resource || '',
        p_from_status: payload.from_status || payload.current_status || '',
        p_to_status: payload.to_status || payload.next_status || '',
        p_amount: Number(payload.amount || payload.numeric || 0)
      });
      if (error) throw friendlyError('Workflow validation failed', error);
      return data;
    }
    if (action === 'request_approval' || action === 'approve' || action === 'reject' || action === 'list_pending_approvals') {
      if (action === 'list_pending_approvals') {
        const { data, error } = await client.from('workflow_approvals').select('*').eq('status', 'pending').order('created_at', { ascending: false });
        if (error) throw friendlyError('Unable to load workflow approvals', error);
        return data;
      }
      const row = payload;
      if (action === 'request_approval') {
        const { data, error } = await client.from('workflow_approvals').insert(row).select('*').single();
        if (error) throw friendlyError('Unable to request workflow approval', error);
        return data;
      }
      const id = row.approval_id || row.workflow_approval_id || row.id;
      const nextStatus = action === 'approve' ? 'approved' : 'rejected';
      const { data, error } = await client.from('workflow_approvals').update({ ...row, status: nextStatus }).eq('approval_id', id).select('*').single();
      if (error) throw friendlyError('Unable to update workflow approval', error);
      return data;
    }
    if (action === 'list_audit') {
      const { data, error } = await client.from('workflow_audit_log').select('*').order('created_at', { ascending: false });
      if (error) throw friendlyError('Unable to load workflow audit log', error);
      return data;
    }
    throw new Error(`Unsupported workflow action: ${action}`);
  }

  async function handleRpcResource(resource, action, payload) {
    const client = getClient();
    if (resource === 'leads' && ['convert_to_deal','convert'].includes(action)) {
      const { data, error } = await client.rpc('convert_lead_to_deal', { lead_uuid: payload.lead_id || payload.id });
      if (error) throw friendlyError('Lead conversion failed', error);
      return data;
    }
    if (resource === 'proposals' && action === 'create_from_deal') {
      const { data, error } = await client.rpc('create_proposal_from_deal', { deal_uuid: payload.deal_id || payload.id });
      if (error) throw friendlyError('Proposal creation from deal failed', error);
      return data;
    }
    if (resource === 'agreements' && action === 'create_from_proposal') {
      const { data, error } = await client.rpc('create_agreement_from_proposal', { proposal_uuid: payload.proposal_id || payload.id });
      if (error) throw friendlyError('Agreement creation from proposal failed', error);
      return data;
    }
    if (resource === 'invoices' && action === 'create_from_agreement') {
      const { data, error } = await client.rpc('create_invoice_from_agreement', { agreement_uuid: payload.agreement_id || payload.id });
      if (error) throw friendlyError('Invoice creation from agreement failed', error);
      return data;
    }
    if (resource === 'receipts' && action === 'create_from_invoice') {
      const { data, error } = await client.rpc('create_receipt_from_invoice', {
        invoice_uuid: payload.invoice_id || payload.id,
        amount_value: Number(payload.amount || payload.numeric || 0),
        payment_method_value: String(payload.payment_method || payload.method || ''),
        payment_reference_value: String(payload.payment_reference || payload.reference || '')
      });
      if (error) throw friendlyError('Receipt creation from invoice failed', error);
      return data;
    }
    return null;
  }

  async function dispatch(payload = {}) {
    const resource = String(payload.resource || '').trim();
    const action = String(payload.action || 'list').trim();
    if (!MIGRATED_RESOURCES.has(resource)) return { handled: false };

    devLog('[supabase] dispatch', resource, action);
    if (resource === 'auth') return { handled: true, data: await handleAuth(action, payload) };
    if (resource === 'workflow') return { handled: true, data: await handleWorkflow(action, payload) };

    const rpcResult = await handleRpcResource(resource, action, payload);
    if (rpcResult !== null) return { handled: true, data: rpcResult };

    const table = TABLE_BY_RESOURCE[resource];
    const client = getClient();

    if (resource === 'tickets' && action === 'list') {
      let query = applyFilters(client.from('tickets').select('*'), payload).order('updated_at', { ascending: false });
      const { data: tickets, error } = await query;
      if (error) throw friendlyError('Unable to load tickets', error);
      const normalized = (tickets || []).map(row => normalizeRow(resource, row));
      if (!isAdminDev()) return { handled: true, data: normalizeList(resource, normalized) };
      const ids = normalized.map(row => String(ticketRowIdFrom(row) || '')).filter(Boolean);
      const internalById = await loadTicketInternalByIds(ids);
      const withInternal = normalized.map(row =>
        mergeTicketInternal(row, internalById.get(String(ticketRowIdFrom(row) || '')))
      );
      return { handled: true, data: normalizeList(resource, withInternal) };
    }

    if (action === 'list') {
      const { data, error } = await applyFilters(client.from(table).select('*'), payload).order('updated_at', { ascending: false });
      if (error) throw friendlyError(`Unable to load ${resource}`, error);
      return { handled: true, data: normalizeList(resource, data) };
    }

    if (action === 'get') {
      const id = pickId(resource, payload);
      const key = PK_KEYS[resource][0] || 'id';
      const { data, error } = await client.from(table).select('*').eq(key, id).single();
      if (error) throw friendlyError(`Unable to load ${resource} record`, error);
      if (resource === 'tickets') {
        if (!isAdminDev()) return { handled: true, data: normalizeRow(resource, data) };
        const byId = await loadTicketInternalByIds([String(ticketRowIdFrom(data) || id)]);
        return { handled: true, data: mergeTicketInternal(data, byId.get(String(ticketRowIdFrom(data) || id))) };
      }
      return { handled: true, data: await withItems(resource, data) };
    }

    if (['create','save'].includes(action)) {
      const raw = payload[resource.slice(0, -1)] || payload.item || payload.activity || payload[resource] || payload;
      const record = raw && typeof raw === 'object' ? { ...raw } : {};
      delete record.resource; delete record.action; delete record.authToken;
      if (resource === 'tickets') devLog('[tickets/create] raw form data', record);
      const currentUserId = resource === 'tickets' ? await getCurrentUserId(client) : '';
      const createRecord =
        resource === 'tickets'
          ? toTicketPublicRecord(stripTicketInternalFields(record), { includeTicketId: true, userId: currentUserId })
          : record;
      if (resource === 'tickets') {
        devLog('[tickets/create] normalized payload', createRecord);
        if (!Object.keys(createRecord).length) {
          throw new Error('Ticket create payload is empty after normalization.');
        }
      }
      const { data, error } = await client.from(table).insert(createRecord).select('*').single();
      if (error) throw friendlyError(`Unable to create ${resource} record`, error);
      const created = normalizeRow(resource, data);
      if (resource === 'tickets' && isAdminDev()) {
        const internalRecord = toTicketInternalRecord(raw || {});
        internalRecord.ticket_id = ticketRowIdFrom(created) || internalRecord.ticket_id;
        if (internalRecord.ticket_id) {
          const { data: internalData, error: internalError } = await client
            .from('ticket_internal')
            .upsert(internalRecord, { onConflict: 'ticket_id' })
            .select('*')
            .single();
          if (internalError) throw friendlyError('Unable to save internal ticket fields', internalError);
          return { handled: true, data: mergeTicketInternal(created, internalData) };
        }
      }
      const items = Array.isArray(payload.items) ? payload.items : [];
      const itemTable = ITEM_TABLES[resource];
      const fk = ITEM_FK[resource];
      if (itemTable && items.length && (created[fk] || created.id)) {
        const parentId = created[fk] || created.id;
        const insertRows = items.map(item => ({ ...item, [fk]: parentId }));
        const childResp = await client.from(itemTable).insert(insertRows).select('*');
        if (childResp.error) throw friendlyError(`Unable to create ${itemTable}`, childResp.error);
      }
      return { handled: true, data: await withItems(resource, created) };
    }

    if (action === 'update') {
      const id = pickId(resource, payload);
      const key = PK_KEYS[resource][0] || 'id';
      const updates = payload.updates || payload.item || payload.activity || payload;
      const safeUpdates = { ...updates };
      delete safeUpdates.resource; delete safeUpdates.action; delete safeUpdates.authToken;
      if (resource === 'tickets' && !isAdminDev()) throw new Error('Only admin/dev can update tickets.');
      if (resource === 'events' && !isAdminDev()) throw new Error('Only admin/dev can update events.');
      if (resource === 'csm' && !['admin','hoo'].includes(role())) throw new Error('Only admin/hoo can update CSM activities.');
      const publicUpdates =
        resource === 'tickets'
          ? toTicketPublicRecord(stripTicketInternalFields(safeUpdates), { includeTicketId: false })
          : safeUpdates;
      const { data, error } = await client.from(table).update(publicUpdates).eq(key, id).select('*').single();
      if (error) throw friendlyError(`Unable to update ${resource} record`, error);
      if (resource === 'tickets' && isAdminDev()) {
        const internalUpdates = toTicketInternalRecord(safeUpdates);
        internalUpdates.ticket_id = String(id);
        const { data: internalData, error: internalError } = await client
          .from('ticket_internal')
          .upsert(internalUpdates, { onConflict: 'ticket_id' })
          .select('*')
          .single();
        if (internalError) throw friendlyError('Unable to save internal ticket fields', internalError);
        return { handled: true, data: mergeTicketInternal(data, internalData) };
      }

      const itemTable = ITEM_TABLES[resource];
      const fk = ITEM_FK[resource];
      if (itemTable && Array.isArray(payload.items)) {
        await client.from(itemTable).delete().eq(fk, id);
        if (payload.items.length) {
          const insertRows = payload.items.map(item => ({ ...item, [fk]: id }));
          const childResp = await client.from(itemTable).insert(insertRows).select('*');
          if (childResp.error) throw friendlyError(`Unable to update ${itemTable}`, childResp.error);
        }
      }
      return { handled: true, data: await withItems(resource, data) };
    }

    if (action === 'delete') {
      const id = pickId(resource, payload);
      const key = PK_KEYS[resource][0] || 'id';
      if (resource === 'tickets' && !isAdminDev()) throw new Error('Only admin/dev can delete tickets.');
      if (resource === 'events' && !isAdminDev()) throw new Error('Only admin/dev can delete events.');
      if (resource === 'csm' && !['admin','hoo'].includes(role())) throw new Error('Only admin/hoo can delete CSM activities.');
      if (resource === 'tickets' && isAdminDev()) {
        const { error: internalDeleteError } = await client.from('ticket_internal').delete().eq('ticket_id', id);
        if (internalDeleteError) throw friendlyError('Unable to delete internal ticket fields', internalDeleteError);
      }
      const { error } = await client.from(table).delete().eq(key, id);
      if (error) throw friendlyError(`Unable to delete ${resource} record`, error);
      return { handled: true, data: { ok: true } };
    }

    if (resource === 'users' && ['activate','deactivate'].includes(action)) {
      const id = pickId(resource, payload);
      const { data, error } = await client.from('profiles').update({ is_active: action === 'activate' }).eq('user_id', id).select('*').single();
      if (error) throw friendlyError('Unable to update user status', error);
      return { handled: true, data };
    }

    throw new Error(`Unsupported action ${action} for resource ${resource}.`);
  }

  global.SupabaseData = { dispatch, isMigratedResource: resource => MIGRATED_RESOURCES.has(String(resource || '').trim()) };
})(window);
