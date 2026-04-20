const TechnicalAdmin = {
  state: {
    rows: [],
    filteredRows: [],
    loading: false,
    loadError: '',
    loaded: false,
    initialized: false,
    search: '',
    status: 'All',
    activeRequestId: '',
    rowActionInFlight: new Set(),
    detailPreviewLoading: false
  },
  pick(...values) {
    for (const value of values) {
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  },
  normalizeRow(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
      technical_request_id: String(this.pick(source.technical_request_id, source.technicalRequestId, source.id)).trim(),
      agreement_id: String(this.pick(source.agreement_id, source.agreementId)).trim(),
      agreement_number: String(this.pick(source.agreement_number, source.agreementNumber)).trim(),
      onboarding_id: String(this.pick(source.onboarding_id, source.onboardingId)).trim(),
      client_id: String(this.pick(source.client_id, source.clientId)).trim(),
      client_name: String(this.pick(source.client_name, source.clientName, source.customer_name, source.customerName)).trim(),
      request_type: String(this.pick(source.request_type, source.requestType)).trim(),
      request_title: String(this.pick(source.request_title, source.requestTitle)).trim(),
      request_message: String(this.pick(source.request_message, source.requestMessage)).trim(),
      request_details: String(this.pick(source.request_details, source.requestDetails)).trim(),
      request_status: String(this.pick(source.request_status, source.requestStatus)).trim() || 'Requested',
      priority: String(this.pick(source.priority)).trim(),
      location_count: Number(this.pick(source.location_count, source.number_of_locations, source.locations_count, source.locationCount, source.numberOfLocations, source.locationsCount)) || 0,
      service_start_date: String(this.pick(source.service_start_date, source.serviceStartDate)).trim(),
      service_end_date: String(this.pick(source.service_end_date, source.serviceEndDate)).trim(),
      billing_frequency: String(this.pick(source.billing_frequency, source.billingFrequency)).trim(),
      payment_term: String(this.pick(source.payment_term, source.paymentTerm)).trim(),
      module_summary: String(this.pick(source.module_summary, source.moduleSummary)).trim(),
      agreement_status: String(this.pick(source.agreement_status, source.agreementStatus)).trim(),
      requested_by: String(this.pick(source.requested_by, source.requestedBy)).trim(),
      requested_at: String(this.pick(source.requested_at, source.requestedAt)).trim(),
      technical_admin_assigned_to: String(this.pick(source.technical_admin_assigned_to, source.technicalAdminAssignedTo)).trim(),
      started_at: String(this.pick(source.started_at, source.startedAt)).trim(),
      completed_at: String(this.pick(source.completed_at, source.completedAt)).trim(),
      updated_by: String(this.pick(source.updated_by, source.updatedBy)).trim(),
      updated_at: String(this.pick(source.updated_at, source.updatedAt)).trim(),
      notes: String(this.pick(source.notes)).trim()
    };
  },
  statusBucket(status = '') {
    const normalized = String(status || '').trim().toLowerCase();
    if (!normalized) return 'Requested';
    if (normalized.includes('progress')) return 'In Progress';
    if (normalized.includes('complete')) return 'Completed';
    return 'Requested';
  },
  statusBadge(status = '') {
    const normalized = String(status || '').trim();
    const label = normalized || 'Requested';
    return `<span class="pill status-${U.toStatusClass(label)}">${U.escapeHtml(label)}</span>`;
  },
  setTriggerBusy(trigger, busy, loadingLabel = 'Loading…') {
    if (!trigger || !('disabled' in trigger)) return;
    const isBusy = !!busy;
    trigger.disabled = isBusy;
    if (isBusy) {
      trigger.dataset.originalLabel = String(trigger.textContent || '');
      trigger.textContent = loadingLabel;
      trigger.setAttribute('aria-busy', 'true');
      return;
    }
    if (trigger.dataset.originalLabel !== undefined) {
      trigger.textContent = trigger.dataset.originalLabel;
      delete trigger.dataset.originalLabel;
    }
    trigger.removeAttribute('aria-busy');
  },
  async runRowAction(actionKey, trigger, fn, loadingLabel = 'Loading…') {
    const key = String(actionKey || '').trim();
    if (!key) return;
    if (this.state.rowActionInFlight.has(key)) return;
    this.state.rowActionInFlight.add(key);
    this.setTriggerBusy(trigger, true, loadingLabel);
    try {
      await fn();
    } finally {
      this.state.rowActionInFlight.delete(key);
      this.setTriggerBusy(trigger, false, loadingLabel);
    }
  },
  async previewAgreement(agreementId) {
    const id = String(agreementId || '').trim();
    if (!id) {
      UI.toast('Linked agreement not available');
      return;
    }
    if (!window.Agreements?.previewAgreementHtml) {
      UI.toast('Unable to load agreement preview');
      return;
    }
    try {
      await window.Agreements.previewAgreementHtml(id);
    } catch (_error) {
      UI.toast('Unable to load agreement preview');
    }
  },
  applyFilters() {
    const query = String(this.state.search || '').trim().toLowerCase();
    const statusFilter = String(this.state.status || 'All').trim();
    this.state.filteredRows = this.state.rows.filter(row => {
      const hay = [
        row.technical_request_id,
        row.agreement_id,
        row.agreement_number,
        row.client_name,
        row.request_title,
        row.request_message,
        row.request_status,
        row.requested_by,
        row.technical_admin_assigned_to
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (query && !hay.includes(query)) return false;
      return statusFilter === 'All' || row.request_status === statusFilter;
    });
  },
  renderSummary() {
    if (!E.technicalAdminSummary) return;
    const rows = this.state.filteredRows;
    const total = rows.length;
    const requested = rows.filter(row => this.statusBucket(row.request_status) === 'Requested').length;
    const inProgress = rows.filter(row => this.statusBucket(row.request_status) === 'In Progress').length;
    const completed = rows.filter(row => this.statusBucket(row.request_status) === 'Completed').length;
    const cards = [
      ['Total Requests', total],
      ['Requested', requested],
      ['In Progress', inProgress],
      ['Completed', completed]
    ];
    E.technicalAdminSummary.innerHTML = cards
      .map(([label, value]) => `<div class="card kpi"><div class="label">${U.escapeHtml(label)}</div><div class="value">${U.escapeHtml(String(value))}</div></div>`)
      .join('');
  },
  renderFilters() {
    if (!E.technicalAdminStatusFilter) return;
    const statuses = [...new Set(this.state.rows.map(row => String(row.request_status || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const options = ['All', ...statuses];
    E.technicalAdminStatusFilter.innerHTML = options.map(v => `<option>${U.escapeHtml(v)}</option>`).join('');
    E.technicalAdminStatusFilter.value = options.includes(this.state.status) ? this.state.status : 'All';
    if (E.technicalAdminSearchInput) E.technicalAdminSearchInput.value = this.state.search;
  },
  render() {
    if (!E.technicalAdminState || !E.technicalAdminTbody) return;
    if (this.state.loading) {
      E.technicalAdminState.textContent = 'Loading technical admin requests…';
      E.technicalAdminTbody.innerHTML = '<tr><td colspan="13" class="muted" style="text-align:center;">Loading technical admin requests…</td></tr>';
      return;
    }
    if (this.state.loadError) {
      E.technicalAdminState.textContent = this.state.loadError;
      E.technicalAdminTbody.innerHTML = `<tr><td colspan="13" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(this.state.loadError)}</td></tr>`;
      return;
    }
    const rows = this.state.filteredRows;
    E.technicalAdminState.textContent = `${rows.length} request${rows.length === 1 ? '' : 's'}`;
    this.renderSummary();
    if (!rows.length) {
      E.technicalAdminTbody.innerHTML = '<tr><td colspan="13" class="muted" style="text-align:center;">No technical admin requests found.</td></tr>';
      return;
    }
    const text = value => U.escapeHtml(String(value || '').trim() || '—');
    E.technicalAdminTbody.innerHTML = rows
      .map(row => {
        const requestId = U.escapeAttr(row.technical_request_id || '');
        const agreementId = String(row.agreement_id || '').trim();
        const agreementAction = agreementId
          ? `<button class="btn ghost sm" type="button" data-technical-preview="${U.escapeAttr(agreementId)}" data-technical-request-preview="${requestId}">Preview Agreement</button>`
          : '';
        return `<tr data-technical-request-id="${requestId}">
          <td>${text(row.technical_request_id)}</td>
          <td>${text(row.agreement_number)}</td>
          <td>${text(row.client_name)}</td>
          <td>${text(row.location_count)}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.service_start_date))}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.service_end_date))}</td>
          <td>${text(row.billing_frequency)}</td>
          <td>${text(row.payment_term)}</td>
          <td>${this.statusBadge(row.request_status)}</td>
          <td>${text(row.requested_by)}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.requested_at))}</td>
          <td>${text(row.technical_admin_assigned_to)}</td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="btn ghost sm" type="button" data-technical-open="${requestId}">Open</button>
              ${agreementAction}
            </div>
          </td>
        </tr>`;
      })
      .join('');
  },
  async loadAndRefresh(options = {}) {
    if (!Permissions.canViewTechnicalAdmin()) return;
    this.state.loading = true;
    this.state.loadError = '';
    this.render();
    try {
      const response = await Api.listTechnicalAdminRequests({ forceRefresh: !!options.force });
      const rows = Api.normalizeListResponse(response)?.rows || [];
      this.state.rows = rows.map(row => this.normalizeRow(row)).filter(row => row.technical_request_id);
      this.state.loaded = true;
    } catch (error) {
      this.state.rows = [];
      this.state.loadError = String(error?.message || 'Unable to load technical admin requests.').trim();
    } finally {
      this.state.loading = false;
      this.applyFilters();
      this.renderFilters();
      this.render();
    }
  },
  upsertLocalRow(row) {
    const normalized = this.normalizeRow(row);
    const requestId = String(normalized.technical_request_id || '').trim();
    if (!requestId) return;
    const idx = this.state.rows.findIndex(item => String(item.technical_request_id || '') === requestId);
    if (idx === -1) this.state.rows.unshift(normalized);
    else this.state.rows[idx] = { ...this.state.rows[idx], ...normalized };
    this.applyFilters();
    this.renderFilters();
    this.render();
  },
  getRowById(requestId = '') {
    const id = String(requestId || '').trim();
    if (!id) return null;
    return this.state.rows.find(row => String(row.technical_request_id || '') === id) || null;
  },
  closeDetails() {
    if (!E.technicalAdminDetailsModal) return;
    E.technicalAdminDetailsModal.classList.remove('open');
    E.technicalAdminDetailsModal.setAttribute('aria-hidden', 'true');
  },
  async openDetails(requestId) {
    const id = String(requestId || '').trim();
    if (!id) return;
    this.state.activeRequestId = id;
    let row = this.getRowById(id);
    try {
      const response = await Api.getTechnicalAdminRequest(id);
      const detail = Api.unwrapApiPayload(response);
      const detailRow = this.normalizeRow(detail || response || {});
      if (detailRow.technical_request_id) {
        this.upsertLocalRow(detailRow);
        row = detailRow;
      }
    } catch (_error) {
      // Render local row fallback.
    }
    if (!row) return UI.toast('Unable to load technical admin request details.');
    if (E.technicalAdminDetailsTitle) {
      E.technicalAdminDetailsTitle.textContent = `Technical Admin Request ${row.technical_request_id || ''}`.trim();
    }
    if (E.technicalAdminDetailsContent) {
      const agreementId = String(row.agreement_id || '').trim();
      const hasAgreementId = !!agreementId;
      const hasAgreementNumberOnly = !hasAgreementId && !!String(row.agreement_number || '').trim();
      const previewDisabledAttr = hasAgreementId ? '' : 'disabled';
      const previewHint = hasAgreementNumberOnly
        ? '<div class="muted" style="font-size:12px;">Linked agreement not available</div>'
        : '';
      E.technicalAdminDetailsContent.innerHTML = `
        <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
          <div><span class="muted">Technical Request ID:</span> ${U.escapeHtml(row.technical_request_id || '—')}</div>
          <div><span class="muted">Agreement ID:</span> ${U.escapeHtml(row.agreement_id || '—')}</div>
          <div><span class="muted">Agreement Number:</span> ${U.escapeHtml(row.agreement_number || '—')}</div>
          <div><span class="muted">Onboarding ID:</span> ${U.escapeHtml(row.onboarding_id || '—')}</div>
          <div><span class="muted">Client ID:</span> ${U.escapeHtml(row.client_id || '—')}</div>
          <div><span class="muted">Client Name:</span> ${U.escapeHtml(row.client_name || '—')}</div>
          <div><span class="muted">Request Type:</span> ${U.escapeHtml(row.request_type || '—')}</div>
          <div><span class="muted">Status:</span> ${this.statusBadge(row.request_status)}</div>
          <div><span class="muted">Requested By:</span> ${U.escapeHtml(row.requested_by || '—')}</div>
          <div><span class="muted">Requested At:</span> ${U.escapeHtml(U.fmtDisplayDate(row.requested_at))}</div>
          <div><span class="muted">Assigned To:</span> ${U.escapeHtml(row.technical_admin_assigned_to || '—')}</div>
          <div><span class="muted">Updated At:</span> ${U.escapeHtml(U.fmtDisplayDate(row.updated_at))}</div>
          <div style="grid-column:1/-1;"><span class="muted">Request Title:</span> ${U.escapeHtml(row.request_title || '—')}</div>
          <div style="grid-column:1/-1;"><span class="muted">Request Message:</span> ${U.escapeHtml(row.request_message || '—')}</div>
          <div style="grid-column:1/-1;"><span class="muted">Module Summary:</span> ${U.escapeHtml(row.module_summary || '—')}</div>
          <div style="grid-column:1/-1;"><span class="muted">Request Details:</span> ${U.escapeHtml(row.request_details || '—')}</div>
          <div style="grid-column:1/-1;"><span class="muted">Notes:</span> ${U.escapeHtml(row.notes || '—')}</div>
        </div>
        <div class="actions" style="justify-content:flex-end;gap:8px;margin-top:14px;">
          <div style="margin-right:auto;display:flex;flex-direction:column;gap:4px;align-items:flex-start;">
            <button class="btn ghost" type="button" data-technical-preview-detail="${U.escapeAttr(agreementId)}" ${previewDisabledAttr}>Preview Agreement</button>
            ${previewHint}
          </div>
          <button class="btn ghost" type="button" data-technical-status="In Progress">Mark In Progress</button>
          <button class="btn ghost" type="button" data-technical-status="Completed">Mark Completed</button>
          <button class="btn ghost" type="button" data-technical-status="Requested">Reopen</button>
          <button class="btn ghost" type="button" data-technical-assign="1">Assign To…</button>
        </div>
      `;
    }
    if (E.technicalAdminDetailsModal) {
      E.technicalAdminDetailsModal.classList.add('open');
      E.technicalAdminDetailsModal.setAttribute('aria-hidden', 'false');
    }
  },
  async updateStatus(status, extra = {}) {
    const id = String(this.state.activeRequestId || '').trim();
    if (!id) return;
    try {
      const response = await Api.updateTechnicalAdminRequestStatus(id, status, extra);
      const payload = Api.unwrapApiPayload(response);
      const returned = payload?.technical_request || payload?.request || payload;
      if (returned && typeof returned === 'object' && returned.technical_request_id) {
        this.upsertLocalRow(returned);
      } else {
        const existing = this.getRowById(id) || { technical_request_id: id };
        this.upsertLocalRow({ ...existing, request_status: status, ...extra });
      }
      UI.toast(`Technical request ${id} updated to ${status}.`);
      await this.loadAndRefresh({ force: true });
      await this.openDetails(id);
    } catch (error) {
      UI.toast('Unable to update technical admin request status: ' + (error?.message || 'Unknown error'));
    }
  },
  async assignToFlow() {
    const assignee = window.prompt('Assign Technical Admin to:');
    if (assignee == null) return;
    await this.updateStatus((this.getRowById(this.state.activeRequestId)?.request_status || 'Requested'), {
      technical_admin_assigned_to: String(assignee || '').trim()
    });
  },
  wire() {
    if (this.state.initialized) return;
    const bindState = (el, key) => {
      if (!el) return;
      const sync = () => {
        this.state[key] = String(el.value || '').trim();
        this.applyFilters();
        this.render();
      };
      el.addEventListener('input', sync);
      el.addEventListener('change', sync);
    };
    bindState(E.technicalAdminSearchInput, 'search');
    bindState(E.technicalAdminStatusFilter, 'status');
    if (E.technicalAdminRefreshBtn) E.technicalAdminRefreshBtn.addEventListener('click', () => this.loadAndRefresh({ force: true }));
    if (E.technicalAdminTbody)
      E.technicalAdminTbody.addEventListener('click', event => {
        const trigger = event.target?.closest?.('button[data-technical-open], button[data-technical-preview]');
        if (!trigger) return;
        const id = trigger.getAttribute('data-technical-open') || '';
        if (id) return this.openDetails(id);
        const previewId = trigger.getAttribute('data-technical-preview') || '';
        if (!previewId) return;
        const requestId = trigger.getAttribute('data-technical-request-preview') || previewId;
        return this.runRowAction(`preview:${requestId}`, trigger, () => this.previewAgreement(previewId), 'Loading…');
      });
    if (E.technicalAdminDetailsContent)
      E.technicalAdminDetailsContent.addEventListener('click', event => {
        const statusBtn = event.target?.closest?.('button[data-technical-status]');
        if (statusBtn) return this.updateStatus(statusBtn.getAttribute('data-technical-status') || 'Requested');
        const assignBtn = event.target?.closest?.('button[data-technical-assign]');
        if (assignBtn) return this.assignToFlow();
        const previewBtn = event.target?.closest?.('button[data-technical-preview-detail]');
        if (previewBtn) {
          const previewId = String(previewBtn.getAttribute('data-technical-preview-detail') || '').trim();
          if (!previewId) return UI.toast('Linked agreement not available');
          if (this.state.detailPreviewLoading) return;
          this.state.detailPreviewLoading = true;
          this.setTriggerBusy(previewBtn, true, 'Loading…');
          this.previewAgreement(previewId).finally(() => {
            this.state.detailPreviewLoading = false;
            this.setTriggerBusy(previewBtn, false, 'Loading…');
          });
        }
      });
    if (E.technicalAdminDetailsCloseBtn) E.technicalAdminDetailsCloseBtn.addEventListener('click', () => this.closeDetails());
    if (E.technicalAdminDetailsModal)
      E.technicalAdminDetailsModal.addEventListener('click', event => {
        if (event.target === E.technicalAdminDetailsModal) this.closeDetails();
      });
    this.state.initialized = true;
  }
};

window.TechnicalAdmin = TechnicalAdmin;
