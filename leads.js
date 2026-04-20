const Leads = {
  formDropdownDefaults: {
    lead_source: ['Website', 'Referral', 'LinkedIn', 'Email', 'Call', 'WhatsApp', 'Event', 'Other'],
    service_interest: ['Software' , 'Other' , 'Consulting'],
    status: ['New', 'Qualified', 'Contacted', 'Proposal Sent', 'Negotiation', 'Won', 'Lost', 'On Hold'],
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
    lastSyncedAt: '',
    search: '',
    status: 'All',
    serviceInterest: 'All',
    assignedTo: 'All',
    proposalNeeded: 'All',
    agreementNeeded: 'All',
    createdFrom: '',
    createdTo: '',
    kpiFilter: 'total',
    initialized: false,
    saveInFlight: false
  },
  normalizeBool(value) {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return 'yes';
    if (['false', '0', 'no', 'n'].includes(normalized)) return 'no';
    return '';
  },
  normalizeLead(raw = {}) {
    const leadId = String(raw.lead_id || raw.leadId || raw.id || '').trim();
    return {
      lead_id: leadId,
      created_at: raw.created_at || raw.createdAt || '',
      full_name: String(raw.full_name || raw.fullName || '').trim(),
      company_name: String(raw.company_name || raw.companyName || '').trim(),
      phone: String(raw.phone || '').trim(),
      email: String(raw.email || '').trim(),
      country: String(raw.country || '').trim(),
      lead_source: String(raw.lead_source || raw.leadSource || '').trim(),
      service_interest: String(raw.service_interest || raw.serviceInterest || '').trim(),
      status: String(raw.status || '').trim(),
      priority: String(raw.priority || '').trim(),
      estimated_value: raw.estimated_value ?? raw.estimatedValue ?? '',
      currency: String(raw.currency || '').trim(),
      assigned_to: String(raw.assigned_to || raw.assignedTo || '').trim(),
      next_followup_date: raw.next_followup_date || raw.nextFollowupDate || '',
      last_contact_date: raw.last_contact_date || raw.lastContactDate || '',
      proposal_needed: this.normalizeBool(raw.proposal_needed),
      agreement_needed: this.normalizeBool(raw.agreement_needed),
      notes: String(raw.notes || '').trim(),
      updated_at: raw.updated_at || raw.updatedAt || '',
      converted_at: raw.converted_at || raw.convertedAt || '',
      deal_id: String(raw.deal_id || raw.deal_id_ref || raw.converted_deal_id || '').trim()
    };
  },
  backendLead(lead) {
    return {
      full_name: lead.full_name,
      company_name: lead.company_name,
      phone: lead.phone,
      email: lead.email,
      country: lead.country,
      lead_source: lead.lead_source,
      service_interest: lead.service_interest,
      status: lead.status,
      priority: lead.priority,
      estimated_value: lead.estimated_value === '' ? '' : Number(lead.estimated_value),
      currency: lead.currency,
      assigned_to: lead.assigned_to,
      next_followup_date: lead.next_followup_date,
      last_contact_date: lead.last_contact_date,
      proposal_needed: lead.proposal_needed === 'yes',
      agreement_needed: lead.agreement_needed === 'yes',
      notes: lead.notes
    };
  },
  extractRows(response) {
    const candidates = [
      response,
      response?.leads,
      response?.items,
      response?.rows,
      response?.data,
      response?.result,
      response?.payload,
      response?.data?.leads,
      response?.result?.leads,
      response?.payload?.leads
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  },
  collectServerFilters() {
    const filters = {};
    if (this.state.status !== 'All') filters.status = this.state.status;
    if (this.state.serviceInterest !== 'All') filters.service_interest = this.state.serviceInterest;
    if (this.state.assignedTo !== 'All') filters.assigned_to = this.state.assignedTo;
    if (this.state.proposalNeeded !== 'All') filters.proposal_needed = this.state.proposalNeeded === 'yes';
    if (this.state.agreementNeeded !== 'All') filters.agreement_needed = this.state.agreementNeeded === 'yes';
    if (this.state.search) filters.search = this.state.search;
    return filters;
  },
  async listLeads(options = {}) {
    return Api.postAuthenticatedCached('leads', 'list', {
      filters: this.collectServerFilters(),
      limit: Number(options.limit || 50),
      page: Number(options.page || 1),
      sort_by: options.sortBy || 'updated_at',
      sort_dir: options.sortDir || 'desc',
      search: this.state.search || '',
      summary_only: true
    }, { forceRefresh: options.forceRefresh === true });
  },
  upsertLocalRow(row) {
    const normalized = this.normalizeLead(row);
    const idx = this.state.rows.findIndex(item => item.lead_id === normalized.lead_id);
    if (idx === -1) this.state.rows.unshift(normalized);
    else this.state.rows[idx] = { ...this.state.rows[idx], ...normalized };
    this.rerenderVisibleTable();
    return normalized;
  },
  removeLocalRow(id) {
    const before = this.state.rows.length;
    this.state.rows = this.state.rows.filter(item => item.lead_id !== id);
    if (this.state.rows.length !== before) this.rerenderVisibleTable();
  },
  rerenderVisibleTable() {
    this.applyFilters();
    this.renderFilters();
    this.render();
  },
  rerenderSummaryIfNeeded() {
    this.renderLeadAnalytics(this.computeLeadAnalytics(this.state.filteredRows));
  },
  async getLead(id) {
    return Api.postAuthenticated('leads', 'get', { id, lead_id: id });
  },
  async createLead(lead) {
    return Api.postAuthenticated('leads', 'create', {
      lead: this.backendLead(lead)
    });
  },
  async updateLead(leadId, updates) {
    return Api.postAuthenticated('leads', 'update', {
      lead_id: leadId,
      updates: this.backendLead(updates)
    });
  },
  async deleteLead(leadId) {
    return Api.postAuthenticated('leads', 'delete', {
      lead_id: leadId
    });
  },
  isUnsupportedConvertActionError(error) {
    const message = String(error?.message || '')
      .trim()
      .toLowerCase();
    if (!message) return false;
    return (
      message.includes('not found') ||
      message.includes('unknown action') ||
      message.includes('unsupported action') ||
      message.includes('invalid action') ||
      message.includes('no handler') ||
      message.includes('not implemented')
    );
  },
  async convertToDeal(leadId) {
    const attempts = [
      { resource: 'leads', action: 'convert_to_deal', payload: { lead_id: leadId } },
      { resource: 'leads', action: 'convert', payload: { lead_id: leadId } },
      { resource: 'deals', action: 'create_from_lead', payload: { lead_id: leadId } },
      { resource: 'deals', action: 'convert_from_lead', payload: { lead_id: leadId } },
      { resource: 'deals', action: 'create', payload: { lead_id: leadId } }
    ];

    let lastError = null;
    for (let i = 0; i < attempts.length; i += 1) {
      const attempt = attempts[i];
      try {
        return await Api.postAuthenticated(attempt.resource, attempt.action, attempt.payload);
      } catch (error) {
        if (isAuthError(error)) throw error;
        lastError = error;
        const hasMoreFallbacks = i < attempts.length - 1;
        if (!hasMoreFallbacks || !this.isUnsupportedConvertActionError(error)) {
          throw error;
        }
      }
    }

    if (lastError) throw lastError;
    throw new Error('Unable to convert lead to deal.');
  },
  isConvertedLead(row = {}) {
    const status = this.normalizeText(row.status);
    if (status.includes('converted') || status === 'won' || status === 'closed won') return true;
    if (String(row.deal_id || '').trim()) return true;
    return !!String(row.converted_at || '').trim();
  },
  canConvertLead(row = {}) {
    return Permissions.canCreateLead() && !this.isConvertedLead(row) && !!String(row.lead_id || '').trim();
  },
  getConvertedDealId(response) {
    const directDealId = String(
      response?.deal_id || response?.dealId || response?.created_deal_id || response?.createdDealId || ''
    ).trim();
    if (directDealId) return directDealId;

    const dealCandidates = [
      response?.deal,
      response?.deals?.[0],
      response?.data?.deal,
      response?.result?.deal,
      response?.payload?.deal,
      response?.created_deal,
      response?.createdDeal,
      response?.data,
      response?.result,
      response?.payload
    ];
    for (const candidate of dealCandidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const dealId = String(candidate.deal_id || candidate.dealId || candidate.id || '').trim();
      if (dealId) return dealId;
    }
    return '';
  },
  applyFilters() {
    const parseDateOnly = value => {
      const normalized = String(value || '').trim().slice(0, 10);
      if (!normalized) return null;
      const dt = new Date(`${normalized}T00:00:00`);
      return Number.isNaN(dt.getTime()) ? null : dt;
    };
    const createdFrom = parseDateOnly(this.state.createdFrom);
    const createdTo = parseDateOnly(this.state.createdTo);
    const searchTerms = String(this.state.search || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    this.state.filteredRows = this.state.rows.filter(row => {
      if (this.state.status !== 'All' && row.status !== this.state.status) return false;
      if (this.state.serviceInterest !== 'All' && row.service_interest !== this.state.serviceInterest)
        return false;
      if (this.state.assignedTo !== 'All' && row.assigned_to !== this.state.assignedTo) return false;
      if (this.state.proposalNeeded !== 'All' && row.proposal_needed !== this.state.proposalNeeded)
        return false;
      if (this.state.agreementNeeded !== 'All' && row.agreement_needed !== this.state.agreementNeeded)
        return false;
      if (!this.matchesKpiFilter(row)) return false;
      if (createdFrom || createdTo) {
        const rowDate = parseDateOnly(row.created_at);
        if (!rowDate) return false;
        if (createdFrom && rowDate < createdFrom) return false;
        if (createdTo && rowDate > createdTo) return false;
      }

      if (!searchTerms.length) return true;
      const hay = [
        row.lead_id,
        row.full_name,
        row.company_name,
        row.phone,
        row.email,
        row.country,
        row.lead_source,
        row.service_interest,
        row.status,
        row.priority,
        row.assigned_to,
        row.notes
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchTerms.every(term => hay.includes(term));
    });
  },
  renderFilters() {
    const assign = (el, values, selected) => {
      if (!el) return;
      const options = ['All', ...values];
      el.innerHTML = options.map(option => `<option>${U.escapeHtml(option)}</option>`).join('');
      if (options.includes(selected)) el.value = selected;
    };

    const uniq = values =>
      [...new Set(values.filter(Boolean).map(value => String(value).trim()))].sort((a, b) =>
        a.localeCompare(b)
      );

    assign(E.leadsStatusFilter, uniq(this.state.rows.map(row => row.status)), this.state.status);
    assign(
      E.leadsServiceInterestFilter,
      uniq(this.state.rows.map(row => row.service_interest)),
      this.state.serviceInterest
    );
    assign(E.leadsAssignedToFilter, uniq(this.state.rows.map(row => row.assigned_to)), this.state.assignedTo);

    if (E.leadsProposalNeededFilter) E.leadsProposalNeededFilter.value = this.state.proposalNeeded;
    if (E.leadsAgreementNeededFilter) E.leadsAgreementNeededFilter.value = this.state.agreementNeeded;
    if (E.leadsStartDateFilter) E.leadsStartDateFilter.value = this.state.createdFrom;
    if (E.leadsEndDateFilter) E.leadsEndDateFilter.value = this.state.createdTo;
  },
  uniqueSorted(values = []) {
    return [...new Set(values.filter(Boolean).map(value => String(value).trim()))].sort((a, b) =>
      a.localeCompare(b)
    );
  },
  syncLeadFormDropdowns(selected = {}) {
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
    const statusValues = this.formDropdownDefaults.status.concat(this.state.rows.map(row => row.status));
    const priorityValues = this.formDropdownDefaults.priority.concat(
      this.state.rows.map(row => row.priority)
    );
    const currencyValues = this.formDropdownDefaults.currency.concat(
      this.state.rows.map(row => row.currency)
    );

    assign(E.leadFormLeadSource, sourceValues, selected.lead_source || '');
    assign(E.leadFormServiceInterest, serviceValues, selected.service_interest || '');
    assign(E.leadFormStatus, statusValues, selected.status || '');
    assign(E.leadFormPriority, priorityValues, selected.priority || '');
    assign(E.leadFormCurrency, currencyValues, selected.currency || '');
  },
  formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return U.escapeHtml(String(value));
    return U.escapeHtml(U.fmtDisplayDate(value));
  },
  boolLabel(value) {
    if (value === 'yes') return 'Yes';
    if (value === 'no') return 'No';
    return '—';
  },
  normalizeText(value) {
    return String(value ?? '')
      .trim()
      .toLowerCase();
  },
  parseEstimatedValue(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const normalized = String(value)
      .replace(/,/g, '')
      .trim();
    if (!normalized) return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  },
  matchesKpiFilter(row = {}) {
    const filter = this.state.kpiFilter || 'total';
    const status = this.normalizeText(row?.status);
    const priority = this.normalizeText(row?.priority);
    const estimatedValue = this.parseEstimatedValue(row?.estimated_value);
    if (filter === 'total') return true;
    if (filter === 'new') return status === 'new';
    if (filter === 'qualified') return status === 'qualified';
    if (filter === 'proposal-sent') return status === 'proposal sent';
    if (filter === 'won' || filter === 'conversion-rate') return status === 'won';
    if (filter === 'lost') return status === 'lost';
    if (filter === 'high-priority') return priority === 'high' || priority === 'urgent';
    if (filter === 'pipeline-value') return estimatedValue > 0;
    if (filter === 'proposal-needed') return this.normalizeBool(row?.proposal_needed) === 'yes';
    if (filter === 'agreement-needed') return this.normalizeBool(row?.agreement_needed) === 'yes';
    return true;
  },
  applyKpiFilter(filter) {
    const nextFilter = String(filter || 'total').trim() || 'total';
    this.state.kpiFilter = this.state.kpiFilter === nextFilter ? 'total' : nextFilter;
    this.applyFilters();
    this.render();
  },
  syncKpiCardState() {
    const cards = document.querySelectorAll('#leadsAnalyticsGrid [data-kpi-filter]');
    cards.forEach(card => {
      const isActive = (card.getAttribute('data-kpi-filter') || 'total') === (this.state.kpiFilter || 'total');
      card.classList.toggle('kpi-filter-active', isActive);
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  },
  computeLeadAnalytics(leads = []) {
    const rows = Array.isArray(leads) ? leads : [];
    const statusKeys = ['new', 'qualified', 'proposal sent', 'negotiation', 'won', 'lost', 'on hold'];
    const statusBreakdown = Object.fromEntries(statusKeys.map(key => [key, 0]));
    const currencyTotals = new Set();
    let pipelineValue = 0;
    let proposalNeededCount = 0;
    let agreementNeededCount = 0;
    let highPriorityCount = 0;

    rows.forEach(row => {
      const status = this.normalizeText(row?.status);
      if (statusBreakdown[status] !== undefined) statusBreakdown[status] += 1;

      const priority = this.normalizeText(row?.priority);
      if (priority === 'high' || priority === 'urgent') highPriorityCount += 1;

      if (this.normalizeBool(row?.proposal_needed) === 'yes') proposalNeededCount += 1;
      if (this.normalizeBool(row?.agreement_needed) === 'yes') agreementNeededCount += 1;

      pipelineValue += this.parseEstimatedValue(row?.estimated_value);
      const currency = String(row?.currency || '')
        .trim()
        .toUpperCase();
      if (currency) currencyTotals.add(currency);
    });

    const total = rows.length;
    const wonCount = statusBreakdown.won || 0;
    const conversionRate = total > 0 ? (wonCount / total) * 100 : 0;
    const currencies = [...currencyTotals];
    const pipelineCurrency = currencies.length === 1 ? currencies[0] : '';

    return {
      total,
      newCount: statusBreakdown.new || 0,
      qualifiedCount: statusBreakdown.qualified || 0,
      proposalSentCount: statusBreakdown['proposal sent'] || 0,
      wonCount,
      lostCount: statusBreakdown.lost || 0,
      highPriorityCount,
      proposalNeededCount,
      agreementNeededCount,
      conversionRate,
      pipelineValue,
      pipelineCurrency,
      hasMixedCurrencies: currencies.length > 1,
      statusBreakdown
    };
  },
  renderLeadAnalytics(analytics) {
    const safe = analytics || this.computeLeadAnalytics([]);
    const setText = (el, value) => {
      if (el) el.textContent = value;
    };

    setText(E.leadsKpiTotal, String(safe.total || 0));
    setText(E.leadsKpiNew, String(safe.newCount || 0));
    setText(E.leadsKpiQualified, String(safe.qualifiedCount || 0));
    setText(E.leadsKpiProposalSent, String(safe.proposalSentCount || 0));
    setText(E.leadsKpiWon, String(safe.wonCount || 0));
    setText(E.leadsKpiLost, String(safe.lostCount || 0));
    setText(E.leadsKpiHighPriority, String(safe.highPriorityCount || 0));
    setText(E.leadsKpiProposalNeeded, String(safe.proposalNeededCount || 0));
    setText(E.leadsKpiAgreementNeeded, String(safe.agreementNeededCount || 0));
    setText(E.leadsKpiConversionRate, `${(safe.conversionRate || 0).toFixed(1)}%`);

    const valueNumber = Number.isFinite(safe.pipelineValue) ? safe.pipelineValue : 0;
    const hasSingleCurrency = !!safe.pipelineCurrency && !safe.hasMixedCurrencies;
    if (hasSingleCurrency) {
      let formatted = valueNumber.toLocaleString(undefined, {
        style: 'currency',
        currency: safe.pipelineCurrency,
        maximumFractionDigits: 2
      });
      if (formatted === 'NaN') formatted = `${safe.pipelineCurrency} ${valueNumber.toLocaleString()}`;
      setText(E.leadsKpiPipelineValue, formatted);
      setText(E.leadsKpiPipelineSub, `Total estimated value (${safe.pipelineCurrency})`);
    } else {
      setText(E.leadsKpiPipelineValue, valueNumber.toLocaleString(undefined, { maximumFractionDigits: 2 }));
      setText(
        E.leadsKpiPipelineSub,
        safe.hasMixedCurrencies ? 'Total estimated value (mixed currencies)' : 'Total estimated value'
      );
    }

    if (E.leadsStatusDistribution) {
      const statuses = [
        ['New', 'new'],
        ['Qualified', 'qualified'],
        ['Proposal Sent', 'proposal sent'],
        ['Negotiation', 'negotiation'],
        ['Won', 'won'],
        ['Lost', 'lost'],
        ['On Hold', 'on hold']
      ];
      const total = safe.total || 0;
      E.leadsStatusDistribution.innerHTML = statuses
        .map(([label, key]) => {
          const count = safe.statusBreakdown?.[key] || 0;
          const percent = total > 0 ? (count / total) * 100 : 0;
          return `<div class="leads-status-row">
            <div class="leads-status-label">${U.escapeHtml(label)}</div>
            <div class="leads-status-track"><span class="leads-status-fill" style="width:${Math.min(100, percent).toFixed(1)}%"></span></div>
            <div class="leads-status-meta">${count} · ${percent.toFixed(1)}%</div>
          </div>`;
        })
        .join('');
    }
    this.syncKpiCardState();
  },
  canEditDelete() {
    return Permissions.canEditDeleteLead();
  },
  render() {
    if (!E.leadsTbody || !E.leadsState) return;
    if (this.state.loading) {
      E.leadsState.textContent = 'Loading leads…';
      this.renderLeadAnalytics(this.computeLeadAnalytics([]));
      E.leadsTbody.innerHTML = Array.from({ length: 6 })
        .map(
          () =>
            '<tr class="skeleton-row">' +
            '<td colspan="21"><div class="skeleton-line" style="height:12px;margin:6px 0;"></div></td>' +
            '</tr>'
        )
        .join('');
      return;
    }
    if (this.state.loadError) {
      E.leadsState.textContent = this.state.loadError;
      this.renderLeadAnalytics(this.computeLeadAnalytics([]));
      E.leadsTbody.innerHTML = `<tr><td colspan="21" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(this.state.loadError)}</td></tr>`;
      return;
    }

    const rows = this.state.filteredRows;
    this.renderLeadAnalytics(this.computeLeadAnalytics(rows));
    E.leadsState.textContent = `${rows.length} lead${rows.length === 1 ? '' : 's'}`;

    if (!rows.length) {
      E.leadsTbody.innerHTML = '<tr><td colspan="21" class="muted" style="text-align:center;">No leads found for current filters.</td></tr>';
      return;
    }

    E.leadsTbody.innerHTML = rows
      .map(row => {
        const actionButtons = [];
        if (this.canConvertLead(row)) {
          actionButtons.push(
            `<button class="btn ghost sm" type="button" data-lead-convert="${U.escapeAttr(row.lead_id)}">Convert to Deal</button>`
          );
        }
        if (this.canEditDelete()) {
          actionButtons.push(
            `<button class="btn ghost sm" type="button" data-lead-edit="${U.escapeAttr(row.lead_id)}">Edit</button>`
          );
          actionButtons.push(
            `<button class="btn ghost sm" type="button" data-lead-delete="${U.escapeAttr(row.lead_id)}">Delete</button>`
          );
        }
        const actions = actionButtons.length ? actionButtons.join(' ') : '<span class="muted">—</span>';
        return `<tr>
          <td>${U.escapeHtml(row.lead_id || '—')}</td>
          <td>${this.formatDate(row.created_at)}</td>
          <td>${U.escapeHtml(row.full_name || '—')}</td>
          <td>${U.escapeHtml(row.company_name || '—')}</td>
          <td>${U.escapeHtml(row.phone || '—')}</td>
          <td>${U.escapeHtml(row.email || '—')}</td>
          <td>${U.escapeHtml(row.country || '—')}</td>
          <td>${U.escapeHtml(row.lead_source || '—')}</td>
          <td>${U.escapeHtml(row.service_interest || '—')}</td>
          <td>${U.escapeHtml(row.status || '—')}</td>
          <td>${U.escapeHtml(row.priority || '—')}</td>
          <td>${U.escapeHtml(row.estimated_value === '' ? '—' : String(row.estimated_value))}</td>
          <td>${U.escapeHtml(row.currency || '—')}</td>
          <td>${U.escapeHtml(row.assigned_to || '—')}</td>
          <td>${U.escapeHtml(row.next_followup_date || '—')}</td>
          <td>${U.escapeHtml(row.last_contact_date || '—')}</td>
          <td>${U.escapeHtml(this.boolLabel(row.proposal_needed))}</td>
          <td>${U.escapeHtml(this.boolLabel(row.agreement_needed))}</td>
          <td>${U.escapeHtml(row.notes || '—')}</td>
          <td>${this.formatDate(row.updated_at)}</td>
          <td>${actions}</td>
        </tr>`;
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
      const response = await this.listLeads({ forceRefresh: force, page: 1, limit: 50 });
      this.state.rows = this.extractRows(response).map(item => this.normalizeLead(item));
      this.state.loaded = true;
      this.state.lastLoadedAt = Date.now();
      this.state.lastSyncedAt = new Date().toISOString();
      this.renderFilters();
      this.applyFilters();
      this.render();
      this.state.initialized = true;
    } catch (error) {
      if (isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      this.state.rows = [];
      this.state.filteredRows = [];
      this.state.loadError = String(error?.message || '').trim() || 'Unable to load leads right now.';
      this.render();
      UI.toast(this.state.loadError);
    } finally {
      this.state.loading = false;
      this.render();
    }
  },
  setFormBusy(v) {
    if (E.leadFormSaveBtn) {
      E.leadFormSaveBtn.disabled = !!v;
      E.leadFormSaveBtn.textContent = v ? 'Saving…' : 'Save';
    }
    if (E.leadFormDeleteBtn) E.leadFormDeleteBtn.disabled = !!v;
  },
  resetForm() {
    if (!E.leadForm) return;
    E.leadForm.reset();
    if (E.leadFormLeadId) E.leadFormLeadId.value = '';
    if (E.leadFormCreatedAt) E.leadFormCreatedAt.value = '';
    if (E.leadFormUpdatedAt) E.leadFormUpdatedAt.value = '';
    if (E.leadFormProposalNeeded) E.leadFormProposalNeeded.value = '';
    if (E.leadFormAgreementNeeded) E.leadFormAgreementNeeded.value = '';
    this.syncLeadFormDropdowns();
  },
  currentUserAssignee() {
    return String(Session.displayName() || Session.username() || Session.user()?.email || '').trim();
  },
  openForm(row = null) {
    if (!E.leadFormModal || !E.leadForm) return;
    const isEdit = !!row;
    E.leadForm.dataset.mode = isEdit ? 'edit' : 'create';
    E.leadForm.dataset.id = row?.lead_id || '';
    if (E.leadFormTitle) E.leadFormTitle.textContent = isEdit ? 'Edit Lead' : 'Create Lead';
    this.resetForm();

    if (row) {
      if (E.leadFormLeadId) E.leadFormLeadId.value = row.lead_id || '';
      if (E.leadFormCreatedAt) E.leadFormCreatedAt.value = row.created_at || '';
      if (E.leadFormFullName) E.leadFormFullName.value = row.full_name || '';
      if (E.leadFormCompanyName) E.leadFormCompanyName.value = row.company_name || '';
      if (E.leadFormPhone) E.leadFormPhone.value = row.phone || '';
      if (E.leadFormEmail) E.leadFormEmail.value = row.email || '';
      if (E.leadFormCountry) E.leadFormCountry.value = row.country || '';
      if (E.leadFormLeadSource) E.leadFormLeadSource.value = row.lead_source || '';
      if (E.leadFormServiceInterest) E.leadFormServiceInterest.value = row.service_interest || '';
      if (E.leadFormStatus) E.leadFormStatus.value = row.status || '';
      if (E.leadFormPriority) E.leadFormPriority.value = row.priority || '';
      if (E.leadFormEstimatedValue) E.leadFormEstimatedValue.value = row.estimated_value === '' ? '' : String(row.estimated_value);
      if (E.leadFormCurrency) E.leadFormCurrency.value = row.currency || '';
      if (E.leadFormAssignedTo) E.leadFormAssignedTo.value = row.assigned_to || '';
      if (E.leadFormNextFollowupDate) E.leadFormNextFollowupDate.value = String(row.next_followup_date || '').slice(0, 10);
      if (E.leadFormLastContactDate) E.leadFormLastContactDate.value = String(row.last_contact_date || '').slice(0, 10);
      if (E.leadFormProposalNeeded) E.leadFormProposalNeeded.value = row.proposal_needed || '';
      if (E.leadFormAgreementNeeded) E.leadFormAgreementNeeded.value = row.agreement_needed || '';
      if (E.leadFormNotes) E.leadFormNotes.value = row.notes || '';
      if (E.leadFormUpdatedAt) E.leadFormUpdatedAt.value = row.updated_at || '';
      this.syncLeadFormDropdowns({
        lead_source: row.lead_source || '',
        service_interest: row.service_interest || '',
        status: row.status || '',
        priority: row.priority || '',
        currency: row.currency || ''
      });
    } else {
      if (E.leadFormLeadId) E.leadFormLeadId.value = 'Auto-generated';
      if (E.leadFormCreatedAt) E.leadFormCreatedAt.value = U.fmtDisplayDate(new Date());
      if (E.leadFormAssignedTo) E.leadFormAssignedTo.value = this.currentUserAssignee();
      this.syncLeadFormDropdowns();
    }

    if (E.leadFormDeleteBtn) E.leadFormDeleteBtn.style.display = isEdit && this.canEditDelete() ? '' : 'none';
    if (E.leadFormSaveBtn) E.leadFormSaveBtn.disabled = false;
    E.leadFormModal.style.display = 'flex';
    E.leadFormModal.setAttribute('aria-hidden', 'false');
  },
  closeForm() {
    if (!E.leadFormModal) return;
    E.leadFormModal.style.display = 'none';
    E.leadFormModal.setAttribute('aria-hidden', 'true');
  },
  collectFormData() {
    return {
      full_name: String(E.leadFormFullName?.value || '').trim(),
      company_name: String(E.leadFormCompanyName?.value || '').trim(),
      phone: String(E.leadFormPhone?.value || '').trim(),
      email: String(E.leadFormEmail?.value || '').trim(),
      country: String(E.leadFormCountry?.value || '').trim(),
      lead_source: String(E.leadFormLeadSource?.value || '').trim(),
      service_interest: String(E.leadFormServiceInterest?.value || '').trim(),
      status: String(E.leadFormStatus?.value || '').trim(),
      priority: String(E.leadFormPriority?.value || '').trim(),
      estimated_value: String(E.leadFormEstimatedValue?.value || '').trim(),
      currency: String(E.leadFormCurrency?.value || '').trim(),
      assigned_to: String(E.leadFormAssignedTo?.value || '').trim(),
      next_followup_date: String(E.leadFormNextFollowupDate?.value || '').trim(),
      last_contact_date: String(E.leadFormLastContactDate?.value || '').trim(),
      proposal_needed: this.normalizeBool(E.leadFormProposalNeeded?.value || ''),
      agreement_needed: this.normalizeBool(E.leadFormAgreementNeeded?.value || ''),
      notes: String(E.leadFormNotes?.value || '').trim()
    };
  },
  normalizeComparableLeadDate(value) {
    return String(value || '')
      .trim()
      .slice(0, 10);
  },
  didLeadUpdatePersist(latestLead, submittedLead) {
    const latest = this.normalizeLead(latestLead || {});
    const submitted = submittedLead || {};
    const toComparable = lead => ({
      full_name: String(lead.full_name || '').trim(),
      company_name: String(lead.company_name || '').trim(),
      phone: String(lead.phone || '').trim(),
      email: String(lead.email || '').trim(),
      country: String(lead.country || '').trim(),
      lead_source: String(lead.lead_source || '').trim(),
      service_interest: String(lead.service_interest || '').trim(),
      status: String(lead.status || '').trim(),
      priority: String(lead.priority || '').trim(),
      estimated_value: String(lead.estimated_value ?? '').trim(),
      currency: String(lead.currency || '').trim(),
      assigned_to: String(lead.assigned_to || '').trim(),
      next_followup_date: this.normalizeComparableLeadDate(lead.next_followup_date),
      last_contact_date: this.normalizeComparableLeadDate(lead.last_contact_date),
      proposal_needed: this.normalizeBool(lead.proposal_needed),
      agreement_needed: this.normalizeBool(lead.agreement_needed),
      notes: String(lead.notes || '').trim()
    });

    const a = toComparable(latest);
    const b = toComparable(submitted);
    return Object.keys(b).every(key => a[key] === b[key]);
  },
  async updateLeadWithVerification(leadId, lead) {
    const response = await this.updateLead(leadId, lead);
    const resolvedRow = response?.lead || response?.data?.lead || { ...lead, lead_id: leadId };
    return { row: resolvedRow, verifiedAfterError: false };
  },
  formatLeadActionError(error, { resource = 'leads', action = 'unknown' } = {}) {
    const statusMatch = String(error?.message || '').match(/\bHTTP\s+(\d{3})\b/i);
    const proxyStatus = statusMatch ? statusMatch[1] : 'unknown';
    const rawMessage = String(error?.message || '').trim() || 'Unknown error';
    const backendMessageMatch = rawMessage.match(/Backend message:\s*([^.]*)/i);
    const backendMessage = String(
      backendMessageMatch?.[1] || error?.backendMessage || rawMessage
    ).trim();
    return [
      `Unable to save lead.`,
      `Proxy status: ${proxyStatus}.`,
      `Backend: ${backendMessage}.`,
      `Request: resource=${resource} action=${action}.`
    ].join(' ');
  },
  async submitForm() {
    if (this.state.saveInFlight) return;
    if (!Permissions.canCreateLead()) {
      UI.toast('Login is required to manage leads.');
      return;
    }
    const mode = E.leadForm?.dataset.mode === 'edit' ? 'edit' : 'create';
    if (mode === 'edit' && !this.canEditDelete()) {
      UI.toast('Only admin/dev can update leads.');
      return;
    }
    const leadId = String(E.leadForm?.dataset.id || '').trim();
    const lead = this.collectFormData();
    if (!lead.full_name) {
      UI.toast('Full name is required.');
      return;
    }
    if (mode === 'edit' && !leadId) {
      UI.toast('Lead ID is missing. Please reopen the lead and try again.');
      return;
    }

    this.setFormBusy(true);
    this.state.saveInFlight = true;
    console.time('entity-save');
    try {
      if (mode === 'edit') {
        const result = await this.updateLeadWithVerification(leadId, lead);
        const resolvedRow = result?.row || { ...lead, lead_id: leadId };
        this.upsertLocalRow(resolvedRow);
        UI.toast(result?.verifiedAfterError ? 'Lead updated (verified).' : 'Lead updated.');
      } else {
        const response = await this.createLead(lead);
        const created = response?.lead || response?.data?.lead || response || lead;
        this.upsertLocalRow(created);
        UI.toast('Lead created.');
      }
      this.closeForm();
      this.rerenderSummaryIfNeeded();
    } catch (error) {
      if (isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast(this.formatLeadActionError(error, { resource: 'leads', action: mode === 'edit' ? 'update' : 'create' }));
    } finally {
      console.timeEnd('entity-save');
      this.state.saveInFlight = false;
      this.setFormBusy(false);
    }
  },
  async deleteLeadById(leadId) {
    if (!this.canEditDelete()) {
      UI.toast('Only admin/dev can delete leads.');
      return;
    }
    const confirmed = window.confirm(`Delete lead ${leadId}?`);
    if (!confirmed) return;

    this.setFormBusy(true);
    try {
      await this.deleteLead(leadId);
      this.removeLocalRow(leadId);
      UI.toast('Lead deleted.');
      this.closeForm();
      this.rerenderSummaryIfNeeded();
    } catch (error) {
      if (isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast('Unable to delete lead: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setFormBusy(false);
    }
  },
  async convertLeadById(leadId) {
    if (!Permissions.canCreateLead()) {
      UI.toast('Login is required to convert leads.');
      return;
    }
    const row = this.state.rows.find(item => item.lead_id === leadId);
    if (!this.canConvertLead(row)) {
      UI.toast('This lead is already converted or unavailable.');
      return;
    }
    this.setFormBusy(true);
    try {
      const response = await this.convertToDeal(leadId);
      const dealId = this.getConvertedDealId(response);
      UI.toast(dealId ? `Lead converted to deal ${dealId}.` : 'Lead converted to deal.');
      await Promise.all([
        this.loadAndRefresh({ force: true }),
        window.Deals?.loadAndRefresh ? Deals.loadAndRefresh({ force: true }) : Promise.resolve()
      ]);
    } catch (error) {
      if (isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast('Unable to convert lead: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setFormBusy(false);
    }
  },
  handleFilterChange() {
    this.applyFilters();
    this.render();
  },
  wire() {
    if (this.state.initialized) return;

    const bindState = (el, key) => {
      if (!el) return;
      const sync = () => {
        this.state[key] = String(el.value || '').trim();
        this.handleFilterChange();
      };
      el.addEventListener('input', sync);
      el.addEventListener('change', sync);
    };

    bindState(E.leadsSearchInput, 'search');
    bindState(E.leadsStatusFilter, 'status');
    bindState(E.leadsServiceInterestFilter, 'serviceInterest');
    bindState(E.leadsAssignedToFilter, 'assignedTo');
    bindState(E.leadsProposalNeededFilter, 'proposalNeeded');
    bindState(E.leadsAgreementNeededFilter, 'agreementNeeded');
    bindState(E.leadsStartDateFilter, 'createdFrom');
    bindState(E.leadsEndDateFilter, 'createdTo');

    if (E.leadsResetBtn) {
      E.leadsResetBtn.addEventListener('click', () => {
        this.state.search = '';
        this.state.status = 'All';
        this.state.serviceInterest = 'All';
        this.state.assignedTo = 'All';
        this.state.proposalNeeded = 'All';
        this.state.agreementNeeded = 'All';
        this.state.createdFrom = '';
        this.state.createdTo = '';
        this.state.kpiFilter = 'total';
        this.applyFilters();
        this.renderFilters();
        this.render();
      });
    }

    if (E.leadsRefreshBtn) {
      E.leadsRefreshBtn.addEventListener('click', () => this.loadAndRefresh({ force: true }));
    }
    if (E.leadsCreateBtn) {
      E.leadsCreateBtn.addEventListener('click', () => {
        if (!Permissions.canCreateLead()) {
          UI.toast('Login is required to create leads.');
          return;
        }
        this.openForm();
      });
    }

    if (E.leadsTbody) {
      E.leadsTbody.addEventListener('click', event => {
        const editId = event.target?.getAttribute('data-lead-edit');
        if (editId) {
          const row = this.state.rows.find(item => item.lead_id === editId);
          if (row) this.openForm(row);
          return;
        }
        const deleteId = event.target?.getAttribute('data-lead-delete');
        if (deleteId) {
          this.deleteLeadById(deleteId);
          return;
        }
        const convertId = event.target?.getAttribute('data-lead-convert');
        if (convertId) this.convertLeadById(convertId);
      });
    }
    const leadsAnalyticsGrid = document.getElementById('leadsAnalyticsGrid');
    if (leadsAnalyticsGrid) {
      const activate = card => {
        if (!card) return;
        const filter = card.getAttribute('data-kpi-filter');
        if (!filter) return;
        this.applyKpiFilter(filter);
      };
      leadsAnalyticsGrid.addEventListener('click', event => {
        activate(event.target?.closest?.('[data-kpi-filter]'));
      });
      leadsAnalyticsGrid.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const card = event.target?.closest?.('[data-kpi-filter]');
        if (!card) return;
        event.preventDefault();
        activate(card);
      });
    }

    if (E.leadFormCloseBtn) E.leadFormCloseBtn.addEventListener('click', () => this.closeForm());
    if (E.leadFormCancelBtn) E.leadFormCancelBtn.addEventListener('click', () => this.closeForm());
    if (E.leadFormModal) {
      E.leadFormModal.addEventListener('click', event => {
        if (event.target === E.leadFormModal) this.closeForm();
      });
    }
    if (E.leadForm) {
      E.leadForm.addEventListener('submit', event => {
        event.preventDefault();
        this.submitForm();
      });
    }
    if (E.leadFormDeleteBtn) {
      E.leadFormDeleteBtn.addEventListener('click', () => {
        const id = String(E.leadForm?.dataset.id || '').trim();
        if (id) this.deleteLeadById(id);
      });
    }

    this.state.initialized = true;
  }
};

window.Leads = Leads;
