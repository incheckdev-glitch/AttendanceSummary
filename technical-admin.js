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
    detailPreviewLoading: false,
    pendingHighlightId: ''
  },
  pick(...values) {
    for (const value of values) {
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  },
  normalizeToken(value = '') {
    return String(value || '').toLowerCase().trim();
  },
  parseOptionalNumber(...values) {
    for (const value of values) {
      if (value === undefined || value === null || String(value).trim() === '') continue;
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  },
  isUuid(value = '') {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
  },
  toDisplayDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '—';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '—';
    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
  },
  toDisplayDateTime(value) {
    const raw = String(value || '').trim();
    if (!raw) return '—';
    return U.formatDateTimeMMDDYYYYHHMM(raw);
  },
  profileDisplay(profile = null, fallback = '') {
    if (!profile || typeof profile !== 'object') return String(fallback || '').trim();
    const name = String(profile.name || profile.full_name || profile.username || '').trim();
    const email = String(profile.email || '').trim();
    return name || email || String(fallback || '').trim();
  },
  parseAgreementPayload(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;
    try {
      return JSON.parse(trimmed);
    } catch (_error) {
      return value;
    }
  },
  extractLinkedAgreement(source = {}) {
    const candidates = [
      source.agreement,
      source.linked_agreement,
      source.linkedAgreement,
      source.agreement_row,
      source.agreementRow,
      source.data,
      source.item,
      source.payload
    ];
    for (const candidateRaw of candidates) {
      const candidate = this.parseAgreementPayload(candidateRaw);
      if (!candidate) continue;
      if (Array.isArray(candidate)) {
        const first = candidate[0];
        if (first && typeof first === 'object') return first;
        continue;
      }
      if (typeof candidate !== 'object') continue;
      if (candidate.agreement && typeof candidate.agreement === 'object') return candidate.agreement;
      if (candidate.item && typeof candidate.item === 'object') return candidate.item;
      if (candidate.agreement_id || candidate.agreement_number || candidate.id || Array.isArray(candidate.agreement_items) || Array.isArray(candidate.items)) {
        return candidate;
      }
    }
    return {};
  },
  extractAgreementItems(source = {}, agreement = {}) {
    const itemCandidates = [source.agreement_items, source.agreementItems, source.items, agreement.agreement_items, agreement.agreementItems, agreement.items];
    for (const candidate of itemCandidates) {
      const parsed = this.parseAgreementPayload(candidate);
      if (Array.isArray(parsed)) return parsed;
    }
    return [];
  },
  isAnnualSaasLocationItem(item = {}) {
    const safe = item && typeof item === 'object' ? item : {};
    const section = this.normalizeToken(safe.section || safe.category || safe.type || safe.section_name || safe.section_label);
    const billingFrequency = this.normalizeToken(safe.billing_frequency || safe.billingFrequency || safe.frequency);
    const itemName = this.normalizeToken(safe.item_name || safe.itemName || safe.module || safe.module_name || safe.moduleName);
    if (!section && !billingFrequency) return false;
    const isOneTimeOrSetup = ['one_time_fee', 'one_time', 'one time', 'one-time', 'setup', 'implementation', 'onboarding'].some(
      token => section.includes(token)
    );
    if (isOneTimeOrSetup) return false;
    const isSaasFamily = ['annual_saas', 'saas', 'subscription', 'recurring'].some(token => section.includes(token));
    if (!isSaasFamily) return false;
    const isAnnual = ['annual', 'yearly', '12 month', '12-month'].some(
      token => section.includes(token) || billingFrequency.includes(token) || itemName.includes(token)
    );
    return isAnnual;
  },
  deriveAgreementLocationCount(agreementItems = []) {
    const safeItems = Array.isArray(agreementItems) ? agreementItems : [];
    return safeItems.filter(item => this.isAnnualSaasLocationItem(item)).length;
  },
  normalizeRow(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const agreement = this.extractLinkedAgreement(source);
    const agreementItems = this.extractAgreementItems(source, agreement);
    const requestLocationCount = this.parseOptionalNumber(
      source.location_count,
      source.number_of_locations,
      source.locations_count,
      source.locationCount,
      source.numberOfLocations,
      source.locationsCount
    );
    const agreementLocationCount = this.parseOptionalNumber(
      agreement.location_count,
      agreement.locations_count,
      agreement.number_of_locations,
      agreement.locationCount,
      agreement.locationsCount,
      agreement.numberOfLocations
    );
    const derivedLocationCount = agreementItems.length ? this.deriveAgreementLocationCount(agreementItems) : null;
    const resolvedLocationCount = requestLocationCount ?? agreementLocationCount ?? derivedLocationCount;
    const sourceId = String(source.id || '').trim();
    const onboardingId = String(this.pick(source.onboarding_id, source.onboardingId)).trim();
    return {
      id: sourceId,
      db_id: sourceId,
      technical_request_id: onboardingId || sourceId,
      agreement_id: String(this.pick(source.agreement_id, source.agreementId)).trim(),
      agreement_number: String(this.pick(source.agreement_number, source.agreementNumber)).trim(),
      onboarding_id: onboardingId,
      client_id: String(this.pick(source.client_id, source.clientId)).trim(),
      client_name: String(this.pick(source.client_name, source.clientName, source.customer_name, source.customerName)).trim(),
      request_type: String(this.pick(source.technical_request_type, source.request_type, source.requestType, 'Technical Admin')).trim(),
      request_title: 'Technical Admin Request',
      request_message: String(this.pick(source.technical_request_details, source.request_message, source.requestMessage)).trim(),
      request_details: String(this.pick(source.technical_request_details, source.request_details, source.requestDetails)).trim(),
      request_status: String(this.pick(source.technical_request_status, source.request_status, source.requestStatus)).trim() || 'Requested',
      priority: String(this.pick(source.priority)).trim(),
      location_count: Number.isFinite(Number(resolvedLocationCount)) ? Number(resolvedLocationCount) : null,
      number_of_locations: Number.isFinite(Number(resolvedLocationCount)) ? Number(resolvedLocationCount) : null,
      service_start_date: String(this.pick(source.service_start_date, source.serviceStartDate, agreement.service_start_date, agreement.serviceStartDate)).trim(),
      service_end_date: String(this.pick(source.service_end_date, source.serviceEndDate, agreement.service_end_date, agreement.serviceEndDate)).trim(),
      billing_frequency: String(this.pick(source.billing_frequency, source.billingFrequency, agreement.billing_frequency, agreement.billingFrequency, agreement.frequency)).trim(),
      payment_term: String(this.pick(source.payment_term, source.paymentTerm, agreement.payment_term, agreement.paymentTerm, agreement.payment_terms, agreement.paymentTerms)).trim(),
      module_summary: String(this.pick(source.module_summary, source.moduleSummary)).trim(),
      agreement_status: String(this.pick(source.agreement_status, source.agreementStatus)).trim(),
      requested_by: String(this.pick(source.requested_by, source.requestedBy)).trim(),
      requested_at: String(this.pick(source.requested_at, source.requestedAt)).trim(),
      assigned_to: String(this.pick(source.technical_admin_assigned_to, source.technicalAdminAssignedTo, source.assigned_to, source.assignedTo)).trim(),
      requested_by_display: String(this.pick(source.requested_by_display, source.requested_by, source.requestedBy)).trim(),
      assigned_to_display: String(this.pick(source.assigned_to_display, source.technical_admin_assigned_to, source.assigned_to, source.assignedTo)).trim(),
      completed_at: String(this.pick(source.completed_at, source.completedAt)).trim(),
      updated_by: String(this.pick(source.updated_by, source.updatedBy)).trim(),
      updated_at: String(this.pick(source.updated_at, source.updatedAt)).trim(),
      notes: String(this.pick(source.notes)).trim()
    };
  },
  async enrichRows(rows = []) {
    const rawRows = Array.isArray(rows) ? rows : [];
    const client = window.SupabaseClient?.getClient?.();
    if (!client || !rawRows.length) return rawRows.map(row => this.normalizeRow(row));

    const agreementIds = [...new Set(rawRows.map(row => String(this.pick(row?.agreement_id, row?.agreementId)).trim()).filter(Boolean))];
    console.log('[technical admin] agreement ids', agreementIds);
    const profileIds = [
      ...new Set(
        rawRows
          .flatMap(row => [row?.requested_by, row?.requestedBy, row?.technical_admin_assigned_to, row?.assigned_to, row?.assignedTo])
          .map(value => String(value || '').trim())
          .filter(value => this.isUuid(value))
      )
    ];

    const agreementsPromise = agreementIds.length
      ? client.from('agreements').select('*').in('id', agreementIds)
      : Promise.resolve({ data: [], error: null });
    const itemsPromise = agreementIds.length
      ? client.from('agreement_items').select('*').in('agreement_id', agreementIds)
      : Promise.resolve({ data: [], error: null });
    const profilesPromise = profileIds.length
      ? client.from('profiles').select('id, name, full_name, username, email').in('id', profileIds)
      : Promise.resolve({ data: [], error: null });

    const [agreementsRes, itemsRes, profilesRes] = await Promise.all([agreementsPromise, itemsPromise, profilesPromise]);
    if (agreementsRes?.error) console.warn('[technical admin] agreements enrichment failed', agreementsRes.error);
    if (itemsRes?.error) console.warn('[technical admin] agreement_items enrichment failed', itemsRes.error);
    if (profilesRes?.error) console.warn('[technical admin] profiles enrichment failed', profilesRes.error);

    const agreementById = new Map((agreementsRes?.data || []).map(row => [String(row?.id || '').trim(), row]));
    const itemsByAgreementId = new Map();
    (itemsRes?.data || []).forEach(item => {
      const key = String(item?.agreement_id || '').trim();
      if (!key) return;
      if (!itemsByAgreementId.has(key)) itemsByAgreementId.set(key, []);
      itemsByAgreementId.get(key).push(item);
    });
    const profileById = new Map((profilesRes?.data || []).map(row => [String(row?.id || '').trim(), row]));

    const enrichedRows = rawRows.map(raw => {
      const row = this.normalizeRow(raw);
      const agreementId = String(row.agreement_id || '').trim();
      const agreement = agreementById.get(agreementId) || {};
      const agreementItems = itemsByAgreementId.get(agreementId) || [];
      const itemLocationCount = agreementItems.length ? this.deriveAgreementLocationCount(agreementItems) : null;
      const earliestItemStart = agreementItems
        .map(item => String(item?.service_start_date || '').trim())
        .filter(Boolean)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] || '';
      const latestItemEnd = agreementItems
        .map(item => String(item?.service_end_date || '').trim())
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || '';
      const firstItem = agreementItems[0] || {};
      const requestedByProfile = this.isUuid(row.requested_by) ? profileById.get(row.requested_by) : null;
      const assignedToValue = String(this.pick(raw.technical_admin_assigned_to, raw.assigned_to, raw.assignedTo, row.assigned_to)).trim();
      const assignedToProfile = this.isUuid(assignedToValue) ? profileById.get(assignedToValue) : null;

      const locationCount = this.parseOptionalNumber(
        itemLocationCount,
        agreement.number_of_locations,
        agreement.location_count,
        row.number_of_locations,
        row.location_count
      );
      return {
        ...row,
        agreement_number: String(this.pick(row.agreement_number, agreement.agreement_number, agreement.agreementNumber)).trim(),
        client_name: String(this.pick(row.client_name, agreement.client_name, agreement.company_name, agreement.customer_name)).trim(),
        location_count: Number.isFinite(Number(locationCount)) ? Number(locationCount) : null,
        number_of_locations: Number.isFinite(Number(locationCount)) ? Number(locationCount) : null,
        service_start_date: String(this.pick(agreement.service_start_date, earliestItemStart, row.service_start_date)).trim(),
        service_end_date: String(this.pick(agreement.service_end_date, latestItemEnd, row.service_end_date)).trim(),
        billing_frequency: String(
          this.pick(
            agreement.billing_cycle,
            agreement.billing_frequency,
            firstItem.billing_cycle,
            firstItem.billing_frequency,
            raw.billing_cycle,
            raw.billing_frequency,
            row.billing_frequency
          )
        ).trim(),
        payment_term: String(this.pick(agreement.payment_terms, agreement.payment_term, raw.payment_terms, raw.payment_term, row.payment_term)).trim(),
        requested_by_display: this.profileDisplay(requestedByProfile, row.requested_by),
        assigned_to: assignedToValue,
        assigned_to_display: this.profileDisplay(assignedToProfile, assignedToValue)
      };
    });
    console.log('[technical admin] enriched rows', enrichedRows);
    return enrichedRows;
  },
  highlightRow(requestId = '') {
    const targetId = String(requestId || '').trim();
    if (!targetId || !E.technicalAdminTbody) return;
    const rowEl =
      E.technicalAdminTbody.querySelector(`tr[data-technical-request-id="${targetId}"]`) ||
      E.technicalAdminTbody.querySelector(`tr[data-technical-onboarding-id="${targetId}"]`) ||
      E.technicalAdminTbody.querySelector(`tr[data-technical-request-key="${targetId}"]`);
    if (!rowEl) return;
    rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    rowEl.classList.add('row-highlight-pulse');
    window.setTimeout(() => rowEl.classList.remove('row-highlight-pulse'), 2200);
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
        row.assigned_to
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
        const requestDbId = U.escapeAttr(row.id || row.technical_request_id || '');
        const onboardingId = U.escapeAttr(row.onboarding_id || '');
        const agreementId = String(row.agreement_id || '').trim();
        const agreementAction = agreementId
          ? `<button class="btn ghost sm" type="button" data-technical-preview="${U.escapeAttr(agreementId)}" data-technical-request-preview="${requestId}">Preview Agreement</button>`
          : '';
        return `<tr data-technical-request-id="${requestDbId}" data-technical-onboarding-id="${onboardingId}" data-technical-request-key="${requestId}">
          <td>${text(row.technical_request_id)}</td>
          <td>${text(row.agreement_number)}</td>
          <td>${text(row.client_name)}</td>
          <td>${text(row.number_of_locations)}</td>
          <td>${U.escapeHtml(this.toDisplayDate(row.service_start_date))}</td>
          <td>${U.escapeHtml(this.toDisplayDate(row.service_end_date))}</td>
          <td>${text(row.billing_frequency)}</td>
          <td>${text(row.payment_term)}</td>
          <td>${this.statusBadge(row.request_status)}</td>
          <td>${text(row.requested_by_display || row.requested_by)}</td>
          <td>${U.escapeHtml(this.toDisplayDateTime(row.requested_at))}</td>
          <td>${text(row.assigned_to_display || row.assigned_to)}</td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="btn ghost sm" type="button" data-technical-open="${requestDbId}">Open</button>
              ${agreementAction}
            </div>
          </td>
        </tr>`;
      })
      .join('');
    if (this.state.pendingHighlightId) {
      const pendingId = this.state.pendingHighlightId;
      this.state.pendingHighlightId = '';
      window.requestAnimationFrame(() => this.highlightRow(pendingId));
    }
  },
  async loadAndRefresh(options = {}) {
    if (!Permissions.canViewTechnicalAdmin()) return;
    this.state.loading = true;
    this.state.loadError = '';
    this.render();
    try {
      const response = await Api.listOperationsOnboarding({}, { forceRefresh: !!options.force });
      const rows = Api.normalizeListResponse(response)?.rows || [];
      console.log('[technical admin] raw onboarding rows', rows);
      const filteredRows = rows.filter(
        row => row?.technical_request_type || row?.technical_request_status || row?.requested_at || row?.technical_request_details
      );
      this.state.rows = (await this.enrichRows(filteredRows)).filter(row => row.id || row.technical_request_id);
      if (options?.highlightRequestId) this.state.pendingHighlightId = String(options.highlightRequestId || '').trim();
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
    const requestId = String(normalized.id || normalized.technical_request_id || '').trim();
    if (!requestId) return;
    const idx = this.state.rows.findIndex(item => String(item.id || item.technical_request_id || '') === requestId);
    if (idx === -1) this.state.rows.unshift(normalized);
    else this.state.rows[idx] = { ...this.state.rows[idx], ...normalized };
    this.applyFilters();
    this.renderFilters();
    this.render();
  },
  getRowById(requestId = '') {
    const id = String(requestId || '').trim();
    if (!id) return null;
    return this.state.rows.find(row => String(row.id || row.technical_request_id || '') === id) || null;
  },
  closeDetails() {
    if (!E.technicalAdminDetailsModal) return;
    E.technicalAdminDetailsModal.classList.remove('open');
    E.technicalAdminDetailsModal.setAttribute('aria-hidden', 'true');
  },
  async openDetails(requestId) {
    const id = String(requestId || '').trim();
    if (!id) return;
    let row = this.getRowById(id);
    this.state.activeRequestId = String(row?.id || id).trim();
    try {
      const response = await Api.getOperationsOnboarding({ id: this.state.activeRequestId });
      const detail = Api.unwrapApiPayload(response);
      const detailRow = this.normalizeRow(detail?.onboarding || detail || response || {});
      if (detailRow.technical_request_id) {
        this.upsertLocalRow(detailRow);
        row = detailRow;
        this.state.activeRequestId = String(detailRow.id || this.state.activeRequestId).trim();
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
          <div><span class="muted">Requested By:</span> ${U.escapeHtml(row.requested_by_display || row.requested_by || '—')}</div>
          <div><span class="muted">Requested At:</span> ${U.escapeHtml(this.toDisplayDateTime(row.requested_at))}</div>
          <div><span class="muted">Assigned To:</span> ${U.escapeHtml(row.assigned_to_display || row.assigned_to || '—')}</div>
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
    const activeId = String(this.state.activeRequestId || '').trim();
    if (!activeId) return;
    const row = this.getRowById(activeId);
    const rowId = String(row?.id || activeId).trim();
    if (!rowId) return;
    const nowIso = new Date().toISOString();
    const nextStatus = String(status || '').trim() || 'Requested';
    try {
      const response = await Api.updateOperationsOnboardingAction({
        onboardingId: rowId,
        agreementId: String(row?.agreement_id || '').trim(),
        updates: {
          technical_request_status: nextStatus,
          updated_at: nowIso,
          completed_at: nextStatus === 'Completed' ? nowIso : null,
          ...(extra && typeof extra === 'object' ? extra : {})
        }
      });
      const payload = Api.unwrapApiPayload(response);
      const returned = payload?.operations_onboarding || payload?.onboarding || payload;
      const existing = this.getRowById(rowId) || { id: rowId, technical_request_id: rowId };
      this.upsertLocalRow({ ...existing, ...(returned && typeof returned === 'object' ? returned : {}), technical_request_status: nextStatus });
      const labelId = String(this.getRowById(rowId)?.technical_request_id || rowId).trim();
      UI.toast(`Technical request ${labelId} updated to ${nextStatus}.`);
      await this.loadAndRefresh({ force: true });
      await this.openDetails(rowId);
    } catch (error) {
      UI.toast('Unable to update technical admin request status: ' + (error?.message || 'Unknown error'));
    }
  },
  async assignToFlow() {
    const assignee = window.prompt('Assign Technical Admin to:');
    if (assignee == null) return;
    const activeId = String(this.state.activeRequestId || '').trim();
    const row = this.getRowById(activeId);
    const rowId = String(row?.id || activeId).trim();
    if (!rowId) return;
    const nowIso = new Date().toISOString();
    try {
      await Api.updateOperationsOnboardingAction({
        onboardingId: rowId,
        agreementId: String(row?.agreement_id || '').trim(),
        updates: {
          technical_admin_assigned_to: String(assignee || '').trim(),
          updated_at: nowIso
        }
      });
      this.upsertLocalRow({ ...(row || { id: rowId }), technical_admin_assigned_to: String(assignee || '').trim(), updated_at: nowIso });
      UI.toast('Technical admin assignee updated.');
      await this.loadAndRefresh({ force: true });
      await this.openDetails(rowId);
    } catch (error) {
      UI.toast('Unable to assign technical admin: ' + (error?.message || 'Unknown error'));
    }
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
        if (statusBtn) {
          const nextStatus = statusBtn.getAttribute('data-technical-status') || 'Requested';
          return this.updateStatus(nextStatus);
        }
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
