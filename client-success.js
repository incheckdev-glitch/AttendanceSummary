(function initClientSuccess360(global) {
  'use strict';

  const TABLES = {
    profiles: 'cs_client_profiles',
    reviews: 'cs_client_reviews',
    answers: 'cs_client_review_answers',
    tasks: 'cs_tasks',
    risks: 'cs_risks',
    qbrs: 'cs_qbrs',
    contacts: 'cs_client_contacts',
    templates: 'cs_review_templates',
    templateQuestions: 'cs_review_template_questions',
    completions: 'cs_location_completions',
    groups: 'cs_client_groups',
    groupMembers: 'cs_client_group_members',
    brands: 'cs_client_brands',
    brandLocations: 'cs_client_brand_locations',
    specialTemplates: 'cs_special_clients',
    specialGroups: 'cs_special_client_groups',
    specialBrands: 'cs_special_client_brands',
    specialLocations: 'cs_special_client_locations'
  };

  const QUESTION_BANK = {
    weekly: [
      ['client_contacted', 'Was the client contacted this week?'],
      ['client_responded', 'Did the client respond?'],
      ['client_satisfied', 'Is the client satisfied?'],
      ['system_used_properly', 'Is the client using the system properly?'],
      ['unresolved_issues', 'Are there unresolved issues?'],
      ['training_needed', 'Is extra training needed?'],
      ['relationship_risk', 'Is there any relationship risk?'],
      ['extra_effort_needed', 'Does the client need extra CS effort?'],
      ['escalation_needed', 'Should this be escalated?']
    ],
    monthly: [
      ['adoption_reviewed', 'Was adoption reviewed this month?'],
      ['relationship_reviewed', 'Was relationship quality reviewed?'],
      ['satisfaction_confirmed', 'Was client satisfaction confirmed?'],
      ['concerns_logged', 'Were open concerns checked?'],
      ['training_reviewed', 'Were training needs reviewed?'],
      ['renewal_discussed', 'Was renewal confidence/status reviewed?'],
      ['extra_effort_needed', 'Does the client need extra CS effort?'],
      ['escalation_needed', 'Should management be escalated?'],
      ['next_plan_defined', 'Is next month action plan defined?']
    ]
  };

  const STATE = {
    booted: false,
    loading: false,
    selectedCompanyId: '',
    selectedEntityType: 'normal',
    selectedSpecialClientId: '',
    activeTab: 'overview',
    specialActiveTab: 'overview',
    filters: { search: '', status: 'All', health: 'All', effort: 'All', group: 'All' },
    tablesMissing: new Set(),
    rows: {
      companies: [], allCompanies: [], clients: [], profiles: [], reviews: [], tasks: [], risks: [], qbrs: [], contacts: [], mainContacts: [], activities: [], onboarding: [], agreements: [], agreementItems: [], invoices: [], invoiceItems: [], completions: [], tickets: [], groups: [], groupMembers: [], brands: [], brandLocations: [], specialTemplates: [], specialGroups: [], specialBrands: [], specialLocations: []
    },
    templateQuestions: { weekly: [], monthly: [] },
    clientSelectPagination: { search: '', page: 1, pageSize: 25, total: 0 },
    specialClientSelectPagination: { search: '', page: 1, pageSize: 25, total: 0 },
    completionHistory: {
      scope: 'client',
      groupId: '',
      brandId: '',
      reviewType: 'all',
      dateFrom: '',
      dateTo: '',
      search: '',
      page: 1,
      pageSize: 25
    }
  };

  const $ = id => document.getElementById(id);
  const esc = value => (global.U?.escapeHtml ? global.U.escapeHtml(value) : String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])));
  const attr = value => (global.U?.escapeAttr ? global.U.escapeAttr(value) : esc(value));
  const fmtDate = value => {
    const raw = String(value || '').trim();
    if (!raw) return '—';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw.slice(0, 10) || '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  };
  const isoToday = () => new Date().toISOString().slice(0, 10);
  const daysBetween = (from, to = new Date()) => {
    const d = new Date(from || '');
    if (Number.isNaN(d.getTime())) return null;
    return Math.floor((new Date(to).setHours(0,0,0,0) - d.setHours(0,0,0,0)) / 86400000);
  };
  const normalize = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ').replace(/\s+/g, ' ').trim();

  function normalizeCs360DisplayName(value = '') {
    return String(value || '').trim().toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function applyCs360LocationNameOverride(row = {}) {
    const clientName = normalizeCs360DisplayName(
      row.client_name ||
      row.company_name ||
      row.company_name_snapshot ||
      row.customer_name ||
      row.account_name ||
      row.client ||
      ''
    );

    const locationName = String(
      row.location_name ||
      row.location ||
      row.branch_name ||
      row.site_name ||
      ''
    ).trim();

    const normalizedLocation = normalizeCs360DisplayName(locationName);

    const isCafeOne =
      clientName.includes('cafe one sal') ||
      clientName.includes('café one sal');

    if (isCafeOne && normalizedLocation === 'cosmo abc') {
      return {
        ...row,
        location_name: 'MET ABC & Napoletana',
        location: 'MET ABC & Napoletana',
        branch_name: row.branch_name === locationName ? 'MET ABC & Napoletana' : row.branch_name,
        site_name: row.site_name === locationName ? 'MET ABC & Napoletana' : row.site_name
      };
    }

    return row;
  }
  function normalizeRoleKey(value) {
    return String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  }

  const roleKey = () => {
    const auth = global.Session?.authContext?.() || {};
    const profile = auth.profile || auth.user?.profile || {};
    return normalizeRoleKey(
      global.Permissions?.getCurrentUserRole?.() ||
      auth.role_key ||
      auth.role ||
      profile.role_key ||
      profile.role ||
      global.Session?.state?.role_key ||
      global.Session?.state?.role ||
      global.Session?.role?.() ||
      ''
    );
  };
  const isAdmin = () => roleKey() === 'admin';

  function csPermissionRows() {
    const rows = global.Permissions?.state?.rows;
    return Array.isArray(rows) ? rows : [];
  }

  function rowBool(value, defaultValue = true) {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value).trim().toLowerCase();
    if (['true','1','yes','y'].includes(normalized)) return true;
    if (['false','0','no','n'].includes(normalized)) return false;
    return defaultValue;
  }

  function actionCandidates(action) {
    const key = String(action || '').trim().toLowerCase();
    if (!key) return [];
    if (['view','list','get','export'].includes(key)) return [key, 'view', 'list', 'get', 'export', 'manage'];
    if (['create','insert','add'].includes(key)) return [key, 'create', 'insert', 'add', 'manage'];
    if (['update','edit','move'].includes(key)) return [key, 'update', 'edit', 'move', 'manage'];
    if (['delete','remove'].includes(key)) return [key, 'delete', 'remove', 'manage'];
    return [key, 'manage'];
  }

  function rowMatchesCurrentRole(row) {
    const currentRole = roleKey();
    return normalizeRoleKey(row?.role_key) === currentRole;
  }

  function rowMatchesCsResource(row) {
    const resource = String(row?.resource || '').trim().toLowerCase();
    return resource === 'client_success' || resource === 'customer_success';
  }

  function hasCsPermission(action) {
    const candidates = actionCandidates(action);
    if (!candidates.length) return false;
    if (isAdmin()) return true;

    const matched = csPermissionRows().filter(row =>
      rowMatchesCurrentRole(row) &&
      rowMatchesCsResource(row) &&
      candidates.includes(String(row.action || '').trim().toLowerCase()) &&
      rowBool(row.is_active, true)
    );

    // Strict rule: explicit deny wins for this role/action.
    if (matched.some(row => rowBool(row.is_allowed, true) === false)) return false;

    // Strict rule: only exact role_key rows count. This prevents one broad/global row
    // from accidentally giving all roles create/update/delete access.
    return matched.some(row => rowBool(row.is_allowed, true) === true);
  }

  const canManage = () => hasCsPermission('manage');
  const canCreate = () => hasCsPermission('create') || canManage();
  const canUpdate = () => hasCsPermission('update') || canManage();
  const canDelete = () => hasCsPermission('delete') || canManage();
  const canExport = () => hasCsPermission('export') || hasCsPermission('view') || canManage();
  const canViewOnly = () => (
    hasCsPermission('view') ||
    hasCsPermission('list') ||
    hasCsPermission('get') ||
    canExport()
  );
  const canWrite = () => canCreate() || canUpdate() || canDelete() || canManage();
  const canAccess = () => canViewOnly() || canWrite();
  const accessLabel = () => canWrite() ? 'Write access' : 'View only';

  function requiredCsPermissionForAction(action) {
    const key = String(action || '').trim().toLowerCase();
    if (key === 'brand-location-remove') return 'delete';
    if (key === 'brand-location-move') return 'update';
    if (key === 'completion-export' || key === 'brand-export' || key === 'special-client-view-report' || key === 'special-client-report') return 'export';
    if (
      key === 'special-clients-open' ||
      key === 'special-client-open' ||
      key === 'completion-history-client' ||
      key === 'completion-history-group' ||
      key === 'completion-history-brand'
    ) return 'view';
    if (key === 'special-client-use-completion') return 'create';
    if (key === 'special-client-create') return 'create';
    if (key === 'special-client-edit') return 'update';
    if (key === 'special-client-archive') return 'delete';
    return 'create';
  }

  function canRunCsAction(action) {
    const required = requiredCsPermissionForAction(action);
    if (required === 'view') return canAccess();
    if (required === 'export') return canExport();
    if (required === 'delete') return canDelete();
    if (required === 'update') return canUpdate();
    return canCreate();
  }

  const supabase = () => global.SupabaseClient?.getClient?.();

  function toast(message) {
    const text = String(message || '').trim();
    if (!text) return;
    if (typeof global.UI?.toast === 'function') {
      global.UI.toast(text);
      return;
    }

    console.info('[ClientSuccess360]', text);
    let node = document.getElementById('csFallbackToast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'csFallbackToast';
      node.setAttribute('role', 'status');
      node.style.cssText = [
        'position:fixed',
        'right:24px',
        'bottom:24px',
        'z-index:100000',
        'max-width:440px',
        'padding:12px 16px',
        'border-radius:12px',
        'background:#0f172a',
        'color:#fff',
        'box-shadow:0 18px 50px rgba(15,23,42,.35)',
        'font:600 13px/1.45 system-ui,sans-serif',
        'white-space:pre-wrap'
      ].join(';');
      document.body.appendChild(node);
    }
    node.textContent = text;
    node.hidden = false;
    clearTimeout(node.__csToastTimer);
    node.__csToastTimer = setTimeout(() => { node.hidden = true; }, 7000);
  }

  function withCsTimeout(request, timeoutMs = 20000, label = 'Database request') {
    let timer;
    return Promise.race([
      Promise.resolve(request),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs);
      })
    ]).finally(() => clearTimeout(timer));
  }

  function isMissingRpcError(error, functionName = '') {
    const message = String(error?.message || error || '');
    return /PGRST202|Could not find the function|schema cache|function .* does not exist/i.test(message)
      && (!functionName || message.toLowerCase().includes(String(functionName).toLowerCase()) || /function/i.test(message));
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function safeDecimal(value, fallback = 0) {
    const normalized = String(value ?? '').trim().replace(',', '.');
    if (!normalized) return fallback;
    const n = Number(normalized);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : fallback;
  }

  function formatDecimal(value) {
    const n = safeDecimal(value);
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }

  function companyName(row = {}) {
    return String(row.legal_name || row.legal_company_name || row.company_name || row.customer_legal_name || row.customer_name || row.client_name || row.name || 'Unnamed Client').trim();
  }

  function companyId(row = {}) {
    return String(
      row.id ||
      row.company_id ||
      row.client_id ||
      row.customer_company_id ||
      row.client_company_id ||
      ''
    ).trim();
  }


  function agreementCompanyId(row = {}) {
    return String(row.company_id || row.company_uuid || row.client_id || row.customer_id || row.customer_company_id || row.companyId || row.clientId || '').trim();
  }

  function agreementCompanyName(row = {}) {
    return String(row.company_name || row.legal_company_name || row.customer_legal_name || row.customer_name || row.client_name || row.customer || '').trim();
  }

  function agreementKey(row = {}) {
    return String(row.id || row.agreement_uuid || row.agreement_id || row.agreement_number || row.parent_id || row.parent_number || '').trim();
  }

  function agreementKeys(row = {}) {
    return [row.id, row.agreement_uuid, row.agreement_id, row.agreement_number, row.parent_id, row.parent_number]
      .map(v => String(v || '').trim())
      .filter(Boolean);
  }

  function isSignedAgreement(row = {}) {
    const raw = String(row.status || row.agreement_status || row.lifecycle_status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (['signed','active','executed','signed_active','signedactive'].includes(raw)) return true;
    if ((raw.includes('signed') || raw.includes('active') || raw.includes('executed')) && !raw.includes('unsigned') && !raw.includes('draft') && !raw.includes('cancel')) return true;
    return Boolean(
      row.signed_date || row.customer_signed_at || row.customer_sign_date || row.customer_official_sign_date ||
      row.e_signature_signed_at || row.e_agreement_signature_signed_at || row.signed_document_url ||
      row.signed_agreement_document_url || row.signed_document_path || row.signed_agreement_document_path
    );
  }

  function signedAgreementRows() {
    return (STATE.rows.agreements || []).filter(isSignedAgreement);
  }

  function companyHasSignedAgreement(company) {
    const id = companyId(company);
    const nameKey = normalize(companyName(company));
    return signedAgreementRows().some(row => {
      const rowCompanyId = agreementCompanyId(row);
      if (id && rowCompanyId && id === rowCompanyId) return true;
      const rowName = normalize(agreementCompanyName(row));
      return Boolean(nameKey && rowName && nameKey === rowName);
    });
  }

  function normalizeClientIdentity(value = '') {
    return normalizeCs360DisplayName(value)
      .replace(/\b(s\.?a\.?l|l\.?l\.?c|limited liability company|one person company|company|branch)\b/g, ' ')
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function clientRegistryName(row = {}) {
    return String(
      row.customer_legal_name ||
      row.legal_name ||
      row.legal_company_name ||
      row.company_name ||
      row.customer_name ||
      row.client_name ||
      row.name ||
      'Unnamed Client'
    ).trim();
  }

  function clientRegistryId(row = {}) {
    return String(
      row.company_id ||
      row.customer_company_id ||
      row.client_company_id ||
      row.client_id ||
      row.id ||
      ''
    ).trim();
  }

  function namesRepresentSameClient(left = '', right = '') {
    const a = normalizeClientIdentity(left);
    const b = normalizeClientIdentity(right);
    if (!a || !b) return false;
    if (a === b) return true;

    // A legal registration name may continue after the trading/client name,
    // for example "BAB ALMANSOUR RESTAURANT OWNED BY ...".
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length > b.length ? a : b;
    return shorter.length >= 8 && longer.startsWith(`${shorter} `);
  }

  function findCompanyForClientRegistryRow(clientRow = {}, companies = []) {
    const ids = [
      clientRow.company_id,
      clientRow.customer_company_id,
      clientRow.client_company_id,
      clientRow.companyId,
      clientRow.customerCompanyId
    ].map(v => String(v || '').trim()).filter(Boolean);

    const byId = companies.find(company => {
      const companyIds = [
        company.id,
        company.company_id,
        company.company_uuid,
        company.uuid
      ].map(v => String(v || '').trim()).filter(Boolean);
      return ids.some(id => companyIds.includes(id));
    });
    if (byId) return byId;

    const registryName = clientRegistryName(clientRow);
    return companies.find(company => namesRepresentSameClient(registryName, companyName(company))) || null;
  }

  function clientRegistryRowAsCompany(clientRow = {}, linkedCompany = null) {
    const id = clientRegistryId(clientRow) || companyId(linkedCompany || {});
    return {
      ...(linkedCompany || {}),
      ...clientRow,
      id,
      company_id: id,
      company_name: clientRegistryName(clientRow) || companyName(linkedCompany || {}),
      legal_name: clientRegistryName(clientRow) || companyName(linkedCompany || {}),
      company_status: clientRow.status || linkedCompany?.company_status || 'Client',
      city: clientRow.city || linkedCompany?.city || '',
      country: clientRow.country || linkedCompany?.country || '',
      __cs_source: 'client_registry'
    };
  }

  function companyHasActiveInvoice(company, invoices = []) {
    const id = companyId(company);
    const name = companyName(company);
    return (Array.isArray(invoices) ? invoices : []).some(invoice => {
      if (!isActiveInvoice(invoice)) return false;
      const invoiceCompanyId = String(
        invoice.company_id ||
        invoice.company_uuid ||
        invoice.client_id ||
        invoice.customer_id ||
        invoice.customer_company_id ||
        ''
      ).trim();
      if (id && invoiceCompanyId && id === invoiceCompanyId) return true;
      const invoiceName = String(
        invoice.customer_legal_name ||
        invoice.customer_name ||
        invoice.company_name ||
        invoice.client_name ||
        ''
      ).trim();
      return namesRepresentSameClient(name, invoiceName);
    });
  }

  function buildCs360ClientCompanies(companies = [], clientRows = [], agreements = [], invoices = []) {
    const allCompanies = Array.isArray(companies) ? companies : [];
    const registryRows = Array.isArray(clientRows) ? clientRows : [];
    const result = new Map();

    const add = row => {
      const id = companyId(row);
      const nameKey = normalizeClientIdentity(companyName(row));
      const key = id || `name:${nameKey}`;
      if (!key || key === 'name:') return;

      const previous = result.get(key);
      result.set(key, previous ? { ...previous, ...row } : row);
    };

    // The Clients module is the primary source. Every non-deleted client is
    // visible in CS360, even when no agreement/invoice is linked yet.
    registryRows
      .filter(row => !['deleted','removed'].includes(String(row.status || '').trim().toLowerCase()))
      .forEach(clientRow => {
        const linkedCompany = findCompanyForClientRegistryRow(clientRow, allCompanies);
        add(clientRegistryRowAsCompany(clientRow, linkedCompany));
      });

    // Keep commercial clients visible even when the Clients registry link is
    // incomplete or the legal names differ.
    const previousAgreements = STATE.rows.agreements;
    STATE.rows.agreements = Array.isArray(agreements) ? agreements : [];
    allCompanies.forEach(company => {
      const status = String(company.company_status || company.status || '').trim().toLowerCase();
      const looksLikeClient = status.includes('client') || status.includes('customer') || status.includes('active');
      if (companyHasSignedAgreement(company) || companyHasActiveInvoice(company, invoices) || looksLikeClient) add(company);
    });
    STATE.rows.agreements = previousAgreements;

    return Array.from(result.values())
      .filter(row => companyId(row) && companyName(row))
      .sort((a, b) => companyName(a).localeCompare(companyName(b)));
  }

  function getSelectedCompany() {
    const id = STATE.selectedCompanyId || companyId(STATE.rows.companies[0] || {});
    return STATE.rows.companies.find(c => companyId(c) === id) || STATE.rows.companies[0] || null;
  }

  function getSelectedSpecialClient() {
    const id = String(STATE.selectedSpecialClientId || '').trim();
    return specialTemplateById(id) || activeSpecialTemplates()[0] || null;
  }

  function selectNormalClient(id = '') {
    const company = (STATE.rows.companies || []).find(row => companyId(row) === String(id || '').trim());
    if (!company) return;
    STATE.selectedEntityType = 'normal';
    STATE.selectedCompanyId = companyId(company);
    STATE.activeTab = 'overview';
    STATE.completionHistory = {
      ...STATE.completionHistory,
      scope: 'client',
      groupId: '',
      brandId: '',
      page: 1
    };
    renderClientList();
    renderDetail();
  }

  function selectSpecialClient(id = '') {
    const special = specialTemplateById(id) || activeSpecialTemplates()[0] || null;
    if (!special) {
      toast('No active Special CS Client is available.');
      return;
    }
    STATE.selectedEntityType = 'special';
    STATE.selectedSpecialClientId = specialTemplateId(special);
    STATE.specialActiveTab = 'overview';
    renderClientList();
    renderDetail();
  }

  function rowsForCompany(kind, company) {
    const id = companyId(company);
    const nameKey = normalize(companyName(company));
    return (STATE.rows[kind] || []).filter(row => {
      const rowCompanyId = String(row.company_id || row.companyId || row.company_uuid || row.client_id || row.customer_id || row.customer_company_id || '').trim();
      if (rowCompanyId && rowCompanyId === id) return true;
      const idsRaw = row.company_ids || row.companyIds || [];
      const ids = Array.isArray(idsRaw) ? idsRaw.map(v => String(v || '').trim()) : String(idsRaw || '').replace(/[{}"]/g, '').split(',').map(v => v.trim());
      if (id && ids.includes(id)) return true;
      const rowName = normalize(row.company_name || row.companyName || row.legal_company_name || row.client_name || row.clientName || row.client || row.company_names || row.companyNames || row.customer_name || row.customer_legal_name || row.manual_client_name || row.manualClientName || '');
      return Boolean(rowName && nameKey && (rowName === nameKey || rowName.split(',').map(v => normalize(v)).includes(nameKey)));
    });
  }

  function latestDate(rows, keys) {
    let max = '';
    rows.forEach(row => {
      keys.forEach(key => {
        const raw = String(row[key] || '').trim();
        if (!raw) return;
        const iso = raw.slice(0, 10);
        if (!max || iso > max) max = iso;
      });
    });
    return max;
  }

  function firstFutureDate(rows, keys) {
    const today = isoToday();
    const dates = [];
    rows.forEach(row => keys.forEach(key => {
      const iso = String(row[key] || '').slice(0, 10);
      if (iso && iso >= today) dates.push(iso);
    }));
    dates.sort();
    return dates[0] || '';
  }

  function getProfile(company) { return rowsForCompany('profiles', company)[0] || {}; }
  function openRows(rows) { return rows.filter(row => !['done','resolved','lost','canceled','cancelled','completed'].includes(String(row.status || '').trim().toLowerCase())); }

  function activityRows(company) { return rowsForCompany('activities', company); }
  function reviewRows(company) { return rowsForCompany('reviews', company).sort((a,b) => String(b.review_date || b.created_at || '').localeCompare(String(a.review_date || a.created_at || ''))); }
  function taskRows(company) { return rowsForCompany('tasks', company).sort((a,b) => String(a.due_date || '').localeCompare(String(b.due_date || ''))); }
  function riskRows(company) { return rowsForCompany('risks', company).sort((a,b) => severityRank(b.severity) - severityRank(a.severity)); }
  function qbrRows(company) { return rowsForCompany('qbrs', company).sort((a,b) => String(b.meeting_date || b.created_at || '').localeCompare(String(a.meeting_date || a.created_at || ''))); }
  function mainContactName(row = {}) { return String(row.full_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || row.name || row.contact_name || '').trim(); }
  function contactRows(company) {
    const metadata = rowsForCompany('contacts', company);
    const mainRows = rowsForCompany('mainContacts', company);
    const metaByContactId = new Map();
    const metaByEmail = new Map();
    const metaByName = new Map();
    metadata.forEach(meta => {
      const cid = String(meta.contact_id || '').trim();
      const email = normalize(meta.email || '');
      const name = normalize(meta.contact_name_snapshot || meta.name || '');
      if (cid) metaByContactId.set(cid, meta);
      if (email) metaByEmail.set(email, meta);
      if (name) metaByName.set(name, meta);
    });
    const merged = [];
    const usedMeta = new Set();
    mainRows.forEach(contact => {
      const cid = String(contact.id || contact.contact_id || '').trim();
      const email = normalize(contact.email || '');
      const name = normalize(mainContactName(contact));
      const meta = (cid && metaByContactId.get(cid)) || (email && metaByEmail.get(email)) || (name && metaByName.get(name)) || {};
      if (meta.id) usedMeta.add(String(meta.id));
      merged.push({
        ...meta,
        contact_id: cid || meta.contact_id || '',
        name: mainContactName(contact) || meta.name || meta.contact_name_snapshot || 'Unnamed Contact',
        title: contact.job_title || meta.title || '',
        email: contact.email || meta.email || '',
        phone: contact.phone || contact.mobile || meta.phone || '',
        role: meta.role || contact.decision_role || 'Daily User',
        influence_level: meta.influence_level || 'Medium',
        relationship_status: meta.relationship_status || 'Normal',
        notes: meta.notes || contact.notes || '',
        source: 'Contacts Module'
      });
    });
    metadata.filter(meta => !usedMeta.has(String(meta.id || ''))).forEach(meta => merged.push({ ...meta, name: meta.name || meta.contact_name_snapshot || 'Unnamed Contact', source: 'CS Metadata' }));
    return merged.sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')));
  }
  function onboardingRows(company) { return rowsForCompany('onboarding', company); }
  function agreementRows(company) { return rowsForCompany('agreements', company); }
  function ticketRows(company) { return rowsForCompany('tickets', company); }

  function completionRows(company) { return rowsForCompany('completions', company).map(row => applyCs360LocationNameOverride({ ...row, company_name: row.company_name || row.company_name_snapshot || companyName(company) })).sort((a,b) => String(b.period_end || b.created_at || '').localeCompare(String(a.period_end || a.created_at || ''))); }

  function agreementItemRows(company) {
    const signed = agreementRows(company).filter(isSignedAgreement);
    const keys = new Set();
    signed.forEach(agreement => agreementKeys(agreement).forEach(k => keys.add(k)));
    return (STATE.rows.agreementItems || []).filter(item => {
      const itemCompanyId = String(item.company_id || item.companyId || item.company_uuid || item.client_id || item.customer_id || '').trim();
      if (itemCompanyId && itemCompanyId === companyId(company)) return true;
      const itemName = normalize(item.company_name || item.client_name || item.customer_name || item.customer_legal_name || '');
      if (itemName && itemName === normalize(companyName(company))) return true;
      const itemKeys = [item.agreement_id, item.agreement_uuid, item.parent_id, item.parent_number, item.agreement_number]
        .map(v => String(v || '').trim())
        .filter(Boolean);
      return itemKeys.some(k => keys.has(k));
    });
  }

  function locationNameFromRow(row = {}) {
    return String(row.location_name || row.location || row.branch_name || row.store_name || row.site_name || row.outlet_name || row.locationName || row.branchName || row.site || row.branch || row.store || '').trim();
  }

  function serviceStartFromRow(row = {}) {
    return String(row.service_start_date || row.serviceStartDate || row.start_date || row.startDate || row.agreement_start_date || row.agreementStartDate || row.start || '').slice(0, 10);
  }

  function serviceEndFromRow(row = {}) {
    return String(row.service_end_date || row.serviceEndDate || row.end_date || row.endDate || row.agreement_end_date || row.agreementEndDate || row.end || '').slice(0, 10);
  }

  function timestampFromRow(row = {}) {
    return String(row.updated_at || row.modified_at || row.created_at || row.createdAt || '').trim();
  }

  function rowRankTime(row = {}) {
    const end = serviceEndFromRow(row);
    const start = serviceStartFromRow(row);
    const updated = timestampFromRow(row);
    return [end || '', start || '', updated || ''].join('|');
  }

  function isPseudoAllLocation(value) {
    const key = normalize(value);
    return ['all location','all locations','all branches','all outlets','all stores','all sites'].includes(key);
  }

  function isAnnualSaasItem(row = {}) {
    const text = normalize([row.section, row.section_name, row.category, row.item_type, row.product_type, row.item_name, row.itemName, row.license, row.module_name, row.product_name, row.service_name, row.description].join(' '));
    if (!text) return false;
    if (text.includes('one time') || text.includes('one-time') || text.includes('setup') || text.includes('hardware')) return false;
    return text.includes('annual') || text.includes('saas') || text.includes('license') || text.includes('subscription') || text.includes('basic');
  }

  function isCurrentServiceRow(row = {}) {
    const start = serviceStartFromRow(row);
    const end = serviceEndFromRow(row);
    const today = isoToday();
    if (start && start > today) return false;
    if (end && end < today) return false;
    return true;
  }

  function isActiveInvoice(row = {}) {
    const status = String(row.status || row.invoice_status || row.state || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!status) return true;
    return !['draft','void','voided','cancelled','canceled','failed','error','deleted'].includes(status);
  }

  function invoiceRows(company) { return rowsForCompany('invoices', company); }

  function invoiceKeys(row = {}) {
    return [row.id, row.invoice_id, row.invoice_uuid, row.invoice_no, row.invoice_number, row.number]
      .map(v => String(v || '').trim())
      .filter(Boolean);
  }

  function invoiceItemRows(company) {
    const invoices = invoiceRows(company).filter(isActiveInvoice);
    const keys = new Set();
    invoices.forEach(invoice => invoiceKeys(invoice).forEach(k => keys.add(k)));
    return (STATE.rows.invoiceItems || []).filter(item => {
      const itemCompanyId = String(item.company_id || item.companyId || item.company_uuid || item.client_id || item.customer_id || '').trim();
      if (itemCompanyId && itemCompanyId === companyId(company)) return true;
      const itemName = normalize(item.company_name || item.client_name || item.customer_name || item.customer_legal_name || item.client || '');
      if (itemName && itemName === normalize(companyName(company))) return true;
      const itemKeys = [item.invoice_id, item.invoice_uuid, item.invoice_no, item.invoice_number, item.parent_id, item.parent_number]
        .map(v => String(v || '').trim())
        .filter(Boolean);
      return itemKeys.some(k => keys.has(k));
    });
  }

  function addLatestLocationRow(map, company, row, source) {
    const displayRow = applyCs360LocationNameOverride({ ...row, company_name: companyName(company) });
    const name = locationNameFromRow(displayRow);
    if (!name || isPseudoAllLocation(name)) return;
    const key = normalize(name);
    const candidate = {
      company_id: companyId(company),
      company_name: companyName(company),
      location_name: name,
      service_start_date: serviceStartFromRow(row),
      service_end_date: serviceEndFromRow(row),
      source,
      rank: rowRankTime(row)
    };
    const existing = map.get(key);
    if (!existing || candidate.rank >= existing.rank) map.set(key, candidate);
  }

  function getClientLocationRows(company) {
    const map = new Map();

    // Prefer actual invoiced Annual SaaS location rows because they represent active client locations.
    invoiceItemRows(company)
      .filter(row => isAnnualSaasItem(row) && isCurrentServiceRow(row))
      .forEach(row => addLatestLocationRow(map, company, row, 'Invoice Item'));

    // Fallback to latest signed agreement rows when invoice_items are not available yet.
    if (!map.size) {
      agreementItemRows(company)
        .filter(row => isAnnualSaasItem(row) && isCurrentServiceRow(row))
        .forEach(row => addLatestLocationRow(map, company, row, 'Agreement Item'));
    }

    // Last fallback keeps older data visible, but still removes duplicate/pseudo “All locations”.
    if (!map.size) {
      onboardingRows(company).forEach(row => addLatestLocationRow(map, company, row, 'Onboarding'));
      completionRows(company).forEach(row => addLatestLocationRow(map, company, row, 'Completion History'));
    }

    if (!map.size) map.set(normalize(companyName(company)), { company_id: companyId(company), company_name: companyName(company), location_name: companyName(company), service_start_date: '', service_end_date: '', source: 'Client', rank: '' });
    return Array.from(map.values()).map(applyCs360LocationNameOverride).sort((a,b) => a.location_name.localeCompare(b.location_name));
  }

  function getClientLocations(company) {
    return getClientLocationRows(company).map(row => row.location_name);
  }


  function groupName(row = {}) {
    return String(row.group_name || row.name || row.group_label || 'Unnamed Group').trim();
  }

  function groupId(row = {}) {
    return String(row.id || row.group_id || '').trim();
  }

  function activeGroups() {
    return (STATE.rows.groups || []).filter(group => !['archived','inactive','deleted'].includes(String(group.status || '').trim().toLowerCase()));
  }

  function groupById(id) {
    const gid = String(id || '').trim();
    return activeGroups().find(group => groupId(group) === gid) || null;
  }

  function groupMembershipRows(company) {
    const id = companyId(company);
    return (STATE.rows.groupMembers || []).filter(row => String(row.company_id || '').trim() === id);
  }

  function groupsForCompany(company) {
    return groupMembershipRows(company)
      .map(row => groupById(row.group_id) || { id: row.group_id, group_name: row.group_name_snapshot || row.group_name || 'Unknown Group', status: 'Active' })
      .filter(Boolean)
      .sort((a,b) => groupName(a).localeCompare(groupName(b)));
  }

  function groupLabelForCompany(company) {
    const groups = groupsForCompany(company).map(groupName);
    return groups.length ? groups.join(', ') : 'Ungrouped';
  }

  function groupMemberCompanies(group) {
    const gid = groupId(group);
    const ids = new Set((STATE.rows.groupMembers || []).filter(row => String(row.group_id || '').trim() === gid).map(row => String(row.company_id || '').trim()).filter(Boolean));
    return STATE.rows.companies.filter(company => ids.has(companyId(company))).sort((a,b) => companyName(a).localeCompare(companyName(b)));
  }

  function brandName(row = {}) {
    return String(row.brand_name || row.name || row.brand_label || 'Unnamed Brand').trim();
  }

  function brandId(row = {}) {
    return String(row.id || row.brand_id || '').trim();
  }

  function activeBrands() {
    return (STATE.rows.brands || []).filter(brand => !['archived','inactive','deleted'].includes(String(brand.status || '').trim().toLowerCase()));
  }

  function brandById(id) {
    const bid = String(id || '').trim();
    return activeBrands().find(brand => brandId(brand) === bid) || null;
  }

  function brandScopeLabel(brand = {}) {
    const group = brand.group_id ? groupById(brand.group_id) : null;
    const company = brand.company_id ? STATE.rows.companies.find(c => companyId(c) === String(brand.company_id || '').trim()) : null;
    if (group) return `Group: ${groupName(group)}`;
    if (company) return `Client: ${companyName(company)}`;
    return 'Global CS brand';
  }

  function brandsForCompany(company) {
    const id = companyId(company);
    const groupIds = new Set(groupsForCompany(company).map(groupId));
    return activeBrands().filter(brand => {
      const bid = brandId(brand);
      const direct = String(brand.company_id || '').trim() === id;
      const inGroup = brand.group_id && groupIds.has(String(brand.group_id || '').trim());
      const assigned = (STATE.rows.brandLocations || []).some(row => String(row.brand_id || '').trim() === bid && String(row.company_id || '').trim() === id);
      return direct || inGroup || assigned;
    }).sort((a,b) => brandName(a).localeCompare(brandName(b)));
  }

  function brandsForGroup(group) {
    const gid = groupId(group);
    return activeBrands().filter(brand => String(brand.group_id || '').trim() === gid).sort((a,b) => brandName(a).localeCompare(brandName(b)));
  }

  function activeBrandsForSelect(company = getSelectedCompany()) {
    const ids = new Set(brandsForCompany(company).map(brandId));
    activeBrands().forEach(brand => ids.add(brandId(brand)));
    return activeBrands().filter(brand => ids.has(brandId(brand))).sort((a,b) => brandName(a).localeCompare(brandName(b)));
  }

  function brandLocationRows(brand) {
    const bid = brandId(brand);
    return (STATE.rows.brandLocations || [])
      .filter(row => String(row.brand_id || '').trim() === bid && !['inactive','archived','deleted'].includes(String(row.status || '').trim().toLowerCase()))
      .map(applyCs360LocationNameOverride);
  }

  function brandCompletionTargets(brand) {
    const assigned = brandLocationRows(brand);
    const byKey = new Map();
    assigned.forEach(row => {
      const company = STATE.rows.companies.find(c => companyId(c) === String(row.company_id || '').trim());
      const company_name = row.company_name_snapshot || (company ? companyName(company) : '');
      const location_name = String(row.location_name || '').trim();
      if (!location_name || isPseudoAllLocation(location_name)) return;
      const target = {
        company_id: String(row.company_id || '').trim(),
        company_name,
        location_name,
        service_start_date: row.service_start_date || '',
        service_end_date: row.service_end_date || '',
        brand_id: brandId(brand),
        brand_name: brandName(brand)
      };
      const key = completionTargetKey(target);
      if (!byKey.has(key)) byKey.set(key, target);
    });
    if (!byKey.size) {
      if (brand.group_id) groupCompletionTargets(groupById(brand.group_id) || {}).forEach(target => byKey.set(completionTargetKey(target), { ...target, brand_id: brandId(brand), brand_name: brandName(brand) }));
      else if (brand.company_id) {
        const company = STATE.rows.companies.find(c => companyId(c) === String(brand.company_id || '').trim());
        if (company) currentClientCompletionTargets(company).forEach(target => byKey.set(completionTargetKey(target), { ...target, brand_id: brandId(brand), brand_name: brandName(brand) }));
      }
    }
    return Array.from(byKey.values()).sort((a,b) => `${a.company_name} ${a.location_name}`.localeCompare(`${b.company_name} ${b.location_name}`));
  }

  function brandCompletionRecords(brand) {
    const targets = brandCompletionTargets(brand);
    const keys = new Set(targets.map(completionTargetKey));
    return (STATE.rows.completions || []).filter(row => keys.has([String(row.company_id || '').trim(), normalize(row.location_name)].join('|')));
  }

  function renderGroupFilterOptions() {
    const select = $('csGroupFilter');
    if (!select) return;
    const current = STATE.filters.group || select.value || 'All';
    const options = ['<option value="All">All Groups</option>', '<option value="Ungrouped">Ungrouped</option>']
      .concat(activeGroups().map(group => `<option value="${attr(groupId(group))}">${esc(groupName(group))}</option>`));
    select.innerHTML = options.join('');
    select.value = Array.from(select.options).some(opt => opt.value === current) ? current : 'All';
    STATE.filters.group = select.value;
  }

  function latestCompletionPeriodRows(company) {
    const rows = completionRows(company);
    if (!rows.length) return [];
    const key = row => [row.review_type || 'weekly', String(row.period_start || '').slice(0,10), String(row.period_end || '').slice(0,10)].join('|');
    const latestKey = key(rows[0]);
    return rows.filter(row => key(row) === latestKey);
  }

  function aggregateCompletionRows(rows) {
    const byLocation = new Map();
    rows.map(applyCs360LocationNameOverride).forEach(row => {
      const name = locationNameFromRow(row) || 'Unknown Location';
      const key = normalize(name);
      if (!byLocation.has(key)) byLocation.set(key, { location_name: name, done_on_time: 0, done_late: 0, partially_done: 0, missed: 0, review_type: row.review_type, period_start: row.period_start, period_end: row.period_end });
      const acc = byLocation.get(key);
      acc.done_on_time += safeNumber(row.done_on_time);
      acc.done_late += safeNumber(row.done_late);
      acc.partially_done += safeNumber(row.partially_done);
      acc.missed += safeNumber(row.missed);
    });
    return Array.from(byLocation.values()).sort((a,b) => a.location_name.localeCompare(b.location_name));
  }

  function completionTotal(row) {
    return safeDecimal(row.done_on_time) + safeDecimal(row.done_late) + safeDecimal(row.partially_done) + safeDecimal(row.missed);
  }

  function completionCount(row) {
    return clamp(safeDecimal(row.done_on_time) + safeDecimal(row.done_late), 0, 100);
  }

  function formatPct(value) {
    return `${clamp(safeDecimal(value), 0, 100).toFixed(2)}%`;
  }

  function countPct(count, total) {
    const c = Math.max(0, safeDecimal(count));
    const t = Math.max(0, safeDecimal(total));
    return t ? `${c.toFixed(2)}%` : `${c.toFixed(2)}%`;
  }

  function averageCompletionMetrics(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return { done_on_time: 0, done_late: 0, partially_done: 0, missed: 0, completion: 0, row_count: 0 };
    const acc = list.reduce((sum, row) => {
      sum.done_on_time += clamp(safeDecimal(row.done_on_time), 0, 100);
      sum.done_late += clamp(safeDecimal(row.done_late), 0, 100);
      sum.partially_done += clamp(safeDecimal(row.partially_done), 0, 100);
      sum.missed += clamp(safeDecimal(row.missed), 0, 100);
      return sum;
    }, { done_on_time: 0, done_late: 0, partially_done: 0, missed: 0 });
    const rowCount = list.length || 1;
    const done_on_time = acc.done_on_time / rowCount;
    const done_late = acc.done_late / rowCount;
    const partially_done = acc.partially_done / rowCount;
    const missed = acc.missed / rowCount;
    return {
      done_on_time,
      done_late,
      partially_done,
      missed,
      completion: clamp(done_on_time + done_late, 0, 100),
      row_count: list.length
    };
  }

  function completionRowIsValid(row) {
    return completionTotal(row) <= 100.0001;
  }

  function severityRank(value) { return { Critical:4, High:3, Medium:2, Low:1 }[String(value || '')] || 0; }

  function reviewMissing(company, type) {
    const today = new Date();
    let start;
    if (type === 'weekly') {
      const day = today.getDay();
      const diff = (day + 6) % 7;
      start = new Date(today); start.setDate(today.getDate() - diff);
    } else {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    }
    const startIso = start.toISOString().slice(0, 10);
    return !reviewRows(company).some(r => r.review_type === type && String(r.review_period_start || '').slice(0,10) >= startIso && ['completed','needs follow-up','escalated'].includes(String(r.status || '').toLowerCase()));
  }

  function computeHealth(company) {
    const profile = getProfile(company);
    if (profile.health_score_override !== null && profile.health_score_override !== undefined && profile.health_score_override !== '') {
      return clamp(safeNumber(profile.health_score_override, 0), 0, 100);
    }
    let score = 100;
    const reviews = reviewRows(company);
    const latestReview = reviews[0] || {};
    const latestActivity = latestDate(activityRows(company), ['timestamp', 'created_at', 'updated_at']);
    const daysNoActivity = latestActivity ? daysBetween(latestActivity) : null;
    const risks = openRows(riskRows(company));
    const tasks = openRows(taskRows(company));
    const tickets = openRows(ticketRows(company));
    const latestCompletions = aggregateCompletionRows(latestCompletionPeriodRows(company));
    const onboarding = onboardingRows(company);
    const nextRenewal = firstFutureDate(agreementRows(company), ['service_end_date', 'end_date', 'serviceEndDate', 'agreement_end_date']);

    if (!reviews.length) score -= 18;
    else {
      score += satisfactionImpact(latestReview.satisfaction_level);
      score += effortImpact(latestReview.cs_effort_level);
      if (safeNumber(latestReview.review_completion_percent, 0) < 70) score -= 12;
      if (latestReview.escalation_required) score -= 15;
    }
    if (daysNoActivity === null) score -= 12;
    else if (daysNoActivity > 30) score -= 18;
    else if (daysNoActivity > 14) score -= 8;
    if (latestCompletions.length) {
      const completionRate = averageCompletionMetrics(latestCompletions).completion;
      if (completionRate < 50) score -= 15;
      else if (completionRate < 75) score -= 8;
    }
    risks.forEach(r => { score -= { Critical:25, High:15, Medium:8, Low:3 }[r.severity] || 5; });
    tasks.filter(t => t.due_date && t.due_date < isoToday() && !['Done','Canceled'].includes(t.status)).forEach(() => { score -= 4; });
    tickets.forEach(t => { score -= String(t.priority || '').toLowerCase().includes('high') ? 5 : 2; });
    if (onboarding.some(o => String(o.status || o.setup_status || o.training_status || '').toLowerCase().includes('block'))) score -= 12;
    if (nextRenewal) {
      const daysToRenewal = daysBetween(isoToday(), nextRenewal) * -1;
      if (daysToRenewal <= 60 && !reviews.some(r => /renew/i.test(String(r.summary || r.next_action || '')))) score -= 8;
    }
    if (profile.manual_sentiment) score += satisfactionImpact(profile.manual_sentiment) / 2;
    return clamp(Math.round(score), 0, 100);
  }

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function satisfactionImpact(value) { return ({ 'Very Satisfied': 10, Satisfied: 5, Neutral: 0, Unsatisfied: -15, Critical: -25, Unknown: -5 }[String(value || 'Unknown')] ?? -5); }
  function effortImpact(value) { return ({ 'Normal Care': 4, 'Needs Attention': -5, 'High Touch': -12, 'Recovery Required': -25 }[String(value || 'Normal Care')] || 0); }
  function healthLabel(score) { if (score >= 80) return 'Healthy'; if (score >= 60) return 'Watch'; if (score >= 40) return 'At Risk'; return 'Critical'; }
  function healthChip(score) { const label = healthLabel(score); return `<span class="cs-chip ${score >= 80 ? 'cs-chip--healthy' : score >= 60 ? 'cs-chip--watch' : score >= 40 ? 'cs-chip--risk' : 'cs-chip--critical'}">${label} · ${score}</span>`; }

  function computeEffort(company) {
    const latest = reviewRows(company)[0] || {};
    if (latest.cs_effort_level) return latest.cs_effort_level;
    const score = computeHealth(company);
    if (score < 40) return 'Recovery Required';
    if (score < 60) return 'High Touch';
    if (score < 80) return 'Needs Attention';
    return 'Normal Care';
  }

  function calculateCompletion(form) {
    const fd = new FormData(form);
    let score = 100;
    const required = ['client_status','satisfaction_level','adoption_level','relationship_status','summary'];
    required.forEach(key => { if (!String(fd.get(key) || '').trim()) score -= key === 'summary' ? 10 : 12; });
    const answers = Array.from(form.querySelectorAll('[data-review-answer]'));
    const answered = answers.filter(el => String(el.value || '').trim()).length;
    if (answers.length) score -= Math.round(((answers.length - answered) / answers.length) * 20);
    const hasIssue = answers.some(el => ['unresolved_issues','training_needed','relationship_risk','extra_effort_needed','escalation_needed'].includes(el.dataset.questionKey) && el.value === 'Yes');
    if (hasIssue && !String(fd.get('next_action') || '').trim()) score -= 18;
    if ((hasIssue || fd.get('extra_cs_effort_needed') === 'true' || fd.get('escalation_required') === 'true') && !String(fd.get('next_follow_up_date') || '').trim()) score -= 18;
    return clamp(score, 0, 100);
  }

  async function fetchTable(name, select = '*', order = { column: 'created_at', ascending: false }, limit = 1000) {
    const client = supabase();
    if (!client) return [];

    const maxRows = Math.max(1, Number(limit) || 1000);
    const pageSize = Math.min(1000, maxRows);
    const rows = [];

    try {
      for (let offset = 0; offset < maxRows; offset += pageSize) {
        const end = Math.min(offset + pageSize - 1, maxRows - 1);
        let query = client.from(name).select(select).range(offset, end);
        if (order?.column) query = query.order(order.column, { ascending: Boolean(order.ascending) });

        const { data, error } = await withCsTimeout(query, 20000, `Loading ${name}`);
        if (error) throw error;

        const page = Array.isArray(data) ? data : [];
        rows.push(...page);
        if (page.length < (end - offset + 1)) break;
      }
      return rows;
    } catch (error) {
      console.warn(`[ClientSuccess360] unable to load ${name}`, error);
      if (/does not exist|schema cache|Could not find|PGRST/i.test(String(error?.message || ''))) STATE.tablesMissing.add(name);
      return rows;
    }
  }

  async function loadSpecialCaseTemplates({ force = false } = {}) {
    if (!force && Array.isArray(STATE.rows.specialTemplates) && STATE.rows.specialTemplates.length) {
      return STATE.rows.specialTemplates;
    }
    const [specialTemplates, specialGroups, specialBrands, specialLocations] = await Promise.all([
      fetchTable(TABLES.specialTemplates, '*', { column: 'updated_at', ascending: false }, 1000),
      fetchTable(TABLES.specialGroups, '*', { column: 'sort_order', ascending: true }, 3000),
      fetchTable(TABLES.specialBrands, '*', { column: 'sort_order', ascending: true }, 3000),
      fetchTable(TABLES.specialLocations, '*', { column: 'sort_order', ascending: true }, 5000)
    ]);
    STATE.rows.specialTemplates = specialTemplates;
    STATE.rows.specialGroups = specialGroups;
    STATE.rows.specialBrands = specialBrands;
    STATE.rows.specialLocations = specialLocations;
    console.info('[CS360 Special Clients] loaded templates', specialTemplates);
    return specialTemplates;
  }

  async function openSpecialCaseTemplates() {
    console.info('[CS360 Special Clients] open clicked');
    await loadSpecialCaseTemplates({ force: true });
    const special = specialTemplateById(STATE.selectedSpecialClientId) || activeSpecialTemplates()[0] || null;
    if (!special) {
      openSpecialTemplateForm('');
      return;
    }
    selectSpecialClient(specialTemplateId(special));
  }

  async function loadData() {
    if (!canAccess()) { renderAccessDenied(); return; }
    STATE.loading = true;
    renderLoading();
    STATE.tablesMissing.clear();
    const client = supabase();
    if (!client) { renderError('Supabase client is not available.'); return; }

    const [allCompanies, clientRows, profiles, reviews, tasks, risks, qbrs, contacts, mainContacts, activities, onboarding, agreements, agreementItems, invoices, invoiceItems, completions, tickets, groups, groupMembers, brands, brandLocations, specialTemplates, specialGroups, specialBrands, specialLocations, templateQuestions] = await Promise.all([
      fetchTable('companies', '*', { column: 'company_name', ascending: true }, 10000),
      fetchTable('clients', '*', { column: 'updated_at', ascending: false }, 10000),
      fetchTable(TABLES.profiles),
      fetchTable(TABLES.reviews),
      fetchTable(TABLES.tasks),
      fetchTable(TABLES.risks),
      fetchTable(TABLES.qbrs),
      fetchTable(TABLES.contacts),
      fetchTable('contacts', '*', { column: 'created_at', ascending: false }, 3000),
      fetchTable('csm_activities', '*', { column: 'created_at', ascending: false }, 1500),
      fetchTable('operations_onboarding', '*', { column: 'created_at', ascending: false }, 1500),
      fetchTable('agreements', '*', { column: 'created_at', ascending: false }, 10000),
      fetchTable('agreement_items', '*', { column: 'created_at', ascending: false }, 20000),
      fetchTable('invoices', '*', { column: 'created_at', ascending: false }, 10000),
      fetchTable('invoice_items', '*', { column: 'created_at', ascending: false }, 20000),
      fetchTable(TABLES.completions, '*', { column: 'period_end', ascending: false }, 20000),
      fetchTable('tickets', '*', { column: 'created_at', ascending: false }, 1500),
      fetchTable(TABLES.groups, '*', { column: 'group_name', ascending: true }, 1000),
      fetchTable(TABLES.groupMembers, '*', { column: 'created_at', ascending: false }, 3000),
      fetchTable(TABLES.brands, '*', { column: 'brand_name', ascending: true }, 1000),
      fetchTable(TABLES.brandLocations, '*', { column: 'created_at', ascending: false }, 5000),
      fetchTable(TABLES.specialTemplates, '*', { column: 'updated_at', ascending: false }, 1000),
      fetchTable(TABLES.specialGroups, '*', { column: 'sort_order', ascending: true }, 3000),
      fetchTable(TABLES.specialBrands, '*', { column: 'sort_order', ascending: true }, 3000),
      fetchTable(TABLES.specialLocations, '*', { column: 'sort_order', ascending: true }, 5000),
      fetchTable(TABLES.templateQuestions, '*, cs_review_templates(review_type)', { column: 'sort_order', ascending: true }, 200)
    ]);

    const companies = buildCs360ClientCompanies(allCompanies, clientRows, agreements, invoices);
    const completionsForDisplay = completions.map(applyCs360LocationNameOverride);
    const brandLocationsForDisplay = brandLocations.map(applyCs360LocationNameOverride);
    const specialLocationsForDisplay = specialLocations.map(applyCs360LocationNameOverride);
    STATE.rows = { companies, allCompanies, clients: clientRows, profiles, reviews, tasks, risks, qbrs, contacts, mainContacts, activities, onboarding, agreements, agreementItems, invoices, invoiceItems, completions: completionsForDisplay, tickets, groups, groupMembers, brands, brandLocations: brandLocationsForDisplay, specialTemplates, specialGroups, specialBrands, specialLocations: specialLocationsForDisplay };
    STATE.templateQuestions.weekly = templateQuestions.filter(q => q.cs_review_templates?.review_type === 'weekly').map(q => [q.question_key, q.question_label]);
    STATE.templateQuestions.monthly = templateQuestions.filter(q => q.cs_review_templates?.review_type === 'monthly').map(q => [q.question_key, q.question_label]);
    if (!STATE.templateQuestions.weekly.length) STATE.templateQuestions.weekly = QUESTION_BANK.weekly;
    if (!STATE.templateQuestions.monthly.length) STATE.templateQuestions.monthly = QUESTION_BANK.monthly;
    if (!STATE.selectedCompanyId && companies.length) STATE.selectedCompanyId = companyId(companies[0]);
    if (STATE.selectedEntityType === 'special') {
      const selectedSpecial = specialTemplateById(STATE.selectedSpecialClientId) || activeSpecialTemplates()[0] || null;
      if (selectedSpecial) STATE.selectedSpecialClientId = specialTemplateId(selectedSpecial);
      else STATE.selectedEntityType = 'normal';
    }
    if (!companies.length && activeSpecialTemplates().length) {
      STATE.selectedEntityType = 'special';
      STATE.selectedSpecialClientId = specialTemplateId(activeSpecialTemplates()[0]);
    }
    STATE.loading = false;
    render();
  }

  function mount() {
    const root = $('clientSuccessRoot');
    if (!root) return;
    if (STATE.booted) return;
    STATE.booted = true;
    root.className = `client-success-root ${canWrite() ? 'is-write-access' : 'is-readonly'}`;
    root.innerHTML = `
      <div class="cs-page-header cs-hero-header">
        <div class="cs-hero-copy">
          <span class="cs-eyebrow">Customer Success</span>
          <h2>Client Success 360</h2>
          <p>Monitor all registered clients and standalone Special CS Clients, location completion, satisfaction, weekly/monthly pulse reviews, risks, tasks, renewals, QBRs, contacts, and activity. No payment, invoice, receipt, collection, or accounting data is used.</p>
        </div>
        <div class="cs-header-actions">
          <span class="cs-admin-chip">${esc(accessLabel())}</span>
          <button id="csRefreshBtn" class="btn ghost sm" type="button">Refresh</button>
          <button id="csAddCompletionBtn" data-cs-write-action class="btn sm primary" type="button">+ Location Completion</button>
          <button id="csSpecialTemplatesBtn" class="btn ghost sm" type="button" data-cs-action="special-clients-open">Special CS Clients</button>
          <button class="btn sm primary" type="button" data-cs-action="special-client-create">Add Special CS Client</button>
          <button id="csAddGroupBtn" data-cs-write-action class="btn ghost sm" type="button">+ Client Group</button>
          <button id="csAddGroupMemberBtn" data-cs-write-action class="btn ghost sm" type="button">+ Add to Group</button>
          <button id="csAddBrandBtn" data-cs-write-action class="btn ghost sm" type="button">+ Brand</button>
          <button id="csAddBrandLocationBtn" data-cs-write-action class="btn ghost sm" type="button">+ Brand Location</button>
          <button id="csAddReviewBtn" data-cs-write-action class="btn ghost sm" type="button">+ Pulse Review</button>
          <button id="csAddTaskBtn" data-cs-write-action class="btn ghost sm" type="button">+ Task</button>
          <button id="csAddRiskBtn" data-cs-write-action class="btn ghost sm" type="button">+ Risk</button>
          <button id="csAddQbrBtn" data-cs-write-action class="btn ghost sm" type="button">+ QBR</button>
          <button id="csAddContactBtn" data-cs-write-action class="btn ghost sm" type="button">+ Contact</button>
        </div>
      </div>
      <div id="csState" class="cs-state">Loading Client Success 360…</div>
      <div id="csKpis" class="cs-kpi-grid cs-kpi-grid--modern"></div>
      <div id="csDashboard" class="cs-dashboard"></div>
      <div class="cs-layout">
        <aside class="cs-sidebar">
          <div class="cs-filter-grid">
            <input id="csSearch" class="input" type="search" placeholder="Search client, city, CSM…" />
            <select id="csStatusFilter" class="select"><option>All</option><option>Onboarding</option><option>Live</option><option>Watch</option><option>At Risk</option><option>Suspended</option><option>Churned</option></select>
            <select id="csHealthFilter" class="select"><option>All</option><option>Healthy</option><option>Watch</option><option>At Risk</option><option>Critical</option></select>
            <select id="csEffortFilter" class="select"><option>All</option><option>Normal Care</option><option>Needs Attention</option><option>High Touch</option><option>Recovery Required</option></select>
            <select id="csGroupFilter" class="select"><option value="All">All Groups</option></select>
          </div>
          <div id="csClientList" class="cs-list"></div>
        </aside>
        <section id="csClientDetail" class="cs-detail"></section>
      </div>
      <div id="csModal" class="cs-modal" role="dialog" aria-modal="true" aria-hidden="true">
        <div class="cs-modal-card">
          <div class="cs-modal-head"><h3 id="csModalTitle">Client Success</h3><button id="csModalClose" class="btn ghost sm" type="button">✕</button></div>
          <div id="csModalBody"></div>
        </div>
      </div>`;
    wire();
  }

  function wire() {
    const writeAction = handler => () => { if (!canCreate()) { toast('No Customer Success create permission for your role.'); return; } handler(); };
    $('csRefreshBtn')?.addEventListener('click', () => loadData());
    $('csAddCompletionBtn')?.addEventListener('click', writeAction(() => {
      openCompletionForm(STATE.selectedEntityType === 'special' ? STATE.selectedSpecialClientId : '');
    }));
    $('csAddGroupBtn')?.addEventListener('click', writeAction(openGroupForm));
    $('csAddGroupMemberBtn')?.addEventListener('click', writeAction(openGroupMemberForm));
    $('csAddBrandBtn')?.addEventListener('click', writeAction(openBrandForm));
    $('csAddBrandLocationBtn')?.addEventListener('click', writeAction(openBrandLocationForm));
    $('csAddReviewBtn')?.addEventListener('click', writeAction(openReviewForm));
    $('csAddTaskBtn')?.addEventListener('click', writeAction(openTaskForm));
    $('csAddRiskBtn')?.addEventListener('click', writeAction(openRiskForm));
    $('csAddQbrBtn')?.addEventListener('click', writeAction(openQbrForm));
    $('csAddContactBtn')?.addEventListener('click', writeAction(openContactForm));
    $('csModalClose')?.addEventListener('click', closeModal);
    $('csModal')?.addEventListener('click', ev => { if (ev.target?.id === 'csModal') closeModal(); });
    document.addEventListener('input', ev => { const action = ev.target?.getAttribute?.('data-cs-action'); if (action === 'client-select-search') updateClientSelectSearch(ev.target.value || ''); if (action === 'special-client-select-search') updateSpecialClientSelectSearch(ev.target.value || ''); });
    document.addEventListener('change', ev => { const action = ev.target?.getAttribute?.('data-cs-action'); if (action === 'client-select-page-size') { STATE.clientSelectPagination.pageSize = Number(ev.target.value) || 25; STATE.clientSelectPagination.page = 1; renderClientList(); refreshClientSelectFields(); } if (action === 'special-client-select-page-size') { STATE.specialClientSelectPagination.pageSize = Number(ev.target.value) || 25; STATE.specialClientSelectPagination.page = 1; refreshSpecialClientSelectFields(); } if (action === 'client-select-value') { STATE.selectedCompanyId = ev.target.value || ''; const form = ev.target.closest('form'); const hidden = form?.querySelector('input[name="company_id"]'); if (hidden) hidden.value = STATE.selectedCompanyId; if (form?.id === 'csCompletionForm') rebuildCompletionRows(form); renderDetail(); } });
    ['csSearch','csStatusFilter','csHealthFilter','csEffortFilter','csGroupFilter'].forEach(id => $(id)?.addEventListener('input', () => {
      STATE.filters.search = $('csSearch')?.value || '';
      STATE.filters.status = $('csStatusFilter')?.value || 'All';
      STATE.filters.health = $('csHealthFilter')?.value || 'All';
      STATE.filters.effort = $('csEffortFilter')?.value || 'All';
      STATE.filters.group = $('csGroupFilter')?.value || 'All';
      renderClientList();
    }));
  }

  function renderAccessDenied() {
    mount();
    const root = $('clientSuccessRoot');
    if (!root) return;
    root.innerHTML = `<div class="cs-page-header"><div><span class="cs-eyebrow">Customer Success</span><h2>Client Success 360</h2><p class="cs-danger">Access denied. This module is controlled from Roles & Permissions. Enable client_success view/list/get/export for roles that should open it.</p></div></div>`;
  }

  function renderLoading() { $('csState') && ($('csState').textContent = 'Loading Client Success data…'); }
  function renderError(msg) { $('csState') && ($('csState').innerHTML = `<span class="cs-danger">${esc(msg)}</span>`); }

  function getFilteredCompanies() {
    const q = normalize(STATE.filters.search);
    return STATE.rows.companies.filter(company => {
      const profile = getProfile(company);
      const score = computeHealth(company);
      const health = healthLabel(score);
      const effort = computeEffort(company);
      const status = profile.client_status || mapCompanyStatus(company.company_status) || 'Live';
      const hay = normalize([companyName(company), company.company_id, company.city, company.country, profile.assigned_csm_name, profile.lifecycle_stage].join(' '));
      if (q && !hay.includes(q)) return false;
      if (STATE.filters.status !== 'All' && status !== STATE.filters.status) return false;
      if (STATE.filters.health !== 'All' && health !== STATE.filters.health) return false;
      if (STATE.filters.effort !== 'All' && effort !== STATE.filters.effort) return false;
      if (STATE.filters.group === 'Ungrouped' && groupsForCompany(company).length) return false;
      if (STATE.filters.group && !['All','Ungrouped'].includes(STATE.filters.group) && !groupMembershipRows(company).some(row => String(row.group_id || '').trim() === STATE.filters.group)) return false;
      return true;
    });
  }

  function mapCompanyStatus(value) {
    const s = String(value || '').toLowerCase();
    if (s.includes('onboard')) return 'Onboarding';
    if (s.includes('active') || s.includes('signed') || s.includes('client')) return 'Live';
    return 'Live';
  }

  function render() {
    if (!canAccess()) { renderAccessDenied(); return; }
    renderGroupFilterOptions();
    renderKpis();
    renderDashboard();
    renderClientList();
    renderDetail();
    const missing = Array.from(STATE.tablesMissing).filter(t => Object.values(TABLES).includes(t));
    const stateText = missing.length
      ? `Run SQL migration first. Missing CS tables: ${missing.join(', ')}`
      : `${STATE.rows.companies.length} normal clients · ${activeSpecialTemplates().length} standalone Special CS Clients loaded`;
    $('csState') && ($('csState').textContent = stateText);
  }

  function renderKpis() {
    const companies = STATE.rows.companies;
    const healthScores = companies.map(c => computeHealth(c));
    const atRisk = healthScores.filter(s => s < 60).length;
    const weeklyMissing = companies.filter(c => reviewMissing(c, 'weekly')).length;
    const latestCompletionRows = companies.flatMap(c => aggregateCompletionRows(latestCompletionPeriodRows(c)));
    const completionRate = averageCompletionMetrics(latestCompletionRows).completion;
    const openRisks = openRows(STATE.rows.risks).length;
    const items = [
      { label: 'Normal Clients', value: companies.length, sub: 'Clients registry + commercial clients', icon: '👥', tone: 'blue' },
      { label: 'Client Groups', value: activeGroups().length, sub: `${activeBrands().length} brand layer${activeBrands().length === 1 ? '' : 's'}`, icon: '🔗', tone: 'blue' },
      { label: 'Clients at Risk', value: atRisk, sub: atRisk ? 'needs action' : 'no critical action', icon: '⚠', tone: atRisk ? 'warn' : 'green' },
      { label: 'Weekly Reviews Missing', value: weeklyMissing, sub: 'current week', icon: '📅', tone: weeklyMissing ? 'red' : 'green' },
      { label: 'Location Completion', value: `${completionRate.toFixed(0)}%`, sub: 'Done On-Time + Done Late', icon: '✓', tone: 'green' },
      { label: 'Open Risks', value: openRisks, sub: openRisks ? 'open / escalated' : 'no change', icon: '🛡', tone: openRisks ? 'red' : 'green' }
    ];
    const toneClass = tone => `cs-kpi-card--${tone || 'blue'}`;
    $('csKpis').innerHTML = items.map(item => `<article class="cs-kpi-card ${toneClass(item.tone)}"><div class="cs-kpi-icon">${esc(item.icon)}</div><div class="cs-kpi-label">${esc(item.label)}</div><div class="cs-kpi-value">${esc(item.value)}</div><div class="cs-kpi-sub">${esc(item.sub)}</div></article>`).join('');
  }

  function renderDashboard() {
    const root = $('csDashboard');
    if (!root) return;
    const companies = STATE.rows.companies;
    const latestRows = companies.flatMap(c => aggregateCompletionRows(latestCompletionPeriodRows(c)));
    const stats = averageCompletionMetrics(latestRows);
    const openRisks = openRows(STATE.rows.risks).length;
    const atRisk = companies.filter(c => computeHealth(c) < 60).length;
    const weeklyMissing = companies.filter(c => reviewMissing(c, 'weekly')).length;
    const best = latestRows.length ? latestRows.slice().sort((a,b) => completionCount(b) - completionCount(a))[0] : null;
    const weak = latestRows.slice().filter(row => completionCount(row) < 80).sort((a,b) => completionCount(a) - completionCount(b)).slice(0, 3);

    const normalizePct = value => clamp(safeDecimal(value), 0, 100);
    const segment = (label, value, className) => {
      const width = normalizePct(value);
      return `<span class="cs-breakdown-seg ${className}" style="width:${width.toFixed(2)}%"><b>${width >= 8 ? `${width.toFixed(2)}%` : ''}</b><em>${esc(label)}</em></span>`;
    };

    const trendMap = new Map();
    STATE.rows.completions.forEach(row => {
      const key = String(row.period_end || row.period_start || '').slice(0, 10);
      if (!key) return;
      if (!trendMap.has(key)) trendMap.set(key, []);
      trendMap.get(key).push(row);
    });
    const trendEntries = Array.from(trendMap.entries()).sort((a,b) => a[0].localeCompare(b[0])).slice(-6);
    const trendValues = trendEntries.map(([, rows]) => averageCompletionMetrics(aggregateCompletionRows(rows)).completion);
    const spark = (() => {
      if (!trendValues.length) return '<div class="cs-empty cs-mini-empty">No trend data yet</div>';
      const w = 460, h = 130, pad = 18;
      const denom = Math.max(1, trendValues.length - 1);
      const points = trendValues.map((v, i) => {
        const x = pad + (i * (w - pad * 2) / denom);
        const y = h - pad - (normalizePct(v) * (h - pad * 2) / 100);
        return [x, y];
      });
      const d = points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
      const circles = points.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4"><title>${esc(trendEntries[i]?.[0] || '')}: ${trendValues[i].toFixed(2)}%</title></circle>`).join('');
      const labels = trendEntries.map(([date], i) => {
        const x = pad + (i * (w - pad * 2) / denom);
        return `<text x="${x.toFixed(1)}" y="${h - 2}" text-anchor="middle">${esc(fmtDate(date).replace(/,.*$/, ''))}</text>`;
      }).join('');
      return `<svg class="cs-trend-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Average completion trend"><line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" class="axis"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h-pad}" class="axis"/><path d="${d}" class="line"/><g class="points">${circles}</g><g class="labels">${labels}</g></svg>`;
    })();

    const donutStyle = `background: conic-gradient(var(--cs-good) 0 ${normalizePct(stats.done_on_time).toFixed(2)}%, var(--cs-blue-accent) ${normalizePct(stats.done_on_time).toFixed(2)}% ${normalizePct(stats.done_on_time + stats.done_late).toFixed(2)}%, var(--cs-orange) ${normalizePct(stats.done_on_time + stats.done_late).toFixed(2)}% ${normalizePct(stats.done_on_time + stats.done_late + stats.partially_done).toFixed(2)}%, var(--cs-red) ${normalizePct(stats.done_on_time + stats.done_late + stats.partially_done).toFixed(2)}% 100%);`;

    const quickRows = [
      ['New Group Completion', 'completion'],
      ['New Brand Layer', 'brand'],
      ['New Weekly Review', 'review'],
      ['Add Extra CS Effort', 'task'],
      ['Add Risk', 'risk'],
      ['Schedule QBR', 'qbr']
    ];

    root.innerHTML = `
      <div class="cs-dashboard-top">
        <section class="cs-analytics-card cs-analytics-card--wide">
          <div class="cs-section-title"><h4>Completion Breakdown <small>(Percentages)</small></h4><span>Completion = Done On-Time + Done Late</span></div>
          <div class="cs-breakdown-stack">
            ${segment('Done On-Time', stats.done_on_time, 'done')}
            ${segment('Done Late', stats.done_late, 'late')}
            ${segment('Partially Done', stats.partially_done, 'partial')}
            ${segment('Missed', stats.missed, 'missed')}
          </div>
          <div class="cs-breakdown-axis"><span>0%</span><span>20%</span><span>40%</span><span>60%</span><span>80%</span><span>100%</span></div>
          <div class="cs-breakdown-legend"><span><i class="done"></i>Done On-Time</span><span><i class="late"></i>Done Late</span><span><i class="partial"></i>Partially Done</span><span><i class="missed"></i>Missed</span></div>
        </section>
        <section class="cs-analytics-card">
          <div class="cs-section-title"><h4>Average Completion Trend</h4><span>last periods</span></div>
          ${spark}
        </section>
        <section class="cs-analytics-card cs-status-card">
          <div class="cs-section-title"><h4>Completion by Status</h4><span>${latestRows.length} locations</span></div>
          <div class="cs-donut-mini" style="${donutStyle}"><strong>${stats.completion.toFixed(0)}%</strong><span>Completion</span></div>
          <div class="cs-status-lines">
            <div><i class="done"></i><span>Done On-Time</span><b>${stats.done_on_time.toFixed(2)}%</b></div>
            <div><i class="late"></i><span>Done Late</span><b>${stats.done_late.toFixed(2)}%</b></div>
            <div><i class="partial"></i><span>Partially Done</span><b>${stats.partially_done.toFixed(2)}%</b></div>
            <div><i class="missed"></i><span>Missed</span><b>${stats.missed.toFixed(2)}%</b></div>
          </div>
        </section>
        <aside class="cs-analytics-card cs-insights-card">
          <div class="cs-section-title"><h4>Insights</h4><span>CS signals</span></div>
          <div class="cs-insight-row good"><b>Great job!</b><span>${best ? `${esc(best.location_name)} leads completion at ${formatPct(completionCount(best))}.` : 'Add completion rows to start insights.'}</span></div>
          <div class="cs-insight-row warn"><b>Reviews missed</b><span>${weeklyMissing} weekly review${weeklyMissing === 1 ? '' : 's'} not completed.</span></div>
          <div class="cs-insight-row danger"><b>Clients at risk</b><span>${atRisk} client${atRisk === 1 ? '' : 's'} at risk. ${openRisks} open risk${openRisks === 1 ? '' : 's'}.</span></div>
          <button class="btn ghost sm cs-full-width" type="button" data-cs-action="completion-export">View / Export Report</button>
        </aside>
      </div>
      <div class="cs-dashboard-bottom">
        <section class="cs-analytics-card cs-table-preview">
          <div class="cs-section-title"><h4>Client / Group Overview</h4><span>latest active rows</span></div>
          <div class="cs-compact-table-wrap">
            <table class="cs-compact-table">
              <thead><tr><th>Client / Group</th><th>Locations</th><th>Completion</th><th>Status</th><th>Risk</th></tr></thead>
              <tbody>${companies.slice(0, 6).map(company => {
                const groups = groupsForCompany(company).map(g => g.group_name).join(', ') || 'Ungrouped';
                const rows = aggregateCompletionRows(latestCompletionPeriodRows(company));
                const metrics = averageCompletionMetrics(rows);
                const score = computeHealth(company);
                return `<tr><td><strong>${esc(companyName(company))}</strong><small>${esc(groups)}</small></td><td>${rows.length || '—'}</td><td><b>${metrics.completion.toFixed(0)}%</b></td><td>${esc(getProfile(company).client_status || mapCompanyStatus(company.company_status))}</td><td class="${score < 60 ? 'danger' : 'good'}">${score < 60 ? 'Yes' : 'No'}</td></tr>`;
              }).join('')}</tbody>
            </table>
          </div>
        </section>
        <aside class="cs-analytics-card cs-quick-card">
          <div class="cs-section-title"><h4>Quick Actions</h4><span>CS flow</span></div>
          ${quickRows.map(([label, action]) => `<button type="button" data-cs-action="${attr(action)}"><span>＋</span>${esc(label)}</button>`).join('')}
          <div class="cs-mini-note">${weak.length ? `Operational attention: ${weak.map(r => esc(r.location_name)).join(', ')}` : 'No locations needing operational attention for the latest period.'}</div>
        </aside>
      </div>`;
  }



  function csClientSearchText(company = {}) {
    const groups = groupsForCompany(company).map(groupName).join(' ');
    const brands = activeBrandsForSelect(company).map(brand => [brandName(brand), brandScopeLabel(brand)].join(' ')).join(' ');
    const locations = currentClientCompletionTargets(company).map(row => row.location_name).join(' ');
    return [companyName(company), company.company_name, company.client_name, company.company_id, groups, brands, locations].join(' ');
  }

  function getFilteredCsClients(search = '') {
    const q = normalize(search);
    return (STATE.rows.companies || []).slice()
      .filter(company => !q || normalize(csClientSearchText(company)).includes(q))
      .sort((a, b) => companyName(a).localeCompare(companyName(b)));
  }

  function clampCsPage(page, totalPages) {
    return Math.max(1, Math.min(Math.max(1, Number(totalPages) || 1), Number(page) || 1));
  }

  function getPaginatedCsClients(search = '', page = 1, pageSize = 25) {
    const all = getFilteredCsClients(search);
    const size = [25, 50, 100].includes(Number(pageSize)) ? Number(pageSize) : 25;
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / size));
    const safePage = clampCsPage(page, totalPages);
    return { rows: all.slice((safePage - 1) * size, safePage * size), total, page: safePage, pageSize: size, totalPages };
  }

  function getFilteredSpecialCsClients(search = '') {
    const q = normalize(search);
    return activeSpecialTemplates().slice()
      .filter(t => !q || normalize([
        t.client_name, specialTemplateName(t),
        specialGroupsForTemplate(specialTemplateId(t)).map(groupName).join(' '),
        specialBrandsForTemplate(specialTemplateId(t)).map(brandName).join(' '),
        specialLocationsForTemplate(specialTemplateId(t), false).map(r => r.location_name).join(' ')
      ].join(' ')).includes(q))
      .sort((a, b) => specialTemplateName(a).localeCompare(specialTemplateName(b)));
  }

  function getPaginatedSpecialCsClients(search = '', page = 1, pageSize = 25) {
    const all = getFilteredSpecialCsClients(search);
    const size = [25, 50, 100].includes(Number(pageSize)) ? Number(pageSize) : 25;
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / size));
    const safePage = clampCsPage(page, totalPages);
    return { rows: all.slice((safePage - 1) * size, safePage * size), total, page: safePage, pageSize: size, totalPages };
  }

  function renderClientSelectPagination(meta, prefix = 'client-select') {
    if (!meta.total) return '<div class="cs-client-select-page-info">No clients found.</div>';
    return `<div class="cs-client-select-pagination">
      <button class="btn ghost sm" type="button" data-cs-action="${prefix}-prev-page" ${meta.page <= 1 ? 'disabled' : ''}>Previous</button>
      <span class="cs-client-select-page-info">Page ${esc(meta.page)} of ${esc(meta.totalPages)} · ${esc(meta.total)} clients</span>
      <button class="btn ghost sm" type="button" data-cs-action="${prefix}-next-page" ${meta.page >= meta.totalPages ? 'disabled' : ''}>Next</button>
      <label class="cs-client-select-page-size">Page size <select class="select" data-cs-action="${prefix}-page-size"><option value="25" ${meta.pageSize === 25 ? 'selected' : ''}>25</option><option value="50" ${meta.pageSize === 50 ? 'selected' : ''}>50</option><option value="100" ${meta.pageSize === 100 ? 'selected' : ''}>100</option></select></label>
    </div>`;
  }



  function refreshClientSelectFields() {
    const p = STATE.clientSelectPagination;
    const meta = getPaginatedCsClients(p.search, p.page, p.pageSize);
    const selected = getSelectedCompany();
    const selectedId = companyId(selected);
    let rows = meta.rows.slice();
    if (selectedId && selected && !rows.some(c => companyId(c) === selectedId)) rows.unshift({ ...selected, __selectedOutsidePage: true });
    const options = rows.map(c => `<option value="${attr(companyId(c))}" ${companyId(c) === selectedId ? 'selected' : ''}>${c.__selectedOutsidePage ? 'Selected: ' : ''}${esc(companyName(c))}</option>`).join('') || '<option value="">No clients found</option>';
    document.querySelectorAll('select[data-cs-action="client-select-value"]').forEach(select => { select.innerHTML = options; select.value = selectedId; });
    document.querySelectorAll('input[data-cs-action="client-select-search"]').forEach(input => { if (input.value !== (p.search || '')) input.value = p.search || ''; });
    document.querySelectorAll('[data-cs-client-select-pagination-host]').forEach(host => { host.innerHTML = renderClientSelectPagination(meta); });
  }

  function updateClientSelectPage(nextPage) {
    const p = STATE.clientSelectPagination;
    const meta = getPaginatedCsClients(p.search, nextPage, p.pageSize);
    STATE.clientSelectPagination = { search: p.search, page: meta.page, pageSize: meta.pageSize, total: meta.total };
    renderClientList();
    refreshClientSelectFields();
  }

  function updateClientSelectSearch(value) {
    STATE.clientSelectPagination.search = value || '';
    STATE.clientSelectPagination.page = 1;
    renderClientList();
    refreshClientSelectFields();
  }



  function renderSpecialClientSelectOptions(selectedId = '') {
    const p = STATE.specialClientSelectPagination;
    const meta = getPaginatedSpecialCsClients(p.search, p.page, p.pageSize);
    let rows = meta.rows.slice();
    const selected = selectedId ? specialTemplateById(selectedId) : null;
    if (selectedId && selected && !rows.some(t => specialTemplateId(t) === selectedId)) rows.unshift({ ...selected, __selectedOutsidePage: true });
    const options = rows.map(t => `<option value="${attr(specialTemplateId(t))}" ${specialTemplateId(t) === selectedId ? 'selected' : ''}>${t.__selectedOutsidePage ? 'Selected: ' : ''}${esc(t.client_name || specialTemplateName(t))}</option>`).join('') || '<option value="">No active Special CS Clients</option>';
    return { options, meta };
  }

  function refreshSpecialClientSelectFields() {
    const current = document.querySelector('select[name="special_client_id"]')?.value || '';
    const rendered = renderSpecialClientSelectOptions(current);
    document.querySelectorAll('select[name="special_client_id"]').forEach(select => { select.innerHTML = rendered.options; if (current) select.value = current; });
    document.querySelectorAll('input[data-cs-action="special-client-select-search"]').forEach(input => { if (input.value !== (STATE.specialClientSelectPagination.search || '')) input.value = STATE.specialClientSelectPagination.search || ''; });
    document.querySelectorAll('[data-cs-special-client-select-pagination-host]').forEach(host => { host.innerHTML = renderClientSelectPagination(rendered.meta, 'special-client-select'); });
  }

  function updateSpecialClientSelectPage(nextPage) {
    const p = STATE.specialClientSelectPagination;
    const meta = getPaginatedSpecialCsClients(p.search, nextPage, p.pageSize);
    STATE.specialClientSelectPagination = { search: p.search, page: meta.page, pageSize: meta.pageSize, total: meta.total };
    refreshSpecialClientSelectFields();
  }

  function updateSpecialClientSelectSearch(value) {
    STATE.specialClientSelectPagination.search = value || '';
    STATE.specialClientSelectPagination.page = 1;
    refreshSpecialClientSelectFields();
  }

  function specialClientSelectInput(selectedId = '') {
    const rendered = renderSpecialClientSelectOptions(String(selectedId || '').trim());
    return `<label>Special CS Client</label><input class="input cs-client-select-search" type="search" data-cs-action="special-client-select-search" value="${attr(STATE.specialClientSelectPagination.search || '')}" placeholder="Search special client, group, brand, location…" /><select name="special_client_id" class="select">${rendered.options}</select><div data-cs-special-client-select-pagination-host>${renderClientSelectPagination(rendered.meta, 'special-client-select')}</div>`;
  }

  function renderClientList() {
    const filtered = getFilteredCompanies();
    const baseIds = new Set(filtered.map(companyId));
    const p = STATE.clientSelectPagination;
    const all = getFilteredCsClients(p.search).filter(c => baseIds.has(companyId(c)));
    const pageSize = [25, 50, 100].includes(Number(p.pageSize)) ? Number(p.pageSize) : 25;
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = clampCsPage(p.page, totalPages);
    const meta = { rows: all.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, totalPages };
    const normalRows = meta.rows;
    STATE.clientSelectPagination = { search: p.search, page: meta.page, pageSize: meta.pageSize, total: meta.total };

    if (
      STATE.selectedEntityType === 'normal' &&
      !filtered.some(c => companyId(c) === STATE.selectedCompanyId)
    ) {
      STATE.selectedCompanyId = companyId(filtered[0] || STATE.rows.companies[0] || {});
    }

    const search = normalize(p.search || STATE.filters.search || '');
    const specialRows = activeSpecialTemplates()
      .filter(special => {
        if (!search) return true;
        const sid = specialTemplateId(special);
        return normalize([
          specialTemplateName(special),
          special.description,
          ...specialGroupsForTemplate(sid).map(groupName),
          ...specialBrandsForTemplate(sid).map(brandName),
          ...specialLocationsForTemplate(sid, false).map(row => row.location_name)
        ].join(' ')).includes(search);
      })
      .sort((a, b) => specialTemplateName(a).localeCompare(specialTemplateName(b)));

    const host = $('csClientList');
    if (!host) return;

    const searchControls = `<div class="cs-client-select-controls"><label>Client Search</label><input class="input cs-client-select-search" type="search" data-cs-action="client-select-search" value="${attr(p.search || '')}" placeholder="Search all normal and special clients…" /><div data-cs-client-select-pagination-host>${renderClientSelectPagination(meta)}</div></div>`;

    const normalCards = normalRows.length
      ? normalRows.map(company => {
          const id = companyId(company);
          const profile = getProfile(company);
          const score = computeHealth(company);
          const reviews = reviewRows(company);
          const latest = reviews[0] || {};
          const status = profile.client_status || mapCompanyStatus(company.company_status);
          return `<button class="cs-client-card ${STATE.selectedEntityType === 'normal' && id === STATE.selectedCompanyId ? 'is-active' : ''}" type="button" data-cs-normal-client-id="${attr(id)}">
            <div class="cs-client-name"><span>${esc(companyName(company))}</span><span class="cs-client-source-badge">Normal Client</span></div>
            <div class="cs-client-meta">
              ${healthChip(score)}
              <span class="cs-chip cs-chip--blue">${esc(status)}</span>
              <span class="cs-chip">${esc(groupLabelForCompany(company))}</span>
            </div>
            <div class="cs-kpi-sub">Last review: ${fmtDate(latest.review_date)} · Locations: ${getClientLocations(company).length}</div>
          </button>`;
        }).join('')
      : '<div class="cs-empty">No matching normal clients.</div>';

    const specialCards = specialRows.length
      ? specialRows.map(special => {
          const id = specialTemplateId(special);
          const locations = specialLocationsForTemplate(id, true);
          return `<button class="cs-client-card cs-client-card--special ${STATE.selectedEntityType === 'special' && id === STATE.selectedSpecialClientId ? 'is-active' : ''}" type="button" data-cs-special-sidebar-id="${attr(id)}">
            <div class="cs-client-name"><span>${esc(specialTemplateName(special))}</span><span class="cs-client-source-badge cs-client-source-badge--special">Standalone Special</span></div>
            <div class="cs-client-meta">
              <span class="cs-chip cs-chip--violet">${locations.length} location${locations.length === 1 ? '' : 's'}</span>
              <span class="cs-chip">${esc(special.status || 'active')}</span>
            </div>
            <div class="cs-kpi-sub">Independent CS client · no agreement, invoice, or parent client</div>
          </button>`;
        }).join('')
      : '<div class="cs-empty">No matching standalone Special CS Clients.</div>';

    host.innerHTML = `${searchControls}
      <div class="cs-sidebar-section">
        <div class="cs-sidebar-section-title"><span>Normal Clients</span><b>${meta.total}</b></div>
        ${normalCards}
      </div>
      <div class="cs-sidebar-section cs-sidebar-section--special">
        <div class="cs-sidebar-section-title"><span>Standalone Special CS Clients</span><b>${specialRows.length}</b></div>
        ${specialCards}
      </div>`;

    host.querySelectorAll('[data-cs-normal-client-id]').forEach(button => {
      button.addEventListener('click', () => selectNormalClient(button.dataset.csNormalClientId || ''));
    });
    host.querySelectorAll('[data-cs-special-sidebar-id]').forEach(button => {
      button.addEventListener('click', () => selectSpecialClient(button.dataset.csSpecialSidebarId || ''));
    });
  }

  function syncHeaderActionsForSelection() {
    const isSpecial = STATE.selectedEntityType === 'special';
    [
      'csAddGroupBtn',
      'csAddGroupMemberBtn',
      'csAddBrandBtn',
      'csAddBrandLocationBtn',
      'csAddReviewBtn',
      'csAddTaskBtn',
      'csAddRiskBtn',
      'csAddQbrBtn',
      'csAddContactBtn'
    ].forEach(id => {
      const button = $(id);
      if (button) button.style.display = isSpecial ? 'none' : '';
    });
  }

  function renderDetail() {
    syncHeaderActionsForSelection();
    const host = $('csClientDetail');
    if (!host) return;

    if (STATE.selectedEntityType === 'special') {
      const special = getSelectedSpecialClient();
      if (!special) {
        host.innerHTML = '<div class="cs-empty">No standalone Special CS Client is selected.</div>';
        return;
      }
      renderStandaloneSpecialClientDetail(special, host);
      return;
    }

    const company = getSelectedCompany();
    if (!company) {
      if (activeSpecialTemplates().length) {
        selectSpecialClient(specialTemplateId(activeSpecialTemplates()[0]));
        return;
      }
      host.innerHTML = '<div class="cs-empty">No clients found.</div>';
      return;
    }

    const profile = getProfile(company);
    const score = computeHealth(company);
    const status = profile.client_status || mapCompanyStatus(company.company_status);
    host.innerHTML = `
      <div class="cs-detail-head">
        <div class="cs-detail-title"><h3>${esc(companyName(company))}</h3><p>Normal CS Client · ${esc(company.city || '')}${company.city && company.country ? ', ' : ''}${esc(company.country || '')} · ${esc(profile.lifecycle_stage || status)}</p></div>
        <div class="cs-health-ring"><div class="cs-health-score">${score}</div><div class="cs-health-label">${esc(healthLabel(score))}</div></div>
      </div>
      <div class="cs-tabs">${['overview','groups','brands','completion','pulse','activity','tasks','risks','onboarding','renewals','qbr','contacts','timeline'].map(tab => `<button class="cs-tab-btn ${STATE.activeTab === tab ? 'is-active' : ''}" type="button" data-cs-tab="${tab}">${tabLabel(tab)}</button>`).join('')}</div>
      <div id="csTabPanel" class="cs-tab-panel is-active">${renderActivePanel(company)}</div>`;
    host.querySelectorAll('[data-cs-tab]').forEach(btn => btn.addEventListener('click', () => {
      STATE.activeTab = btn.dataset.csTab || 'overview';
      renderDetail();
    }));
  }

  function renderStandaloneSpecialClientDetail(special, host = $('csClientDetail')) {
    if (!host) return;
    const sid = specialTemplateId(special);
    const groups = specialGroupsForTemplate(sid);
    const brands = specialBrandsForTemplate(sid);
    const locations = specialLocationsForTemplate(sid, false);
    const activeLocations = specialLocationsForTemplate(sid, true);
    const completionRows = (STATE.rows.completions || [])
      .filter(row => String(row.source_type || '').toLowerCase() === 'special_client' && String(row.special_client_id || '').trim() === sid)
      .sort((a, b) => String(b.period_end || b.period_start || '').localeCompare(String(a.period_end || a.period_start || '')));

    const tab = STATE.specialActiveTab || 'overview';
    const actions = `
      ${canUpdate() ? `<button class="btn ghost sm" type="button" data-cs-action="special-client-edit" data-special-client-id="${attr(sid)}">Edit</button>` : ''}
      ${canCreate() ? `<button class="btn sm primary" type="button" data-cs-action="special-client-use-completion" data-special-client-id="${attr(sid)}">Add Completion</button>` : ''}
      <button class="btn ghost sm" type="button" data-cs-action="special-client-view-report" data-special-client-id="${attr(sid)}">View Report</button>`;

    let panel = '';
    if (tab === 'locations') {
      panel = locations.length
        ? `<div class="cs-table-wrap"><table class="cs-table"><thead><tr><th>Location</th><th>Group</th><th>Brand</th><th>Status</th></tr></thead><tbody>${locations.map(location => {
            const group = location.group_id ? specialGroupById(location.group_id) : null;
            const brand = location.brand_id ? specialBrandById(location.brand_id) : null;
            return `<tr><td><strong>${esc(location.location_name)}</strong></td><td>${esc(group ? groupName(group) : '—')}</td><td>${esc(brand ? brandName(brand) : '—')}</td><td>${esc(location.status || 'active')}</td></tr>`;
          }).join('')}</tbody></table></div>`
        : '<div class="cs-empty">No locations added yet.</div>';
    } else if (tab === 'structure') {
      panel = `<div class="cs-info-grid">
        <div class="cs-info-box"><div class="cs-info-label">Groups</div><div class="cs-info-value">${esc(groups.map(groupName).join(', ') || 'No groups')}</div></div>
        <div class="cs-info-box"><div class="cs-info-label">Brands</div><div class="cs-info-value">${esc(brands.map(brandName).join(', ') || 'No brands')}</div></div>
      </div>`;
    } else if (tab === 'history') {
      panel = completionRows.length
        ? `<div class="cs-table-wrap"><table class="cs-table"><thead><tr><th>Period</th><th>Location</th><th>On-Time</th><th>Late</th><th>Partial</th><th>Missed</th><th>Completion</th></tr></thead><tbody>${completionRows.map(row => `<tr><td>${fmtDate(row.period_start)} – ${fmtDate(row.period_end)}</td><td>${esc(row.location_name || '')}</td><td>${formatDecimal(row.done_on_time)}</td><td>${formatDecimal(row.done_late)}</td><td>${formatDecimal(row.partially_done)}</td><td>${formatDecimal(row.missed)}</td><td><strong>${formatPct(completionCount(row))}</strong></td></tr>`).join('')}</tbody></table></div>`
        : '<div class="cs-empty">No completion history for this standalone Special CS Client.</div>';
    } else {
      panel = `<div class="cs-info-grid">
        <div class="cs-info-box"><div class="cs-info-label">Client Type</div><div class="cs-info-value">Standalone Special CS Client</div></div>
        <div class="cs-info-box"><div class="cs-info-label">Status</div><div class="cs-info-value">${esc(special.status || 'active')}</div></div>
        <div class="cs-info-box"><div class="cs-info-label">Active Locations</div><div class="cs-info-value">${activeLocations.length}</div></div>
        <div class="cs-info-box"><div class="cs-info-label">Groups / Brands</div><div class="cs-info-value">${groups.length} / ${brands.length}</div></div>
        <div class="cs-info-box cs-form-field--full"><div class="cs-info-label">Description</div><div class="cs-info-value">${esc(special.description || '—')}</div></div>
      </div>
      <div class="cs-mini-note"><strong>Independent client:</strong> this Special CS Client is not attached to the normal client selected previously and has no agreement, invoice, CRM company, accounting, renewal, or payment relationship.</div>`;
    }

    host.innerHTML = `
      <div class="cs-detail-head cs-detail-head--special">
        <div class="cs-detail-title">
          <span class="cs-client-source-badge cs-client-source-badge--special">Standalone Special CS Client</span>
          <h3>${esc(specialTemplateName(special))}</h3>
          <p>Independent Customer Success reporting client · no parent normal client</p>
        </div>
        <div class="cs-detail-actions">${actions}</div>
      </div>
      <div class="cs-tabs">
        ${[['overview','Overview'],['locations','Locations'],['structure','Groups & Brands'],['history','Completion History']].map(([key,label]) => `<button class="cs-tab-btn ${tab === key ? 'is-active' : ''}" type="button" data-cs-special-tab="${key}">${label}</button>`).join('')}
      </div>
      <div class="cs-tab-panel is-active">${panel}</div>`;

    host.querySelectorAll('[data-cs-special-tab]').forEach(button => {
      button.addEventListener('click', () => {
        STATE.specialActiveTab = button.dataset.csSpecialTab || 'overview';
        renderDetail();
      });
    });
  }

  function tabLabel(tab) { return ({ overview:'Overview', groups:'Groups', brands:'Brands', completion:'Completion', specialTemplates:'Special CS Clients', pulse:'Pulse Review', activity:'Activity', tasks:'Tasks', risks:'Risks', onboarding:'Onboarding', renewals:'Renewals', qbr:'QBR', contacts:'Contacts', timeline:'Timeline' }[tab] || tab); }
  function renderActivePanel(company) {
    switch (STATE.activeTab) {
      case 'groups': return renderGroups(company);
      case 'brands': return renderBrands(company);
      case 'completion': return renderCompletion(company);
      case 'pulse': return renderPulse(company);
      case 'activity': return renderActivity(company);
      case 'tasks': return renderTasks(company);
      case 'risks': return renderRisks(company);
      case 'onboarding': return renderOnboarding(company);
      case 'renewals': return renderRenewals(company);
      case 'qbr': return renderQbr(company);
      case 'contacts': return renderContacts(company);
      case 'timeline': return renderTimeline(company);
      default: return renderOverview(company);
    }
  }

  function renderOverview(company) {
    const profile = getProfile(company);
    const reviews = reviewRows(company);
    const latestReview = reviews[0] || {};
    const nextRenewal = firstFutureDate(agreementRows(company), ['service_end_date','end_date','serviceEndDate','agreement_end_date']);
    const info = [
      ['Client Status', profile.client_status || mapCompanyStatus(company.company_status)],
      ['Lifecycle Stage', profile.lifecycle_stage || 'Live'],
      ['Assigned CSM', profile.assigned_csm_name || '—'],
      ['Client Group(s)', groupLabelForCompany(company)],
      ['Satisfaction', latestReview.satisfaction_level || profile.manual_sentiment || 'Unknown'],
      ['Adoption Level', latestReview.adoption_level || profile.adoption_level || 'Unknown'],
      ['Relationship', latestReview.relationship_status || profile.relationship_status || 'Normal'],
      ['CS Effort Level', computeEffort(company)],
      ['Location Completion', latestCompletionSummary(company)],
      ['Last Activity', fmtDate(latestDate(activityRows(company), ['timestamp','created_at']))],
      ['Next Follow-up', fmtDate(latestReview.next_follow_up_date || firstFutureDate(taskRows(company), ['due_date']))],
      ['Next Renewal', fmtDate(nextRenewal)],
      ['Open Risks', openRows(riskRows(company)).length],
      ['Open Tasks', openRows(taskRows(company)).length]
    ];
    return `<div class="cs-info-grid">${info.map(([k,v]) => `<div class="cs-info-box"><div class="cs-info-label">${esc(k)}</div><div class="cs-info-value">${esc(v)}</div></div>`).join('')}</div>
      <div style="margin-top:14px;" class="cs-section-title"><h4>Recommended CS Action</h4></div>
      ${renderRecommendation(company)}`;
  }

  function renderRecommendation(company) {
    const score = computeHealth(company);
    const missing = [];
    if (reviewMissing(company, 'weekly')) missing.push('Weekly review is missing.');
    if (reviewMissing(company, 'monthly')) missing.push('Monthly review is missing.');
    if (openRows(riskRows(company)).length) missing.push('Open risks require follow-up.');
    const lastActivity = latestDate(activityRows(company), ['timestamp','created_at']);
    if (!lastActivity || daysBetween(lastActivity) > 21) missing.push('No recent CS activity.');
    if (!missing.length && score >= 80) missing.push('Client looks healthy. Continue normal care and keep monthly pulse review updated.');
    return `<div class="cs-info-box"><div class="cs-info-value">${missing.map(m => `• ${esc(m)}`).join('<br>')}</div><div style="margin-top:10px;"><button class="btn ghost sm" type="button" data-cs-action="completion-history-client">View All Completion History</button></div></div>`;
  }

  function latestCompletionSummary(company) {
    const rows = aggregateCompletionRows(latestCompletionPeriodRows(company));
    if (!rows.length) return 'No data';
    const avg = averageCompletionMetrics(rows);
    return `${avg.completion.toFixed(2)}% avg`;
  }


  function renderGroups(company) {
    const groups = groupsForCompany(company);
    const currentClient = companyName(company);
    const summary = groups.length
      ? groups.map(group => {
          const members = groupMemberCompanies(group);
          return `<article class="cs-info-box">
            <div class="cs-info-label">${esc(groupName(group))}</div>
            <div class="cs-info-value">${members.length} client${members.length === 1 ? '' : 's'}</div>
            <div class="cs-kpi-sub">${esc(group.description || group.group_code || 'CS parent group')}</div>
            <button class="btn ghost sm cs-history-open-btn" type="button" data-cs-action="completion-history-group" data-group-id="${attr(groupId(group))}">View All Completion History</button>
          </article>`;
        }).join('')
      : `<div class="cs-empty">${esc(currentClient)} is not assigned to a CS client group yet.</div>`;

    const memberRows = [];
    groups.forEach(group => {
      groupMemberCompanies(group).forEach(member => {
        const score = computeHealth(member);
        memberRows.push([
          groupName(group),
          companyName(member),
          healthLabel(score) + ' · ' + score,
          computeEffort(member),
          latestCompletionSummary(member)
        ]);
      });
    });

    return `<div class="cs-section-title">
        <div><h4>Client Groups</h4><div class="cs-kpi-sub">Groups combine multiple normal clients. Open a group history to see every old weekly and monthly completion entered for all group members.</div></div>
        <div>
          <button class="btn sm" type="button" data-cs-action="group">+ New Group</button>
          <button class="btn ghost sm" type="button" data-cs-action="group-member">+ Add Current Client</button>
          <button class="btn ghost sm" type="button" data-cs-action="group-activity">+ Group Activity</button>
          <button class="btn ghost sm" type="button" data-cs-action="brand">+ Brand</button>
        </div>
      </div>
      <div class="cs-info-grid">${summary}</div>
      <div style="margin-top:14px;" class="cs-section-title"><h4>Companies in Same Group</h4></div>
      ${memberRows.length ? table(['Group','Client Company','Health','CS Effort','Latest Completion'], memberRows) : '<div class="cs-empty">No grouped companies to show yet.</div>'}`;
  }


  function renderBrands(company) {
    const brands = brandsForCompany(company);
    const brandSummaries = brands.map(brand => {
      const targets = brandCompletionTargets(brand);
      const targetKeys = new Set(targets.map(completionTargetKey));
      const latestRows = aggregateCompletionRows((STATE.rows.completions || []).filter(row => targetKeys.has([String(row.company_id || '').trim(), normalize(row.location_name)].join('|'))));
      const avg = averageCompletionMetrics(latestRows.length ? latestRows : targets);
      const assigned = brandLocationRows(brand);
      return { brand, targets, assigned, avg };
    });
    const cards = brandSummaries.length
      ? brandSummaries.map(({ brand, targets, assigned, avg }) => {
          const assignedText = assigned.length ? `${assigned.length} assigned` : 'No assigned locations yet';
          return `<article class="cs-info-box">
            <div class="cs-info-label">${esc(brandScopeLabel(brand))}</div>
            <div class="cs-info-value">${esc(brandName(brand))}</div>
            <div class="cs-kpi-sub">${targets.length} location${targets.length === 1 ? '' : 's'} · ${assignedText} · Completion ${avg.completion.toFixed(2)}%</div>
          </article>`;
        }).join('')
      : `<div class="cs-empty">No brands assigned yet. Create brands to split this client/group into operational brand layers, such as Kcal KSA and Kcal UAE.</div>`;

    const rowsHtml = brandSummaries.length ? brandSummaries.map(({ brand, targets, avg }, index) => {
      const bid = attr(brandId(brand));
      return `<tr>
        <td>${index + 1}</td>
        <td><strong>${esc(brandName(brand))}</strong><div class="cs-kpi-sub">${esc(brandScopeLabel(brand))}</div></td>
        <td>${targets.length}</td>
        <td><strong>${avg.completion.toFixed(2)}%</strong></td>
        <td>${avg.done_on_time.toFixed(2)}%</td>
        <td>${avg.done_late.toFixed(2)}%</td>
        <td>
          <button class="btn ghost sm" type="button" data-cs-action="brand-location" data-brand-id="${bid}">Manage Locations</button>
          <button class="btn ghost sm" type="button" data-cs-action="completion-history-brand" data-brand-id="${bid}">History</button>
          <button class="btn ghost sm" type="button" data-cs-action="brand-export" data-brand-id="${bid}">Export</button>
        </td>
      </tr>`;
    }).join('') : '';

    const tableHtml = rowsHtml
      ? `<div class="cs-table-wrap"><table class="cs-table"><thead><tr><th>#</th><th>Brand</th><th>Locations</th><th>Completion</th><th>Done On-Time</th><th>Done Late</th><th>Actions</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`
      : '<div class="cs-empty">No brand completion to show yet.</div>';

    return `<div class="cs-section-title">
        <div><h4>Brands</h4><div class="cs-kpi-sub">Third layer: Client / Group → Brand → Locations. First create the brand name, then Manage Locations shows all locations for that brand scope so you can assign, remove, or move them.</div></div>
        <div><button class="btn sm" type="button" data-cs-action="brand">+ New Brand</button> <button class="btn ghost sm" type="button" data-cs-action="brand-location">+ Manage Brand Locations</button></div>
      </div>
      <div class="cs-info-grid">${cards}</div>
      <div style="margin-top:14px;" class="cs-section-title"><h4>Brand Completion</h4></div>
      ${tableHtml}`;
  }


  function completionHistoryPeriodKey(row = {}) {
    return [
      String(row.review_type || 'weekly').toLowerCase(),
      String(row.period_start || '').slice(0, 10),
      String(row.period_end || '').slice(0, 10)
    ].join('|');
  }

  function completionHistoryRowCompanyName(row = {}) {
    return String(
      row.company_name_snapshot ||
      row.company_name ||
      row.client_name ||
      row.customer_name ||
      ''
    ).trim();
  }

  function completionHistoryRowsForClient(company) {
    return completionRows(company)
      .filter(row => String(row.source_type || 'normal').toLowerCase() !== 'special_client')
      .map(row => applyCs360LocationNameOverride({
        ...row,
        company_name: completionHistoryRowCompanyName(row) || companyName(company)
      }));
  }

  function completionHistoryRowsForGroup(group) {
    if (!group) return [];
    const members = groupMemberCompanies(group);
    const memberIds = new Set(members.map(companyId).filter(Boolean));
    const memberNames = new Set(members.map(member => normalize(companyName(member))).filter(Boolean));

    return (STATE.rows.completions || [])
      .filter(row => {
        if (String(row.source_type || 'normal').toLowerCase() === 'special_client') return false;
        const rowCompanyId = String(row.company_id || '').trim();
        const rowCompanyName = normalize(completionHistoryRowCompanyName(row));
        return (rowCompanyId && memberIds.has(rowCompanyId)) ||
          (rowCompanyName && memberNames.has(rowCompanyName));
      })
      .map(row => applyCs360LocationNameOverride({
        ...row,
        company_name: completionHistoryRowCompanyName(row)
      }));
  }

  function completionHistoryRowsForBrand(brand) {
    if (!brand) return [];
    const targets = brandCompletionTargets(brand);
    const idKeys = new Set(
      targets.map(target => [
        String(target.company_id || '').trim(),
        normalize(target.location_name)
      ].join('|'))
    );
    const nameKeys = new Set(
      targets.map(target => [
        normalize(target.company_name),
        normalize(target.location_name)
      ].join('|'))
    );

    return (STATE.rows.completions || [])
      .filter(row => {
        if (String(row.source_type || 'normal').toLowerCase() === 'special_client') return false;
        const idKey = [
          String(row.company_id || '').trim(),
          normalize(row.location_name)
        ].join('|');
        const nameKey = [
          normalize(completionHistoryRowCompanyName(row)),
          normalize(row.location_name)
        ].join('|');
        return idKeys.has(idKey) || nameKeys.has(nameKey);
      })
      .map(row => applyCs360LocationNameOverride({
        ...row,
        company_name: completionHistoryRowCompanyName(row)
      }));
  }

  function getCompletionHistoryRows(company, filters = STATE.completionHistory) {
    const scope = String(filters.scope || 'client');
    let rows = [];

    if (scope === 'group') {
      rows = completionHistoryRowsForGroup(groupById(filters.groupId));
    } else if (scope === 'brand') {
      rows = completionHistoryRowsForBrand(brandById(filters.brandId));
    } else {
      rows = completionHistoryRowsForClient(company);
    }

    const reviewType = String(filters.reviewType || 'all').toLowerCase();
    const dateFrom = String(filters.dateFrom || '').slice(0, 10);
    const dateTo = String(filters.dateTo || '').slice(0, 10);
    const search = normalize(filters.search || '');

    return rows
      .filter(row => {
        const rowType = String(row.review_type || 'weekly').toLowerCase();
        const rowStart = String(row.period_start || '').slice(0, 10);
        const rowEnd = String(row.period_end || rowStart).slice(0, 10);

        if (reviewType !== 'all' && rowType !== reviewType) return false;
        if (dateFrom && rowEnd && rowEnd < dateFrom) return false;
        if (dateTo && rowStart && rowStart > dateTo) return false;

        if (search) {
          const haystack = normalize([
            completionHistoryRowCompanyName(row),
            row.location_name,
            row.group_name,
            row.brand_name,
            row.source_note,
            row.review_type,
            row.period_start,
            row.period_end
          ].join(' '));
          if (!haystack.includes(search)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const periodCompare = String(b.period_end || b.period_start || '')
          .localeCompare(String(a.period_end || a.period_start || ''));
        if (periodCompare) return periodCompare;
        const companyCompare = completionHistoryRowCompanyName(a)
          .localeCompare(completionHistoryRowCompanyName(b));
        if (companyCompare) return companyCompare;
        return String(a.location_name || '').localeCompare(String(b.location_name || ''));
      });
  }

  function summarizeCompletionHistoryPeriods(rows = []) {
    const periods = new Map();

    rows.forEach(row => {
      const key = completionHistoryPeriodKey(row);
      if (!periods.has(key)) {
        periods.set(key, {
          review_type: row.review_type || 'weekly',
          period_start: row.period_start || '',
          period_end: row.period_end || '',
          rows: [],
          clients: new Set(),
          locations: new Set()
        });
      }

      const period = periods.get(key);
      period.rows.push(row);
      const clientName = completionHistoryRowCompanyName(row);
      if (clientName) period.clients.add(clientName);
      if (row.location_name) period.locations.add(String(row.location_name));
    });

    return Array.from(periods.values())
      .map(period => ({
        ...period,
        metrics: averageCompletionMetrics(period.rows),
        clientsCount: period.clients.size,
        locationsCount: period.locations.size
      }))
      .sort((a, b) =>
        String(b.period_end || b.period_start || '')
          .localeCompare(String(a.period_end || a.period_start || ''))
      );
  }

  function completionHistoryScopeLabel(company, history = STATE.completionHistory) {
    if (history.scope === 'group') {
      const group = groupById(history.groupId);
      return group ? `Group: ${groupName(group)}` : 'Client Group';
    }
    if (history.scope === 'brand') {
      const brand = brandById(history.brandId);
      return brand ? `Brand: ${brandName(brand)}` : 'Brand';
    }
    return `Client: ${companyName(company)}`;
  }

  function openCompletionHistory(scope = 'client', id = '') {
    STATE.selectedEntityType = 'normal';
    STATE.activeTab = 'completion';
    STATE.completionHistory = {
      ...STATE.completionHistory,
      scope,
      groupId: scope === 'group' ? String(id || '') : '',
      brandId: scope === 'brand' ? String(id || '') : '',
      page: 1
    };
    renderDetail();
  }

  function bindCompletionHistoryControls() {
    setTimeout(() => {
      const history = STATE.completionHistory;

      const bindChange = (id, handler) => {
        const element = $(id);
        element?.addEventListener('change', () => handler(element.value));
      };

      const bindInput = (id, handler) => {
        const element = $(id);
        element?.addEventListener('input', () => handler(element.value));
      };

      bindChange('csCompletionHistoryScope', value => {
        history.scope = value || 'client';
        history.page = 1;
        if (history.scope === 'group' && !history.groupId) {
          history.groupId = groupId(activeGroups()[0] || {});
        }
        if (history.scope === 'brand' && !history.brandId) {
          history.brandId = brandId(activeBrands()[0] || {});
        }
        renderDetail();
      });

      bindChange('csCompletionHistoryGroup', value => {
        history.groupId = value || '';
        history.page = 1;
        renderDetail();
      });

      bindChange('csCompletionHistoryBrand', value => {
        history.brandId = value || '';
        history.page = 1;
        renderDetail();
      });

      bindChange('csCompletionHistoryReviewType', value => {
        history.reviewType = value || 'all';
        history.page = 1;
        renderDetail();
      });

      bindChange('csCompletionHistoryDateFrom', value => {
        history.dateFrom = value || '';
        history.page = 1;
        renderDetail();
      });

      bindChange('csCompletionHistoryDateTo', value => {
        history.dateTo = value || '';
        history.page = 1;
        renderDetail();
      });

      bindChange('csCompletionHistoryPageSize', value => {
        history.pageSize = [25, 50, 100].includes(Number(value)) ? Number(value) : 25;
        history.page = 1;
        renderDetail();
      });

      bindInput('csCompletionHistorySearch', value => {
        history.search = value || '';
        history.page = 1;
        renderDetail();
      });

      $('csCompletionHistoryPrev')?.addEventListener('click', () => {
        history.page = Math.max(1, Number(history.page || 1) - 1);
        renderDetail();
      });

      $('csCompletionHistoryNext')?.addEventListener('click', () => {
        history.page = Number(history.page || 1) + 1;
        renderDetail();
      });

      $('csCompletionHistoryClear')?.addEventListener('click', () => {
        STATE.completionHistory = {
          ...STATE.completionHistory,
          reviewType: 'all',
          dateFrom: '',
          dateTo: '',
          search: '',
          page: 1
        };
        renderDetail();
      });
    }, 0);
  }

  function renderCompletionHistory(company) {
    const history = STATE.completionHistory;
    const groups = activeGroups();
    const brands = activeBrands();

    if (history.scope === 'group' && !groupById(history.groupId) && groups.length) {
      history.groupId = groupId(groups[0]);
    }
    if (history.scope === 'brand' && !brandById(history.brandId) && brands.length) {
      history.brandId = brandId(brands[0]);
    }

    const rows = getCompletionHistoryRows(company, history);
    const periods = summarizeCompletionHistoryPeriods(rows);
    const pageSize = [25, 50, 100].includes(Number(history.pageSize)) ? Number(history.pageSize) : 25;
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = Math.max(1, Math.min(totalPages, Number(history.page) || 1));
    history.page = page;
    history.pageSize = pageSize;
    const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

    const groupOptions = groups.map(group =>
      `<option value="${attr(groupId(group))}" ${groupId(group) === history.groupId ? 'selected' : ''}>${esc(groupName(group))}</option>`
    ).join('');

    const brandOptions = brands.map(brand =>
      `<option value="${attr(brandId(brand))}" ${brandId(brand) === history.brandId ? 'selected' : ''}>${esc(brandName(brand))} · ${esc(brandScopeLabel(brand))}</option>`
    ).join('');

    const oldest = rows.length ? rows[rows.length - 1] : null;
    const newest = rows[0] || null;

    const periodRows = periods.length
      ? periods.map(period => `<tr>
          <td><strong>${esc(String(period.review_type || 'weekly').toUpperCase())}</strong></td>
          <td>${fmtDate(period.period_start)} → ${fmtDate(period.period_end)}</td>
          <td>${period.clientsCount}</td>
          <td>${period.locationsCount}</td>
          <td><strong>${period.metrics.completion.toFixed(2)}%</strong></td>
          <td>${period.metrics.done_on_time.toFixed(2)}%</td>
          <td>${period.metrics.done_late.toFixed(2)}%</td>
          <td>${period.metrics.partially_done.toFixed(2)}%</td>
          <td>${period.metrics.missed.toFixed(2)}%</td>
        </tr>`).join('')
      : '<tr><td colspan="9" class="cs-empty">No historical completion periods match the selected filters.</td></tr>';

    const detailRows = pageRows.length
      ? pageRows.map(row => `<tr>
          <td>${fmtDate(row.period_start)} → ${fmtDate(row.period_end)}</td>
          <td>${esc(String(row.review_type || 'weekly').toUpperCase())}</td>
          <td>${esc(completionHistoryRowCompanyName(row) || companyName(company))}</td>
          <td><strong>${esc(row.location_name || '—')}</strong></td>
          <td>${formatDecimal(row.done_on_time)}%</td>
          <td>${formatDecimal(row.done_late)}%</td>
          <td><strong>${formatPct(completionCount(row))}</strong></td>
          <td>${formatDecimal(row.partially_done)}%</td>
          <td>${formatDecimal(row.missed)}%</td>
          <td>${esc(row.source_note || '—')}</td>
          <td>${fmtDate(row.updated_at || row.created_at)}</td>
        </tr>`).join('')
      : '<tr><td colspan="11" class="cs-empty">No historical completion entries match the selected filters.</td></tr>';

    bindCompletionHistoryControls();

    return `<section class="cs-completion-history">
      <div class="cs-section-title">
        <div>
          <h4>All Completion History</h4>
          <div class="cs-kpi-sub">Shows every saved completion period, not only the latest one. Current scope: ${esc(completionHistoryScopeLabel(company, history))}.</div>
        </div>
        <button id="csCompletionHistoryClear" class="btn ghost sm" type="button">Clear Filters</button>
      </div>

      <div class="cs-completion-history-filters">
        <div class="cs-form-field">
          <label>History Scope</label>
          <select id="csCompletionHistoryScope" class="select">
            <option value="client" ${history.scope === 'client' ? 'selected' : ''}>Current Client</option>
            <option value="group" ${history.scope === 'group' ? 'selected' : ''} ${groups.length ? '' : 'disabled'}>Client Group</option>
            <option value="brand" ${history.scope === 'brand' ? 'selected' : ''} ${brands.length ? '' : 'disabled'}>Brand</option>
          </select>
        </div>
        <div class="cs-form-field" style="${history.scope === 'group' ? '' : 'display:none;'}">
          <label>Client Group</label>
          <select id="csCompletionHistoryGroup" class="select">${groupOptions || '<option value="">No groups</option>'}</select>
        </div>
        <div class="cs-form-field" style="${history.scope === 'brand' ? '' : 'display:none;'}">
          <label>Brand</label>
          <select id="csCompletionHistoryBrand" class="select">${brandOptions || '<option value="">No brands</option>'}</select>
        </div>
        <div class="cs-form-field">
          <label>Review Type</label>
          <select id="csCompletionHistoryReviewType" class="select">
            <option value="all" ${history.reviewType === 'all' ? 'selected' : ''}>All Types</option>
            <option value="weekly" ${history.reviewType === 'weekly' ? 'selected' : ''}>Weekly</option>
            <option value="monthly" ${history.reviewType === 'monthly' ? 'selected' : ''}>Monthly</option>
          </select>
        </div>
        <div class="cs-form-field">
          <label>From</label>
          <input id="csCompletionHistoryDateFrom" class="input" type="date" value="${attr(history.dateFrom || '')}" />
        </div>
        <div class="cs-form-field">
          <label>To</label>
          <input id="csCompletionHistoryDateTo" class="input" type="date" value="${attr(history.dateTo || '')}" />
        </div>
        <div class="cs-form-field cs-completion-history-search">
          <label>Search</label>
          <input id="csCompletionHistorySearch" class="input" type="search" value="${attr(history.search || '')}" placeholder="Client, location, note, group, brand…" />
        </div>
      </div>

      <div class="cs-info-grid cs-completion-history-kpis">
        <div class="cs-info-box"><div class="cs-info-label">Saved Periods</div><div class="cs-info-value">${periods.length}</div></div>
        <div class="cs-info-box"><div class="cs-info-label">Historical Entries</div><div class="cs-info-value">${rows.length}</div></div>
        <div class="cs-info-box"><div class="cs-info-label">Newest Period</div><div class="cs-info-value">${newest ? `${fmtDate(newest.period_start)} → ${fmtDate(newest.period_end)}` : '—'}</div></div>
        <div class="cs-info-box"><div class="cs-info-label">Oldest Period</div><div class="cs-info-value">${oldest ? `${fmtDate(oldest.period_start)} → ${fmtDate(oldest.period_end)}` : '—'}</div></div>
      </div>

      <div class="cs-section-title cs-completion-history-subtitle"><h4>Period Summary</h4><span class="cs-chip">${periods.length} period${periods.length === 1 ? '' : 's'}</span></div>
      <div class="cs-table-wrap"><table class="cs-table cs-history-period-table">
        <thead><tr><th>Type</th><th>Period</th><th>Clients</th><th>Locations</th><th>Completion</th><th>On-Time</th><th>Late</th><th>Partial</th><th>Missed</th></tr></thead>
        <tbody>${periodRows}</tbody>
      </table></div>

      <div class="cs-section-title cs-completion-history-subtitle">
        <div><h4>Detailed Historical Entries</h4><div class="cs-kpi-sub">Every saved location line for the selected client, group, or brand.</div></div>
        <label class="cs-client-select-page-size">Rows
          <select id="csCompletionHistoryPageSize" class="select">
            <option value="25" ${pageSize === 25 ? 'selected' : ''}>25</option>
            <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
            <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
          </select>
        </label>
      </div>

      <div class="cs-table-wrap"><table class="cs-table cs-history-detail-table">
        <thead><tr><th>Period</th><th>Type</th><th>Client</th><th>Location</th><th>On-Time</th><th>Late</th><th>Completion</th><th>Partial</th><th>Missed</th><th>Note</th><th>Saved</th></tr></thead>
        <tbody>${detailRows}</tbody>
      </table></div>

      <div class="cs-client-select-pagination cs-completion-history-pagination">
        <button id="csCompletionHistoryPrev" class="btn ghost sm" type="button" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <span class="cs-client-select-page-info">Page ${page} of ${totalPages} · ${rows.length} historical entries</span>
        <button id="csCompletionHistoryNext" class="btn ghost sm" type="button" ${page >= totalPages ? 'disabled' : ''}>Next</button>
      </div>
    </section>`;
  }

  function renderCompletion(company) {
    const locations = getClientLocations(company);
    const records = aggregateCompletionRows(latestCompletionPeriodRows(company));
    const byLocation = new Map(records.map(row => [normalize(row.location_name), row]));
    const rows = locations.map(location =>
      byLocation.get(normalize(location)) ||
      { location_name: location, done_on_time: 0, done_late: 0, partially_done: 0, missed: 0 }
    );
    const period = records[0]
      ? `${records[0].review_type || 'weekly'} · ${fmtDate(records[0].period_start)} → ${fmtDate(records[0].period_end)}`
      : 'No period saved yet';
    const avg = averageCompletionMetrics(rows);
    const tableRows = rows.map(row => [
      row.location_name,
      formatPct(row.done_on_time),
      formatPct(row.done_late),
      formatPct(completionCount(row)),
      formatPct(row.partially_done),
      formatPct(row.missed)
    ]);

    return `<div class="cs-section-title">
        <div>
          <h4>Latest Location Completion</h4>
          <div class="cs-kpi-sub">Latest saved period only: ${esc(period)}. Completion = Done On-Time + Done Late.</div>
        </div>
        <div>
          <button class="btn ghost sm" type="button" data-cs-action="completion-export">Export Latest Report</button>
          <button class="btn sm" type="button" data-cs-action="completion">+ Add Completion</button>
        </div>
      </div>
      <div class="cs-info-grid" style="margin-bottom:12px;">
        <div class="cs-info-box"><div class="cs-info-label">Average Completion</div><div class="cs-info-value">${avg.completion.toFixed(2)}%</div></div>
        <div class="cs-info-box"><div class="cs-info-label">Average Done On-Time</div><div class="cs-info-value">${avg.done_on_time.toFixed(2)}%</div></div>
        <div class="cs-info-box"><div class="cs-info-label">Average Done Late</div><div class="cs-info-value">${avg.done_late.toFixed(2)}%</div></div>
        <div class="cs-info-box"><div class="cs-info-label">Average Missed</div><div class="cs-info-value">${avg.missed.toFixed(2)}%</div></div>
      </div>
      ${table(['Location','Done On-Time','Done Late','Completion','Partially Done','Missed'], tableRows)}
      ${renderCompletionHistory(company)}`;
  }

  function renderPulse(company) {
    const rows = reviewRows(company);
    return `<div class="cs-section-title"><h4>Weekly / Monthly Client Pulse Reviews</h4><button class="btn sm" type="button" data-cs-action="review">+ New Review</button></div>
      ${rows.length ? table(['Type','Period','Satisfaction','Effort','Review Quality','Status','Next Action'], rows.map(r => [r.review_type, `${fmtDate(r.review_period_start)} → ${fmtDate(r.review_period_end)}`, r.satisfaction_level, r.cs_effort_level, progress(r.review_completion_percent), r.status, r.next_action || '—'])) : '<div class="cs-empty">No pulse reviews yet. Add weekly/monthly reviews to monitor satisfaction and CS effort.</div>'}`;
  }

  function renderActivity(company) {
    const rows = activityRows(company).slice(0, 80);
    return rows.length ? table(['Date','CSM','Type','Effort','Channel','Notes'], rows.map(r => [fmtDate(r.timestamp || r.created_at), r.csm_name || r.csmName || '—', r.type_of_support || r.supportType || '—', r.effort_requirement || r.effortRequirement || '—', r.support_channel || r.supportChannel || '—', r.notes || r.notes_optional || '—'])) : '<div class="cs-empty">No daily activity recorded for this client.</div>';
  }

  function renderTasks(company) {
    const rows = taskRows(company);
    return `<div class="cs-section-title"><h4>Tasks & Follow-ups</h4><button class="btn sm" type="button" data-cs-action="task">+ New Task</button></div>${rows.length ? table(['Title','Priority','Due','Status','Assigned','Notes'], rows.map(r => [r.title, r.priority, fmtDate(r.due_date), r.status, r.assigned_to || '—', r.notes || '—'])) : '<div class="cs-empty">No CS tasks yet.</div>'}`;
  }

  function renderRisks(company) {
    const rows = riskRows(company);
    return `<div class="cs-section-title"><h4>Risks & Escalations</h4><button class="btn sm" type="button" data-cs-action="risk">+ New Risk</button></div>${rows.length ? table(['Risk Type','Severity','Status','Due','Owner','Action Plan'], rows.map(r => [r.risk_type, r.severity, r.status, fmtDate(r.due_date), r.owner || '—', r.action_plan || r.description || '—'])) : '<div class="cs-empty">No risks logged.</div>'}`;
  }

  function renderOnboarding(company) {
    const rows = onboardingRows(company);
    return rows.length ? table(['Location','Setup','Training','Go Live','Status','Notes'], rows.map(r => [r.location_name || r.location || '—', r.setup_status || '—', r.training_status || '—', fmtDate(r.go_live_date || r.goLiveDate), r.status || r.onboarding_status || '—', r.notes || r.cs_notes || '—'])) : '<div class="cs-empty">No onboarding rows linked to this client.</div>';
  }

  function renderRenewals(company) {
    const rows = agreementRows(company);
    if (!rows.length) return '<div class="cs-empty">No agreement renewal dates found for this client.</div>';
    return table(['Agreement','Start','End / Renewal','Status','CS Notes'], rows.map(r => [r.agreement_number || r.agreement_id || '—', fmtDate(r.service_start_date || r.start_date || r.agreement_start_date), fmtDate(r.service_end_date || r.end_date || r.agreement_end_date), r.status || r.agreement_status || '—', r.cs_notes || r.notes || '—']));
  }

  function renderQbr(company) {
    const rows = qbrRows(company);
    return `<div class="cs-section-title"><h4>QBR / Business Reviews</h4><button class="btn sm" type="button" data-cs-action="qbr">+ New QBR</button></div>${rows.length ? table(['Meeting','Attendees','Feedback','Decisions','Next QBR'], rows.map(r => [fmtDate(r.meeting_date), r.attendees || '—', r.client_feedback || '—', r.decisions || '—', fmtDate(r.next_qbr_date)])) : '<div class="cs-empty">No QBRs recorded.</div>'}`;
  }

  function renderContacts(company) {
    const rows = contactRows(company);
    return `<div class="cs-section-title"><h4>Client Contacts & Champions</h4><div><button class="btn sm" type="button" data-cs-action="contact-assign">+ Assign Existing Contact</button> <button class="btn ghost sm" type="button" data-cs-action="contact">+ Create Contact</button></div></div>${rows.length ? table(['Name','Title','Role','Influence','Relationship','Email / Phone','Source'], rows.map(r => [r.name, r.title || '—', r.role, r.influence_level, r.relationship_status, [r.email, r.phone].filter(Boolean).join(' / ') || '—', r.source || '—'])) : '<div class="cs-empty">No contacts assigned yet. Assign from Contacts module or create one here.</div>'}`;
  }

  function renderTimeline(company) {
    const items = [];
    reviewRows(company).forEach(r => items.push({ date: r.review_date || r.created_at, title: `${r.review_type} review · ${r.satisfaction_level}`, text: r.summary || r.next_action || r.status }));
    activityRows(company).forEach(r => items.push({ date: r.timestamp || r.created_at, title: r.type_of_support || 'CS Activity', text: r.notes || r.notes_optional || r.support_channel || '' }));
    riskRows(company).forEach(r => items.push({ date: r.created_at, title: `${r.severity} risk · ${r.risk_type}`, text: r.description || r.action_plan || r.status }));
    taskRows(company).forEach(r => items.push({ date: r.due_date || r.created_at, title: `Task · ${r.title}`, text: `${r.status}${r.notes ? ' · ' + r.notes : ''}` }));
    qbrRows(company).forEach(r => items.push({ date: r.meeting_date, title: 'QBR / Business Review', text: r.client_feedback || r.decisions || r.action_items || '' }));
    items.sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')));
    return items.length ? `<div class="cs-timeline">${items.slice(0,120).map(item => `<article class="cs-timeline-item"><div class="cs-timeline-date">${fmtDate(item.date)}</div><div><div class="cs-timeline-title">${esc(item.title)}</div><div class="cs-timeline-text">${esc(item.text || '—')}</div></div></article>`).join('')}</div>` : '<div class="cs-empty">No timeline activity yet.</div>';
  }

  function table(headers, rows) {
    return `<div class="cs-table-wrap"><table class="cs-table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${typeof cell === 'string' && cell.includes('cs-progress') ? cell : esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function progress(value) { const v = clamp(safeNumber(value),0,100); return `<div class="cs-progress" title="${v}%"><span style="width:${v}%"></span></div><div class="cs-kpi-sub">${v}%</div>`; }





  function specialTemplateId(row = {}) { return String(row.id || row.special_client_id || '').trim(); }
  function specialTemplateName(row = {}) { return String(row.client_name || row.client_name || 'Unnamed Special CS Client').trim(); }
  function activeSpecialTemplates() { return (STATE.rows.specialTemplates || []).filter(t => String(t.status || 'active').toLowerCase() === 'active'); }
  function specialTemplateById(id) { const key = String(id || '').trim(); return (STATE.rows.specialTemplates || []).find(t => specialTemplateId(t) === key) || null; }
  function specialGroupsForTemplate(tid) { return (STATE.rows.specialGroups || []).filter(r => String(r.special_client_id || '').trim() === String(tid || '').trim()).sort((a,b)=>safeNumber(a.sort_order)-safeNumber(b.sort_order)||groupName(a).localeCompare(groupName(b))); }
  function specialBrandsForTemplate(tid) { return (STATE.rows.specialBrands || []).filter(r => String(r.special_client_id || '').trim() === String(tid || '').trim()).sort((a,b)=>safeNumber(a.sort_order)-safeNumber(b.sort_order)||brandName(a).localeCompare(brandName(b))); }
  function specialLocationsForTemplate(tid, activeOnly = true) { return (STATE.rows.specialLocations || []).filter(r => String(r.special_client_id || '').trim() === String(tid || '').trim() && (!activeOnly || String(r.status || 'active').toLowerCase() === 'active')).sort((a,b)=>safeNumber(a.sort_order)-safeNumber(b.sort_order)||String(a.location_name||'').localeCompare(String(b.location_name||''))); }
  function specialGroupById(id) { return (STATE.rows.specialGroups || []).find(r => String(r.id || '').trim() === String(id || '').trim()) || null; }
  function specialBrandById(id) { return (STATE.rows.specialBrands || []).find(r => String(r.id || '').trim() === String(id || '').trim()) || null; }
  function specialCompletionTargetKey(target) { return ['special', String(target.special_client_id || '').trim(), String(target.special_location_id || '').trim()].join('|'); }
  function specialCompletionRecordKey(row) { return ['special', String(row.special_client_id || '').trim(), String(row.special_location_id || '').trim()].join('|'); }
  function specialTemplateTargets(template) {
    const tid = specialTemplateId(template);
    return specialLocationsForTemplate(tid, true).map(loc => {
      const group = loc.group_id ? specialGroupById(loc.group_id) : null;
      const brand = loc.brand_id ? specialBrandById(loc.brand_id) : null;
      return applyCs360LocationNameOverride({ company_id: '', company_name: template.client_name || specialTemplateName(template), special_client_id: tid, special_location_id: loc.id, special_group_id: loc.group_id || null, special_brand_id: loc.brand_id || null, location_name: loc.location_name, group_name: groupName(group || { group_name: loc.group_name || '' }) || '', brand_name: brandName(brand || { brand_name: loc.brand_name || '' }) || '', source_type: 'special_client' });
    });
  }
  function renderSpecialTemplates() {
    const q = normalize(STATE.filters.specialTemplateSearch || '');
    const status = String(STATE.filters.specialTemplateStatus || 'active').toLowerCase();
    const rows = (STATE.rows.specialTemplates || []).filter(t => {
      if (status !== 'all' && String(t.status || 'active').toLowerCase() !== status) return false;
      if (!q) return true;
      const tid = specialTemplateId(t);
      return normalize([t.client_name, t.client_name, t.description, ...specialGroupsForTemplate(tid).map(groupName), ...specialBrandsForTemplate(tid).map(brandName), ...specialLocationsForTemplate(tid, false).map(r=>r.location_name)].join(' ')).includes(q);
    });
    const body = rows.length ? rows.map(t => {
      const tid = specialTemplateId(t), groups = specialGroupsForTemplate(tid), brands = specialBrandsForTemplate(tid), locs = specialLocationsForTemplate(tid, false);
      return `<tr><td><strong>${esc(t.client_name)}</strong><small>${esc(t.description || '')}</small></td><td>${esc(groups.map(groupName).join(', ') || '—')}</td><td>${brands.length}</td><td>${locs.length}</td><td><span class="cs-chip ${String(t.status).toLowerCase()==='active'?'cs-chip--healthy':''}">${esc(t.status || 'active')}</span></td><td>${fmtDate(t.updated_at || t.created_at)}</td><td>${canAccess() ? `<button class="btn ghost sm" type="button" data-cs-action="special-client-open" data-special-client-id="${attr(tid)}">Open</button>` : ''} ${canUpdate() ? `<button class="btn ghost sm" type="button" data-cs-action="special-client-edit" data-special-client-id="${attr(tid)}">Edit</button>` : ''} ${canDelete() ? `<button class="btn ghost sm" type="button" data-cs-action="special-client-archive" data-special-client-id="${attr(tid)}">Archive</button>` : ''} ${canCreate() ? `<button class="btn sm" type="button" data-cs-action="special-client-use-completion" data-special-client-id="${attr(tid)}">Use in Completion</button>` : ''} <button class="btn ghost sm" type="button" data-cs-action="special-client-view-report" data-special-client-id="${attr(tid)}">View Report</button></td></tr>`;
    }).join('') : '<tr><td colspan="8" class="cs-empty">No Special CS Clients yet.</td></tr>';
    setTimeout(() => {
      const st = $('csSpecialTemplateStatus'), ss = $('csSpecialTemplateSearch');
      st?.addEventListener('change', () => { STATE.filters.specialTemplateStatus = st.value; renderDetail(); });
      ss?.addEventListener('input', () => { STATE.filters.specialTemplateSearch = ss.value; renderDetail(); });
    });
    return `<div class="cs-section-title"><div><h4>Special CS Clients</h4><div class="cs-kpi-sub">Standalone special Customer Success clients that do not require signed agreements, invoices, or active invoice periods.</div></div>${canCreate() ? '<button class="btn sm primary" type="button" data-cs-action="special-client-create">Add Special CS Client</button>' : ''}</div>
      <div class="cs-filter-grid cs-special-filter"><select id="csSpecialTemplateStatus" class="select"><option value="active" ${status==='active'?'selected':''}>Active clients</option><option value="archived" ${status==='archived'?'selected':''}>Archived clients</option><option value="all" ${status==='all'?'selected':''}>All clients</option></select><input id="csSpecialTemplateSearch" class="input" type="search" value="${attr(STATE.filters.specialTemplateSearch || '')}" placeholder="Search client/group/brand/location" /></div>
      <div class="cs-table-wrap"><table class="cs-table"><thead><tr><th>Client Name</th><th>Group Name</th><th>Brands Count</th><th>Locations Count</th><th>Status</th><th>Updated At</th><th>Actions</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function openCompletionExportForm() {
    const company = getSelectedCompany();
    if (!company) { toast('Select a client first.'); return; }

    const selectedGroupIdFromFilter = String(STATE.filters.group || '').trim();
    const selectedGroup = selectedGroupIdFromFilter && !['All','Ungrouped'].includes(selectedGroupIdFromFilter)
      ? groupById(selectedGroupIdFromFilter)
      : null;
    const groups = activeGroups();
    const brands = activeBrandsForSelect(company);
    const groupOptions = groups.length
      ? groups.map(group => `<option value="${attr(groupId(group))}" ${selectedGroup && groupId(group) === groupId(selectedGroup) ? 'selected' : ''}>${esc(groupName(group))}</option>`).join('')
      : '<option value="">No CS groups yet</option>';
    const brandOptions = brands.length
      ? brands.map(brand => `<option value="${attr(brandId(brand))}">${esc(brandName(brand))} · ${esc(brandScopeLabel(brand))}</option>`).join('')
      : '<option value="">No CS brands yet</option>';

    openModal('Export Completion Report', `<form class="cs-form" id="csCompletionExportForm">
      <div class="cs-form-grid">
        <div class="cs-form-field cs-form-field--full">
          <label>Report Type</label>
          <select name="report_type" class="select">
            <option value="client">Client Completion Report</option>
            <option value="group" ${groups.length ? '' : 'disabled'} ${selectedGroup ? 'selected' : ''}>Group Completion Report</option>
            <option value="brand" ${brands.length ? '' : 'disabled'}>Brand / Sub-group Completion Report</option>
            <option value="special_client" ${activeSpecialTemplates().length ? '' : 'disabled'}>Special CS Client Completion Report</option>
          </select>
        </div>
        <div class="cs-form-field cs-form-field--full" id="csExportClientField">
          <label>Client</label>
          <input class="input" type="text" value="${attr(companyName(company))}" readonly />
        </div>
        <div class="cs-form-field cs-form-field--full" id="csExportGroupField" style="display:none;">
          <label>CS Client Group</label>
          <select name="group_id" class="select">${groupOptions}</select>
        </div>
        <div class="cs-form-field cs-form-field--full" id="csExportBrandField" style="display:none;">
          <label>Brand / Sub-group</label>
          <select name="brand_id" class="select">${brandOptions}</select>
        </div>
        <div class="cs-form-field cs-form-field--full" id="csExportSpecialField" style="display:none;">
          ${specialClientSelectInput()}
        </div>
        <div class="cs-form-field cs-form-field--full">
          <label>Report Notes</label>
          <div class="cs-mini-note">
            Client report exports the selected client. Group report exports the selected group and includes brand insights if brands are configured. Brand report exports one brand/sub-group such as Kcal KSA or Kcal UAE.
          </div>
        </div>
      </div>
      <div class="cs-modal-actions">
        <button type="button" class="btn ghost" onclick="document.getElementById('csModalClose').click()">Cancel</button>
        <button type="submit" class="btn primary">Export Report</button>
      </div>
    </form>`, async form => {
      const fd = new FormData(form);
      const type = String(fd.get('report_type') || 'client');
      const groupId = type === 'group' ? String(fd.get('group_id') || '').trim() : '';
      const brandId = type === 'brand' ? String(fd.get('brand_id') || '').trim() : '';
      const specialTemplateIdValue = type === 'special_client' ? String(fd.get('special_client_id') || '').trim() : '';
      if (type === 'group' && !groupId) { toast('Select a CS client group to export.'); return; }
      if (type === 'brand' && !brandId) { toast('Select a brand/sub-group to export.'); return; }
      if (type === 'special_client' && !specialTemplateIdValue) { toast('Select a Special CS Client to export.'); return; }
      closeModal();
      exportCompletionReport({
        report_type: type,
        group_id: groupId,
        brand_id: brandId,
        special_client_id: specialTemplateIdValue
      });
    });

    const form = $('csCompletionExportForm');
    const toggle = () => {
      const type = form?.report_type?.value || 'client';
      const groupField = $('csExportGroupField');
      const brandField = $('csExportBrandField');
      const specialField = $('csExportSpecialField');
      if (groupField) groupField.style.display = type === 'group' ? '' : 'none';
      if (brandField) brandField.style.display = type === 'brand' ? '' : 'none';
      if (specialField) specialField.style.display = type === 'special_client' ? '' : 'none';
    };
    form?.report_type?.addEventListener('change', toggle);
    toggle();
  }

  function exportCompletionReport(exportOptions = {}) {
    const selectedCompany = getSelectedCompany();
    if (!selectedCompany) { toast('Select a client first.'); return; }

    const options = typeof exportOptions === 'string'
      ? { report_type: exportOptions ? 'brand' : '', brand_id: exportOptions }
      : (exportOptions || {});
    const requestedType = String(options.report_type || '').trim();
    const selectedBrand = options.brand_id ? brandById(options.brand_id) : null;
    const filterGroupId = String(STATE.filters.group || '').trim();
    const explicitGroupId = String(options.group_id || '').trim();
    const selectedGroupId = explicitGroupId || (!requestedType && filterGroupId && !['All','Ungrouped'].includes(filterGroupId) ? filterGroupId : '');
    const selectedGroup = selectedGroupId ? groupById(selectedGroupId) : null;

    const selectedSpecialTemplate = options.special_client_id ? specialTemplateById(options.special_client_id) : null;
    let isSpecialTemplateReport = requestedType === 'special_client' || Boolean(selectedSpecialTemplate);
    let isBrandReport = !isSpecialTemplateReport && (requestedType === 'brand' || Boolean(selectedBrand));
    let isGroupReport = !isSpecialTemplateReport && !isBrandReport && (requestedType === 'group' || Boolean(selectedGroup));
    if (requestedType === 'client') { isBrandReport = false; isGroupReport = false; }
    if (isSpecialTemplateReport && !selectedSpecialTemplate) { toast('Select a valid Special CS Client to export.'); return; }
    if (isBrandReport && !selectedBrand) { toast('Select a valid brand to export.'); return; }
    if (isGroupReport && !selectedGroup) { toast('Select a valid CS client group to export.'); return; }
    const generatedAt = new Date();

    const completionKey = row => [row.review_type || 'weekly', String(row.period_start || '').slice(0,10), String(row.period_end || '').slice(0,10)].join('|');
    const sortCompletionRows = rows => rows.slice().sort((a,b) => String(b.period_end || b.updated_at || b.created_at || '').localeCompare(String(a.period_end || a.updated_at || a.created_at || '')));

    let reportName = companyName(selectedCompany);
    let clientLabel = companyName(selectedCompany);
    let groupLabel = groupsForCompany(selectedCompany).map(groupName).join(', ') || 'Ungrouped';
    let targetRows = currentClientCompletionTargets(selectedCompany);
    let rawRecords = latestCompletionPeriodRows(selectedCompany).filter(row => String(row.source_type || 'normal') !== 'special_client').map(row => ({ ...row, company_name: companyName(selectedCompany) }));
    let activePeriodKey = rawRecords[0] ? completionKey(rawRecords[0]) : '';

    if (isSpecialTemplateReport) {
      const tid = specialTemplateId(selectedSpecialTemplate);
      reportName = selectedSpecialTemplate.client_name || specialTemplateName(selectedSpecialTemplate);
      clientLabel = selectedSpecialTemplate.client_name || specialTemplateName(selectedSpecialTemplate);
      groupLabel = specialGroupsForTemplate(tid).map(groupName).join(', ') || 'No group';
      targetRows = specialTemplateTargets(selectedSpecialTemplate);
      const sorted = sortCompletionRows((STATE.rows.completions || []).filter(row => String(row.source_type || '') === 'special_client' && String(row.special_client_id || '').trim() === tid));
      activePeriodKey = sorted[0] ? completionKey(sorted[0]) : '';
      rawRecords = activePeriodKey ? sorted.filter(row => completionKey(row) === activePeriodKey) : [];
      isBrandReport = false;
      isGroupReport = false;
    }

    if (isBrandReport) {
      const brandTargets = brandCompletionTargets(selectedBrand);
      const targetKeys = new Set(brandTargets.map(completionTargetKey));
      reportName = brandName(selectedBrand);
      groupLabel = selectedBrand.group_id ? groupName(groupById(selectedBrand.group_id) || {}) : brandScopeLabel(selectedBrand);
      clientLabel = `${brandTargets.length} brand location${brandTargets.length === 1 ? '' : 's'}`;
      targetRows = brandTargets;
      const allBrandRecords = (STATE.rows.completions || []).filter(row => targetKeys.has([String(row.company_id || '').trim(), normalize(row.location_name)].join('|')));
      const sorted = sortCompletionRows(allBrandRecords);
      activePeriodKey = sorted[0] ? completionKey(sorted[0]) : '';
      rawRecords = activePeriodKey ? sorted.filter(row => completionKey(row) === activePeriodKey) : [];
      isGroupReport = false;
    }

    if (!isBrandReport && isGroupReport) {
      const members = groupMemberCompanies(selectedGroup);
      const memberIds = new Set(members.map(companyId));
      const memberNames = new Set(members.map(c => normalize(companyName(c))));
      reportName = groupName(selectedGroup);
      groupLabel = groupName(selectedGroup);
      clientLabel = `${members.length} signed client${members.length === 1 ? '' : 's'}`;
      targetRows = groupCompletionTargets(selectedGroup);
      const allGroupRecords = (STATE.rows.completions || []).filter(row => {
        const rowCompanyId = String(row.company_id || '').trim();
        const rowCompanyName = normalize(row.company_name_snapshot || row.company_name || row.client_name || '');
        return (rowCompanyId && memberIds.has(rowCompanyId)) || (rowCompanyName && memberNames.has(rowCompanyName));
      });
      const sorted = sortCompletionRows(allGroupRecords);
      activePeriodKey = sorted[0] ? completionKey(sorted[0]) : '';
      rawRecords = activePeriodKey ? sorted.filter(row => completionKey(row) === activePeriodKey) : [];
    }

    if (!targetRows.length) {
      toast('No locations found for this export type. Check client/group/brand location assignment.');
      return;
    }

    targetRows = targetRows.map(applyCs360LocationNameOverride);
    rawRecords = rawRecords.map(applyCs360LocationNameOverride);

    const recordByTarget = new Map();
    rawRecords.forEach(row => {
      const key = String(row.source_type || '') === 'special_client' ? specialCompletionRecordKey(row) : [String(row.company_id || '').trim(), normalize(row.location_name)].join('|');
      if (key !== '|' && key !== 'special||') recordByTarget.set(key, row);
      const fallbackKey = ['name', normalize(row.company_name_snapshot || row.company_name || ''), normalize(row.location_name)].join('|');
      recordByTarget.set(fallbackKey, row);
    });

    const rows = targetRows.map(target => {
      const directKey = target.source_type === 'special_client' ? specialCompletionTargetKey(target) : completionTargetKey(target);
      const nameKey = ['name', normalize(target.company_name), normalize(target.location_name)].join('|');
      const saved = recordByTarget.get(directKey) || recordByTarget.get(nameKey) || {};
      return {
        company_id: target.company_id,
        company_name: target.company_name,
        location_name: target.location_name,
        service_start_date: target.service_start_date || saved.service_start_date || '',
        service_end_date: target.service_end_date || saved.service_end_date || '',
        done_on_time: saved.done_on_time ?? 0,
        done_late: saved.done_late ?? 0,
        partially_done: saved.partially_done ?? 0,
        missed: saved.missed ?? 0,
        review_type: saved.review_type || rawRecords[0]?.review_type || 'weekly',
        period_start: saved.period_start || rawRecords[0]?.period_start || '',
        period_end: saved.period_end || rawRecords[0]?.period_end || '',
        source_note: saved.source_note || ''
      };
    });

    const hydrateCompletionTargets = targets => targets.map(target => {
      const directKey = target.source_type === 'special_client' ? specialCompletionTargetKey(target) : completionTargetKey(target);
      const nameKey = ['name', normalize(target.company_name), normalize(target.location_name)].join('|');
      const saved = recordByTarget.get(directKey) || recordByTarget.get(nameKey) || {};
      return {
        company_id: target.company_id,
        company_name: target.company_name,
        location_name: target.location_name,
        service_start_date: target.service_start_date || saved.service_start_date || '',
        service_end_date: target.service_end_date || saved.service_end_date || '',
        done_on_time: saved.done_on_time ?? 0,
        done_late: saved.done_late ?? 0,
        partially_done: saved.partially_done ?? 0,
        missed: saved.missed ?? 0,
        review_type: saved.review_type || rawRecords[0]?.review_type || 'weekly',
        period_start: saved.period_start || rawRecords[0]?.period_start || '',
        period_end: saved.period_end || rawRecords[0]?.period_end || '',
        source_note: saved.source_note || ''
      };
    });

    const reportTargetKeySet = new Set(targetRows.map(target => target.source_type === 'special_client' ? specialCompletionTargetKey(target) : completionTargetKey(target)));
    const brandCandidateMap = new Map();
    const addBrandCandidate = brand => {
      if (!brand) return;
      const id = brandId(brand);
      if (id && !brandCandidateMap.has(id)) brandCandidateMap.set(id, brand);
    };

    if (isBrandReport) {
      addBrandCandidate(selectedBrand);
    } else if (isGroupReport) {
      // Group report must show the full brand split:
      // 1) brands created directly under the group
      // 2) brands created under any signed client inside the group
      // 3) brands referenced by assigned brand-location rows within the group target locations
      brandsForGroup(selectedGroup).forEach(addBrandCandidate);
      groupMemberCompanies(selectedGroup).forEach(member => brandsForCompany(member).forEach(addBrandCandidate));
      (STATE.rows.brandLocations || []).forEach(row => {
        const key = [String(row.company_id || '').trim(), normalize(row.location_name)].join('|');
        if (reportTargetKeySet.has(key)) addBrandCandidate(brandById(row.brand_id) || { id: row.brand_id, brand_name: row.brand_name_snapshot || 'Unknown Brand' });
      });
    } else {
      if (isSpecialTemplateReport) {
        specialBrandsForTemplate(specialTemplateId(selectedSpecialTemplate)).forEach(addBrandCandidate);
    } else {
      brandsForCompany(selectedCompany).forEach(addBrandCandidate);
      }
    }

    const brandRows = Array.from(brandCandidateMap.values()).map(brand => {
      const brandTargets = isSpecialTemplateReport ? specialTemplateTargets(selectedSpecialTemplate).filter(t => normalize(t.brand_name) === normalize(brandName(brand))) : brandCompletionTargets(brand);
      const scopedTargets = brandTargets.filter(target => !reportTargetKeySet.size || reportTargetKeySet.has(target.source_type === 'special_client' ? specialCompletionTargetKey(target) : completionTargetKey(target)));
      const brandLocations = hydrateCompletionTargets(scopedTargets);
      const brandStats = averageCompletionMetrics(brandLocations);
      const bestLocation = brandLocations.length ? brandLocations.slice().sort((a,b) => completionCount(b) - completionCount(a))[0] : null;
      const weakLocations = brandLocations.filter(row => completionCount(row) < 80).sort((a,b) => completionCount(a) - completionCount(b)).slice(0, 3);
      return { brand, brand_name: brandName(brand), scope: isSpecialTemplateReport ? `Special CS Client: ${specialTemplateName(selectedSpecialTemplate)}` : brandScopeLabel(brand), locations: brandLocations, stats: brandStats, bestLocation, weakLocations };
    }).filter(item => item.locations.length);

    if ((isGroupReport || !isBrandReport) && reportTargetKeySet.size) {
      const coveredKeys = new Set();
      brandRows.forEach(item => item.locations.forEach(row => coveredKeys.add(row.source_type === 'special_client' ? specialCompletionTargetKey(row) : completionTargetKey(row))));
      const unassignedTargets = targetRows.filter(target => !coveredKeys.has(target.source_type === 'special_client' ? specialCompletionTargetKey(target) : completionTargetKey(target)));
      if (unassignedTargets.length) {
        const unassignedLocations = hydrateCompletionTargets(unassignedTargets);
        const unassignedStats = averageCompletionMetrics(unassignedLocations);
        brandRows.push({
          brand: { id: 'unassigned', brand_name: 'Unassigned Locations' },
          brand_name: 'Unassigned Locations',
          scope: isGroupReport ? `Group: ${groupName(selectedGroup)}` : `Client: ${companyName(selectedCompany)}`,
          locations: unassignedLocations,
          stats: unassignedStats,
          bestLocation: unassignedLocations.length ? unassignedLocations.slice().sort((a,b) => completionCount(b) - completionCount(a))[0] : null,
          weakLocations: unassignedLocations.filter(row => completionCount(row) < 80).sort((a,b) => completionCount(a) - completionCount(b)).slice(0, 3),
          is_unassigned: true
        });
      }
    }
    const bestBrand = brandRows.length ? brandRows.slice().sort((a,b) => b.stats.completion - a.stats.completion)[0] : null;
    const weakestBrand = brandRows.length ? brandRows.slice().sort((a,b) => a.stats.completion - b.stats.completion)[0] : null;
    const brandGap = bestBrand && weakestBrand ? Math.max(0, bestBrand.stats.completion - weakestBrand.stats.completion) : 0;
    const hasBrandComparison = brandRows.length > 1;
    const brandMetaCardsHtml = hasBrandComparison
      ? `<div class="meta"><div class="k">Best Brand</div><div class="v">${bestBrand ? esc(bestBrand.brand_name) : '—'}</div></div>
          <div class="meta"><div class="k">Lowest Brand</div><div class="v">${weakestBrand ? esc(weakestBrand.brand_name) : '—'}</div></div>
          <div class="meta"><div class="k">Gap</div><div class="v">${brandGap.toFixed(2)}%</div></div>`
      : '';
    const operationalAttentionCount = weakestBrand ? weakestBrand.weakLocations.length : 0;
    const operationalAttentionTotal = weakestBrand ? Math.max(weakestBrand.locations.length, 1) : 1;
    const operationalAttentionPct = weakestBrand ? (operationalAttentionCount * 100 / operationalAttentionTotal) : 0;
    const brandComparisonHtml = hasBrandComparison
      ? `<div class="brand-overview">
          <div class="brand-insight good"><h3>Top performing brand</h3><div class="big">${bestBrand ? `${bestBrand.stats.completion.toFixed(2)}%` : '—'}</div><p>${bestBrand ? `${esc(bestBrand.brand_name)} · ${bestBrand.locations.length} locations` : 'No brand data yet.'}</p></div>
          <div class="brand-insight warn"><h3>Needs operational attention</h3><div class="big">${weakestBrand ? `${operationalAttentionCount} ${operationalAttentionCount === 1 ? 'location' : 'locations'}` : '—'}</div><p>${weakestBrand ? `${esc(weakestBrand.brand_name)} · ${operationalAttentionCount} of ${weakestBrand.locations.length} locations (${operationalAttentionPct.toFixed(2)}%) need operational attention` : 'No brand data yet.'}</p></div>
          <div class="brand-insight info"><h3>Brand performance gap</h3><div class="big">${brandGap.toFixed(2)}%</div><p>${brandGap >= 15 ? 'Large gap: review playbook/training by brand.' : 'Gap is within normal monitoring range.'}</p></div>
        </div>`
      : '';

    const stats = averageCompletionMetrics(rows);
    const reportType = rawRecords[0]?.review_type || rows[0]?.review_type || 'weekly';
    const periodStart = rawRecords[0]?.period_start || rows[0]?.period_start || '';
    const periodEnd = rawRecords[0]?.period_end || rows[0]?.period_end || '';
    const periodLabel = periodStart || periodEnd ? `${fmtDate(periodStart)} to ${fmtDate(periodEnd)}` : 'No period saved yet';
    const best = rows.length ? rows.slice().sort((a,b) => completionCount(b) - completionCount(a))[0] : null;
    const weak = rows.slice().filter(row => completionCount(row) < 80).sort((a,b) => completionCount(a) - completionCount(b)).slice(0, 3);
    const health = computeHealth(selectedCompany);
    const effort = isGroupReport ? 'Group Review' : computeEffort(selectedCompany);
    const reportTitleSuffix = isSpecialTemplateReport ? 'Special CS Client Completion Report' : (isBrandReport ? 'Brand Completion Report' : (isGroupReport ? 'Group Completion Report' : 'Client Completion Report'));
    const sourceNote = rawRecords.find(r => r.source_note)?.source_note || 'Completion values are entered as percentages.';
    const safeWidth = value => `${clamp(safeDecimal(value), 0, 100).toFixed(2)}%`;
    const stackParts = [
      { key: 'done_on_time', label: 'Done On-Time', value: clamp(safeDecimal(stats.done_on_time), 0, 100), color: '#42a642' },
      { key: 'done_late', label: 'Done Late', value: clamp(safeDecimal(stats.done_late), 0, 100), color: '#ef7d17' },
      { key: 'partially_done', label: 'Partially Done', value: clamp(safeDecimal(stats.partially_done), 0, 100), color: '#7d55b4' },
      { key: 'missed', label: 'Missed', value: clamp(safeDecimal(stats.missed), 0, 100), color: '#d93545' }
    ];
    let stackCursor = 0;
    const stackSvgSegments = stackParts.map(part => {
      const width = Math.max(0, Math.min(1000 - stackCursor, part.value * 10));
      const x = stackCursor;
      stackCursor += width;
      const textX = x + (width / 2);
      const label = `${part.value.toFixed(2)}%`;
      const showInside = width >= 56;
      return `<g><rect x="${x.toFixed(2)}" y="0" width="${width.toFixed(2)}" height="58" fill="${part.color}"></rect>${showInside ? `<text x="${textX.toFixed(2)}" y="34" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-size="15" font-weight="800">${label}</text>` : ''}</g>`;
    }).join('');
    const stackSvgMarkers = '';
    const stackSvg = `<svg class="stack-svg" viewBox="0 0 1000 86" preserveAspectRatio="none" role="img" aria-label="Completion breakdown"><rect x="0" y="0" width="1000" height="58" rx="10" ry="10" fill="#eef2f7"></rect>${stackSvgSegments}${stackSvgMarkers}</svg>`;
    const completionDonutStyle = `background: conic-gradient(var(--good) 0 ${safeWidth(stats.completion)}, #e8eef7 ${safeWidth(stats.completion)} 100%);`;
    const exportBaseHref = new URL('.', window.location.href).href;

    const reportHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<base href="${attr(exportBaseHref)}" />
<title>Completion Report - ${esc(reportName)}</title>
<style>
  @page{size:A4 landscape;margin:7mm}
  :root{--brand:#0b4ea2;--brand2:#276ef1;--ink:#071a44;--text:#24324b;--muted:#667085;--line:#dfe7f2;--soft:#f5f8fc;--card:#fff;--good:#42a642;--late:#276ef1;--partial:#ef7d17;--miss:#d93545;--shadow:0 12px 28px rgba(18,42,88,.07)}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
  html,body{margin:0;background:#eef3f8;color:var(--text);font-family:Inter,Segoe UI,Arial,sans-serif}
  body{font-size:12px}
  .report-document{width:100%;padding:14px}
  .report-page{width:281mm;min-height:194mm;margin:0 auto 14px;background:#fff;border:1px solid var(--line);border-radius:18px;padding:10mm;box-shadow:var(--shadow);page-break-after:always;break-after:page;overflow:hidden}
  .report-page:last-child{page-break-after:auto;break-after:auto}
  .report-header{display:grid;grid-template-columns:56mm 1fr;gap:8mm;align-items:start;border-bottom:1px solid var(--line);padding-bottom:6mm;margin-bottom:5mm}
  .brand{min-height:30mm;display:flex;align-items:flex-start;justify-content:flex-start}.brand [data-incheck360-doc-logo-slot],.brand [data-incheck360-doc-logo],.brand .cs-export-doc-logo-slot{display:flex;align-items:flex-start;justify-content:flex-start;width:54mm;min-height:30mm}.brand .incheck360-doc-logo-wrap,.brand .cs-export-doc-logo-wrap{width:54mm!important;max-width:54mm!important;height:30mm!important;max-height:30mm!important;display:flex;align-items:flex-start;justify-content:flex-start}.brand .incheck360-doc-logo,.brand .cs-export-doc-logo{max-width:50mm!important;max-height:27mm!important;width:auto!important;height:auto!important;object-fit:contain;object-position:left top;display:block}.brand-fallback{font-size:20px;font-weight:900;color:var(--ink)}.brand-fallback span{color:var(--brand2)}
  .header-main{min-width:0}.header-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.title h1{margin:0;color:var(--ink);font-size:28px;line-height:1.05;letter-spacing:.02em}.title .subtitle{margin-top:5px;color:var(--muted);font-size:11.5px;line-height:1.35}.meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:10px}.meta{border:1px solid var(--line);border-radius:12px;background:#fbfdff;padding:8px 10px;min-height:42px}.meta .k{font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:4px}.meta .v{font-weight:900;color:var(--ink);font-size:12px;line-height:1.25}
  .actions{width:281mm;margin:0 auto 10px;display:flex;justify-content:flex-end;gap:10px}.btn{border:1px solid var(--line);border-radius:12px;padding:9px 13px;font-weight:900;cursor:pointer;background:#fff;color:var(--brand)}.btn.primary{background:var(--brand);color:#fff;border-color:var(--brand)}.print-hint{margin-right:auto;color:var(--muted);font-size:12px;align-self:center}
  .kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-bottom:5mm}.kpi{border:1px solid var(--line);border-radius:14px;padding:9px 10px;background:#fff;min-height:64px}.kpi .label{font-size:9.5px;font-weight:850;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}.kpi .value{font-size:20px;font-weight:950;margin-top:6px;color:var(--brand)}.kpi .value.good{color:var(--good)}.kpi .value.late{color:var(--late)}.kpi .value.partial{color:var(--partial)}.kpi .value.miss{color:var(--miss)}
  .summary-grid{display:grid;grid-template-columns:.95fr 1.25fr .85fr;gap:5mm}.panel{background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden}.panel-inner{padding:13px}.section-title{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin:0 0 12px}.section-title h2{margin:0;color:var(--ink);font-size:15px}.section-title .note{color:var(--muted);font-size:10.5px}
  .donut-wrap{display:flex;align-items:center;gap:18px}.donut{width:120px;height:120px;border-radius:50%;position:relative;flex:0 0 auto}.donut:after{content:"";position:absolute;inset:28px;background:#fff;border-radius:50%;box-shadow:0 0 0 1px var(--line)}.donut-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2;text-align:center;color:var(--ink);font-weight:950;font-size:20px}.donut-center span{font-size:10px;color:var(--muted);font-weight:800;margin-top:4px}.legend{display:grid;gap:8px;min-width:160px}.legend-row{display:grid;grid-template-columns:10px 1fr auto;gap:8px;align-items:center;font-size:11.5px}.dot{width:8px;height:8px;border-radius:50%}.dot.good{background:var(--good)}.dot.late{background:var(--late)}.dot.partial{background:var(--partial)}.dot.miss{background:var(--miss)}
  .stack{height:64px;border-radius:10px;overflow:visible;margin:16px 0 7px}.stack-svg{display:block;width:100%;height:64px;overflow:visible}.axis{display:flex;justify-content:space-between;color:var(--muted);font-size:10px;border-top:1px solid var(--line);padding-top:6px}.stack-legend{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 14px;margin-top:10px;color:var(--text);font-size:11px}.stack-legend span{display:flex;gap:7px;align-items:center;justify-content:space-between}.stack-legend span i{flex:0 0 auto}.stack-legend b{margin-left:auto}
  .summary-card .summary-line{display:grid;grid-template-columns:24px 1fr auto;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)}.mini-icon{width:22px;height:22px;border-radius:8px;background:#eef5ff;color:var(--brand);display:flex;align-items:center;justify-content:center;font-weight:900}.summary-line strong{font-size:15px}.summary-total{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;margin-top:12px}.summary-total .big{font-size:26px;color:var(--good);font-weight:950}.tiny{font-size:10px;color:var(--muted)}
  .insights{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm;margin-top:5mm}.insight{border:1px solid var(--line);border-radius:14px;padding:12px;background:#fff;display:grid;grid-template-columns:30px 1fr;gap:10px;min-height:72px}.insight.good-bg{background:linear-gradient(135deg,#f4fbf6,#fff)}.insight.warn-bg{background:linear-gradient(135deg,#fff7ed,#fff)}.insight.info-bg{background:linear-gradient(135deg,#f3f7ff,#fff)}.insight .big-icon{font-size:22px}.insight h3{margin:0 0 5px;color:var(--ink);font-size:12px}.insight p{margin:0;color:var(--text);font-size:11px;line-height:1.4}
  .table-page{overflow:visible}.table-page .report-header{margin-bottom:3mm}.table-wrap{border:1px solid var(--line);border-radius:14px;overflow:hidden}.report-table{width:100%;border-collapse:collapse;table-layout:fixed}.report-table thead{display:table-header-group}.report-table tr{break-inside:avoid;page-break-inside:avoid}.report-table th{background:var(--brand);color:#fff;text-align:left;font-size:9.5px;letter-spacing:.04em;text-transform:uppercase;padding:7px 8px}.report-table td{padding:7px 8px;border-bottom:1px solid var(--line);font-size:10.8px;line-height:1.25;vertical-align:middle}.report-table tbody tr:nth-child(even){background:#fbfdff}.report-table .num{width:32px;text-align:center}.report-table .client-col{width:25%}.report-table .location-col{width:17%}.report-table .pct{text-align:right;white-space:nowrap}.report-table .completion-cell{font-weight:950;color:var(--good)}
  .brand-page .brand-overview{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5mm;margin-bottom:5mm}.brand-insight{border:1px solid var(--line);border-radius:14px;padding:12px;background:#fff;min-height:76px}.brand-insight h3{margin:0 0 6px;color:var(--ink);font-size:12px}.brand-insight .big{font-size:24px;font-weight:950;color:var(--brand)}.brand-insight.good{background:linear-gradient(135deg,#f0fdf4,#fff)}.brand-insight.warn{background:linear-gradient(135deg,#fff7ed,#fff)}.brand-insight.info{background:linear-gradient(135deg,#eff6ff,#fff)}.brand-table .brand-name{font-weight:950;color:var(--ink)}.brand-table .brand-scope{display:block;color:var(--muted);font-size:9.5px;margin-top:2px}.brand-table .low{color:var(--miss);font-weight:950}.brand-table .ok{color:var(--good);font-weight:950}.brand-mini-list{margin:6px 0 0;padding-left:16px;color:var(--text);font-size:10.5px;line-height:1.45}
  .footer{display:flex;justify-content:space-between;color:var(--muted);font-size:10px;margin-top:5mm;padding-top:3mm;border-top:1px solid var(--line)}
  @media screen{.report-page{box-shadow:0 14px 40px rgba(18,42,88,.10)}}
  @media print{html,body{width:297mm;background:#fff}.actions{display:none!important}.report-document{padding:0}.report-page{width:auto;min-height:auto;margin:0;border:0;border-radius:0;box-shadow:none;padding:0;page-break-after:always;break-after:page;overflow:visible}.report-page:last-child{page-break-after:auto;break-after:auto}.report-header{break-inside:avoid;page-break-inside:avoid}.kpis,.summary-grid,.insights,.panel{break-inside:avoid;page-break-inside:avoid}.summary-page{height:194mm}.table-page{height:auto}.report-table th{font-size:9px;padding:6px 7px}.report-table td{font-size:10px;padding:6px 7px}.stack{height:58px}.stack-svg{height:58px}}
</style></head><body>
<div class="actions"><span class="print-hint">PDF layout is optimized for A4 Landscape. In Chrome print settings, use Landscape + A4 and turn off Headers and Footers.</span><button class="btn" onclick="window.close()">Close</button><button class="btn primary" onclick="window.print()">Print / Save PDF</button></div>
<div class="report-document">
  <section class="report-page summary-page">
    <div class="report-header">
      <div class="brand"><div class="cs-export-doc-logo-slot" data-incheck360-doc-logo-slot></div><div class="brand-fallback" style="display:none;">InCheck <span>360</span></div></div>
      <div class="header-main">
        <div class="header-row">
          <div class="title"><h1>Completion Report</h1><div class="subtitle">${esc(reportTitleSuffix)} · Completion = Done On-Time + Done Late · Values are percentages.</div></div>
        </div>
        <div class="meta-grid">
          <div class="meta"><div class="k">${isSpecialTemplateReport ? 'Special CS Client' : (isBrandReport ? 'Brand' : (isGroupReport ? 'Group' : 'Client'))}</div><div class="v">${esc(reportName)}</div></div>
          <div class="meta"><div class="k">Review Type</div><div class="v">${esc(String(reportType || 'weekly').replace(/^./, c => c.toUpperCase()))}</div></div>
          <div class="meta"><div class="k">Period</div><div class="v">${esc(periodLabel)}</div></div>
          ${isSpecialTemplateReport ? `<div class="meta"><div class="k">Client Name</div><div class="v">${esc(specialTemplateName(selectedSpecialTemplate))}</div></div>` : ''}
        </div>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="label">Average Completion</div><div class="value">${stats.completion.toFixed(2)}%</div></div>
      <div class="kpi"><div class="label">Done On-Time</div><div class="value good">${stats.done_on_time.toFixed(2)}%</div></div>
      <div class="kpi"><div class="label">Done Late</div><div class="value late">${stats.done_late.toFixed(2)}%</div></div>
      <div class="kpi"><div class="label">Partially Done</div><div class="value partial">${stats.partially_done.toFixed(2)}%</div></div>
      <div class="kpi"><div class="label">Missed</div><div class="value miss">${stats.missed.toFixed(2)}%</div></div>
      <div class="kpi"><div class="label">Active Locations</div><div class="value">${rows.length}</div></div>
    </div>

    <div class="summary-grid">
      <div class="panel"><div class="panel-inner">
        <div class="section-title"><h2>Overall Completion</h2><span class="note">average</span></div>
        <div class="donut-wrap"><div class="donut" style="${completionDonutStyle}"><div class="donut-center">${stats.completion.toFixed(2)}%<span>Completion</span></div></div>
        <div class="legend">
          <div class="legend-row"><i class="dot good"></i><span>Completion</span><strong>${stats.completion.toFixed(2)}%</strong></div>
          <div class="legend-row"><i class="dot miss" style="background:#e8eef7"></i><span>Remaining</span><strong>${(100 - clamp(stats.completion, 0, 100)).toFixed(2)}%</strong></div>
        </div></div>
      </div></div>

      <div class="panel"><div class="panel-inner">
        <div class="section-title"><h2>Completion Breakdown</h2><span class="note">Done On-Time + Done Late = Completion</span></div>
        <div class="stack">${stackSvg}</div>
        <div class="axis"><span>0%</span><span>20%</span><span>40%</span><span>60%</span><span>80%</span><span>100%</span></div>
        <div class="stack-legend">
          <span><i class="dot good"></i>Done On-Time <b>${stats.done_on_time.toFixed(2)}%</b></span>
          <span><i class="dot late"></i>Done Late <b>${stats.done_late.toFixed(2)}%</b></span>
          <span><i class="dot partial"></i>Partially Done <b>${stats.partially_done.toFixed(2)}%</b></span>
          <span><i class="dot miss"></i>Missed <b>${stats.missed.toFixed(2)}%</b></span>
        </div>
      </div></div>

      <div class="panel summary-card"><div class="panel-inner">
        <div class="section-title"><h2>${isSpecialTemplateReport ? 'All Special Client Locations' : (isGroupReport ? 'All Group Locations' : 'All Client Locations')}</h2></div>
        <div class="tiny">Average of ${rows.length} active location${rows.length === 1 ? '' : 's'}</div>
        <div class="summary-line"><span class="mini-icon">✓</span><span>Done On-Time</span><strong style="color:var(--good)">${stats.done_on_time.toFixed(2)}%</strong></div>
        <div class="summary-line"><span class="mini-icon">◷</span><span>Done Late</span><strong style="color:var(--late)">${stats.done_late.toFixed(2)}%</strong></div>
        <div class="summary-line"><span class="mini-icon">◔</span><span>Partially Done</span><strong style="color:var(--partial)">${stats.partially_done.toFixed(2)}%</strong></div>
        <div class="summary-line"><span class="mini-icon">×</span><span>Missed</span><strong style="color:var(--miss)">${stats.missed.toFixed(2)}%</strong></div>
        <div class="summary-total"><div><strong>Completion</strong><div class="tiny">Done On-Time + Done Late</div></div><div class="big">${stats.completion.toFixed(2)}%</div></div>
      </div></div>
    </div>

    <div class="insights">
      <div class="insight good-bg"><div class="big-icon">🏆</div><div><h3>Best performing location</h3><p>${best ? `${esc(best.company_name || reportName)} — ${esc(best.location_name)}<br/>Completion: <strong>${formatPct(completionCount(best))}</strong>` : 'No location data available yet.'}</p></div></div>
      <div class="insight warn-bg"><div class="big-icon">⚠</div><div><h3>Locations needing operational attention</h3><p>${weak.length ? weak.map(row => `${esc(row.company_name || reportName)} — ${esc(row.location_name)} (${formatPct(completionCount(row))})`).join('<br/>') : 'No locations needing operational attention for the selected period.'}</p></div></div>
      <div class="insight info-bg"><div class="big-icon">ⓘ</div><div><h3>Notes</h3><p>${esc(sourceNote)}<br/>${isBrandReport ? 'Brand result is auto-calculated from assigned brand location rows.' : (isGroupReport ? 'Group result includes brand/sub-group completion when brands are configured.' : 'Client result is auto-calculated from all location rows.')}<br/>${isSpecialTemplateReport ? 'Special CS Client report source. ' : ''}Generated on ${esc(generatedAt.toLocaleString())}.</p></div></div>
    </div>
    <div class="footer"><span>InCheck 360 · Customer Success</span><span>Summary · ${esc(generatedAt.toLocaleDateString())}</span></div>
  </section>

  ${brandRows.length ? `<section class="report-page brand-page">
    <div class="report-header">
      <div class="brand"><div class="cs-export-doc-logo-slot" data-incheck360-doc-logo-slot></div><div class="brand-fallback" style="display:none;">InCheck <span>360</span></div></div>
      <div class="header-main">
        <div class="header-row"><div class="title"><h1>Brand Completion Insights</h1><div class="subtitle">${esc(reportName)} · Group report is divided by brand/sub-group such as Kcal KSA and Kcal UAE.</div></div></div>
        <div class="meta-grid">
          <div class="meta"><div class="k">Brands</div><div class="v">${brandRows.length}</div></div>
          ${brandMetaCardsHtml}
        </div>
      </div>
    </div>
    ${brandComparisonHtml}
    <div class="table-wrap"><table class="report-table brand-table">
      <thead><tr><th class="num">#</th><th class="client-col">Brand / Sub-group</th><th>Locations</th><th>Done On-Time</th><th>Done Late</th><th>Partially Done</th><th>Missed</th><th>Completion</th><th>Insight</th></tr></thead>
      <tbody>${brandRows.map((item, index) => `<tr><td class="num">${index + 1}</td><td><span class="brand-name">${esc(item.brand_name)}</span><span class="brand-scope">${esc(item.scope)}</span></td><td class="pct">${item.locations.length}</td><td class="pct">${item.stats.done_on_time.toFixed(2)}%</td><td class="pct">${item.stats.done_late.toFixed(2)}%</td><td class="pct">${item.stats.partially_done.toFixed(2)}%</td><td class="pct">${item.stats.missed.toFixed(2)}%</td><td class="pct ${item.stats.completion < 80 ? 'low' : 'ok'}">${item.stats.completion.toFixed(2)}%</td><td>${item.is_unassigned ? 'Assign these locations to a brand' : (item.stats.completion < 80 ? 'Needs operational attention' : 'On track')}${item.weakLocations.length ? `<ul class="brand-mini-list">${item.weakLocations.map(row => `<li>${esc(row.location_name)} · ${formatPct(completionCount(row))}</li>`).join('')}</ul>` : ''}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="footer"><span>InCheck 360 · Customer Success</span><span>Brand insights · ${esc(generatedAt.toLocaleDateString())}</span></div>
  </section>` : ''}

  <section class="report-page table-page">
    <div class="report-header">
      <div class="brand"><div class="cs-export-doc-logo-slot" data-incheck360-doc-logo-slot></div><div class="brand-fallback" style="display:none;">InCheck <span>360</span></div></div>
      <div class="header-main">
        <div class="header-row"><div class="title"><h1>Location Completion Details</h1><div class="subtitle">${esc(reportName)} · ${esc(periodLabel)} · ${rows.length} active location${rows.length === 1 ? '' : 's'}</div></div></div>
      </div>
    </div>
    <div class="table-wrap"><table class="report-table">
      <thead><tr><th class="num">#</th><th class="client-col">Client</th><th class="location-col">Location</th><th>Done On-Time</th><th>Done Late</th><th>Partially Done</th><th>Missed</th><th>Completion</th></tr></thead>
      <tbody>${rows.map((row, index) => `<tr><td class="num">${index + 1}</td><td>${esc(row.company_name || reportName)}</td><td>${esc(row.location_name)}</td><td class="pct">${formatPct(row.done_on_time)}</td><td class="pct">${formatPct(row.done_late)}</td><td class="pct">${formatPct(row.partially_done)}</td><td class="pct">${formatPct(row.missed)}</td><td class="pct completion-cell">${formatPct(completionCount(row))}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="footer"><span>InCheck 360 · Customer Success</span><span>Location details · ${esc(generatedAt.toLocaleDateString())}</span></div>
  </section>
</div></body></html>`;

    try {
      const officialLogo =
        window.INCHECK360_DOCUMENT_LOGO_DATA_URI ||
        window.Utils?.INCHECK360_DOCUMENT_LOGO_DATA_URI ||
        window.Utils?.documentLogoDataUri ||
        '';
      const fallbackLogoHtml = officialLogo
        ? `<div class="cs-export-doc-logo-wrap"><img class="cs-export-doc-logo incheck360-doc-logo" src="${officialLogo}" alt="InCheck 360" /></div>`
        : `<div class="cs-export-doc-logo-wrap"><img class="cs-export-doc-logo incheck360-doc-logo" src="assets/incheck360-document-logo.png" alt="InCheck 360" onerror="this.onerror=null;this.src='assets/incheck360-ui-logo.png';" /></div>`;

      let brandedReportHtml = window.Utils?.addIncheckDocumentLogo
        ? window.Utils.addIncheckDocumentLogo(reportHtml)
        : reportHtml;

      // If the official document-logo helper is unavailable, or leaves a slot empty,
      // fill the top-left report logo area so the export never opens with blank space.
      brandedReportHtml = brandedReportHtml
        .replace(/<div class="cs-export-doc-logo-slot" data-incheck360-doc-logo-slot><\/div>/g, `<div class="cs-export-doc-logo-slot" data-incheck360-doc-logo-slot>${fallbackLogoHtml}</div>`)
        .replace(/<div data-incheck360-doc-logo-slot><\/div>/g, `<div data-incheck360-doc-logo-slot>${fallbackLogoHtml}</div>`);

      const win = window.open('', '_blank');
      if (!win) { toast('Popup blocked. Please allow popups and try again.'); return; }
      win.document.open();
      win.document.write(brandedReportHtml);
      win.document.close();
    } catch (error) {
      console.error('[ClientSuccess360] export report failed', error);
      toast(`Unable to export report: ${error.message || error}`);
    }
  }



  function parseLines(value) { return String(value || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean); }
  function optionsFromRows(rows, getId, getLabel, empty) { return rows.length ? rows.map(r => `<option value="${attr(getId(r))}">${esc(getLabel(r))}</option>`).join('') : `<option value="">${esc(empty)}</option>`; }
  function openSpecialTemplateForm(templateId = '', readOnly = false) {
    const template = specialTemplateById(templateId) || {};
    const isEdit = Boolean(specialTemplateId(template));
    const groups = isEdit ? specialGroupsForTemplate(templateId) : [];
    const brands = isEdit ? specialBrandsForTemplate(templateId) : [];
    const locations = isEdit ? specialLocationsForTemplate(templateId, false) : [];
    openModal(isEdit ? 'Edit Special CS Client' : 'Create Special CS Client', `<form class="cs-form" id="csSpecialTemplateForm">
      <div class="cs-form-grid">
        <div class="cs-form-field cs-form-field--full"><label>Client Name</label><input name="client_name" class="input" required ${readOnly ? 'readonly' : ''} value="${attr(template.client_name || '')}" placeholder="Special CS Client" /></div>
        <div class="cs-form-field"><label>Status</label><select name="status" class="select" ${readOnly ? 'disabled' : ''}><option value="active" ${String(template.status||'active').toLowerCase()==='active'?'selected':''}>Active</option><option value="archived" ${String(template.status||'').toLowerCase()==='archived'?'selected':''}>Archived</option></select></div>
        <div class="cs-form-field cs-form-field--full"><label>Description</label><textarea name="description" class="input" ${readOnly ? 'readonly' : ''}>${esc(template.description || '')}</textarea></div>
        <div class="cs-form-field"><label>Groups (one per line)</label><textarea name="groups_text" class="input" rows="5" ${readOnly ? 'readonly' : ''} placeholder="Demo Group">${esc(groups.map(groupName).join('\n'))}</textarea></div>
        <div class="cs-form-field"><label>Brands (one per line)</label><textarea name="brands_text" class="input" rows="5" ${readOnly ? 'readonly' : ''} placeholder="Brand A\nBrand B">${esc(brands.map(brandName).join('\n'))}</textarea></div>
        <div class="cs-form-field cs-form-field--full"><label>Locations (one per line)</label><textarea name="locations_text" class="input" rows="7" required ${readOnly ? 'readonly' : ''} placeholder="Location 1\nLocation 2\nLocation 3">${esc(locations.map(r=>r.location_name).join('\n'))}</textarea></div>
        <div class="cs-form-field cs-form-field--full"><div class="cs-mini-note">At least one active location is required. Existing groups, brands, and locations are replaced on save so duplicates are prevented per special client.</div></div>
      </div>
      <div class="cs-modal-actions"><button type="button" class="btn ghost" onclick="document.getElementById('csModalClose').click()">Cancel</button>${readOnly ? '' : '<button type="submit" class="btn primary cs-special-client-save-btn" data-cs-modal-submit="true">Save Special CS Client</button>'}</div>
    </form>`, async form => saveSpecialTemplate(form, template));
  }

  async function saveSpecialTemplate(form, existing = {}) {
    const client = supabase();
    if (!client) throw new Error('Supabase database connection is unavailable.');

    const fd = new FormData(form);
    const clientName = String(fd.get('client_name') || '').trim();
    const groups = Array.from(new Set(parseLines(fd.get('groups_text'))));
    const brands = Array.from(new Set(parseLines(fd.get('brands_text'))));
    const locations = Array.from(new Set(parseLines(fd.get('locations_text'))));
    const existingId = specialTemplateId(existing) || null;

    if (!clientName) {
      form.elements?.client_name?.focus?.();
      throw new Error('Client Name is required.');
    }
    if (!locations.length) {
      form.elements?.locations_text?.focus?.();
      throw new Error('Add at least one active location.');
    }

    const args = {
      p_special_client_id: existingId,
      p_client_name: clientName,
      p_description: String(fd.get('description') || '').trim() || null,
      p_status: String(fd.get('status') || 'active').trim().toLowerCase(),
      p_groups: groups,
      p_brands: brands,
      p_locations: locations
    };

    const { data, error } = await withCsTimeout(
      client.rpc('cs360_save_special_client', args),
      25000,
      'Saving Special CS Client'
    );

    if (error) {
      if (isMissingRpcError(error, 'cs360_save_special_client')) {
        throw new Error('The CS360 database save migration is not installed. Run 20260717_cs360_save_persistence_final_fix.sql in Supabase, then hard refresh.');
      }
      throw new Error(`Unable to save Special CS Client: ${error.message}`);
    }

    const savedId = String(data || existingId || '').trim();
    closeModal();

    // Refresh only the standalone Special CS Client tables and select the
    // saved Special CS Client as its own independent sidebar client.
    await loadSpecialCaseTemplates({ force: true });
    STATE.selectedEntityType = 'special';
    STATE.selectedSpecialClientId = savedId;
    STATE.specialActiveTab = 'overview';
    renderClientList();
    renderDetail();

    toast(`Special CS Client saved${savedId ? ` (${clientName})` : ''}.`);
  }
  async function archiveSpecialTemplate(templateId = '') {
    const template = specialTemplateById(templateId);
    if (!template) { toast('Select a valid Special CS Client.'); return; }
    if (!confirm(`Archive ${specialTemplateName(template)}? Old completion history will remain.`)) return;
    const { error } = await supabase().from(TABLES.specialTemplates).update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', templateId);
    if (error) { toast(`Unable to archive special client: ${error.message}`); return; }
    await loadSpecialCaseTemplates({ force: true });
    const next = activeSpecialTemplates()[0] || null;
    if (next) {
      STATE.selectedEntityType = 'special';
      STATE.selectedSpecialClientId = specialTemplateId(next);
    } else {
      STATE.selectedEntityType = 'normal';
      STATE.selectedSpecialClientId = '';
    }
    renderClientList();
    renderDetail();
    toast('Special CS Client archived.');
  }

  document.addEventListener('click', event => {
    const action = event.target?.closest?.('[data-cs-action]')?.dataset?.csAction;
    if (!action) return;
    if (!canRunCsAction(action)) {
      event.preventDefault?.();
      event.stopPropagation?.();
      const needed = requiredCsPermissionForAction(action);
      toast(`No Customer Success ${needed} permission for your role.`);
      return;
    }
    if (action === 'client-select-prev-page') { updateClientSelectPage(STATE.clientSelectPagination.page - 1); return; }
    if (action === 'client-select-next-page') { updateClientSelectPage(STATE.clientSelectPagination.page + 1); return; }
    if (action === 'special-client-select-prev-page') { updateSpecialClientSelectPage(STATE.specialClientSelectPagination.page - 1); return; }
    if (action === 'special-client-select-next-page') { updateSpecialClientSelectPage(STATE.specialClientSelectPagination.page + 1); return; }
    if (action === 'special-clients-open') { openSpecialCaseTemplates(); return; }
    if (action === 'completion-history-client') { openCompletionHistory('client'); return; }
    if (action === 'completion-history-group') {
      openCompletionHistory('group', event.target?.closest?.('[data-group-id]')?.dataset?.groupId || '');
      return;
    }
    if (action === 'completion-history-brand') {
      openCompletionHistory('brand', event.target?.closest?.('[data-brand-id]')?.dataset?.brandId || '');
      return;
    }
    if (action === 'completion') openCompletionForm(event.target?.closest?.('[data-special-client-id]')?.dataset?.specialClientId || '');
    if (action === 'completion-export') openCompletionExportForm();
    if (action === 'group') openGroupForm();
    if (action === 'group-member') openGroupMemberForm();
    if (action === 'group-activity') openGroupActivityForm();
    if (action === 'brand') openBrandForm();
    if (action === 'brand-location') openBrandLocationForm(event.target?.closest?.('[data-brand-id]')?.dataset?.brandId || '');
    if (action === 'brand-location-assign') {
      event.preventDefault?.();
      event.stopPropagation?.();
      const btn = event.target?.closest?.('[data-location-payload]');
      const form = $('csBrandLocationForm');
      assignLocationToBrand(
        brandById(btn?.getAttribute?.('data-brand-id') || form?.elements?.brand_id?.value || ''),
        parseBrandLocationOption(btn?.getAttribute?.('data-location-payload') || ''),
        form?.elements?.status?.value || 'Active',
        form?.elements?.notes?.value || ''
      );
      return;
    }
    if (action === 'brand-location-remove') removeBrandLocation(event.target?.closest?.('[data-brand-location-id]')?.dataset?.brandLocationId || '');
    if (action === 'brand-location-move') {
      event.preventDefault?.();
      event.stopPropagation?.();
      const rowId = event.target?.closest?.('[data-brand-location-id]')?.getAttribute?.('data-brand-location-id') || '';
      const safeRowId = window.CSS?.escape ? CSS.escape(rowId) : String(rowId).replace(/"/g, '\\"');
      const select = document.querySelector(`[data-brand-location-move-select="${safeRowId}"]`);
      moveBrandLocation(rowId, select?.value || '');
      return;
    }
    if (action === 'special-client-open') { selectSpecialClient(event.target?.closest?.('[data-special-client-id]')?.dataset?.specialClientId || ''); return; }
    if (action === 'special-client-create') { openSpecialTemplateForm(''); return; }
    if (action === 'special-client-edit') { openSpecialTemplateForm(event.target?.closest?.('[data-special-client-id]')?.dataset?.specialClientId || ''); return; }
    if (action === 'special-client-archive') { archiveSpecialTemplate(event.target?.closest?.('[data-special-client-id]')?.dataset?.specialClientId || ''); return; }
    if (action === 'special-client-use-completion') { openCompletionForm(event.target?.closest?.('[data-special-client-id]')?.dataset?.specialClientId || ''); return; }
    if (action === 'special-client-view-report' || action === 'special-client-report') { exportCompletionReport({ report_type: 'special_client', special_client_id: event.target?.closest?.('[data-special-client-id]')?.dataset?.specialClientId || '' }); return; }
    if (action === 'brand-export') exportCompletionReport({ report_type: 'brand', brand_id: event.target?.closest?.('[data-brand-id]')?.dataset?.brandId || '' });
    if (action === 'review') openReviewForm();
    if (action === 'task') openTaskForm();
    if (action === 'risk') openRiskForm();
    if (action === 'qbr') openQbrForm();
    if (action === 'contact') openContactForm();
    if (action === 'contact-assign') openAssignExistingContactForm();
  });

  function selectedCompanyInput() {
    const company = getSelectedCompany();
    const selectedId = companyId(company);
    const p = STATE.clientSelectPagination;
    const meta = getPaginatedCsClients(p.search, p.page, p.pageSize);
    let rows = meta.rows.slice();
    if (selectedId && !rows.some(c => companyId(c) === selectedId) && company) rows.unshift({ ...company, __selectedOutsidePage: true });
    const options = rows.map(c => `<option value="${attr(companyId(c))}" ${companyId(c) === selectedId ? 'selected' : ''}>${c.__selectedOutsidePage ? 'Selected: ' : ''}${esc(companyName(c))}</option>`).join('') || '<option value="">No clients found</option>';
    return `<input type="hidden" name="company_id" value="${attr(selectedId)}" />
      <div class="cs-form-field cs-form-field--full cs-client-select-field"><label>Client Search</label><input class="input cs-client-select-search" type="search" data-cs-action="client-select-search" value="${attr(p.search || '')}" placeholder="Search client, group, brand, location…" /></div>
      <div class="cs-form-field cs-form-field--full"><label>Client</label><select name="company_select" class="select" data-cs-action="client-select-value">${options}</select><div data-cs-client-select-pagination-host>${renderClientSelectPagination(meta)}</div></div>`;
  }

  function openModal(title, bodyHtml, onSubmit) {
    const modal = $('csModal');
    const titleEl = $('csModalTitle');
    const bodyEl = $('csModalBody');

    if (!modal || !titleEl || !bodyEl) {
      toast('Unable to open the CS360 form. Refresh the page and try again.');
      return;
    }

    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');

    const form = bodyEl.querySelector('form');
    if (!form) return;

    const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submitButton) {
      submitButton.dataset.csModalSubmit = 'true';
      submitButton.disabled = false;
    }

    let submitting = false;
    const runSubmit = async event => {
      event?.preventDefault?.();
      event?.stopPropagation?.();

      if (submitting) return;
      if (!form.checkValidity()) {
        form.reportValidity();
        form.querySelector(':invalid')?.focus?.();
        toast('Complete the required fields before saving.');
        return;
      }
      if (typeof onSubmit !== 'function') {
        toast('This save action is not connected. Refresh the page and try again.');
        return;
      }

      submitting = true;
      const originalLabel = submitButton?.textContent || 'Save';
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.setAttribute('aria-busy', 'true');
        submitButton.textContent = 'Saving…';
      }

      try {
        await onSubmit(form);
      } catch (error) {
        console.error('[ClientSuccess360] save failed', error);
        toast(error?.message || String(error));
      } finally {
        submitting = false;
        if (submitButton && modal.classList.contains('is-open')) {
          submitButton.disabled = false;
          submitButton.removeAttribute('aria-busy');
          submitButton.textContent = originalLabel;
        }
      }
    };

    form.addEventListener('submit', runSubmit);
    submitButton?.addEventListener('click', runSubmit);
  }
  function closeModal() { const modal = $('csModal'); modal?.classList.remove('is-open'); modal?.setAttribute('aria-hidden', 'true'); }

  function periodDefaults(type) {
    const d = new Date();
    if (type === 'monthly') {
      const s = new Date(d.getFullYear(), d.getMonth(), 1);
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return [s.toISOString().slice(0,10), e.toISOString().slice(0,10)];
    }
    const day = d.getDay();
    const diff = (day + 6) % 7;
    const s = new Date(d); s.setDate(d.getDate() - diff);
    const e = new Date(s); e.setDate(s.getDate() + 6);
    return [s.toISOString().slice(0,10), e.toISOString().slice(0,10)];
  }


  function openGroupForm() {
    openModal('New CS Client Group', `<form class="cs-form" id="csGroupForm">
      <div class="cs-form-grid">
        <div class="cs-form-field"><label>Group Name</label><input name="group_name" class="input" type="text" placeholder="e.g. Kcal Group" required /></div>
        <div class="cs-form-field"><label>Group Code</label><input name="group_code" class="input" type="text" placeholder="Optional internal code" /></div>
        <div class="cs-form-field"><label>Owner / CSM</label><input name="owner_name" class="input" type="text" placeholder="Optional" /></div>
        ${selectField('status','Status',['Active','Watch','At Risk','Archived'],'Active')}
        <div class="cs-form-field cs-form-field--full"><label>Description</label><textarea name="description" class="input" placeholder="Why these companies are grouped together"></textarea></div>
      </div>
      <div class="cs-modal-actions"><button type="button" class="btn ghost" onclick="document.getElementById('csModalClose').click()">Cancel</button><button type="submit" class="btn primary">Save Group</button></div>
    </form>`, async form => {
      const payload = Object.fromEntries(new FormData(form).entries());
      Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });
      const { error } = await supabase().from(TABLES.groups).insert(payload);
      if (error) { toast(`Unable to save group: ${error.message}`); return; }
      closeModal(); await loadData(); toast('CS client group saved.');
    });
  }

  function openGroupMemberForm() {
    const company = getSelectedCompany();
    const groups = activeGroups();
    if (!groups.length) { openGroupForm(); toast('Create a CS client group first, then add companies to it.'); return; }
    const opts = groups.map(group => `<option value="${attr(groupId(group))}">${esc(groupName(group))}</option>`).join('');
    openModal('Add Current Client to Group', `<form class="cs-form" id="csGroupMemberForm">
      <div class="cs-form-grid">${selectedCompanyInput()}
        <div class="cs-form-field"><label>Client Group</label><select name="group_id" class="select" required>${opts}</select></div>
        <div class="cs-form-field"><label>Member Role</label><input name="member_role" class="input" type="text" placeholder="e.g. Parent, Branch, Related Brand" /></div>
        <div class="cs-form-field cs-form-field--full"><label>Notes</label><textarea name="notes" class="input" placeholder="Optional grouping notes"></textarea></div>
      </div>
      <div class="cs-modal-actions"><button type="button" class="btn ghost" onclick="document.getElementById('csModalClose').click()">Cancel</button><button type="submit" class="btn primary">Add to Group</button></div>
    </form>`, async form => {
      const fd = new FormData(form);
      const group = groupById(fd.get('group_id')) || {};
      const payload = {
        group_id: fd.get('group_id'),
        company_id: companyId(company),
        group_name_snapshot: groupName(group),
        company_name_snapshot: companyName(company),
        member_role: fd.get('member_role') || null,
        notes: fd.get('notes') || null
      };
      const { error } = await supabase().from(TABLES.groupMembers).upsert(payload, { onConflict: 'group_id,company_id' });
      if (error) { toast(`Unable to add client to group: ${error.message}`); return; }
      closeModal(); await loadData(); toast('Client added to CS group.');
    });
  }

  function openGroupActivityForm() {
    const company = getSelectedCompany();
    const groups = groupsForCompany(company);
    const candidates = groups.length ? groups : activeGroups();
    if (!candidates.length) { toast('Create a CS client group first.'); openGroupForm(); return; }
    const opts = candidates.map(group => `<option value="${attr(groupId(group))}">${esc(groupName(group))}</option>`).join('');
    openModal('Create CSM Activity for Group', `<form class="cs-form" id="csGroupActivityForm">
      <div class="cs-form-grid">
        <div class="cs-form-field cs-form-field--full"><label>CS Client Group</label><select name="group_id" class="select" required>${opts}</select></div>
        <div class="cs-form-field cs-form-field--full"><p class="cs-kpi-sub">This opens the CSM Daily Activity form with Activity Scope = CS Client Group.</p></div>
      </div>
      <div class="cs-modal-actions"><button type="button" class="btn ghost" onclick="document.getElementById('csModalClose').click()">Cancel</button><button type="submit" class="btn primary">Open Activity Form</button></div>
    </form>`, async form => {
      const group = groupById(new FormData(form).get('group_id'));
      closeModal();
      if (global.CSMActivity?.openForm) {
        await global.CSMActivity.openForm(null, { activityContext: 'cs_group', groupId: groupId(group), groupName: groupName(group) });
      } else {
        toast('CSM Activity form is not available on this page load. Open CSM Daily Activity once and try again.');
      }
    });
  }

  function completionTargetKey(target) {
    return [String(target.company_id || '').trim(), normalize(target.location_name)].join('|');
  }

  function currentClientCompletionTargets(company) {
    return getClientLocationRows(company).map(location => ({
      company_id: companyId(company),
      company_name: companyName(company),
      location_name: location.location_name,
      service_start_date: location.service_start_date,
      service_end_date: location.service_end_date,
      source: location.source
    })).filter(target => target.company_id && target.location_name && !isPseudoAllLocation(target.location_name));
  }

  function groupCompletionTargets(group) {
    const byKey = new Map();
    groupMemberCompanies(group).forEach(member => {
      currentClientCompletionTargets(member).forEach(target => {
        const key = completionTargetKey(target);
        if (!byKey.has(key)) byKey.set(key, target);
      });
    });
    return Array.from(byKey.values()).sort((a,b) => `${a.company_name} ${a.location_name}`.localeCompare(`${b.company_name} ${b.location_name}`));
  }

  function completionTargetsForForm(form) {
    const company = getSelectedCompany();
    const scope = String(form?.completion_scope?.value || 'client');
    if (scope === 'group') {
      const group = groupById(form?.group_id?.value);
      return group ? groupCompletionTargets(group) : [];
    }
    if (scope === 'brand') {
      const brand = brandById(form?.brand_id?.value);
      return brand ? brandCompletionTargets(brand) : [];
    }
    if (scope === 'special_client') {
      const template = specialTemplateById(form?.special_client_id?.value);
      return template ? specialTemplateTargets(template) : [];
    }
    return currentClientCompletionTargets(company);
  }

  function completionInputFieldsHtml(prefix = '') {
    const tag = prefix ? `data-${prefix}-completion-field` : 'data-completion-field';
    return `
      <td><input class="input" type="number" min="0" step="0.01" inputmode="decimal" ${tag}="done_on_time" value="0" /></td>
      <td><input class="input" type="number" min="0" step="0.01" inputmode="decimal" ${tag}="done_late" value="0" /></td>
      <td><input class="input" type="number" min="0" step="0.01" inputmode="decimal" ${tag}="partially_done" value="0" /></td>
      <td><input class="input" type="number" min="0" step="0.01" inputmode="decimal" ${tag}="missed" value="0" /></td>`;
  }

  function readCompletionFields(root, selector = '[data-completion-field]') {
    const out = { done_on_time: 0, done_late: 0, partially_done: 0, missed: 0 };
    root?.querySelectorAll(selector).forEach(input => {
      const field = input.dataset.completionField || input.dataset.groupCompletionField;
      if (field) out[field] = Math.max(0, safeDecimal(input.value));
    });
    return out;
  }

  function completionPreviewText(data) {
    return formatPct(completionCount(data));
  }

  function renderCompletionTargetsTable(targets, sharedData = null, editable = true) {
    if (!targets.length) return '<tr><td colspan="7" class="cs-empty">No client locations found.</td></tr>';
    return targets.map(target => {
      const rowData = sharedData || { done_on_time: 0, done_late: 0, partially_done: 0, missed: 0 };
      const attrs = `data-company-id="${attr(target.company_id)}" data-company-name="${attr(target.company_name)}" data-location-name="${attr(target.location_name)}" data-special-client-id="${attr(target.special_client_id || '')}" data-special-location-id="${attr(target.special_location_id || '')}" data-special-group-id="${attr(target.special_group_id || '')}" data-special-brand-id="${attr(target.special_brand_id || '')}" data-group-name="${attr(target.group_name || '')}" data-brand-name="${attr(target.brand_name || '')}"`;
      if (editable) {
        return `<tr class="cs-completion-input-row" ${attrs}>
          <td>${esc(target.company_name)}</td>
          <td>${esc(target.location_name)}</td>
          ${completionInputFieldsHtml()}
          <td class="cs-completion-preview">${completionPreviewText(rowData)}</td>
        </tr>`;
      }
      return `<tr class="cs-completion-preview-row" ${attrs}>
        <td>${esc(target.company_name)}</td>
        <td>${esc(target.location_name)}</td>
        <td data-preview-field="done_on_time">${formatDecimal(rowData.done_on_time)}</td>
        <td data-preview-field="done_late">${formatDecimal(rowData.done_late)}</td>
        <td data-preview-field="partially_done">${formatDecimal(rowData.partially_done)}</td>
        <td data-preview-field="missed">${formatDecimal(rowData.missed)}</td>
        <td class="cs-completion-preview">${completionPreviewText(rowData)}</td>
      </tr>`;
    }).join('');
  }

  function activeCompletionGroupsForSelect(company) {
    const own = groupsForCompany(company);
    const ids = new Set(own.map(groupId));
    activeGroups().forEach(group => ids.add(groupId(group)));
    return activeGroups().filter(group => ids.has(groupId(group))).sort((a,b) => groupName(a).localeCompare(groupName(b)));
  }

  function openCompletionForm(preselectedSpecialTemplateId = '') {
    const [periodStart, periodEnd] = periodDefaults('weekly');
    const company = getSelectedCompany();
    const groups = activeCompletionGroupsForSelect(company);
    const groupOptions = groups.length
      ? groups.map(group => `<option value="${attr(groupId(group))}">${esc(groupName(group))}</option>`).join('')
      : '<option value="">No CS groups yet</option>';
    const brands = activeBrandsForSelect(company);
    const brandOptions = brands.length
      ? brands.map(brand => `<option value="${attr(brandId(brand))}">${esc(brandName(brand))} · ${esc(brandScopeLabel(brand))}</option>`).join('')
      : '<option value="">No CS brands yet</option>';
    const specialTemplates = activeSpecialTemplates();
    const specialSelect = specialClientSelectInput(preselectedSpecialTemplateId);
    const selectedSpecial = preselectedSpecialTemplateId ? specialTemplateById(preselectedSpecialTemplateId) : null;
    const initialTargets = selectedSpecial ? specialTemplateTargets(selectedSpecial) : currentClientCompletionTargets(company);

    openModal('Add Location Completion', `<form class="cs-form" id="csCompletionForm">
      <div class="cs-form-grid">
        <div id="csCompletionNormalClientFields" class="cs-completion-normal-fields">${selectedCompanyInput()}</div>
        <div class="cs-form-field"><label>Source</label><select name="completion_scope" class="select"><option value="client">Normal Clients</option><option value="group" ${groups.length ? '' : 'disabled'}>Normal Client Group</option><option value="brand" ${brands.length ? '' : 'disabled'}>Normal Client Brand</option><option value="special_client" ${specialTemplates.length ? '' : 'disabled'} ${preselectedSpecialTemplateId ? 'selected' : ''}>Special CS Clients</option></select></div>
        <div class="cs-form-field" id="csCompletionSpecialField" style="display:none;">${specialSelect}</div>
        <div class="cs-form-field" id="csCompletionGroupField" style="display:none;"><label>CS Client Group</label><select name="group_id" class="select">${groupOptions}</select></div>
        <div class="cs-form-field" id="csCompletionBrandField" style="display:none;"><label>CS Brand</label><select name="brand_id" class="select">${brandOptions}</select></div>
        <div class="cs-form-field"><label>Review Type</label><select name="review_type" class="select"><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
        <div class="cs-form-field"><label>Period Start</label><input name="period_start" class="input" type="date" value="${periodStart}" required /></div>
        <div class="cs-form-field"><label>Period End</label><input name="period_end" class="input" type="date" value="${periodEnd}" required /></div>
        <div class="cs-form-field"><label>Source / Notes</label><input name="source_note" class="input" type="text" placeholder="e.g. weekly checklist report" /></div>
      </div>

      <div id="csGroupCompletionEntry" style="display:none;">
        <div class="cs-section-title"><h4><span id="csCompletionAggregateTitle">Group Result Counts</span></h4><span class="cs-chip">Auto-calculated from all location rows below</span></div>
        <div class="cs-table-wrap"><table class="cs-table cs-edit-table"><thead><tr><th>Apply To</th><th>Done On-Time</th><th>Done Late</th><th>Partially Done</th><th>Missed</th><th>Completion</th></tr></thead><tbody>
          <tr class="cs-group-completion-row">
            <td><span id="csCompletionAggregateLabel">All Group Locations</span></td>
            <td data-group-total-field="done_on_time">0</td>
            <td data-group-total-field="done_late">0</td>
            <td data-group-total-field="partially_done">0</td>
            <td data-group-total-field="missed">0</td>
            <td class="cs-group-completion-preview">0 (0.00%)</td>
          </tr>
        </tbody></table></div>
      </div>

      <div class="cs-section-title"><h4>Location Result Counts</h4><span class="cs-chip">Completion = Done On-Time + Done Late</span></div>
      <div class="cs-kpi-sub" id="csCompletionHint">For current client scope, you can edit each location separately.</div>
      <div class="cs-table-wrap"><table class="cs-table cs-edit-table"><thead><tr><th>Client</th><th>Location</th><th>Done On-Time</th><th>Done Late</th><th>Partially Done</th><th>Missed</th><th>Completion</th></tr></thead><tbody id="csCompletionRowsBody">${renderCompletionTargetsTable(initialTargets, null, true)}</tbody></table></div>
      <div class="cs-modal-actions"><button type="button" class="btn ghost" onclick="document.getElementById('csModalClose').click()">Cancel</button><button type="submit" class="btn primary">Save Completion</button></div>
    </form>`, saveCompletion);

    const form = $('csCompletionForm');
    form?.review_type?.addEventListener('change', () => {
      const [s,e] = periodDefaults(form.review_type.value);
      form.period_start.value = s;
      form.period_end.value = e;
    });
    form?.completion_scope?.addEventListener('change', () => rebuildCompletionRows(form));
    form?.group_id?.addEventListener('change', () => rebuildCompletionRows(form));
    form?.brand_id?.addEventListener('change', () => rebuildCompletionRows(form));
    form?.special_client_id?.addEventListener('change', () => rebuildCompletionRows(form));
    form?.addEventListener('input', () => refreshCompletionRows(form));
    rebuildCompletionRows(form);
  }

  function rebuildCompletionRows(form) {
    if (!form) return;
    const scope = String(form.completion_scope?.value || 'client');
    const isGroup = scope === 'group';
    const isBrand = scope === 'brand';
    const isSpecial = scope === 'special_client';
    const targets = completionTargetsForForm(form);
    const groupField = $('csCompletionGroupField');
    const brandField = $('csCompletionBrandField');
    const specialField = $('csCompletionSpecialField');
    const normalClientFields = $('csCompletionNormalClientFields');
    const groupEntry = $('csGroupCompletionEntry');
    const hint = $('csCompletionHint');
    const body = $('csCompletionRowsBody');
    const aggregateLabel = $('csCompletionAggregateLabel');
    const aggregateTitle = $('csCompletionAggregateTitle');
    if (groupField) groupField.style.display = isGroup ? '' : 'none';
    if (brandField) brandField.style.display = isBrand ? '' : 'none';
    if (specialField) specialField.style.display = isSpecial ? '' : 'none';
    if (normalClientFields) normalClientFields.style.display = isSpecial ? 'none' : 'contents';
    if (groupEntry) groupEntry.style.display = (isGroup || isBrand || isSpecial) ? '' : 'none';
    if (aggregateLabel) aggregateLabel.textContent = isSpecial ? 'All Special Client Locations' : (isBrand ? 'All Brand Locations' : 'All Group Locations');
    if (aggregateTitle) aggregateTitle.textContent = isSpecial ? 'Special CS Client Result' : (isBrand ? 'Brand Result Counts' : 'Group Result Counts');
    if (hint) hint.textContent = isSpecial
      ? 'For Special CS Clients, enter each active special client location below. The All Special Client Locations line above is auto-calculated from all entered rows.'
      : (isBrand
        ? 'For brand scope, enter each assigned company/location below. The All Brand Locations line above is auto-calculated from all entered rows.'
        : (isGroup
          ? 'For group scope, enter each company/location below one time from the same screen. The All Group Locations line above is auto-calculated from all entered rows.'
          : 'For current client scope, you can edit each location separately.'));
    if (body) body.innerHTML = renderCompletionTargetsTable(targets, null, true);
    refreshCompletionRows(form);
  }

  function refreshCompletionRows(form) {
    const rows = [];
    form?.querySelectorAll('.cs-completion-input-row').forEach(row => {
      const data = readCompletionInputRow(row);
      rows.push(data);
      const preview = row.querySelector('.cs-completion-preview');
      if (preview) preview.textContent = completionPreviewText(data);
      const total = completionTotal(data);
      row.classList.toggle('cs-row-error', total > 100.0001);
      row.title = total > 100.0001 ? 'Total percentage cannot exceed 100% for one location.' : '';
    });

    const avg = averageCompletionMetrics(rows);
    ['done_on_time','done_late','partially_done','missed'].forEach(field => {
      const cell = form?.querySelector(`[data-group-total-field="${field}"]`);
      if (cell) cell.textContent = formatPct(avg[field]);
    });
    const groupPreview = form?.querySelector('.cs-group-completion-preview');
    if (groupPreview) groupPreview.textContent = formatPct(avg.completion);
  }

  function readCompletionInputRow(row) {
    const out = { location_name: row.dataset.locationName || '', done_on_time: 0, done_late: 0, partially_done: 0, missed: 0 };
    Object.assign(out, readCompletionFields(row, '[data-completion-field]'));
    return out;
  }

  function buildCompletionPayload(fd, target, data) {
    return {
      company_id: target.company_id,
      company_name_snapshot: target.company_name,
      location_name: target.location_name,
      review_type: fd.get('review_type') || 'weekly',
      period_start: fd.get('period_start'),
      period_end: fd.get('period_end'),
      done_on_time: data.done_on_time,
      done_late: data.done_late,
      partially_done: data.partially_done,
      missed: data.missed,
      source_note: fd.get('source_note') || null,
      source_type: target.source_type || 'normal',
      special_client_id: target.special_client_id || null,
      special_location_id: target.special_location_id || null,
      special_group_id: target.special_group_id || null,
      special_brand_id: target.special_brand_id || null,
      group_name: target.group_name || null,
      brand_name: target.brand_name || null
    };
  }

  async function saveCompletion(form) {
    const client = supabase();
    if (!client) throw new Error('Supabase database connection is unavailable.');

    const fd = new FormData(form);
    const scope = String(fd.get('completion_scope') || 'client');
    let payloads = [];

    if (scope === 'group' && !groupById(fd.get('group_id'))) {
      throw new Error('Select a valid CS client group.');
    }
    if (scope === 'brand' && !brandById(fd.get('brand_id'))) {
      throw new Error('Select a valid CS brand.');
    }
    if (scope === 'special_client' && !specialTemplateById(fd.get('special_client_id'))) {
      throw new Error('Select a valid Special CS Client.');
    }

    payloads = Array.from(form.querySelectorAll('.cs-completion-input-row')).map(row => {
      const data = readCompletionInputRow(row);
      return buildCompletionPayload(fd, {
        company_id: row.dataset.companyId || null,
        company_name: row.dataset.companyName,
        location_name: data.location_name,
        source_type: scope === 'special_client' ? 'special_client' : 'normal',
        special_client_id: row.dataset.specialClientId || null,
        special_location_id: row.dataset.specialLocationId || null,
        special_group_id: row.dataset.specialGroupId || null,
        special_brand_id: row.dataset.specialBrandId || null,
        group_name: row.dataset.groupName || null,
        brand_name: row.dataset.brandName || null
      }, data);
    });

    payloads = payloads.filter(row => {
      if (!row.location_name) return false;
      if (row.source_type === 'special_client') {
        return Boolean(row.special_client_id && row.special_location_id);
      }
      return Boolean(row.company_id);
    });

    if (!payloads.length) throw new Error('No valid locations were found to save completion.');

    const invalid = payloads.find(row => !completionRowIsValid(row));
    if (invalid) throw new Error(`Total percentage for ${invalid.location_name} cannot exceed 100%.`);

    let saveError = null;
    const rpcResult = await withCsTimeout(
      client.rpc('cs360_upsert_location_completions', { p_rows: payloads }),
      25000,
      'Saving completion report'
    );

    if (rpcResult?.error && isMissingRpcError(rpcResult.error, 'cs360_upsert_location_completions')) {
      // Backward-compatible fallback while the migration is being deployed.
      const conflictKey = scope === 'special_client'
        ? 'source_type,special_client_id,special_location_id,review_type,period_start,period_end'
        : 'company_id,location_name,review_type,period_start,period_end';
      const fallback = await withCsTimeout(
        client.from(TABLES.completions).upsert(payloads, { onConflict: conflictKey }),
        25000,
        'Saving completion report'
      );
      saveError = fallback?.error || null;
    } else {
      saveError = rpcResult?.error || null;
    }

    if (saveError) throw new Error(`Unable to save completion: ${saveError.message}`);

    closeModal();

    // Reload only completion rows instead of reloading every CS360 table.
    const completions = await fetchTable(TABLES.completions, '*', { column: 'period_end', ascending: false }, 20000);
    STATE.rows.completions = completions.map(applyCs360LocationNameOverride);
    renderDetail();

    const successMessage = scope === 'brand'
      ? `Brand completion saved for ${payloads.length} location line${payloads.length === 1 ? '' : 's'}.`
      : scope === 'group'
        ? `Group completion saved for ${payloads.length} location line${payloads.length === 1 ? '' : 's'}.`
        : scope === 'special_client'
          ? `Special CS Client completion saved for ${payloads.length} location line${payloads.length === 1 ? '' : 's'}.`
          : 'Location completion saved.';
    toast(successMessage);
  }


  function openBrandForm() {
    const company = getSelectedCompany();
    const companyGroups = groupsForCompany(company);
    const selectedGroupId = String(STATE.filters.group || '').trim();
    const selectedGroup = selectedGroupId && !['All','Ungrouped'].includes(selectedGroupId) ? groupById(selectedGroupId) : null;
    const defaultGroup = selectedGroup || (companyGroups.length === 1 ? companyGroups[0] : null);
    const groups = activeGroups();
    const defaultScope = defaultGroup ? 'group' : 'company';
    const groupOpts = groups.map(group => `<option value="${attr(groupId(group))}" ${defaultGroup && groupId(group) === groupId(defaultGroup) ? 'selected' : ''}>${esc(groupName(group))}</option>`).join('');
    openModal('Create Brand Name', `<form class="cs-form" id="csBrandForm">
      <div class="cs-form-grid">
        <div class="cs-form-field cs-form-field--full"><label>Brand Flow</label><div class="cs-mini-note">First create the brand name only. Then use <strong>Manage Locations</strong> to assign or move locations to this brand.</div></div>
        <div class="cs-form-field"><label>Brand Name</label><input name="brand_name" class="input" type="text" placeholder="e.g. Kcal KSA, Kcal UAE" required /></div>
        <div class="cs-form-field"><label>Brand Code</label><input name="brand_code" class="input" type="text" placeholder="Optional" /></div>
        <div class="cs-form-field"><label>Initial Scope</label><select name="brand_scope" class="select"><option value="company" ${defaultScope === 'company' ? 'selected' : ''}>Current Client only</option><option value="group" ${groups.length ? '' : 'disabled'} ${defaultScope === 'group' ? 'selected' : ''}>CS Client Group</option></select></div>
        <div class="cs-form-field" id="csBrandGroupField" style="display:none;"><label>CS Client Group</label><select name="group_id" class="select">${groupOpts || '<option value="">No groups yet</option>'}</select></div>
        ${selectField('status','Status',['Active','Watch','At Risk','Archived'],'Active')}
        <div class="cs-form-field"><label>Owner / CSM</label><input name="owner_name" class="input" type="text" placeholder="Optional" /></div>
        <div class="cs-form-field cs-form-field--full"><label>Description</label><textarea name="description" class="input" placeholder="Optional brand notes"></textarea></div>
      </div>
      <div class="cs-modal-actions"><button type="button" class="btn ghost" onclick="document.getElementById('csModalClose').click()">Cancel</button><button type="submit" class="btn primary">Save Brand Name</button></div>
    </form>`, async form => {
      const fd = new FormData(form);
      const scope = fd.get('brand_scope') || 'company';
      const group = scope === 'group' ? groupById(fd.get('group_id')) : null;
      if (scope === 'group' && !group) { toast('Select a valid CS client group.'); return; }
      const payload = {
        brand_name: fd.get('brand_name'),
        brand_code: fd.get('brand_code') || null,
        company_id: scope === 'company' ? companyId(company) : null,
        company_name_snapshot: scope === 'company' ? companyName(company) : null,
        group_id: scope === 'group' ? fd.get('group_id') : null,
        group_name_snapshot: group ? groupName(group) : null,
        owner_name: fd.get('owner_name') || null,
        status: fd.get('status') || 'Active',
        description: fd.get('description') || null
      };
      const { error } = await supabase().from(TABLES.brands).insert(payload);
      if (error) { toast(`Unable to save brand: ${error.message}`); return; }
      closeModal(); await loadData(); toast('Brand name created. Now assign locations from Manage Locations.');
    });
    const form = $('csBrandForm');
    const toggle = () => { const isGroup = form?.brand_scope?.value === 'group'; const field = $('csBrandGroupField'); if (field) field.style.display = isGroup ? '' : 'none'; };
    form?.brand_scope?.addEventListener('change', toggle);
    toggle();
  }

  function brandScopeTargets(brand) {
    if (brand?.group_id) return groupCompletionTargets(groupById(brand.group_id) || {});
    if (brand?.company_id) {
      const company = STATE.rows.companies.find(c => companyId(c) === String(brand.company_id || '').trim()) || getSelectedCompany();
      return currentClientCompletionTargets(company);
    }
    const firstGroup = groupsForCompany(getSelectedCompany())[0];
    return firstGroup ? groupCompletionTargets(firstGroup) : currentClientCompletionTargets(getSelectedCompany());
  }

  function brandLocationScopeMatches(row, brand) {
    if (!row || !brand) return false;
    if (brand.group_id) return String(row.group_id || '').trim() === String(brand.group_id || '').trim();
    return !String(row.group_id || '').trim() && String(row.company_id || '').trim() === String(brand.company_id || '').trim();
  }

  function brandOwnerForTarget(brand, target) {
    const locationKey = normalize(target?.location_name || '');
    const companyKey = String(target?.company_id || '').trim();
    const row = (STATE.rows.brandLocations || []).find(item => {
      if (!brandLocationScopeMatches(item, brand)) return false;
      return String(item.company_id || '').trim() === companyKey && normalize(item.location_name) === locationKey && !['inactive','archived','deleted'].includes(String(item.status || '').trim().toLowerCase());
    });
    if (!row) return null;
    return brandById(row.brand_id) || { id: row.brand_id, brand_name: row.brand_name_snapshot || 'Unknown Brand' };
  }

  function encodeBrandLocationTarget(target = {}) {
    return [target.company_id, target.company_name, target.location_name, target.service_start_date || '', target.service_end_date || '']
      .map(v => encodeURIComponent(String(v || '')))
      .join('|');
  }

  function parseBrandLocationOption(value = '') {
    const [company_id, company_name, location_name, service_start_date, service_end_date] = String(value || '').split('|').map(v => decodeURIComponent(v || ''));
    return { company_id, company_name, location_name, service_start_date, service_end_date };
  }

  function assignedBrandLocationRows(brand) {
    return brandLocationRows(brand).sort((a,b) => `${a.company_name_snapshot || ''} ${a.location_name || ''}`.localeCompare(`${b.company_name_snapshot || ''} ${b.location_name || ''}`));
  }

  function renderAvailableBrandLocations(brand) {
    if (!brand) return '<div class="cs-empty">Select a brand first.</div>';
    const targets = brandScopeTargets(brand);
    if (!targets.length) return '<div class="cs-empty">No active locations found for this brand scope.</div>';
    const scopeText = brand.group_id
      ? `Group scope: ${esc(groupName(groupById(brand.group_id) || {}))}`
      : `Client scope: ${esc(brand.company_name_snapshot || companyName(getSelectedCompany()))}`;
    return `<div class="cs-kpi-sub" style="margin-bottom:8px;">${scopeText} · showing ${targets.length} active location${targets.length === 1 ? '' : 's'}</div>
      <div class="cs-table-wrap cs-brand-location-table"><table class="cs-table"><thead><tr><th>Client</th><th>Location</th><th>Current Brand</th><th>Action</th></tr></thead><tbody>${targets.map(target => {
        const owner = brandOwnerForTarget(brand, target);
        const isHere = owner && brandId(owner) === brandId(brand);
        const payload = encodeBrandLocationTarget(target);
        const current = owner ? brandName(owner) : 'Unassigned';
        const actionLabel = isHere ? 'Already Assigned' : (owner ? 'Move Here' : 'Assign');
        return `<tr>
          <td>${esc(target.company_name)}</td>
          <td><strong>${esc(target.location_name)}</strong></td>
          <td><span class="cs-chip ${isHere ? 'cs-chip--healthy' : owner ? 'cs-chip--watch' : ''}">${esc(current)}</span></td>
          <td>${isHere
            ? `<button class="btn ghost sm" type="button" disabled>Assigned</button>`
            : `<button class="btn sm" type="button" data-cs-action="brand-location-assign" class="cs-brand-assign-btn" data-brand-id="${attr(brandId(brand))}" data-location-payload="${attr(payload)}">${esc(actionLabel)}</button>`}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function renderAssignedBrandLocations(brand) {
    if (!brand) return '<div class="cs-empty">Select a brand.</div>';
    const rows = assignedBrandLocationRows(brand);
    if (!rows.length) return '<div class="cs-empty">No locations assigned to this brand yet. Use the Available Locations table above.</div>';
    return `<div class="cs-table-wrap cs-brand-location-table"><table class="cs-table"><thead><tr><th>Client</th><th>Location</th><th>Status</th><th>Move To</th><th>Action</th></tr></thead><tbody>${rows.map(row => {
      const rowGroupId = String(row.group_id || '').trim();
      const rowCompanyId = String(row.company_id || '').trim();
      const moveOptions = activeBrands().filter(other => {
        if (brandId(other) === brandId(brand)) return false;
        if (rowGroupId) return String(other.group_id || '').trim() === rowGroupId;
        return !String(other.group_id || '').trim() && String(other.company_id || '').trim() === rowCompanyId;
      }).sort((a,b) => brandName(a).localeCompare(brandName(b))).map(other => `<option value="${attr(brandId(other))}">${esc(brandName(other))}</option>`).join('');
      return `<tr>
        <td>${esc(row.company_name_snapshot || '')}</td>
        <td><strong>${esc(row.location_name || '')}</strong></td>
        <td>${esc(row.status || 'Active')}</td>
        <td>${moveOptions ? `<select class="select" data-brand-location-move-select="${attr(row.id)}">${moveOptions}</select>` : '<span class="cs-kpi-sub">No other brand in same scope</span>'}</td>
        <td>
          ${moveOptions ? `<button class="btn ghost sm" type="button" data-cs-action="brand-location-move" data-brand-location-id="${attr(row.id)}">Move</button>` : ''}
          <button class="btn ghost sm" type="button" data-cs-action="brand-location-remove" data-brand-location-id="${attr(row.id)}">Remove</button>
        </td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  }

  async function removeBrandLocation(rowId = '') {
    const id = String(rowId || '').trim();
    if (!id) return;
    const row = (STATE.rows.brandLocations || []).find(item => String(item.id || '').trim() === id);
    const label = row ? `${row.location_name || 'this location'} from ${row.brand_name_snapshot || 'this brand'}` : 'this brand location';
    if (!confirm(`Remove ${label}?`)) return;
    const { error } = await supabase().from(TABLES.brandLocations).delete().eq('id', id);
    if (error) { toast(`Unable to remove location: ${error.message}`); return; }
    closeModal();
    await loadData();
    toast('Location removed from brand.');
  }

  async function assignLocationToBrand(brand, target, status = 'Active', notes = '') {
    try {
      if (!brand || !target?.company_id || !target?.location_name) { toast('Select a valid brand and location.'); return; }
      const groupIdValue = brand.group_id || null;
      let deleteQuery = supabase().from(TABLES.brandLocations).delete()
        .eq('company_id', target.company_id)
        .eq('location_name', target.location_name);
      if (groupIdValue) deleteQuery = deleteQuery.eq('group_id', groupIdValue);
      else deleteQuery = deleteQuery.is('group_id', null);
      const { error: deleteError } = await deleteQuery;
      if (deleteError) { toast(`Unable to prepare location move: ${deleteError.message}`); return; }

      const payload = {
        brand_id: brandId(brand),
        brand_name_snapshot: brandName(brand),
        group_id: groupIdValue,
        group_name_snapshot: groupIdValue ? groupName(groupById(groupIdValue) || {}) : null,
        company_id: target.company_id,
        company_name_snapshot: target.company_name,
        location_name: target.location_name,
        service_start_date: target.service_start_date || null,
        service_end_date: target.service_end_date || null,
        status: status || 'Active',
        notes: notes || null
      };
      const { error } = await supabase().from(TABLES.brandLocations).upsert(payload, { onConflict: 'brand_id,company_id,location_name' });
      if (error) { toast(`Unable to assign location: ${error.message}`); return; }
      closeModal();
      await loadData();
      toast(`${target.location_name} assigned to ${brandName(brand)}.`);
    } catch (error) {
      console.error('[ClientSuccess360] brand location assign failed', error);
      toast(`Unable to assign location: ${error.message || error}`);
    }
  }

  async function moveBrandLocation(rowId = '', targetBrandId = '') {
    const row = (STATE.rows.brandLocations || []).find(item => String(item.id || '').trim() === String(rowId || '').trim());
    const targetBrand = brandById(targetBrandId);
    if (!row || !targetBrand) { toast('Select a valid location and destination brand.'); return; }
    await assignLocationToBrand(targetBrand, {
      company_id: row.company_id,
      company_name: row.company_name_snapshot,
      location_name: row.location_name,
      service_start_date: row.service_start_date,
      service_end_date: row.service_end_date
    }, row.status || 'Active', row.notes || '');
  }

  function openBrandLocationForm(preselectedBrandId = '') {
    const brands = activeBrandsForSelect(getSelectedCompany());
    if (!brands.length) { toast('Create a brand first.'); openBrandForm(); return; }
    const selectedBrand = brandById(preselectedBrandId) || brands[0];
    const brandOpts = brands.map(brand => `<option value="${attr(brandId(brand))}" ${brandId(brand) === brandId(selectedBrand) ? 'selected' : ''}>${esc(brandName(brand))} · ${esc(brandScopeLabel(brand))}</option>`).join('');
    openModal('Manage Brand Locations', `<form class="cs-form" id="csBrandLocationForm">
      <div class="cs-form-grid">
        <div class="cs-form-field"><label>Brand</label><select name="brand_id" class="select" required>${brandOpts}</select></div>
        ${selectField('status','Status for New Assignment',['Active','Inactive'],'Active')}
        <div class="cs-form-field cs-form-field--full"><label>Notes for New Assignment</label><textarea name="notes" class="input" placeholder="Optional"></textarea></div>
      </div>
      <div class="cs-kpi-sub">If the selected brand is group-scoped, all group locations appear below. If it is client-scoped, only that client’s locations appear.</div>
      <div class="cs-section-title" style="margin-top:12px;"><h4>Available Locations</h4><span class="cs-chip">Assign or move here</span></div>
      <div id="csBrandAvailableLocations"></div>
      <div class="cs-section-title" style="margin-top:12px;"><h4>Assigned Locations</h4><span class="cs-chip">Remove or move between brands</span></div>
      <div id="csBrandAssignedLocations"></div>
      <div class="cs-modal-actions"><button type="button" class="btn ghost" onclick="document.getElementById('csModalClose').click()">Close</button></div>
    </form>`, async () => {});
    const form = $('csBrandLocationForm');
    const rebuild = () => {
      const brand = brandById(form?.brand_id?.value) || brands[0];
      const availableHost = $('csBrandAvailableLocations');
      const assignedHost = $('csBrandAssignedLocations');
      if (availableHost) availableHost.innerHTML = renderAvailableBrandLocations(brand);
      if (assignedHost) assignedHost.innerHTML = renderAssignedBrandLocations(brand);
    };
    form?.brand_id?.addEventListener('change', rebuild);

    // Direct modal binding: prevents silent failures from global event delegation inside the modal table.
    form?.addEventListener('click', ev => {
      const assignBtn = ev.target?.closest?.('[data-cs-action="brand-location-assign"]');
      if (assignBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        assignLocationToBrand(
          brandById(assignBtn.getAttribute('data-brand-id') || form.elements.brand_id?.value || ''),
          parseBrandLocationOption(assignBtn.getAttribute('data-location-payload') || ''),
          form.elements.status?.value || 'Active',
          form.elements.notes?.value || ''
        );
        return;
      }

      const moveBtn = ev.target?.closest?.('[data-cs-action="brand-location-move"]');
      if (moveBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        const rowId = moveBtn.getAttribute('data-brand-location-id') || '';
        const safeRowId = window.CSS?.escape ? CSS.escape(rowId) : String(rowId).replace(/"/g, '\\"');
        const select = form.querySelector(`[data-brand-location-move-select="${safeRowId}"]`);
        moveBrandLocation(rowId, select?.value || '');
        return;
      }

      const removeBtn = ev.target?.closest?.('[data-cs-action="brand-location-remove"]');
      if (removeBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        removeBrandLocation(removeBtn.getAttribute('data-brand-location-id') || '');
      }
    });

    rebuild();
  }

  function openReviewForm() {
    const [weekStart, weekEnd] = periodDefaults('weekly');
    const questions = STATE.templateQuestions.weekly || QUESTION_BANK.weekly;
    openModal('New Client Pulse Review', `<form class="cs-form" id="csReviewForm">
      <div class="cs-form-grid">${selectedCompanyInput()}
        <div class="cs-form-field"><label>Review Type</label><select name="review_type" class="select"><option value="weekly">Weekly Review</option><option value="monthly">Monthly Review</option></select></div>
        <div class="cs-form-field"><label>Review Date</label><input name="review_date" class="input" type="date" value="${isoToday()}" required /></div>
        <div class="cs-form-field"><label>Period Start</label><input name="review_period_start" class="input" type="date" value="${weekStart}" required /></div>
        <div class="cs-form-field"><label>Period End</label><input name="review_period_end" class="input" type="date" value="${weekEnd}" required /></div>
        ${selectField('client_status','Client Status',['Onboarding','Live','Watch','At Risk','Suspended','Churned'],'Live')}
        ${selectField('satisfaction_level','Satisfaction',['Very Satisfied','Satisfied','Neutral','Unsatisfied','Critical','Unknown'],'Unknown')}
        ${selectField('adoption_level','Adoption Level',['Excellent','Good','Partial','Low','Unknown'],'Unknown')}
        ${selectField('relationship_status','Relationship Status',['Strong','Normal','Weak','At Risk'],'Normal')}
        ${selectField('cs_effort_level','CS Effort Level',['Normal Care','Needs Attention','High Touch','Recovery Required'],'Normal Care')}
        ${selectField('extra_cs_effort_needed','Extra CS Effort Needed?',[['false','No'],['true','Yes']],'false')}
        ${selectField('escalation_required','Escalation Required?',[['false','No'],['true','Yes']],'false')}
        ${selectField('status','Review Status',['Draft','Completed','Needs Follow-up','Escalated'],'Completed')}
        <div class="cs-form-field cs-form-field--full"><label>Summary</label><textarea name="summary" class="input" placeholder="What changed this period? Is the client satisfied? Any extra CS effort needed?"></textarea></div>
        <div class="cs-form-field"><label>Next Action</label><input name="next_action" class="input" type="text" placeholder="e.g. Schedule training" /></div>
        <div class="cs-form-field"><label>Next Follow-up Date</label><input name="next_follow_up_date" class="input" type="date" /></div>
      </div>
      <div class="cs-section-title"><h4>Review Questions</h4><span id="csCompletionPreview" class="cs-chip">Review Quality 0%</span></div>
      <div id="csQuestionGrid" class="cs-question-grid">${renderQuestionInputs(questions)}</div>
      <div class="cs-modal-actions"><button type="button" class="btn ghost" onclick="document.getElementById('csModalClose').click()">Cancel</button><button type="submit" class="btn primary">Save Review</button></div>
    </form>`, saveReview);
    const form = $('csReviewForm');
    const updateQuestions = () => {
      const type = form.review_type.value;
      const [s,e] = periodDefaults(type);
      form.review_period_start.value = s; form.review_period_end.value = e;
      $('csQuestionGrid').innerHTML = renderQuestionInputs(STATE.templateQuestions[type] || QUESTION_BANK[type]);
      refreshCompletionPreview(form);
    };
    form.review_type.addEventListener('change', updateQuestions);
    form.addEventListener('input', () => refreshCompletionPreview(form));
    refreshCompletionPreview(form);
  }

  function refreshCompletionPreview(form) { const pct = calculateCompletion(form); const el = $('csCompletionPreview'); if (el) el.textContent = `Review Quality ${pct}%`; }
  function renderQuestionInputs(questions) { return questions.map(([key,label]) => `<label class="cs-question-row"><span>${esc(label)}</span><select class="select" data-review-answer data-question-key="${attr(key)}" data-question-label="${attr(label)}"><option value="">Select</option><option>Yes</option><option>No</option><option>N/A</option><option>Unknown</option><option>Partially</option></select></label>`).join(''); }

  function selectField(name, label, options, selected) {
    const opts = options.map(o => Array.isArray(o) ? `<option value="${attr(o[0])}" ${o[0] === selected ? 'selected' : ''}>${esc(o[1])}</option>` : `<option value="${attr(o)}" ${o === selected ? 'selected' : ''}>${esc(o)}</option>`).join('');
    return `<div class="cs-form-field"><label>${esc(label)}</label><select name="${attr(name)}" class="select">${opts}</select></div>`;
  }

  async function saveReview(form) {
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    payload.extra_cs_effort_needed = payload.extra_cs_effort_needed === 'true';
    payload.escalation_required = payload.escalation_required === 'true';
    payload.review_completion_percent = calculateCompletion(form);
    const identity = getIdentity();
    payload.csm_user_id = identity.id || null;
    payload.csm_name = identity.name;
    payload.csm_email = identity.email;
    const { data, error } = await supabase().from(TABLES.reviews).insert(payload).select('*').single();
    if (error) { toast(`Unable to save review: ${error.message}`); return; }
    const answers = Array.from(form.querySelectorAll('[data-review-answer]')).map((el, index) => ({ review_id: data.id, question_key: el.dataset.questionKey, question_label: el.dataset.questionLabel, answer_value: el.value || 'N/A', sort_order: index + 1 }));
    if (answers.length) await supabase().from(TABLES.answers).insert(answers);
    closeModal(); await loadData(); toast('Client pulse review saved.');
  }

  function getIdentity() {
    const auth = global.Session?.user?.() || global.Session?.authContext?.() || {};
    const profile = auth.profile || auth.user || auth || {};
    const email = profile.email || auth.email || auth.user?.email || '';
    const name = profile.name || profile.full_name || auth.name || (email ? String(email).split('@')[0] : 'Admin');
    return { id: profile.id || auth.id || auth.user?.id || null, name, email };
  }

  function openTaskForm() { openSimpleForm('New CS Task', TABLES.tasks, [
    ['title','Task Title','text', true], ['assigned_to','Assigned To','text'], ['priority','Priority','select:Low|Medium|High|Urgent', false, 'Medium'], ['due_date','Due Date','date'], ['status','Status','select:To Do|In Progress|Done|Overdue|Canceled', false, 'To Do'], ['location_name','Location','text'], ['notes','Notes','textarea']
  ], 'CS task saved.'); }
  function openRiskForm() { openSimpleForm('New CS Risk', TABLES.risks, [
    ['risk_type','Risk Type','select:Renewal Risk|Low Usage|Client Complaint|Technical Issue|Training Issue|Champion Left Company|Implementation Delay|Competitor Risk|Low Engagement|Operational Escalation|Relationship Risk', false, 'Relationship Risk'], ['severity','Severity','select:Low|Medium|High|Critical', false, 'Medium'], ['status','Status','select:Open|In Progress|Escalated|Resolved|Lost', false, 'Open'], ['owner','Owner','text'], ['due_date','Due Date','date'], ['location_name','Location','text'], ['description','Description','textarea', true], ['root_cause','Root Cause','textarea'], ['action_plan','Action Plan','textarea'], ['escalated_to','Escalated To','text'], ['resolution_notes','Resolution Notes','textarea']
  ], 'CS risk saved.'); }
  function openQbrForm() { openSimpleForm('New QBR / Business Review', TABLES.qbrs, [
    ['meeting_date','Meeting Date','date', true, isoToday()], ['status','Status','select:Planned|Completed|Canceled', false, 'Completed'], ['attendees','Attendees','text'], ['next_qbr_date','Next QBR Date','date'], ['topics_discussed','Topics Discussed','textarea'], ['usage_summary','Usage Summary','textarea'], ['issues','Issues','textarea'], ['client_feedback','Client Feedback','textarea'], ['renewal_discussion','Renewal Discussion','textarea'], ['opportunities','Opportunities','textarea'], ['decisions','Decisions','textarea'], ['action_items','Action Items','textarea']
  ], 'QBR saved.'); }
  async function openAssignExistingContactForm() {
    const company = getSelectedCompany();
    const assigned = new Set(contactRows(company).map(row => String(row.contact_id || '').trim()).filter(Boolean));
    const options = rowsForCompany('mainContacts', company)
      .filter(row => !assigned.has(String(row.id || row.contact_id || '').trim()))
      .map(row => `<option value="${attr(row.id || row.contact_id || '')}">${esc(mainContactName(row) || row.email || 'Unnamed Contact')}</option>`)
      .join('');
    if (!options) { toast('No unassigned contacts found for this client. Create a contact first.'); openContactForm(); return; }
    openModal('Assign Existing Contact to CS', `<form class="cs-form" id="csAssignContactForm">
      <div class="cs-form-grid">${selectedCompanyInput()}
        <div class="cs-form-field cs-form-field--full"><label>Contact from Contacts Module</label><select name="contact_id" class="select" required>${options}</select></div>
        ${selectField('role','CS Role',['Decision Maker','Champion','Operations Contact','Daily User','Escalation Contact','Training Contact','Technical Contact'],'Daily User')}
        ${selectField('influence_level','Influence Level',['Low','Medium','High'],'Medium')}
        ${selectField('relationship_status','Relationship Status',['Strong','Normal','Weak','At Risk'],'Normal')}
        <div class="cs-form-field cs-form-field--full"><label>CS Notes</label><textarea name="notes" class="input"></textarea></div>
      </div>
      <div class="cs-modal-actions"><button type="button" class="btn ghost" onclick="document.getElementById('csModalClose').click()">Cancel</button><button type="submit" class="btn primary">Assign Contact</button></div>
    </form>`, async form => {
      const fd = new FormData(form);
      const contact = (STATE.rows.mainContacts || []).find(row => String(row.id || row.contact_id || '').trim() === String(fd.get('contact_id') || '').trim()) || {};
      await saveCsContactMetadata(company, contact, Object.fromEntries(fd.entries()));
      closeModal(); await loadData(); toast('Contact assigned to Customer Success.');
    });
  }

  function openContactForm() {
    openModal('Create Contact / Champion', `<form class="cs-form" id="csCreateContactForm">
      <div class="cs-form-grid">${selectedCompanyInput()}
        <div class="cs-form-field"><label>Full Name</label><input name="name" class="input" type="text" required /></div>
        <div class="cs-form-field"><label>Title</label><input name="title" class="input" type="text" /></div>
        <div class="cs-form-field"><label>Email</label><input name="email" class="input" type="email" /></div>
        <div class="cs-form-field"><label>Phone</label><input name="phone" class="input" type="text" /></div>
        ${selectField('role','CS Role',['Decision Maker','Champion','Operations Contact','Daily User','Escalation Contact','Training Contact','Technical Contact'],'Daily User')}
        ${selectField('influence_level','Influence Level',['Low','Medium','High'],'Medium')}
        ${selectField('relationship_status','Relationship Status',['Strong','Normal','Weak','At Risk'],'Normal')}
        <div class="cs-form-field cs-form-field--full"><label>Notes</label><textarea name="notes" class="input"></textarea></div>
      </div>
      <div class="cs-modal-actions"><button type="button" class="btn ghost" onclick="document.getElementById('csModalClose').click()">Cancel</button><button type="submit" class="btn primary">Create Contact</button></div>
    </form>`, async form => {
      const fd = Object.fromEntries(new FormData(form).entries());
      const company = getSelectedCompany();
      const contact = await createContactsModuleContact(company, fd);
      await saveCsContactMetadata(company, contact, fd);
      closeModal(); await loadData(); toast('Contact created in Contacts module and assigned to Customer Success.');
    });
  }

  function splitContactName(name = '') {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return { first_name: parts[0] || '', last_name: '' };
    return { first_name: parts.slice(0, -1).join(' '), last_name: parts.slice(-1)[0] };
  }

  function getUnsupportedColumn(message = '') {
    const text = String(message || '');
    const patterns = [/column\s+"([^"]+)"/i, /column\s+'([^']+)'/i, /Could not find the ['"]?([^'"\s]+)['"]?\s+column/i];
    for (const pattern of patterns) { const m = text.match(pattern); if (m?.[1]) return m[1]; }
    return '';
  }

  async function insertWithColumnFallback(tableName, payload) {
    const working = { ...payload };
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const { data, error } = await supabase().from(tableName).insert(working).select('*').single();
      if (!error) return data || working;
      const unsupported = getUnsupportedColumn(error.message || '');
      if (unsupported && Object.prototype.hasOwnProperty.call(working, unsupported)) { delete working[unsupported]; continue; }
      throw error;
    }
    const { data, error } = await supabase().from(tableName).insert(working).select('*').single();
    if (error) throw error;
    return data || working;
  }

  async function resolveContactCompanyFkValue(companyId) {
    try {
      return await global.CrmCompanyContactSelectors?.getCompanyContactFkValue?.(companyId) || companyId;
    } catch { return companyId; }
  }

  async function createContactsModuleContact(company, fd) {
    const name = String(fd.name || '').trim();
    const split = splitContactName(name);
    const canonicalCompanyId = companyId(company);
    const contactCompanyFk = await resolveContactCompanyFkValue(canonicalCompanyId);
    const payload = {
      company_id: contactCompanyFk,
      company_name: companyName(company),
      company_ids: [canonicalCompanyId],
      company_names: companyName(company),
      first_name: split.first_name,
      last_name: split.last_name,
      full_name: name,
      job_title: fd.title || null,
      email: fd.email || null,
      phone: fd.phone || null,
      decision_role: fd.role || 'Daily User',
      contact_status: 'Active',
      notes: fd.notes || null
    };
    const contact = await insertWithColumnFallback('contacts', payload);
    const contactId = String(contact.id || contact.contact_id || '').trim();
    if (contactId) {
      try { await supabase().from('contact_company_assignments').upsert({ contact_id: contactId, company_id: canonicalCompanyId, is_primary: false }, { onConflict: 'contact_id,company_id' }); } catch (error) { console.warn('[ClientSuccess360] contact assignment link skipped', error); }
    }
    return { ...contact, id: contactId, full_name: name, email: fd.email || '', phone: fd.phone || '', job_title: fd.title || '' };
  }

  async function saveCsContactMetadata(company, contact, fd) {
    const contactId = String(contact.id || contact.contact_id || fd.contact_id || '').trim();
    const payload = {
      company_id: companyId(company),
      contact_id: contactId || null,
      contact_name_snapshot: mainContactName(contact) || fd.name || '',
      name: mainContactName(contact) || fd.name || '',
      title: contact.job_title || fd.title || null,
      email: contact.email || fd.email || null,
      phone: contact.phone || contact.mobile || fd.phone || null,
      role: fd.role || contact.decision_role || 'Daily User',
      influence_level: fd.influence_level || 'Medium',
      relationship_status: fd.relationship_status || 'Normal',
      notes: fd.notes || null
    };
    Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });
    const conflict = contactId ? 'company_id,contact_id' : undefined;
    const query = conflict ? supabase().from(TABLES.contacts).upsert(payload, { onConflict: conflict }) : supabase().from(TABLES.contacts).insert(payload);
    const { error } = await query;
    if (error) throw error;
  }

  function openSimpleForm(title, tableName, fields, successMessage) {
    openModal(title, `<form class="cs-form"><div class="cs-form-grid">${selectedCompanyInput()}${fields.map(renderField).join('')}</div><div class="cs-modal-actions"><button type="button" class="btn ghost" onclick="document.getElementById('csModalClose').click()">Cancel</button><button type="submit" class="btn primary">Save</button></div></form>`, async form => {
      const payload = Object.fromEntries(new FormData(form).entries());
      Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });
      const { error } = await supabase().from(tableName).insert(payload);
      if (error) { toast(`Unable to save: ${error.message}`); return; }
      closeModal(); await loadData(); toast(successMessage);
    });
  }

  function renderField([name, label, type, required, value]) {
    const full = type === 'textarea' ? ' cs-form-field--full' : '';
    const req = required ? 'required' : '';
    if (type.startsWith('select:')) {
      const opts = type.replace(/^select:/,'').split('|').map(o => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('');
      return `<div class="cs-form-field${full}"><label>${esc(label)}</label><select name="${attr(name)}" class="select" ${req}>${opts}</select></div>`;
    }
    if (type === 'textarea') return `<div class="cs-form-field${full}"><label>${esc(label)}</label><textarea name="${attr(name)}" class="input" ${req}>${esc(value || '')}</textarea></div>`;
    return `<div class="cs-form-field${full}"><label>${esc(label)}</label><input name="${attr(name)}" class="input" type="${attr(type)}" value="${attr(value || '')}" ${req} /></div>`;
  }

  function init() {
    mount();
    return loadData();
  }

  global.ClientSuccess360 = { init, refresh: loadData, state: STATE };
})(window);
