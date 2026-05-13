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

const Companies = {
  state: { rows: [], page: 1, limit: 50, total: 0, search: '', filters: { company_status: '', company_type: '', industry: '', country: '', city: '', created_from: '', created_to: '' }, sortBy: 'created_at', sortDir: 'desc', companyTypeOptions: COMPANY_TYPE_FALLBACK_OPTIONS, companyIndustryOptions: COMPANY_INDUSTRY_FALLBACK_OPTIONS, currentCompany: null, documents: [] },
  formatCodeFallback(value = '') { return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()); },
  formatCompanyType(value = '') { const found = this.state.companyTypeOptions.find(o => o.value === value); return found?.label || this.formatCodeFallback(value); },
  formatCompanyIndustry(value = '') { const found = this.state.companyIndustryOptions.find(o => o.value === value); return found?.label || this.formatCodeFallback(value); },
  normalize(raw = {}) { return { ...raw, id: raw.id || '', company_id: raw.company_id || raw.companyId || '', company_name: raw.company_name || raw.companyName || '', legal_name: raw.legal_name || raw.legalName || '', legal_company_name: raw.legal_company_name || raw.legalCompanyName || '', authorized_signatory_full_name: raw.authorized_signatory_full_name || raw.authorizedSignatoryFullName || '', authorized_signatory_title: raw.authorized_signatory_title || raw.authorizedSignatoryTitle || '', registration_number: raw.registration_number || raw.registrationNumber || '', company_type: raw.company_type || '', industry: raw.industry || '', website: raw.website || '', main_email: raw.main_email || raw.mainEmail || '', main_phone: raw.main_phone || raw.mainPhone || '', country: raw.country || '', state: raw.state || '', city: raw.city || '', address: raw.address || '', tax_number: raw.tax_number || raw.taxNumber || '', vat_number: raw.vat_number || raw.vatNumber || '', company_status: raw.company_status || raw.companyStatus || raw.status || 'Prospect', notes: raw.notes || '', documents_verified: raw.documents_verified ?? raw.documentsVerified ?? false, documents_verification_status: raw.documents_verification_status || raw.documentsVerificationStatus || 'not_verified', documents_verified_at: raw.documents_verified_at || raw.documentsVerifiedAt || '', documents_verified_by: raw.documents_verified_by || raw.documentsVerifiedBy || '', documents_verification_notes: raw.documents_verification_notes || raw.documentsVerificationNotes || '', documents_verified_snapshot: raw.documents_verified_snapshot ?? raw.documentsVerifiedSnapshot ?? null, documents_verification_invalidated_at: raw.documents_verification_invalidated_at || raw.documentsVerificationInvalidatedAt || '', documents_verification_invalidated_reason: raw.documents_verification_invalidated_reason || raw.documentsVerificationInvalidatedReason || '', created_at: raw.created_at || raw.createdAt || '' }; },
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
    const view = document.getElementById('companyView'); if (!view || document.getElementById('companySearchInput')) return;
    await this.hydrateOptionSources();
    const card = view.querySelector('.card');
    card.insertAdjacentHTML('afterbegin', `<div class="stack" style="gap:8px;margin-bottom:10px"><div class="row" style="gap:8px;flex-wrap:wrap"><input id="companySearchInput" class="input" type="search" placeholder="Search companies..."/><select id="companyStatusFilter" class="select"><option value="">All Statuses</option>${COMPANY_LIFECYCLE_STATUSES.map(status => `<option>${U.escapeHtml(status)}</option>`).join('')}</select><select id="companyTypeFilter" class="select"></select><select id="companyIndustryFilter" class="select"></select><input id="companyCountryFilter" class="input" placeholder="Country"/><input id="companyCityFilter" class="input" placeholder="City"/><input id="companyCreatedFromFilter" class="input" type="date"/><input id="companyCreatedToFilter" class="input" type="date"/><button id="companyClearFiltersBtn" class="btn ghost sm">Clear Filters</button></div><div class="row" style="gap:8px"><button id="companyExportBtn" class="btn ghost sm" data-permission-resource="companies" data-permission-action="export">Export</button><span id="companyPageInfo" class="muted"></span></div></div>`);
    this.renderSelectOptions('companyTypeFilter', this.state.companyTypeOptions, 'All Types');
    this.renderSelectOptions('companyIndustryFilter', this.state.companyIndustryOptions, 'All Industries');
    view.querySelector('.table-wrap')?.insertAdjacentHTML('afterend', `<div class="table-actions"><div class="pagination"><button id="companyPrevBtn" class="chip-btn">‹ Prev</button><button id="companyNextBtn" class="chip-btn">Next ›</button></div><div><label class="muted">Rows</label><select id="companyRowsPerPage" class="select sm"><option>25</option><option selected>50</option><option>100</option></select></div></div>`);
    document.getElementById('companySearchInput').addEventListener('input', e => { this.state.search = e.target.value.trim(); this.state.page = 1; this.loadAndRefresh(); });
    const bind = (id, key) => document.getElementById(id)?.addEventListener('change', e => { this.state.filters[key] = e.target.value.trim(); this.state.page = 1; this.loadAndRefresh(); });
    bind('companyStatusFilter', 'company_status'); bind('companyTypeFilter', 'company_type'); bind('companyIndustryFilter', 'industry'); bind('companyCountryFilter', 'country'); bind('companyCityFilter', 'city'); bind('companyCreatedFromFilter', 'created_from'); bind('companyCreatedToFilter', 'created_to');
    document.getElementById('companyCountryFilter')?.addEventListener('input', e => { this.state.filters.country = e.target.value.trim(); this.state.page = 1; this.loadAndRefresh(); });
    document.getElementById('companyCityFilter')?.addEventListener('input', e => { this.state.filters.city = e.target.value.trim(); this.state.page = 1; this.loadAndRefresh(); });
    document.getElementById('companyClearFiltersBtn').onclick = () => { this.state.search = ''; this.state.filters = { company_status: '', company_type: '', industry: '', country: '', city: '', created_from: '', created_to: '' }; ['companySearchInput','companyStatusFilter','companyTypeFilter','companyIndustryFilter','companyCountryFilter','companyCityFilter','companyCreatedFromFilter','companyCreatedToFilter'].forEach(fid => { const el = document.getElementById(fid); if (el) el.value = ''; }); this.state.page = 1; this.loadAndRefresh(); };
    document.getElementById('companyPrevBtn').onclick = () => { if (this.state.page > 1) { this.state.page--; this.loadAndRefresh(); } };
    document.getElementById('companyNextBtn').onclick = () => { if (this.state.page * this.state.limit < this.state.total) { this.state.page++; this.loadAndRefresh(); } };
    document.getElementById('companyRowsPerPage').onchange = (e) => { this.state.limit = Number(e.target.value) || 50; this.state.page = 1; this.loadAndRefresh(); };
    document.getElementById('companyExportBtn').onclick = () => this.exportCsv(); applyPermissionVisibility(view);
    this.bindFormEvents();
  },
  bindFormEvents() { if (this._formBound) return; this._formBound = true; document.getElementById('companyForm')?.addEventListener('submit', e => this.submitForm(e)); document.getElementById('companyDocumentUploadBtn')?.addEventListener('click', () => this.uploadCompanyDocument()); ['companyCancelBtn', 'companyCloseBtn'].forEach(id => document.getElementById(id)?.addEventListener('click', () => this.closeForm())); document.getElementById('companyModal')?.addEventListener('click', e => { if (e.target?.id === 'companyModal') this.closeForm(); }); },
  async openForm(existing = null) {
    if (!Permissions.canCreate('companies') && !existing) return; if (!Permissions.canEdit('companies') && existing) return;
    this.bindFormEvents(); await this.hydrateOptionSources(); this.renderSelectOptions('companyTypeInput', this.state.companyTypeOptions, 'Select company type'); this.renderSelectOptions('companyIndustryInput', this.state.companyIndustryOptions, 'Select industry');
    const isEdit = Boolean(existing?.id); this.state.currentCompany = isEdit ? this.normalize(existing) : null; this.state.documents = []; document.getElementById('companyModalTitle').textContent = isEdit ? 'Edit Company' : 'Create Company'; document.getElementById('companySaveBtn').textContent = isEdit ? 'Update Company' : 'Save Company'; document.getElementById('companyRecordId').value = existing?.id || '';
    const set = (id, value = '') => { const el = document.getElementById(id); if (el) el.value = value || ''; };
    set('companyNameInput', existing?.company_name); set('companyLegalNameInput', existing?.legal_name); set('companyAuthorizedSignatoryFullNameInput', existing?.authorized_signatory_full_name || existing?.authorizedSignatoryFullName); set('companyAuthorizedSignatoryTitleInput', existing?.authorized_signatory_title || existing?.authorizedSignatoryTitle); set('companyRegistrationNumberInput', existing?.registration_number || existing?.registrationNumber); set('companyTypeInput', existing?.company_type); set('companyIndustryInput', existing?.industry); set('companyWebsiteInput', existing?.website); set('companyMainEmailInput', existing?.main_email); set('companyMainPhoneInput', existing?.main_phone); set('companyCountryInput', existing?.country); set('companyCityInput', existing?.city); set('companyAddressInput', existing?.address); set('companyTaxNumberInput', existing?.tax_number); set('companyStatusInput', existing?.company_status || 'Prospect'); set('companyNotesInput', existing?.notes); const statusInput = document.getElementById('companyStatusInput'); if (statusInput) statusInput.value = existing?.company_status || 'Prospect';
    this.renderCompanyDocumentsSection(this.state.currentCompany);
    if (isEdit) this.loadCompanyDocuments(this.state.currentCompany);
    this.renderCompanyVerificationPanel(this.state.currentCompany);
    const modal = document.getElementById('companyModal'); modal.style.display = 'flex'; modal.setAttribute('aria-hidden', 'false');
  },
  closeForm() { const form = document.getElementById('companyForm'); form?.reset(); document.getElementById('companyRecordId').value = ''; document.getElementById('companyStatusInput').value = 'Prospect'; this.state.currentCompany = null; this.state.documents = []; this.renderCompanyDocumentsSection(null); this.renderCompanyVerificationPanel(null); const modal = document.getElementById('companyModal'); modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); this.toggleSave(false); },
  toggleSave(loading) { const btn = document.getElementById('companySaveBtn'); if (!btn) return; btn.disabled = loading; btn.textContent = loading ? 'Saving…' : (document.getElementById('companyRecordId').value ? 'Update Company' : 'Save Company'); },
  async submitForm(e) { e.preventDefault(); const recordId = document.getElementById('companyRecordId').value; const company_name = document.getElementById('companyNameInput').value.trim(); if (!company_name) { UI?.toast?.('Company Name is required', 'error'); return; } const payload = { company_name, legal_name: document.getElementById('companyLegalNameInput').value.trim(), company_type: document.getElementById('companyTypeInput').value.trim(), industry: document.getElementById('companyIndustryInput').value.trim(), website: document.getElementById('companyWebsiteInput').value.trim(), main_email: document.getElementById('companyMainEmailInput').value.trim(), main_phone: document.getElementById('companyMainPhoneInput').value.trim(), country: document.getElementById('companyCountryInput').value.trim(), city: document.getElementById('companyCityInput').value.trim(), address: document.getElementById('companyAddressInput').value.trim(), tax_number: document.getElementById('companyTaxNumberInput').value.trim(), authorized_signatory_full_name: document.getElementById('companyAuthorizedSignatoryFullNameInput').value.trim(), authorized_signatory_title: document.getElementById('companyAuthorizedSignatoryTitleInput').value.trim(), registration_number: document.getElementById('companyRegistrationNumberInput').value.trim(), company_status: recordId ? (this.state.currentCompany?.company_status || 'Prospect') : 'Prospect', notes: document.getElementById('companyNotesInput').value.trim() };
    this.toggleSave(true); try { const action = recordId ? 'update' : 'create'; if (recordId && !Permissions.canEdit('companies')) { UI?.toast?.('You do not have permission for this action.'); return; } if (!recordId && !Permissions.canCreate('companies')) { UI?.toast?.('You do not have permission for this action.'); return; } const body = recordId ? { id: recordId, updates: payload } : payload; const saved = await Api.requestWithSession('companies', action, body, { requireAuth: true }); try { await this.refreshCompanyLifecycleStatus(saved?.id || recordId, { fullRecalculation: true }); } catch (syncError) { console.error('[companies] lifecycle status refresh failed after save', syncError); UI?.toast?.('Company saved, but lifecycle status could not be refreshed'); } UI?.toast?.(recordId ? 'Company updated' : 'Company saved', 'success'); this.closeForm(); this.state.page = recordId ? this.state.page : 1; await this.loadAndRefresh(); } catch (err) { UI?.toast?.('Unable to save company', 'error'); console.error(err); } finally { this.toggleSave(false); }
  },
  async loadAndRefresh() { if (!Permissions.canView('companies')) return; await this.ensureControls(); try { const res = await Api.requestWithSession('companies', 'list', { page: this.state.page, limit: this.state.limit, search: this.state.search, filters: this.state.filters, sortBy: this.state.sortBy, sortDir: this.state.sortDir }, { requireAuth: true }); const rows = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : []; this.state.rows = rows.map(r => this.normalize(r)); this.state.total = Number(res?.total ?? rows.length) || rows.length; this.render(); this.refreshVisibleCompanyLifecycleStatuses(); } catch (e) { UI?.toast?.('Unable to load companies', 'error'); console.error(e); } },
  render() {
    const body = document.getElementById('companyTableBody'); if (!body) return;
    const canEdit = Permissions.canEdit('companies'), canDelete = Permissions.canDelete('companies'); const canCreateLead = Permissions.canCreate('leads');
    body.innerHTML = this.state.rows.map(r => `<tr><td>${U.escapeHtml(r.company_id)}</td><td>${this.renderCompanyVerificationBadge(r)}</td><td>${U.escapeHtml(r.company_name)}</td><td>${U.escapeHtml(this.formatCompanyType(r.company_type))}</td><td>${U.escapeHtml(this.formatCompanyIndustry(r.industry))}</td><td>${this.renderLifecycleStatusBadge(r.company_status)}</td><td>${U.escapeHtml(r.main_email)}</td><td>${U.escapeHtml(r.main_phone)}</td><td>${U.escapeHtml(r.country)}</td><td>${U.escapeHtml(r.city)}</td><td>${U.escapeHtml(U.fmtTS(r.created_at))}</td><td>${canCreateLead ? `<button class='chip-btn' data-a='lead' data-permission-resource='leads' data-permission-action='create' data-id='${r.id}'>Create Lead</button>` : ''}${canEdit ? `<button class='chip-btn' data-a='edit' data-permission-resource='companies' data-permission-action='update' data-id='${r.id}'>Edit</button>` : ''}${canDelete ? `<button class='chip-btn' data-a='del' data-permission-resource='companies' data-permission-action='delete' data-id='${r.id}'>Delete</button>` : ''}${Permissions.canCreate('contacts') ? `<button class='chip-btn' data-a='contacts' data-permission-resource='contacts' data-permission-action='create' data-id='${r.id}'>Add Contact</button>` : ''}</td></tr>`).join('');
    body.querySelectorAll('button').forEach(b => b.onclick = () => this.onAction(b.dataset.a, b.dataset.id)); const start = this.state.total ? ((this.state.page - 1) * this.state.limit) + 1 : 0; const end = Math.min(this.state.page * this.state.limit, this.state.total); applyPermissionVisibility(body || b); const pi = document.getElementById('companyPageInfo'); if (pi) pi.textContent = `Showing ${start}-${end} of ${this.state.total} records`; const canCreateCompany = Permissions.can('companies','create') || Permissions.can('companies','manage'); const canExportCompany = Permissions.can('companies','export') || Permissions.can('companies','manage'); const createBtn = document.getElementById('companyCreateBtn'); if (createBtn) { createBtn.style.display = canCreateCompany ? '' : 'none'; createBtn.onclick = () => this.openForm(); } const exportBtn = document.getElementById('companyExportBtn'); if (exportBtn) { exportBtn.style.display = canExportCompany ? '' : 'none'; exportBtn.disabled = !canExportCompany; }
  },
  async onAction(a, id) {
    const row = this.state.rows.find(x => String(x.id || '') === String(id || ''));
    if (!row) return;

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
      if (!Permissions.canCreate('contacts')) {
        UI?.toast?.('You do not have permission for this action.');
        return;
      }

      const contactCompany = {
        company_id: row.company_id || '',
        company_name: row.company_name || '',
        company_ids: row.company_id ? [row.company_id] : [],
        company_names: row.company_name || row.company_id || ''
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
    query = id.includes('-') ? query.eq('id', id) : query.eq('company_id', id);
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
    return String(company?.documents_verification_status || company?.documentsVerificationStatus || (company?.documents_verified ? 'verified' : 'not_verified') || 'not_verified').trim().toLowerCase();
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
    const status = String(normalized.documents_verification_status || 'not_verified').trim().toLowerCase();
    const docs = Array.isArray(this.state.documents) ? this.state.documents : [];
    const canAdminVerify = this.canVerifyCompanyDocuments();
    const actionLabel = status === 'verified' ? 'Re-verify' : status === 'needs_reverification' ? 'Re-verify Company' : 'Mark as Verified';
    const noDocsMessage = '<p class="muted" style="margin:6px 0 0;">Upload at least one company document before verifying.</p>';
    const adminAction = canAdminVerify
      ? (docs.length ? `<button type="button" id="companyVerifyBtn" class="btn ghost sm">${U.escapeHtml(actionLabel)}</button>` : noDocsMessage)
      : '<p class="muted" style="margin:6px 0 0;">Only admin can verify company data.</p>';
    panel.innerHTML = `<div class="row between center" style="gap:10px;flex-wrap:wrap;"><div><strong>Company Verification</strong><p class="muted" style="margin:6px 0 0;">Admin must compare the uploaded company documents with the filled company fields before marking this company as verified.</p></div>${this.renderCompanyVerificationBadge(normalized)}</div><div class="stack" style="gap:6px;"><div><span class="muted">Current verification status:</span> ${this.renderCompanyVerificationBadge(normalized)}</div>${normalized.documents_verified_at ? `<div><span class="muted">Last verified:</span> ${U.escapeHtml(U.fmtTS(normalized.documents_verified_at))}</div>` : ''}${normalized.documents_verification_notes ? `<div><span class="muted">Verification notes:</span> ${U.escapeHtml(normalized.documents_verification_notes)}</div>` : ''}${status === 'needs_reverification' && normalized.documents_verification_invalidated_reason ? `<div><span class="muted">Invalidated reason:</span> ${U.escapeHtml(normalized.documents_verification_invalidated_reason)}</div>` : ''}${adminAction}</div>`;
    const btn = document.getElementById('companyVerifyBtn'); if (btn) btn.onclick = () => this.openCompanyVerificationDialog(normalized);
  },
  canVerifyCompanyDocuments() { return Boolean(Permissions?.isAdmin?.() || Session?.isAdmin?.() || String(Session?.role?.() || '').trim().toLowerCase() === 'admin'); },
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
    document.body.insertAdjacentHTML('beforeend', `<div id="companyVerificationDialog" class="modal" role="dialog" aria-modal="true" aria-hidden="true"><div class="modal-content" style="max-width:820px;"><div class="modal-header"><h2 style="margin:0;font-size:20px">Confirm Company Verification</h2><button class="modal-close" id="companyVerificationCloseBtn" aria-label="Close verification dialog">✕</button></div><div id="companyVerificationDialogBody" class="stack" style="gap:12px;margin-top:12px;"></div><div class="actions" style="justify-content:flex-end;gap:8px;margin-top:12px;"><button id="companyVerificationCancelBtn" type="button" class="btn ghost">Cancel</button><button id="companyVerificationConfirmBtn" type="button" class="btn" disabled>Confirm Verified</button></div></div></div>`);
    modal = document.getElementById('companyVerificationDialog');
    document.getElementById('companyVerificationCloseBtn').onclick = () => this.closeCompanyVerificationDialog();
    document.getElementById('companyVerificationCancelBtn').onclick = () => this.closeCompanyVerificationDialog();
    modal.addEventListener('click', e => { if (e.target?.id === 'companyVerificationDialog') this.closeCompanyVerificationDialog(); });
    return modal;
  },
  openCompanyVerificationDialog(company = this.state.currentCompany) {
    if (!this.canVerifyCompanyDocuments()) return;
    if (!Array.isArray(this.state.documents) || !this.state.documents.length) { UI?.toast?.('Upload at least one company document before verifying', 'error'); return; }
    const modal = this.ensureCompanyVerificationDialog(); const body = document.getElementById('companyVerificationDialogBody'); const snapshot = this.buildCompanyVerificationSnapshot(company);
    const fields = [['Company Name', snapshot.company_name], ['Legal Name', snapshot.legal_name || snapshot.legal_company_name], ['Registration Number', snapshot.registration_number], ['Tax/VAT Number', [snapshot.tax_number, snapshot.vat_number].filter(Boolean).join(' / ')], ['Authorized Signatory Full Name', snapshot.authorized_signatory_full_name], ['Authorized Signatory Title', snapshot.authorized_signatory_title], ['Country/City/Address', [snapshot.country, snapshot.city, snapshot.address].filter(Boolean).join(' / ')]];
    body.innerHTML = `<p class="muted">Review each item below against the uploaded documents. This is a manual admin verification workflow; no OCR or automatic document reading is performed.</p><div class="card"><strong>Checklist</strong><ul>${fields.map(([label, value]) => `<li>☐ <strong>${U.escapeHtml(label)}:</strong> ${U.escapeHtml(value || '—')}</li>`).join('')}</ul></div><div class="card"><strong>Uploaded Documents</strong><div class="stack" style="gap:6px;margin-top:8px;">${this.state.documents.map(doc => `<div class="row between center" style="gap:8px;flex-wrap:wrap;"><span>${U.escapeHtml(doc.document_title || doc.file_name || 'Document')}</span><button type="button" class="chip-btn" data-verify-doc-open="${U.escapeAttr(doc.id)}">Open/View</button></div>`).join('')}</div></div><div class="filter-row"><label class="muted" for="companyVerificationNotesInput">Verification notes (optional)</label><textarea id="companyVerificationNotesInput" class="input" rows="3">${U.escapeHtml(company?.documents_verification_notes || '')}</textarea></div><label class="row" style="gap:8px;align-items:flex-start;"><input id="companyVerificationConfirmCheck" type="checkbox" style="margin-top:3px;" /> <span>I confirm that I compared the uploaded company documents with the company data and they match.</span></label>`;
    body.querySelectorAll('[data-verify-doc-open]').forEach(btn => btn.onclick = () => this.openCompanyDocument(btn.dataset.verifyDocOpen));
    const confirmBtn = document.getElementById('companyVerificationConfirmBtn'); const checkbox = document.getElementById('companyVerificationConfirmCheck');
    confirmBtn.disabled = true; checkbox.onchange = () => { confirmBtn.disabled = !checkbox.checked; };
    confirmBtn.onclick = () => this.verifyCompanyDocuments(company, document.getElementById('companyVerificationNotesInput')?.value || '');
    modal.style.display = 'flex'; modal.setAttribute('aria-hidden', 'false');
  },
  closeCompanyVerificationDialog() { const modal = document.getElementById('companyVerificationDialog'); if (modal) { modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); } },
  async verifyCompanyDocuments(company = this.state.currentCompany, notes = '') {
    if (!this.canVerifyCompanyDocuments()) return;
    if (!company?.id || !Array.isArray(this.state.documents) || !this.state.documents.length) { UI?.toast?.('Upload at least one company document before verifying', 'error'); return; }
    const confirmBtn = document.getElementById('companyVerificationConfirmBtn'); if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Verifying…'; }
    const previousStatus = String(company.documents_verification_status || 'not_verified').trim() || 'not_verified';
    const verifiedAt = new Date().toISOString(); const verifiedBy = this.getCurrentUserId(); const snapshot = this.buildCompanyVerificationSnapshot(company); const verificationNotes = String(notes || '').trim() || null;
    const payload = { documents_verified: true, documents_verification_status: 'verified', documents_verified_at: verifiedAt, documents_verified_by: verifiedBy || null, documents_verification_notes: verificationNotes, documents_verification_invalidated_at: null, documents_verification_invalidated_reason: null, documents_verified_snapshot: snapshot };
    try {
      const client = this.getSupabaseClient();
      const { data, error } = await client.from('companies').update(payload).eq('id', company.id).select('*').single();
      if (error) throw error;
      const { error: auditError } = await client.from('company_verification_audit').insert({ company_uuid: company.id, action: 'admin_marked_verified', previous_status: previousStatus, new_status: 'verified', verified_by: verifiedBy || null, verification_notes: verificationNotes, verification_snapshot: snapshot });
      if (auditError) throw auditError;
      this.state.currentCompany = this.normalize(data || { ...company, ...payload });
      this.closeCompanyVerificationDialog();
      UI?.toast?.('Company data verified', 'success');
      await this.refreshCompanyVerificationState(company.id);
      await this.loadAndRefresh();
    } catch (error) { UI?.toast?.('Unable to verify company data', 'error'); console.error(error); }
    finally { if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Verified'; } }
  },
  async refreshCompanyDocuments(companyId) { if (!companyId) return; await this.loadCompanyDocuments({ ...(this.state.currentCompany || {}), id: companyId }); },
  async refreshCompanyVerificationState(companyId) {
    if (!companyId) return null;
    try {
      const client = this.getSupabaseClient();
      const { data, error } = await client.from('companies').select('*').eq('id', companyId).single();
      if (error) throw error;
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
