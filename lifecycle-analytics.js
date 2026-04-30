const LifecycleAnalytics = {
  state: {
    initialized: false,
    loading: false,
    loadError: '',
    rows: [],
    filteredRows: [],
    selectedAccountKey: '',
    overview: {},
    filters: {
      search: '',
      stage: 'All',
      paymentState: 'All',
      onboardingStatus: 'All',
      technicalStatus: 'All',
      renewalWindow: 'All',
      locationState: 'All',
      client: 'All',
      dateFrom: '',
      dateTo: ''
    },
    warnings: []
  },
  text(value) {
    return String(value ?? '').trim();
  },
  norm(value) {
    return this.text(value).toLowerCase();
  },
  num(value) {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  },
  escape(value) {
    return U.escapeHtml(String(value ?? ''));
  },
  fmtDate(value) {
    const raw = this.text(value);
    return raw ? U.fmtDisplayDate(raw) : '—';
  },
  fmtMoney(value, currency = 'USD') {
    const code = this.text(currency).toUpperCase() || 'USD';
    return `${code} ${U.fmtNumber(this.num(value))}`;
  },
  formatTimelineDate(value) {
    const raw = this.text(value);
    if (!raw) return '—';
    return U.fmtTS(raw);
  },
  getAnalyticsClientLegalName(row = {}, company = {}) {
    return String(
      company.legal_name ||
      company.legalName ||
      row.customer_legal_name ||
      row.customerLegalName ||
      row.company_legal_name ||
      row.companyLegalName ||
      row.customer_name ||
      row.customerName ||
      row.company_name ||
      row.companyName ||
      row.client_name ||
      row.clientName ||
      ''
    ).trim();
  },

  parseEventTimestamp(value) {
    if (!value) return null;
    const date = new Date(value);
    const time = date.getTime();
    if (!Number.isFinite(time)) return null;
    return time;
  },
  isDateOnlyLike(value) {
    const text = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return true;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) return true;
    return false;
  },
  getBestLifecycleTimestamp(record = {}, candidates = []) {
    for (const key of candidates) {
      const value = record?.[key];
      if (!value) continue;
      if (!this.isDateOnlyLike(value)) {
        const parsed = this.parseEventTimestamp(value);
        if (parsed) return parsed;
      }
    }
    for (const key of candidates) {
      const parsed = this.parseEventTimestamp(record?.[key]);
      if (parsed) return parsed;
    }
    return null;
  },
  getLifecycleStageOrder(type) {
    const order = {
      lead_created: 10,
      deal_created: 20,
      proposal_created: 30,
      agreement_signed: 40,
      invoice_created: 50,
      receipt_created: 60,
      additional_receipt_created: 61
    };
    return order[type] || 999;
  },
  buildLifecycleTimeline(account = {}) {
    const events = [];
    const pushEvent = (item = {}, config = {}) => {
      const sortTimestamp = this.getBestLifecycleTimestamp(item, config.candidates || []);
      if (!sortTimestamp) return;
      const displayDate = this.text(config.displayField ? item[config.displayField] : '')
        || this.text(item.created_at || item.createdAt || item.updated_at || item.updatedAt || '');

      const metadata = [
        config.codeLabel && item[config.codeField] ? `${config.codeLabel}: ${this.text(item[config.codeField])}` : '',
        item.status ? `Status: ${this.text(item.status)}` : '',
        config.userLabel && item[config.userField] ? `${config.userLabel}: ${this.text(item[config.userField])}` : '',
        config.noteBuilder ? this.text(config.noteBuilder(item)) : ''
      ].filter(Boolean);

      events.push({ type: config.type, title: config.title, sortTimestamp, displayDate, metadata });
    };

    const leads = (account.leads || []).slice();
    const deals = (account.deals || []).slice();
    const proposals = (account.proposals || []).slice();
    const agreements = (account.agreements || []).slice();
    const invoices = (account.invoices || []).slice();
    const receipts = (account.receipts || []).slice();

    if (leads[0]) pushEvent(leads[0], { type:'lead_created', title:'Lead created', codeLabel:'Lead', codeField:'lead_id', userLabel:'Assigned to', userField:'assigned_to', candidates:['created_at','createdAt','lead_created_at','created_date','date','updated_at'], displayField:'created_at' });
    if (deals[0]) pushEvent(deals[0], { type:'deal_created', title:'Deal created', codeLabel:'Deal', codeField:'deal_id', userLabel:'Assigned to', userField:'assigned_to', candidates:['created_at','createdAt','converted_at','deal_created_at','created_date','updated_at'], displayField:'created_at', noteBuilder:item=>item.stage?`Stage: ${item.stage}`:'' });
    if (proposals[0]) pushEvent(proposals[0], { type:'proposal_created', title:'Proposal created', codeLabel:'Proposal', codeField:'proposal_id', candidates:['created_at','createdAt','proposal_created_at','created_date','proposal_date'], displayField:'created_at', noteBuilder:item=>item.ref_number?`Ref: ${item.ref_number}`:'' });
    if (agreements[0]) pushEvent(agreements[0], { type:'agreement_signed', title:'Agreement signed', codeLabel:'Agreement', codeField:'agreement_id', candidates:['signed_at','signedAt','agreement_signed_at','updated_at','created_at','agreement_date'], displayField:'signed_at', noteBuilder:item=>item.agreement_number?`Agreement No: ${item.agreement_number}`:'' });
    if (invoices[0]) pushEvent(invoices[0], { type:'invoice_created', title:'Invoice created', codeLabel:'Invoice', codeField:'invoice_id', candidates:['created_at','createdAt','invoice_created_at','issued_at','invoice_date'], displayField:'created_at', noteBuilder:item=>item.invoice_number?`Invoice No: ${item.invoice_number}`:'' });

    receipts.forEach((receipt, idx) => pushEvent(receipt, { type: idx===0?'receipt_created':'additional_receipt_created', title: idx===0?'Receipt created':'Additional receipt created', codeLabel:'Receipt', codeField:'receipt_id', candidates:['created_at','createdAt','receipt_created_at','issued_at','payment_date','receipt_date'], displayField:'created_at', noteBuilder:item=>item.receipt_number?`Receipt No: ${item.receipt_number}`:'' }));

    return events.sort((a,b)=>{ const ta=Number(a.sortTimestamp||0); const tb=Number(b.sortTimestamp||0); if(ta!==tb) return ta-tb; return this.getLifecycleStageOrder(a.type)-this.getLifecycleStageOrder(b.type); });
  },
  renderLifecycleTimeline(selected = {}) {
    const timeline = this.buildLifecycleTimeline(selected);
    if (!timeline.length) {
      return `
        <section class="card" style="margin-top:10px;">
          <strong>Lifecycle Timeline</strong>
          <div class="muted" style="margin-top:10px;">No lifecycle timeline events are available for this account yet.</div>
        </section>
      `;
    }
    return `
      <section class="card" style="margin-top:10px;">
        <strong>Lifecycle Timeline</strong>
        <div class="lifecycle-timeline">
          ${timeline
            .map(
              item => `<article class="lifecycle-timeline-item">
                <div class="lifecycle-timeline-dot" aria-hidden="true"></div>
                <div class="lifecycle-timeline-content">
                  <div class="lifecycle-timeline-title-row">
                    <strong>${this.escape(item.title)}</strong>
                    <span class="muted">${this.escape(this.formatTimelineDate(item.displayDate))}</span>
                  </div>
                  ${item.metadata.map(line => `<div class="muted">${this.escape(line)}</div>`).join('')}
                </div>
              </article>`
            )
            .join('')}
        </div>
      </section>
    `;
  },
  toDate(value) {
    const raw = this.text(value);
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  },
  calculateDecimalDays(startValue, endValue = new Date()) {
    if (!startValue || !endValue) return null;
    const start = this.toDate(startValue);
    const end = this.toDate(endValue);
    if (!start || !end) return null;

    const startMs = start.getTime();
    const endMs = end.getTime();

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;

    const diffMs = Math.max(0, endMs - startMs);
    return diffMs / (1000 * 60 * 60 * 24);
  },
  formatDays(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return `${num.toFixed(2)} days`;
  },
  formatDecimal(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return num.toFixed(2);
  },
  formatPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return `${num.toFixed(2)}%`;
  },
  isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(this.text(value));
  },
  normalizeCompanyKey(value = '') {
    return this.text(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(inc|llc|ltd|co|corp|corporation|company|the)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },
  isAnnualSaasLocationItem(item = {}) {
    const section = this.norm(item.section);
    const itemName = this.norm(item.item_name);
    if (!section && !itemName) return false;
    const oneTime = ['one_time_fee', 'one_time', 'one time', 'one-time', 'setup', 'implementation', 'onboarding'];
    if (oneTime.some(token => section.includes(token) || itemName.includes(token))) return false;
    return ['annual_saas', 'saas', 'subscription', 'recurring', 'annual', 'yearly', '12 month', '12-month']
      .some(token => section.includes(token) || itemName.includes(token));
  },
  isActiveAnnualSaasLocationItem(item = {}) {
    if (!this.isAnnualSaasLocationItem(item)) return false;
    const start = this.toDate(item.service_start_date);
    if (!start) return false;
    const end = this.toDate(item.service_end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    if (today < start) return false;
    if (!end) return true;
    end.setHours(0, 0, 0, 0);
    return today <= end;
  },
  getCurrentStage(account = {}) {
    if (account.receiptsCount > 0) return 'Receipt';
    if (account.invoicesCount > 0) return 'Invoice';
    if (account.agreementsCount > 0) return 'Agreement';
    if (account.proposalsCount > 0) return 'Proposal';
    if (account.dealsCount > 0) return 'Deal';
    if (account.leadsCount > 0) return 'Lead';
    return 'Unknown';
  },
  classifyPaymentState(totalInvoiced, totalPaid, totalDue) {
    const invoiced = this.num(totalInvoiced);
    const paid = this.num(totalPaid);
    const due = this.num(totalDue);
    if (invoiced <= 0) return 'Not Invoiced';
    if (due <= 0 && paid > 0) return 'Paid';
    if (paid > 0 && due > 0) return 'Partially Paid';
    return 'Unpaid';
  },
  derivePaymentStateFromInvoices(invoices = [], totalInvoiced = 0, totalPaid = 0, totalDue = 0) {
    const states = invoices.map(row => this.norm(row.payment_state)).filter(Boolean);
    if (states.length) {
      if (states.every(value => value.includes('paid') && !value.includes('partial') && !value.includes('unpaid'))) return 'Paid';
      if (states.some(value => value.includes('partial'))) return 'Partially Paid';
      if (states.some(value => value.includes('unpaid') || value.includes('overdue') || value.includes('due'))) return 'Unpaid';
    }
    return this.classifyPaymentState(totalInvoiced, totalPaid, totalDue);
  },
  statusBadge(status = '') {
    const label = this.text(status) || '—';
    return `<span class="pill status-${U.toStatusClass(label)}">${this.escape(label)}</span>`;
  },
  async fetchTable(db, table, columns, options = {}) {
    const pageSize = Math.max(50, Math.min(200, Number(options.pageSize) || 200));
    const maxRows = Math.max(pageSize, Math.min(1000, Number(options.maxRows) || 1000));
    const rows = [];
    let page = 0;
    // temporary analytics fallback - replace with SQL view/RPC aggregation
    while (rows.length < maxRows) {
      const from = page * pageSize;
      const to = from + pageSize;
      const { data, error } = await db.from(table).select(columns).range(from, to);
      if (error) throw new Error(`Unable to load ${table}: ${error.message || 'Unknown error'}`);
      const batch = Array.isArray(data) ? data.slice(0, pageSize) : [];
      rows.push(...batch);
      if (batch.length < pageSize) break;
      page += 1;
    }
    return rows.slice(0, maxRows);
  },

  async fetchOnboardingRows(db) {
    const preferredColumns = 'agreement_id,agreement_number,company_id,company_name,client_name,customer_name,customer_legal_name,onboarding_status,technical_request_status,csm_assigned_to,go_live_date,go_live_at,completed_at,updated_at';
    const fallbackColumns = 'agreement_id,agreement_number,client_name,onboarding_status,technical_request_status,csm_assigned_to,go_live_date,go_live_at,completed_at,updated_at';
    try {
      return await this.fetchTable(db, 'operations_onboarding', preferredColumns);
    } catch (error) {
      const message = String(error?.message || '');
      const missingColumn = /column .* does not exist/i.test(message);
      if (!missingColumn) throw error;
      try {
        return await this.fetchTable(db, 'operations_onboarding', fallbackColumns);
      } catch (fallbackError) {
        this.state.warnings.push('Onboarding data is partially unavailable in this environment; showing lifecycle analytics without onboarding details.');
        console.warn('[LifecycleAnalytics] operations_onboarding optional load failed', fallbackError);
        return [];
      }
    }
  },
  async loadData() {
    const db = window.SupabaseClient?.getClient?.();
    if (!db || typeof db.from !== 'function') throw new Error('Supabase client is not available.');

    const [
      leads,
      deals,
      proposals,
      agreements,
      agreementItems,
      invoices,
      receipts,
      clients,
      onboarding,
      technical
    ] = await Promise.all([
      this.fetchTable(db, 'leads', 'id,lead_id,company_name,legal_name,full_name,email,phone,status,assigned_to,created_at,updated_at'),
      this.fetchTable(db, 'deals', 'id,deal_id,lead_id,company_name,customer_name,customer_legal_name,full_name,email,status,stage,assigned_to,created_at,updated_at'),
      this.fetchTable(db, 'proposals', 'id,proposal_id,ref_number,deal_id,customer_name,customer_legal_name,proposal_title,proposal_date,proposal_valid_until,service_start_date,service_end_date,contract_term,billing_frequency,payment_term,subtotal_locations,subtotal_one_time,total_discount,grand_total,status,currency,created_at,updated_at'),
      this.fetchTable(db, 'agreements', 'id,agreement_id,agreement_number,proposal_id,customer_name,customer_legal_name,service_start_date,service_end_date,signed_date,status,grand_total,billing_frequency,payment_term,currency,created_at,updated_at'),
      this.fetchTable(db, 'agreement_items', 'agreement_id,section,location_name,item_name,quantity,line_total,service_start_date,service_end_date'),
      this.fetchTable(db, 'invoices', 'id,invoice_id,invoice_number,client_id,agreement_id,proposal_id,issue_date,due_date,billing_frequency,payment_term,subtotal_locations,subtotal_one_time,invoice_total,received_amount,pending_amount,payment_state,payment_conclusion,status,currency,created_at,updated_at'),
      this.fetchTable(db, 'receipts', 'id,receipt_id,receipt_number,invoice_id,client_id,receipt_date,amount_received,invoice_total,pending_amount,payment_state,payment_conclusion,old_paid_total,paid_now,new_paid_total,created_at,updated_at'),
      this.fetchTable(db, 'clients', 'id,client_id,client_name,company_name,legal_name,source_agreement_id,total_agreements,total_locations,total_value,total_paid,total_due'),
      this.fetchOnboardingRows(db),
      this.fetchTable(db, 'technical_admin_requests', 'agreement_id,request_status,assigned_to,requested_at,completed_at,location_count')
    ]);

    return { leads, deals, proposals, agreements, agreementItems, invoices, receipts, clients, onboarding, technical };
  },
  buildAccountMap(data) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const accounts = new Map();
    const accountByLeadUuid = new Map();
    const accountByDealUuid = new Map();
    const accountByProposalUuid = new Map();
    const accountByAgreementUuid = new Map();
    const accountByInvoiceUuid = new Map();
    const clientsById = new Map();

    data.clients.forEach(row => {
      const clientUuid = this.text(row.id);
      if (clientUuid) clientsById.set(clientUuid, row);
    });

    const ensureAccount = ({ key = '', clientUuid = '', company = '', email = '' } = {}) => {
      const accountKey = key || (this.isUuid(clientUuid) ? `client:${clientUuid}` : `unknown:${accounts.size + 1}`);
      if (!accounts.has(accountKey)) {
        const client = this.isUuid(clientUuid) ? clientsById.get(clientUuid) : null;
        accounts.set(accountKey, {
          accountKey,
          clientUuid: this.text(client?.id || clientUuid),
          clientBusinessId: this.text(client?.client_id),
          companyName: this.getAnalyticsClientLegalName({ company_name: company }, client),
          primaryEmail: this.text(email),
          currency: 'USD',
          leads: [], deals: [], proposals: [], agreements: [], invoices: [], receipts: [],
          onboarding: [], technical: [], locationItems: [],
          stages: {},
          lifecycleChain: {},
          metrics: {}
        });
      }
      const account = accounts.get(accountKey);
      if (!account.companyName && company) account.companyName = this.getAnalyticsClientLegalName({ company_name: company }, account);
      if (!account.primaryEmail && email) account.primaryEmail = this.text(email);
      if (this.isUuid(clientUuid) && !account.clientUuid) account.clientUuid = clientUuid;
      if (!account.clientBusinessId && this.isUuid(account.clientUuid)) {
        account.clientBusinessId = this.text(clientsById.get(account.clientUuid)?.client_id);
      }
      return account;
    };

    data.leads.forEach(row => {
      const leadUuid = this.text(row.id);
      const account = ensureAccount({ key: leadUuid ? `lead:${leadUuid}` : '', company: row.company_name || row.full_name, email: row.email });
      account.leads.push(row);
      if (leadUuid) accountByLeadUuid.set(leadUuid, account.accountKey);
      if (!account.stages.lead) account.stages.lead = row.created_at || row.updated_at;
    });

    data.deals.forEach(row => {
      const dealUuid = this.text(row.id);
      const leadUuid = this.text(row.lead_id);
      const parentAccountKey = this.isUuid(leadUuid) ? accountByLeadUuid.get(leadUuid) : '';
      const account = parentAccountKey ? accounts.get(parentAccountKey) : ensureAccount({ key: dealUuid ? `deal:${dealUuid}` : '', company: row.company_name || row.full_name, email: row.email });
      account.deals.push(row);
      if (dealUuid) accountByDealUuid.set(dealUuid, account.accountKey);
      if (!account.stages.deal) account.stages.deal = row.created_at || row.updated_at;
    });

    data.proposals.forEach(row => {
      const proposalUuid = this.text(row.id);
      const dealUuid = this.text(row.deal_id);
      const parentAccountKey = this.isUuid(dealUuid) ? accountByDealUuid.get(dealUuid) : '';
      const account = parentAccountKey ? accounts.get(parentAccountKey) : ensureAccount({ key: proposalUuid ? `proposal:${proposalUuid}` : '', company: row.customer_name });
      account.proposals.push(row);
      if (proposalUuid) accountByProposalUuid.set(proposalUuid, account.accountKey);
      account.currency = this.text(row.currency) || account.currency;
      if (!account.stages.proposal) account.stages.proposal = row.created_at || row.updated_at || row.proposal_date;
    });

    data.agreements.forEach(row => {
      const agreementUuid = this.text(row.id);
      const proposalUuid = this.text(row.proposal_id);
      const parentAccountKey = this.isUuid(proposalUuid) ? accountByProposalUuid.get(proposalUuid) : '';
      const account = parentAccountKey ? accounts.get(parentAccountKey) : ensureAccount({ key: agreementUuid ? `agreement:${agreementUuid}` : '', company: row.customer_name });
      account.agreements.push(row);
      if (agreementUuid) accountByAgreementUuid.set(agreementUuid, account.accountKey);
      account.currency = this.text(row.currency) || account.currency;
      if (!account.stages.agreement) account.stages.agreement = row.created_at || row.signed_date || row.updated_at;
    });

    data.agreementItems.forEach(item => {
      const agreementUuid = this.text(item.agreement_id);
      const accountKey = this.isUuid(agreementUuid) ? accountByAgreementUuid.get(agreementUuid) : '';
      if (!accountKey || !accounts.has(accountKey)) return;
      accounts.get(accountKey).locationItems.push(item);
    });

    data.invoices.forEach(row => {
      const invoiceUuid = this.text(row.id);
      const agreementUuid = this.text(row.agreement_id);
      const parentAccountKey = this.isUuid(agreementUuid) ? accountByAgreementUuid.get(agreementUuid) : '';
      const account = parentAccountKey
        ? accounts.get(parentAccountKey)
        : ensureAccount({ key: invoiceUuid ? `invoice:${invoiceUuid}` : '', clientUuid: this.text(row.client_id) });
      account.invoices.push(row);
      if (invoiceUuid) accountByInvoiceUuid.set(invoiceUuid, account.accountKey);
      account.currency = this.text(row.currency) || account.currency;
      if (!account.stages.invoice) account.stages.invoice = row.created_at || row.issued_at || row.updated_at || row.issue_date;
    });

    data.receipts.forEach(row => {
      const invoiceUuid = this.text(row.invoice_id);
      const parentAccountKey = this.isUuid(invoiceUuid) ? accountByInvoiceUuid.get(invoiceUuid) : '';
      const account = parentAccountKey
        ? accounts.get(parentAccountKey)
        : ensureAccount({ key: row.id ? `receipt:${this.text(row.id)}` : '', clientUuid: this.text(row.client_id) });
      account.receipts.push(row);
      if (!account.stages.receipt) account.stages.receipt = row.created_at || row.updated_at || row.receipt_date;
    });

    data.onboarding.forEach(row => {
      const agreementUuid = this.text(row.agreement_id);
      const accountKey = this.isUuid(agreementUuid) ? accountByAgreementUuid.get(agreementUuid) : '';
      if (!accountKey || !accounts.has(accountKey)) return;
      accounts.get(accountKey).onboarding.push(row);
    });

    data.technical.forEach(row => {
      const agreementUuid = this.text(row.agreement_id);
      const accountKey = this.isUuid(agreementUuid) ? accountByAgreementUuid.get(agreementUuid) : '';
      if (!accountKey || !accounts.has(accountKey)) return;
      accounts.get(accountKey).technical.push(row);
    });

    return { accounts: [...accounts.values()], today };
  },
  buildLifecycleMetrics(account = {}, today = new Date()) {
    const stageDate = stage => this.toDate(account.stages?.[stage]);
    const stageNames = ['lead', 'deal', 'proposal', 'agreement', 'invoice'];
    const stageDurations = {};
    stageNames.forEach((stage, idx) => {
      const start = stageDate(stage);
      if (!start) return;
      const nextStage = stageNames[idx + 1] || 'receipt';
      const next = stageDate(nextStage) || today;
      stageDurations[stage] = this.calculateDecimalDays(start, next);
    });

    const allActivityDates = [
      ...account.leads.map(item => item.updated_at || item.created_at),
      ...account.deals.map(item => item.updated_at || item.created_at),
      ...account.proposals.map(item => item.created_at || item.updated_at || item.proposal_date),
      ...account.agreements.map(item => item.created_at || item.signed_at || item.signed_date || item.updated_at),
      ...account.invoices.map(item => item.created_at || item.issued_at || item.updated_at || item.issue_date),
      ...account.receipts.map(item => item.created_at || item.updated_at || item.payment_date || item.receipt_date),
      ...account.onboarding.map(item => item.updated_at || item.go_live_date || item.go_live_at || item.completed_at),
      ...account.technical.map(item => item.completed_at || item.requested_at)
    ].filter(Boolean);

    const firstDate = allActivityDates.map(value => this.toDate(value)).filter(Boolean).sort((a, b) => a.getTime() - b.getTime())[0] || null;
    const lastDate = allActivityDates.map(value => this.toDate(value)).filter(Boolean).sort((a, b) => b.getTime() - a.getTime())[0] || null;

    const proposalSent = account.proposals.map(item => this.toDate(item.created_at || item.updated_at || item.proposal_date)).filter(Boolean).sort((a, b) => a.getTime() - b.getTime())[0] || null;
    const agreementSigned = account.agreements.map(item => this.toDate(item.signed_at || item.created_at || item.signed_date || item.updated_at)).filter(Boolean).sort((a, b) => a.getTime() - b.getTime())[0] || null;

    const discounts = account.proposals.map(item => {
      const base = this.num(item.subtotal_locations) + this.num(item.subtotal_one_time);
      const discount = this.num(item.total_discount);
      if (base <= 0 || discount <= 0) return 0;
      return Number(((discount / base) * 100).toFixed(2));
    }).filter(value => value > 0);
    const averageDiscount = discounts.length ? Number((discounts.reduce((sum, value) => sum + value, 0) / discounts.length).toFixed(2)) : 0;

    const biggestStage = Object.entries(stageDurations)
      .filter(([, value]) => value !== null)
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))[0] || null;

    return {
      daysInLead: stageDurations.lead ?? null,
      daysInDeal: stageDurations.deal ?? null,
      daysInProposal: stageDurations.proposal ?? null,
      daysInAgreement: stageDurations.agreement ?? null,
      daysInInvoice: stageDurations.invoice ?? null,
      totalCycleDuration: stageDate('lead') && lastDate ? this.calculateDecimalDays(stageDate('lead'), lastDate) : null,
      stageChanges: ['lead', 'deal', 'proposal', 'agreement', 'invoice', 'receipt'].filter(stage => stageDate(stage)).length,
      approvalDelay: proposalSent && agreementSigned ? this.calculateDecimalDays(proposalSent, agreementSigned) : null,
      lastActivityAge: lastDate ? this.calculateDecimalDays(lastDate, today) : null,
      averageDiscount,
      stuckStage: biggestStage && biggestStage[1] >= 10 ? biggestStage[0] : 'None',
      bottleneckWarning: biggestStage && biggestStage[1] >= 14 ? `${biggestStage[0]} delayed ${biggestStage[1]} days` : '',
      lastActivityDate: lastDate ? lastDate.toISOString() : ''
    };
  },
  normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  },
  getOperationalReadiness(onboarding) {
    if (!onboarding) return 'Not Started Yet';
    const status = this.normalizeText(onboarding.onboarding_status || onboarding.onboardingStatus || onboarding.status);
    if (['completed', 'complete', 'done'].includes(status)) return 'Completed';
    if (['in progress', 'active', 'ongoing'].includes(status)) return 'In Progress';
    return 'Not Started Yet';
  },
  getActualGoLiveDate(onboarding) {
    const readiness = this.getOperationalReadiness(onboarding);
    if (readiness !== 'Completed') return '';
    return (
      onboarding.go_live_date || onboarding.goLiveDate || onboarding.go_live_at || onboarding.goLiveAt || onboarding.completed_at || onboarding.completedAt || ''
    );
  },
  findRelatedOnboarding(account = {}, rows = []) {
    if (!Array.isArray(rows) || !rows.length) return null;
    const agreements = Array.isArray(account.agreements) ? account.agreements : [];
    const agreementIds = new Set(agreements.map(item => this.text(item.id)).filter(Boolean));
    const agreementNumbers = new Set(agreements.map(item => this.normalizeText(item.agreement_number)).filter(Boolean));
    const companyIds = new Set([this.text(account.clientUuid)].filter(Boolean));
    const legalNames = new Set([
      this.normalizeText(account.legalName),
      ...agreements.map(item => this.normalizeText(item.customer_legal_name))
    ].filter(Boolean));
    const companyNames = new Set([
      this.normalizeText(account.companyName),
      ...agreements.map(item => this.normalizeText(item.customer_name))
    ].filter(Boolean));

    const findLatest = candidates => candidates
      .slice()
      .sort((a, b) => (this.toDate(b.updated_at || b.go_live_at || b.go_live_date || b.completed_at)?.getTime() || 0) - (this.toDate(a.updated_at || a.go_live_at || a.go_live_date || a.completed_at)?.getTime() || 0))[0] || null;

    const byAgreementId = rows.filter(row => agreementIds.has(this.text(row.agreement_id)));
    if (byAgreementId.length) return findLatest(byAgreementId);
    const byAgreementNumber = rows.filter(row => agreementNumbers.has(this.normalizeText(row.agreement_number)));
    if (byAgreementNumber.length) return findLatest(byAgreementNumber);
    const byCompanyId = rows.filter(row => companyIds.has(this.text(row.company_id)));
    if (byCompanyId.length) return findLatest(byCompanyId);
    const byLegalName = rows.filter(row => legalNames.has(this.normalizeText(row.customer_legal_name)));
    if (byLegalName.length) return findLatest(byLegalName);
    const byClientName = rows.filter(row => companyNames.has(this.normalizeText(row.client_name || row.customer_name)));
    if (byClientName.length) return findLatest(byClientName);
    return null;
  },
  summarizeOperationalStatus(rows = [], type = 'onboarding') {
    if (!rows.length) return 'None';
    const values = rows.map(row => this.norm(type === 'onboarding' ? row.onboarding_status : row.request_status));
    if (values.some(value => value.includes('block'))) return 'Blocked';
    if (values.some(value => value.includes('progress') || value.includes('pending') || value.includes('requested'))) return 'Pending';
    if (values.every(value => value.includes('complete') || value.includes('closed'))) return 'Completed';
    return 'Pending';
  },
  buildAccountAnalytics(account, today) {
    const agreementValue = account.agreements.reduce((sum, row) => sum + this.num(row.grand_total), 0);
    const totalInvoiced = account.invoices.reduce((sum, row) => sum + this.num(row.invoice_total), 0);
    const receiptsPaid = account.receipts.reduce((sum, row) => sum + this.num(row.amount_received), 0);
    const invoicePaid = account.invoices.reduce((sum, row) => sum + this.num(row.received_amount), 0);
    const totalPaid = receiptsPaid > 0 ? receiptsPaid : invoicePaid;
    const dueFromInvoices = account.invoices.reduce((sum, row) => sum + this.num(row.pending_amount), 0);
    const totalDue = Math.max(dueFromInvoices || totalInvoiced - totalPaid, 0);

    const locationItems = account.locationItems.filter(item => this.isAnnualSaasLocationItem(item));
    const activeLocations = locationItems.filter(item => this.isActiveAnnualSaasLocationItem(item));
    const renewalDates = locationItems
      .map(item => this.toDate(item.service_end_date))
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime());
    const nextRenewalDate = renewalDates.find(date => date.getTime() >= today.getTime()) || renewalDates[0] || null;
    const daysToRenewal = nextRenewalDate ? this.calculateDecimalDays(today, nextRenewalDate) : null;

    let renewalExposure = 'No Renewal Date';
    if (daysToRenewal !== null) {
      if (daysToRenewal < 0) renewalExposure = 'Overdue';
      else if (daysToRenewal <= 30) renewalExposure = 'Expiring ≤30 days';
      else if (daysToRenewal <= 90) renewalExposure = 'Expiring ≤90 days';
      else renewalExposure = 'Healthy';
    }

    const lifecycle = this.buildLifecycleMetrics(account, today);
    const paymentState = this.derivePaymentStateFromInvoices(account.invoices, totalInvoiced, totalPaid, totalDue);
    const onboardingStatus = this.summarizeOperationalStatus(account.onboarding, 'onboarding');
    const technicalStatus = this.summarizeOperationalStatus(account.technical, 'technical');

    const relatedOnboarding = this.findRelatedOnboarding(account, account.onboarding);
    const latestTechnical = account.technical
      .slice()
      .sort((a, b) => (this.toDate(b.completed_at || b.requested_at)?.getTime() || 0) - (this.toDate(a.completed_at || a.requested_at)?.getTime() || 0))[0] || null;

    const openClientRequest = account.onboarding.some(row => {
      const status = this.norm(row.onboarding_status);
      return status.includes('pending') || status.includes('progress') || status.includes('block');
    });
    const openTechnicalRequest = account.technical.some(row => {
      const status = this.norm(row.request_status);
      return !(status.includes('complete') || status.includes('closed'));
    });

    const row = {
      ...account,
      legalName: this.getAnalyticsClientLegalName(account, account),
      currentStage: this.getCurrentStage({
        leadsCount: account.leads.length,
        dealsCount: account.deals.length,
        proposalsCount: account.proposals.length,
        agreementsCount: account.agreements.length,
        invoicesCount: account.invoices.length,
        receiptsCount: account.receipts.length
      }),
      leadsCount: account.leads.length,
      dealsCount: account.deals.length,
      proposalsCount: account.proposals.length,
      agreementsCount: account.agreements.length,
      invoicesCount: account.invoices.length,
      receiptsCount: account.receipts.length,
      agreementValue,
      totalInvoiced,
      totalPaid,
      totalDue,
      locationsCount: locationItems.length,
      activeLocationsCount: activeLocations.length,
      nextRenewal: nextRenewalDate ? nextRenewalDate.toISOString() : '',
      renewalExposure,
      paymentState,
      paymentHealth: paymentState,
      onboardingStatus,
      technicalStatus,
      assignedCsm: this.text(relatedOnboarding?.csm_assigned_to),
      goLiveDate: this.text(this.getActualGoLiveDate(relatedOnboarding)),
      openClientRequest,
      openTechnicalRequest,
      operationalReadiness: this.getOperationalReadiness(relatedOnboarding),
      lastActivity: lifecycle.lastActivityDate,
      lifecycle,
      lifecycleChain: {
        lead: this.text(account.leads[0]?.lead_id || account.leads[0]?.id),
        deal: this.text(account.deals[0]?.deal_id || account.deals[0]?.id),
        proposal: this.text(account.proposals[0]?.proposal_id || account.proposals[0]?.id),
        agreement: this.text(account.agreements[0]?.agreement_id || account.agreements[0]?.id),
        invoice: this.text(account.invoices[0]?.invoice_id || account.invoices[0]?.id),
        receipt: this.text(account.receipts[0]?.receipt_id || account.receipts[0]?.id)
      },
      latestTechnicalStatus: this.text(latestTechnical?.request_status)
    };
    return row;
  },
  buildOverview(rows = [], raw = {}) {
    const totalLocations = rows.reduce((sum, row) => sum + row.locationsCount, 0);
    const totalInvoiced = rows.reduce((sum, row) => sum + row.totalInvoiced, 0);
    const totalPaid = rows.reduce((sum, row) => sum + row.totalPaid, 0);
    const totalDue = rows.reduce((sum, row) => sum + row.totalDue, 0);
    const dueRenewal = rows.filter(row => ['Expiring ≤30 days', 'Overdue'].includes(row.renewalExposure)).length;
    const activeOnboarding = rows.filter(row => row.onboardingStatus === 'Pending').length;
    const openTechnical = rows.reduce((sum, row) => sum + (row.openTechnicalRequest ? 1 : 0), 0);

    return {
      totalLeads: raw.leads?.length || 0,
      totalDeals: raw.deals?.length || 0,
      totalProposals: raw.proposals?.length || 0,
      totalAgreements: raw.agreements?.length || 0,
      totalInvoices: raw.invoices?.length || 0,
      totalReceipts: raw.receipts?.length || 0,
      totalClients: raw.clients?.length || 0,
      totalLocations,
      totalInvoiced,
      totalPaid,
      totalDue,
      accountsDueForRenewal: dueRenewal,
      activeOnboardingAccounts: activeOnboarding,
      openTechnicalAdminRequests: openTechnical
    };
  },
  matchesDateRange(row) {
    const from = this.toDate(this.state.filters.dateFrom);
    const to = this.toDate(this.state.filters.dateTo);
    if (!from && !to) return true;
    const last = this.toDate(row.lastActivity);
    if (!last) return false;
    if (from && last < from) return false;
    if (to && last > to) return false;
    return true;
  },
  applyFilters() {
    const f = this.state.filters;
    const q = this.norm(f.search);
    this.state.filteredRows = this.state.rows.filter(row => {
      if (q) {
        const haystack = [
          row.companyName,
          row.legalName,
          row.clientBusinessId,
          row.currentStage,
          row.lifecycleChain.lead,
          row.lifecycleChain.deal,
          row.lifecycleChain.proposal,
          row.lifecycleChain.agreement,
          row.lifecycleChain.invoice,
          row.lifecycleChain.receipt,
          row.assignedCsm
        ].map(item => this.norm(item)).join(' ');
        if (!haystack.includes(q)) return false;
      }
      if (f.stage !== 'All' && row.currentStage !== f.stage) return false;
      if (f.paymentState !== 'All' && row.paymentState !== f.paymentState) return false;
      if (f.onboardingStatus !== 'All' && row.onboardingStatus !== f.onboardingStatus) return false;
      if (f.technicalStatus !== 'All' && row.technicalStatus !== f.technicalStatus) return false;
      if (f.client !== 'All' && row.accountKey !== f.client) return false;
      if (f.locationState === 'Active Only' && row.activeLocationsCount <= 0) return false;
      if (f.locationState === 'Inactive Only' && row.activeLocationsCount > 0) return false;
      if (f.renewalWindow !== 'All') {
        if (f.renewalWindow === '≤30 Days' && row.renewalExposure !== 'Expiring ≤30 days') return false;
        if (f.renewalWindow === '≤90 Days' && !['Expiring ≤30 days', 'Expiring ≤90 days'].includes(row.renewalExposure)) return false;
        if (f.renewalWindow === 'Overdue' && row.renewalExposure !== 'Overdue') return false;
      }
      if (!this.matchesDateRange(row)) return false;
      return true;
    });
  },
  populateFilterOptions() {
    const setOptions = (id, values, withAll = true) => {
      const el = document.getElementById(id);
      if (!el) return;
      const unique = [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
      const options = withAll ? ['All', ...unique] : unique;
      el.innerHTML = options.map(value => `<option value="${this.escape(value)}">${this.escape(value)}</option>`).join('');
    };

    setOptions('lifecycleClientFilter', this.state.rows.map(row => row.accountKey), true);
    const clientSelect = document.getElementById('lifecycleClientFilter');
    if (clientSelect) {
      clientSelect.innerHTML = ['All', ...this.state.rows.map(row => row.accountKey)]
        .map(key => {
          if (key === 'All') return '<option value="All">All Clients</option>';
          const row = this.state.rows.find(item => item.accountKey === key);
          const label = this.getAnalyticsClientLegalName(row || {}, row || {}) || row?.clientBusinessId || key;
          return `<option value="${this.escape(key)}">${this.escape(label)}</option>`;
        })
        .join('');
    }
  },
  renderOverview() {
    const root = document.getElementById('lifecycleSummaryCards');
    if (!root) return;
    const o = this.state.overview;
    const cards = [
      ['Total Leads', o.totalLeads],
      ['Total Deals', o.totalDeals],
      ['Total Proposals', o.totalProposals],
      ['Total Agreements', o.totalAgreements],
      ['Total Invoices', o.totalInvoices],
      ['Total Receipts', o.totalReceipts],
      ['Total Clients', o.totalClients],
      ['Total Locations', o.totalLocations],
      ['Total Invoiced', this.fmtMoney(o.totalInvoiced)],
      ['Total Paid', this.fmtMoney(o.totalPaid)],
      ['Total Due', this.fmtMoney(o.totalDue)],
      ['Accounts Due for Renewal', o.accountsDueForRenewal],
      ['Active Onboarding Accounts', o.activeOnboardingAccounts],
      ['Open Technical Admin Requests', o.openTechnicalAdminRequests]
    ];
    root.innerHTML = cards
      .map(([label, value]) => `<div class="card kpi"><div class="label">${this.escape(label)}</div><div class="value">${this.escape(String(value ?? 0))}</div></div>`)
      .join('');
  },
  renderTable() {
    const tbody = document.getElementById('lifecycleRecordsTbody');
    const state = document.getElementById('lifecycleState');
    if (!tbody || !state) return;
    const rows = this.state.filteredRows;
    const warningText = (this.state.warnings || []).join(' ');
    state.textContent = `${rows.length} account${rows.length === 1 ? '' : 's'} in 360 analytics.${warningText ? ` ${warningText}` : ''}`;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="14" class="muted" style="text-align:center;">No accounts match the selected filters.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(row => `<tr>
        <td><button class="btn ghost sm" type="button" data-open-360="${this.escape(row.accountKey)}">Open</button></td>
        <td>${this.escape(this.getAnalyticsClientLegalName(row, row) || row.clientBusinessId || '—')}</td>
        <td>${this.escape(row.currentStage)}</td>
        <td>${this.escape(row.lifecycleChain.lead || '—')} → ${this.escape(row.lifecycleChain.deal || '—')} → ${this.escape(row.lifecycleChain.proposal || '—')} → ${this.escape(row.lifecycleChain.agreement || '—')} → ${this.escape(row.lifecycleChain.invoice || '—')} → ${this.escape(row.lifecycleChain.receipt || '—')}</td>
        <td>${this.fmtMoney(row.agreementValue, row.currency)}</td>
        <td>${this.fmtMoney(row.totalInvoiced, row.currency)}</td>
        <td>${this.fmtMoney(row.totalPaid, row.currency)}</td>
        <td>${this.fmtMoney(row.totalDue, row.currency)}</td>
        <td>${this.escape(String(row.locationsCount))} (${this.escape(String(row.activeLocationsCount))} active)</td>
        <td>${this.escape(U.fmtDisplayDate(row.nextRenewal) || '—')}</td>
        <td>${this.statusBadge(row.paymentState)}</td>
        <td>${this.statusBadge(row.onboardingStatus)}</td>
        <td>${this.statusBadge(row.technicalStatus)}</td>
        <td>${this.escape(U.fmtDisplayDate(row.lastActivity) || '—')}</td>
      </tr>`)
      .join('');
  },
  renderDetail() {
    const detailRoot = document.getElementById('lifecycleDetailPanel');
    if (!detailRoot) return;
    const selected = this.state.rows.find(row => row.accountKey === this.state.selectedAccountKey);
    if (!selected) {
      detailRoot.innerHTML = '<div class="muted">Select an account to view full lifecycle, financial, and operations 360 details.</div>';
      return;
    }

    const lifecycleEntries = [
      ['Days in Lead', selected.lifecycle.daysInLead],
      ['Days in Deal', selected.lifecycle.daysInDeal],
      ['Days in Proposal', selected.lifecycle.daysInProposal],
      ['Days in Agreement', selected.lifecycle.daysInAgreement],
      ['Days in Invoice', selected.lifecycle.daysInInvoice],
      ['Total Cycle Duration', selected.lifecycle.totalCycleDuration],
      ['Number of Stage Changes', selected.lifecycle.stageChanges],
      ['Approval Delay', selected.lifecycle.approvalDelay],
      ['Last Activity Age', selected.lifecycle.lastActivityAge],
      ['Average Discount', this.formatPercent(selected.lifecycle.averageDiscount)],
      ['Stuck Stage', selected.lifecycle.stuckStage],
      ['Bottleneck Warning', selected.lifecycle.bottleneckWarning || '—']
    ];

    detailRoot.innerHTML = `
      <div class="grid cols-4">
        <div class="card"><div class="label">Client</div><div class="value">${this.escape(this.getAnalyticsClientLegalName(selected, selected) || '—')}</div></div>
        <div class="card"><div class="label">Current Stage</div><div class="value">${this.escape(selected.currentStage)}</div></div>
        <div class="card"><div class="label">Agreement Value</div><div class="value">${this.escape(this.fmtMoney(selected.agreementValue, selected.currency))}</div></div>
        <div class="card"><div class="label">Payment Health</div><div class="value">${this.escape(selected.paymentHealth)}</div></div>
        <div class="card"><div class="label">Invoices / Receipts</div><div class="value">${this.escape(String(selected.invoicesCount))} / ${this.escape(String(selected.receiptsCount))}</div></div>
        <div class="card"><div class="label">Locations</div><div class="value">${this.escape(String(selected.locationsCount))} (${this.escape(String(selected.activeLocationsCount))} active)</div></div>
        <div class="card"><div class="label">Next Renewal</div><div class="value">${this.escape(this.fmtDate(selected.nextRenewal))}</div></div>
        <div class="card"><div class="label">Renewal Exposure</div><div class="value">${this.escape(selected.renewalExposure)}</div></div>
        <div class="card"><div class="label">Onboarding Status</div><div class="value">${this.escape(selected.onboardingStatus)}</div></div>
        <div class="card"><div class="label">Technical Admin Status</div><div class="value">${this.escape(selected.technicalStatus)}</div></div>
        <div class="card"><div class="label">Assigned CSM</div><div class="value">${this.escape(selected.assignedCsm || '—')}</div></div>
        <div class="card"><div class="label">Go Live Date</div><div class="value">${this.escape((selected.goLiveDate ? this.formatDateTime(selected.goLiveDate) : '—'))}</div></div>
        <div class="card"><div class="label">Open Client Request</div><div class="value">${this.escape(selected.openClientRequest ? 'Yes' : 'No')}</div></div>
        <div class="card"><div class="label">Open Technical Request</div><div class="value">${this.escape(selected.openTechnicalRequest ? 'Yes' : 'No')}</div></div>
        <div class="card"><div class="label">Operational Readiness</div><div class="value">${this.escape(selected.operationalReadiness)}</div></div>
      </div>
      ${this.renderLifecycleTimeline(selected)}
      <section class="card" style="margin-top:10px;">
        <strong>Lifecycle Metrics</strong>
        <div class="grid cols-4" style="margin-top:10px;">
          ${lifecycleEntries
            .map(([label, value]) => {
              const formattedValue = (() => {
                if (value === null || value === undefined || value === '') return '—';
                if ([
                  'Days in Lead',
                  'Days in Deal',
                  'Days in Proposal',
                  'Days in Agreement',
                  'Days in Invoice',
                  'Total Cycle Duration',
                  'Approval Delay',
                  'Last Activity Age'
                ].includes(label)) return this.formatDays(value);
                if (label === 'Number of Stage Changes') return String(value);
                if (label === 'Average Discount') return String(value);
                if (typeof value === 'number') return this.formatDecimal(value);
                return String(value);
              })();
              return `<div class="card"><div class="label">${this.escape(label)}</div><div class="value">${this.escape(formattedValue)}</div></div>`;
            })
            .join('')}
        </div>
      </section>
    `;
  },
  renderLoading() {
    const state = document.getElementById('lifecycleState');
    const tbody = document.getElementById('lifecycleRecordsTbody');
    if (state) state.textContent = 'Loading 360 analytics…';
    if (tbody) tbody.innerHTML = '<tr><td colspan="14" class="muted" style="text-align:center;">Loading 360 analytics…</td></tr>';
    const detailRoot = document.getElementById('lifecycleDetailPanel');
    if (detailRoot) detailRoot.innerHTML = '<div class="muted">Loading account-level analytics…</div>';
  },
  renderError(message) {
    const state = document.getElementById('lifecycleState');
    if (state) state.textContent = message;
    const tbody = document.getElementById('lifecycleRecordsTbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="14" class="muted" style="text-align:center;color:#ffb4b4;">${this.escape(message)}</td></tr>`;
  },
  renderAll() {
    this.renderOverview();
    this.renderTable();
    this.renderDetail();
  },
  async refresh({ force = false } = {}) {
    if (this.state.loading && !force) return;
    this.state.loading = true;
    this.state.warnings = [];
    this.renderLoading();
    try {
      const raw = await this.loadData();
      const { accounts, today } = this.buildAccountMap(raw);
      const rows = accounts
        .map(account => this.buildAccountAnalytics(account, today))
        .filter(row => row.companyName || row.clientBusinessId || row.agreementsCount || row.invoicesCount || row.receiptsCount);
      this.state.rows = rows.sort((a, b) => String(this.getAnalyticsClientLegalName(a, a) || '').localeCompare(String(this.getAnalyticsClientLegalName(b, b) || '')));
      this.state.overview = this.buildOverview(this.state.rows, raw);
      this.populateFilterOptions();
      this.applyFilters();
      if (!this.state.selectedAccountKey && this.state.filteredRows.length) {
        this.state.selectedAccountKey = this.state.filteredRows[0].accountKey;
      }
      if (this.state.selectedAccountKey && !this.state.rows.some(row => row.accountKey === this.state.selectedAccountKey)) {
        this.state.selectedAccountKey = this.state.filteredRows[0]?.accountKey || '';
      }
      this.renderAll();
    } catch (error) {
      this.state.loadError = String(error?.message || 'Unable to load 360 analytics.').trim();
      this.renderError(this.state.loadError);
    } finally {
      this.state.loading = false;
    }
  },
  bindFilter(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      this.state.filters[key] = this.text(el.value || 'All');
      this.applyFilters();
      if (this.state.filteredRows.length && !this.state.filteredRows.some(row => row.accountKey === this.state.selectedAccountKey)) {
        this.state.selectedAccountKey = this.state.filteredRows[0].accountKey;
      }
      this.renderAll();
    });
  },
  wire() {
    const search = document.getElementById('lifecycleSearchInput');
    if (search) {
      search.addEventListener('input', () => {
        this.state.filters.search = this.text(search.value);
        this.applyFilters();
        this.renderTable();
      });
    }

    this.bindFilter('lifecycleStageFilter', 'stage');
    this.bindFilter('lifecyclePaymentStateFilter', 'paymentState');
    this.bindFilter('lifecycleOnboardingFilter', 'onboardingStatus');
    this.bindFilter('lifecycleTechnicalFilter', 'technicalStatus');
    this.bindFilter('lifecycleRenewalFilter', 'renewalWindow');
    this.bindFilter('lifecycleLocationFilter', 'locationState');
    this.bindFilter('lifecycleClientFilter', 'client');
    this.bindFilter('lifecycleDateFrom', 'dateFrom');
    this.bindFilter('lifecycleDateTo', 'dateTo');

    const refreshBtn = document.getElementById('lifecycleSearchBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.refresh({ force: true }));

    const exportBtn = document.getElementById('lifecycleExportBtn');
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportRows());

    const tbody = document.getElementById('lifecycleRecordsTbody');
    if (tbody) {
      tbody.addEventListener('click', event => {
        const btn = event.target.closest('[data-open-360]');
        if (!btn) return;
        this.state.selectedAccountKey = this.text(btn.getAttribute('data-open-360'));
        this.renderDetail();
      });
    }
  },
  init() {
    if (this.state.initialized) return;
    this.state.initialized = true;
    this.wire();
    this.refresh({ force: true });
  }
  ,
  exportRows() {
    const rows = this.state.filteredRows || [];
    const headers = ['Client Name', 'Current Stage', 'Payment Status', 'Onboarding Status', 'Technical Status', 'Renewal Status', 'Invoice Number', 'Receipt Number', 'Agreement Number', 'Proposal Number'];
    const csv = [
      headers.join(','),
      ...rows.map(row => [
        this.getAnalyticsClientLegalName(row, row),
        row.currentStage,
        row.paymentState,
        row.onboardingStatus,
        row.technicalStatus,
        row.renewalExposure,
        row.lifecycleChain?.invoice || '',
        row.lifecycleChain?.receipt || '',
        row.lifecycleChain?.agreement || '',
        row.lifecycleChain?.proposal || ''
      ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-360-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
};

window.LifecycleAnalytics = LifecycleAnalytics;
