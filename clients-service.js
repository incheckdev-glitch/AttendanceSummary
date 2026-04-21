const ClientsService = {
  CLIENT_COLUMNS: new Set([
    'client_id','client_name','company_name','primary_email','primary_phone','billing_frequency','payment_term',
    'status','source_agreement_id','total_agreements','total_locations','total_value','total_paid','total_due','created_by','updated_by'
  ]),
  getDb() {
    const db = window.SupabaseClient?.getClient?.();
    console.log('[ClientsService] db check', db, typeof db?.from);
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
  normalizeCompanyKey(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
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
    return agreements.map(agreement => ({ ...agreement, items: byAgreementId.get(String(agreement.id || '').trim()) || [] }));
  },
  isSignedAgreement(agreement = {}) { return this.normalizeText(agreement.status).includes('signed'); },
  countLocationItems(agreement = {}) {
    const items = Array.isArray(agreement.items) ? agreement.items : [];
    return items.filter(item => {
      const section = this.normalizeText(item.section || item.item_section || item.section_name || item.category || item.type);
      return section === 'annual_saas' || section === 'annual' || section === 'subscription';
    }).length;
  },
  matchAgreementClient(agreement = {}, client = {}) {
    const sourceAgreement = String(client.source_agreement_id || '').trim();
    if (sourceAgreement) {
      const agreementUuid = String(agreement.id || '').trim();
      const agreementBusinessId = String(agreement.agreement_id || '').trim();
      if (agreementUuid && agreementUuid === sourceAgreement) return true;
      if (agreementBusinessId && agreementBusinessId === sourceAgreement) return true;
    }
    const c1 = this.normalizeCompanyKey(client.company_name || client.customer_legal_name);
    const c2 = this.normalizeCompanyKey(client.client_name || client.customer_name);
    const a1 = this.normalizeCompanyKey(agreement.customer_legal_name);
    const a2 = this.normalizeCompanyKey(agreement.customer_name);
    return Boolean((c1 && (c1 === a1 || c1 === a2)) || (c2 && (c2 === a1 || c2 === a2)));
  },
  matchRecordClient(record = {}, client = {}) {
    const clientUuid = String(client.id || '').trim();
    if (clientUuid) {
      const recordClientUuid = String(record.client_id || record.client_uuid || '').trim();
      if (recordClientUuid && recordClientUuid === clientUuid) return true;
    }
    const clientBusinessId = String(client.client_id || '').trim();
    if (clientBusinessId && String(record.client_id || '').trim() === clientBusinessId) return true;
    const c1 = this.normalizeCompanyKey(client.company_name || client.customer_legal_name);
    const c2 = this.normalizeCompanyKey(client.client_name || client.customer_name);
    const r1 = this.normalizeCompanyKey(record.customer_legal_name);
    const r2 = this.normalizeCompanyKey(record.customer_name);
    return Boolean((c1 && (c1 === r1 || c1 === r2)) || (c2 && (c2 === r1 || c2 === r2)));
  },
  computeTotalsForClient(client = {}, agreements = [], invoices = [], receipts = []) {
    const linkedAgreements = agreements.filter(row => this.matchAgreementClient(row, client));
    const signedAgreements = linkedAgreements.filter(row => this.isSignedAgreement(row));
    const linkedInvoices = invoices.filter(row => this.matchRecordClient(row, client));
    const baselineAgreements = signedAgreements.length ? signedAgreements : linkedAgreements;
    const invoiceIdSet = new Set(linkedInvoices.map(row => String(row.id || '').trim()).filter(Boolean));
    const linkedReceipts = receipts.filter(row => {
      const invoiceUuid = String(row.invoice_id || '').trim();
      if (invoiceUuid && invoiceIdSet.has(invoiceUuid)) return true;
      return this.matchRecordClient(row, client);
    });

    const totalAgreements = linkedAgreements.length;
    const totalLocations = baselineAgreements.reduce((sum, agreement) => sum + this.countLocationItems(agreement), 0);
    const totalValue = linkedInvoices.length
      ? linkedInvoices.reduce((sum, invoice) => sum + this.toNumber(invoice.invoice_total ?? invoice.grand_total), 0)
      : baselineAgreements.reduce((sum, agreement) => sum + this.toNumber(agreement.grand_total), 0);
    const totalPaid = linkedReceipts.reduce((sum, receipt) => sum + this.toNumber(receipt.amount_received), 0);
    const totalDue = Math.max(totalValue - totalPaid, 0);

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
    const from = Math.max(0, (Number(page) - 1) * Number(limit));
    const to = from + Number(limit) - 1;
    let query = db.from('clients').select('*', { count: 'exact' }).order('updated_at', { ascending: false }).range(from, to);
    if (search) query = query.or(`client_id.ilike.%${search}%,client_name.ilike.%${search}%,company_name.ilike.%${search}%,primary_email.ilike.%${search}%`);
    if (status && status !== 'All') query = query.eq('status', status);
    const { data, error, count } = await query;
    if (error) throw this.friendlyError('Unable to load clients', error);
    const rows = Array.isArray(data) ? data.map(row => this.mapDbClientToUi(row)) : [];
    return { rows, total: Number(count ?? rows.length), returned: rows.length, page: Number(page), limit: Number(limit), offset: from, hasMore: from + rows.length < Number(count ?? rows.length) };
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
    const { data, error } = await db.from('clients').insert(payload).select('*').single();
    if (error) throw this.friendlyError('Unable to create client', error);
    return this.mapDbClientToUi(data);
  },
  async updateClient(clientUuid, updates = {}) {
    const id = String(clientUuid || '').trim();
    if (!id) throw new Error('Client UUID is required for update.');
    const db = this.getDb();
    const payload = this.sanitizeClientPayload(updates, { includeCreatedBy: false });
    const { data, error } = await db.from('clients').update(payload).eq('id', id).select('*').single();
    if (error) throw this.friendlyError('Unable to update client', error);
    return this.mapDbClientToUi(data);
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
    const clientsList = await this.listClients(options);
    const db = this.getDb();
    const [agreementsRes, itemsRes, invoicesRes, receiptsRes] = await Promise.all([
      db.from('agreements').select('id,agreement_id,agreement_number,customer_name,customer_legal_name,status,grand_total,updated_at,service_start_date,service_end_date,agreement_date,customer_sign_date,due_date,renewal_date,location_name').order('updated_at', { ascending: false }).limit(500),
      db.from('agreement_items').select('agreement_id,section,item_section,section_name,category,type').limit(5000),
      db.from('invoices').select('id,invoice_id,invoice_number,agreement_id,client_id,customer_name,customer_legal_name,status,payment_state,invoice_total,received_amount,pending_amount,updated_at,issue_date,due_date,reference,notes,location_name').order('updated_at', { ascending: false }).limit(1000),
      db.from('receipts').select('id,receipt_id,receipt_number,invoice_id,client_id,customer_name,customer_legal_name,status,payment_state,amount_received,pending_amount,updated_at,receipt_date,reference,notes').order('updated_at', { ascending: false }).limit(1000)
    ]);
    if (agreementsRes.error) throw this.friendlyError('Unable to load agreements for clients', agreementsRes.error);
    if (itemsRes.error) throw this.friendlyError('Unable to load agreement items for clients', itemsRes.error);
    if (invoicesRes.error) throw this.friendlyError('Unable to load invoices for clients', invoicesRes.error);
    if (receiptsRes.error) throw this.friendlyError('Unable to load receipts for clients', receiptsRes.error);

    const agreements = this.attachAgreementItems(agreementsRes.data || [], itemsRes.data || []);
    const invoices = invoicesRes.data || [];
    const receipts = receiptsRes.data || [];
    const clients = (clientsList.rows || []).map(clientRow => {
      const totals = this.computeTotalsForClient(clientRow, agreements, invoices, receipts);
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
    if (updates.length) {
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
      if (failedUpdate?.error) throw this.friendlyError('Unable to refresh client totals', failedUpdate.error);
    }

    return { ...clientsList, rows: clients, agreements, invoices, receipts };
  }
};

window.ClientsService = ClientsService;
