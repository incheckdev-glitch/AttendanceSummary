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
  normalize(raw = {}) { return { ...raw, id: raw.id || '', company_id: raw.company_id || raw.companyId || '', company_name: raw.company_name || raw.companyName || '', legal_name: raw.legal_name || raw.legalName || '', authorized_signatory_full_name: raw.authorized_signatory_full_name || raw.authorizedSignatoryFullName || '', authorized_signatory_title: raw.authorized_signatory_title || raw.authorizedSignatoryTitle || '', registration_number: raw.registration_number || raw.registrationNumber || '', company_type: raw.company_type || '', industry: raw.industry || '', website: raw.website || '', main_email: raw.main_email || raw.mainEmail || '', main_phone: raw.main_phone || raw.mainPhone || '', country: raw.country || '', city: raw.city || '', address: raw.address || '', tax_number: raw.tax_number || raw.taxNumber || '', company_status: raw.company_status || raw.companyStatus || 'Prospect', notes: raw.notes || '', created_at: raw.created_at || raw.createdAt || '' }; },
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
    card.insertAdjacentHTML('afterbegin', `<div class="stack" style="gap:8px;margin-bottom:10px"><div class="row" style="gap:8px;flex-wrap:wrap"><input id="companySearchInput" class="input" type="search" placeholder="Search companies..."/><select id="companyStatusFilter" class="select"><option value="">All Statuses</option><option>Prospect</option><option>Lead Created</option><option>Deal Open</option><option>Proposal Sent</option><option>Agreement Signed</option><option>Client</option><option>Inactive</option><option>Blacklisted</option></select><select id="companyTypeFilter" class="select"></select><select id="companyIndustryFilter" class="select"></select><input id="companyCountryFilter" class="input" placeholder="Country"/><input id="companyCityFilter" class="input" placeholder="City"/><input id="companyCreatedFromFilter" class="input" type="date"/><input id="companyCreatedToFilter" class="input" type="date"/><button id="companyClearFiltersBtn" class="btn ghost sm">Clear Filters</button></div><div class="row" style="gap:8px"><button id="companyExportBtn" class="btn ghost sm" data-permission-resource="companies" data-permission-action="export">Export</button><span id="companyPageInfo" class="muted"></span></div></div>`);
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
    set('companyNameInput', existing?.company_name); set('companyLegalNameInput', existing?.legal_name); set('companyAuthorizedSignatoryFullNameInput', existing?.authorized_signatory_full_name || existing?.authorizedSignatoryFullName); set('companyAuthorizedSignatoryTitleInput', existing?.authorized_signatory_title || existing?.authorizedSignatoryTitle); set('companyRegistrationNumberInput', existing?.registration_number || existing?.registrationNumber); set('companyTypeInput', existing?.company_type); set('companyIndustryInput', existing?.industry); set('companyWebsiteInput', existing?.website); set('companyMainEmailInput', existing?.main_email); set('companyMainPhoneInput', existing?.main_phone); set('companyCountryInput', existing?.country); set('companyCityInput', existing?.city); set('companyAddressInput', existing?.address); set('companyTaxNumberInput', existing?.tax_number); set('companyStatusInput', existing?.company_status || 'Prospect'); set('companyNotesInput', existing?.notes);
    this.renderCompanyDocumentsSection(this.state.currentCompany);
    if (isEdit) this.loadCompanyDocuments(this.state.currentCompany);
    const modal = document.getElementById('companyModal'); modal.style.display = 'flex'; modal.setAttribute('aria-hidden', 'false');
  },
  closeForm() { const form = document.getElementById('companyForm'); form?.reset(); document.getElementById('companyRecordId').value = ''; document.getElementById('companyStatusInput').value = 'Prospect'; this.state.currentCompany = null; this.state.documents = []; this.renderCompanyDocumentsSection(null); const modal = document.getElementById('companyModal'); modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); this.toggleSave(false); },
  toggleSave(loading) { const btn = document.getElementById('companySaveBtn'); if (!btn) return; btn.disabled = loading; btn.textContent = loading ? 'Saving…' : (document.getElementById('companyRecordId').value ? 'Update Company' : 'Save Company'); },
  async submitForm(e) { e.preventDefault(); const recordId = document.getElementById('companyRecordId').value; const company_name = document.getElementById('companyNameInput').value.trim(); if (!company_name) { UI?.toast?.('Company Name is required', 'error'); return; } const payload = { company_name, legal_name: document.getElementById('companyLegalNameInput').value.trim(), company_type: document.getElementById('companyTypeInput').value.trim(), industry: document.getElementById('companyIndustryInput').value.trim(), website: document.getElementById('companyWebsiteInput').value.trim(), main_email: document.getElementById('companyMainEmailInput').value.trim(), main_phone: document.getElementById('companyMainPhoneInput').value.trim(), country: document.getElementById('companyCountryInput').value.trim(), city: document.getElementById('companyCityInput').value.trim(), address: document.getElementById('companyAddressInput').value.trim(), tax_number: document.getElementById('companyTaxNumberInput').value.trim(), authorized_signatory_full_name: document.getElementById('companyAuthorizedSignatoryFullNameInput').value.trim(), authorized_signatory_title: document.getElementById('companyAuthorizedSignatoryTitleInput').value.trim(), registration_number: document.getElementById('companyRegistrationNumberInput').value.trim(), company_status: document.getElementById('companyStatusInput').value || 'Prospect', notes: document.getElementById('companyNotesInput').value.trim() };
    this.toggleSave(true); try { const action = recordId ? 'update' : 'create'; if (recordId && !Permissions.canEdit('companies')) { UI?.toast?.('You do not have permission for this action.'); return; } if (!recordId && !Permissions.canCreate('companies')) { UI?.toast?.('You do not have permission for this action.'); return; } const body = recordId ? { id: recordId, updates: payload } : payload; await Api.requestWithSession('companies', action, body, { requireAuth: true }); UI?.toast?.(recordId ? 'Company updated' : 'Company saved', 'success'); this.closeForm(); this.state.page = recordId ? this.state.page : 1; await this.loadAndRefresh(); } catch (err) { UI?.toast?.('Unable to save company', 'error'); console.error(err); } finally { this.toggleSave(false); }
  },
  async loadAndRefresh() { if (!Permissions.canView('companies')) return; await this.ensureControls(); try { const res = await Api.requestWithSession('companies', 'list', { page: this.state.page, limit: this.state.limit, search: this.state.search, filters: this.state.filters, sortBy: this.state.sortBy, sortDir: this.state.sortDir }, { requireAuth: true }); const rows = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : []; this.state.rows = rows.map(r => this.normalize(r)); this.state.total = Number(res?.total ?? rows.length) || rows.length; this.render(); } catch (e) { UI?.toast?.('Unable to load companies', 'error'); console.error(e); } },
  render() { const body = document.getElementById('companyTableBody'); if (!body) return; const canEdit = Permissions.canEdit('companies'), canDelete = Permissions.canDelete('companies'); const canCreateLead = Permissions.canCreate('leads'); body.innerHTML = this.state.rows.map(r => `<tr><td>${U.escapeHtml(r.company_id)}</td><td>${U.escapeHtml(r.company_name)}</td><td>${U.escapeHtml(this.formatCompanyType(r.company_type))}</td><td>${U.escapeHtml(this.formatCompanyIndustry(r.industry))}</td><td>${U.escapeHtml(r.company_status)}</td><td>${U.escapeHtml(r.main_email)}</td><td>${U.escapeHtml(r.main_phone)}</td><td>${U.escapeHtml(r.country)}</td><td>${U.escapeHtml(r.city)}</td><td>${U.escapeHtml(U.fmtTS(r.created_at))}</td><td>${canCreateLead ? `<button class='chip-btn' data-a='lead' data-permission-resource='leads' data-permission-action='create' data-id='${r.id}'>Create Lead</button>` : ''}${canEdit ? `<button class='chip-btn' data-a='edit' data-permission-resource='companies' data-permission-action='update' data-id='${r.id}'>Edit</button>` : ''}${canDelete ? `<button class='chip-btn' data-a='del' data-permission-resource='companies' data-permission-action='delete' data-id='${r.id}'>Delete</button>` : ''}${Permissions.canCreate('contacts') ? `<button class='chip-btn' data-a='contacts' data-permission-resource='contacts' data-permission-action='create' data-id='${r.id}'>Add Contact</button>` : ''}</td></tr>`).join(''); body.querySelectorAll('button').forEach(b => b.onclick = () => this.onAction(b.dataset.a, b.dataset.id)); const start = this.state.total ? ((this.state.page - 1) * this.state.limit) + 1 : 0; const end = Math.min(this.state.page * this.state.limit, this.state.total); applyPermissionVisibility(body || b); const pi = document.getElementById('companyPageInfo'); if (pi) pi.textContent = `Showing ${start}-${end} of ${this.state.total} records`; const canCreateCompany = Permissions.can('companies','create') || Permissions.can('companies','manage'); const canExportCompany = Permissions.can('companies','export') || Permissions.can('companies','manage'); const createBtn = document.getElementById('companyCreateBtn'); if (createBtn) { createBtn.style.display = canCreateCompany ? '' : 'none'; createBtn.onclick = () => this.openForm(); } const exportBtn = document.getElementById('companyExportBtn'); if (exportBtn) { exportBtn.style.display = canExportCompany ? '' : 'none'; exportBtn.disabled = !canExportCompany; } },
  async onAction(a, id) { const row = this.state.rows.find(x => x.id === id); if (!row) return; if (a === 'edit') this.openForm(row); if (a === 'del') { if (!Permissions.canDelete('companies')) { UI?.toast?.('You do not have permission for this action.'); return; } if (!confirm('Delete company?')) return; try { await Api.requestWithSession('companies', 'delete', { id }, { requireAuth: true }); await this.loadAndRefresh(); } catch (e) { UI?.toast?.('Unable to delete company', 'error'); console.error(e); } } if (a === 'contacts') { if (!Permissions.canCreate('contacts')) { UI?.toast?.('You do not have permission for this action.'); return; } window.Contacts?.setCompanyFilter?.(row.company_id, row.company_name); window.App?.showView?.('contacts'); } if (a === 'lead') { if (!Permissions.can('leads', 'create')) { UI.toast?.('You do not have permission to create leads.'); return; } if (!Permissions.canCreate('leads')) { UI?.toast?.('You do not have permission for this action.'); return; } const company = { ...row }; try { const contactRes = await Api.requestWithSession('contacts', 'list', { page: 1, limit: 1, filters: { company_id: row.company_id, is_primary_contact: 'primary' }, sortBy: 'created_at', sortDir: 'desc' }, { requireAuth: true }); const primary = Array.isArray(contactRes?.rows) ? contactRes.rows[0] : null; window.Leads?.openLeadCreateFormWithPrefill?.({ company, contact: primary || null }); } catch (_) { window.Leads?.openLeadCreateFormWithPrefill?.({ company, contact: null }); } } },

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
      UI?.toast?.('Company document deleted', 'success');
    } catch (error) { UI?.toast?.('Unable to delete company document', 'error'); console.error(error); }
  },
  exportCsv() { if (!(Permissions.can('companies', 'export') || Permissions.can('companies', 'manage'))) { UI?.toast?.('You do not have permission for this action.'); return; } const h = ['company_id', 'company_name', 'company_type', 'industry', 'company_status', 'main_email', 'main_phone', 'country', 'city']; const csv = [h.join(',')].concat(this.state.rows.map(r => h.map(k => `"${String((k === 'company_type' ? this.formatCompanyType(r[k]) : k === 'industry' ? this.formatCompanyIndustry(r[k]) : r[k]) ?? '').replaceAll('"', '""')}"`).join(','))).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'companies.csv'; a.click(); }
}; window.Companies = Companies;
