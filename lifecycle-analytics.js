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
    }
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
  toDate(value) {
    const raw = this.text(value);
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  },
  daysBetween(fromValue, toValue) {
    const from = this.toDate(fromValue);
    const to = this.toDate(toValue);
    if (!from || !to) return null;
    return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000));
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
    const section = this.norm(item.section || item.category || item.type);
    const billing = this.norm(item.billing_frequency);
    const itemName = this.norm(item.item_name);
    if (!section && !itemName && !billing) return false;
    const oneTime = ['one_time_fee', 'one_time', 'one time', 'one-time', 'setup', 'implementation', 'onboarding'];
    if (oneTime.some(token => section.includes(token) || itemName.includes(token))) return false;
    const saasFamily = ['annual_saas', 'saas', 'subscription', 'recurring'];
    if (!saasFamily.some(token => section.includes(token) || itemName.includes(token))) return false;
    return ['annual', 'yearly', '12 month', '12-month'].some(token => section.includes(token) || billing.includes(token) || itemName.includes(token));
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
  statusBadge(status = '') {
    const label = this.text(status) || '—';
    return `<span class="pill status-${U.toStatusClass(label)}">${this.escape(label)}</span>`;
  },
  async fetchTable(db, table, columns) {
    const { data, error } = await db.from(table).select(columns).limit(5000);
    if (error) throw new Error(`Unable to load ${table}: ${error.message || 'Unknown error'}`);
    return Array.isArray(data) ? data : [];
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
      this.fetchTable(db, 'leads', 'id,lead_id,company_name,full_name,email,phone,status,assigned_to,created_at,updated_at'),
      this.fetchTable(db, 'deals', 'id,deal_id,lead_id,company_name,full_name,email,status,stage,assigned_to,created_at,updated_at'),
      this.fetchTable(db, 'proposals', 'id,proposal_id,deal_id,lead_id,customer_name,customer_contact_email,status,discount_percent,grand_total,created_at,sent_at,updated_at'),
      this.fetchTable(db, 'agreements', 'id,agreement_id,agreement_number,proposal_id,deal_id,lead_id,customer_name,customer_legal_name,customer_contact_email,status,grand_total,currency,service_start_date,service_end_date,agreement_date,customer_sign_date,created_at,updated_at,generated_by'),
      this.fetchTable(db, 'agreement_items', 'id,agreement_id,section,item_name,billing_frequency,service_start_date,service_end_date,line_total,created_at,updated_at'),
      this.fetchTable(db, 'invoices', 'id,invoice_id,invoice_number,agreement_id,client_id,customer_name,customer_legal_name,status,payment_state,invoice_total,received_amount,pending_amount,currency,issue_date,due_date,created_at,updated_at'),
      this.fetchTable(db, 'receipts', 'id,receipt_id,receipt_number,invoice_id,agreement_id,client_id,customer_name,customer_legal_name,status,payment_state,amount_received,currency,receipt_date,created_at,updated_at'),
      this.fetchTable(db, 'clients', 'id,client_id,client_name,company_name,status,primary_email,created_at,updated_at'),
      this.fetchTable(db, 'operations_onboarding', 'id,onboarding_id,agreement_id,client_id,client_name,onboarding_status,csm_assigned_to,go_live_target_date,open_client_request,technical_request_status,requested_at,completed_at,updated_at,created_at'),
      this.fetchTable(db, 'technical_admin_requests', 'id,request_id,agreement_id,onboarding_id,client_id,client_name,request_status,technical_request_status,assigned_to,technical_admin_assigned_to,requested_at,completed_at,updated_at,created_at')
    ]);

    return { leads, deals, proposals, agreements, agreementItems, invoices, receipts, clients, onboarding, technical };
  },
  buildAccountMap(data) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const accounts = new Map();
    const clientsById = new Map();
    const clientsByCompany = new Map();

    data.clients.forEach(row => {
      const id = this.text(row.id);
      if (id) clientsById.set(id, row);
      const key = this.normalizeCompanyKey(row.company_name || row.client_name);
      if (key && !clientsByCompany.has(key)) clientsByCompany.set(key, row);
    });

    const ensureAccount = ({ clientUuid = '', company = '', email = '' } = {}) => {
      const companyKey = this.normalizeCompanyKey(company);
      const key = clientUuid || (companyKey ? `company:${companyKey}` : email ? `email:${this.norm(email)}` : `unknown:${accounts.size + 1}`);
      if (!accounts.has(key)) {
        const client = clientUuid ? clientsById.get(clientUuid) : companyKey ? clientsByCompany.get(companyKey) : null;
        accounts.set(key, {
          accountKey: key,
          clientUuid: this.text(client?.id || clientUuid),
          clientBusinessId: this.text(client?.client_id),
          companyName: this.text(client?.company_name || client?.client_name || company),
          primaryEmail: this.text(client?.primary_email || email),
          currency: 'USD',
          leads: [], deals: [], proposals: [], agreements: [], invoices: [], receipts: [],
          onboarding: [], technical: [], locationItems: [],
          stages: {},
          lifecycleChain: {},
          metrics: {}
        });
      }
      const account = accounts.get(key);
      if (!account.companyName && company) account.companyName = this.text(company);
      if (!account.primaryEmail && email) account.primaryEmail = this.text(email);
      if (clientUuid && !account.clientUuid) account.clientUuid = clientUuid;
      return account;
    };

    const leadByUuid = new Map();
    data.leads.forEach(row => {
      const uuid = this.text(row.id);
      if (uuid) leadByUuid.set(uuid, row);
      const account = ensureAccount({ company: row.company_name || row.full_name, email: row.email });
      account.leads.push(row);
      if (!account.stages.lead) account.stages.lead = row.created_at || row.updated_at;
    });

    const dealByUuid = new Map();
    data.deals.forEach(row => {
      const uuid = this.text(row.id);
      if (uuid) dealByUuid.set(uuid, row);
      const leadLink = this.text(row.lead_id);
      const linkedLead = this.isUuid(leadLink) ? leadByUuid.get(leadLink) : null;
      const account = ensureAccount({
        company: row.company_name || linkedLead?.company_name || row.full_name,
        email: row.email || linkedLead?.email
      });
      account.deals.push(row);
      if (!account.stages.deal) account.stages.deal = row.created_at || row.updated_at;
    });

    const proposalByUuid = new Map();
    data.proposals.forEach(row => {
      const uuid = this.text(row.id);
      if (uuid) proposalByUuid.set(uuid, row);
      const dealLink = this.text(row.deal_id);
      const linkedDeal = this.isUuid(dealLink) ? dealByUuid.get(dealLink) : null;
      const account = ensureAccount({
        company: row.customer_name || linkedDeal?.company_name,
        email: row.customer_contact_email || linkedDeal?.email
      });
      account.proposals.push(row);
      if (!account.stages.proposal) account.stages.proposal = row.created_at || row.updated_at;
    });

    const agreementByUuid = new Map();
    const agreementToAccountKey = new Map();
    data.agreements.forEach(row => {
      const uuid = this.text(row.id);
      if (uuid) agreementByUuid.set(uuid, row);
      const proposalLink = this.text(row.proposal_id);
      const linkedProposal = this.isUuid(proposalLink) ? proposalByUuid.get(proposalLink) : null;
      const account = ensureAccount({
        company: row.customer_legal_name || row.customer_name || linkedProposal?.customer_name,
        email: row.customer_contact_email || linkedProposal?.customer_contact_email
      });
      account.agreements.push(row);
      if (uuid) agreementToAccountKey.set(uuid, account.accountKey);
      account.currency = this.text(row.currency) || account.currency;
      if (!account.stages.agreement) account.stages.agreement = row.created_at || row.updated_at || row.agreement_date;
    });

    data.agreementItems.forEach(item => {
      const agreementUuid = this.text(item.agreement_id);
      const accountKey = agreementToAccountKey.get(agreementUuid);
      if (!accountKey || !accounts.has(accountKey)) return;
      accounts.get(accountKey).locationItems.push(item);
    });

    const invoiceByUuid = new Map();
    const invoiceToAccountKey = new Map();
    data.invoices.forEach(row => {
      const uuid = this.text(row.id);
      if (uuid) invoiceByUuid.set(uuid, row);
      const clientUuid = this.text(row.client_id);
      const agreementUuid = this.text(row.agreement_id);
      const accountKeyFromAgreement = agreementToAccountKey.get(agreementUuid);
      const account = ensureAccount({
        clientUuid: this.isUuid(clientUuid) ? clientUuid : '',
        company: row.customer_legal_name || row.customer_name,
        email: ''
      });
      const resolvedAccount = accountKeyFromAgreement && accounts.has(accountKeyFromAgreement) ? accounts.get(accountKeyFromAgreement) : account;
      resolvedAccount.invoices.push(row);
      if (uuid) invoiceToAccountKey.set(uuid, resolvedAccount.accountKey);
      resolvedAccount.currency = this.text(row.currency) || resolvedAccount.currency;
      if (!resolvedAccount.stages.invoice) resolvedAccount.stages.invoice = row.issue_date || row.created_at || row.updated_at;
    });

    data.receipts.forEach(row => {
      const invoiceUuid = this.text(row.invoice_id);
      const accountKeyFromInvoice = invoiceToAccountKey.get(invoiceUuid);
      const clientUuid = this.text(row.client_id);
      const account = ensureAccount({
        clientUuid: this.isUuid(clientUuid) ? clientUuid : '',
        company: row.customer_legal_name || row.customer_name,
        email: ''
      });
      const resolvedAccount = accountKeyFromInvoice && accounts.has(accountKeyFromInvoice) ? accounts.get(accountKeyFromInvoice) : account;
      resolvedAccount.receipts.push(row);
      resolvedAccount.currency = this.text(row.currency) || resolvedAccount.currency;
      if (!resolvedAccount.stages.receipt) resolvedAccount.stages.receipt = row.receipt_date || row.created_at || row.updated_at;
    });

    const attachOperationalRows = (rows, targetKey) => {
      rows.forEach(row => {
        const agreementUuid = this.text(row.agreement_id);
        const clientUuid = this.text(row.client_id);
        const accountKeyFromAgreement = agreementToAccountKey.get(agreementUuid);
        const account = accountKeyFromAgreement && accounts.has(accountKeyFromAgreement)
          ? accounts.get(accountKeyFromAgreement)
          : ensureAccount({
              clientUuid: this.isUuid(clientUuid) ? clientUuid : '',
              company: row.client_name,
              email: ''
            });
        account[targetKey].push(row);
      });
    };

    attachOperationalRows(data.onboarding, 'onboarding');
    attachOperationalRows(data.technical, 'technical');

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
      stageDurations[stage] = this.daysBetween(start.toISOString(), next.toISOString());
    });

    const allActivityDates = [
      ...account.leads.map(item => item.updated_at || item.created_at),
      ...account.deals.map(item => item.updated_at || item.created_at),
      ...account.proposals.map(item => item.updated_at || item.sent_at || item.created_at),
      ...account.agreements.map(item => item.updated_at || item.customer_sign_date || item.created_at),
      ...account.invoices.map(item => item.updated_at || item.issue_date || item.created_at),
      ...account.receipts.map(item => item.updated_at || item.receipt_date || item.created_at),
      ...account.onboarding.map(item => item.updated_at || item.requested_at || item.created_at),
      ...account.technical.map(item => item.updated_at || item.requested_at || item.created_at)
    ].filter(Boolean);

    const firstDate = allActivityDates.map(value => this.toDate(value)).filter(Boolean).sort((a, b) => a.getTime() - b.getTime())[0] || null;
    const lastDate = allActivityDates.map(value => this.toDate(value)).filter(Boolean).sort((a, b) => b.getTime() - a.getTime())[0] || null;

    const proposalSent = account.proposals.map(item => this.toDate(item.sent_at || item.created_at)).filter(Boolean).sort((a, b) => a.getTime() - b.getTime())[0] || null;
    const agreementSigned = account.agreements.map(item => this.toDate(item.customer_sign_date || item.created_at)).filter(Boolean).sort((a, b) => a.getTime() - b.getTime())[0] || null;

    const discounts = account.proposals.map(item => this.num(item.discount_percent)).filter(value => value > 0);
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
      totalCycleDuration: firstDate && lastDate ? this.daysBetween(firstDate.toISOString(), lastDate.toISOString()) : null,
      stageChanges: ['lead', 'deal', 'proposal', 'agreement', 'invoice', 'receipt'].filter(stage => stageDate(stage)).length,
      approvalDelay: proposalSent && agreementSigned ? this.daysBetween(proposalSent.toISOString(), agreementSigned.toISOString()) : null,
      lastActivityAge: lastDate ? this.daysBetween(lastDate.toISOString(), today.toISOString()) : null,
      averageDiscount,
      stuckStage: biggestStage && biggestStage[1] >= 10 ? biggestStage[0] : 'None',
      bottleneckWarning: biggestStage && biggestStage[1] >= 14 ? `${biggestStage[0]} delayed ${biggestStage[1]} days` : '',
      lastActivityDate: lastDate ? lastDate.toISOString() : ''
    };
  },
  summarizeOperationalStatus(rows = [], type = 'onboarding') {
    if (!rows.length) return 'None';
    const values = rows.map(row => this.norm(type === 'onboarding' ? row.onboarding_status : row.request_status || row.technical_request_status));
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
    const daysToRenewal = nextRenewalDate ? this.daysBetween(today.toISOString(), nextRenewalDate.toISOString()) : null;

    let renewalExposure = 'No Renewal Date';
    if (daysToRenewal !== null) {
      if (daysToRenewal < 0) renewalExposure = 'Overdue';
      else if (daysToRenewal <= 30) renewalExposure = 'Expiring ≤30 days';
      else if (daysToRenewal <= 90) renewalExposure = 'Expiring ≤90 days';
      else renewalExposure = 'Healthy';
    }

    const lifecycle = this.buildLifecycleMetrics(account, today);
    const paymentState = this.classifyPaymentState(totalInvoiced, totalPaid, totalDue);
    const onboardingStatus = this.summarizeOperationalStatus(account.onboarding, 'onboarding');
    const technicalStatus = this.summarizeOperationalStatus(account.technical, 'technical');

    const latestOnboarding = account.onboarding
      .slice()
      .sort((a, b) => (this.toDate(b.updated_at || b.created_at)?.getTime() || 0) - (this.toDate(a.updated_at || a.created_at)?.getTime() || 0))[0] || null;
    const latestTechnical = account.technical
      .slice()
      .sort((a, b) => (this.toDate(b.updated_at || b.created_at)?.getTime() || 0) - (this.toDate(a.updated_at || a.created_at)?.getTime() || 0))[0] || null;

    const openClientRequest = account.onboarding.some(row => this.norm(row.open_client_request) === 'yes' || this.norm(row.open_client_request) === 'true');
    const openTechnicalRequest = account.technical.some(row => {
      const status = this.norm(row.request_status || row.technical_request_status);
      return !(status.includes('complete') || status.includes('closed'));
    });

    const row = {
      ...account,
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
      assignedCsm: this.text(latestOnboarding?.csm_assigned_to),
      goLiveTargetDate: this.text(latestOnboarding?.go_live_target_date),
      openClientRequest,
      openTechnicalRequest,
      operationalReadiness:
        onboardingStatus === 'Completed' && (technicalStatus === 'Completed' || technicalStatus === 'None')
          ? 'Ready'
          : onboardingStatus === 'Blocked' || technicalStatus === 'Blocked'
          ? 'Blocked'
          : 'In Progress',
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
      latestTechnicalStatus: this.text(latestTechnical?.request_status || latestTechnical?.technical_request_status)
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
          const label = row?.companyName || row?.clientBusinessId || key;
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
    state.textContent = `${rows.length} account${rows.length === 1 ? '' : 's'} in 360 analytics.`;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="14" class="muted" style="text-align:center;">No accounts match the selected filters.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(row => `<tr>
        <td><button class="btn ghost sm" type="button" data-open-360="${this.escape(row.accountKey)}">Open</button></td>
        <td>${this.escape(row.companyName || row.clientBusinessId || '—')}</td>
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
      ['Average Discount', `${selected.lifecycle.averageDiscount}%`],
      ['Stuck Stage', selected.lifecycle.stuckStage],
      ['Bottleneck Warning', selected.lifecycle.bottleneckWarning || '—']
    ];

    detailRoot.innerHTML = `
      <div class="grid cols-4">
        <div class="card"><div class="label">Client</div><div class="value">${this.escape(selected.companyName || '—')}</div></div>
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
        <div class="card"><div class="label">Go-live Target</div><div class="value">${this.escape(this.fmtDate(selected.goLiveTargetDate))}</div></div>
        <div class="card"><div class="label">Open Client Request</div><div class="value">${this.escape(selected.openClientRequest ? 'Yes' : 'No')}</div></div>
        <div class="card"><div class="label">Open Technical Request</div><div class="value">${this.escape(selected.openTechnicalRequest ? 'Yes' : 'No')}</div></div>
        <div class="card"><div class="label">Operational Readiness</div><div class="value">${this.escape(selected.operationalReadiness)}</div></div>
      </div>
      <section class="card" style="margin-top:10px;">
        <strong>Lifecycle Metrics</strong>
        <div class="grid cols-4" style="margin-top:10px;">
          ${lifecycleEntries
            .map(([label, value]) => `<div class="card"><div class="label">${this.escape(label)}</div><div class="value">${this.escape(value === null || value === undefined || value === '' ? '—' : String(typeof value === 'number' && label.includes('Days') ? `${value} days` : value))}</div></div>`)
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
    this.renderLoading();
    try {
      const raw = await this.loadData();
      const { accounts, today } = this.buildAccountMap(raw);
      const rows = accounts
        .map(account => this.buildAccountAnalytics(account, today))
        .filter(row => row.companyName || row.clientBusinessId || row.agreementsCount || row.invoicesCount || row.receiptsCount);
      this.state.rows = rows.sort((a, b) => String(a.companyName || '').localeCompare(String(b.companyName || '')));
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
    if (exportBtn) exportBtn.addEventListener('click', () => UI.toast('Export for 360 analytics will be enabled in a follow-up release.'));

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
};

window.LifecycleAnalytics = LifecycleAnalytics;
