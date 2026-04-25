(function initSupabaseData(global) {
  const MIGRATED_RESOURCES = new Set([
    'auth','users','roles','role_permissions','tickets','events','csm','leads','deals','proposal_catalog','proposals','agreements','workflow','clients','invoices','receipts','operations_onboarding','technical_admin_requests','notifications'
  ]);

  const TABLE_BY_RESOURCE = {
    users: 'profiles', roles: 'roles', role_permissions: 'role_permissions', tickets: 'tickets',
    events: 'events', csm: 'csm_activities', leads: 'leads', deals: 'deals',
    proposal_catalog: 'proposal_catalog_items', proposals: 'proposals', agreements: 'agreements',
    clients: 'clients', invoices: 'invoices', receipts: 'receipts', operations_onboarding: 'operations_onboarding',
    technical_admin_requests: 'technical_admin_requests'
    ,notifications: 'notifications'
  };

  const PK_BY_RESOURCE = {
    users: 'id',
    roles: 'role_key',
    role_permissions: 'permission_id',
    tickets: 'id',
    events: 'id',
    csm: 'id',
    leads: 'id',
    deals: 'id',
    proposal_catalog: 'id',
    proposals: 'id',
    agreements: 'id',
    clients: 'id',
    invoices: 'id',
    receipts: 'id',
    operations_onboarding: 'id',
    technical_admin_requests: 'id'
    ,notifications: 'notification_id'
  };
  const LEGACY_IDENTIFIER_KEYS = {
    users: [],
    roles: ['id', 'role_id', 'key'],
    role_permissions: ['id', 'permission'],
    tickets: ['ticket_id'],
    events: ['event_id'],
    csm: ['activity_id'],
    leads: ['lead_id'],
    deals: ['deal_id'],
    proposal_catalog: ['catalog_item_id'],
    proposals: ['proposal_id'],
    agreements: ['agreement_id'],
    clients: ['client_id'],
    invoices: ['invoice_id'],
    receipts: ['receipt_id'],
    operations_onboarding: ['onboarding_id', 'agreement_id'],
    technical_admin_requests: ['request_id', 'technical_request_id']
    ,notifications: ['id']
  };

  const ITEM_TABLES = { proposals: 'proposal_items', agreements: 'agreement_items', invoices: 'invoice_items', receipts: 'receipt_items' };
  const ITEM_FK = { proposals: 'proposal_id', agreements: 'agreement_id', invoices: 'invoice_id', receipts: 'receipt_id' };
  const LEGACY_COMPAT = global.LegacyCompat || {};
  const LEGACY_REQUEST_META_FIELDS = new Set(
    Array.isArray(LEGACY_COMPAT.LEGACY_REQUEST_META_FIELDS)
      ? LEGACY_COMPAT.LEGACY_REQUEST_META_FIELDS
      : []
  );
  const LEGACY_RESOURCE_FIELD_KEYS = new Set(
    Array.isArray(LEGACY_COMPAT.LEGACY_RESOURCE_KEYS)
      ? LEGACY_COMPAT.LEGACY_RESOURCE_KEYS
      : ['resource', 'resourceKey', 'table', 'entity', 'sheetName', 'sheet_name', 'tabName', 'tab_name']
  );
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
  const EVENT_PUBLIC_COLUMNS = new Set([
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
  // legacy compatibility - remove after migration closure
  // Compatibility sanitizer for stale payload keys from older frontend builds.
  const EVENT_LEGACY_FIELDS = new Set([
    'allDay',
    'all_day',
    'start',
    'end',
    'startDate',
    'endDate',
    'date',
    'finish',
    'backendToken',
    'backendUrl',
    ...LEGACY_REQUEST_META_FIELDS,
    'resource',
    'action'
  ]);
  const ROLE_PERMISSION_COLUMNS = new Set([
    'permission_id',
    'role_key',
    'resource',
    'action',
    'is_allowed',
    'is_active',
    'allowed_roles'
  ]);
  const ROLE_PERMISSION_LEGACY_FIELDS = new Set([
    'backendToken',
    'backendUrl',
    ...LEGACY_REQUEST_META_FIELDS,
    'id',
    'permission',
    'description',
    'roleName',
    'roleLabel',
    'selectedRoles'
  ]);
  const LEAD_COLUMNS = new Set([
    'lead_id',
    'full_name',
    'company_name',
    'phone',
    'email',
    'country',
    'lead_source',
    'service_interest',
    'priority',
    'estimated_value',
    'currency',
    'next_follow_up',
    'last_contact',
    'proposal_needed',
    'agreement_needed',
    'status',
    'assigned_to',
    'notes',
    'converted_to_deal_id',
    'created_by',
    'updated_by'
  ]);
  const DEAL_COLUMNS = new Set([
    'deal_id',
    'lead_id',
    'lead_code',
    'source_lead_uuid',
    'full_name',
    'company_name',
    'phone',
    'email',
    'country',
    'lead_source',
    'service_interest',
    'proposal_needed',
    'agreement_needed',
    'stage',
    'status',
    'priority',
    'estimated_value',
    'currency',
    'assigned_to',
    'converted_by',
    'converted_at',
    'notes',
    'created_at',
    'updated_at',
    'created_by',
    'updated_by'
  ]);
  const PROPOSAL_CATALOG_COLUMNS = new Set([
    'catalog_item_id','is_active','section','category','item_name','default_location_name','unit_price','discount_percent','quantity',
    'capability_name','capability_value','notes','sort_order'
  ]);
  const PROPOSAL_COLUMNS = new Set([
    'proposal_id','ref_number','deal_id','customer_name','customer_address','customer_contact_name','customer_contact_mobile',
    'customer_contact_email','provider_contact_name','provider_contact_mobile','provider_contact_email','proposal_title','proposal_date',
    'proposal_valid_until','agreement_date','effective_date','service_start_date','service_end_date','contract_term','account_number','billing_frequency','payment_term','po_number',
    'currency','customer_legal_name','provider_name','provider_legal_name',
    'terms_conditions','customer_signatory_name','customer_signatory_title','provider_signatory_name','provider_signatory_title',
    'provider_signatory_name_secondary','provider_signatory_title_secondary','provider_sign_date',
    'subtotal_locations','subtotal_one_time','total_discount','grand_total','status','generated_by','created_by','updated_by'
  ]);
  const PROPOSAL_ITEM_COLUMNS = new Set([
    'item_id','proposal_id','section','line_no','location_name','item_name','unit_price','discount_percent','discounted_unit_price','quantity',
    'line_total','service_start_date','service_end_date','capability_name','capability_value','notes'
  ]);
  const AGREEMENT_COLUMNS = new Set([
    'agreement_id','proposal_id','agreement_number','customer_name','customer_address','customer_contact_name',
    'customer_contact_mobile','customer_contact_email','provider_contact_name','provider_contact_mobile',
    'provider_contact_email','service_start_date','service_end_date','agreement_date','effective_date','contract_term','account_number','billing_frequency',
    'payment_term','po_number','terms_conditions','customer_signatory_name','customer_signatory_title',
    'customer_sign_date','provider_signatory_name','provider_signatory_title','provider_signatory_secondary','provider_signatory_name_secondary','provider_signatory_title_secondary','provider_sign_date','gm_signed',
    'financial_controller_signed','signed_date','status','subtotal_locations','subtotal_one_time','total_discount',
    'grand_total','generated_by','created_by','updated_by','currency','customer_legal_name','provider_legal_name','provider_name',
    'agreement_title','notes'
  ]);
  const AGREEMENT_ITEM_COLUMNS = new Set([
    'item_id','agreement_id','section','line_no','location_name','item_name','unit_price','discount_percent',
    'discounted_unit_price','quantity','line_total','service_start_date','service_end_date','capability_name','capability_value','notes'
  ]);
  const CLIENT_COLUMNS = new Set([
    'client_id','client_name','company_name','primary_email','primary_phone','billing_frequency','payment_term',
    'status','source_agreement_id','total_agreements','total_locations','total_value','total_paid','total_due',
    'created_by','updated_by'
  ]);
  const INVOICE_COLUMNS = new Set([
    'invoice_id','invoice_number','client_id','agreement_id','proposal_id','issue_date','due_date','billing_frequency',
    'payment_term','customer_name','customer_legal_name','customer_address','customer_contact_name','customer_contact_email',
    'provider_legal_name','provider_address','support_email','subtotal_locations','subtotal_one_time','invoice_total',
    'old_paid_total','paid_now','amount_paid','received_amount','pending_amount','payment_state','payment_conclusion','amount_in_words','status','notes',
    'created_by','updated_by','currency'
  ]);
  const INVOICE_ITEM_COLUMNS = new Set([
    'item_id','invoice_id','section','line_no','location_name','item_name','unit_price','discount_percent',
    'discounted_unit_price','quantity','line_total','capability_name','capability_value','notes',
    'service_start_date','service_end_date'
  ]);
  const RECEIPT_COLUMNS = new Set([
    'receipt_id','receipt_number','invoice_id','client_id','receipt_date','amount_received','payment_method',
    'payment_reference','is_settlement','notes','status',
    'invoice_number','currency','support_email','customer_name','customer_legal_name','customer_address',
    'amount_in_words','invoice_total','old_paid_total','paid_now','received_amount','new_paid_total','pending_amount','payment_state','payment_conclusion','payment_notes',
    'created_by','updated_by'
  ]);
  const RECEIPT_ITEM_COLUMNS = new Set([
    'item_id','receipt_id','invoice_item_id','section','line_no','location_name','location_address','item_name','description',
    'quantity','unit_price','discount_percent','discounted_unit_price','line_total','amount',
    'capability_name','capability_value','notes','service_start_date','service_end_date','currency'
  ]);
  const AGREEMENT_LEGACY_FIELDS = new Set([
    'backendToken','backendUrl', ...LEGACY_REQUEST_META_FIELDS, 'resource','action',
    'agreement_length','lead_id','deal_id',
    'provider_address','provider_signatory_name_primary','provider_signatory_title_primary',
    'saas_total','one_time_total',
    'agreement_items','items'
  ]);
  const PROPOSAL_LEGACY_FIELDS = new Set([
    'backendToken','backendUrl', ...LEGACY_REQUEST_META_FIELDS, 'resource','action','lead_id','agreement_id','saas_total','one_time_total',
    'valid_until','customer_sign_date','proposal_items','items'
  ]);
  const PROPOSAL_CATALOG_LEGACY_FIELDS = new Set([
    'backendToken','backendUrl', ...LEGACY_REQUEST_META_FIELDS, 'resource','action','item_section','itemName','defaultLocationName','unitPrice',
    'discountPercent','sortOrder'
  ]);
  const LEADS_DEALS_LEGACY_FIELDS = new Set([
    'backendToken',
    'backendUrl',
    ...LEGACY_REQUEST_META_FIELDS,
    'resource',
    'action',
    'proposal_id'
  ]);
  const LIST_CONTROL_PARAMS = new Set([
    'page', 'pageSize', 'perPage', 'limit', 'offset',
    'sort', 'sortBy', 'sortDir', 'sort_by', 'sort_dir',
    'search', 'q', 'mode', 'tab', 'view',
    'summary_only', 'fields',
    ...LEGACY_RESOURCE_FIELD_KEYS, 'updates', 'item'
  ]);
  const USER_PROFILE_COLUMNS = new Set([
    'id',
    'name',
    'email',
    'username',
    'role_key',
    'is_active'
  ]);
  const LIST_COLUMNS_BY_RESOURCE = {
    proposal_catalog: new Set([
      'id', 'catalog_item_id', 'is_active', 'section', 'category', 'item_name', 'default_location_name',
      'unit_price', 'discount_percent', 'quantity', 'capability_name', 'capability_value', 'notes',
      'sort_order', 'created_by', 'updated_by', 'created_at', 'updated_at'
    ]),
    proposals: new Set([
      'id', 'proposal_id', 'ref_number', 'deal_id', 'customer_name', 'customer_address', 'customer_contact_name',
      'customer_contact_mobile', 'customer_contact_email', 'provider_contact_name', 'provider_contact_mobile',
      'provider_contact_email', 'proposal_title', 'proposal_date', 'proposal_valid_until', 'agreement_date',
      'effective_date', 'service_start_date', 'service_end_date', 'contract_term', 'account_number', 'billing_frequency', 'payment_term', 'po_number',
      'currency', 'customer_legal_name', 'provider_name', 'provider_legal_name', 'terms_conditions',
      'customer_signatory_name', 'customer_signatory_title', 'provider_signatory_name', 'provider_signatory_title',
      'provider_signatory_name_secondary', 'provider_signatory_title_secondary', 'provider_sign_date',
      'subtotal_locations', 'subtotal_one_time', 'total_discount', 'grand_total', 'status',
      'generated_by', 'created_by', 'updated_by', 'created_at', 'updated_at'
    ]),
    clients: new Set([
      'id','client_id','client_name','company_name','primary_email','primary_phone','billing_frequency','payment_term',
      'status','source_agreement_id','total_agreements','total_locations','total_value','total_paid','total_due',
      'created_by','updated_by','created_at','updated_at'
    ]),
    invoices: new Set([
      'id','invoice_id','invoice_number','client_id','agreement_id','proposal_id','issue_date','due_date','billing_frequency',
      'payment_term','customer_name','customer_legal_name','customer_address','customer_contact_name','customer_contact_email',
      'provider_legal_name','provider_address','support_email','subtotal_locations','subtotal_one_time','invoice_total',
      'old_paid_total','paid_now','amount_paid','received_amount','pending_amount','payment_state','payment_conclusion','amount_in_words',
      'status','notes','currency','created_by','updated_by','created_at','updated_at'
    ]),
    receipts: new Set([
      'id','receipt_id','receipt_number','invoice_id','client_id','receipt_date','amount_received','payment_method',
      'payment_reference','is_settlement','notes','status',
      'invoice_number','currency','support_email','customer_name','customer_legal_name','customer_address',
      'amount_in_words','invoice_total','old_paid_total','paid_now','received_amount','new_paid_total','pending_amount','payment_state','payment_conclusion','payment_notes',
      'created_by','updated_by','created_at','updated_at'
    ]),
    technical_admin_requests: new Set([
      'id','request_id','technical_request_id',
      'agreement_id','agreement_number','onboarding_id','client_id','client_name',
      'request_type','request_title','request_message','request_details','request_status',
      'technical_request_type','technical_request_details','technical_request_status',
      'priority','location_count','service_start_date','service_end_date','billing_frequency','payment_term',
      'module_summary','agreement_status','requested_by','requested_at',
      'technical_admin_assigned_to','started_at','completed_at','updated_by','updated_at','notes',
      'created_at'
    ]),
    notifications: new Set([
      'notification_id','id','recipient_user_id','title','message','type','resource','resource_id',
      'status','is_read','read_at','created_at','updated_at','priority',
      'meta','meta_json','link_target','action_label','action_required','actor_user_id','actor_role'
    ])
  };

  const devLog = (...args) => {
    try {
      const host = String(window.location.hostname || '').toLowerCase();
      if (window.RUNTIME_CONFIG?.DEBUG_API || host === 'localhost' || host === '127.0.0.1') console.log(...args);
    } catch {}
  };

  function getClient() { return global.SupabaseClient.getClient(); }
  function role() { return String(global.Session?.role?.() || '').toLowerCase(); }
  function isAdminDev() { return ['admin','dev'].includes(role()); }
  function allowedRoles(resource, action) {
    const matrix = global.AppPermissions?.baseMatrix || {};
    const rules = matrix?.[resource];
    if (!rules || typeof rules !== 'object') return null;
    const list = rules[action];
    return Array.isArray(list) ? list : null;
  }
  function isAllowed(resource, action) {
    const normalizedResource = String(resource || '').trim().toLowerCase();
    const normalizedAction = String(action || '').trim().toLowerCase();
    const auth = global.Session?.authContext?.() || {};
    const hasRole = Boolean(String(auth.role || '').trim());
    const hasUser = Boolean(auth.user?.id);
    const hasSession = Boolean(auth.session?.user?.id || auth.session?.access_token);
    const authenticated = hasRole && hasUser && hasSession;
    if (!authenticated) return false;
    if (!normalizedResource || !normalizedAction) return false;
    if (global.AppPermissions?.canPerformAction) {
      return Boolean(global.AppPermissions.canPerformAction(normalizedResource, normalizedAction, auth.role));
    }
    const rule = allowedRoles(normalizedResource, normalizedAction);
    const currentRole = String(auth.role || '').trim().toLowerCase();
    if (!rule) return currentRole === 'admin';
    return rule.includes(currentRole);
  }
  function assertAllowed(resource, action, reason = '') {
    const normalizedResource = String(resource || '').trim().toLowerCase();
    const normalizedAction = String(action || '').trim().toLowerCase();
    const authContext = global.Session?.authContext?.() || {};
    const role = String(authContext.role || '').trim().toLowerCase();
    const hasRole = Boolean(role);
    const hasUser = Boolean(authContext.user?.id);
    const hasSession = Boolean(authContext.session?.user?.id || authContext.session?.access_token);
    const authenticated = hasRole && hasUser && hasSession;
    const finalDecision = isAllowed(normalizedResource, normalizedAction);
    if (finalDecision) return;
    console.warn('[supabase-data.assertAllowed]', {
      resource: normalizedResource,
      action: normalizedAction,
      role: global.Session?.role?.(),
      authenticated: global.Session?.isAuthenticated?.(),
      authContext,
      hasAppPermissions: Boolean(global.AppPermissions),
      baseAllowedRoles: global.AppPermissions?.getBaseAllowedRoles?.(normalizedResource, normalizedAction),
      matrixEntry: global.AppPermissions?.getMatrixEntry?.(normalizedResource, normalizedAction),
      finalDecision: global.AppPermissions?.canPerformAction?.(normalizedResource, normalizedAction, global.Session?.role?.())
    });
    const suffix = reason ? ` (${reason})` : '';
    throw new Error(`Forbidden: ${role || 'unknown'} cannot ${normalizedAction} ${normalizedResource}${suffix}.`);
  }

  function friendlyError(prefix, error) {
    const msg = String(error?.message || error?.error_description || 'Unknown error');
    return new Error(`${prefix}: ${msg}`);
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value || '').trim()
    );
  }

  function getPrimaryKeyForResource(resource) {
    const name = String(resource || '').trim();
    return PK_BY_RESOURCE[name] || 'id';
  }

  function getIdentifierKeysForResource(resource) {
    const pk = getPrimaryKeyForResource(resource);
    const extras = LEGACY_IDENTIFIER_KEYS[resource] || [];
    return [...new Set([pk, ...extras])];
  }

  function normalizeRow(resource, row) {
    if (!row || typeof row !== 'object') return row;
    const out = { ...row };
    for (const key of getIdentifierKeysForResource(resource)) {
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
    if (resource === 'events') {
      out.event_code = out.event_code ?? out.eventCode ?? '';
      out.eventCode = out.eventCode ?? out.event_code ?? '';
      out.start = out.start ?? out.start_at ?? out.startDate ?? out.date ?? '';
      out.end = out.end ?? out.end_at ?? out.endDate ?? out.finish ?? '';
      out.start_at = out.start_at ?? out.start ?? '';
      out.end_at = out.end_at ?? out.end ?? '';
      out.allDay = out.allDay ?? out.all_day ?? false;
    }
    if (resource === 'leads') {
      out.id = out.id ?? '';
      out.lead_id = out.lead_id ?? out.leadId ?? '';
      out.leadId = out.leadId ?? out.lead_id ?? '';
      out.next_follow_up = out.next_follow_up ?? out.nextFollowUp ?? out.next_followup_date ?? out.nextFollowupDate ?? '';
      out.last_contact = out.last_contact ?? out.lastContact ?? out.last_contact_date ?? out.lastContactDate ?? '';
      out.next_followup_date = out.next_followup_date ?? out.next_follow_up ?? '';
      out.last_contact_date = out.last_contact_date ?? out.last_contact ?? '';
      out.converted_to_deal_id = out.converted_to_deal_id ?? out.convertedDealId ?? out.deal_id ?? '';
      out.deal_id = out.deal_id ?? out.converted_to_deal_id ?? '';
    }
    if (resource === 'deals') {
      out.id = out.id ?? '';
      out.deal_id = out.deal_id ?? out.dealId ?? '';
      out.dealId = out.dealId ?? out.deal_id ?? '';
      out.lead_id = out.lead_id ?? out.leadId ?? '';
      out.leadId = out.leadId ?? out.lead_id ?? '';
      out.lead_code = out.lead_code ?? out.leadCode ?? '';
      out.leadCode = out.leadCode ?? out.lead_code ?? '';
      out.full_name = out.full_name ?? out.fullName ?? '';
      out.fullName = out.fullName ?? out.full_name ?? '';
      out.company_name = out.company_name ?? out.companyName ?? '';
      out.companyName = out.companyName ?? out.company_name ?? '';
      out.lead_source = out.lead_source ?? out.leadSource ?? '';
      out.leadSource = out.leadSource ?? out.lead_source ?? '';
      out.service_interest = out.service_interest ?? out.serviceInterest ?? '';
      out.serviceInterest = out.serviceInterest ?? out.service_interest ?? '';
      out.estimated_value = out.estimated_value ?? out.estimatedValue ?? null;
      out.estimatedValue = out.estimatedValue ?? out.estimated_value ?? null;
      out.assigned_to = out.assigned_to ?? out.assignedTo ?? '';
      out.assignedTo = out.assignedTo ?? out.assigned_to ?? '';
      out.converted_by = out.converted_by ?? out.convertedBy ?? '';
      out.convertedBy = out.convertedBy ?? out.converted_by ?? '';
      out.converted_at = out.converted_at ?? out.convertedAt ?? '';
      out.convertedAt = out.convertedAt ?? out.converted_at ?? '';
      out.created_at = out.created_at ?? out.createdAt ?? '';
      out.createdAt = out.createdAt ?? out.created_at ?? '';
      out.updated_at = out.updated_at ?? out.updatedAt ?? '';
      out.updatedAt = out.updatedAt ?? out.updated_at ?? '';
      out.proposal_needed = out.proposal_needed ?? out.proposalNeeded ?? null;
      out.proposalNeeded = out.proposalNeeded ?? out.proposal_needed ?? null;
      out.agreement_needed = out.agreement_needed ?? out.agreementNeeded ?? null;
      out.agreementNeeded = out.agreementNeeded ?? out.agreement_needed ?? null;
    }
    if (resource === 'proposal_catalog') {
      out.id = out.id ?? '';
      out.catalog_item_id = out.catalog_item_id ?? out.catalogItemId ?? '';
      out.catalogItemId = out.catalogItemId ?? out.catalog_item_id ?? '';
      out.is_active = out.is_active ?? out.isActive ?? true;
      out.isActive = out.isActive ?? out.is_active;
    }
    if (resource === 'proposals') {
      out.id = out.id ?? '';
      out.proposal_id = out.proposal_id ?? out.proposalId ?? '';
      out.proposalId = out.proposalId ?? out.proposal_id ?? '';
      out.proposal_valid_until = out.proposal_valid_until ?? out.valid_until ?? '';
      out.valid_until = out.valid_until ?? out.proposal_valid_until ?? '';
      out.contract_term = out.contract_term ?? '';
      out.agreement_length = out.agreement_length ?? out.contract_term ?? '';
      out.subtotal_locations = out.subtotal_locations ?? out.saas_total ?? 0;
      out.saas_total = out.saas_total ?? out.subtotal_locations ?? 0;
      out.subtotal_one_time = out.subtotal_one_time ?? out.one_time_total ?? 0;
      out.one_time_total = out.one_time_total ?? out.subtotal_one_time ?? 0;
    }
    if (resource === 'agreements') {
      out.id = out.id ?? '';
      out.agreement_id = out.agreement_id ?? out.agreementId ?? '';
      out.agreementId = out.agreementId ?? out.agreement_id ?? '';
      out.contract_term = out.contract_term ?? out.agreement_length ?? '';
      out.agreement_length = out.agreement_length ?? out.contract_term ?? '';
      out.subtotal_locations = out.subtotal_locations ?? out.saas_total ?? 0;
      out.saas_total = out.saas_total ?? out.subtotal_locations ?? 0;
      out.subtotal_one_time = out.subtotal_one_time ?? out.one_time_total ?? 0;
      out.one_time_total = out.one_time_total ?? out.subtotal_one_time ?? 0;
    }
    if (resource === 'operations_onboarding') {
      out.id = out.id ?? '';
      out.db_id = out.db_id ?? out.id ?? '';
      out.record_id = out.record_id ?? out.id ?? '';
      out.onboarding_id = out.onboarding_id ?? '';
      out.onboardingId = out.onboardingId ?? out.onboarding_id ?? '';
    }
    if (resource === 'technical_admin_requests') {
      out.id = out.id ?? '';
      out.request_id = out.request_id ?? out.technical_request_id ?? out.id ?? '';
      out.technical_request_id = out.technical_request_id ?? out.request_id ?? out.id ?? '';
      out.request_status = out.request_status ?? out.technical_request_status ?? 'Requested';
      out.technical_request_status = out.technical_request_status ?? out.request_status ?? 'Requested';
      out.request_type = out.request_type ?? out.technical_request_type ?? '';
      out.technical_request_type = out.technical_request_type ?? out.request_type ?? '';
      out.request_details = out.request_details ?? out.technical_request_details ?? out.request_message ?? '';
      out.technical_request_details = out.technical_request_details ?? out.request_details ?? '';
      out.request_message = out.request_message ?? out.request_details ?? out.technical_request_details ?? '';
      out.assigned_to = out.assigned_to ?? out.technical_admin_assigned_to ?? '';
      out.technical_admin_assigned_to = out.technical_admin_assigned_to ?? out.assigned_to ?? '';
    }
    if (resource === 'notifications') {
      out.notification_id = out.notification_id ?? out.id ?? '';
      out.id = out.id ?? out.notification_id ?? '';
      out.status = out.status ?? (out.is_read ? 'read' : 'unread') ?? 'unread';
      out.is_read = out.is_read === true || out.is_read === 1 || String(out.is_read || '').trim().toLowerCase() === 'true';
      out.priority = String(out.priority || 'normal').trim().toLowerCase() || 'normal';
      out.meta = out.meta ?? out.meta_json ?? {};
      out.meta_json = out.meta_json ?? out.meta ?? {};
      out.action_required = out.action_required === true || out.action_required === 1 || String(out.action_required || '').trim().toLowerCase() === 'true';
      out.action_label = out.action_label ?? '';
      out.link_target = out.link_target ?? '';
      out.actor_user_id = out.actor_user_id ?? '';
      out.actor_role = out.actor_role ?? '';
    }
    if (resource === 'users') {
      out.id = out.id ?? out.user_id ?? '';
      out.user_id = out.user_id ?? out.id ?? '';
      out.role_key = out.role_key ?? out.role ?? '';
      out.role = out.role ?? out.role_key ?? '';
      out.is_active = out.is_active ?? out.active ?? true;
      out.active = out.active ?? out.is_active;
    }
    if (resource === 'role_permissions') {
      out.permission_id = out.permission_id ?? out.id ?? '';
      out.id = out.id ?? out.permission_id ?? '';
      out.role_key = String(out.role_key || out.role || '').trim().toLowerCase();
      out.resource = String(out.resource || '').trim().toLowerCase();
      out.action = String(out.action || '').trim().toLowerCase();
      out.is_allowed = Boolean(out.is_allowed);
      out.is_active = out.is_active !== undefined ? Boolean(out.is_active) : true;
      out.allowed_roles = Array.isArray(out.allowed_roles) ? out.allowed_roles : out.allowed_roles;
    }
    if (resource === 'workflow') {
      const toRoleArray = (...values) => {
        const found = values.find(value => value !== undefined && value !== null && (Array.isArray(value) || String(value).trim() !== ''));
        if (Array.isArray(found)) return found.map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
        return String(found || '')
          .split(',')
          .map(value => String(value || '').trim().toLowerCase())
          .filter(Boolean);
      };
      const meta = out.metadata && typeof out.metadata === 'object' ? out.metadata : {};
      out.allowed_roles = toRoleArray(out.allowed_roles, out.allowed_roles_csv);
      out.allowed_roles_csv = out.allowed_roles.join(',');
      out.approval_roles = toRoleArray(out.approval_roles, out.approval_roles_csv, out.approval_role);
      out.approval_roles_csv = out.approval_roles.join(',');
      out.approval_role = out.approval_role ?? out.approval_roles[0] ?? '';
      out.user_role = out.user_role ?? meta.user_role ?? '';
      out.user_name =
        out.user_name ??
        out.userName ??
        meta.actor_display_name ??
        meta.user_name ??
        out.user_role ??
        '';
      out.userName = out.userName ?? out.user_name ?? '';
    }
    return out;
  }

  function sanitizeUserProfileRecord(record = {}, { includeId = false } = {}) {
    const mapped = compactObject({
      id: includeId ? firstDefined(record, ['id']) : undefined,
      name: firstDefined(record, ['name', 'full_name', 'display_name']),
      email: firstDefined(record, ['email']),
      username: firstDefined(record, ['username']),
      role_key: firstDefined(record, ['role_key', 'roleKey']),
      is_active: firstDefined(record, ['is_active', 'isActive', 'active', 'enabled'])
    });
    if (mapped.role_key !== undefined) mapped.role_key = String(mapped.role_key || '').trim().toLowerCase();
    if (mapped.email !== undefined) mapped.email = String(mapped.email || '').trim().toLowerCase();
    if (mapped.username !== undefined) mapped.username = String(mapped.username || '').trim();
    if (mapped.name !== undefined) mapped.name = String(mapped.name || '').trim();
    if (mapped.is_active !== undefined) mapped.is_active = Boolean(mapped.is_active);
    Object.keys(mapped).forEach(key => { if (!USER_PROFILE_COLUMNS.has(key)) delete mapped[key]; });
    return mapped;
  }

  function sanitizeReadByRole(resource, row) {
    const normalized = normalizeRow(resource, row);
    if (!normalized || typeof normalized !== 'object') return normalized;
    if (resource === 'technical_admin_requests' && role() === 'viewer') {
      const sanitized = { ...normalized };
      delete sanitized.request_details;
      delete sanitized.technical_request_details;
      delete sanitized.request_message;
      delete sanitized.notes;
      return sanitized;
    }
    return normalized;
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

  function numberOrNull(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function trimOrNull(value) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text ? text : null;
  }

  function sanitizeClientsRecord(record = {}, { includeCreatedBy = false, userId = '' } = {}) {
    const sanitized = compactObject({
      client_id: trimOrNull(firstDefined(record, ['client_id', 'clientId'])),
      client_name: trimOrNull(firstDefined(record, ['client_name', 'clientName', 'customer_name', 'customerName'])),
      company_name: trimOrNull(firstDefined(record, ['company_name', 'companyName', 'customer_legal_name', 'customerLegalName'])),
      primary_email: trimOrNull(firstDefined(record, ['primary_email', 'primaryEmail', 'primary_contact_email', 'primaryContactEmail'])),
      primary_phone: trimOrNull(firstDefined(record, ['primary_phone', 'primaryPhone', 'phone'])),
      billing_frequency: trimOrNull(firstDefined(record, ['billing_frequency', 'billingFrequency'])),
      payment_term: trimOrNull(firstDefined(record, ['payment_term', 'paymentTerm'])),
      status: trimOrNull(firstDefined(record, ['status'])),
      source_agreement_id: trimOrNull(firstDefined(record, ['source_agreement_id', 'sourceAgreementId'])),
      total_agreements: numberOrNull(firstDefined(record, ['total_agreements', 'totalAgreements'])),
      total_locations: numberOrNull(firstDefined(record, ['total_locations', 'totalLocations'])),
      total_value: numberOrNull(firstDefined(record, ['total_value', 'totalValue'])),
      total_paid: numberOrNull(firstDefined(record, ['total_paid', 'totalPaid'])),
      total_due: numberOrNull(firstDefined(record, ['total_due', 'totalDue']))
    });
    Object.keys(sanitized).forEach(key => { if (!CLIENT_COLUMNS.has(key)) delete sanitized[key]; });
    if (includeCreatedBy && userId) sanitized.created_by = userId;
    if (userId) sanitized.updated_by = userId;
    return sanitized;
  }

  function sanitizeInvoicesRecord(record = {}, { includeCreatedBy = false, userId = '' } = {}) {
    const sanitized = compactObject({
      invoice_id: trimOrNull(firstDefined(record, ['invoice_id', 'invoiceId'])),
      invoice_number: trimOrNull(firstDefined(record, ['invoice_number', 'invoiceNumber'])),
      client_id: trimOrNull(firstDefined(record, ['client_id', 'clientId'])),
      agreement_id: trimOrNull(firstDefined(record, ['agreement_id', 'agreementId'])),
      proposal_id: trimOrNull(firstDefined(record, ['proposal_id', 'proposalId'])),
      issue_date: trimOrNull(firstDefined(record, ['issue_date', 'issueDate', 'invoice_date'])),
      due_date: trimOrNull(firstDefined(record, ['due_date', 'dueDate'])),
      billing_frequency: trimOrNull(firstDefined(record, ['billing_frequency', 'billingFrequency'])),
      payment_term: trimOrNull(firstDefined(record, ['payment_term', 'paymentTerm'])),
      customer_name: trimOrNull(firstDefined(record, ['customer_name', 'customerName'])),
      customer_legal_name: trimOrNull(firstDefined(record, ['customer_legal_name', 'customerLegalName'])),
      customer_address: trimOrNull(firstDefined(record, ['customer_address', 'customerAddress'])),
      customer_contact_name: trimOrNull(firstDefined(record, ['customer_contact_name', 'customerContactName'])),
      customer_contact_email: trimOrNull(firstDefined(record, ['customer_contact_email', 'customerContactEmail'])),
      provider_legal_name: trimOrNull(firstDefined(record, ['provider_legal_name', 'providerLegalName'])),
      provider_address: trimOrNull(firstDefined(record, ['provider_address', 'providerAddress'])),
      support_email: trimOrNull(firstDefined(record, ['support_email', 'supportEmail'])),
      subtotal_locations: numberOrNull(firstDefined(record, ['subtotal_locations', 'subtotalLocations', 'subtotal_subscription'])),
      subtotal_one_time: numberOrNull(firstDefined(record, ['subtotal_one_time', 'subtotalOneTime'])),
      invoice_total: numberOrNull(firstDefined(record, ['invoice_total', 'invoiceTotal', 'grand_total'])),
      old_paid_total: numberOrNull(firstDefined(record, ['old_paid_total', 'oldPaidTotal'])),
      paid_now: numberOrNull(firstDefined(record, ['paid_now', 'paidNow'])),
      amount_paid: numberOrNull(firstDefined(record, ['amount_paid', 'amountPaid', 'received_amount', 'receivedAmount'])),
      received_amount: numberOrNull(firstDefined(record, ['received_amount', 'receivedAmount', 'amount_paid'])),
      pending_amount: numberOrNull(firstDefined(record, ['pending_amount', 'pendingAmount'])),
      payment_state: trimOrNull(firstDefined(record, ['payment_state', 'paymentState'])),
      payment_conclusion: trimOrNull(firstDefined(record, ['payment_conclusion', 'paymentConclusion'])),
      amount_in_words: trimOrNull(firstDefined(record, ['amount_in_words', 'amountInWords'])),
      status: trimOrNull(firstDefined(record, ['status'])),
      notes: trimOrNull(firstDefined(record, ['notes'])),
      currency: trimOrNull(firstDefined(record, ['currency']))
    });
    Object.keys(sanitized).forEach(key => { if (!INVOICE_COLUMNS.has(key)) delete sanitized[key]; });
    if (includeCreatedBy && userId) sanitized.created_by = userId;
    if (userId) sanitized.updated_by = userId;
    return sanitized;
  }

  function sanitizeInvoiceItemRecord(record = {}, invoiceUuid = '') {
    const sanitized = compactObject({
      item_id: trimOrNull(firstDefined(record, ['item_id', 'itemId'])),
      invoice_id: invoiceUuid,
      section: trimOrNull(firstDefined(record, ['section'])),
      line_no: numberOrNull(firstDefined(record, ['line_no', 'lineNo'])),
      location_name: trimOrNull(firstDefined(record, ['location_name', 'locationName'])),
      item_name: trimOrNull(firstDefined(record, ['item_name', 'itemName', 'description'])),
      unit_price: numberOrNull(firstDefined(record, ['unit_price', 'unitPrice'])),
      discount_percent: numberOrNull(firstDefined(record, ['discount_percent', 'discountPercent'])),
      discounted_unit_price: numberOrNull(firstDefined(record, ['discounted_unit_price', 'discountedUnitPrice'])),
      quantity: numberOrNull(firstDefined(record, ['quantity'])),
      line_total: numberOrNull(firstDefined(record, ['line_total', 'lineTotal'])),
      capability_name: trimOrNull(firstDefined(record, ['capability_name', 'capabilityName'])),
      capability_value: trimOrNull(firstDefined(record, ['capability_value', 'capabilityValue'])),
      notes: trimOrNull(firstDefined(record, ['notes'])),
      service_start_date: trimOrNull(firstDefined(record, ['service_start_date', 'serviceStartDate'])),
      service_end_date: trimOrNull(firstDefined(record, ['service_end_date', 'serviceEndDate']))
    });
    Object.keys(sanitized).forEach(key => { if (!INVOICE_ITEM_COLUMNS.has(key)) delete sanitized[key]; });
    return sanitized;
  }

  function sanitizeReceiptsRecord(record = {}, { includeCreatedBy = false, userId = '' } = {}) {
    const sanitized = compactObject({
      receipt_id: trimOrNull(firstDefined(record, ['receipt_id', 'receiptId'])),
      receipt_number: trimOrNull(firstDefined(record, ['receipt_number', 'receiptNumber'])),
      invoice_id: trimOrNull(firstDefined(record, ['invoice_id', 'invoiceId'])),
      client_id: trimOrNull(firstDefined(record, ['client_id', 'clientId'])),
      receipt_date: trimOrNull(firstDefined(record, ['receipt_date', 'receiptDate', 'received_date'])),
      amount_received: numberOrNull(firstDefined(record, ['amount_received', 'amountReceived', 'received_amount', 'grand_total'])),
      payment_method: trimOrNull(firstDefined(record, ['payment_method', 'paymentMethod'])),
      payment_reference: trimOrNull(firstDefined(record, ['payment_reference', 'paymentReference', 'reference'])),
      is_settlement: firstDefined(record, ['is_settlement', 'isSettlement']) === true,
      notes: trimOrNull(firstDefined(record, ['notes'])),
      status: trimOrNull(firstDefined(record, ['status'])),
      invoice_number: trimOrNull(firstDefined(record, ['invoice_number', 'invoiceNumber'])),
      currency: trimOrNull(firstDefined(record, ['currency'])),
      support_email: trimOrNull(firstDefined(record, ['support_email', 'supportEmail'])),
      customer_name: trimOrNull(firstDefined(record, ['customer_name', 'customerName'])),
      customer_legal_name: trimOrNull(firstDefined(record, ['customer_legal_name', 'customerLegalName'])),
      customer_address: trimOrNull(firstDefined(record, ['customer_address', 'customerAddress'])),
      amount_in_words: trimOrNull(firstDefined(record, ['amount_in_words', 'amountInWords'])),
      invoice_total: numberOrNull(firstDefined(record, ['invoice_total', 'invoiceTotal', 'invoice_grand_total', 'invoiceGrandTotal', 'grand_total'])),
      old_paid_total: numberOrNull(firstDefined(record, ['old_paid_total', 'oldPaidTotal'])),
      paid_now: numberOrNull(firstDefined(record, ['paid_now', 'paidNow'])),
      received_amount: numberOrNull(firstDefined(record, ['received_amount', 'receivedAmount', 'amount_received', 'amountReceived'])),
      new_paid_total: numberOrNull(firstDefined(record, ['new_paid_total', 'newPaidTotal'])),
      pending_amount: numberOrNull(firstDefined(record, ['pending_amount', 'pendingAmount'])),
      payment_state: trimOrNull(firstDefined(record, ['payment_state', 'paymentState'])),
      payment_conclusion: trimOrNull(firstDefined(record, ['payment_conclusion', 'paymentConclusion'])),
      payment_notes: trimOrNull(firstDefined(record, ['payment_notes', 'paymentNotes']))
    });
    Object.keys(sanitized).forEach(key => { if (!RECEIPT_COLUMNS.has(key)) delete sanitized[key]; });
    if (includeCreatedBy && userId) sanitized.created_by = userId;
    if (userId) sanitized.updated_by = userId;
    return sanitized;
  }

  function sanitizeReceiptItemRecord(record = {}, receiptUuid = '') {
    const normalizeOptionalDate = value => {
      const raw = trimOrNull(value);
      return raw || null;
    };
    const sanitized = compactObject({
      item_id: trimOrNull(firstDefined(record, ['item_id', 'itemId'])),
      receipt_id: receiptUuid,
      invoice_item_id: trimOrNull(firstDefined(record, ['invoice_item_id', 'invoiceItemId'])),
      section: trimOrNull(firstDefined(record, ['section'])),
      line_no: numberOrNull(firstDefined(record, ['line_no', 'lineNo'])),
      location_name: trimOrNull(firstDefined(record, ['location_name', 'locationName'])),
      location_address: trimOrNull(firstDefined(record, ['location_address', 'locationAddress'])),
      item_name: trimOrNull(firstDefined(record, ['item_name', 'itemName'])),
      description: trimOrNull(firstDefined(record, ['description', 'item_name', 'itemName'])),
      quantity: numberOrNull(firstDefined(record, ['quantity'])),
      unit_price: numberOrNull(firstDefined(record, ['unit_price', 'unitPrice'])),
      discount_percent: numberOrNull(firstDefined(record, ['discount_percent', 'discountPercent'])),
      discounted_unit_price: numberOrNull(firstDefined(record, ['discounted_unit_price', 'discountedUnitPrice'])),
      line_total: numberOrNull(firstDefined(record, ['line_total', 'lineTotal'])),
      amount: numberOrNull(firstDefined(record, ['amount', 'line_total', 'lineTotal'])),
      capability_name: trimOrNull(firstDefined(record, ['capability_name', 'capabilityName'])),
      capability_value: trimOrNull(firstDefined(record, ['capability_value', 'capabilityValue'])),
      notes: trimOrNull(firstDefined(record, ['notes'])),
      service_start_date: normalizeOptionalDate(firstDefined(record, ['service_start_date', 'serviceStartDate'])),
      service_end_date: normalizeOptionalDate(firstDefined(record, ['service_end_date', 'serviceEndDate'])),
      currency: trimOrNull(firstDefined(record, ['currency']))
    });
    Object.keys(sanitized).forEach(key => { if (!RECEIPT_ITEM_COLUMNS.has(key)) delete sanitized[key]; });
    return sanitized;
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

  function parseEventDateValue(value) {
    if (value === undefined || value === null) return undefined;
    const raw = String(value).trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(raw)) return raw.replace(/\s+/, 'T');
    return raw;
  }

  function sanitizeEventRecord(record = {}, { includeCreatedBy = false, userId = '' } = {}) {
    const rawEventCode = firstDefined(record, ['event_code', 'eventCode']);
    const normalizedEventCode =
      rawEventCode === undefined || rawEventCode === null
        ? undefined
        : String(rawEventCode).trim() || undefined;

    const issueIdValue = Array.isArray(record.ticketIds)
      ? record.ticketIds.filter(Boolean).join(', ')
      : firstDefined(record, ['issue_id', 'issueId', 'ticketId']);

    const mapped = compactObject({
      event_code: normalizedEventCode,
      title: firstDefined(record, ['title', 'eventTitle', 'name']),
      description: firstDefined(record, ['description', 'notes']),
      start_at: parseEventDateValue(firstDefined(record, ['start_at', 'start', 'startDate', 'date'])),
      end_at: parseEventDateValue(firstDefined(record, ['end_at', 'end', 'endDate', 'finish'])),
      location: firstDefined(record, ['location']),
      status: firstDefined(record, ['status']) || 'Planned',
      type: firstDefined(record, ['type', 'eventType']),
      environment: firstDefined(record, ['environment', 'env']),
      owner: firstDefined(record, ['owner']),
      modules: Array.isArray(firstDefined(record, ['modules']))
        ? firstDefined(record, ['modules']).join(', ')
        : firstDefined(record, ['modules']),
      impact_type: firstDefined(record, ['impact_type', 'impactType', 'impact']),
      issue_id: issueIdValue,
      all_day: firstDefined(record, ['all_day', 'allDay']),
      readiness: firstDefined(record, ['readiness', 'checklist']),
      created_by: includeCreatedBy
        ? (firstDefined(record, ['created_by', 'createdBy']) || userId || undefined)
        : undefined,
      updated_by: firstDefined(record, ['updated_by', 'updatedBy']) || userId || undefined
    });
    const sanitized = {};
    Object.entries(mapped).forEach(([key, value]) => {
      if (!EVENT_PUBLIC_COLUMNS.has(key)) return;
      if (value === undefined || value === null) return;
      sanitized[key] = value;
    });
    return sanitized;
  }

  function isBlankValue(value) {
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
  }

  function normalizeNullableUuidValue(value) {
    if (value === undefined || value === null) return undefined;
    const normalized = String(value).trim();
    if (!normalized) return undefined;
    return normalized;
  }

  function toDbBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const raw = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'signed'].includes(raw)) return true;
    if (['false', '0', 'no', 'n', 'unsigned'].includes(raw)) return false;
    return fallback;
  }

  function sanitizeLeadsOrDealsRecord(resource, record = {}, { includeCreatedBy = false, userId = '' } = {}) {
    if (resource === 'leads') {
      return sanitizeLeadRecord(record, { includeCreatedBy, userId });
    }
    const hasAny = keys => keys.some(key => Object.prototype.hasOwnProperty.call(record, key));
    const toTextOrEmpty = keys => {
      if (!hasAny(keys)) return undefined;
      const value = firstDefined(record, keys);
      if (value === undefined || value === null) return '';
      return String(value).trim();
    };
    const toDateOrNull = keys => {
      if (!hasAny(keys)) return undefined;
      const value = firstDefined(record, keys);
      if (value === undefined || value === null) return null;
      const text = String(value).trim();
      return text || null;
    };
    const toNumberOrNull = keys => {
      if (!hasAny(keys)) return undefined;
      const value = firstDefined(record, keys);
      if (value === undefined || value === null || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const toBooleanOrNull = keys => {
      if (!hasAny(keys)) return undefined;
      return toDbBoolean(firstDefined(record, keys), null);
    };

    const mapped = {
      deal_id: toTextOrEmpty(['deal_id', 'dealId']),
      lead_id: toTextOrEmpty(['lead_id', 'leadId']),
      lead_code: toTextOrEmpty(['lead_code', 'leadCode']),
      source_lead_uuid: toTextOrEmpty(['source_lead_uuid', 'sourceLeadUuid', 'lead_uuid', 'leadUuid']),
      full_name: toTextOrEmpty(['full_name', 'fullName']),
      company_name: toTextOrEmpty(['company_name', 'companyName']),
      phone: toTextOrEmpty(['phone']),
      email: toTextOrEmpty(['email']),
      country: toTextOrEmpty(['country']),
      lead_source: toTextOrEmpty(['lead_source', 'leadSource']),
      service_interest: toTextOrEmpty(['service_interest', 'serviceInterest']),
      proposal_needed: toBooleanOrNull(['proposal_needed', 'proposalNeeded']),
      agreement_needed: toBooleanOrNull(['agreement_needed', 'agreementNeeded']),
      status: toTextOrEmpty(['status']),
      stage: toTextOrEmpty(['stage']),
      priority: toTextOrEmpty(['priority']),
      estimated_value: toNumberOrNull(['estimated_value', 'estimatedValue']),
      currency: toTextOrEmpty(['currency']),
      assigned_to: toTextOrEmpty(['assigned_to', 'assignedTo']),
      converted_by: toTextOrEmpty(['converted_by', 'convertedBy']),
      converted_at: toDateOrNull(['converted_at', 'convertedAt']),
      notes: toTextOrEmpty(['notes']),
      created_at: toDateOrNull(['created_at', 'createdAt']),
      updated_at: toDateOrNull(['updated_at', 'updatedAt']),
      created_by: includeCreatedBy ? (firstDefined(record, ['created_by', 'createdBy']) || userId || undefined) : undefined,
      updated_by: firstDefined(record, ['updated_by', 'updatedBy']) || userId || undefined
    };
    const sanitized = {};
    Object.entries(mapped).forEach(([key, value]) => {
      if (!DEAL_COLUMNS.has(key)) return;
      if (value === undefined) return;
      sanitized[key] = value;
    });
    LEADS_DEALS_LEGACY_FIELDS.forEach(key => {
      delete sanitized[key];
    });
    return sanitized;
  }

  function sanitizeLeadRecord(record = {}, { includeCreatedBy = false, userId = '' } = {}) {
    const hasAny = keys => keys.some(key => Object.prototype.hasOwnProperty.call(record, key));
    const toTextOrEmpty = keys => {
      if (!hasAny(keys)) return undefined;
      const value = firstDefined(record, keys);
      if (value === undefined || value === null) return '';
      return String(value).trim();
    };
    const toDateOrNull = keys => {
      if (!hasAny(keys)) return undefined;
      const value = firstDefined(record, keys);
      if (value === undefined || value === null) return null;
      const text = String(value).trim();
      return text || null;
    };
    const toNumberOrNull = keys => {
      if (!hasAny(keys)) return undefined;
      const value = firstDefined(record, keys);
      if (value === undefined || value === null || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const toBooleanOrNull = keys => {
      if (!hasAny(keys)) return undefined;
      return toDbBoolean(firstDefined(record, keys), null);
    };

    const mapped = {
      lead_id: toTextOrEmpty(['lead_id', 'leadId']),
      full_name: toTextOrEmpty(['full_name', 'fullName']),
      company_name: toTextOrEmpty(['company_name', 'companyName']),
      phone: toTextOrEmpty(['phone']),
      email: toTextOrEmpty(['email']),
      country: toTextOrEmpty(['country']),
      lead_source: toTextOrEmpty(['lead_source', 'leadSource']),
      service_interest: toTextOrEmpty(['service_interest', 'serviceInterest']),
      status: toTextOrEmpty(['status']),
      priority: toTextOrEmpty(['priority']),
      estimated_value: toNumberOrNull(['estimated_value', 'estimatedValue']),
      currency: toTextOrEmpty(['currency']),
      assigned_to: toTextOrEmpty(['assigned_to', 'assignedTo']),
      next_follow_up: toDateOrNull(['next_follow_up', 'nextFollowUp', 'next_followup_date', 'nextFollowupDate']),
      last_contact: toDateOrNull(['last_contact', 'lastContact', 'last_contact_date', 'lastContactDate']),
      proposal_needed: toBooleanOrNull(['proposal_needed', 'proposalNeeded']),
      agreement_needed: toBooleanOrNull(['agreement_needed', 'agreementNeeded']),
      notes: toTextOrEmpty(['notes']),
      converted_to_deal_id: toTextOrEmpty(['converted_to_deal_id', 'convertedDealId', 'deal_id', 'dealId']),
      created_by: includeCreatedBy ? (firstDefined(record, ['created_by', 'createdBy']) || userId || undefined) : undefined,
      updated_by: firstDefined(record, ['updated_by', 'updatedBy']) || userId || undefined
    };

    const sanitized = {};
    Object.entries(mapped).forEach(([key, value]) => {
      if (!LEAD_COLUMNS.has(key)) return;
      if (value === undefined) return;
      sanitized[key] = value;
    });
    LEADS_DEALS_LEGACY_FIELDS.forEach(key => {
      delete sanitized[key];
    });
    return sanitized;
  }

  function sanitizeRolePermissionRecord(record = {}) {
    const mapped = compactObject({
      role_key: firstDefined(record, ['role_key', 'roleKey']),
      resource: firstDefined(record, ['resource']),
      action: firstDefined(record, ['action']),
      is_allowed: toDbBoolean(firstDefined(record, ['is_allowed', 'isAllowed']), null),
      is_active: toDbBoolean(firstDefined(record, ['is_active', 'isActive']), null),
      allowed_roles: firstDefined(record, ['allowed_roles', 'allowedRoles']),
      updated_at: firstDefined(record, ['updated_at', 'updatedAt'])
    });

    const sanitized = {};
    Object.entries(mapped).forEach(([key, value]) => {
      if (!ROLE_PERMISSION_COLUMNS.has(key)) return;
      if (value === undefined || value === null) return;
      sanitized[key] = value;
    });
    ROLE_PERMISSION_LEGACY_FIELDS.forEach(key => delete sanitized[key]);
    if (Object.prototype.hasOwnProperty.call(sanitized, 'role_key')) {
      sanitized.role_key = String(sanitized.role_key || '').trim().toLowerCase();
    }
    if (Object.prototype.hasOwnProperty.call(sanitized, 'resource')) {
      sanitized.resource = String(sanitized.resource || '').trim().toLowerCase();
    }
    if (Object.prototype.hasOwnProperty.call(sanitized, 'action')) {
      sanitized.action = String(sanitized.action || '').trim().toLowerCase();
    }
    if (Object.prototype.hasOwnProperty.call(sanitized, 'is_allowed')) {
      sanitized.is_allowed = Boolean(sanitized.is_allowed);
    }
    sanitized.is_active = Object.prototype.hasOwnProperty.call(sanitized, 'is_active')
      ? Boolean(sanitized.is_active)
      : true;
    sanitized.updated_at = String(sanitized.updated_at || new Date().toISOString());
    return sanitized;
  }

  function normalizePermissionKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeAllowedRolesText(value) {
    if (Array.isArray(value)) {
      return value
        .map(role => normalizePermissionKey(role))
        .filter(Boolean)
        .join(',');
    }
    return String(value || '')
      .split(',')
      .map(role => normalizePermissionKey(role))
      .filter(Boolean)
      .join(',');
  }

  const VALID_PERMISSION_RESOURCES = new Set([
    'tickets', 'events', 'leads', 'deals', 'proposals', 'agreements', 'invoices', 'receipts', 'clients',
    'csm_activities', 'operations_onboarding', 'technical_admin', 'workflow', 'notifications', 'ai_insights',
    'users', 'roles', 'role_permissions', 'analytics'
  ]);

  const VALID_PERMISSION_ACTIONS = new Set([
    'view',
    'get',
    'list',
    'create',
    'save',
    'update',
    'edit',
    'delete',
    'manage',
    'export',
    'approve',
    'reject',
    'request',
    'assign',
    'internal_filters',
    'bulk_update',
    'convert',
    'preview',
    'download',
    'send',
    'mark_read',
    'mark_unread'
  ]);

  function buildRolePermissionRpcPayload(input = {}) {
    const form = input.form && typeof input.form === 'object' ? input.form : {};
    const doc = typeof document !== 'undefined' ? document : null;
    const roleSelect = input.roleSelect ?? input.rolePermissionRole ?? doc?.getElementById('rolePermissionRole');
    const resourceSelect = input.resourceSelect ?? input.rolePermissionResource ?? doc?.getElementById('rolePermissionResource');
    const actionSelect = input.actionSelect ?? input.rolePermissionAction ?? doc?.getElementById('rolePermissionAction');

    const selectedRoleKey =
      input.p_role_key ??
      input.role_key ??
      input.roleKey ??
      input.role ??
      form.role_key ??
      form.roleKey ??
      roleSelect?.value ??
      '';

    const selectedResource =
      input.p_resource ??
      input.permission_resource ??
      input.permissionResource ??
      input.target_resource ??
      input.targetResource ??
      input.resource_key ??
      input.module ??
      input.module_key ??
      input.resource ??
      form.resource ??
      form.module ??
      resourceSelect?.value ??
      '';

    const selectedAction =
      input.p_action ??
      input.permission_action ??
      input.permissionAction ??
      input.target_action ??
      input.targetAction ??
      input.action_key ??
      input.permission ??
      input.permission_key ??
      input.action ??
      form.action ??
      form.permission ??
      actionSelect?.value ??
      '';

    const roleKey = normalizePermissionKey(selectedRoleKey);
    const resource = normalizePermissionKey(selectedResource);
    const action = normalizePermissionKey(selectedAction);
    if (!roleKey || !resource || !action) {
      throw new Error('Role, resource, and action are required.');
    }
    const payload = {
      p_role_key: roleKey,
      p_resource: resource,
      p_action: action,
      p_is_allowed: input.p_is_allowed ?? input.is_allowed ?? input.isAllowed ?? true,
      p_is_active: input.p_is_active ?? input.is_active ?? input.isActive ?? true,
      p_allowed_roles: normalizeAllowedRolesText(
        input.p_allowed_roles ??
        input.allowed_roles ??
        input.allowedRoles ??
        roleKey
      )
    };
    if (!payload.p_resource) {
      throw new Error('Permission resource is required.');
    }
    if (!payload.p_action) {
      throw new Error('Permission action is required.');
    }
    if (payload.p_resource === 'role' || payload.p_resource === 'permission') {
      throw new Error('Permission save was not verified in Supabase. Please check role/resource/action mapping.');
    }
    if (!VALID_PERMISSION_RESOURCES.has(payload.p_resource)) {
      try { console.warn('[role permissions] custom resource not in known list', payload.p_resource); } catch {}
    }
    if (!VALID_PERMISSION_ACTIONS.has(payload.p_action)) {
      try { console.warn('[role permissions] custom action not in known list', payload.p_action); } catch {}
    }
    try { console.log('[role permissions] selected fields', JSON.stringify({ selectedRoleKey, selectedResource, selectedAction }, null, 2)); } catch {}
    try { console.log('[role permissions] final rpc payload', JSON.stringify(payload, null, 2)); } catch {}
    return payload;
  }

  async function verifyRolePermissionPersistence(client, rpcPayload = {}) {
    const { data: verifyRows, error: verifyError } = await client
      .from('role_permissions')
      .select('permission_id, role_key, resource, action, is_allowed, is_active, allowed_roles, created_at, updated_at')
      .eq('role_key', rpcPayload.p_role_key)
      .eq('resource', rpcPayload.p_resource)
      .eq('action', rpcPayload.p_action)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (verifyError) throw verifyError;
    if (!Array.isArray(verifyRows) || !verifyRows.length) {
      throw new Error('Permission save was not verified in Supabase. Please check role/resource/action mapping.');
    }
    const savedRow = verifyRows[0];
    try { console.log('[role permissions] verified row', JSON.stringify(savedRow, null, 2)); } catch {}
    return savedRow;
  }

  function sanitizeProposalCatalogRecord(record = {}, { includeCreatedBy = false, userId = '' } = {}) {
    const mapped = compactObject({
      catalog_item_id: firstDefined(record, ['catalog_item_id', 'catalogItemId']),
      is_active: toDbBoolean(firstDefined(record, ['is_active', 'isActive']), null),
      section: firstDefined(record, ['section']),
      category: firstDefined(record, ['category']),
      item_name: firstDefined(record, ['item_name', 'itemName', 'name']),
      default_location_name: firstDefined(record, ['default_location_name', 'defaultLocationName', 'location_name']),
      unit_price: firstDefined(record, ['unit_price', 'unitPrice']),
      discount_percent: firstDefined(record, ['discount_percent', 'discountPercent']),
      quantity: firstDefined(record, ['quantity']),
      capability_name: firstDefined(record, ['capability_name', 'capabilityName']),
      capability_value: firstDefined(record, ['capability_value', 'capabilityValue']),
      notes: firstDefined(record, ['notes']),
      sort_order: firstDefined(record, ['sort_order', 'sortOrder'])
    });
    const sanitized = {};
    Object.entries(mapped).forEach(([key, value]) => {
      if (!PROPOSAL_CATALOG_COLUMNS.has(key)) return;
      if (value === undefined || value === null) return;
      sanitized[key] = value;
    });
    PROPOSAL_CATALOG_LEGACY_FIELDS.forEach(key => delete sanitized[key]);
    return sanitized;
  }

  function pickProposalCatalogMutationId(payload = {}) {
    const value = firstDefined(payload, ['id']) ??
      firstDefined(payload.updates || {}, ['id']) ??
      firstDefined(payload.item || {}, ['id']);
    const id = String(value || '').trim();
    if (!id) throw new Error('proposal_catalog update/delete requires UUID id.');
    return id;
  }

  function sanitizeProposalRecord(record = {}, { includeCreatedBy = false, userId = '', ensureBusinessIds = false } = {}) {
    const proposalIdSource = firstDefined(record, ['proposal_id', 'proposalId']);
    const refNumberSource = firstDefined(record, ['ref_number', 'refNumber']);
    const mapped = compactObject({
      proposal_id: ensureBusinessIds ? ensureBusinessProposalId(proposalIdSource) : proposalIdSource,
      ref_number: ensureBusinessIds ? ensureProposalRefNumber(refNumberSource) : refNumberSource,
      deal_id: normalizeNullableUuidValue(firstDefined(record, ['deal_id', 'dealId'])),
      customer_name: firstDefined(record, ['customer_name', 'customerName']),
      customer_address: firstDefined(record, ['customer_address', 'customerAddress']),
      customer_contact_name: firstDefined(record, ['customer_contact_name', 'customerContactName']),
      customer_contact_mobile: firstDefined(record, ['customer_contact_mobile', 'customerContactMobile']),
      customer_contact_email: firstDefined(record, ['customer_contact_email', 'customerContactEmail']),
      provider_contact_name: firstDefined(record, ['provider_contact_name', 'providerContactName']),
      provider_contact_mobile: firstDefined(record, ['provider_contact_mobile', 'providerContactMobile']),
      provider_contact_email: firstDefined(record, ['provider_contact_email', 'providerContactEmail']),
      proposal_title: firstDefined(record, ['proposal_title', 'proposalTitle']),
      proposal_date: normalizeNullableDateValue(firstDefined(record, ['proposal_date', 'proposalDate'])),
      proposal_valid_until: normalizeNullableDateValue(firstDefined(record, ['proposal_valid_until', 'proposalValidUntil', 'valid_until'])),
      agreement_date: normalizeNullableDateValue(firstDefined(record, ['agreement_date', 'agreementDate'])),
      effective_date: normalizeNullableDateValue(firstDefined(record, ['effective_date', 'effectiveDate'])),
      service_start_date: normalizeNullableDateValue(firstDefined(record, ['service_start_date', 'serviceStartDate'])),
      service_end_date: normalizeNullableDateValue(firstDefined(record, ['service_end_date', 'serviceEndDate'])),
      contract_term: firstDefined(record, ['contract_term', 'contractTerm']),
      account_number: firstDefined(record, ['account_number', 'accountNumber']),
      billing_frequency: firstDefined(record, ['billing_frequency', 'billingFrequency']),
      payment_term: firstDefined(record, ['payment_term', 'paymentTerm']),
      po_number: firstDefined(record, ['po_number', 'poNumber']),
      currency: firstDefined(record, ['currency']),
      customer_legal_name: firstDefined(record, ['customer_legal_name', 'customerLegalName']),
      provider_name: firstDefined(record, ['provider_name', 'providerName']),
      provider_legal_name: firstDefined(record, ['provider_legal_name', 'providerLegalName']),
      terms_conditions: firstDefined(record, ['terms_conditions', 'termsConditions']),
      customer_signatory_name: firstDefined(record, ['customer_signatory_name', 'customerSignatoryName']),
      customer_signatory_title: firstDefined(record, ['customer_signatory_title', 'customerSignatoryTitle']),
      provider_signatory_name: firstDefined(record, ['provider_signatory_name', 'providerSignatoryName']),
      provider_signatory_title: firstDefined(record, ['provider_signatory_title', 'providerSignatoryTitle']),
      provider_signatory_name_secondary: firstDefined(record, ['provider_signatory_name_secondary', 'providerSignatoryNameSecondary']),
      provider_signatory_title_secondary: firstDefined(record, ['provider_signatory_title_secondary', 'providerSignatoryTitleSecondary']),
      provider_sign_date: normalizeNullableDateValue(firstDefined(record, ['provider_sign_date', 'providerSignDate'])),
      subtotal_locations: firstDefined(record, ['subtotal_locations', 'subtotalLocations', 'saas_total']),
      subtotal_one_time: firstDefined(record, ['subtotal_one_time', 'subtotalOneTime', 'one_time_total']),
      total_discount: firstDefined(record, ['total_discount', 'totalDiscount']),
      grand_total: firstDefined(record, ['grand_total', 'grandTotal']),
      status: firstDefined(record, ['status']),
      generated_by: firstDefined(record, ['generated_by', 'generatedBy']),
      created_by: includeCreatedBy
        ? (firstDefined(record, ['created_by', 'createdBy']) || userId || undefined)
        : undefined,
      updated_by: firstDefined(record, ['updated_by', 'updatedBy']) || userId || undefined
    });
    const sanitized = {};
    Object.entries(mapped).forEach(([key, value]) => {
      if (!PROPOSAL_COLUMNS.has(key)) return;
      if (value === undefined || value === null) return;
      sanitized[key] = value;
    });
    PROPOSAL_LEGACY_FIELDS.forEach(key => delete sanitized[key]);
    return sanitized;
  }

  function sanitizeProposalItemRecord(record = {}, proposalUuid = '') {
    const mapped = compactObject({
      item_id: firstDefined(record, ['item_id', 'itemId']),
      proposal_id: normalizeNullableUuidValue(proposalUuid || firstDefined(record, ['proposal_id', 'proposalId'])),
      section: firstDefined(record, ['section']),
      line_no: firstDefined(record, ['line_no', 'lineNo', 'line']),
      location_name: firstDefined(record, ['location_name', 'locationName']),
      item_name: firstDefined(record, ['item_name', 'itemName', 'name']),
      unit_price: firstDefined(record, ['unit_price', 'unitPrice']),
      discount_percent: firstDefined(record, ['discount_percent', 'discountPercent']),
      discounted_unit_price: firstDefined(record, ['discounted_unit_price', 'discountedUnitPrice']),
      quantity: firstDefined(record, ['quantity']),
      line_total: firstDefined(record, ['line_total', 'lineTotal']),
      service_start_date: normalizeNullableDateValue(firstDefined(record, ['service_start_date', 'serviceStartDate'])),
      service_end_date: normalizeNullableDateValue(firstDefined(record, ['service_end_date', 'serviceEndDate'])),
      capability_name: firstDefined(record, ['capability_name', 'capabilityName']),
      capability_value: firstDefined(record, ['capability_value', 'capabilityValue']),
      notes: firstDefined(record, ['notes'])
    });
    const sanitized = {};
    Object.entries(mapped).forEach(([key, value]) => {
      if (!PROPOSAL_ITEM_COLUMNS.has(key)) return;
      if (value === undefined || value === null) return;
      sanitized[key] = value;
    });
    return sanitized;
  }

  function normalizeNullableDateValue(value) {
    if (value === undefined || value === null) return undefined;
    const normalized = String(value).trim();
    if (!normalized) return null;
    return normalized;
  }

  function normalizeNumericValue(value, defaultValue = 0) {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'number') return Number.isFinite(value) ? value : defaultValue;
    const normalized = String(value).trim();
    if (!normalized) return defaultValue;
    const parsed = Number(normalized.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }

  function sanitizeAgreementRecord(record = {}, { includeCreatedBy = false, userId = '' } = {}) {
    const hasAny = keys => keys.some(key => Object.prototype.hasOwnProperty.call(record, key));
    const gmSignedKeys = ['gm_signed', 'gmSigned', 'signed_by_gm', 'signedByGm'];
    const financialControllerSignedKeys = [
      'financial_controller_signed',
      'financialControllerSigned',
      'signed_by_financial_controller',
      'signedByFinancialController'
    ];
    const mapped = {
      agreement_id: firstDefined(record, ['agreement_id', 'agreementId']),
      proposal_id: normalizeNullableUuidValue(firstDefined(record, ['proposal_id', 'proposalId'])),
      agreement_number: firstDefined(record, ['agreement_number', 'agreementNumber']),
      agreement_title: firstDefined(record, ['agreement_title', 'agreementTitle']),
      customer_name: firstDefined(record, ['customer_name', 'customerName']),
      customer_legal_name: firstDefined(record, ['customer_legal_name', 'customerLegalName']),
      customer_address: firstDefined(record, ['customer_address', 'customerAddress']),
      customer_contact_name: firstDefined(record, ['customer_contact_name', 'customerContactName']),
      customer_contact_mobile: firstDefined(record, ['customer_contact_mobile', 'customerContactMobile']),
      customer_contact_email: firstDefined(record, ['customer_contact_email', 'customerContactEmail']),
      provider_name: firstDefined(record, ['provider_name', 'providerName']),
      provider_legal_name: firstDefined(record, ['provider_legal_name', 'providerLegalName']),
      provider_contact_name: firstDefined(record, ['provider_contact_name', 'providerContactName']),
      provider_contact_mobile: firstDefined(record, ['provider_contact_mobile', 'providerContactMobile']),
      provider_contact_email: firstDefined(record, ['provider_contact_email', 'providerContactEmail']),
      agreement_date: normalizeNullableDateValue(firstDefined(record, ['agreement_date', 'agreementDate'])),
      effective_date: normalizeNullableDateValue(firstDefined(record, ['effective_date', 'effectiveDate'])),
      service_start_date: normalizeNullableDateValue(firstDefined(record, ['service_start_date', 'serviceStartDate'])),
      service_end_date: normalizeNullableDateValue(firstDefined(record, ['service_end_date', 'serviceEndDate'])),
      contract_term: firstDefined(record, ['contract_term', 'contractTerm', 'agreement_length', 'agreementLength']),
      account_number: firstDefined(record, ['account_number', 'accountNumber']),
      billing_frequency: firstDefined(record, ['billing_frequency', 'billingFrequency']),
      payment_term: firstDefined(record, ['payment_term', 'paymentTerm']),
      po_number: firstDefined(record, ['po_number', 'poNumber']),
      terms_conditions: firstDefined(record, ['terms_conditions', 'termsConditions']),
      customer_signatory_name: firstDefined(record, ['customer_signatory_name', 'customerSignatoryName']),
      customer_signatory_title: firstDefined(record, ['customer_signatory_title', 'customerSignatoryTitle']),
      customer_sign_date: normalizeNullableDateValue(firstDefined(record, ['customer_sign_date', 'customerSignDate'])),
      provider_signatory_name: firstDefined(record, ['provider_signatory_name', 'providerSignatoryName', 'provider_signatory_name_primary']),
      provider_signatory_title: firstDefined(record, ['provider_signatory_title', 'providerSignatoryTitle', 'provider_signatory_title_primary']),
      provider_signatory_name_secondary: firstDefined(record, ['provider_signatory_name_secondary', 'providerSignatoryNameSecondary', 'provider_signatory_secondary', 'providerSignatorySecondary']),
      provider_signatory_title_secondary: firstDefined(record, ['provider_signatory_title_secondary', 'providerSignatoryTitleSecondary']),
      provider_sign_date: normalizeNullableDateValue(firstDefined(record, ['provider_sign_date', 'providerSignDate'])),
      gm_signed: hasAny(gmSignedKeys)
        ? toDbBoolean(firstDefined(record, gmSignedKeys), false)
        : includeCreatedBy
          ? false
          : undefined,
      financial_controller_signed: hasAny(financialControllerSignedKeys)
        ? toDbBoolean(firstDefined(record, financialControllerSignedKeys), false)
        : includeCreatedBy
          ? false
          : undefined,
      signed_date: normalizeNullableDateValue(firstDefined(record, ['signed_date', 'signedDate'])),
      status: firstDefined(record, ['status']),
      subtotal_locations: normalizeNumericValue(firstDefined(record, ['subtotal_locations', 'subtotalLocations', 'saas_total']), 0),
      subtotal_one_time: normalizeNumericValue(firstDefined(record, ['subtotal_one_time', 'subtotalOneTime', 'one_time_total']), 0),
      total_discount: normalizeNumericValue(firstDefined(record, ['total_discount', 'totalDiscount']), 0),
      grand_total: normalizeNumericValue(firstDefined(record, ['grand_total', 'grandTotal']), 0),
      generated_by: firstDefined(record, ['generated_by', 'generatedBy']),
      created_by: includeCreatedBy
        ? (firstDefined(record, ['created_by', 'createdBy']) || userId || undefined)
        : undefined,
      updated_by: firstDefined(record, ['updated_by', 'updatedBy']) || userId || undefined,
      currency: firstDefined(record, ['currency']),
      notes: firstDefined(record, ['notes'])
    };
    const sanitized = {};
    Object.entries(mapped).forEach(([key, value]) => {
      if (!AGREEMENT_COLUMNS.has(key)) return;
      if (value === undefined) return;
      sanitized[key] = value;
    });
    AGREEMENT_LEGACY_FIELDS.forEach(key => delete sanitized[key]);
    return sanitized;
  }

  function sanitizeAgreementItemRecord(record = {}, agreementUuid = '') {
    const mapped = compactObject({
      item_id: firstDefined(record, ['item_id', 'itemId']),
      agreement_id: normalizeNullableUuidValue(agreementUuid || firstDefined(record, ['agreement_id', 'agreementId'])),
      section: firstDefined(record, ['section']),
      line_no: normalizeNumericValue(firstDefined(record, ['line_no', 'lineNo', 'line']), 0),
      location_name: firstDefined(record, ['location_name', 'locationName']),
      item_name: firstDefined(record, ['item_name', 'itemName', 'name']),
      unit_price: normalizeNumericValue(firstDefined(record, ['unit_price', 'unitPrice']), 0),
      discount_percent: normalizeNumericValue(firstDefined(record, ['discount_percent', 'discountPercent']), 0),
      discounted_unit_price: normalizeNumericValue(firstDefined(record, ['discounted_unit_price', 'discountedUnitPrice']), 0),
      quantity: normalizeNumericValue(firstDefined(record, ['quantity']), 0),
      line_total: normalizeNumericValue(firstDefined(record, ['line_total', 'lineTotal']), 0),
      service_start_date: normalizeNullableDateValue(firstDefined(record, ['service_start_date', 'serviceStartDate'])),
      service_end_date: normalizeNullableDateValue(firstDefined(record, ['service_end_date', 'serviceEndDate'])),
      capability_name: firstDefined(record, ['capability_name', 'capabilityName']),
      capability_value: firstDefined(record, ['capability_value', 'capabilityValue']),
      notes: firstDefined(record, ['notes'])
    });
    const sanitized = {};
    Object.entries(mapped).forEach(([key, value]) => {
      if (!AGREEMENT_ITEM_COLUMNS.has(key)) return;
      if (value === undefined) return;
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

  function generateTicketId() {
    return `TK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  function generateBusinessProposalId() {
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(
      date.getDate()
    ).padStart(2, '0')}`;
    const suffix = Math.floor(Math.random() * 1000000)
      .toString()
      .padStart(6, '0');
    return `PR-${stamp}-${suffix}`;
  }

  function ensureBusinessProposalId(value = '') {
    const trimmed = String(value ?? '').trim();
    return trimmed || generateBusinessProposalId();
  }

  function generateProposalRefNumber() {
    return `${Date.now()}${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')}`;
  }

  function sanitizeProposalRefNumber(value = '') {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (/^\d+(?:\.0+)?$/.test(raw)) return raw.split('.')[0];
    return raw.replace(/\D+/g, '');
  }

  function ensureProposalRefNumber(value = '') {
    const sanitized = sanitizeProposalRefNumber(value);
    return sanitized || generateProposalRefNumber();
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

  function ticketRowId(row = {}) {
    return row.id;
  }

  function ticketBusinessId(row = {}) {
    return row.ticket_id;
  }

  function toTicketInternalRecord(row = {}) {
    const record = {
      ticket_id: ticketRowId(row),
      youtrack_reference: row.youtrack_reference ?? row.youtrackReference ?? '',
      dev_team_status: row.dev_team_status ?? row.devTeamStatus ?? '',
      issue_related: row.issue_related ?? row.issueRelated ?? '',
      notes: row.notes ?? ''
    };
    return record;
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
    const normalizedRows = Array.isArray(rows) ? rows.map(r => sanitizeReadByRole(resource, r)) : [];
    return { rows: normalizedRows, total: normalizedRows.length, returned: normalizedRows.length, hasMore: false, page: 1, limit: normalizedRows.length || 50, offset: 0 };
  }

  function normalizePagedList(resource, rows, controls = {}, total = 0) {
    const normalizedRows = Array.isArray(rows) ? rows.map(r => sanitizeReadByRole(resource, r)) : [];
    const limit = Math.max(1, Number(controls.limit || normalizedRows.length || 50));
    const page = Math.max(1, Number(controls.page || 1));
    const offset = Math.max(0, Number(controls.offset ?? (page - 1) * limit));
    const returned = normalizedRows.length;
    const safeTotal = Number.isFinite(Number(total)) ? Number(total) : returned;
    return {
      rows: normalizedRows,
      total: safeTotal,
      returned,
      hasMore: offset + returned < safeTotal,
      page,
      limit,
      offset
    };
  }

  function firstDefinedIdentifier(source, keys = []) {
    if (!source || typeof source !== 'object') return '';
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
    }
    return '';
  }

  function getResourceIdentifier(resource, payload = {}, { action = '' } = {}) {
    const pk = getPrimaryKeyForResource(resource);
    const keys = getIdentifierKeysForResource(resource);
    const containers = [
      payload,
      payload.item,
      payload.updates,
      payload.activity,
      payload[resource],
      payload[resource?.endsWith('s') ? resource.slice(0, -1) : resource]
    ];
    for (const source of containers) {
      const found = firstDefinedIdentifier(source, keys);
      if (found) {
        console.log('[CRUD] resource, pk, value', resource, pk, found);
        return found;
      }
    }
    console.log('[CRUD] resource, pk, value', resource, pk, undefined);
    return '';
  }

  function requireResourceIdentifier(resource, payload = {}, context = '') {
    const pk = getPrimaryKeyForResource(resource);
    const value = getResourceIdentifier(resource, payload, { action: context });
    if (value) return value;
    const suffix = context ? ` for ${context}` : '';
    throw new Error(`Missing ${pk}${suffix}`);
  }

  async function resolveResourceUuid(resource, payload = {}, client) {
    const directId = String(
      firstDefined(payload, ['id']) ??
      firstDefined(payload.item || {}, ['id']) ??
      firstDefined(payload.updates || {}, ['id']) ??
      ''
    ).trim();
    if (isUuid(directId)) return directId;
    if (!['clients', 'invoices', 'receipts'].includes(resource)) return getResourceIdentifier(resource, payload, { action: 'resolve uuid' });
    const businessId = String(
      firstDefined(payload, [resource === 'clients' ? 'client_id' : resource === 'invoices' ? 'invoice_id' : 'receipt_id']) ??
      firstDefined(payload.item || {}, [resource === 'clients' ? 'client_id' : resource === 'invoices' ? 'invoice_id' : 'receipt_id']) ??
      firstDefined(payload.updates || {}, [resource === 'clients' ? 'client_id' : resource === 'invoices' ? 'invoice_id' : 'receipt_id']) ??
      ''
    ).trim();
    if (!businessId) return '';
    const businessKey = resource === 'clients' ? 'client_id' : resource === 'invoices' ? 'invoice_id' : 'receipt_id';
    const table = TABLE_BY_RESOURCE[resource];
    const { data, error } = await client.from(table).select('id').eq(businessKey, businessId).maybeSingle();
    if (error) throw friendlyError(`Unable to resolve ${resource} identifier`, error);
    return String(data?.id || '').trim();
  }

  async function resolveTechnicalAdminRequestUuid(payload = {}, client) {
    const directId = String(
      firstDefined(payload, ['id']) ??
      firstDefined(payload.item || {}, ['id']) ??
      firstDefined(payload.updates || {}, ['id']) ??
      ''
    ).trim();
    if (isUuid(directId)) return directId;

    const externalId = String(
      firstDefined(payload, ['technical_request_id', 'request_id']) ??
      firstDefined(payload.item || {}, ['technical_request_id', 'request_id']) ??
      firstDefined(payload.updates || {}, ['technical_request_id', 'request_id']) ??
      ''
    ).trim();
    if (!externalId) return '';

    let query = client.from('technical_admin_requests').select('id').eq('request_id', externalId).limit(1);
    let { data, error } = await query.maybeSingle();
    if (error) throw friendlyError('Unable to resolve technical admin request identifier', error);
    if (data?.id) return String(data.id).trim();

    query = client.from('technical_admin_requests').select('id').eq('id', externalId).limit(1);
    ({ data, error } = await query.maybeSingle());
    if (error) throw friendlyError('Unable to resolve technical admin request identifier', error);
    if (data?.id) return String(data.id).trim();

    query = client.from('technical_admin_requests').select('id').eq('technical_request_id', externalId).limit(1);
    ({ data, error } = await query.maybeSingle());
    if (error) throw friendlyError('Unable to resolve technical admin request identifier', error);
    return String(data?.id || '').trim();
  }

  async function resolveOperationsOnboardingId(payload = {}, client) {
    const directId = String(
      firstDefined(payload, ['id', 'db_id', 'record_id']) ??
      firstDefined(payload.item || {}, ['id', 'db_id', 'record_id']) ??
      firstDefined(payload.updates || {}, ['id', 'db_id', 'record_id']) ??
      ''
    ).trim();
    if (directId) return directId;

    const onboardingId = String(
      firstDefined(payload, ['onboarding_id', 'onboardingId']) ??
      firstDefined(payload.item || {}, ['onboarding_id', 'onboardingId']) ??
      firstDefined(payload.updates || {}, ['onboarding_id', 'onboardingId']) ??
      ''
    ).trim();
    if (onboardingId) {
      const { data, error } = await client
        .from('operations_onboarding')
        .select('id')
        .eq('onboarding_id', onboardingId)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) throw friendlyError('Unable to resolve operations onboarding identifier', error);
      if (data && data.length) return String(data[0].id || '').trim();
    }

    const agreementId = String(
      firstDefined(payload, ['agreement_id', 'agreementId']) ??
      firstDefined(payload.item || {}, ['agreement_id', 'agreementId']) ??
      firstDefined(payload.updates || {}, ['agreement_id', 'agreementId']) ??
      ''
    ).trim();
    if (agreementId) {
      const { data, error } = await client
        .from('operations_onboarding')
        .select('id')
        .eq('agreement_id', agreementId)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) throw friendlyError('Unable to resolve operations onboarding by agreement', error);
      if (data && data.length) return String(data[0].id || '').trim();
    }

    return '';
  }

  function splitListPayload(payload = {}) {
    const rawFilters = payload.filters && typeof payload.filters === 'object' ? payload.filters : payload;
    const controls = {};
    const dbFilters = {};
    Object.entries(rawFilters || {}).forEach(([key, value]) => {
      if (LIST_CONTROL_PARAMS.has(key)) {
        controls[key] = value;
        return;
      }
      dbFilters[key] = value;
    });
    return { controls, dbFilters };
  }

  function normalizeListControls(controls = {}, resource = '') {
    const numberOr = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const page = Math.max(1, numberOr(controls.page, 1));
    const limit = Math.max(1, numberOr(controls.pageSize ?? controls.perPage ?? controls.limit, 50));
    const rawOffset = controls.offset;
    const offset = rawOffset === undefined || rawOffset === null || rawOffset === ''
      ? Math.max(0, (page - 1) * limit)
      : Math.max(0, numberOr(rawOffset, 0));
    const sortByRaw = String(controls.sort_by ?? controls.sortBy ?? controls.sort ?? 'updated_at').trim();
    const sortDirRaw = String(controls.sort_dir ?? controls.sortDir ?? 'desc').trim().toLowerCase();
    const allowedColumns = LIST_COLUMNS_BY_RESOURCE[resource];
    const sortBy = allowedColumns && allowedColumns.has(sortByRaw) ? sortByRaw : 'updated_at';
    const sortDir = sortDirRaw === 'asc' ? 'asc' : 'desc';
    const from = offset;
    const to = offset + limit - 1;
    return { page, limit, offset, sortBy, sortDir, from, to };
  }

  function applyFilters(query, payload = {}, { resource = '' } = {}) {
    const { dbFilters } = splitListPayload(payload);
    const allowedColumns = LIST_COLUMNS_BY_RESOURCE[resource];
    Object.entries(dbFilters || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (allowedColumns && !allowedColumns.has(key)) return;
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
    if (!ITEM_TABLES[resource] || !row) return sanitizeReadByRole(resource, row);
    const fk = ITEM_FK[resource];
    const id = row.id || row[fk];
    if (!id) return sanitizeReadByRole(resource, row);
    const client = getClient();
    const { data, error } = await client.from(ITEM_TABLES[resource]).select('*').eq(fk, id).order('created_at', { ascending: true });
    if (error) throw friendlyError(`Unable to load ${ITEM_TABLES[resource]}`, error);
    const key = ITEM_TABLES[resource];
    return sanitizeReadByRole(resource, { ...row, [key]: data || [], items: data || [] });
  }

  async function handleWorkflow(action, payload) {
    const client = getClient();
    const requestedAction = String(action || '').trim().toLowerCase();
    const safePayload = payload && typeof payload === 'object' ? payload : {};

    const asArray = value => (Array.isArray(value) ? value : []);
    const firstValue = (...values) => {
      for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
      return '';
    };
    const normalizeWorkflowRows = value => asArray(value).map(row => normalizeRow('workflow', row));
    const normalizeWorkflowSingle = value => normalizeRow('workflow', value || {});
    const WORKFLOW_HELPER_FIELDS = new Set([
      'resource',
      'action',
      'approval_id',
      'approval_role',
      'requester_user_id',
      'requester_role',
      'record_snapshot',
      'target_workflow_resource',
      'allowed_roles_csv',
      'approval_roles_csv'
    ]);
    const WORKFLOW_RESOURCE_ID_HINTS = {
      proposals: ['proposal_id'],
      agreements: ['agreement_id'],
      invoices: ['invoice_id'],
      receipts: ['receipt_id']
    };
    const WORKFLOW_RESOURCE_BUSINESS_KEY = {
      proposals: 'proposal_id',
      agreements: 'agreement_id',
      invoices: 'invoice_id',
      receipts: 'receipt_id'
    };
    const normalizeRoleList = (...values) => {
      const found = values.find(value => value !== undefined && value !== null && (Array.isArray(value) || String(value).trim() !== ''));
      if (Array.isArray(found)) return found.map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
      return String(found || '')
        .split(',')
        .map(value => String(value || '').trim().toLowerCase())
        .filter(Boolean);
    };
    async function insertWorkflowAuditLog(entry = {}) {
      const actorDisplayName = String(
        entry.user_name ||
        global.Session?.displayName?.() ||
        global.Session?.username?.() ||
        global.Session?.userId?.() ||
        ''
      ).trim();
      const actorUserId = String(entry.user_id ?? global.Session?.userId?.() ?? '').trim();
      const actorUserRole = String(entry.user_role || global.Session?.role?.() || '').trim().toLowerCase();
      const payloadRow = compactObject({
        resource: String(entry.resource || '').trim(),
        record_id: String(entry.record_id || '').trim(),
        action: String(entry.action || '').trim(),
        old_status: entry.old_status ?? null,
        new_status: entry.new_status ?? null,
        allowed: entry.allowed === true,
        reason: String(entry.reason || '').trim(),
        user_id: actorUserId || null,
        user_role: actorUserRole || null,
        metadata: {
          ...(entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {}),
          user_name: actorDisplayName || undefined,
          actor_display_name: actorDisplayName || undefined,
          user_role: actorUserRole || undefined
        }
      });
      const { error } = await client.from('workflow_audit_log').insert(payloadRow);
      if (error) throw workflowError('Unable to write workflow audit log', error);
    }
    function normalizeWorkflowResource(resourceValue = '', requestedChanges = {}) {
      const direct = String(
        resourceValue ||
        requestedChanges?.resource ||
        requestedChanges?.target_workflow_resource ||
        requestedChanges?.record_snapshot?.resource ||
        ''
      ).trim().toLowerCase();
      if (direct && direct !== 'workflow') return direct;
      if (requestedChanges?.proposal_id || requestedChanges?.proposal_number) return 'proposals';
      if (requestedChanges?.agreement_id || requestedChanges?.agreement_number) return 'agreements';
      if (requestedChanges?.invoice_id || requestedChanges?.invoice_number) return 'invoices';
      if (requestedChanges?.receipt_id || requestedChanges?.receipt_number) return 'receipts';
      return direct || '';
    }
    async function loadApprovalRowById(approvalId = '') {
      const id = String(approvalId || '').trim();
      if (!id) throw new Error('Approval id is required.');
      const { data, error } = await client
        .from('workflow_approvals')
        .select('*')
        .eq('approval_id', id)
        .maybeSingle();
      if (error) throw workflowError('Unable to load approval request', error);
      if (!data) throw workflowError('Approval request not found.');
      return normalizeWorkflowSingle(data);
    }
    async function fireWorkflowNotificationRpc(fnName = '', args = {}) {
      const rpcName = String(fnName || '').trim();
      if (!rpcName) return null;
      try {
        const { data, error } = await client.rpc(rpcName, args || {});
        if (error) {
          console.warn(`[workflow notifications] ${rpcName} failed`, error);
          return null;
        }
        return data ?? null;
      } catch (error) {
        console.warn(`[workflow notifications] ${rpcName} failed`, error);
        return null;
      }
    }
    async function notifyWorkflowApprovalCreated(approvalId = '') {
      const normalizedId = String(approvalId || '').trim();
      if (!normalizedId) return null;
      return fireWorkflowNotificationRpc('notify_workflow_approval_request', { p_approval_id: normalizedId });
    }
    async function notifyWorkflowDecision(approvalId = '', decision = '', reviewerComment = '') {
      const normalizedId = String(approvalId || '').trim();
      const normalizedDecision = String(decision || '').trim().toLowerCase();
      if (!normalizedId || !normalizedDecision) return null;
      return fireWorkflowNotificationRpc('notify_workflow_decision', {
        p_approval_id: normalizedId,
        p_decision: normalizedDecision,
        p_reviewer_comment: String(reviewerComment || '').trim() || null
      });
    }
    async function resolveWorkflowTargetRecord(resourceValue = '', approval = {}) {
      const resource = String(resourceValue || '').trim().toLowerCase();
      const table = TABLE_BY_RESOURCE[resource];
      const primaryKey = PK_BY_RESOURCE[resource] || 'id';
      if (!table || !primaryKey) throw workflowError(`Unsupported workflow resource: ${resource || 'unknown'}`);
      const requestedChanges = approval?.requested_changes && typeof approval.requested_changes === 'object'
        ? approval.requested_changes
        : {};
      const directRecordId = String(approval?.record_id || '').trim();
      const hintValues = (WORKFLOW_RESOURCE_ID_HINTS[resource] || [])
        .map(key => String(requestedChanges?.[key] || '').trim())
        .filter(Boolean);
      const candidateIds = [...new Set([directRecordId, ...hintValues].filter(Boolean))];
      const businessIdColumn = WORKFLOW_RESOURCE_BUSINESS_KEY[resource];
      for (const candidate of candidateIds) {
        let query = client.from(table).select('*').eq(primaryKey, candidate).limit(1).maybeSingle();
        let { data, error } = await query;
        if (error) throw workflowError(`Unable to load ${resource} record`, error);
        if (!data && businessIdColumn) {
          ({ data, error } = await client.from(table).select('*').eq(businessIdColumn, candidate).limit(1).maybeSingle());
          if (error) throw workflowError(`Unable to load ${resource} record`, error);
        }
        if (data) {
          return { record: data, recordId: String(data?.[primaryKey] || '').trim() || String(data?.id || '').trim() || candidate };
        }
      }
      throw workflowError(`Target ${resource} record is missing or could not be resolved.`);
    }
    async function applyApprovedWorkflowChanges(resourceValue = '', recordId = '', requestedChanges = {}, reviewerContext = {}) {
      const resource = String(resourceValue || '').trim().toLowerCase();
      const requested = requestedChanges && typeof requestedChanges === 'object' ? requestedChanges : {};
      const requestedWithoutHelpers = Object.fromEntries(
        Object.entries(requested).filter(([key]) => !WORKFLOW_HELPER_FIELDS.has(String(key || '').trim()))
      );
      const nestedResourcePayload =
        resource === 'proposals' && requested.proposal && typeof requested.proposal === 'object'
          ? requested.proposal
          : resource === 'agreements' && requested.agreement && typeof requested.agreement === 'object'
            ? requested.agreement
            : resource === 'invoices' && requested.invoice && typeof requested.invoice === 'object'
              ? requested.invoice
              : resource === 'receipts' && requested.receipt && typeof requested.receipt === 'object'
                ? requested.receipt
                : {};
      const approvedItems = Array.isArray(requested.items)
        ? requested.items
        : Array.isArray(nestedResourcePayload.items)
          ? nestedResourcePayload.items
          : [];
      if (!Object.keys(requestedWithoutHelpers).length && !Object.keys(nestedResourcePayload).length && !approvedItems.length) {
        throw workflowError('Requested changes are empty. Approval cannot be applied.');
      }
      const { record } = await resolveWorkflowTargetRecord(resource, { record_id: recordId, requested_changes: requested });
      const reviewerUserId = String(reviewerContext.userId || '').trim();
      const sanitizeWithReviewer = (sanitizer, payload = {}) => sanitizer(payload, { includeCreatedBy: false, userId: reviewerUserId });
      const itemTable = ITEM_TABLES[resource];
      const fk = ITEM_FK[resource];
      let publicUpdates = {};
      if (resource === 'proposals') {
        if (Object.keys(nestedResourcePayload).length) {
          publicUpdates = sanitizeWithReviewer(sanitizeProposalRecord, nestedResourcePayload);
        } else {
          publicUpdates = compactObject({
            status: trimOrNull(firstDefined(requested, ['requested_status', 'status'])),
            proposal_date: trimOrNull(firstDefined(requested, ['proposal_date', 'proposalDate'])),
            proposal_valid_until: trimOrNull(firstDefined(requested, ['proposal_valid_until', 'proposalValidUntil', 'valid_until'])),
            updated_by: reviewerUserId || undefined
          });
        }
      } else if (resource === 'agreements') {
        publicUpdates = sanitizeWithReviewer(
          sanitizeAgreementRecord,
          Object.keys(nestedResourcePayload).length ? nestedResourcePayload : requestedWithoutHelpers
        );
      } else if (resource === 'invoices') {
        publicUpdates = sanitizeWithReviewer(
          sanitizeInvoicesRecord,
          Object.keys(nestedResourcePayload).length ? nestedResourcePayload : requestedWithoutHelpers
        );
      } else if (resource === 'receipts') {
        publicUpdates = sanitizeWithReviewer(
          sanitizeReceiptsRecord,
          Object.keys(nestedResourcePayload).length ? nestedResourcePayload : requestedWithoutHelpers
        );
      } else {
        throw workflowError(`Unsupported workflow resource: ${resource}`);
      }
      const updatePayload = compactObject(publicUpdates);
      if (!Object.keys(updatePayload).length && !approvedItems.length) {
        throw workflowError('Requested changes did not include any approved editable fields.');
      }
      const key = PK_BY_RESOURCE[resource] || 'id';
      let updatedRecord = record;
      if (Object.keys(updatePayload).length) {
        const { data, error } = await client
          .from(TABLE_BY_RESOURCE[resource])
          .update(updatePayload)
          .eq(key, record?.[key] || record?.id || recordId)
          .select('*')
          .single();
        if (error) throw workflowError(`Unable to apply approved changes to ${resource}`, error);
        updatedRecord = data || record;
      }
      if (itemTable && approvedItems.length) {
        const parentId = String(updatedRecord?.id || record?.id || recordId || '').trim();
        if (!parentId) throw workflowError(`Unable to apply ${resource} items because parent record id is missing.`);
        await client.from(itemTable).delete().eq(fk, parentId);
        if (approvedItems.length) {
          const insertRows = approvedItems.map(item =>
            resource === 'proposals'
              ? sanitizeProposalItemRecord(item, parentId)
              : resource === 'agreements'
                ? sanitizeAgreementItemRecord(item, parentId)
                : resource === 'invoices'
                  ? sanitizeInvoiceItemRecord(item, parentId)
                  : sanitizeReceiptItemRecord(item, parentId)
          );
          const { error } = await client.from(itemTable).insert(insertRows);
          if (error) throw workflowError(`Unable to apply ${resource} items`, error);
        }
      }
      return { beforeRecord: record, afterRecord: updatedRecord };
    }
    const normalizeWorkflowRulePayload = row => {
      const source = row && typeof row === 'object' ? { ...row } : {};
      const allowedRoles = normalizeRoleList(source.allowed_roles, source.allowed_roles_csv);
      const approvalRoles = normalizeRoleList(source.approval_roles, source.approval_roles_csv, source.approval_role);
      const normalized = {
        ...source,
        allowed_roles: allowedRoles,
        approval_roles: approvalRoles
      };
      if (!('allowed_roles_csv' in normalized) || String(normalized.allowed_roles_csv || '').trim() === '') {
        normalized.allowed_roles_csv = allowedRoles.join(',');
      }
      if (!('approval_roles_csv' in normalized) || String(normalized.approval_roles_csv || '').trim() === '') {
        normalized.approval_roles_csv = approvalRoles.join(',');
      }
      if (!('approval_role' in normalized) || String(normalized.approval_role || '').trim() === '') {
        normalized.approval_role = approvalRoles[0] || '';
      }
      return normalized;
    };
    const workflowError = (message, error) => friendlyError(`Workflow: ${message}`, error);
    const normalizeRawId = value => String(value === undefined || value === null ? '' : value).trim();
    async function findWorkflowRuleMatch(rawId) {
      const normalizedId = normalizeRawId(rawId);
      if (!normalizedId) return null;
      const byWorkflowRuleId = await client.from('workflow_rules').select('*').eq('workflow_rule_id', normalizedId).maybeSingle();
      if (byWorkflowRuleId.error) throw workflowError('Unable to match workflow rule by workflow_rule_id', byWorkflowRuleId.error);
      if (byWorkflowRuleId.data) return byWorkflowRuleId.data;
      const byLegacyId = await client.from('workflow_rules').select('*').eq('id', normalizedId).maybeSingle();
      if (byLegacyId.error) throw workflowError('Unable to match workflow rule by id', byLegacyId.error);
      return byLegacyId.data || null;
    }

    const normalizedTransitionPayload = (() => {
      const record = safePayload.record && typeof safePayload.record === 'object' ? safePayload.record : {};
      const requestedChanges = safePayload.requested_changes && typeof safePayload.requested_changes === 'object'
        ? safePayload.requested_changes
        : {};
      const resource = String(
        firstValue(
          safePayload.target_workflow_resource,
          safePayload.workflow_resource,
          safePayload.target_resource,
          requestedChanges.resource,
          record.resource
        )
      ).trim().toLowerCase();
      const currentStatus = String(
        firstValue(
          safePayload.current_status,
          safePayload.from_status,
          requestedChanges.current_status,
          requestedChanges.from_status,
          record.current_status,
          record.status
        )
      ).trim();
      const nextStatus = String(
        firstValue(
          safePayload.next_status,
          safePayload.to_status,
          safePayload.requested_status,
          requestedChanges.next_status,
          requestedChanges.to_status,
          requestedChanges.requested_status
        )
      ).trim();
      const discountPercent = Number(
        firstValue(
          safePayload.discount_percent,
          requestedChanges.discount_percent,
          record.discount_percent,
          0
        )
      );
      const normalizedDiscountPercent = Number.isFinite(discountPercent) ? discountPercent : 0;
      const recordId = String(
        firstValue(
          safePayload.record_id,
          safePayload.id,
          safePayload.proposal_id,
          safePayload.agreement_id,
          safePayload.invoice_id,
          safePayload.receipt_id,
          record.id,
          record.proposal_id,
          record.agreement_id,
          record.invoice_id,
          record.receipt_id
        )
      ).trim();
      return {
        resource,
        current_status: currentStatus,
        next_status: nextStatus,
        discount_percent: normalizedDiscountPercent,
        record_id: recordId,
        record,
        requested_changes: requestedChanges
      };
    })();

    if (requestedAction === 'list' || requestedAction === 'list_rules') {
      assertAllowed('workflow', 'list');
      const { data, error } = await applyFilters(client.from('workflow_rules').select('*'), safePayload).order('updated_at', { ascending: false });
      if (error) throw workflowError('Unable to load workflow rules', error);
      return normalizeList('workflow', normalizeWorkflowRows(data));
    }
    if (requestedAction === 'get') {
      assertAllowed('workflow', 'get');
      const id = safePayload.workflow_rule_id || safePayload.id;
      const matched = await findWorkflowRuleMatch(id);
      if (!matched) throw workflowError('Unable to load workflow rule: rule not found');
      return normalizeWorkflowSingle(matched);
    }
    if (requestedAction === 'save' || requestedAction === 'save_rule') {
      assertAllowed('workflow', 'save');
      const rawRow = safePayload.rule || safePayload;
      const normalizedRow = normalizeWorkflowRulePayload(rawRow);
      const cleanRow = {
        workflow_rule_id: normalizedRow.workflow_rule_id,
        resource: normalizedRow.resource,
        current_status: normalizedRow.current_status,
        next_status: normalizedRow.next_status,
        allowed_roles: normalizeRoleList(normalizedRow.allowed_roles, normalizedRow.allowed_roles_csv),
        requires_approval: Boolean(normalizedRow.requires_approval),
        approval_role: firstValue(
          normalizedRow.approval_role,
          Array.isArray(normalizedRow.approval_roles) ? normalizedRow.approval_roles[0] : '',
          normalizedRow.approval_roles_csv
        ) || null,
        max_discount_percent: Number(normalizedRow.max_discount_percent || 0),
        hard_stop_discount_percent: Number(normalizedRow.hard_stop_discount_percent || 0),
        editable_fields: Array.isArray(normalizedRow.editable_fields) ? normalizedRow.editable_fields : [],
        required_fields: Array.isArray(normalizedRow.required_fields) ? normalizedRow.required_fields : [],
        require_comment: Boolean(normalizedRow.require_comment),
        require_attachment: Boolean(normalizedRow.require_attachment),
        is_active: normalizedRow.is_active !== false
      };
      if (!String(cleanRow.workflow_rule_id || '').trim()) delete cleanRow.workflow_rule_id;
      const legacyId = normalizeRawId(normalizedRow.id || rawRow.id);
      const id = cleanRow.workflow_rule_id || legacyId;
      const qb = client.from('workflow_rules');
      if (id) {
        const updateColumn = cleanRow.workflow_rule_id ? 'workflow_rule_id' : legacyId ? 'id' : '';
        const updateId = normalizeRawId(cleanRow.workflow_rule_id || legacyId);
        if (!updateColumn || !updateId) throw workflowError('Workflow rule could not be matched by workflow_rule_id or id.');
        const resp = await qb.update(cleanRow).eq(updateColumn, updateId).select('*').maybeSingle();
        if (resp.error) throw workflowError('Unable to save workflow rule', resp.error);
        if (resp.data) return normalizeWorkflowSingle(resp.data);
        const refreshed = await findWorkflowRuleMatch(updateId);
        if (!refreshed) throw workflowError('Workflow rule could not be matched by workflow_rule_id or id.');
        return normalizeWorkflowSingle(refreshed);
      }
      const resp = await qb.insert(cleanRow).select('*').maybeSingle();
      if (resp.error) throw workflowError('Unable to save workflow rule', resp.error);
      if (resp.data) {
        const inserted = normalizeWorkflowSingle(resp.data);
        if (!normalizeRawId(inserted.workflow_rule_id)) {
          throw workflowError('Workflow rule insert completed without a database workflow_rule_id. Check Supabase table default and select return.');
        }
        return inserted;
      }
      let fallback = null;
      if (cleanRow.resource && cleanRow.current_status && cleanRow.next_status) {
        const fallbackResp = await client
          .from('workflow_rules')
          .select('*')
          .eq('resource', cleanRow.resource)
          .eq('current_status', cleanRow.current_status)
          .eq('next_status', cleanRow.next_status)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fallbackResp.error) throw workflowError('Unable to load newly created workflow rule', fallbackResp.error);
        fallback = fallbackResp.data || null;
      }
      if (!fallback) {
        throw workflowError('Workflow rule insert completed without a database workflow_rule_id. Check Supabase table default and select return.');
      }
      const fallbackRule = normalizeWorkflowSingle(fallback);
      if (!normalizeRawId(fallbackRule.workflow_rule_id)) {
        throw workflowError('Workflow rule insert completed without a database workflow_rule_id. Check Supabase table default and select return.');
      }
      return fallbackRule;
    }
    if (requestedAction === 'delete' || requestedAction === 'delete_rule') {
      assertAllowed('workflow', 'delete');
      const id = safePayload.workflow_rule_id || safePayload.id;
      const matched = await findWorkflowRuleMatch(id);
      if (!matched) throw workflowError('Workflow rule could not be matched by workflow_rule_id or id.');
      const deleteColumn = normalizeRawId(matched.workflow_rule_id) ? 'workflow_rule_id' : 'id';
      const deleteId = normalizeRawId(matched[deleteColumn]);
      if (!deleteId) {
        throw workflowError('Workflow rule could not be matched by workflow_rule_id or id.');
      }
      const { data, error } = await client
        .from('workflow_rules')
        .delete()
        .eq(deleteColumn, deleteId)
        .select('workflow_rule_id,id')
        .maybeSingle();
      if (error) throw workflowError('Unable to delete workflow rule', error);
      if (!data) {
        throw workflowError('Workflow rule could not be matched by workflow_rule_id or id.');
      }
      return {
        ok: true,
        workflow_rule_id: normalizeRawId(data.workflow_rule_id) || normalizeRawId(matched.workflow_rule_id) || deleteId,
        id: normalizeRawId(data.id) || normalizeRawId(matched.id) || deleteId
      };
    }
    if (requestedAction === 'validate_transition') {
      assertAllowed('workflow', 'get');
      if (!normalizedTransitionPayload.resource) {
        throw new Error('Workflow validation requires a resource.');
      }
      const rpcPayload = {
        p_resource:
          safePayload.target_workflow_resource ||
          safePayload.workflow_resource ||
          safePayload.target_resource ||
          '',
        p_current_status:
          safePayload.from_status ||
          safePayload.current_status ||
          safePayload.record?.status ||
          '',
        p_next_status:
          safePayload.to_status ||
          safePayload.next_status ||
          safePayload.requested_status ||
          '',
        p_discount_percent: Number(
          safePayload.discount_percent ??
          safePayload.requested_discount_percent ??
          0
        ),
        p_user_role:
          global.Session?.role?.() || ''
      };
      console.info('[workflow] validation rpc payload', rpcPayload);
      let data;
      let error;
      ({ data, error } = await client.rpc('validate_workflow_transition', rpcPayload));
      if (error) {
        console.error('[workflow] validation unavailable', error);
        throw workflowError('Validation failed', error);
      }
      console.info('[workflow] validation result', data);
      const normalizedValidation = normalizeWorkflowSingle(data || { allowed: true, reason: '' });
      if (!Array.isArray(normalizedValidation.approval_roles)) {
        normalizedValidation.approval_roles = normalizeRoleList(
          normalizedValidation.approval_roles,
          normalizedValidation.approval_roles_csv,
          normalizedValidation.approval_role
        );
      }
      if (!normalizedValidation.approval_roles_csv) {
        normalizedValidation.approval_roles_csv = normalizedValidation.approval_roles.join(',');
      }
      if (!normalizedValidation.approval_role) {
        normalizedValidation.approval_role = normalizedValidation.approval_roles[0] || '';
      }
      return normalizedValidation;
    }
    if (requestedAction === 'create_approval' || requestedAction === 'create_workflow_approval') {
      assertAllowed('workflow', 'request_approval');
      const requestedChangesPayload = Object.prototype.hasOwnProperty.call(safePayload, 'p_requested_changes')
        ? safePayload.p_requested_changes
        : (Object.prototype.hasOwnProperty.call(safePayload, 'requested_changes') ? safePayload.requested_changes : {});
      const rpcPayload = {
        p_resource: String(
          safePayload.p_resource ??
          safePayload.resource ??
          safePayload.target_workflow_resource ??
          safePayload.target_resource ??
          ''
        ).trim(),
        p_record_id: String(safePayload.p_record_id ?? safePayload.record_id ?? '').trim(),
        p_workflow_rule_id: safePayload.p_workflow_rule_id ?? safePayload.workflow_rule_id ?? null,
        p_requester_user_id: safePayload.p_requester_user_id ?? safePayload.requester_user_id ?? null,
        p_requester_role: String(safePayload.p_requester_role ?? safePayload.requester_role ?? '').trim().toLowerCase(),
        p_approval_role: String(safePayload.p_approval_role ?? safePayload.approval_role ?? '').trim().toLowerCase(),
        p_old_status: String(safePayload.p_old_status ?? safePayload.old_status ?? '').trim(),
        p_new_status: String(safePayload.p_new_status ?? safePayload.new_status ?? '').trim(),
        p_requested_changes: requestedChangesPayload
      };
      console.debug('[workflow] final approval creation payload', rpcPayload);
      const { data, error } = await client.rpc('create_workflow_approval', rpcPayload);
      if (error) throw workflowError('create_workflow_approval RPC failed while creating/reusing pending approval', error);
      const normalizedApproval = data && typeof data === 'object'
        ? data
        : { ok: false, created: false, reused: false, approval_id: '', approval_role: '', status: '', resource: rpcPayload.p_resource, record_id: rpcPayload.p_record_id };
      console.debug('[workflow] approval create RPC result', normalizedApproval);
      if (normalizedApproval.ok === true && normalizedApproval.created === true && normalizedApproval.approval_id) {
        await notifyWorkflowApprovalCreated(normalizedApproval.approval_id);
      }
      return {
        ok: normalizedApproval.ok === true,
        created: normalizedApproval.created === true,
        reused: normalizedApproval.reused === true,
        approval_id: String(normalizedApproval.approval_id || '').trim(),
        approval_role: String(normalizedApproval.approval_role || '').trim(),
        status: String(normalizedApproval.status || '').trim(),
        resource: String(normalizedApproval.resource || rpcPayload.p_resource || '').trim(),
        record_id: String(normalizedApproval.record_id || rpcPayload.p_record_id || '').trim()
      };
    }
    if (requestedAction === 'request_approval' || requestedAction === 'approve' || requestedAction === 'reject' || requestedAction === 'list_pending_approvals') {
      assertAllowed('workflow', requestedAction);
      if (requestedAction === 'list_pending_approvals') {
        let query = client.from('workflow_approvals').select('*').order('created_at', { ascending: false });
        query = query.eq('status', 'pending');
        const { data, error } = await query;
        if (error) throw workflowError('Unable to load pending approvals', error);
        return normalizeList('workflow', normalizeWorkflowRows(data));
      }
      const row = safePayload;
      const approvalColumns = [
        'approval_id',
        'resource',
        'record_id',
        'workflow_rule_id',
        'requester_user_id',
        'requester_role',
        'approval_role',
        'status',
        'old_status',
        'new_status',
        'requested_changes',
        'reviewer_user_id',
        'reviewer_comment',
        'reviewed_at'
      ];
      const sanitizedRow = approvalColumns.reduce((acc, key) => {
        if (row[key] !== undefined) acc[key] = row[key];
        return acc;
      }, {});
      if (requestedAction === 'request_approval') {
        const { data, error } = await client.from('workflow_approvals').insert(sanitizedRow).select('*').maybeSingle();
        if (error) throw workflowError('Unable to create approval request row in workflow_approvals', error);
        let insertedRow = data || null;
        if (!insertedRow) {
          const { data: followUpRow, error: followUpError } = await client
            .from('workflow_approvals')
            .select('*')
            .eq('resource', sanitizedRow.resource)
            .eq('record_id', sanitizedRow.record_id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (followUpError) throw workflowError('Unable to fetch approval request row after insert', followUpError);
          insertedRow = followUpRow || null;
        }
        if (!insertedRow) throw workflowError('Unable to create approval request row in workflow_approvals', new Error('No row returned from insert.'));
        console.debug('[workflow] approval creation', { approval_id: insertedRow?.approval_id || insertedRow?.id || '', status: insertedRow?.status || 'pending' });
        return normalizeWorkflowSingle(insertedRow);
      }
      const id = sanitizedRow.approval_id || row.workflow_approval_id || row.id;
      const approval = await loadApprovalRowById(id);
      const currentStatus = String(approval?.status || '').trim().toLowerCase();
      if (currentStatus !== 'pending') {
        throw workflowError(`Approval ${String(approval?.approval_id || id || '').trim()} is already ${currentStatus || 'processed'} and cannot be processed again.`);
      }
      const reviewerUserId = await getCurrentUserId(client);
      const reviewerRole = role();
      const reviewerComment = row.reviewer_comment === undefined ? null : String(row.reviewer_comment || '').trim();
      const reviewPayload = {
        reviewer_user_id: reviewerUserId || null,
        reviewer_comment: reviewerComment,
        reviewed_at: new Date().toISOString()
      };
      const requestedChanges = approval?.requested_changes && typeof approval.requested_changes === 'object'
        ? approval.requested_changes
        : {};
      const resource = normalizeWorkflowResource(approval?.resource, requestedChanges);
      if (!resource || resource === 'workflow') throw workflowError('Workflow approval is missing a valid business resource.');
      if (requestedAction === 'reject') {
        const { data: rejected, error: rejectError } = await client
          .from('workflow_approvals')
          .update({ ...reviewPayload, status: 'rejected' })
          .eq('approval_id', approval.approval_id)
          .eq('status', 'pending')
          .select('*')
          .single();
        if (rejectError) throw workflowError('Unable to reject approval request', rejectError);
        await insertWorkflowAuditLog({
          resource,
          record_id: approval.record_id || '',
          action: 'approval_rejected',
          old_status: approval.old_status || approval.status || 'pending',
          new_status: 'rejected',
          allowed: false,
          reason: reviewerComment || 'Approval request rejected.',
          user_id: reviewerUserId || null,
          user_role: reviewerRole,
          metadata: {
            approval_id: approval.approval_id,
            requested_changes_summary: {
              keys: Object.keys(requestedChanges || {}),
              changed_fields: Array.isArray(requestedChanges?.changed_fields) ? requestedChanges.changed_fields : []
            }
          }
        });
        await notifyWorkflowDecision(approval.approval_id, 'rejected', reviewerComment);
        return normalizeWorkflowSingle(rejected);
      }
      const { recordId: resolvedRecordId } = await resolveWorkflowTargetRecord(resource, approval);
      const { beforeRecord, afterRecord } = await applyApprovedWorkflowChanges(
        resource,
        resolvedRecordId,
        requestedChanges,
        { userId: reviewerUserId, userRole: reviewerRole, approvalId: approval.approval_id }
      );
      const { data: approved, error: approveError } = await client
        .from('workflow_approvals')
        .update({ ...reviewPayload, status: 'approved' })
        .eq('approval_id', approval.approval_id)
        .eq('status', 'pending')
        .select('*')
        .single();
      if (approveError) throw workflowError('Unable to mark approval request as approved', approveError);
      await insertWorkflowAuditLog({
        resource,
        record_id: String(beforeRecord?.id || resolvedRecordId || '').trim(),
        action: 'approval_applied',
        old_status: firstValue(approval.old_status, beforeRecord?.status, 'pending'),
        new_status: firstValue(afterRecord?.status, approval.new_status, 'approved'),
        allowed: true,
        reason: 'Workflow approval approved and applied.',
        user_id: reviewerUserId || null,
        user_role: reviewerRole,
        metadata: {
          approval_id: approval.approval_id,
          requested_changes_summary: {
            keys: Object.keys(requestedChanges || {}),
            changed_fields: Array.isArray(requestedChanges?.changed_fields) ? requestedChanges.changed_fields : [],
            requested_status: requestedChanges?.requested_status ?? requestedChanges?.status ?? null,
            discount_percent: requestedChanges?.discount_percent ?? null
          }
        }
      });
      await notifyWorkflowDecision(approval.approval_id, 'approved', reviewerComment);
      return normalizeWorkflowSingle(approved);
    }
    if (requestedAction === 'list_audit') {
      assertAllowed('workflow', 'list_audit');
      const { data, error } = await client.from('workflow_audit_log').select('*').order('created_at', { ascending: false });
      if (error) throw workflowError('Unable to load workflow audit log', error);
      return normalizeList('workflow', normalizeWorkflowRows(data));
    }
    throw new Error(`Unsupported workflow action: ${requestedAction || action}`);
  }

  async function handleRpcResource(resource, action, payload) {
    const client = getClient();
    if (resource === 'leads' && ['convert_to_deal','convert'].includes(action)) {
      assertAllowed('leads', 'convert_to_deal');
      const leadUuid = String(payload.id || payload.lead_id || '').trim();
      const { data, error } = await client.rpc('convert_lead_to_deal', { p_lead_uuid: leadUuid });
      if (error) throw friendlyError('Lead conversion failed', error);
      return data;
    }
    if (resource === 'proposals' && action === 'create_from_deal') {
      assertAllowed('proposals', 'create_from_deal');
      const idCandidate = String(payload.id || '').trim();
      const fallbackCandidate = String(payload.deal_id || '').trim();
      const dealUuid = isUuid(idCandidate)
        ? idCandidate
        : isUuid(fallbackCandidate)
        ? fallbackCandidate
        : '';
      if (!dealUuid) throw new Error('Deal UUID is required to create proposal from deal.');
      const { data, error } = await client.rpc('create_proposal_from_deal', { p_deal_uuid: dealUuid });
      if (error) throw friendlyError('Proposal creation from deal failed', error);
      const candidateUuid = String(
        data?.id ||
        data?.proposal_uuid ||
        data?.proposal_id_uuid ||
        data?.created_proposal_uuid ||
        data?.created_uuid ||
        ''
      ).trim();
      if (!isUuid(candidateUuid)) return data;

      const { data: createdProposal, error: getProposalError } = await client
        .from('proposals')
        .select('*')
        .eq('id', candidateUuid)
        .maybeSingle();
      if (getProposalError || !createdProposal) return data;

      const ensuredProposalId = ensureBusinessProposalId(createdProposal.proposal_id);
      const ensuredRefNumber = ensureProposalRefNumber(createdProposal.ref_number);
      const hasProposalId = String(createdProposal.proposal_id || '').trim();
      const hasRefNumber = String(createdProposal.ref_number || '').trim();
      if (hasProposalId && hasRefNumber) return createdProposal;

      const { data: updatedProposal, error: updateError } = await client
        .from('proposals')
        .update({ proposal_id: ensuredProposalId, ref_number: ensuredRefNumber })
        .eq('id', candidateUuid)
        .select('*')
        .maybeSingle();
      if (updateError) throw friendlyError('Unable to finalize proposal business identifiers', updateError);
      return updatedProposal || createdProposal;
    }
    if (resource === 'agreements' && action === 'create_from_proposal') {
      assertAllowed('agreements', 'create_from_proposal');
      const proposalUuid = String(payload.proposal_uuid || payload.id || payload.proposal_id || '').trim();
      if (!isUuid(proposalUuid)) throw new Error('Proposal UUID is required to create agreement from proposal.');
      const { data, error } = await client.rpc('create_agreement_from_proposal', { p_proposal_uuid: proposalUuid });
      if (error) throw friendlyError('Agreement creation from proposal failed', error);
      return data;
    }
    if (resource === 'invoices' && action === 'create_from_agreement') {
      assertAllowed('invoices', 'create_from_agreement');
      const agreementUuid = String(payload.id || payload.agreement_uuid || payload.agreement_id || '').trim();
      if (!isUuid(agreementUuid)) throw new Error('Agreement UUID is required to create invoice from agreement.');
      const { data, error } = await client.rpc('create_invoice_from_agreement', { p_agreement_uuid: agreementUuid });
      if (error) throw friendlyError('Invoice creation from agreement failed', error);
      return data;
    }
    if (resource === 'receipts' && action === 'create_from_invoice') {
      assertAllowed('receipts', 'create_from_invoice');
      const invoiceUuid = String(payload.id || payload.invoice_uuid || payload.invoice_id || '').trim();
      if (!isUuid(invoiceUuid)) throw new Error('Invoice UUID is required to create receipt from invoice.');
      const logPrefix = '[supabase][receipts.create_from_invoice]';
      const normalizeOptionalText = value => {
        const normalized = String(value ?? '').trim();
        return normalized || null;
      };
      const normalizeAmount = value => {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string' && !value.trim()) return null;
        if (typeof value === 'string') {
          const parsed = Number(value.replace(/,/g, '').trim());
          return Number.isFinite(parsed) ? parsed : null;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const normalizedAmount = normalizeAmount(payload.amount ?? payload.numeric);
      if (normalizedAmount === null || normalizedAmount <= 0) throw new Error('Receipt amount must be greater than 0.');
      const { data, error } = await client.rpc('create_receipt_from_invoice', {
        p_invoice_uuid: invoiceUuid,
        p_amount: normalizedAmount,
        p_payment_method: normalizeOptionalText(payload.payment_method || payload.method),
        p_payment_reference: normalizeOptionalText(payload.payment_reference || payload.reference)
      });
      if (error) throw friendlyError('Receipt creation from invoice failed', error);
      devLog(logPrefix, 'RPC created receipt header', { invoiceUuid, rpcResponse: data });
      const pickReceiptUuid = candidate => {
        if (!candidate) return '';
        if (Array.isArray(candidate)) {
          for (const entry of candidate) {
            const found = pickReceiptUuid(entry);
            if (found) return found;
          }
          return '';
        }
        const options = [
          candidate?.id,
          candidate?.receipt_uuid,
          candidate?.receipt_id_uuid,
          candidate?.created_receipt_uuid,
          candidate?.created_uuid,
          candidate?.receipt_id,
          candidate?.receipt_number,
          candidate?.receipt?.id,
          candidate?.data?.id,
          candidate?.data?.receipt?.id,
          candidate?.created_receipt?.id,
          candidate?.item?.id
        ];
        const normalized = options.map(value => String(value || '').trim()).filter(Boolean);
        const directUuid = normalized.find(value => isUuid(value));
        if (directUuid) return directUuid;

        const businessReceiptId = normalized.find(value => /^RCPT-/i.test(value));
        if (businessReceiptId) return businessReceiptId;
        return '';
      };
      const extractedReceiptRef = pickReceiptUuid(data);
      let createdReceiptUuid = '';
      if (isUuid(extractedReceiptRef)) {
        createdReceiptUuid = extractedReceiptRef;
      } else if (extractedReceiptRef) {
        const { data: receiptByBusinessId, error: receiptByBusinessIdError } = await client
          .from('receipts')
          .select('*')
          .eq('receipt_id', extractedReceiptRef)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (receiptByBusinessIdError) throw friendlyError('Unable to resolve receipt UUID from receipt_id', receiptByBusinessIdError);
        createdReceiptUuid = String(receiptByBusinessId?.id || '').trim();
      }
      if (!createdReceiptUuid) {
        const { data: latestReceipt, error: latestReceiptError } = await client
          .from('receipts')
          .select('*')
          .eq('invoice_id', invoiceUuid)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestReceiptError) throw friendlyError('Unable to resolve created receipt UUID from invoice', latestReceiptError);
        createdReceiptUuid = String(latestReceipt?.id || '').trim();
      }
      if (!createdReceiptUuid) throw new Error('Receipt header was created but receipt UUID could not be resolved.');

      const { data: createdReceiptRow, error: createdReceiptError } = await client
        .from('receipts')
        .select('*')
        .eq('id', createdReceiptUuid)
        .maybeSingle();
      if (createdReceiptError || !createdReceiptRow) {
        throw friendlyError('Receipt header was created but could not be loaded', createdReceiptError || new Error('Missing receipt row'));
      }

      const { data: invoiceItems, error: invoiceItemsError } = await client
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceUuid)
        .order('line_no', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true, nullsFirst: false });
      if (invoiceItemsError) throw friendlyError('Unable to load invoice_items for receipt creation', invoiceItemsError);

      const sourceItems = Array.isArray(invoiceItems) ? invoiceItems : [];
      devLog(logPrefix, `Loaded invoice_items count=${sourceItems.length}`, { invoiceUuid, createdReceiptUuid });
      const receiptItemRows = sourceItems.map((item, index) => {
        const lineTotal = normalizeAmount(item?.line_total ?? item?.amount) ?? 0;
        const description =
          normalizeOptionalText(item?.description) ||
          [normalizeOptionalText(item?.location_name), normalizeOptionalText(item?.item_name)]
            .filter(Boolean)
            .join(' - ') ||
          'Invoice Item';
        const serviceStart = normalizeOptionalText(item?.service_start_date);
        const serviceEnd = normalizeOptionalText(item?.service_end_date);
        return sanitizeReceiptItemRecord({
          item_id: `RI-${createdReceiptUuid.slice(0, 8).toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
          invoice_item_id: item?.id || null,
          section: normalizeOptionalText(item?.section) || 'location_details',
          line_no: normalizeAmount(item?.line_no) ?? index + 1,
          location_name: normalizeOptionalText(item?.location_name),
          location_address: normalizeOptionalText(item?.location_address),
          item_name: normalizeOptionalText(item?.item_name),
          description,
          quantity: normalizeAmount(item?.quantity),
          unit_price: normalizeAmount(item?.unit_price),
          discount_percent: normalizeAmount(item?.discount_percent),
          discounted_unit_price: normalizeAmount(item?.discounted_unit_price),
          line_total: lineTotal,
          amount: lineTotal,
          capability_name: normalizeOptionalText(item?.capability_name),
          capability_value: normalizeOptionalText(item?.capability_value),
          notes: normalizeOptionalText(item?.notes),
          service_start_date: serviceStart || null,
          service_end_date: serviceEnd || null,
          currency: normalizeOptionalText(item?.currency) || normalizeOptionalText(createdReceiptRow?.currency)
        }, createdReceiptUuid);
      });
      devLog(logPrefix, 'Final receipt_items payload before insert', receiptItemRows);

      await client.from('receipt_items').delete().eq('receipt_id', createdReceiptUuid);
      if (!receiptItemRows.length) {
        devLog(logPrefix, 'No invoice_items found; receipt_items payload is empty. Skipping insert by design.', { invoiceUuid, createdReceiptUuid });
      } else {
        const { error: receiptItemsInsertError } = await client.from('receipt_items').insert(receiptItemRows);
        if (receiptItemsInsertError) {
          throw friendlyError(`Unable to create receipt_items from invoice_items (count=${receiptItemRows.length})`, receiptItemsInsertError);
        }
      }
      return withItems(resource, createdReceiptRow);
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
      assertAllowed('tickets', 'list');
      let query = applyFilters(client.from('tickets').select('*'), payload).order('updated_at', { ascending: false });
      const { data: tickets, error } = await query;
      if (error) throw friendlyError('Unable to load tickets', error);
      const normalized = (tickets || []).map(row => normalizeRow(resource, row));
      if (!isAdminDev()) return { handled: true, data: normalizeList(resource, normalized) };
      const ids = normalized.map(row => String(ticketRowId(row) || '')).filter(Boolean);
      const internalById = await loadTicketInternalByIds(ids);
      const withInternal = normalized.map(row =>
        mergeTicketInternal(row, internalById.get(String(ticketRowId(row) || '')))
      );
      return { handled: true, data: normalizeList(resource, withInternal) };
    }
    if (resource === 'notifications' && action === 'list') {
      assertAllowed('notifications', 'list');
      const currentUserId = await getCurrentUserId(client);
      if (!currentUserId) return { handled: true, data: normalizePagedList('notifications', [], normalizeListControls({}, 'notifications'), 0) };
      const { controls } = splitListPayload(payload);
      const listControls = normalizeListControls(controls, 'notifications');
      let query = client
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('recipient_user_id', currentUserId);
      query = applyFilters(query, payload, { resource: 'notifications' });
      query = query.order(listControls.sortBy, { ascending: listControls.sortDir === 'asc' });
      query = query.range(listControls.from, listControls.to);
      const { data, error, count } = await query;
      if (error) throw friendlyError('Unable to load notifications', error);
      return { handled: true, data: normalizePagedList('notifications', data, listControls, count) };
    }
    if (resource === 'notifications' && action === 'get_unread_count') {
      assertAllowed('notifications', 'get_unread_count');
      const currentUserId = await getCurrentUserId(client);
      if (!currentUserId) return { handled: true, data: { unread_count: 0, count: 0 } };
      const { count, error } = await client
        .from('notifications')
        .select('notification_id', { count: 'exact', head: true })
        .eq('recipient_user_id', currentUserId)
        .eq('is_read', false);
      if (error) throw friendlyError('Unable to load unread notification count', error);
      const unread = Number(count || 0);
      return { handled: true, data: { unread_count: unread, count: unread } };
    }
    if (resource === 'notifications' && action === 'mark_read') {
      assertAllowed('notifications', 'mark_read');
      const id = requireResourceIdentifier(resource, payload, action);
      const currentUserId = await getCurrentUserId(client);
      const { data, error } = await client
        .from('notifications')
        .update({ is_read: true, status: 'read', read_at: new Date().toISOString() })
        .eq('notification_id', id)
        .eq('recipient_user_id', currentUserId)
        .select('*')
        .single();
      if (error) throw friendlyError('Unable to mark notification as read', error);
      return { handled: true, data };
    }
    if (resource === 'notifications' && action === 'mark_all_read') {
      assertAllowed('notifications', 'mark_all_read');
      const currentUserId = await getCurrentUserId(client);
      if (!currentUserId) return { handled: true, data: { ok: true, updated: 0 } };
      const { error } = await client
        .from('notifications')
        .update({ is_read: true, status: 'read', read_at: new Date().toISOString() })
        .eq('recipient_user_id', currentUserId)
        .eq('is_read', false);
      if (error) throw friendlyError('Unable to mark all notifications as read', error);
      return { handled: true, data: { ok: true } };
    }

    if (action === 'list') {
      assertAllowed(resource, 'list');
      const { controls } = splitListPayload(payload);
      const listControls = normalizeListControls(controls, resource);
      let query = resource === 'users'
        ? client.from('profiles').select('id, name, email, username, role_key, is_active, created_at, updated_at', { count: 'exact' })
        : client.from(table).select('*', { count: 'exact' });
      query = applyFilters(query, payload, { resource });
      query = query.order(listControls.sortBy, { ascending: listControls.sortDir === 'asc' });
      query = query.range(listControls.from, listControls.to);
      const { data, error, count } = await query;
      if (error) throw friendlyError(`Unable to load ${resource}`, error);
      return { handled: true, data: normalizePagedList(resource, data, listControls, count) };
    }

    if (action === 'get') {
      assertAllowed(resource, 'get');
      const id = resource === 'operations_onboarding'
        ? await resolveOperationsOnboardingId(payload, client)
        : resource === 'technical_admin_requests'
        ? await resolveTechnicalAdminRequestUuid(payload, client)
        : ['clients', 'invoices', 'receipts'].includes(resource)
        ? await resolveResourceUuid(resource, payload, client)
        : requireResourceIdentifier(resource, payload, 'get');
      const key = resource === 'operations_onboarding' ? 'id' : getPrimaryKeyForResource(resource);
      if (!id) throw new Error(`Missing ${key} for ${resource} get`);
      console.log('[CRUD] resource, pk, value', resource, key, id);
      const userGetColumns = 'id, name, email, username, role_key, is_active, created_at, updated_at';
      const { data, error } = await client
        .from(resource === 'users' ? 'profiles' : table)
        .select(resource === 'users' ? userGetColumns : '*')
        .eq(key, id)
        .single();
      if (error) throw friendlyError(`Unable to load ${resource} record`, error);
      if (resource === 'tickets') {
        if (!isAdminDev()) return { handled: true, data: sanitizeReadByRole(resource, data) };
        const byId = await loadTicketInternalByIds([String(data.id)]);
        return { handled: true, data: mergeTicketInternal(data, byId.get(String(data.id))) };
      }
      return { handled: true, data: await withItems(resource, data) };
    }

    if (['create','save'].includes(action)) {
      assertAllowed(resource, 'create');
      const raw = payload[resource.slice(0, -1)] || payload.item || payload.activity || payload[resource] || payload;
      const record = raw && typeof raw === 'object' ? { ...raw } : {};

      if (resource === 'notifications') {
      out.notification_id = out.notification_id ?? out.id ?? '';
      out.id = out.id ?? out.notification_id ?? '';
      out.status = out.status ?? (out.is_read ? 'read' : 'unread') ?? 'unread';
      out.is_read = out.is_read === true || out.is_read === 1 || String(out.is_read || '').trim().toLowerCase() === 'true';
      out.priority = String(out.priority || 'normal').trim().toLowerCase() || 'normal';
      out.meta = out.meta ?? out.meta_json ?? {};
      out.meta_json = out.meta_json ?? out.meta ?? {};
      out.action_required = out.action_required === true || out.action_required === 1 || String(out.action_required || '').trim().toLowerCase() === 'true';
      out.action_label = out.action_label ?? '';
      out.link_target = out.link_target ?? '';
      out.actor_user_id = out.actor_user_id ?? '';
      out.actor_role = out.actor_role ?? '';
    }
    if (resource === 'users') {
        const email = String(firstDefined(record, ['email']) || '').trim().toLowerCase();
        const password = String(firstDefined(record, ['password', 'passcode', 'newPassword']) || '');
        const createProfileSeed = sanitizeUserProfileRecord(record);
        if (!createProfileSeed.name) throw new Error('User name is required.');
        if (!createProfileSeed.username) throw new Error('Username is required.');
        if (!createProfileSeed.role_key) throw new Error('Role is required (role_key).');
        if (!email) throw new Error('User email is required.');
        if (!password) throw new Error('User password is required.');

        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw friendlyError('Unable to validate session for user creation', sessionError);
        if (!sessionData?.session?.access_token) {
          throw new Error('You must be logged in to create users.');
        }

        const createPayload = {
          email,
          password,
          name: createProfileSeed.name || '',
          username: createProfileSeed.username || '',
          role_key: createProfileSeed.role_key || '',
          is_active: createProfileSeed.is_active !== false
        };
        const { data: createResult, error: createError } = await client.functions.invoke('admin-create-user', {
          body: createPayload
        });

        if (createError) {
          const status = Number(createError?.context?.status || createError?.status || 0);
          const edgeMessage = String(
            createError?.context?.error?.message ||
            createError?.context?.statusText ||
            createError?.message ||
            ''
          ).trim();
          if (status === 403) throw new Error('Only admins can create users.');
          if (/already exists|duplicate|unique|email/i.test(edgeMessage)) {
            throw new Error('A user with this email already exists.');
          }
          throw friendlyError('Unable to create user', createError);
        }

        const createOk = createResult?.ok === true;
        if (!createOk) {
          const rawMessage = String(createResult?.error || createResult?.message || '').trim();
          const status = Number(createResult?.status || createResult?.code || 0);
          if (status === 403 || /forbidden|only admins/i.test(rawMessage)) {
            throw new Error('Only admins can create users.');
          }
          if (/already exists|duplicate|unique|email/i.test(rawMessage)) {
            throw new Error('A user with this email already exists.');
          }
          throw new Error(rawMessage || 'Unable to create user.');
        }

        const profileRow = createResult?.profile || createResult?.data?.profile || createResult?.user || createResult?.data?.user || null;
        return { handled: true, data: profileRow ? normalizeRow('users', profileRow) : createResult };
      }
     
      if (resource === 'tickets') devLog('[tickets/create] raw form data', record);
      const currentUserId = ['tickets', 'events', 'leads', 'deals', 'proposal_catalog', 'proposals', 'agreements', 'clients', 'invoices', 'receipts'].includes(resource)
        ? await getCurrentUserId(client)
        : '';
      if (['leads', 'deals'].includes(resource) && !currentUserId) {
        throw new Error(`You must be logged in to create ${resource}.`);
      }
      const createRecord =
        resource === 'tickets'
          ? toTicketPublicRecord(stripTicketInternalFields(record), { includeTicketId: true, userId: currentUserId })
          : resource === 'events'
            ? sanitizeEventRecord(record, { includeCreatedBy: true, userId: currentUserId })
            : resource === 'role_permissions'
              ? sanitizeRolePermissionRecord(record)
            : ['leads', 'deals'].includes(resource)
              ? sanitizeLeadsOrDealsRecord(resource, record, { includeCreatedBy: true, userId: currentUserId })
            : resource === 'proposal_catalog'
              ? sanitizeProposalCatalogRecord(record, { includeCreatedBy: true, userId: currentUserId })
            : resource === 'proposals'
              ? sanitizeProposalRecord(record, { includeCreatedBy: true, userId: currentUserId, ensureBusinessIds: true })
            : resource === 'agreements'
              ? sanitizeAgreementRecord(record, { includeCreatedBy: true, userId: currentUserId })
            : resource === 'clients'
              ? sanitizeClientsRecord(record, { includeCreatedBy: true, userId: currentUserId })
            : resource === 'invoices'
              ? sanitizeInvoicesRecord(record, { includeCreatedBy: true, userId: currentUserId })
            : resource === 'receipts'
              ? sanitizeReceiptsRecord(record, { includeCreatedBy: true, userId: currentUserId })
            : record;
      if (resource === 'events') {
        EVENT_LEGACY_FIELDS.forEach(field => { delete createRecord[field]; });
      }
      if (resource === 'tickets') {
        devLog('[tickets/create] normalized payload', createRecord);
        if (!Object.keys(createRecord).length) {
          throw new Error('Ticket create payload is empty after normalization.');
        }
      }
      if (resource === 'events' && !Object.keys(createRecord).length) {
        throw new Error('Event create payload is empty after normalization.');
      }
      if (['leads', 'deals'].includes(resource) && !Object.keys(createRecord).length) {
        throw new Error(`${resource} create payload is empty after normalization.`);
      }
      if (['proposal_catalog', 'proposals', 'agreements', 'clients', 'invoices', 'receipts'].includes(resource) && !Object.keys(createRecord).length) {
        throw new Error(`${resource} create payload is empty after normalization.`);
      }
      if (resource === 'role_permissions') {
        const rawPermissionPayload = payload.permissionPayload || payload.rpcPayload || payload.permission || { ...createRecord, ...payload };
        const rpcPayload = buildRolePermissionRpcPayload(rawPermissionPayload);
        devLog('[role permissions] rpc payload', JSON.stringify(rpcPayload, null, 2));
        const { data, error } = await client.rpc('upsert_role_permission', rpcPayload);
        devLog('[role permissions] rpc result', JSON.stringify({ data, error }, null, 2));
        if (error) throw friendlyError(`Unable to save ${resource} record`, error);
        if (!data) throw new Error('Supabase returned no saved permission row.');
        const row = await verifyRolePermissionPersistence(client, rpcPayload);
        const normalizedRow = normalizeRow(resource, row);
        devLog('[role permissions] saved normalized row', JSON.stringify(normalizedRow, null, 2));
        return { handled: true, data: await withItems(resource, normalizedRow) };
      }
      const { data, error } = await client.from(table).insert(createRecord).select('*').single();
      if (error) throw friendlyError(`Unable to create ${resource} record`, error);
      const created = normalizeRow(resource, data);
      if (resource === 'tickets' && isAdminDev()) {
        const internalRecord = toTicketInternalRecord(raw || {});
        internalRecord.ticket_id = created.id;
        if (internalRecord.ticket_id) {
          const record = internalRecord;
          console.log('[ticket_internal] outgoing issue_related', record.issue_related);
          console.log('[ticket internal] outgoing payload', internalRecord);
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
        const parentId = created.id || created[fk];
        const insertRows = items.map(item =>
          resource === 'proposals'
            ? sanitizeProposalItemRecord(item, parentId)
            : resource === 'agreements'
              ? sanitizeAgreementItemRecord(item, parentId)
            : resource === 'invoices'
              ? sanitizeInvoiceItemRecord(item, parentId)
            : resource === 'receipts'
              ? sanitizeReceiptItemRecord(item, parentId)
            : ({ ...item, [fk]: parentId })
        );
        const childResp = await client.from(itemTable).insert(insertRows).select('*');
        if (childResp.error) throw friendlyError(`Unable to create ${itemTable}`, childResp.error);
      }
      return { handled: true, data: await withItems(resource, created) };
    }

    if (action === 'update') {
      assertAllowed(resource, 'update');
      const pickedId = resource === 'operations_onboarding'
        ? await resolveOperationsOnboardingId(payload, client)
        : resource === 'technical_admin_requests'
        ? await resolveTechnicalAdminRequestUuid(payload, client)
        : ['clients', 'invoices', 'receipts'].includes(resource)
        ? await resolveResourceUuid(resource, payload, client)
        : requireResourceIdentifier(resource, payload, 'update');
      const id = resource === 'tickets'
        ? String(
            firstDefined(payload, ['id']) ??
            firstDefined(payload.updates || {}, ['id']) ??
            firstDefined(payload.item || {}, ['id']) ??
            pickedId ??
            ''
          )
        : resource === 'proposal_catalog'
          ? pickProposalCatalogMutationId(payload)
        : pickedId;
      const key = resource === 'operations_onboarding' ? 'id' : getPrimaryKeyForResource(resource);
      if (!id) throw new Error(`Missing ${key} for ${resource} update`);
      console.log('[CRUD] resource, pk, value', resource, key, id);
      const updates = payload.updates || payload.item || payload.activity || payload;
      const safeUpdates = { ...updates };
      if (resource === 'operations_onboarding') {
        delete safeUpdates.id;
        delete safeUpdates.db_id;
        delete safeUpdates.record_id;
      }
      if (resource === 'notifications') {
      out.notification_id = out.notification_id ?? out.id ?? '';
      out.id = out.id ?? out.notification_id ?? '';
      out.status = out.status ?? (out.is_read ? 'read' : 'unread') ?? 'unread';
      out.is_read = out.is_read === true || out.is_read === 1 || String(out.is_read || '').trim().toLowerCase() === 'true';
      out.priority = String(out.priority || 'normal').trim().toLowerCase() || 'normal';
      out.meta = out.meta ?? out.meta_json ?? {};
      out.meta_json = out.meta_json ?? out.meta ?? {};
      out.action_required = out.action_required === true || out.action_required === 1 || String(out.action_required || '').trim().toLowerCase() === 'true';
      out.action_label = out.action_label ?? '';
      out.link_target = out.link_target ?? '';
      out.actor_user_id = out.actor_user_id ?? '';
      out.actor_role = out.actor_role ?? '';
    }
    if (resource === 'users') {
        const userUpdates = sanitizeUserProfileRecord(safeUpdates, { includeId: false });
        delete userUpdates.id;
        if (!Object.keys(userUpdates).length) throw new Error('users update payload is empty after normalization.');
        const authAdmin = client?.auth?.admin;
        if (authAdmin?.updateUserById) {
          const authUpdatePayload = compactObject({
            email: userUpdates.email,
            user_metadata: compactObject({
              full_name: userUpdates.name,
              username: userUpdates.username,
              role_key: userUpdates.role_key
            })
          });
          if (Object.keys(authUpdatePayload).length) {
            const { error: authUpdateError } = await authAdmin.updateUserById(id, authUpdatePayload);
            if (authUpdateError) throw friendlyError('Unable to update auth user', authUpdateError);
          }
        }
        const { data, error } = await client
          .from('profiles')
          .update(userUpdates)
          .eq('id', id)
          .select('id, name, email, username, role_key, is_active, created_at, updated_at')
          .single();
        if (error) throw friendlyError('Unable to update users record', error);
        return { handled: true, data: normalizeRow('users', data) };
      }
      if (resource === 'role_permissions') {
        const rawPermissionPayload = payload.permissionPayload || payload.rpcPayload || payload.permission || { ...safeUpdates, ...payload };
        const rpcPayload = buildRolePermissionRpcPayload(rawPermissionPayload);
        devLog('[role permissions] rpc payload', JSON.stringify(rpcPayload, null, 2));
        const { data, error } = await client.rpc('upsert_role_permission', rpcPayload);
        devLog('[role permissions] rpc result', JSON.stringify({ data, error }, null, 2));
        if (error) throw friendlyError(`Unable to save ${resource} record`, error);
        if (!data) throw new Error('Supabase returned no saved permission row.');
        const row = await verifyRolePermissionPersistence(client, rpcPayload);
        const normalizedRow = normalizeRow(resource, row);
        devLog('[role permissions] saved normalized row', JSON.stringify(normalizedRow, null, 2));
        return { handled: true, data: await withItems(resource, normalizedRow) };
      }
     
      const publicUpdates =
        resource === 'tickets'
          ? toTicketPublicRecord(stripTicketInternalFields(safeUpdates), { includeTicketId: false })
          : resource === 'events'
            ? sanitizeEventRecord(safeUpdates, { includeCreatedBy: false, userId: await getCurrentUserId(client) })
            : resource === 'role_permissions'
              ? sanitizeRolePermissionRecord(safeUpdates)
            : ['leads', 'deals'].includes(resource)
              ? sanitizeLeadsOrDealsRecord(resource, safeUpdates, {
                includeCreatedBy: false,
                userId: await getCurrentUserId(client)
              })
            : resource === 'proposal_catalog'
              ? sanitizeProposalCatalogRecord(safeUpdates, { includeCreatedBy: false, userId: await getCurrentUserId(client) })
            : resource === 'proposals'
              ? sanitizeProposalRecord(safeUpdates, { includeCreatedBy: false, userId: await getCurrentUserId(client) })
            : resource === 'agreements'
              ? sanitizeAgreementRecord(safeUpdates, { includeCreatedBy: false, userId: await getCurrentUserId(client) })
            : resource === 'clients'
              ? sanitizeClientsRecord(safeUpdates, { includeCreatedBy: false, userId: await getCurrentUserId(client) })
            : resource === 'invoices'
              ? sanitizeInvoicesRecord(safeUpdates, { includeCreatedBy: false, userId: await getCurrentUserId(client) })
            : resource === 'receipts'
              ? sanitizeReceiptsRecord(safeUpdates, { includeCreatedBy: false, userId: await getCurrentUserId(client) })
            : safeUpdates;
      if (resource === 'events') {
        EVENT_LEGACY_FIELDS.forEach(field => { delete publicUpdates[field]; });
      }
      if (resource === 'events' && !Object.keys(publicUpdates).length) {
        throw new Error('Event update payload is empty after normalization.');
      }
      if (['leads', 'deals'].includes(resource) && !Object.keys(publicUpdates).length) {
        throw new Error(`${resource} update payload is empty after normalization.`);
      }
      if (['proposal_catalog', 'proposals', 'agreements', 'clients', 'invoices', 'receipts'].includes(resource) && !Object.keys(publicUpdates).length) {
        throw new Error(`${resource} update payload is empty after normalization.`);
      }
      const { data, error } = await client.from(table).update(publicUpdates).eq(key, id).select('*').single();
      if (error) throw friendlyError(`Unable to update ${resource} record`, error);
      if (resource === 'tickets' && isAdminDev()) {
        const internalUpdates = toTicketInternalRecord(safeUpdates);
        internalUpdates.ticket_id = ticketRowId({ id });
        const record = internalUpdates;
        console.log('[ticket_internal] outgoing issue_related', record.issue_related);
        console.log('[ticket internal] outgoing payload', internalUpdates);
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
        const parentId = resource === 'proposals'
          ? String(id || data?.id || '').trim()
          : id;
        await client.from(itemTable).delete().eq(fk, parentId);
        if (payload.items.length) {
          const insertRows = payload.items.map(item =>
            resource === 'proposals'
              ? sanitizeProposalItemRecord(item, parentId)
              : resource === 'agreements'
                ? sanitizeAgreementItemRecord(item, parentId)
              : resource === 'invoices'
                ? sanitizeInvoiceItemRecord(item, parentId)
              : resource === 'receipts'
                ? sanitizeReceiptItemRecord(item, parentId)
              : ({ ...item, [fk]: parentId })
          );
          const childResp = await client.from(itemTable).insert(insertRows).select('*');
          if (childResp.error) throw friendlyError(`Unable to update ${itemTable}`, childResp.error);
        }
      }
      return { handled: true, data: await withItems(resource, data) };
    }

    if (resource === 'technical_admin_requests' && action === 'update_status') {
      assertAllowed('technical_admin_requests', 'update_status');
      const id = await resolveTechnicalAdminRequestUuid(payload, client);
      if (!id) throw new Error('Technical request id is required.');
      const status = trimOrNull(firstDefined(payload, ['request_status', 'status'])) || 'Requested';
      const safeUpdates = {
        request_status: status
      };
      const optionalKeys = [
        'assigned_to',
        'completed_at',
        'notes',
        'updated_by',
        'updated_at'
      ];
      optionalKeys.forEach(key => {
        if (payload[key] !== undefined) safeUpdates[key] = payload[key];
      });
      const { data, error } = await client
        .from('technical_admin_requests')
        .update(safeUpdates)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw friendlyError('Unable to update technical admin request status', error);
      const technicalRequest = normalizeRow('technical_admin_requests', data);
      return { handled: true, data: { ok: true, technical_request: technicalRequest, request: technicalRequest } };
    }

    if (action === 'delete') {
      assertAllowed(resource, 'delete');
      const pickedId = resource === 'operations_onboarding'
        ? await resolveOperationsOnboardingId(payload, client)
        : ['clients', 'invoices', 'receipts'].includes(resource)
        ? await resolveResourceUuid(resource, payload, client)
        : requireResourceIdentifier(resource, payload, 'delete');
      const id = resource === 'tickets'
        ? String(firstDefined(payload, ['id']) ?? firstDefined(payload.item || {}, ['id']) ?? pickedId ?? '')
        : resource === 'proposal_catalog'
          ? pickProposalCatalogMutationId(payload)
        : pickedId;
      const key = resource === 'operations_onboarding' ? 'id' : getPrimaryKeyForResource(resource);
      if (!id) throw new Error(`Missing ${key} for ${resource} delete`);
      console.log('[CRUD] resource, pk, value', resource, key, id);
      if (resource === 'tickets' && isAdminDev()) {
        const { error: internalDeleteError } = await client.from('ticket_internal').delete().eq('ticket_id', ticketRowId({ id }));
        if (internalDeleteError) throw friendlyError('Unable to delete internal ticket fields', internalDeleteError);
      }
      const { error } = await client.from(table).delete().eq(key, id);
      if (error) throw friendlyError(`Unable to delete ${resource} record`, error);
      return { handled: true, data: { ok: true } };
    }

    if (resource === 'users' && ['activate','deactivate'].includes(action)) {
      assertAllowed('users', action);
      const id = requireResourceIdentifier(resource, payload, action);
      const { data, error } = await client
        .from('profiles')
        .update({ is_active: action === 'activate' })
        .eq('id', id)
        .select('id, name, email, username, role_key, is_active, created_at, updated_at')
        .single();
      if (error) throw friendlyError('Unable to update user status', error);
      return { handled: true, data: normalizeRow('users', data) };
    }

    if (resource === 'users' && action === 'repair_profiles') {
      assertAllowed('users', 'update', 'repair_profiles');
      const authAdmin = client?.auth?.admin;
      if (!authAdmin?.listUsers) {
        throw new Error('Unable to repair users: auth.admin.listUsers is unavailable in this environment.');
      }
      const { data: listedUsers, error: listError } = await authAdmin.listUsers({ page: 1, perPage: 1000 });
      if (listError) throw friendlyError('Unable to load auth users for profile repair', listError);
      const authUsers = Array.isArray(listedUsers?.users) ? listedUsers.users : [];
      const repaired = [];
      const skipped = [];
      for (const authUser of authUsers) {
        const authUserId = String(authUser?.id || '').trim();
        const email = String(authUser?.email || '').trim().toLowerCase();
        if (!authUserId) continue;
        const { data: existingById } = await client
          .from('profiles')
          .select('id, name, email, username, role_key, is_active')
          .eq('id', authUserId)
          .maybeSingle();
        if (existingById) continue;
        if (!email) {
          skipped.push({ auth_user_id: authUserId, reason: 'missing_email' });
          continue;
        }
        const { data: legacyProfile } = await client
          .from('profiles')
          .select('id, name, email, username, role_key, is_active')
          .eq('email', email)
          .neq('id', authUserId)
          .maybeSingle();
        if (!legacyProfile?.role_key) {
          skipped.push({ auth_user_id: authUserId, email, reason: 'no_legacy_profile_or_role_key' });
          continue;
        }
        const repairedProfile = {
          id: authUserId,
          name: legacyProfile.name || authUser.user_metadata?.full_name || '',
          email,
          username: legacyProfile.username || authUser.user_metadata?.username || email.split('@')[0],
          role_key: String(legacyProfile.role_key || '').trim().toLowerCase(),
          is_active: legacyProfile.is_active !== false
        };
        const { data: upsertedProfile, error: upsertError } = await client
          .from('profiles')
          .upsert(repairedProfile, { onConflict: 'id' })
          .select('id, name, email, username, role_key, is_active')
          .single();
        if (upsertError) throw friendlyError(`Unable to repair profile for ${email}`, upsertError);
        repaired.push(normalizeRow('users', upsertedProfile));
      }
      return { handled: true, data: { ok: true, repaired, skipped } };
    }

    throw new Error(`Unsupported action ${action} for resource ${resource}.`);
  }

  global.SupabaseData = { dispatch, isMigratedResource: resource => MIGRATED_RESOURCES.has(String(resource || '').trim()) };
})(window);
