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
    invoiceError: ''
  },
  money(value, currency = 'USD') { return `${String(currency || 'USD').toUpperCase()} ${U.fmtNumber(Number(value || 0))}`; },
  n(value) { const num = Number(value); return Number.isFinite(num) ? num : 0; },
  text(value) { return String(value ?? '').trim(); },
  today() { return new Date().toISOString().slice(0, 10); },
  isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim()); },
  invalidStatus(row = {}) { return ['cancelled','canceled','void','voided','deleted','rejected'].includes(this.text(row.status || row.invoice_status || row.payment_status || row.payment_state).toLowerCase()); },
  invoiceTotal(row = {}) { return this.n(row.grand_total ?? row.invoice_total ?? row.total_amount ?? row.amount_due ?? row.total); },
  amountPaid(row = {}) { return this.n(row.amount_paid ?? row.received_amount ?? row.paid_amount ?? row.paid_now); },
  creditAmount(row = {}) { return this.n(row.credit_note_amount ?? row.credit_amount ?? row.credited_amount); },
  balanceDue(row = {}) {
    const explicit = row.balance_due ?? row.pending_amount;
    if (explicit !== undefined && explicit !== null && String(explicit).trim() !== '') return this.n(explicit);
    return Math.max(0, this.invoiceTotal(row) - this.amountPaid(row) - this.creditAmount(row));
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
      id: this.text(row.id),
      invoice_number: row.invoice_number || row.invoice_id || row.invoice_no || row.id || '',
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
  async directListInvoices() {
    const client = window.SupabaseClient?.getClient?.();
    if (!client) return [];
    const { data, error } = await client
      .from('invoices')
      .select('*')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1000);
    if (error) throw error;
    const invoices = Array.isArray(data) ? data : [];
    let creditsByInvoice = new Map();
    try {
      const { data: creditRows, error: creditError } = await client.from('credit_notes').select('invoice_id,credit_amount,status');
      if (!creditError && Array.isArray(creditRows)) {
        creditRows.forEach(row => {
          const invoiceId = this.text(row.invoice_id);
          const status = this.text(row.status).toLowerCase();
          if (!invoiceId || ['cancelled','canceled','void','voided','deleted','rejected'].includes(status)) return;
          creditsByInvoice.set(invoiceId, (creditsByInvoice.get(invoiceId) || 0) + this.n(row.credit_amount));
        });
      }
    } catch {}
    return invoices.map(invoice => {
      const id = this.text(invoice.id);
      const credit_note_amount = this.n(invoice.credit_note_amount) || this.n(creditsByInvoice.get(id));
      const total = this.invoiceTotal(invoice);
      const paid = this.amountPaid(invoice);
      const explicitBalance = invoice.balance_due ?? invoice.pending_amount;
      const balance_due = explicitBalance !== undefined && explicitBalance !== null && String(explicitBalance).trim() !== ''
        ? this.n(explicitBalance)
        : Math.max(0, total - paid - credit_note_amount);
      return { ...invoice, credit_note_amount, balance_due };
    });
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
  async loadInvoiceRows(force = false) {
    const byId = new Map();
    const push = rows => (Array.isArray(rows) ? rows : []).forEach(row => {
      const normalized = this.normalizeInvoice(row);
      const key = normalized.id || normalized.invoice_number;
      if (key) byId.set(key, normalized);
    });
    try {
      const response = await Api.listInvoices({}, { limit: 1000, forceRefresh: force, summary_only: false });
      push(this.extractRows(response));
    } catch (apiError) {
      console.warn('[credit-notes] invoice API list failed', apiError);
      this.state.invoiceError = apiError.message || '';
    }
    if (!byId.size) {
      try { push(await this.directListInvoices()); }
      catch (directError) { this.state.invoiceError = directError.message || this.state.invoiceError || 'Unable to load invoices.'; }
    }
    const rows = Array.from(byId.values()).filter(row => this.isEligibleInvoice(row));
    rows.sort((a, b) => String(b.updated_at || b.invoice_date || b.created_at || '').localeCompare(String(a.updated_at || a.invoice_date || a.created_at || '')));
    return rows;
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
        this.loadInvoiceRows(force)
      ]);
      this.state.rows = notesResult.status === 'fulfilled' ? notesResult.value.map(row => this.normalize(row)) : [];
      this.state.invoices = invoicesResult.status === 'fulfilled' ? invoicesResult.value.map(row => this.normalizeInvoice(row)).filter(row => this.isEligibleInvoice(row)) : [];
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
  isEligibleInvoice(invoice = {}) {
    const status = this.text(invoice.status || invoice.invoice_status || invoice.payment_status || invoice.payment_state).toLowerCase();
    if (['cancelled','canceled','void','voided','draft','deleted','rejected'].includes(status)) return false;
    return this.balanceDue(invoice) > 0;
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
    E.creditNoteFormInvoiceSelect.innerHTML = '<option value="">Select unsettled invoice</option>' + this.state.invoices.map(inv => {
      const label = `${inv.invoice_number || inv.invoice_id || inv.id} - ${inv.customer_legal_name || inv.customer_name || inv.client_name || inv.company_name || 'Client'} - Balance Due ${String(inv.currency || 'USD').toUpperCase()} ${U.fmtNumber(this.balanceDue(inv))}`;
      return `<option value="${U.escapeAttr(inv.id)}">${U.escapeHtml(label)}</option>`;
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
      ['Balance Due', this.money(this.balanceDue(inv), inv.currency)],
      ['Currency', inv.currency || 'USD']
    ] : [['Select invoice', this.state.invoices.length ? 'Choose an unsettled invoice to show its current balance.' : 'No unsettled invoices were loaded. Confirm the SQL setup and invoice balances.']];
    E.creditNoteInvoiceInfo.innerHTML = rows.map(([label, value]) => `<div class="card"><div class="label">${U.escapeHtml(label)}</div><div class="value" style="font-size:15px;">${U.escapeHtml(String(value))}</div></div>`).join('');
  },
  async openCreate() {
    if (!this.canCreate()) return UI.toast('You do not have permission to create credit notes.');
    if (!this.state.invoices.length) await this.refresh(true);
    this.state.selectedCreditNote = null;
    this.state.selectedInvoice = null;
    this.populateInvoiceDropdown();
    if (E.creditNoteForm) E.creditNoteForm.reset();
    if (E.creditNoteFormDate) E.creditNoteFormDate.value = this.today();
    if (E.creditNoteFormPreviewBtn) E.creditNoteFormPreviewBtn.style.display = 'none';
    this.renderInvoiceInfo();
    E.creditNoteFormModal?.classList.add('open');
    E.creditNoteFormModal?.setAttribute('aria-hidden','false');
  },
  closeForm() { E.creditNoteFormModal?.classList.remove('open'); E.creditNoteFormModal?.setAttribute('aria-hidden','true'); },
  onInvoiceSelected() {
    const id = this.text(E.creditNoteFormInvoiceSelect?.value);
    this.state.selectedInvoice = this.state.invoices.find(inv => String(inv.id) === id) || null;
    if (E.creditNoteFormAmount && this.state.selectedInvoice) E.creditNoteFormAmount.max = String(this.balanceDue(this.state.selectedInvoice));
    this.renderInvoiceInfo();
  },
  validateForm() {
    const invoice = this.state.selectedInvoice;
    const amount = this.n(E.creditNoteFormAmount?.value);
    const description = this.text(E.creditNoteFormDescription?.value);
    const date = this.text(E.creditNoteFormDate?.value);
    if (!invoice?.id) throw new Error('Unsettled invoice is required.');
    if (!this.isUuid(invoice.id)) throw new Error('A valid invoice UUID is required to create a credit note.');
    if (this.invalidStatus(invoice)) throw new Error('Credit notes are not allowed on cancelled/void invoices.');
    if (!date) throw new Error('Credit note date is required.');
    if (!description) throw new Error('Description is required.');
    if (amount <= 0) throw new Error('Credit amount must be greater than 0.');
    const balance = this.balanceDue(invoice);
    if (amount > balance + 0.0001) throw new Error(`Credit amount cannot exceed current balance due (${this.money(balance, invoice.currency)}).`);
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
      status: 'issued'
    };
  },
  async save(event) {
    event?.preventDefault?.();
    try {
      const { invoice, amount, description, date } = this.validateForm();
      const response = await Api.createCreditNote(this.buildPayload(invoice, amount, description, date));
      UI.toast('Credit note saved.');
      this.closeForm();
      if (E.creditNotesSearchInput) E.creditNotesSearchInput.value = '';
      this.state.search = '';
      await this.refresh(true);
      const row = this.normalize(Api.unwrapApiPayload?.(response) || response?.data || response);
      if (row?.id && !this.state.rows.some(existing => existing.id === row.id)) {
        this.state.rows = [row, ...this.state.rows];
        this.populateStatusFilter();
        this.render();
      }
      const id = row?.id;
      if (id) this.preview(id);
      if (window.Clients?.loadAndRefresh) window.Clients.loadAndRefresh({ force: true }).catch(() => {});
    } catch (error) {
      console.error('[credit-notes] save failed', error);
      UI.toast(error.message || 'Unable to save credit note.');
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
    return `<!doctype html><html><head><meta charset="utf-8"><title>Credit Note</title><style>
      @page{size:A4;margin:10mm}body{margin:0;background:#eef2f7;font-family:Arial,sans-serif;color:#172033}.doc-sheet{width:190mm;min-height:277mm;margin:0 auto;background:#fff;padding:10mm;box-sizing:border-box;position:relative}.doc-header{display:grid;grid-template-columns:44mm 1fr 62mm;align-items:start;gap:6mm}.logo{height:24mm}.logo img{max-width:40mm;max-height:24mm}.title{text-align:center;font-size:22px;font-weight:800;color:#0b214a;padding-top:7mm}.meta{border:1px solid #d7e1ed;border-radius:6px;overflow:hidden;font-size:11px}.row{display:grid;grid-template-columns:28mm 1fr;border-bottom:1px solid #e5edf5}.row:last-child{border-bottom:0}.key{background:#f5f8fc;font-weight:700}.row div{padding:5px;overflow-wrap:anywhere}.box{border:1px solid #d7e1ed;border-radius:7px;padding:10px;margin-top:14px;page-break-inside:avoid}.box h2{font-size:13px;color:#0b214a;margin:0 0 8px}table{width:100%;border-collapse:collapse;margin-top:14px;font-size:12px;page-break-inside:avoid}th,td{border:1px solid #d7e1ed;padding:8px;text-align:left;overflow-wrap:anywhere}th{background:#f5f8fc;color:#0b214a}.right{text-align:right}.total{font-size:16px;font-weight:800}.footer{position:absolute;bottom:12mm;left:10mm;right:10mm;text-align:center;color:#64748b;font-size:11px}@media print{body{background:#fff}.doc-sheet{width:auto;min-height:257mm;padding:0}.footer{position:fixed}}
    </style></head><body><div class="doc-sheet"><header class="doc-header"><div class="logo"><div data-incheck360-doc-logo-slot></div></div><div class="title">Credit Note</div><div class="meta">
      <div class="row"><div class="key">Credit Note #</div><div>${text(note.credit_note_number)}</div></div><div class="row"><div class="key">Credit Note Date</div><div>${text(String(note.credit_note_date||'').slice(0,10))}</div></div><div class="row"><div class="key">Invoice #</div><div>${text(note.invoice_number)}</div></div><div class="row"><div class="key">Currency</div><div>${text(currency)}</div></div><div class="row"><div class="key">Status</div><div>${text(note.status)}</div></div>
    </div></header><section class="box"><h2>Bill To / Customer</h2><strong>${text(note.customer_legal_name || note.customer_name || note.client_name)}</strong></section><section class="box"><h2>Related Invoice Details</h2><div>Invoice: <strong>${text(note.invoice_number)}</strong></div><div>Invoice Date: ${text(invoice?.issue_date || invoice?.invoice_date)}</div><div>Due Date: ${text(invoice?.due_date)}</div><div>Current Balance Due: ${money(this.balanceDue(invoice || {}))}</div></section><table><thead><tr><th>Description</th><th class="right">Amount Credited</th></tr></thead><tbody><tr><td>${text(note.description)}</td><td class="right total">${money(amount)}</td></tr></tbody></table><section class="box"><h2>Amount in Words</h2><div>${text(amountWords)}</div></section><div class="footer">This credit note is computer generated and reduces the related invoice balance. It is not a payment receipt.</div></div></body></html>`;
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
    this.refresh(true).catch(error => console.warn('[credit-notes] refresh after preview close failed', error));
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
    byId('creditNoteForm')?.addEventListener('submit', e => this.save(e));
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
