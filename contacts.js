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
    companyName: '',
    selectedCompanyIds: [],
    companyOptions: [],
    selectedDetailsId: '',
    summary: { totalContacts: 0, activeContacts: 0, primaryContacts: 0, withEmail: 0 }
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
    const companyId = this.companyRelationId(company);
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

  async ensureControls() {
    const view = document.getElementById('contactsView');
    if (!view) return;
    view.classList.add('contacts-workspace');

    const needsModernLayout = !document.getElementById('contactsSummaryGrid')
      || !document.getElementById('contactsFilterCard')
      || !document.getElementById('contactsTableBody')
      || !document.getElementById('contactsTableCard');

    if (needsModernLayout) {
      view.innerHTML = `
        <div class="contacts-page-shell">
          <header class="contacts-page-header">
            <div>
              <h1>Contacts</h1>
              <p>Manage and organize your contacts</p>
            </div>
            <button id="contactsCreateBtn" class="btn primary contacts-add-btn" type="button" data-action="create-contact" data-contact-create="true">
              <span aria-hidden="true">＋</span>
              Add Contact
            </button>
          </header>

          <section id="contactsSummaryGrid" class="contacts-summary-grid" aria-label="Contacts summary"></section>

          <section id="contactsFilterCard" class="contacts-panel contacts-filter-card" aria-label="Contacts filters">
            <div class="contacts-panel-title">
              <span class="contacts-panel-icon" aria-hidden="true">⌁</span>
              <h2>Filters</h2>
            </div>
            <div class="contacts-filter-grid">
              <label class="contacts-filter-field contacts-filter-search" for="contactsSearchInput">
                <span>Search Contacts</span>
                <div class="contacts-input-shell">
                  <span aria-hidden="true">⌕</span>
                  <input id="contactsSearchInput" class="input" type="search" placeholder="Search by name, email, job title..." autocomplete="off" />
                </div>
              </label>
              <label class="contacts-filter-field" for="contactsCompanyFilter">
                <span>Company</span>
                <select id="contactsCompanyFilter" class="select"><option value="">All Companies</option></select>
              </label>
              <label class="contacts-filter-field" for="contactsStatusFilter">
                <span>Status</span>
                <select id="contactsStatusFilter" class="select">
                  <option value="">All Statuses</option>
                  <option>Active</option>
                  <option>Inactive</option>
                  <option>Left Company</option>
                  <option>Do Not Contact</option>
                </select>
              </label>
              <label class="contacts-filter-field" for="contactsDecisionRoleFilter">
                <span>Role</span>
                <select id="contactsDecisionRoleFilter" class="select">
                  <option value="">All Roles</option>
                  <option>Decision Maker</option>
                  <option>Influencer</option>
                  <option>Finance Contact</option>
                  <option>Technical Contact</option>
                  <option>Operations Contact</option>
                  <option>Procurement Contact</option>
                  <option>User</option>
                  <option>Other</option>
                </select>
              </label>
              <label class="contacts-filter-field" for="contactsDepartmentFilter">
                <span>Department</span>
                <input id="contactsDepartmentFilter" class="input" placeholder="Department" autocomplete="off" />
              </label>
              <label class="contacts-filter-field" for="contactsPrimaryFilter">
                <span>Primary Contact</span>
                <select id="contactsPrimaryFilter" class="select">
                  <option value="">All Contacts</option>
                  <option value="primary">Primary only</option>
                  <option value="non_primary">Non-primary only</option>
                </select>
              </label>
              <label class="contacts-filter-field" for="contactsCreatedFromFilter">
                <span>From Date</span>
                <input id="contactsCreatedFromFilter" class="input" type="date" />
              </label>
              <label class="contacts-filter-field" for="contactsCreatedToFilter">
                <span>To Date</span>
                <input id="contactsCreatedToFilter" class="input" type="date" />
              </label>
              <div class="contacts-filter-field contacts-filter-clear">
                <span>&nbsp;</span>
                <button id="contactsClearFiltersBtn" class="btn ghost" type="button"><span aria-hidden="true">↻</span> Clear Filters</button>
              </div>
            </div>
          </section>

          <section id="contactsTableCard" class="contacts-panel contacts-table-panel" aria-label="Contacts table">
            <div class="contacts-table-toolbar">
              <div class="contacts-table-toolbar-left">
                <button id="contactsExportBtn" class="btn ghost contacts-export-btn" type="button"><span aria-hidden="true">⇩</span> Export</button>
                <span id="contactsPageInfo" class="contacts-page-info" aria-live="polite">Showing 0 records</span>
              </div>
              <label class="contacts-rows-control" for="contactsRowsPerPage">
                <span>Rows per page</span>
                <select id="contactsRowsPerPage" class="select">
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50" selected>50</option>
                  <option value="100">100</option>
                </select>
              </label>
            </div>
            <div class="contacts-table-wrap">
              <table id="contactsTable">
                <thead>
                  <tr>
                    <th scope="col">Contact ID</th>
                    <th scope="col">Full Name</th>
                    <th scope="col">Company</th>
                    <th scope="col">Job Title</th>
                    <th scope="col">Department</th>
                    <th scope="col">Email</th>
                    <th scope="col">Phone</th>
                    <th scope="col">Primary Contact</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody id="contactsTableBody"></tbody>
              </table>
            </div>
            <div class="contacts-table-footer">
              <nav id="contactsPagination" class="contacts-pagination" aria-label="Contacts pagination"></nav>
              <span id="contactsFooterInfo" class="contacts-footer-info" aria-live="polite">Showing 0 records</span>
            </div>
          </section>
        </div>`;
    }

    const bindControl = (id, eventName, handler) => {
      const el = document.getElementById(id);
      if (!el) return;
      const key = `contactsBound${eventName.replace(/[^a-z0-9]/gi, '')}`;
      if (el.dataset[key]) return;
      el.dataset[key] = 'true';
      el.addEventListener(eventName, handler);
    };

    bindControl('contactsSearchInput', 'input', e => {
      this.state.search = e.target.value.trim();
      this.state.page = 1;
      this.loadAndRefresh();
    });

    [
      ['contactsCompanyFilter', 'company_id'],
      ['contactsStatusFilter', 'contact_status'],
      ['contactsDecisionRoleFilter', 'decision_role'],
      ['contactsPrimaryFilter', 'is_primary_contact'],
      ['contactsCreatedFromFilter', 'created_from'],
      ['contactsCreatedToFilter', 'created_to']
    ].forEach(([id, key]) => {
      bindControl(id, 'change', e => {
        this.state.filters[key] = e.target.value.trim();
        this.state.page = 1;
        this.loadAndRefresh();
      });
    });

    bindControl('contactsDepartmentFilter', 'input', e => {
      this.state.filters.department = e.target.value.trim();
      this.state.page = 1;
      this.loadAndRefresh();
    });

    bindControl('contactsClearFiltersBtn', 'click', () => {
      this.state.search = '';
      this.state.filters = { company_id: '', contact_status: '', decision_role: '', department: '', is_primary_contact: '', created_from: '', created_to: '' };
      ['contactsSearchInput', 'contactsCompanyFilter', 'contactsStatusFilter', 'contactsDecisionRoleFilter', 'contactsDepartmentFilter', 'contactsPrimaryFilter', 'contactsCreatedFromFilter', 'contactsCreatedToFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      this.state.page = 1;
      this.loadAndRefresh();
    });

    bindControl('contactsExportBtn', 'click', () => this.exportCsv());
    bindControl('contactsRowsPerPage', 'change', e => {
      this.state.limit = Number(e.target.value) || 50;
      this.state.page = 1;
      this.loadAndRefresh();
    });

    const rowsSelect = document.getElementById('contactsRowsPerPage');
    if (rowsSelect) rowsSelect.value = String(this.state.limit || 50);
    const companyFilter = document.getElementById('contactsCompanyFilter');
    if (companyFilter && this.state.filters.company_id) companyFilter.value = this.state.filters.company_id;

    await this.ensureFilterCompanies().catch(error => console.warn('[contacts] company filter load failed', error));
    this.bindFormEvents();
    applyPermissionVisibility(view);
  },

  companyRelationId(company = {}) {
    const raw = String(company.id || company.company_uuid || company.companyUuid || '').trim();
    if (raw) return raw;
    const maybeUuid = String(company.company_id || company.companyId || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(maybeUuid) ? maybeUuid : '';
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
    const companyInput = document.getElementById('contactCompanyInput');
    if (companyInput) companyInput.addEventListener('change', () => {
      this.state.selectedCompanyIds = this.getSelectedCompanies().map(company => company.company_id);
      this.renderSelectedCompanyChips();
    });
    window.CrmCompanyContactSelectors?.bindCompanyRemoteSearch?.(companyInput, searchText => this.ensureCompanyOptions(this.state.currentContact || {}, searchText));
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

  async ensureCompanyOptions(existing = {}, searchText = '') {
    const select = document.getElementById('contactCompanyInput');
    if (!select) return [];
    select.disabled = true;
    select.innerHTML = '<option value="">Loading companies…</option>';
    this.setCompanyFallbackMessage('');

    const { rows, unavailable, error } = await this.loadCompanyOptionsSafe(searchText || '');
    const normalizedExisting = this.normalize(existing || {});
    const existingIds = [
      ...(normalizedExisting.company_ids.length ? normalizedExisting.company_ids : [normalizedExisting.company_id || this.state.companyId].filter(Boolean)),
      ...this.state.selectedCompanyIds
    ].filter(Boolean);
    const resolvedExistingIds = (await Promise.all(existingIds.map(companyId => window.CrmCompanyContactSelectors?.resolveCompanyUuid?.(companyId)))).filter(Boolean);
    const rowIds = new Set(rows.map(r => this.companyRelationId(r)).filter(Boolean));
    const mergedRows = [...rows];
    resolvedExistingIds.forEach(companyId => {
      if (rowIds.has(companyId)) return;
      mergedRows.push({ id: companyId, company_uuid: companyId, company_id: companyId, company_name: normalizedExisting.company_name || this.state.companyName || normalizedExisting.company_names || companyId });
      rowIds.add(companyId);
    });

    this.state.companyOptions = mergedRows.map(r => ({
      id: this.companyRelationId(r),
      name: r.legal_name || r.company_name || r.name || this.companyRelationId(r)
    })).filter(company => company.id);
    select.innerHTML = this.state.companyOptions.map(r => `<option value="${U.escapeAttr(r.id)}">${U.escapeHtml(r.name)}</option>`).join('');
    const companyListDenied = unavailable && this.isCompanyListPermissionError(error);
    if (!mergedRows.length || companyListDenied) {
      select.disabled = true;
      this.setCompanyFallbackMessage('Company list is not available for your role. You can still create the contact if company is optional, or ask admin to grant companies list access.');
    } else {
      select.disabled = false;
      this.setCompanyFallbackMessage('');
    }
    this.setSelectedCompanies(this.state.selectedCompanyIds);
    return mergedRows;
  },

  setSelectedCompanies(companyIds = []) {
    const select = document.getElementById('contactCompanyInput');
    if (!select) return;
    const ids = new Set((Array.isArray(companyIds) ? companyIds : [companyIds]).map(v => String(v || '').trim()).filter(Boolean));
    Array.from(select.options).forEach(option => { option.selected = ids.has(option.value); });
    this.state.selectedCompanyIds = Array.from(ids);
    this.renderSelectedCompanyChips();
  },

  renderSelectedCompanyChips() {
    const container = document.getElementById('contactSelectedCompanies');
    if (!container) return;
    const selected = this.state.companyOptions.filter(company => this.state.selectedCompanyIds.includes(company.id));
    container.innerHTML = selected.length
      ? selected.map(company => `<span class='crm-chip'>${U.escapeHtml(company.name)}</span>`).join('')
      : "<span class='muted'>No companies selected</span>";
  },

  getSelectedCompanies() {
    const select = document.getElementById('contactCompanyInput');
    if (!select) return [];
    return Array.from(select.selectedOptions || [])
      .map(option => ({ company_id: String(option.value || '').trim(), company_name: String(option.textContent || '').trim() }))
      .filter(row => row.company_id);
  },

  async resolveSelectedCompanies(selectedCompanies = []) {
    const resolved = [];
    for (const company of selectedCompanies) {
      const resolvedId = await window.CrmCompanyContactSelectors?.resolveCompanyUuid?.(company.company_id);
      if (!resolvedId) return null;
      const fkValue = await window.CrmCompanyContactSelectors?.getCompanyContactFkValue?.(resolvedId).catch(() => resolvedId) || resolvedId;
      resolved.push({
        ...company,
        company_id: resolvedId,
        company_uuid: resolvedId,
        contact_company_fk_value: fkValue,
        company_name: company.company_name || resolvedId
      });
    }
    return resolved;
  },


  getSupabaseClient() {
    return window.SupabaseClient?.getClient?.() || window.supabaseClient || window.supabase || null;
  },

  async loadContactCompanyAssignments(contactId, fallbackContact = {}) {
    const client = this.getSupabaseClient();
    const fallbackIds = this.normalizeCompanyIds(fallbackContact);
    if (!client?.from || !contactId) return fallbackIds;
    const { data, error } = await client
      .from('contact_company_assignments')
      .select('company_id, is_primary')
      .eq('contact_id', contactId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw error;
    const ids = (data || []).map(row => String(row.company_id || '').trim()).filter(Boolean);
    if (!ids.length && fallbackContact.company_id) return [fallbackContact.company_id];
    return ids.length ? ids : fallbackIds;
  },

  async saveContactCompanyAssignments(contactId, resolvedCompanies = []) {
    const client = this.getSupabaseClient();
    const uniqueCompanyIds = [...new Set((resolvedCompanies || []).map(company => String(company.company_id || company || '').trim()).filter(Boolean))];
    if (!client?.from || !contactId) {
      await this.linkSavedContactToCompanies(contactId, resolvedCompanies);
      return;
    }
    const { error: deleteError } = await client
      .from('contact_company_assignments')
      .delete()
      .eq('contact_id', contactId);
    if (deleteError) throw deleteError;
    if (uniqueCompanyIds.length) {
      const rows = uniqueCompanyIds.map((companyId, index) => ({
        contact_id: contactId,
        company_id: companyId,
        is_primary: index === 0
      }));
      const { error: insertError } = await client
        .from('contact_company_assignments')
        .insert(rows);
      if (insertError) throw insertError;
    }
    const primaryCompany = resolvedCompanies.find(company => company.company_id === uniqueCompanyIds[0]) || {};
    const primaryCompanyId = primaryCompany.contact_company_fk_value || uniqueCompanyIds[0] || null;
    const { error: updateError } = await client
      .from('contacts')
      .update({
        company_id: primaryCompanyId,
        company_ids: uniqueCompanyIds,
        company_names: resolvedCompanies.map(company => company.company_name || company.company_id).filter(Boolean).join(', '),
        updated_at: new Date().toISOString()
      })
      .eq('id', contactId);
    if (updateError) throw updateError;
    await this.linkSavedContactToCompanies(contactId, resolvedCompanies).catch(error => console.warn('[contacts] legacy contact-company link sync failed', error));
  },

  async hydrateRowsWithCompanyAssignments(rows = []) {
    const client = this.getSupabaseClient();
    const ids = rows.map(row => String(row.id || '').trim()).filter(Boolean);
    if (!client?.from || !ids.length) return rows;
    try {
      const { data, error } = await client
        .from('contact_company_assignments')
        .select('contact_id, company_id, is_primary, companies(id, legal_name, company_name, name)')
        .in('contact_id', ids);
      if (error) throw error;
      const byContact = new Map();
      (data || []).forEach(row => {
        const contactId = String(row.contact_id || '').trim();
        if (!contactId) return;
        if (!byContact.has(contactId)) byContact.set(contactId, []);
        byContact.get(contactId).push(row);
      });
      return rows.map(row => {
        const assignments = byContact.get(String(row.id || '').trim()) || [];
        if (!assignments.length) return row;
        const ordered = assignments.slice().sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)));
        const companyIds = ordered.map(item => String(item.company_id || '').trim()).filter(Boolean);
        const companyNames = ordered.map(item => {
          const company = item.companies || {};
          return company.legal_name || company.company_name || company.name || item.company_id;
        }).filter(Boolean);
        return {
          ...row,
          company_id: companyIds[0] || row.company_id,
          company_name: companyNames[0] || row.company_name,
          company_ids: companyIds,
          company_names: companyNames.join(', ')
        };
      });
    } catch (error) {
      console.warn('[contacts] contact-company assignment hydrate failed', error);
      return rows;
    }
  },

  async linkSavedContactToCompanies(savedContactKey, resolvedCompanies = []) {
    const companyIds = (resolvedCompanies || []).map(c => c.company_id).filter(Boolean);
    if (!savedContactKey || !companyIds.length) return;
    await window.CrmCompanyContactSelectors?.upsertContactCompanyLinks?.(savedContactKey, companyIds);
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
    this.state.currentContact = data;
    const selectedCompanyIds = data.company_ids.length ? data.company_ids : [data.company_id || this.state.companyId].filter(Boolean);
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
    window.ModalScrollLock?.lock?.() || document.body.classList.add('modal-open');

    this.ensureCompanyOptions(data)
      .then(async () => {
        const assignmentIds = isEdit && data.id ? await this.loadContactCompanyAssignments(data.id, data) : selectedCompanyIds;
        const resolvedIds = (await Promise.all((assignmentIds || []).map(id => window.CrmCompanyContactSelectors?.resolveCompanyUuid?.(id)))).filter(Boolean);
        this.setSelectedCompanies(resolvedIds.length ? resolvedIds : assignmentIds);
      })
      .catch(error => {
        console.warn('[contacts] company selector load failed after modal open', error);
        this.setCompanyFallbackMessage('Company list is not available for your role. You can still create the contact if company is optional, or ask admin to grant companies list access.');
      });
  },

  closeForm() {
    document.getElementById('contactForm')?.reset();
    document.getElementById('contactRecordId').value = '';
    document.getElementById('contactStatusInput').value = 'Active';
    this.state.currentContact = null;
    this.state.selectedCompanyIds = [];
    this.renderSelectedCompanyChips();
    const modal = document.getElementById('contactModal');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    window.ModalScrollLock?.unlock?.() || document.body.classList.remove('modal-open');
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
    const resolvedCompanies = await this.resolveSelectedCompanies(selectedCompanies);
    if (!resolvedCompanies || resolvedCompanies.some(company => !company.company_id)) {
      UI?.toast?.('Selected company could not be resolved. Please reselect the company.', 'error');
      return;
    }
    selectedCompanies.splice(0, selectedCompanies.length, ...resolvedCompanies);
    const first_name = document.getElementById('contactFirstNameInput').value.trim();
    const last_name = document.getElementById('contactLastNameInput').value.trim();
    if (!first_name && !last_name) {
      UI?.toast?.('First Name or Last Name is required', 'error');
      return;
    }
    const full_name = U.buildContactDisplayName({ first_name, last_name });
    const primaryCompany = selectedCompanies[0];
    const payload = {
      // contacts.company_id may be a FK to a company UUID column different from companies.id.
      // Store that FK-safe value in company_id, while company_ids keeps the canonical companies.id UUIDs for multi-assignment and dropdown RPCs.
      company_id: primaryCompany.contact_company_fk_value || primaryCompany.company_id,
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
      const response = await Api.requestWithSession('contacts', action, body, { requireAuth: true });
      const savedRow = response?.data || response?.row || response?.contact || response || {};
      const savedContactKey = savedRow.id || savedRow.contact_uuid || savedRow.contact_id || recordId || payload.email || payload.full_name;
      await this.saveContactCompanyAssignments(savedContactKey, selectedCompanies);
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
    await this.ensureControls();
    try {
      const filters = { ...this.state.filters };
      if (this.state.companyId) filters.company_id = this.state.companyId;
      const res = await Api.requestWithSession('contacts', 'list', { page: this.state.page, limit: this.state.limit, search: this.state.search, filters, sortBy: this.state.sortBy, sortDir: this.state.sortDir }, { requireAuth: true });
      const rows = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];
      this.state.rows = await this.hydrateRowsWithCompanyAssignments(rows.map(r => this.normalize(r)));
      this.state.total = Number(res?.total ?? rows.length) || rows.length;
      await this.refreshSummaryMetricsForCurrentFilters(filters);
      this.render();
    } catch (e) {
      UI?.toast?.('Unable to load contacts', 'error');
      console.error(e);
    }
  },


  findDetailsRow(id) { const target = String(id || '').trim(); if (!target) return null; return (this.state.rows || []).find(row => [row.id, row.contact_id, row.email].some(value => String(value || '').trim() === target)) || null; },
  openDetailsDrawer(rowOrId) {
    const r = typeof rowOrId === 'string' ? this.findDetailsRow(rowOrId) : rowOrId;
    if (!r || !window.RecordDetailsDrawer) return;
    const id = String(r.id || r.contact_id || '').trim();
    const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ') || r.full_name || r.contact_name || 'Contact Details';
    this.state.selectedDetailsId = id;
    window.RecordDetailsDrawer.open({
      eyebrow: 'CRM · Contact',
      title: fullName,
      subtitle: [r.company_names || r.company_name, r.job_title, r.contact_status].filter(Boolean).join(' · '),
      sections: [
        { title: 'Summary', cards: [
          ['Contact ID', r.contact_id],
          ['Status', r.contact_status],
          ['Primary Contact', r.is_primary_contact ? 'Yes' : 'No'],
          ['Decision Role', r.decision_role],
          ['Department', r.department],
          ['Created At', U.fmtTS(r.created_at)]
        ] },
        { title: 'Contact Information', fields: [
          ['First Name', r.first_name],
          ['Last Name', r.last_name],
          ['Job Title', r.job_title],
          ['Department', r.department],
          ['Decision Role', r.decision_role],
          ['Status', r.contact_status]
        ] },
        { title: 'Company & Communication', fields: [
          ['Company', r.company_names || r.company_name],
          ['Email', r.email],
          ['Phone', r.phone],
          ['Mobile', r.mobile],
          ['LinkedIn', r.linkedin],
          ['Updated At', U.fmtTS(r.updated_at)]
        ] },
        { title: 'Notes', html: `<div class="lead-details-notes">${U.escapeHtml(r.notes || 'No notes added yet.')}</div>` }
      ],
      actions: [
        Permissions.canCreate('leads') ? { label: 'Create Lead', variant: 'primary', permissionResource: 'leads', permissionAction: 'create', onClick: () => this.onAction('lead', id) } : null,
        Permissions.canEdit('contacts') ? { label: 'Edit', variant: 'ghost', permissionResource: 'contacts', permissionAction: 'update', onClick: () => this.onAction('edit', id) } : null,
        Permissions.canDelete('contacts') ? { label: 'Delete', variant: 'ghost', permissionResource: 'contacts', permissionAction: 'delete', onClick: () => this.onAction('del', id) } : null
      ].filter(Boolean)
    });
    this.render();
  },
  updateSummaryMetrics(rows = this.state.rows) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    this.state.summary = {
      totalContacts: Number(this.state.total || sourceRows.length) || 0,
      activeContacts: sourceRows.filter(row => String(row.contact_status || '').trim().toLowerCase() === 'active').length,
      primaryContacts: sourceRows.filter(row => Boolean(row.is_primary_contact)).length,
      withEmail: sourceRows.filter(row => String(row.email || '').trim()).length
    };
  },

  async refreshSummaryMetricsForCurrentFilters(filters = null) {
    const total = Number(this.state.total || 0) || 0;
    if (!total || total <= this.state.rows.length) {
      this.updateSummaryMetrics(this.state.rows);
      return;
    }
    const safeLimit = Math.min(total, 1000);
    try {
      const res = await Api.requestWithSession('contacts', 'list', {
        page: 1,
        limit: safeLimit,
        search: this.state.search,
        filters: filters || this.state.filters,
        sortBy: this.state.sortBy,
        sortDir: this.state.sortDir
      }, { requireAuth: true });
      const rows = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];
      this.state.total = Number(res?.total ?? this.state.total ?? rows.length) || rows.length;
      this.updateSummaryMetrics(rows.map(row => this.normalize(row)));
    } catch (error) {
      console.warn('[contacts] unable to refresh summary metrics, using current page rows', error);
      this.updateSummaryMetrics(this.state.rows);
    }
  },

  formatPercent(value = 0, total = 0) {
    const denom = Number(total || 0);
    if (!denom) return '0.0% of total';
    return `${((Number(value || 0) / denom) * 100).toFixed(1)}% of total`;
  },

  renderContactSummaryCards() {
    const grid = document.getElementById('contactsSummaryGrid');
    if (!grid) return;
    const summary = this.state.summary || {};
    const total = Number(summary.totalContacts || 0) || 0;
    const cards = [
      { label: 'Total Contacts', value: total, subtitle: 'All time', icon: '♙', tone: 'violet' },
      { label: 'Active Contacts', value: summary.activeContacts || 0, subtitle: this.formatPercent(summary.activeContacts, total), icon: '✓', tone: 'green' },
      { label: 'Primary Contacts', value: summary.primaryContacts || 0, subtitle: this.formatPercent(summary.primaryContacts, total), icon: '☑', tone: 'orange' },
      { label: 'With Email', value: summary.withEmail || 0, subtitle: this.formatPercent(summary.withEmail, total), icon: '✉', tone: 'blue' }
    ];
    grid.innerHTML = cards.map(card => `
      <article class="contacts-summary-card contacts-summary-card--${U.escapeAttr(card.tone)}">
        <div class="contacts-summary-icon" aria-hidden="true">${U.escapeHtml(card.icon)}</div>
        <div>
          <span>${U.escapeHtml(card.label)}</span>
          <strong>${U.escapeHtml(card.value)}</strong>
          <small>${U.escapeHtml(card.subtitle)}</small>
        </div>
      </article>`).join('');
  },

  getContactFullName(row = {}) {
    return [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.full_name || row.contact_name || row.email || row.contact_id || 'Contact';
  },

  getContactInitials(name = '') {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const initials = parts.slice(0, 2).map(part => part[0]).join('').toUpperCase();
    return initials || '?';
  },

  getAvatarTone(row = {}) {
    const key = this.getContactFullName(row);
    const code = key.charCodeAt(0) || 0;
    return ['violet','blue','green','orange'][code % 4];
  },

  renderContactNameCell(row = {}) {
    const fullName = this.getContactFullName(row);
    return `<span class="contact-name-wrap"><span class="contact-avatar contact-avatar--${U.escapeAttr(this.getAvatarTone(row))}" aria-hidden="true">${U.escapeHtml(this.getContactInitials(fullName))}</span><span>${U.escapeHtml(fullName)}</span></span>`;
  },

  renderPrimaryBadge(row = {}) {
    const isPrimary = Boolean(row.is_primary_contact);
    return `<span class="contacts-chip contacts-chip--${isPrimary ? 'success' : 'danger'}">${isPrimary ? 'Yes' : 'No'}</span>`;
  },

  renderStatusBadge(status = '') {
    const clean = String(status || 'Active').trim() || 'Active';
    const normalized = clean.toLowerCase();
    let tone = 'neutral';
    if (normalized === 'active') tone = 'success';
    else if (normalized.includes('do not')) tone = 'danger';
    else if (normalized.includes('left')) tone = 'warning';
    return `<span class="contacts-chip contacts-chip--${tone}">${U.escapeHtml(clean)}</span>`;
  },

  renderContactActions(row, permissions = {}) {
    const id = U.escapeAttr(row.id || row.contact_id || '');
    const items = [];
    if (permissions.canCreateLead) items.push(`<button type="button" data-a="lead" data-permission-resource="leads" data-permission-action="create" data-id="${id}">Create Lead</button>`);
    if (permissions.canEdit) items.push(`<button type="button" data-a="edit" data-contact-edit="${id}" data-permission-resource="contacts" data-permission-action="update" data-id="${id}">Edit</button>`);
    if (permissions.canDelete) items.push(`<button type="button" class="danger" data-a="del" data-permission-resource="contacts" data-permission-action="delete" data-id="${id}">Delete</button>`);
    return `
      <div class="contact-row-actions">
        <button class="contact-view-btn" type="button" data-a="view" data-id="${id}">View</button>
        <div class="contact-actions-menu">
          <button class="contact-more-btn" type="button" data-contact-more="${id}" aria-label="More actions">⋮</button>
          <div class="contact-actions-popover" role="menu">${items.join('') || '<span class="contact-no-actions">No actions</span>'}</div>
        </div>
      </div>`;
  },

  renderContactPagination(start, end) {
    const pagination = document.getElementById('contactsPagination');
    const footerInfo = document.getElementById('contactsFooterInfo');
    const pageInfo = document.getElementById('contactsPageInfo');
    const total = Number(this.state.total || 0) || 0;
    const totalPages = Math.max(1, Math.ceil(total / (Number(this.state.limit) || 50)));
    const current = Math.min(Math.max(1, Number(this.state.page) || 1), totalPages);
    const info = total ? `Showing ${start}-${end} of ${total} records` : 'Showing 0 records';
    if (pageInfo) pageInfo.textContent = info;
    if (footerInfo) footerInfo.textContent = info;
    if (!pagination) return;
    const pageNumbers = new Set([1, current - 1, current, current + 1, totalPages]);
    const pages = [...pageNumbers].filter(page => page >= 1 && page <= totalPages).sort((a, b) => a - b);
    const parts = [`<button type="button" class="contacts-page-btn" data-contacts-page="prev" ${current <= 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>`];
    let previous = 0;
    pages.forEach(page => {
      if (previous && page - previous > 1) parts.push('<span class="contacts-page-ellipsis">…</span>');
      parts.push(`<button type="button" class="contacts-page-btn ${page === current ? 'is-active' : ''}" data-contacts-page="${page}" ${page === current ? 'aria-current="page"' : ''}>${page}</button>`);
      previous = page;
    });
    parts.push(`<button type="button" class="contacts-page-btn" data-contacts-page="next" ${current >= totalPages ? 'disabled' : ''} aria-label="Next page">›</button>`);
    pagination.innerHTML = parts.join('');
    pagination.querySelectorAll('[data-contacts-page]').forEach(button => {
      button.onclick = () => {
        const value = button.getAttribute('data-contacts-page');
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

  bindContactActionMenuClose() {
    if (this._contactActionMenuBound) return;
    this._contactActionMenuBound = true;
    document.addEventListener('click', event => {
      if (event.target?.closest?.('.contact-actions-menu')) return;
      document.querySelectorAll('.contact-actions-menu.is-open').forEach(menu => menu.classList.remove('is-open'));
    });
  },

  render() {
    const b = document.getElementById('contactsTableBody');
    if (!b) return;
    const canEdit = Permissions.canEdit('contacts');
    const canDelete = Permissions.canDelete('contacts');
    const canCreateLead = Permissions.canCreate('leads');
    const permissions = { canEdit, canDelete, canCreateLead };
    this.renderContactSummaryCards();
    b.innerHTML = this.state.rows.map(r => {
      const selected = String(this.state.selectedDetailsId || '') === String(r.id || r.contact_id || '');
      return `<tr class='entity-clickable-row contact-row${selected ? ' is-selected' : ''}' tabindex='0' data-contact-row='${U.escapeAttr(r.id || r.contact_id || '')}' aria-label='Open contact ${U.escapeAttr(this.getContactFullName(r))} details'>
        <td class="contact-id-cell">${U.escapeHtml(r.contact_id || '—')}</td>
        <td class="contact-name-cell">${this.renderContactNameCell(r)}</td>
        <td>${U.escapeHtml(r.company_names || r.company_name || '—')}</td>
        <td>${U.escapeHtml(r.job_title || '—')}</td>
        <td>${U.escapeHtml(r.department || '—')}</td>
        <td class="contact-email-cell">${U.escapeHtml(r.email || '—')}</td>
        <td>${U.escapeHtml(r.phone || r.mobile || '—')}</td>
        <td>${this.renderPrimaryBadge(r)}</td>
        <td>${this.renderStatusBadge(r.contact_status)}</td>
        <td>${this.renderContactActions(r, permissions)}</td>
      </tr>`;
    }).join('');
    b.querySelectorAll('[data-a]').forEach(button => button.onclick = event => { event?.stopPropagation?.(); this.onAction(button.dataset.a, button.dataset.id); });
    b.querySelectorAll('[data-contact-more]').forEach(button => button.onclick = event => {
      event?.stopPropagation?.();
      const menu = button.closest('.contact-actions-menu');
      const isOpen = menu?.classList.contains('is-open');
      document.querySelectorAll('.contact-actions-menu.is-open').forEach(item => item.classList.remove('is-open'));
      if (menu && !isOpen) menu.classList.add('is-open');
    });
    b.querySelectorAll('tr[data-contact-row]').forEach(tr => {
      tr.onclick = event => { if (event.target?.closest?.('.contact-row-actions,button,a,input,select,textarea')) return; this.openDetailsDrawer(tr.getAttribute('data-contact-row')); };
      tr.onkeydown = event => { if (!['Enter', ' '].includes(event.key)) return; event.preventDefault(); this.openDetailsDrawer(tr.getAttribute('data-contact-row')); };
    });
    this.bindContactActionMenuClose();
    const s = this.state.total ? ((this.state.page - 1) * this.state.limit) + 1 : 0;
    const e = Math.min(this.state.page * this.state.limit, this.state.total);
    this.renderContactPagination(s, e);
    applyPermissionVisibility(b);
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
    const target = String(id || '').trim();
    const r = this.state.rows.find(x => [x.id, x.contact_id, x.email].some(value => String(value || '').trim() === target));
    if (!r) return;
    if (a === 'view') {
      this.openDetailsDrawer(r);
      return;
    }
    if (a === 'lead') {
      if (!Permissions.can('leads', 'create') || !Permissions.canCreate('leads')) {
        UI?.toast?.('You do not have permission to create leads.');
        return;
      }
      window.Leads?.openLeadCreateFormWithPrefill?.({ contact: r });
      return;
    }
    if (a === 'edit') {
      this.openForm(r, true);
      return;
    }
    if (a === 'del') {
      if (!Permissions.canDelete('contacts')) { UI?.toast?.('You do not have permission for this action.'); return; }
      if (!confirm('Delete contact?')) return;
      await Api.requestWithSession('contacts', 'delete', { id: r.id || target }, { requireAuth: true });
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
