function canCreateContact(currentUser) {
  if (window.Permissions?.canCreateContact) return window.Permissions.canCreateContact(currentUser);
  return Boolean(window.Permissions?.canCreate?.('contacts'));
}

const Contacts = {
  state: {
    rows: [],
    page: 1,
    limit: 50,
    total: 0,
    search: '',
    filters: {
      company_id: '',
      contact_status: '',
      decision_role: '',
      department: '',
      is_primary_contact: '',
      created_from: '',
      created_to: ''
    },
    sortBy: 'created_at',
    sortDir: 'desc',
    companyId: '',
    companyName: ''
  },

  setCompanyFilter(companyId = '', companyName = '') {
    this.state.companyId = companyId || '';
    this.state.companyName = companyName || '';
    this.state.page = 1;
    this.loadAndRefresh();
  },

  async openCreateForCompany(company = {}) {
    if (!canCreateContact(Permissions.getResolvedCurrentUser?.())) {
      UI?.toast?.('You do not have permission to create contacts.', 'warning');
      return;
    }
    const companyId = company.company_id || '';
    const companyName = company.company_name || '';
    return this.openForm({
      company_id: companyId,
      company_name: companyName,
      company_ids: companyId ? [companyId] : [],
      company_names: company.company_names || companyName || companyId || ''
    }, false);
  },

  normalizeCompanyIds(raw = {}) {
    const value = raw.company_ids ?? raw.companyIds ?? raw.company_id ?? raw.companyId ?? [];
    if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) return [];
      if (text.startsWith('{') && text.endsWith('}')) {
        return text.slice(1, -1).split(',').map(v => v.replace(/^"|"$/g, '').trim()).filter(Boolean);
      }
      return text.split(',').map(v => v.trim()).filter(Boolean);
    }
    return [];
  },

  normalizeCompanyNames(raw = {}, ids = []) {
    const value = raw.company_names ?? raw.companyNames ?? raw.company_name ?? raw.companyName ?? '';
    if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean).join(', ');
    const text = String(value || '').trim();
    if (text) return text;
    return ids.join(', ');
  },

  normalize(raw = {}) {
    const companyIds = this.normalizeCompanyIds(raw);
    const companyNames = this.normalizeCompanyNames(raw, companyIds);
    return {
      ...raw,
      id: raw.id || '',
      contact_id: raw.contact_id || raw.contactId || '',
      first_name: raw.first_name || '',
      last_name: raw.last_name || '',
      full_name: raw.full_name || raw.fullName || '',
      company_id: raw.company_id || raw.companyId || companyIds[0] || '',
      company_name: raw.company_name || raw.companyName || companyNames.split(',')[0]?.trim() || '',
      company_ids: companyIds,
      company_names: companyNames,
      job_title: raw.job_title || raw.jobTitle || '',
      department: raw.department || '',
      decision_role: raw.decision_role || raw.decisionRole || '',
      email: raw.email || '',
      phone: raw.phone || '',
      mobile: raw.mobile || '',
      notes: raw.notes || '',
      is_primary_contact: Boolean(raw.is_primary_contact ?? raw.isPrimaryContact),
      contact_status: raw.contact_status || raw.contactStatus || 'Active'
    };
  },

  ensureControls() {
    const v = document.getElementById('contactsView');
    if (!v || document.getElementById('contactsSearchInput')) return;
    const c = v.querySelector('.card');
    c.insertAdjacentHTML('afterbegin', `<div class='stack' style='gap:8px;margin-bottom:10px'><div class='row' style='gap:8px;flex-wrap:wrap'><input id='contactsSearchInput' class='input' type='search' placeholder='Search contacts...'/><select id='contactsCompanyFilter' class='select'><option value=''>All Companies</option></select><select id='contactsStatusFilter' class='select'><option value=''>All Statuses</option><option>Active</option><option>Inactive</option><option>Left Company</option><option>Do Not Contact</option></select><select id='contactsDecisionRoleFilter' class='select'><option value=''>All Roles</option><option>Decision Maker</option><option>Influencer</option><option>Finance Contact</option><option>Technical Contact</option><option>Operations Contact</option><option>Procurement Contact</option><option>User</option><option>Other</option></select><input id='contactsDepartmentFilter' class='input' placeholder='Department'/><select id='contactsPrimaryFilter' class='select'><option value=''>All Contacts</option><option value='primary'>Primary only</option><option value='non_primary'>Non-primary only</option></select><input id='contactsCreatedFromFilter' class='input' type='date'/><input id='contactsCreatedToFilter' class='input' type='date'/><button id='contactsClearFiltersBtn' class='btn ghost sm'>Clear Filters</button></div><div class='row' style='gap:8px'><button id='contactsExportBtn' class='btn ghost sm' data-permission-resource='contacts' data-permission-action='export'>Export</button><span id='contactsPageInfo' class='muted'></span></div></div>`);
    v.querySelector('.table-wrap')?.insertAdjacentHTML('afterend', `<div class='table-actions'><div class='pagination'><button id='contactsPrevBtn' class='chip-btn'>‹ Prev</button><button id='contactsNextBtn' class='chip-btn'>Next ›</button></div><div><label class='muted'>Rows</label><select id='contactsRowsPerPage' class='select sm'><option>25</option><option selected>50</option><option>100</option></select></div></div>`);

    document.getElementById('contactsSearchInput').oninput = e => {
      this.state.search = e.target.value.trim();
      this.state.page = 1;
      this.loadAndRefresh();
    };
    [['contactsCompanyFilter','company_id'],['contactsStatusFilter','contact_status'],['contactsDecisionRoleFilter','decision_role'],['contactsPrimaryFilter','is_primary_contact'],['contactsCreatedFromFilter','created_from'],['contactsCreatedToFilter','created_to']].forEach(([id,key]) => {
      const el = document.getElementById(id);
      if (el) el.onchange = e => {
        this.state.filters[key] = e.target.value.trim();
        this.state.page = 1;
        this.loadAndRefresh();
      };
    });
    document.getElementById('contactsDepartmentFilter').oninput = e => {
      this.state.filters.department = e.target.value.trim();
      this.state.page = 1;
      this.loadAndRefresh();
    };
    document.getElementById('contactsPrevBtn').onclick = () => {
      if (this.state.page > 1) {
        this.state.page--;
        this.loadAndRefresh();
      }
    };
    document.getElementById('contactsNextBtn').onclick = () => {
      if (this.state.page * this.state.limit < this.state.total) {
        this.state.page++;
        this.loadAndRefresh();
      }
    };
    document.getElementById('contactsRowsPerPage').onchange = e => {
      this.state.limit = Number(e.target.value) || 50;
      this.state.page = 1;
      this.loadAndRefresh();
    };
    document.getElementById('contactsExportBtn').onclick = () => this.exportCsv();
    applyPermissionVisibility(v);
    document.getElementById('contactsClearFiltersBtn').onclick = () => {
      this.state.search = '';
      this.state.filters = { company_id: '', contact_status: '', decision_role: '', department: '', is_primary_contact: '', created_from: '', created_to: '' };
      ['contactsSearchInput','contactsCompanyFilter','contactsStatusFilter','contactsDecisionRoleFilter','contactsDepartmentFilter','contactsPrimaryFilter','contactsCreatedFromFilter','contactsCreatedToFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      this.state.page = 1;
      this.loadAndRefresh();
    };
    this.ensureFilterCompanies().catch(error => console.warn('[contacts] company filter load failed', error));
    this.bindFormEvents();
  },

  companyRelationId(company = {}) {
    return String(company.id || company.company_uuid || company.companyUuid || '').trim();
  },

  async loadCompanyOptionsSafe(searchText = '', includeSelectedId = null) {
    try {
      const rows = await window.CrmCompanyContactSelectors?.loadCompanyOptions?.(searchText, includeSelectedId);
      if (!rows) throw new Error('Shared company option loader is unavailable.');
      return { rows, unavailable: false };
    } catch (error) {
      console.error('[contacts] fresh company options query failed', error);
      return { rows: [], unavailable: true, error };
    }
  },

  isCompanyListPermissionError(error) {
    const message = String(error?.message || error || '');
    return message.includes('cannot list companies') || message.includes('Forbidden');
  },

  ensureCompanyHelper() {
    const select = document.getElementById('contactCompanyInput');
    if (!select) return null;
    let helper = document.getElementById('contactCompanyFallbackHelp');
    if (!helper) {
      helper = document.createElement('small');
      helper.id = 'contactCompanyFallbackHelp';
      helper.className = 'muted';
      helper.style.display = 'none';
      select.insertAdjacentElement('afterend', helper);
    }
    return helper;
  },

  setCompanyFallbackMessage(message = '') {
    const helper = this.ensureCompanyHelper();
    if (!helper) return;
    helper.textContent = message;
    helper.style.display = message ? 'block' : 'none';
  },

  async ensureFilterCompanies() {
    const select = document.getElementById('contactsCompanyFilter');
    if (!select) return;
    const { rows } = await this.loadCompanyOptionsSafe();
    select.innerHTML = `<option value=''>All Companies</option>${rows.map(r => `<option value="${U.escapeAttr(this.companyRelationId(r))}">${U.escapeHtml(r.legal_name || r.company_name || r.name || this.companyRelationId(r))}</option>`).join('')}`;
    if (this.state.companyId) {
      select.value = this.state.companyId;
      this.state.filters.company_id = this.state.companyId;
    }
  },

  bindFormEvents() {
    if (this._formBound) return;
    this._formBound = true;
    document.getElementById('contactForm')?.addEventListener('submit', e => this.submitForm(e));
    document.getElementById('contactCompanyInput')?.addEventListener('focus', () => this.ensureCompanyOptions(this.state.currentContact || {}).catch(error => console.error('[contacts] company picker refresh on open failed', error)));
    window.addEventListener('crm:company-saved', event => {
      if (document.getElementById('contactModal')?.getAttribute('aria-hidden') === 'true') return;
      const companyId = String(event?.detail?.companyId || event?.detail?.company?.id || '').trim();
      this.ensureCompanyOptions({ id: this.state.currentContact?.id || '', company_ids: companyId ? [companyId] : [] })
        .then(() => { if (companyId) this.setSelectedCompanies([companyId]); })
        .catch(error => console.error('[contacts] company picker refresh after save failed', error));
    });
    ['contactCancelBtn', 'contactCloseBtn'].forEach(id => document.getElementById(id)?.addEventListener('click', () => this.closeForm()));
    document.getElementById('contactModal')?.addEventListener('click', e => {
      if (e.target?.id === 'contactModal') this.closeForm();
    });
  },

  async ensureCompanyOptions(existing = {}) {
    const select = document.getElementById('contactCompanyInput');
    if (!select) return [];
    select.disabled = true;
    select.innerHTML = '<option value="">Loading companies…</option>';
    this.setCompanyFallbackMessage('');

    const { rows, unavailable, error } = await this.loadCompanyOptionsSafe();
    const normalizedExisting = this.normalize(existing || {});
    const existingIds = normalizedExisting.company_ids.length ? normalizedExisting.company_ids : [normalizedExisting.company_id || this.state.companyId].filter(Boolean);
    const rowIds = new Set(rows.map(r => this.companyRelationId(r)).filter(Boolean));
    const mergedRows = [...rows];
    existingIds.forEach(companyId => {
      if (!companyId || rowIds.has(companyId)) return;
      mergedRows.push({ id: companyId, company_uuid: companyId, company_id: companyId, company_name: normalizedExisting.company_name || this.state.companyName || normalizedExisting.company_names || companyId });
      rowIds.add(companyId);
    });

    select.innerHTML = mergedRows.map(r => `<option value="${U.escapeAttr(this.companyRelationId(r))}">${U.escapeHtml(r.legal_name || r.company_name || r.name || this.companyRelationId(r))}</option>`).join('');
    const companyListDenied = unavailable && this.isCompanyListPermissionError(error);
    if (!mergedRows.length || companyListDenied) {
      select.disabled = true;
      this.setCompanyFallbackMessage('Company list is not available for your role. You can still create the contact if company is optional, or ask admin to grant companies list access.');
    } else {
      select.disabled = false;
      this.setCompanyFallbackMessage('');
    }
    return mergedRows;
  },

  setSelectedCompanies(companyIds = []) {
    const select = document.getElementById('contactCompanyInput');
    if (!select) return;
    const ids = new Set((Array.isArray(companyIds) ? companyIds : [companyIds]).map(v => String(v || '').trim()).filter(Boolean));
    Array.from(select.options).forEach(option => { option.selected = ids.has(option.value); });
  },

  getSelectedCompanies() {
    const select = document.getElementById('contactCompanyInput');
    if (!select) return [];
    return Array.from(select.selectedOptions || [])
      .map(option => ({ company_id: String(option.value || '').trim(), company_name: String(option.textContent || '').trim() }))
      .filter(row => row.company_id);
  },

  async openForm(existing = {}, isEdit = true) {
    if (isEdit && !Permissions.canEdit('contacts')) {
      UI?.toast?.('You do not have permission for this action.', 'warning');
      return;
    }
    if (!isEdit && !canCreateContact(Permissions.getResolvedCurrentUser?.())) {
      UI?.toast?.('You do not have permission to create contacts.', 'warning');
      return;
    }
    this.bindFormEvents();
    const data = this.normalize(isEdit ? existing : { ...existing, contact_status: 'Active' });
    document.getElementById('contactModalTitle').textContent = isEdit ? 'Edit Contact' : 'Create Contact';
    document.getElementById('contactSaveBtn').textContent = isEdit ? 'Update Contact' : 'Save Contact';
    document.getElementById('contactRecordId').value = isEdit ? (data.id || '') : '';
    const set = (id, value = '') => { const el = document.getElementById(id); if (el) el.value = value || ''; };
    const selectedCompanyIds = data.company_ids.length ? data.company_ids : [data.company_id || this.state.companyId];
    const companySelect = document.getElementById('contactCompanyInput');
    if (companySelect) {
      companySelect.disabled = true;
      companySelect.innerHTML = '<option value="">Loading companies…</option>';
      this.setCompanyFallbackMessage('');
    }
    set('contactFirstNameInput', data.first_name);
    set('contactLastNameInput', data.last_name);
    set('contactJobTitleInput', data.job_title);
    set('contactDepartmentInput', data.department);
    set('contactEmailInput', data.email);
    set('contactPhoneInput', data.phone);
    set('contactMobileInput', data.mobile);
    set('contactDecisionRoleInput', data.decision_role);
    set('contactStatusInput', data.contact_status || 'Active');
    set('contactNotesInput', data.notes);
    document.getElementById('contactIsPrimaryInput').checked = Boolean(data.is_primary_contact);
    const modal = document.getElementById('contactModal');
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');

    this.ensureCompanyOptions(data)
      .then(() => this.setSelectedCompanies(selectedCompanyIds))
      .catch(error => {
        console.warn('[contacts] company selector load failed after modal open', error);
        this.setCompanyFallbackMessage('Company list is not available for your role. You can still create the contact if company is optional, or ask admin to grant companies list access.');
      });
  },

  closeForm() {
    document.getElementById('contactForm')?.reset();
    document.getElementById('contactRecordId').value = '';
    document.getElementById('contactStatusInput').value = 'Active';
    const modal = document.getElementById('contactModal');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    this.toggleSave(false);
  },

  toggleSave(loading) {
    const btn = document.getElementById('contactSaveBtn');
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? 'Saving…' : (document.getElementById('contactRecordId').value ? 'Update Contact' : 'Save Contact');
  },

  async submitForm(e) {
    e.preventDefault();
    const recordId = document.getElementById('contactRecordId').value;
    if (recordId && !Permissions.canEdit('contacts')) {
      UI?.toast?.('You do not have permission for this action.', 'warning');
      return;
    }
    if (!recordId && !canCreateContact(Permissions.getResolvedCurrentUser?.())) {
      UI?.toast?.('You do not have permission to create contacts.', 'warning');
      return;
    }
    const selectedCompanies = this.getSelectedCompanies();
    if (!selectedCompanies.length) {
      UI?.toast?.('At least one company is required', 'error');
      return;
    }
    const first_name = document.getElementById('contactFirstNameInput').value.trim();
    const last_name = document.getElementById('contactLastNameInput').value.trim();
    if (!first_name && !last_name) {
      UI?.toast?.('First Name or Last Name is required', 'error');
      return;
    }
    const full_name = U.buildContactDisplayName({ first_name, last_name });
    const primaryCompany = selectedCompanies[0];
    const payload = {
      company_id: primaryCompany.company_id,
      company_name: primaryCompany.company_name,
      company_ids: selectedCompanies.map(c => c.company_id),
      company_names: selectedCompanies.map(c => c.company_name || c.company_id).join(', '),
      first_name,
      last_name,
      full_name,
      job_title: document.getElementById('contactJobTitleInput').value.trim(),
      department: document.getElementById('contactDepartmentInput').value.trim(),
      email: document.getElementById('contactEmailInput').value.trim(),
      phone: document.getElementById('contactPhoneInput').value.trim(),
      mobile: document.getElementById('contactMobileInput').value.trim(),
      decision_role: document.getElementById('contactDecisionRoleInput').value,
      is_primary_contact: document.getElementById('contactIsPrimaryInput').checked,
      contact_status: document.getElementById('contactStatusInput').value || 'Active',
      notes: document.getElementById('contactNotesInput').value.trim()
    };
    this.toggleSave(true);
    try {
      const action = recordId ? 'update' : 'create';
      const body = recordId ? { id: recordId, updates: payload } : payload;
      await Api.requestWithSession('contacts', action, body, { requireAuth: true });
      UI?.toast?.(recordId ? 'Contact updated' : 'Contact saved', 'success');
      this.closeForm();
      this.state.page = recordId ? this.state.page : 1;
      await this.loadAndRefresh();
      await window.CrmCompanyContactSelectors?.refresh?.();
    } catch (err) {
      UI?.toast?.('Unable to save contact', 'error');
      console.error(err);
    } finally {
      this.toggleSave(false);
    }
  },

  async loadAndRefresh() {
    if (!Permissions.canView('contacts')) return;
    this.ensureControls();
    try {
      const filters = { ...this.state.filters };
      if (this.state.companyId) filters.company_id = this.state.companyId;
      const res = await Api.requestWithSession('contacts', 'list', { page: this.state.page, limit: this.state.limit, search: this.state.search, filters, sortBy: this.state.sortBy, sortDir: this.state.sortDir }, { requireAuth: true });
      const rows = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];
      this.state.rows = rows.map(r => this.normalize(r));
      this.state.total = Number(res?.total ?? rows.length) || rows.length;
      this.render();
    } catch (e) {
      UI?.toast?.('Unable to load contacts', 'error');
      console.error(e);
    }
  },

  render() {
    const b = document.getElementById('contactsTableBody');
    if (!b) return;
    const canEdit = Permissions.canEdit('contacts');
    const canDelete = Permissions.canDelete('contacts');
    const canCreateLead = Permissions.canCreate('leads');
    b.innerHTML = this.state.rows.map(r => `<tr><td>${U.escapeHtml(r.contact_id)}</td><td>${U.escapeHtml(r.first_name)}</td><td>${U.escapeHtml(r.last_name)}</td><td>${U.escapeHtml(r.company_names || r.company_name)}</td><td>${U.escapeHtml(r.job_title)}</td><td>${U.escapeHtml(r.department)}</td><td>${U.escapeHtml(r.email)}</td><td>${U.escapeHtml(r.phone)}</td><td>${r.is_primary_contact ? 'Yes' : 'No'}</td><td>${U.escapeHtml(r.contact_status)}</td><td>${canCreateLead ? `<button class='chip-btn' data-a='lead' data-permission-resource='leads' data-permission-action='create' data-id='${U.escapeAttr(r.id)}'>Create Lead</button>` : ''}${canEdit ? `<button class='chip-btn' data-a='edit' data-permission-resource='contacts' data-permission-action='update' data-id='${U.escapeAttr(r.id)}'>Edit</button>` : ''}${canDelete ? `<button class='chip-btn' data-a='del' data-permission-resource='contacts' data-permission-action='delete' data-id='${U.escapeAttr(r.id)}'>Delete</button>` : ''}</td></tr>`).join('');
    b.querySelectorAll('button').forEach(x => x.onclick = () => this.onAction(x.dataset.a, x.dataset.id));
    const s = this.state.total ? ((this.state.page - 1) * this.state.limit) + 1 : 0;
    const e = Math.min(this.state.page * this.state.limit, this.state.total);
    applyPermissionVisibility(b);
    const pi = document.getElementById('contactsPageInfo');
    if (pi) pi.textContent = `Showing ${s}-${e} of ${this.state.total} records`;
    const canCreateContacts = canCreateContact(Permissions.getResolvedCurrentUser?.());
    const canExportContact = Permissions.can('contacts','export') || Permissions.can('contacts','manage');
    const cbtn = document.getElementById('contactsCreateBtn');
    if (cbtn) {
      cbtn.style.display = canCreateContacts ? '' : 'none';
      cbtn.hidden = !canCreateContacts;
      cbtn.disabled = !canCreateContacts;
      cbtn.setAttribute('data-action', 'create-contact');
      cbtn.setAttribute('data-contact-create', 'true');
      cbtn.classList.add('js-create-contact');
      cbtn.classList.toggle('pointer-events-none', !canCreateContacts);
      cbtn.classList.toggle('opacity-50', !canCreateContacts);
      cbtn.classList.toggle('disabled', !canCreateContacts);
      if (canCreateContacts) cbtn.removeAttribute('aria-disabled');
      else cbtn.setAttribute('aria-disabled', 'true');
      cbtn.onclick = event => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (!canCreateContact(Permissions.getResolvedCurrentUser?.())) {
          UI?.toast?.('You do not have permission to create contacts.', 'warning');
          return;
        }
        this.openForm({ company_id: this.state.companyId || '', company_name: this.state.companyName || '', company_ids: this.state.companyId ? [this.state.companyId] : [] }, false);
      };
    }
    const exportBtn = document.getElementById('contactsExportBtn');
    if (exportBtn) {
      exportBtn.style.display = canExportContact ? '' : 'none';
      exportBtn.disabled = !canExportContact;
    }
  },

  async onAction(a, id) {
    const r = this.state.rows.find(x => x.id === id);
    if (!r) return;
    if (a === 'lead') {
      if (!Permissions.can('leads', 'create') || !Permissions.canCreate('leads')) {
        UI?.toast?.('You do not have permission to create leads.');
        return;
      }
      window.Leads?.openLeadCreateFormWithPrefill?.({ contact: r });
    }
    if (a === 'edit') this.openForm(r, true);
    if (a === 'del') {
      if (!Permissions.canDelete('contacts')) { UI?.toast?.('You do not have permission for this action.'); return; }
      if (!confirm('Delete contact?')) return;
      await Api.requestWithSession('contacts', 'delete', { id }, { requireAuth: true });
      this.loadAndRefresh();
    }
  },

  exportCsv() {
    if (!(Permissions.can('contacts', 'export') || Permissions.can('contacts', 'manage'))) {
      UI?.toast?.('You do not have permission for this action.');
      return;
    }
    const h = ['contact_id', 'first_name', 'last_name', 'company_names', 'email', 'phone', 'job_title', 'decision_role', 'contact_status'];
    const csv = [h.join(',')].concat(this.state.rows.map(r => h.map(k => `"${String(r[k] ?? '').replaceAll('"', '""')}"`).join(','))).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'contacts.csv';
    a.click();
  }
};
window.Contacts = Contacts;
