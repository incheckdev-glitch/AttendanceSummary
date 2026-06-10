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
  toMoneyNumber(value) {
    const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  },
  num(value) {
    return this.toMoneyNumber(value);
  },
  escape(value) {
    return U.escapeHtml(String(value ?? ''));
  },
  fmtDate(value) {
    const raw = this.text(value);
    return raw ? U.fmtDisplayDate(raw) : '—';
  },
  formatDateTime(value) {
    const raw = this.text(value);
    return raw ? U.formatDateTimeMMDDYYYYHHMM(raw) : '—';
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
  getRelatedNote(record = {}) {
    const noteFields = ['note', 'notes', 'comment', 'comments', 'remark', 'remarks', 'description', 'status_note', 'completion_note', 'action_note', 'change_reason'];
    for (const field of noteFields) {
      const value = record?.[field];
      if (value === null || value === undefined || typeof value === 'object') continue;
      const note = this.text(value);
      if (note) return note;
    }
    return 'No note';
  },
  getLatestRelatedRecordTimestamp(record = {}) {
    const timestampFields = ['created_at', 'updated_at', 'action_at', 'requested_at', 'completed_at', 'changed_at'];
    return timestampFields.reduce((latest, field) => Math.max(latest, this.parseEventTimestamp(record?.[field]) || 0), 0);
  },
  getLatestRelatedRecordDate(record = {}) {
    const timestampFields = ['created_at', 'updated_at', 'action_at', 'requested_at', 'completed_at', 'changed_at'];
    return timestampFields.reduce((latest, field) => {
      const timestamp = this.parseEventTimestamp(record?.[field]) || 0;
      return timestamp > latest.timestamp ? { timestamp, value: record?.[field] } : latest;
    }, { timestamp: 0, value: '' }).value;
  },
  normalizeLifecycleEntityType(value) {
    return this.norm(value).replace(/[^a-z0-9]/g, '').replace(/s$/, '');
  },
  getLatestLifecycleNote(account = {}, item = {}, entityType = '', entityId = '', entityNumber = '') {
    const references = [entityId, entityNumber, item?.id, item?.uuid, item?.entity_id, item?.entity_number]
      .map(value => this.text(value))
      .filter(Boolean);
    const normalizedType = this.normalizeLifecycleEntityType(entityType);
    const logs = (Array.isArray(account?.lifecycleStatusLogs) ? account.lifecycleStatusLogs : [])
      .filter(log => {
        const logReferences = [log?.entity_id, log?.entity_number].map(value => this.text(value)).filter(Boolean);
        const referenceMatches = references.length && logReferences.some(reference => references.includes(reference));
        const logType = this.normalizeLifecycleEntityType(log?.entity_type);
        return referenceMatches && (!normalizedType || !logType || logType === normalizedType || logType.includes(normalizedType) || normalizedType.includes(logType));
      })
      .slice()
      .sort((a, b) => this.getLatestRelatedRecordTimestamp(b) - this.getLatestRelatedRecordTimestamp(a));
    return this.getRelatedNote(logs[0] || item);
  },
  getLifecycleCompanyId(chain = {}) {
    return String(
      chain?.company_id ||
      chain?.company_uuid ||
      chain?.companyId ||
      chain?.companyUuid ||
      chain?.uuid ||
      chain?.lead?.company_id ||
      chain?.lead?.company_uuid ||
      chain?.lead?.companyId ||
      chain?.lead?.companyUuid ||
      chain?.deal?.company_id ||
      chain?.deal?.company_uuid ||
      chain?.deal?.companyId ||
      chain?.deal?.companyUuid ||
      chain?.proposal?.company_id ||
      chain?.proposal?.company_uuid ||
      chain?.proposal?.companyId ||
      chain?.proposal?.companyUuid ||
      chain?.agreement?.company_id ||
      chain?.agreement?.company_uuid ||
      chain?.agreement?.companyId ||
      chain?.agreement?.companyUuid ||
      chain?.invoice?.company_id ||
      chain?.invoice?.company_uuid ||
      chain?.invoice?.companyId ||
      chain?.invoice?.companyUuid ||
      chain?.receipt?.company_id ||
      chain?.receipt?.company_uuid ||
      chain?.receipt?.companyId ||
      chain?.receipt?.companyUuid ||
      ""
    ).trim();
  },
  getCompanyIdKeys(company = {}) {
    return [company.id, company.company_id, company.company_uuid, company.uuid, company.companyId, company.companyUuid]
      .map(value => this.text(value))
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
    ].map(value => this.norm(value)).filter(Boolean);
  },
  buildCompanyLookupMaps(companies = []) {
    const safeCompanies = Array.isArray(companies) ? companies.filter(Boolean) : [];
    const companiesById = new Map();
    const companiesByName = new Map();

    safeCompanies.forEach(company => {
      this.getCompanyIdKeys(company).forEach(key => {
        if (!companiesById.has(key)) companiesById.set(key, company);
      });
      this.getCompanyNameKeys(company).forEach(key => {
        if (!companiesByName.has(key)) companiesByName.set(key, company);
      });
    });

    return { companiesById, companiesByName };
  },
  getLifecycleClientLegalName(chain = {}, linkedCompany = null) {
    return String(
      linkedCompany?.legal_company_name ||
      linkedCompany?.legalCompanyName ||
      linkedCompany?.legal_name ||
      linkedCompany?.legalName ||
      chain?.legal_company_name ||
      chain?.legalCompanyName ||
      chain?.customer_legal_name ||
      chain?.customerLegalName ||
      chain?.legal_name ||
      chain?.legalName ||
      chain?.lead?.customer_legal_name ||
      chain?.lead?.customerLegalName ||
      chain?.lead?.legal_name ||
      chain?.lead?.legalName ||
      chain?.deal?.customer_legal_name ||
      chain?.deal?.customerLegalName ||
      chain?.deal?.legal_name ||
      chain?.deal?.legalName ||
      chain?.proposal?.customer_legal_name ||
      chain?.proposal?.customerLegalName ||
      chain?.proposal?.legal_name ||
      chain?.proposal?.legalName ||
      chain?.agreement?.customer_legal_name ||
      chain?.agreement?.customerLegalName ||
      chain?.agreement?.legal_name ||
      chain?.agreement?.legalName ||
      chain?.invoice?.customer_legal_name ||
      chain?.invoice?.customerLegalName ||
      chain?.invoice?.legal_name ||
      chain?.invoice?.legalName ||
      chain?.receipt?.customer_legal_name ||
      chain?.receipt?.customerLegalName ||
      chain?.receipt?.legal_name ||
      chain?.receipt?.legalName ||
      chain?.customer_name ||
      chain?.customerName ||
      chain?.lead?.customer_name ||
      chain?.lead?.customerName ||
      chain?.deal?.customer_name ||
      chain?.deal?.customerName ||
      chain?.proposal?.customer_name ||
      chain?.proposal?.customerName ||
      chain?.agreement?.customer_name ||
      chain?.agreement?.customerName ||
      chain?.invoice?.customer_name ||
      chain?.invoice?.customerName ||
      chain?.receipt?.customer_name ||
      chain?.receipt?.customerName ||
      linkedCompany?.company_name ||
      linkedCompany?.companyName ||
      chain?.company_name ||
      chain?.companyName ||
      chain?.lead?.company_name ||
      chain?.lead?.companyName ||
      chain?.deal?.company_name ||
      chain?.deal?.companyName ||
      chain?.proposal?.company_name ||
      chain?.proposal?.companyName ||
      chain?.agreement?.company_name ||
      chain?.agreement?.companyName ||
      chain?.invoice?.company_name ||
      chain?.invoice?.companyName ||
      chain?.receipt?.company_name ||
      chain?.receipt?.companyName ||
      chain?.client_name ||
      chain?.clientName ||
      ''
    ).trim();
  },
  resolveLifecycleCompany(chain = {}, companiesById = new Map(), companiesByName = new Map()) {
    const companyId = this.getLifecycleCompanyId(chain);
    if (companyId && companiesById.has(companyId)) return companiesById.get(companyId);
    const possibleNames = [
      chain?.legal_company_name, chain?.legalCompanyName, chain?.customer_legal_name, chain?.customerLegalName, chain?.legal_name, chain?.legalName,
      chain?.customer_name, chain?.customerName, chain?.company_name, chain?.companyName, chain?.client_name, chain?.clientName,
      chain?.lead?.legal_company_name, chain?.lead?.customer_legal_name, chain?.lead?.legal_name, chain?.lead?.customer_name, chain?.lead?.company_name, chain?.lead?.client_name,
      chain?.deal?.legal_company_name, chain?.deal?.customer_legal_name, chain?.deal?.legal_name, chain?.deal?.customer_name, chain?.deal?.company_name, chain?.deal?.client_name,
      chain?.proposal?.legal_company_name, chain?.proposal?.customer_legal_name, chain?.proposal?.legal_name, chain?.proposal?.customer_name, chain?.proposal?.company_name, chain?.proposal?.client_name,
      chain?.agreement?.legal_company_name, chain?.agreement?.customer_legal_name, chain?.agreement?.legal_name, chain?.agreement?.customer_name, chain?.agreement?.company_name, chain?.agreement?.client_name,
      chain?.invoice?.legal_company_name, chain?.invoice?.customer_legal_name, chain?.invoice?.legal_name, chain?.invoice?.customer_name, chain?.invoice?.company_name, chain?.invoice?.client_name,
      chain?.receipt?.legal_company_name, chain?.receipt?.customer_legal_name, chain?.receipt?.legal_name, chain?.receipt?.customer_name, chain?.receipt?.company_name, chain?.receipt?.client_name
    ];
    for (const name of possibleNames) {
      const key = this.norm(name);
      if (key && companiesByName.has(key)) return companiesByName.get(key);
    }
    return null;
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
        config.userLabel && item[config.userField] ? `${config.userLabel}: ${this.text(item[config.userField])}` : '',
        config.noteBuilder ? this.text(config.noteBuilder(item)) : ''
      ].filter(Boolean);

      const statusFields = config.statusFields || ['status'];
      const currentStatus = statusFields.map(field => this.text(item?.[field])).find(Boolean) || '';
      const entityType = config.entityType || String(config.type || '').replace(/_(created|signed)$/, '');
      const entityId = this.text(item.id || item.uuid || '');
      const entityNumber = (config.numberFields || [config.codeField]).map(field => this.text(item?.[field])).find(Boolean) || entityId;
      const latestNote = this.getLatestLifecycleNote(account, item, entityType, entityId, entityNumber);
      events.push({ type: config.type, entityType, entityId, entityNumber, currentStatus, latestNote, title: config.title, sortTimestamp, displayDate, metadata });
    };

    const leads = (account.leads || []).slice();
    const deals = (account.deals || []).slice();
    const proposals = (account.proposals || []).slice();
    const agreements = (account.agreements || []).slice();
    const invoices = (account.invoices || []).slice();
    const receipts = (account.receipts || []).slice();

    if (leads[0]) pushEvent(leads[0], { type:'lead_created', entityType:'lead', title:'Lead created', numberFields:['lead_id','lead_number'], statusFields:['status'], codeLabel:'Lead', codeField:'lead_id', userLabel:'Assigned to', userField:'assigned_to', candidates:['created_at','createdAt','lead_created_at','created_date','date','updated_at'], displayField:'created_at' });
    if (deals[0]) pushEvent(deals[0], { type:'deal_created', entityType:'deal', title:'Deal created', numberFields:['deal_id','deal_number'], statusFields:['stage','status'], codeLabel:'Deal', codeField:'deal_id', userLabel:'Assigned to', userField:'assigned_to', candidates:['created_at','createdAt','converted_at','deal_created_at','created_date','updated_at'], displayField:'created_at', noteBuilder:item=>item.stage?`Stage: ${item.stage}`:'' });
    if (proposals[0]) pushEvent(proposals[0], { type:'proposal_created', entityType:'proposal', title:'Proposal created', numberFields:['proposal_id','proposal_number','ref_number'], statusFields:['status'], codeLabel:'Proposal', codeField:'proposal_id', candidates:['created_at','createdAt','proposal_created_at','created_date','proposal_date'], displayField:'created_at', noteBuilder:item=>item.ref_number?`Ref: ${item.ref_number}`:'' });
    if (agreements[0]) pushEvent(agreements[0], { type:'agreement_signed', entityType:'agreement', title:'Agreement signed', numberFields:['agreement_number','agreement_id'], statusFields:['status','agreement_status'], codeLabel:'Agreement', codeField:'agreement_id', candidates:['signed_at','signedAt','agreement_signed_at','updated_at','created_at','agreement_date'], displayField:'signed_at', noteBuilder:item=>item.agreement_number?`Agreement No: ${item.agreement_number}`:'' });
    if (invoices[0]) pushEvent(invoices[0], { type:'invoice_created', entityType:'invoice', title:'Invoice created', numberFields:['invoice_number','invoice_id'], statusFields:['status','payment_status','payment_state'], codeLabel:'Invoice', codeField:'invoice_id', candidates:['created_at','createdAt','invoice_created_at','issued_at','invoice_date'], displayField:'created_at', noteBuilder:item=>item.invoice_number?`Invoice No: ${item.invoice_number}`:'' });

    receipts.forEach((receipt, idx) => pushEvent(receipt, { type: idx===0?'receipt_created':'additional_receipt_created', entityType:'receipt', title: idx===0?'Receipt created':'Additional receipt created', numberFields:['receipt_number','receipt_id'], statusFields:['status','receipt_status'], codeLabel:'Receipt', codeField:'receipt_id', candidates:['created_at','createdAt','receipt_created_at','issued_at','payment_date','receipt_date'], displayField:'created_at', noteBuilder:item=>item.receipt_number?`Receipt No: ${item.receipt_number}`:'' }));

    const additionalEntities = [
      ['creditNotes', 'credit_note', 'Credit note created', ['credit_note_number','credit_note_id'], ['status']],
      ['onboarding', 'operations_onboarding', 'Operations onboarding created', ['onboarding_id','agreement_id'], ['onboarding_status','status']],
      ['technical', 'technical_admin_request', 'Technical admin request created', ['request_id','technical_request_id'], ['request_status','technical_request_status','status']],
      ['tickets', 'ticket', 'Ticket created', ['ticket_id'], ['status']],
      ['events', 'event', 'Event created', ['event_id'], ['status']],
      ['binersEntries', 'biners_entry', 'Biners entry created', ['entry_number','schedule_number'], ['status','schedule_status']],
      ['binersSchedules', 'biners_schedule', 'Biners schedule created', ['schedule_number'], ['status','schedule_status']],
      ['paymentForecastFollowups', 'payment_forecast_follow_up', 'Payment forecast follow-up created', ['invoice_number','followup_id'], ['follow_up_status','status']]
    ];
    additionalEntities.forEach(([collection, entityType, title, numberFields, statusFields]) => {
      (account[collection] || []).forEach(item => pushEvent(item, { type: `${entityType}_created`, entityType, title, numberFields, statusFields, codeLabel: 'Entity', codeField: numberFields[0], candidates: ['created_at','createdAt','updated_at','updatedAt','date','scheduled_date'], displayField: 'created_at' }));
    });

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
                  <div class="muted">Status: ${this.escape(item.currentStatus || '—')}</div>
                  <div class="muted lifecycle-note"><strong>Latest Note:</strong> ${this.escape(item.latestNote || 'No note')}</div>
                  ${item.metadata.map(line => `<div class="muted">${this.escape(line)}</div>`).join('')}
                  <button type="button" class="btn ghost sm lifecycle-history-btn" data-lifecycle-history data-entity-type="${this.escape(item.entityType)}" data-entity-id="${this.escape(item.entityId)}" data-entity-number="${this.escape(item.entityNumber)}" data-current-status="${this.escape(item.currentStatus)}">View History</button>
                </div>
              </article>`
            )
            .join('')}
        </div>
      </section>
    `;
  },
  closeStatusHistory() {
    const modal = document.getElementById('lifecycleStatusHistoryModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  },
  async openStatusHistory(trigger) {
    const modal = document.getElementById('lifecycleStatusHistoryModal');
    const body = document.getElementById('lifecycleStatusHistoryBody');
    if (!modal || !body) return;
    const entityType = this.text(trigger?.dataset?.entityType);
    const entityId = this.text(trigger?.dataset?.entityId);
    const entityNumber = this.text(trigger?.dataset?.entityNumber);
    const currentStatus = this.text(trigger?.dataset?.currentStatus) || '—';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    body.innerHTML = '<div class="muted lifecycle-history-empty">Loading status history…</div>';
    try {
      const response = await Api.getLifecycleStatusHistory({ entity_type: entityType, entity_id: entityId, entity_number: entityNumber });
      const logs = (Array.isArray(response) ? response : (Array.isArray(response?.rows) ? response.rows : []))
        .slice()
        .sort((a, b) => this.getLatestRelatedRecordTimestamp(b) - this.getLatestRelatedRecordTimestamp(a));
      const cards = `<div class="lifecycle-history-cards">
        ${[['Entity Type', entityType || '—'], ['Entity #', entityNumber || entityId || '—'], ['Current Status', currentStatus], ['Total Changes', String(logs.length)]].map(([label, value]) => `<div class="card"><div class="label">${this.escape(label)}</div><div class="value">${this.escape(value)}</div></div>`).join('')}
      </div>`;
      if (!logs.length) {
        body.innerHTML = `${cards}<div class="muted lifecycle-history-empty">No status history found. Future status changes will appear here.</div>`;
        return;
      }
      body.innerHTML = `${cards}<div class="lifecycle-history-list">${logs.map(log => {
        const oldStatus = this.text(log.old_status) || 'Initial snapshot';
        const newStatus = this.text(log.new_status) || '—';
        const actor = this.text(log.changed_by_email || log.changed_by_name || log.changed_by) || '—';
        const note = this.getRelatedNote(log);
        const statusField = this.text(log.status_field);
        return `<article class="lifecycle-history-entry"><div class="lifecycle-history-entry__date">${this.escape(this.formatTimelineDate(this.getLatestRelatedRecordDate(log)))}</div><strong>${this.escape(oldStatus)} → ${this.escape(newStatus)}</strong><div class="muted">Changed by: ${this.escape(actor)}</div>${statusField ? `<div class="muted">Status field: ${this.escape(statusField)}</div>` : ''}<div class="muted lifecycle-note"><strong>Note:</strong> ${this.escape(note)}</div></article>`;
      }).join('')}</div>`;
    } catch (error) {
      body.innerHTML = `<div class="muted lifecycle-history-empty">Unable to load status history: ${this.escape(error?.message || 'Unknown error')}</div>`;
    }
  },
  parseDateSafe(value) {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
    const raw = this.text(value);
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  },
  toDate(value) {
    return this.parseDateSafe(value);
  },
  diffDays(startValue, endValue = new Date()) {
    const start = this.parseDateSafe(startValue);
    const end = this.parseDateSafe(endValue);
    if (!start || !end || end.getTime() < start.getTime()) return null;
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  },
  calculateDecimalDays(startValue, endValue = new Date()) {
    return this.diffDays(startValue, endValue);
  },
  getEarliestDate(...values) {
    const dates = values.flat(Infinity).map(value => this.parseDateSafe(value)).filter(Boolean);
    return dates.length ? new Date(Math.min(...dates.map(date => date.getTime()))) : null;
  },
  getLatestDate(...values) {
    const dates = values.flat(Infinity).map(value => this.parseDateSafe(value)).filter(Boolean);
    return dates.length ? new Date(Math.max(...dates.map(date => date.getTime()))) : null;
  },
  formatDays(value) {
    if (value === null || value === undefined || value === '') return '—';
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return `${num.toFixed(2)} days`;
  },
  formatDecimal(value) {
    if (value === null || value === undefined || value === '') return '—';
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return num.toFixed(2);
  },
  formatPercent(value) {
    if (value === null || value === undefined || value === '') return '—';
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
    const agreements = Array.isArray(account.agreements) ? account.agreements : [];
    const proposals = Array.isArray(account.proposals) ? account.proposals : [];
    const deals = Array.isArray(account.deals) ? account.deals : [];
    const leads = Array.isArray(account.leads) ? account.leads : [];
    if (agreements.some(row => this.isSignedAgreement(row))) return 'Agreement / Active Client';
    if (proposals.some(row => this.normalizeProposalStatus(row.status) === 'Accepted')) return 'Proposal Accepted';
    if (proposals.length > 0) return 'Proposal';
    if (deals.length > 0) return 'Deal';
    if (leads.some(row => this.normalizeLeadStatus(row.status) === 'Qualified')) return 'Qualified Lead';
    if (leads.length > 0) return 'Lead';
    return 'Prospect / Company Created';
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
    const states = invoices.map(row => this.norm(row.payment_state || row.payment_status || row.status)).filter(Boolean);
    if (states.length) {
      if (states.some(value => value.includes('partial'))) return 'Partially Paid';
      if (states.some(value => value.includes('overdue'))) return 'Overdue';
      if (states.every(value => value.includes('fully paid') || (value.includes('paid') && !value.includes('not') && !value.includes('unpaid') && !value.includes('partial')))) return 'Fully Paid';
      if (states.some(value => value.includes('not paid') || value.includes('unpaid') || value === 'draft')) return 'Not Paid';
    }
    const classified = this.classifyPaymentState(totalInvoiced, totalPaid, totalDue);
    if (classified === 'Paid') return 'Fully Paid';
    if (classified === 'Unpaid') return 'Not Paid';
    return classified;
  },
  firstValue(record = {}, keys = []) {
    for (const key of keys) {
      const value = record?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  },
  getRecordDate(record = {}, keys = []) {
    return this.firstValue(record, keys);
  },
  invoiceGrandTotal(row = {}) {
    return this.toMoneyNumber(this.firstValue(row, ['grand_total', 'invoice_total', 'total_amount', 'amount_due', 'total']));
  },
  invoicePaidAmount(row = {}) {
    return this.toMoneyNumber(this.firstValue(row, ['received_amount', 'amount_paid', 'paid_amount']));
  },
  invoicePendingAmount(row = {}) {
    const explicit = this.firstValue(row, ['pending_amount', 'balance_due']);
    if (explicit !== '') return this.toMoneyNumber(explicit);
    return Math.max(this.invoiceGrandTotal(row) - this.invoicePaidAmount(row) - this.creditNoteAmount(row), 0);
  },
  receiptPaidAmount(row = {}) {
    return this.toMoneyNumber(this.firstValue(row, ['amount_received', 'received_amount', 'paid_now', 'payment_amount', 'amount']));
  },
  creditNoteAmount(row = {}) {
    return this.toMoneyNumber(this.firstValue(row, ['credit_amount', 'amount']));
  },
  isValidCreditNote(row = {}) {
    const status = this.norm(row.status);
    return !['cancelled', 'canceled', 'void', 'voided', 'deleted', 'rejected'].some(token => status.includes(token));
  },
  isValidReceipt(row = {}) {
    const status = this.norm(row.status || row.payment_state || row.payment_status);
    return !['cancelled', 'canceled', 'void', 'voided', 'deleted', 'rejected'].some(token => status.includes(token));
  },
  normalizeLeadStatus(value) {
    const raw = this.norm(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!raw) return 'Unknown / Other';
    if (raw.includes('qualified')) return 'Qualified';
    if (raw.includes('lost')) return 'Lost';
    if (raw.includes('not available') || raw.includes('unavailable')) return 'Not Available';
    if (raw.includes('not contacted') || raw.includes('new') || raw.includes('open')) return 'Not Contacted Yet';
    if (raw.includes('negot')) return 'Negotiations';
    return 'Unknown / Other';
  },
  normalizeDealStage(value) {
    const raw = this.norm(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!raw) return 'Unknown / Other';
    if (raw.includes('converted') || raw.includes('proposal')) return 'Converted to Proposal';
    if (raw.includes('won')) return 'Won';
    if (raw.includes('lost')) return 'Lost';
    if (raw.includes('qualif')) return 'Qualified';
    if (raw.includes('negot')) return 'Negotiation';
    if (raw.includes('new') || raw.includes('open')) return 'New / Open';
    return raw.replace(/\b\w/g, c => c.toUpperCase());
  },
  normalizeProposalStatus(value) {
    const raw = this.norm(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!raw) return 'Unknown / Other';
    if (raw.includes('pending') && raw.includes('approval')) return 'Pending Approval';
    if (raw.includes('accept') || raw.includes('approved')) return 'Accepted';
    if (raw.includes('reject')) return 'Rejected';
    if (raw.includes('expire')) return 'Expired';
    if (raw.includes('cancel')) return 'Cancelled';
    if (raw.includes('sent')) return 'Sent';
    if (raw.includes('draft')) return 'Draft';
    return raw.replace(/\b\w/g, c => c.toUpperCase());
  },
  isSignedAgreement(row = {}) {
    const status = this.norm(row.status || row.agreement_status);
    return Boolean(row.signed_date || row.signed_at || status.includes('signed') || status.includes('active') || status.includes('executed'));
  },
  agreementValue(row = {}) {
    return this.toMoneyNumber(this.firstValue(row, ['grand_total', 'agreement_total', 'total_contract_value', 'total_amount', 'total']));
  },
  proposalValue(row = {}) {
    return this.toMoneyNumber(this.firstValue(row, ['grand_total', 'proposal_total', 'total_amount', 'total']));
  },
  dealValue(row = {}) {
    return this.toMoneyNumber(this.firstValue(row, ['deal_value', 'value', 'amount', 'estimated_value', 'expected_value']));
  },
  scheduleAmount(row = {}) {
    return this.toMoneyNumber(this.firstValue(row, ['scheduled_amount', 'amount_due', 'installment_amount', 'amount', 'total_amount']));
  },
  schedulePaidAmount(row = {}) {
    return this.toMoneyNumber(this.firstValue(row, ['paid_amount', 'amount_paid', 'received_amount']));
  },
  normalizeScheduleStatus(row = {}) {
    const raw = this.norm(row.status || row.payment_status || row.payment_state).replace(/[_-]+/g, ' ');
    if (raw.includes('cancel')) return 'Cancelled';
    if (raw.includes('partial')) return 'Partially Paid';
    if (raw.includes('paid')) return 'Paid';
    if (raw.includes('overdue')) return 'Overdue';
    return 'Scheduled';
  },
  getCompanyDisplayName(company = {}) {
    return this.text(company.legal_company_name || company.legalCompanyName || company.legal_name || company.legalName || company.company_name || company.companyName || company.name || company.customer_name || company.client_name);
  },
  getRecordCompanyKeys(record = {}, companiesById = new Map(), companiesByName = new Map()) {
    const linkedCompany = this.resolveLifecycleCompany(record, companiesById, companiesByName);
    const keys = [];
    this.getCompanyIdKeys(linkedCompany || {}).forEach(key => keys.push(`id:${key}`));
    this.getCompanyNameKeys(linkedCompany || {}).forEach(key => keys.push(`name:${key}`));
    [record.company_id, record.company_uuid, record.companyId, record.companyUuid, record.client_id, record.client_uuid, record.clientUuid].map(value => this.text(value)).filter(Boolean).forEach(key => keys.push(`id:${key}`));
    [record.legal_company_name, record.legalCompanyName, record.legal_name, record.legalName, record.company_name, record.companyName, record.customer_name, record.customerName, record.client_name, record.clientName, record.customer_legal_name, record.customerLegalName, record.legalName].map(value => this.norm(value)).filter(Boolean).forEach(key => keys.push(`name:${key}`));
    return [...new Set(keys)];
  },
  recordMatchesCompany(row = {}, account = {}, companiesById = new Map(), companiesByName = new Map()) {
    const accountKeys = new Set(this.getRecordCompanyKeys(account, companiesById, companiesByName));
    this.getRecordCompanyKeys(account.linkedCompany || {}, companiesById, companiesByName).forEach(key => accountKeys.add(key));
    this.getRecordCompanyKeys(row, companiesById, companiesByName).forEach(key => {
      if (accountKeys.has(key)) accountKeys.add('__MATCH__');
    });
    return accountKeys.has('__MATCH__');
  },
  statusBadge(status = '') {
    const label = this.text(status) || '—';
    return `<span class="pill status-${U.toStatusClass(label)}">${this.escape(label)}</span>`;
  },
  async fetchTable(db, table, columns = '*', options = {}) {
    const pageSize = Math.max(1, Number(options.pageSize) || 1000);
    const rows = [];
    let from = 0;

    while (true) {
      const { data, error } = await db
        .from(table)
        .select(columns || '*')
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`Unable to load ${table}: ${error.message || 'Unknown error'}`);
      const batch = Array.isArray(data) ? data : [];
      rows.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }

    return rows;
  },
  async safeFetchTable(db, table, columns = '*', options = {}) {
    try {
      return await this.fetchTable(db, table, columns, options);
    } catch (error) {
      console.warn(`[360 Analytics] ${table} optional load failed; using empty dataset`, error);
      this.state.warnings.push(`${table} data is unavailable; related analytics use zero/empty values.`);
      return [];
    }
  },

  async fetchOnboardingRows(db) {
    return this.safeFetchTable(db, 'operations_onboarding', '*');
  },
  async loadData() {
    const db = window.SupabaseClient?.getClient?.();
    if (!db || typeof db.from !== 'function') throw new Error('Supabase client is not available.');

    const requests = {
      companies: this.safeFetchTable(db, 'companies', '*'),
      contacts: this.safeFetchTable(db, 'contacts', '*'),
      leads: this.safeFetchTable(db, 'leads', '*'),
      deals: this.safeFetchTable(db, 'deals', '*'),
      proposals: this.safeFetchTable(db, 'proposals', '*'),
      proposalItems: this.safeFetchTable(db, 'proposal_items', '*'),
      agreements: this.safeFetchTable(db, 'agreements', '*'),
      agreementItems: this.safeFetchTable(db, 'agreement_items', '*'),
      invoices: this.safeFetchTable(db, 'invoices', '*'),
      invoiceItems: this.safeFetchTable(db, 'invoice_items', '*'),
      receipts: this.safeFetchTable(db, 'receipts', '*'),
      creditNotes: this.safeFetchTable(db, 'credit_notes', '*'),
      receiptItems: this.safeFetchTable(db, 'receipt_items', '*'),
      paymentSchedule: this.safeFetchTable(db, 'invoice_payment_schedule', '*'),
      clients: this.safeFetchTable(db, 'clients', '*'),
      onboarding: this.fetchOnboardingRows(db),
      technical: this.safeFetchTable(db, 'technical_admin_requests', '*'),
      tickets: this.safeFetchTable(db, 'tickets', '*'),
      events: this.safeFetchTable(db, 'events', '*'),
      binersEntries: this.safeFetchTable(db, 'biners_entries', '*'),
      binersSchedules: this.safeFetchTable(db, 'biners_schedules', '*'),
      paymentForecastFollowups: this.safeFetchTable(db, 'payment_forecast_followups', '*'),
      lifecycleStatusLogs: this.safeFetchTable(db, 'lifecycle_status_logs', '*'),
      workflowApprovals: this.safeFetchTable(db, 'workflow_approvals', '*')
    };

    const entries = Object.entries(requests);
    const settled = await Promise.allSettled(entries.map(([, promise]) => promise));
    const data = {};
    settled.forEach((result, index) => {
      const tableKey = entries[index][0];
      if (result.status === 'fulfilled') {
        data[tableKey] = Array.isArray(result.value) ? result.value : [];
      } else {
        console.warn(`[360 Analytics] ${tableKey} load rejected; using empty dataset`, result.reason);
        this.state.warnings.push(`${tableKey} data is unavailable; related analytics use zero/empty values.`);
        data[tableKey] = [];
      }
    });

    console.info('[360 Analytics] Loaded datasets', {
      companies: data.companies.length,
      contacts: data.contacts.length,
      leads: data.leads.length,
      deals: data.deals.length,
      proposals: data.proposals.length,
      proposalItems: data.proposalItems.length,
      agreements: data.agreements.length,
      agreementItems: data.agreementItems.length,
      invoices: data.invoices.length,
      invoiceItems: data.invoiceItems.length,
      receipts: data.receipts.length,
        creditNotes: data.creditNotes.length,
      receiptItems: data.receiptItems.length,
      paymentSchedule: data.paymentSchedule.length,
      clients: data.clients.length,
      onboarding: data.onboarding.length,
      technical: data.technical.length,
      lifecycleStatusLogs: data.lifecycleStatusLogs.length,
      workflowApprovals: data.workflowApprovals.length
    });

    return data;
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
    const accountByCompanyKey = new Map();
    const clientsById = new Map();
    const { companiesById, companiesByName } = this.buildCompanyLookupMaps(data.companies);

    (data.clients || []).forEach(row => {
      const clientUuid = this.text(row.id || row.client_id || row.client_uuid);
      if (clientUuid) clientsById.set(clientUuid, row);
      const businessId = this.text(row.client_id || row.id || row.client_uuid);
      if (businessId) clientsById.set(businessId, row);
    });

    const rememberCompanyAliases = (account, source = {}) => {
      this.getRecordCompanyKeys(source, companiesById, companiesByName).forEach(key => accountByCompanyKey.set(key, account.accountKey));
      this.getRecordCompanyKeys(account.linkedCompany || {}, companiesById, companiesByName).forEach(key => accountByCompanyKey.set(key, account.accountKey));
      if (account.companyId) accountByCompanyKey.set(`id:${this.text(account.companyId)}`, account.accountKey);
      if (account.companyName) accountByCompanyKey.set(`name:${this.norm(account.companyName)}`, account.accountKey);
    };

    const findAccountKeyForRecord = (record = {}, fallbackKey = '') => {
      const keys = this.getRecordCompanyKeys(record, companiesById, companiesByName);
      for (const key of keys) {
        const accountKey = accountByCompanyKey.get(key);
        if (accountKey && accounts.has(accountKey)) return accountKey;
      }
      return fallbackKey;
    };

    const ensureAccount = ({ key = '', clientUuid = '', company = '', companyId = '', email = '', record = {} } = {}) => {
      const linkedCompany = this.resolveLifecycleCompany({ ...record, company_id: companyId, company_name: company }, companiesById, companiesByName);
      const linkedIds = this.getCompanyIdKeys(linkedCompany || {});
      const linkedNames = this.getCompanyNameKeys(linkedCompany || {});
      const preferredCompanyId = this.text(companyId || linkedIds[0] || clientUuid);
      const preferredCompanyName = this.getCompanyDisplayName(linkedCompany || {}) || this.text(company || record.customer_name || record.client_name || record.legal_name || record.company_name);
      const aliasKey = findAccountKeyForRecord({ ...record, company_id: preferredCompanyId, company_name: preferredCompanyName }, '');
      const accountKey = aliasKey || (preferredCompanyId ? `company:${preferredCompanyId}` : (linkedNames[0] ? `company-name:${linkedNames[0]}` : (key || (this.isUuid(clientUuid) ? `client:${clientUuid}` : `unknown:${accounts.size + 1}`))));

      if (!accounts.has(accountKey)) {
        const client = this.isUuid(clientUuid) ? clientsById.get(clientUuid) : clientsById.get(this.text(clientUuid));
        accounts.set(accountKey, {
          accountKey,
          clientUuid: this.text(client?.id || clientUuid),
          clientBusinessId: this.text(client?.client_id),
          companyId: preferredCompanyId,
          linkedCompany,
          companyName: preferredCompanyName || this.getLifecycleClientLegalName({ company_name: company }, client),
          legalName: this.getLifecycleClientLegalName({ ...record, company_name: preferredCompanyName }, linkedCompany),
          primaryEmail: this.text(email),
          currency: 'USD',
          leads: [], deals: [], proposals: [], agreements: [], invoices: [], receipts: [], creditNotes: [],
          proposalItems: [], agreementItems: [], invoiceItems: [], receiptItems: [], paymentSchedule: [],
          onboarding: [], technical: [], tickets: [], events: [], binersEntries: [], binersSchedules: [], paymentForecastFollowups: [], locationItems: [], contacts: [],
          lifecycleStatusLogs: [], workflowApprovals: [],
          stages: {},
          lifecycleChain: {},
          metrics: {}
        });
      }
      const account = accounts.get(accountKey);
      if (!account.companyName && preferredCompanyName) account.companyName = preferredCompanyName;
      if (!account.legalName) account.legalName = this.getLifecycleClientLegalName(record, account.linkedCompany) || account.companyName;
      if (!account.companyId && preferredCompanyId) account.companyId = preferredCompanyId;
      if (!account.linkedCompany) account.linkedCompany = linkedCompany || this.resolveLifecycleCompany({ company_id: account.companyId, company_name: account.companyName }, companiesById, companiesByName);
      if (!account.primaryEmail && email) account.primaryEmail = this.text(email);
      if (this.isUuid(clientUuid) && !account.clientUuid) account.clientUuid = clientUuid;
      if (!account.clientBusinessId && account.clientUuid) account.clientBusinessId = this.text(clientsById.get(account.clientUuid)?.client_id);
      rememberCompanyAliases(account, record);
      return account;
    };

    (data.companies || []).forEach(company => {
      const companyId = this.text(company.id || company.company_id || company.company_uuid || company.uuid);
      ensureAccount({ company: this.getCompanyDisplayName(company), companyId, record: company });
    });

    (data.contacts || []).forEach(row => {
      const account = ensureAccount({ company: row.company_name || row.customer_name || row.client_name || row.full_name, companyId: row.company_id || row.company_uuid || row.client_id, email: row.email, record: row });
      account.contacts.push(row);
    });

    (data.leads || []).forEach(row => {
      const leadUuid = this.text(row.id);
      const account = ensureAccount({ key: leadUuid ? `lead:${leadUuid}` : '', company: row.company_name || row.customer_name || row.legal_name || row.full_name, companyId: row.company_id || row.company_uuid || row.companyId, email: row.email, record: row });
      account.leads.push(row);
      if (leadUuid) accountByLeadUuid.set(leadUuid, account.accountKey);
      if (!account.stages.lead) account.stages.lead = row.created_at || row.lead_date || row.updated_at;
    });

    (data.deals || []).forEach(row => {
      const dealUuid = this.text(row.id);
      const leadUuid = this.text(row.lead_id);
      const parentAccountKey = this.isUuid(leadUuid) ? accountByLeadUuid.get(leadUuid) : findAccountKeyForRecord(row, '');
      const account = parentAccountKey ? accounts.get(parentAccountKey) : ensureAccount({ key: dealUuid ? `deal:${dealUuid}` : '', company: row.company_name || row.customer_name || row.full_name, companyId: row.company_id || row.company_uuid || row.companyId, email: row.email, record: row });
      account.deals.push(row);
      rememberCompanyAliases(account, row);
      if (dealUuid) accountByDealUuid.set(dealUuid, account.accountKey);
      if (!account.stages.deal) account.stages.deal = row.created_at || row.deal_date || row.updated_at;
    });

    (data.proposals || []).forEach(row => {
      const proposalUuid = this.text(row.id);
      const dealUuid = this.text(row.deal_id);
      const parentAccountKey = (this.isUuid(dealUuid) ? accountByDealUuid.get(dealUuid) : '') || findAccountKeyForRecord(row, '');
      const account = parentAccountKey ? accounts.get(parentAccountKey) : ensureAccount({ key: proposalUuid ? `proposal:${proposalUuid}` : '', company: row.customer_name || row.company_name || row.customer_legal_name, companyId: row.company_id || row.company_uuid || row.companyId, record: row });
      account.proposals.push(row);
      rememberCompanyAliases(account, row);
      if (proposalUuid) accountByProposalUuid.set(proposalUuid, account.accountKey);
      account.currency = this.text(row.currency) || account.currency;
      if (!account.stages.proposal) account.stages.proposal = row.proposal_date || row.created_at || row.updated_at;
    });

    (data.agreements || []).forEach(row => {
      const agreementUuid = this.text(row.id);
      const proposalUuid = this.text(row.proposal_id);
      const parentAccountKey = (this.isUuid(proposalUuid) ? accountByProposalUuid.get(proposalUuid) : '') || findAccountKeyForRecord(row, '');
      const account = parentAccountKey ? accounts.get(parentAccountKey) : ensureAccount({ key: agreementUuid ? `agreement:${agreementUuid}` : '', company: row.customer_name || row.company_name || row.customer_legal_name, companyId: row.company_id || row.company_uuid || row.companyId, record: row });
      account.agreements.push(row);
      rememberCompanyAliases(account, row);
      if (agreementUuid) accountByAgreementUuid.set(agreementUuid, account.accountKey);
      account.currency = this.text(row.currency) || account.currency;
      if (!account.stages.agreement) account.stages.agreement = row.agreement_date || row.effective_date || row.signed_date || row.created_at || row.updated_at;
    });

    (data.agreementItems || []).forEach(item => {
      const agreementUuid = this.text(item.agreement_id || item.parent_id);
      const accountKey = (agreementUuid ? accountByAgreementUuid.get(agreementUuid) : '') || findAccountKeyForRecord(item, '');
      if (!accountKey || !accounts.has(accountKey)) return;
      accounts.get(accountKey).locationItems.push(item);
      accounts.get(accountKey).agreementItems.push(item);
    });

    (data.proposalItems || []).forEach(item => {
      const proposalUuid = this.text(item.proposal_id || item.parent_id);
      const accountKey = (proposalUuid ? accountByProposalUuid.get(proposalUuid) : '') || findAccountKeyForRecord(item, '');
      if (!accountKey || !accounts.has(accountKey)) return;
      accounts.get(accountKey).proposalItems.push(item);
    });

    (data.invoices || []).forEach(row => {
      const invoiceUuid = this.text(row.id);
      const agreementUuid = this.text(row.agreement_id);
      const parentAccountKey = (this.isUuid(agreementUuid) ? accountByAgreementUuid.get(agreementUuid) : '') || findAccountKeyForRecord(row, '');
      const account = parentAccountKey
        ? accounts.get(parentAccountKey)
        : ensureAccount({ key: invoiceUuid ? `invoice:${invoiceUuid}` : '', clientUuid: this.text(row.client_id), company: row.customer_name || row.company_name || row.client_name, companyId: row.company_id || row.company_uuid || row.companyId || row.client_id, record: row });
      account.invoices.push(row);
      rememberCompanyAliases(account, row);
      if (invoiceUuid) accountByInvoiceUuid.set(invoiceUuid, account.accountKey);
      account.currency = this.text(row.currency) || account.currency;
      if (!account.stages.invoice) account.stages.invoice = row.invoice_date || row.issue_date || row.created_at || row.issued_at || row.updated_at;
    });

    (data.invoiceItems || []).forEach(item => {
      const invoiceUuid = this.text(item.invoice_id || item.parent_id);
      const accountKey = (invoiceUuid ? accountByInvoiceUuid.get(invoiceUuid) : '') || findAccountKeyForRecord(item, '');
      if (!accountKey || !accounts.has(accountKey)) return;
      accounts.get(accountKey).invoiceItems.push(item);
    });

    (data.paymentSchedule || []).forEach(row => {
      const invoiceUuid = this.text(row.invoice_id || row.parent_id);
      const accountKey = (invoiceUuid ? accountByInvoiceUuid.get(invoiceUuid) : '') || findAccountKeyForRecord(row, '');
      if (!accountKey || !accounts.has(accountKey)) return;
      accounts.get(accountKey).paymentSchedule.push(row);
    });

    (data.receipts || []).forEach(row => {
      const invoiceUuid = this.text(row.invoice_id);
      const parentAccountKey = (this.isUuid(invoiceUuid) ? accountByInvoiceUuid.get(invoiceUuid) : '') || findAccountKeyForRecord(row, '');
      const account = parentAccountKey
        ? accounts.get(parentAccountKey)
        : ensureAccount({ key: row.id ? `receipt:${this.text(row.id)}` : '', clientUuid: this.text(row.client_id), company: row.customer_name || row.company_name || row.client_name, companyId: row.company_id || row.company_uuid || row.companyId || row.client_id, record: row });
      account.receipts.push(row);
      rememberCompanyAliases(account, row);
      if (!account.stages.receipt) account.stages.receipt = row.receipt_date || row.payment_date || row.created_at || row.updated_at;
    });


    (data.creditNotes || []).forEach(row => {
      const invoiceUuid = this.text(row.invoice_id);
      const parentAccountKey = (this.isUuid(invoiceUuid) ? accountByInvoiceUuid.get(invoiceUuid) : '') || findAccountKeyForRecord(row, '');
      const account = parentAccountKey
        ? accounts.get(parentAccountKey)
        : ensureAccount({ key: row.id ? `credit-note:${this.text(row.id)}` : '', clientUuid: this.text(row.client_id), company: row.customer_name || row.company_name || row.client_name, companyId: row.company_id || row.company_uuid || row.companyId || row.client_id, record: row });
      account.creditNotes.push(row);
      rememberCompanyAliases(account, row);
    });

    (data.receiptItems || []).forEach(item => {
      const receiptUuid = this.text(item.receipt_id || item.parent_id);
      const account = [...accounts.values()].find(candidate => candidate.receipts.some(row => this.text(row.id) === receiptUuid || this.text(row.receipt_id) === receiptUuid));
      if (account) account.receiptItems.push(item);
    });

    const attachOperational = (collection, target) => {
      (collection || []).forEach(row => {
        const agreementUuid = this.text(row.agreement_id);
        const accountKey = (this.isUuid(agreementUuid) ? accountByAgreementUuid.get(agreementUuid) : '') || findAccountKeyForRecord(row, '');
        if (!accountKey || !accounts.has(accountKey)) return;
        accounts.get(accountKey)[target].push(row);
      });
    };
    attachOperational(data.onboarding, 'onboarding');
    attachOperational(data.technical, 'technical');
    attachOperational(data.tickets, 'tickets');
    attachOperational(data.events, 'events');
    attachOperational(data.binersEntries, 'binersEntries');
    attachOperational(data.binersSchedules, 'binersSchedules');
    attachOperational(data.paymentForecastFollowups, 'paymentForecastFollowups');

    const lifecycleRecordKeys = record => [
      record?.id, record?.uuid, record?.lead_id, record?.lead_number, record?.deal_id, record?.deal_number,
      record?.proposal_id, record?.proposal_number, record?.ref_number, record?.agreement_id, record?.agreement_number,
      record?.invoice_id, record?.invoice_number, record?.receipt_id, record?.receipt_number, record?.credit_note_id, record?.credit_note_number,
      record?.onboarding_id, record?.request_id, record?.technical_request_id, record?.ticket_id, record?.event_id,
      record?.entry_number, record?.schedule_number, record?.followup_id
    ].map(value => this.text(value)).filter(Boolean);
    const lifecycleCollections = ['leads', 'deals', 'proposals', 'agreements', 'invoices', 'receipts', 'creditNotes', 'onboarding', 'technical', 'tickets', 'events', 'binersEntries', 'binersSchedules', 'paymentForecastFollowups'];
    const findAccountForLifecycleReference = value => {
      const reference = this.text(value);
      if (!reference) return null;
      return [...accounts.values()].find(candidate => lifecycleCollections.some(key => candidate[key].some(record => lifecycleRecordKeys(record).includes(reference)))) || null;
    };
    (data.lifecycleStatusLogs || []).forEach(log => {
      const account = findAccountForLifecycleReference(log.entity_id) || findAccountForLifecycleReference(log.entity_number);
      if (account) account.lifecycleStatusLogs.push(log);
    });
    (data.workflowApprovals || []).forEach(approval => {
      const requestedChanges = approval.requested_changes && typeof approval.requested_changes === 'object' ? approval.requested_changes : {};
      const account = findAccountForLifecycleReference(approval.record_id || approval.resource_id || approval.target_id || requestedChanges.resource_id || requestedChanges.target_id);
      if (account) account.workflowApprovals.push(approval);
    });


    return { accounts: [...accounts.values()], today, companiesById, companiesByName };
  },
  calculateLifecycleMetrics(lifecycleContext = {}, todayValue = new Date()) {
    const context = lifecycleContext || {};
    let today = this.parseDateSafe(todayValue) || new Date();
    const now = new Date();
    if (today.toDateString() === now.toDateString() && today.getTime() < now.getTime()) today = now;
    const rows = key => Array.isArray(context[key]) ? context[key] : [];
    const firstRecordDate = (key, fields) => this.getEarliestDate(rows(key).map(row => fields.map(field => row?.[field])));
    const statusText = value => this.norm(value).replace(/[\s-]+/g, '_');
    const statusLogs = rows('lifecycleStatusLogs');
    const logDate = log => this.parseDateSafe(log.changed_at || log.created_at);
    const transitionDate = (entityTypes, acceptedStatuses, fields = []) => this.getEarliestDate(statusLogs
      .filter(log => entityTypes.includes(statusText(log.entity_type)) && acceptedStatuses.some(status => statusText(log.new_status).includes(statusText(status))) && (!fields.length || fields.some(field => statusText(log.status_field).includes(statusText(field)))))
      .map(logDate));
    const endOrToday = (start, ...ends) => {
      if (!start) return null;
      const validEnds = ends.flat(Infinity).map(value => this.parseDateSafe(value)).filter(date => date && date.getTime() >= start.getTime());
      return this.getEarliestDate(validEnds) || today;
    };

    const leadStart = firstRecordDate('leads', ['created_at', 'lead_date']);
    const dealStart = firstRecordDate('deals', ['created_at', 'deal_date']);
    const proposalStart = firstRecordDate('proposals', ['created_at', 'proposal_date']);
    const agreementStart = firstRecordDate('agreements', ['created_at', 'agreement_date', 'effective_date']);
    const invoiceStart = firstRecordDate('invoices', ['created_at', 'issued_at', 'issue_date', 'invoice_date']);
    const receiptStart = firstRecordDate('receipts', ['created_at', 'receipt_date', 'payment_date']);

    const leadConverted = this.getEarliestDate(
      rows('leads').map(row => row.converted_at),
      transitionDate(['lead', 'leads'], ['qualified', 'converted']),
      rows('leads').filter(row => ['qualified', 'converted'].includes(statusText(row.status))).map(row => row.updated_at)
    );
    const proposalAccepted = this.getEarliestDate(
      transitionDate(['proposal', 'proposals'], ['accepted']),
      rows('proposals').map(row => row.accepted_at),
      rows('proposals').filter(row => statusText(row.status).includes('accepted')).map(row => row.updated_at)
    );
    const agreementSigned = this.getEarliestDate(
      rows('agreements').map(row => [row.signed_at, row.signed_date, row.provider_signed_at, row.provider_sign_date, row.customer_signed_at, row.customer_sign_date]),
      transitionDate(['agreement', 'agreements'], ['signed'])
    );
    const invoicePaid = this.getEarliestDate(
      rows('invoices').map(row => [row.paid_at, row.payment_date, row.settled_at]),
      rows('invoices').filter(row => statusText(row.payment_status || row.payment_state || row.status).includes('paid')).map(row => row.updated_at),
      transitionDate(['invoice', 'invoices'], ['paid'], ['payment', 'status'])
    );

    const daysInLead = this.diffDays(leadStart, endOrToday(leadStart, dealStart, proposalStart, leadConverted));
    const daysInDeal = this.diffDays(dealStart, endOrToday(dealStart, proposalStart));
    const daysInProposal = this.diffDays(proposalStart, endOrToday(proposalStart, proposalAccepted, agreementStart, agreementSigned));
    const daysInAgreement = this.diffDays(agreementStart, endOrToday(agreementStart, agreementSigned, invoiceStart));
    const daysInInvoice = this.diffDays(invoiceStart, endOrToday(invoiceStart, receiptStart, invoicePaid));

    const realTransitions = [];
    const seenTransitions = new Set();
    statusLogs.forEach(log => {
      const oldStatus = this.text(log.old_status);
      const newStatus = this.text(log.new_status);
      const changedAt = logDate(log);
      if (!oldStatus || !newStatus || statusText(oldStatus) === statusText(newStatus) || !changedAt) return;
      const key = [statusText(log.entity_type), this.text(log.entity_id || log.entity_number), statusText(log.status_field), statusText(oldStatus), statusText(newStatus), changedAt.toISOString().slice(0, 19)].join('|');
      if (!seenTransitions.has(key)) { seenTransitions.add(key); realTransitions.push(log); }
    });
    const fallbackStageChanges = ['leads', 'deals', 'proposals', 'agreements', 'invoices', 'receipts'].filter(key => rows(key).length).length;
    const numberOfStageChanges = statusLogs.length ? realTransitions.length : fallbackStageChanges;

    const approvalEvents = rows('workflowApprovals');
    const requestedAt = this.getEarliestDate(
      approvalEvents.map(row => [row.requested_at, row.created_at, row.submitted_at]),
      transitionDate(['proposal', 'proposals', 'workflow_approval'], ['pending_approval', 'pending approval', 'awaiting_approval'], ['approval', 'status'])
    );
    const decidedAt = this.getEarliestDate(
      approvalEvents.filter(row => ['approved', 'rejected'].some(value => statusText(row.status || row.approval_status).includes(value))).map(row => [row.approved_at, row.rejected_at, row.decided_at, row.reviewed_at, row.updated_at]),
      transitionDate(['proposal', 'proposals', 'workflow_approval'], ['approved', 'rejected'], ['approval', 'status'])
    );
    const approvalDelay = requestedAt && decidedAt ? this.diffDays(requestedAt, decidedAt) : null;

    const itemCollections = rows('proposalItems').length ? rows('proposalItems') : (rows('agreementItems').length ? rows('agreementItems') : rows('invoiceItems'));
    const validItems = itemCollections.filter(item => {
      const state = statusText(item.status || item.item_status || item.row_type || item.type);
      const value = this.num(item.line_total ?? item.total ?? item.amount ?? item.subtotal ?? item.unit_price);
      const discount = this.num(item.discount_percent ?? item.discount_percentage ?? item.discount);
      return !state.includes('cancel') && !state.includes('information') && !state.includes('header') && (value !== 0 || discount === 100);
    });
    const discountPercents = validItems.map(item => Number(item.discount_percent ?? item.discount_percentage ?? item.discount)).filter(Number.isFinite);
    const proposalSubtotal = rows('proposals').reduce((sum, row) => sum + this.num(row.subtotal_before_discount || row.subtotal_locations) + this.num(row.subtotal_one_time), 0);
    const proposalDiscount = rows('proposals').reduce((sum, row) => sum + this.num(row.total_discount_amount || row.total_discount), 0);
    const averageDiscount = discountPercents.length
      ? discountPercents.reduce((sum, value) => sum + value, 0) / discountPercents.length
      : (proposalSubtotal > 0 ? (proposalDiscount / proposalSubtotal) * 100 : null);

    const activityDates = [
      ...rows('leads').map(row => row.updated_at || row.created_at), ...rows('deals').map(row => row.updated_at || row.created_at),
      ...rows('proposals').map(row => row.updated_at || row.created_at || row.proposal_date), ...rows('agreements').map(row => row.updated_at || row.signed_at || row.created_at),
      ...rows('invoices').map(row => row.updated_at || row.issued_at || row.created_at), ...rows('receipts').map(row => row.updated_at || row.receipt_date || row.created_at),
      ...rows('creditNotes').map(row => row.updated_at || row.created_at), ...rows('onboarding').map(row => row.updated_at || row.completed_at || row.created_at),
      ...statusLogs.map(log => log.changed_at || log.created_at)
    ];
    const lastActivityDate = this.getLatestDate(activityDates);
    const cycleStart = this.getEarliestDate(leadStart, dealStart, proposalStart, agreementStart);
    const onboardingCompleted = this.getLatestDate(rows('onboarding').map(row => [row.completed_at, row.go_live_at, row.go_live_date]));
    const meaningfulEnd = this.getLatestDate(receiptStart, rows('receipts').map(row => [row.updated_at, row.receipt_date, row.payment_date]), rows('invoices').map(row => row.updated_at), onboardingCompleted, statusLogs.map(logDate));

    const onboardingOpen = rows('onboarding').some(row => ['progress', 'pending', 'active', 'block'].some(value => statusText(row.onboarding_status || row.status).includes(value)));
    const unpaidInvoice = rows('invoices').find(row => !['paid', 'cancelled', 'void'].some(value => statusText(row.payment_status || row.payment_state || row.status).includes(value)));
    const openAgreement = agreementStart && !invoiceStart;
    const openProposal = proposalStart && !agreementStart;
    let currentStage = null;
    let stageStart = null;
    let threshold = null;
    let warning = '';
    if (onboardingOpen) { currentStage = 'Onboarding'; stageStart = firstRecordDate('onboarding', ['created_at', 'requested_at', 'updated_at']); threshold = 30; warning = 'Onboarding delayed'; }
    else if (unpaidInvoice && invoiceStart) { currentStage = 'Invoice'; stageStart = invoiceStart; const due = this.getEarliestDate(unpaidInvoice.due_date, unpaidInvoice.payment_due_date); threshold = due ? this.diffDays(invoiceStart, due) : 30; warning = 'Invoice overdue'; }
    else if (openAgreement) { currentStage = 'Agreement'; stageStart = agreementStart; threshold = 30; warning = 'Agreement not signed within expected period'; }
    else if (openProposal) { currentStage = 'Proposal'; stageStart = proposalStart; threshold = 14; warning = 'Proposal pending too long'; }
    else if (dealStart && !proposalStart) { currentStage = 'Deal'; stageStart = dealStart; threshold = 21; warning = 'Deal stage delayed'; }
    else if (leadStart && !dealStart && !proposalStart) { currentStage = 'Lead'; stageStart = leadStart; threshold = 14; warning = 'Lead stage delayed'; }
    const currentStageAge = stageStart ? this.diffDays(stageStart, today) : null;
    const isStuck = currentStageAge !== null && threshold !== null && currentStageAge > Math.max(0, threshold);
    const stillActive = Boolean(currentStage);
    const cycleEnd = cycleStart ? (stillActive ? today : meaningfulEnd) : null;

    const metrics = {
      daysInLead, daysInDeal, daysInProposal, daysInAgreement, daysInInvoice,
      totalCycleDuration: cycleStart && cycleEnd ? this.diffDays(cycleStart, cycleEnd) : null,
      numberOfStageChanges, stageChanges: numberOfStageChanges, approvalDelay,
      lastActivityAge: lastActivityDate ? this.diffDays(lastActivityDate, today) : null,
      averageDiscount, stuckStage: isStuck ? currentStage : 'None', bottleneckWarning: isStuck ? warning : '',
      lastActivityDate: lastActivityDate ? lastActivityDate.toISOString() : '', stageChangesEstimated: statusLogs.length === 0
    };
    console.log('[Lifecycle Metrics] context:', lifecycleContext);
    console.log('[Lifecycle Metrics] result:', metrics);
    return metrics;
  },
  buildLifecycleMetrics(account = {}, today = new Date()) {
    return this.calculateLifecycleMetrics(account, today);
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
    const companyIds = new Set([this.text(account.companyId), this.text(account.clientUuid)].filter(Boolean));
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
  collectAccountDateValues(account = {}) {
    return [
      ...(account.leads || []).map(item => this.getRecordDate(item, ['created_at', 'lead_date', 'next_follow_up', 'next_followup_date', 'next_follow_up_date'])),
      ...(account.deals || []).map(item => this.getRecordDate(item, ['created_at', 'deal_date', 'next_follow_up_at', 'next_follow_up_date'])),
      ...(account.proposals || []).map(item => this.getRecordDate(item, ['proposal_date', 'created_at'])),
      ...(account.agreements || []).map(item => this.getRecordDate(item, ['agreement_date', 'effective_date', 'signed_date', 'created_at'])),
      ...(account.invoices || []).map(item => this.getRecordDate(item, ['invoice_date', 'issue_date', 'created_at', 'due_date'])),
      ...(account.receipts || []).map(item => this.getRecordDate(item, ['receipt_date', 'payment_date', 'created_at'])),
      ...(account.paymentSchedule || []).map(item => this.getRecordDate(item, ['due_date', 'scheduled_date', 'payment_date'])),
      ...(account.locationItems || []).map(item => this.getRecordDate(item, ['service_end_date', 'service_start_date'])),
      ...(account.onboarding || []).map(item => this.getRecordDate(item, ['go_live_date', 'go_live_at', 'completed_at', 'updated_at'])),
      ...(account.technical || []).map(item => this.getRecordDate(item, ['requested_at', 'completed_at']))
    ].filter(Boolean);
  },
  buildAccountAnalytics(account, today, context = {}) {
    const companiesById = context.companiesById || new Map();
    const companiesByName = context.companiesByName || new Map();
    const agreementValue = account.agreements.reduce((sum, row) => sum + this.agreementValue(row), 0);
    const proposalValue = account.proposals.reduce((sum, row) => sum + this.proposalValue(row), 0);
    const acceptedProposalValue = account.proposals
      .filter(row => this.normalizeProposalStatus(row.status) === 'Accepted')
      .reduce((sum, row) => sum + this.proposalValue(row), 0);
    const totalInvoiced = account.invoices.reduce((sum, row) => sum + this.invoiceGrandTotal(row), 0);
    const invoicePaid = account.invoices.reduce((sum, row) => sum + this.invoicePaidAmount(row), 0);
    const receiptCollected = account.receipts.filter(row => this.isValidReceipt(row)).reduce((sum, row) => sum + this.receiptPaidAmount(row), 0);
    const totalCredited = account.creditNotes.filter(row => this.isValidCreditNote(row)).reduce((sum, row) => sum + this.creditNoteAmount(row), 0);
    const totalPaid = account.invoices.length ? invoicePaid : receiptCollected;
    const totalDue = Math.max(account.invoices.reduce((sum, row) => sum + this.invoicePendingAmount(row), 0) || totalInvoiced - totalPaid - totalCredited, 0);
    const scheduleRows = account.paymentSchedule.filter(row => !this.norm(row.status).includes('cancel'));
    const scheduledAmount = scheduleRows.reduce((sum, row) => sum + this.scheduleAmount(row), 0);
    const schedulePaidAmount = scheduleRows.reduce((sum, row) => sum + this.schedulePaidAmount(row), 0);
    const scheduleBalanceDue = Math.max(scheduledAmount - schedulePaidAmount, 0);

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
      legalName: this.getLifecycleClientLegalName(account, account.linkedCompany || null),
      currentStage: this.getCurrentStage(account),
      leadsCount: account.leads.length,
      dealsCount: account.deals.length,
      proposalsCount: account.proposals.length,
      agreementsCount: account.agreements.length,
      invoicesCount: account.invoices.length,
      receiptsCount: account.receipts.length,
      creditNotesCount: account.creditNotes.length,
      agreementValue,
      proposalValue,
      acceptedProposalValue,
      totalInvoiced,
      totalPaid,
      totalCredited,
      totalDue,
      receiptCollected,
      scheduledAmount,
      schedulePaidAmount,
      scheduleBalanceDue,
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
        receipt: this.text(account.receipts[0]?.receipt_id || account.receipts[0]?.id),
        company_id: this.text(account.companyId),
        company_name: this.text(account.linkedCompany?.company_name || account.companyName),
        customer_name: this.text(account.companyName),
        customer_legal_name: this.text(account.linkedCompany?.legal_name || account.linkedCompany?.legalName || account.legalName),
        legal_name: this.text(account.linkedCompany?.legal_name || account.linkedCompany?.legalName || account.legalName)
      },
      latestTechnicalStatus: this.text(latestTechnical?.request_status),
      dateValues: this.collectAccountDateValues(account)
    };
    const lifecycleCompanyId = this.getLifecycleCompanyId(row.lifecycleChain);
    if (lifecycleCompanyId && !row.companyId) row.companyId = lifecycleCompanyId;
    if (!row.linkedCompany) row.linkedCompany = this.resolveLifecycleCompany(row.lifecycleChain, companiesById, companiesByName) || account.linkedCompany || null;
    const linkedCompany = row.linkedCompany || null;
    const legalName = this.getLifecycleClientLegalName(row.lifecycleChain, linkedCompany) || this.getLifecycleClientLegalName(row, linkedCompany);
    row.lifecycleChain.customer_name = legalName;
    row.lifecycleChain.customer_legal_name = legalName;
    row.lifecycleChain.legal_name = legalName;
    row.lifecycleChain.company_name = this.text(linkedCompany?.company_name || row.lifecycleChain.company_name);
    return row;
  },
  buildOverview(rows = [], raw = {}) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const totalLocations = rows.reduce((sum, row) => sum + row.locationsCount, 0);
    const totalInvoiced = rows.reduce((sum, row) => sum + row.totalInvoiced, 0);
    const totalPaid = rows.reduce((sum, row) => sum + row.totalPaid, 0);
    const totalCredited = rows.reduce((sum, row) => sum + (row.totalCredited || 0), 0);
    const receiptCollected = (raw.receipts || []).filter(row => this.isValidReceipt(row)).reduce((sum, row) => sum + this.receiptPaidAmount(row), 0);
    const totalDue = rows.reduce((sum, row) => sum + row.totalDue, 0);
    const scheduledAmount = rows.reduce((sum, row) => sum + row.scheduledAmount, 0);
    const schedulePaidAmount = rows.reduce((sum, row) => sum + row.schedulePaidAmount, 0);
    const scheduleBalanceDue = rows.reduce((sum, row) => sum + row.scheduleBalanceDue, 0);
    const dueRenewal = rows.reduce((sum, row) => sum + (row.locationItems || []).filter(item => {
      if (!this.isAnnualSaasLocationItem(item)) return false;
      const end = this.toDate(item.service_end_date);
      if (!end) return false;
      const days = this.calculateDecimalDays(today, end);
      return days !== null && days <= 30;
    }).length, 0);
    const activeOnboarding = rows.filter(row => row.onboardingStatus === 'Pending').length;
    const openTechnical = rows.reduce((sum, row) => sum + (row.openTechnicalRequest ? 1 : 0), 0);

    const leadStatuses = (raw.leads || []).reduce((acc, row) => {
      const key = this.normalizeLeadStatus(row.status);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const dealStages = (raw.deals || []).reduce((acc, row) => {
      const key = this.normalizeDealStage(row.stage || row.deal_stage || row.status);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const proposalStatuses = (raw.proposals || []).reduce((acc, row) => {
      const key = this.normalizeProposalStatus(row.status);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const signedAgreements = (raw.agreements || []).filter(row => this.isSignedAgreement(row)).length;
    const draftAgreements = (raw.agreements || []).filter(row => this.norm(row.status).includes('draft')).length;
    const activeAgreements = (raw.agreements || []).filter(row => this.norm(row.status).includes('active') || this.isSignedAgreement(row)).length;
    const annualSaasItems = (raw.agreementItems || []).filter(item => this.isAnnualSaasLocationItem(item)).length;
    const oneTimeItems = (raw.agreementItems || []).filter(item => !this.isAnnualSaasLocationItem(item) && ['one_time_fee', 'one_time', 'one time', 'one-time', 'setup', 'implementation', 'onboarding'].some(token => this.norm(item.section || item.item_name).includes(token))).length;
    const invoices = raw.invoices || [];
    const invoicePaymentStates = invoices.map(row => this.derivePaymentStateFromInvoices([row], this.invoiceGrandTotal(row), this.invoicePaidAmount(row), this.invoicePendingAmount(row)));
    const issuedInvoices = invoices.filter(row => !this.norm(row.status).includes('draft')).length;
    const draftInvoices = invoices.filter(row => this.norm(row.status).includes('draft')).length;
    const overdueInvoices = invoices.filter(row => {
      const due = this.toDate(row.due_date);
      const pending = this.invoicePendingAmount(row);
      return due && due < today && pending > 0;
    }).length;
    const receiptsLinkedToInvoice = (raw.receipts || []).filter(row => this.text(row.invoice_id)).length;
    const invalidReceipts = (raw.receipts || []).filter(row => !this.isValidReceipt(row) || !this.text(row.invoice_id)).length;
    const schedules = (raw.paymentSchedule || []).filter(row => this.normalizeScheduleStatus(row) !== 'Cancelled');
    const overdueSchedule = schedules.filter(row => {
      const due = this.toDate(row.due_date);
      const status = this.normalizeScheduleStatus(row);
      return status === 'Overdue' || (due && due < today && status !== 'Paid');
    }).length;
    const upcomingSchedule = schedules.filter(row => {
      const due = this.toDate(row.due_date);
      return due && due >= today && this.normalizeScheduleStatus(row) !== 'Paid';
    }).length;

    return {
      totalCompanies: raw.companies?.length || 0,
      totalLeads: raw.leads?.length || 0,
      qualifiedLeads: leadStatuses.Qualified || 0,
      lostLeads: leadStatuses.Lost || 0,
      notContactedLeads: leadStatuses['Not Contacted Yet'] || 0,
      negotiationLeads: leadStatuses.Negotiations || 0,
      notAvailableLeads: leadStatuses['Not Available'] || 0,
      leadUnknownOther: leadStatuses['Unknown / Other'] || 0,
      totalDeals: raw.deals?.length || 0,
      qualifiedDeals: dealStages.Qualified || 0,
      wonDeals: dealStages.Won || 0,
      lostDeals: dealStages.Lost || 0,
      dealsConvertedToProposal: dealStages['Converted to Proposal'] || 0,
      dealValue: (raw.deals || []).reduce((sum, row) => sum + this.dealValue(row), 0),
      totalProposals: raw.proposals?.length || 0,
      acceptedProposals: proposalStatuses.Accepted || 0,
      pendingApprovalProposals: proposalStatuses['Pending Approval'] || 0,
      sentProposals: proposalStatuses.Sent || 0,
      draftProposals: proposalStatuses.Draft || 0,
      rejectedExpiredProposals: (proposalStatuses.Rejected || 0) + (proposalStatuses.Expired || 0) + (proposalStatuses.Cancelled || 0),
      totalProposalValue: (raw.proposals || []).reduce((sum, row) => sum + this.proposalValue(row), 0),
      acceptedProposalValue: (raw.proposals || []).filter(row => this.normalizeProposalStatus(row.status) === 'Accepted').reduce((sum, row) => sum + this.proposalValue(row), 0),
      totalAgreements: raw.agreements?.length || 0,
      signedAgreements,
      draftAgreements,
      activeAgreements,
      agreementValue: (raw.agreements || []).reduce((sum, row) => sum + this.agreementValue(row), 0),
      annualSaasItems,
      oneTimeItems,
      totalInvoices: invoices.length,
      issuedInvoices,
      draftInvoices,
      overdueInvoices,
      fullyPaidInvoices: invoicePaymentStates.filter(value => value === 'Fully Paid').length,
      partiallyPaidInvoices: invoicePaymentStates.filter(value => value === 'Partially Paid').length,
      unpaidInvoices: invoicePaymentStates.filter(value => value === 'Not Paid' || value === 'Overdue').length,
      totalReceipts: raw.receipts?.length || 0,
      totalCreditNotes: raw.creditNotes?.length || 0,
      receiptCollected,
      receiptsLinkedToInvoice,
      invalidReceipts,
      totalClients: raw.clients?.length || 0,
      totalLocations,
      totalInvoiced,
      totalPaid,
      totalCredited,
      totalDue,
      scheduledAmount,
      schedulePaidAmount,
      scheduleBalanceDue,
      overdueSchedule,
      upcomingSchedule,
      paidScheduleRows: schedules.filter(row => this.normalizeScheduleStatus(row) === 'Paid').length,
      partiallyPaidScheduleRows: schedules.filter(row => this.normalizeScheduleStatus(row) === 'Partially Paid').length,
      accountsDueForRenewal: dueRenewal,
      activeOnboardingAccounts: activeOnboarding,
      openTechnicalAdminRequests: openTechnical
    };
  },
  matchesDateRange(row) {
    const from = this.toDate(this.state.filters.dateFrom);
    const to = this.toDate(this.state.filters.dateTo);
    if (!from && !to) return true;
    if (to) to.setHours(23, 59, 59, 999);
    const dates = (row.dateValues || [row.lastActivity]).map(value => this.toDate(value)).filter(Boolean);
    if (!dates.length) return false;
    return dates.some(date => (!from || date >= from) && (!to || date <= to));
  },
  applyFilters() {
    const f = this.state.filters;
    const q = this.norm(f.search);
    this.state.filteredRows = this.state.rows.filter(row => {
      if (q) {
        const linkedCompany = row.linkedCompany || null;
        const legalName = this.getLifecycleClientLegalName(row.lifecycleChain || row, linkedCompany);
        const haystack = [
          legalName,
          row.customer_legal_name,
          row.legal_name,
          row.customer_name,
          row.company_name,
          linkedCompany?.legal_name,
          linkedCompany?.company_name,
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
      const selectedClient = this.text(f.client);
      const linkedCompany = row.linkedCompany || null;
      const legalName = this.getLifecycleClientLegalName(row.lifecycleChain || row, linkedCompany);
      const companyId = this.getLifecycleCompanyId(row.lifecycleChain || row) || this.text(linkedCompany?.company_id || linkedCompany?.companyId);
      const matchesClient = !selectedClient || selectedClient === 'All' || selectedClient === companyId || this.norm(selectedClient) === this.norm(legalName);
      if (!matchesClient) return false;
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

    localStorage.removeItem('lifecycleClientFilterOptions');
    localStorage.removeItem('analyticsClientFilterOptions');
    setOptions('lifecycleStageFilter', this.state.rows.map(row => row.currentStage), true);
    setOptions('lifecyclePaymentStateFilter', this.state.rows.map(row => row.paymentState), true);
    setOptions('lifecycleClientFilter', this.state.rows.map(row => this.getLifecycleCompanyId(row.lifecycleChain || row) || this.text(row.linkedCompany?.company_id || row.linkedCompany?.companyId) || this.getLifecycleClientLegalName(row.lifecycleChain || row, row.linkedCompany || null)), true);
    const clientSelect = document.getElementById('lifecycleClientFilter');
    if (clientSelect) {
      clientSelect.innerHTML = ['All', ...this.state.rows.map(row => this.getLifecycleCompanyId(row.lifecycleChain || row) || this.text(row.linkedCompany?.company_id || row.linkedCompany?.companyId) || this.getLifecycleClientLegalName(row.lifecycleChain || row, row.linkedCompany || null))]
        .map(key => {
          if (key === 'All') return '<option value="All">All Clients</option>';
          const row = this.state.rows.find(item => (this.getLifecycleCompanyId(item.lifecycleChain || item) || this.text(item.linkedCompany?.company_id || item.linkedCompany?.companyId) || this.getLifecycleClientLegalName(item.lifecycleChain || item, item.linkedCompany || null)) === key);
          const linkedCompany = row?.linkedCompany || null;
          const label = this.getLifecycleClientLegalName((row?.lifecycleChain || row || {}), linkedCompany) || row?.clientBusinessId || key;
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
      ['Companies / Customers', o.totalCompanies],
      ['Total Leads', o.totalLeads],
      ['Qualified Leads', o.qualifiedLeads],
      ['Lost Leads', o.lostLeads],
      ['Not Contacted Yet', o.notContactedLeads],
      ['Negotiations', o.negotiationLeads],
      ['Not Available', o.notAvailableLeads],
      ['Lead Unknown / Other', o.leadUnknownOther],
      ['Total Deals', o.totalDeals],
      ['Qualified Deals', o.qualifiedDeals],
      ['Won / Lost Deals', `${o.wonDeals || 0} / ${o.lostDeals || 0}`],
      ['Converted to Proposal', o.dealsConvertedToProposal],
      ['Deal Value', this.fmtMoney(o.dealValue)],
      ['Total Proposals', o.totalProposals],
      ['Accepted Proposals', o.acceptedProposals],
      ['Pending Approval', o.pendingApprovalProposals],
      ['Sent Proposals', o.sentProposals],
      ['Draft Proposals', o.draftProposals],
      ['Rejected / Expired', o.rejectedExpiredProposals],
      ['Proposal Value', this.fmtMoney(o.totalProposalValue)],
      ['Accepted Value', this.fmtMoney(o.acceptedProposalValue)],
      ['Total Agreements', o.totalAgreements],
      ['Signed Agreements', o.signedAgreements],
      ['Active Agreements', o.activeAgreements],
      ['Draft Agreements', o.draftAgreements],
      ['Agreement Value', this.fmtMoney(o.agreementValue)],
      ['Annual SaaS Rows', o.annualSaasItems],
      ['One-time Rows', o.oneTimeItems],
      ['Total Invoices', o.totalInvoices],
      ['Issued Invoices', o.issuedInvoices],
      ['Draft Invoices', o.draftInvoices],
      ['Overdue Invoices', o.overdueInvoices],
      ['Fully Paid Invoices', o.fullyPaidInvoices],
      ['Partially Paid Invoices', o.partiallyPaidInvoices],
      ['Unpaid / Not Paid', o.unpaidInvoices],
      ['Invoice Grand Total', this.fmtMoney(o.totalInvoiced)],
      ['Amount Received', this.fmtMoney(o.totalPaid)],
      ['Credit Notes', this.fmtMoney(o.totalCredited || 0)],
      ['Pending Amount', this.fmtMoney(o.totalDue)],
      ['Total Receipts', o.totalReceipts],
      ['Total Credit Notes', o.totalCreditNotes || 0],
      ['Receipt Collections', this.fmtMoney(o.receiptCollected)],
      ['Linked Receipts', o.receiptsLinkedToInvoice],
      ['Unlinked / Invalid Receipts', o.invalidReceipts],
      ['Scheduled Amount', this.fmtMoney(o.scheduledAmount)],
      ['Schedule Paid', this.fmtMoney(o.schedulePaidAmount)],
      ['Schedule Balance Due', this.fmtMoney(o.scheduleBalanceDue)],
      ['Overdue Schedule', o.overdueSchedule],
      ['Upcoming Schedule', o.upcomingSchedule],
      ['Paid Schedule Rows', o.paidScheduleRows],
      ['Partial Schedule Rows', o.partiallyPaidScheduleRows],
      ['Renewal / SaaS Ends', o.accountsDueForRenewal],
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
        <td>${this.escape(this.getLifecycleClientLegalName(row, row?.linkedCompany || null) || row.clientBusinessId || '—')}</td>
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
      ['Number of Stage Changes', selected.lifecycle.numberOfStageChanges],
      ['Approval Delay', selected.lifecycle.approvalDelay],
      ['Last Activity Age', selected.lifecycle.lastActivityAge],
      ['Average Discount', this.formatPercent(selected.lifecycle.averageDiscount)],
      ['Stuck Stage', selected.lifecycle.stuckStage],
      ['Bottleneck Warning', selected.lifecycle.bottleneckWarning || '—']
    ];
    const lifecycleMetricHelp = {
      'Days in Lead': 'Lead created date to the earliest deal, proposal, or conversion milestone; open leads run through today.',
      'Days in Deal': 'Deal created date to the earliest linked proposal; open deals run through today.',
      'Days in Proposal': 'Proposal created/proposal date to acceptance or the earliest agreement milestone.',
      'Days in Agreement': 'Agreement created/agreement date to signing or the earliest invoice milestone.',
      'Days in Invoice': 'Invoice created/issued date to the first receipt or paid milestone; unpaid invoices run through today.',
      'Total Cycle Duration': 'First available lifecycle start through the latest meaningful completed date, or today while active.',
      'Number of Stage Changes': 'Unique real transitions from lifecycle status logs; estimated from lifecycle objects only when logs are unavailable.',
      'Approval Delay': 'Earliest approval request to its approval or rejection decision.',
      'Last Activity Age': 'Time since the latest update or lifecycle status event across related records.',
      'Average Discount': 'Average line-item discount, with proposal totals used only when item discounts are unavailable.',
      'Stuck Stage': 'Current open stage when its age exceeds the configured stage threshold.',
      'Bottleneck Warning': 'Warning for the current stage when it exceeds the configured stage threshold.'
    };

    detailRoot.innerHTML = `
      <div class="grid cols-4">
        <div class="card"><div class="label">Client</div><div class="value">${this.escape(this.getLifecycleClientLegalName(selected, selected?.linkedCompany || null) || '—')}</div></div>
        <div class="card"><div class="label">Current Stage</div><div class="value">${this.escape(selected.currentStage)}</div></div>
        <div class="card"><div class="label">Agreement Value</div><div class="value">${this.escape(this.fmtMoney(selected.agreementValue, selected.currency))}</div></div>
        <div class="card"><div class="label">Proposal Value</div><div class="value">${this.escape(this.fmtMoney(selected.proposalValue, selected.currency))}</div></div>
        <div class="card"><div class="label">Invoice Total</div><div class="value">${this.escape(this.fmtMoney(selected.totalInvoiced, selected.currency))}</div></div>
        <div class="card"><div class="label">Amount Received</div><div class="value">${this.escape(this.fmtMoney(selected.totalPaid, selected.currency))}</div></div>
        <div class="card"><div class="label">Pending Amount</div><div class="value">${this.escape(this.fmtMoney(selected.totalDue, selected.currency))}</div></div>
        <div class="card"><div class="label">Receipt Collections</div><div class="value">${this.escape(this.fmtMoney(selected.receiptCollected, selected.currency))}</div></div>
        <div class="card"><div class="label">Payment Schedule</div><div class="value">${this.escape(this.fmtMoney(selected.schedulePaidAmount, selected.currency))} / ${this.escape(this.fmtMoney(selected.scheduledAmount, selected.currency))}</div></div>
        <div class="card"><div class="label">Schedule Balance Due</div><div class="value">${this.escape(this.fmtMoney(selected.scheduleBalanceDue, selected.currency))}</div></div>
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
              return `<div class="card" title="${this.escape(lifecycleMetricHelp[label] || '')}"><div class="label">${this.escape(label)} <span aria-label="Metric calculation help" style="cursor:help">ⓘ</span></div><div class="value">${this.escape(formattedValue)}</div></div>`;
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
      const { accounts, today, companiesById, companiesByName } = this.buildAccountMap(raw);
      const rows = accounts
        .map(account => this.buildAccountAnalytics(account, today, { companiesById, companiesByName }))
        .filter(row => row.companyName || row.clientBusinessId || row.agreementsCount || row.invoicesCount || row.receiptsCount);
      this.state.rows = rows.sort((a, b) => String(this.getLifecycleClientLegalName(a, a?.linkedCompany || null) || '').localeCompare(String(this.getLifecycleClientLegalName(b, b?.linkedCompany || null) || '')));
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
    if (exportBtn) { exportBtn.setAttribute('data-permission-resource','analytics'); exportBtn.setAttribute('data-permission-action','export'); exportBtn.addEventListener('click', () => this.exportRows()); const canExport = Permissions.can('analytics','export') || Permissions.can('lifecycle_analytics','export'); exportBtn.style.display = canExport ? '' : 'none'; exportBtn.disabled = !canExport; }

    const detailRoot = document.getElementById('lifecycleDetailPanel');
    if (detailRoot) detailRoot.addEventListener('click', event => {
      const trigger = event.target.closest('[data-lifecycle-history]');
      if (trigger) this.openStatusHistory(trigger);
    });
    document.getElementById('lifecycleStatusHistoryCloseBtn')?.addEventListener('click', () => this.closeStatusHistory());
    document.getElementById('lifecycleStatusHistoryModal')?.addEventListener('click', event => {
      if (event.target?.id === 'lifecycleStatusHistoryModal') this.closeStatusHistory();
    });

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
    if (!(Permissions.can('analytics','export') || Permissions.can('lifecycle_analytics','export'))) { UI.toast('You do not have permission to export lifecycle analytics.'); return; }
    const rows = this.state.filteredRows || [];
    const headers = ['Client Name', 'Current Stage', 'Payment Status', 'Onboarding Status', 'Technical Status', 'Renewal Status', 'Invoice Number', 'Receipt Number', 'Agreement Number', 'Proposal Number'];
    const csv = [
      headers.join(','),
      ...rows.map(row => [
        this.getLifecycleClientLegalName(row, row?.linkedCompany || null),
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
