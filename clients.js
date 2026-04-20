const Clients = {
  clientFields: [
    'client_id',
    'client_code',
    'customer_name',
    'customer_legal_name',
    'normalized_company_key',
    'primary_contact_name',
    'primary_contact_email',
    'phone',
    'country',
    'address',
    'billing_address',
    'tax_number',
    'industry',
    'status',
    'notes',
    'source',
    'created_at',
    'updated_at'
  ],
  state: {
    rows: [],
    filteredRows: [],
    selectedClientId: '',
    agreements: [],
    invoices: [],
    receipts: [],
    loading: false,
    loadError: '',
    loaded: false,
    lastLoadedAt: 0,
    cacheTtlMs: 2 * 60 * 1000,
    page: 1,
    limit: 50,
    offset: 0,
    returned: 0,
    hasMore: false,
    total: 0,
    search: '',
    status: 'All',
    sort: 'due_desc',
    detailCache: {},
    detailCacheTtlMs: 90 * 1000,
    detailLoading: false,
    activeDetailTab: 'overview',
    statementFilters: { status: 'all', dateFrom: '', dateTo: '', searchDoc: '' },
    renewalsFilters: { dateFrom: '', dateTo: '' }
  },
  getField(raw = {}, ...keys) {
    const found = keys.find(key => raw[key] !== undefined && raw[key] !== null);
    return found ? raw[found] : '';
  },
  normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  },
  toNumberSafe(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  },
  normalizeCompanyKey(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(inc|llc|ltd|co|corp|corporation|company|the)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },
  extractRows(response) {
    const candidates = [
      response,
      response?.clients,
      response?.items,
      response?.rows,
      response?.data,
      response?.result,
      response?.payload,
      response?.data?.clients,
      response?.result?.clients,
      response?.payload?.clients
    ];
    for (const candidate of candidates) if (Array.isArray(candidate)) return candidate;
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
  normalizeClient(raw = {}) {
    const customerName = String(raw.customer_name || raw.customerName || '').trim();
    const legalName = String(raw.customer_legal_name || raw.customerLegalName || '').trim();
    const normalized = {
      client_id: String(raw.client_id || raw.clientId || raw.id || '').trim(),
      client_code: String(raw.client_code || raw.clientCode || '').trim(),
      customer_name: customerName,
      customer_legal_name: legalName,
      normalized_company_key: String(raw.normalized_company_key || raw.normalizedCompanyKey || '').trim(),
      primary_contact_name: String(raw.primary_contact_name || raw.primaryContactName || raw.customer_contact_name || '').trim(),
      primary_contact_email: String(raw.primary_contact_email || raw.primaryContactEmail || raw.customer_contact_email || '').trim(),
      phone: String(raw.phone || raw.customer_contact_mobile || '').trim(),
      country: String(raw.country || '').trim(),
      address: String(raw.address || raw.company_address || raw.customer_address || '').trim(),
      billing_address: String(raw.billing_address || raw.billingAddress || '').trim(),
      tax_number: String(raw.tax_number || raw.taxNumber || '').trim(),
      industry: String(raw.industry || '').trim(),
      status: String(raw.status || raw.account_status || 'Active').trim(),
      notes: String(raw.notes || '').trim(),
      source: String(raw.source || '').trim(),
      created_at: String(raw.created_at || raw.createdAt || '').trim(),
      updated_at: String(raw.updated_at || raw.updatedAt || '').trim()
    };
    if (!normalized.normalized_company_key) {
      normalized.normalized_company_key = this.normalizeCompanyKey(legalName || customerName);
    }
    return normalized;
  },
  normalizeAgreement(raw = {}) {
    return {
      agreement_id: String(raw.agreement_id || raw.agreementId || raw.id || '').trim(),
      agreement_number: String(raw.agreement_number || raw.agreementNumber || '').trim(),
      customer_name: String(raw.customer_name || raw.customerName || '').trim(),
      customer_legal_name: String(raw.customer_legal_name || raw.customerLegalName || '').trim(),
      status: String(raw.status || '').trim(),
      grand_total: this.toNumberSafe(raw.grand_total ?? raw.grandTotal),
      updated_at: String(raw.updated_at || raw.updatedAt || '').trim(),
      service_start_date: String(raw.service_start_date || raw.serviceStartDate || raw.effective_date || '').trim(),
      service_end_date: String(raw.service_end_date || raw.serviceEndDate || '').trim(),
      end_date: String(raw.end_date || raw.endDate || '').trim(),
      due_date: String(raw.due_date || raw.dueDate || '').trim(),
      renewal_date: String(raw.renewal_date || raw.renewalDate || raw.next_renewal_date || raw.nextRenewalDate || '').trim(),
      customer_sign_date: String(raw.customer_sign_date || raw.customerSignDate || '').trim(),
      agreement_date: String(raw.agreement_date || raw.agreementDate || '').trim(),
      location_name: String(raw.location_name || raw.locationName || '').trim(),
      items: Array.isArray(raw.items)
        ? raw.items
        : Array.isArray(raw.agreement_items)
          ? raw.agreement_items
          : Array.isArray(raw.line_items)
            ? raw.line_items
            : []
    };
  },
  normalizeInvoice(raw = {}) {
    return {
      invoice_id: String(raw.invoice_id || raw.invoiceId || raw.id || '').trim(),
      invoice_number: String(raw.invoice_number || raw.invoiceNumber || '').trim(),
      agreement_id: String(raw.agreement_id || raw.agreementId || '').trim(),
      client_id: String(raw.client_id || raw.clientId || '').trim(),
      customer_name: String(raw.customer_name || raw.customerName || '').trim(),
      customer_legal_name: String(raw.customer_legal_name || raw.customerLegalName || '').trim(),
      status: String(raw.status || raw.payment_state || '').trim(),
      grand_total: this.toNumberSafe(raw.grand_total ?? raw.grandTotal),
      amount_paid: this.toNumberSafe(raw.amount_paid ?? raw.amountPaid),
      pending_amount: this.toNumberSafe(raw.pending_amount ?? raw.pendingAmount),
      updated_at: String(raw.updated_at || raw.updatedAt || '').trim(),
      issued_date: String(raw.issued_date || raw.invoice_date || '').trim(),
      due_date: String(raw.due_date || raw.dueDate || '').trim(),
      reference: String(raw.reference || raw.ref || '').trim(),
      notes: String(raw.notes || '').trim(),
      location_name: String(raw.location_name || raw.locationName || '').trim()
    };
  },
  normalizeReceipt(raw = {}) {
    return {
      receipt_id: String(raw.receipt_id || raw.receiptId || raw.id || '').trim(),
      receipt_number: String(raw.receipt_number || raw.receiptNumber || '').trim(),
      invoice_id: String(raw.invoice_id || raw.invoiceId || '').trim(),
      client_id: String(raw.client_id || raw.clientId || '').trim(),
      customer_name: String(raw.customer_name || raw.customerName || '').trim(),
      customer_legal_name: String(raw.customer_legal_name || raw.customerLegalName || '').trim(),
      payment_state: String(raw.payment_state || raw.status || '').trim(),
      received_amount: this.toNumberSafe(raw.received_amount ?? raw.receivedAmount ?? raw.amount_paid),
      pending_amount: this.toNumberSafe(raw.pending_amount ?? raw.pendingAmount),
      updated_at: String(raw.updated_at || raw.updatedAt || '').trim(),
      receipt_date: String(raw.receipt_date || raw.received_date || '').trim(),
      reference: String(raw.reference || raw.ref || '').trim(),
      notes: String(raw.notes || '').trim()
    };
  },
  matchesClient_(record = {}, client = {}) {
    const clientId = String(client.client_id || '').trim();
    if (clientId && String(record.client_id || '').trim() === clientId) return true;
    const recordLegal = this.normalizeCompanyKey(record.customer_legal_name);
    const recordCompany = this.normalizeCompanyKey(record.customer_name);
    const clientLegal = this.normalizeCompanyKey(client.customer_legal_name);
    const clientCompany = this.normalizeCompanyKey(client.customer_name);
    return Boolean((recordLegal && (recordLegal === clientLegal || recordLegal === clientCompany)) || (recordCompany && (recordCompany === clientLegal || recordCompany === clientCompany)));
  },
  listClientRelatedAgreements_(clientId) {
    const client = this.state.rows.find(row => row.client_id === clientId);
    if (!client) return [];
    return this.state.agreements.filter(item => this.matchesClient_(item, client));
  },
  listClientRelatedInvoices_(clientId) {
    const client = this.state.rows.find(row => row.client_id === clientId);
    if (!client) return [];
    return this.state.invoices.filter(item => this.matchesClient_(item, client));
  },
  listClientRelatedReceipts_(clientId) {
    const client = this.state.rows.find(row => row.client_id === clientId);
    if (!client) return [];
    return this.state.receipts.filter(item => this.matchesClient_(item, client));
  },
  isSignedAgreement(agreement = {}) {
    return this.normalizeText(agreement.status).includes('signed');
  },
  isActiveAgreement(agreement = {}) {
    const token = this.normalizeText(agreement.status);
    return token.includes('active') || token.includes('signed');
  },
  findOrCreateClientFromSignedAgreement_(agreement = {}) {
    if (!this.isSignedAgreement(agreement)) return null;
    const key = this.normalizeCompanyKey(agreement.customer_legal_name || agreement.customer_name);
    let existing = this.state.rows.find(client => this.normalizeCompanyKey(client.customer_legal_name) === key);
    if (!existing) {
      existing = this.state.rows.find(client => this.normalizeCompanyKey(client.customer_name) === key);
    }
    if (existing) {
      if (!existing.customer_legal_name && agreement.customer_legal_name) existing.customer_legal_name = agreement.customer_legal_name;
      existing.updated_at = agreement.updated_at || existing.updated_at;
      return existing;
    }
    const fallbackName = String(agreement.customer_name || agreement.customer_legal_name || '').trim();
    const created = this.normalizeClient({
      client_id: `virtual-${key || Date.now()}`,
      customer_name: fallbackName,
      customer_legal_name: String(agreement.customer_legal_name || '').trim(),
      normalized_company_key: key,
      status: 'Active',
      source: 'signed_agreement',
      updated_at: agreement.updated_at,
      created_at: agreement.customer_sign_date || agreement.agreement_date
    });
    this.state.rows.push(created);
    return created;
  },
  maxDate(...values) {
    const valid = values
      .map(value => String(value || '').trim())
      .filter(Boolean)
      .map(value => new Date(value))
      .filter(date => !Number.isNaN(date.getTime()));
    if (!valid.length) return '';
    return new Date(Math.max(...valid.map(date => date.getTime()))).toISOString();
  },
  hasBackendAnalytics_(analytics) {
    return Boolean(analytics && typeof analytics === 'object' && !Array.isArray(analytics) && Object.keys(analytics).length);
  },
  resolveBackendAnalytics_(payload = {}) {
    if (!payload || typeof payload !== 'object') return null;
    if (this.hasBackendAnalytics_(payload.analytics)) return payload.analytics;
    if (this.hasBackendAnalytics_(payload.data?.analytics)) return payload.data.analytics;
    if (this.hasBackendAnalytics_(payload.result?.analytics)) return payload.result.analytics;
    if (this.hasBackendAnalytics_(payload.payload?.analytics)) return payload.payload.analytics;
    if (this.hasBackendAnalytics_(payload)) return payload;
    return null;
  },
  isAnnualSaasClientLocationItem(item = {}) {
    const section = this.normalizeText(item.section || item.item_section || item.section_name || item.category || item.type);
    return section === 'annual_saas' || section === 'annual' || section === 'subscription';
  },
  countAgreementAnnualSaasRowsForClientAnalytics(agreement = {}) {
    const items = Array.isArray(agreement.items)
      ? agreement.items
      : Array.isArray(agreement.agreement_items)
        ? agreement.agreement_items
        : Array.isArray(agreement.line_items)
          ? agreement.line_items
          : [];
    return items.filter(item => this.isAnnualSaasClientLocationItem(item)).length;
  },
  computeClientAnalytics_(client) {
    const agreements = this.listClientRelatedAgreements_(client.client_id);
    const invoices = this.listClientRelatedInvoices_(client.client_id);
    const receipts = this.listClientRelatedReceipts_(client.client_id);
    const signedAgreements = agreements.filter(item => this.isSignedAgreement(item));
    const activeAgreements = agreements.filter(item => this.isActiveAgreement(item));

    const totalLocations = signedAgreements.reduce(
      (sum, agreement) => sum + this.countAgreementAnnualSaasRowsForClientAnalytics(agreement),
      0
    );
    const activeLocations = activeAgreements.reduce(
      (sum, agreement) => sum + this.countAgreementAnnualSaasRowsForClientAnalytics(agreement),
      0
    );

    const totalAgreementValue = signedAgreements.reduce((sum, item) => sum + this.toNumberSafe(item.grand_total), 0);
    const totalInvoicedValue = invoices.reduce((sum, item) => sum + this.toNumberSafe(item.grand_total), 0);
    const totalReceiptsValue = receipts.reduce((sum, item) => sum + this.toNumberSafe(item.received_amount), 0);
    const paidByInvoices = invoices.reduce((sum, item) => sum + this.toNumberSafe(item.amount_paid), 0);
    const totalPaidAmount = Math.max(paidByInvoices, totalReceiptsValue);
    const totalDueAmount = invoices.reduce((sum, item) => sum + this.toNumberSafe(item.pending_amount), 0);

    const latestAgreementDate = this.maxDate(...agreements.map(item => item.updated_at || item.customer_sign_date || item.agreement_date));
    const latestInvoiceDate = this.maxDate(...invoices.map(item => item.updated_at || item.issued_date));
    const latestReceiptDate = this.maxDate(...receipts.map(item => item.updated_at || item.receipt_date));

    const now = Date.now();
    const renewalCandidates = activeAgreements
      .map(item => item.end_date || item.service_end_date)
      .filter(Boolean)
      .map(value => new Date(value))
      .filter(date => !Number.isNaN(date.getTime()) && date.getTime() > now)
      .sort((a, b) => a.getTime() - b.getTime());

    const paymentBucket = invoices.reduce(
      (bucket, invoice) => {
        const due = this.toNumberSafe(invoice.pending_amount);
        const paid = this.toNumberSafe(invoice.amount_paid);
        if (due <= 0 && paid > 0) bucket.paid += 1;
        else if (paid > 0 && due > 0) bucket.partial += 1;
        else bucket.unpaid += 1;
        return bucket;
      },
      { unpaid: 0, partial: 0, paid: 0 }
    );

    return {
      total_locations: totalLocations,
      active_locations: activeLocations,
      total_agreements: agreements.length,
      signed_agreements: signedAgreements.length,
      total_agreement_value: totalAgreementValue,
      total_invoiced_value: totalInvoicedValue,
      total_paid_amount: totalPaidAmount,
      total_due_amount: totalDueAmount,
      total_receipts_value: totalReceiptsValue,
      unpaid_invoices_count: paymentBucket.unpaid,
      partially_paid_invoices_count: paymentBucket.partial,
      paid_invoices_count: paymentBucket.paid,
      latest_agreement_date: latestAgreementDate,
      latest_invoice_date: latestInvoiceDate,
      latest_receipt_date: latestReceiptDate,
      latest_activity_date: this.maxDate(latestAgreementDate, latestInvoiceDate, latestReceiptDate),
      next_renewal_date: renewalCandidates.length ? renewalCandidates[0].toISOString() : ''
    };
  },
  buildTimeline_(clientId) {
    const events = [];
    this.listClientRelatedAgreements_(clientId).forEach(item => {
      events.push({ type: 'signed_agreement', date: item.updated_at || item.customer_sign_date || item.agreement_date, label: `Agreement ${item.agreement_number || item.agreement_id || '—'} ${item.status || ''}`.trim() });
    });
    this.listClientRelatedInvoices_(clientId).forEach(item => {
      events.push({ type: 'issued_invoice', date: item.updated_at || item.issued_date, label: `Invoice ${item.invoice_number || item.invoice_id || '—'} ${item.status || ''}`.trim() });
      if (this.toNumberSafe(item.amount_paid) > 0) {
        events.push({ type: 'payment_update', date: item.updated_at || item.issued_date, label: `Payment updated (${U.fmtNumber(item.amount_paid)}) for ${item.invoice_number || item.invoice_id || 'invoice'}` });
      }
    });
    this.listClientRelatedReceipts_(clientId).forEach(item => {
      events.push({ type: 'receipt_created', date: item.updated_at || item.receipt_date, label: `Receipt ${item.receipt_number || item.receipt_id || '—'} ${item.payment_state || ''}`.trim() });
    });
    return events
      .filter(item => item.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);
  },
  normalizeEventToken_(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  },
  asArray_(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = [value.rows, value.data, value.timeline].find(Array.isArray);
      if (Array.isArray(nested)) return nested;
    }
    return [];
  },
  extractTimelineRows_(...sources) {
    const rows = [];
    sources.forEach(source => {
      this.asArray_(source).forEach(item => {
        if (item && typeof item === 'object') rows.push(item);
      });
    });
    return rows;
  },
  normalizeTimelineEvents_(events = []) {
    return events
      .map(item => {
        const date = String(
          this.getField(item, 'date', 'event_date', 'timeline_date', 'occurred_at', 'created_at', 'updated_at', 'value') || ''
        ).trim();
        return {
          ...item,
          type: String(this.getField(item, 'type', 'event_type', 'event', 'key', 'name', 'milestone') || item.type || '').trim(),
          date
        };
      })
      .filter(item => item.date || item.type || item.label || item.title);
  },
  getTimelineEventTokens_(event = {}) {
    const tokenFields = [
      event.type,
      event.event_type,
      event.event,
      event.key,
      event.name,
      event.label,
      event.title,
      event.milestone
    ];
    return tokenFields.map(value => this.normalizeEventToken_(value)).filter(Boolean);
  },
  getTimelineEventDate_(event = {}) {
    const candidates = [
      this.getField(event, 'date', 'event_date', 'timeline_date', 'occurred_at', 'created_at', 'updated_at'),
      event.value
    ]
      .map(value => String(value || '').trim())
      .filter(Boolean);
    for (const candidate of candidates) {
      const parsed = new Date(candidate);
      if (!Number.isNaN(parsed.getTime())) return candidate;
    }
    return '';
  },
  selectMilestoneDateFromTimeline_(timeline = [], aliases = []) {
    const normalizedAliases = aliases.map(alias => this.normalizeEventToken_(alias)).filter(Boolean);
    const matches = timeline
      .map(event => {
        const tokens = this.getTimelineEventTokens_(event);
        const matched = normalizedAliases.some(alias => tokens.some(token => token.includes(alias) || alias.includes(token)));
        return matched ? this.getTimelineEventDate_(event) : '';
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return matches[0] || '';
  },
  minDateFromRows_(rows = [], key) {
    const dates = rows
      .map(row => String(row?.[key] || '').trim())
      .filter(Boolean)
      .filter(value => !Number.isNaN(new Date(value).getTime()))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return dates[0] || '';
  },
  maxDateFromRows_(rows = [], key) {
    const dates = rows
      .map(row => String(row?.[key] || '').trim())
      .filter(Boolean)
      .filter(value => !Number.isNaN(new Date(value).getTime()))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return dates[0] || '';
  },
  getMilestoneValues_(detailData = {}, client = {}) {
    const detail = detailData.detail || {};
    const timeline = Array.isArray(detailData.timeline) ? detailData.timeline : [];
    const renewals = Array.isArray(detailData.renewalRows) ? detailData.renewalRows : [];
    const invoices = this.listClientRelatedInvoices_(client.client_id || '');
    const receipts = this.listClientRelatedReceipts_(client.client_id || '');
    const agreementSummary = detail.agreement || detail.agreement_summary || detail.agreementSummary || {};
    const fromTimeline = {
      agreement_signed: this.selectMilestoneDateFromTimeline_(timeline, ['agreement_signed', 'agreementSigned']),
      service_start: this.selectMilestoneDateFromTimeline_(timeline, ['service_start', 'serviceStart']),
      service_end: this.selectMilestoneDateFromTimeline_(timeline, ['service_end', 'serviceEnd']),
      invoice_issued: this.selectMilestoneDateFromTimeline_(timeline, ['invoice_issued', 'invoiceIssued']),
      invoice_due: this.selectMilestoneDateFromTimeline_(timeline, ['invoice_due', 'invoiceDue']),
      receipt_received: this.selectMilestoneDateFromTimeline_(timeline, ['receipt_received', 'receiptReceived'])
    };
    const fallback = {
      agreement_signed: String(
        detail.agreement_date ||
          detail.signed_at ||
          agreementSummary.agreement_date ||
          agreementSummary.signed_at ||
          ''
      ).trim(),
      service_start: this.minDateFromRows_(renewals, 'service_start_date'),
      service_end: this.maxDateFromRows_(renewals, 'service_end_date'),
      invoice_issued: this.maxDateFromRows_(invoices, 'issued_date'),
      invoice_due: this.maxDateFromRows_(invoices, 'due_date'),
      receipt_received: this.maxDateFromRows_(receipts, 'receipt_date')
    };
    const selected = {
      agreement_signed: fromTimeline.agreement_signed || fallback.agreement_signed,
      service_start: fromTimeline.service_start || fallback.service_start,
      service_end: fromTimeline.service_end || fallback.service_end,
      invoice_issued: fromTimeline.invoice_issued || fallback.invoice_issued,
      invoice_due: fromTimeline.invoice_due || fallback.invoice_due,
      receipt_received: fromTimeline.receipt_received || fallback.receipt_received
    };
    return selected;
  },
  getDaysLeft(date) {
    const value = String(date || '').trim();
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    parsed.setHours(0, 0, 0, 0);
    return Math.round((parsed.getTime() - today.getTime()) / 86400000);
  },
  getPaymentStatus(row = {}) {
    const pending = this.toNumberSafe(row.pending_amount ?? row.amount_due ?? row.balance ?? 0);
    const paid = this.toNumberSafe(row.amount_paid ?? row.credit ?? 0);
    const dueDate = String(row.due_date || row.dueDate || '').trim();
    const daysLeft = this.getDaysLeft(dueDate);
    if (pending <= 0 && paid > 0) return 'Paid';
    if (paid > 0 && pending > 0) return 'Partially Paid';
    if (daysLeft !== null && daysLeft < 0 && pending > 0) return 'Overdue';
    if (pending > 0) return 'Open';
    return 'Pending';
  },
  getRenewalStatus(row = {}) {
    const days = this.getDaysLeft(row.renewal_date || row.renewalDate || row.end_date || row.service_end_date);
    const paymentStatus = this.getPaymentStatus(row);
    if (days === null) return paymentStatus || 'Unknown';
    if (days < 0) return 'Renewal Overdue';
    if (days <= 7) return 'Renewal Due in 7 days';
    if (days <= 30) return 'Renewal Due in 30 days';
    if (days <= 60) return 'Renewal Due in 60 days';
    return paymentStatus === 'Overdue' ? 'Payment Overdue' : 'Scheduled';
  },
  computeRunningBalance(rows = []) {
    let running = 0;
    return rows
      .slice()
      .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime())
      .map(row => {
        const debit = this.toNumberSafe(row.debit);
        const credit = this.toNumberSafe(row.credit);
        running += debit - credit;
        return { ...row, debit, credit, running_balance: running };
      });
  },
  buildClientStatementRows(client) {
    const clientId = String(client?.client_id || '').trim();
    const invoices = this.listClientRelatedInvoices_(clientId);
    const receipts = this.listClientRelatedReceipts_(clientId);
    const invoiceRows = invoices.map(item => ({
      date: item.issued_date || item.updated_at,
      type: 'Invoice',
      document_no: item.invoice_number || item.invoice_id || '—',
      document_id: item.invoice_id,
      reference: item.reference || item.agreement_id || '',
      debit: this.toNumberSafe(item.grand_total),
      credit: 0,
      due_date: item.due_date || '',
      status: this.getPaymentStatus(item),
      notes: item.notes || '',
      currency: String(item.currency || '').trim() || 'USD'
    }));
    const receiptRows = receipts.map(item => ({
      date: item.receipt_date || item.updated_at,
      type: 'Receipt',
      document_no: item.receipt_number || item.receipt_id || '—',
      document_id: item.receipt_id,
      reference: item.reference || item.invoice_id || '',
      debit: 0,
      credit: this.toNumberSafe(item.received_amount),
      due_date: '',
      status: item.payment_state || 'Received',
      notes: item.notes || '',
      currency: String(item.currency || '').trim() || 'USD'
    }));
    return this.computeRunningBalance([...invoiceRows, ...receiptRows]).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  },
  buildClientRenewalRows(client) {
    const clientId = String(client?.client_id || '').trim();
    const agreements = this.listClientRelatedAgreements_(clientId);
    const rows = [];
    agreements.forEach(agreement => {
      const itemRows = Array.isArray(agreement.items) ? agreement.items : [];
      itemRows.forEach(item => {
        const normalized = this.normalizeRenewalRow({
          ...item,
          agreement_id: agreement.agreement_id,
          agreement_number: agreement.agreement_number,
          client_name: client.customer_name || client.customer_legal_name || '—',
          renewal_date: this.getField(item, 'renewal_date', 'renewalDate', 'service_end_date', 'serviceEndDate', 'end_date', 'endDate'),
          service_start_date: this.getField(item, 'service_start_date', 'serviceStartDate', 'start_date', 'startDate') || agreement.service_start_date,
          service_end_date: this.getField(item, 'service_end_date', 'serviceEndDate', 'end_date', 'endDate') || agreement.service_end_date || agreement.end_date,
          location_name: this.getField(item, 'location_name', 'locationName') || agreement.location_name,
          payment_status: this.getField(item, 'payment_status', 'paymentStatus')
        });
        if (normalized.renewal_date || normalized.service_start_date || normalized.service_end_date || normalized.location_name || normalized.module_name) {
          rows.push(normalized);
        }
      });
    });
    return rows;
  },
  normalizeStatementRow(raw = {}) {
    return {
      date: String(this.getField(raw, 'date', 'entry_date', 'created_at') || '').trim(),
      type: String(this.getField(raw, 'type', 'entry_type') || '').trim(),
      document_no: String(this.getField(raw, 'document_no', 'documentNo', 'document_number', 'invoice_number', 'receipt_number') || '').trim(),
      document_id: String(this.getField(raw, 'document_id', 'documentId', 'invoice_id', 'receipt_id') || '').trim(),
      reference: String(this.getField(raw, 'reference', 'ref') || '').trim(),
      debit: this.toNumberSafe(this.getField(raw, 'debit', 'amount_debit')),
      credit: this.toNumberSafe(this.getField(raw, 'credit', 'amount_credit', 'amount_paid')),
      due_date: String(this.getField(raw, 'due_date', 'dueDate') || '').trim(),
      status: String(this.getField(raw, 'status', 'payment_state') || '').trim(),
      notes: String(this.getField(raw, 'notes', 'description') || '').trim(),
      currency: String(this.getField(raw, 'currency', 'currency_code', 'currencyCode') || '').trim() || 'USD'
    };
  },
  normalizeRenewalRow(raw = {}) {
    const renewalDate = String(this.getField(raw, 'renewal_date', 'renewalDate', 'next_renewal_date', 'nextRenewalDate', 'service_end_date', 'serviceEndDate') || '').trim();
    const paymentStatus = String(this.getField(raw, 'payment_status', 'paymentStatus') || '').trim();
    return {
      agreement_id: String(this.getField(raw, 'agreement_id', 'agreementId') || '').trim(),
      agreement_number: String(this.getField(raw, 'agreement_number', 'agreementNo', 'agreementNumber') || '').trim(),
      invoice_id: String(this.getField(raw, 'invoice_id', 'invoiceId') || '').trim(),
      invoice_number: String(this.getField(raw, 'invoice_no', 'invoiceNo', 'invoice_number', 'invoiceNumber') || '').trim(),
      client_name: String(this.getField(raw, 'client', 'client_name', 'customer_name', 'customerName') || '').trim(),
      location_name: String(this.getField(raw, 'location_name', 'locationName') || '').trim(),
      module_name: String(this.getField(raw, 'module_name', 'moduleName', 'item_name', 'name') || '').trim(),
      service_start_date: String(this.getField(raw, 'service_start_date', 'serviceStartDate', 'start_date', 'startDate') || '').trim(),
      service_end_date: String(this.getField(raw, 'service_end_date', 'serviceEndDate', 'end_date', 'endDate') || '').trim(),
      due_date: String(this.getField(raw, 'due_date', 'dueDate') || '').trim(),
      renewal_date: renewalDate,
      billing_frequency: String(this.getField(raw, 'billing_frequency', 'billingFrequency') || '').trim(),
      days_left: this.getDaysLeft(renewalDate),
      amount_due: this.toNumberSafe(this.getField(raw, 'amount_due', 'pending_amount', 'pendingAmount')),
      status: String(this.getField(raw, 'status') || '').trim(),
      payment_status: paymentStatus || this.getPaymentStatus(raw)
    };
  },
  applyFilters() {
    const terms = String(this.state.search || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    const status = String(this.state.status || 'All');
    const sorted = this.state.rows
      .filter(client => {
        if (status !== 'All' && String(client.status || '').trim() !== status) return false;
        if (!terms.length) return true;
        const haystack = [client.customer_name, client.customer_legal_name, client.primary_contact_name, client.primary_contact_email]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return terms.every(term => haystack.includes(term));
      })
      .sort((a, b) => {
        const aAnalytics = a.analytics || {};
        const bAnalytics = b.analytics || {};
        if (this.state.sort === 'paid_desc') return this.toNumberSafe(bAnalytics.total_paid_amount) - this.toNumberSafe(aAnalytics.total_paid_amount);
        if (this.state.sort === 'agreement_desc') return this.toNumberSafe(bAnalytics.total_agreement_value) - this.toNumberSafe(aAnalytics.total_agreement_value);
        return this.toNumberSafe(bAnalytics.total_due_amount) - this.toNumberSafe(aAnalytics.total_due_amount);
      });
    this.state.filteredRows = sorted;
  },
  badgeClassFromInvoice_(invoice = {}) {
    const due = this.toNumberSafe(invoice.pending_amount);
    const paid = this.toNumberSafe(invoice.amount_paid);
    if (due <= 0 && paid > 0) return 'online';
    if (paid > 0 && due > 0) return 'offline';
    return '';
  },
  setDetailTab(tab = 'overview') {
    this.state.activeDetailTab = ['overview', 'statement', 'renewals'].includes(tab) ? tab : 'overview';
    if (E.clientOverviewSection) E.clientOverviewSection.style.display = this.state.activeDetailTab === 'overview' ? '' : 'none';
    if (E.clientStatementSection) E.clientStatementSection.style.display = this.state.activeDetailTab === 'statement' ? '' : 'none';
    if (E.clientRenewalsSection) E.clientRenewalsSection.style.display = this.state.activeDetailTab === 'renewals' ? '' : 'none';
    if (E.clientDetailTabButtons) {
      E.clientDetailTabButtons.querySelectorAll('[data-client-detail-tab]').forEach(btn => {
        const selected = btn.getAttribute('data-client-detail-tab') === this.state.activeDetailTab;
        btn.classList.toggle('primary', selected);
        btn.classList.toggle('ghost', !selected);
      });
    }
  },
  async loadClientDetailData_(clientId, { force = false } = {}) {
    const cache = this.state.detailCache[clientId];
    if (!force && cache && Date.now() - cache.loadedAt <= this.state.detailCacheTtlMs) return cache;
    const safeRequest = async (action, payload = {}) => {
      try {
        return await Api.postAuthenticated('clients', action, { client_id: clientId, ...payload });
      } catch {
        return null;
      }
    };
    const [detailRes, analyticsRes, timelineRes, statementRes, renewalsRes] = await Promise.all([
      safeRequest('get'),
      safeRequest('get_analytics'),
      safeRequest('get_timeline'),
      safeRequest('get_statement', { filters: this.state.statementFilters }),
      safeRequest('get_renewals', { filters: this.state.renewalsFilters })
    ]);
    const client = this.state.rows.find(row => row.client_id === clientId);
    const normalizedStatement = this.extractRows(statementRes).map(item => this.normalizeStatementRow(item));
    const normalizedRenewals = this.extractRows(renewalsRes).map(item => this.normalizeRenewalRow(item));
    const normalizedTimeline = this.normalizeTimelineEvents_(
      this.extractTimelineRows_(
        timelineRes?.timeline,
        timelineRes?.rows,
        timelineRes?.data,
        detailRes?.timeline,
        detailRes?.rows,
        detailRes?.data,
        detailRes?.paymentTimeline?.timeline,
        detailRes?.paymentTimeline?.rows,
        detailRes?.paymentTimeline?.data,
        detailRes?.payment_timeline?.timeline,
        detailRes?.payment_timeline?.rows,
        detailRes?.payment_timeline?.data
      )
    );
    const fallbackTimeline = this.buildTimeline_(clientId);
    const detailBundle = {
      detail: detailRes || {},
      analytics: this.resolveBackendAnalytics_(analyticsRes) || client?.analytics || this.computeClientAnalytics_(client || {}),
      timeline: normalizedTimeline.length ? normalizedTimeline : fallbackTimeline,
      statementRows: normalizedStatement.length ? this.computeRunningBalance(normalizedStatement) : this.buildClientStatementRows(client),
      renewalRows: normalizedRenewals.length ? normalizedRenewals : this.buildClientRenewalRows(client),
      loadedAt: Date.now()
    };
    console.debug('[Clients] detail timeline source', {
      clientId,
      timelineEvents: detailBundle.timeline.length,
      renewalRows: detailBundle.renewalRows.length
    });
    this.state.detailCache[clientId] = detailBundle;
    return detailBundle;
  },
  getFilteredStatementRows_(rows = []) {
    const { status, dateFrom, dateTo, searchDoc } = this.state.statementFilters;
    return rows.filter(row => {
      const rowStatus = this.normalizeText(row.status || this.getPaymentStatus(row));
      if (status === 'open' && !rowStatus.includes('open') && !rowStatus.includes('partial')) return false;
      if (status === 'overdue' && !rowStatus.includes('overdue')) return false;
      const rowDate = String(row.date || '').trim();
      if (dateFrom && rowDate && new Date(rowDate).getTime() < new Date(dateFrom).getTime()) return false;
      if (dateTo && rowDate && new Date(rowDate).getTime() > new Date(dateTo).getTime()) return false;
      if (searchDoc && !String(row.document_no || '').toLowerCase().includes(String(searchDoc).toLowerCase())) return false;
      return true;
    });
  },
  getFilteredRenewalRows_(rows = []) {
    const { dateFrom, dateTo } = this.state.renewalsFilters;
    return rows.filter(row => {
      const dateValue = String(row.renewal_date || '').trim();
      if (!dateValue) return true;
      if (dateFrom && new Date(dateValue).getTime() < new Date(dateFrom).getTime()) return false;
      if (dateTo && new Date(dateValue).getTime() > new Date(dateTo).getTime()) return false;
      return true;
    });
  },
  renderStatementSection_(detailData = {}) {
    const rows = this.getFilteredStatementRows_(detailData.statementRows || []);
    const totalInvoiced = rows.reduce((sum, item) => sum + this.toNumberSafe(item.debit), 0);
    const totalPaid = rows.reduce((sum, item) => sum + this.toNumberSafe(item.credit), 0);
    const totalDue = Math.max(totalInvoiced - totalPaid, 0);
    const lastPayment = rows.find(item => this.toNumberSafe(item.credit) > 0)?.date || '';
    const nextRenewal = (detailData.renewalRows || [])
      .map(item => item.renewal_date)
      .filter(Boolean)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
    if (E.clientStatementCards) {
      E.clientStatementCards.innerHTML = [
        ['Total Invoiced', U.fmtNumber(totalInvoiced)],
        ['Total Paid', U.fmtNumber(totalPaid)],
        ['Total Due', U.fmtNumber(totalDue)],
        ['Last Payment Date', U.fmtDisplayDate(lastPayment) || '—'],
        ['Next Renewal Date', U.fmtDisplayDate(nextRenewal) || '—']
      ]
        .map(([label, value]) => `<div class="card kpi"><div class="label">${U.escapeHtml(label)}</div><div class="value">${U.escapeHtml(String(value))}</div></div>`)
        .join('');
    }
    if (E.clientStatementTbody) {
      E.clientStatementTbody.innerHTML = rows.length
        ? rows
            .map(row => `<tr>
              <td>${U.escapeHtml(U.fmtDisplayDate(row.date) || '—')}</td>
              <td>${U.escapeHtml(row.type || '—')}</td>
              <td>${U.escapeHtml(row.document_no || '—')}</td>
              <td>${U.escapeHtml(row.reference || '—')}</td>
              <td>${U.escapeHtml(row.currency || 'USD')}</td>
              <td>${U.escapeHtml(U.fmtNumber(row.debit || 0))}</td>
              <td>${U.escapeHtml(U.fmtNumber(row.credit || 0))}</td>
              <td>${U.escapeHtml(U.fmtNumber(row.running_balance || 0))}</td>
              <td>${U.escapeHtml(U.fmtDisplayDate(row.due_date) || '—')}</td>
              <td>${U.escapeHtml(row.status || this.getPaymentStatus(row))}</td>
              <td>${U.escapeHtml(row.notes || '—')}</td>
            </tr>`)
            .join('')
        : '<tr><td colspan="11" class="muted" style="text-align:center;">No statement rows found.</td></tr>';
    }
  },
  buildStatementExportHtml_(client = {}, rows = []) {
    const generatedOn = new Date();
    const customerName = client.customer_name || client.customer_legal_name || 'Client';
    const title = `Statement of Account · ${customerName}`;
    const baseHref = U.escapeAttr(window.location.href);
    const bodyRows = rows.length
      ? rows
          .map(row => `<tr>
            <td>${U.escapeHtml(U.fmtDisplayDate(row.date) || '—')}</td>
            <td>${U.escapeHtml(row.type || '—')}</td>
            <td>${U.escapeHtml(row.document_no || '—')}</td>
            <td>${U.escapeHtml(row.reference || '—')}</td>
            <td>${U.escapeHtml(row.currency || 'USD')}</td>
            <td style="text-align:right;">${U.escapeHtml(U.fmtNumber(row.debit || 0))}</td>
            <td style="text-align:right;">${U.escapeHtml(U.fmtNumber(row.credit || 0))}</td>
            <td style="text-align:right;">${U.escapeHtml(U.fmtNumber(row.running_balance || 0))}</td>
            <td>${U.escapeHtml(U.fmtDisplayDate(row.due_date) || '—')}</td>
            <td>${U.escapeHtml(row.status || this.getPaymentStatus(row))}</td>
            <td>${U.escapeHtml(row.notes || '—')}</td>
          </tr>`)
          .join('')
      : '<tr><td colspan="11" style="text-align:center;">No statement rows found.</td></tr>';
    const totalDebit = rows.reduce((sum, item) => sum + this.toNumberSafe(item.debit), 0);
    const totalCredit = rows.reduce((sum, item) => sum + this.toNumberSafe(item.credit), 0);
    const balance = Math.max(totalDebit - totalCredit, 0);
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${U.escapeHtml(title)}</title>
          <base href="${baseHref}" />
          <link rel="stylesheet" href="styles.css" />
          <style>
            body { margin: 20px; background: #fff; color: #111; font-family: Inter, system-ui, -apple-system, sans-serif; }
            .meta { display:flex; gap:8px; flex-wrap:wrap; margin-bottom: 10px; }
            .meta span { padding: 4px 8px; border: 1px solid #ddd; border-radius: 999px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { border: 1px solid #ddd; padding: 6px; font-size: 12px; vertical-align: top; }
            th { background: #f5f5f5; text-align: left; }
            .totals { margin-top: 12px; display: grid; grid-template-columns: repeat(3, minmax(160px, 1fr)); gap: 8px; }
            .totals .item { border:1px solid #ddd; border-radius:8px; padding:8px; }
            .totals .label { font-size: 11px; color:#666; }
            .totals .value { font-weight: 700; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <h2 style="margin:0 0 6px;">Statement of Account</h2>
          <div style="margin-bottom:10px;">${U.escapeHtml(customerName)}</div>
          <div class="meta">
            <span>Generated: ${U.escapeHtml(U.fmtDisplayDate(generatedOn.toISOString().slice(0, 10)) || '—')}</span>
            <span>Client ID: ${U.escapeHtml(client.client_id || '—')}</span>
            <span>Rows: ${U.escapeHtml(String(rows.length))}</span>
          </div>
          <table>
            <thead>
              <tr><th>Date</th><th>Type</th><th>Document No</th><th>Reference</th><th>Currency</th><th>Debit</th><th>Credit</th><th>Running Balance</th><th>Due Date</th><th>Status</th><th>Notes</th></tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
          <div class="totals">
            <div class="item"><div class="label">Total Invoiced</div><div class="value">${U.escapeHtml(U.fmtNumber(totalDebit))}</div></div>
            <div class="item"><div class="label">Total Paid</div><div class="value">${U.escapeHtml(U.fmtNumber(totalCredit))}</div></div>
            <div class="item"><div class="label">Balance Due</div><div class="value">${U.escapeHtml(U.fmtNumber(balance))}</div></div>
          </div>
        </body>
      </html>
    `;
    return U.addIncheckDocumentLogo(html);
  },
  previewStatementPdf() {
    const client = this.state.rows.find(row => row.client_id === this.state.selectedClientId);
    if (!client) {
      UI.toast('Select a client first.');
      return;
    }
    const detailData = this.state.detailCache[client.client_id] || {};
    const rows = this.getFilteredStatementRows_(detailData.statementRows || []);
    const printableDoc = this.buildStatementExportHtml_(client, rows);
    const clientName = client.customer_name || client.customer_legal_name || client.client_id || 'Client';
    if (E.clientStatementPreviewTitle)
      E.clientStatementPreviewTitle.textContent = `Statement of Account Preview · ${clientName}`;
    if (E.clientStatementPreviewFrame) E.clientStatementPreviewFrame.srcdoc = printableDoc;
    if (E.clientStatementPreviewModal) {
      E.clientStatementPreviewModal.classList.add('open');
      E.clientStatementPreviewModal.setAttribute('aria-hidden', 'false');
    }
  },
  closeStatementPreviewModal() {
    if (!E.clientStatementPreviewModal) return;
    E.clientStatementPreviewModal.classList.remove('open');
    E.clientStatementPreviewModal.setAttribute('aria-hidden', 'true');
    if (E.clientStatementPreviewFrame) E.clientStatementPreviewFrame.srcdoc = '';
  },
  exportStatementPdf() {
    const frame = E.clientStatementPreviewFrame;
    const previewTitle = String(E.clientStatementPreviewTitle?.textContent || 'Statement of Account Preview').trim();
    if (!frame || !String(frame.srcdoc || '').trim()) {
      UI.toast('Open statement preview first to extract PDF.');
      return;
    }
    const frameWindow = frame.contentWindow;
    if (!frameWindow) {
      UI.toast('Unable to access statement preview content.');
      return;
    }
    frameWindow.focus();
    frameWindow.print();
    UI.toast(`Print dialog opened for ${previewTitle}. Choose "Save as PDF" to extract.`);
  },
  renderRenewalsSection_(detailData = {}, client = {}) {
    const rows = this.getFilteredRenewalRows_(detailData.renewalRows || []);
    const buckets = { d7: 0, d30: 0, d60: 0, overdueRenewals: 0, overduePayments: 0 };
    rows.forEach(row => {
      const days = this.getDaysLeft(row.renewal_date);
      if (days !== null && days <= 7 && days >= 0) buckets.d7 += 1;
      if (days !== null && days <= 30 && days >= 0) buckets.d30 += 1;
      if (days !== null && days <= 60 && days >= 0) buckets.d60 += 1;
      if (days !== null && days < 0) buckets.overdueRenewals += 1;
      if (this.getPaymentStatus(row).includes('Overdue')) buckets.overduePayments += 1;
    });
    if (E.clientRenewalBuckets) {
      E.clientRenewalBuckets.innerHTML = [
        ['Due in 7 days', buckets.d7],
        ['Due in 30 days', buckets.d30],
        ['Due in 60 days', buckets.d60],
        ['Overdue renewals', buckets.overdueRenewals],
        ['Overdue payments', buckets.overduePayments]
      ]
        .map(([label, value]) => `<div class="card kpi"><div class="label">${U.escapeHtml(label)}</div><div class="value">${U.escapeHtml(String(value))}</div></div>`)
        .join('');
    }
    if (E.clientRenewalsTbody) {
      E.clientRenewalsTbody.innerHTML = rows.length
        ? rows
            .map(row => `<tr>
              <td>${U.escapeHtml(row.location_name || '—')}</td>
              <td>${U.escapeHtml(row.module_name || '—')}</td>
              <td>${U.escapeHtml(U.fmtDisplayDate(row.service_start_date) || '—')}</td>
              <td>${U.escapeHtml(U.fmtDisplayDate(row.service_end_date) || '—')}</td>
              <td>${U.escapeHtml(U.fmtDisplayDate(row.renewal_date) || '—')}</td>
              <td>${U.escapeHtml(row.billing_frequency || '—')}</td>
              <td>${U.escapeHtml(row.payment_status || this.getPaymentStatus(row) || '—')}</td>
            </tr>`)
            .join('')
        : '<tr><td colspan="7" class="muted" style="text-align:center;">No renewals or payments timeline rows.</td></tr>';
    }
    if (E.clientRenewalEvents) {
      const milestones = this.getMilestoneValues_(detailData, client);
      const events = [
        { label: 'Agreement signed', value: milestones.agreement_signed },
        { label: 'Service start', value: milestones.service_start },
        { label: 'Service end', value: milestones.service_end },
        { label: 'Invoice issued', value: milestones.invoice_issued },
        { label: 'Invoice due', value: milestones.invoice_due },
        { label: 'Receipt received', value: milestones.receipt_received },
        { label: 'Renewal due soon', value: detailData?.detail?.next_renewal_date || detailData?.analytics?.next_renewal_date || '' },
        { label: 'Renewal overdue', value: detailData?.detail?.overdue_renewal_date || detailData?.analytics?.overdue_renewal_date || '' }
      ];
      console.debug('[Clients] milestone selection', {
        clientId: client.client_id,
        timelineEvents: (detailData.timeline || []).length,
        renewalRows: rows.length,
        milestones
      });
      E.clientRenewalEvents.innerHTML = events
        .map(event => {
          const displayValue = U.fmtDisplayDate(event.value) || '—';
          return `<div class="card kpi"><div class="label">${U.escapeHtml(event.label)}</div><div class="value">${U.escapeHtml(displayValue)}</div></div>`;
        })
        .join('');
    }
  },
  renderList() {
    if (!E.clientsTbody) return;
    if (this.state.loadError) {
      E.clientsTbody.innerHTML = `<tr><td colspan="9" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(this.state.loadError)}</td></tr>`;
      return;
    }
    if (!this.state.filteredRows.length) {
      E.clientsTbody.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;">No clients found.</td></tr>';
      return;
    }
    E.clientsTbody.innerHTML = this.state.filteredRows
      .map(client => {
        const analytics = client.analytics || {};
        const activeClass = this.state.selectedClientId === client.client_id ? ' style="background:rgba(59,130,246,.08);"' : '';
        return `<tr data-client-row="${U.escapeAttr(client.client_id)}"${activeClass}>
          <td>${U.escapeHtml(client.customer_name || '—')}</td>
          <td>${U.escapeHtml(client.customer_legal_name || '—')}</td>
          <td>${U.escapeHtml(String(analytics.total_locations ?? 0))}</td>
          <td>${U.escapeHtml(String(analytics.total_agreements ?? 0))}</td>
          <td>${U.escapeHtml(U.fmtNumber(analytics.total_invoiced_value || 0))}</td>
          <td>${U.escapeHtml(U.fmtNumber(analytics.total_paid_amount || 0))}</td>
          <td>${U.escapeHtml(U.fmtNumber(analytics.total_due_amount || 0))}</td>
          <td><span class="chip">${U.escapeHtml(client.status || 'Unknown')}</span></td>
          <td>${U.escapeHtml(U.fmtDisplayDate(analytics.latest_activity_date) || '—')}</td>
        </tr>`;
      })
      .join('');
  },
  renderDetail() {
    const client = this.state.rows.find(row => row.client_id === this.state.selectedClientId);
    if (!client) {
      if (E.clientsDetailEmpty) E.clientsDetailEmpty.style.display = '';
      if (E.clientsDetailPanel) E.clientsDetailPanel.style.display = 'none';
      return;
    }
    if (E.clientsDetailEmpty) E.clientsDetailEmpty.style.display = 'none';
    if (E.clientsDetailPanel) E.clientsDetailPanel.style.display = '';
    const detailData = this.state.detailCache[client.client_id] || {};
    const analytics = detailData.analytics || client.analytics || this.computeClientAnalytics_(client);
    if (E.clientStatementFiltersStatus) E.clientStatementFiltersStatus.value = this.state.statementFilters.status || 'all';
    if (E.clientStatementDateFrom) E.clientStatementDateFrom.value = this.state.statementFilters.dateFrom || '';
    if (E.clientStatementDateTo) E.clientStatementDateTo.value = this.state.statementFilters.dateTo || '';
    if (E.clientStatementSearchDoc) E.clientStatementSearchDoc.value = this.state.statementFilters.searchDoc || '';
    if (E.clientRenewalsDateFrom) E.clientRenewalsDateFrom.value = this.state.renewalsFilters.dateFrom || '';
    if (E.clientRenewalsDateTo) E.clientRenewalsDateTo.value = this.state.renewalsFilters.dateTo || '';
    if (E.clientDetailName) E.clientDetailName.textContent = client.customer_name || '—';
    if (E.clientDetailMeta) E.clientDetailMeta.textContent = `${client.customer_legal_name || 'No legal name'} • ${client.primary_contact_name || 'No contact'} • ${client.primary_contact_email || 'No email'}`;
    if (E.clientDetailStatus) E.clientDetailStatus.textContent = client.status || 'Unknown';
    if (E.clientDetailOverview) {
      E.clientDetailOverview.textContent = `Phone: ${client.phone || '—'} | Country: ${client.country || '—'} | Address: ${client.address || '—'} | Billing: ${client.billing_address || '—'} | Tax: ${client.tax_number || '—'} | Industry: ${client.industry || '—'} | Source: ${client.source || '—'} | Notes: ${client.notes || '—'}`;
    }

    const analyticsCards = [
      ['Locations', `${analytics.total_locations || 0} (${analytics.active_locations || 0} active)`],
      ['Agreements', `${analytics.total_agreements || 0} (${analytics.signed_agreements || 0} signed)`],
      ['Agreement Value', U.fmtNumber(analytics.total_agreement_value || 0)],
      ['Total Invoiced', U.fmtNumber(analytics.total_invoiced_value || 0)],
      ['Total Paid', U.fmtNumber(analytics.total_paid_amount || 0)],
      ['Total Due', U.fmtNumber(analytics.total_due_amount || 0)],
      ['Receipts', U.fmtNumber(analytics.total_receipts_value || 0)],
      ['Next Renewal', U.fmtDisplayDate(analytics.next_renewal_date) || '—']
    ];
    if (E.clientAnalyticsCards) {
      E.clientAnalyticsCards.innerHTML = analyticsCards
        .map(([label, value]) => `<div class="card kpi"><div class="label">${U.escapeHtml(label)}</div><div class="value">${U.escapeHtml(String(value))}</div></div>`)
        .join('');
    }

    const agreements = this.listClientRelatedAgreements_(client.client_id);
    const invoices = this.listClientRelatedInvoices_(client.client_id);
    const receipts = this.listClientRelatedReceipts_(client.client_id);
    if (E.clientRelatedAgreementsTbody) {
      E.clientRelatedAgreementsTbody.innerHTML = agreements.length
        ? agreements
            .map(item => `<tr>
              <td>${U.escapeHtml(item.agreement_number || item.agreement_id || '—')}</td>
              <td>${U.escapeHtml(item.status || '—')}</td>
              <td>${U.escapeHtml(U.fmtNumber(item.grand_total || 0))}</td>
              <td>${U.escapeHtml(U.fmtDisplayDate(item.service_start_date) || '—')}</td>
              <td>${U.escapeHtml(U.fmtDisplayDate(item.end_date || item.service_end_date) || '—')}</td>
              <td>${item.agreement_id ? `<button class="btn ghost sm" type="button" data-agreement-view="${U.escapeAttr(item.agreement_id)}">Open</button>` : '—'}</td>
            </tr>`)
            .join('')
        : '<tr><td colspan="6" class="muted" style="text-align:center;">No agreements.</td></tr>';
    }
    if (E.clientRelatedInvoicesTbody) {
      E.clientRelatedInvoicesTbody.innerHTML = invoices.length
        ? invoices
            .map(item => `<tr>
              <td>${U.escapeHtml(item.invoice_number || item.invoice_id || '—')}</td>
              <td><span class="chip ${this.badgeClassFromInvoice_(item)}">${U.escapeHtml(item.status || '—')}</span></td>
              <td>${U.escapeHtml(U.fmtNumber(item.grand_total || 0))}</td>
              <td>${U.escapeHtml(U.fmtNumber(item.amount_paid || 0))}</td>
              <td>${U.escapeHtml(U.fmtNumber(item.pending_amount || 0))}</td>
              <td>${item.invoice_id ? `<button class="btn ghost sm" type="button" data-invoice-view="${U.escapeAttr(item.invoice_id)}">Open</button>` : '—'}</td>
            </tr>`)
            .join('')
        : '<tr><td colspan="6" class="muted" style="text-align:center;">No invoices.</td></tr>';
    }
    if (E.clientRelatedReceiptsTbody) {
      E.clientRelatedReceiptsTbody.innerHTML = receipts.length
        ? receipts
            .map(item => `<tr>
              <td>${U.escapeHtml(item.receipt_number || item.receipt_id || '—')}</td>
              <td>${U.escapeHtml(item.payment_state || '—')}</td>
              <td>${U.escapeHtml(U.fmtNumber(item.received_amount || 0))}</td>
              <td>${U.escapeHtml(U.fmtNumber(item.pending_amount || 0))}</td>
              <td>${item.receipt_id ? `<button class="btn ghost sm" type="button" data-receipt-view="${U.escapeAttr(item.receipt_id)}">Open</button>` : '—'}</td>
            </tr>`)
            .join('')
        : '<tr><td colspan="5" class="muted" style="text-align:center;">No receipts.</td></tr>';
    }

    if (E.clientTimeline) {
      const timeline = (detailData.timeline || this.buildTimeline_(client.client_id)).slice(0, 20);
      E.clientTimeline.innerHTML = timeline.length
        ? timeline
            .map(item => `<li><strong>${U.escapeHtml(U.fmtDisplayDate(item.date || item.event_date) || '—')}</strong> — ${U.escapeHtml(item.label || item.title || item.type || 'Activity')}</li>`)
            .join('')
        : '<li class="muted">No timeline activity yet.</li>';
    }
    this.renderStatementSection_(detailData);
    this.renderRenewalsSection_(detailData, client);
    this.setDetailTab(this.state.activeDetailTab);
  },
  render() {
    this.applyFilters();
    this.renderList();
    this.renderDetail();
    if (E.clientsState) {
      E.clientsState.textContent = this.state.loadError || `Loaded ${this.state.filteredRows.length} of ${this.state.rows.length} clients.`;
    }
    if (E.clientsStatusFilter) {
      const statuses = ['All', ...new Set(this.state.rows.map(item => item.status).filter(Boolean))];
      E.clientsStatusFilter.innerHTML = statuses.map(status => `<option>${U.escapeHtml(status)}</option>`).join('');
      E.clientsStatusFilter.value = statuses.includes(this.state.status) ? this.state.status : 'All';
    }
    if (E.clientsGlobalRenewals) {
      const allRenewals = this.state.rows.flatMap(client => this.buildClientRenewalRows(client));
      const overdueRenewals = allRenewals.filter(row => (this.getDaysLeft(row.renewal_date) ?? 1) < 0).length;
      const dueSoon = allRenewals.filter(row => {
        const days = this.getDaysLeft(row.renewal_date);
        return days !== null && days >= 0 && days <= 30;
      }).length;
      const overduePayments = allRenewals.filter(row => this.getPaymentStatus(row) === 'Overdue').length;
      E.clientsGlobalRenewals.textContent = `Global renewals snapshot: ${dueSoon} due in 30 days, ${overdueRenewals} overdue renewals, ${overduePayments} overdue payments.`;
    }
  },
  renderDetailSkeletons_() {
    if (E.clientStatementTbody) {
      E.clientStatementTbody.innerHTML = '<tr><td colspan="10"><div class="skeleton" style="height:30px;"></div></td></tr>';
    }
    if (E.clientRenewalsTbody) {
      E.clientRenewalsTbody.innerHTML = '<tr><td colspan="7"><div class="skeleton" style="height:30px;"></div></td></tr>';
    }
  },
  async selectClient(clientId, options = {}) {
    this.state.selectedClientId = String(clientId || '').trim();
    this.render();
    if (!this.state.selectedClientId) return;
    this.state.detailLoading = true;
    this.renderDetailSkeletons_();
    try {
      await this.loadClientDetailData_(this.state.selectedClientId, options);
    } finally {
      this.state.detailLoading = false;
      this.render();
    }
  },
  async loadAndRefresh(options = {}) {
    if (this.state.loading && !options.force) return;
    if (!Permissions.canViewClients()) return;
    const hasWarmCache = this.state.loaded && Date.now() - this.state.lastLoadedAt <= this.state.cacheTtlMs;
    if (hasWarmCache && !options.force) {
      this.render();
      return;
    }
    this.state.loading = true;
    this.state.loadError = '';
    if (E.clientsState) E.clientsState.textContent = 'Loading client intelligence…';
    try {
      const [clientsRes, agreementsRes, invoicesRes, receiptsRes] = await Promise.all([
        Api.listClients({
          limit: this.state.limit,
          page: this.state.page,
          sort_by: 'updated_at',
          sort_dir: 'desc',
          search: this.state.search || '',
          summary_only: true,
          forceRefresh: options.force === true
        }),
        Api.listAgreements({ summary_only: true, limit: 50, page: 1, forceRefresh: options.force === true }),
        Api.listInvoices({}, { summary_only: true, limit: 50, page: 1, forceRefresh: options.force === true }),
        Api.listReceipts({}, { summary_only: true, limit: 50, page: 1, forceRefresh: options.force === true })
      ]);
      const clientsList = this.extractListResult(clientsRes);
      this.state.rows = clientsList.rows.map(item => {
        const normalized = this.normalizeClient(item);
        normalized.analytics = this.resolveBackendAnalytics_(item);
        return normalized;
      });
      this.state.total = clientsList.total;
      this.state.returned = clientsList.returned;
      this.state.hasMore = clientsList.hasMore;
      this.state.page = clientsList.page;
      this.state.limit = clientsList.limit;
      this.state.offset = clientsList.offset;
      this.state.agreements = this.extractListResult(agreementsRes).rows.map(item => this.normalizeAgreement(item));
      this.state.invoices = this.extractListResult(invoicesRes).rows.map(item => this.normalizeInvoice(item));
      this.state.receipts = this.extractListResult(receiptsRes).rows.map(item => this.normalizeReceipt(item));

      this.state.agreements.forEach(agreement => {
        this.findOrCreateClientFromSignedAgreement_(agreement);
      });
      this.state.rows.forEach(client => {
        if (!this.hasBackendAnalytics_(client.analytics)) {
          client.analytics = this.computeClientAnalytics_(client);
        }
      });
      if (!this.state.selectedClientId && this.state.rows[0]?.client_id) this.state.selectedClientId = this.state.rows[0].client_id;
      this.state.loaded = true;
      this.state.lastLoadedAt = Date.now();
      this.render();
      if (this.state.selectedClientId) await this.selectClient(this.state.selectedClientId, { force: options.force });
    } catch (error) {
      this.state.rows = [];
      this.state.loadError = error?.message || 'Failed to load clients.';
      this.render();
    } finally {
      this.state.loading = false;
    }
  },
  collectNewClientFormData() {
    if (!E.newClientForm) return null;
    const fd = new FormData(E.newClientForm);
    const payload = {};
    this.clientFields.forEach(field => {
      const value = String(fd.get(field) || '').trim();
      if (value) payload[field] = value;
    });
    payload.customer_name = String(fd.get('customer_name') || '').trim();
    payload.customer_legal_name = String(fd.get('customer_legal_name') || '').trim();
    payload.primary_contact_name = String(fd.get('primary_contact_name') || '').trim();
    payload.primary_contact_email = String(fd.get('primary_contact_email') || '').trim();
    payload.normalized_company_key = this.normalizeCompanyKey(payload.customer_legal_name || payload.customer_name);
    payload.source = String(payload.source || 'manual').trim();
    return payload;
  },
  openNewClientModal() {
    if (!E.newClientModal) return;
    E.newClientModal.classList.add('open');
    E.newClientModal.setAttribute('aria-hidden', 'false');
  },
  closeNewClientModal() {
    if (!E.newClientModal) return;
    E.newClientModal.classList.remove('open');
    E.newClientModal.setAttribute('aria-hidden', 'true');
    if (E.newClientForm) E.newClientForm.reset();
  },
  async runClientAction(action) {
    const clientId = String(this.state.selectedClientId || '').trim();
    if (!clientId) {
      UI.toast('Select a client first.');
      return;
    }
    const client = this.state.rows.find(item => item.client_id === clientId);
    if (!client) return;
    try {
      if (action === 'proposal') {
        await Api.createProposalFromClient(clientId, { prefill: client });
        UI.toast('Proposal draft created from client.');
      } else if (action === 'agreement') {
        await Api.createAgreementFromClient(clientId, { prefill: client });
        UI.toast('Agreement draft created from client.');
      } else if (action === 'invoice') {
        const agreements = this.listClientRelatedAgreements_(clientId);
        const agreementId = agreements.length
          ? window.prompt('Optional Agreement ID for invoice prefill (leave blank for blank invoice):', agreements[0].agreement_id || '')
          : '';
        await Api.createInvoiceFromClient(clientId, { agreement_id: String(agreementId || '').trim(), prefill: client });
        UI.toast('Invoice created from client.');
      } else if (action === 'clone') {
        const agreements = this.listClientRelatedAgreements_(clientId);
        if (!agreements.length) {
          UI.toast('No previous agreements found for this client.');
          return;
        }
        const selected = window.prompt('Enter agreement ID to duplicate:', agreements[0].agreement_id || '');
        if (!selected) return;
        await Api.createFromPreviousAgreement(clientId, selected, 'agreement');
        UI.toast('Created new draft from previous agreement.');
      }
    } catch (error) {
      UI.toast(error?.message || 'Client quick action failed.');
    }
  },
  wire() {
    if (E.clientsRefreshBtn) E.clientsRefreshBtn.addEventListener('click', () => this.loadAndRefresh({ force: true }));
    if (E.clientsSearchInput) {
      E.clientsSearchInput.addEventListener('input', () => {
        this.state.search = E.clientsSearchInput.value;
        this.render();
      });
    }
    if (E.clientsStatusFilter) {
      E.clientsStatusFilter.addEventListener('change', () => {
        this.state.status = E.clientsStatusFilter.value;
        this.render();
      });
    }
    if (E.clientsSortSelect) {
      E.clientsSortSelect.addEventListener('change', () => {
        this.state.sort = E.clientsSortSelect.value;
        this.render();
      });
    }
    if (E.clientsTbody) {
      E.clientsTbody.addEventListener('click', event => {
        const row = event.target?.closest?.('[data-client-row]');
        if (row) {
          const selectedId = String(row.getAttribute('data-client-row') || '').trim();
          this.selectClient(selectedId);
        }
      });
    }
    if (E.clientDetailTabButtons) {
      E.clientDetailTabButtons.addEventListener('click', event => {
        const trigger = event.target?.closest?.('[data-client-detail-tab]');
        if (!trigger) return;
        this.setDetailTab(trigger.getAttribute('data-client-detail-tab'));
      });
    }
    if (E.clientStatementApplyFiltersBtn) {
      E.clientStatementApplyFiltersBtn.addEventListener('click', async () => {
        this.state.statementFilters = {
          status: E.clientStatementFiltersStatus?.value || 'all',
          dateFrom: E.clientStatementDateFrom?.value || '',
          dateTo: E.clientStatementDateTo?.value || '',
          searchDoc: E.clientStatementSearchDoc?.value || ''
        };
        if (this.state.selectedClientId) await this.loadClientDetailData_(this.state.selectedClientId, { force: true });
        this.render();
      });
    }
    if (E.clientStatementResetFiltersBtn) {
      E.clientStatementResetFiltersBtn.addEventListener('click', async () => {
        this.state.statementFilters = { status: 'all', dateFrom: '', dateTo: '', searchDoc: '' };
        if (E.clientStatementFiltersStatus) E.clientStatementFiltersStatus.value = 'all';
        if (E.clientStatementDateFrom) E.clientStatementDateFrom.value = '';
        if (E.clientStatementDateTo) E.clientStatementDateTo.value = '';
        if (E.clientStatementSearchDoc) E.clientStatementSearchDoc.value = '';
        if (this.state.selectedClientId) await this.loadClientDetailData_(this.state.selectedClientId, { force: true });
        this.render();
      });
    }
    if (E.clientStatementExportPdfBtn) {
      E.clientStatementExportPdfBtn.addEventListener('click', () => this.previewStatementPdf());
    }
    if (E.clientStatementPreviewCloseBtn) {
      E.clientStatementPreviewCloseBtn.addEventListener('click', () => this.closeStatementPreviewModal());
    }
    if (E.clientStatementPreviewExportPdfBtn) {
      E.clientStatementPreviewExportPdfBtn.addEventListener('click', () => this.exportStatementPdf());
    }
    if (E.clientStatementPreviewModal) {
      E.clientStatementPreviewModal.addEventListener('click', event => {
        if (event.target === E.clientStatementPreviewModal) this.closeStatementPreviewModal();
      });
    }
    if (E.clientRenewalsApplyFiltersBtn) {
      E.clientRenewalsApplyFiltersBtn.addEventListener('click', async () => {
        this.state.renewalsFilters = { dateFrom: E.clientRenewalsDateFrom?.value || '', dateTo: E.clientRenewalsDateTo?.value || '' };
        if (this.state.selectedClientId) await this.loadClientDetailData_(this.state.selectedClientId, { force: true });
        this.render();
      });
    }
    if (E.clientRenewalsResetFiltersBtn) {
      E.clientRenewalsResetFiltersBtn.addEventListener('click', async () => {
        this.state.renewalsFilters = { dateFrom: '', dateTo: '' };
        if (E.clientRenewalsDateFrom) E.clientRenewalsDateFrom.value = '';
        if (E.clientRenewalsDateTo) E.clientRenewalsDateTo.value = '';
        if (this.state.selectedClientId) await this.loadClientDetailData_(this.state.selectedClientId, { force: true });
        this.render();
      });
    }
    if (E.clientsCreateBtn) E.clientsCreateBtn.addEventListener('click', () => this.openNewClientModal());
    if (E.newClientCloseBtn) E.newClientCloseBtn.addEventListener('click', () => this.closeNewClientModal());
    if (E.newClientCancelBtn) E.newClientCancelBtn.addEventListener('click', () => this.closeNewClientModal());
    if (E.newClientModal) {
      E.newClientModal.addEventListener('click', event => {
        if (event.target === E.newClientModal) this.closeNewClientModal();
      });
    }
    if (E.newClientForm) {
      E.newClientForm.addEventListener('submit', async event => {
        event.preventDefault();
        const payload = this.collectNewClientFormData();
        if (!payload?.customer_name) {
          UI.toast('Company Name is required.');
          return;
        }
        try {
          const response = await Api.createClientFromPayload(payload);
          const created = response?.client || response?.data?.client || payload;
          this.state.rows.unshift(this.normalizeClient(created));
          this.state.selectedClientId = this.state.rows[0]?.client_id || this.state.selectedClientId;
          this.closeNewClientModal();
          this.render();
          UI.toast('Client created successfully.');
        } catch (error) {
          UI.toast(error?.message || 'Failed to create client.');
        }
      });
    }
    if (E.clientActionProposalBtn) E.clientActionProposalBtn.addEventListener('click', () => this.runClientAction('proposal'));
    if (E.clientActionAgreementBtn) E.clientActionAgreementBtn.addEventListener('click', () => this.runClientAction('agreement'));
    if (E.clientActionInvoiceBtn) E.clientActionInvoiceBtn.addEventListener('click', () => this.runClientAction('invoice'));
    if (E.clientActionCloneBtn) E.clientActionCloneBtn.addEventListener('click', () => this.runClientAction('clone'));
    if (E.clientsDetailPanel) {
      E.clientsDetailPanel.addEventListener('click', event => {
        const agreementBtn = event.target?.closest?.('[data-agreement-view]');
        if (agreementBtn) {
          const id = agreementBtn.getAttribute('data-agreement-view');
          if (typeof setActiveView === 'function') setActiveView('agreements');
          if (id && window.Agreements?.openAgreementFormById) window.Agreements.openAgreementFormById(id, { readOnly: true });
          return;
        }
        const invoiceBtn = event.target?.closest?.('[data-invoice-view]');
        if (invoiceBtn) {
          const id = invoiceBtn.getAttribute('data-invoice-view');
          if (typeof setActiveView === 'function') setActiveView('invoices');
          if (id && window.Invoices?.openInvoiceById) window.Invoices.openInvoiceById(id, { readOnly: true });
          return;
        }
        const receiptBtn = event.target?.closest?.('[data-receipt-view]');
        if (receiptBtn) {
          const id = receiptBtn.getAttribute('data-receipt-view');
          if (typeof setActiveView === 'function') setActiveView('receipts');
          if (id && window.Receipts?.openReceiptById) window.Receipts.openReceiptById(id, { readOnly: true });
        }
      });
    }
  }
};

window.Clients = Clients;
