const CreditNotes = {
  state: {
    rows: [],
    invoices: [],
    selectedInvoice: null,
    selectedCreditNote: null,
    loading: false,
    status: 'All',
    search: '',
    error: '',
    invoiceError: '',
    saving: false,
    requestKey: ''
  },
  money(value, currency = 'USD') { return `${String(currency || 'USD').toUpperCase()} ${U.fmtNumber(Number(value || 0))}`; },
  n(value) { const num = Number(value); return Number.isFinite(num) ? num : 0; },
  text(value) { return String(value ?? '').trim(); },
  today() { return new Date().toISOString().slice(0, 10); },
  newRequestKey() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `credit-note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  },
  isCancelledCreditNote(note = {}) { return ['cancelled', 'canceled'].includes(this.text(note.status).toLowerCase()); },
  isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim()); },
  invoiceTotal(row = {}) { return this.n(row.invoice_total ?? row.grand_total ?? row.total_amount ?? row.amount_due ?? row.total); },
  amountPaid(row = {}) { return this.n(row.paid_amount ?? row.amount_paid ?? row.received_amount ?? row.paid_now); },
  creditAmount(row = {}) { return this.n(row.credited_amount ?? row.credit_note_amount ?? row.credit_amount); },
  balanceDue(row = {}) {
    const explicit = row.open_balance ?? row.balance_due ?? row.pending_amount;
    if (explicit !== undefined && explicit !== null && String(explicit).trim() !== '') return this.n(explicit);
    return Math.max(0, this.invoiceTotal(row) - this.amountPaid(row) - this.creditAmount(row));
  },
  creditableAmount(row = {}) {
    const explicit = row.creditable_amount;
    if (explicit !== undefined && explicit !== null && String(explicit).trim() !== '') return this.n(explicit);
    return Math.max(0, this.invoiceTotal(row) - this.creditAmount(row));
  },
  canCreate() { return !window.Permissions || Permissions.canCreateCreditNote?.() || Permissions.can('credit_notes', 'create') || Permissions.hasAdminOverride?.(); },
  canView() { return !window.Permissions || Permissions.canViewCreditNotes?.() || Permissions.can('credit_notes', 'view') || Permissions.can('credit_notes', 'list') || Permissions.hasAdminOverride?.(); },
  canCancel() { return !window.Permissions || Permissions.canCancelCreditNote?.() || Permissions.can('credit_notes', 'cancel') || Permissions.hasAdminOverride?.(); },
  canPrint() { return !window.Permissions || Permissions.canPrintCreditNote?.() || this.canView(); },
  canExport() { return !window.Permissions || Permissions.canExportCreditNote?.() || Permissions.hasAdminOverride?.(); },
  extractRows(response) {
    const unwrapped = Api.unwrapApiPayload?.(response) || response;
    return unwrapped?.rows || unwrapped?.items || unwrapped?.data?.rows || unwrapped?.data || response?.rows || response?.items || response?.data?.rows || response?.data || (Array.isArray(response) ? response : []);
  },
  normalizeStatus(value = '') {
    const normalized = this.text(value || 'issued').toLowerCase();
    if (normalized === 'canceled') return 'cancelled';
    return ['issued', 'draft', 'cancelled'].includes(normalized) ? normalized : (normalized || 'issued');
  },
  normalize(row = {}) {
    const id = this.text(row.id);
    return {
      ...row,
      id,
      credit_note_number: row.credit_note_number || row.credit_note_id || id || '',
      customer_name: row.customer_name || row.client_name || row.customer_legal_name || row.company_name || '',
      client_name: row.client_name || row.customer_name || row.customer_legal_name || row.company_name || '',
      status: this.normalizeStatus(row.status),
      credit_amount: this.n(row.credit_amount)
    };
  },
  normalizeInvoice(row = {}) {
    return {
      ...row,
      id: this.text(row.invoice_uuid || row.id),
      invoice_uuid: this.text(row.invoice_uuid || row.id),
      invoice_number: row.invoice_ref || row.invoice_number || row.invoice_id || row.invoice_no || row.invoice_uuid || row.id || '',
      invoice_ref: row.invoice_ref || row.invoice_number || row.invoice_id || row.invoice_no || '',
      customer_name: row.customer_legal_name || row.customer_name || row.client_name || row.company_name || '',
      client_name: row.client_name || row.customer_name || row.customer_legal_name || row.company_name || '',
      currency: row.currency || 'USD',
      grand_total: this.invoiceTotal(row),
      amount_paid: this.amountPaid(row),
      credit_note_amount: this.creditAmount(row),
      balance_due: this.balanceDue(row)
    };
  },
  async directListCreditNotes() {
    const client = window.SupabaseClient?.getClient?.();
    if (!client) return [];
    const { data, error } = await client
      .from('credit_notes')
      .select('*')
      .order('credit_note_date', { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  },
  async loadCreditRows(force = false) {
    try {
      const response = await Api.getCreditNotes({}, { limit: 500, forceRefresh: force, summary_only: false });
      return this.extractRows(response);
    } catch (apiError) {
      console.warn('[credit-notes] API list failed; using direct Supabase fallback', apiError);
      try { return await this.directListCreditNotes(); }
      catch (directError) {
        this.state.error = directError.message || apiError.message || 'Unable to load credit notes.';
        return [];
      }
    }
  },
  async loadCreditNoteInvoiceOptions(searchText = '') {
    const client = window.SupabaseClient?.getClient?.();
    if (!client) {
      this.state.invoiceError = 'Supabase client is not available.';
      return [];
    }
    const { data, error } = await client.rpc('crm_get_credit_note_invoice_options', {
      p_search: searchText || '',
      p_limit: 300
    });
    if (error) {
      console.error('[Credit Note Invoice Selector] Failed:', error);
      this.state.invoiceError = error.message || 'Unable to load credit note invoice options.';
      return [];
    }
    this.state.invoiceError = '';
    return data || [];
  },
  async refresh(force = false) {
    if (this.state.loading && !force) return;
    if (!this.canView()) {
      if (E.creditNotesState) E.creditNotesState.textContent = 'You do not have permission to view credit notes.';
      if (E.creditNotesTbody) E.creditNotesTbody.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;">No permission to view credit notes.</td></tr>';
      return;
    }
    this.state.loading = true;
    this.state.error = '';
    this.state.invoiceError = '';
    this.render();
    try {
      const [notesResult, invoicesResult] = await Promise.allSettled([
        this.loadCreditRows(force),
        this.loadCreditNoteInvoiceOptions()
      ]);
      this.state.rows = notesResult.status === 'fulfilled' ? notesResult.value.map(row => this.normalize(row)) : [];
      this.state.invoices = invoicesResult.status === 'fulfilled' ? invoicesResult.value.map(row => this.normalizeInvoice(row)) : [];
      if (notesResult.status === 'rejected') this.state.error = notesResult.reason?.message || 'Unable to load credit notes.';
      if (invoicesResult.status === 'rejected') this.state.invoiceError = invoicesResult.reason?.message || 'Unable to load unsettled invoices.';
      this.populateStatusFilter();
    } catch (error) {
      console.error('[credit-notes] load failed', error);
      this.state.error = error.message || 'Unable to load credit notes.';
      UI.toast(this.state.error);
    } finally {
      this.state.loading = false;
      this.render();
    }
  },
  filteredRows() {
    const q = this.state.search.toLowerCase().trim();
    const selectedStatus = this.text(this.state.status || 'All').toLowerCase();
    return this.state.rows.filter(row => {
      const rowStatus = this.normalizeStatus(row.status);
      if (selectedStatus && selectedStatus !== 'all' && rowStatus !== selectedStatus) return false;
      if (!q) return true;
      return [row.credit_note_number, row.credit_note_id, row.invoice_number, row.customer_name, row.client_name, row.company_name, row.description, row.currency, row.status]
        .some(value => this.text(value).toLowerCase().includes(q));
    });
  },
  populateStatusFilter() {
    if (!E.creditNotesStatusFilter) return;
    const current = this.text(E.creditNotesStatusFilter.value || this.state.status || 'All').toLowerCase();
    const statuses = [
      ['All', 'All'],
      ['issued', 'Issued'],
      ['draft', 'Draft'],
      ['cancelled', 'Cancelled']
    ];
    E.creditNotesStatusFilter.innerHTML = statuses.map(([value, label]) => `<option value="${U.escapeAttr(value)}">${U.escapeHtml(label)}</option>`).join('');
    E.creditNotesStatusFilter.value = statuses.some(([value]) => value === current) ? current : 'All';
    this.state.status = E.creditNotesStatusFilter.value || 'All';
  },
  renderSummary(rows = this.filteredRows()) {
    if (!E.creditNotesSummary) return;
    const issuedRows = rows.filter(row => this.text(row.status).toLowerCase() === 'issued');
    const total = issuedRows.reduce((sum, row) => sum + this.n(row.credit_amount), 0);
    E.creditNotesSummary.innerHTML = [
      ['Credit Notes', rows.length],
      ['Issued', issuedRows.length],
      ['Total Credited', this.money(total, rows[0]?.currency || 'USD')],
      ['Unsettled Invoices', this.state.invoices.length]
    ].map(([label, value]) => `<div class="card"><div class="label">${U.escapeHtml(label)}</div><div class="value">${U.escapeHtml(String(value))}</div></div>`).join('');
  },
  render() {
    if (!E.creditNotesTbody || !E.creditNotesState) return;
    if (E.creditNotesCreateBtn) E.creditNotesCreateBtn.style.display = this.canCreate() ? '' : 'none';
    const rows = this.filteredRows();
    this.renderSummary(rows);
    const messages = [];
    if (this.state.loading) messages.push('Loading credit notes…');
    else messages.push(`${rows.length} of ${this.state.rows.length} credit note(s). ${this.state.invoices.length} unsettled invoice(s) available.`);
    if (this.state.error) messages.push(`Credit notes setup/load warning: ${this.state.error}`);
    if (this.state.invoiceError) messages.push(`Invoice load warning: ${this.state.invoiceError}`);
    E.creditNotesState.textContent = messages.join(' ');
    if (this.state.loading) {
      E.creditNotesTbody.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;">Loading credit notes…</td></tr>';
      return;
    }
    if (!this.state.rows.length) {
      E.creditNotesTbody.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;">No credit notes found yet. Use New Credit Note to create one from an unsettled invoice.</td></tr>';
      return;
    }
    E.creditNotesTbody.innerHTML = rows.length ? rows.map(row => {
      const id = U.escapeAttr(row.id || row.credit_note_id || '');
      const canCancel = this.canCancel() && this.text(row.status).toLowerCase() === 'issued';
      return `<tr>
        <td>${U.escapeHtml(row.credit_note_number || '—')}</td><td>${U.escapeHtml(String(row.credit_note_date || '').slice(0,10) || '—')}</td>
        <td>${U.escapeHtml(row.customer_legal_name || row.customer_name || row.client_name || row.company_name || '—')}</td><td>${U.escapeHtml(row.invoice_number || '—')}</td>
        <td>${U.escapeHtml(row.description || '—')}</td><td>${U.escapeHtml(row.currency || 'USD')}</td><td>${U.escapeHtml(U.fmtNumber(row.credit_amount || 0))}</td>
        <td><span class="pill status-${U.toStatusClass(row.status || 'issued')}">${U.escapeHtml(row.status || 'issued')}</span></td>
        <td>${this.canPrint() ? `<button class="btn ghost sm" data-credit-note-preview="${id}">View / Print</button>` : '—'}${canCancel ? ` <button class="btn ghost sm" data-credit-note-cancel="${id}">Cancel</button>` : ''}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="9" class="muted" style="text-align:center;">No credit notes match the current search or status filter.</td></tr>';
  },
  populateInvoiceDropdown() {
    if (!E.creditNoteFormInvoiceSelect) return;
    E.creditNoteFormInvoiceSelect.innerHTML = '<option value="">Select unsettled invoice</option>' + this.state.invoices.map(invoice => {
      const label = invoice.display_label || `${invoice.invoice_ref} · ${invoice.customer_name}`;
      const secondary = `Open: ${invoice.open_balance} · Creditable: ${invoice.creditable_amount}`;
      return `<option value="${U.escapeAttr(invoice.invoice_uuid)}">${U.escapeHtml(`${label} — ${secondary}`)}</option>`;
    }).join('');
  },
  renderInvoiceInfo() {
    const inv = this.state.selectedInvoice;
    if (!E.creditNoteInvoiceInfo) return;
    const rows = inv ? [
      ['Client / Customer', inv.customer_legal_name || inv.customer_name || inv.client_name || inv.company_name || '—'],
      ['Invoice #', inv.invoice_number || '—'],
      ['Invoice Date', inv.issue_date || inv.invoice_date || '—'],
      ['Due Date', inv.due_date || '—'],
      ['Grand Total', this.money(this.invoiceTotal(inv), inv.currency)],
      ['Amount Paid', this.money(this.amountPaid(inv), inv.currency)],
      ['Existing Credit Notes', this.money(this.creditAmount(inv), inv.currency)],
      ['Open Balance', this.money(this.balanceDue(inv), inv.currency)],
      ['Creditable Amount', this.money(this.creditableAmount(inv), inv.currency)],
      ['Currency', inv.currency || 'USD']
    ] : [['Select invoice', this.state.invoices.length ? 'Choose an unsettled invoice to show its current balance.' : 'No unsettled invoices were loaded. Confirm the SQL setup and invoice balances.']];
    E.creditNoteInvoiceInfo.innerHTML = rows.map(([label, value]) => `<div class="card"><div class="label">${U.escapeHtml(label)}</div><div class="value" style="font-size:15px;">${U.escapeHtml(String(value))}</div></div>`).join('');
  },
  async openCreate() {
    if (!this.canCreate()) return UI.toast('You do not have permission to create credit notes.');
    this.state.invoiceError = '';
    this.state.invoices = (await this.loadCreditNoteInvoiceOptions()).map(row => this.normalizeInvoice(row));
    this.state.selectedCreditNote = null;
    this.state.selectedInvoice = null;
    this.state.requestKey = this.newRequestKey();
    this.setSaving(false);
    this.populateInvoiceDropdown();
    if (E.creditNoteForm) E.creditNoteForm.reset();
    if (E.creditNoteFormDate) E.creditNoteFormDate.value = this.today();
    if (E.creditNoteFormPreviewBtn) E.creditNoteFormPreviewBtn.style.display = 'none';
    this.renderInvoiceInfo();
    E.creditNoteFormModal?.classList.add('open');
    E.creditNoteFormModal?.setAttribute('aria-hidden','false');
  },
  closeForm() {
    if (this.state.saving) return;
    this.state.requestKey = '';
    E.creditNoteFormModal?.classList.remove('open');
    E.creditNoteFormModal?.setAttribute('aria-hidden','true');
  },
  setSaving(saving) {
    this.state.saving = Boolean(saving);
    const button = E.creditNoteFormSaveBtn;
    if (!button) return;
    button.disabled = this.state.saving;
    button.textContent = this.state.saving ? 'Saving...' : 'Save';
    button.setAttribute('aria-busy', String(this.state.saving));
  },
  onInvoiceSelected() {
    const id = this.text(E.creditNoteFormInvoiceSelect?.value);
    this.state.selectedInvoice = this.state.invoices.find(inv => String(inv.id) === id) || null;
    if (E.creditNoteFormAmount && this.state.selectedInvoice) E.creditNoteFormAmount.max = String(this.creditableAmount(this.state.selectedInvoice));
    this.renderInvoiceInfo();
  },
  validateForm() {
    const invoice = this.state.selectedInvoice;
    const amount = this.n(E.creditNoteFormAmount?.value);
    const description = this.text(E.creditNoteFormDescription?.value);
    const date = this.text(E.creditNoteFormDate?.value);
    if (!invoice?.id) throw new Error('Unsettled invoice is required.');
    if (!this.isUuid(invoice.id)) throw new Error('A valid invoice UUID is required to create a credit note.');
    if (!date) throw new Error('Credit note date is required.');
    if (!description) throw new Error('Description is required.');
    if (amount <= 0) throw new Error('Credit amount must be greater than 0.');
    const creditable = this.creditableAmount(invoice);
    if (amount > creditable + 0.0001) throw new Error(`Credit amount cannot exceed the creditable amount (${this.money(creditable, invoice.currency)}).`);
    return { invoice, amount, description, date };
  },
  buildPayload(invoice, amount, description, date) {
    const agreementId = this.text(invoice.agreement_id || invoice.agreement_uuid || '');
    const agreementNumber = invoice.agreement_number || (!this.isUuid(agreementId) ? agreementId : '') || invoice.agreement_no || '';
    return {
      invoice_id: this.isUuid(invoice.id) ? invoice.id : null,
      invoice_number: invoice.invoice_number || invoice.invoice_id || '',
      agreement_uuid: this.isUuid(invoice.agreement_uuid) ? invoice.agreement_uuid : (this.isUuid(agreementId) ? agreementId : null),
      agreement_id: this.isUuid(agreementId) ? agreementId : null,
      agreement_number: agreementNumber,
      client_id: this.isUuid(invoice.client_id) ? invoice.client_id : null,
      company_id: this.isUuid(invoice.company_id) ? invoice.company_id : null,
      company_name: invoice.company_name || '',
      customer_name: invoice.customer_legal_name || invoice.customer_name || invoice.client_name || invoice.company_name || '',
      client_name: invoice.client_name || invoice.customer_name || invoice.customer_legal_name || invoice.company_name || '',
      customer_legal_name: invoice.customer_legal_name || '',
      credit_note_date: date,
      description,
      currency: invoice.currency || 'USD',
      credit_amount: amount,
      status: 'issued',
      credit_note_request_key: this.state.requestKey
    };
  },
  async save(event) {
    event?.preventDefault?.();
    if (this.state.saving) return;
    this.setSaving(true);
    try {
      const { invoice, amount, description, date } = this.validateForm();
      if (!this.state.requestKey) this.state.requestKey = this.newRequestKey();
      const response = await Api.createCreditNote(this.buildPayload(invoice, amount, description, date));
      const row = this.normalize(Api.unwrapApiPayload?.(response) || response?.data || response);
      UI.toast('Credit note saved.');
      this.state.saving = false;
      this.closeForm();
      if (E.creditNotesSearchInput) E.creditNotesSearchInput.value = '';
      this.state.search = '';
      await this.refresh(true);
      if (row?.id) await this.preview(row.id);
      if (window.Clients?.loadAndRefresh) window.Clients.loadAndRefresh({ force: true }).catch(() => {});
    } catch (error) {
      console.error('[credit-notes] save failed', error);
      UI.toast(error.message || 'Unable to save credit note.');
      this.setSaving(false);
    }
  },
  async cancelCreditNote(id) {
    if (!id || !confirm('Cancel this credit note? The invoice balance will be recalculated.')) return;
    try {
      await Api.cancelCreditNote(id);
      UI.toast('Credit note cancelled.');
      await this.refresh(true);
      if (window.Clients?.loadAndRefresh) window.Clients.loadAndRefresh({ force: true }).catch(() => {});
    } catch (error) { UI.toast(error.message || 'Unable to cancel credit note.'); }
  },
  async loadPreviewData(id) {
    const client = window.SupabaseClient?.getClient?.();
    if (!client) throw new Error('Supabase is not configured.');
    const { data: note, error } = await client.from('credit_notes').select('*').eq('id', id).maybeSingle();
    if (error || !note) throw new Error(error?.message || 'Credit note not found.');
    let invoice = null;
    if (this.isUuid(note.invoice_id)) {
      const res = await client.from('invoices').select('*').eq('id', note.invoice_id).maybeSingle();
      invoice = res.data || null;
    }
    return { note, invoice };
  },
  buildPreviewHtml(note = {}, invoice = {}) {
    const currency = note.currency || invoice?.currency || 'USD';
    const amount = this.n(note.credit_amount);
    const amountWords = window.Invoices?.amountToWords?.(amount, currency) || `${U.fmtNumber(amount)} ${currency}`;
    const text = v => U.escapeHtml(String(v || '—'));
    const money = v => U.escapeHtml(this.money(v, currency));
    const cancelledWatermark = this.isCancelledCreditNote(note) ? '<div class="cancelled-watermark" aria-label="Cancelled credit note">CANCELLED</div>' : '';
    return `<!doctype html><html><head><meta charset="utf-8"><title>Credit Note</title><style>
      @page{size:A4;margin:10mm}body{margin:0;background:#eef2f7;font-family:Arial,sans-serif;color:#172033}.doc-sheet{width:190mm;min-height:277mm;margin:0 auto;background:#fff;padding:10mm;box-sizing:border-box;display:flex;flex-direction:column}.document-body{flex:1 0 auto;min-width:0}.doc-header{display:grid;grid-template-columns:44mm 1fr 62mm;align-items:start;gap:6mm}.logo{height:24mm}.logo img{max-width:40mm;max-height:24mm}.title{text-align:center;font-size:22px;font-weight:800;color:#0b214a;padding-top:7mm}.meta{border:1px solid #d7e1ed;border-radius:6px;overflow:hidden;font-size:11px}.row{display:grid;grid-template-columns:28mm 1fr;border-bottom:1px solid #e5edf5}.row:last-child{border-bottom:0}.key{background:#f5f8fc;font-weight:700}.row div{padding:5px;overflow-wrap:anywhere}.box{border:1px solid #d7e1ed;border-radius:7px;padding:10px;margin-top:14px;page-break-inside:avoid}.box h2{font-size:13px;color:#0b214a;margin:0 0 8px}table{width:100%;border-collapse:collapse;margin-top:14px;font-size:12px;page-break-inside:auto}tr{page-break-inside:avoid;break-inside:avoid}th,td{border:1px solid #d7e1ed;padding:8px;text-align:left;overflow-wrap:anywhere}th{background:#f5f8fc;color:#0b214a}.right{text-align:right}.total{font-size:16px;font-weight:800}.footer{position:static!important;margin-top:auto;padding-top:10px;border-top:1px solid #e5edf5;text-align:center;color:#64748b;font-size:11px;flex-shrink:0;page-break-inside:avoid;break-inside:avoid}.doc-sheet{position:relative}.cancelled-watermark{position:absolute;z-index:10;left:50%;top:48%;transform:translate(-50%,-50%) rotate(-32deg);font-size:58px;font-weight:900;letter-spacing:8px;color:rgba(185,28,28,.2);border:8px solid rgba(185,28,28,.18);padding:8px 20px;pointer-events:none}@media print{body{background:#fff}.doc-sheet{width:auto;min-height:277mm;padding:0}.cancelled-watermark{position:fixed;color:rgba(185,28,28,.2);border-color:rgba(185,28,28,.18)}}
    </style></head><body><div class="doc-sheet">${cancelledWatermark}<main class="document-body"><header class="doc-header"><div class="logo"><div data-incheck360-doc-logo-slot></div></div><div class="title">Credit Note</div><div class="meta">
      <div class="row"><div class="key">Credit Note #</div><div>${text(note.credit_note_number)}</div></div><div class="row"><div class="key">Credit Note Date</div><div>${text(String(note.credit_note_date||'').slice(0,10))}</div></div>
    </div></header><section class="box"><h2>Bill To / Customer</h2><strong>${text(note.customer_legal_name || note.customer_name || note.client_name)}</strong></section><section class="box"><h2>Related Invoice Details</h2><div>Invoice: <strong>${text(note.invoice_number)}</strong></div><div>Invoice Date: ${text(invoice?.issue_date || invoice?.invoice_date)}</div><div>Due Date: ${text(invoice?.due_date)}</div><div>Current Balance Due: ${money(this.balanceDue(invoice || {}))}</div></section><table><thead><tr><th>Description</th><th class="right">Amount Credited</th></tr></thead><tbody><tr><td>${text(note.description)}</td><td class="right total">${money(amount)}</td></tr></tbody></table><section class="box"><h2>Amount in Words</h2><div>${text(amountWords)}</div></section></main><footer class="footer document-footer">This credit note is computer generated and reduces the related invoice balance. It is not a payment receipt.</footer></div></body></html>`;
  },
  async preview(id) {
    if (!this.canPrint()) return UI.toast('You do not have permission to view or print credit notes.');
    try {
      const { note, invoice } = await this.loadPreviewData(id);
      const html = U.addIncheckDocumentLogo(U.formatPreviewHtmlDates(this.buildPreviewHtml(note, invoice)));
      if (E.creditNotePreviewTitle) E.creditNotePreviewTitle.textContent = `Credit Note · ${note.credit_note_number || ''}`;
      if (E.creditNotePreviewFrame) E.creditNotePreviewFrame.srcdoc = html;
      E.creditNotePreviewModal?.classList.add('open');
      E.creditNotePreviewModal?.setAttribute('aria-hidden','false');
    } catch (error) { UI.toast(error.message || 'Unable to preview credit note.'); }
  },
  closePreview() {
    E.creditNotePreviewModal?.classList.remove('open');
    E.creditNotePreviewModal?.setAttribute('aria-hidden','true');
    if (E.creditNotePreviewFrame) E.creditNotePreviewFrame.srcdoc = '';
  },
  exportPreviewPdf() { if (!this.canExport()) return UI.toast('You do not have permission to export credit notes.'); const frame = E.creditNotePreviewFrame; if (!frame?.contentWindow) return; frame.contentWindow.focus(); frame.contentWindow.print(); },
  bind() {
    if (this._bound) return;
    if (typeof cacheEls === 'function') cacheEls();
    const byId = id => (typeof E !== 'undefined' && E[id]) || document.getElementById(id);
    const createBtn = byId('creditNotesCreateBtn');
    if (!createBtn) {
      console.warn('[credit-notes] Create button not found during bind.');
      return;
    }
    this._bound = true;
    byId('creditNotesRefreshBtn')?.addEventListener('click', () => this.refresh(true));
    createBtn.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); this.openCreate(); });
    byId('creditNotesSearchInput')?.addEventListener('input', e => { this.state.search = e.target.value || ''; this.render(); });
    byId('creditNotesStatusFilter')?.addEventListener('change', e => { this.state.status = e.target.value || 'All'; this.render(); });
    byId('creditNotesTbody')?.addEventListener('click', e => {
      const preview = e.target.closest('[data-credit-note-preview]')?.dataset.creditNotePreview;
      const cancel = e.target.closest('[data-credit-note-cancel]')?.dataset.creditNoteCancel;
      if (preview) this.preview(preview);
      if (cancel) this.cancelCreditNote(cancel);
    });
    byId('creditNoteFormInvoiceSelect')?.addEventListener('change', () => this.onInvoiceSelected());
    const creditNoteForm = byId('creditNoteForm');
    this._saveSubmitHandler ||= event => this.save(event);
    creditNoteForm?.removeEventListener('submit', this._saveSubmitHandler);
    creditNoteForm?.addEventListener('submit', this._saveSubmitHandler);
    byId('creditNoteFormCloseBtn')?.addEventListener('click', () => this.closeForm());
    byId('creditNoteFormCancelBtn')?.addEventListener('click', () => this.closeForm());
    byId('creditNotePreviewCloseBtn')?.addEventListener('click', () => this.closePreview());
    byId('creditNotePreviewBackBtn')?.addEventListener('click', () => this.closePreview());
    byId('creditNotePreviewExportPdfBtn')?.addEventListener('click', () => this.exportPreviewPdf());
  },
  init() { this.bind(); this.render(); }
};
window.CreditNotes = CreditNotes;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => CreditNotes.init());
else CreditNotes.init();
