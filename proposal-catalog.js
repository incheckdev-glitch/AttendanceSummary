const ProposalCatalog = {
  sectionValues: ['annual_saas', 'one_time_fee', 'capability'],
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
    section: 'All',
    active: 'All',
    page: 1,
    limit: 50,
    offset: 0,
    returned: 0,
    hasMore: false,
    total: 0,
    sort: 'updated_desc',
    formMode: 'create',
    currentId: ''
  },
  normalizeText(value) {
    return String(value ?? '').trim();
  },
  toNumberOrNull(value) {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const parsed = Number(raw.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  },
  toBool(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (!normalized) return fallback;
    if (['true', '1', 'yes', 'y', 'active'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'inactive'].includes(normalized)) return false;
    return fallback;
  },
  normalizeItem(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const pick = (...values) => {
      for (const value of values) {
        if (value !== undefined && value !== null) return value;
      }
      return '';
    };
    const section = String(pick(source.section, source.item_section, 'annual_saas'))
      .trim()
      .toLowerCase();
    return {
      catalog_item_id: this.normalizeText(pick(source.catalog_item_id, source.catalogItemId, source.id)),
      created_at: this.normalizeText(pick(source.created_at, source.createdAt)),
      updated_at: this.normalizeText(pick(source.updated_at, source.updatedAt)),
      is_active: this.toBool(pick(source.is_active, source.isActive), true),
      section: this.sectionValues.includes(section) ? section : 'annual_saas',
      category: this.normalizeText(source.category),
      item_name: this.normalizeText(pick(source.item_name, source.itemName, source.name)),
      default_location_name: this.normalizeText(
        pick(source.default_location_name, source.defaultLocationName, source.location_name)
      ),
      unit_price: this.toNumberOrNull(pick(source.unit_price, source.unitPrice)),
      discount_percent: this.toNumberOrNull(pick(source.discount_percent, source.discountPercent)),
      quantity: this.toNumberOrNull(source.quantity),
      capability_name: this.normalizeText(pick(source.capability_name, source.capabilityName)),
      capability_value: this.normalizeText(pick(source.capability_value, source.capabilityValue)),
      notes: this.normalizeText(source.notes),
      sort_order: this.toNumberOrNull(pick(source.sort_order, source.sortOrder))
    };
  },
  extractRows(response) {
    const candidates = [
      response,
      response?.items,
      response?.rows,
      response?.data,
      response?.result,
      response?.payload,
      response?.data?.items
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  },
  extractListResult(response) {
    if (response && typeof response === 'object' && Array.isArray(response.rows)) {
      const total = Number(response.total ?? response.rows.length) || response.rows.length;
      const returned = Number(response.returned ?? response.rows.length) || response.rows.length;
      const limit = Number(response.limit || this.state.limit || 50);
      const page = Number(response.page || this.state.page || 1);
      const offset = Number(response.offset ?? Math.max(0, (page - 1) * limit));
      const hasMore = response.hasMore !== undefined
        ? Boolean(response.hasMore)
        : response.has_more !== undefined
          ? Boolean(response.has_more)
          : offset + returned < total;
      return { rows: response.rows, total, returned, hasMore, page, limit, offset };
    }
    const rows = this.extractRows(response);
    const limit = Number(this.state.limit || 50);
    const page = Number(this.state.page || 1);
    const returned = rows.length;
    const offset = Math.max(0, (page - 1) * limit);
    return {
      rows,
      total: rows.length,
      returned,
      hasMore: false,
      page,
      limit,
      offset
    };
  },
  async listProposalCatalogItems(options = {}) {
    return Api.listProposalCatalogItems({
      limit: Number(options.limit || this.state.limit || 50),
      page: Number(options.page || this.state.page || 1),
      sort_by: options.sort_by || options.sortBy || 'updated_at',
      sort_dir: options.sort_dir || options.sortDir || 'desc',
      search: options.search !== undefined ? options.search : this.state.search || '',
      summary_only: options.summary_only !== false,
      forceRefresh: options.forceRefresh === true
    });
  },
  upsertLocalRow(row) {
    const normalized = this.normalizeItem(row);
    const idx = this.state.rows.findIndex(item => item.catalog_item_id === normalized.catalog_item_id);
    if (idx === -1) this.state.rows.unshift(normalized);
    else this.state.rows[idx] = { ...this.state.rows[idx], ...normalized };
    this.applyFilters();
    this.renderSummary();
    this.render();
  },
  removeLocalRow(id) {
    this.state.rows = this.state.rows.filter(item => item.catalog_item_id !== id);
    this.applyFilters();
    this.renderSummary();
    this.render();
  },
  async getProposalCatalogItem(catalogItemId) {
    return Api.getProposalCatalogItem(catalogItemId);
  },
  async createProposalCatalogItem(item) {
    return Api.createProposalCatalogItem(item);
  },
  async updateProposalCatalogItem(catalogItemId, updates) {
    return Api.updateProposalCatalogItem(catalogItemId, updates);
  },
  async deleteProposalCatalogItem(catalogItemId) {
    return Api.deleteProposalCatalogItem(catalogItemId);
  },
  applyFilters() {
    const terms = String(this.state.search || '')
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const sectionFilter = String(this.state.section || 'All').trim();
    const activeFilter = String(this.state.active || 'All').trim();
    const sortMode = String(this.state.sort || 'updated_desc').trim();

    const filtered = this.state.rows.filter(item => {
      if (sectionFilter !== 'All' && item.section !== sectionFilter) return false;
      if (activeFilter === 'active' && !item.is_active) return false;
      if (activeFilter === 'inactive' && item.is_active) return false;

      const hay = [item.item_name, item.category, item.notes].join(' ').toLowerCase();
      if (terms.length && !terms.every(term => hay.includes(term))) return false;
      return true;
    });

    const byDateDesc = key => (a, b) => {
      const da = new Date(String(a?.[key] || ''));
      const db = new Date(String(b?.[key] || ''));
      if (isNaN(da) && isNaN(db)) return 0;
      if (isNaN(da)) return 1;
      if (isNaN(db)) return -1;
      return db - da;
    };

    if (sortMode === 'sort_order_asc') {
      filtered.sort((a, b) => {
        const av = a.sort_order ?? Number.MAX_SAFE_INTEGER;
        const bv = b.sort_order ?? Number.MAX_SAFE_INTEGER;
        if (av !== bv) return av - bv;
        return String(a.catalog_item_id || '').localeCompare(String(b.catalog_item_id || ''));
      });
    } else if (sortMode === 'created_desc') {
      filtered.sort(byDateDesc('created_at'));
    } else {
      filtered.sort(byDateDesc('updated_at'));
    }

    this.state.filteredRows = filtered;
  },
  renderSummary() {
    if (!E.proposalCatalogSummary) return;
    const rows = this.state.filteredRows;
    const countBySection = section => rows.filter(item => item.section === section).length;
    const cards = [
      { label: 'Total Items', value: rows.length },
      { label: 'Active Items', value: rows.filter(item => item.is_active).length },
      { label: 'Annual SaaS Items', value: countBySection('annual_saas') },
      { label: 'One-Time Fee Items', value: countBySection('one_time_fee') },
      { label: 'Capability Items', value: countBySection('capability') }
    ];

    E.proposalCatalogSummary.innerHTML = cards
      .map(
        card => `<div class="card kpi">
          <div class="label">${U.escapeHtml(card.label)}</div>
          <div class="value">${U.escapeHtml(String(card.value))}</div>
        </div>`
      )
      .join('');
  },
  formatNumber(value) {
    if (value === null || value === undefined || value === '') return '—';
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  },
  render() {
    if (!E.proposalCatalogState || !E.proposalCatalogTbody) return;

    if (this.state.loading) {
      E.proposalCatalogState.textContent = 'Loading proposal catalog items…';
      E.proposalCatalogTbody.innerHTML =
        '<tr><td colspan="14" class="muted" style="text-align:center;">Loading proposal catalog items…</td></tr>';
      return;
    }

    if (this.state.loadError) {
      E.proposalCatalogState.textContent = this.state.loadError;
      E.proposalCatalogTbody.innerHTML = `<tr><td colspan="14" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(
        this.state.loadError
      )}</td></tr>`;
      return;
    }

    const rows = this.state.filteredRows;
    E.proposalCatalogState.textContent = `${rows.length} catalog item${rows.length === 1 ? '' : 's'}`;
    if (!rows.length) {
      E.proposalCatalogTbody.innerHTML =
        '<tr><td colspan="14" class="muted" style="text-align:center;">No catalog items found.</td></tr>';
      return;
    }

    const textCell = value => U.escapeHtml(this.normalizeText(value) || '—');
    const activeCell = value =>
      value
        ? '<span class="pill status-Resolved">Active</span>'
        : '<span class="pill status-Rejected">Inactive</span>';

    E.proposalCatalogTbody.innerHTML = rows
      .map(row => {
        const id = U.escapeAttr(row.catalog_item_id || '');
        return `<tr>
          <td>${textCell(row.catalog_item_id)}</td>
          <td>${activeCell(row.is_active)}</td>
          <td>${textCell(row.section)}</td>
          <td>${textCell(row.category)}</td>
          <td>${textCell(row.item_name)}</td>
          <td>${textCell(row.default_location_name)}</td>
          <td>${this.formatNumber(row.unit_price)}</td>
          <td>${this.formatNumber(row.discount_percent)}</td>
          <td>${this.formatNumber(row.quantity)}</td>
          <td>${textCell(row.capability_name)}</td>
          <td>${textCell(row.capability_value)}</td>
          <td>${this.formatNumber(row.sort_order)}</td>
          <td>${textCell(row.updated_at)}</td>
          <td>
            ${Permissions.canUpdateProposalCatalogItem() ? `<button class=\"btn ghost sm\" type=\"button\" data-proposal-catalog-edit=\"${id}\">Edit</button>` : ''}
            ${Permissions.canDeleteProposalCatalogItem() ? `<button class=\"btn ghost sm\" type=\"button\" data-proposal-catalog-delete=\"${id}\">Delete</button>` : ''}
          </td>
        </tr>`;
      })
      .join('');
  },
  renderFilters() {
    if (E.proposalCatalogSearchInput) E.proposalCatalogSearchInput.value = this.state.search;
    if (E.proposalCatalogSectionFilter) E.proposalCatalogSectionFilter.value = this.state.section;
    if (E.proposalCatalogActiveFilter) E.proposalCatalogActiveFilter.value = this.state.active;
    if (E.proposalCatalogSortFilter) E.proposalCatalogSortFilter.value = this.state.sort;
  },
  async loadAndRefresh({ force = false } = {}) {
    if (!Session.isAuthenticated()) return;
    if (this.state.loading && !force) return;
    const hasWarmCache = this.state.loaded && Date.now() - this.state.lastLoadedAt <= this.state.cacheTtlMs;
    if (hasWarmCache && !force) {
      this.applyFilters();
      this.renderSummary();
      this.renderFilters();
      this.render();
      return;
    }

    this.state.loading = true;
    this.state.loadError = '';
    this.render();

    try {
      const response = await this.listProposalCatalogItems({
        forceRefresh: force,
        limit: this.state.limit,
        page: this.state.page
      });
      const normalized = this.extractListResult(response);
      this.state.rows = normalized.rows.map(item => this.normalizeItem(item));
      this.state.total = normalized.total;
      this.state.returned = normalized.returned;
      this.state.hasMore = normalized.hasMore;
      this.state.page = normalized.page;
      this.state.limit = normalized.limit;
      this.state.offset = normalized.offset;
      this.state.loaded = true;
      this.state.lastLoadedAt = Date.now();
      this.applyFilters();
      this.renderSummary();
      this.renderFilters();
      this.render();
    } catch (error) {
      if (typeof isAuthError === 'function' && isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      this.state.rows = [];
      this.state.filteredRows = [];
      this.state.loadError = String(error?.message || '').trim() || 'Unable to load proposal catalog.';
      this.renderSummary();
      this.render();
      UI.toast(this.state.loadError);
    } finally {
      this.state.loading = false;
      this.render();
    }
  },
  getValue(el) {
    return String(el?.value || '').trim();
  },
  openForm(item = null) {
    if (!E.proposalCatalogFormModal || !E.proposalCatalogForm) return;
    const normalized = item ? this.normalizeItem(item) : this.normalizeItem({});
    const mode = normalized.catalog_item_id ? 'edit' : 'create';
    this.state.formMode = mode;
    this.state.currentId = normalized.catalog_item_id || '';

    E.proposalCatalogForm.dataset.mode = mode;
    E.proposalCatalogForm.dataset.id = normalized.catalog_item_id || '';
    if (E.proposalCatalogFormTitle)
      E.proposalCatalogFormTitle.textContent =
        mode === 'edit' ? `Edit Catalog Item · ${normalized.catalog_item_id}` : 'Create Catalog Item';
    if (E.proposalCatalogFormItemId) E.proposalCatalogFormItemId.value = normalized.catalog_item_id || '';
    if (E.proposalCatalogFormIsActive) E.proposalCatalogFormIsActive.value = normalized.is_active ? 'true' : 'false';
    if (E.proposalCatalogFormSection) E.proposalCatalogFormSection.value = normalized.section || 'annual_saas';
    if (E.proposalCatalogFormCategory) E.proposalCatalogFormCategory.value = normalized.category || '';
    if (E.proposalCatalogFormItemName) E.proposalCatalogFormItemName.value = normalized.item_name || '';
    if (E.proposalCatalogFormLocation)
      E.proposalCatalogFormLocation.value = normalized.default_location_name || '';
    if (E.proposalCatalogFormUnitPrice) E.proposalCatalogFormUnitPrice.value = normalized.unit_price ?? '';
    if (E.proposalCatalogFormDiscountPercent)
      E.proposalCatalogFormDiscountPercent.value = normalized.discount_percent ?? '';
    if (E.proposalCatalogFormQuantity) E.proposalCatalogFormQuantity.value = normalized.quantity ?? '';
    if (E.proposalCatalogFormCapabilityName)
      E.proposalCatalogFormCapabilityName.value = normalized.capability_name || '';
    if (E.proposalCatalogFormCapabilityValue)
      E.proposalCatalogFormCapabilityValue.value = normalized.capability_value || '';
    if (E.proposalCatalogFormSortOrder) E.proposalCatalogFormSortOrder.value = normalized.sort_order ?? '';
    if (E.proposalCatalogFormNotes) E.proposalCatalogFormNotes.value = normalized.notes || '';
    if (E.proposalCatalogFormDeleteBtn)
      E.proposalCatalogFormDeleteBtn.style.display = mode === 'edit' && Permissions.canDeleteProposalCatalogItem() ? '' : 'none';
    if (E.proposalCatalogFormSaveBtn) {
      const canSave = mode === 'edit' ? Permissions.canUpdateProposalCatalogItem() : Permissions.canCreateProposalCatalogItem();
      E.proposalCatalogFormSaveBtn.style.display = canSave ? '' : 'none';
    }

    E.proposalCatalogFormModal.style.display = 'flex';
    E.proposalCatalogFormModal.setAttribute('aria-hidden', 'false');
  },
  closeForm() {
    if (!E.proposalCatalogFormModal || !E.proposalCatalogForm) return;
    E.proposalCatalogFormModal.style.display = 'none';
    E.proposalCatalogFormModal.setAttribute('aria-hidden', 'true');
    E.proposalCatalogForm.reset();
  },
  collectFormPayload() {
    const section = this.getValue(E.proposalCatalogFormSection) || 'annual_saas';
    return {
      is_active: this.toBool(this.getValue(E.proposalCatalogFormIsActive), true),
      section: this.sectionValues.includes(section) ? section : 'annual_saas',
      category: this.getValue(E.proposalCatalogFormCategory),
      item_name: this.getValue(E.proposalCatalogFormItemName),
      default_location_name: this.getValue(E.proposalCatalogFormLocation),
      unit_price: this.toNumberOrNull(this.getValue(E.proposalCatalogFormUnitPrice)),
      discount_percent: this.toNumberOrNull(this.getValue(E.proposalCatalogFormDiscountPercent)),
      quantity: this.toNumberOrNull(this.getValue(E.proposalCatalogFormQuantity)),
      capability_name: this.getValue(E.proposalCatalogFormCapabilityName),
      capability_value: this.getValue(E.proposalCatalogFormCapabilityValue),
      notes: this.getValue(E.proposalCatalogFormNotes),
      sort_order: this.toNumberOrNull(this.getValue(E.proposalCatalogFormSortOrder))
    };
  },
  sanitizePayload(payload) {
    const out = { ...payload };
    Object.keys(out).forEach(key => {
      if (out[key] === null) delete out[key];
      if (typeof out[key] === 'string') out[key] = out[key].trim();
    });
    return out;
  },
  setFormBusy(value) {
    const busy = !!value;
    if (E.proposalCatalogFormSaveBtn) {
      E.proposalCatalogFormSaveBtn.disabled = busy;
      E.proposalCatalogFormSaveBtn.textContent = busy ? 'Saving…' : 'Save';
    }
    if (E.proposalCatalogFormDeleteBtn) E.proposalCatalogFormDeleteBtn.disabled = busy;
  },
  async submitForm() {
    const mode = String(E.proposalCatalogForm?.dataset.mode || 'create');
    if (mode === 'edit' && !Permissions.canUpdateProposalCatalogItem()) {
      UI.toast('You do not have permission to update proposal catalog items.');
      return;
    }
    if (mode !== 'edit' && !Permissions.canCreateProposalCatalogItem()) {
      UI.toast('Login is required to manage proposal catalog items.');
      return;
    }
    const itemId = this.getValue(E.proposalCatalogFormItemId);
    const payload = this.sanitizePayload(this.collectFormPayload());

    if (!payload.item_name && !payload.capability_name && !payload.category) {
      UI.toast('Please enter at least an item name, category, or capability name.');
      return;
    }

    this.setFormBusy(true);
    try {
      if (mode === 'edit' && itemId) {
        const response = await this.updateProposalCatalogItem(itemId, payload);
        this.upsertLocalRow(response?.item || response?.data?.item || { ...payload, catalog_item_id: itemId });
        UI.toast('Catalog item updated.');
      } else {
        const response = await this.createProposalCatalogItem(payload);
        this.upsertLocalRow(response?.item || response?.data?.item || response || payload);
        UI.toast('Catalog item created.');
      }
      this.closeForm();
    } catch (error) {
      if (typeof isAuthError === 'function' && isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast('Unable to save catalog item: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setFormBusy(false);
    }
  },
  async openFormById(catalogItemId) {
    const local = this.state.rows.find(item => item.catalog_item_id === catalogItemId);
    if (local) {
      this.openForm(local);
      return;
    }
    try {
      const response = await this.getProposalCatalogItem(catalogItemId);
      const source =
        response?.item ||
        response?.data?.item ||
        (Array.isArray(response?.data) ? response.data[0] : null) ||
        (Array.isArray(response) ? response[0] : null) ||
        response;
      this.openForm(this.normalizeItem(source || {}));
    } catch (error) {
      UI.toast('Unable to load catalog item: ' + (error?.message || 'Unknown error'));
    }
  },
  async deleteById(catalogItemId) {
    if (!Permissions.canDeleteProposalCatalogItem()) {
      UI.toast('You do not have permission to delete catalog items.');
      return;
    }
    if (!catalogItemId) return;
    const confirmed = window.confirm(`Delete catalog item ${catalogItemId}?`);
    if (!confirmed) return;

    try {
      await this.deleteProposalCatalogItem(catalogItemId);
      this.removeLocalRow(catalogItemId);
      UI.toast('Catalog item deleted.');
      this.closeForm();
    } catch (error) {
      if (typeof isAuthError === 'function' && isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast('Unable to delete catalog item: ' + (error?.message || 'Unknown error'));
    }
  },
  getActiveCatalogItems(section = '') {
    const normalizedSection = String(section || '').trim().toLowerCase();
    return this.state.rows.filter(item => {
      if (!item.is_active) return false;
      if (!normalizedSection) return true;
      return item.section === normalizedSection;
    });
  },
  wire() {
    if (this.state.initialized) return;

    const bindState = (el, key) => {
      if (!el) return;
      const sync = () => {
        this.state[key] = String(el.value || '').trim();
        this.applyFilters();
        this.renderSummary();
        this.render();
      };
      el.addEventListener('input', sync);
      el.addEventListener('change', sync);
    };

    bindState(E.proposalCatalogSearchInput, 'search');
    bindState(E.proposalCatalogSectionFilter, 'section');
    bindState(E.proposalCatalogActiveFilter, 'active');
    bindState(E.proposalCatalogSortFilter, 'sort');

    if (E.proposalCatalogRefreshBtn)
      E.proposalCatalogRefreshBtn.addEventListener('click', () => this.loadAndRefresh({ force: true }));
    if (E.proposalCatalogCreateBtn) E.proposalCatalogCreateBtn.addEventListener('click', () => {
      if (!Permissions.canCreateProposalCatalogItem()) return UI.toast('Login is required to manage proposal catalog items.');
      this.openForm();
    });

    if (E.proposalCatalogTbody) {
      E.proposalCatalogTbody.addEventListener('click', event => {
        const editId = event.target?.getAttribute('data-proposal-catalog-edit');
        if (editId) {
          this.openFormById(editId);
          return;
        }
        const deleteId = event.target?.getAttribute('data-proposal-catalog-delete');
        if (deleteId) this.deleteById(deleteId);
      });
    }

    if (E.proposalCatalogForm) {
      E.proposalCatalogForm.addEventListener('submit', event => {
        event.preventDefault();
        this.submitForm();
      });
    }
    if (E.proposalCatalogFormCloseBtn)
      E.proposalCatalogFormCloseBtn.addEventListener('click', () => this.closeForm());
    if (E.proposalCatalogFormCancelBtn)
      E.proposalCatalogFormCancelBtn.addEventListener('click', () => this.closeForm());
    if (E.proposalCatalogFormDeleteBtn) {
      E.proposalCatalogFormDeleteBtn.addEventListener('click', () => {
        const id = this.getValue(E.proposalCatalogFormItemId);
        if (id) this.deleteById(id);
      });
    }
    if (E.proposalCatalogFormModal) {
      E.proposalCatalogFormModal.addEventListener('click', event => {
        if (event.target === E.proposalCatalogFormModal) this.closeForm();
      });
    }

    this.state.initialized = true;
  }
};

window.ProposalCatalog = ProposalCatalog;
