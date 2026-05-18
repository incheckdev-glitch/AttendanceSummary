const ClientsService = {
  CLIENT_COLUMNS: new Set([
    'client_id','client_name','company_name','primary_email','primary_phone','billing_frequency','payment_term',
    'status','source_agreement_id','total_agreements','total_locations','total_value','total_paid','total_due','created_by','updated_by'
  ]),
  AGREEMENT_SELECT_COLUMNS: '*',
  getDb() {
    const db = window.SupabaseClient?.getClient?.();
    if (!db || typeof db.from !== 'function') {
      throw new Error('Supabase client is not available.');
    }
    return db;
  },
  friendlyError(prefix, error) {
    return new Error(`${prefix}: ${error?.message || 'Unknown error'}`);
  },
  toNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  },
  normalizeText(value) { return String(value || '').trim().toLowerCase(); },
  normalizeMatchValue(value) {
    return String(value || '').trim().toLowerCase().replace(/s\.?a\.?l\.?/gi, 'sal').replace(/\s+/g, ' ');
  },
  compactValues(values = []) {
    return values.filter(value => String(value || '').trim());
  },
  valuesMatch(a, b) {
    const left = this.normalizeMatchValue(a);
    const right = this.normalizeMatchValue(b);
    return Boolean(left && right && left === right);
  },
  getClientCanonicalNames_(input = {}) {
    const legalName = String(input.company_name || input.companyName || input.customer_legal_name || input.customerLegalName || '').trim();
    const companyName = String(input.client_name || input.clientName || input.customer_name || input.customerName || '').trim();
    return { legalName, companyName };
  },
  clientPayloadMatchesIdentity_(row = {}, input = {}) {
    const incomingClientId = String(input.client_id || input.clientId || '').trim();
    const incomingCompanyId = String(input.company_id || input.companyId || '').trim();
    if (incomingClientId && String(row.client_id || '').trim() === incomingClientId) return true;
    if (incomingCompanyId && String(row.company_id || row.companyId || '').trim() === incomingCompanyId) return true;
    const names = this.getClientCanonicalNames_(input);
    const legalKey = this.normalizeCompanyKey(names.legalName);
    const companyKey = this.normalizeCompanyKey(names.companyName);
    const rowLegalKey = this.normalizeCompanyKey(row.company_name || row.customer_legal_name || row.legal_name || '');
    const rowCompanyKey = this.normalizeCompanyKey(row.client_name || row.customer_name || row.company_name || '');
    return Boolean((legalKey && (legalKey === rowLegalKey || legalKey === rowCompanyKey)) || (companyKey && (companyKey === rowLegalKey || companyKey === rowCompanyKey)));
  },
  async findExistingClientForCreate_(input = {}) {
    const db = this.getDb();
    const payload = this.sanitizeClientPayload(input, { includeCreatedBy: false });
    const directClientId = String(payload.client_id || '').trim();
    if (directClientId) {
      const { data, error } = await db.from('clients').select('*').eq('client_id', directClientId).maybeSingle();
      if (!error && data) return this.mapDbClientToUi(data);
    }
    const sourceAgreementId = String(payload.source_agreement_id || '').trim();
    if (sourceAgreementId) {
      const { data, error } = await db.from('clients').select('*').eq('source_agreement_id', sourceAgreementId).limit(1);
      if (!error && Array.isArray(data) && data[0]) return this.mapDbClientToUi(data[0]);
    }
    const names = this.getClientCanonicalNames_(input);
    const candidateNames = [names.legalName, names.companyName].map(value => String(value || '').trim()).filter(Boolean);
    for (const name of candidateNames) {
      const { data, error } = await db
        .from('clients')
        .select('*')
        .or(`company_name.ilike.%${name.replace(/[%*,]/g, '')}%,client_name.ilike.%${name.replace(/[%*,]/g, '')}%`)
        .limit(25);
      if (error) continue;
      const match = (Array.isArray(data) ? data : []).find(row => this.clientPayloadMatchesIdentity_(row, input));
      if (match) return this.mapDbClientToUi(match);
    }
    return null;
  },
  normalizeAgreementForClient(agreement = {}) {
    const normalized = {
      ...agreement,
      client_name:
        agreement.client_name ||
        agreement.customer_name ||
        agreement.customer_legal_name ||
        agreement.provider_name ||
        '',
      client_email:
        agreement.client_email ||
        agreement.customer_contact_email ||
        '',
      client_phone:
        agreement.client_phone ||
        agreement.customer_contact_mobile ||
        '',
      number_of_locations:
        agreement.number_of_locations ||
        agreement.locations_count ||
        agreement.location_count ||
        agreement.subtotal_locations ||
        '',
      payment_terms:
        agreement.payment_terms ||
        agreement.payment_term ||
        '',
      payment_term:
        agreement.payment_term ||
        agreement.payment_terms ||
        '',
      service_start_date:
        agreement.service_start_date ||
        agreement.effective_date ||
        agreement.agreement_date ||
        '',
      service_end_date:
        agreement.service_end_date ||
        '',
      total_value:
        agreement.total_value ||
        agreement.grand_total ||
        agreement.subtotal_locations ||
        0
    };
    return normalized;
  },
  getClientKeys(client = {}) {
    return this.compactValues([
      client.client_id,
      client.id,
      client.client_name,
      client.company_name,
      client.customer_name,
      client.customer_legal_name,
      client.name,
      client.primary_email,
      client.email,
      client.client_email,
      client.primary_phone,
      client.phone,
      client.mobile
    ]);
  },
  getAgreementKeys(agreement = {}) {
    const normalized = this.normalizeAgreementForClient(agreement);
    return this.compactValues([
      agreement.id,
      agreement.agreement_id,
      agreement.agreement_number,
      normalized.client_name,
      normalized.client_email,
      normalized.client_phone,
      agreement.customer_name,
      agreement.customer_contact_email,
      agreement.customer_contact_mobile
    ]);
  },
  agreementBelongsToClient(agreement = {}, client = {}) {
    const agreementKeys = this.getAgreementKeys(agreement);
    const clientKeys = this.getClientKeys(client);
    return agreementKeys.some(agreementKey => clientKeys.some(clientKey => this.valuesMatch(agreementKey, clientKey)));
  },
  invoiceBelongsToClient(invoice = {}, client = {}, relatedAgreements = []) {
    const clientKeys = this.getClientKeys(client);
    const invoiceClientKeys = this.compactValues([
      invoice.client_id, invoice.customer_id, invoice.company_id, invoice.client_name, invoice.customer_name, invoice.company_name,
      invoice.email, invoice.client_email, invoice.customer_contact_email, invoice.customer_contact_mobile, invoice.phone, invoice.client_phone
    ]);
    const directMatch = invoiceClientKeys.some(invoiceKey => clientKeys.some(clientKey => this.valuesMatch(invoiceKey, clientKey)));
    if (directMatch) return true;
    return relatedAgreements.some(agreement =>
      this.valuesMatch(invoice.agreement_id, agreement.id) ||
      this.valuesMatch(invoice.agreement_id, agreement.agreement_id) ||
      this.valuesMatch(invoice.agreement_number, agreement.agreement_number) ||
      this.valuesMatch(invoice.source_agreement_id, agreement.id) ||
      this.valuesMatch(invoice.source_agreement_id, agreement.agreement_id) ||
      this.valuesMatch(invoice.source_agreement_number, agreement.agreement_number) ||
      this.valuesMatch(invoice.proposal_id, agreement.proposal_id)
    );
  },
  receiptBelongsToClient(receipt = {}, client = {}, relatedAgreements = [], relatedInvoices = []) {
    const clientKeys = this.getClientKeys(client);
    const receiptClientKeys = this.compactValues([
      receipt.client_id, receipt.customer_id, receipt.company_id, receipt.client_name, receipt.customer_name, receipt.company_name,
      receipt.email, receipt.client_email, receipt.customer_contact_email, receipt.phone, receipt.client_phone
    ]);
    const directMatch = receiptClientKeys.some(receiptKey => clientKeys.some(clientKey => this.valuesMatch(receiptKey, clientKey)));
    if (directMatch) return true;
    const invoiceMatch = relatedInvoices.some(invoice =>
      this.valuesMatch(receipt.invoice_id, invoice.id) ||
      this.valuesMatch(receipt.invoice_id, invoice.invoice_id) ||
      this.valuesMatch(receipt.invoice_number, invoice.invoice_number)
    );
    if (invoiceMatch) return true;
    return relatedAgreements.some(agreement =>
      this.valuesMatch(receipt.agreement_id, agreement.id) ||
      this.valuesMatch(receipt.agreement_id, agreement.agreement_id) ||
      this.valuesMatch(receipt.agreement_number, agreement.agreement_number)
    );
  },
  isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(String(value || '').trim());
  },
  normalizeCompanyKey(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/s\.?a\.?l\.?/gi, 'sal')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(inc|llc|ltd|co|corp|corporation|company|the)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },
  getCurrentUserId() { return String(window.Session?.userId?.() || '').trim(); },
  mapDbClientToUi(row = {}) {
    const clientName = String(row.client_name || '').trim();
    const companyName = String(row.company_name || '').trim();
    return {
      ...row,
      id: String(row.id || '').trim(),
      client_id: String(row.client_id || '').trim(),
      client_name: clientName,
      company_name: companyName,
      primary_email: String(row.primary_email || '').trim(),
      primary_phone: String(row.primary_phone || '').trim(),
      billing_frequency: String(row.billing_frequency || '').trim(),
      payment_term: String(row.payment_term || '').trim(),
      status: String(row.status || 'Active').trim(),
      source_agreement_id: String(row.source_agreement_id || '').trim(),
      total_agreements: this.toNumber(row.total_agreements),
      total_locations: this.toNumber(row.total_locations),
      total_value: this.toNumber(row.total_value),
      total_paid: this.toNumber(row.total_paid),
      total_due: this.toNumber(row.total_due),
      customer_name: clientName,
      customer_legal_name: companyName,
      primary_contact_email: String(row.primary_email || '').trim(),
      phone: String(row.primary_phone || '').trim()
    };
  },
  mapAgreementRow(row = {}) {
    return {
      id: String(row.id || '').trim(),
      agreement_id: String(row.agreement_id || '').trim(),
      agreement_number: String(row.agreement_number || '').trim(),
      client_name: String(row.client_name || row.customer_name || row.customer_legal_name || '').trim(),
      client_email: String(row.client_email || row.customer_contact_email || '').trim(),
      client_phone: String(row.client_phone || row.customer_contact_mobile || '').trim(),
      customer_name: String(row.customer_name || '').trim(),
      customer_legal_name: String(row.customer_legal_name || '').trim(),
      customer_contact_email: String(row.customer_contact_email || '').trim(),
      customer_contact_mobile: String(row.customer_contact_mobile || '').trim(),
      status: String(row.status || '').trim(),
      grand_total: this.toNumber(row.grand_total),
      currency: String(row.currency || '').trim() || 'USD',
      updated_at: String(row.updated_at || '').trim(),
      service_start_date: String(row.service_start_date || '').trim(),
      service_end_date: String(row.service_end_date || '').trim(),
      agreement_date: String(row.agreement_date || '').trim(),
      customer_sign_date: String(row.customer_sign_date || '').trim(),
      billing_frequency: String(row.billing_frequency || '').trim(),
      payment_term: String(row.payment_term || '').trim(),
      subtotal_locations: this.toNumber(row.subtotal_locations),
      contract_term: String(row.contract_term || '').trim(),
      effective_date: String(row.effective_date || '').trim()
    };
  },
  sanitizeClientPayload(input = {}, { includeCreatedBy = false } = {}) {
    const payload = {
      client_id: input.client_id || input.clientId,
      client_name: input.client_name || input.clientName || input.customer_name || input.customerName,
      company_name: input.company_name || input.companyName || input.customer_legal_name || input.customerLegalName,
      primary_email: input.primary_email || input.primaryEmail || input.primary_contact_email || input.primaryContactEmail,
      primary_phone: input.primary_phone || input.primaryPhone || input.phone,
      billing_frequency: input.billing_frequency || input.billingFrequency,
      payment_term: input.payment_term || input.paymentTerm || input.payment_terms,
      status: input.status,
      source_agreement_id: input.source_agreement_id || input.sourceAgreementId,
      total_agreements: input.total_agreements ?? input.totalAgreements,
      total_locations: input.total_locations ?? input.totalLocations,
      total_value: input.total_value ?? input.totalValue,
      total_paid: input.total_paid ?? input.totalPaid,
      total_due: input.total_due ?? input.totalDue
    };
    const cleaned = {};
    Object.entries(payload).forEach(([key, value]) => {
      if (!this.CLIENT_COLUMNS.has(key) || value === undefined || value === null || value === '') return;
      cleaned[key] = key.startsWith('total_') ? this.toNumber(value) : String(value).trim();
    });
    const userId = this.getCurrentUserId();
    if (includeCreatedBy && userId) cleaned.created_by = userId;
    if (userId) cleaned.updated_by = userId;
    ['source_agreement_id', 'created_by', 'updated_by'].forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(cleaned, key)) return;
      const normalized = String(cleaned[key] || '').trim();
      if (!normalized || !this.isUuid(normalized)) delete cleaned[key];
      else cleaned[key] = normalized;
    });
    return cleaned;
  },
  attachAgreementItems(agreements = [], agreementItems = []) {
    const byAgreementId = new Map();
    agreementItems.forEach(item => {
      const key = String(item.agreement_id || '').trim();
      if (!key) return;
      if (!byAgreementId.has(key)) byAgreementId.set(key, []);
      byAgreementId.get(key).push(item);
    });
    return agreements.map(agreement => {
      const items = byAgreementId.get(String(agreement.id || '').trim()) || [];
      return {
        ...agreement,
        items,
        location_name: String(items.find(item => String(item.location_name || '').trim())?.location_name || '').trim()
      };
    });
  },
  isSignedAgreement(agreement = {}) {
    return this.normalizeText(agreement.status).includes('signed') || Boolean(String(agreement.signed_date || agreement.customer_sign_date || '').trim());
  },
  buildSignedClientFromAgreement(agreement = {}) {
    const companyName = String(agreement.customer_legal_name || agreement.customer_name || '').trim();
    const displayName = String(agreement.customer_name || agreement.customer_legal_name || '').trim();
    const totalValue = this.toNumber(agreement.grand_total);
    return {
      client_name: displayName,
      company_name: companyName,
      primary_email: String(agreement.customer_contact_email || '').trim(),
      primary_phone: String(agreement.customer_contact_mobile || '').trim(),
      billing_frequency: String(agreement.billing_frequency || '').trim(),
      payment_term: String(agreement.payment_term || '').trim(),
      source_agreement_id: String(agreement.id || agreement.agreement_id || '').trim(),
      status: 'Signed',
      total_agreements: 1,
      total_value: totalValue,
      total_paid: 0,
      total_due: totalValue
    };
  },
  mergeSignedClient(existing = {}, incoming = {}) {
    const merge = (a, b) => {
      const value = String(b || '').trim();
      return value || String(a || '').trim();
    };
    const sameAgreement = String(existing.source_agreement_id || '').trim() === String(incoming.source_agreement_id || '').trim();
    const existingTotalValue = this.toNumber(existing.total_value);
    const existingTotalAgreements = this.toNumber(existing.total_agreements);
    return {
      client_name: merge(existing.client_name, incoming.client_name),
      company_name: merge(existing.company_name, incoming.company_name),
      primary_email: merge(existing.primary_email, incoming.primary_email),
      primary_phone: merge(existing.primary_phone, incoming.primary_phone),
      billing_frequency: merge(existing.billing_frequency, incoming.billing_frequency),
      payment_term: merge(existing.payment_term, incoming.payment_term),
      source_agreement_id: incoming.source_agreement_id || existing.source_agreement_id,
      status: merge(existing.status, incoming.status) || 'Signed',
      total_agreements: sameAgreement ? existingTotalAgreements : existingTotalAgreements + 1,
      total_value: sameAgreement ? existingTotalValue : existingTotalValue + this.toNumber(incoming.total_value),
      total_paid: this.toNumber(existing.total_paid),
      total_due: Math.max((sameAgreement ? existingTotalValue : existingTotalValue + this.toNumber(incoming.total_value)) - this.toNumber(existing.total_paid), 0)
    };
  },
  findMatchingClientForAgreement(agreement = {}, clients = []) {
    const agreementUuid = String(agreement.id || '').trim();
    const agreementBusinessId = String(agreement.agreement_id || '').trim();
    const email = this.normalizeText(agreement.customer_contact_email);
    const company = this.normalizeCompanyKey(agreement.customer_legal_name || agreement.customer_name);
    return clients.find(client => {
      const source = String(client.source_agreement_id || '').trim();
      if (source && (source === agreementUuid || source === agreementBusinessId)) return true;
      const clientEmail = this.normalizeText(client.primary_email);
      if (email && clientEmail && clientEmail === email) return true;
      const clientCompany = this.normalizeCompanyKey(client.company_name || client.client_name);
      return company && clientCompany && clientCompany === company;
    }) || null;
  },
  async syncSignedAgreementsToClients(agreements = [], baseClients = []) {
    const signedAgreements = agreements.filter(row => this.isSignedAgreement(row));
    if (!signedAgreements.length) return baseClients;
    const clients = Array.isArray(baseClients) ? [...baseClients] : [];
    for (const agreement of signedAgreements) {
      const signedPayload = this.buildSignedClientFromAgreement(agreement);
      if (!signedPayload.source_agreement_id) continue;
      const existing = this.findMatchingClientForAgreement(agreement, clients);
      const existingUuid = String(existing?.id || '').trim();
      if (existingUuid) {
        const mergedPayload = this.mergeSignedClient(existing, signedPayload);
        const updated = await this.updateClient(existingUuid, mergedPayload, { softFail: true });
        const index = clients.findIndex(row => String(row.id || '').trim() === existingUuid);
        if (index >= 0 && updated) clients[index] = updated;
        continue;
      }
      const created = await this.createClient(signedPayload);
      clients.push(created);
    }
    return clients;
  },
  countLocationItems(agreement = {}) {
    const items = Array.isArray(agreement.items) ? agreement.items : [];
    return items.filter(item => this.isAnnualSaasClientLocationItem(item)).length;
  },
  isAnnualSaasClientLocationItem(item = {}) {
    const text = this.normalizeText([
      item.section,
      item.category,
      item.type,
      item.section_name,
      item.section_label,
      item.item_type,
      item.item_name,
      item.itemName,
      item.product_name,
      item.productName,
      item.service_name,
      item.serviceName,
      item.module,
      item.module_name,
      item.moduleName,
      item.description,
      item.billing_frequency,
      item.billingFrequency,
      item.billing_cycle,
      item.billingCycle,
      item.frequency
    ].filter(Boolean).join(' '));
    if (!text) return false;

    const isOneTimeOrSetup = ['one_time_fee', 'one_time', 'one time', 'one-time', 'setup', 'implementation', 'onboarding'].some(
      token => text.includes(token)
    );
    if (isOneTimeOrSetup) return false;

    const isSaasFamily = ['annual_saas', 'saas', 'subscription', 'recurring'].some(token => text.includes(token));
    if (!isSaasFamily) return false;

    return ['annual', 'yearly', '12 month', '12-month', 'year', 'renewal'].some(token => text.includes(token));
  },
  async fetchAgreementItemsForClients_(db) {
    // temporary analytics fallback - replace with SQL view/RPC aggregation
    return db
      .from('agreement_items')
      .select('*')
      .limit(5000);
  },
  coerceLinkedRows_(res, label) {
    if (!res) return [];
    if (res.error) {
      console.warn(`[ClientsService] ${label} query failed; continuing with empty data.`, res.error);
      return [];
    }
    return Array.isArray(res.data) ? res.data : [];
  },
  matchAgreementClient(agreement = {}, client = {}) {
    const sourceAgreement = String(client.source_agreement_id || '').trim();
    if (sourceAgreement) {
      const agreementUuid = String(agreement.id || '').trim();
      const agreementBusinessId = String(agreement.agreement_id || '').trim();
      if (agreementUuid && agreementUuid === sourceAgreement) return true;
      if (agreementBusinessId && agreementBusinessId === sourceAgreement) return true;
    }
    return this.agreementBelongsToClient(agreement, client);
  },
  isRenewalInvoice_(invoice = {}) {
    return Boolean(
      invoice?.is_renewal
      || String(invoice?.invoice_type || '').trim().toLowerCase() === 'renewal'
      || String(invoice?.source_type || '').trim().toLowerCase() === 'renewal'
      || String(invoice?.renewal_batch_id || '').trim()
    );
  },
  isVoidInvoice_(invoice = {}) {
    const status = String(invoice?.status || invoice?.payment_state || invoice?.payment_status || '').trim().toLowerCase();
    return ['void', 'voided', 'cancelled', 'canceled', 'failed', 'error'].includes(status);
  },
  renewalInvoiceDedupeKey_(invoice = {}) {
    const explicit = String(invoice.renewal_batch_id || '').trim();
    if (explicit) return `batch:${explicit}`;
    const clientKey = String(invoice.client_id || invoice.company_id || invoice.customer_legal_name || invoice.customer_name || invoice.company_name || '').trim().toLowerCase();
    const agreementKey = String(invoice.agreement_id || invoice.agreement_number || invoice.renewed_from_agreement_id || '').trim().toLowerCase();
    const periodKey = [invoice.renewal_due_date, invoice.due_date, invoice.issue_date].map(value => String(value || '').trim()).filter(Boolean).join(':');
    const totalKey = String(this.toNumber(invoice.invoice_total ?? invoice.grand_total));
    return [clientKey, agreementKey, periodKey, totalKey].filter(Boolean).join('|');
  },
  dedupeRenewalInvoicesForTotals_(invoices = []) {
    const output = [];
    const seenRenewalDrafts = new Map();
    invoices.forEach(invoice => {
      if (!this.isRenewalInvoice_(invoice)) {
        output.push(invoice);
        return;
      }
      if (this.isVoidInvoice_(invoice)) return;
      const status = String(invoice.status || '').trim().toLowerCase();
      const isDraft = !status || status === 'draft';
      if (!isDraft) {
        output.push(invoice);
        return;
      }
      const key = this.renewalInvoiceDedupeKey_(invoice);
      if (!key) {
        output.push(invoice);
        return;
      }
      const current = seenRenewalDrafts.get(key);
      const invoiceTime = new Date(invoice.updated_at || invoice.created_at || 0).getTime() || 0;
      const currentTime = current ? (new Date(current.updated_at || current.created_at || 0).getTime() || 0) : -1;
      if (!current || invoiceTime >= currentTime) seenRenewalDrafts.set(key, invoice);
    });
    return output.concat([...seenRenewalDrafts.values()]);
  },
  computeTotalsForClient(client = {}, agreements = [], invoices = [], receipts = [], agreementItems = []) {
    const linkedAgreements = agreements.filter(row => this.matchAgreementClient(row, client));
    const linkedAgreementKeys = linkedAgreements
      .flatMap(row => [row.id, row.agreement_id, row.agreement_number])
      .map(value => String(value || '').trim())
      .filter(Boolean);
    const linkedAgreementItems = agreementItems.filter(item => {
      const itemKeys = [
        item.agreement_id,
        item.agreement_number,
        item.parent_agreement_id,
        item.parent_agreement_number,
        item.source_agreement_id,
        item.source_agreement_number
      ]
        .map(value => String(value || '').trim())
        .filter(Boolean);
      return itemKeys.some(itemKey => linkedAgreementKeys.some(agreementKey => this.valuesMatch(itemKey, agreementKey)));
    });
    const linkedInvoices = this.dedupeRenewalInvoicesForTotals_(invoices.filter(row => this.invoiceBelongsToClient(row, client, linkedAgreements)));
    const linkedReceipts = receipts.filter(row => this.receiptBelongsToClient(row, client, linkedAgreements, linkedInvoices));

    const totalAgreements = linkedAgreements.length;
    const totalLocations = linkedAgreementItems.filter(item => this.isAnnualSaasClientLocationItem(item)).length;
    const totalValue = linkedAgreements.reduce((sum, agreement) => sum + this.toNumber(agreement.grand_total), 0);
    const totalInvoiced = linkedInvoices.reduce((sum, invoice) => sum + this.toNumber(invoice.invoice_total ?? invoice.grand_total), 0);
    const totalPaidFromReceipts = linkedReceipts.reduce((sum, receipt) => sum + this.toNumber(receipt.amount_received ?? receipt.amount_paid ?? receipt.paid_amount), 0);
    const fallbackInvoicePaid = linkedReceipts.length ? 0 : linkedInvoices.reduce((sum, invoice) => sum + this.toNumber(invoice.amount_paid ?? invoice.received_amount), 0);
    const totalPaid = totalPaidFromReceipts + fallbackInvoicePaid;
    const totalDue = Math.max(totalInvoiced - totalPaid, 0);

    return {
      total_agreements: totalAgreements,
      total_locations: totalLocations,
      total_value: totalValue,
      total_paid: totalPaid,
      total_due: totalDue
    };
  },
  async listClients({ page = 1, limit = 50, search = '', status = '' } = {}) {
    const db = this.getDb();
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    const safePage = Math.max(1, Number(page) || 1);
    const from = Math.max(0, (safePage - 1) * safeLimit);
    const to = from + safeLimit;
    let query = db.from('clients').select('*').order('updated_at', { ascending: false }).range(from, to);
    if (search) query = query.or(`client_id.ilike.%${search}%,client_name.ilike.%${search}%,company_name.ilike.%${search}%,primary_email.ilike.%${search}%`);
    if (status && status !== 'All') query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw this.friendlyError('Unable to load clients', error);
    const fetchedRows = Array.isArray(data) ? data : [];
    const hasMore = fetchedRows.length > safeLimit;
    const rows = fetchedRows.slice(0, safeLimit).map(row => this.mapDbClientToUi(row));
    return { rows, total: from + rows.length + (hasMore ? 1 : 0), returned: rows.length, page: safePage, limit: safeLimit, offset: from, hasMore };
  },
  async getClient(clientIdOrUuid) {
    const id = String(clientIdOrUuid || '').trim();
    if (!id) throw new Error('Client id is required.');
    const db = this.getDb();
    const query = db.from('clients').select('*');
    const { data, error } = (id.includes('-') ? await query.eq('id', id).maybeSingle() : await query.eq('client_id', id).maybeSingle());
    if (error) throw this.friendlyError('Unable to load client', error);
    if (!data) throw new Error('Client not found.');
    return this.mapDbClientToUi(data);
  },
  async createClient(input = {}) {
    const db = this.getDb();
    const payload = this.sanitizeClientPayload(input, { includeCreatedBy: true });
    const existing = await this.findExistingClientForCreate_(input);
    if (existing?.id) {
      const updated = await this.updateClient(existing.id, payload, { softFail: true });
      return updated || existing;
    }
    const { data, error } = await db.from('clients').insert(payload).select('*').single();
    if (error) throw this.friendlyError('Unable to create client', error);
    const mapped = this.mapDbClientToUi(data);
    this.refreshCompanyLifecycleStatus(mapped);
    return mapped;
  },
  isClientUpdateNoRowOrPermissionError_(error) {
    const text = String(error?.message || error?.details || error?.hint || error || '').toLowerCase();
    return text.includes('cannot coerce the result to a single json object')
      || text.includes('row-level security')
      || text.includes('violates row-level security')
      || text.includes('permission denied')
      || text.includes('not authorized')
      || text.includes('forbidden');
  },
  async updateClient(clientUuid, updates = {}, options = {}) {
    const id = String(clientUuid || '').trim();
    if (!id) throw new Error('Client UUID is required for update.');
    const db = this.getDb();
    const payload = this.sanitizeClientPayload(updates, { includeCreatedBy: false });
    const { data, error } = await db.from('clients').update(payload).eq('id', id).select('*').maybeSingle();
    if (error) {
      if (this.isClientUpdateNoRowOrPermissionError_(error)) {
        if (options?.softFail === true) {
          console.warn('[ClientsService] client update skipped by RLS/permission policy', { id, error });
          return null;
        }
        throw new Error('You do not have permission to update this client.');
      }
      if (options?.softFail === true) {
        console.warn('[ClientsService] client update skipped after backend error', { id, error });
        return null;
      }
      throw this.friendlyError('Unable to update client', error);
    }
    if (!data) {
      if (options?.softFail === true) {
        console.warn('[ClientsService] client update skipped because no editable row was returned', { id });
        return null;
      }
      throw new Error('You do not have permission to update this client, or the client no longer exists.');
    }
    const mapped = this.mapDbClientToUi(data);
    this.refreshCompanyLifecycleStatus(mapped);
    return mapped;
  },
  refreshCompanyLifecycleStatus(client = {}) {
    const status = String(client?.status || client?.account_status || '').trim().toLowerCase();
    if (status && !status.includes('active') && !status.includes('live')) return;
    const companyName = String(client?.company_name || client?.customer_legal_name || client?.client_name || '').trim();
    if (!companyName) return;
    window.Companies?.refreshCompanyLifecycleStatusByName?.(companyName, { stage: 'Active Client' }).catch(error => {
      console.error('[clients] company lifecycle refresh failed', error);
      UI?.toast?.('Client saved, but company lifecycle status could not be refreshed');
    });
  },
  async deleteClient(clientUuid) {
    const id = String(clientUuid || '').trim();
    if (!id) throw new Error('Client UUID is required for delete.');
    const db = this.getDb();
    const { error } = await db.from('clients').delete().eq('id', id);
    if (error) throw this.friendlyError('Unable to delete client', error);
    return { ok: true };
  },
  async getDashboardData(options = {}) {
    const db = this.getDb();
    const analyticsLimit = Math.max(1000, Math.min(5000, Number(options.analyticsLimit) || 5000));
    const canViewRenewals = Boolean(window.Permissions?.canViewClientRenewals?.());
    // temporary analytics fallback - replace with SQL view/RPC aggregation
    let agreementRows = [];
    let itemRows = [];
    let invoiceRows = [];
    let invoiceItemRows = [];
    let receiptRows = [];
    let receiptItemRows = [];
    const [agreementsRes, itemsRes] = await Promise.all([
      db.from('agreements').select(this.AGREEMENT_SELECT_COLUMNS).order('updated_at', { ascending: false }).limit(analyticsLimit),
      this.fetchAgreementItemsForClients_(db)
    ]);
    if (agreementsRes.error) throw this.friendlyError('Unable to load agreements for clients', agreementsRes.error);
    agreementRows = this.coerceLinkedRows_(agreementsRes, 'agreements');
    console.log('[AgreementMapping] loaded agreements', agreementRows.length);
    itemRows = this.coerceLinkedRows_(itemsRes, 'agreement_items');
    console.log('[ClientsService] agreement_items count', itemRows.length, itemRows.slice(0, 5));
    if (canViewRenewals) {
      // Client profile renewals timeline is controlled by clients:view_renewals, not agreements:view.
      const [invoicesRes, invoiceItemsRes, receiptsRes, receiptItemsRes] = await Promise.all([
        db.from('invoices').select('*').order('updated_at', { ascending: false }).limit(analyticsLimit),
        db.from('invoice_items').select('*').limit(analyticsLimit),
        db.from('receipts').select('*').order('updated_at', { ascending: false }).limit(analyticsLimit),
        db.from('receipt_items').select('*').limit(analyticsLimit)
      ]);
      invoiceRows = this.coerceLinkedRows_(invoicesRes, 'invoices');
      invoiceItemRows = this.coerceLinkedRows_(invoiceItemsRes, 'invoice_items');
      receiptRows = this.coerceLinkedRows_(receiptsRes, 'receipts');
      receiptItemRows = this.coerceLinkedRows_(receiptItemsRes, 'receipt_items');
    }

    const agreements = this.attachAgreementItems(agreementRows.map(row => this.mapAgreementRow(row)), itemRows);
    const invoices = invoiceRows;
    const receipts = receiptRows;
    const clientsList = await this.listClients(options);
    const allowClientMutations = options.allowClientMutations !== undefined
      ? Boolean(options.allowClientMutations)
      : Boolean(window.Permissions?.canEdit?.('clients'));
    const syncedClients = allowClientMutations
      ? await this.syncSignedAgreementsToClients(agreements, clientsList.rows || [])
      : (clientsList.rows || []);
    const clients = syncedClients.map(clientRow => {
      const totals = this.computeTotalsForClient(clientRow, agreements, invoices, receipts, itemRows);
      return { ...clientRow, ...totals };
    });
    const updates = clients
      .filter(row => String(row.id || '').trim())
      .map(row => {
        const persisted = (clientsList.rows || []).find(source => String(source.id || '').trim() === String(row.id || '').trim()) || {};
        const next = {
          total_agreements: this.toNumber(row.total_agreements),
          total_locations: this.toNumber(row.total_locations),
          total_value: this.toNumber(row.total_value),
          total_paid: this.toNumber(row.total_paid),
          total_due: this.toNumber(row.total_due)
        };
        const unchanged = Object.keys(next).every(key => this.toNumber(persisted[key]) === next[key]);
        return unchanged ? null : { id: row.id, ...next };
      })
      .filter(Boolean);
    if (allowClientMutations && updates.length) {
      const persistedUpdates = await Promise.all(
        updates.map(update =>
          db
            .from('clients')
            .update({
              total_agreements: update.total_agreements,
              total_locations: update.total_locations,
              total_value: update.total_value,
              total_paid: update.total_paid,
              total_due: update.total_due
            })
            .eq('id', update.id)
        )
      );
      const failedUpdate = persistedUpdates.find(result => result?.error);
      if (failedUpdate?.error) {
        console.warn('[ClientsService] client total persistence skipped by backend/RLS policy', failedUpdate.error);
      }
    }

    return { ...clientsList, rows: clients, agreements, agreement_items: itemRows, invoices, invoice_items: invoiceItemRows, receipts, receipt_items: receiptItemRows };
  }
};

window.ClientsService = ClientsService;
