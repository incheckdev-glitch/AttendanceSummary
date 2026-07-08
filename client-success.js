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
    templateQuestions: 'cs_review_template_questions'
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
    filters: { search: '', status: 'All', health: 'All', effort: 'All' },
    tablesMissing: new Set(),
    rows: {
      companies: [], profiles: [], reviews: [], tasks: [], risks: [], qbrs: [], contacts: [], activities: [], onboarding: [], agreements: [], tickets: []
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

  function companyName(row = {}) {
    return String(row.legal_name || row.legal_company_name || row.company_name || row.customer_legal_name || row.customer_name || row.client_name || row.name || 'Unnamed Client').trim();
  }

  function companyId(row = {}) {
    return String(row.id || row.company_id || '').trim();
  }

  function getSelectedCompany() {
    const id = STATE.selectedCompanyId || companyId(STATE.rows.companies[0] || {});
    return STATE.rows.companies.find(c => companyId(c) === id) || STATE.rows.companies[0] || null;
  }

  function rowsForCompany(kind, company) {
    const id = companyId(company);
    const nameKey = normalize(companyName(company));
    return (STATE.rows[kind] || []).filter(row => {
      const rowCompanyId = String(row.company_id || row.companyId || '').trim();
      if (rowCompanyId && rowCompanyId === id) return true;
      const rowName = normalize(row.company_name || row.companyName || row.client_name || row.clientName || row.client || row.customer_name || row.customer_legal_name || row.manual_client_name || row.manualClientName || '');
      return Boolean(rowName && nameKey && rowName === nameKey);
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
  function contactRows(company) { return rowsForCompany('contacts', company).sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''))); }
  function onboardingRows(company) { return rowsForCompany('onboarding', company); }
  function agreementRows(company) { return rowsForCompany('agreements', company); }
  function ticketRows(company) { return rowsForCompany('tickets', company); }

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

    const [companies, profiles, reviews, tasks, risks, qbrs, contacts, activities, onboarding, agreements, tickets, templateQuestions] = await Promise.all([
      fetchTable('companies', '*', { column: 'company_name', ascending: true }, 1500),
      fetchTable(TABLES.profiles),
      fetchTable(TABLES.reviews),
      fetchTable(TABLES.tasks),
      fetchTable(TABLES.risks),
      fetchTable(TABLES.qbrs),
      fetchTable(TABLES.contacts),
      fetchTable('csm_activities', '*', { column: 'created_at', ascending: false }, 1500),
      fetchTable('operations_onboarding', '*', { column: 'created_at', ascending: false }, 1500),
      fetchTable('agreements', '*', { column: 'created_at', ascending: false }, 1500),
      fetchTable('tickets', '*', { column: 'created_at', ascending: false }, 1500),
      fetchTable(TABLES.templateQuestions, '*, cs_review_templates(review_type)', { column: 'sort_order', ascending: true }, 200)
    ]);

    STATE.rows = { companies, profiles, reviews, tasks, risks, qbrs, contacts, activities, onboarding, agreements, tickets };
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
          <p>Monitor client satisfaction, weekly/monthly pulse review completion, extra CS effort, risks, tasks, onboarding follow-up, renewals, QBRs, contacts, and activity. No payment, invoice, receipt, collection, or accounting data is used.</p>
        </div>
        <div class="cs-header-actions">
          <span class="cs-admin-chip">Admin access only</span>
          <button id="csRefreshBtn" class="btn ghost sm" type="button">Refresh</button>
          <button id="csAddReviewBtn" class="btn sm" type="button">+ Pulse Review</button>
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
    $('csAddReviewBtn')?.addEventListener('click', () => openReviewForm());
    $('csAddTaskBtn')?.addEventListener('click', () => openTaskForm());
    $('csAddRiskBtn')?.addEventListener('click', () => openRiskForm());
    $('csAddQbrBtn')?.addEventListener('click', () => openQbrForm());
    $('csAddContactBtn')?.addEventListener('click', () => openContactForm());
    $('csModalClose')?.addEventListener('click', closeModal);
    $('csModal')?.addEventListener('click', ev => { if (ev.target?.id === 'csModal') closeModal(); });
    ['csSearch','csStatusFilter','csHealthFilter','csEffortFilter'].forEach(id => $(id)?.addEventListener('input', () => {
      STATE.filters.search = $('csSearch')?.value || '';
      STATE.filters.status = $('csStatusFilter')?.value || 'All';
      STATE.filters.health = $('csHealthFilter')?.value || 'All';
      STATE.filters.effort = $('csEffortFilter')?.value || 'All';
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
    renderKpis();
    renderClientList();
    renderDetail();
    const missing = Array.from(STATE.tablesMissing).filter(t => Object.values(TABLES).includes(t));
    const stateText = missing.length
      ? `Run SQL migration first. Missing CS tables: ${missing.join(', ')}`
      : `${STATE.rows.companies.length} clients loaded · Admin-only CS workspace`;
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
    const items = [
      ['Active Clients', companies.length, 'Clients visible from Companies'],
      ['Clients at Risk', atRisk, 'Health score below 60'],
      ['Weekly Reviews Missing', weeklyMissing, 'Current week not completed'],
      ['Monthly Reviews Missing', monthlyMissing, 'Current month not completed'],
      ['Need Extra CS Effort', extraEffort, 'Needs Attention / High Touch / Recovery'],
      ['Unsatisfied Signals', unsatisfied, 'Unsatisfied or critical review entries'],
      ['Open Risks', openRisks, 'Open / in progress / escalated risks'],
      ['Avg Review Completion', `${avgCompletion}%`, `${overdueTasks} overdue task${overdueTasks === 1 ? '' : 's'}`]
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
      <div class="cs-tabs">${['overview','pulse','activity','tasks','risks','onboarding','renewals','qbr','contacts','timeline'].map(tab => `<button class="cs-tab-btn ${STATE.activeTab === tab ? 'is-active' : ''}" type="button" data-cs-tab="${tab}">${tabLabel(tab)}</button>`).join('')}</div>
      <div id="csTabPanel" class="cs-tab-panel is-active">${renderActivePanel(company)}</div>`;
    host.querySelectorAll('[data-cs-tab]').forEach(btn => btn.addEventListener('click', () => { STATE.activeTab = btn.dataset.csTab || 'overview'; renderDetail(); }));
  }

  function tabLabel(tab) { return ({ overview:'Overview', pulse:'Pulse Review', activity:'Activity', tasks:'Tasks', risks:'Risks', onboarding:'Onboarding', renewals:'Renewals', qbr:'QBR', contacts:'Contacts', timeline:'Timeline' }[tab] || tab); }
  function renderActivePanel(company) {
    switch (STATE.activeTab) {
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
      ['Satisfaction', latestReview.satisfaction_level || profile.manual_sentiment || 'Unknown'],
      ['Adoption Level', latestReview.adoption_level || profile.adoption_level || 'Unknown'],
      ['Relationship', latestReview.relationship_status || profile.relationship_status || 'Normal'],
      ['CS Effort Level', computeEffort(company)],
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

  function renderPulse(company) {
    const rows = reviewRows(company);
    return `<div class="cs-section-title"><h4>Weekly / Monthly Client Pulse Reviews</h4><button class="btn sm" type="button" data-cs-action="review">+ New Review</button></div>
      ${rows.length ? table(['Type','Period','Satisfaction','Effort','Completion','Status','Next Action'], rows.map(r => [r.review_type, `${fmtDate(r.review_period_start)} → ${fmtDate(r.review_period_end)}`, r.satisfaction_level, r.cs_effort_level, progress(r.review_completion_percent), r.status, r.next_action || '—'])) : '<div class="cs-empty">No pulse reviews yet. Add weekly/monthly reviews to monitor satisfaction and CS effort.</div>'}`;
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
    return `<div class="cs-section-title"><h4>Client Contacts & Champions</h4><button class="btn sm" type="button" data-cs-action="contact">+ New Contact</button></div>${rows.length ? table(['Name','Title','Role','Influence','Relationship','Email / Phone'], rows.map(r => [r.name, r.title || '—', r.role, r.influence_level, r.relationship_status, [r.email, r.phone].filter(Boolean).join(' / ') || '—'])) : '<div class="cs-empty">No CS contacts/champions added.</div>'}`;
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
    if (action === 'review') openReviewForm();
    if (action === 'task') openTaskForm();
    if (action === 'risk') openRiskForm();
    if (action === 'qbr') openQbrForm();
    if (action === 'contact') openContactForm();
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
      <div class="cs-section-title"><h4>Review Questions</h4><span id="csCompletionPreview" class="cs-chip">Completion 0%</span></div>
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

  function refreshCompletionPreview(form) { const pct = calculateCompletion(form); const el = $('csCompletionPreview'); if (el) el.textContent = `Completion ${pct}%`; }
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
  function openContactForm() { openSimpleForm('New Client Contact / Champion', TABLES.contacts, [
    ['name','Name','text', true], ['title','Title','text'], ['email','Email','email'], ['phone','Phone','text'], ['role','Role','select:Decision Maker|Champion|Operations Contact|Daily User|Escalation Contact|Training Contact|Technical Contact', false, 'Daily User'], ['influence_level','Influence Level','select:Low|Medium|High', false, 'Medium'], ['relationship_status','Relationship Status','select:Strong|Normal|Weak|At Risk', false, 'Normal'], ['notes','Notes','textarea']
  ], 'Client contact saved.'); }

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
