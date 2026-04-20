const Deals = {
  columns: [
    'deal_id',
    'lead_id',
    'full_name',
    'company_name',
    'phone',
    'email',
    'country',
    'lead_source',
    'service_interest',
    'stage',
    'status',
    'priority',
    'estimated_value',
    'currency',
    'assigned_to',
    'proposal_needed',
    'agreement_needed',
    'converted_at',
    'converted_by',
    'notes'
  ],
  formDropdownDefaults: {
    lead_source: ['Website', 'Referral', 'LinkedIn', 'Email', 'Call', 'WhatsApp', 'Event', 'Other'],
    service_interest: ['Software', 'Other', 'Consulting'],
    stage: ['Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'],
    status: ['Open', 'Won', 'Lost', 'On Hold'],
    priority: ['High', 'Medium', 'Low'],
    currency: ['USD', 'EUR', 'GBP', 'AED']
  },
  state: {
    rows: [],
    filteredRows: [],
    loading: false,
    loadError: '',
    loaded: false,
    lastLoadedAt: 0,
    cacheTtlMs: 2 * 60 * 1000,
    initialized: false,
    search: '',
    stage: 'All',
    status: 'All',
    priority: 'All',
    serviceInterest: 'All',
    leadSource: 'All',
    assignedTo: 'All',
    proposalNeeded: 'All',
    agreementNeeded: 'All',
    convertedFrom: '',
    convertedTo: '',
    kpiFilter: 'total',
    saveInFlight: false,
    rowActionInFlight: new Set()
  },
  normalizeBool(value) {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return 'yes';
    if (['false', '0', 'no', 'n'].includes(normalized)) return 'no';
    return '';
  },
  boolLabel(value) {
    if (value === 'yes') return 'Yes';
    if (value === 'no') return 'No';
    return '—';
  },
  normalizeDeal(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const lead = source.lead && typeof source.lead === 'object' ? source.lead : {};
    const pick = (...values) => {
      for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
      return '';
    };

    const dealId = String(raw.deal_id || raw.dealId || raw.id || '').trim();
    return {
      deal_id: dealId,
      lead_id: String(pick(source.lead_id, source.leadId, lead.lead_id, lead.leadId)).trim(),
      full_name: String(pick(source.full_name, source.fullName, lead.full_name, lead.fullName)).trim(),
      company_name: String(
        pick(source.company_name, source.companyName, lead.company_name, lead.companyName)
      ).trim(),
      phone: String(pick(source.phone, lead.phone)).trim(),
      email: String(pick(source.email, lead.email)).trim(),
      country: String(pick(source.country, lead.country)).trim(),
      lead_source: String(
        pick(source.lead_source, source.leadSource, lead.lead_source, lead.leadSource)
      ).trim(),
      service_interest: String(
        pick(source.service_interest, source.serviceInterest, lead.service_interest, lead.serviceInterest)
      ).trim(),
      stage: String(pick(source.stage)).trim(),
      status: String(pick(source.status, lead.status)).trim(),
      priority: String(pick(source.priority, lead.priority)).trim(),
      estimated_value: pick(
        source.estimated_value,
        source.estimatedValue,
        lead.estimated_value,
        lead.estimatedValue
      ),
      currency: String(pick(source.currency, lead.currency)).trim(),
      assigned_to: String(pick(source.assigned_to, source.assignedTo, lead.assigned_to, lead.assignedTo)).trim(),
      proposal_needed: this.normalizeBool(
        pick(source.proposal_needed, source.proposalNeeded, lead.proposal_needed, lead.proposalNeeded)
      ),
      proposal_id: String(pick(source.proposal_id, source.proposalId, lead.proposal_id, lead.proposalId)).trim(),
      agreement_needed: this.normalizeBool(
        pick(source.agreement_needed, source.agreementNeeded, lead.agreement_needed, lead.agreementNeeded)
      ),
      converted_at: pick(source.converted_at, source.convertedAt, lead.converted_at, lead.convertedAt),
      converted_by: String(
        pick(source.converted_by, source.convertedBy, lead.converted_by, lead.convertedBy)
      ).trim(),
      notes: String(pick(source.notes, lead.notes)).trim()
    };
  },
  backendDeal(deal) {
    return {
      lead_id: deal.lead_id,
      full_name: deal.full_name,
      company_name: deal.company_name,
      phone: deal.phone,
      email: deal.email,
      country: deal.country,
      lead_source: deal.lead_source,
      service_interest: deal.service_interest,
      stage: deal.stage,
      status: deal.status,
      priority: deal.priority,
      estimated_value: deal.estimated_value === '' ? '' : Number(deal.estimated_value),
      currency: deal.currency,
      assigned_to: deal.assigned_to,
      proposal_needed: deal.proposal_needed === 'yes',
      agreement_needed: deal.agreement_needed === 'yes',
      notes: deal.notes
    };
  },
  extractRows(response) {
    const candidates = [
      response,
      response?.deals,
      response?.items,
      response?.rows,
      response?.data,
      response?.result,
      response?.payload,
      response?.data?.deals,
      response?.result?.deals,
      response?.payload?.deals
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  },
  async listDeals(options = {}) {
    return Api.postAuthenticatedCached('deals', 'list', {
      sheetName: CONFIG.DEALS_SHEET_NAME,
      tabName: CONFIG.DEALS_SHEET_NAME,
      limit: Number(options.limit || 50),
      page: Number(options.page || 1),
      sort_by: options.sortBy || 'updated_at',
      sort_dir: options.sortDir || 'desc',
      search: this.state.search || '',
      summary_only: true
    }, { forceRefresh: options.forceRefresh === true });
  },
  upsertLocalRow(row) {
    const normalized = this.normalizeDeal(row);
    const idx = this.state.rows.findIndex(item => item.deal_id === normalized.deal_id);
    if (idx === -1) this.state.rows.unshift(normalized);
    else this.state.rows[idx] = { ...this.state.rows[idx], ...normalized };
    this.rerenderVisibleTable();
  },
  removeLocalRow(id) {
    this.state.rows = this.state.rows.filter(item => item.deal_id !== id);
    this.rerenderVisibleTable();
  },
  rerenderVisibleTable() {
    this.applyFilters();
    this.renderFilters();
    this.render();
  },
  async getDeal(id) {
    return Api.postAuthenticated('deals', 'get', { id });
  },
  async createDeal(deal) {
    return Api.postAuthenticated('deals', 'create', {
      deal: this.backendDeal(deal)
    });
  },
  async updateDeal(dealId, updates) {
    return Api.postAuthenticated('deals', 'update', {
      deal_id: dealId,
      updates: this.backendDeal(updates)
    });
  },
  async deleteDeal(dealId) {
    return Api.postAuthenticated('deals', 'delete', {
      deal_id: dealId
    });
  },
  formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return U.escapeHtml(String(value));
    return U.escapeHtml(U.fmtDisplayDate(value));
  },
  canCreate() {
    return Permissions.canCreateLead();
  },
  canEditDelete() {
    return Permissions.canEditDeleteLead();
  },
  isProposalAlreadyCreated(row = {}) {
    const proposalId = String(row?.proposal_id || '').trim();
    if (proposalId) return true;
    const stage = this.normalizeText(row?.stage);
    const status = this.normalizeText(row?.status);
    if (stage.includes('proposal')) return true;
    if (status.includes('proposal created')) return true;
    return false;
  },
  uniqueSorted(values = []) {
    return [...new Set(values.filter(Boolean).map(value => String(value).trim()))].sort((a, b) =>
      a.localeCompare(b)
    );
  },
  syncDealFormDropdowns(selected = {}) {
    const assign = (el, options = [], selectedValue = '') => {
      if (!el) return;
      const values = this.uniqueSorted(options);
      const finalOptions = ['', ...values];
      el.innerHTML = finalOptions
        .map(value => `<option value="${U.escapeAttr(value)}">${U.escapeHtml(value || '—')}</option>`)
        .join('');
      if (finalOptions.includes(selectedValue)) {
        el.value = selectedValue;
        return;
      }
      if (selectedValue) {
        el.innerHTML += `<option value="${U.escapeAttr(selectedValue)}">${U.escapeHtml(selectedValue)}</option>`;
        el.value = selectedValue;
      }
    };

    const sourceValues = this.formDropdownDefaults.lead_source.concat(
      this.state.rows.map(row => row.lead_source)
    );
    const serviceValues = this.formDropdownDefaults.service_interest.concat(
      this.state.rows.map(row => row.service_interest)
    );
    const stageValues = this.formDropdownDefaults.stage.concat(this.state.rows.map(row => row.stage));
    const statusValues = this.formDropdownDefaults.status.concat(this.state.rows.map(row => row.status));
    const priorityValues = this.formDropdownDefaults.priority.concat(
      this.state.rows.map(row => row.priority)
    );
    const currencyValues = this.formDropdownDefaults.currency.concat(
      this.state.rows.map(row => row.currency)
    );

    assign(E.dealFormLeadSource, sourceValues, selected.lead_source || '');
    assign(E.dealFormServiceInterest, serviceValues, selected.service_interest || '');
    assign(E.dealFormStage, stageValues, selected.stage || '');
    assign(E.dealFormStatus, statusValues, selected.status || '');
    assign(E.dealFormPriority, priorityValues, selected.priority || '');
    assign(E.dealFormCurrency, currencyValues, selected.currency || '');
  },
  normalizeText(value) {
    return String(value ?? '')
      .trim()
      .toLowerCase();
  },
  parseDateOnly(value) {
    const normalized = String(value || '').trim().slice(0, 10);
    if (!normalized) return null;
    const dt = new Date(`${normalized}T00:00:00`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  },
  toNumberSafe(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Number(
      String(value)
        .replace(/,/g, '')
        .trim()
    );
    return Number.isFinite(parsed) ? parsed : 0;
  },
  matchesWonStatus(status) {
    const normalized = this.normalizeText(status);
    return normalized === 'won' || normalized.includes('closed won');
  },
  matchesLostStatus(status) {
    const normalized = this.normalizeText(status);
    return normalized === 'lost' || normalized.includes('closed lost');
  },
  matchesOpenStatus(status) {
    const normalized = this.normalizeText(status);
    if (!normalized || this.matchesWonStatus(normalized) || this.matchesLostStatus(normalized)) return false;
    return ['open', 'active', 'in progress', 'negotiation'].some(token => normalized.includes(token));
  },
  normalizeStage(stage) {
    const normalized = this.normalizeText(stage);
    if (!normalized) return 'Unknown';
    if (normalized.includes('prospect')) return 'Prospect';
    if (normalized.includes('qualif')) return 'Qualified';
    if (normalized.includes('proposal')) return 'Proposal Sent';
    if (normalized.includes('negotiat')) return 'Negotiation';
    if (normalized.includes('verbal') || normalized.includes('commit')) return 'Verbal Commit';
    if (this.matchesWonStatus(normalized) || normalized === 'won') return 'Won';
    if (this.matchesLostStatus(normalized) || normalized === 'lost') return 'Lost';
    return String(stage || '').trim() || 'Unknown';
  },
  formatValue(value, currency = '', hasMixedCurrencies = false) {
    const numericValue = Number.isFinite(value) ? value : 0;
    if (currency && !hasMixedCurrencies) {
      let formatted = numericValue.toLocaleString(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2
      });
      if (formatted === 'NaN') formatted = `${currency} ${numericValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      return formatted;
    }
    return numericValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
  },
  matchesKpiFilter(row = {}) {
    const filter = this.state.kpiFilter || 'total';
    const status = this.normalizeText(row?.status);
    const priority = this.normalizeText(row?.priority);
    const value = this.toNumberSafe(row?.estimated_value);
    if (filter === 'total') return true;
    if (filter === 'open') return this.matchesOpenStatus(status);
    if (filter === 'won' || filter === 'win-rate' || filter === 'average-won-deal-size')
      return this.matchesWonStatus(status);
    if (filter === 'lost') return this.matchesLostStatus(status);
    if (filter === 'proposal-needed') return this.normalizeBool(row?.proposal_needed) === 'yes';
    if (filter === 'agreement-needed') return this.normalizeBool(row?.agreement_needed) === 'yes';
    if (filter === 'high-priority') return priority === 'high' || priority === 'urgent';
    if (filter === 'pipeline-value' || filter === 'weighted-pipeline' || filter === 'average-deal-size')
      return value > 0;
    if (filter === 'converted-from-leads')
      return !!String(row?.lead_id || '').trim() || !!String(row?.converted_at || '').trim();
    if (filter === 'unique-companies') return !!String(row?.company_name || '').trim();
    if (filter === 'unique-assignees') return !!String(row?.assigned_to || '').trim();
    return true;
  },
  applyKpiFilter(filter) {
    const nextFilter = String(filter || 'total').trim() || 'total';
    this.state.kpiFilter = this.state.kpiFilter === nextFilter ? 'total' : nextFilter;
    this.applyFilters();
    this.render();
  },
  syncKpiCardState() {
    const cards = document.querySelectorAll('#dealsAnalyticsGrid [data-kpi-filter]');
    cards.forEach(card => {
      const isActive = (card.getAttribute('data-kpi-filter') || 'total') === (this.state.kpiFilter || 'total');
      card.classList.toggle('kpi-filter-active', isActive);
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  },
  incrementMap(map, key) {
    const label = String(key || '').trim() || 'Unspecified';
    map[label] = (map[label] || 0) + 1;
  },
  buildTopBreakdown(map = {}, max = 7) {
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, max);
  },
  computeDealAnalytics(deals = []) {
    const rows = Array.isArray(deals) ? deals : [];
    const stageBreakdown = {
      Prospect: 0,
      Qualified: 0,
      'Proposal Sent': 0,
      Negotiation: 0,
      'Verbal Commit': 0,
      Won: 0,
      Lost: 0
    };
    const statusBreakdown = {};
    const assigneeMap = {};
    const serviceMap = {};
    const sourceMap = {};
    const uniqueCompanies = new Set();
    const uniqueAssignees = new Set();
    const currencies = new Set();
    const stageProbability = {
      Prospect: 0.1,
      Qualified: 0.3,
      'Proposal Sent': 0.5,
      Negotiation: 0.7,
      'Verbal Commit': 0.85,
      Won: 1,
      Lost: 0
    };
    let openDeals = 0;
    let wonDeals = 0;
    let lostDeals = 0;
    let proposalNeededCount = 0;
    let agreementNeededCount = 0;
    let highPriorityCount = 0;
    let pipelineValue = 0;
    let weightedPipelineValue = 0;
    let validValueCount = 0;
    let wonValueTotal = 0;
    let wonValueCount = 0;
    let convertedFromLeadsCount = 0;

    rows.forEach(row => {
      const status = this.normalizeText(row?.status);
      const stage = this.normalizeStage(row?.stage);
      const value = this.toNumberSafe(row?.estimated_value);
      const priority = this.normalizeText(row?.priority);
      const statusLabel = String(row?.status || '').trim() || 'Unspecified';
      const companyName = String(row?.company_name || '').trim().toLowerCase();
      const assignee = String(row?.assigned_to || '').trim().toLowerCase();

      if (this.matchesOpenStatus(status)) openDeals += 1;
      if (this.matchesWonStatus(status)) wonDeals += 1;
      if (this.matchesLostStatus(status)) lostDeals += 1;
      if (this.normalizeBool(row?.proposal_needed) === 'yes') proposalNeededCount += 1;
      if (this.normalizeBool(row?.agreement_needed) === 'yes') agreementNeededCount += 1;
      if (priority === 'high' || priority === 'urgent') highPriorityCount += 1;
      if (String(row?.lead_id || '').trim() || String(row?.converted_at || '').trim()) convertedFromLeadsCount += 1;

      pipelineValue += value;
      if (value > 0) validValueCount += 1;
      if (this.matchesWonStatus(status) && value > 0) {
        wonValueTotal += value;
        wonValueCount += 1;
      }
      weightedPipelineValue += value * (stageProbability[stage] ?? 0);

      if (companyName) uniqueCompanies.add(companyName);
      if (assignee) uniqueAssignees.add(assignee);
      this.incrementMap(statusBreakdown, statusLabel);
      if (row?.assigned_to) this.incrementMap(assigneeMap, row.assigned_to);
      if (row?.service_interest) this.incrementMap(serviceMap, row.service_interest);
      if (row?.lead_source) this.incrementMap(sourceMap, row.lead_source);
      if (stageBreakdown[stage] === undefined) stageBreakdown[stage] = 0;
      stageBreakdown[stage] += 1;

      const currency = String(row?.currency || '')
        .trim()
        .toUpperCase();
      if (currency) currencies.add(currency);
    });

    const denominator = wonDeals + lostDeals;
    return {
      totalDeals: rows.length,
      openDeals,
      wonDeals,
      lostDeals,
      proposalNeededCount,
      agreementNeededCount,
      highPriorityCount,
      pipelineValue,
      weightedPipelineValue,
      winRate: denominator > 0 ? (wonDeals / denominator) * 100 : 0,
      averageDealSize: validValueCount > 0 ? pipelineValue / validValueCount : 0,
      averageWonDealSize: wonValueCount > 0 ? wonValueTotal / wonValueCount : 0,
      convertedFromLeadsCount,
      uniqueCompanies: uniqueCompanies.size,
      uniqueAssignees: uniqueAssignees.size,
      stageBreakdown,
      statusBreakdown,
      assigneeBreakdown: this.buildTopBreakdown(assigneeMap, 7),
      serviceBreakdown: this.buildTopBreakdown(serviceMap, 7),
      sourceBreakdown: this.buildTopBreakdown(sourceMap, 7),
      pipelineCurrency: currencies.size === 1 ? [...currencies][0] : '',
      hasMixedCurrencies: currencies.size > 1
    };
  },
  renderDistribution(el, entries = [], total = 0) {
    if (!el) return;
    if (!entries.length) {
      el.innerHTML = '<div class="muted">No data for current filters.</div>';
      return;
    }
    el.innerHTML = entries
      .map(([label, count]) => {
        const percent = total > 0 ? (count / total) * 100 : 0;
        return `<div class="deals-status-row">
          <div class="deals-status-label">${U.escapeHtml(label)}</div>
          <div class="leads-status-track"><span class="deals-status-fill" style="width:${Math.min(100, percent).toFixed(1)}%"></span></div>
          <div class="deals-status-meta">${count} · ${percent.toFixed(1)}%</div>
        </div>`;
      })
      .join('');
  },
  renderDealAnalytics(analytics) {
    const safe = analytics || this.computeDealAnalytics([]);
    const setText = (el, value) => {
      if (el) el.textContent = value;
    };

    setText(E.dealsKpiTotal, String(safe.totalDeals || 0));
    setText(E.dealsKpiOpen, String(safe.openDeals || 0));
    setText(E.dealsKpiWon, String(safe.wonDeals || 0));
    setText(E.dealsKpiLost, String(safe.lostDeals || 0));
    setText(E.dealsKpiProposalNeeded, String(safe.proposalNeededCount || 0));
    setText(E.dealsKpiAgreementNeeded, String(safe.agreementNeededCount || 0));
    setText(E.dealsKpiHighPriority, String(safe.highPriorityCount || 0));
    setText(E.dealsKpiWinRate, `${(safe.winRate || 0).toFixed(1)}%`);
    setText(E.dealsKpiConvertedFromLeads, String(safe.convertedFromLeadsCount || 0));
    setText(E.dealsKpiUniqueCompanies, String(safe.uniqueCompanies || 0));
    setText(E.dealsKpiUniqueAssignees, String(safe.uniqueAssignees || 0));

    setText(E.dealsKpiPipelineValue, this.formatValue(safe.pipelineValue, safe.pipelineCurrency, safe.hasMixedCurrencies));
    setText(
      E.dealsKpiWeightedPipelineValue,
      this.formatValue(safe.weightedPipelineValue, safe.pipelineCurrency, safe.hasMixedCurrencies)
    );
    setText(E.dealsKpiAverageDealSize, this.formatValue(safe.averageDealSize, safe.pipelineCurrency, safe.hasMixedCurrencies));
    setText(
      E.dealsKpiAverageWonDealSize,
      this.formatValue(safe.averageWonDealSize, safe.pipelineCurrency, safe.hasMixedCurrencies)
    );
    setText(
      E.dealsKpiPipelineSub,
      safe.pipelineCurrency && !safe.hasMixedCurrencies
        ? `Visible estimated value (${safe.pipelineCurrency})`
        : `Visible estimated value${safe.hasMixedCurrencies ? ' (mixed currencies)' : ''}`
    );
    setText(
      E.dealsKpiWeightedPipelineSub,
      safe.pipelineCurrency && !safe.hasMixedCurrencies
        ? `Stage weighted (${safe.pipelineCurrency})`
        : `Stage weighted${safe.hasMixedCurrencies ? ' (mixed currencies)' : ''}`
    );

    const stageOrder = ['Prospect', 'Qualified', 'Proposal Sent', 'Negotiation', 'Verbal Commit', 'Won', 'Lost'];
    const stageEntries = stageOrder.map(label => [label, safe.stageBreakdown?.[label] || 0]);
    const statusEntries = Object.entries(safe.statusBreakdown || {}).sort((a, b) => b[1] - a[1]);
    this.renderDistribution(E.dealsStageDistribution, stageEntries, safe.totalDeals || 0);
    this.renderDistribution(E.dealsStatusDistribution, statusEntries, safe.totalDeals || 0);
    this.renderDistribution(E.dealsAssigneeBreakdown, safe.assigneeBreakdown || [], safe.totalDeals || 0);
    this.renderDistribution(E.dealsServiceBreakdown, safe.serviceBreakdown || [], safe.totalDeals || 0);
    this.renderDistribution(E.dealsSourceBreakdown, safe.sourceBreakdown || [], safe.totalDeals || 0);
    this.syncKpiCardState();
  },
  applyFilters() {
    const convertedFrom = this.parseDateOnly(this.state.convertedFrom);
    const convertedTo = this.parseDateOnly(this.state.convertedTo);
    const searchTerms = String(this.state.search || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    this.state.filteredRows = this.state.rows.filter(row => {
      if (this.state.stage !== 'All' && row.stage !== this.state.stage) return false;
      if (this.state.status !== 'All' && row.status !== this.state.status) return false;
      if (this.state.priority !== 'All' && row.priority !== this.state.priority) return false;
      if (this.state.serviceInterest !== 'All' && row.service_interest !== this.state.serviceInterest)
        return false;
      if (this.state.leadSource !== 'All' && row.lead_source !== this.state.leadSource) return false;
      if (this.state.assignedTo !== 'All' && row.assigned_to !== this.state.assignedTo) return false;
      if (this.state.proposalNeeded !== 'All' && row.proposal_needed !== this.state.proposalNeeded)
        return false;
      if (this.state.agreementNeeded !== 'All' && row.agreement_needed !== this.state.agreementNeeded)
        return false;
      if (!this.matchesKpiFilter(row)) return false;
      if (convertedFrom || convertedTo) {
        const rowDate = this.parseDateOnly(row.converted_at);
        if (!rowDate) return false;
        if (convertedFrom && rowDate < convertedFrom) return false;
        if (convertedTo && rowDate > convertedTo) return false;
      }
      if (!searchTerms.length) return true;
      const hay = this.columns
        .map(column => String(row[column] ?? ''))
        .join(' ')
        .toLowerCase();
      return searchTerms.every(term => hay.includes(term));
    });
  },
  renderFilters() {
    const assign = (el, values = [], selected = 'All') => {
      if (!el) return;
      const options = ['All', ...this.uniqueSorted(values)];
      el.innerHTML = options.map(option => `<option>${U.escapeHtml(option)}</option>`).join('');
      if (options.includes(selected)) el.value = selected;
    };

    assign(E.dealsStageFilter, this.state.rows.map(row => row.stage), this.state.stage);
    assign(E.dealsStatusFilter, this.state.rows.map(row => row.status), this.state.status);
    assign(E.dealsPriorityFilter, this.state.rows.map(row => row.priority), this.state.priority);
    assign(
      E.dealsServiceInterestFilter,
      this.state.rows.map(row => row.service_interest),
      this.state.serviceInterest
    );
    assign(E.dealsLeadSourceFilter, this.state.rows.map(row => row.lead_source), this.state.leadSource);
    assign(E.dealsAssignedToFilter, this.state.rows.map(row => row.assigned_to), this.state.assignedTo);

    if (E.dealsProposalNeededFilter) E.dealsProposalNeededFilter.value = this.state.proposalNeeded;
    if (E.dealsAgreementNeededFilter) E.dealsAgreementNeededFilter.value = this.state.agreementNeeded;
    if (E.dealsStartDateFilter) E.dealsStartDateFilter.value = this.state.convertedFrom;
    if (E.dealsEndDateFilter) E.dealsEndDateFilter.value = this.state.convertedTo;
    if (E.dealsSidebarSearchInput) E.dealsSidebarSearchInput.value = this.state.search;
    if (E.dealsSearchInput) E.dealsSearchInput.value = this.state.search;
  },
  handleFilterChange() {
    this.applyFilters();
    this.render();
  },
  render() {
    if (!E.dealsState || !E.dealsTbody) return;

    if (this.state.loading) {
      E.dealsState.textContent = 'Loading deals…';
      this.renderDealAnalytics(this.computeDealAnalytics([]));
      E.dealsTbody.innerHTML = Array.from({ length: 6 })
        .map(() => '<tr class="skeleton-row"><td colspan="21"><div class="skeleton-line" style="height:12px;margin:6px 0;"></div></td></tr>')
        .join('');
      return;
    }

    if (this.state.loadError) {
      E.dealsState.textContent = this.state.loadError;
      this.renderDealAnalytics(this.computeDealAnalytics([]));
      E.dealsTbody.innerHTML = `<tr><td colspan="21" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(
        this.state.loadError
      )}</td></tr>`;
      return;
    }

    const rows = this.state.filteredRows;
    this.renderDealAnalytics(this.computeDealAnalytics(rows));
    E.dealsState.textContent = `${rows.length} deal${rows.length === 1 ? '' : 's'}`;

    if (!rows.length) {
      E.dealsTbody.innerHTML = '<tr><td colspan="21" class="muted" style="text-align:center;">No deals found.</td></tr>';
      return;
    }

    const renderCell = (row, column) => {
      if (column === 'converted_at') return this.formatDate(row[column]);
      if (column === 'proposal_needed' || column === 'agreement_needed') return U.escapeHtml(this.boolLabel(row[column]));
      const value = row[column];
      return U.escapeHtml(value === '' || value == null ? '—' : String(value));
    };

    E.dealsTbody.innerHTML = rows
      .map(row => {
        const actionButtons = [];
        if (this.canEditDelete()) {
          actionButtons.push(
            `<button class="btn ghost sm" type="button" data-deal-edit="${U.escapeAttr(row.deal_id)}">Edit</button>`
          );
          actionButtons.push(
            `<button class="btn ghost sm" type="button" data-deal-delete="${U.escapeAttr(row.deal_id)}">Delete</button>`
          );
        }
        if (row.deal_id && !this.isProposalAlreadyCreated(row)) {
          const inFlight = this.state.rowActionInFlight.has(`create-proposal:${row.deal_id}`);
          actionButtons.push(
            `<button class="btn ghost sm" type="button" data-deal-create-proposal="${U.escapeAttr(
              row.deal_id
            )}" ${inFlight ? 'disabled' : ''}>Create Proposal</button>`
          );
        }
        const actions = actionButtons.length ? actionButtons.join(' ') : '<span class="muted">—</span>';
        return `<tr>${this.columns
          .map(column => `<td>${renderCell(row, column)}</td>`)
          .join('')}<td>${actions}</td></tr>`;
      })
      .join('');
  },
  async loadAndRefresh({ force = false } = {}) {
    if (!Session.isAuthenticated()) return;
    if (this.state.loading && !force) return;
    const hasWarmCache = this.state.loaded && Date.now() - this.state.lastLoadedAt <= this.state.cacheTtlMs;
    if (hasWarmCache && !force) {
      this.rerenderVisibleTable();
      return;
    }
    this.state.loading = true;
    this.state.loadError = '';
    this.render();

    try {
      const response = await this.listDeals({ forceRefresh: force, page: 1, limit: 50 });
      this.state.rows = this.extractRows(response).map(item => this.normalizeDeal(item));
      this.state.loaded = true;
      this.state.lastLoadedAt = Date.now();
      this.syncDealFormDropdowns();
      this.renderFilters();
      this.applyFilters();
      this.render();
    } catch (error) {
      if (isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      this.state.rows = [];
      this.state.filteredRows = [];
      this.state.loadError = String(error?.message || '').trim() || 'Unable to load deals right now.';
      this.render();
      UI.toast(this.state.loadError);
    } finally {
      this.state.loading = false;
      this.render();
    }
  },
  setFormBusy(v) {
    if (E.dealFormSaveBtn) {
      E.dealFormSaveBtn.disabled = !!v;
      E.dealFormSaveBtn.textContent = v ? 'Saving…' : 'Save';
    }
    if (E.dealFormDeleteBtn) E.dealFormDeleteBtn.disabled = !!v;
  },
  resetForm() {
    if (!E.dealForm) return;
    E.dealForm.reset();
    if (E.dealFormDealId) E.dealFormDealId.value = '';
    if (E.dealFormConvertedAt) E.dealFormConvertedAt.value = '';
    if (E.dealFormProposalNeeded) E.dealFormProposalNeeded.value = '';
    if (E.dealFormAgreementNeeded) E.dealFormAgreementNeeded.value = '';
    this.syncDealFormDropdowns();
  },
  currentUserAssignee() {
    return String(Session.displayName() || Session.username() || Session.user()?.email || '').trim();
  },
  openForm(row = null) {
    if (!E.dealFormModal || !E.dealForm) return;
    const isEdit = !!row;
    E.dealForm.dataset.mode = isEdit ? 'edit' : 'create';
    E.dealForm.dataset.id = row?.deal_id || '';
    if (E.dealFormTitle) E.dealFormTitle.textContent = isEdit ? 'Edit Deal' : 'Create Deal';
    this.resetForm();

    if (row) {
      if (E.dealFormDealId) E.dealFormDealId.value = row.deal_id || '';
      if (E.dealFormLeadId) E.dealFormLeadId.value = row.lead_id || '';
      if (E.dealFormFullName) E.dealFormFullName.value = row.full_name || '';
      if (E.dealFormCompanyName) E.dealFormCompanyName.value = row.company_name || '';
      if (E.dealFormPhone) E.dealFormPhone.value = row.phone || '';
      if (E.dealFormEmail) E.dealFormEmail.value = row.email || '';
      if (E.dealFormCountry) E.dealFormCountry.value = row.country || '';
      if (E.dealFormLeadSource) E.dealFormLeadSource.value = row.lead_source || '';
      if (E.dealFormServiceInterest) E.dealFormServiceInterest.value = row.service_interest || '';
      if (E.dealFormStage) E.dealFormStage.value = row.stage || '';
      if (E.dealFormStatus) E.dealFormStatus.value = row.status || '';
      if (E.dealFormPriority) E.dealFormPriority.value = row.priority || '';
      if (E.dealFormEstimatedValue) {
        E.dealFormEstimatedValue.value = row.estimated_value === '' ? '' : String(row.estimated_value);
      }
      if (E.dealFormCurrency) E.dealFormCurrency.value = row.currency || '';
      if (E.dealFormAssignedTo) E.dealFormAssignedTo.value = row.assigned_to || '';
      if (E.dealFormProposalNeeded) E.dealFormProposalNeeded.value = row.proposal_needed || '';
      if (E.dealFormAgreementNeeded) E.dealFormAgreementNeeded.value = row.agreement_needed || '';
      if (E.dealFormConvertedBy) E.dealFormConvertedBy.value = row.converted_by || '';
      if (E.dealFormConvertedAt) E.dealFormConvertedAt.value = row.converted_at || '';
      if (E.dealFormNotes) E.dealFormNotes.value = row.notes || '';
      this.syncDealFormDropdowns({
        lead_source: row.lead_source || '',
        service_interest: row.service_interest || '',
        stage: row.stage || '',
        status: row.status || '',
        priority: row.priority || '',
        currency: row.currency || ''
      });
    } else {
      if (E.dealFormDealId) E.dealFormDealId.value = 'Auto-generated';
      if (E.dealFormConvertedAt) E.dealFormConvertedAt.value = U.fmtDisplayDate(new Date());
      if (E.dealFormAssignedTo) E.dealFormAssignedTo.value = this.currentUserAssignee();
      this.syncDealFormDropdowns();
    }

    if (E.dealFormDeleteBtn) E.dealFormDeleteBtn.style.display = isEdit && this.canEditDelete() ? '' : 'none';
    if (E.dealFormSaveBtn) E.dealFormSaveBtn.disabled = false;
    E.dealFormModal.style.display = 'flex';
    E.dealFormModal.setAttribute('aria-hidden', 'false');
  },
  closeForm() {
    if (!E.dealFormModal) return;
    E.dealFormModal.style.display = 'none';
    E.dealFormModal.setAttribute('aria-hidden', 'true');
  },
  collectFormData() {
    return {
      lead_id: String(E.dealFormLeadId?.value || '').trim(),
      full_name: String(E.dealFormFullName?.value || '').trim(),
      company_name: String(E.dealFormCompanyName?.value || '').trim(),
      phone: String(E.dealFormPhone?.value || '').trim(),
      email: String(E.dealFormEmail?.value || '').trim(),
      country: String(E.dealFormCountry?.value || '').trim(),
      lead_source: String(E.dealFormLeadSource?.value || '').trim(),
      service_interest: String(E.dealFormServiceInterest?.value || '').trim(),
      stage: String(E.dealFormStage?.value || '').trim(),
      status: String(E.dealFormStatus?.value || '').trim(),
      priority: String(E.dealFormPriority?.value || '').trim(),
      estimated_value: String(E.dealFormEstimatedValue?.value || '').trim(),
      currency: String(E.dealFormCurrency?.value || '').trim(),
      assigned_to: String(E.dealFormAssignedTo?.value || '').trim(),
      proposal_needed: this.normalizeBool(E.dealFormProposalNeeded?.value || ''),
      agreement_needed: this.normalizeBool(E.dealFormAgreementNeeded?.value || ''),
      converted_by: String(E.dealFormConvertedBy?.value || '').trim(),
      notes: String(E.dealFormNotes?.value || '').trim()
    };
  },
  async submitForm() {
    if (this.state.saveInFlight) return;
    if (!this.canCreate()) {
      UI.toast('Login is required to manage deals.');
      return;
    }
    const mode = E.dealForm?.dataset.mode === 'edit' ? 'edit' : 'create';
    if (mode === 'edit' && !this.canEditDelete()) {
      UI.toast('Only admin/dev can update deals.');
      return;
    }

    const dealId = String(E.dealForm?.dataset.id || '').trim();
    const deal = this.collectFormData();
    if (!deal.full_name && !deal.company_name) {
      UI.toast('Full name or company name is required.');
      return;
    }

    this.setFormBusy(true);
    this.state.saveInFlight = true;
    console.time('entity-save');
    try {
      if (mode === 'edit') {
        const response = await this.updateDeal(dealId, deal);
        this.upsertLocalRow(response?.deal || response?.data?.deal || { ...deal, deal_id: dealId });
        UI.toast('Deal updated.');
      } else {
        const response = await this.createDeal(deal);
        this.upsertLocalRow(response?.deal || response?.data?.deal || response || deal);
        UI.toast('Deal created.');
      }
      this.closeForm();
      this.rerenderVisibleTable();
    } catch (error) {
      if (isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast('Unable to save deal: ' + (error?.message || 'Unknown error'));
    } finally {
      console.timeEnd('entity-save');
      this.state.saveInFlight = false;
      this.setFormBusy(false);
    }
  },
  async deleteDealById(dealId) {
    if (!this.canEditDelete()) {
      UI.toast('Only admin/dev can delete deals.');
      return;
    }
    const confirmed = window.confirm(`Delete deal ${dealId}?`);
    if (!confirmed) return;

    this.setFormBusy(true);
    try {
      await this.deleteDeal(dealId);
      this.removeLocalRow(dealId);
      UI.toast('Deal deleted.');
      this.closeForm();
      this.rerenderVisibleTable();
    } catch (error) {
      if (isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast('Unable to delete deal: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setFormBusy(false);
    }
  },
  wire() {
    if (this.state.initialized) return;

    const bindState = (el, key) => {
      if (!el) return;
      const sync = () => {
        this.state[key] = String(el.value || '').trim();
        if (key === 'search') {
          if (E.dealsSidebarSearchInput && el !== E.dealsSidebarSearchInput)
            E.dealsSidebarSearchInput.value = this.state.search;
          if (E.dealsSearchInput && el !== E.dealsSearchInput) E.dealsSearchInput.value = this.state.search;
        }
        this.handleFilterChange();
      };
      el.addEventListener('input', sync);
      el.addEventListener('change', sync);
    };

    bindState(E.dealsSearchInput, 'search');
    bindState(E.dealsSidebarSearchInput, 'search');
    bindState(E.dealsStageFilter, 'stage');
    bindState(E.dealsStatusFilter, 'status');
    bindState(E.dealsPriorityFilter, 'priority');
    bindState(E.dealsServiceInterestFilter, 'serviceInterest');
    bindState(E.dealsLeadSourceFilter, 'leadSource');
    bindState(E.dealsAssignedToFilter, 'assignedTo');
    bindState(E.dealsProposalNeededFilter, 'proposalNeeded');
    bindState(E.dealsAgreementNeededFilter, 'agreementNeeded');
    bindState(E.dealsStartDateFilter, 'convertedFrom');
    bindState(E.dealsEndDateFilter, 'convertedTo');

    if (E.dealsResetBtn) {
      E.dealsResetBtn.addEventListener('click', () => {
        this.state.search = '';
        this.state.stage = 'All';
        this.state.status = 'All';
        this.state.priority = 'All';
        this.state.serviceInterest = 'All';
        this.state.leadSource = 'All';
        this.state.assignedTo = 'All';
        this.state.proposalNeeded = 'All';
        this.state.agreementNeeded = 'All';
        this.state.convertedFrom = '';
        this.state.convertedTo = '';
        this.state.kpiFilter = 'total';
        this.applyFilters();
        this.renderFilters();
        this.render();
      });
    }

    if (E.dealsRefreshBtn) {
      E.dealsRefreshBtn.addEventListener('click', () => this.loadAndRefresh({ force: true }));
    }

    if (E.dealsCreateBtn) {
      E.dealsCreateBtn.addEventListener('click', () => {
        if (!this.canCreate()) {
          UI.toast('Login is required to create deals.');
          return;
        }
        this.openForm();
      });
    }

    if (E.dealsTbody) {
      E.dealsTbody.addEventListener('click', event => {
        const editId = event.target?.getAttribute('data-deal-edit');
        if (editId) {
          const row = this.state.rows.find(item => item.deal_id === editId);
          if (row) this.openForm(row);
          return;
        }
        const deleteId = event.target?.getAttribute('data-deal-delete');
        if (deleteId) this.deleteDealById(deleteId);
        const createProposalDealId = event.target?.getAttribute('data-deal-create-proposal');
        if (createProposalDealId && window.Proposals?.createFromDealFlow) {
          const actionKey = `create-proposal:${createProposalDealId}`;
          if (this.state.rowActionInFlight.has(actionKey)) return;
          this.state.rowActionInFlight.add(actionKey);
          const trigger = event.target?.closest?.('button');
          if (trigger && 'disabled' in trigger) trigger.disabled = true;
          Promise.resolve(
            Proposals.createFromDealFlow(createProposalDealId, { openAfterCreate: true })
          ).finally(() => {
            this.state.rowActionInFlight.delete(actionKey);
            if (trigger && 'disabled' in trigger) trigger.disabled = false;
            this.render();
          });
        }
      });
    }
    const dealsAnalyticsGrid = document.getElementById('dealsAnalyticsGrid');
    if (dealsAnalyticsGrid) {
      const activate = card => {
        if (!card) return;
        const filter = card.getAttribute('data-kpi-filter');
        if (!filter) return;
        this.applyKpiFilter(filter);
      };
      dealsAnalyticsGrid.addEventListener('click', event => {
        activate(event.target?.closest?.('[data-kpi-filter]'));
      });
      dealsAnalyticsGrid.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const card = event.target?.closest?.('[data-kpi-filter]');
        if (!card) return;
        event.preventDefault();
        activate(card);
      });
    }

    if (E.dealFormCloseBtn) E.dealFormCloseBtn.addEventListener('click', () => this.closeForm());
    if (E.dealFormCancelBtn) E.dealFormCancelBtn.addEventListener('click', () => this.closeForm());
    if (E.dealFormModal) {
      E.dealFormModal.addEventListener('click', event => {
        if (event.target === E.dealFormModal) this.closeForm();
      });
    }
    if (E.dealForm) {
      E.dealForm.addEventListener('submit', event => {
        event.preventDefault();
        this.submitForm();
      });
    }
    if (E.dealFormDeleteBtn) {
      E.dealFormDeleteBtn.addEventListener('click', () => {
        const id = String(E.dealForm?.dataset.id || '').trim();
        if (id) this.deleteDealById(id);
      });
    }

    this.state.initialized = true;
  }
};

window.Deals = Deals;
