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
    brandLocations: 'cs_client_brand_locations'
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
    activeTab: 'overview',
    filters: { search: '', status: 'All', health: 'All', effort: 'All', group: 'All' },
    tablesMissing: new Set(),
    rows: {
      companies: [], allCompanies: [], profiles: [], reviews: [], tasks: [], risks: [], qbrs: [], contacts: [], mainContacts: [], activities: [], onboarding: [], agreements: [], agreementItems: [], invoices: [], invoiceItems: [], completions: [], tickets: [], groups: [], groupMembers: [], brands: [], brandLocations: []
    },
    templateQuestions: { weekly: [], monthly: [] }
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
  const roleKey = () => String(global.Permissions?.getCurrentUserRole?.() || global.Session?.role?.() || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  const isAdmin = () => roleKey() === 'admin' || Boolean(global.AdminOverride?.canOverride?.());
  const canAccess = () => isAdmin() || Boolean(global.Permissions?.can?.('client_success', 'view') || global.Permissions?.can?.('client_success', 'manage'));
  const supabase = () => global.SupabaseClient?.getClient?.();

  function toast(message) { global.UI?.toast?.(message); }

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
    return String(row.id || row.company_id || '').trim();
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

  function toSignedClientCompanies(companies, agreements) {
    const previous = STATE.rows.agreements;
    STATE.rows.agreements = Array.isArray(agreements) ? agreements : [];
    const out = (Array.isArray(companies) ? companies : []).filter(companyHasSignedAgreement);
    STATE.rows.agreements = previous;
    return out;
  }

  function getSelectedCompany() {
    const id = STATE.selectedCompanyId || companyId(STATE.rows.companies[0] || {});
    return STATE.rows.companies.find(c => companyId(c) === id) || STATE.rows.companies[0] || null;
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

  function completionRows(company) { return rowsForCompany('completions', company).sort((a,b) => String(b.period_end || b.created_at || '').localeCompare(String(a.period_end || a.created_at || ''))); }

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
    const name = locationNameFromRow(row);
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
    return Array.from(map.values()).sort((a,b) => a.location_name.localeCompare(b.location_name));
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
    return (STATE.rows.brandLocations || []).filter(row => String(row.brand_id || '').trim() === bid && !['inactive','archived','deleted'].includes(String(row.status || '').trim().toLowerCase()));
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
    rows.forEach(row => {
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
    try {
      let query = supabase().from(name).select(select).limit(limit);
      if (order?.column) query = query.order(order.column, { ascending: Boolean(order.ascending) });
      const { data, error } = await query;
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn(`[ClientSuccess360] unable to load ${name}`, error);
      if (/does not exist|schema cache|Could not find/i.test(String(error?.message || ''))) STATE.tablesMissing.add(name);
      return [];
    }
  }

  async function loadData() {
    if (!canAccess()) { renderAccessDenied(); return; }
    STATE.loading = true;
    renderLoading();
    STATE.tablesMissing.clear();
    const client = supabase();
    if (!client) { renderError('Supabase client is not available.'); return; }

    const [allCompanies, profiles, reviews, tasks, risks, qbrs, contacts, mainContacts, activities, onboarding, agreements, agreementItems, invoices, invoiceItems, completions, tickets, groups, groupMembers, brands, brandLocations, templateQuestions] = await Promise.all([
      fetchTable('companies', '*', { column: 'company_name', ascending: true }, 1500),
      fetchTable(TABLES.profiles),
      fetchTable(TABLES.reviews),
      fetchTable(TABLES.tasks),
      fetchTable(TABLES.risks),
      fetchTable(TABLES.qbrs),
      fetchTable(TABLES.contacts),
      fetchTable('contacts', '*', { column: 'created_at', ascending: false }, 3000),
      fetchTable('csm_activities', '*', { column: 'created_at', ascending: false }, 1500),
      fetchTable('operations_onboarding', '*', { column: 'created_at', ascending: false }, 1500),
      fetchTable('agreements', '*', { column: 'created_at', ascending: false }, 1500),
      fetchTable('agreement_items', '*', { column: 'created_at', ascending: false }, 3000),
      fetchTable('invoices', '*', { column: 'created_at', ascending: false }, 2000),
      fetchTable('invoice_items', '*', { column: 'created_at', ascending: false }, 5000),
      fetchTable(TABLES.completions, '*', { column: 'period_end', ascending: false }, 3000),
      fetchTable('tickets', '*', { column: 'created_at', ascending: false }, 1500),
      fetchTable(TABLES.groups, '*', { column: 'group_name', ascending: true }, 1000),
      fetchTable(TABLES.groupMembers, '*', { column: 'created_at', ascending: false }, 3000),
      fetchTable(TABLES.brands, '*', { column: 'brand_name', ascending: true }, 1000),
      fetchTable(TABLES.brandLocations, '*', { column: 'created_at', ascending: false }, 5000),
      fetchTable(TABLES.templateQuestions, '*, cs_review_templates(review_type)', { column: 'sort_order', ascending: true }, 200)
    ]);

    const companies = toSignedClientCompanies(allCompanies, agreements);
    STATE.rows = { companies, allCompanies, profiles, reviews, tasks, risks, qbrs, contacts, mainContacts, activities, onboarding, agreements, agreementItems, invoices, invoiceItems, completions, tickets, groups, groupMembers, brands, brandLocations };
    STATE.templateQuestions.weekly = templateQuestions.filter(q => q.cs_review_templates?.review_type === 'weekly').map(q => [q.question_key, q.question_label]);
    STATE.templateQuestions.monthly = templateQuestions.filter(q => q.cs_review_templates?.review_type === 'monthly').map(q => [q.question_key, q.question_label]);
    if (!STATE.templateQuestions.weekly.length) STATE.templateQuestions.weekly = QUESTION_BANK.weekly;
    if (!STATE.templateQuestions.monthly.length) STATE.templateQuestions.monthly = QUESTION_BANK.monthly;
    if (!STATE.selectedCompanyId && companies.length) STATE.selectedCompanyId = companyId(companies[0]);
    STATE.loading = false;
    render();
  }

  function mount() {
    const root = $('clientSuccessRoot');
    if (!root) return;
    if (STATE.booted) return;
    STATE.booted = true;
    root.className = 'client-success-root';
    root.innerHTML = `
      <div class="cs-page-header cs-hero-header">
        <div class="cs-hero-copy">
          <span class="cs-eyebrow">Customer Success · Admin Only</span>
          <h2>Client Success 360</h2>
          <p>Monitor signed-agreement clients, location completion, satisfaction, weekly/monthly pulse reviews, extra CS effort, risks, tasks, onboarding follow-up, renewals, QBRs, contacts, and activity. No payment, invoice, receipt, collection, or accounting data is used.</p>
        </div>
        <div class="cs-header-actions">
          <span class="cs-admin-chip">Admin access only</span>
          <button id="csRefreshBtn" class="btn ghost sm" type="button">Refresh</button>
          <button id="csAddCompletionBtn" class="btn sm primary" type="button">+ Location Completion</button>
          <button id="csAddGroupBtn" class="btn ghost sm" type="button">+ Client Group</button>
          <button id="csAddGroupMemberBtn" class="btn ghost sm" type="button">+ Add to Group</button>
          <button id="csAddBrandBtn" class="btn ghost sm" type="button">+ Brand</button>
          <button id="csAddBrandLocationBtn" class="btn ghost sm" type="button">+ Brand Location</button>
          <button id="csAddReviewBtn" class="btn ghost sm" type="button">+ Pulse Review</button>
          <button id="csAddTaskBtn" class="btn ghost sm" type="button">+ Task</button>
          <button id="csAddRiskBtn" class="btn ghost sm" type="button">+ Risk</button>
          <button id="csAddQbrBtn" class="btn ghost sm" type="button">+ QBR</button>
          <button id="csAddContactBtn" class="btn ghost sm" type="button">+ Contact</button>
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
    $('csRefreshBtn')?.addEventListener('click', () => loadData());
    $('csAddCompletionBtn')?.addEventListener('click', () => openCompletionForm());
    $('csAddGroupBtn')?.addEventListener('click', () => openGroupForm());
    $('csAddGroupMemberBtn')?.addEventListener('click', () => openGroupMemberForm());
    $('csAddBrandBtn')?.addEventListener('click', () => openBrandForm());
    $('csAddBrandLocationBtn')?.addEventListener('click', () => openBrandLocationForm());
    $('csAddReviewBtn')?.addEventListener('click', () => openReviewForm());
    $('csAddTaskBtn')?.addEventListener('click', () => openTaskForm());
    $('csAddRiskBtn')?.addEventListener('click', () => openRiskForm());
    $('csAddQbrBtn')?.addEventListener('click', () => openQbrForm());
    $('csAddContactBtn')?.addEventListener('click', () => openContactForm());
    $('csModalClose')?.addEventListener('click', closeModal);
    $('csModal')?.addEventListener('click', ev => { if (ev.target?.id === 'csModal') closeModal(); });
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
    root.innerHTML = `<div class="cs-page-header"><div><span class="cs-eyebrow">Customer Success</span><h2>Client Success 360</h2><p class="cs-danger">Access denied. This module is Admin-only for now.</p></div></div>`;
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
      : `${STATE.rows.companies.length} signed-agreement clients loaded · Admin-only CS workspace`;
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
      { label: 'Active Clients', value: companies.length, sub: '+ signed agreements', icon: '👥', tone: 'blue' },
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

  function renderClientList() {
    const list = getFilteredCompanies();
    if (!list.some(c => companyId(c) === STATE.selectedCompanyId)) STATE.selectedCompanyId = companyId(list[0] || STATE.rows.companies[0] || {});
    const host = $('csClientList');
    if (!host) return;
    if (!list.length) { host.innerHTML = '<div class="cs-empty">No clients match the current filters.</div>'; renderDetail(); return; }
    host.innerHTML = list.map(company => {
      const id = companyId(company);
      const profile = getProfile(company);
      const score = computeHealth(company);
      const reviews = reviewRows(company);
      const latest = reviews[0] || {};
      const status = profile.client_status || mapCompanyStatus(company.company_status);
      return `<button class="cs-client-card ${id === STATE.selectedCompanyId ? 'is-active' : ''}" type="button" data-company-id="${attr(id)}">
        <div class="cs-client-name"><span>${esc(companyName(company))}</span><span>${esc(company.company_id || '')}</span></div>
        <div class="cs-client-meta">
          ${healthChip(score)}
          <span class="cs-chip cs-chip--blue">${esc(status)}</span>
          <span class="cs-chip cs-chip--violet">${esc(computeEffort(company))}</span>
          <span class="cs-chip">${esc(groupLabelForCompany(company))}</span>
        </div>
        <div class="cs-kpi-sub">Last review: ${fmtDate(latest.review_date)} · Last activity: ${fmtDate(latestDate(activityRows(company), ['timestamp','created_at']))}</div>
      </button>`;
    }).join('');
    host.querySelectorAll('[data-company-id]').forEach(btn => btn.addEventListener('click', () => {
      STATE.selectedCompanyId = btn.getAttribute('data-company-id') || '';
      renderClientList(); renderDetail();
    }));
  }

  function renderDetail() {
    const company = getSelectedCompany();
    const host = $('csClientDetail');
    if (!host) return;
    if (!company) { host.innerHTML = '<div class="cs-empty">No clients found. Add companies first.</div>'; return; }
    const profile = getProfile(company);
    const score = computeHealth(company);
    const status = profile.client_status || mapCompanyStatus(company.company_status);
    host.innerHTML = `
      <div class="cs-detail-head">
        <div class="cs-detail-title"><h3>${esc(companyName(company))}</h3><p>${esc(company.city || '')}${company.city && company.country ? ', ' : ''}${esc(company.country || '')} · ${esc(profile.lifecycle_stage || status)}</p></div>
        <div class="cs-health-ring"><div class="cs-health-score">${score}</div><div class="cs-health-label">${esc(healthLabel(score))}</div></div>
      </div>
      <div class="cs-tabs">${['overview','groups','brands','completion','pulse','activity','tasks','risks','onboarding','renewals','qbr','contacts','timeline'].map(tab => `<button class="cs-tab-btn ${STATE.activeTab === tab ? 'is-active' : ''}" type="button" data-cs-tab="${tab}">${tabLabel(tab)}</button>`).join('')}</div>
      <div id="csTabPanel" class="cs-tab-panel is-active">${renderActivePanel(company)}</div>`;
    host.querySelectorAll('[data-cs-tab]').forEach(btn => btn.addEventListener('click', () => { STATE.activeTab = btn.dataset.csTab || 'overview'; renderDetail(); }));
  }

  function tabLabel(tab) { return ({ overview:'Overview', groups:'Groups', brands:'Brands', completion:'Completion', pulse:'Pulse Review', activity:'Activity', tasks:'Tasks', risks:'Risks', onboarding:'Onboarding', renewals:'Renewals', qbr:'QBR', contacts:'Contacts', timeline:'Timeline' }[tab] || tab); }
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
    return `<div class="cs-info-box"><div class="cs-info-value">${missing.map(m => `• ${esc(m)}`).join('<br>')}</div></div>`;
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
          return `<article class="cs-info-box"><div class="cs-info-label">${esc(groupName(group))}</div><div class="cs-info-value">${members.length} signed client${members.length === 1 ? '' : 's'}</div><div class="cs-kpi-sub">${esc(group.description || group.group_code || 'CS parent group')}</div></article>`;
        }).join('')
      : `<div class="cs-empty">${esc(currentClient)} is not assigned to a CS client group yet.</div>`;
    const memberRows = [];
    groups.forEach(group => {
      groupMemberCompanies(group).forEach(member => {
        const score = computeHealth(member);
        memberRows.push([groupName(group), companyName(member), healthLabel(score) + ' · ' + score, computeEffort(member), latestCompletionSummary(member)]);
      });
    });
    return `<div class="cs-section-title"><div><h4>Client Groups</h4><div class="cs-kpi-sub">Use groups to manage several signed-agreement companies under one CS parent account. Brands are the third layer under client/group.</div></div><div><button class="btn sm" type="button" data-cs-action="group">+ New Group</button> <button class="btn ghost sm" type="button" data-cs-action="group-member">+ Add Current Client</button> <button class="btn ghost sm" type="button" data-cs-action="group-activity">+ Group Activity</button> <button class="btn ghost sm" type="button" data-cs-action="brand">+ Brand</button></div></div>
      <div class="cs-info-grid">${summary}</div>
      <div style="margin-top:14px;" class="cs-section-title"><h4>Companies in Same Group</h4></div>
      ${memberRows.length ? table(['Group','Client Company','Health','CS Effort','Completion'], memberRows) : '<div class="cs-empty">No grouped companies to show yet.</div>'}`;
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

  function renderCompletion(company) {
    const locations = getClientLocations(company);
    const records = aggregateCompletionRows(latestCompletionPeriodRows(company));
    const byLocation = new Map(records.map(row => [normalize(row.location_name), row]));
    const rows = locations.map(location => byLocation.get(normalize(location)) || { location_name: location, done_on_time: 0, done_late: 0, partially_done: 0, missed: 0 });
    const period = records[0] ? `${records[0].review_type || 'weekly'} · ${fmtDate(records[0].period_start)} → ${fmtDate(records[0].period_end)}` : 'No period saved yet';
    const avg = averageCompletionMetrics(rows);
    const tableRows = rows.map(row => [
      row.location_name,
      formatPct(row.done_on_time),
      formatPct(row.done_late),
      formatPct(completionCount(row)),
      formatPct(row.partially_done),
      formatPct(row.missed)
    ]);
    return `<div class="cs-section-title"><div><h4>Location Completion</h4><div class="cs-kpi-sub">Entered values are percentages. Completion = Done On-Time + Done Late. Current view: ${esc(period)} · Export uses selected group filter when a CS group is selected.</div></div><div><button class="btn ghost sm" type="button" data-cs-action="completion-export">Export Report</button> <button class="btn sm" type="button" data-cs-action="completion">+ Add Completion</button></div></div>
      <div class="cs-info-grid" style="margin-bottom:12px;"><div class="cs-info-box"><div class="cs-info-label">Average Completion</div><div class="cs-info-value">${avg.completion.toFixed(2)}%</div></div><div class="cs-info-box"><div class="cs-info-label">Average Done On-Time</div><div class="cs-info-value">${avg.done_on_time.toFixed(2)}%</div></div><div class="cs-info-box"><div class="cs-info-label">Average Done Late</div><div class="cs-info-value">${avg.done_late.toFixed(2)}%</div></div><div class="cs-info-box"><div class="cs-info-label">Average Missed</div><div class="cs-info-value">${avg.missed.toFixed(2)}%</div></div></div>
      ${table(['Location','Done On-Time','Done Late','Completion','Partially Done','Missed'], tableRows)}`;
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
      if (type === 'group' && !groupId) { toast('Select a CS client group to export.'); return; }
      if (type === 'brand' && !brandId) { toast('Select a brand/sub-group to export.'); return; }
      closeModal();
      exportCompletionReport({
        report_type: type,
        group_id: groupId,
        brand_id: brandId
      });
    });

    const form = $('csCompletionExportForm');
    const toggle = () => {
      const type = form?.report_type?.value || 'client';
      const groupField = $('csExportGroupField');
      const brandField = $('csExportBrandField');
      if (groupField) groupField.style.display = type === 'group' ? '' : 'none';
      if (brandField) brandField.style.display = type === 'brand' ? '' : 'none';
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

    let isBrandReport = requestedType === 'brand' || Boolean(selectedBrand);
    let isGroupReport = !isBrandReport && (requestedType === 'group' || Boolean(selectedGroup));
    if (requestedType === 'client') { isBrandReport = false; isGroupReport = false; }
    if (isBrandReport && !selectedBrand) { toast('Select a valid brand to export.'); return; }
    if (isGroupReport && !selectedGroup) { toast('Select a valid CS client group to export.'); return; }
    const generatedAt = new Date();

    const completionKey = row => [row.review_type || 'weekly', String(row.period_start || '').slice(0,10), String(row.period_end || '').slice(0,10)].join('|');
    const sortCompletionRows = rows => rows.slice().sort((a,b) => String(b.period_end || b.updated_at || b.created_at || '').localeCompare(String(a.period_end || a.updated_at || a.created_at || '')));

    let reportName = companyName(selectedCompany);
    let clientLabel = companyName(selectedCompany);
    let groupLabel = groupsForCompany(selectedCompany).map(groupName).join(', ') || 'Ungrouped';
    let targetRows = currentClientCompletionTargets(selectedCompany);
    let rawRecords = latestCompletionPeriodRows(selectedCompany).map(row => ({ ...row, company_name: companyName(selectedCompany) }));
    let activePeriodKey = rawRecords[0] ? completionKey(rawRecords[0]) : '';

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

    const recordByTarget = new Map();
    rawRecords.forEach(row => {
      const key = [String(row.company_id || '').trim(), normalize(row.location_name)].join('|');
      if (key !== '|') recordByTarget.set(key, row);
      const fallbackKey = ['name', normalize(row.company_name_snapshot || row.company_name || ''), normalize(row.location_name)].join('|');
      recordByTarget.set(fallbackKey, row);
    });

    const rows = targetRows.map(target => {
      const directKey = completionTargetKey(target);
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
      const directKey = completionTargetKey(target);
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

    const brandCandidates = isBrandReport
      ? [selectedBrand].filter(Boolean)
      : (isGroupReport ? brandsForGroup(selectedGroup) : brandsForCompany(selectedCompany));
    const brandRows = brandCandidates.map(brand => {
      const brandTargets = brandCompletionTargets(brand);
      const targetKeySet = new Set(targetRows.map(completionTargetKey));
      const scopedTargets = brandTargets.filter(target => !targetKeySet.size || targetKeySet.has(completionTargetKey(target)));
      const brandLocations = hydrateCompletionTargets(scopedTargets);
      const brandStats = averageCompletionMetrics(brandLocations);
      const bestLocation = brandLocations.length ? brandLocations.slice().sort((a,b) => completionCount(b) - completionCount(a))[0] : null;
      const weakLocations = brandLocations.filter(row => completionCount(row) < 80).sort((a,b) => completionCount(a) - completionCount(b)).slice(0, 3);
      return { brand, brand_name: brandName(brand), scope: brandScopeLabel(brand), locations: brandLocations, stats: brandStats, bestLocation, weakLocations };
    }).filter(item => item.locations.length);
    const bestBrand = brandRows.length ? brandRows.slice().sort((a,b) => b.stats.completion - a.stats.completion)[0] : null;
    const weakestBrand = brandRows.length ? brandRows.slice().sort((a,b) => a.stats.completion - b.stats.completion)[0] : null;
    const brandGap = bestBrand && weakestBrand ? Math.max(0, bestBrand.stats.completion - weakestBrand.stats.completion) : 0;

    const stats = averageCompletionMetrics(rows);
    const reportType = rawRecords[0]?.review_type || rows[0]?.review_type || 'weekly';
    const periodStart = rawRecords[0]?.period_start || rows[0]?.period_start || '';
    const periodEnd = rawRecords[0]?.period_end || rows[0]?.period_end || '';
    const periodLabel = periodStart || periodEnd ? `${fmtDate(periodStart)} to ${fmtDate(periodEnd)}` : 'No period saved yet';
    const best = rows.length ? rows.slice().sort((a,b) => completionCount(b) - completionCount(a))[0] : null;
    const weak = rows.slice().filter(row => completionCount(row) < 80).sort((a,b) => completionCount(a) - completionCount(b)).slice(0, 3);
    const health = computeHealth(selectedCompany);
    const effort = isGroupReport ? 'Group Review' : computeEffort(selectedCompany);
    const reportTitleSuffix = isBrandReport ? 'Brand Completion Report' : (isGroupReport ? 'Group Completion Report' : 'Client Completion Report');
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

    const reportHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
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
  .report-header{display:grid;grid-template-columns:42mm 1fr;gap:10mm;align-items:start;border-bottom:1px solid var(--line);padding-bottom:6mm;margin-bottom:5mm}
  .brand{min-height:24mm;display:flex;align-items:flex-start}.brand [data-incheck360-doc-logo-slot],.brand [data-incheck360-doc-logo]{display:flex;align-items:flex-start;justify-content:flex-start}.brand .incheck360-doc-logo-wrap{width:40mm!important;max-width:40mm!important;height:24mm!important;max-height:24mm!important}.brand .incheck360-doc-logo{max-width:32mm!important;max-height:20mm!important;width:auto!important;height:auto!important;object-fit:contain;object-position:left top;display:block}.brand-fallback{font-size:20px;font-weight:900;color:var(--ink)}.brand-fallback span{color:var(--brand2)}
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
      <div class="brand"><div data-incheck360-doc-logo-slot></div><div class="brand-fallback" style="display:none;">InCheck <span>360</span></div></div>
      <div class="header-main">
        <div class="header-row">
          <div class="title"><h1>Completion Report</h1><div class="subtitle">${esc(reportTitleSuffix)} · Completion = Done On-Time + Done Late · Values are percentages.</div></div>
        </div>
        <div class="meta-grid">
          <div class="meta"><div class="k">${isBrandReport ? 'Brand' : (isGroupReport ? 'Group' : 'Client')}</div><div class="v">${esc(reportName)}</div></div>
          <div class="meta"><div class="k">Review Type</div><div class="v">${esc(String(reportType || 'weekly').replace(/^./, c => c.toUpperCase()))}</div></div>
          <div class="meta"><div class="k">Period</div><div class="v">${esc(periodLabel)}</div></div>
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
        <div class="section-title"><h2>${isGroupReport ? 'All Group Locations' : 'All Client Locations'}</h2></div>
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
      <div class="insight info-bg"><div class="big-icon">ⓘ</div><div><h3>Notes</h3><p>${esc(sourceNote)}<br/>${isBrandReport ? 'Brand result is auto-calculated from assigned brand location rows.' : (isGroupReport ? 'Group result includes brand/sub-group completion when brands are configured.' : 'Client result is auto-calculated from all location rows.')}<br/>Generated on ${esc(generatedAt.toLocaleString())}.</p></div></div>
    </div>
    <div class="footer"><span>InCheck 360 · Customer Success 360</span><span>Summary · ${esc(generatedAt.toLocaleDateString())}</span></div>
  </section>

  ${brandRows.length ? `<section class="report-page brand-page">
    <div class="report-header">
      <div class="brand"><div data-incheck360-doc-logo-slot></div><div class="brand-fallback" style="display:none;">InCheck <span>360</span></div></div>
      <div class="header-main">
        <div class="header-row"><div class="title"><h1>Brand Completion Insights</h1><div class="subtitle">${esc(reportName)} · Brands such as Kcal KSA / Kcal UAE are calculated from their assigned locations.</div></div></div>
        <div class="meta-grid">
          <div class="meta"><div class="k">Brands</div><div class="v">${brandRows.length}</div></div>
          <div class="meta"><div class="k">Best Brand</div><div class="v">${bestBrand ? esc(bestBrand.brand_name) : '—'}</div></div>
          <div class="meta"><div class="k">Lowest Brand</div><div class="v">${weakestBrand ? esc(weakestBrand.brand_name) : '—'}</div></div>
          <div class="meta"><div class="k">Gap</div><div class="v">${brandGap.toFixed(2)}%</div></div>
        </div>
      </div>
    </div>
    <div class="brand-overview">
      <div class="brand-insight good"><h3>Top performing brand</h3><div class="big">${bestBrand ? `${bestBrand.stats.completion.toFixed(2)}%` : '—'}</div><p>${bestBrand ? `${esc(bestBrand.brand_name)} · ${bestBrand.locations.length} locations` : 'No brand data yet.'}</p></div>
      <div class="brand-insight warn"><h3>Needs operational attention</h3><div class="big">${weakestBrand ? `${weakestBrand.stats.completion.toFixed(2)}%` : '—'}</div><p>${weakestBrand ? `${esc(weakestBrand.brand_name)} · ${weakestBrand.weakLocations.length} locations needing operational attention` : 'No brand data yet.'}</p></div>
      <div class="brand-insight info"><h3>Brand performance gap</h3><div class="big">${brandGap.toFixed(2)}%</div><p>${brandGap >= 15 ? 'Large gap: review playbook/training by brand.' : 'Gap is within normal monitoring range.'}</p></div>
    </div>
    <div class="table-wrap"><table class="report-table brand-table">
      <thead><tr><th class="num">#</th><th class="client-col">Brand / Sub-group</th><th>Locations</th><th>Done On-Time</th><th>Done Late</th><th>Partially Done</th><th>Missed</th><th>Completion</th><th>Insight</th></tr></thead>
      <tbody>${brandRows.map((item, index) => `<tr><td class="num">${index + 1}</td><td><span class="brand-name">${esc(item.brand_name)}</span><span class="brand-scope">${esc(item.scope)}</span></td><td class="pct">${item.locations.length}</td><td class="pct">${item.stats.done_on_time.toFixed(2)}%</td><td class="pct">${item.stats.done_late.toFixed(2)}%</td><td class="pct">${item.stats.partially_done.toFixed(2)}%</td><td class="pct">${item.stats.missed.toFixed(2)}%</td><td class="pct ${item.stats.completion < 80 ? 'low' : 'ok'}">${item.stats.completion.toFixed(2)}%</td><td>${item.stats.completion < 80 ? 'Needs operational attention' : 'On track'}${item.weakLocations.length ? `<ul class="brand-mini-list">${item.weakLocations.map(row => `<li>${esc(row.location_name)} · ${formatPct(completionCount(row))}</li>`).join('')}</ul>` : ''}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="footer"><span>InCheck 360 · Customer Success 360</span><span>Brand insights · ${esc(generatedAt.toLocaleDateString())}</span></div>
  </section>` : ''}

  <section class="report-page table-page">
    <div class="report-header">
      <div class="brand"><div data-incheck360-doc-logo-slot></div><div class="brand-fallback" style="display:none;">InCheck <span>360</span></div></div>
      <div class="header-main">
        <div class="header-row"><div class="title"><h1>Location Completion Details</h1><div class="subtitle">${esc(reportName)} · ${esc(periodLabel)} · ${rows.length} active location${rows.length === 1 ? '' : 's'}</div></div></div>
      </div>
    </div>
    <div class="table-wrap"><table class="report-table">
      <thead><tr><th class="num">#</th><th class="client-col">Client</th><th class="location-col">Location</th><th>Done On-Time</th><th>Done Late</th><th>Partially Done</th><th>Missed</th><th>Completion</th></tr></thead>
      <tbody>${rows.map((row, index) => `<tr><td class="num">${index + 1}</td><td>${esc(row.company_name || reportName)}</td><td>${esc(row.location_name)}</td><td class="pct">${formatPct(row.done_on_time)}</td><td class="pct">${formatPct(row.done_late)}</td><td class="pct">${formatPct(row.partially_done)}</td><td class="pct">${formatPct(row.missed)}</td><td class="pct completion-cell">${formatPct(completionCount(row))}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="footer"><span>InCheck 360 · Customer Success 360</span><span>Location details · ${esc(generatedAt.toLocaleDateString())}</span></div>
  </section>
</div></body></html>`;

    try {
      const brandedReportHtml = window.Utils?.addIncheckDocumentLogo
        ? window.Utils.addIncheckDocumentLogo(reportHtml)
        : reportHtml;
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

  document.addEventListener('click', event => {
    const action = event.target?.closest?.('[data-cs-action]')?.dataset?.csAction;
    if (!action) return;
    if (action === 'completion') openCompletionForm();
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
    return `<input type="hidden" name="company_id" value="${attr(companyId(company))}" />
      <div class="cs-form-field cs-form-field--full"><label>Client</label><input class="input" type="text" value="${attr(companyName(company))}" readonly /></div>`;
  }

  function openModal(title, bodyHtml, onSubmit) {
    const modal = $('csModal');
    $('csModalTitle').textContent = title;
    $('csModalBody').innerHTML = bodyHtml;
    modal.classList.add('is-open'); modal.setAttribute('aria-hidden', 'false');
    const form = $('csModalBody').querySelector('form');
    form?.addEventListener('submit', async ev => { ev.preventDefault(); await onSubmit(form); });
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
    if (!targets.length) return '<tr><td colspan="7" class="cs-empty">No signed client locations found.</td></tr>';
    return targets.map(target => {
      const rowData = sharedData || { done_on_time: 0, done_late: 0, partially_done: 0, missed: 0 };
      const attrs = `data-company-id="${attr(target.company_id)}" data-company-name="${attr(target.company_name)}" data-location-name="${attr(target.location_name)}"`;
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

  function openCompletionForm() {
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
    const initialTargets = currentClientCompletionTargets(company);

    openModal('Add Location Completion', `<form class="cs-form" id="csCompletionForm">
      <div class="cs-form-grid">${selectedCompanyInput()}
        <div class="cs-form-field"><label>Completion Scope</label><select name="completion_scope" class="select"><option value="client">Current Client</option><option value="group" ${groups.length ? '' : 'disabled'}>CS Client Group</option><option value="brand" ${brands.length ? '' : 'disabled'}>CS Brand</option></select></div>
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
    form?.addEventListener('input', () => refreshCompletionRows(form));
    rebuildCompletionRows(form);
  }

  function rebuildCompletionRows(form) {
    if (!form) return;
    const scope = String(form.completion_scope?.value || 'client');
    const isGroup = scope === 'group';
    const isBrand = scope === 'brand';
    const targets = completionTargetsForForm(form);
    const groupField = $('csCompletionGroupField');
    const brandField = $('csCompletionBrandField');
    const groupEntry = $('csGroupCompletionEntry');
    const hint = $('csCompletionHint');
    const body = $('csCompletionRowsBody');
    const aggregateLabel = $('csCompletionAggregateLabel');
    const aggregateTitle = $('csCompletionAggregateTitle');
    if (groupField) groupField.style.display = isGroup ? '' : 'none';
    if (brandField) brandField.style.display = isBrand ? '' : 'none';
    if (groupEntry) groupEntry.style.display = (isGroup || isBrand) ? '' : 'none';
    if (aggregateLabel) aggregateLabel.textContent = isBrand ? 'All Brand Locations' : 'All Group Locations';
    if (aggregateTitle) aggregateTitle.textContent = isBrand ? 'Brand Result Counts' : 'Group Result Counts';
    if (hint) hint.textContent = isBrand
      ? 'For brand scope, enter each assigned company/location below. The All Brand Locations line above is auto-calculated from all entered rows.'
      : (isGroup
        ? 'For group scope, enter each company/location below one time from the same screen. The All Group Locations line above is auto-calculated from all entered rows.'
        : 'For current client scope, you can edit each location separately.');
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
      source_note: fd.get('source_note') || null
    };
  }

  async function saveCompletion(form) {
    const fd = new FormData(form);
    const scope = String(fd.get('completion_scope') || 'client');
    let payloads = [];

    if (scope === 'group') {
      const group = groupById(fd.get('group_id'));
      if (!group) { toast('Select a valid CS client group.'); return; }
    }
    if (scope === 'brand') {
      const brand = brandById(fd.get('brand_id'));
      if (!brand) { toast('Select a valid CS brand.'); return; }
    }
    payloads = Array.from(form.querySelectorAll('.cs-completion-input-row')).map(row => {
      const data = readCompletionInputRow(row);
      return buildCompletionPayload(fd, {
        company_id: row.dataset.companyId,
        company_name: row.dataset.companyName,
        location_name: data.location_name
      }, data);
    });

    payloads = payloads.filter(row => row.company_id && row.location_name);
    if (!payloads.length) { toast('No locations found to save completion.'); return; }
    const invalid = payloads.find(row => !completionRowIsValid(row));
    if (invalid) { toast(`Total percentage for ${invalid.location_name} cannot exceed 100%.`); return; }
    const { error } = await supabase().from(TABLES.completions).upsert(payloads, { onConflict: 'company_id,location_name,review_type,period_start,period_end' });
    if (error) { toast(`Unable to save completion: ${error.message}`); return; }
    closeModal(); await loadData(); toast(scope === 'brand' ? `Brand completion saved for ${payloads.length} location line${payloads.length === 1 ? '' : 's'}.` : (scope === 'group' ? `Group completion saved for ${payloads.length} location line${payloads.length === 1 ? '' : 's'}.` : 'Location completion saved.'));
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
