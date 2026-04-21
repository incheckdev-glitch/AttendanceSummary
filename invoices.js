const Invoices = {
  invoiceFields: [
    'invoice_id',
    'invoice_number',
    'agreement_id',
    'invoice_date',
    'issue_date',
    'due_date',
    'billing_frequency',
    'customer_name',
    'customer_legal_name',
    'customer_address',
    'customer_contact_name',
    'customer_contact_email',
    'provider_legal_name',
    'provider_address',
    'support_email',
    'payment_term',
    'currency',
    'status',
    'subtotal_subscription',
    'subtotal_locations',
    'subtotal_one_time',
    'invoice_total',
    'grand_total',
    'received_amount',
    'amount_paid',
    'pending_amount',
    'payment_state',
    'payment_conclusion',
    'amount_in_words',
    'notes',
    'updated_at'
  ],
  state: {
    rows: [],
    filteredRows: [],
    loading: false,
    loadError: '',
    initialized: false,
    search: '',
    status: 'All',
    page: 1,
    limit: 50,
    offset: 0,
    returned: 0,
    hasMore: false,
    total: 0,
    kpiFilter: 'total',
    selectedInvoice: null,
    items: [],
    catalogLoading: false,
    saveInFlight: false,
    detailCacheById: {},
    detailCacheTtlMs: 90 * 1000,
    receiptsByInvoiceId: {},
    openingInvoiceIds: new Set(),
    loadingInvoiceReceiptIds: new Set(),
    rowActionInFlight: new Set()
  },
  statusOptions: ['Draft', 'Issued', 'Sent', 'Unpaid', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'],
  toNumberSafe(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  },
  formatMoney(value) {
    return this.toNumberSafe(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  },
  normalizeText(value) {
    return String(value ?? '').trim().toLowerCase();
  },
  canCreateReceiptFromInvoice(invoice = {}) {
    const status = this.normalizeText(invoice?.status || '');
    return ['paid', 'partially paid', 'received'].includes(status);
  },
  isSettlementReceipt(receipt = {}) {
    const status = this.normalizeText(receipt?.status);
    const paymentState = this.normalizeText(receipt?.payment_state);
    const pendingAmount = this.toNumberSafe(receipt?.pending_amount);
    return status === 'settlement' || receipt?.is_settlement === true || pendingAmount === 0 || paymentState === 'fully paid';
  },
  receiptTypeLabel(receipt = {}) {
    return this.isSettlementReceipt(receipt) ? 'Settlement' : 'Receipt';
  },
  sortReceiptsAscending(receipts = []) {
    const toTs = value => {
      const raw = String(value || '').trim();
      if (!raw) return Number.MAX_SAFE_INTEGER;
      const parsed = new Date(raw);
      const ts = parsed.getTime();
      return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER;
    };
    return [...receipts].sort((a, b) => {
      const aTs = toTs(a.receipt_date || a.created_at);
      const bTs = toTs(b.receipt_date || b.created_at);
      if (aTs !== bTs) return aTs - bTs;
      return String(a.receipt_id || '').localeCompare(String(b.receipt_id || ''));
    });
  },
  getInvoiceReceipts(invoiceId) {
    const key = String(invoiceId || '').trim();
    if (!key) return [];
    const rows = this.state.receiptsByInvoiceId[key];
    return Array.isArray(rows) ? rows : [];
  },
  setInvoiceReceipts(invoiceId, receipts = []) {
    const key = String(invoiceId || '').trim();
    if (!key) return [];
    const normalized = receipts
      .map(receipt =>
        window.Receipts?.normalizeReceipt
          ? window.Receipts.normalizeReceipt(receipt)
          : { ...(receipt || {}), receipt_id: String(receipt?.receipt_id || '').trim() }
      )
      .filter(receipt => String(receipt?.receipt_id || '').trim());
    const dedupedById = [];
    const seen = new Set();
    normalized.forEach(receipt => {
      const receiptId = String(receipt.receipt_id || '').trim();
      if (!receiptId || seen.has(receiptId)) return;
      seen.add(receiptId);
      dedupedById.push(receipt);
    });
    this.state.receiptsByInvoiceId[key] = this.sortReceiptsAscending(dedupedById);
    return this.state.receiptsByInvoiceId[key];
  },
  appendInvoiceReceipt(invoiceId, receipt) {
    const key = String(invoiceId || '').trim();
    if (!key || !receipt) return [];
    const existing = this.getInvoiceReceipts(key);
    return this.setInvoiceReceipts(key, [...existing, receipt]);
  },
  renderInvoiceReceipts(invoice = this.state.selectedInvoice) {
    if (!E.invoiceReceiptsTbody || !E.invoiceReceiptsState) return;
    const invoiceId = String(invoice?.invoice_id || '').trim();
    if (!invoiceId) {
      E.invoiceReceiptsState.textContent = 'Save invoice to attach receipts.';
      E.invoiceReceiptsTbody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;">No receipts linked yet.</td></tr>';
      return;
    }
    if (this.state.loadingInvoiceReceiptIds.has(invoiceId)) {
      E.invoiceReceiptsState.textContent = 'Loading linked receipts…';
      E.invoiceReceiptsTbody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;">Loading linked receipts…</td></tr>';
      return;
    }
    const receipts = this.getInvoiceReceipts(invoiceId);
    E.invoiceReceiptsState.textContent = receipts.length
      ? `${receipts.length} receipt${receipts.length === 1 ? '' : 's'} linked to this invoice.`
      : 'No receipts linked yet.';
    if (!receipts.length) {
      E.invoiceReceiptsTbody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;">No receipts linked yet.</td></tr>';
      return;
    }
    E.invoiceReceiptsTbody.innerHTML = receipts
      .map(receipt => {
        const type = this.receiptTypeLabel(receipt);
        const showSettlementBadge = this.isSettlementReceipt(receipt);
        return `<tr>
          <td><span class="pill">${U.escapeHtml(type)}</span>${showSettlementBadge ? ' <span class="pill">Settlement</span>' : ''}</td>
          <td>${U.escapeHtml(receipt.receipt_number || receipt.receipt_id || '—')}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(receipt.receipt_date))}</td>
          <td>${this.formatMoney(receipt.received_amount || receipt.grand_total)}</td>
          <td>${this.formatMoney(receipt.pending_amount)}</td>
          <td>${U.escapeHtml(receipt.payment_state || '—')}</td>
          <td>${U.escapeHtml(receipt.status || '—')}</td>
        </tr>`;
      })
      .join('');
  },
  syncPaymentConclusion(invoice = this.state.selectedInvoice) {
    if (!E.invoicePaymentConclusion) return;
    const pending = this.toNumberSafe(invoice?.pending_amount);
    E.invoicePaymentConclusion.textContent = pending <= 0 ? 'Settlement Completed' : 'Pending Settlement';
  },
  async refreshInvoiceReceipts(invoiceId, { force = false } = {}) {
    const id = String(invoiceId || '').trim();
    if (!id) return;
    if (this.state.loadingInvoiceReceiptIds.has(id)) return;
    this.state.loadingInvoiceReceiptIds.add(id);
    this.renderInvoiceReceipts(this.state.selectedInvoice);
    try {
      const response = await Api.listReceipts({ invoice_id: id }, { page: 1, limit: 100, summary_only: true, forceRefresh: force });
      const rows = window.Receipts?.extractRows ? window.Receipts.extractRows(response) : [];
      this.setInvoiceReceipts(id, rows.filter(row => String(row?.invoice_id || '').trim() === id));
    } catch (_error) {
      // Keep existing linked receipts visible.
    } finally {
      this.state.loadingInvoiceReceiptIds.delete(id);
      this.renderInvoiceReceipts(this.state.selectedInvoice);
    }
  },
  normalizeInvoice(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const normalized = {};
    this.invoiceFields.forEach(field => {
      const camel = field.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
      const value = source[field] ?? source[camel] ?? '';
      normalized[field] = typeof value === 'string' ? value.trim() : value;
    });
    normalized.id = String(source.id || '').trim();
    normalized.invoice_id = String(normalized.invoice_id || '').trim();
    normalized.invoice_number = String(normalized.invoice_number || '').trim();
    normalized.status = String(normalized.status || '').trim() || 'Draft';
    normalized.currency = String(normalized.currency || '').trim() || 'USD';
    normalized.issue_date = this.normalizeDateInputValue(normalized.issue_date || source.issue_date || source.issueDate || source.invoice_date || source.invoiceDate);
    normalized.invoice_date = this.normalizeDateInputValue(normalized.invoice_date || source.invoice_date || source.invoiceDate || normalized.issue_date);
    normalized.due_date = this.normalizeDateInputValue(normalized.due_date || source.due_date || source.dueDate);
    const amountPaidFallback = source.received_amount ?? source.receivedAmount;
    const grandTotalFallback = source.invoice_total ?? source.invoiceTotal;
    const subtotalSubscriptionFallback = source.subtotal_locations ?? source.subtotalLocations;
    normalized.subtotal_subscription = this.toNumberSafe(normalized.subtotal_subscription || subtotalSubscriptionFallback);
    normalized.subtotal_locations = this.toNumberSafe(normalized.subtotal_locations || normalized.subtotal_subscription || subtotalSubscriptionFallback);
    normalized.subtotal_one_time = this.toNumberSafe(normalized.subtotal_one_time);
    normalized.grand_total = this.toNumberSafe(normalized.grand_total || grandTotalFallback);
    normalized.invoice_total = this.toNumberSafe(normalized.invoice_total || normalized.grand_total || grandTotalFallback);
    normalized.amount_paid = this.toNumberSafe(normalized.amount_paid || amountPaidFallback);
    normalized.received_amount = this.toNumberSafe(normalized.received_amount || normalized.amount_paid || amountPaidFallback);
    normalized.pending_amount = this.toNumberSafe(normalized.pending_amount);
    normalized.payment_state = String(normalized.payment_state || '').trim();
    normalized.payment_conclusion = String(normalized.payment_conclusion || '').trim();
    if (!normalized.amount_in_words && normalized.grand_total > 0) {
      normalized.amount_in_words = this.amountToWords(normalized.grand_total, normalized.currency);
    }
    return normalized;
  },
  invoiceDbId(value) {
    return String(value || '').trim();
  },
  invoiceDisplayId(invoice = {}) {
    return String(invoice?.invoice_number || invoice?.invoice_id || '').trim();
  },
  isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
  },
  resolveInvoiceUuidForPreview(invoiceRef) {
    const ref = String(invoiceRef || '').trim();
    if (!ref) throw new Error('Missing invoice identifier.');
    if (this.isUuid(ref)) return ref;
    const localMatch = this.state.rows.find(row => {
      const rowId = String(row?.id || '').trim();
      const businessId = String(row?.invoice_id || '').trim();
      const number = String(row?.invoice_number || '').trim();
      return rowId === ref || businessId === ref || number === ref;
    });
    const resolvedId = String(localMatch?.id || '').trim();
    if (resolvedId && this.isUuid(resolvedId)) return resolvedId;
    throw new Error('Invoice UUID could not be resolved from the selected record.');
  },
  async loadInvoicePreviewData(invoiceRef) {
    const invoiceUuid = this.resolveInvoiceUuidForPreview(invoiceRef);
    const client = window.SupabaseClient?.getClient?.();
    if (!client) throw new Error('Supabase client is not available.');
    const [{ data: invoiceRow, error: invoiceError }, { data: itemRows, error: itemsError }] = await Promise.all([
      client.from('invoices').select('*').eq('id', invoiceUuid).maybeSingle(),
      client
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceUuid)
        .order('line_no', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true, nullsFirst: false })
    ]);
    if (invoiceError) throw new Error(`Unable to load invoice: ${invoiceError.message || 'Unknown error'}`);
    if (!invoiceRow) throw new Error('Invoice was not found.');
    if (itemsError) throw new Error(`Unable to load invoice items: ${itemsError.message || 'Unknown error'}`);
    return {
      invoiceUuid,
      invoice: this.normalizeInvoice(invoiceRow),
      items: Array.isArray(itemRows) ? itemRows.map(item => this.normalizeItem(item)) : []
    };
  },
  buildInvoicePreviewHtml(invoice = {}, items = []) {
    const invoiceData = invoice && typeof invoice === 'object' ? invoice : {};
    const normalizedItems = (Array.isArray(items) ? items : []).map((item, index) => {
      const normalized = this.normalizeItem(item);
      if (!normalized.line_no) normalized.line_no = index + 1;
      return normalized;
    });
    const currency = String(invoiceData.currency || 'USD').trim().toUpperCase();
    const money = value => {
      const amount = this.toNumberSafe(value);
      return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
    const sanitize = value => U.escapeHtml(String(value ?? '').trim());
    const textValue = value => {
      const text = String(value ?? '').trim();
      return text ? U.escapeHtml(text) : '—';
    };
    const dateValue = value => {
      const raw = String(value || '').trim();
      if (!raw) return '—';
      const formatted = U.fmtDisplayDate(raw);
      return formatted && formatted !== 'Invalid Date' ? formatted : U.escapeHtml(raw);
    };
    const numValue = value => {
      const amount = this.toNumberSafe(value);
      return Number.isFinite(amount) ? U.escapeHtml(String(amount)) : '—';
    };
    const itemTotals = this.calculateInvoiceTotals(normalizedItems);
    const subtotalLocations = this.toNumberSafe(invoiceData.subtotal_locations || invoiceData.subtotal_subscription || itemTotals.subtotal_subscription);
    const subtotalOneTime = this.toNumberSafe(invoiceData.subtotal_one_time || itemTotals.subtotal_one_time);
    const invoiceTotal = this.toNumberSafe(invoiceData.invoice_total || invoiceData.grand_total || itemTotals.grand_total);
    const paidAmount = this.toNumberSafe(invoiceData.received_amount || invoiceData.amount_paid);
    const pendingAmount = this.toNumberSafe(invoiceData.pending_amount || Math.max(0, invoiceTotal - paidAmount));
    const amountInWords = String(invoiceData.amount_in_words || '').trim() || this.amountToWords(invoiceTotal, currency);
    const paymentConclusion = String(invoiceData.payment_conclusion || '').trim() || this.derivePaymentConclusion({ pending_amount: pendingAmount });

    const subscriptionItems = normalizedItems.filter(item => this.isSubscriptionSection(item.section));
    const oneTimeItems = normalizedItems.filter(item => this.isOneTimeSection(item.section));

    const subscriptionRows = subscriptionItems.length
      ? subscriptionItems
          .map(item => {
            const computed = this.computeCommercialRow(item);
            return `<tr>
              <td>${textValue(item.location_name)}</td>
              <td>${textValue(item.location_address)}</td>
              <td class="cell-center">${dateValue(item.service_start_date)}</td>
              <td class="cell-center">${dateValue(item.service_end_date)}</td>
              <td>${textValue(item.item_name)}</td>
              <td class="cell-right">${money(computed.line_total)}</td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="6" class="cell-center muted">No subscription items found.</td></tr>';

    const oneTimeRows = oneTimeItems.length
      ? oneTimeItems
          .map(item => {
            const computed = this.computeCommercialRow(item);
            return `<tr>
              <td>${textValue(item.location_name)}</td>
              <td>${textValue(item.location_address)}</td>
              <td>${textValue(item.item_name)}</td>
              <td class="cell-right">${money(item.unit_price)}</td>
              <td class="cell-center">${U.escapeHtml(String(this.toNumberSafe(item.discount_percent)))}%</td>
              <td class="cell-right">${money(computed.discounted_unit_price)}</td>
              <td class="cell-right">${money(computed.line_total)}</td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="7" class="cell-center muted">No one-time fee items found.</td></tr>';

    const companyTitle = String(invoiceData.company_name || invoiceData.company_legal_name || 'COMPANY NAME').trim();
    const companySubtitle = String(invoiceData.company_tagline || 'Business Software Services').trim();
    const agreementLabel = String(invoiceData.agreement_number || invoiceData.agreement_id || '—').trim();
    const customerName = String(invoiceData.customer_legal_name || invoiceData.customer_name || invoiceData.client_name || '').trim();
    const customerAddress = String(invoiceData.customer_address || '').trim();
    const paymentTerm = String(invoiceData.payment_term || '').trim() || 'Net 30';
    const footerNote = String(invoiceData.footer_note || invoiceData.notes || '').trim();
    const bankRows = [
      ['Bank Name', textValue(invoiceData.bank_name)],
      ['Account Name', textValue(invoiceData.bank_account_name)],
      ['Account Number', textValue(invoiceData.bank_account_number)],
      ['IBAN', textValue(invoiceData.bank_iban)],
      ['SWIFT / BIC', textValue(invoiceData.bank_swift)],
      ['Branch', textValue(invoiceData.bank_branch)],
      ['Beneficiary Address', textValue(invoiceData.bank_beneficiary_address)],
      ['Payment Reference', textValue(invoiceData.invoice_number || invoiceData.invoice_id)]
    ];

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice Preview</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 18px; color: #111827; background: #f3f4f6; }
      .invoice-sheet { max-width: 1020px; margin: 0 auto; background: #fff; border: 1px solid #d1d5db; padding: 22px; }
      .header-top { text-align: center; padding-bottom: 12px; border-bottom: 1px solid #111827; }
      .logo-title { margin: 0; font-size: 26px; letter-spacing: 0.04em; font-weight: 700; }
      .logo-subtitle { margin: 4px 0 0; color: #4b5563; font-size: 12px; }
      .invoice-head { display: grid; grid-template-columns: 1fr 300px; gap: 24px; margin-top: 16px; align-items: start; }
      .invoice-label { margin: 0; font-size: 38px; font-weight: 700; letter-spacing: 0.02em; }
      .meta-box { border: 1px solid #111827; }
      .meta-row { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #d1d5db; }
      .meta-row:last-child { border-bottom: 0; }
      .meta-row > div { padding: 7px 10px; font-size: 12.5px; }
      .meta-row .meta-key { background: #f9fafb; font-weight: 700; border-right: 1px solid #d1d5db; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px; }
      .info-box { border: 1px solid #111827; min-height: 124px; }
      .info-head { background: #f3f4f6; border-bottom: 1px solid #d1d5db; padding: 8px 10px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; }
      .info-body { padding: 10px; font-size: 12.5px; line-height: 1.45; }
      .muted { color: #6b7280; }
      .section { margin-top: 18px; }
      .section h2 { margin: 0; font-size: 16px; border-bottom: 1px solid #111827; padding-bottom: 5px; }
      .section .subhead { font-size: 12px; margin: 6px 0 8px; color: #4b5563; text-transform: uppercase; letter-spacing: 0.04em; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #111827; padding: 7px 8px; font-size: 12px; vertical-align: middle; }
      th { text-align: center; background: #f9fafb; font-weight: 700; }
      .cell-center { text-align: center; vertical-align: middle; }
      .cell-right { text-align: right; vertical-align: middle; white-space: nowrap; }
      .total-row td { font-weight: 700; background: #f9fafb; }
      .totals-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
      .totals-box { width: 380px; border: 1px solid #111827; }
      .totals-row { display: flex; justify-content: space-between; padding: 9px 10px; border-bottom: 1px solid #d1d5db; font-size: 13px; }
      .totals-row:last-child { border-bottom: 0; }
      .totals-row.grand { font-size: 15px; font-weight: 700; background: #f3f4f6; }
      .terms { margin-top: 14px; font-size: 12.5px; line-height: 1.5; }
      .terms .strong { font-weight: 700; }
      .bank { margin-top: 18px; }
      .bank h3 { margin: 0 0 8px; font-size: 15px; letter-spacing: 0.04em; }
      .bank-box { border: 1px solid #111827; }
      .bank-row { display: grid; grid-template-columns: 180px 1fr; border-bottom: 1px solid #d1d5db; }
      .bank-row:last-child { border-bottom: 0; }
      .bank-row > div { padding: 7px 9px; font-size: 12px; }
      .bank-key { background: #f9fafb; font-weight: 700; border-right: 1px solid #d1d5db; }
      .footer-note { margin-top: 16px; font-size: 11px; color: #4b5563; border-top: 1px solid #e5e7eb; padding-top: 8px; text-align: center; }
      @media print { body { margin: 0; padding: 0; background: #fff; } .invoice-sheet { border: 0; max-width: none; } }
    </style>
  </head>
  <body>
    <div class="invoice-sheet">
      <header class="header-top">
        <h1 class="logo-title">${sanitize(companyTitle || 'COMPANY NAME')}</h1>
        <div class="logo-subtitle">${sanitize(companySubtitle)}</div>
      </header>

      <section class="invoice-head">
        <h2 class="invoice-label">INVOICE</h2>
        <div class="meta-box">
          <div class="meta-row"><div class="meta-key">Invoice #</div><div>${textValue(invoiceData.invoice_number || invoiceData.invoice_id)}</div></div>
          <div class="meta-row"><div class="meta-key">Invoice Date</div><div>${dateValue(invoiceData.issue_date || invoiceData.invoice_date)}</div></div>
          <div class="meta-row"><div class="meta-key">Due Date</div><div>${dateValue(invoiceData.due_date)}</div></div>
        </div>
      </section>

      <section class="info-grid">
        <div class="info-box">
          <div class="info-head">BILL TO</div>
          <div class="info-body">
            <div><strong>${textValue(customerName)}</strong></div>
            <div class="muted">${textValue(customerAddress)}</div>
          </div>
        </div>
        <div class="info-box">
          <div class="info-head">INVOICE INFO</div>
          <div class="info-body">
            <div><strong>Related to:</strong> ${textValue(invoiceData.account_reference || invoiceData.related_to || agreementLabel)}</div>
            <div><strong>Payment Term:</strong> ${textValue(paymentTerm)}</div>
            <div><strong>Customer Contact:</strong> ${textValue(invoiceData.customer_contact_name)}</div>
            <div><strong>Email:</strong> ${textValue(invoiceData.customer_contact_email)}</div>
            <div><strong>Agreement #:</strong> ${textValue(agreementLabel)}</div>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>Subscription Details</h2>
        <div class="subhead">SaaS Details</div>
        <table>
          <thead>
            <tr>
              <th style="width:16%">Location Name</th>
              <th style="width:23%">Location Address</th>
              <th style="width:12%">Start Date</th>
              <th style="width:12%">End Date</th>
              <th>Modules / Item Name</th>
              <th style="width:14%">Price</th>
            </tr>
          </thead>
          <tbody>
            ${subscriptionRows}
            <tr class="total-row">
              <td colspan="5" class="cell-right">Total SaaS</td>
              <td class="cell-right">${money(subtotalLocations)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="section">
        <h2>One Time Fees Details</h2>
        <div class="subhead">One Time Fees</div>
        <table>
          <thead>
            <tr>
              <th style="width:14%">Location Name</th>
              <th style="width:22%">Location Address</th>
              <th style="width:17%">Service</th>
              <th style="width:11%">Price</th>
              <th style="width:9%">Discount %</th>
              <th style="width:13%">Disc. Price</th>
              <th style="width:14%">Price / Line Total</th>
            </tr>
          </thead>
          <tbody>
            ${oneTimeRows}
            <tr class="total-row">
              <td colspan="6" class="cell-right">Total One Time Fees</td>
              <td class="cell-right">${money(subtotalOneTime)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="totals-wrap">
        <div class="totals-box">
          <div class="totals-row"><span>One Time Fees</span><strong>${money(subtotalOneTime)}</strong></div>
          <div class="totals-row"><span>Subscription Fees</span><strong>${money(subtotalLocations)}</strong></div>
          <div class="totals-row grand"><span>Grand Total</span><strong>${money(invoiceTotal)}</strong></div>
        </div>
      </section>

      <section class="terms">
        <div><span class="strong">Amount in Words:</span> ${textValue(amountInWords)}</div>
        <div><span class="strong">Payment Term:</span> ${textValue(paymentTerm)}</div>
        <div><span class="strong">Payment Note:</span> ${textValue(paymentConclusion)}</div>
        <div><span class="strong">Additional Notes:</span> ${textValue(invoiceData.notes)}</div>
      </section>

      <section class="bank">
        <h3>BANK DETAILS</h3>
        <div class="bank-box">
          ${bankRows
            .map(([label, value]) => `<div class="bank-row"><div class="bank-key">${U.escapeHtml(label)}</div><div>${value}</div></div>`)
            .join('')}
        </div>
      </section>

      <footer class="footer-note">${textValue(footerNote || 'For billing support, please contact accounts@company.com · +1 (000) 000-0000')}</footer>
    </div>
  </body>
</html>`;
  },
  normalizeSection(value) {
    const raw = String(value ?? '')
      .trim()
      .toLowerCase();
    if (!raw) return '';
    if (['subscription', 'annual', 'annual_saas', 'annual saas', 'saas', 'recurring'].includes(raw)) return 'annual_saas';
    if (['one_time', 'one-time_fee', 'one_time_fee', 'one-time', 'one-time fee', 'one time fee', 'onetime', 'setup', 'non_recurring', 'non-recurring'].includes(raw))
      return 'one_time_fee';
    if (raw === 'capability') return 'capability';
    return raw;
  },
  normalizeDateInputValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const prefixMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (prefixMatch) return prefixMatch[1];
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toISOString().slice(0, 10);
  },
  normalizeItem(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const pick = (...values) => {
      for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
      return '';
    };
    const section = this.normalizeSection(
      pick(source.section, source.item_section, source.itemSection, source.type, source.item_type, source.itemType)
    );
    return {
      catalog_item_id: String(pick(source.catalog_item_id, source.catalogItemId)).trim(),
      section,
      line_no: this.toNumberSafe(pick(source.line_no, source.lineNo, source.line)) || 0,
      location_name: String(pick(source.location_name, source.locationName)).trim(),
      location_address: String(pick(source.location_address, source.locationAddress)).trim(),
      service_start_date: this.normalizeDateInputValue(pick(source.service_start_date, source.serviceStartDate)),
      service_end_date: this.normalizeDateInputValue(pick(source.service_end_date, source.serviceEndDate)),
      item_name: String(pick(source.item_name, source.itemName, source.name)).trim(),
      unit_price: this.toNumberSafe(pick(source.unit_price, source.unitPrice)),
      discount_percent: this.toNumberSafe(pick(source.discount_percent, source.discountPercent)),
      discounted_unit_price: this.toNumberSafe(
        pick(source.discounted_unit_price, source.discountedUnitPrice, source.discounted_price, source.discountedPrice)
      ),
      quantity: this.toNumberSafe(pick(source.quantity, source.qty, source.units)),
      line_total: this.toNumberSafe(pick(source.line_total, source.lineTotal, source.amount, source.total)),
      capability_name: String(pick(source.capability_name, source.capabilityName)).trim(),
      capability_value: String(pick(source.capability_value, source.capabilityValue)).trim(),
      notes: String(pick(source.notes)).trim()
    };
  },
  normalizeCatalogItem(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const pick = (...values) => {
      for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
      return '';
    };
    return {
      catalog_item_id: String(pick(source.catalog_item_id, source.catalogItemId, source.id)).trim(),
      section: this.normalizeSection(pick(source.section, source.item_section, source.type)),
      item_name: String(pick(source.item_name, source.itemName, source.name)).trim(),
      unit_price: this.toNumberSafe(pick(source.unit_price, source.unitPrice)),
      discount_percent: this.toNumberSafe(pick(source.discount_percent, source.discountPercent)),
      quantity: this.toNumberSafe(pick(source.quantity, source.qty)),
      notes: String(pick(source.notes)).trim()
    };
  },
  async getProposalCatalogLookup() {
    try {
      const response = await Api.listProposalCatalogItems({ limit: 200, page: 1, summary_only: true });
      const rows = Array.isArray(response) ? response : response?.rows || response?.items || response?.data || response?.result || [];
      const normalized = (Array.isArray(rows) ? rows : []).map(item => this.normalizeCatalogItem(item));
      const byId = new Map();
      const byName = new Map();
      normalized.forEach(item => {
        if (item.catalog_item_id) byId.set(item.catalog_item_id, item);
        if (item.item_name) byName.set(item.item_name.toLowerCase(), item);
      });
      return { byId, byName, names: normalized.map(item => item.item_name).filter(Boolean) };
    } catch (_error) {
      return { byId: new Map(), byName: new Map(), names: [] };
    }
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
  getCachedDetail(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    const cached = this.state.detailCacheById[key];
    if (!cached) return null;
    if (Date.now() - Number(cached.cachedAt || 0) > this.state.detailCacheTtlMs) return null;
    return cached;
  },
  setCachedDetail(id, invoice, items) {
    const key = String(id || '').trim();
    if (!key) return;
    this.state.detailCacheById[key] = {
      invoice: this.normalizeInvoice(invoice || { id: key }),
      items: Array.isArray(items) ? items.map(item => this.normalizeItem(item)) : [],
      cachedAt: Date.now()
    };
  },
  setTriggerBusy(trigger, busy) {
    if (!trigger || !('disabled' in trigger)) return;
    trigger.disabled = !!busy;
  },
  setFormDetailLoading(loading) {
    if (!E.invoiceForm) return;
    if (loading) E.invoiceForm.setAttribute('data-detail-loading', 'true');
    else E.invoiceForm.removeAttribute('data-detail-loading');
    if (E.invoiceFormTitle) {
      const baseTitle = String(E.invoiceFormTitle.textContent || '').replace(/\s+\u00b7\s+Loading details…$/, '').trim();
      E.invoiceFormTitle.textContent = loading ? `${baseTitle || 'Invoice'} · Loading details…` : baseTitle;
    }
  },
  async runRowAction(actionKey, trigger, fn) {
    const key = String(actionKey || '').trim();
    if (!key) return;
    if (this.state.rowActionInFlight.has(key)) return;
    this.state.rowActionInFlight.add(key);
    this.setTriggerBusy(trigger, true);
    try {
      await fn();
    } finally {
      this.state.rowActionInFlight.delete(key);
      this.setTriggerBusy(trigger, false);
    }
  },
  mergeCatalogItem(invoiceItem = {}, catalogLookup = { byId: new Map(), byName: new Map() }) {
    const byId = catalogLookup?.byId instanceof Map ? catalogLookup.byId : new Map();
    const byName = catalogLookup?.byName instanceof Map ? catalogLookup.byName : new Map();
    const catalogItemId = String(invoiceItem.catalog_item_id || '').trim();
    const itemName = String(invoiceItem.item_name || '').trim().toLowerCase();
    const catalogMatch = (catalogItemId && byId.get(catalogItemId)) || (itemName && byName.get(itemName)) || null;
    const base = this.normalizeItem(invoiceItem);
    const merged = this.normalizeItem({
      ...base,
      ...(catalogMatch || {}),
      catalog_item_id: catalogItemId || catalogMatch?.catalog_item_id || '',
      section: this.normalizeSection(base.section || catalogMatch?.section),
      item_name: base.item_name || catalogMatch?.item_name || '',
      notes: base.notes || catalogMatch?.notes || ''
    });
    const hasDiscountedUnitPrice = invoiceItem?.discounted_unit_price !== undefined && invoiceItem?.discounted_unit_price !== null;
    const hasLineTotal = invoiceItem?.line_total !== undefined && invoiceItem?.line_total !== null;
    if (!hasDiscountedUnitPrice || !hasLineTotal) {
      const discountRatio =
        merged.discount_percent > 1 ? merged.discount_percent / 100 : Math.max(0, merged.discount_percent);
      if (!hasDiscountedUnitPrice) merged.discounted_unit_price = merged.unit_price * (1 - discountRatio);
      if (!hasLineTotal) merged.line_total = merged.discounted_unit_price * (merged.quantity || 0);
    }
    return merged;
  },
  copyInvoiceItemFields(sourceItem = {}, mergedItem = {}) {
    const source = this.normalizeItem(sourceItem);
    const merged = this.normalizeItem(mergedItem);
    const pick = (sourceValue, mergedValue) => {
      if (sourceValue === undefined || sourceValue === null) return mergedValue;
      if (typeof sourceValue === 'string') return sourceValue.trim() !== '' ? sourceValue : mergedValue;
      return sourceValue;
    };
    return this.normalizeItem({
      ...merged,
      section: pick(source.section, merged.section),
      line_no: pick(source.line_no, merged.line_no),
      location_name: pick(source.location_name, merged.location_name),
      location_address: pick(source.location_address, merged.location_address),
      item_name: pick(source.item_name, merged.item_name),
      unit_price: pick(source.unit_price, merged.unit_price),
      discount_percent: pick(source.discount_percent, merged.discount_percent),
      discounted_unit_price: pick(source.discounted_unit_price, merged.discounted_unit_price),
      quantity: pick(source.quantity, merged.quantity),
      line_total: pick(source.line_total, merged.line_total),
      capability_name: pick(source.capability_name, merged.capability_name),
      capability_value: pick(source.capability_value, merged.capability_value),
      notes: pick(source.notes, merged.notes),
      service_start_date: pick(source.service_start_date, merged.service_start_date),
      service_end_date: pick(source.service_end_date, merged.service_end_date)
    });
  },
  isSubscriptionSection(section = '') {
    const normalized = this.normalizeSection(section);
    return ['annual_saas', 'subscription', 'recurring', 'saas'].includes(normalized);
  },
  isOneTimeSection(section = '') {
    const normalized = this.normalizeSection(section);
    return ['one_time_fee', 'one_time', 'setup', 'non_recurring', 'non-recurring'].includes(normalized);
  },
  calculateInvoiceTotals(items = []) {
    return (Array.isArray(items) ? items : []).reduce(
      (acc, rawItem) => {
        const item = this.normalizeItem(rawItem);
        const lineTotal = this.toNumberSafe(item.line_total);
        if (this.isSubscriptionSection(item.section)) acc.subtotal_subscription += lineTotal;
        else if (this.isOneTimeSection(item.section)) acc.subtotal_one_time += lineTotal;
        acc.grand_total += lineTotal;
        return acc;
      },
      { subtotal_subscription: 0, subtotal_one_time: 0, grand_total: 0 }
    );
  },
  amountToWords(value, currency = 'USD') {
    const amount = this.toNumberSafe(value);
    const whole = Math.floor(Math.max(0, amount));
    const cents = Math.round((amount - whole) * 100);
    const ones = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const underThousand = n => {
      if (n < 20) return ones[n];
      if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`;
      return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${underThousand(n % 100)}` : ''}`;
    };
    const toWords = n => {
      if (n === 0) return 'Zero';
      const chunks = [[1_000_000_000, 'Billion'], [1_000_000, 'Million'], [1_000, 'Thousand'], [1, '']];
      let remaining = n;
      const out = [];
      chunks.forEach(([size, label]) => {
        if (remaining < size) return;
        const chunk = Math.floor(remaining / size);
        remaining %= size;
        out.push(`${underThousand(chunk)}${label ? ` ${label}` : ''}`);
      });
      return out.join(' ');
    };
    const currencyLabel = String(currency || 'USD').trim().toUpperCase() === 'USD' ? 'Dollars' : String(currency || 'Currency').trim().toUpperCase();
    return `${toWords(whole)} ${currencyLabel} and ${String(cents).padStart(2, '0')}/100`;
  },
  derivePaymentConclusion(invoice = {}) {
    const pending = this.toNumberSafe(invoice.pending_amount);
    return pending <= 0 ? 'Settlement Completed' : 'Pending Settlement';
  },
  deriveCalculatedSummary(invoice = {}, items = [], { preferInvoiceValues = false } = {}) {
    const hasItems = Array.isArray(items) && items.length > 0;
    const itemTotals = this.calculateInvoiceTotals(items);
    const totals = preferInvoiceValues && !hasItems
      ? {
          subtotal_subscription: this.toNumberSafe(invoice.subtotal_subscription),
          subtotal_one_time: this.toNumberSafe(invoice.subtotal_one_time),
          grand_total: this.toNumberSafe(invoice.grand_total)
        }
      : itemTotals;
    const derivedPayment = this.derivePaymentFields({
      ...invoice,
      grand_total: totals.grand_total,
      amount_paid: this.toNumberSafe(invoice.amount_paid)
    });
    const amountInWords = this.amountToWords(totals.grand_total, invoice.currency);
    const paymentConclusion = this.derivePaymentConclusion(derivedPayment);
    return {
      ...totals,
      subtotal_locations: totals.subtotal_subscription,
      invoice_total: totals.grand_total,
      ...derivedPayment,
      received_amount: derivedPayment.amount_paid,
      amount_in_words: amountInWords,
      payment_conclusion: paymentConclusion
    };
  },
  applyTotalsToForm(summary = {}) {
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = this.toNumberSafe(value);
    };
    set('invoiceFormSubtotalSubscription', summary.subtotal_subscription);
    set('invoiceFormSubtotalOneTime', summary.subtotal_one_time);
    set('invoiceFormGrandTotal', summary.grand_total);
    set('invoiceFormAmountPaid', summary.amount_paid);
    set('invoiceFormPendingAmount', summary.pending_amount);
    if (E.invoiceFormPaymentState) E.invoiceFormPaymentState.value = String(summary.payment_state || 'Unpaid');
    if (E.invoiceFormAmountInWords) E.invoiceFormAmountInWords.value = String(summary.amount_in_words || '');
    if (E.invoicePaymentConclusion) E.invoicePaymentConclusion.textContent = String(summary.payment_conclusion || 'Pending Settlement');
  },
  todayIso() {
    return new Date().toISOString().slice(0, 10);
  },
  generateInvoiceNumber() {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${datePart}-${randomPart}`;
  },
  ensureInvoiceNumber(value = '') {
    const existing = String(value || '').trim();
    return existing || this.generateInvoiceNumber();
  },
  getCatalogRowsForSection(section) {
    const rows = Array.isArray(window.ProposalCatalog?.state?.rows)
      ? window.ProposalCatalog.state.rows
      : [];
    return rows
      .filter(row => row?.is_active !== false && String(row?.section || '').trim().toLowerCase() === section)
      .sort((a, b) => {
        const aSort = Number.isFinite(Number(a?.sort_order)) ? Number(a.sort_order) : Number.MAX_SAFE_INTEGER;
        const bSort = Number.isFinite(Number(b?.sort_order)) ? Number(b.sort_order) : Number.MAX_SAFE_INTEGER;
        if (aSort !== bSort) return aSort - bSort;
        return String(a?.item_name || '').localeCompare(String(b?.item_name || ''));
      });
  },
  renderCatalogOptionList(section) {
    const list = document.getElementById(`invoiceCatalogOptions-${section}`);
    if (!list) return;
    const seen = new Set();
    list.innerHTML = this.getCatalogRowsForSection(section)
      .filter(row => {
        const key = String(row?.item_name || '').trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(row => `<option value="${U.escapeAttr(String(row?.item_name || '').trim())}"></option>`)
      .join('');
  },
  renderCatalogOptionLists() {
    this.renderCatalogOptionList('annual_saas');
    this.renderCatalogOptionList('one_time_fee');
  },
  async ensureCatalogLoaded() {
    this.renderCatalogOptionLists();
    const hasRows =
      this.getCatalogRowsForSection('annual_saas').length || this.getCatalogRowsForSection('one_time_fee').length;
    if (hasRows) return;
    if (this.state.catalogLoading || typeof window.ProposalCatalog?.loadAndRefresh !== 'function') return;
    this.state.catalogLoading = true;
    try {
      await window.ProposalCatalog.loadAndRefresh();
      this.renderCatalogOptionLists();
    } catch (_) {
      // Non-blocking: invoice form still allows manual item entry when catalog load fails.
    } finally {
      this.state.catalogLoading = false;
    }
  },
  extractRows(response) {
    const parseJsonIfNeeded = value => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      if (!(trimmed.startsWith('[') || trimmed.startsWith('{'))) return value;
      try {
        return JSON.parse(trimmed);
      } catch (_error) {
        return value;
      }
    };
    const coerceRows = value => {
      const parsed = parseJsonIfNeeded(value);
      if (Array.isArray(parsed)) return parsed;
      if (!parsed || typeof parsed !== 'object') return [];
      const values = Object.values(parsed).filter(Boolean);
      if (!values.length || !values.every(item => item && typeof item === 'object')) return [];
      const hasInvoiceLikeShape = values.some(
        item =>
          'invoice_id' in item ||
          'invoiceId' in item ||
          'invoice_number' in item ||
          'invoiceNumber' in item ||
          'agreement_id' in item ||
          'agreementId' in item
      );
      return hasInvoiceLikeShape ? values : [];
    };
    const candidates = [
      response,
      response?.invoices,
      response?.items,
      response?.rows,
      response?.data,
      response?.result,
      response?.payload,
      response?.data?.invoices,
      response?.result?.invoices,
      response?.payload?.invoices
    ];
    for (const candidate of candidates) {
      const rows = coerceRows(candidate);
      if (rows.length) return rows;
    }
    return [];
  },
  extractInvoiceAndItems(response, fallbackId = '') {
    const parseJsonIfNeeded = value => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;
      try {
        return JSON.parse(trimmed);
      } catch (_error) {
        return value;
      }
    };

    const candidates = [
      response,
      response?.data,
      response?.result,
      response?.payload,
      response?.item,
      response?.invoice,
      response?.created_invoice
    ];

    let invoice = null;
    let items = [];

    for (const rawCandidate of candidates) {
      const candidate = parseJsonIfNeeded(rawCandidate);
      if (!candidate) continue;

      if (Array.isArray(candidate)) {
        const first = candidate[0];
        if (!invoice && first && typeof first === 'object') {
          invoice = first;
        }
        if (!items.length && Array.isArray(first?.items)) {
          items = first.items;
        }
        continue;
      }

      if (typeof candidate !== 'object') continue;

      if (!invoice) {
        if (candidate.item && typeof candidate.item === 'object') invoice = candidate.item;
        else if (candidate.invoice && typeof candidate.invoice === 'object') invoice = candidate.invoice;
        else if (candidate.created_invoice && typeof candidate.created_invoice === 'object') invoice = candidate.created_invoice;
        else if (Array.isArray(candidate.data) && candidate.data[0] && typeof candidate.data[0] === 'object') invoice = candidate.data[0];
        else if (candidate.data && typeof candidate.data === 'object' && !Array.isArray(candidate.data)) invoice = candidate.data;
        else if (candidate.invoice_id || candidate.invoice_number) invoice = candidate;
      }

      if (!items.length) {
        if (Array.isArray(candidate.items)) items = candidate.items;
        else if (Array.isArray(candidate.invoice_items)) items = candidate.invoice_items;
        else if (Array.isArray(candidate.created_invoice_items)) items = candidate.created_invoice_items;
        else if (candidate.item && Array.isArray(candidate.item.items)) items = candidate.item.items;
        else if (candidate.invoice && Array.isArray(candidate.invoice.items)) items = candidate.invoice.items;
        else if (candidate.created_invoice && Array.isArray(candidate.created_invoice.items)) items = candidate.created_invoice.items;
        else if (Array.isArray(candidate.data) && Array.isArray(candidate.data[0]?.items)) items = candidate.data[0].items;
        else if (candidate.data && Array.isArray(candidate.data.items)) items = candidate.data.items;
      }
    }

    return {
      invoice: this.normalizeInvoice(invoice || { id: fallbackId }),
      items: Array.isArray(items) ? items.map(item => this.normalizeItem(item)) : []
    };
  },
  emptyInvoice() {
    return {
      invoice_id: '',
      invoice_number: this.generateInvoiceNumber(),
      agreement_id: '',
      invoice_date: this.todayIso(),
      issue_date: this.todayIso(),
      due_date: '',
      billing_frequency: '',
      customer_name: '',
      customer_legal_name: '',
      customer_address: '',
      customer_contact_name: '',
      customer_contact_email: '',
      provider_legal_name: '',
      provider_address: '',
      support_email: '',
      payment_term: '',
      currency: 'USD',
      status: 'Draft',
      subtotal_subscription: '',
      subtotal_locations: '',
      subtotal_one_time: '',
      invoice_total: '',
      grand_total: '',
      received_amount: 0,
      amount_paid: 0,
      pending_amount: 0,
      payment_state: 'Unpaid',
      payment_conclusion: 'Pending Settlement',
      amount_in_words: '',
      notes: ''
    };
  },

  derivePaymentFields(invoice = {}) {
    const grandTotal = this.toNumberSafe(invoice.grand_total);
    const amountPaidCandidate =
      invoice.amount_paid !== undefined && invoice.amount_paid !== null && invoice.amount_paid !== ''
        ? invoice.amount_paid
        : invoice.received_amount;
    let amountPaid = this.toNumberSafe(amountPaidCandidate);
    amountPaid = Math.max(0, amountPaid);

    const pendingAmount = Math.max(0, grandTotal - amountPaid);
    const paymentState = amountPaid <= 0 ? 'Unpaid' : pendingAmount > 0 ? 'Partially Paid' : 'Paid';

    return {
      amount_paid: amountPaid,
      pending_amount: pendingAmount,
      payment_state: paymentState
    };
  },
  syncPaymentFieldsInForm() {
    const grandTotal = this.toNumberSafe(E.invoiceFormGrandTotal?.value);
    const amountPaidInput = E.invoiceFormAmountPaid;
    const wrap = E.invoiceFormAmountPaidWrap;
    const pendingWrap = E.invoiceFormPendingAmountWrap;
    const pendingInput = E.invoiceFormPendingAmount;

    let amountPaid = this.toNumberSafe(amountPaidInput?.value);
    amountPaid = Math.max(0, amountPaid);

    const showAmountPaid = true;
    if (wrap) wrap.style.display = '';
    if (amountPaidInput) {
      amountPaidInput.value = amountPaid;
      amountPaidInput.readOnly = false;
      amountPaidInput.required = false;
    }

    const pendingAmount = Math.max(0, grandTotal - amountPaid);
    if (pendingInput) pendingInput.value = pendingAmount;
    if (pendingWrap) pendingWrap.style.display = '';

    const paymentState = amountPaid <= 0 ? 'Unpaid' : grandTotal - amountPaid > 0 ? 'Partially Paid' : 'Paid';
    if (E.invoiceFormPaymentState) E.invoiceFormPaymentState.value = paymentState;
    if (E.invoiceFormAmountInWords) E.invoiceFormAmountInWords.value = this.amountToWords(grandTotal, E.invoiceFormCurrency?.value || 'USD');
    this.syncPaymentConclusion({ pending_amount: pendingAmount });
  },
  applyFilters() {
    const terms = String(this.state.search || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    this.state.filteredRows = this.state.rows.filter(row => {
      if (this.state.status !== 'All' && String(row.status || '').trim() !== this.state.status) return false;
      if (!this.matchesKpiFilter(row)) return false;
      const hay = [row.invoice_id, row.invoice_number, row.customer_name, row.agreement_id, row.status, row.currency]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (terms.length && !terms.every(term => hay.includes(term))) return false;
      return true;
    });
  },
  matchesKpiFilter(row = {}) {
    const filter = this.state.kpiFilter || 'total';
    const status = this.normalizeText(row?.status);
    if (filter === 'total') return true;
    if (filter === 'draft') return status === 'draft';
    if (filter === 'issued') return status === 'issued';
    if (filter === 'partially-paid') return status === 'partially paid';
    if (filter === 'paid') return status === 'paid';
    if (filter === 'overdue') return status === 'overdue';
    return true;
  },
  applyKpiFilter(filter) {
    const nextFilter = String(filter || 'total').trim() || 'total';
    this.state.kpiFilter = this.state.kpiFilter === nextFilter ? 'total' : nextFilter;
    this.applyFilters();
    this.render();
  },
  upsertLocalRow(row) {
    const normalized = this.normalizeInvoice(row);
    const id = this.invoiceDbId(normalized.id);
    if (!id) return normalized;
    const idx = this.state.rows.findIndex(item => this.invoiceDbId(item.id) === id);
    if (idx === -1) this.state.rows.unshift(normalized);
    else this.state.rows[idx] = { ...this.state.rows[idx], ...normalized };
    this.rerenderVisibleTable();
    return normalized;
  },
  removeLocalRow(id) {
    const targetId = this.invoiceDbId(id);
    const before = this.state.rows.length;
    this.state.rows = this.state.rows.filter(item => this.invoiceDbId(item.id) !== targetId);
    if (this.state.rows.length !== before) this.rerenderVisibleTable();
  },
  rerenderVisibleTable() {
    this.applyFilters();
    this.renderFilters();
    this.render();
  },
  renderSummary() {
    if (!E.invoiceSummary) return;
    const rows = this.state.filteredRows;
    const count = label => rows.filter(row => this.normalizeText(row.status) === label.toLowerCase()).length;
    const cards = [
      ['Total Invoices', rows.length, 'total'],
      ['Draft', count('draft'), 'draft'],
      ['Issued', count('issued'), 'issued'],
      ['Partially Paid', count('partially paid'), 'partially-paid'],
      ['Paid', count('paid'), 'paid'],
      ['Overdue', count('overdue'), 'overdue']
    ];
    E.invoiceSummary.innerHTML = cards
      .map(([label, value, filter]) => {
        const active = (this.state.kpiFilter || 'total') === filter;
        return `<div class="card kpi${active ? ' kpi-filter-active' : ''}" data-kpi-filter="${U.escapeAttr(filter)}" role="button" tabindex="0" aria-pressed="${active ? 'true' : 'false'}"><div class="label">${U.escapeHtml(label)}</div><div class="value">${U.escapeHtml(String(value))}</div></div>`;
      })
      .join('');
  },
  renderFilters() {
    if (E.invoicesSearchInput) E.invoicesSearchInput.value = this.state.search;
    if (E.invoicesStatusFilter) {
      const seen = [...new Set(this.state.rows.map(row => String(row.status || '').trim()).filter(Boolean))];
      const options = ['All', ...this.statusOptions, ...seen.filter(v => !this.statusOptions.includes(v))];
      E.invoicesStatusFilter.innerHTML = [...new Set(options)].map(v => `<option>${U.escapeHtml(v)}</option>`).join('');
      E.invoicesStatusFilter.value = options.includes(this.state.status) ? this.state.status : 'All';
    }
  },
  render() {
    if (!E.invoicesState || !E.invoicesTbody) return;
    if (this.state.loading) {
      E.invoicesState.textContent = 'Loading invoices…';
      E.invoicesTbody.innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center;">Loading invoices…</td></tr>';
      return;
    }
    if (this.state.loadError) {
      E.invoicesState.textContent = this.state.loadError;
      E.invoicesTbody.innerHTML = `<tr><td colspan="10" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(this.state.loadError)}</td></tr>`;
      return;
    }
    this.renderSummary();
    const rows = this.state.filteredRows;
    const totalRows = this.state.rows.length;
    E.invoicesState.textContent = `${rows.length} of ${totalRows} invoice${totalRows === 1 ? '' : 's'}`;
    if (!rows.length) {
      const emptyMessage = totalRows
        ? 'No invoices match the current search or filters.'
        : 'No invoices found. Create your first invoice to get started.';
      E.invoicesTbody.innerHTML = `<tr><td colspan="10" class="muted" style="text-align:center;">${U.escapeHtml(emptyMessage)}</td></tr>`;
      return;
    }
    const textCell = value => U.escapeHtml(String(value ?? '').trim() || '—');
    E.invoicesTbody.innerHTML = rows
      .map(row => {
        const id = U.escapeAttr(row.id || '');
        return `<tr>
          <td>${textCell(row.invoice_number || row.invoice_id)}</td>
          <td>${textCell(row.customer_name)}</td>
          <td>${textCell(row.agreement_id)}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.invoice_date))}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.due_date))}</td>
          <td>${textCell(row.currency)}</td>
          <td>${this.formatMoney(row.grand_total)}</td>
          <td>${textCell(row.status)}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.updated_at))}</td>
          <td><div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn ghost sm" type="button" data-invoice-view="${id}">Open</button>
            ${Permissions.canUpdateInvoice() ? `<button class="btn ghost sm" type="button" data-invoice-edit="${id}">Edit</button>` : ''}
            ${Permissions.canPreviewInvoice() ? `<button class="btn ghost sm" type="button" data-invoice-preview="${id}">Preview</button>` : ''}
            ${Permissions.canCreateReceiptFromInvoice() && this.canCreateReceiptFromInvoice(row) ? `<button class="btn ghost sm" type="button" data-invoice-create-receipt="${id}">Create Receipt</button>` : ''}
            ${Permissions.canDeleteInvoice() ? `<button class="btn ghost sm" type="button" data-invoice-delete="${id}">Delete</button>` : ''}
          </div></td>
        </tr>`;
      })
      .join('');
  },
  computeCommercialRow(item = {}) {
    const unit = this.toNumberSafe(item.unit_price);
    const discount = this.toNumberSafe(item.discount_percent);
    const qty = this.toNumberSafe(item.quantity);
    const discountRatio = discount > 1 ? discount / 100 : Math.max(0, discount);
    const discounted = unit * (1 - discountRatio);
    const lineTotal = discounted * qty;
    return {
      ...item,
      discounted_unit_price: discounted,
      line_total: lineTotal
    };
  },
  groupedItems(items = []) {
    const groups = { annual_saas: [], one_time_fee: [], capability: [] };
    (Array.isArray(items) ? items : []).forEach((item, idx) => {
      const normalized = this.normalizeItem(item);
      const section = ['annual_saas', 'one_time_fee', 'capability'].includes(normalized.section)
        ? normalized.section
        : 'annual_saas';
      normalized.line_no = normalized.line_no || idx + 1;
      groups[section].push(normalized);
    });
    return groups;
  },
  getCatalogItemByName(section, itemName) {
    const target = this.normalizeText(itemName);
    if (!target) return null;
    return (
      this.getCatalogRowsForSection(section).find(row => this.normalizeText(row?.item_name) === target) || null
    );
  },
  applyCatalogSelectionToRow(tr, section) {
    if (!tr || section === 'capability') return;
    const itemInput = tr.querySelector('[data-item-field="item_name"]');
    const unitPriceInput = tr.querySelector('[data-item-field="unit_price"]');
    const locationInput = tr.querySelector('[data-item-field="location_name"]');
    if (!itemInput || !unitPriceInput) return;

    const selected = this.getCatalogItemByName(section, itemInput.value);
    if (!selected) {
      unitPriceInput.readOnly = false;
      unitPriceInput.removeAttribute('title');
      tr.dataset.priceLocked = 'false';
      return;
    }

    if (selected.unit_price !== null && selected.unit_price !== undefined) {
      unitPriceInput.value = String(selected.unit_price);
    }
    unitPriceInput.readOnly = true;
    unitPriceInput.title = 'Unit price is set from the proposal catalog.';
    tr.dataset.priceLocked = 'true';
    if (locationInput && !String(locationInput.value || '').trim() && selected.default_location_name) {
      locationInput.value = String(selected.default_location_name);
    }
  },
  renderSectionRows(section, rows = []) {
    const tbody =
      section === 'annual_saas'
        ? E.invoiceAnnualItemsTbody
        : section === 'one_time_fee'
        ? E.invoiceOneTimeItemsTbody
        : E.invoiceCapabilityItemsTbody;
    if (!tbody) return;

    const safeRows = Array.isArray(rows) ? rows : [];
    if (!safeRows.length) {
      const colspan = section === 'capability' ? 4 : 12;
      tbody.innerHTML = `<tr><td colspan="${colspan}" class="muted" style="text-align:center;">No rows yet.</td></tr>`;
      return;
    }

    if (section === 'capability') {
      tbody.innerHTML = safeRows
        .map(
          (row, index) => `<tr data-item-row="${section}">
          <td><input class="input" data-item-field="capability_name" value="${U.escapeAttr(row.capability_name || '')}" /></td>
          <td><input class="input" data-item-field="capability_value" value="${U.escapeAttr(row.capability_value || '')}" /></td>
          <td><input class="input" data-item-field="notes" value="${U.escapeAttr(row.notes || '')}" /></td>
          <td><button class="btn ghost sm" type="button" data-item-remove="${section}" data-item-index="${index}">Remove</button></td>
        </tr>`
        )
        .join('');
      return;
    }

    tbody.innerHTML = safeRows
      .map((row, index) => {
        const computed = this.computeCommercialRow(row);
        return `<tr data-item-row="${section}">
          <td><input class="input" data-item-field="location_name" value="${U.escapeAttr(computed.location_name || '')}" /></td>
          <td><input class="input" data-item-field="location_address" value="${U.escapeAttr(computed.location_address || '')}" /></td>
          <td><input class="input" type="date" data-item-field="service_start_date" value="${U.escapeAttr(computed.service_start_date || '')}" /></td>
          <td><input class="input" type="date" data-item-field="service_end_date" value="${U.escapeAttr(computed.service_end_date || '')}" /></td>
          <td><input class="input" data-item-field="item_name" list="invoiceCatalogOptions-${section}" value="${U.escapeAttr(computed.item_name || '')}" /></td>
          <td><input class="input" type="number" step="0.01" data-item-field="unit_price" value="${U.escapeAttr(computed.unit_price ?? '')}" /></td>
          <td><input class="input" type="number" step="0.01" data-item-field="discount_percent" value="${U.escapeAttr(computed.discount_percent ?? '')}" /></td>
          <td><input class="input" type="number" step="0.01" data-item-field="quantity" value="${U.escapeAttr(computed.quantity ?? '')}" /></td>
          <td><span data-item-display="discounted_unit_price">${this.formatMoney(computed.discounted_unit_price)}</span></td>
          <td><span data-item-display="line_total">${this.formatMoney(computed.line_total)}</span></td>
          <td><input class="input" data-item-field="notes" value="${U.escapeAttr(computed.notes || '')}" /></td>
          <td><button class="btn ghost sm" type="button" data-item-remove="${section}" data-item-index="${index}">Remove</button></td>
        </tr>`;
      })
      .join('');
    [...tbody.querySelectorAll('tr[data-item-row]')].forEach(tr => this.applyCatalogSelectionToRow(tr, section));
  },
  renderItems(items = []) {
    this.renderCatalogOptionLists();
    const groups = this.groupedItems(items);
    this.renderSectionRows('annual_saas', groups.annual_saas);
    this.renderSectionRows('one_time_fee', groups.one_time_fee);
    this.renderSectionRows('capability', groups.capability);
  },
  assignFormValues(invoice = {}) {
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      const safeValue =
        el.type === 'date'
          ? this.normalizeDateInputValue(value)
          : value ?? '';
      el.value = safeValue;
    };
    this.invoiceFields.forEach(field => {
      const id = `invoiceForm${field.replace(/(^|_)([a-z])/g, (_, __, ch) => ch.toUpperCase())}`;
      set(id, invoice[field] || '');
    });
  },
  collectSectionItems(section) {
    const tbody =
      section === 'annual_saas'
        ? E.invoiceAnnualItemsTbody
        : section === 'one_time_fee'
        ? E.invoiceOneTimeItemsTbody
        : E.invoiceCapabilityItemsTbody;
    if (!tbody) return [];
    const rows = [...tbody.querySelectorAll('tr[data-item-row]')];
    return rows
      .map((tr, idx) => {
        const get = field => tr.querySelector(`[data-item-field="${field}"]`)?.value ?? '';
        if (section === 'capability') {
          const capabilityName = String(get('capability_name')).trim();
          const capabilityValue = String(get('capability_value')).trim();
          const notes = String(get('notes')).trim();
          if (!capabilityName && !capabilityValue && !notes) return null;
          return { section, line_no: idx + 1, capability_name: capabilityName, capability_value: capabilityValue, notes };
        }
        const unitPrice = this.toNumberSafe(get('unit_price'));
        const discountPercent = this.toNumberSafe(get('discount_percent'));
        const quantity = this.toNumberSafe(get('quantity'));
        const computed = this.computeCommercialRow({ unit_price: unitPrice, discount_percent: discountPercent, quantity });
        const hasMeaningfulValue = [
          get('item_name'),
          get('location_name'),
          get('location_address'),
          get('service_start_date'),
          get('service_end_date'),
          get('notes')
        ].some(value => String(value || '').trim()) || unitPrice || quantity;
        if (!hasMeaningfulValue) return null;
        return this.normalizeItem({
          section,
          line_no: idx + 1,
          location_name: String(get('location_name')).trim(),
          location_address: String(get('location_address')).trim(),
          service_start_date: String(get('service_start_date')).trim(),
          service_end_date: String(get('service_end_date')).trim(),
          item_name: String(get('item_name')).trim(),
          unit_price: unitPrice,
          discount_percent: discountPercent,
          quantity,
          discounted_unit_price: computed.discounted_unit_price,
          line_total: computed.line_total,
          notes: String(get('notes')).trim()
        });
      })
      .filter(Boolean);
  },
  collectItems() {
    return [
      ...this.collectSectionItems('annual_saas'),
      ...this.collectSectionItems('one_time_fee'),
      ...this.collectSectionItems('capability')
    ];
  },
  collectFormValues() {
    const get = id => String(document.getElementById(id)?.value || '').trim();
    const invoice = {};
    const existingInvoice = this.state.selectedInvoice || {};
    this.invoiceFields.forEach(field => {
      const id = `invoiceForm${field.replace(/(^|_)([a-z])/g, (_, __, ch) => ch.toUpperCase())}`;
      const inputEl = document.getElementById(id);
      if (inputEl) invoice[field] = get(id);
      else invoice[field] = existingInvoice[field] ?? '';
    });
    invoice.issue_date = String(invoice.issue_date || invoice.invoice_date || '').trim();
    invoice.invoice_date = String(invoice.invoice_date || invoice.issue_date || '').trim();
    const items = this.collectItems();
    invoice.amount_paid = this.toNumberSafe(E.invoiceFormAmountPaid?.value);
    invoice.received_amount = invoice.amount_paid;
    invoice.pending_amount = this.toNumberSafe(E.invoiceFormPendingAmount?.value);
    invoice.payment_state = String(E.invoiceFormPaymentState?.value || '').trim();
    invoice.payment_conclusion = this.derivePaymentConclusion(invoice);
    invoice.subtotal_locations = this.toNumberSafe(invoice.subtotal_locations || invoice.subtotal_subscription);
    invoice.invoice_total = this.toNumberSafe(invoice.invoice_total || invoice.grand_total);
    return { invoice, items };
  },
  validateInvoice(invoice = {}) {
    const requiredFields = [
      ['invoice_number', 'Invoice Number'],
      ['agreement_id', 'Agreement ID'],
      ['invoice_date', 'Invoice Date'],
      ['due_date', 'Due Date'],
      ['currency', 'Currency']
    ];
    const missing = requiredFields.filter(([field]) => !String(invoice?.[field] || '').trim());
    if (missing.length) {
      const firstFieldId = `invoiceForm${missing[0][0].replace(/(^|_)([a-z])/g, (_, __, ch) => ch.toUpperCase())}`;
      const firstFieldEl = document.getElementById(firstFieldId);
      if (firstFieldEl) firstFieldEl.focus();
      UI.toast(`Please fill required fields: ${missing.map(([, label]) => label).join(', ')}`);
      return false;
    }

    const status = String(invoice?.status || '').trim();
    const grandTotal = this.toNumberSafe(invoice?.grand_total);
    const amountPaid = this.toNumberSafe(invoice?.amount_paid);
    if (status === 'Partially Paid' && !(amountPaid > 0 && amountPaid < grandTotal)) {
      UI.toast('For Partially Paid invoices, Amount Paid must be greater than 0 and less than Grand Total.');
      E.invoiceFormAmountPaid?.focus();
      return false;
    }
    return true;
  },
  openInvoice(invoice = this.emptyInvoice(), items = [], { readOnly = false } = {}) {
    if (!E.invoiceFormModal || !E.invoiceForm) return;
    this.state.selectedInvoice = this.normalizeInvoice(invoice);
    this.state.selectedInvoice.invoice_number = this.ensureInvoiceNumber(this.state.selectedInvoice.invoice_number);
    if (!this.state.selectedInvoice.invoice_date) this.state.selectedInvoice.invoice_date = this.todayIso();
    this.state.items = Array.isArray(items) ? items.map(item => this.normalizeItem(item)) : [];
    this.assignFormValues(this.state.selectedInvoice);
    this.renderItems(this.state.items);
    const summary = this.deriveCalculatedSummary(this.state.selectedInvoice, this.state.items, { preferInvoiceValues: true });
    this.state.selectedInvoice = this.normalizeInvoice({ ...this.state.selectedInvoice, ...summary });
    this.applyTotalsToForm(summary);
    this.syncPaymentFieldsInForm();
    this.syncPaymentConclusion(summary);
    this.renderInvoiceReceipts(this.state.selectedInvoice);
    if (this.state.selectedInvoice.id) this.refreshInvoiceReceipts(this.state.selectedInvoice.id);
    E.invoiceForm.dataset.id = this.state.selectedInvoice.id || '';
    if (E.invoiceFormTitle) {
      E.invoiceFormTitle.textContent = this.state.selectedInvoice.id
        ? readOnly
          ? 'Invoice Details'
          : 'Edit Invoice'
        : 'Create Invoice';
    }
    const canSave = this.state.selectedInvoice.id
      ? Permissions.canUpdateInvoice()
      : Permissions.canCreateInvoice();
    if (E.invoiceFormDeleteBtn) E.invoiceFormDeleteBtn.style.display = !readOnly && this.state.selectedInvoice.id && Permissions.canDeleteInvoice() ? '' : 'none';
    if (E.invoiceFormSaveBtn) E.invoiceFormSaveBtn.style.display = !readOnly && canSave ? '' : 'none';
    E.invoiceForm.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.id === 'invoiceFormInvoiceId') {
        el.disabled = true;
        return;
      }
      el.disabled = readOnly;
    });
    if (E.invoiceAddAnnualRowBtn) E.invoiceAddAnnualRowBtn.style.display = readOnly ? 'none' : '';
    if (E.invoiceAddOneTimeRowBtn) E.invoiceAddOneTimeRowBtn.style.display = readOnly ? 'none' : '';
    if (E.invoiceAddCapabilityRowBtn) E.invoiceAddCapabilityRowBtn.style.display = readOnly ? 'none' : '';
    this.ensureCatalogLoaded();
    E.invoiceFormModal.classList.add('open');
    E.invoiceFormModal.setAttribute('aria-hidden', 'false');
  },
  closeForm() {
    if (!E.invoiceFormModal || !E.invoiceForm) return;
    E.invoiceFormModal.classList.remove('open');
    E.invoiceFormModal.setAttribute('aria-hidden', 'true');
    E.invoiceForm.reset();
    E.invoiceForm.dataset.id = '';
    this.state.selectedInvoice = null;
    this.state.items = [];
    this.renderItems([]);
    this.renderInvoiceReceipts({ invoice_id: '' });
  },
  setFormBusy(value) {
    const busy = !!value;
    if (E.invoiceFormSaveBtn) E.invoiceFormSaveBtn.disabled = busy;
    if (E.invoiceFormDeleteBtn) E.invoiceFormDeleteBtn.disabled = busy;
    if (E.invoiceFormPreviewBtn) E.invoiceFormPreviewBtn.disabled = busy;
  },
  extractAgreementAndItems(response, fallbackId = '') {
    const parseJsonIfNeeded = value => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;
      try {
        return JSON.parse(trimmed);
      } catch (_error) {
        return value;
      }
    };
    const candidates = [
      response,
      response?.data,
      response?.result,
      response?.payload,
      response?.item,
      response?.agreement
    ];
    let agreement = null;
    let items = [];
    for (const rawCandidate of candidates) {
      const candidate = parseJsonIfNeeded(rawCandidate);
      if (!candidate) continue;

      if (Array.isArray(candidate)) {
        const first = candidate[0];
        if (!agreement && first && typeof first === 'object') {
          agreement = first;
        }
        if (!items.length && Array.isArray(first?.items)) {
          items = first.items;
        }
        continue;
      }

      if (typeof candidate !== 'object') continue;

      if (!agreement) {
        if (candidate.item && typeof candidate.item === 'object') agreement = candidate.item;
        else if (candidate.agreement && typeof candidate.agreement === 'object') agreement = candidate.agreement;
        else if (Array.isArray(candidate.data) && candidate.data[0] && typeof candidate.data[0] === 'object')
          agreement = candidate.data[0];
        else if (candidate.data && typeof candidate.data === 'object' && !Array.isArray(candidate.data))
          agreement = candidate.data;
        else if (candidate.agreement_id || candidate.agreement_number || candidate.agreement_title)
          agreement = candidate;
      }
      if (!items.length) {
        if (Array.isArray(candidate.items)) items = candidate.items;
        else if (Array.isArray(candidate.agreement_items)) items = candidate.agreement_items;
        else if (candidate.item && Array.isArray(candidate.item.items)) items = candidate.item.items;
        else if (candidate.agreement && Array.isArray(candidate.agreement.items)) items = candidate.agreement.items;
        else if (Array.isArray(candidate.data) && Array.isArray(candidate.data[0]?.items))
          items = candidate.data[0].items;
        else if (candidate.data && Array.isArray(candidate.data.items)) items = candidate.data.items;
      }
    }
    const agreementStatus = this.normalizeText(agreement?.status || '');
    const isSignedAgreement = !agreementStatus || agreementStatus.includes('signed');
    return {
      agreement: agreement || { agreement_id: fallbackId },
      items: isSignedAgreement && Array.isArray(items) ? items : []
    };
  },
  async hydrateFromAgreement(agreementId) {
    const id = String(agreementId || '').trim();
    if (!id) return;
    try {
      const response = await Api.getAgreement(id);
      const { agreement, items } = this.extractAgreementAndItems(response, id);
      const currentFormInvoice = this.collectFormValues().invoice;
      const pickAgreementValue = (...values) => {
        for (const value of values) {
          if (value !== undefined && value !== null && String(value).trim() !== '') return value;
        }
        return '';
      };
      const mappedInvoice = this.normalizeInvoice({
        ...currentFormInvoice,
        agreement_id: id,
        issue_date: currentFormInvoice.issue_date || currentFormInvoice.invoice_date,
        invoice_date: currentFormInvoice.invoice_date || currentFormInvoice.issue_date,
        customer_name: pickAgreementValue(agreement.customer_name, agreement.customerName, agreement.customer?.name),
        customer_legal_name: pickAgreementValue(
          agreement.customer_legal_name,
          agreement.customerLegalName,
          agreement.customer?.legal_name,
          agreement.customer?.legalName
        ),
        customer_address: pickAgreementValue(
          agreement.customer_address,
          agreement.customerAddress,
          agreement.customer?.address
        ),
        customer_contact_name: pickAgreementValue(
          agreement.customer_contact_name,
          agreement.customerContactName,
          agreement.customer?.contact_name,
          agreement.customer?.contactName
        ),
        customer_contact_email: pickAgreementValue(
          agreement.customer_contact_email,
          agreement.customerContactEmail,
          agreement.customer?.contact_email,
          agreement.customer?.contactEmail
        ),
        provider_legal_name: pickAgreementValue(
          agreement.provider_legal_name,
          agreement.providerLegalName,
          agreement.provider?.legal_name,
          agreement.provider?.legalName
        ),
        provider_address: pickAgreementValue(
          agreement.provider_address,
          agreement.providerAddress,
          agreement.provider?.address
        ),
        support_email: pickAgreementValue(
          agreement.support_email,
          agreement.supportEmail,
          agreement.provider_contact_email,
          agreement.providerContactEmail
        ),
        billing_frequency: pickAgreementValue(agreement.billing_frequency, agreement.billingFrequency),
        payment_term: pickAgreementValue(
          agreement.payment_term,
          agreement.payment_terms,
          agreement.paymentTerm,
          agreement.paymentTerms
        ),
        currency: pickAgreementValue(agreement.currency, agreement.customer?.currency),
        subtotal_subscription: pickAgreementValue(
          agreement.saas_total,
          agreement.saasTotal,
          agreement.subtotal_subscription,
          agreement.subtotalSubscription
        ),
        subtotal_one_time: pickAgreementValue(
          agreement.one_time_total,
          agreement.oneTimeTotal,
          agreement.subtotal_one_time,
          agreement.subtotalOneTime
        ),
        grand_total: pickAgreementValue(agreement.grand_total, agreement.grandTotal),
        notes: agreement.notes
      });
      // Keep explicit user-entered invoice/due dates when hydrating from agreement.
      if (String(currentFormInvoice.invoice_date || '').trim()) mappedInvoice.invoice_date = currentFormInvoice.invoice_date;
      if (String(currentFormInvoice.due_date || '').trim()) mappedInvoice.due_date = currentFormInvoice.due_date;
      mappedInvoice.invoice_number = this.ensureInvoiceNumber(mappedInvoice.invoice_number);
      this.assignFormValues(mappedInvoice);
      const catalogLookup = await this.getProposalCatalogLookup();
      const normalizedItems = items.map(item => this.copyInvoiceItemFields(item, this.mergeCatalogItem(item, catalogLookup)));
      this.state.items = normalizedItems;
      this.renderItems(normalizedItems);
      const summary = this.deriveCalculatedSummary(mappedInvoice, normalizedItems);
      this.applyTotalsToForm(summary);
      this.syncPaymentFieldsInForm();
      this.syncPaymentConclusion(summary);
    } catch (error) {
      UI.toast('Unable to auto-fill from agreement: ' + (error?.message || 'Unknown error'));
    }
  },
  async openInvoiceById(invoiceId, { readOnly = false, trigger = null } = {}) {
    const id = String(invoiceId || '').trim();
    if (!id) return;
    if (this.state.openingInvoiceIds.has(id)) return;
    this.state.openingInvoiceIds.add(id);
    this.setTriggerBusy(trigger, true);
    console.time('invoice-open');
    const localSummary = this.state.rows.find(row => this.invoiceDbId(row.id) === id);
    this.openInvoice(
      localSummary ? { ...this.emptyInvoice(), ...localSummary, id } : { id },
      [],
      { readOnly }
    );
    this.setFormDetailLoading(true);
    try {
      const cached = this.getCachedDetail(id);
      if (cached) {
        this.openInvoice(cached.invoice, cached.items, { readOnly });
        return;
      }
      const response = await Api.getInvoice(id);
      const { invoice, items } = this.extractInvoiceAndItems(response, id);
      this.setCachedDetail(id, invoice, items);
      if (String(E.invoiceForm?.dataset.id || '').trim() === id) {
        this.openInvoice(invoice, items, { readOnly });
      }
    } catch (error) {
      UI.toast('Unable to load invoice: ' + (error?.message || 'Unknown error'));
    } finally {
      this.state.openingInvoiceIds.delete(id);
      this.setTriggerBusy(trigger, false);
      this.setFormDetailLoading(false);
      console.timeEnd('invoice-open');
    }
  },
  async saveForm() {
    if (this.state.saveInFlight) return;
    const id = String(E.invoiceForm?.dataset.id || '').trim();
    const { invoice, items } = this.collectFormValues();
    if (!this.validateInvoice(invoice)) return;
    const summary = this.deriveCalculatedSummary(invoice, items);
    const payloadInvoice = this.normalizeInvoice({
      ...invoice,
      ...summary,
      subtotal_subscription: summary.subtotal_subscription,
      subtotal_one_time: summary.subtotal_one_time,
      grand_total: summary.grand_total
    });
    this.assignFormValues(payloadInvoice);
    const currentRecord = this.state.rows.find(row => this.invoiceDbId(row.id) === id) || {};
    const requestedDiscount = items.reduce((max, item) => Math.max(max, this.toNumberSafe(item.discount_percent)), 0);
    const workflowCheck = await window.WorkflowEngine?.enforceBeforeSave?.('invoices', currentRecord, {
      invoice_id: id,
      current_status: currentRecord?.status || '',
      requested_status: payloadInvoice.status || '',
      discount_percent: requestedDiscount,
      requested_changes: { invoice: payloadInvoice, items }
    });
    if (workflowCheck && !workflowCheck.allowed) {
      UI.toast(window.WorkflowEngine.composeDeniedMessage(workflowCheck, 'Invoice save blocked.'));
      return;
    }
    this.state.saveInFlight = true;
    this.setFormBusy(true);
    console.time('entity-save');
    try {
      let response;
      if (id) {
        if (!Permissions.canUpdateInvoice()) return UI.toast('You do not have permission to update invoices.');
        response = await Api.updateInvoice(id, payloadInvoice, items);
        UI.toast('Invoice updated.');
      } else {
        if (!Permissions.canCreateInvoice()) return UI.toast('You do not have permission to create invoices.');
        response = await Api.createInvoice(payloadInvoice, items);
        UI.toast('Invoice created.');
      }
      const parsed = this.extractInvoiceAndItems(response, id);
      const persistedItems = Array.isArray(parsed?.items) && parsed.items.length
        ? parsed.items.map(item => this.normalizeItem(item))
        : items;
      const persisted = this.normalizeInvoice({
        ...payloadInvoice,
        ...(parsed?.invoice || {}),
        id: parsed?.invoice?.id || id || payloadInvoice.id
      });
      const normalized = this.upsertLocalRow(persisted);
      this.setCachedDetail(normalized?.id || id, persisted, persistedItems);
      if (normalized?.id && this.state.selectedInvoice?.id === normalized.id) {
        this.state.selectedInvoice = normalized;
        this.state.items = persistedItems;
      }
      this.closeForm();
    } catch (error) {
      UI.toast('Unable to save invoice: ' + (error?.message || 'Unknown error'));
    } finally {
      console.timeEnd('entity-save');
      this.state.saveInFlight = false;
      this.setFormBusy(false);
    }
  },
  async deleteInvoice(invoiceId) {
    if (!Permissions.canDeleteInvoice()) return UI.toast('Insufficient permissions to delete invoices.');
    const id = String(invoiceId || '').trim();
    const displayInvoice =
      this.invoiceDisplayId(this.state.rows.find(row => this.invoiceDbId(row.id) === id)) || id;
    if (!id || !window.confirm(`Delete invoice ${displayInvoice}?`)) return;
    this.setFormBusy(true);
    try {
      await Api.deleteInvoice(id);
      delete this.state.detailCacheById[id];
      this.removeLocalRow(id);
      UI.toast('Invoice deleted.');
      this.closeForm();
    } catch (error) {
      UI.toast('Unable to delete invoice: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setFormBusy(false);
    }
  },
  async createReceiptFromInvoice(invoiceId) {
    const id = String(invoiceId || '').trim();
    if (!id) return;
    if (!Permissions.canCreateReceiptFromInvoice()) {
      UI.toast('You do not have permission to create receipts.');
      return;
    }
    const currentRecord = this.state.rows.find(row => this.invoiceDbId(row.id) === id) || {};
    const workflowCheck = await window.WorkflowEngine?.enforceBeforeSave?.('receipts', currentRecord, {
      source_invoice_id: id,
      current_status: currentRecord?.status || '',
      requested_status: 'Issued',
      requested_changes: { create_from_invoice: true }
    });
    if (workflowCheck && !workflowCheck.allowed) {
      UI.toast(window.WorkflowEngine.composeDeniedMessage(workflowCheck, 'Receipt creation blocked.'));
      return;
    }
    try {
      const response = await Api.createReceiptFromInvoice(id);
      const receipt =
        response?.receipt ||
        response?.data?.receipt ||
        response?.result?.receipt ||
        response?.payload?.receipt ||
        response?.item ||
        response;
      const receiptId = String(receipt?.receipt_id || response?.receipt_id || response?.id || '').trim();
      UI.toast(receiptId ? `Receipt ${receiptId} created.` : 'Receipt created from invoice.');
      if (window.Receipts?.upsertLocalRow) window.Receipts.upsertLocalRow(receipt);
      this.appendInvoiceReceipt(id, receipt);
      const selectedInvoiceId = String(E.invoiceForm?.dataset.id || '').trim();
      if (selectedInvoiceId === id) await this.openInvoiceById(id, { readOnly: false });
      else await this.refreshInvoiceReceipts(id, { force: true });
      if (receiptId && window.Receipts?.openReceiptById) {
        await window.Receipts.openReceiptById(receiptId, { readOnly: false });
      }
    } catch (error) {
      UI.toast('Unable to create receipt: ' + (error?.message || 'Unknown error'));
    }
  },
  async syncAfterReceiptMutation({ invoiceId, receipt = null } = {}) {
    const id = String(invoiceId || receipt?.invoice_id || '').trim();
    if (!id) return;
    if (receipt?.receipt_id) this.appendInvoiceReceipt(id, receipt);
    const selectedInvoiceId = String(E.invoiceForm?.dataset.id || '').trim();
    if (selectedInvoiceId === id) {
      await this.openInvoiceById(id, { readOnly: false });
      return;
    }
    await this.refreshInvoiceReceipts(id, { force: true });
    const summary = this.state.rows.find(row => this.invoiceDbId(row.id) === id);
    if (summary) {
      try {
        const response = await Api.getInvoice(id);
        const parsed = this.extractInvoiceAndItems(response, id);
        if (parsed?.invoice) this.upsertLocalRow(parsed.invoice);
      } catch (_error) {
        // Non-blocking summary refresh.
      }
    }
  },
  async previewInvoice(invoiceId) {
    const id = String(invoiceId || '').trim();
    if (!id) return;
    if (!Permissions.canPreviewInvoice()) return UI.toast('You do not have permission to preview invoices.');
    try {
      const { invoiceUuid, invoice, items } = await this.loadInvoicePreviewData(id);
      const html = this.buildInvoicePreviewHtml(invoice, items);
      if (!String(html || '').trim()) return UI.toast('Unable to build invoice preview.');
      const brandedHtml = U.addIncheckDocumentLogo(U.formatPreviewHtmlDates(html));
      const previewLabel = String(invoice?.invoice_number || invoice?.invoice_id || invoiceUuid).trim();
      if (E.invoicePreviewTitle) E.invoicePreviewTitle.textContent = `Invoice Preview · ${previewLabel}`;
      if (E.invoicePreviewFrame) E.invoicePreviewFrame.srcdoc = brandedHtml;
      if (E.invoicePreviewModal) {
        E.invoicePreviewModal.classList.add('open');
        E.invoicePreviewModal.setAttribute('aria-hidden', 'false');
      }
    } catch (error) {
      UI.toast('Unable to preview invoice: ' + (error?.message || 'Unknown error'));
    }
  },
  closePreview() {
    if (!E.invoicePreviewModal) return;
    E.invoicePreviewModal.classList.remove('open');
    E.invoicePreviewModal.setAttribute('aria-hidden', 'true');
    if (E.invoicePreviewFrame) E.invoicePreviewFrame.srcdoc = '';
  },
  exportPreviewPdf() {
    const frame = E.invoicePreviewFrame;
    const previewTitle = String(E.invoicePreviewTitle?.textContent || 'Invoice Preview').trim();
    if (!frame || !String(frame.srcdoc || '').trim()) {
      UI.toast('Open invoice preview first to extract PDF.');
      return;
    }
    const frameWindow = frame.contentWindow;
    if (!frameWindow) {
      UI.toast('Unable to access invoice preview content.');
      return;
    }
    frameWindow.focus();
    frameWindow.print();
    UI.toast(`Print dialog opened for ${previewTitle}. Choose "Save as PDF" to extract.`);
  },
  async openCreateFromAgreementResult(invoice) {
    const normalized = this.normalizeInvoice(invoice || {});
    if (typeof setActiveView === 'function') setActiveView('invoices');
    if (normalized?.id) this.upsertLocalRow(normalized);
    if (normalized.id) {
      await this.openInvoiceById(normalized.id, { readOnly: false });
    }
  },
  async openCreateFromAgreementTemplate(agreementId) {
    const id = String(agreementId || '').trim();
    if (!id) return;
    try {
      const response = await Api.createInvoiceFromAgreement(id);
      const { invoice, items } = this.extractInvoiceAndItems(response);
      const hasTemplateData = Boolean(invoice.invoice_id || invoice.customer_name || invoice.customer_legal_name || items.length);
      if (hasTemplateData) {
        const invoiceTemplate = this.normalizeInvoice({
          ...this.emptyInvoice(),
          ...invoice,
          agreement_id: id
        });
        invoiceTemplate.invoice_number = this.ensureInvoiceNumber(invoiceTemplate.invoice_number);
        if (invoiceTemplate.id) {
          await this.openInvoiceById(invoiceTemplate.id, { readOnly: false });
          return;
        }
        this.openInvoice(invoiceTemplate, items, { readOnly: false });
        return;
      }
    } catch (_error) {
      // Fall back to local template hydration from the agreement record.
    }
    this.openInvoice(this.normalizeInvoice({ ...this.emptyInvoice(), agreement_id: id }), [], { readOnly: false });
    await this.hydrateFromAgreement(id);
  },
  async refresh(force = false) {
    if (this.state.loading && !force) return;
    if (!Permissions.canViewInvoices()) {
      this.state.rows = [];
      this.state.filteredRows = [];
      this.render();
      return;
    }
    this.state.loading = true;
    this.state.loadError = '';
    this.render();
    try {
      const filters = {};
      const status = String(this.state.status || '').trim();
      const search = String(this.state.search || '').trim();
      if (status && status !== 'All') filters.status = status;
      if (search) filters.search = search;
      const response = await Api.listInvoices(filters, {
        limit: this.state.limit,
        page: this.state.page,
        summary_only: true,
        forceRefresh: force
      });
      const normalized = this.extractListResult(response);
      this.state.rows = normalized.rows.map(row => this.normalizeInvoice(row));
      this.state.total = normalized.total;
      this.state.returned = normalized.returned;
      this.state.hasMore = normalized.hasMore;
      this.state.page = normalized.page;
      this.state.limit = normalized.limit;
      this.state.offset = normalized.offset;
    } catch (error) {
      this.state.rows = [];
      this.state.loadError = String(error?.message || '').trim() || 'Unable to load invoices.';
    } finally {
      this.state.loading = false;
      this.applyFilters();
      this.renderFilters();
      this.render();
    }
  },
  init() {
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
    bindState(E.invoicesSearchInput, 'search');
    bindState(E.invoicesStatusFilter, 'status');
    if (E.invoiceSummary) {
      const activate = card => {
        if (!card) return;
        const filter = card.getAttribute('data-kpi-filter');
        if (!filter) return;
        this.applyKpiFilter(filter);
      };
      E.invoiceSummary.addEventListener('click', event => {
        activate(event.target?.closest?.('[data-kpi-filter]'));
      });
      E.invoiceSummary.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const card = event.target?.closest?.('[data-kpi-filter]');
        if (!card) return;
        event.preventDefault();
        activate(card);
      });
    }

    if (E.invoicesRefreshBtn) E.invoicesRefreshBtn.addEventListener('click', () => this.refresh(true));
    if (E.invoicesCreateBtn) {
      E.invoicesCreateBtn.addEventListener('click', () => {
        if (!Permissions.canCreateInvoice()) return UI.toast('You do not have permission to create invoices.');
        this.openInvoice(this.emptyInvoice(), [], { readOnly: false });
      });
    }
    if (E.invoicesTbody) {
      E.invoicesTbody.addEventListener('click', event => {
        const trigger = event.target?.closest?.('button[data-invoice-view], button[data-invoice-edit], button[data-invoice-preview], button[data-invoice-create-receipt], button[data-invoice-delete]');
        if (!trigger) return;
        const viewId = trigger.getAttribute('data-invoice-view');
        if (viewId) return this.runRowAction(`view:${viewId}`, trigger, () => this.openInvoiceById(viewId, { readOnly: true, trigger }));
        const editId = trigger.getAttribute('data-invoice-edit');
        if (editId) return this.runRowAction(`edit:${editId}`, trigger, () => this.openInvoiceById(editId, { readOnly: false, trigger }));
        const previewId = trigger.getAttribute('data-invoice-preview');
        if (previewId) return this.runRowAction(`preview:${previewId}`, trigger, () => this.previewInvoice(previewId));
        const createReceiptId = trigger.getAttribute('data-invoice-create-receipt');
        if (createReceiptId) return this.runRowAction(`create-receipt:${createReceiptId}`, trigger, () => this.createReceiptFromInvoice(createReceiptId));
        const deleteId = trigger.getAttribute('data-invoice-delete');
        if (deleteId) return this.runRowAction(`delete:${deleteId}`, trigger, () => this.deleteInvoice(deleteId));
      });
    }
    if (E.invoiceForm) {
      E.invoiceForm.addEventListener('submit', event => {
        event.preventDefault();
        this.saveForm();
      });
      E.invoiceForm.addEventListener('click', event => {
        const removeBtn = event.target?.closest?.('button[data-item-remove]');
        if (!removeBtn) return;
        const section = removeBtn.getAttribute('data-item-remove');
        const index = Number(removeBtn.getAttribute('data-item-index'));
        if (!section || !Number.isInteger(index) || index < 0) return;
        const groups = this.groupedItems(this.collectItems());
        if (!groups[section]) return;
        groups[section] = groups[section].filter((_, idx) => idx !== index);
        const items = [...groups.annual_saas, ...groups.one_time_fee, ...groups.capability];
        this.renderItems(items);
        this.applyTotalsToForm(this.deriveCalculatedSummary(this.collectFormValues().invoice, items));
      });
      E.invoiceForm.addEventListener('input', event => {
        if (['invoiceFormStatus', 'invoiceFormAmountPaid', 'invoiceFormGrandTotal'].includes(event.target?.id)) {
          this.syncPaymentFieldsInForm();
        }
        const field = event.target?.getAttribute('data-item-field');
        if (!field) return;
        const tr = event.target.closest('tr[data-item-row]');
        const section = tr?.getAttribute('data-item-row');
        if (!tr || !section || section === 'capability') {
          this.applyTotalsToForm(this.deriveCalculatedSummary(this.collectFormValues().invoice, this.collectItems()));
          this.syncPaymentFieldsInForm();
          return;
        }
        if (field === 'item_name') this.applyCatalogSelectionToRow(tr, section);
        const get = key => tr.querySelector(`[data-item-field="${key}"]`)?.value ?? '';
        const computed = this.computeCommercialRow({
          unit_price: get('unit_price'),
          discount_percent: get('discount_percent'),
          quantity: get('quantity')
        });
        const discountedEl = tr.querySelector('[data-item-display="discounted_unit_price"]');
        const lineTotalEl = tr.querySelector('[data-item-display="line_total"]');
        if (discountedEl) discountedEl.textContent = this.formatMoney(computed.discounted_unit_price);
        if (lineTotalEl) lineTotalEl.textContent = this.formatMoney(computed.line_total);
        this.applyTotalsToForm(this.deriveCalculatedSummary(this.collectFormValues().invoice, this.collectItems()));
        this.syncPaymentFieldsInForm();
      });
      E.invoiceForm.addEventListener('change', event => {
        if (['invoiceFormStatus','invoiceFormAmountPaid','invoiceFormGrandTotal'].includes(event.target?.id)) {
          this.syncPaymentFieldsInForm();
        }
        const field = event.target?.getAttribute('data-item-field');
        if (field !== 'item_name') return;
        const tr = event.target.closest('tr[data-item-row]');
        const section = tr?.getAttribute('data-item-row');
        if (!tr || !section || section === 'capability') return;
        this.applyCatalogSelectionToRow(tr, section);
      });
    }
    if (E.invoiceAddAnnualRowBtn) {
      E.invoiceAddAnnualRowBtn.addEventListener('click', () => {
        const items = this.collectItems();
        items.push(this.normalizeItem({ section: 'annual_saas', quantity: 1 }));
        this.renderItems(items);
        this.applyTotalsToForm(this.deriveCalculatedSummary(this.collectFormValues().invoice, items));
      });
    }
    if (E.invoiceAddOneTimeRowBtn) {
      E.invoiceAddOneTimeRowBtn.addEventListener('click', () => {
        const items = this.collectItems();
        items.push(this.normalizeItem({ section: 'one_time_fee', quantity: 1 }));
        this.renderItems(items);
        this.applyTotalsToForm(this.deriveCalculatedSummary(this.collectFormValues().invoice, items));
      });
    }
    if (E.invoiceAddCapabilityRowBtn) {
      E.invoiceAddCapabilityRowBtn.addEventListener('click', () => {
        const items = this.collectItems();
        items.push(this.normalizeItem({ section: 'capability', capability_name: '', capability_value: '' }));
        this.renderItems(items);
        this.applyTotalsToForm(this.deriveCalculatedSummary(this.collectFormValues().invoice, items));
      });
    }
    if (E.invoiceFormAgreementId) {
      let agreementHydrateTimer = null;
      const hydrateAgreement = () => {
        if (agreementHydrateTimer) window.clearTimeout(agreementHydrateTimer);
        agreementHydrateTimer = window.setTimeout(() => {
          this.hydrateFromAgreement(E.invoiceFormAgreementId?.value || '');
        }, 250);
      };
      E.invoiceFormAgreementId.addEventListener('input', hydrateAgreement);
      E.invoiceFormAgreementId.addEventListener('change', () => {
        this.hydrateFromAgreement(E.invoiceFormAgreementId?.value || '');
      });
      E.invoiceFormAgreementId.addEventListener('blur', () => {
        this.hydrateFromAgreement(E.invoiceFormAgreementId?.value || '');
      });
    }
    if (E.invoiceFormCloseBtn) E.invoiceFormCloseBtn.addEventListener('click', () => this.closeForm());
    if (E.invoiceFormCancelBtn) E.invoiceFormCancelBtn.addEventListener('click', () => this.closeForm());
    if (E.invoiceFormDeleteBtn) E.invoiceFormDeleteBtn.addEventListener('click', () => this.deleteInvoice(E.invoiceForm?.dataset.id || ''));
    if (E.invoiceFormPreviewBtn) E.invoiceFormPreviewBtn.addEventListener('click', () => this.previewInvoice(E.invoiceForm?.dataset.id || ''));
    if (E.invoiceFormModal) E.invoiceFormModal.addEventListener('click', event => {
      if (event.target === E.invoiceFormModal) this.closeForm();
    });
    if (E.invoicePreviewExportPdfBtn) E.invoicePreviewExportPdfBtn.addEventListener('click', () => this.exportPreviewPdf());
    if (E.invoicePreviewCloseBtn) E.invoicePreviewCloseBtn.addEventListener('click', () => this.closePreview());
    if (E.invoicePreviewModal) E.invoicePreviewModal.addEventListener('click', event => {
      if (event.target === E.invoicePreviewModal) this.closePreview();
    });

    this.state.initialized = true;
    this.renderCatalogOptionLists();
  }
};

window.Invoices = Invoices;
