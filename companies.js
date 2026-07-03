const COMPANY_TYPE_FALLBACK_OPTIONS = [
  { value: 'single_branch', label: 'Single Branch' },
  { value: 'chain', label: 'Chain' },
  { value: 'franchise', label: 'Franchise' },
  { value: 'enterprise', label: 'Enterprise' },
  { value: 'sme', label: 'SME' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'partner', label: 'Partner' },
  { value: 'other', label: 'Other' }
];

const COMPANY_LIFECYCLE_STATUSES = ['Prospect', 'Lead', 'Deal', 'Proposal', 'Agreement', 'Signed', 'Onboarding', 'Active Client'];
const COMPANY_LIFECYCLE_RANK = COMPANY_LIFECYCLE_STATUSES.reduce((acc, status, index) => { acc[status] = index; return acc; }, {});

const COMPANY_INDUSTRY_FALLBACK_OPTIONS = [
  { value: 'fnb', label: 'F&B' },
  { value: 'retail', label: 'Retail' },
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'education', label: 'Education' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'technology', label: 'Technology' },
  { value: 'security', label: 'Security' },
  { value: 'finance', label: 'Finance' },
  { value: 'other', label: 'Other' }
];


function normalizeRoleKey(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
}

function canVerifyCompany(currentUser) {
  const user = currentUser ||
    window.AppState?.currentUser ||
    window.Permissions?.getResolvedCurrentUser?.() ||
    window.Session?.authContext?.()?.profile ||
    window.currentUser ||
    {};
  const role =
    user?.role_key ||
    user?.role ||
    user?.user_role ||
    user?.profile?.role_key ||
    user?.profile?.role ||
    window.Session?.role?.() ||
    '';

  const roleKey = normalizeRoleKey(role);

  if (['admin', 'accountant', 'accounting'].includes(roleKey)) {
    return true;
  }

  if (window.Permissions?.can) {
    if (window.Permissions.can('companies', 'verify')) return true;
    if (window.Permissions.can('companies', 'verify_company')) return true;
  }

  if (window.PermissionService?.can) {
    if (window.PermissionService.can('companies', 'verify')) return true;
    if (window.PermissionService.can('companies', 'verify_company')) return true;
  }

  return false;
}

if (typeof window !== 'undefined') {
  window.normalizeRoleKey = window.normalizeRoleKey || normalizeRoleKey;
  window.canVerifyCompany = canVerifyCompany;
}

