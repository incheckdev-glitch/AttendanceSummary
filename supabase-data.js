(function initSupabaseData(global) {
  const MIGRATED_RESOURCES = new Set([
    'auth','users','roles','role_permissions','tickets','events','csm','leads','deals','proposal_catalog','proposals','agreements','workflow','clients','invoices','receipts','operations_onboarding','technical_admin_requests','notifications','notification_settings','companies','contacts','company_type_options','company_industry_options'
  ]);

  const TABLE_BY_RESOURCE = {
    users: 'profiles', roles: 'roles', role_permissions: 'role_permissions', tickets: 'tickets',
    events: 'events', csm: 'csm_activities', leads: 'leads', deals: 'deals',
    proposal_catalog: 'proposal_catalog_items', proposals: 'proposals', agreements: 'agreements',
    clients: 'clients', invoices: 'invoices', receipts: 'receipts', operations_onboarding: 'operations_onboarding',
    technical_admin_requests: 'technical_admin_requests', companies: 'companies', contacts: 'contacts', company_type_options: 'company_type_options', company_industry_options: 'company_industry_options'
    ,notifications: 'notifications'
    ,notification_settings: 'notification_rules'
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
    technical_admin_requests: 'id',
    companies: 'id',
    contacts: 'id',
    company_type_options: 'id',
    company_industry_options: 'id'
    ,notifications: 'notification_id'
    ,notification_settings: 'id'
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
    technical_admin_requests: ['request_id', 'technical_request_id'],
    companies: ['company_id'],
    contacts: ['contact_id'],
    company_type_options: [],
    company_industry_options: []
    ,notifications: ['id']
    ,notification_settings: []
  };

  const ITEM_TABLES = { proposals: 'proposal_items', agreements: 'agreement_items', invoices: 'invoice_items', receipts: 'receipt_items' };
  const ITEM_FK = { proposals: 'proposal_id', agreements: 'agreement_id', invoices: 'invoice_id', receipts: 'receipt_id' };
  const IMPORTANT_DEAL_STAGES = new Set(['proposal', 'negotiation', 'won', 'closed won', 'contract sent']);
  const IMPORTANT_PROPOSAL_STATUSES = new Set(['pending approval', 'requires approval', 'sent', 'accepted', 'rejected']);
  const normalizeTicketStatus = typeof global.normalizeTicketStatus === 'function'
    ? global.normalizeTicketStatus
    : value => {
      const raw = value == null ? '' : String(value).trim();
      if (!raw) return 'New';
      const map = {
        new: 'New',
        'under development': 'Under Development',
        'not started yet': 'Not Started Yet',
        'on hold': 'On Hold',
        'on stage': 'On Stage',
        sent: 'Sent',
        resolved: 'Resolved',
        rejected: 'Rejected'
      };
      return map[raw.toLowerCase()] || raw;
    };
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
    'company_id',
    'company_name',
    'contact_id',
    'contact_name',
    'contact_email',
    'contact_phone',
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

  const COMPANY_COLUMNS = new Set([
    'company_id','company_name','legal_name','company_type','industry','website','main_email','main_phone','country','city','address','tax_number','company_status','source','owner_name','owner_email','notes','created_by','created_by_email','created_at','updated_at'
  ]);
  const CONTACT_COLUMNS = new Set([
    'contact_id','company_id','company_name','first_name','last_name','full_name','job_title','department','email','phone','mobile','decision_role','is_primary_contact','contact_status','notes','created_by','created_by_email','created_at','updated_at'
  ]);
  const DEAL_COLUMNS = new Set([
    'deal_id',
    'lead_id',
    'lead_code',
    'full_name',
    'company_id',
    'company_name',
    'contact_id',
    'contact_name',
    'contact_email',
    'contact_phone',
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
    'proposal_id','ref_number','deal_id','company_id','company_name','contact_id','contact_name','contact_email','contact_phone','contact_mobile','customer_name','customer_address','customer_contact_name','customer_contact_mobile',
    'customer_contact_email','customer_contact_phone','provider_contact_name','provider_contact_mobile','provider_contact_email','proposal_title','proposal_date',
    'proposal_valid_until','agreement_date','effective_date','service_start_date','service_end_date','contract_term','account_number','billing_frequency','payment_term','payment_terms','po_number',
    'currency','customer_legal_name','provider_name','provider_legal_name',
    'terms_conditions','customer_signatory_name','customer_signatory_title','customer_signatory_email','customer_signatory_phone','provider_signatory_name','provider_signatory_title',
    'provider_signatory_name_secondary','provider_signatory_title_secondary','provider_sign_date',
    'subtotal_locations','subtotal_one_time','total_discount','grand_total','status','generated_by','created_by','updated_by'
  ]);
  const PROPOSAL_ITEM_COLUMNS = new Set([
    'item_id','proposal_id','section','line_no','location_name','item_name','unit_price','discount_percent','discounted_unit_price','quantity',
    'line_total','service_start_date','service_end_date','capability_name','capability_value','notes'
  ]);
  const AGREEMENT_COLUMNS = new Set([
    'agreement_id','proposal_id','agreement_number','company_id','company_name','contact_id','contact_name','contact_email','contact_phone','contact_mobile','customer_name','customer_legal_name','customer_address','customer_contact_name','customer_contact_mobile','customer_contact_email','customer_contact_phone','provider_name','provider_legal_name','provider_address','provider_contact_name','provider_contact_mobile',
    'provider_contact_email','service_start_date','service_end_date','agreement_date','effective_date','contract_term','account_number','billing_frequency',
    'payment_term','payment_terms','po_number','terms_conditions','customer_signatory_name','customer_signatory_title','customer_signatory_email','customer_signatory_phone',
    'customer_sign_date','provider_signatory_name','provider_signatory_title','provider_signatory_email','provider_signatory_secondary','provider_signatory_name_secondary','provider_signatory_title_secondary','provider_primary_signatory_name','provider_primary_signatory_title','provider_secondary_signatory_name','provider_secondary_signatory_title','provider_sign_date','gm_signed',
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
    'invoice_id','invoice_number','client_id','agreement_uuid','agreement_id','agreement_number','proposal_id','issue_date','due_date','billing_frequency',
    'payment_term','company_id','company_name','contact_id','contact_name','contact_email','contact_phone','contact_mobile',
    'customer_name','customer_legal_name','customer_address','customer_contact_name','customer_contact_email',
    'provider_legal_name','provider_address','support_email','subtotal_locations','subtotal_one_time','invoice_total',
    'old_paid_total','paid_now','amount_paid','received_amount','pending_amount','balance_due','payment_state','payment_status','payment_conclusion','amount_in_words','status','notes','paid_at',
    'created_by','updated_by','currency'
  ]);
  const INVOICE_ITEM_COLUMNS = new Set([
    'item_id','invoice_id','section','line_no','location_name','item_name','unit_price','discount_percent',
    'discounted_unit_price','quantity','line_total','capability_name','capability_value','notes',
    'service_start_date','service_end_date'
  ]);
  const RECEIPT_COLUMNS = new Set([
    'receipt_id','receipt_number','invoice_id','invoice_number','agreement_uuid','agreement_id','agreement_number','client_id','company_id','company_name','customer_name','customer_legal_name','customer_address','contact_id','contact_name','contact_email','contact_phone','contact_mobile','receipt_status','amount_paid','payment_date','payment_method',
    'payment_reference','is_settlement','notes','status',
    'invoice_number','currency','support_email','company_id','company_name','contact_id','contact_name','contact_email','contact_phone','contact_mobile','customer_name','customer_legal_name','customer_address',
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
    'resource', 'action', 'authToken', 'token', 'session', 'from', 'to', 'filters', 'order',
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
    agreements: new Set([
      'id', 'agreement_id', 'agreement_number', 'agreement_title', 'proposal_id', 'deal_id', 'lead_id',
      'agreement_date', 'effective_date', 'service_start_date', 'service_end_date', 'agreement_length',
      'billing_frequency', 'payment_term', 'currency', 'customer_name', 'customer_legal_name',
      'customer_contact_name', 'customer_contact_email', 'status', 'grand_total', 'updated_at', 'created_at'
    ]),
    csm: new Set([
      'id', 'activity_id', 'csm_user_id', 'csm_email', 'csm_name', 'client', 'client_id', 'client_name',
      'company_name', 'time_spent_minutes', 'type_of_support', 'effort_requirement', 'support_channel',
      'notes', 'updated_at', 'created_at'
    ]),
    operations_onboarding: new Set([
      'id', 'onboarding_id', 'agreement_id', 'agreement_number', 'client_id', 'client_name',
      'onboarding_status', 'request_type', 'technical_request_type', 'technical_request_status',
      'requested_by', 'requested_at', 'csm_assigned_to', 'updated_at', 'created_at'
    ]),
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
      'id','invoice_id','invoice_number','client_id','agreement_uuid','agreement_id','agreement_number','proposal_id','issue_date','due_date','billing_frequency',
      'payment_term','customer_name','customer_legal_name','customer_address','customer_contact_name','customer_contact_email',
      'provider_legal_name','provider_address','support_email','subtotal_locations','subtotal_one_time','invoice_total',
      'old_paid_total','paid_now','amount_paid','received_amount','pending_amount','payment_state','payment_conclusion','amount_in_words',
      'status','notes','currency','created_by','updated_by','created_at','updated_at'
    ]),
    receipts: new Set([
      'id','receipt_id','receipt_number','invoice_id','agreement_uuid','agreement_id','agreement_number','client_id','receipt_date','amount_received','payment_method',
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
  const LIST_SEARCH_COLUMNS_BY_RESOURCE = {
    agreements: ['agreement_id', 'agreement_number', 'agreement_title', 'customer_name', 'customer_legal_name', 'customer_contact_name', 'status'],
    operations_onboarding: ['onboarding_id', 'agreement_id', 'agreement_number', 'client_name', 'request_type', 'technical_request_status', 'csm_assigned_to'],
    technical_admin_requests: ['request_id', 'technical_request_id', 'agreement_id', 'agreement_number', 'client_name', 'request_status', 'request_message', 'request_details']
  };
  const UUID_COLUMNS_BY_TABLE = {
    deals: new Set(['lead_id', 'source_lead_uuid', 'created_by', 'updated_by']),
    proposals: new Set(['deal_id', 'created_by', 'updated_by']),
    proposal_items: new Set(['proposal_id']),
    agreements: new Set(['proposal_id', 'created_by', 'updated_by']),
    agreement_items: new Set(['agreement_id']),
    clients: new Set(['source_agreement_id', 'created_by', 'updated_by']),
    invoices: new Set(['client_id', 'agreement_uuid', 'proposal_id', 'created_by', 'updated_by']),
    invoice_items: new Set(['invoice_id']),
    receipts: new Set(['invoice_id', 'agreement_uuid', 'client_id', 'created_by', 'updated_by']),
    receipt_items: new Set(['receipt_id', 'invoice_item_id']),
    operations_onboarding: new Set(['agreement_id', 'client_id', 'created_by', 'updated_by']),
    technical_admin_requests: new Set(['agreement_id', 'onboarding_id', 'client_id', 'requested_by', 'updated_by']),
    notifications: new Set(['recipient_user_id', 'actor_user_id'])
  };

  function isBlankText(value) {
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
  }

  function shouldTreatColumnAsUuid(table = '', column = '') {
    const normalizedTable = String(table || '').trim().toLowerCase();
    const normalizedColumn = String(column || '').trim().toLowerCase();
    if (!normalizedColumn) return false;
    if (UUID_COLUMNS_BY_TABLE[normalizedTable]?.has(normalizedColumn)) return true;
    return normalizedColumn.endsWith('_uuid') || normalizedColumn === 'uuid';
  }

  function sanitizeUuidColumnsForMutation(table = '', payload = {}) {
    if (Array.isArray(payload)) return payload.map(row => sanitizeUuidColumnsForMutation(table, row));
    if (!payload || typeof payload !== 'object') return payload;
    const cleaned = { ...payload };
    Object.entries(cleaned).forEach(([column, value]) => {
      if (!shouldTreatColumnAsUuid(table, column)) return;
      if (isBlankText(value)) {
        delete cleaned[column];
        return;
      }
      const normalized = String(value || '').trim();
      if (!isUuid(normalized)) {
        delete cleaned[column];
        console.warn('[supabase uuid sanitizer] dropped non-UUID value before save', { table, column, value: normalized });
        return;
      }
      cleaned[column] = normalized;
    });
    return cleaned;
  }

  const WRITE_PROTECTED_TIMESTAMP_FIELDS = new Set([
    'created_at',
    'updated_at',
    'converted_at',
    'signed_at',
    'approved_at',
    'submitted_at'
  ]);

  function normalizeTimestampForWrite(value) {
    if (value === undefined || value === null) return '';
    const text = String(value).trim();
    if (!text) return '';
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : text;
  }

  function sanitizeRecordForWrite(table = '', record = {}, mode = 'create') {
    if (Array.isArray(record)) return record.map(row => sanitizeRecordForWrite(table, row, mode));
    if (!record || typeof record !== 'object') return record;
    const nowIso = new Date().toISOString();
    const cleaned = {};

    Object.entries(record).forEach(([column, value]) => {
      if (value === undefined) return;

      if (shouldTreatColumnAsUuid(table, column)) {
        if (isBlankText(value)) return;
        const normalized = String(value || '').trim();
        if (!isUuid(normalized)) {
          console.warn('[supabase uuid sanitizer] dropped non-UUID value before save', { table, column, value: normalized });
          return;
        }
        cleaned[column] = normalized;
        return;
      }

      if (WRITE_PROTECTED_TIMESTAMP_FIELDS.has(column)) {
        const normalizedTs = normalizeTimestampForWrite(value);
        if (column === 'created_at') {
          if (mode === 'create') {
            cleaned.created_at = normalizedTs || nowIso;
            return;
          }
          if (normalizedTs) cleaned.created_at = normalizedTs;
          return;
        }
        if (column === 'updated_at') {
          cleaned.updated_at = normalizedTs || nowIso;
          return;
        }
        if (normalizedTs) cleaned[column] = normalizedTs;
        return;
      }

      if (value === null) return;
      cleaned[column] = value;
    });

    if (mode === 'create' && !String(cleaned.created_at || '').trim()) cleaned.created_at = nowIso;
    if (!String(cleaned.updated_at || '').trim()) cleaned.updated_at = nowIso;
    return cleaned;
  }

  function redactSensitiveForLog(payload = {}) {
    if (Array.isArray(payload)) return payload.map(item => redactSensitiveForLog(item));
    if (!payload || typeof payload !== 'object') return payload;
    const redacted = {};
    Object.entries(payload).forEach(([key, value]) => {
      if (/password|token|secret|service[_-]?key|apikey|api[_-]?key/i.test(key)) {
        redacted[key] = '[redacted]';
        return;
      }
      redacted[key] = value && typeof value === 'object' ? redactSensitiveForLog(value) : value;
    });
    return redacted;
  }

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

  function getSchemaCacheMissingColumn(error) {
    const text = [
      error?.message,
      error?.details,
      error?.hint,
      error?.error_description,
      error
    ]
      .filter(Boolean)
      .map(value => String(value))
      .join(' ');
    const quoted = text.match(/Could not find the ['\"]([^'\"]+)['\"] column of ['\"]([^'\"]+)['\"] in the schema cache/i);
    if (quoted) return { column: quoted[1], table: quoted[2] };
    const fallback = text.match(/column ['\"]?([a-zA-Z0-9_]+)['\"]? .*schema cache/i);
    if (fallback) return { column: fallback[1], table: '' };
    return null;
  }

  function cloneMutationPayload(payload) {
    if (Array.isArray(payload)) return payload.map(row => ({ ...(row || {}) }));
    return { ...(payload || {}) };
  }

  function mutationPayloadHasColumn(payload, column = '') {
    if (!column) return false;
    if (Array.isArray(payload)) return payload.some(row => row && Object.prototype.hasOwnProperty.call(row, column));
    return payload && Object.prototype.hasOwnProperty.call(payload, column);
  }

  function stripColumnFromMutationPayload(payload, column = '') {
    if (!column) return payload;
    if (Array.isArray(payload)) {
      return payload.map(row => {
        const next = { ...(row || {}) };
        delete next[column];
        return next;
      });
    }
    const next = { ...(payload || {}) };
    delete next[column];
    return next;
  }

  async function runMutationWithSchemaRetry({
    table = '',
    payload = {},
    context = 'Supabase mutation',
    execute,
    mode = 'create',
    maxRetries = 8
  } = {}) {
    if (typeof execute !== 'function') throw new Error('Mutation execute function is required.');
    let workingPayload = sanitizeRecordForWrite(table, cloneMutationPayload(payload), mode);
    const removedColumns = [];
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const response = await execute(workingPayload);
      if (!response?.error) {
        if (removedColumns.length) {
          console.warn('[supabase schema-cache] saved after dropping missing optional columns', {
            table,
            context,
            removedColumns
          });
        }
        return response;
      }
      const missing = getSchemaCacheMissingColumn(response.error);
      const missingColumn = String(missing?.column || '').trim();
      if (missingColumn && mutationPayloadHasColumn(workingPayload, missingColumn)) {
        workingPayload = stripColumnFromMutationPayload(workingPayload, missingColumn);
        if (!removedColumns.includes(missingColumn)) removedColumns.push(missingColumn);
        console.warn('[supabase schema-cache] retrying mutation without missing optional column', {
          table: table || missing?.table || '',
          context,
          missingColumn,
          attempt: attempt + 1
        });
        continue;
      }
      if (attempt >= maxRetries || !getSchemaCacheMissingColumn(response.error)) {
        console.error('[supabase mutation] failed', {
          table,
          context,
          mode,
          payload: redactSensitiveForLog(workingPayload),
          error: response.error
        });
      }
      return response;
    }
    return {
      data: null,
      error: new Error(`${context}: unable to save after removing missing schema-cache columns: ${removedColumns.join(', ') || 'none'}`)
    };
  }

  async function insertSelectSingleWithSchemaRetry(client, table, payload = {}, context = 'Unable to create record') {
    return runMutationWithSchemaRetry({
      table,
      payload,
      context,
      mode: 'create',
      execute: workingPayload => client.from(table).insert(workingPayload).select('*').single()
    });
  }

  async function insertSelectRowsWithSchemaRetry(client, table, payload = [], context = 'Unable to create rows') {
    return runMutationWithSchemaRetry({
      table,
      payload,
      context,
      mode: 'create',
      execute: workingPayload => client.from(table).insert(workingPayload).select('*')
    });
  }

  async function updateSelectSingleWithSchemaRetry(client, table, payload = {}, key = 'id', id = '', context = 'Unable to update record') {
    return runMutationWithSchemaRetry({
      table,
      payload,
      context,
      mode: 'update',
      execute: workingPayload => client.from(table).update(workingPayload).eq(key, id).select('*').single()
    });
  }

  async function updateSelectRowsWithSchemaRetry(client, table, payload = {}, key = 'id', id = '', context = 'Unable to update rows') {
    return runMutationWithSchemaRetry({
      table,
      payload,
      context,
      mode: 'update',
      execute: workingPayload => client.from(table).update(workingPayload).eq(key, id).select('*')
    });
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
      out.status = normalizeTicketStatus(out.status);
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
      out.company_id = out.company_id ?? out.companyId ?? '';
      out.companyId = out.companyId ?? out.company_id ?? '';
      out.company_name = out.company_name ?? out.companyName ?? '';
      out.companyName = out.companyName ?? out.company_name ?? '';
      out.contact_id = out.contact_id ?? out.contactId ?? '';
      out.contactId = out.contactId ?? out.contact_id ?? '';
      out.contact_name = out.contact_name ?? out.contactName ?? '';
      out.contactName = out.contactName ?? out.contact_name ?? '';
      out.contact_email = out.contact_email ?? out.contactEmail ?? '';
      out.contactEmail = out.contactEmail ?? out.contact_email ?? '';
      out.contact_phone = out.contact_phone ?? out.contactPhone ?? '';
      out.contactPhone = out.contactPhone ?? out.contact_phone ?? '';
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
      payment_status: trimOrNull(firstDefined(record, ['payment_status', 'paymentStatus'])),
      balance_due: numberOrNull(firstDefined(record, ['balance_due', 'balanceDue'])),
      paid_at: trimOrNull(firstDefined(record, ['paid_at', 'paidAt'])),
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
      agreement_number: trimOrNull(firstDefined(record, ['agreement_number', 'agreementNumber'])),
      company_id: trimOrNull(firstDefined(record, ['company_id', 'companyId'])),
      company_name: trimOrNull(firstDefined(record, ['company_name', 'companyName'])),
      contact_id: trimOrNull(firstDefined(record, ['contact_id', 'contactId'])),
      contact_name: trimOrNull(firstDefined(record, ['contact_name', 'contactName', 'customer_contact_name', 'customerContactName'])),
      contact_email: trimOrNull(firstDefined(record, ['contact_email', 'contactEmail', 'customer_contact_email', 'customerContactEmail'])),
      contact_phone: trimOrNull(firstDefined(record, ['contact_phone', 'contactPhone', 'customer_contact_phone', 'customerContactPhone'])),
      contact_mobile: trimOrNull(firstDefined(record, ['contact_mobile', 'contactMobile', 'customer_contact_mobile', 'customerContactMobile'])),
      customer_name: trimOrNull(firstDefined(record, ['customer_name', 'customerName'])),
      customer_legal_name: trimOrNull(firstDefined(record, ['customer_legal_name', 'customerLegalName'])),
      customer_address: trimOrNull(firstDefined(record, ['customer_address', 'customerAddress'])),
      customer_contact_name: trimOrNull(firstDefined(record, ['customer_contact_name', 'customerContactName', 'contact_name', 'contactName'])),
      customer_contact_email: trimOrNull(firstDefined(record, ['customer_contact_email', 'customerContactEmail', 'contact_email', 'contactEmail'])),
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
      agreement_id: trimOrNull(firstDefined(record, ['agreement_id', 'agreementId'])),
      agreement_number: trimOrNull(firstDefined(record, ['agreement_number', 'agreementNumber'])),
      client_id: trimOrNull(firstDefined(record, ['client_id', 'clientId'])),
      company_id: trimOrNull(firstDefined(record, ['company_id', 'companyId'])),
      company_name: trimOrNull(firstDefined(record, ['company_name', 'companyName'])),
      contact_id: trimOrNull(firstDefined(record, ['contact_id', 'contactId'])),
      contact_name: trimOrNull(firstDefined(record, ['contact_name', 'contactName'])),
      contact_email: trimOrNull(firstDefined(record, ['contact_email', 'contactEmail'])),
      contact_phone: trimOrNull(firstDefined(record, ['contact_phone', 'contactPhone'])),
      contact_mobile: trimOrNull(firstDefined(record, ['contact_mobile', 'contactMobile'])),
      receipt_date: trimOrNull(firstDefined(record, ['receipt_date', 'receiptDate', 'received_date'])),
      payment_date: trimOrNull(firstDefined(record, ['payment_date', 'paymentDate'])),
      receipt_status: trimOrNull(firstDefined(record, ['receipt_status', 'receiptStatus'])),
      amount_paid: numberOrNull(firstDefined(record, ['amount_paid', 'amountPaid'])),
      amount_received: numberOrNull(firstDefined(record, ['amount_received', 'amountReceived', 'received_amount'])),
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
      lead_id: normalizeNullableUuidValue(firstDefined(record, ['lead_id', 'leadId', 'source_lead_id', 'sourceLeadId', 'lead_uuid', 'leadUuid'])),
      lead_code: toTextOrEmpty(['lead_code', 'leadCode']),
      source_lead_uuid: normalizeNullableUuidValue(firstDefined(record, ['source_lead_uuid', 'sourceLeadUuid', 'lead_uuid', 'leadUuid'])),
      full_name: toTextOrEmpty(['full_name', 'fullName']),
      company_id: toTextOrEmpty(['company_id', 'companyId']),
      company_name: toTextOrEmpty(['company_name', 'companyName']),
      contact_id: toTextOrEmpty(['contact_id', 'contactId']),
      contact_name: toTextOrEmpty(['contact_name', 'contactName']),
      contact_email: toTextOrEmpty(['contact_email', 'contactEmail']),
      contact_phone: toTextOrEmpty(['contact_phone', 'contactPhone']),
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

    const contactName = toTextOrEmpty(['contact_name', 'contactName']);
    const contactEmail = toTextOrEmpty(['contact_email', 'contactEmail']);
    const contactPhone = toTextOrEmpty(['contact_phone', 'contactPhone']);

    const mapped = {
      lead_id: toTextOrEmpty(['lead_id', 'leadId']),
      company_id: toTextOrEmpty(['company_id', 'companyId']),
      company_name: toTextOrEmpty(['company_name', 'companyName']),
      contact_id: toTextOrEmpty(['contact_id', 'contactId']),
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      full_name: contactName || toTextOrEmpty(['full_name', 'fullName']),
      phone: toTextOrEmpty(['phone']) || contactPhone,
      email: toTextOrEmpty(['email']) || contactEmail,
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

  function sanitizeCompanyRecord(input = {}, options = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const output = {};

    const assign = (key, value) => {
      if (!COMPANY_COLUMNS.has(key)) return;
      if (value === undefined) return;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        output[key] = trimmed === '' ? null : trimmed;
        return;
      }
      output[key] = value;
    };

    assign('company_id', source.company_id ?? source.companyId);
    assign('company_name', source.company_name ?? source.companyName);
    assign('legal_name', source.legal_name ?? source.legalName);
    assign('company_type', source.company_type ?? source.companyType);
    assign('industry', source.industry);
    assign('website', source.website);
    assign('main_email', source.main_email ?? source.mainEmail);
    assign('main_phone', source.main_phone ?? source.mainPhone);
    assign('country', source.country);
    assign('city', source.city);
    assign('address', source.address);
    assign('tax_number', source.tax_number ?? source.taxNumber);
    assign('company_status', source.company_status ?? source.companyStatus ?? 'Prospect');
    assign('notes', source.notes);
    assign('created_by', source.created_by ?? source.createdBy);
    assign('created_by_email', source.created_by_email ?? source.createdByEmail);

    if (options.mode === 'create' && !output.company_id) delete output.company_id;
    delete output.created_at;
    delete output.updated_at;
    if (!output.company_name) throw new Error('Company name is required.');
    return output;
  }

  function sanitizeContactRecord(input = {}, options = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const output = {};

    const assign = (key, value) => {
      if (!CONTACT_COLUMNS.has(key)) return;
      if (value === undefined) return;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        output[key] = trimmed === '' ? null : trimmed;
        return;
      }
      output[key] = value;
    };

    assign('contact_id', source.contact_id ?? source.contactId);
    assign('company_id', source.company_id ?? source.companyId);
    assign('company_name', source.company_name ?? source.companyName);
    assign('first_name', source.first_name ?? source.firstName);
    assign('last_name', source.last_name ?? source.lastName);
    assign('full_name', source.full_name ?? source.fullName);
    assign('job_title', source.job_title ?? source.jobTitle);
    assign('department', source.department);
    assign('email', source.email);
    assign('phone', source.phone);
    assign('mobile', source.mobile);
    assign('decision_role', source.decision_role ?? source.decisionRole);
    if (source.is_primary_contact !== undefined || source.isPrimaryContact !== undefined) {
      output.is_primary_contact = Boolean(source.is_primary_contact ?? source.isPrimaryContact);
    }
    assign('contact_status', source.contact_status ?? source.contactStatus ?? 'Active');
    assign('notes', source.notes);
    assign('created_by', source.created_by ?? source.createdBy);
    assign('created_by_email', source.created_by_email ?? source.createdByEmail);

    const composedFullName = [output.first_name, output.last_name]
      .map(value => (value == null ? '' : String(value).trim()))
      .filter(Boolean)
      .join(' ')
      .trim();
    if (!output.full_name && composedFullName) output.full_name = composedFullName;
    if (!output.contact_status) output.contact_status = 'Active';
    if (output.is_primary_contact === undefined) output.is_primary_contact = false;
    if (options.mode === 'create' && !output.contact_id) delete output.contact_id;
    delete output.created_at;
    delete output.updated_at;
    if (!output.company_id) throw new Error('Company is required.');
    if (!output.first_name && !output.last_name && !output.full_name) throw new Error('First Name or Last Name is required.');
    return output;
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
      company_id: firstDefined(record, ['company_id', 'companyId']),
      company_name: firstDefined(record, ['company_name', 'companyName']),
      contact_id: firstDefined(record, ['contact_id', 'contactId']),
      contact_name: firstDefined(record, ['contact_name', 'contactName']),
      contact_email: firstDefined(record, ['contact_email', 'contactEmail']),
      contact_phone: firstDefined(record, ['contact_phone', 'contactPhone']),
      contact_mobile: firstDefined(record, ['contact_mobile', 'contactMobile']),
      company_id: firstDefined(record, ['company_id', 'companyId']),
      company_name: firstDefined(record, ['company_name', 'companyName']),
      contact_id: firstDefined(record, ['contact_id', 'contactId']),
      contact_name: firstDefined(record, ['contact_name', 'contactName']),
      contact_email: firstDefined(record, ['contact_email', 'contactEmail']),
      contact_phone: firstDefined(record, ['contact_phone', 'contactPhone']),
      contact_mobile: firstDefined(record, ['contact_mobile', 'contactMobile']),
      customer_name: firstDefined(record, ['customer_name', 'customerName']),
      customer_address: firstDefined(record, ['customer_address', 'customerAddress']),
      customer_contact_name: firstDefined(record, ['customer_contact_name', 'customerContactName']),
      customer_contact_mobile: firstDefined(record, ['customer_contact_mobile', 'customerContactMobile']),
      customer_contact_email: firstDefined(record, ['customer_contact_email', 'customerContactEmail']),
      customer_contact_phone: firstDefined(record, ['customer_contact_phone', 'customerContactPhone']),
      customer_contact_phone: firstDefined(record, ['customer_contact_phone', 'customerContactPhone']),
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
      payment_term: firstDefined(record, ['payment_term', 'payment_terms', 'paymentTerm', 'paymentTerms']),
      po_number: firstDefined(record, ['po_number', 'poNumber']),
      currency: firstDefined(record, ['currency']),
      customer_legal_name: firstDefined(record, ['customer_legal_name', 'customerLegalName']),
      provider_name: firstDefined(record, ['provider_name', 'providerName']),
      provider_legal_name: firstDefined(record, ['provider_legal_name', 'providerLegalName']),
      provider_address: firstDefined(record, ['provider_address', 'providerAddress']),
      terms_conditions: firstDefined(record, ['terms_conditions', 'termsConditions']),
      customer_signatory_name: firstDefined(record, ['customer_signatory_name', 'customerSignatoryName']),
      customer_signatory_title: firstDefined(record, ['customer_signatory_title', 'customerSignatoryTitle']),
      customer_signatory_email: firstDefined(record, ['customer_signatory_email', 'customerSignatoryEmail']),
      customer_signatory_phone: firstDefined(record, ['customer_signatory_phone', 'customerSignatoryPhone']),
      provider_signatory_name: firstDefined(record, ['provider_signatory_name', 'providerSignatoryName']),
      provider_signatory_title: firstDefined(record, ['provider_signatory_title', 'providerSignatoryTitle']),
      provider_signatory_name_secondary: firstDefined(record, ['provider_signatory_name_secondary', 'providerSignatoryNameSecondary']),
      provider_signatory_title_secondary: firstDefined(record, ['provider_signatory_title_secondary', 'providerSignatoryTitleSecondary']),
      provider_signatory_email: firstDefined(record, ['provider_signatory_email', 'providerSignatoryEmail']),
      provider_primary_signatory_name: firstDefined(record, ['provider_primary_signatory_name', 'providerPrimarySignatoryName', 'provider_signatory_name_primary']),
      provider_primary_signatory_title: firstDefined(record, ['provider_primary_signatory_title', 'providerPrimarySignatoryTitle', 'provider_signatory_title_primary']),
      provider_secondary_signatory_name: firstDefined(record, ['provider_secondary_signatory_name', 'providerSecondarySignatoryName', 'provider_signatory_name_secondary']),
      provider_secondary_signatory_title: firstDefined(record, ['provider_secondary_signatory_title', 'providerSecondarySignatoryTitle', 'provider_signatory_title_secondary']),
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
    const validPaymentTerms = ['Net 7', 'Net 14', 'Net 21', 'Net 30'];
    sanitized.billing_frequency = 'Annual';
    sanitized.payment_term = validPaymentTerms.includes(String(sanitized.payment_term || '').trim()) ? String(sanitized.payment_term).trim() : 'Net 30';
    return sanitized;
  }

  function sanitizeProposalItemRecord(record = {}, proposalUuid = '') {
    const normalizedDiscountPercent = normalizeNumericValue(
      firstDefined(record, ['discount_percent', 'discountPercent', 'discount']),
      0
    );
    const mapped = compactObject({
      item_id: firstDefined(record, ['item_id', 'itemId']),
      proposal_id: normalizeNullableUuidValue(proposalUuid || firstDefined(record, ['proposal_id', 'proposalId'])),
      section: firstDefined(record, ['section']),
      line_no: firstDefined(record, ['line_no', 'lineNo', 'line']),
      location_name: firstDefined(record, ['location_name', 'locationName']),
      item_name: firstDefined(record, ['item_name', 'itemName', 'name']),
      unit_price: firstDefined(record, ['unit_price', 'unitPrice']),
      discount_percent: normalizedDiscountPercent,
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
      company_id: firstDefined(record, ['company_id', 'companyId']),
      company_name: firstDefined(record, ['company_name', 'companyName']),
      contact_id: firstDefined(record, ['contact_id', 'contactId']),
      contact_name: firstDefined(record, ['contact_name', 'contactName']),
      contact_email: firstDefined(record, ['contact_email', 'contactEmail']),
      contact_phone: firstDefined(record, ['contact_phone', 'contactPhone']),
      contact_mobile: firstDefined(record, ['contact_mobile', 'contactMobile']),
      customer_name: firstDefined(record, ['customer_name', 'customerName']),
      customer_legal_name: firstDefined(record, ['customer_legal_name', 'customerLegalName']),
      customer_address: firstDefined(record, ['customer_address', 'customerAddress']),
      customer_contact_name: firstDefined(record, ['customer_contact_name', 'customerContactName']),
      customer_contact_mobile: firstDefined(record, ['customer_contact_mobile', 'customerContactMobile']),
      customer_contact_email: firstDefined(record, ['customer_contact_email', 'customerContactEmail']),
      customer_contact_phone: firstDefined(record, ['customer_contact_phone', 'customerContactPhone']),
      provider_name: firstDefined(record, ['provider_name', 'providerName']),
      provider_legal_name: firstDefined(record, ['provider_legal_name', 'providerLegalName']),
      provider_address: firstDefined(record, ['provider_address', 'providerAddress']),
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
      payment_term: firstDefined(record, ['payment_term', 'payment_terms', 'paymentTerm', 'paymentTerms']),
      po_number: firstDefined(record, ['po_number', 'poNumber']),
      terms_conditions: firstDefined(record, ['terms_conditions', 'termsConditions']),
      customer_signatory_name: firstDefined(record, ['customer_signatory_name', 'customerSignatoryName']),
      customer_signatory_title: firstDefined(record, ['customer_signatory_title', 'customerSignatoryTitle']),
      customer_signatory_email: firstDefined(record, ['customer_signatory_email', 'customerSignatoryEmail']),
      customer_signatory_phone: firstDefined(record, ['customer_signatory_phone', 'customerSignatoryPhone']),
      customer_sign_date: normalizeNullableDateValue(firstDefined(record, ['customer_sign_date', 'customerSignDate'])),
      provider_signatory_name: firstDefined(record, ['provider_signatory_name', 'providerSignatoryName', 'provider_signatory_name_primary']),
      provider_signatory_title: firstDefined(record, ['provider_signatory_title', 'providerSignatoryTitle', 'provider_signatory_title_primary']),
      provider_signatory_name_secondary: firstDefined(record, ['provider_signatory_name_secondary', 'providerSignatoryNameSecondary', 'provider_signatory_secondary', 'providerSignatorySecondary']),
      provider_signatory_title_secondary: firstDefined(record, ['provider_signatory_title_secondary', 'providerSignatoryTitleSecondary']),
      provider_signatory_email: firstDefined(record, ['provider_signatory_email', 'providerSignatoryEmail']),
      provider_primary_signatory_name: firstDefined(record, ['provider_primary_signatory_name', 'providerPrimarySignatoryName', 'provider_signatory_name_primary']),
      provider_primary_signatory_title: firstDefined(record, ['provider_primary_signatory_title', 'providerPrimarySignatoryTitle', 'provider_signatory_title_primary']),
      provider_secondary_signatory_name: firstDefined(record, ['provider_secondary_signatory_name', 'providerSecondarySignatoryName', 'provider_signatory_name_secondary']),
      provider_secondary_signatory_title: firstDefined(record, ['provider_secondary_signatory_title', 'providerSecondarySignatoryTitle', 'provider_signatory_title_secondary']),
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
    const validPaymentTerms = ['Net 7', 'Net 14', 'Net 21', 'Net 30'];
    sanitized.billing_frequency = 'Annual';
    sanitized.payment_term = validPaymentTerms.includes(String(sanitized.payment_term || '').trim())
      ? String(sanitized.payment_term || '').trim()
      : 'Net 30';
    sanitized.payment_terms = sanitized.payment_term;
    sanitized.provider_legal_name = 'InCheck 360 Holding BV';
    sanitized.provider_name = 'InCheck 360';
    sanitized.provider_address = 'Pyrmontstraat 5, 7513 BN, Enschede, The Netherlands';
    if (!String(sanitized.provider_primary_signatory_name || '').trim()) sanitized.provider_primary_signatory_name = 'Simon Moujaly';
    if (!String(sanitized.provider_primary_signatory_title || '').trim()) sanitized.provider_primary_signatory_title = 'CFO';
    if (!String(sanitized.provider_secondary_signatory_name || '').trim()) sanitized.provider_secondary_signatory_name = 'Hanna Khattar';
    if (!String(sanitized.provider_secondary_signatory_title || '').trim()) sanitized.provider_secondary_signatory_title = 'General Manager';
    sanitized.provider_signatory_name = sanitized.provider_primary_signatory_name;
    sanitized.provider_signatory_title = sanitized.provider_primary_signatory_title;
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

  function isTicketIdCollisionError(error) {
    const code = String(error?.code || '').trim();
    const details = [
      error?.message,
      error?.details,
      error?.hint,
      error?.constraint
    ]
      .filter(Boolean)
      .join(' ');
    return code === '23505' && /tickets_ticket_id_key/i.test(details);
  }

  async function getNextTicketId(client) {
    const { data, error } = await client.rpc('next_ticket_id');
    if (error) throw friendlyError('Unable to generate ticket ID', error);
    const candidate =
      typeof data === 'string'
        ? data
        : Array.isArray(data)
          ? firstDefined(data[0], ['next_ticket_id']) || data[0]
          : firstDefined(data, ['next_ticket_id', 'ticket_id']) || data;
    const ticketId = String(candidate || '').trim();
    if (!ticketId) throw new Error('Unable to generate ticket ID.');
    return ticketId;
  }

  async function insertTicketWithRetry(client, table, createRecord = {}) {
    const payload = { ...createRecord };
    if (isBlankValue(payload.ticket_id)) {
      payload.ticket_id = await getNextTicketId(client);
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data, error } = await insertSelectSingleWithSchemaRetry(client, table, payload, 'Unable to create tickets record');
      if (!error) return data;
      if (isTicketIdCollisionError(error) && attempt === 0) {
        payload.ticket_id = await getNextTicketId(client);
        continue;
      }
      if (isTicketIdCollisionError(error)) {
        throw new Error('Ticket ID collision detected. Please retry.');
      }
      throw friendlyError('Unable to create tickets record', error);
    }

    throw new Error('Ticket ID collision detected. Please retry.');
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

  async function proposalBusinessValueExists(client, column, value, { excludeUuid = '' } = {}) {
    const normalizedColumn = String(column || '').trim();
    const normalizedValue = String(value || '').trim();
    if (!normalizedColumn || !normalizedValue) return false;
    let query = client.from('proposals').select('id').eq(normalizedColumn, normalizedValue).limit(1);
    const excluded = String(excludeUuid || '').trim();
    if (excluded) query = query.neq('id', excluded);
    const { data, error } = await query;
    if (error) throw friendlyError(`Unable to validate unique proposal ${normalizedColumn}`, error);
    return Array.isArray(data) && data.length > 0;
  }

  async function allocateUniqueProposalIdentifiers(
    client,
    { proposalId = '', refNumber = '', excludeUuid = '' } = {}
  ) {
    const excludedUuid = String(excludeUuid || '').trim();
    let nextProposalId = String(proposalId || '').trim();
    let nextRefNumber = sanitizeProposalRefNumber(refNumber);

    if (nextProposalId) {
      const idTaken = await proposalBusinessValueExists(client, 'proposal_id', nextProposalId, { excludeUuid: excludedUuid });
      if (idTaken) throw new Error(`Proposal ID already exists: ${nextProposalId}`);
    } else {
      let allocated = '';
      for (let attempt = 0; attempt < 25; attempt += 1) {
        const candidate = ensureBusinessProposalId('');
        const exists = await proposalBusinessValueExists(client, 'proposal_id', candidate, { excludeUuid: excludedUuid });
        if (!exists) {
          allocated = candidate;
          break;
        }
      }
      if (!allocated) throw new Error('Unable to generate a unique proposal ID. Please retry.');
      nextProposalId = allocated;
    }

    if (nextRefNumber) {
      const refTaken = await proposalBusinessValueExists(client, 'ref_number', nextRefNumber, { excludeUuid: excludedUuid });
      if (refTaken) throw new Error(`Proposal number already exists: ${nextRefNumber}`);
    } else {
      let allocated = '';
      for (let attempt = 0; attempt < 25; attempt += 1) {
        const candidate = ensureProposalRefNumber('');
        const exists = await proposalBusinessValueExists(client, 'ref_number', candidate, { excludeUuid: excludedUuid });
        if (!exists) {
          allocated = candidate;
          break;
        }
      }
      if (!allocated) throw new Error('Unable to generate a unique proposal number. Please retry.');
      nextRefNumber = allocated;
    }

    return {
      proposal_id: nextProposalId,
      ref_number: nextRefNumber
    };
  }

  function toTicketPublicRecord(row = {}, { includeTicketId = true, userId = '' } = {}) {
    const candidateTicketId = firstDefined(row, ['ticket_id', 'ticketCode', 'ticket_code']);
    const nowIso = new Date().toISOString();
    const mapped = compactObject({
      ticket_id: includeTicketId && !isBlankValue(candidateTicketId) ? candidateTicketId : undefined,
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
    const ticketDevStatus = ticket.dev_team_status ?? ticket.devTeamStatus ?? '';
    const ticketIssueRelated = ticket.issue_related ?? ticket.issueRelated ?? '';
    const merged = {
      ...ticket,
      youtrack_reference: internal.youtrack_reference ?? internal.youtrackReference ?? '',
      dev_team_status: String(ticketDevStatus || '').trim()
        ? ticketDevStatus
        : internal.dev_team_status ?? internal.devTeamStatus ?? '',
      issue_related: String(ticketIssueRelated || '').trim()
        ? ticketIssueRelated
        : internal.issue_related ?? internal.issueRelated ?? '',
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
    const limit = Math.max(1, Math.min(200, Number(controls.limit || normalizedRows.length || 50)));
    const page = Math.max(1, Number(controls.page || 1));
    const offset = Math.max(0, Number(controls.offset ?? (page - 1) * limit));
    const returned = normalizedRows.length;
    const safeTotal = Number.isFinite(Number(total)) ? Number(total) : returned;
    return {
      rows: normalizedRows,
      total: safeTotal,
      returned,
      hasMore: offset + returned < safeTotal,
      hasPreviousPage: page > 1,
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
    const normalizedResource = String(resource || '').trim();
    const table = TABLE_BY_RESOURCE[normalizedResource];
    const businessKeyByResource = {
      leads: 'lead_id',
      deals: 'deal_id',
      proposals: 'proposal_id',
      agreements: 'agreement_id',
      clients: 'client_id',
      invoices: 'invoice_id',
      receipts: 'receipt_id',
      operations_onboarding: 'onboarding_id',
      technical_admin_requests: 'request_id'
    };
    const businessKey = businessKeyByResource[normalizedResource] || '';
    const singular = normalizedResource.endsWith('s') ? normalizedResource.slice(0, -1) : normalizedResource;
    const containers = [
      payload,
      payload.item,
      payload.updates,
      payload[normalizedResource],
      payload[singular]
    ].filter(Boolean);
    for (const source of containers) {
      const directId = String(firstDefined(source, ['id', 'uuid']) || '').trim();
      if (isUuid(directId)) return directId;
    }
    if (!table || !businessKey) return getResourceIdentifier(normalizedResource, payload, { action: 'resolve uuid' });
    const candidates = [];
    for (const source of containers) {
      const directId = String(firstDefined(source, ['id']) || '').trim();
      const businessId = String(firstDefined(source, [businessKey]) || '').trim();
      if (businessId) candidates.push(businessId);
      if (directId && !isUuid(directId)) candidates.push(directId);
    }
    const uniqueCandidates = [...new Set(candidates.map(value => String(value || '').trim()).filter(Boolean))];
    for (const businessId of uniqueCandidates) {
      const { data, error } = await client.from(table).select('id').eq(businessKey, businessId).maybeSingle();
      if (error) throw friendlyError(`Unable to resolve ${normalizedResource} identifier`, error);
      const resolved = String(data?.id || '').trim();
      if (isUuid(resolved)) return resolved;
    }
    return '';
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
    if (directId) {
      const { data, error } = await client
        .from('operations_onboarding')
        .select('id')
        .eq('id', directId)
        .maybeSingle();
      if (error) throw friendlyError('Unable to resolve operations onboarding identifier', error);
      if (data?.id) return String(data.id || '').trim();
    }

    const onboardingId = String(
      firstDefined(payload, ['onboarding_id', 'onboardingId']) ??
      firstDefined(payload.item || {}, ['onboarding_id', 'onboardingId']) ??
      firstDefined(payload.updates || {}, ['onboarding_id', 'onboardingId']) ??
      directId ??
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
    const root = payload && typeof payload === 'object' ? payload : {};
    const nestedFilters = root.filters && typeof root.filters === 'object' ? root.filters : null;
    const rawFilters = {
      ...(nestedFilters || {}),
      ...Object.fromEntries(
        Object.entries(root).filter(([key]) => key !== 'filters')
      )
    };
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
    const limit = Math.max(1, Math.min(200, numberOr(controls.pageSize ?? controls.perPage ?? controls.limit, 50)));
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
    const { controls, dbFilters } = splitListPayload(payload);
    if (resource === 'companies') return applyCompanyListFilters(query, dbFilters, String(controls.search ?? controls.q ?? ''));
    if (resource === 'contacts') return applyContactsListFilters(query, dbFilters, String(controls.search ?? controls.q ?? ''));
    const allowedColumns = LIST_COLUMNS_BY_RESOURCE[resource];
    Object.entries(dbFilters || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (allowedColumns && !allowedColumns.has(key)) return;
      query = query.eq(key, value);
    });
    const searchTerm = String(controls.search ?? controls.q ?? '').trim();
    const searchColumns = LIST_SEARCH_COLUMNS_BY_RESOURCE[resource];
    if (searchTerm && Array.isArray(searchColumns) && searchColumns.length) {
      const safeSearch = searchTerm.replace(/[%]/g, '').replace(/[,]/g, ' ');
      const clauses = searchColumns.map(column => `${column}.ilike.%${safeSearch}%`);
      query = query.or(clauses.join(','));
    }
    return query;
  }

  function applyCompanyListFilters(query, filters = {}, search = '') {
    const f = filters || {};
    if (f.company_status) query = query.eq('company_status', f.company_status);
    if (f.company_type) query = query.eq('company_type', String(f.company_type).trim());
    if (f.industry) query = query.eq('industry', String(f.industry).trim());
    if (f.country) query = query.ilike('country', `%${String(f.country).trim()}%`);
    if (f.city) query = query.ilike('city', `%${String(f.city).trim()}%`);
    if (f.created_from) query = query.gte('created_at', String(f.created_from).trim());
    if (f.created_to) query = query.lte('created_at', `${String(f.created_to).trim()}T23:59:59.999Z`);
    const term = String(search || '').trim().replace(/[%]/g, '').replace(/[,]/g, ' ');
    if (term) query = query.or(`company_id.ilike.%${term}%,company_name.ilike.%${term}%,legal_name.ilike.%${term}%,main_email.ilike.%${term}%,main_phone.ilike.%${term}%,tax_number.ilike.%${term}%,notes.ilike.%${term}%`);
    return query;
  }

  function applyContactsListFilters(query, filters = {}, search = '') {
    const f = filters || {};
    if (f.company_id) query = query.eq('company_id', f.company_id);
    if (f.contact_status) query = query.eq('contact_status', f.contact_status);
    if (f.decision_role) query = query.eq('decision_role', f.decision_role);
    if (f.department) query = query.ilike('department', `%${String(f.department).trim()}%`);
    if (f.created_from) query = query.gte('created_at', String(f.created_from).trim());
    if (f.created_to) query = query.lte('created_at', `${String(f.created_to).trim()}T23:59:59.999Z`);
    const p = String(f.is_primary_contact ?? '').trim().toLowerCase();
    if (p === 'primary' || p === 'true') query = query.eq('is_primary_contact', true);
    if (p === 'non_primary' || p === 'false') query = query.eq('is_primary_contact', false);
    const term = String(search || '').trim().replace(/[%]/g, '').replace(/[,]/g, ' ');
    if (term) query = query.or(`contact_id.ilike.%${term}%,full_name.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,mobile.ilike.%${term}%,company_name.ilike.%${term}%,job_title.ilike.%${term}%,department.ilike.%${term}%,notes.ilike.%${term}%`);
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
    async function sendWorkflowWebPush(payload = {}, context = '') {
      try {
        const { error } = await client.functions.invoke('send-web-push-v2', {
          body: payload && typeof payload === 'object' ? payload : {}
        });
        if (error) {
          console.warn(`[workflow push] ${context} failed`, error);
        }
      } catch (error) {
        console.warn(`[workflow push] ${context} failed`, error);
      }
    }
    function buildNotificationTag({
      resource = '',
      action = '',
      recordId = '',
      notificationId = ''
    } = {}) {
      const normalizedNotificationId = String(notificationId || '').trim();
      if (normalizedNotificationId) return `notification-${normalizedNotificationId}`;
      const normalizedResource = String(resource || 'notifications').trim().toLowerCase();
      const normalizedAction = String(action || 'event').trim().toLowerCase();
      const normalizedRecordId = String(recordId || 'unknown').trim().toLowerCase();
      return `${normalizedResource}-${normalizedAction}-${normalizedRecordId}`;
    }
    function resolveNotificationUrl(resource = '', action = '', recordId = '', fallback = '') {
      const normalizedResource = String(resource || '').trim().toLowerCase();
      const normalizedAction = String(action || '').trim().toLowerCase();
      const id = String(recordId || '').trim();
      if (normalizedResource === 'tickets' && id) return `/#tickets?ticket_id=${encodeURIComponent(id)}`;
      if (normalizedResource === 'workflow' && id) return `/#workflow?approval_id=${encodeURIComponent(id)}`;
      if (['operations_onboarding', 'technical_admin_requests'].includes(normalizedResource) && id) return `/#operations-onboarding?onboarding_id=${encodeURIComponent(id)}`;
      if (normalizedResource === 'leads' && id) return `/#crm?tab=leads&id=${encodeURIComponent(id)}`;
      if (normalizedResource === 'deals' && id) return `/#crm?tab=deals&id=${encodeURIComponent(id)}`;
      if (normalizedResource === 'proposals' && id) return `/#crm?tab=proposals&id=${encodeURIComponent(id)}`;
      if (normalizedResource === 'agreements' && id) return `/#crm?tab=agreements&id=${encodeURIComponent(id)}`;
      if (normalizedResource === 'invoices' && id) return `/#finance?tab=invoices&id=${encodeURIComponent(id)}`;
      if (normalizedResource === 'receipts' && id) return `/#finance?tab=receipts&id=${encodeURIComponent(id)}`;
      return String(fallback || '').trim() || '/#notifications';
    }
    function normalizeNotificationRoles(...roleSources) {
      return [...new Set(
        roleSources
          .flatMap(source => (Array.isArray(source) ? source : [source]))
          .map(role => String(role || '').trim().toLowerCase())
          .filter(Boolean)
      )];
    }
    async function sendPwaPushForNotification(payload = {}, context = '') {
      const title = String(payload?.title || '').trim();
      const body = String(payload?.body || payload?.message || '').trim();
      const targetUserId = String(payload?.target_user_id || '').trim();
      const roles = normalizeNotificationRoles(payload?.target_role, payload?.target_roles);
      const userIds = targetUserId ? [targetUserId] : [];
      const resource = String(payload?.resource || 'notifications').trim().toLowerCase();
      const action = String(payload?.action || payload?.event_type || 'general').trim().toLowerCase();
      const recordId = String(payload?.record_id || '').trim();
      const notificationId = String(payload?.notification_id || '').trim();
      const debugContext = {
        context,
        resource,
        action,
        record_id: recordId || null,
        target_user_id: targetUserId || null,
        target_roles: roles
      };
      if (!title || !body) {
        console.warn('[notifications:pwa] push skipped', {
          ...debugContext,
          reason: 'missing-title-or-body'
        });
        return { attempted: false, reason: 'missing-title-or-body' };
      }
      if (!userIds.length && !roles.length) {
        console.warn('[notifications:pwa] push skipped', {
          ...debugContext,
          reason: 'no-target'
        });
        return { attempted: false, reason: 'no-target' };
      }
      const url = resolveNotificationUrl(resource, action, recordId, payload?.url || payload?.deep_link);
      const tag = buildNotificationTag({ resource, action, recordId, notificationId });
      const requestPayload = {
        title,
        body,
        url,
        tag,
        resource,
        action,
        record_id: recordId || undefined,
        data: {
          notification_id: notificationId || undefined,
          resource,
          action,
          record_id: recordId || undefined,
          url
        }
      };
      if (userIds.length) requestPayload.user_ids = userIds;
      else requestPayload.roles = roles;
      console.info('[notifications:pwa] sending push', {
        context,
        resource,
        action,
        record_id: recordId,
        user_ids: userIds,
        roles,
        url,
        requestPayload
      });
      try {
        const { data, error } = await client.functions.invoke('send-web-push-v2', { body: requestPayload });
        console.info('[notifications:pwa] push result', {
          context,
          resource,
          action,
          record_id: recordId,
          user_ids: userIds,
          roles,
          response: data || null,
          error: error || null
        });
        if (error) {
          console.warn('[notifications:pwa] push failed', {
            context,
            resource,
            action,
            record_id: recordId,
            user_ids: userIds,
            roles,
            error
          });
          return { attempted: true, sent: false, error: String(error?.message || error || 'send-web-push-v2 failed') };
        }
        return { attempted: true, sent: true, response: data || null };
      } catch (error) {
        console.warn('[notifications:pwa] push failed', {
          ...debugContext,
          reason: String(error?.message || error || 'send-web-push-v2 failed'),
          response: null,
          error
        });
        return { attempted: true, sent: false, error: String(error?.message || error || 'send-web-push-v2 failed') };
      }
    }
    async function createNotificationHubEvent(payload = {}, context = '') {
      try {
        const { data, error } = await client.rpc('create_notification_event', {
          p_title: String(payload?.title || '').trim(),
          p_message: String(payload?.message || payload?.body || '').trim(),
          p_type: String(payload?.action || payload?.event_type || 'general').trim().toLowerCase(),
          p_resource: String(payload?.resource || 'notifications').trim().toLowerCase(),
          p_resource_id: String(payload?.record_id || '').trim() || null,
          p_priority: String(payload?.priority || 'normal').trim().toLowerCase(),
          p_link_target: resolveNotificationUrl(payload?.resource, payload?.action || payload?.event_type, payload?.record_id, payload?.url || payload?.deep_link),
          p_meta: payload?.meta && typeof payload.meta === 'object' ? payload.meta : {},
          p_target_user_id: String(payload?.target_user_id || '').trim() || null,
          p_target_role: normalizeNotificationRoles(payload?.target_role)?.[0] || null,
          p_target_roles: normalizeNotificationRoles(payload?.target_role, payload?.target_roles) || null,
          p_dedupe_key: String(payload?.dedupe_key || '').trim() || null
        });
        if (error) {
          console.warn('[notifications:hub] create_notification_event failed', { context, error });
          return [];
        }
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.warn('[notifications:hub] create_notification_event failed', { context, error });
        return [];
      }
    }
    async function createNotificationAndPush(payload = {}, context = '') {
      const normalizedPayload = payload && typeof payload === 'object' ? payload : {};
      const targetUserId = String(normalizedPayload?.target_user_id || '').trim();
      const targetRole = String(normalizedPayload?.target_role || '').trim().toLowerCase();
      const targetRoles = Array.isArray(normalizedPayload?.target_roles)
        ? normalizedPayload.target_roles.map(role => String(role || '').trim().toLowerCase()).filter(Boolean)
        : [];
      const shouldAttemptPush = Boolean(targetUserId || targetRole || targetRoles.length);
      console.info('[notifications:pwa] createNotificationAndPush started', {
        context,
        resource: normalizedPayload?.resource || '',
        action: normalizedPayload?.action || normalizedPayload?.event_type || '',
        record_id: normalizedPayload?.record_id || '',
        target_user_id: targetUserId || '',
        target_role: targetRole || '',
        target_roles: targetRoles
      });
      const hubPromise = createNotificationHubEvent(normalizedPayload, context)
        .catch(error => {
          console.warn('[notifications:hub] create failed but PWA should continue', {
            context,
            error
          });
          return [];
        });
      const pushPromise = shouldAttemptPush
        ? sendPwaPushForNotification({
          ...normalizedPayload,
          target_role: targetRole || undefined,
          target_roles: targetRoles.length ? targetRoles : undefined
        }, context)
        : Promise.resolve({ attempted: false, reason: 'no-target' });
      const [hubSettled, pushSettled] = await Promise.allSettled([hubPromise, pushPromise]);
      const insertedRows =
        hubSettled.status === 'fulfilled' && Array.isArray(hubSettled.value)
          ? hubSettled.value
          : [];
      const pushResult =
        pushSettled.status === 'fulfilled'
          ? pushSettled.value
          : {
            attempted: shouldAttemptPush,
            sent: false,
            error: String(pushSettled.reason?.message || pushSettled.reason || 'PWA push failed')
          };
      const notificationId = String(insertedRows?.[0]?.notification_id || '').trim();
      console.info('[notifications:pwa] createNotificationAndPush completed', {
        context,
        resource: normalizedPayload?.resource || '',
        action: normalizedPayload?.action || normalizedPayload?.event_type || '',
        record_id: normalizedPayload?.record_id || '',
        target_user_id: targetUserId || '',
        target_role: targetRole || '',
        target_roles: targetRoles,
        hub_created: insertedRows.length,
        push: pushResult
      });
      return {
        created: insertedRows.length,
        push: pushResult,
        notification_id: notificationId || null
      };
    }
    async function sendWorkflowApprovalEmailNotification(eventType = '', payload = {}, context = '') {
      const normalizedEventType = String(eventType || '').trim().toLowerCase();
      if (!normalizedEventType) return null;
      try {
        const { data, error } = await client.functions.invoke('send-workflow-approval-email', {
          body: {
            event_type: normalizedEventType,
            ...(payload && typeof payload === 'object' ? payload : {})
          }
        });
        if (error) {
          console.warn(`[workflow email] ${context || normalizedEventType} failed`, error);
          return null;
        }
        return data ?? null;
      } catch (error) {
        console.warn(`[workflow email] ${context || normalizedEventType} failed`, error);
        return null;
      }
    }
    async function notifyWorkflowApprovalCreated(approvalId = '') {
      const normalizedId = String(approvalId || '').trim();
      if (!normalizedId) return null;
      const result = await fireWorkflowNotificationRpc('notify_workflow_approval_request', { p_approval_id: normalizedId });
      const approvalRow = await loadApprovalRowById(normalizedId).catch(() => null);
      const approvalRole = String(approvalRow?.approval_role || '').trim().toLowerCase();
      void sendPwaPushForNotification({
        title: 'Approval request',
        body: 'A new workflow approval request needs review.',
        resource: 'workflow',
        action: 'approval_request_created',
        record_id: normalizedId,
        target_roles: approvalRole ? [approvalRole] : ['admin'],
        url: `/#workflow?approval_id=${encodeURIComponent(normalizedId)}`
      }, 'notifyWorkflowApprovalCreated');
      void sendWorkflowApprovalEmailNotification('approval_requested', {
        approval_id: normalizedId
      }, 'notifyWorkflowApprovalCreated');
      return result;
    }
    async function notifyWorkflowDecision(approvalId = '', decision = '', reviewerComment = '') {
      const normalizedId = String(approvalId || '').trim();
      const normalizedDecision = String(decision || '').trim().toLowerCase();
      if (!normalizedId || !normalizedDecision) return null;
      const result = await fireWorkflowNotificationRpc('notify_workflow_decision', {
        p_approval_id: normalizedId,
        p_decision: normalizedDecision,
        p_reviewer_comment: String(reviewerComment || '').trim() || null
      });
      const approvalRow = await loadApprovalRowById(normalizedId).catch(() => null);
      const requesterUserId = String(approvalRow?.requester_user_id || '').trim();
      if (requesterUserId) {
        void sendPwaPushForNotification({
          title: `Approval ${normalizedDecision}`,
          body: `Your workflow request was ${normalizedDecision}.`,
          resource: 'workflow',
          action: normalizedDecision === 'approved' ? 'approval_approved' : 'approval_rejected',
          record_id: normalizedId,
          target_user_id: requesterUserId,
          url: `/#workflow?approval_id=${encodeURIComponent(normalizedId)}`
        }, 'notifyWorkflowDecision');
      }
      if (normalizedDecision === 'approved' || normalizedDecision === 'rejected') {
        void sendWorkflowApprovalEmailNotification(
          normalizedDecision === 'approved' ? 'approval_approved' : 'approval_rejected',
          {
            approval_id: normalizedId,
            reviewer_comment: String(reviewerComment || '').trim() || null
          },
          'notifyWorkflowDecision'
        );
      }
      return result;
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
        const { data, error } = await updateSelectSingleWithSchemaRetry(
          client,
          TABLE_BY_RESOURCE[resource],
          updatePayload,
          key,
          record?.[key] || record?.id || recordId,
          `Unable to apply approved changes to ${resource}`
        );
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
          const { error } = await runMutationWithSchemaRetry({
            table: itemTable,
            payload: insertRows,
            context: `Unable to apply ${resource} items`,
            execute: workingPayload => client.from(itemTable).insert(workingPayload)
          });
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

  function buildNotificationTag({
    resource = '',
    action = '',
    recordId = '',
    notificationId = ''
  } = {}) {
    const normalizedNotificationId = String(notificationId || '').trim();
    if (normalizedNotificationId) return `notification-${normalizedNotificationId}`;
    const normalizedResource = String(resource || 'notifications').trim().toLowerCase();
    const normalizedAction = String(action || 'event').trim().toLowerCase();
    const normalizedRecordId = String(recordId || 'unknown').trim().toLowerCase();
    return `${normalizedResource}-${normalizedAction}-${normalizedRecordId}`;
  }

  const NOTIFICATION_RULE_DEFAULTS = [
    { resource: 'tickets', action: 'ticket_created', recipient_roles: ['admin', 'dev'] },
    { resource: 'tickets', action: 'ticket_high_priority', recipient_roles: ['admin', 'dev'] },
    { resource: 'tickets', action: 'ticket_status_changed', recipient_roles: ['admin'], users_from_record: ['requester_email'] },
    { resource: 'tickets', action: 'ticket_dev_team_status_changed', recipient_roles: ['admin'], users_from_record: ['requester_email'] },
    { resource: 'tickets', action: 'ticket_under_development', recipient_roles: ['dev'] },
    { resource: 'leads', action: 'lead_created', recipient_roles: ['admin', 'sales_executive'] },
    { resource: 'leads', action: 'lead_updated', recipient_roles: ['admin'], users_from_record: ['owner_email', 'created_by_email'] },
    { resource: 'leads', action: 'lead_converted_to_deal', recipient_roles: ['admin'], users_from_record: ['owner_email', 'created_by_email'] },
    { resource: 'deals', action: 'deal_created', recipient_roles: ['admin'], users_from_record: ['owner_email', 'created_by_email'] },
    { resource: 'deals', action: 'deal_updated', recipient_roles: ['admin'], users_from_record: ['owner_email', 'created_by_email'] },
    { resource: 'deals', action: 'deal_created_from_lead', recipient_roles: ['admin'], users_from_record: ['owner_email', 'created_by_email'] },
    { resource: 'deals', action: 'deal_important_stage', recipient_roles: ['admin'], users_from_record: ['owner_email'] },
    { resource: 'proposals', action: 'proposal_requires_approval', recipient_roles: ['financial_controller', 'gm'] },
    { resource: 'agreements', action: 'agreement_signed', recipient_roles: ['admin', 'accounting', 'hoo'] },
    { resource: 'technical_admin_requests', action: 'technical_request_submitted', recipient_roles: ['admin', 'dev', 'hoo'] },
    { resource: 'workflow', action: 'workflow_approval_requested', recipient_roles: ['financial_controller', 'gm'] }
  ];

  function normalizeNotificationRoleKey(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    const roleMap = {
      hoo: 'hoo',
      'head of operations': 'hoo',
      gm: 'gm',
      'financial controller': 'financial_controller',
      'sales executive': 'sales_executive',
      accounting: 'accounting',
      dev: 'dev',
      admin: 'admin'
    };
    return roleMap[normalized] || normalized.replace(/\s+/g, '_');
  }

  async function listNotificationRules(client) {
    const { data, error } = await client.from('notification_rules').select('*').order('resource', { ascending: true }).order('action', { ascending: true });
    if (error) throw friendlyError('Unable to load notification settings', error);
    return Array.isArray(data) ? data : [];
  }

  function resolveNotificationUrl(resource = '', action = '', recordId = '', fallback = '') {
    const normalizedResource = String(resource || '').trim().toLowerCase();
    const id = String(recordId || '').trim();
    if (normalizedResource === 'tickets' && id) return `/#tickets?ticket_id=${encodeURIComponent(id)}`;
    if (normalizedResource === 'workflow' && id) return `/#workflow?approval_id=${encodeURIComponent(id)}`;
    if (['operations_onboarding', 'technical_admin_requests'].includes(normalizedResource) && id) return `/#operations-onboarding?onboarding_id=${encodeURIComponent(id)}`;
    if (normalizedResource === 'leads' && id) return `/#crm?tab=leads&id=${encodeURIComponent(id)}`;
    if (normalizedResource === 'deals' && id) return `/#crm?tab=deals&id=${encodeURIComponent(id)}`;
    if (normalizedResource === 'proposals' && id) return `/#crm?tab=proposals&id=${encodeURIComponent(id)}`;
    if (normalizedResource === 'agreements' && id) return `/#crm?tab=agreements&id=${encodeURIComponent(id)}`;
    if (normalizedResource === 'invoices' && id) return `/#finance?tab=invoices&id=${encodeURIComponent(id)}`;
    if (normalizedResource === 'receipts' && id) return `/#finance?tab=receipts&id=${encodeURIComponent(id)}`;
    return String(fallback || '').trim() || '/#notifications';
  }

  function normalizeNotificationRoles(...roleSources) {
    return [...new Set(
      roleSources
        .flatMap(source => (Array.isArray(source) ? source : [source]))
        .map(role => String(role || '').trim().toLowerCase())
        .filter(Boolean)
    )];
  }

  async function sendPwaPushForNotification(payload = {}, context = '') {
    const client = getClient();
    const title = String(payload?.title || '').trim();
    const body = String(payload?.body || payload?.message || '').trim();
    const targetUserId = String(payload?.target_user_id || '').trim();
    const targetUserIds = Array.isArray(payload?.target_user_ids) ? payload.target_user_ids.map(v => String(v || '').trim()).filter(Boolean) : [];
    const targetEmails = Array.isArray(payload?.target_emails) ? payload.target_emails.map(v => String(v || '').trim()).filter(Boolean) : [];
    const roles = normalizeNotificationRoles(payload?.target_role, payload?.target_roles);
    const userIds = [...new Set([...(targetUserId ? [targetUserId] : []), ...targetUserIds])];
    const resource = String(payload?.resource || 'notifications').trim().toLowerCase();
    const action = String(payload?.action || payload?.event_type || 'general').trim().toLowerCase();
    const recordId = String(payload?.record_id || '').trim();
    const notificationId = String(payload?.notification_id || '').trim();
    const debugContext = { context, resource, action, record_id: recordId || null, target_user_id: targetUserId || null, target_roles: roles };
    if (!title || !body) {
      console.warn('[notifications:pwa] push skipped', { ...debugContext, reason: 'missing-title-or-body' });
      return { attempted: false, reason: 'missing-title-or-body' };
    }
    if (!userIds.length && !roles.length && !targetEmails.length) {
      console.warn('[notifications:pwa] push skipped', { ...debugContext, reason: 'no-target' });
      return { attempted: false, reason: 'no-target' };
    }
    const url = resolveNotificationUrl(resource, action, recordId, payload?.url || payload?.deep_link);
    const tag = buildNotificationTag({ resource, action, recordId, notificationId });
    const requestPayload = {
      title,
      body,
      url,
      tag,
      resource,
      action,
      record_id: recordId || undefined,
      data: {
        notification_id: notificationId || undefined,
        resource,
        action,
        record_id: recordId || undefined,
        url
      }
    };
    if (userIds.length) requestPayload.user_ids = userIds;
    if (roles.length) requestPayload.roles = roles;
    if (targetEmails.length) requestPayload.emails = targetEmails;
    try {
      const { data, error } = await client.functions.invoke('send-web-push-v2', { body: requestPayload });
      if (error) {
        console.warn('[notifications:pwa] push failed', { ...debugContext, error });
        return { attempted: true, sent: false, error: String(error?.message || error || 'send-web-push-v2 failed') };
      }
      return { attempted: true, sent: true, response: data || null };
    } catch (error) {
      console.warn('[notifications:pwa] push failed', { ...debugContext, error });
      return { attempted: true, sent: false, error: String(error?.message || error || 'send-web-push-v2 failed') };
    }
  }

  async function createNotificationHubEvent(payload = {}, context = '') {
    const client = getClient();
    try {
      const { data, error } = await client.rpc('create_notification_event', {
        p_title: String(payload?.title || '').trim(),
        p_message: String(payload?.message || payload?.body || '').trim(),
        p_type: String(payload?.action || payload?.event_type || 'general').trim().toLowerCase(),
        p_resource: String(payload?.resource || 'notifications').trim().toLowerCase(),
        p_resource_id: String(payload?.record_id || '').trim() || null,
        p_priority: String(payload?.priority || 'normal').trim().toLowerCase(),
        p_link_target: resolveNotificationUrl(payload?.resource, payload?.action || payload?.event_type, payload?.record_id, payload?.url || payload?.deep_link),
        p_meta: payload?.meta && typeof payload.meta === 'object' ? payload.meta : {},
        p_target_user_id: String(payload?.target_user_id || '').trim() || null,
        p_target_role: normalizeNotificationRoles(payload?.target_role)?.[0] || null,
        p_target_roles: normalizeNotificationRoles(payload?.target_role, payload?.target_roles) || null,
        p_dedupe_key: String(payload?.dedupe_key || '').trim() || null
      });
      if (error) {
        console.warn('[notifications:hub] create_notification_event failed', { context, error });
        return [];
      }
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn('[notifications:hub] create_notification_event failed', { context, error });
      return [];
    }
  }

  async function createNotificationAndPush(payload = {}, context = '') {
    const normalizedPayload = payload && typeof payload === 'object' ? payload : {};
    const resource = String(normalizedPayload?.resource || '').trim().toLowerCase();
    const action = String(normalizedPayload?.action || normalizedPayload?.event_type || '').trim().toLowerCase();
    const actorUserId = String(normalizedPayload?.actor_user_id || normalizedPayload?.created_by || '').trim();
    const { data: rule, error: ruleError } = await getClient()
      .from('notification_rules')
      .select('*')
      .eq('resource', resource)
      .eq('action', action)
      .maybeSingle();
    if (ruleError) console.warn('[notifications:rules] unable to load rule', { context, resource, action, ruleError });
    if (!rule) {
      console.warn('[notifications:rules] no rule found; notification skipped', { context, resource, action });
      return { created: 0, push: { attempted: false, skipped: true, reason: 'no-rule' }, notification_id: null };
    }
    if ((rule?.is_enabled ?? rule?.enabled) === false) {
      return { created: 0, push: { attempted: false, skipped: true, reason: 'rule-disabled' }, notification_id: null };
    }
    const normalizedRoles = normalizeNotificationRoles(...(rule.recipient_roles || []), ...(normalizedPayload?.target_roles || []))
      .map(normalizeNotificationRoleKey);
    const { data: activeProfiles } = await getClient().from('profiles').select('id,email,role_key,is_active').eq('is_active', true).limit(2000);
    const profileRows = Array.isArray(activeProfiles) ? activeProfiles : [];
    const recipientUserIds = new Set([...(rule.recipient_user_ids || []), ...(normalizedPayload?.target_user_ids || [])].map(v => String(v || '').trim()).filter(Boolean));
    const recipientEmails = new Set([...(rule.recipient_emails || []), ...(normalizedPayload?.target_emails || [])].map(v => String(v || '').trim().toLowerCase()).filter(Boolean));
    const record = normalizedPayload?.record && typeof normalizedPayload.record === 'object' ? normalizedPayload.record : normalizedPayload;
    (rule.users_from_record || []).forEach(key => {
      const value = String(record?.[key] || '').trim().toLowerCase();
      if (value) recipientEmails.add(value);
    });
    profileRows.forEach(row => {
      const id = String(row.id || '').trim();
      const email = String(row.email || '').trim().toLowerCase();
      const roleKey = normalizeNotificationRoleKey(row.role_key);
      if (!id) return;
      if (normalizedRoles.includes(roleKey)) recipientUserIds.add(id);
      if (email && recipientEmails.has(email)) recipientUserIds.add(id);
    });
    if (rule.exclude_actor !== false && actorUserId) recipientUserIds.delete(actorUserId);
    if (!recipientUserIds.size && !recipientEmails.size && !normalizedRoles.length) {
      console.warn('[notifications:rules] no recipients resolved; notification skipped', { context, resource, action });
      return { created: 0, push: { attempted: false, skipped: true, reason: 'no-recipient' }, notification_id: null };
    }
    const targetUserIds = [...recipientUserIds];
    const shouldAttemptPush = Boolean(rule.pwa_enabled !== false && targetUserIds.length);
    const dedupeWindowSeconds = Math.max(1, Number(rule.dedupe_window_seconds || 60) || 60);
    const dedupeMinuteBucket = Math.floor(Date.now() / (dedupeWindowSeconds * 1000));
    const recordId = String(normalizedPayload?.record_id || record?.id || '').trim();
    const dedupeKey = `${resource}:${action}:${recordId || 'na'}:${targetUserIds[0] || 'na'}:in_app:${dedupeMinuteBucket}`;
    const hubPromise = createNotificationHubEvent(normalizedPayload, context).catch(error => {
      console.warn('[notifications:hub] create failed but save should continue', { context, error });
      return [];
    });
    const pushPromise = shouldAttemptPush
      ? sendPwaPushForNotification({
        ...normalizedPayload,
        target_user_ids: targetUserIds,
        target_emails: [...recipientEmails],
        target_roles: normalizedRoles,
        dedupe_key: dedupeKey
      }, context)
      : Promise.resolve({ attempted: false, reason: 'no-target' });
    const [hubSettled, pushSettled] = await Promise.allSettled([hubPromise, pushPromise]);
    const insertedRows = hubSettled.status === 'fulfilled' && Array.isArray(hubSettled.value) ? hubSettled.value : [];
    const pushResult = pushSettled.status === 'fulfilled'
      ? pushSettled.value
      : { attempted: shouldAttemptPush, sent: false, error: String(pushSettled.reason?.message || pushSettled.reason || 'PWA push failed') };
    const notificationId = String(insertedRows?.[0]?.notification_id || '').trim();
    return {
      created: insertedRows.length,
      push: pushResult,
      notification_id: notificationId || null
    };
  }

  async function handleRpcResource(resource, action, payload) {
    const client = getClient();
    if (resource === 'leads' && ['convert_to_deal','convert'].includes(action)) {
      assertAllowed('leads', 'convert_to_deal');
      const leadUuid = await resolveResourceUuid('leads', payload, client);
      if (!isUuid(leadUuid)) throw new Error('Lead UUID is required to convert lead to deal.');
      const { data, error } = await client.rpc('convert_lead_to_deal', { p_lead_uuid: leadUuid });
      if (error) throw friendlyError('Lead conversion failed', error);
      const recordId = String(
        data?.deal_id ||
        data?.created_deal_id ||
        data?.id ||
        data?.deal_uuid ||
        data?.created_deal_uuid ||
        ''
      ).trim();
      await createNotificationAndPush({
        title: 'Deal created from lead',
        message: `Lead ${leadUuid || 'record'} was converted to a deal.`,
        resource: 'deals',
        action: 'deal_created_from_lead',
        record_id: recordId || undefined,
        target_roles: ['admin', 'hoo'],
        dedupe_key: `deals-deal_created_from_lead-${recordId || leadUuid || 'unknown'}`
      }, 'leads:convert_to_deal').catch(pushError => {
        console.warn('[notifications:pwa] leads:convert_to_deal failed', pushError);
      });
      return data;
    }
    if (resource === 'proposals' && action === 'create_from_deal') {
      assertAllowed('proposals', 'create_from_deal');
      const dealUuid = await resolveResourceUuid('deals', payload, client);
      if (!isUuid(dealUuid)) throw new Error('Deal UUID is required to create proposal from deal.');
      const { data, error } = await client.rpc('create_proposal_from_deal', { p_deal_uuid: dealUuid });
      if (error) throw friendlyError('Proposal creation from deal failed', error);
      const notifyProposalCreatedFromDeal = async candidate => {
        const recordId = String(candidate?.proposal_id || candidate?.id || candidateUuid || '').trim();
        await createNotificationAndPush({
          title: 'Proposal created from deal',
          message: `Proposal ${String(candidate?.proposal_id || candidate?.ref_number || '').trim() || 'record'} was created from a deal.`,
          resource: 'proposals',
          action: 'proposal_created_from_deal',
          record_id: recordId || undefined,
          target_roles: ['admin', 'hoo'],
          dedupe_key: `proposals-proposal_created_from_deal-${recordId || dealUuid || 'unknown'}`
        }, 'proposals:create_from_deal').catch(pushError => {
          console.warn('[notifications:pwa] proposals:create_from_deal failed', pushError);
        });
      };
      const candidateUuid = String(
        data?.id ||
        data?.proposal_uuid ||
        data?.proposal_id_uuid ||
        data?.created_proposal_uuid ||
        data?.created_uuid ||
        ''
      ).trim();
      if (!isUuid(candidateUuid)) {
        await notifyProposalCreatedFromDeal(data);
        return data;
      }

      const { data: createdProposal, error: getProposalError } = await client
        .from('proposals')
        .select('*')
        .eq('id', candidateUuid)
        .maybeSingle();
      if (getProposalError || !createdProposal) {
        await notifyProposalCreatedFromDeal(data);
        return data;
      }

      const ensuredProposalId = ensureBusinessProposalId(createdProposal.proposal_id);
      const ensuredRefNumber = ensureProposalRefNumber(createdProposal.ref_number);
      const hasProposalId = String(createdProposal.proposal_id || '').trim();
      const hasRefNumber = String(createdProposal.ref_number || '').trim();
      if (hasProposalId && hasRefNumber) {
        await notifyProposalCreatedFromDeal(createdProposal);
        return createdProposal;
      }

      const { data: updatedProposal, error: updateError } = await client
        .from('proposals')
        .update({ proposal_id: ensuredProposalId, ref_number: ensuredRefNumber })
        .eq('id', candidateUuid)
        .select('*')
        .maybeSingle();
      if (updateError) throw friendlyError('Unable to finalize proposal business identifiers', updateError);
      const proposalRow = updatedProposal || createdProposal;
      await notifyProposalCreatedFromDeal(proposalRow);
      return proposalRow;
    }
    if (resource === 'agreements' && action === 'create_from_proposal') {
      assertAllowed('agreements', 'create_from_proposal');
      const proposalUuid = await resolveResourceUuid('proposals', { ...payload, id: payload.proposal_uuid || payload.id, proposal_id: payload.proposal_id }, client);
      if (!isUuid(proposalUuid)) throw new Error('Proposal UUID is required to create agreement from proposal.');
      const { data, error } = await client.rpc('create_agreement_from_proposal', { p_proposal_uuid: proposalUuid });
      if (error) throw friendlyError('Agreement creation from proposal failed', error);
      const recordId = String(data?.agreement_id || data?.id || data?.agreement_uuid || data?.created_agreement_uuid || '').trim();
      await createNotificationAndPush({
        title: 'Agreement created from proposal',
        message: `Proposal ${proposalUuid} generated a new agreement.`,
        resource: 'agreements',
        action: 'agreement_created_from_proposal',
        record_id: recordId || undefined,
        target_roles: ['admin', 'hoo'],
        dedupe_key: `agreements-agreement_created_from_proposal-${recordId || proposalUuid || 'unknown'}`
      }, 'agreements:create_from_proposal').catch(pushError => {
        console.warn('[notifications:pwa] agreements:create_from_proposal failed', pushError);
      });
      return data;
    }
    if (resource === 'invoices' && action === 'create_from_agreement') {
      assertAllowed('invoices', 'create_from_agreement');
      const agreementUuid = await resolveResourceUuid('agreements', { ...payload, id: payload.agreement_uuid || payload.id, agreement_id: payload.agreement_id }, client);
      if (!isUuid(agreementUuid)) throw new Error('Agreement UUID is required to create invoice from agreement.');
      const { data, error } = await client.rpc('create_invoice_from_agreement', { p_agreement_uuid: agreementUuid });
      if (error) throw friendlyError('Invoice creation from agreement failed', error);
      const recordId = String(data?.invoice_id || data?.id || data?.invoice_uuid || data?.created_invoice_uuid || '').trim();
      await createNotificationAndPush({
        title: 'Invoice created from agreement',
        message: `Agreement ${agreementUuid} generated a new invoice.`,
        resource: 'invoices',
        action: 'invoice_created_from_agreement',
        record_id: recordId || undefined,
        target_roles: ['accounting', 'admin'],
        dedupe_key: `invoices-invoice_created_from_agreement-${recordId || agreementUuid || 'unknown'}`
      }, 'invoices:create_from_agreement').catch(pushError => {
        console.warn('[notifications:pwa] invoices:create_from_agreement failed', pushError);
      });
      return data;
    }
    if (resource === 'receipts' && action === 'create_from_invoice') {
      assertAllowed('receipts', 'create_from_invoice');
      const invoiceUuid = await resolveResourceUuid('invoices', { ...payload, id: payload.invoice_uuid || payload.id, invoice_id: payload.invoice_id }, client);
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
      const receiptWithItems = withItems(resource, createdReceiptRow);
      await createNotificationAndPush({
        title: 'Receipt created from invoice',
        message: `Invoice ${invoiceUuid} generated a new receipt.`,
        resource: 'receipts',
        action: 'receipt_created_from_invoice',
        record_id: String(createdReceiptRow?.receipt_id || createdReceiptRow?.id || createdReceiptUuid || '').trim(),
        target_roles: ['accounting', 'admin'],
        dedupe_key: `receipts-receipt_created_from_invoice-${String(createdReceiptRow?.receipt_id || createdReceiptRow?.id || createdReceiptUuid || '').trim()}`
      }, 'receipts:create_from_invoice').catch(pushError => {
        console.warn('[notifications:pwa] receipts:create_from_invoice failed', pushError);
      });
      return receiptWithItems;
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
      const { controls } = splitListPayload(payload);
      const listControls = normalizeListControls(controls, 'tickets');
      let query = applyFilters(client.from('tickets').select('*', { count: 'exact' }), payload, { resource: 'tickets' });
      query = query.order(listControls.sortBy, { ascending: listControls.sortDir === 'asc' });
      query = query.range(listControls.from, listControls.to);
      const { data: tickets, error, count } = await query;
      if (error) throw friendlyError('Unable to load tickets', error);
      const normalized = (tickets || []).map(row => normalizeRow(resource, row));
      if (!isAdminDev()) return { handled: true, data: normalizePagedList(resource, normalized, listControls, count) };
      const ids = normalized.map(row => String(ticketRowId(row) || '')).filter(Boolean);
      const internalById = await loadTicketInternalByIds(ids);
      const withInternal = normalized.map(row =>
        mergeTicketInternal(row, internalById.get(String(ticketRowId(row) || '')))
      );
      return { handled: true, data: normalizePagedList(resource, withInternal, listControls, count) };
    }
    if (resource === 'tickets' && action === 'summary') {
      assertAllowed('tickets', 'list');
      // Dev SQL check helper (run manually in SQL editor; do not execute in frontend runtime):
      // select
      //   case
      //     when status is null or trim(status) = '' then 'New'
      //     when lower(trim(status)) = 'new' then 'New'
      //     when lower(trim(status)) = 'under development' then 'Under Development'
      //     when lower(trim(status)) = 'not started yet' then 'Not Started Yet'
      //     when lower(trim(status)) = 'on hold' then 'On Hold'
      //     when lower(trim(status)) = 'on stage' then 'On Stage'
      //     when lower(trim(status)) = 'sent' then 'Sent'
      //     when lower(trim(status)) = 'resolved' then 'Resolved'
      //     when lower(trim(status)) = 'rejected' then 'Rejected'
      //     else trim(status)
      //   end as normalized_status,
      //   count(*) as count
      // from public.tickets
      // group by normalized_status
      // order by count desc, normalized_status asc;
      const base = () => applyFilters(client.from('tickets'), payload, { resource: 'tickets' });
      const { count: totalCount, error: totalError } = await base().select('id', { count: 'exact', head: true });
      if (totalError) throw friendlyError('Unable to load ticket summary', totalError);
      const total = Number(totalCount || 0);
      const statusCounts = {};
      let open = 0;
      let highRisk = 0;
      const pageSize = 1000;
      const maxPages = 100;
      let from = 0;
      let lastPageBoundary = '';
      for (let page = 0; page < maxPages; page++) {
        const to = from + pageSize - 1;
        const { data: chunk, error: chunkError } = await base()
          .select('id,status,priority')
          .order('id', { ascending: true })
          .range(from, to);
        if (chunkError) throw friendlyError('Unable to load ticket summary', chunkError);
        const rows = Array.isArray(chunk) ? chunk : [];
        const firstId = String(rows[0]?.id || '');
        const lastId = String(rows[rows.length - 1]?.id || '');
        const pageBoundary = `${firstId}:${lastId}:${rows.length}`;
        if (rows.length && lastPageBoundary && pageBoundary === lastPageBoundary) break;
        lastPageBoundary = pageBoundary;
        rows.forEach(row => {
          const normalizedStatus = normalizeTicketStatus(row?.status);
          statusCounts[normalizedStatus] = (statusCounts[normalizedStatus] || 0) + 1;
          const statusLc = normalizedStatus.toLowerCase();
          const isOpen = !(statusLc.startsWith('resolved') || statusLc.startsWith('rejected'));
          if (isOpen) open += 1;
          const priority = String(row?.priority || '').trim().toLowerCase();
          const priorityWeight = priority.startsWith('h') ? 3 : priority.startsWith('m') ? 2 : priority.startsWith('l') ? 1 : 1;
          let riskScore = priorityWeight;
          if (statusLc.startsWith('on stage')) riskScore += 2;
          if (statusLc.startsWith('under development')) riskScore += 1;
          if (isOpen && riskScore >= 3) highRisk += 1;
        });
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      return {
        handled: true,
        data: {
          total,
          open,
          highRisk,
          statusCounts
        }
      };
    }
    if (resource === 'notifications' && action === 'list') {
      assertAllowed('notifications', 'list');
      const currentUserId = await getCurrentUserId(client);
      if (!currentUserId) return { handled: true, data: normalizePagedList('notifications', [], normalizeListControls({}, 'notifications'), 0) };
      const { controls } = splitListPayload(payload);
      const listControls = normalizeListControls(controls, 'notifications');
      const mode = String(controls.mode || payload.mode || '').trim().toLowerCase();
      let query = client
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('recipient_user_id', currentUserId);
      query = applyFilters(query, payload, { resource: 'notifications' });
      if (mode === 'unread') query = query.eq('is_read', false);
      if (mode === 'read') query = query.eq('is_read', true);
      if (mode === 'high') query = query.eq('priority', 'high');
      if (mode === 'approvals') query = query.or('type.ilike.%approval%,resource.ilike.%workflow%');
      if (mode === 'operations') query = query.or('type.ilike.%operation%,resource.ilike.%operations_onboarding%');
      if (mode === 'tickets') query = query.or('type.ilike.%ticket%,resource.ilike.%ticket%,resource.ilike.%issues%');
      if (mode === 'assignments') query = query.or('type.ilike.%assign%');
      query = query.order(listControls.sortBy, { ascending: listControls.sortDir === 'asc' });
      query = query.range(listControls.from, listControls.to);
      const { data, error, count } = await query;
      if (error) throw friendlyError('Unable to load notifications', error);
      return { handled: true, data: normalizePagedList('notifications', data, listControls, count) };
    }
    if (resource === 'technical_admin_requests' && action === 'list') {
      assertAllowed('technical_admin_requests', 'list');
      const { controls, dbFilters } = splitListPayload(payload);
      const listControls = normalizeListControls(controls, 'technical_admin_requests');
      const statusValue = String(
        dbFilters.request_status ??
        dbFilters.technical_request_status ??
        controls.request_status ??
        controls.technical_request_status ??
        ''
      ).trim();
      const agreementId = String(dbFilters.agreement_id ?? controls.agreement_id ?? '').trim();

      let query = client
        .from('operations_onboarding')
        .select('*', { count: 'exact' })
        .or('technical_request_type.not.is.null,technical_request_status.not.is.null');

      if (agreementId) query = query.eq('agreement_id', agreementId);
      if (statusValue) {
        const normalizedStatus = statusValue.toLowerCase().replace(/[\s-]+/g, '_');
        const statusMap = {
          requested: ['Requested', 'requested', 'Pending', 'pending'],
          pending: ['Pending', 'pending', 'Requested', 'requested'],
          in_progress: ['In Progress', 'in_progress', 'In progress', 'in progress'],
          completed: ['Completed', 'completed'],
          cancelled: ['Cancelled', 'cancelled', 'Canceled', 'canceled']
        };
        const allowedStatuses = statusMap[normalizedStatus];
        if (allowedStatuses) query = query.in('technical_request_status', allowedStatuses);
        else query = query.eq('technical_request_status', statusValue);
      }

      const searchTerm = String(controls.search ?? controls.q ?? '').trim();
      if (searchTerm) {
        const safeSearch = searchTerm.replace(/[%]/g, '').replace(/[,]/g, ' ');
        query = query.or([
          `onboarding_id.ilike.%${safeSearch}%`,
          `agreement_id.ilike.%${safeSearch}%`,
          `agreement_number.ilike.%${safeSearch}%`,
          `client_name.ilike.%${safeSearch}%`,
          `technical_request_type.ilike.%${safeSearch}%`,
          `technical_request_status.ilike.%${safeSearch}%`,
          `technical_request_details.ilike.%${safeSearch}%`
        ].join(','));
      }

      query = query
        .order('requested_at', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false, nullsFirst: false })
        .range(listControls.from, listControls.to);
      const { data, error, count } = await query;
      if (error) throw friendlyError('Unable to load technical_admin_requests', error);
      return { handled: true, data: normalizePagedList('technical_admin_requests', data, listControls, count) };
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
    if (resource === 'notification_settings' && action === 'list') {
      assertAllowed('notification_settings', 'list');
      const rows = await listNotificationRules(client);
      return { handled: true, data: { rows } };
    }
    if (resource === 'notification_settings' && action === 'upsert') {
      assertAllowed('notification_settings', 'upsert');
      const input = payload?.rule && typeof payload.rule === 'object' ? payload.rule : payload;
      const normalizedInput = { ...(input && typeof input === 'object' ? input : {}) };
      if ('enabled' in normalizedInput && !('is_enabled' in normalizedInput)) normalizedInput.is_enabled = normalizedInput.enabled;
      delete normalizedInput.enabled;
      const rule = {
        id: normalizedInput?.id || undefined,
        resource: String(normalizedInput?.resource || '').trim().toLowerCase(),
        action: String(normalizedInput?.action || '').trim().toLowerCase(),
        description: String(normalizedInput?.description || '').trim(),
        is_enabled: normalizedInput?.is_enabled !== false,
        in_app_enabled: normalizedInput?.in_app_enabled !== false,
        pwa_enabled: normalizedInput?.pwa_enabled !== false,
        email_enabled: normalizedInput?.email_enabled === true,
        recipient_roles: (Array.isArray(normalizedInput?.recipient_roles) ? normalizedInput.recipient_roles : []).map(normalizeNotificationRoleKey).filter(Boolean),
        recipient_user_ids: Array.isArray(normalizedInput?.recipient_user_ids) ? normalizedInput.recipient_user_ids : [],
        recipient_emails: Array.isArray(normalizedInput?.recipient_emails) ? normalizedInput.recipient_emails.map(v => String(v || '').trim().toLowerCase()).filter(Boolean) : [],
        users_from_record: Array.isArray(normalizedInput?.users_from_record) ? normalizedInput.users_from_record.map(v => String(v || '').trim()).filter(Boolean) : [],
        exclude_actor: normalizedInput?.exclude_actor !== false,
        dedupe_window_seconds: Math.max(1, Number(normalizedInput?.dedupe_window_seconds || 60) || 60)
      };
      if (!rule.id) delete rule.id;
      if (!rule.resource || !rule.action) throw new Error('resource and action are required.');
      const { data, error } = await client.from('notification_rules').upsert(rule, { onConflict: 'resource,action' }).select('*').single();
      if (error) throw friendlyError('Unable to save notification setting', error);
      return { handled: true, data };
    }
    if (resource === 'notification_settings' && action === 'bulk_upsert') {
      assertAllowed('notification_settings', 'bulk_upsert');
      const rules = Array.isArray(payload?.rules) ? payload.rules : [];
      for (const rule of rules) {
        const normalizedRuleInput = { ...(rule && typeof rule === 'object' ? rule : {}) };
        if ('enabled' in normalizedRuleInput && !('is_enabled' in normalizedRuleInput)) normalizedRuleInput.is_enabled = normalizedRuleInput.enabled;
        delete normalizedRuleInput.enabled;
        const upsertRule = {
          id: normalizedRuleInput?.id || undefined,
          resource: String(normalizedRuleInput?.resource || '').trim().toLowerCase(),
          action: String(normalizedRuleInput?.action || '').trim().toLowerCase(),
          description: String(normalizedRuleInput?.description || '').trim(),
          is_enabled: normalizedRuleInput?.is_enabled !== false,
          in_app_enabled: normalizedRuleInput?.in_app_enabled !== false,
          pwa_enabled: normalizedRuleInput?.pwa_enabled !== false,
          email_enabled: normalizedRuleInput?.email_enabled === true,
          recipient_roles: (Array.isArray(normalizedRuleInput?.recipient_roles) ? normalizedRuleInput.recipient_roles : []).map(normalizeNotificationRoleKey).filter(Boolean),
          recipient_user_ids: Array.isArray(normalizedRuleInput?.recipient_user_ids) ? normalizedRuleInput.recipient_user_ids : [],
          recipient_emails: Array.isArray(normalizedRuleInput?.recipient_emails) ? normalizedRuleInput.recipient_emails.map(v => String(v || '').trim().toLowerCase()).filter(Boolean) : [],
          users_from_record: Array.isArray(normalizedRuleInput?.users_from_record) ? normalizedRuleInput.users_from_record.map(v => String(v || '').trim()).filter(Boolean) : [],
          exclude_actor: normalizedRuleInput?.exclude_actor !== false,
          dedupe_window_seconds: Math.max(1, Number(normalizedRuleInput?.dedupe_window_seconds || 60) || 60)
        };
        if (!upsertRule.id) delete upsertRule.id;
        if (!upsertRule.resource || !upsertRule.action) continue;
        const { error } = await client.from('notification_rules').upsert(upsertRule, { onConflict: 'resource,action' });
        if (error) throw friendlyError('Unable to save notification setting', error);
      }
      return { handled: true, data: { ok: true, count: rules.length } };
    }
    if (resource === 'notification_settings' && action === 'reset_defaults') {
      assertAllowed('notification_settings', 'reset_defaults');
      for (const rule of NOTIFICATION_RULE_DEFAULTS) {
        const { error } = await client.from('notification_rules').upsert({
          ...rule,
          is_enabled: true,
          in_app_enabled: true,
          pwa_enabled: true,
          email_enabled: false,
          exclude_actor: true,
          dedupe_window_seconds: 60
        }, { onConflict: 'resource,action' });
        if (error) throw friendlyError('Unable to reset notification defaults', error);
      }
      return { handled: true, data: { ok: true, count: NOTIFICATION_RULE_DEFAULTS.length } };
    }
    if (resource === 'notification_settings' && action === 'test_notification') {
      assertAllowed('notification_settings', 'test_notification');
      const input = payload?.rule && typeof payload.rule === 'object' ? payload.rule : payload;
      const currentUserId = await getCurrentUserId(client);
      const result = await createNotificationAndPush({
        ...input,
        resource: String(input?.resource || '').trim().toLowerCase(),
        action: String(input?.action || '').trim().toLowerCase(),
        title: 'Test notification',
        message: `Test for ${String(input?.resource || '')}:${String(input?.action || '')}`,
        actor_user_id: currentUserId || null,
        record_id: String(input?.record_id || 'test').trim() || 'test'
      }, 'notification_settings:test_notification');
      return { handled: true, data: result };
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
            : resource === 'companies'
              ? sanitizeCompanyRecord(record, { mode: 'create' })
            : resource === 'contacts'
              ? sanitizeContactRecord(record, { mode: 'create' })
            : record;
      if (resource === 'proposals') {
        const identifiers = await allocateUniqueProposalIdentifiers(client, {
          proposalId: firstDefined(createRecord, ['proposal_id', 'proposalId']),
          refNumber: firstDefined(createRecord, ['ref_number', 'refNumber'])
        });
        createRecord.proposal_id = identifiers.proposal_id;
        createRecord.ref_number = identifiers.ref_number;
      }
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
      let data;
      if (resource === 'tickets') {
        data = await insertTicketWithRetry(client, table, createRecord);
      } else {
        const { data: inserted, error } = await insertSelectSingleWithSchemaRetry(
          client,
          table,
          createRecord,
          `Unable to create ${resource} record`
        );
        if (error) throw friendlyError(`Unable to create ${resource} record`, error);
        data = inserted;
      }
      if (!data) throw new Error(`Unable to create ${resource} record: Supabase returned no row.`);
      const created = normalizeRow(resource, data);
      if (resource === 'tickets') {
        await createNotificationAndPush({
          title: 'New ticket submitted',
          message: `${String(created.ticket_id || '').trim() || 'Ticket'}: ${String(created.title || '').trim() || 'New support ticket'}`,
          resource: 'tickets',
          action: 'ticket_created',
          record_id: String(created.ticket_id || created.id || '').trim(),
          target_roles: ['admin', 'hoo'],
          priority: String(created.priority || '').trim().toLowerCase() === 'high' ? 'high' : 'normal',
          dedupe_key: `tickets-ticket_created-${String(created.ticket_id || created.id || '').trim()}`
        }, 'tickets:create').catch(error => {
          console.warn('[notifications:pwa] tickets:create failed', error);
        });
        if (String(created.priority || '').trim().toLowerCase() === 'high') {
          await createNotificationAndPush({
            title: 'High priority ticket',
            message: `${String(created.ticket_id || '').trim() || 'Ticket'} requires immediate attention.`,
            resource: 'tickets',
            action: 'ticket_high_priority',
            record_id: String(created.ticket_id || created.id || '').trim(),
            target_roles: ['admin', 'hoo'],
            priority: 'high',
            dedupe_key: `tickets-ticket_high_priority-${String(created.ticket_id || created.id || '').trim()}`
          }, 'tickets:create:high-priority').catch(error => {
            console.warn('[notifications:pwa] tickets:create failed', error);
          });
        }
      }
      if (resource === 'operations_onboarding') {
        await createNotificationAndPush({
          title: 'Operations onboarding created',
          message: `${String(created.onboarding_id || created.id || '').trim() || 'Onboarding'} was created.`,
          resource: 'operations_onboarding',
          action: 'operations_onboarding_created',
          record_id: String(created.onboarding_id || created.id || '').trim(),
          target_roles: ['hoo', 'admin'],
          dedupe_key: `operations_onboarding-created-${String(created.onboarding_id || created.id || '').trim()}`
        }, 'operations_onboarding:create').catch(error => {
          console.warn('[notifications:pwa] operations_onboarding:create failed', error);
        });
      }
      if (resource === 'technical_admin_requests') {
        await createNotificationAndPush({
          title: 'Technical admin request submitted',
          message: String(created.request_message || created.request_details || 'A technical admin request was submitted.').trim(),
          resource: 'technical_admin_requests',
          action: 'technical_request_submitted',
          record_id: String(created.onboarding_id || created.request_id || created.technical_request_id || created.id || '').trim(),
          target_roles: ['admin', 'dev'],
          priority: 'high',
          dedupe_key: `technical_admin_requests-submitted-${String(created.id || created.request_id || '').trim()}`
        }, 'technical_admin_requests:create').catch(error => {
          console.warn('[notifications:pwa] technical_admin_requests:create failed', error);
        });
      }
      if (resource === 'leads') {
        await createNotificationAndPush({
          title: 'New lead created',
          message: `${String(created.lead_id || created.id || '').trim() || 'Lead'}: ${String(created.company_name || created.full_name || '').trim() || 'New lead'}`,
          resource: 'leads',
          action: 'lead_created',
          record_id: String(created.lead_id || created.id || '').trim(),
          target_roles: ['admin', 'hoo'],
          dedupe_key: `leads-created-${String(created.lead_id || created.id || '').trim()}`
        }, 'leads:create').catch(error => {
          console.warn('[notifications:pwa] leads:create failed', error);
        });
      }
      if (resource === 'deals') {
        const stage = String(created.stage || '').trim().toLowerCase();
        const isImportantStage = IMPORTANT_DEAL_STAGES.has(stage);
        await createNotificationAndPush({
          title: isImportantStage ? 'Deal moved to important stage' : 'New deal created',
          message: isImportantStage
            ? `${String(created.deal_id || created.id || '').trim() || 'Deal'} moved to ${String(created.stage || 'important stage').trim()}.`
            : `${String(created.deal_id || created.id || '').trim() || 'Deal'} was created.`,
          resource: 'deals',
          action: isImportantStage ? 'deal_important_stage' : 'deal_created',
          record_id: String(created.deal_id || created.id || '').trim(),
          target_roles: ['admin', 'hoo'],
          dedupe_key: isImportantStage
            ? `deals-stage-${String(created.deal_id || created.id || '').trim()}-${stage}`
            : `deals-created-${String(created.deal_id || created.id || '').trim()}`
        }, 'deals:create').catch(error => {
          console.warn('[notifications:pwa] deals:create failed', error);
        });
      }
      if (resource === 'proposals') {
        await createNotificationAndPush({
          title: 'Proposal requires review',
          message: `Proposal ${String(created.proposal_id || created.ref_number || created.id || '').trim()} requires approval.`,
          resource: 'proposals',
          action: 'proposal_requires_approval',
          record_id: String(created.proposal_id || created.id || '').trim(),
          target_roles: ['admin', 'hoo'],
          dedupe_key: `proposals-requires-approval-${String(created.proposal_id || created.id || '').trim()}`
        }, 'proposals:create').catch(error => {
          console.warn('[notifications:pwa] proposals:create failed', error);
        });
      }
      if (resource === 'agreements') {
        await createNotificationAndPush({
          title: 'Agreement created',
          message: `${String(created.agreement_number || created.agreement_id || created.id || '').trim() || 'Agreement'} was created.`,
          resource: 'agreements',
          action: 'agreement_created',
          record_id: String(created.agreement_id || created.id || '').trim(),
          target_roles: ['admin', 'hoo'],
          dedupe_key: `agreements-created-${String(created.agreement_id || created.id || '').trim()}`
        }, 'agreements:create').catch(error => {
          console.warn('[notifications:pwa] agreements:create failed', error);
        });
      }
      if (resource === 'invoices') {
        await createNotificationAndPush({
          title: 'Invoice created',
          message: `${String(created.invoice_number || created.invoice_id || created.id || '').trim() || 'Invoice'} was created.`,
          resource: 'invoices',
          action: 'invoice_created',
          record_id: String(created.invoice_id || created.id || '').trim(),
          target_roles: ['accounting', 'admin'],
          dedupe_key: `invoices-created-${String(created.invoice_id || created.id || '').trim()}`
        }, 'invoices:create').catch(error => {
          console.warn('[notifications:pwa] invoices:create failed', error);
        });
      }
      if (resource === 'receipts') {
        await createNotificationAndPush({
          title: 'Receipt created',
          message: `${String(created.receipt_number || created.receipt_id || created.id || '').trim() || 'Receipt'} was recorded.`,
          resource: 'receipts',
          action: 'receipt_created',
          record_id: String(created.receipt_id || created.id || '').trim(),
          target_roles: ['accounting', 'admin'],
          dedupe_key: `receipts-created-${String(created.receipt_id || created.id || '').trim()}`
        }, 'receipts:create').catch(error => {
          console.warn('[notifications:pwa] receipts:create failed', error);
        });
      }
      if (resource === 'proposals') {
        const createdBusinessId = String(created.proposal_id || '').trim();
        const createdRefNumber = String(created.ref_number || '').trim();
        if (!createdBusinessId || !createdRefNumber) {
          throw new Error('Proposal was created without a proposal ID/number. Save was cancelled.');
        }
        if (!isUuid(created.id)) {
          throw new Error('Proposal was created without a valid internal ID. Save was cancelled.');
        }
      }
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
        const parentId = resource === 'proposals'
          ? String(created.id || '').trim()
          : created.id || created[fk];
        if (resource === 'proposals' && !isUuid(parentId)) {
          throw new Error('Proposal items were not saved because the proposal UUID is missing.');
        }
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
        if (resource === 'proposals' && insertRows.some(row => !isUuid(row.proposal_id))) {
          throw new Error('Proposal items were not saved because the proposal reference is invalid.');
        }
        const childResp = await insertSelectRowsWithSchemaRetry(client, itemTable, insertRows, `Unable to create ${itemTable}`);
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
     
      let previousTicketStatus = '';
      let previousInternal = null;
      let previousDealStage = '';
      let previousProposalStatus = '';
      let previousAgreementStatus = '';
      let previousInvoicePaymentState = '';
      let previousOperationsOnboardingStatus = '';
      let previousTechnicalRequestStatus = '';
      if (resource === 'tickets') {
        const { data: existingTicket } = await client
          .from('tickets')
          .select('status')
          .eq(key, id)
          .maybeSingle();
        previousTicketStatus = String(existingTicket?.status || '').trim();
        if (id) {
          const { data: previousInternalRow } = await client
            .from('ticket_internal')
            .select('ticket_id,youtrack_reference,dev_team_status,issue_related,notes')
            .eq('ticket_id', id)
            .maybeSingle();
          previousInternal = previousInternalRow || null;
        }
      }
      if (resource === 'deals') {
        const { data: existingDeal } = await client.from('deals').select('stage').eq(key, id).maybeSingle();
        previousDealStage = String(existingDeal?.stage || '').trim();
      }
      if (resource === 'proposals') {
        const { data: existingProposalStatus } = await client.from('proposals').select('status').eq(key, id).maybeSingle();
        previousProposalStatus = String(existingProposalStatus?.status || '').trim();
      }
      if (resource === 'agreements') {
        const { data: existingAgreement } = await client.from('agreements').select('status').eq(key, id).maybeSingle();
        previousAgreementStatus = String(existingAgreement?.status || '').trim();
      }
      if (resource === 'invoices') {
        const { data: existingInvoice } = await client.from('invoices').select('payment_state').eq(key, id).maybeSingle();
        previousInvoicePaymentState = String(existingInvoice?.payment_state || '').trim();
      }
      if (resource === 'operations_onboarding') {
        const { data: existingOnboarding } = await client.from('operations_onboarding').select('onboarding_status').eq(key, id).maybeSingle();
        previousOperationsOnboardingStatus = String(existingOnboarding?.onboarding_status || '').trim();
      }
      if (resource === 'technical_admin_requests') {
        const { data: existingTechnical } = await client.from('technical_admin_requests').select('request_status').eq(key, id).maybeSingle();
        previousTechnicalRequestStatus = String(existingTechnical?.request_status || '').trim();
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
            : resource === 'companies'
              ? sanitizeCompanyRecord(safeUpdates, { mode: 'update' })
            : resource === 'contacts'
              ? sanitizeContactRecord(safeUpdates, { mode: 'update' })
            : safeUpdates;
      if (resource === 'proposals') {
        const { data: existingProposal, error: existingProposalError } = await client
          .from('proposals')
          .select('id, proposal_id, ref_number')
          .eq('id', id)
          .maybeSingle();
        if (existingProposalError) throw friendlyError('Unable to load proposal before update', existingProposalError);
        if (!existingProposal) throw new Error('Proposal was not found for update.');
        const hasIncomingProposalId = Object.prototype.hasOwnProperty.call(publicUpdates, 'proposal_id');
        const hasIncomingRefNumber = Object.prototype.hasOwnProperty.call(publicUpdates, 'ref_number');
        const identifiers = await allocateUniqueProposalIdentifiers(client, {
          proposalId: hasIncomingProposalId ? publicUpdates.proposal_id : existingProposal.proposal_id,
          refNumber: hasIncomingRefNumber ? publicUpdates.ref_number : existingProposal.ref_number,
          excludeUuid: id
        });
        publicUpdates.proposal_id = identifiers.proposal_id;
        publicUpdates.ref_number = identifiers.ref_number;
      }
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
      let data;
      if (resource === 'operations_onboarding') {
        const { data: rows, error } = await updateSelectRowsWithSchemaRetry(
          client,
          table,
          publicUpdates,
          key,
          id,
          `Unable to update ${resource} record`
        );
        if (error) throw friendlyError(`Unable to update ${resource} record`, error);
        const updatedRows = Array.isArray(rows) ? rows : [];
        if (!updatedRows.length) throw new Error('Technical admin request was not found or is no longer available.');
        if (updatedRows.length > 1) throw new Error('Unable to update operations_onboarding record: matched multiple rows.');
        data = updatedRows[0];
      } else {
        const { data: singleRow, error } = await updateSelectSingleWithSchemaRetry(
          client,
          table,
          publicUpdates,
          key,
          id,
          `Unable to update ${resource} record`
        );
        if (error) throw friendlyError(`Unable to update ${resource} record`, error);
        data = singleRow;
      }
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
      if (resource === 'tickets') {
      }
      if (resource === 'operations_onboarding') {
        const nextStatus = String(data?.onboarding_status || '').trim();
        if (nextStatus && previousOperationsOnboardingStatus.toLowerCase() !== nextStatus.toLowerCase()) {
          await createNotificationAndPush({
            title: 'Client onboarding updated',
            message: `${String(data?.onboarding_id || data?.id || id || '').trim()} is now ${nextStatus}.`,
            resource: 'operations_onboarding',
            action: 'onboarding_status_changed',
            record_id: String(data?.onboarding_id || data?.id || id || '').trim(),
            target_roles: ['hoo', 'admin'],
            dedupe_key: `operations_onboarding-status-${String(data?.onboarding_id || data?.id || id || '').trim()}-${nextStatus}`
          }, 'operations_onboarding:update:status').catch(error => {
            console.warn('[notifications:pwa] operations_onboarding:update:status failed', error);
          });
        }
      }
      if (resource === 'technical_admin_requests') {
        const nextStatus = String(data?.request_status || data?.technical_request_status || '').trim();
        if (nextStatus && previousTechnicalRequestStatus.toLowerCase() !== nextStatus.toLowerCase()) {
          await createNotificationAndPush({
            title: 'Technical request status changed',
            message: `${String(data?.request_id || data?.technical_request_id || id || '').trim()} is now ${nextStatus}.`,
            resource: 'technical_admin_requests',
            action: 'technical_request_status_changed',
            record_id: String(data?.onboarding_id || data?.request_id || data?.technical_request_id || id || '').trim(),
            target_roles: ['admin', 'dev'],
            dedupe_key: `technical_admin_requests-status-${String(data?.id || id || '').trim()}-${nextStatus}`
          }, 'technical_admin_requests:update:status').catch(error => {
            console.warn('[notifications:pwa] technical_admin_requests:update:status failed', error);
          });
        }
      }
      if (resource === 'deals') {
        const nextStage = String(data?.stage || '').trim().toLowerCase();
        if (IMPORTANT_DEAL_STAGES.has(nextStage) && previousDealStage.trim().toLowerCase() !== nextStage) {
          await createNotificationAndPush({
            title: 'Deal stage updated',
            message: `${String(data?.deal_id || data?.id || id || '').trim()} moved to ${String(data?.stage || '').trim()}.`,
            resource: 'deals',
            action: 'deal_important_stage',
            record_id: String(data?.deal_id || data?.id || id || '').trim(),
            target_roles: ['admin', 'hoo'],
            dedupe_key: `deals-stage-${String(data?.deal_id || data?.id || id || '').trim()}-${nextStage}`
          }, 'deals:update:stage').catch(error => {
            console.warn('[notifications:pwa] deals:update:stage failed', error);
          });
        }
      }
      if (resource === 'proposals') {
        const nextStatus = String(data?.status || '').trim().toLowerCase();
        if (nextStatus && IMPORTANT_PROPOSAL_STATUSES.has(nextStatus) && previousProposalStatus.trim().toLowerCase() !== nextStatus) {
          await createNotificationAndPush({
            title: 'Proposal updated',
            message: `Proposal ${String(data?.proposal_id || data?.ref_number || data?.id || id || '').trim()} is ${nextStatus}.`,
            resource: 'proposals',
            action: `proposal_${nextStatus.replace(/\s+/g, '_')}`,
            record_id: String(data?.proposal_id || data?.id || id || '').trim(),
            target_roles: ['admin', 'hoo'],
            dedupe_key: `proposals-status-${String(data?.proposal_id || data?.id || id || '').trim()}-${nextStatus}`
          }, 'proposals:update:status').catch(error => {
            console.warn('[notifications:pwa] proposals:update:status failed', error);
          });
        }
      }
      if (resource === 'agreements') {
        const nextStatus = String(data?.status || '').trim().toLowerCase();
        if (nextStatus.includes('signed') && previousAgreementStatus.trim().toLowerCase() !== nextStatus) {
          await createNotificationAndPush({
            title: 'Agreement signed',
            message: `Agreement ${String(data?.agreement_id || data?.agreement_number || data?.id || id || '').trim()} has been signed.`,
            resource: 'agreements',
            action: 'agreement_signed',
            record_id: String(data?.agreement_id || data?.id || id || '').trim(),
            target_roles: ['admin', 'hoo'],
            dedupe_key: `agreements-signed-${String(data?.agreement_id || data?.id || id || '').trim()}`
          }, 'agreements:update:signed').catch(error => {
            console.warn('[notifications:pwa] agreements:update:signed failed', error);
          });
        }
      }
      if (resource === 'invoices') {
        const nextPaymentState = String(data?.payment_state || '').trim().toLowerCase();
        if (nextPaymentState && previousInvoicePaymentState.trim().toLowerCase() !== nextPaymentState) {
          await createNotificationAndPush({
            title: 'Invoice payment updated',
            message: `${String(data?.invoice_number || data?.invoice_id || data?.id || id || '').trim()} is ${nextPaymentState}.`,
            resource: 'invoices',
            action: 'invoice_payment_state_changed',
            record_id: String(data?.invoice_id || data?.id || id || '').trim(),
            target_roles: ['accounting', 'admin'],
            dedupe_key: `invoices-payment-${String(data?.invoice_id || data?.id || id || '').trim()}-${nextPaymentState}`
          }, 'invoices:update:payment').catch(error => {
            console.warn('[notifications:pwa] invoices:update:payment failed', error);
          });
        }
      }

      const itemTable = ITEM_TABLES[resource];
      const fk = ITEM_FK[resource];
      if (itemTable && Array.isArray(payload.items)) {
        const parentId = resource === 'proposals'
          ? String(id || data?.id || '').trim()
          : id;
        if (resource === 'proposals' && !isUuid(parentId)) {
          throw new Error('Proposal items were not saved because the proposal UUID is missing.');
        }
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
          if (resource === 'proposals' && insertRows.some(row => !isUuid(row.proposal_id))) {
            throw new Error('Proposal items were not saved because the proposal reference is invalid.');
          }
          const childResp = await insertSelectRowsWithSchemaRetry(client, itemTable, insertRows, `Unable to update ${itemTable}`);
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
      const { data, error } = await updateSelectSingleWithSchemaRetry(
        client,
        'technical_admin_requests',
        safeUpdates,
        'id',
        id,
        'Unable to update technical admin request status'
      );
      if (error) throw friendlyError('Unable to update technical admin request status', error);
      const technicalRequest = normalizeRow('technical_admin_requests', data);
      await createNotificationAndPush({
        title: 'Technical request status changed',
        message: `${String(technicalRequest.request_id || technicalRequest.technical_request_id || id || '').trim()} is now ${status}.`,
        resource: 'technical_admin_requests',
        action: 'technical_request_status_changed',
        record_id: String(technicalRequest.onboarding_id || technicalRequest.request_id || technicalRequest.technical_request_id || id || '').trim(),
        target_roles: ['admin', 'dev'],
        dedupe_key: `technical_admin_requests-status-${String(technicalRequest.id || id || '').trim()}-${String(status || '').trim().toLowerCase()}`
      }, 'technical_admin_requests:update_status').catch(pushError => {
        console.warn('[notifications:pwa] technical_admin_requests:update:status failed', pushError);
      });
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
  global.testNonWorkflowPwaPush = async function testNonWorkflowPwaPush() {
    return createNotificationAndPush({
      title: 'Ticket PWA Test',
      message: 'Testing non-workflow PWA push path.',
      resource: 'tickets',
      action: 'ticket_created',
      record_id: 'TEST-PWA',
      target_roles: ['admin'],
      dedupe_key: `manual-ticket-pwa-test-${Date.now()}`
    }, 'manual:test:tickets');
  };
})(window);
