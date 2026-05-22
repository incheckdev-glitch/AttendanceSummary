const ClientsService = {
  CLIENT_COLUMNS: new Set([
    'client_id','client_name','company_name','primary_email','primary_phone','billing_frequency','payment_term',
    'status','company_id','source_agreement_id','total_agreements','total_locations','total_value','total_paid','total_due','created_by','updated_by'
  ]),
  AGREEMENT_SELECT_COLUMNS: '*',
  companyLookup: { byId: new Map(), byName: new Map() },
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
    const source = agreement && typeof agreement === 'object' ? agreement : {};
    const normalized = {
      ...source,
      client_name:
        source.client_name ||
        source.customer_name ||
        source.customer_legal_name ||
        source.provider_name ||
        '',
      client_email:
        source.client_email ||
        source.customer_contact_email ||
        '',
      client_phone:
        source.client_phone ||
        source.customer_contact_mobile ||
        '',
      number_of_locations:
        source.number_of_locations ||
        source.locations_count ||
        source.location_count ||
        source.subtotal_locations ||
        '',
      payment_terms:
        source.payment_terms ||
        source.payment_term ||
        '',
      payment_term:
        source.payment_term ||
        source.payment_terms ||
        '',
      service_start_date:
        source.service_start_date ||
        source.effective_date ||
        source.agreement_date ||
        '',
      service_end_date:
        source.service_end_date ||
        '',
      total_value:
        source.total_value ||
        source.grand_total ||
        source.subtotal_locations ||
        0
    };
    return normalized;
  },
  getClientKeys(client = {}) {
    client = client && typeof client === 'object' ? client : {};
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
    agreement = agreement && typeof agreement === 'object' ? agreement : {};
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
  getClientCompanyId(client = {}) {
    return String(
      client.company_id ||
      client.companyId ||
      client.customer_company_id ||
      client.customerCompanyId ||
      client.client_company_id ||
      client.clientCompanyId ||
      ''
    ).trim();
  },
  getAgreementCompanyId(agreement = {}) {
    return String(
      agreement.company_id ||
      agreement.companyId ||
      agreement.customer_company_id ||
      agreement.customerCompanyId ||
      agreement.client_company_id ||
      agreement.clientCompanyId ||
      ''
    ).trim();
  },
  getClientLegalName(client = {}) {
    return String(client.customer_legal_name || client.company_name || client.customer_name || client.client_name || client.name || '').trim();
  },
  getAgreementLegalName(agreement = {}) {
    return String(agreement.customer_legal_name || agreement.company_name || agreement.customer_name || agreement.client_name || '').trim();
  },
  getCompanyIdKeys(company = {}) {
    return [company.id, company.company_id, company.company_uuid, company.uuid, company.companyId, company.companyUuid]
      .map(value => String(value || '').trim())
      .filter(Boolean);
  },
  getCompanyNameKeys(company = {}) {
    return [
      company.legal_company_name,
      company.legalCompanyName,
      company.legal_name,
      company.legalName,
      company.company_name,
      company.companyName,
      company.customer_name,
      company.customerName,
      company.client_name,
      company.clientName,
      company.name
    ].map(value => this.normalizeCompanyKey(value)).filter(Boolean);
  },
  rebuildCompanyLookupMaps(companies = []) {
    const byId = new Map();
    const byName = new Map();
    (Array.isArray(companies) ? companies : []).filter(Boolean).forEach(company => {
      this.getCompanyIdKeys(company).forEach(key => {
        if (!byId.has(key)) byId.set(key, company);
      });
      this.getCompanyNameKeys(company).forEach(key => {
        if (!byName.has(key)) byName.set(key, company);
      });
    });
    this.companyLookup = { byId, byName };
  },
  getRawCompanyIdValues_(record = {}) {
    const source = record && typeof record === 'object' ? record : {};
    return [
      source.company_id,
      source.companyId,
      source.company_uuid,
      source.companyUuid,
      source.customer_company_id,
      source.customerCompanyId,
      source.client_company_id,
      source.clientCompanyId
    ].map(value => String(value || '').trim()).filter(Boolean);
  },
  findCompanyForRecord_(record = {}) {
    const source = record && typeof record === 'object' ? record : {};
    const rawIds = this.getRawCompanyIdValues_(source);
    for (const id of rawIds) {
      const company = this.companyLookup?.byId?.get?.(id);
      if (company) return company;
    }
    const names = [
      source.customer_legal_name,
      source.customerLegalName,
      source.legal_name,
      source.legalName,
      source.company_name,
      source.companyName,
      source.customer_name,
      source.customerName,
      source.client_name,
      source.clientName,
      source.name
    ].map(value => this.normalizeCompanyKey(value)).filter(Boolean);
    for (const name of names) {
      const company = this.companyLookup?.byName?.get?.(name);
      if (company) return company;
    }
    return null;
  },
  getExpandedCompanyIdKeys_(record = {}) {
    const keys = new Set(this.getRawCompanyIdValues_(record));
    const company = this.findCompanyForRecord_(record);
    if (company) this.getCompanyIdKeys(company).forEach(key => keys.add(key));
    return keys;
  },
  companyKeySetsIntersect_(left = new Set(), right = new Set()) {
    for (const key of left) if (right.has(key)) return true;
    return false;
  },
  hasStrictClientOwnership(agreement = {}, client = {}) {
    const clientCompanyKeys = this.getExpandedCompanyIdKeys_(client);
    const agreementCompanyKeys = this.getExpandedCompanyIdKeys_(agreement);
    if (clientCompanyKeys.size || agreementCompanyKeys.size) {
      return Boolean(clientCompanyKeys.size && agreementCompanyKeys.size && this.companyKeySetsIntersect_(clientCompanyKeys, agreementCompanyKeys));
    }

    // Some imported/historical agreements still do not have company_id.
    // In that case only allow an exact normalized legal/company name match.
    // Never use email or partial text includes for client ownership.
    const agreementName = this.normalizeCompanyKey(this.getAgreementLegalName(agreement));
    const clientName = this.normalizeCompanyKey(this.getClientLegalName(client));
    return Boolean(agreementName && clientName && agreementName === clientName);
  },
  agreementBelongsToClient(agreement = {}, client = {}) {
    return this.hasStrictClientOwnership(agreement, client);
  },
  invoiceBelongsToClient(invoice = {}, client = {}, relatedAgreements = []) {
    if (this.hasStrictClientOwnership(invoice, client)) return true;
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
    if (this.hasStrictClientOwnership(receipt, client)) return true;
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
      .normalize('NFKC')
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/s\.?\s*a\.?\s*l\.?/gi, 'sal')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\b(inc|llc|ltd|co|corp|corporation|company|the)\b/gi, ' ')
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
      company_id: String(row.company_id || row.companyId || row.customer_company_id || row.customerCompanyId || '').trim(),
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
      agreement_number: String(row.agreement_number || row.agreement_reference || '').trim(),
      company_id: String(row.company_id || row.companyId || '').trim(),
      customer_company_id: String(row.customer_company_id || row.customerCompanyId || '').trim(),
      client_company_id: String(row.client_company_id || row.clientCompanyId || '').trim(),
      company_name: String(row.company_name || '').trim(),
      client_name: String(row.client_name || row.customer_name || row.customer_legal_name || row.company_name || '').trim(),
      client_email: String(row.client_email || row.customer_contact_email || '').trim(),
      client_phone: String(row.client_phone || row.customer_contact_mobile || '').trim(),
      customer_name: String(row.customer_name || '').trim(),
      customer_legal_name: String(row.customer_legal_name || row.company_name || '').trim(),
      customer_contact_email: String(row.customer_contact_email || '').trim(),
      customer_contact_mobile: String(row.customer_contact_mobile || '').trim(),
      status: String(row.status || '').trim(),
      grand_total: this.toNumber(row.grand_total ?? row.grand_tota ?? row.total_amount ?? row.total_value ?? row.total),
      currency: String(row.currency || '').trim() || 'USD',
      updated_at: String(row.updated_at || '').trim(),
      service_start_date: String(row.service_start_date || '').trim(),
      service_end_date: String(row.service_end_date || '').trim(),
      agreement_date: String(row.agreement_date || '').trim(),
      customer_sign_date: String(row.customer_sign_date || '').trim(),
      billing_frequency: String(row.billing_frequency || '').trim(),
      payment_term: String(row.payment_term || row.payment_terms || '').trim(),
      subtotal_locations: this.toNumber(row.subtotal_locations),
      contract_term: String(row.contract_term || '').trim(),
      effective_date: String(row.effective_date || '').trim(),
      renewed_from_agreement_id: String(row.renewed_from_agreement_id || row.renewedFromAgreementId || '').trim()
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
      company_id: input.company_id || input.companyId || input.customer_company_id || input.customerCompanyId || input.client_company_id || input.clientCompanyId,
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
    const byAgreementKey = new Map();

    const add = (key, item) => {
      const normalized = String(key || '').trim();
      if (!normalized) return;
      if (!byAgreementKey.has(normalized)) byAgreementKey.set(normalized, []);
      byAgreementKey.get(normalized).push(item);
    };

    for (const item of Array.isArray(agreementItems) ? agreementItems : []) {
      add(item.agreement_id, item);
      add(item.agreementId, item);
      add(item.agreement_number, item);
      add(item.agreementNumber, item);
      add(item.parent_agreement_id, item);
      add(item.source_agreement_id, item);
      add(item.parent_agreement_number, item);
      add(item.source_agreement_number, item);
    }

    return (Array.isArray(agreements) ? agreements : []).map(agreement => {
      const keys = [
        agreement.id,
        agreement.agreement_id,
        agreement.agreementId,
        agreement.agreement_number,
        agreement.agreementNumber
      ].map(value => String(value || '').trim()).filter(Boolean);

      const seen = new Set();
      const items = [];

      for (const key of keys) {
        for (const item of byAgreementKey.get(key) || []) {
          const itemKey = String(item.id || `${item.agreement_id}-${item.line_no}-${item.location_name}`).trim();
          if (seen.has(itemKey)) continue;
          seen.add(itemKey);
          items.push(item);
        }
      }

      return {
        ...agreement,
        items,
        agreement_items: items,
        location_name: String(items.find(item => String(item.location_name || '').trim())?.location_name || '').trim()
      };
    });
  },
  attachInvoiceItems(invoices = [], invoiceItems = []) {
    const byInvoiceKey = new Map();

    const add = (key, item) => {
      const normalized = String(key || '').trim();
      if (!normalized) return;
      if (!byInvoiceKey.has(normalized)) byInvoiceKey.set(normalized, []);
      byInvoiceKey.get(normalized).push(item);
    };

    for (const item of Array.isArray(invoiceItems) ? invoiceItems : []) {
      add(item.invoice_id, item);
      add(item.invoiceId, item);
      add(item.invoice_uuid, item);
      add(item.invoiceUuid, item);
      add(item.invoice_number, item);
      add(item.invoiceNumber, item);
      add(item.invoice_no, item);
      add(item.invoiceNo, item);
      add(item.parent_invoice_id, item);
      add(item.parent_invoice_number, item);
      add(item.source_invoice_id, item);
      add(item.source_invoice_number, item);
    }

    return (Array.isArray(invoices) ? invoices : []).map(invoice => {
      const keys = [
        invoice.id,
        invoice.invoice_id,
        invoice.invoiceId,
        invoice.invoice_uuid,
        invoice.invoiceUuid,
        invoice.invoice_number,
        invoice.invoiceNumber,
        invoice.invoice_no,
        invoice.invoiceNo
      ].map(value => String(value || '').trim()).filter(Boolean);

      const seen = new Set();
      const items = [];

      for (const key of keys) {
        for (const item of byInvoiceKey.get(key) || []) {
          const itemKey = String(item.id || `${item.invoice_id || item.invoice_number}-${item.line_no}-${item.location_name}`).trim();
          if (seen.has(itemKey)) continue;
          seen.add(itemKey);
          items.push(item);
        }
      }

      return {
        ...invoice,
        items,
        invoice_items: items
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
      company_id: String(agreement.company_id || agreement.companyId || agreement.customer_company_id || agreement.customerCompanyId || agreement.client_company_id || agreement.clientCompanyId || '').trim() || null,
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
    return (Array.isArray(clients) ? clients : []).find(client => this.hasStrictClientOwnership(agreement, client)) || null;
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
    return this.buildUniqueCurrentLocationRows(items).length;
  },
  isAnnualSaasClientLocationItem(item = {}) {
    const section = String(item?.section || item?.item_section || item?.itemSection || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (section === 'annual_saas') return true;

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

    const isSaasFamily = ['annual_saas', 'saas annual', 'saas', 'subscription', 'recurring'].some(token => text.includes(token));
    if (!isSaasFamily) return false;

    return text.includes('annual_saas') || ['annual', 'yearly', '12 month', '12-month', 'year', 'renewal'].some(token => text.includes(token));
  },
  isAnnualSaasItem(item = {}) {
    const section = String(item?.section || item?.item_section || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    return section === 'annual_saas';
  },
  isSupersededItem(item = {}) {
    return item?.is_superseded === true
      || String(item?.is_superseded).toLowerCase() === 'true'
      || Boolean(item?.superseded_by_item_id || item?.supersededByItemId);
  },
  agreementHasCurrentAnnualSaasItems(agreement = {}) {
    const items = Array.isArray(agreement?.items)
      ? agreement.items
      : Array.isArray(agreement?.agreement_items)
        ? agreement.agreement_items
        : Array.isArray(agreement?.line_items)
          ? agreement.line_items
          : [];
    return items.some(item => this.isAnnualSaasItem(item) && !this.isSupersededItem(item));
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
    if (this.agreementBelongsToClient(agreement, client)) return true;

    const sourceAgreement = String(client.source_agreement_id || '').trim();
    if (!sourceAgreement) return false;

    const sourceMatches = [agreement.id, agreement.agreement_id, agreement.agreement_number]
      .map(value => String(value || '').trim())
      .some(value => value && value === sourceAgreement);
    if (!sourceMatches) return false;

    const clientCompanyId = this.getClientCompanyId(client);
    const agreementCompanyId = this.getAgreementCompanyId(agreement);
    if (clientCompanyId || agreementCompanyId) {
      return Boolean(clientCompanyId && agreementCompanyId && String(clientCompanyId) === String(agreementCompanyId));
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

  normalizeLocationKey(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFKC')
      .replace(/\s+/g, ' ');
  },
  getLocationRowRankTime_(item = {}) {
    const serviceEndAt = new Date(item?.service_end_date || item?.serviceEndDate || 0).getTime() || 0;
    const updatedAt = new Date(item?.updated_at || item?.updatedAt || item?.agreement_date || item?.agreementDate || item?.signed_date || item?.customer_sign_date || item?.created_at || 0).getTime() || 0;
    return { serviceEndAt, updatedAt };
  },
  buildUniqueCurrentLocationRows(items = []) {
    const map = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      if (!this.isAnnualSaasItem(item)) continue;
      if (this.isSupersededItem(item)) continue;
      const locationKey = this.normalizeLocationKey(item?.location_name || item?.locationName || item?.location || '');
      if (!locationKey) continue;
      const itemKey = this.normalizeLocationKey(item?.item_name || item?.itemName || item?.license || item?.module_name || item?.moduleName || '');
      const key = `${locationKey}::${itemKey}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
        continue;
      }
      const existingRank = this.getLocationRowRankTime_(existing);
      const itemRank = this.getLocationRowRankTime_(item);
      if (itemRank.serviceEndAt > existingRank.serviceEndAt) {
        map.set(key, item);
        continue;
      }
      if (itemRank.serviceEndAt === existingRank.serviceEndAt && itemRank.updatedAt >= existingRank.updatedAt) map.set(key, item);
    }
    return Array.from(map.values());
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

    const currentLocationRows = this.buildUniqueCurrentLocationRows(linkedAgreementItems);
    const currentAgreementMap = new Map();

    currentLocationRows.forEach(item => {
      const itemKeys = [
        item.agreement_id,
        item.agreement_number,
        item.parent_agreement_id,
        item.parent_agreement_number,
        item.source_agreement_id,
        item.source_agreement_number
      ].map(value => String(value || '').trim()).filter(Boolean);

      const agreement = linkedAgreements.find(row => {
        const agreementKeys = [row.id, row.agreement_id, row.agreement_number]
          .map(value => String(value || '').trim())
          .filter(Boolean);
        return itemKeys.some(itemKey => agreementKeys.some(agreementKey => this.valuesMatch(itemKey, agreementKey)));
      });

      const key = String(agreement?.id || agreement?.agreement_id || agreement?.agreement_number || '').trim();
      if (key) currentAgreementMap.set(key, agreement);
    });

    linkedAgreements
      .filter(agreement => this.agreementHasCurrentAnnualSaasItems(agreement))
      .forEach(agreement => {
        const key = String(agreement.id || agreement.agreement_id || agreement.agreement_number || '').trim();
        if (key && !currentAgreementMap.has(key)) currentAgreementMap.set(key, agreement);
      });

    const currentAgreements = Array.from(currentAgreementMap.values());
    const totalAgreements = currentAgreements.length;
    const totalLocations = currentLocationRows.length;
    const totalValue = (currentAgreements.length ? currentAgreements : linkedAgreements).reduce((sum, agreement) => sum + this.toNumber(agreement.grand_total), 0);
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
  normalizeImportDateValue_(value) {
    const text = String(value || '').trim();
    return text || null;
  },
  normalizeImportedAgreementStatus_(value) {
    const raw = String(value || 'Signed').trim().toLowerCase().replace(/[_-]+/g, ' ');
    if (raw.includes('expire')) return 'Expired';
    if (raw.includes('cancel')) return 'Cancelled';
    if (raw.includes('draft')) return 'Draft';
    if (raw.includes('approved')) return 'Approved';
    if (raw.includes('reject')) return 'Rejected';
    // Historical active/archived agreements should be stored as Signed so they stay outside draft workflow.
    return 'Signed';
  },
  buildImportReference_(prefix = 'AGR') {
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    return `${prefix}-IMP-${stamp}`;
  },
  sanitizeStorageFileName_(value = '') {
    return String(value || 'document')
      .trim()
      .replace(/[\\/<>:"|?*]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 140) || 'document';
  },
  extractUnknownColumnName_(error) {
    const text = String(error?.message || error?.details || error?.hint || error || '');
    return (
      text.match(/column "([^"]+)" of relation "[^"]+" does not exist/i)?.[1] ||
      text.match(/Could not find the '([^']+)' column/i)?.[1] ||
      text.match(/Could not find column '([^']+)'/i)?.[1] ||
      ''
    );
  },
  async insertRowWithOptionalColumns_(table, payload = {}, { select = '*' } = {}) {
    const db = this.getDb();
    let current = { ...payload };
    const removed = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { data, error } = await db.from(table).insert(current).select(select).single();
      if (!error) {
        if (removed.length) console.warn(`[ClientsService] ${table} import skipped unavailable columns`, removed);
        return data;
      }
      const missingColumn = this.extractUnknownColumnName_(error);
      if (missingColumn && Object.prototype.hasOwnProperty.call(current, missingColumn)) {
        removed.push(missingColumn);
        delete current[missingColumn];
        continue;
      }
      throw this.friendlyError(`Unable to create ${table} during import`, error);
    }
    throw new Error(`Unable to create ${table}: too many unavailable columns were removed.`);
  },
  async updateRowWithOptionalColumns_(table, idColumn, idValue, payload = {}, { select = '*' } = {}) {
    const db = this.getDb();
    let current = { ...payload };
    const removed = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { data, error } = await db.from(table).update(current).eq(idColumn, idValue).select(select).maybeSingle();
      if (!error) {
        if (removed.length) console.warn(`[ClientsService] ${table} import update skipped unavailable columns`, removed);
        return data;
      }
      const missingColumn = this.extractUnknownColumnName_(error);
      if (missingColumn && Object.prototype.hasOwnProperty.call(current, missingColumn)) {
        removed.push(missingColumn);
        delete current[missingColumn];
        continue;
      }
      throw this.friendlyError(`Unable to update ${table} during import`, error);
    }
    throw new Error(`Unable to update ${table}: too many unavailable columns were removed.`);
  },
  async uploadHistoricalAgreementDocument_(file, input = {}, userId = '') {
    if (!file || typeof file !== 'object' || !String(file.name || '').trim()) return null;
    const db = this.getDb();
    if (!db.storage?.from) throw new Error('Supabase Storage is not available for imported agreement document upload.');
    const bucket = 'agreement-signed-documents';
    const agreementRef = this.sanitizeStorageFileName_(input.legacy_agreement_ref || input.agreement_reference || this.buildImportReference_('AGR'));
    const fileName = this.sanitizeStorageFileName_(file.name || 'agreement-document.pdf');
    const path = `historical-agreements/${agreementRef}/${Date.now()}-${fileName}`;
    const { error } = await db.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined
    });
    if (error) throw this.friendlyError('Unable to upload imported agreement document', error);
    return {
      bucket,
      path,
      name: file.name,
      type: file.type || '',
      size: Number(file.size || 0),
      uploaded_at: new Date().toISOString(),
      uploaded_by: userId || null
    };
  },
  async findOldClientImportDuplicates(input = {}) {
    const db = this.getDb();
    const legalName = String(input.legal_company_name || '').trim();
    const accountNumber = String(input.account_number || '').trim();
    const legacyRef = String(input.legacy_client_ref || '').trim();
    const email = String(input.main_contact_email || input.billing_email || '').trim();
    const checks = [];
    if (legalName) checks.push(db.from('companies').select('id,company_id,company_name,legal_name,main_email').or(`legal_name.ilike.${legalName},company_name.ilike.${legalName}`).limit(5));
    if (email) checks.push(db.from('companies').select('id,company_id,company_name,legal_name,main_email').eq('main_email', email).limit(5));
    if (accountNumber) checks.push(db.from('companies').select('id,company_id,company_name,legal_name').eq('registration_number', accountNumber).limit(5));
    if (legacyRef) {
      checks.push(db.from('companies').select('id,company_id,company_name,legal_name').ilike('legacy_client_ref', `%${legacyRef}%`).limit(5));
      checks.push(db.from('companies').select('id,company_id,company_name,legal_name').ilike('notes', `%${legacyRef}%`).limit(5));
    }
    const results = await Promise.allSettled(checks);
    const rows = [];
    results.forEach(result => {
      if (result.status === 'fulfilled' && Array.isArray(result.value?.data)) rows.push(...result.value.data);
    });
    const unique = new Map();
    rows.forEach(row => { const key = String(row.id || row.company_id || '').trim(); if (key && !unique.has(key)) unique.set(key, row); });
    return [...unique.values()];
  },
  async findExistingAgreementByLegacyRef_(legacyAgreementRef = '') {
    const ref = String(legacyAgreementRef || '').trim();
    if (!ref) return null;
    const db = this.getDb();
    const queries = [
      db.from('agreements').select('*').eq('agreement_number', ref).limit(1),
      db.from('agreements').select('*').eq('agreement_id', ref).limit(1),
      db.from('agreements').select('*').eq('legacy_agreement_ref', ref).limit(1)
    ];
    const results = await Promise.allSettled(queries);
    for (const result of results) {
      if (result.status === 'fulfilled' && Array.isArray(result.value?.data) && result.value.data[0]) return result.value.data[0];
    }
    return null;
  },
  async findExistingImportedContact_(company, input = {}) {
    const email = String(input.main_contact_email || input.contact_email || '').trim();
    if (!email) return null;
    const companyId = String(company?.company_id || company?.id || '').trim();
    const db = this.getDb();
    const { data, error } = await db.from('contacts').select('*').eq('email', email).limit(25);
    if (error || !Array.isArray(data)) return null;
    return data.find(row => {
      const rowCompanyIds = Array.isArray(row.company_ids) ? row.company_ids.map(String) : [];
      return String(row.company_id || '').trim() === companyId || rowCompanyIds.includes(companyId);
    }) || data[0] || null;
  },
  buildImportedContactParts_(input = {}) {
    const explicitFirst = String(input.contact_first_name || '').trim();
    const explicitLast = String(input.contact_last_name || '').trim();
    if (explicitFirst || explicitLast) {
      return { first_name: explicitFirst || explicitLast, last_name: explicitFirst ? explicitLast : '' };
    }
    const full = String(input.main_contact_name || '').trim();
    const parts = full.split(/\s+/).filter(Boolean);
    const first_name = parts.shift() || full;
    return { first_name, last_name: parts.join(' ') };
  },
  async importOldClient(input = {}) {
    const db = this.getDb();
    const nowIso = new Date().toISOString();
    const userId = this.getCurrentUserId();
    const legacyAgreementRef = String(input.legacy_agreement_ref || input.agreement_reference || '').trim() || this.buildImportReference_('AGR');
    const legalCompanyName = String(input.legal_company_name || '').trim();
    const displayCompanyName = String(input.company_name || legalCompanyName).trim();
    if (!legalCompanyName && !displayCompanyName) throw new Error('Legal Company Name or Company Name is required.');
    if (!legacyAgreementRef) throw new Error('Old Agreement Number / Reference is required.');

    const documentUpload = await this.uploadHistoricalAgreementDocument_(input.agreement_file, { ...input, legacy_agreement_ref: legacyAgreementRef }, userId);

    const importNoteParts = [
      String(input.notes || '').trim(),
      input.legacy_client_ref ? `Legacy Client Ref: ${input.legacy_client_ref}` : '',
      input.account_number ? `Account Number: ${input.account_number}` : '',
      legacyAgreementRef ? `Imported Agreement Ref: ${legacyAgreementRef}` : '',
      'Imported historical agreement — no workflow, onboarding, technical admin, invoice, receipt, or notification automation.'
    ].filter(Boolean);

    const companyPayload = {
      company_name: displayCompanyName,
      legal_name: legalCompanyName || displayCompanyName,
      country: String(input.country || '').trim(),
      city: String(input.city || '').trim(),
      address: String(input.address || '').trim(),
      main_email: String(input.main_contact_email || input.billing_email || '').trim(),
      main_phone: String(input.main_contact_phone || '').trim(),
      industry: String(input.industry || '').trim(),
      tax_number: String(input.tax_vat_number || '').trim(),
      registration_number: String(input.account_number || '').trim(),
      legacy_client_ref: String(input.legacy_client_ref || '').trim(),
      is_imported: true,
      is_historical_client: true,
      imported_from: 'old_client_agreement_manual_import',
      imported_at: nowIso,
      imported_by: userId || null,
      old_client_since: this.normalizeImportDateValue_(input.old_client_since_date || input.agreement_date || input.service_start_date),
      skip_workflow: true,
      skip_notifications: true,
      skip_onboarding: true,
      skip_technical_admin: true,
      skip_invoice_creation: true,
      skip_receipt_creation: true,
      notes: importNoteParts.join('\n'),
      company_status: 'Active'
    };

    let company = null;
    const duplicateCompanies = await this.findOldClientImportDuplicates(input);
    if (duplicateCompanies[0]?.id) {
      try {
        company = await this.updateRowWithOptionalColumns_('companies', 'id', duplicateCompanies[0].id, companyPayload);
      } catch (error) {
        console.warn('[ClientsService] Existing company could not be updated during historical import; reusing it as-is.', error);
        company = duplicateCompanies[0];
      }
    } else {
      company = await this.insertRowWithOptionalColumns_('companies', companyPayload);
    }

    const contactParts = this.buildImportedContactParts_(input);
    let contact = await this.findExistingImportedContact_(company, input);
    if (!contact && (contactParts.first_name || input.main_contact_email || input.main_contact_phone)) {
      const companyPublicId = String(company?.company_id || company?.id || '').trim();
      const contactPayload = {
        first_name: contactParts.first_name || 'Imported',
        last_name: contactParts.last_name || '',
        full_name: [contactParts.first_name, contactParts.last_name].filter(Boolean).join(' '),
        email: String(input.main_contact_email || '').trim(),
        phone: String(input.main_contact_phone || '').trim(),
        mobile: String(input.main_contact_phone || '').trim(),
        job_title: String(input.contact_position || '').trim(),
        department: String(input.contact_department || '').trim(),
        company_id: companyPublicId || null,
        company_ids: companyPublicId ? [companyPublicId] : [],
        company_name: company?.company_name || displayCompanyName,
        legacy_contact_ref: String(input.legacy_contact_ref || '').trim(),
        is_imported: true,
        imported_from: 'old_client_agreement_manual_import',
        imported_at: nowIso,
        imported_by: userId || null,
        notes: 'Imported historical contact',
        contact_status: 'Active',
        updated_by: userId || null,
        created_by: userId || null
      };
      contact = await this.insertRowWithOptionalColumns_('contacts', contactPayload);
    }

    const parseItems = raw => { try { const p = JSON.parse(String(raw || '[]')); return Array.isArray(p) ? p : []; } catch (_e) { return []; } };
    const annualItems = parseItems(input.annual_saas_items_json);
    const oneTimeItems = parseItems(input.one_time_fee_items_json);
    const importedItems = [...annualItems, ...oneTimeItems];
    const computedAnnualSubtotal = annualItems.reduce((s, r) => s + this.toNumber(r?.line_total), 0);
    const computedOneTimeSubtotal = oneTimeItems.reduce((s, r) => s + this.toNumber(r?.line_total), 0);
    const computedGrand = computedAnnualSubtotal + computedOneTimeSubtotal;
    let agreement = await this.findExistingAgreementByLegacyRef_(legacyAgreementRef);
    const totalAmount = computedGrand > 0 ? computedGrand : this.toNumber(input.total_amount || input.grand_total);
    if (!agreement) {
      const agreementStatus = this.normalizeImportedAgreementStatus_(input.agreement_status || input.status);
      const customerContactName = [contactParts.first_name, contactParts.last_name].filter(Boolean).join(' ') || String(input.main_contact_name || '').trim();
      const agreementPayload = {
        agreement_id: legacyAgreementRef,
        agreement_number: legacyAgreementRef,
        legacy_agreement_ref: legacyAgreementRef,
        agreement_title: String(input.agreement_title || `Historical Agreement ${legacyAgreementRef}`).trim(),
        company_id: String(company?.company_id || company?.id || '').trim() || null,
        company_name: company?.company_name || displayCompanyName,
        contact_id: String(contact?.contact_id || contact?.id || '').trim() || null,
        contact_name: customerContactName,
        contact_email: String(input.main_contact_email || contact?.email || '').trim(),
        contact_phone: String(input.main_contact_phone || contact?.phone || '').trim(),
        contact_mobile: String(input.main_contact_phone || contact?.mobile || '').trim(),
        customer_name: displayCompanyName,
        customer_legal_name: legalCompanyName || displayCompanyName,
        customer_address: String(input.address || '').trim(),
        customer_contact_name: customerContactName,
        customer_contact_email: String(input.main_contact_email || '').trim(),
        customer_contact_phone: String(input.main_contact_phone || '').trim(),
        customer_contact_mobile: String(input.main_contact_phone || '').trim(),
        agreement_date: this.normalizeImportDateValue_(input.agreement_date),
        effective_date: this.normalizeImportDateValue_(input.agreement_date || input.service_start_date),
        service_start_date: this.normalizeImportDateValue_(input.service_start_date),
        service_end_date: this.normalizeImportDateValue_(input.service_end_date),
        signed_date: agreementStatus === 'Signed' ? this.normalizeImportDateValue_(input.signed_date || input.agreement_date) : null,
        customer_sign_date: agreementStatus === 'Signed' ? this.normalizeImportDateValue_(input.signed_date || input.agreement_date) : null,
        customer_official_sign_date: agreementStatus === 'Signed' ? this.normalizeImportDateValue_(input.signed_date || input.agreement_date) : null,
        customer_official_signatory_name: customerContactName,
        customer_signatory_name: customerContactName,
        customer_official_signatory_title: String(input.contact_position || '').trim(),
        customer_signatory_title: String(input.contact_position || '').trim(),
        provider_official_signatory_1_name: 'Simon Moujaly',
        provider_official_signatory_1_title: 'Senior Financial Controller',
        provider_official_signatory_2_name: 'Hanna Khattar',
        provider_official_signatory_2_title: 'General Manager',
        billing_frequency: String(input.billing_frequency || 'Annual').trim() || 'Annual',
        payment_term: String(input.payment_term || 'Net 30').trim() || 'Net 30',
        payment_terms: String(input.payment_term || 'Net 30').trim() || 'Net 30',
        currency: String(input.currency || 'USD').trim() || 'USD',
        status: agreementStatus,
        subtotal_locations: computedAnnualSubtotal || totalAmount,
        subtotal_one_time: computedOneTimeSubtotal,
        total_discount: 0,
        grand_total: totalAmount,
        is_imported: true,
        is_historical_agreement: true,
        imported_from: 'old_client_agreement_manual_import',
        imported_at: nowIso,
        imported_by: userId || null,
        skip_workflow: true,
        skip_notifications: true,
        skip_onboarding: true,
        skip_technical_admin: true,
        skip_invoice_creation: true,
        skip_receipt_creation: true,
        imported_document_bucket: documentUpload?.bucket || null,
        imported_document_path: documentUpload?.path || null,
        imported_document_name: documentUpload?.name || null,
        imported_document_uploaded_at: documentUpload?.uploaded_at || null,
        imported_document_uploaded_by: documentUpload?.uploaded_by || null,
        signed_document_path: documentUpload?.path || null,
        signed_document_name: documentUpload?.name || null,
        signed_document_uploaded_at: documentUpload?.uploaded_at || null,
        signed_document_uploaded_by: documentUpload?.uploaded_by || null,
        signed_agreement_document_path: documentUpload?.path || null,
        signed_agreement_document_name: documentUpload?.name || null,
        signed_agreement_document_uploaded_at: documentUpload?.uploaded_at || null,
        signed_agreement_document_uploaded_by: documentUpload?.uploaded_by || null,
        notes: importNoteParts.join('\n'),
        created_by: userId || null,
        updated_by: userId || null
      };
      agreement = await this.insertRowWithOptionalColumns_('agreements', agreementPayload);
    }
    const agreementPublicId = String(agreement?.agreement_id || agreement?.id || '').trim();
    for (const [index, item] of importedItems.entries()) {
      if (!String(item?.item_name || '').trim()) continue;
      await this.insertRowWithOptionalColumns_('agreement_items', {
        agreement_id: agreementPublicId || null,
        item_type: String(item?.item_type || '').trim() || (annualItems.includes(item) ? 'annual_saas' : 'one_time_fee'),
        section: String(item?.item_type || '').trim() || (annualItems.includes(item) ? 'annual_saas' : 'one_time_fee'),
        line_no: index + 1,
        item_name: String(item?.item_name || '').trim(),
        catalog_item_id: String(item?.catalog_item_id || '').trim() || null,
        quantity: this.toNumber(item?.quantity || item?.license_quantity || 1),
        license_quantity: this.toNumber(item?.license_quantity || item?.quantity || 1),
        unit_price: this.toNumber(item?.unit_price || item?.license_price_year || 0),
        license_price_year: this.toNumber(item?.license_price_year || item?.unit_price || 0),
        license_month: this.toNumber(item?.license_month || 12),
        service_start_date: this.normalizeImportDateValue_(item?.service_start_date),
        service_end_date: this.normalizeImportDateValue_(item?.service_end_date),
        discount_percent: this.toNumber(item?.discount_percent || 0),
        line_total: this.toNumber(item?.line_total || 0),
        currency: String(input.currency || 'USD').trim() || 'USD',
        is_imported: true,
        is_historical_item: true,
        imported_from: 'old_client_agreement_manual_import',
        imported_at: nowIso,
        imported_by: userId || null
      }, { select: '*' });
    }

    const clientPayload = {
      client_name: displayCompanyName,
      company_name: legalCompanyName || displayCompanyName,
      primary_email: String(input.main_contact_email || input.billing_email || '').trim(),
      primary_phone: String(input.main_contact_phone || '').trim(),
      billing_frequency: String(input.billing_frequency || 'Annual').trim() || 'Annual',
      payment_term: String(input.payment_term || 'Net 30').trim() || 'Net 30',
      status: 'Active',
      source_agreement_id: String(agreement?.id || agreement?.agreement_id || '').trim() || null,
      total_agreements: 1,
      total_locations: this.toNumber(input.total_locations || input.number_of_locations || 0),
      total_value: totalAmount,
      total_paid: 0,
      total_due: 0,
      notes: JSON.stringify({
        imported: true,
        is_imported: true,
        is_historical_client: true,
        imported_from: 'old_client_agreement_manual_import',
        imported_at: nowIso,
        imported_by: userId,
        legacy_client_ref: String(input.legacy_client_ref || '').trim(),
        legacy_agreement_ref: legacyAgreementRef,
        account_number: String(input.account_number || '').trim(),
        billing_email: String(input.billing_email || '').trim(),
        currency: String(input.currency || '').trim(),
        old_client_since_date: String(input.old_client_since_date || input.agreement_date || '').trim(),
        skip_workflow: true,
        skip_notifications: true,
        skip_onboarding: true,
        skip_technical_admin: true,
        skip_invoice_creation: true,
        skip_receipt_creation: true
      })
    };
    const createdClient = await this.createClient(clientPayload);
    return { client: createdClient, company, contact, agreement, documentUpload, duplicateCompanies };
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
    const [agreementsRes, itemsRes, companiesRes] = await Promise.all([
      db.from('agreements').select(this.AGREEMENT_SELECT_COLUMNS).order('updated_at', { ascending: false }).limit(analyticsLimit),
      this.fetchAgreementItemsForClients_(db),
      db.from('companies').select('*').limit(analyticsLimit)
    ]);
    if (agreementsRes.error) throw this.friendlyError('Unable to load agreements for clients', agreementsRes.error);
    if (companiesRes?.error) console.warn('[ClientsService] companies lookup query failed; client analytics will fallback to raw ids/names.', companiesRes.error);
    this.rebuildCompanyLookupMaps(this.coerceLinkedRows_(companiesRes, 'companies'));
    agreementRows = this.coerceLinkedRows_(agreementsRes, 'agreements');
    console.log('[AgreementMapping] loaded agreements', agreementRows.length);
    itemRows = this.coerceLinkedRows_(itemsRes, 'agreement_items');
    console.log('[ClientsService] agreement_items count', itemRows.length, itemRows.slice(0, 5));
    console.log('[ClientsService] agreement_items sample dates', itemRows.slice(0, 5).map(row => ({
      id: row.id,
      section: row.section,
      location_name: row.location_name,
      service_start_date: row.service_start_date,
      service_end_date: row.service_end_date
    })));
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
    const invoices = this.attachInvoiceItems(invoiceRows, invoiceItemRows);
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