const Companies = {

  columnMap: {
    company_id: { accessor: row => row.company_id }, verification: { accessor: row => row.verification_status || row.is_verified }, company_name: { accessor: row => row.company_name },
    company_type: { accessor: row => row.company_type }, industry: { accessor: row => row.industry }, company_status: { accessor: row => row.company_status },
    email: { accessor: row => row.main_email }, phone: { accessor: row => row.main_phone }, country: { accessor: row => row.country }, city: { accessor: row => row.city }, created_at: { accessor: row => row.created_at }
  },
  tableColumns: [
    { key: 'company_id', label: 'Company ID' }, { key: 'verification', label: 'Verification' }, { key: 'company_name', label: 'Company Name' },
    { key: 'company_type', label: 'Type' }, { key: 'industry', label: 'Industry' }, { key: 'company_status', label: 'Status' },
    { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'country', label: 'Country' }, { key: 'city', label: 'City' }, { key: 'created_at', label: 'Created At' }, null
  ],
  state: { rows: [], page: 1, limit: 50, total: 0, search: '', filters: { company_status: '', company_type: '', industry: '', country: '', city: '', created_from: '', created_to: '' }, sortBy: 'created_at', sortDir: 'desc', companyTypeOptions: COMPANY_TYPE_FALLBACK_OPTIONS, companyIndustryOptions: COMPANY_INDUSTRY_FALLBACK_OPTIONS, currentCompany: null, documents: [], selectedDetailsId: '', summary: { totalCompanies: 0, verified: 0, activeClients: 0, prospects: 0 } },
  formatCodeFallback(value = '') { return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()); },
  formatCompanyType(value = '') { const found = this.state.companyTypeOptions.find(o => o.value === value); return found?.label || this.formatCodeFallback(value); },
  formatCompanyIndustry(value = '') { const found = this.state.companyIndustryOptions.find(o => o.value === value); return found?.label || this.formatCodeFallback(value); },
  normalize(raw = {}) { return { ...raw, id: raw.id || '', company_id: raw.company_id || raw.companyId || '', company_name: raw.company_name || raw.companyName || '', legal_name: raw.legal_name || raw.legalName || '', legal_company_name: raw.legal_company_name || raw.legalCompanyName || '', authorized_signatory_full_name: raw.authorized_signatory_full_name || raw.authorizedSignatoryFullName || '', authorized_signatory_title: raw.authorized_signatory_title || raw.authorizedSignatoryTitle || '', registration_number: raw.registration_number || raw.registrationNumber || '', company_type: raw.company_type || '', industry: raw.industry || '', website: raw.website || '', main_email: raw.main_email || raw.mainEmail || '', main_phone: raw.main_phone || raw.mainPhone || '', country: raw.country || '', state: raw.state || '', city: raw.city || '', address: raw.address || '', tax_number: raw.tax_number || raw.taxNumber || '', vat_number: raw.vat_number || raw.vatNumber || '', company_status: raw.company_status || raw.companyStatus || raw.status || 'Prospect', notes: raw.notes || '', documents_verified: raw.documents_verified ?? raw.documentsVerified ?? false, documents_verification_status: raw.documents_verification_status || raw.documentsVerificationStatus || 'not_verified', documents_verified_at: raw.documents_verified_at || raw.documentsVerifiedAt || '', documents_verified_by: raw.documents_verified_by || raw.documentsVerifiedBy || '', documents_verification_notes: raw.documents_verification_notes || raw.documentsVerificationNotes || '', documents_verified_snapshot: raw.documents_verified_snapshot ?? raw.documentsVerifiedSnapshot ?? null, documents_verification_invalidated_at: raw.documents_verification_invalidated_at || raw.documentsVerificationInvalidatedAt || '', documents_verification_invalidated_reason: raw.documents_verification_invalidated_reason || raw.documentsVerificationInvalidatedReason || '', is_verified: raw.is_verified ?? raw.isVerified ?? false, verified: raw.verified ?? false, company_verified: raw.company_verified ?? raw.companyVerified ?? false, authorized_signatory_verified: raw.authorized_signatory_verified ?? raw.authorizedSignatoryVerified ?? false, verification_status: raw.verification_status || raw.verificationStatus || '', authorized_signatory_name: raw.authorized_signatory_name || raw.authorizedSignatoryName || raw.authorized_signatory_full_name || raw.authorizedSignatoryFullName || '', created_at: raw.created_at || raw.createdAt || '' }; },
  async hydrateOptionSources() {
    const load = async (resource, fallback) => {
      try {
        const res = await Api.requestWithSession(resource, 'list', { filters: { is_active: true }, sortBy: 'sort_order', sortDir: 'asc', limit: 100 }, { requireAuth: true });
        const rows = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];
        const mapped = rows.map(r => ({ value: String(r.value || r.option_value || r.code || '').trim(), label: String(r.label || r.option_label || r.name || '').trim() })).filter(r => r.value && r.label);
        return mapped.length ? mapped : fallback;
      } catch (_) { return fallback; }
    };
    [this.state.companyTypeOptions, this.state.companyIndustryOptions] = await Promise.all([
      load('company_type_options', COMPANY_TYPE_FALLBACK_OPTIONS),
      load('company_industry_options', COMPANY_INDUSTRY_FALLBACK_OPTIONS)
    ]);
  },
  renderSelectOptions(id, options, placeholder) {
    const el = document.getElementById(id); if (!el) return;
    el.innerHTML = [`<option value="">${placeholder}</option>`].concat(options.map(o => `<option value="${U.escapeAttr(o.value)}">${U.escapeHtml(o.label)}</option>`)).join('');
  },
  async ensureControls() {
    const view = document.getElementById('companyView');
    if (!view) return;

    if (!document.getElementById('companySearchInput')) {
      await this.hydrateOptionSources();
      const filterCard = document.getElementById('companyFilterCard') || view.querySelector('.card');
      if (filterCard) {
        filterCard.innerHTML = `
          <div class="company-panel-title">
            <span class="company-panel-icon" aria-hidden="true">⌁</span>
            <h2>Filters</h2>
          </div>
          <div class="company-filter-grid">
            <label class="company-filter-field company-filter-search" for="companySearchInput">
              <span>Search companies</span>
              <div class="company-input-shell">
                <span aria-hidden="true">⌕</span>
                <input id="companySearchInput" class="input" type="search" placeholder="Search by name, ID, email..." autocomplete="off" />
              </div>
            </label>
            <label class="company-filter-field" for="companyStatusFilter">
              <span>Status</span>
              <select id="companyStatusFilter" class="select">
                <option value="">All Statuses</option>
                ${COMPANY_LIFECYCLE_STATUSES.map(status => `<option value="${U.escapeAttr(status)}">${U.escapeHtml(status)}</option>`).join('')}
              </select>
            </label>
            <label class="company-filter-field" for="companyTypeFilter"><span>Type</span><select id="companyTypeFilter" class="select"></select></label>
            <label class="company-filter-field" for="companyIndustryFilter"><span>Industry</span><select id="companyIndustryFilter" class="select"></select></label>
            <label class="company-filter-field" for="companyCountryFilter"><span>Country</span><input id="companyCountryFilter" class="input" placeholder="Country" autocomplete="off" /></label>
            <label class="company-filter-field" for="companyCityFilter"><span>City</span><input id="companyCityFilter" class="input" placeholder="City" autocomplete="off" /></label>
            <label class="company-filter-field" for="companyCreatedFromFilter"><span>From Date</span><input id="companyCreatedFromFilter" class="input" type="date" /></label>
            <label class="company-filter-field" for="companyCreatedToFilter"><span>To Date</span><input id="companyCreatedToFilter" class="input" type="date" /></label>
            <div class="company-filter-field company-filter-clear"><span>&nbsp;</span><button id="companyClearFiltersBtn" class="btn ghost" type="button"><span aria-hidden="true">↻</span> Clear Filters</button></div>
          </div>`;
      }
      this.renderSelectOptions('companyTypeFilter', this.state.companyTypeOptions, 'All Types');
      this.renderSelectOptions('companyIndustryFilter', this.state.companyIndustryOptions, 'All Industries');

      document.getElementById('companySearchInput')?.addEventListener('input', e => { this.state.search = e.target.value.trim(); this.state.page = 1; this.loadAndRefresh(); });
      const bindChange = (id, key) => document.getElementById(id)?.addEventListener('change', e => { this.state.filters[key] = e.target.value.trim(); this.state.page = 1; this.loadAndRefresh(); });
      bindChange('companyStatusFilter', 'company_status');
      bindChange('companyTypeFilter', 'company_type');
      bindChange('companyIndustryFilter', 'industry');
      bindChange('companyCreatedFromFilter', 'created_from');
      bindChange('companyCreatedToFilter', 'created_to');
      const bindText = (id, key) => document.getElementById(id)?.addEventListener('input', e => { this.state.filters[key] = e.target.value.trim(); this.state.page = 1; this.loadAndRefresh(); });
      bindText('companyCountryFilter', 'country');
      bindText('companyCityFilter', 'city');
      document.getElementById('companyClearFiltersBtn')?.addEventListener('click', () => {
        this.state.search = '';
        this.state.filters = { company_status: '', company_type: '', industry: '', country: '', city: '', created_from: '', created_to: '' };
        ['companySearchInput','companyStatusFilter','companyTypeFilter','companyIndustryFilter','companyCountryFilter','companyCityFilter','companyCreatedFromFilter','companyCreatedToFilter'].forEach(fid => { const el = document.getElementById(fid); if (el) el.value = ''; });
        this.state.page = 1;
        this.loadAndRefresh();
      });
      document.getElementById('companyExportBtn')?.addEventListener('click', () => this.exportCsv());
      document.getElementById('companyRowsPerPage')?.addEventListener('change', e => { this.state.limit = Number(e.target.value) || 50; this.state.page = 1; this.loadAndRefresh(); });
    }

    const rowsSelect = document.getElementById('companyRowsPerPage');
    if (rowsSelect) rowsSelect.value = String(this.state.limit || 50);
    this.bindFormEvents();
    applyPermissionVisibility(view);
  },
  bindFormEvents() { if (this._formBound) return; this._formBound = true; document.getElementById('companyForm')?.addEventListener('submit', e => this.submitForm(e)); document.getElementById('companyDocumentUploadBtn')?.addEventListener('click', () => this.uploadCompanyDocument()); ['companyCancelBtn', 'companyCloseBtn'].forEach(id => document.getElementById(id)?.addEventListener('click', () => this.closeForm())); document.getElementById('companyModal')?.addEventListener('click', e => { if (this.isCompanyVerificationDialogOpen()) return; if (e.target?.id === 'companyModal') this.closeForm(); }); document.addEventListener('keydown', e => this.handleCompanyModalKeydown(e), true); },
  async openForm(existing = null) {
    if (!Permissions.canCreate('companies') && !existing) return; if (!Permissions.canEdit('companies') && existing) return;
    this.bindFormEvents(); await this.hydrateOptionSources(); this.renderSelectOptions('companyTypeInput', this.state.companyTypeOptions, 'Select company type'); this.renderSelectOptions('companyIndustryInput', this.state.companyIndustryOptions, 'Select industry');
    const isEdit = Boolean(existing?.id); this.state.currentCompany = isEdit ? this.normalize(existing) : null; this.state.documents = []; document.getElementById('companyModalTitle').textContent = isEdit ? 'Edit Company' : 'Create Company'; document.getElementById('companySaveBtn').textContent = isEdit ? 'Update Company' : 'Save Company'; document.getElementById('companyRecordId').value = existing?.id || '';
    const set = (id, value = '') => { const el = document.getElementById(id); if (el) el.value = value || ''; };
    set('companyNameInput', existing?.company_name); set('companyLegalNameInput', existing?.legal_name); set('companyAuthorizedSignatoryFullNameInput', existing?.authorized_signatory_full_name || existing?.authorizedSignatoryFullName); set('companyAuthorizedSignatoryTitleInput', existing?.authorized_signatory_title || existing?.authorizedSignatoryTitle); set('companyRegistrationNumberInput', existing?.registration_number || existing?.registrationNumber); set('companyTypeInput', existing?.company_type); set('companyIndustryInput', existing?.industry); set('companyWebsiteInput', existing?.website); set('companyMainEmailInput', existing?.main_email); set('companyMainPhoneInput', existing?.main_phone); set('companyCountryInput', existing?.country); set('companyCityInput', existing?.city); set('companyAddressInput', existing?.address); set('companyTaxNumberInput', existing?.tax_number); set('companyStatusInput', existing?.company_status || 'Prospect'); set('companyNotesInput', existing?.notes); const statusInput = document.getElementById('companyStatusInput'); if (statusInput) statusInput.value = existing?.company_status || 'Prospect';
    this.renderCompanyDocumentsSection(this.state.currentCompany);
    if (isEdit) this.loadCompanyDocuments(this.state.currentCompany);
    this.renderCompanyVerificationPanel(this.state.currentCompany);
    const modal = document.getElementById('companyModal'); modal.classList.add('company-edit-modal', 'company-edit-modal-backdrop', 'company-edit-backdrop'); modal.style.display = 'flex'; modal.setAttribute('aria-hidden', 'false'); this.updateCompanyModalBodyLock();
  },
  closeForm() { const form = document.getElementById('companyForm'); form?.reset(); document.getElementById('companyRecordId').value = ''; document.getElementById('companyStatusInput').value = 'Prospect'; this.state.currentCompany = null; this.state.documents = []; this.renderCompanyDocumentsSection(null); this.renderCompanyVerificationPanel(null); const modal = document.getElementById('companyModal'); modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); this.updateCompanyModalBodyLock(); this.toggleSave(false); },
  toggleSave(loading) { const btn = document.getElementById('companySaveBtn'); if (!btn) return; btn.disabled = loading; btn.textContent = loading ? 'Saving…' : (document.getElementById('companyRecordId').value ? 'Update Company' : 'Save Company'); },
  async submitForm(e) { e.preventDefault(); const recordId = document.getElementById('companyRecordId').value; const company_name = document.getElementById('companyNameInput').value.trim(); if (!company_name) { UI?.toast?.('Company Name is required', 'error'); return; } const payload = { company_name, legal_name: document.getElementById('companyLegalNameInput').value.trim(), company_type: document.getElementById('companyTypeInput').value.trim(), industry: document.getElementById('companyIndustryInput').value.trim(), website: document.getElementById('companyWebsiteInput').value.trim(), main_email: document.getElementById('companyMainEmailInput').value.trim(), main_phone: document.getElementById('companyMainPhoneInput').value.trim(), country: document.getElementById('companyCountryInput').value.trim(), city: document.getElementById('companyCityInput').value.trim(), address: document.getElementById('companyAddressInput').value.trim(), tax_number: document.getElementById('companyTaxNumberInput').value.trim(), authorized_signatory_full_name: document.getElementById('companyAuthorizedSignatoryFullNameInput').value.trim(), authorized_signatory_title: document.getElementById('companyAuthorizedSignatoryTitleInput').value.trim(), registration_number: document.getElementById('companyRegistrationNumberInput').value.trim(), company_status: recordId ? (this.state.currentCompany?.company_status || 'Prospect') : 'Prospect', notes: document.getElementById('companyNotesInput').value.trim() };
    this.toggleSave(true); try { const action = recordId ? 'update' : 'create'; if (recordId && !Permissions.canEdit('companies')) { UI?.toast?.('You do not have permission for this action.'); return; } if (!recordId && !Permissions.canCreate('companies')) { UI?.toast?.('You do not have permission for this action.'); return; } const body = recordId ? { id: recordId, updates: payload } : payload; const savedResponse = await Api.requestWithSession('companies', action, body, { requireAuth: true }); const saved = savedResponse?.row || savedResponse?.data || savedResponse?.company || savedResponse; const savedId = String(saved?.id || recordId || '').trim(); if (!savedId) throw new Error('Company saved without a UUID in the create response.'); window.CrmCompanyContactSelectors?.invalidateCompanies?.(); const savedCompany = { ...payload, ...saved, id: savedId }; await window.CrmCompanyContactSelectors?.refreshAfterCompanySave?.(savedCompany); window.dispatchEvent(new CustomEvent('crm:company-saved', { detail: { companyId: savedId, company: savedCompany } })); try { await this.refreshCompanyLifecycleStatus(savedId, { fullRecalculation: true }); } catch (syncError) { console.error('[companies] lifecycle status refresh failed after save', syncError); UI?.toast?.('Company saved, but lifecycle status could not be refreshed'); } UI?.toast?.(recordId ? 'Company updated' : 'Company saved', 'success'); this.closeForm(); this.state.page = recordId ? this.state.page : 1; await this.loadAndRefresh(); } catch (err) { UI?.toast?.('Unable to save company', 'error'); console.error(err); } finally { this.toggleSave(false); }
  },

  findDetailsRow(id) { const target = String(id || '').trim(); if (!target) return null; return (this.state.rows || []).find(row => [row.id, row.company_id, row.company_name].some(value => String(value || '').trim() === target)) || null; },
  openDetailsDrawer(rowOrId) {
    const row = typeof rowOrId === 'string' ? this.findDetailsRow(rowOrId) : rowOrId;
    if (!row || !window.RecordDetailsDrawer) return;
    const id = String(row.id || row.company_id || '').trim();
    this.state.selectedDetailsId = id;
    window.RecordDetailsDrawer.open({
      eyebrow: 'CRM · Company',
      title: row.company_name || row.legal_name || 'Company Details',
      subtitle: [this.formatCompanyType(row.company_type), this.normalizeLifecycleStatus(row.company_status), row.country].filter(Boolean).join(' · '),
      sections: [
        { title: 'Summary', cards: [
          ['Company ID', row.company_id],
          ['Lifecycle Status', this.normalizeLifecycleStatus(row.company_status)],
          ['Verification', this.formatCompanyVerificationStatus(row)],
          ['Company Type', this.formatCompanyType(row.company_type)],
          ['Industry', this.formatCompanyIndustry(row.industry)],
          ['Created Date', U.fmtTS(row.created_at)]
        ] },
        { title: 'Company Information', fields: [
          ['Legal Name', row.legal_name || row.legal_company_name],
          ['Registration Number', row.registration_number],
          ['Tax Number', row.tax_number],
          ['VAT Number', row.vat_number],
          ['Website', row.website],
          ['Status', row.company_status]
        ] },
        { title: 'Contact & Address', fields: [
          ['Main Email', row.main_email],
          ['Main Phone', row.main_phone],
          ['Country', row.country],
          ['State', row.state],
          ['City', row.city],
          ['Address', row.address]
        ] },
        { title: 'Authorized Signatory', fields: [
          ['Name', row.authorized_signatory_full_name],
          ['Title', row.authorized_signatory_title],
          ['Verified At', U.fmtTS(row.documents_verified_at)],
          ['Verified By', row.documents_verified_by],
          ['Verification Notes', row.documents_verification_notes],
          ['Invalidated Reason', row.documents_verification_invalidated_reason]
        ] },
        { title: 'Notes', html: `<div class="lead-details-notes">${U.escapeHtml(row.notes || 'No notes added yet.')}</div>` }
      ],
      actions: [
        Permissions.canCreate('leads') ? { label: 'Create Lead', variant: 'primary', permissionResource: 'leads', permissionAction: 'create', onClick: () => this.onAction('lead', id) } : null,
        (Permissions.canCreateContact?.() || Permissions.canCreate('contacts')) ? { label: 'Add Contact', variant: 'ghost', permissionResource: 'contacts', permissionAction: 'create', onClick: () => this.onAction('contacts', id) } : null,
        Permissions.canEdit('companies') ? { label: 'Edit', variant: 'ghost', permissionResource: 'companies', permissionAction: 'update', onClick: () => this.onAction('edit', id) } : null,
        Permissions.canDelete('companies') ? { label: 'Delete', variant: 'ghost', permissionResource: 'companies', permissionAction: 'delete', onClick: () => this.onAction('del', id) } : null
      ].filter(Boolean)
    });
    this.render();
  },
  updateSummaryMetrics(rows = this.state.rows) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const activeClients = sourceRows.filter(row => this.normalizeLifecycleStatus(row.company_status) === 'Active Client').length;
    const prospects = sourceRows.filter(row => this.normalizeLifecycleStatus(row.company_status) === 'Prospect').length;
    const verified = sourceRows.filter(row => this.getCompanyVerificationStatus(row) === 'verified').length;
    this.state.summary = {
      totalCompanies: Number(this.state.total || sourceRows.length) || 0,
      verified,
      activeClients,
      prospects
    };
  },
  async refreshSummaryMetricsForCurrentFilters() {
    const total = Number(this.state.total || 0) || 0;
    if (!total || total <= this.state.rows.length) {
      this.updateSummaryMetrics(this.state.rows);
      return;
    }
    const safeLimit = Math.min(total, 1000);
    try {
      const res = await Api.requestWithSession('companies', 'list', { page: 1, limit: safeLimit, search: this.state.search, filters: this.state.filters, sortBy: this.state.sortBy, sortDir: this.state.sortDir }, { requireAuth: true });
      const rows = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];
      this.updateSummaryMetrics(rows.map(r => this.normalize(r)));
    } catch (error) {
      console.warn('[companies] unable to refresh summary metrics, using current page rows', error);
      this.updateSummaryMetrics(this.state.rows);
    }
  },
  renderCompanySummaryCards() {
    const grid = document.getElementById('companySummaryGrid');
    if (!grid) return;
    const summary = this.state.summary || {};
    const cards = [
      { label: 'Total Companies', value: summary.totalCompanies || 0, icon: '▥', tone: 'violet' },
      { label: 'Verified', value: summary.verified || 0, icon: '✓', tone: 'green' },
      { label: 'Active Clients', value: summary.activeClients || 0, icon: '♙', tone: 'lime' },
      { label: 'Prospects', value: summary.prospects || 0, icon: '♙', tone: 'blue' }
    ];
    grid.innerHTML = cards.map(card => `
      <article class="company-summary-card company-summary-card--${U.escapeAttr(card.tone)}">
        <div class="company-summary-icon" aria-hidden="true">${U.escapeHtml(card.icon)}</div>
        <div>
          <span>${U.escapeHtml(card.label)}</span>
          <strong>${U.escapeHtml(card.value)}</strong>
        </div>
      </article>`).join('');
  },
  getCountryFlag(country = '') {
    const value = String(country || '').trim().toLowerCase();
    const flags = {
      lebanon: '🇱🇧', uae: '🇦🇪', 'united arab emirates': '🇦🇪', netherlands: '🇳🇱', france: '🇫🇷', jordan: '🇯🇴', 'saudi arabia': '🇸🇦', qatar: '🇶🇦', kuwait: '🇰🇼', oman: '🇴🇲', bahrain: '🇧🇭', egypt: '🇪🇬', turkey: '🇹🇷', 'united states': '🇺🇸', usa: '🇺🇸', 'united kingdom': '🇬🇧', uk: '🇬🇧'
    };
    return flags[value] || '';
  },
  renderCountryCell(country = '') {
    const clean = String(country || '').trim();
    if (!clean) return '—';
    const flag = this.getCountryFlag(clean);
    return `<span class="company-country-cell">${flag ? `<span aria-hidden="true">${flag}</span>` : ''}<span>${U.escapeHtml(clean)}</span></span>`;
  },
  renderCompanyActions(row, permissions = {}) {
    const id = U.escapeAttr(row.id || '');
    const items = [];
    if (permissions.canCreateLead) items.push(`<button type="button" data-a="lead" data-permission-resource="leads" data-permission-action="create" data-id="${id}">Create Lead</button>`);
    if (Permissions.canCreateContact?.() || Permissions.canCreate('contacts')) items.push(`<button type="button" class="js-create-contact" data-a="contacts" data-action="create-contact" data-contact-create="true" data-permission-resource="contacts" data-permission-action="create" data-id="${id}">Add Contact</button>`);
    if (permissions.canEdit) items.push(`<button type="button" data-a="edit" data-company-edit="${id}" data-permission-resource="companies" data-permission-action="update" data-id="${id}">Edit</button>`);
    if (permissions.canDelete) items.push(`<button type="button" class="danger" data-a="del" data-permission-resource="companies" data-permission-action="delete" data-id="${id}">Delete</button>`);
    return `
      <div class="company-row-actions">
        <button class="company-view-btn" type="button" data-a="view" data-id="${id}">View</button>
        <div class="company-actions-menu">
          <button class="company-more-btn" type="button" data-company-more="${id}" aria-label="More actions">⋮</button>
          <div class="company-actions-popover" role="menu">${items.join('') || '<span class="company-no-actions">No actions</span>'}</div>
        </div>
      </div>`;
  },
  renderCompanyPagination(start, end) {
    const pagination = document.getElementById('companyPagination');
    const footerInfo = document.getElementById('companyFooterInfo');
    const pageInfo = document.getElementById('companyPageInfo');
    const total = Number(this.state.total || 0) || 0;
    const totalPages = Math.max(1, Math.ceil(total / (Number(this.state.limit) || 50)));
    const current = Math.min(Math.max(1, Number(this.state.page) || 1), totalPages);
    const info = total ? `Showing ${start}-${end} of ${total} records` : 'Showing 0 records';
    if (pageInfo) pageInfo.textContent = info;
    if (footerInfo) footerInfo.textContent = info;
    if (!pagination) return;
    const pageNumbers = new Set([1, current - 1, current, current + 1, totalPages]);
    const pages = [...pageNumbers].filter(page => page >= 1 && page <= totalPages).sort((a, b) => a - b);
    const parts = [`<button type="button" class="company-page-btn" data-company-page="prev" ${current <= 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>`];
    let previous = 0;
    pages.forEach(page => {
      if (previous && page - previous > 1) parts.push('<span class="company-page-ellipsis">…</span>');
      parts.push(`<button type="button" class="company-page-btn ${page === current ? 'is-active' : ''}" data-company-page="${page}" ${page === current ? 'aria-current="page"' : ''}>${page}</button>`);
      previous = page;
    });
    parts.push(`<button type="button" class="company-page-btn" data-company-page="next" ${current >= totalPages ? 'disabled' : ''} aria-label="Next page">›</button>`);
    pagination.innerHTML = parts.join('');
    pagination.querySelectorAll('[data-company-page]').forEach(button => {
      button.onclick = () => {
        const value = button.getAttribute('data-company-page');
        let nextPage = current;
        if (value === 'prev') nextPage = current - 1;
        else if (value === 'next') nextPage = current + 1;
        else nextPage = Number(value) || current;
        nextPage = Math.min(Math.max(1, nextPage), totalPages);
        if (nextPage !== this.state.page) {
          this.state.page = nextPage;
          this.loadAndRefresh();
        }
      };
    });
  },
  bindCompanyActionMenuClose() {
    if (this._companyActionMenuBound) return;
    this._companyActionMenuBound = true;
    document.addEventListener('click', event => {
      if (event.target?.closest?.('.company-actions-menu')) return;
      document.querySelectorAll('.company-actions-menu.is-open').forEach(menu => menu.classList.remove('is-open'));
    });
  },
  async loadAndRefresh() {
    if (!Permissions.canView('companies')) return;
    await this.ensureControls();
    try {
      const res = await Api.requestWithSession('companies', 'list', { page: this.state.page, limit: this.state.limit, search: this.state.search, filters: this.state.filters, sortBy: this.state.sortBy, sortDir: this.state.sortDir }, { requireAuth: true });
      const rows = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];
      this.state.rows = rows.map(r => this.normalize(r));
      this.state.total = Number(res?.total ?? rows.length) || rows.length;
      await this.refreshSummaryMetricsForCurrentFilters();
      this.render();
      this.refreshVisibleCompanyLifecycleStatuses();
    } catch (e) { UI?.toast?.('Unable to load companies', 'error'); console.error(e); }
  },
  render() {
    const body = document.getElementById('companyTableBody'); if (!body) return;
    const canEdit = Permissions.canEdit('companies'), canDelete = Permissions.canDelete('companies'); const canCreateLead = Permissions.canCreate('leads');
    const permissions = { canEdit, canDelete, canCreateLead };
    this.renderCompanySummaryCards();
    window.TableUtils?.ensureHeaders?.('companies', body.closest('table'), this.tableColumns);
    const companyRows = window.TableUtils?.processRows ? window.TableUtils.processRows('companies', this.state.rows, this.columnMap) : this.state.rows;
    body.innerHTML = companyRows.map(r => {
      const selected = String(this.state.selectedDetailsId || '') === String(r.id || r.company_id || '');
      return `<tr class='entity-clickable-row company-row${selected ? ' is-selected' : ''}' tabindex='0' data-company-row='${U.escapeAttr(r.id || r.company_id || '')}' aria-label='Open company ${U.escapeAttr(r.company_name || r.company_id || '')} details'>
        <td class="company-id-cell">${U.escapeHtml(r.company_id || '—')}</td>
        <td>${this.renderCompanyVerificationBadge(r)}</td>
        <td class="company-name-cell">${U.escapeHtml(r.company_name || '—')}</td>
        <td>${U.escapeHtml(this.formatCompanyType(r.company_type) || '—')}</td>
        <td>${U.escapeHtml(this.formatCompanyIndustry(r.industry) || '—')}</td>
        <td>${this.renderLifecycleStatusBadge(r.company_status)}</td>
        <td>${U.escapeHtml(r.main_email || '—')}</td>
        <td>${U.escapeHtml(r.main_phone || '—')}</td>
        <td>${this.renderCountryCell(r.country)}</td>
        <td>${U.escapeHtml(r.city || '—')}</td>
        <td>${U.escapeHtml(U.fmtTS(r.created_at) || '—')}</td>
        <td>${this.renderCompanyActions(r, permissions)}</td>
      </tr>`;
    }).join('');
    body.querySelectorAll('[data-a]').forEach(button => button.onclick = event => { event?.stopPropagation?.(); this.onAction(button.dataset.a, button.dataset.id); });
    body.querySelectorAll('[data-company-more]').forEach(button => button.onclick = event => {
      event?.stopPropagation?.();
      const menu = button.closest('.company-actions-menu');
      const isOpen = menu?.classList.contains('is-open');
      document.querySelectorAll('.company-actions-menu.is-open').forEach(item => item.classList.remove('is-open'));
      if (menu && !isOpen) menu.classList.add('is-open');
    });
    body.querySelectorAll('tr[data-company-row]').forEach(tr => {
      tr.onclick = event => { if (event.target?.closest?.('.company-row-actions,button,a,input,select,textarea')) return; this.openDetailsDrawer(tr.getAttribute('data-company-row')); };
      tr.onkeydown = event => { if (!['Enter', ' '].includes(event.key)) return; event.preventDefault(); this.openDetailsDrawer(tr.getAttribute('data-company-row')); };
    });
    this.bindCompanyActionMenuClose();
    const start = this.state.total ? ((this.state.page - 1) * this.state.limit) + 1 : 0;
    const end = Math.min(this.state.page * this.state.limit, this.state.total);
    this.renderCompanyPagination(start, end);
    applyPermissionVisibility(body);
    const canCreateCompany = Permissions.can('companies','create') || Permissions.can('companies','manage'); const canExportCompany = Permissions.can('companies','export') || Permissions.can('companies','manage'); const createBtn = document.getElementById('companyCreateBtn'); if (createBtn) { createBtn.style.display = canCreateCompany ? '' : 'none'; createBtn.onclick = () => this.openForm(); } const exportBtn = document.getElementById('companyExportBtn'); if (exportBtn) { exportBtn.style.display = canExportCompany ? '' : 'none'; exportBtn.disabled = !canExportCompany; }
  },
  async onAction(a, id) {
    const target = String(id || '').trim();
    const row = this.state.rows.find(x => [x.id, x.company_id, x.company_name].some(value => String(value || '').trim() === target));
    if (!row) return;

    if (a === 'view') {
      this.openDetailsDrawer(row);
      return;
    }

    if (a === 'edit') {
      this.openForm(row);
      return;
    }

    if (a === 'del') {
      if (!Permissions.canDelete('companies')) {
        UI?.toast?.('You do not have permission for this action.');
        return;
      }
      if (!confirm('Delete company?')) return;
      try {
        await Api.requestWithSession('companies', 'delete', { id: row.id }, { requireAuth: true });
        await this.loadAndRefresh();
      } catch (e) {
        UI?.toast?.('Unable to delete company', 'error');
        console.error(e);
      }
      return;
    }

    if (a === 'contacts') {
      if (!(Permissions.canCreateContact?.() || Permissions.canCreate('contacts'))) {
        UI?.toast?.('You do not have permission to create contacts.', 'warning');
        return;
      }

      const companyUuid = String(row.id || row.company_uuid || row.companyUuid || '').trim();
      const contactCompany = {
        id: companyUuid,
        company_uuid: companyUuid,
        company_id: companyUuid,
        company_name: row.company_name || row.legal_name || '',
        company_ids: companyUuid ? [companyUuid] : [],
        company_names: row.company_name || row.legal_name || companyUuid || ''
      };

      try {
        window.Contacts?.setCompanyFilter?.(contactCompany.company_id, contactCompany.company_name);
        if (typeof window.setActiveView === 'function') {
          window.setActiveView('contacts');
        } else {
          document.getElementById('contactsTab')?.click?.();
        }
        if (typeof window.Contacts?.openCreateForCompany === 'function') {
          await window.Contacts.openCreateForCompany(contactCompany);
        } else if (typeof window.Contacts?.openForm === 'function') {
          await window.Contacts.openForm(contactCompany, false);
        } else {
          UI?.toast?.('Contacts module is not ready. Please open Contacts and try again.', 'error');
        }
      } catch (e) {
        UI?.toast?.('Unable to open contact form', 'error');
        console.error(e);
      }
      return;
    }

    if (a === 'lead') {
      if (!Permissions.can('leads', 'create')) {
        UI.toast?.('You do not have permission to create leads.');
        return;
      }
      if (!Permissions.canCreate('leads')) {
        UI?.toast?.('You do not have permission for this action.');
        return;
      }
      const company = { ...row };
      try {
        const contactRes = await Api.requestWithSession('contacts', 'list', { page: 1, limit: 1, filters: { company_id: row.company_id, is_primary_contact: 'primary' }, sortBy: 'created_at', sortDir: 'desc' }, { requireAuth: true });
        const primary = Array.isArray(contactRes?.rows) ? contactRes.rows[0] : null;
        window.Leads?.openLeadCreateFormWithPrefill?.({ company, contact: primary || null });
      } catch (_) {
        window.Leads?.openLeadCreateFormWithPrefill?.({ company, contact: null });
      }
      return;
    }
  },


  normalizeLifecycleStatus(status = '') {
    const value = String(status || '').trim().toLowerCase();
    return COMPANY_LIFECYCLE_STATUSES.find(item => item.toLowerCase() === value) || 'Prospect';
  },
  getLifecycleRank(status = '') { return COMPANY_LIFECYCLE_RANK[this.normalizeLifecycleStatus(status)] ?? 0; },
  maxLifecycleStatus(...statuses) {
    return statuses.map(status => this.normalizeLifecycleStatus(status)).reduce((best, status) => this.getLifecycleRank(status) > this.getLifecycleRank(best) ? status : best, 'Prospect');
  },
  renderLifecycleStatusBadge(status = '') {
    const normalized = this.normalizeLifecycleStatus(status);
    const colors = {
      Prospect: ['#64748b', 'rgba(100,116,139,.10)'], Lead: ['#2563eb', 'rgba(37,99,235,.10)'], Deal: ['#7c3aed', 'rgba(124,58,237,.10)'], Proposal: ['#0891b2', 'rgba(8,145,178,.10)'], Agreement: ['#d97706', 'rgba(217,119,6,.12)'], Signed: ['#16a34a', 'rgba(22,163,74,.10)'], Onboarding: ['#ea580c', 'rgba(234,88,12,.12)'], 'Active Client': ['#15803d', 'rgba(21,128,61,.12)']
    };
    const [color, background] = colors[normalized] || colors.Prospect;
    return `<span class="chip" style="border-color:${color};color:${color};background:${background};">${U.escapeHtml(normalized)}</span>`;
  },
  isAgreementSigned(agreement = {}) {
    const status = String(agreement.status || '').trim().toLowerCase();
    return status.includes('signed') || Boolean(String(agreement.signed_date || agreement.customer_sign_date || '').trim());
  },
  isOnboardingCompleted(row = {}) {
    return String(row.onboarding_status || row.status || '').trim().toLowerCase().includes('complete');
  },
  isActiveClient(row = {}) {
    const status = String(row.status || row.account_status || '').trim().toLowerCase();
    return !status || ['active', 'live'].some(token => status.includes(token));
  },
  buildCompanyMatch(company = {}) {
    const normalized = this.normalize(company);
    const legalName = String(normalized.legal_name || normalized.legal_company_name || '').trim();
    return {
      id: String(normalized.id || '').trim(),
      company_id: String(normalized.company_id || '').trim(),
      legal_name: legalName,
      company_name: String(normalized.company_name || '').trim(),
      names: [legalName, normalized.company_name].map(v => String(v || '').trim()).filter(Boolean)
    };
  },
  async fetchCompanyForLifecycle(companyIdOrRecord) {
    if (companyIdOrRecord && typeof companyIdOrRecord === 'object') return this.normalize(companyIdOrRecord);
    const id = String(companyIdOrRecord || '').trim(); if (!id) return null;
    const client = this.getSupabaseClient();
    let query = client.from('companies').select('*').limit(1);
    query = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? query.eq('id', id) : query.eq('company_id', id);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data ? this.normalize(data) : null;
  },
  async listLifecycleRows(table, company = {}, options = {}) {
    const match = this.buildCompanyMatch(company); const client = this.getSupabaseClient();
    let query = client.from(table).select('*').limit(options.limit || 500);
    if (options.companyIdOnly !== false && match.company_id) query = query.eq('company_id', match.company_id);
    else if (options.nameColumn && match.names.length) query = query.in(options.nameColumn, match.names);
    else return [];
    const { data, error } = await query;
    if (error) { console.error(`[companies] lifecycle ${table} query failed`, error); return []; }
    return Array.isArray(data) ? data : [];
  },
  async getRelatedLifecycleRecords(company = {}) {
    const match = this.buildCompanyMatch(company);
    const [leads, deals, proposals, agreements, clientsByCompanyName, clientsByClientName] = await Promise.all([
      this.listLifecycleRows('leads', company),
      this.listLifecycleRows('deals', company),
      this.listLifecycleRows('proposals', company),
      this.listLifecycleRows('agreements', company),
      this.listLifecycleRows('clients', company, { companyIdOnly: false, nameColumn: 'company_name' }),
      this.listLifecycleRows('clients', company, { companyIdOnly: false, nameColumn: 'client_name' })
    ]);
    const agreementIds = agreements.map(row => String(row.id || row.agreement_id || '').trim()).filter(Boolean);
    let onboarding = [];
    if (agreementIds.length) {
      const { data, error } = await this.getSupabaseClient().from('operations_onboarding').select('*').in('agreement_id', agreementIds).limit(500);
      if (error) console.error('[companies] lifecycle operations_onboarding query failed', error);
      else onboarding = Array.isArray(data) ? data : [];
    }
    if (!onboarding.length && match.names.length) {
      const { data, error } = await this.getSupabaseClient().from('operations_onboarding').select('*').in('client_name', match.names).limit(500);
      if (!error && Array.isArray(data)) onboarding = data;
    }
    return { leads, deals, proposals, agreements, onboarding, clients: [...clientsByCompanyName, ...clientsByClientName] };
  },
  getCompanyLifecycleStage(company = {}, relatedRecords = {}) {
    let status = 'Prospect';
    if ((relatedRecords.leads || []).length) status = this.maxLifecycleStatus(status, 'Lead');
    if ((relatedRecords.deals || []).length) status = this.maxLifecycleStatus(status, 'Deal');
    if ((relatedRecords.proposals || []).length) status = this.maxLifecycleStatus(status, 'Proposal');
    const agreements = relatedRecords.agreements || [];
    if (agreements.length) status = this.maxLifecycleStatus(status, agreements.some(a => this.isAgreementSigned(a)) ? 'Signed' : 'Agreement');
    const onboarding = relatedRecords.onboarding || [];
    if (onboarding.length) status = this.maxLifecycleStatus(status, onboarding.some(row => this.isOnboardingCompleted(row)) ? 'Active Client' : 'Onboarding');
    if ((relatedRecords.clients || []).some(row => this.isActiveClient(row))) status = 'Active Client';
    return status;
  },
  async recalculateCompanyLifecycleStatus(company) {
    const normalized = this.normalize(company || {});
    const relatedRecords = await this.getRelatedLifecycleRecords(normalized);
    return this.getCompanyLifecycleStage(normalized, relatedRecords);
  },
  async syncCompanyLifecycleStatus(company, options = {}) {
    const normalized = await this.fetchCompanyForLifecycle(company);
    if (!normalized?.id) return null;
    const calculatedStatus = options.stage ? this.maxLifecycleStatus(normalized.company_status, options.stage) : await this.recalculateCompanyLifecycleStatus(normalized);
    if (String(normalized.company_status || '').trim().toLowerCase() === calculatedStatus.toLowerCase()) return normalized;
    const payload = { company_status: calculatedStatus };
    const { data, error } = await this.getSupabaseClient().from('companies').update(payload).eq('id', normalized.id).select('*').single();
    if (error) throw error;
    const updated = this.normalize(data || { ...normalized, ...payload });
    this.state.rows = this.state.rows.map(row => String(row.id) === String(updated.id) ? updated : row);
    if (String(this.state.currentCompany?.id || '') === String(updated.id)) this.state.currentCompany = updated;
    this.render();
    return updated;
  },
  async refreshCompanyLifecycleStatus(companyIdOrRecord, options = {}) {
    return this.syncCompanyLifecycleStatus(companyIdOrRecord, options.fullRecalculation ? {} : options);
  },
  async refreshCompanyLifecycleStatusByBusinessId(companyId, options = {}) {
    const id = String(companyId || '').trim(); if (!id) return null;
    return this.refreshCompanyLifecycleStatus(id, options);
  },
  async refreshCompanyLifecycleStatusByName(name, options = {}) {
    const value = String(name || '').trim(); if (!value) return null;
    const client = this.getSupabaseClient();
    let { data, error } = await client.from('companies').select('*').eq('legal_name', value).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) {
      const result = await client.from('companies').select('*').eq('company_name', value).limit(1).maybeSingle();
      if (result.error) throw result.error;
      data = result.data;
    }
    return data ? this.refreshCompanyLifecycleStatus(data, options) : null;
  },
  refreshVisibleCompanyLifecycleStatuses() {
    const rows = [...this.state.rows];
    rows.forEach(row => {
      this.recalculateCompanyLifecycleStatus(row).then(status => {
        if (String(row.company_status || '').trim().toLowerCase() !== status.toLowerCase()) return this.syncCompanyLifecycleStatus(row, { stage: status });
        return null;
      }).catch(error => console.error('[companies] lifecycle visible refresh failed', error));
    });
  },

  getCompanyVerificationStatus(company = {}) {
    const verified = window.CompanyVerification?.getCompanyVerificationStatus?.(company, this.state.documents);
    const signatory = window.CompanyVerification?.getCompanyAuthorizedSignatory?.(company) || {};
    if (verified && signatory.name && signatory.title) return 'verified';
    return String(company?.documents_verification_status || company?.documentsVerificationStatus || 'not_verified').trim().toLowerCase() === 'verified' ? 'not_verified' : String(company?.documents_verification_status || company?.documentsVerificationStatus || 'not_verified').trim().toLowerCase();
  },
  formatCompanyVerificationStatus(company = {}) {
    const status = this.getCompanyVerificationStatus(company);
    if (status === 'verified') return 'Verified';
    if (status === 'needs_reverification') return 'Needs re-verification';
    return 'Not verified';
  },
  renderCompanyVerificationBadge(company = {}) {
    const status = this.getCompanyVerificationStatus(company);
    if (status === 'verified') return `<span class="chip" style="border-color:#16a34a;color:#15803d;background:rgba(22,163,74,.1);">✓ Verified</span>`;
    if (status === 'needs_reverification') return `<span class="chip" style="border-color:#f59e0b;color:#b45309;background:rgba(245,158,11,.12);">⚠ Needs re-verification</span>`;
    return `<span class="chip">Not verified</span>`;
  },
  renderCompanyVerificationPanel(company = this.state.currentCompany) {
    const panel = document.getElementById('companyVerificationPanel'); if (!panel) return;
    if (!company?.id) { panel.style.display = 'none'; panel.innerHTML = ''; return; }
    panel.style.display = '';
    const normalized = this.normalize(company);
    const status = this.getCompanyVerificationStatus(normalized);
    const docs = Array.isArray(this.state.documents) ? this.state.documents : [];
    const canVerify = this.canVerifyCompany();
    const actionLabel = status === 'verified' ? 'Mark as Not Verified' : status === 'needs_reverification' ? 'Re-verify Company' : 'Mark as Verified';
    const noDocsMessage = '<p class="muted" style="margin:6px 0 0;">Upload at least one company document before verifying.</p>';
    const verificationAction = canVerify
      ? (docs.length ? `<button type="button" id="companyVerifyBtn" class="btn ghost sm">${U.escapeHtml(actionLabel)}</button>` : noDocsMessage)
      : '<p class="muted" style="margin:6px 0 0;">You do not have permission to verify company data.</p>';
    panel.innerHTML = `<div class="row between center" style="gap:10px;flex-wrap:wrap;"><div><strong>Company Verification</strong><p class="muted" style="margin:6px 0 0;">An authorized user must compare the uploaded company documents with the filled company fields before marking this company as verified.</p></div>${this.renderCompanyVerificationBadge(normalized)}</div><div class="stack" style="gap:6px;"><div><span class="muted">Current verification status:</span> ${this.renderCompanyVerificationBadge(normalized)}</div>${normalized.documents_verified_at ? `<div><span class="muted">Last verified:</span> ${U.escapeHtml(U.fmtTS(normalized.documents_verified_at))}</div>` : ''}${normalized.documents_verification_notes ? `<div><span class="muted">Verification notes:</span> ${U.escapeHtml(normalized.documents_verification_notes)}</div>` : ''}${status === 'needs_reverification' && normalized.documents_verification_invalidated_reason ? `<div><span class="muted">Invalidated reason:</span> ${U.escapeHtml(normalized.documents_verification_invalidated_reason)}</div>` : ''}${verificationAction}</div>`;
    const btn = document.getElementById('companyVerifyBtn');
    if (btn) btn.onclick = () => {
      if (status === 'verified') this.unverifyCompanyDocuments(normalized).catch(error => { UI?.toast?.(error?.message || 'Unable to update company verification', 'error'); console.error(error); });
      else this.openCompanyVerificationDialog(normalized);
    };
  },
  canVerifyCompany(currentUser = this.currentUser || this.state?.currentUser || window.AppState?.currentUser || window.currentUser || window.Session?.authContext?.()?.profile || {}) {
    return canVerifyCompany(currentUser);
  },
  canVerifyCompanyDocuments() { return this.canVerifyCompany(); },
  getCurrentUserId() { return String(Session?.userId?.() || Session?.authContext?.()?.user?.id || Session?.authContext?.()?.profile?.id || Session?.user?.()?.user_id || '').trim(); },
  getFormVerificationCompany(company = this.state.currentCompany) {
    const value = id => document.getElementById(id)?.value?.trim?.() || '';
    return this.normalize({ ...(company || {}), company_name: value('companyNameInput') || company?.company_name, legal_name: value('companyLegalNameInput') || company?.legal_name, authorized_signatory_full_name: value('companyAuthorizedSignatoryFullNameInput') || company?.authorized_signatory_full_name, authorized_signatory_title: value('companyAuthorizedSignatoryTitleInput') || company?.authorized_signatory_title, registration_number: value('companyRegistrationNumberInput') || company?.registration_number, country: value('companyCountryInput') || company?.country, city: value('companyCityInput') || company?.city, address: value('companyAddressInput') || company?.address, tax_number: value('companyTaxNumberInput') || company?.tax_number });
  },
  buildCompanyVerificationSnapshot(company = this.state.currentCompany) {
    const c = this.getFormVerificationCompany(company);
    return { company_id: c.company_id || null, company_name: c.company_name || null, legal_name: c.legal_name || null, legal_company_name: c.legal_company_name || null, registration_number: c.registration_number || null, tax_number: c.tax_number || null, vat_number: c.vat_number || null, authorized_signatory_full_name: c.authorized_signatory_full_name || null, authorized_signatory_title: c.authorized_signatory_title || null, country: c.country || null, state: c.state || null, city: c.city || null, address: c.address || null };
  },
  ensureCompanyVerificationDialog() {
    let modal = document.getElementById('companyVerificationDialog');
    if (modal) return modal;
    document.body.insertAdjacentHTML('beforeend', `<div id="companyVerificationDialog" class="modal company-verification-modal company-verification-modal-backdrop company-verification-backdrop" role="dialog" aria-modal="true" aria-hidden="true"><div class="modal-content" style="max-width:820px;"><div class="modal-header"><h2 style="margin:0;font-size:20px">Confirm Company Verification</h2><button class="modal-close" id="companyVerificationCloseBtn" aria-label="Close verification dialog">✕</button></div><div id="companyVerificationDialogBody" class="stack" style="gap:12px;margin-top:12px;"></div><div class="actions" style="justify-content:flex-end;gap:8px;margin-top:12px;"><button id="companyVerificationCancelBtn" type="button" class="btn ghost">Cancel</button><button id="companyVerificationConfirmBtn" type="button" class="btn" disabled>Confirm Verified</button></div></div></div>`);
    modal = document.getElementById('companyVerificationDialog');
    document.getElementById('companyVerificationCloseBtn').onclick = () => this.closeCompanyVerificationDialog();
    document.getElementById('companyVerificationCancelBtn').onclick = () => this.closeCompanyVerificationDialog();
    modal.addEventListener('click', e => { if (e.target?.id === 'companyVerificationDialog') { e.stopPropagation(); this.closeCompanyVerificationDialog(); } });
    return modal;
  },
  openCompanyVerificationDialog(company = this.state.currentCompany) {
    if (!this.canVerifyCompany()) { UI?.toast?.('You do not have permission to verify companies.', 'error'); return; }
    if (!Array.isArray(this.state.documents) || !this.state.documents.length) { UI?.toast?.('Upload at least one company document before verifying', 'error'); return; }
    const modal = this.ensureCompanyVerificationDialog(); const body = document.getElementById('companyVerificationDialogBody'); const snapshot = this.buildCompanyVerificationSnapshot(company);
    const fields = [['Company Name', snapshot.company_name], ['Legal Name', snapshot.legal_name || snapshot.legal_company_name], ['Registration Number', snapshot.registration_number], ['Tax/VAT Number', [snapshot.tax_number, snapshot.vat_number].filter(Boolean).join(' / ')], ['Authorized Signatory Full Name', snapshot.authorized_signatory_full_name], ['Authorized Signatory Title', snapshot.authorized_signatory_title], ['Country/City/Address', [snapshot.country, snapshot.city, snapshot.address].filter(Boolean).join(' / ')]];
    body.innerHTML = `<p class="muted">Review each item below against the uploaded documents. This is a manual verification workflow; no OCR or automatic document reading is performed.</p><div class="card"><strong>Checklist</strong><ul>${fields.map(([label, value]) => `<li>☐ <strong>${U.escapeHtml(label)}:</strong> ${U.escapeHtml(value || '—')}</li>`).join('')}</ul></div><div class="card"><strong>Uploaded Documents</strong><div class="stack" style="gap:6px;margin-top:8px;">${this.state.documents.map(doc => `<div class="row between center" style="gap:8px;flex-wrap:wrap;"><span>${U.escapeHtml(doc.document_title || doc.file_name || 'Document')}</span><button type="button" class="chip-btn" data-verify-doc-open="${U.escapeAttr(doc.id)}">Open/View</button></div>`).join('')}</div></div><div class="filter-row"><label class="muted" for="companyVerificationNotesInput">Verification notes (optional)</label><textarea id="companyVerificationNotesInput" class="input" rows="3">${U.escapeHtml(company?.documents_verification_notes || '')}</textarea></div><label class="row" style="gap:8px;align-items:flex-start;"><input id="companyVerificationConfirmCheck" type="checkbox" style="margin-top:3px;" /> <span>I confirm that I compared the uploaded company documents with the company data and they match.</span></label>`;
    body.querySelectorAll('[data-verify-doc-open]').forEach(btn => btn.onclick = () => this.openCompanyDocument(btn.dataset.verifyDocOpen));
    const confirmBtn = document.getElementById('companyVerificationConfirmBtn'); const checkbox = document.getElementById('companyVerificationConfirmCheck');
    confirmBtn.disabled = true; checkbox.onchange = () => { confirmBtn.disabled = !checkbox.checked; };
    confirmBtn.onclick = () => this.verifyCompanyDocuments(company, document.getElementById('companyVerificationNotesInput')?.value || '').catch(error => { UI?.toast?.(error?.message || 'Unable to verify company', 'error'); console.error(error); });
    modal.style.display = 'flex'; modal.setAttribute('aria-hidden', 'false'); this.updateCompanyModalBodyLock();
  },
  isCompanyModalOpen() { const modal = document.getElementById('companyModal'); return Boolean(modal && modal.getAttribute('aria-hidden') === 'false' && modal.style.display !== 'none'); },
  isCompanyVerificationDialogOpen() { const modal = document.getElementById('companyVerificationDialog'); return Boolean(modal && modal.getAttribute('aria-hidden') === 'false' && modal.style.display !== 'none'); },
  updateCompanyModalBodyLock() { document.body.classList.toggle('modal-open', this.isCompanyModalOpen() || this.isCompanyVerificationDialogOpen()); },
  handleCompanyModalKeydown(event) { if (event.key !== 'Escape') return; if (this.isCompanyVerificationDialogOpen()) { event.preventDefault(); event.stopImmediatePropagation(); this.closeCompanyVerificationDialog(); return; } if (this.isCompanyModalOpen()) { event.preventDefault(); event.stopImmediatePropagation(); this.closeForm(); } },
  closeCompanyVerificationDialog() { const modal = document.getElementById('companyVerificationDialog'); if (modal) { modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); } this.updateCompanyModalBodyLock(); },
  async verifyCompanyDocuments(company = this.state.currentCompany, notes = '') {
    if (!this.canVerifyCompany()) {
      throw new Error('You do not have permission to verify companies.');
    }
    if (!company?.id || !Array.isArray(this.state.documents) || !this.state.documents.length) { UI?.toast?.('Upload at least one company document before verifying', 'error'); return; }
    const confirmBtn = document.getElementById('companyVerificationConfirmBtn'); if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Verifying…'; }
    const previousStatus = String(company.documents_verification_status || 'not_verified').trim() || 'not_verified';
    const verifiedAt = new Date().toISOString(); const verifiedBy = this.getCurrentUserId(); const snapshot = this.buildCompanyVerificationSnapshot(company); const verificationNotes = String(notes || '').trim() || null;
    const resolvedSignatory = window.CompanyVerification?.getCompanyAuthorizedSignatory?.(this.getFormVerificationCompany(company)) || {};
    const payload = { documents_verified: true, documents_verification_status: 'verified', documents_verified_at: verifiedAt, documents_verified_by: verifiedBy || null, documents_verification_notes: verificationNotes, documents_verification_invalidated_at: null, documents_verification_invalidated_reason: null, documents_verified_snapshot: snapshot, is_verified: true, verified: true, company_verified: true, authorized_signatory_verified: true, verification_status: 'verified', authorized_signatory_name: resolvedSignatory.name || snapshot.authorized_signatory_full_name || null, authorized_signatory_title: resolvedSignatory.title || snapshot.authorized_signatory_title || null };
    try {
      const data = await Api.requestWithSession('companies', 'verify', { id: company.id, updates: payload }, { requireAuth: true });
      const client = this.getSupabaseClient();
      const { error: auditError } = await client.from('company_verification_audit').insert({ company_uuid: company.id, action: 'marked_verified', previous_status: previousStatus, new_status: 'verified', verified_by: verifiedBy || null, verification_notes: verificationNotes, verification_snapshot: snapshot });
      if (auditError) throw auditError;
      this.state.currentCompany = this.normalize(data || { ...company, ...payload });
      this.closeCompanyVerificationDialog();
      UI?.toast?.('Company data verified', 'success');
      await this.refreshCompanyVerificationState(company.id);
      await this.loadAndRefresh();
    } catch (error) { UI?.toast?.('Unable to verify company data', 'error'); console.error(error); }
    finally { if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Verified'; } }
  },
  async unverifyCompanyDocuments(company = this.state.currentCompany) {
    if (!this.canVerifyCompany()) {
      throw new Error('You do not have permission to verify companies.');
    }
    if (!company?.id) return;
    const previousStatus = String(company.documents_verification_status || 'verified').trim() || 'verified';
    const payload = {
      documents_verified: false,
      documents_verification_status: 'not_verified',
      documents_verified_at: null,
      documents_verified_by: null,
      documents_verification_notes: null,
      documents_verification_invalidated_at: null,
      documents_verification_invalidated_reason: null,
      documents_verified_snapshot: null,
      is_verified: false,
      verified: false,
      company_verified: false,
      authorized_signatory_verified: false,
      verification_status: 'not_verified'
    };
    try {
      const data = await Api.requestWithSession('companies', 'verify_company', { id: company.id, updates: payload }, { requireAuth: true });
      const client = this.getSupabaseClient();
      const { error: auditError } = await client.from('company_verification_audit').insert({ company_uuid: company.id, action: 'marked_not_verified', previous_status: previousStatus, new_status: 'not_verified', verified_by: this.getCurrentUserId() || null, verification_notes: null, verification_snapshot: null });
      if (auditError) throw auditError;
      this.state.currentCompany = this.normalize(data || { ...company, ...payload });
      UI?.toast?.('Company verification removed', 'success');
      await this.refreshCompanyVerificationState(company.id);
      await this.loadAndRefresh();
    } catch (error) { UI?.toast?.('Unable to update company verification', 'error'); console.error(error); throw error; }
  },
  async refreshCompanyDocuments(companyId) { if (!companyId) return; await this.loadCompanyDocuments({ ...(this.state.currentCompany || {}), id: companyId }); },
  async refreshCompanyVerificationState(companyId) {
    if (!companyId) return null;
    try {
      const data = await window.CrmCompanyContactSelectors?.loadCompanySafe?.(companyId);
      if (!data) throw new Error('Selected company could not be resolved. Please reselect the company.');
      const normalized = this.normalize(data || {}); this.state.currentCompany = normalized;
      this.state.rows = this.state.rows.map(row => String(row.id) === String(companyId) ? normalized : row);
      this.renderCompanyVerificationPanel(normalized); this.render();
      return normalized;
    } catch (error) { UI?.toast?.('Unable to load company verification status', 'error'); console.error(error); return null; }
  },

  canManageDocuments() { return Permissions.canEdit('companies') || Permissions.can('companies', 'manage'); },
  canViewDocuments() { return Permissions.canView('companies'); },
  getSupabaseClient() { const client = window.SupabaseClient?.getClient?.(); if (!client) throw new Error('Supabase client is not available.'); return client; },
  sanitizeDocumentFileName(name = '') { return String(name || 'document').trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 140) || 'document'; },
  validateCompanyDocumentFile(file) {
    if (!file) { UI?.toast?.('Please choose a company document to upload.', 'error'); return false; }
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) { UI?.toast?.('Company document must be 20MB or smaller.', 'error'); return false; }
    const ext = String(file.name || '').split('.').pop()?.toLowerCase() || '';
    const allowedExts = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'doc', 'docx', 'xls', 'xlsx']);
    const allowedTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
    if (!allowedExts.has(ext) || (file.type && !allowedTypes.has(file.type))) { UI?.toast?.('Unsupported company document type. Upload PDF, PNG, JPEG, WebP, DOC, DOCX, XLS, or XLSX files.', 'error'); return false; }
    return true;
  },
  renderCompanyDocumentsSection(company = null) {
    const section = document.getElementById('companyDocumentsSection'); if (!section) return;
    const isEdit = Boolean(company?.id), canManage = this.canManageDocuments(), canView = this.canViewDocuments();
    section.style.display = '';
    const uploadControls = document.getElementById('companyDocumentUploadControls');
    const createNote = document.getElementById('companyDocumentsCreateNote');
    const list = document.getElementById('companyDocumentsList');
    if (createNote) createNote.style.display = isEdit ? 'none' : '';
    if (uploadControls) uploadControls.style.display = isEdit && canManage ? '' : 'none';
    if (list) {
      list.style.display = isEdit && canView ? '' : 'none';
      if (!isEdit) list.innerHTML = '';
      else if (!canView) list.innerHTML = '<p class="muted">You do not have permission to view company documents.</p>';
      else list.innerHTML = '<p class="muted">Loading company documents…</p>';
    }
    const titleInput = document.getElementById('companyDocumentTitleInput'); if (titleInput) titleInput.value = '';
    const fileInput = document.getElementById('companyDocumentFileInput'); if (fileInput) fileInput.value = '';
  },
  renderCompanyDocumentsList() {
    const list = document.getElementById('companyDocumentsList'); if (!list || !this.canViewDocuments()) return;
    const docs = Array.isArray(this.state.documents) ? this.state.documents : [];
    if (!docs.length) { list.innerHTML = '<p class="muted">No company documents uploaded yet.</p>'; return; }
    const canManage = this.canManageDocuments();
    list.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Title</th><th>File</th><th>Uploaded</th><th>Actions</th></tr></thead><tbody>${docs.map(doc => `<tr><td>${U.escapeHtml(doc.document_title || '—')}</td><td>${U.escapeHtml(doc.file_name || '')}</td><td>${U.escapeHtml(U.fmtTS(doc.uploaded_at || doc.created_at || ''))}</td><td><button type="button" class="chip-btn" data-doc-open="${U.escapeAttr(doc.id)}">Open/View</button>${canManage ? ` <button type="button" class="chip-btn" data-doc-delete="${U.escapeAttr(doc.id)}">Delete</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    list.querySelectorAll('[data-doc-open]').forEach(btn => btn.onclick = () => this.openCompanyDocument(btn.dataset.docOpen));
    list.querySelectorAll('[data-doc-delete]').forEach(btn => btn.onclick = () => this.deleteCompanyDocument(btn.dataset.docDelete));
  },
  async loadCompanyDocuments(company = this.state.currentCompany) {
    if (!company?.id || !this.canViewDocuments()) return;
    try {
      const client = this.getSupabaseClient();
      const { data, error } = await client.from('company_documents').select('*').eq('company_uuid', company.id).order('uploaded_at', { ascending: false });
      if (error) throw error;
      this.state.documents = Array.isArray(data) ? data : [];
      this.renderCompanyDocumentsList();
      this.renderCompanyVerificationPanel(this.state.currentCompany);
    } catch (error) { UI?.toast?.('Unable to load company documents', 'error'); console.error(error); const list = document.getElementById('companyDocumentsList'); if (list) list.innerHTML = '<p class="muted">Unable to load company documents.</p>'; }
  },
  async uploadCompanyDocument() {
    const company = this.state.currentCompany;
    if (!company?.id) { UI?.toast?.('Save the company first before uploading documents.', 'error'); return; }
    if (!this.canManageDocuments()) { UI?.toast?.('You do not have permission for this action.'); return; }
    const fileInput = document.getElementById('companyDocumentFileInput'); const titleInput = document.getElementById('companyDocumentTitleInput');
    const file = fileInput?.files?.[0]; if (!this.validateCompanyDocumentFile(file)) return;
    const button = document.getElementById('companyDocumentUploadBtn'); if (button) { button.disabled = true; button.textContent = 'Uploading…'; }
    try {
      const client = this.getSupabaseClient();
      const safeName = this.sanitizeDocumentFileName(file.name);
      const filePath = `${company.id}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await client.storage.from('company-documents').upload(filePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (uploadError) throw uploadError;
      const { error: insertError } = await client.from('company_documents').insert({ company_uuid: company.id, company_id: company.company_id, company_name: company.company_name, document_title: titleInput?.value?.trim() || null, file_name: file.name, file_path: filePath, file_mime_type: file.type || null, file_size_bytes: file.size });
      if (insertError) throw insertError;
      if (titleInput) titleInput.value = ''; if (fileInput) fileInput.value = '';
      await this.loadCompanyDocuments(company);
      await this.refreshCompanyVerificationState(company.id);
      UI?.toast?.('Company document uploaded', 'success');
    } catch (error) { UI?.toast?.('Unable to upload company document', 'error'); console.error(error); }
    finally { if (button) { button.disabled = false; button.textContent = 'Upload Document'; } }
  },
  async openCompanyDocument(documentId) {
    if (!this.canViewDocuments()) { UI?.toast?.('You do not have permission for this action.'); return; }
    const doc = this.state.documents.find(item => String(item.id) === String(documentId)); if (!doc?.file_path) return;
    try {
      const client = this.getSupabaseClient();
      const { data, error } = await client.storage.from('company-documents').createSignedUrl(doc.file_path, 60 * 10);
      if (error) throw error;
      if (!data?.signedUrl) throw new Error('Supabase did not return a signed URL.');
      window.open(data.signedUrl, '_blank', 'noopener');
    } catch (error) { UI?.toast?.('Unable to load company documents', 'error'); console.error(error); }
  },
  async deleteCompanyDocument(documentId) {
    if (!this.canManageDocuments()) { UI?.toast?.('You do not have permission for this action.'); return; }
    const doc = this.state.documents.find(item => String(item.id) === String(documentId)); if (!doc) return;
    if (!confirm('Delete company document?')) return;
    try {
      const client = this.getSupabaseClient();
      if (doc.file_path) { const { error: storageError } = await client.storage.from('company-documents').remove([doc.file_path]); if (storageError) throw storageError; }
      const { error: deleteError } = await client.from('company_documents').delete().eq('id', doc.id);
      if (deleteError) throw deleteError;
      await this.loadCompanyDocuments(this.state.currentCompany);
      await this.refreshCompanyVerificationState(this.state.currentCompany?.id);
      UI?.toast?.('Company document deleted', 'success');
    } catch (error) { UI?.toast?.('Unable to delete company document', 'error'); console.error(error); }
  },
  exportCsv() {
    if (!(Permissions.can('companies', 'export') || Permissions.can('companies', 'manage'))) { UI?.toast?.('You do not have permission for this action.'); return; }
    const columns = [
      ['Company ID', r => r.company_id],
      ['Verification Status', r => this.formatCompanyVerificationStatus(r)],
      ['Company Name', r => r.company_name],
      ['Company Type', r => this.formatCompanyType(r.company_type)],
      ['Industry', r => this.formatCompanyIndustry(r.industry)],
      ['Status', r => this.normalizeLifecycleStatus(r.company_status)],
      ['Main Email', r => r.main_email],
      ['Main Phone', r => r.main_phone],
      ['Country', r => r.country],
      ['City', r => r.city]
    ];
    const escapeCsv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [columns.map(([header]) => escapeCsv(header)).join(',')].concat(this.state.rows.map(r => columns.map(([, getValue]) => escapeCsv(getValue(r))).join(','))).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'companies.csv'; a.click();
  }
}; window.Companies = Companies;
