const Companies = {
  state: { rows: [], page: 1, limit: 50, total: 0, search: '', filters: { company_status: '', industry: '', country: '', city: '', owner: '', source: '', created_from: '', created_to: '' }, sortBy: 'created_at', sortDir: 'desc' },
  normalize(raw = {}) { return { ...raw, id: raw.id || '', company_id: raw.company_id || raw.companyId || '', company_name: raw.company_name || raw.companyName || '', legal_name: raw.legal_name || '', company_type: raw.company_type || '', industry: raw.industry || '', website: raw.website || '', main_email: raw.main_email || raw.mainEmail || '', main_phone: raw.main_phone || raw.mainPhone || '', country: raw.country || '', city: raw.city || '', address: raw.address || '', tax_number: raw.tax_number || '', company_status: raw.company_status || raw.companyStatus || 'Prospect', source: raw.source || '', owner_name: raw.owner_name || raw.ownerName || '', owner_email: raw.owner_email || '', notes: raw.notes || '', created_at: raw.created_at || raw.createdAt || '' }; },
  ensureControls() {
    const view = document.getElementById('companyView'); if (!view || document.getElementById('companySearchInput')) return;
    const card = view.querySelector('.card');
    card.insertAdjacentHTML('afterbegin', `<div class="stack" style="gap:8px;margin-bottom:10px"><div class="row" style="gap:8px;flex-wrap:wrap"><input id="companySearchInput" class="input" type="search" placeholder="Search companies..."/><select id="companyStatusFilter" class="select"><option value="">All Statuses</option><option>Prospect</option><option>Lead Created</option><option>Deal Open</option><option>Proposal Sent</option><option>Agreement Signed</option><option>Client</option><option>Inactive</option><option>Blacklisted</option></select><input id="companyIndustryFilter" class="input" placeholder="Industry"/><input id="companyCountryFilter" class="input" placeholder="Country"/><input id="companyOwnerFilter" class="input" placeholder="Owner name/email"/><input id="companySourceFilter" class="input" placeholder="Source"/><input id="companyCreatedFromFilter" class="input" type="date"/><input id="companyCreatedToFilter" class="input" type="date"/><button id="companyClearFiltersBtn" class="btn ghost sm">Clear Filters</button></div><div class="row" style="gap:8px"><button id="companyExportBtn" class="btn ghost sm">Export</button><span id="companyPageInfo" class="muted"></span></div></div>`);
    view.querySelector('.table-wrap')?.insertAdjacentHTML('afterend', `<div class="table-actions"><div class="pagination"><button id="companyPrevBtn" class="chip-btn">‹ Prev</button><button id="companyNextBtn" class="chip-btn">Next ›</button></div><div><label class="muted">Rows</label><select id="companyRowsPerPage" class="select sm"><option>25</option><option selected>50</option><option>100</option></select></div></div>`);
    document.getElementById('companySearchInput').addEventListener('input', e => { this.state.search = e.target.value.trim(); this.state.page = 1; this.loadAndRefresh(); });
    const bindFilter = (id, key) => document.getElementById(id)?.addEventListener('change', e => { this.state.filters[key] = e.target.value.trim(); this.state.page = 1; this.loadAndRefresh(); });
    bindFilter('companyStatusFilter', 'company_status'); bindFilter('companyIndustryFilter', 'industry'); bindFilter('companyCountryFilter', 'country'); bindFilter('companyOwnerFilter', 'owner'); bindFilter('companySourceFilter', 'source'); bindFilter('companyCreatedFromFilter', 'created_from'); bindFilter('companyCreatedToFilter', 'created_to');
    document.getElementById('companyIndustryFilter')?.addEventListener('input', e => { this.state.filters.industry = e.target.value.trim(); this.state.page = 1; this.loadAndRefresh(); });
    document.getElementById('companyCountryFilter')?.addEventListener('input', e => { this.state.filters.country = e.target.value.trim(); this.state.page = 1; this.loadAndRefresh(); });
    document.getElementById('companyOwnerFilter')?.addEventListener('input', e => { this.state.filters.owner = e.target.value.trim(); this.state.page = 1; this.loadAndRefresh(); });
    document.getElementById('companySourceFilter')?.addEventListener('input', e => { this.state.filters.source = e.target.value.trim(); this.state.page = 1; this.loadAndRefresh(); });
    document.getElementById('companyClearFiltersBtn').onclick = () => { this.state.search = ''; this.state.filters = { company_status: '', industry: '', country: '', city: '', owner: '', source: '', created_from: '', created_to: '' }; ['companySearchInput','companyStatusFilter','companyIndustryFilter','companyCountryFilter','companyOwnerFilter','companySourceFilter','companyCreatedFromFilter','companyCreatedToFilter'].forEach(fid => { const el = document.getElementById(fid); if (el) el.value = ''; }); this.state.page = 1; this.loadAndRefresh(); };
    document.getElementById('companyPrevBtn').onclick = () => { if (this.state.page > 1) { this.state.page--; this.loadAndRefresh(); } };
    document.getElementById('companyNextBtn').onclick = () => { if (this.state.page * this.state.limit < this.state.total) { this.state.page++; this.loadAndRefresh(); } };
    document.getElementById('companyRowsPerPage').onchange = (e) => { this.state.limit = Number(e.target.value) || 50; this.state.page = 1; this.loadAndRefresh(); };
    document.getElementById('companyExportBtn').onclick = () => this.exportCsv();
    this.bindFormEvents();
  },
  bindFormEvents() {
    if (this._formBound) return; this._formBound = true;
    document.getElementById('companyForm')?.addEventListener('submit', e => this.submitForm(e));
    ['companyCancelBtn', 'companyCloseBtn'].forEach(id => document.getElementById(id)?.addEventListener('click', () => this.closeForm()));
    document.getElementById('companyModal')?.addEventListener('click', e => { if (e.target?.id === 'companyModal') this.closeForm(); });
  },
  openForm(existing = null) {
    if (!Permissions.canCreate('companies') && !existing) return;
    if (!Permissions.canEdit('companies') && existing) return;
    this.bindFormEvents();
    const isEdit = Boolean(existing?.id);
    document.getElementById('companyModalTitle').textContent = isEdit ? 'Edit Company' : 'Create Company';
    document.getElementById('companySaveBtn').textContent = isEdit ? 'Update Company' : 'Save Company';
    document.getElementById('companyRecordId').value = existing?.id || '';
    const set = (id, value = '') => { const el = document.getElementById(id); if (el) el.value = value || ''; };
    set('companyNameInput', existing?.company_name);
    set('companyLegalNameInput', existing?.legal_name);
    set('companyTypeInput', existing?.company_type);
    set('companyIndustryInput', existing?.industry);
    set('companyWebsiteInput', existing?.website);
    set('companyMainEmailInput', existing?.main_email);
    set('companyMainPhoneInput', existing?.main_phone);
    set('companyCountryInput', existing?.country);
    set('companyCityInput', existing?.city);
    set('companyAddressInput', existing?.address);
    set('companyTaxNumberInput', existing?.tax_number);
    set('companyStatusInput', existing?.company_status || 'Prospect');
    set('companySourceInput', existing?.source);
    set('companyOwnerNameInput', existing?.owner_name);
    set('companyOwnerEmailInput', existing?.owner_email);
    set('companyNotesInput', existing?.notes);
    const modal = document.getElementById('companyModal'); modal.style.display = 'flex'; modal.setAttribute('aria-hidden', 'false');
  },
  closeForm() { const form = document.getElementById('companyForm'); form?.reset(); document.getElementById('companyRecordId').value = ''; document.getElementById('companyStatusInput').value = 'Prospect'; const modal = document.getElementById('companyModal'); modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); this.toggleSave(false); },
  toggleSave(loading) { const btn = document.getElementById('companySaveBtn'); if (!btn) return; btn.disabled = loading; btn.textContent = loading ? 'Saving…' : (document.getElementById('companyRecordId').value ? 'Update Company' : 'Save Company'); },
  async submitForm(e) {
    e.preventDefault();
    const recordId = document.getElementById('companyRecordId').value;
    const company_name = document.getElementById('companyNameInput').value.trim();
    if (!company_name) { UI?.toast?.('Company Name is required', 'error'); return; }
    const payload = { company_name, legal_name: document.getElementById('companyLegalNameInput').value.trim(), company_type: document.getElementById('companyTypeInput').value.trim(), industry: document.getElementById('companyIndustryInput').value.trim(), website: document.getElementById('companyWebsiteInput').value.trim(), main_email: document.getElementById('companyMainEmailInput').value.trim(), main_phone: document.getElementById('companyMainPhoneInput').value.trim(), country: document.getElementById('companyCountryInput').value.trim(), city: document.getElementById('companyCityInput').value.trim(), address: document.getElementById('companyAddressInput').value.trim(), tax_number: document.getElementById('companyTaxNumberInput').value.trim(), company_status: document.getElementById('companyStatusInput').value || 'Prospect', source: document.getElementById('companySourceInput').value.trim(), owner_name: document.getElementById('companyOwnerNameInput').value.trim(), owner_email: document.getElementById('companyOwnerEmailInput').value.trim(), notes: document.getElementById('companyNotesInput').value.trim() };
    this.toggleSave(true);
    try { const action = recordId ? 'update' : 'create'; const body = recordId ? { id: recordId, updates: payload } : payload; await Api.requestWithSession('companies', action, body, { requireAuth: true }); UI?.toast?.(recordId ? 'Company updated' : 'Company saved', 'success'); this.closeForm(); this.state.page = recordId ? this.state.page : 1; await this.loadAndRefresh(); } catch (err) { UI?.toast?.('Unable to save company', 'error'); console.error(err); } finally { this.toggleSave(false); }
  },
  async loadAndRefresh() {
    if (!Permissions.canView('companies')) return; this.ensureControls();
    try { const res = await Api.requestWithSession('companies', 'list', { page: this.state.page, limit: this.state.limit, search: this.state.search, filters: this.state.filters, sortBy: this.state.sortBy, sortDir: this.state.sortDir }, { requireAuth: true }); const rows = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : []; this.state.rows = rows.map(r => this.normalize(r)); this.state.total = Number(res?.total ?? rows.length) || rows.length; this.render(); } catch (e) { UI?.toast?.('Unable to load companies', 'error'); console.error(e); }
  },
  render() {
    const body = document.getElementById('companyTableBody'); if (!body) return;
    const canEdit = Permissions.canEdit('companies'), canDelete = Permissions.canDelete('companies');
    const canCreateLead = Permissions.canCreate('leads');
    body.innerHTML = this.state.rows.map(r => `<tr><td>${U.escapeHtml(r.company_id)}</td><td>${U.escapeHtml(r.company_name)}</td><td>${U.escapeHtml(r.industry)}</td><td>${U.escapeHtml(r.company_status)}</td><td>${U.escapeHtml(r.owner_name)}</td><td>${U.escapeHtml(r.main_email)}</td><td>${U.escapeHtml(r.main_phone)}</td><td>${U.escapeHtml(r.country)}</td><td>${U.escapeHtml(r.city)}</td><td>${U.escapeHtml(U.fmtTS(r.created_at))}</td><td>${canCreateLead ? `<button class='chip-btn' data-a='lead' data-id='${r.id}'>Create Lead</button>` : ''}${canEdit ? `<button class='chip-btn' data-a='edit' data-id='${r.id}'>Edit</button>` : ''}${canDelete ? `<button class='chip-btn' data-a='del' data-id='${r.id}'>Delete</button>` : ''}<button class='chip-btn' data-a='contacts' data-id='${r.id}'>Add Contact</button></td></tr>`).join('');
    body.querySelectorAll('button').forEach(b => b.onclick = () => this.onAction(b.dataset.a, b.dataset.id));
    const start = this.state.total ? ((this.state.page - 1) * this.state.limit) + 1 : 0; const end = Math.min(this.state.page * this.state.limit, this.state.total);
    const pi = document.getElementById('companyPageInfo'); if (pi) pi.textContent = `Showing ${start}-${end} of ${this.state.total} records`;
    const createBtn = document.getElementById('companyCreateBtn'); if (createBtn) { createBtn.style.display = Permissions.canCreate('companies') ? '' : 'none'; createBtn.onclick = () => this.openForm(); }
  },
  async onAction(a, id) { const row = this.state.rows.find(x => x.id === id); if (!row) return; if (a === 'edit') this.openForm(row); if (a === 'del') { if (!confirm('Delete company?')) return; try { await Api.requestWithSession('companies', 'delete', { id }, { requireAuth: true }); await this.loadAndRefresh(); } catch (e) { UI?.toast?.('Unable to delete company', 'error'); console.error(e); } } if (a === 'contacts') { window.Contacts?.setCompanyFilter?.(row.company_id, row.company_name); window.App?.showView?.('contacts'); } if (a === 'lead') { let prefill = { ...row }; try { const contactRes = await Api.requestWithSession('contacts', 'list', { page: 1, limit: 1, filters: { company_id: row.company_id, is_primary_contact: 'primary' }, sortBy: 'created_at', sortDir: 'desc' }, { requireAuth: true }); const primary = Array.isArray(contactRes?.rows) ? contactRes.rows[0] : null; if (primary) prefill = { ...prefill, ...primary }; } catch (_) {} window.Leads?.openLeadCreateFormWithPrefill?.(prefill); }
  },
  exportCsv() { if (!Permissions.canExport('companies')) return; const h = ['company_id', 'company_name', 'industry', 'company_status', 'owner_name', 'main_email', 'main_phone', 'country', 'city']; const csv = [h.join(',')].concat(this.state.rows.map(r => h.map(k => `"${String(r[k] ?? '').replaceAll('"', '""')}"`).join(','))).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'companies.csv'; a.click(); }
}; window.Companies = Companies;
