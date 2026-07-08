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
    groupMembers: 'cs_client_group_members'
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
      companies: [], allCompanies: [], profiles: [], reviews: [], tasks: [], risks: [], qbrs: [], contacts: [], mainContacts: [], activities: [], onboarding: [], agreements: [], agreementItems: [], invoices: [], invoiceItems: [], completions: [], tickets: [], groups: [], groupMembers: []
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
    return safeNumber(row.done_on_time) + safeNumber(row.done_late) + safeNumber(row.partially_done) + safeNumber(row.missed);
  }

  function completionCount(row) {
    return safeNumber(row.done_on_time) + safeNumber(row.done_late);
  }

  function countPct(count, total) {
    const c = Math.max(0, safeDecimal(count));
    const t = Math.max(0, safeDecimal(total));
    const pct = t ? (c / t) * 100 : 0;
    return `${formatDecimal(c)} (${pct.toFixed(2)}%)`;
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
      const totals = latestCompletions.reduce((acc, row) => { acc.done += completionCount(row); acc.total += completionTotal(row); return acc; }, { done: 0, total: 0 });
      const completionRate = totals.total ? (totals.done / totals.total) * 100 : 0;
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

    const [allCompanies, profiles, reviews, tasks, risks, qbrs, contacts, mainContacts, activities, onboarding, agreements, agreementItems, invoices, invoiceItems, completions, tickets, groups, groupMembers, templateQuestions] = await Promise.all([
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
      fetchTable(TABLES.templateQuestions, '*, cs_review_templates(review_type)', { column: 'sort_order', ascending: true }, 200)
    ]);

    const companies = toSignedClientCompanies(allCompanies, agreements);
    STATE.rows = { companies, allCompanies, profiles, reviews, tasks, risks, qbrs, contacts, mainContacts, activities, onboarding, agreements, agreementItems, invoices, invoiceItems, completions, tickets, groups, groupMembers };
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
      <div class="cs-page-header">
        <div>
          <span class="cs-eyebrow">Customer Success · Admin Only</span>
          <h2>Client Success 360</h2>
          <p>Monitor signed-agreement clients, location completion, satisfaction, weekly/monthly pulse reviews, extra CS effort, risks, tasks, onboarding follow-up, renewals, QBRs, contacts, and activity. No payment, invoice, receipt, collection, or accounting data is used.</p>
        </div>
        <div class="cs-header-actions">
          <span class="cs-admin-chip">Admin access only</span>
          <button id="csRefreshBtn" class="btn ghost sm" type="button">Refresh</button>
          <button id="csAddCompletionBtn" class="btn sm" type="button">+ Location Completion</button>
          <button id="csAddGroupBtn" class="btn ghost sm" type="button">+ Client Group</button>
          <button id="csAddGroupMemberBtn" class="btn ghost sm" type="button">+ Add to Group</button>
          <button id="csAddReviewBtn" class="btn ghost sm" type="button">+ Pulse Review</button>
          <button id="csAddTaskBtn" class="btn ghost sm" type="button">+ Task</button>
          <button id="csAddRiskBtn" class="btn ghost sm" type="button">+ Risk</button>
          <button id="csAddQbrBtn" class="btn ghost sm" type="button">+ QBR</button>
          <button id="csAddContactBtn" class="btn ghost sm" type="button">+ Contact</button>
        </div>
      </div>
      <div id="csState" class="cs-state">Loading Client Success 360…</div>
      <div id="csKpis" class="cs-kpi-grid"></div>
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
    const monthlyMissing = companies.filter(c => reviewMissing(c, 'monthly')).length;
    const extraEffort = companies.filter(c => ['High Touch','Recovery Required','Needs Attention'].includes(computeEffort(c))).length;
    const unsatisfied = STATE.rows.reviews.filter(r => ['Unsatisfied','Critical'].includes(r.satisfaction_level)).length;
    const avgCompletionRows = STATE.rows.reviews.filter(r => r.status !== 'Draft');
    const avgCompletion = avgCompletionRows.length ? Math.round(avgCompletionRows.reduce((sum, r) => sum + safeNumber(r.review_completion_percent), 0) / avgCompletionRows.length) : 0;
    const openRisks = openRows(STATE.rows.risks).length;
    const overdueTasks = STATE.rows.tasks.filter(t => t.due_date && t.due_date < isoToday() && !['Done','Canceled'].includes(t.status)).length;
    const latestCompletionRows = companies.flatMap(c => aggregateCompletionRows(latestCompletionPeriodRows(c)));
    const completionTotals = latestCompletionRows.reduce((acc, row) => { acc.done += completionCount(row); acc.total += completionTotal(row); return acc; }, { done: 0, total: 0 });
    const completionRate = completionTotals.total ? Math.round((completionTotals.done / completionTotals.total) * 100) : 0;
    const items = [
      ['Active Clients', companies.length, 'Companies with signed agreements'],
      ['Client Groups', activeGroups().length, 'CS parent groups / account families'],
      ['Clients at Risk', atRisk, 'Health score below 60'],
      ['Weekly Reviews Missing', weeklyMissing, 'Current week not completed'],
      ['Monthly Reviews Missing', monthlyMissing, 'Current month not completed'],
      ['Need Extra CS Effort', extraEffort, 'Needs Attention / High Touch / Recovery'],
      ['Unsatisfied Signals', unsatisfied, 'Unsatisfied or critical review entries'],
      ['Open Risks', openRisks, 'Open / in progress / escalated risks'],
      ['Location Completion', `${completionRate}%`, 'Done On-Time + Done Late'],
      ['Avg Review Quality', `${avgCompletion}%`, `${overdueTasks} overdue task${overdueTasks === 1 ? '' : 's'}`]
    ];
    $('csKpis').innerHTML = items.map(([label, value, sub]) => `<article class="cs-kpi-card"><div class="cs-kpi-label">${esc(label)}</div><div class="cs-kpi-value">${esc(value)}</div><div class="cs-kpi-sub">${esc(sub)}</div></article>`).join('');
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
      <div class="cs-tabs">${['overview','groups','completion','pulse','activity','tasks','risks','onboarding','renewals','qbr','contacts','timeline'].map(tab => `<button class="cs-tab-btn ${STATE.activeTab === tab ? 'is-active' : ''}" type="button" data-cs-tab="${tab}">${tabLabel(tab)}</button>`).join('')}</div>
      <div id="csTabPanel" class="cs-tab-panel is-active">${renderActivePanel(company)}</div>`;
    host.querySelectorAll('[data-cs-tab]').forEach(btn => btn.addEventListener('click', () => { STATE.activeTab = btn.dataset.csTab || 'overview'; renderDetail(); }));
  }

  function tabLabel(tab) { return ({ overview:'Overview', groups:'Groups', completion:'Completion', pulse:'Pulse Review', activity:'Activity', tasks:'Tasks', risks:'Risks', onboarding:'Onboarding', renewals:'Renewals', qbr:'QBR', contacts:'Contacts', timeline:'Timeline' }[tab] || tab); }
  function renderActivePanel(company) {
    switch (STATE.activeTab) {
      case 'groups': return renderGroups(company);
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
    const totals = rows.reduce((acc, row) => { acc.done += completionCount(row); acc.total += completionTotal(row); return acc; }, { done: 0, total: 0 });
    const pct = totals.total ? (totals.done / totals.total) * 100 : 0;
    return `${totals.done}/${totals.total} (${pct.toFixed(2)}%)`;
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
    return `<div class="cs-section-title"><div><h4>Client Groups</h4><div class="cs-kpi-sub">Use groups to manage several signed-agreement companies under one CS parent account.</div></div><div><button class="btn sm" type="button" data-cs-action="group">+ New Group</button> <button class="btn ghost sm" type="button" data-cs-action="group-member">+ Add Current Client</button> <button class="btn ghost sm" type="button" data-cs-action="group-activity">+ Group Activity</button></div></div>
      <div class="cs-info-grid">${summary}</div>
      <div style="margin-top:14px;" class="cs-section-title"><h4>Companies in Same Group</h4></div>
      ${memberRows.length ? table(['Group','Client Company','Health','CS Effort','Completion'], memberRows) : '<div class="cs-empty">No grouped companies to show yet.</div>'}`;
  }

  function renderCompletion(company) {
    const locations = getClientLocations(company);
    const records = aggregateCompletionRows(latestCompletionPeriodRows(company));
    const byLocation = new Map(records.map(row => [normalize(row.location_name), row]));
    const rows = locations.map(location => byLocation.get(normalize(location)) || { location_name: location, done_on_time: 0, done_late: 0, partially_done: 0, missed: 0 });
    const period = records[0] ? `${records[0].review_type || 'weekly'} · ${fmtDate(records[0].period_start)} → ${fmtDate(records[0].period_end)}` : 'No period saved yet';
    const tableRows = rows.map(row => {
      const total = completionTotal(row);
      const doneOnTime = safeNumber(row.done_on_time);
      const doneLate = safeNumber(row.done_late);
      const doneTotal = doneOnTime + doneLate;
      return [
        row.location_name,
        countPct(doneOnTime, total),
        countPct(doneLate, total),
        countPct(doneTotal, total),
        countPct(row.partially_done, total),
        countPct(row.missed, total)
      ];
    });
    return `<div class="cs-section-title"><div><h4>Location Completion</h4><div class="cs-kpi-sub">Completion = Done On-Time + Done Late. Current view: ${esc(period)}</div></div><button class="btn sm" type="button" data-cs-action="completion">+ Add Completion</button></div>
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

  document.addEventListener('click', event => {
    const action = event.target?.closest?.('[data-cs-action]')?.dataset?.csAction;
    if (!action) return;
    if (action === 'completion') openCompletionForm();
    if (action === 'group') openGroupForm();
    if (action === 'group-member') openGroupMemberForm();
    if (action === 'group-activity') openGroupActivityForm();
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
    const total = safeDecimal(data.done_on_time) + safeDecimal(data.done_late) + safeDecimal(data.partially_done) + safeDecimal(data.missed);
    const done = safeDecimal(data.done_on_time) + safeDecimal(data.done_late);
    return countPct(done, total);
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
    const initialTargets = currentClientCompletionTargets(company);

    openModal('Add Location Completion', `<form class="cs-form" id="csCompletionForm">
      <div class="cs-form-grid">${selectedCompanyInput()}
        <div class="cs-form-field"><label>Completion Scope</label><select name="completion_scope" class="select"><option value="client">Current Client</option><option value="group" ${groups.length ? '' : 'disabled'}>CS Client Group</option></select></div>
        <div class="cs-form-field" id="csCompletionGroupField" style="display:none;"><label>CS Client Group</label><select name="group_id" class="select">${groupOptions}</select></div>
        <div class="cs-form-field"><label>Review Type</label><select name="review_type" class="select"><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
        <div class="cs-form-field"><label>Period Start</label><input name="period_start" class="input" type="date" value="${periodStart}" required /></div>
        <div class="cs-form-field"><label>Period End</label><input name="period_end" class="input" type="date" value="${periodEnd}" required /></div>
        <div class="cs-form-field"><label>Source / Notes</label><input name="source_note" class="input" type="text" placeholder="e.g. weekly checklist report" /></div>
      </div>

      <div id="csGroupCompletionEntry" style="display:none;">
        <div class="cs-section-title"><h4>Group Result Counts</h4><span class="cs-chip">Auto-calculated from all location rows below</span></div>
        <div class="cs-table-wrap"><table class="cs-table cs-edit-table"><thead><tr><th>Apply To</th><th>Done On-Time</th><th>Done Late</th><th>Partially Done</th><th>Missed</th><th>Completion</th></tr></thead><tbody>
          <tr class="cs-group-completion-row">
            <td>All Group Locations</td>
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
    form?.addEventListener('input', () => refreshCompletionRows(form));
    rebuildCompletionRows(form);
  }

  function rebuildCompletionRows(form) {
    if (!form) return;
    const scope = String(form.completion_scope?.value || 'client');
    const isGroup = scope === 'group';
    const targets = completionTargetsForForm(form);
    const groupField = $('csCompletionGroupField');
    const groupEntry = $('csGroupCompletionEntry');
    const hint = $('csCompletionHint');
    const body = $('csCompletionRowsBody');
    if (groupField) groupField.style.display = isGroup ? '' : 'none';
    if (groupEntry) groupEntry.style.display = isGroup ? '' : 'none';
    if (hint) hint.textContent = isGroup
      ? 'For group scope, enter each company/location below one time from the same screen. The All Group Locations line above is auto-calculated from all entered rows.'
      : 'For current client scope, you can edit each location separately.';
    if (body) body.innerHTML = renderCompletionTargetsTable(targets, null, true);
    refreshCompletionRows(form);
  }

  function refreshCompletionRows(form) {
    const totals = { done_on_time: 0, done_late: 0, partially_done: 0, missed: 0 };
    form?.querySelectorAll('.cs-completion-input-row').forEach(row => {
      const data = readCompletionInputRow(row);
      ['done_on_time','done_late','partially_done','missed'].forEach(field => { totals[field] += safeDecimal(data[field]); });
      const preview = row.querySelector('.cs-completion-preview');
      if (preview) preview.textContent = completionPreviewText(data);
    });

    ['done_on_time','done_late','partially_done','missed'].forEach(field => {
      const cell = form?.querySelector(`[data-group-total-field="${field}"]`);
      if (cell) cell.textContent = formatDecimal(totals[field]);
    });
    const groupPreview = form?.querySelector('.cs-group-completion-preview');
    if (groupPreview) groupPreview.textContent = completionPreviewText(totals);
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
    const { error } = await supabase().from(TABLES.completions).upsert(payloads, { onConflict: 'company_id,location_name,review_type,period_start,period_end' });
    if (error) { toast(`Unable to save completion: ${error.message}`); return; }
    closeModal(); await loadData(); toast(scope === 'group' ? `Group completion saved for ${payloads.length} location line${payloads.length === 1 ? '' : 's'}.` : 'Location completion saved.');
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
