const OperationsOnboarding = {
  LOCATION_MATCH_CONFIG: {
    positiveKeywords: ['location', 'site', 'store', 'branch', 'facility', 'address', 'premise', 'premises'],
    negativeKeywords: ['capability', 'license', 'setup fee', 'one time', 'one-time', 'implementation', 'training', 'support', 'discount', 'tax'],
    explicitSections: ['location', 'locations', 'site', 'sites', 'branch', 'branches'],
    explicitTypes: ['location', 'locations', 'site', 'branch']
  },
  OVERDUE_DAYS: 14,
  state: {
    rows: [],
    filteredRows: [],
    loading: false,
    loadError: '',
    loaded: false,
    initialized: false,
    search: '',
    onboardingStatus: 'All',
    requestType: 'All',
    assignedCsm: 'All',
    pendingAgreementId: '',
    postSubmitHook: null,
    agreementMap: new Map(),
    agreementItemsMap: new Map(),
    loadingAgreementIds: new Set(),
    analytics: null,
    drilldown: { kind: '', value: '', label: '' }
  },
  pick(...values) {
    for (const value of values) {
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  },
  normalizeRow(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const nestedAgreement = source.agreement && typeof source.agreement === 'object' ? source.agreement : {};
    const locationCountValue = this.pick(
      source.location_count,
      source.locations_count,
      source.number_of_locations,
      source.total_locations,
      source.locationCount,
      source.locationsCount,
      source.numberOfLocations,
      source.totalLocations,
      source.onboarding?.location_count,
      source.agreement?.location_count
    );
    return {
      onboarding_id: String(this.pick(source.onboarding_id, source.onboardingId, source.id)).trim(),
      agreement_id: String(this.pick(source.agreement_id, source.agreementId, source.agreement_uuid, source.agreementUuid, nestedAgreement.agreement_id, nestedAgreement.agreementId, nestedAgreement.id)).trim(),
      agreement_number: String(this.pick(source.agreement_number, source.agreementNumber, nestedAgreement.agreement_number, nestedAgreement.agreementNumber)).trim(),
      client_id: String(this.pick(source.client_id, source.clientId, source.customer_id, source.customerId, nestedAgreement.client_id, nestedAgreement.clientId)).trim(),
      client_name: String(this.pick(source.client_name, source.clientName, source.customer_name, source.customerName, nestedAgreement.client_name, nestedAgreement.clientName, nestedAgreement.customer_name, nestedAgreement.customerName)).trim(),
      agreement_status: String(this.pick(source.agreement_status, source.agreementStatus, nestedAgreement.agreement_status, nestedAgreement.agreementStatus)).trim(),
      signed_date: String(this.pick(source.signed_date, source.signedDate, source.customer_sign_date, source.customerSignDate, nestedAgreement.signed_date, nestedAgreement.signedDate)).trim(),
      onboarding_status: String(this.pick(source.onboarding_status, source.onboardingStatus)).trim(),
      technical_request_type: String(this.pick(source.technical_request_type, source.technicalRequestType, source.request_type, source.requestType)).trim(),
      technical_request_details: String(this.pick(source.technical_request_details, source.technicalRequestDetails, source.request_details, source.requestDetails, source.request_message, source.requestMessage)).trim(),
      request_type: String(this.pick(source.request_type, source.requestType, source.technical_request_type, source.technicalRequestType)).trim(),
      request_details: String(this.pick(source.request_details, source.requestDetails, source.technical_request_details, source.technicalRequestDetails, source.request_message, source.requestMessage)).trim(),
      request_message: String(this.pick(source.request_message, source.requestMessage, source.technical_request_details, source.technicalRequestDetails, source.request_details, source.requestDetails)).trim(),
      requested_by: String(this.pick(source.requested_by, source.requestedBy)).trim(),
      requested_at: String(this.pick(source.requested_at, source.requestedAt)).trim(),
      technical_admin_request: String(this.pick(source.technical_admin_request, source.technicalAdminRequest, source.lite_request, source.liteRequest, source.full_request, source.fullRequest)).trim(),
      technical_admin_request_message: String(this.pick(source.technical_admin_request_message, source.technicalAdminRequestMessage, source.request_message, source.requestMessage)).trim(),
      technical_request_status: String(this.pick(source.technical_request_status, source.technicalRequestStatus)).trim(),
      csm_assigned_to: String(this.pick(source.csm_assigned_to, source.csmAssignedTo)).trim(),
      csm_assigned_at: String(this.pick(source.csm_assigned_at, source.csmAssignedAt)).trim(),
      priority: String(this.pick(source.priority)).trim(),
      service_start_date: String(this.pick(source.service_start_date, source.serviceStartDate)).trim(),
      service_end_date: String(this.pick(source.service_end_date, source.serviceEndDate)).trim(),
      billing_frequency: String(this.pick(source.billing_frequency, source.billingFrequency)).trim(),
      payment_term: String(this.pick(source.payment_term, source.paymentTerm)).trim(),
      module_summary: String(this.pick(source.module_summary, source.moduleSummary)).trim(),
      go_live_target_date: String(this.pick(source.go_live_target_date, source.goLiveTargetDate)).trim(),
      handover_note: String(this.pick(source.handover_note, source.handoverNote)).trim(),
      updated_at: String(this.pick(source.updated_at, source.updatedAt)).trim(),
      completed_at: String(this.pick(source.completed_at, source.completedAt)).trim(),
      created_at: String(this.pick(source.created_at, source.createdAt)).trim(),
      notes: String(this.pick(source.notes)).trim(),
      location_count: Number(locationCountValue) || 0,
      locations_count: Number(this.pick(source.locations_count, source.locationsCount, locationCountValue)) || 0,
      number_of_locations: Number(this.pick(source.number_of_locations, source.numberOfLocations, locationCountValue)) || 0,
      total_locations: Number(this.pick(source.total_locations, source.totalLocations, locationCountValue)) || 0
    };
  },
  normalizeClientName(name = '') {
    const display = String(name || '').trim();
    const compact = display.replace(/\s+/g, ' ').trim();
    const lowercase = compact.toLowerCase();
    const groupingKey = lowercase.replace(/[\p{P}\p{S}]+/gu, '').replace(/\s+/g, ' ').trim();
    return {
      displayName: compact,
      matchingName: lowercase,
      key: groupingKey || lowercase || 'unknown_client'
    };
  },
  normalizeAgreement(raw = {}, fallbackId = '') {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
      agreement_id: String(this.pick(source.agreement_id, source.agreementId, source.id, fallbackId)).trim(),
      agreement_number: String(this.pick(source.agreement_number, source.agreementNumber)).trim(),
      customer_name: String(this.pick(source.customer_name, source.customerName)).trim(),
      location_count: Number(this.pick(source.location_count, source.locationCount, source.locations_count, source.locationsCount)) || 0
    };
  },
  normalizeAgreementItem(raw = {}, fallbackAgreementId = '') {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
      agreement_id: String(this.pick(source.agreement_id, source.agreementId, fallbackAgreementId)).trim(),
      item_name: String(this.pick(source.item_name, source.itemName, source.name)).trim(),
      section: String(this.pick(source.section)).trim(),
      category: String(this.pick(source.category)).trim(),
      type: String(this.pick(source.type)).trim(),
      line_type: String(this.pick(source.line_type, source.lineType)).trim(),
      description: String(this.pick(source.description, source.notes)).trim(),
      location_name: String(this.pick(source.location_name, source.locationName)).trim(),
      location_address: String(this.pick(source.location_address, source.locationAddress)).trim()
    };
  },
  canWrite() {
    return !Permissions.isViewer() && Permissions.canManageOperationsOnboarding();
  },
  canRequestTechnicalAdmin() {
    return (
      this.canWrite() ||
      (typeof Permissions.canRequestAgreementIncheckLite === 'function' && Permissions.canRequestAgreementIncheckLite()) ||
      (typeof Permissions.canRequestAgreementIncheckFull === 'function' && Permissions.canRequestAgreementIncheckFull())
    );
  },
  extractRows(response) {
    const candidates = [response, response?.items, response?.rows, response?.data, response?.result, response?.payload, response?.data?.rows];
    for (const candidate of candidates) if (Array.isArray(candidate)) return candidate;
    return [];
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

    const candidates = [response, response?.data, response?.result, response?.payload, response?.item, response?.agreement];
    let agreement = null;
    let items = [];

    for (const rawCandidate of candidates) {
      const candidate = parseJsonIfNeeded(rawCandidate);
      if (!candidate) continue;

      if (Array.isArray(candidate)) {
        const first = candidate[0];
        if (!agreement && first && typeof first === 'object') agreement = first;
        if (!items.length && Array.isArray(first?.items)) items = first.items;
        continue;
      }

      if (typeof candidate !== 'object') continue;

      if (!agreement) {
        if (candidate.item && typeof candidate.item === 'object') agreement = candidate.item;
        else if (candidate.agreement && typeof candidate.agreement === 'object') agreement = candidate.agreement;
        else if (Array.isArray(candidate.data) && candidate.data[0] && typeof candidate.data[0] === 'object') agreement = candidate.data[0];
        else if (candidate.data && typeof candidate.data === 'object' && !Array.isArray(candidate.data)) agreement = candidate.data;
        else if (candidate.agreement_id || candidate.agreement_number) agreement = candidate;
      }

      if (!items.length) {
        if (Array.isArray(candidate.items)) items = candidate.items;
        else if (Array.isArray(candidate.agreement_items)) items = candidate.agreement_items;
        else if (candidate.item && Array.isArray(candidate.item.items)) items = candidate.item.items;
        else if (candidate.agreement && Array.isArray(candidate.agreement.items)) items = candidate.agreement.items;
        else if (Array.isArray(candidate.data) && Array.isArray(candidate.data[0]?.items)) items = candidate.data[0].items;
        else if (candidate.data && Array.isArray(candidate.data.items)) items = candidate.data.items;
      }
    }

    return {
      agreement: this.normalizeAgreement(agreement || { agreement_id: fallbackId }, fallbackId),
      items: Array.isArray(items) ? items.map(item => this.normalizeAgreementItem(item, fallbackId)) : []
    };
  },
  parseDate(value = '') {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  },
  formatDate(value = '') {
    const parsed = this.parseDate(value);
    if (!parsed) return '—';
    return U.fmtDisplayDate(value);
  },
  daysOpen(row) {
    const start = this.parseDate(row?.requested_at || row?.signed_date || '');
    if (!start) return 0;
    const now = new Date();
    return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86400000));
  },
  isCompletedStatus(status = '') {
    return String(status || '').trim().toLowerCase().includes('complete');
  },
  isActiveStatus(status = '') {
    const normalized = String(status || '').trim().toLowerCase();
    if (!normalized) return true;
    return !normalized.includes('complete') && !normalized.includes('cancel') && !normalized.includes('closed');
  },
  isOverdue(row = {}) {
    return !this.isCompletedStatus(row.onboarding_status) && this.daysOpen(row) >= this.OVERDUE_DAYS;
  },
  requestTypeBucket(requestType = '') {
    const normalized = String(requestType || '').trim().toLowerCase();
    if (normalized === 'technical_admin' || normalized === 'technical admin' || normalized === 'technical admin request') return 'Technical Admin';
    if (normalized === 'incheck_lite' || normalized === 'incheck lite') return 'Technical Admin';
    if (normalized === 'incheck_full' || normalized === 'incheck full') return 'Technical Admin';
    return 'Other / Blank';
  },
  isLocationAgreementItem(item = {}) {
    const safe = item && typeof item === 'object' ? item : {};
    const fields = [safe.item_name, safe.section, safe.category, safe.type, safe.line_type, safe.description]
      .map(value => String(value || '').toLowerCase().trim())
      .filter(Boolean);

    if (!fields.length) {
      return Boolean(String(safe.location_name || '').trim() || String(safe.location_address || '').trim());
    }

    const hasExplicitSection = fields.some(field => this.LOCATION_MATCH_CONFIG.explicitSections.includes(field));
    const hasExplicitType = fields.some(field => this.LOCATION_MATCH_CONFIG.explicitTypes.includes(field));
    if (hasExplicitSection || hasExplicitType) return true;

    if (String(safe.location_name || '').trim() || String(safe.location_address || '').trim()) return true;

    const combined = fields.join(' ');
    const hasPositiveKeyword = this.LOCATION_MATCH_CONFIG.positiveKeywords.some(keyword => combined.includes(keyword));
    const hasNegativeKeyword = this.LOCATION_MATCH_CONFIG.negativeKeywords.some(keyword => combined.includes(keyword));

    return hasPositiveKeyword && !hasNegativeKeyword;
  },
  deriveAgreementLocationCount(agreement = {}, agreementItems = [], onboardingRecord = {}) {
    const safeItems = Array.isArray(agreementItems) ? agreementItems : [];
    if (safeItems.length) {
      const derived = safeItems.filter(item => this.isLocationAgreementItem(item)).length;
      if (derived > 0) return derived;
    }

    const agreementFallback = Number(this.pick(agreement?.location_count, agreement?.locations_count, agreement?.locationCount, agreement?.locationsCount));
    if (Number.isFinite(agreementFallback) && agreementFallback > 0) return agreementFallback;

    const onboardingFallback = Number(this.pick(onboardingRecord?.location_count, onboardingRecord?.locations_count, onboardingRecord?.locationCount, onboardingRecord?.locationsCount));
    if (Number.isFinite(onboardingFallback) && onboardingFallback > 0) return onboardingFallback;

    return 0;
  },
  buildAgreementAnalyticsRollup(onboardingRows, agreementMap, agreementItemsMap) {
    const rollup = [];
    (Array.isArray(onboardingRows) ? onboardingRows : []).forEach(row => {
      const agreementId = String(row.agreement_id || '').trim();
      if (!agreementId) return;
      const agreement = agreementMap.get(agreementId) || {};
      const items = agreementItemsMap.get(agreementId) || [];
      const locationCount = this.deriveAgreementLocationCount(agreement, items, row);
      rollup.push({
        agreement_id: agreementId,
        agreement_number: row.agreement_number || agreement.agreement_number || agreementId,
        client_name: row.client_name || agreement.customer_name || 'Unknown Client',
        normalized_client: this.normalizeClientName(row.client_name || agreement.customer_name || 'Unknown Client').key,
        locations: locationCount,
        onboarding_status: row.onboarding_status || 'Unknown',
        request_type: this.requestTypeBucket(row.request_type),
        raw_request_type: row.request_type || '',
        csm_assigned_to: row.csm_assigned_to || '',
        requested_at: row.requested_at || '',
        signed_date: row.signed_date || '',
        days_open: this.daysOpen(row),
        overdue: this.isOverdue(row),
        notes: row.notes || ''
      });
    });
    return rollup;
  },
  buildClientAnalyticsRollup(onboardingRows, agreementMap, agreementItemsMap) {
    const clientMap = new Map();
    const agreementRollup = this.buildAgreementAnalyticsRollup(onboardingRows, agreementMap, agreementItemsMap);

    agreementRollup.forEach(agreementRow => {
      const normalized = this.normalizeClientName(agreementRow.client_name);
      const key = normalized.key;
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          unique_client_key: key,
          client_display_name: normalized.displayName || agreementRow.client_name || 'Unknown Client',
          agreement_ids: new Set(),
          agreement_count: 0,
          total_locations: 0,
          active_onboarding_count: 0,
          completed_onboarding_count: 0,
          technical_admin_count: 0,
          assigned_csm_count: 0,
          overdue_count: 0,
          last_request_date: '',
          requested_dates: []
        });
      }

      const agg = clientMap.get(key);
      agg.agreement_ids.add(agreementRow.agreement_id);
      agg.total_locations += Number(agreementRow.locations || 0);
      if (this.isActiveStatus(agreementRow.onboarding_status)) agg.active_onboarding_count += 1;
      if (this.isCompletedStatus(agreementRow.onboarding_status)) agg.completed_onboarding_count += 1;
      if (agreementRow.request_type === 'Technical Admin') agg.technical_admin_count += 1;
      if (String(agreementRow.csm_assigned_to || '').trim()) agg.assigned_csm_count += 1;
      if (agreementRow.overdue) agg.overdue_count += 1;

      const reqDate = this.parseDate(agreementRow.requested_at || agreementRow.signed_date || '');
      if (reqDate) {
        agg.requested_dates.push(reqDate);
        const iso = reqDate.toISOString();
        if (!agg.last_request_date || iso > agg.last_request_date) agg.last_request_date = iso;
      }

      if (!agg.client_display_name && normalized.displayName) agg.client_display_name = normalized.displayName;
    });

    return [...clientMap.values()].map(entry => ({
      unique_client_key: entry.unique_client_key,
      client_display_name: entry.client_display_name,
      agreement_count: entry.agreement_ids.size,
      total_locations: entry.total_locations,
      active_onboarding_count: entry.active_onboarding_count,
      completed_onboarding_count: entry.completed_onboarding_count,
      technical_admin_count: entry.technical_admin_count,
      assigned_csm_count: entry.assigned_csm_count,
      overdue_count: entry.overdue_count,
      last_request_date: entry.last_request_date ? entry.last_request_date.slice(0, 10) : ''
    }));
  },
  getBaseFilteredRows() {
    const search = String(this.state.search || '').trim().toLowerCase();
    const terms = search ? search.split(/\s+/).filter(Boolean) : [];
    return this.state.rows.filter(row => {
      if (this.state.onboardingStatus !== 'All' && row.onboarding_status !== this.state.onboardingStatus) return false;
      if (this.state.requestType !== 'All' && row.request_type !== this.state.requestType) return false;
      if (this.state.assignedCsm !== 'All' && row.csm_assigned_to !== this.state.assignedCsm) return false;
      if (!terms.length) return true;
      const hay = [
        row.onboarding_id,
        row.agreement_id,
        row.agreement_number,
        row.client_name,
        row.onboarding_status,
        row.request_type,
        row.requested_by,
        row.csm_assigned_to
      ]
        .join(' ')
        .toLowerCase();
      return terms.every(term => hay.includes(term));
    });
  },
  matchesDrilldown(row) {
    const kind = this.state.drilldown.kind;
    const value = String(this.state.drilldown.value || '');
    if (!kind || !value) return true;

    if (kind === 'client') return this.normalizeClientName(row.client_name).key === value;
    if (kind === 'csm') return String(row.csm_assigned_to || '').trim() === value;
    if (kind === 'status') return String(row.onboarding_status || '').trim() === value;
    if (kind === 'request_type') return this.requestTypeBucket(row.request_type) === value;
    if (kind === 'agreement') return String(row.agreement_id || '').trim() === value;
    if (kind === 'overdue') return this.isOverdue(row) === (value === 'true');
    if (kind === 'completed') return this.isCompletedStatus(row.onboarding_status) === (value === 'true');
    if (kind === 'assigned') {
      const assigned = Boolean(String(row.csm_assigned_to || '').trim());
      return assigned === (value === 'true');
    }
    return true;
  },
  setDrilldown(kind = '', value = '', label = '') {
    this.state.drilldown = {
      kind: String(kind || '').trim(),
      value: String(value || '').trim(),
      label: String(label || '').trim()
    };
    this.applyFilters();
    this.render();
  },
  clearDrilldown() {
    if (!this.state.drilldown.kind) return;
    this.state.drilldown = { kind: '', value: '', label: '' };
    this.applyFilters();
    this.render();
  },
  applyFilters() {
    const baseRows = this.getBaseFilteredRows();
    this.state.filteredRows = baseRows.filter(row => this.matchesDrilldown(row));
    this.state.analytics = this.computeAnalytics(this.state.filteredRows);
  },
  computeAnalytics(rows = []) {
    const agreementRollup = this.buildAgreementAnalyticsRollup(rows, this.state.agreementMap, this.state.agreementItemsMap);
    const clientRollup = this.buildClientAnalyticsRollup(rows, this.state.agreementMap, this.state.agreementItemsMap);

    const uniqueClients = clientRollup.length;
    const totalAgreements = new Set(agreementRollup.map(row => row.agreement_id)).size;
    const totalLocations = agreementRollup.reduce((sum, row) => sum + Number(row.locations || 0), 0);
    const avgLocationsPerClient = uniqueClients > 0 ? totalLocations / uniqueClients : 0;
    const avgAgreementsPerClient = uniqueClients > 0 ? totalAgreements / uniqueClients : 0;

    const statusMap = new Map();
    const requestMap = new Map([
      ['Technical Admin', 0],
      ['Other / Blank', 0]
    ]);
    const clientLocationsMap = new Map();
    const clientAgreementsMap = new Map();
    const csmMap = new Map();
    const weeklyTrendMap = new Map();
    const monthlyTrendMap = new Map();

    agreementRollup.forEach(row => {
      const status = String(row.onboarding_status || 'Unknown').trim() || 'Unknown';
      statusMap.set(status, (statusMap.get(status) || 0) + 1);

      const requestBucket = this.requestTypeBucket(row.raw_request_type);
      requestMap.set(requestBucket, (requestMap.get(requestBucket) || 0) + 1);

      clientLocationsMap.set(row.normalized_client, (clientLocationsMap.get(row.normalized_client) || 0) + Number(row.locations || 0));
      clientAgreementsMap.set(row.normalized_client, (clientAgreementsMap.get(row.normalized_client) || 0) + 1);

      const csm = String(row.csm_assigned_to || '').trim() || 'Unassigned';
      if (!csmMap.has(csm)) {
        csmMap.set(csm, {
          csm_name: csm,
          active_agreements: 0,
          completed_agreements: 0,
          overdue_items: 0,
          total_locations: 0,
          unique_clients: new Set(),
          completion_days_sum: 0,
          completion_days_count: 0
        });
      }
      const csmAgg = csmMap.get(csm);
      csmAgg.total_locations += Number(row.locations || 0);
      csmAgg.unique_clients.add(row.normalized_client);
      if (this.isActiveStatus(row.onboarding_status)) csmAgg.active_agreements += 1;
      if (this.isCompletedStatus(row.onboarding_status)) {
        csmAgg.completed_agreements += 1;
        csmAgg.completion_days_sum += Number(row.days_open || 0);
        csmAgg.completion_days_count += 1;
      }
      if (row.overdue) csmAgg.overdue_items += 1;

      const eventDate = this.parseDate(row.signed_date || row.requested_at || '');
      if (eventDate) {
        const weekKey = this.getWeekKey(eventDate);
        const monthKey = `${eventDate.getUTCFullYear()}-${String(eventDate.getUTCMonth() + 1).padStart(2, '0')}`;
        const currentWeek = weeklyTrendMap.get(weekKey) || { agreements: 0, locations: 0 };
        currentWeek.agreements += 1;
        currentWeek.locations += Number(row.locations || 0);
        weeklyTrendMap.set(weekKey, currentWeek);

        const currentMonth = monthlyTrendMap.get(monthKey) || { agreements: 0, locations: 0 };
        currentMonth.agreements += 1;
        currentMonth.locations += Number(row.locations || 0);
        monthlyTrendMap.set(monthKey, currentMonth);
      }
    });

    const clientDisplayMap = new Map(clientRollup.map(client => [client.unique_client_key, client.client_display_name]));

    const csmRollup = [...csmMap.values()].map(entry => ({
      csm_name: entry.csm_name,
      active_agreements: entry.active_agreements,
      unique_clients: entry.unique_clients.size,
      total_locations: entry.total_locations,
      completed_agreements: entry.completed_agreements,
      overdue_items: entry.overdue_items,
      avg_completion_days: entry.completion_days_count > 0 ? entry.completion_days_sum / entry.completion_days_count : 0
    }));

    const overdueRows = agreementRollup.filter(row => row.overdue);

    return {
      totals: {
        uniqueClients,
        totalAgreements,
        totalLocations,
        avgLocationsPerClient,
        avgAgreementsPerClient,
        technicalAdmin: requestMap.get('Technical Admin') || 0,
        assignedToCsm: agreementRollup.filter(row => String(row.csm_assigned_to || '').trim()).length,
        unassigned: agreementRollup.filter(row => !String(row.csm_assigned_to || '').trim()).length,
        completed: agreementRollup.filter(row => this.isCompletedStatus(row.onboarding_status)).length,
        overdue: overdueRows.length
      },
      statusDistribution: [...statusMap.entries()].sort((a, b) => b[1] - a[1]),
      requestDistribution: [...requestMap.entries()],
      comparativeTotals: [
        ['Unique Clients', uniqueClients],
        ['Agreements', totalAgreements],
        ['Locations', totalLocations]
      ],
      locationsByClient: [...clientLocationsMap.entries()]
        .map(([key, count]) => [clientDisplayMap.get(key) || key, count, key])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      agreementsByClient: [...clientAgreementsMap.entries()]
        .map(([key, count]) => [clientDisplayMap.get(key) || key, count, key])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      csmWorkload: csmRollup.sort((a, b) => b.active_agreements - a.active_agreements),
      weeklyTrend: [...weeklyTrendMap.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      monthlyTrend: [...monthlyTrendMap.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      clientRollup: clientRollup.sort((a, b) => b.total_locations - a.total_locations),
      agreementRollup,
      overdueRollup: overdueRows
    };
  },
  getWeekKey(date) {
    const dt = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
    return `${dt.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  },
  async hydrateAgreementData(rows = []) {
    const ids = [...new Set((Array.isArray(rows) ? rows : []).map(row => String(row.agreement_id || '').trim()).filter(Boolean))];
    const missingIds = ids.filter(id => !this.state.agreementMap.has(id) && !this.state.loadingAgreementIds.has(id));
    if (!missingIds.length) return;

    missingIds.forEach(id => this.state.loadingAgreementIds.add(id));

    await Promise.all(
      missingIds.map(async agreementId => {
        try {
          const response = await Api.getAgreement(agreementId);
          const parsed = this.extractAgreementAndItems(response, agreementId);
          this.state.agreementMap.set(agreementId, parsed.agreement);
          this.state.agreementItemsMap.set(agreementId, parsed.items);
        } catch (_error) {
          this.state.agreementMap.set(agreementId, { agreement_id: agreementId });
          this.state.agreementItemsMap.set(agreementId, []);
        } finally {
          this.state.loadingAgreementIds.delete(agreementId);
        }
      })
    );
  },
  renderFilters() {
    const buildOptions = values => ['All', ...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const fill = (el, options, selected) => {
      if (!el) return;
      el.innerHTML = options.map(v => `<option>${U.escapeHtml(v)}</option>`).join('');
      el.value = options.includes(selected) ? selected : 'All';
    };
    fill(E.operationsOnboardingStatusFilter, buildOptions(this.state.rows.map(r => r.onboarding_status)), this.state.onboardingStatus);
    fill(E.operationsOnboardingRequestTypeFilter, buildOptions(this.state.rows.map(r => r.request_type)), this.state.requestType);
    fill(E.operationsOnboardingCsmFilter, buildOptions(this.state.rows.map(r => r.csm_assigned_to)), this.state.assignedCsm);
    if (E.operationsOnboardingSearchInput) E.operationsOnboardingSearchInput.value = this.state.search;
  },
  renderSummary() {
    if (!E.operationsOnboardingSummary) return;
    const totals = this.state.analytics?.totals || {};
    const kpis = [
      ['Unique Clients', totals.uniqueClients || 0, 'clear', ''],
      ['Total Agreements', totals.totalAgreements || 0, 'clear', ''],
      ['Total Locations', totals.totalLocations || 0, 'clear', ''],
      ['Avg Locations per Client', (totals.avgLocationsPerClient || 0).toFixed(2), 'clear', ''],
      ['Avg Agreements per Client', (totals.avgAgreementsPerClient || 0).toFixed(2), 'clear', ''],
      ['Technical Admin Requests', totals.technicalAdmin || 0, 'request_type', 'Technical Admin'],
      ['Assigned to CSM', totals.assignedToCsm || 0, 'assigned', 'true'],
      ['Unassigned', totals.unassigned || 0, 'assigned', 'false'],
      ['Completed', totals.completed || 0, 'completed', 'true'],
      ['Overdue / Stuck', totals.overdue || 0, 'overdue', 'true']
    ];

    E.operationsOnboardingSummary.innerHTML = kpis
      .map(([label, value, filterKind, filterValue]) => {
        const active = this.state.drilldown.kind === filterKind && this.state.drilldown.value === String(filterValue);
        return `<button type="button" class="card kpi" data-op-analytics-filter-kind="${U.escapeAttr(filterKind)}" data-op-analytics-filter-value="${U.escapeAttr(String(filterValue))}" style="text-align:left;cursor:pointer;${active ? 'outline:1px solid rgba(59,130,246,.7);' : ''}">
          <div class="label">${U.escapeHtml(label)}</div>
          <div class="value">${U.escapeHtml(String(value))}</div>
        </button>`;
      })
      .join('');
  },
  renderDistribution(el, entries = [], total = 0, filterKind = '') {
    if (!el) return;
    if (!entries.length) {
      el.innerHTML = '<div class="muted">No data for current filters.</div>';
      return;
    }
    el.innerHTML = entries
      .map(([label, count]) => {
        const percent = total > 0 ? (count / total) * 100 : 0;
        return `<button type="button" class="deals-status-row" style="width:100%;background:transparent;border:none;text-align:left;cursor:pointer;" data-op-analytics-filter-kind="${U.escapeAttr(filterKind)}" data-op-analytics-filter-value="${U.escapeAttr(String(label))}">
          <div class="deals-status-label">${U.escapeHtml(String(label))}</div>
          <div class="leads-status-track"><span class="deals-status-fill" style="width:${Math.min(100, percent).toFixed(1)}%"></span></div>
          <div class="deals-status-meta">${U.escapeHtml(String(count))} · ${percent.toFixed(1)}%</div>
        </button>`;
      })
      .join('');
  },
  renderComparativeChart() {
    if (!E.operationsOnboardingComparativeChart) return;
    const entries = this.state.analytics?.comparativeTotals || [];
    const max = Math.max(1, ...entries.map(([, value]) => Number(value || 0)));
    E.operationsOnboardingComparativeChart.innerHTML = entries
      .map(([label, value]) => {
        const width = (Number(value || 0) / max) * 100;
        return `<div style="margin-bottom:8px;">
          <div class="muted" style="display:flex;justify-content:space-between;"><span>${U.escapeHtml(label)}</span><strong>${U.escapeHtml(String(value))}</strong></div>
          <div class="leads-status-track"><span class="deals-status-fill" style="width:${Math.min(100, width).toFixed(1)}%"></span></div>
        </div>`;
      })
      .join('');
  },
  renderTopClientChart(el, entries = [], metricLabel = 'Locations') {
    if (!el) return;
    if (!entries.length) {
      el.innerHTML = '<div class="muted">No client data for current filters.</div>';
      return;
    }
    const max = Math.max(1, ...entries.map(([, value]) => Number(value || 0)));
    el.innerHTML = entries
      .map(([clientName, value, normalizedKey]) => {
        const width = (Number(value || 0) / max) * 100;
        return `<button type="button" class="deals-status-row" style="width:100%;background:transparent;border:none;text-align:left;cursor:pointer;" data-op-analytics-filter-kind="client" data-op-analytics-filter-value="${U.escapeAttr(String(normalizedKey))}">
          <div class="deals-status-label">${U.escapeHtml(String(clientName))}</div>
          <div class="leads-status-track"><span class="deals-status-fill" style="width:${Math.min(100, width).toFixed(1)}%"></span></div>
          <div class="deals-status-meta">${U.escapeHtml(String(value))} ${U.escapeHtml(metricLabel)}</div>
        </button>`;
      })
      .join('');
  },
  renderCsmChart() {
    if (!E.operationsOnboardingCsmChart) return;
    const entries = this.state.analytics?.csmWorkload || [];
    if (!entries.length) {
      E.operationsOnboardingCsmChart.innerHTML = '<div class="muted">No CSM workload data for current filters.</div>';
      return;
    }

    const max = Math.max(1, ...entries.map(entry => Number(entry.active_agreements || 0)));
    E.operationsOnboardingCsmChart.innerHTML = entries
      .map(entry => {
        const width = (Number(entry.active_agreements || 0) / max) * 100;
        return `<button type="button" class="deals-status-row" style="width:100%;background:transparent;border:none;text-align:left;cursor:pointer;" data-op-analytics-filter-kind="csm" data-op-analytics-filter-value="${U.escapeAttr(entry.csm_name === 'Unassigned' ? '' : entry.csm_name)}">
          <div class="deals-status-label">${U.escapeHtml(entry.csm_name)}</div>
          <div class="leads-status-track"><span class="deals-status-fill" style="width:${Math.min(100, width).toFixed(1)}%"></span></div>
          <div class="deals-status-meta">${entry.active_agreements} active · ${entry.total_locations} locations</div>
        </button>`;
      })
      .join('');
  },
  renderTrendChart() {
    if (!E.operationsOnboardingTrendChart) return;
    const monthly = this.state.analytics?.monthlyTrend || [];
    const weekly = this.state.analytics?.weeklyTrend || [];
    if (!monthly.length && !weekly.length) {
      E.operationsOnboardingTrendChart.innerHTML = '<div class="muted">No trend data for current filters.</div>';
      return;
    }

    const monthRows = monthly
      .map(([label, value]) => `<tr><td>${U.escapeHtml(label)}</td><td>${U.escapeHtml(String(value.agreements))}</td><td>${U.escapeHtml(String(value.locations))}</td></tr>`)
      .join('');
    const weekRows = weekly
      .slice(-8)
      .map(([label, value]) => `<tr><td>${U.escapeHtml(label)}</td><td>${U.escapeHtml(String(value.agreements))}</td><td>${U.escapeHtml(String(value.locations))}</td></tr>`)
      .join('');

    E.operationsOnboardingTrendChart.innerHTML = `
      <div class="muted" style="margin-bottom:6px;">Monthly onboarding intake (agreements + locations)</div>
      <div class="table-wrap" style="max-height:180px;"><table><thead><tr><th>Month</th><th>Agreements</th><th>Locations</th></tr></thead><tbody>${monthRows || '<tr><td colspan="3" class="muted">No monthly data.</td></tr>'}</tbody></table></div>
      <div class="muted" style="margin:10px 0 6px;">Recent weekly trend</div>
      <div class="table-wrap" style="max-height:180px;"><table><thead><tr><th>Week</th><th>Agreements</th><th>Locations</th></tr></thead><tbody>${weekRows || '<tr><td colspan="3" class="muted">No weekly data.</td></tr>'}</tbody></table></div>
    `;
  },
  renderAdvancedTables() {
    const analytics = this.state.analytics || {};

    if (E.operationsOnboardingClientRollupBody) {
      const rows = analytics.clientRollup || [];
      E.operationsOnboardingClientRollupBody.innerHTML = rows.length
        ? rows
          .map(
            row => `<tr data-op-analytics-filter-kind="client" data-op-analytics-filter-value="${U.escapeAttr(row.unique_client_key)}" style="cursor:pointer;">
              <td>${U.escapeHtml(row.client_display_name || '—')}</td>
              <td>${U.escapeHtml(row.unique_client_key || '—')}</td>
              <td>${U.escapeHtml(String(row.agreement_count || 0))}</td>
              <td>${U.escapeHtml(String(row.total_locations || 0))}</td>
              <td>${U.escapeHtml(String(row.active_onboarding_count || 0))}</td>
              <td>${U.escapeHtml(String(row.completed_onboarding_count || 0))}</td>
              <td>${U.escapeHtml(String(row.technical_admin_count || 0))}</td>
              <td>${U.escapeHtml(String(row.assigned_csm_count || 0))}</td>
              <td>${U.escapeHtml(String(row.overdue_count || 0))}</td>
              <td>${U.escapeHtml(row.last_request_date || '—')}</td>
            </tr>`
          )
          .join('')
        : '<tr><td colspan="10" class="muted" style="text-align:center;">No client rollup data.</td></tr>';
    }

    if (E.operationsOnboardingAgreementRollupBody) {
      const rows = analytics.agreementRollup || [];
      E.operationsOnboardingAgreementRollupBody.innerHTML = rows.length
        ? rows
          .map(
            row => `<tr data-op-analytics-filter-kind="agreement" data-op-analytics-filter-value="${U.escapeAttr(row.agreement_id)}" style="cursor:pointer;">
              <td>${U.escapeHtml(row.agreement_number || row.agreement_id || '—')}</td>
              <td>${U.escapeHtml(row.client_name || '—')}</td>
              <td>${U.escapeHtml(String(row.locations || 0))}</td>
              <td>${U.escapeHtml(row.onboarding_status || '—')}</td>
              <td>${U.escapeHtml(row.request_type || '—')}</td>
              <td>${U.escapeHtml(row.csm_assigned_to || 'Unassigned')}</td>
              <td>${U.escapeHtml(this.formatDate(row.requested_at || row.signed_date))}</td>
              <td>${U.escapeHtml(String(row.days_open || 0))}</td>
            </tr>`
          )
          .join('')
        : '<tr><td colspan="8" class="muted" style="text-align:center;">No agreement rollup data.</td></tr>';
    }

    if (E.operationsOnboardingOverdueBody) {
      const rows = analytics.overdueRollup || [];
      E.operationsOnboardingOverdueBody.innerHTML = rows.length
        ? rows
          .map(
            row => `<tr data-op-analytics-filter-kind="agreement" data-op-analytics-filter-value="${U.escapeAttr(row.agreement_id)}" style="cursor:pointer;">
              <td>${U.escapeHtml(row.agreement_number || row.agreement_id || '—')}</td>
              <td>${U.escapeHtml(row.client_name || '—')}</td>
              <td>${U.escapeHtml(String(row.locations || 0))}</td>
              <td>${U.escapeHtml(row.onboarding_status || '—')}</td>
              <td>${U.escapeHtml(row.csm_assigned_to || 'Unassigned')}</td>
              <td>${U.escapeHtml(String(row.days_open || 0))}</td>
              <td>${U.escapeHtml(row.notes || 'Needs follow-up')}</td>
            </tr>`
          )
          .join('')
        : '<tr><td colspan="7" class="muted" style="text-align:center;">No overdue items.</td></tr>';
    }

    if (E.operationsOnboardingCsmWorkloadBody) {
      const rows = analytics.csmWorkload || [];
      E.operationsOnboardingCsmWorkloadBody.innerHTML = rows.length
        ? rows
          .map(
            row => `<tr data-op-analytics-filter-kind="csm" data-op-analytics-filter-value="${U.escapeAttr(row.csm_name === 'Unassigned' ? '' : row.csm_name)}" style="cursor:pointer;">
              <td>${U.escapeHtml(row.csm_name || 'Unassigned')}</td>
              <td>${U.escapeHtml(String(row.active_agreements || 0))}</td>
              <td>${U.escapeHtml(String(row.unique_clients || 0))}</td>
              <td>${U.escapeHtml(String(row.total_locations || 0))}</td>
              <td>${U.escapeHtml(String(row.completed_agreements || 0))}</td>
              <td>${U.escapeHtml(String(row.overdue_items || 0))}</td>
              <td>${U.escapeHtml(row.avg_completion_days ? row.avg_completion_days.toFixed(1) : '0.0')}</td>
            </tr>`
          )
          .join('')
        : '<tr><td colspan="7" class="muted" style="text-align:center;">No CSM workload data.</td></tr>';
    }
  },
  renderAnalyticsPanels() {
    const totalRows = this.state.filteredRows.length;
    this.renderDistribution(E.operationsOnboardingStatusDistribution, this.state.analytics?.statusDistribution || [], totalRows, 'status');
    this.renderDistribution(E.operationsOnboardingRequestDistribution, this.state.analytics?.requestDistribution || [], totalRows, 'request_type');
    this.renderComparativeChart();
    this.renderTopClientChart(E.operationsOnboardingLocationsByClient, this.state.analytics?.locationsByClient || [], 'locations');
    this.renderTopClientChart(E.operationsOnboardingAgreementsByClient, this.state.analytics?.agreementsByClient || [], 'agreements');
    this.renderCsmChart();
    this.renderTrendChart();
    this.renderAdvancedTables();

    if (E.operationsOnboardingDrilldownState) {
      E.operationsOnboardingDrilldownState.textContent = this.state.drilldown.kind
        ? `Drilldown: ${this.state.drilldown.kind} = ${this.state.drilldown.value || 'all'} (${this.state.filteredRows.length} rows)`
        : 'No drilldown filter active.';
    }
  },
  render() {
    if (!E.operationsOnboardingTbody || !E.operationsOnboardingState) return;
    if (this.state.loading) {
      E.operationsOnboardingState.textContent = 'Loading operations onboarding…';
      E.operationsOnboardingTbody.innerHTML = '<tr><td colspan="19" class="muted" style="text-align:center;">Loading operations onboarding…</td></tr>';
      return;
    }
    if (this.state.loadError) {
      E.operationsOnboardingState.textContent = this.state.loadError;
      E.operationsOnboardingTbody.innerHTML = `<tr><td colspan="19" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(this.state.loadError)}</td></tr>`;
      return;
    }
    const rows = this.state.filteredRows;
    this.renderSummary();
    this.renderAnalyticsPanels();
    E.operationsOnboardingState.textContent = `${rows.length} onboarding row${rows.length === 1 ? '' : 's'}`;
    if (!rows.length) {
      E.operationsOnboardingTbody.innerHTML = '<tr><td colspan="19" class="muted" style="text-align:center;">No onboarding rows found.</td></tr>';
      return;
    }
    const text = value => U.escapeHtml(String(value || '—'));
    const canWrite = this.canWrite();
    E.operationsOnboardingTbody.innerHTML = rows.map(row => {
      const agreementId = U.escapeAttr(row.agreement_id);
      const onboardingId = U.escapeAttr(row.onboarding_id);
      const hasAgreementId = Boolean(String(row.agreement_id || '').trim());
      const agreement = this.state.agreementMap.get(row.agreement_id) || {};
      const agreementItems = this.state.agreementItemsMap.get(row.agreement_id) || [];
      const locationCount = this.deriveAgreementLocationCount(agreement, agreementItems, row);
      return `<tr>
          <td>${text(row.onboarding_id)}</td><td>${text(row.agreement_id)}</td><td>${text(row.agreement_number)}</td><td>${text(row.client_name)}</td><td>${text(this.formatDate(row.signed_date))}</td><td>${text(row.onboarding_status)}</td>
          <td>${text(row.request_type || row.technical_request_type)}</td><td>${text(row.requested_by)}</td><td>${text(this.formatDate(row.requested_at))}</td><td>${text(row.technical_request_status || row.technical_admin_request)}</td><td>${text(row.request_message || row.technical_request_details || row.technical_admin_request_message)}</td><td>${text(row.csm_assigned_to)}</td><td>${text(locationCount)}</td><td>${text(this.formatDate(row.service_start_date))}</td><td>${text(this.formatDate(row.service_end_date))}</td><td>${text(row.billing_frequency)}</td><td>${text(row.payment_term)}</td><td>${text(this.formatDate(row.updated_at))}</td>
          <td><div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn ghost sm" type="button" data-op-open-agreement="${agreementId}" ${hasAgreementId ? '' : 'disabled title="Agreement ID not available"'}>Open Agreement</button>
            <button class="btn ghost sm" type="button" data-op-open-details="${onboardingId}">Open Onboarding Details</button>
            ${canWrite ? `<button class="btn ghost sm" type="button" data-op-technical-admin="${agreementId}" ${hasAgreementId ? '' : 'disabled title="Agreement ID not available"'}>Technical Admin Request</button>
            <button class="btn ghost sm" type="button" data-op-assign-csm="${agreementId}" ${hasAgreementId ? '' : 'disabled title="Agreement ID not available"'}>Assign CSM</button>
            <button class="btn ghost sm" type="button" data-op-mark-progress="${agreementId}" ${hasAgreementId ? '' : 'disabled title="Agreement ID not available"'}>Mark In Progress</button>
            <button class="btn ghost sm" type="button" data-op-mark-completed="${agreementId}" ${hasAgreementId ? '' : 'disabled title="Agreement ID not available"'}>Mark Completed</button>` : ''}
          </div></td>
        </tr>`;
    }).join('');
  },
  async loadAndRefresh({ force = false } = {}) {
    if (this.state.loading && !force) return;
    this.state.loading = true;
    this.state.loadError = '';
    this.render();
    try {
      const response = await Api.listOperationsOnboarding({
        onboarding_status: this.state.onboardingStatus !== 'All' ? this.state.onboardingStatus : '',
        request_type: this.state.requestType !== 'All' ? this.state.requestType : '',
        csm_assigned_to: this.state.assignedCsm !== 'All' ? this.state.assignedCsm : '',
        search: this.state.search
      });
      this.state.rows = this.extractRows(response).map(row => this.normalizeRow(row));
      await this.hydrateAgreementData(this.state.rows);
      this.state.loaded = true;
    } catch (error) {
      this.state.rows = [];
      this.state.loadError = String(error?.message || '').trim() || 'Unable to load operations onboarding.';
    } finally {
      this.state.loading = false;
      this.applyFilters();
      this.renderFilters();
      this.render();
    }
  },
  upsertByAgreement(agreementId, patch = {}) {
    const id = String(agreementId || '').trim();
    if (!id) return;
    const idx = this.state.rows.findIndex(row => String(row.agreement_id || '') === id);
    if (idx === -1) return;
    this.state.rows[idx] = this.normalizeRow({ ...this.state.rows[idx], ...patch, agreement_id: id });
    this.applyFilters();
    this.render();
  },
  async openOnboardingDetails(onboardingId = '', agreementId = '') {
    try {
      const response = await Api.getOperationsOnboarding(onboardingId ? { onboarding_id: onboardingId } : { agreement_id: agreementId });
      const detail = this.normalizeRow(response?.onboarding || response?.item || response?.data || response);
      const agreement = this.state.agreementMap.get(detail.agreement_id) || {};
      const agreementItems = this.state.agreementItemsMap.get(detail.agreement_id) || [];
      const locations = this.deriveAgreementLocationCount(agreement, agreementItems, detail);
      if (!E.operationsOnboardingDetailsContent || !E.operationsOnboardingDetailsModal) return;
      E.operationsOnboardingDetailsContent.innerHTML = `
        <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;">
          <div><span class="muted">Onboarding ID:</span> ${U.escapeHtml(detail.onboarding_id || '—')}</div>
          <div><span class="muted">Agreement ID:</span> ${U.escapeHtml(detail.agreement_id || '—')}</div>
          <div><span class="muted">Status:</span> ${U.escapeHtml(detail.onboarding_status || '—')}</div>
          <div><span class="muted">Agreement Number:</span> ${U.escapeHtml(detail.agreement_number || '—')}</div>
          <div><span class="muted">Client Name:</span> ${U.escapeHtml(detail.client_name || '—')}</div>
          <div><span class="muted">Agreement Status:</span> ${U.escapeHtml(detail.agreement_status || '—')}</div>
          <div><span class="muted">Signed Date:</span> ${U.escapeHtml(this.formatDate(detail.signed_date))}</div>
          <div><span class="muted">Service Start Date:</span> ${U.escapeHtml(this.formatDate(detail.service_start_date))}</div>
          <div><span class="muted">Service End Date:</span> ${U.escapeHtml(this.formatDate(detail.service_end_date))}</div>
          <div><span class="muted">Billing Frequency:</span> ${U.escapeHtml(detail.billing_frequency || '—')}</div>
          <div><span class="muted">Payment Term:</span> ${U.escapeHtml(detail.payment_term || '—')}</div>
          <div><span class="muted">Number of Locations:</span> ${U.escapeHtml(String(locations))}</div>
          <div><span class="muted">Module Summary:</span> ${U.escapeHtml(detail.module_summary || '—')}</div>
          <div><span class="muted">Requested By:</span> ${U.escapeHtml(detail.requested_by || '—')}</div>
          <div><span class="muted">Requested At:</span> ${U.escapeHtml(this.formatDate(detail.requested_at))}</div>
          <div><span class="muted">Technical Request Type:</span> ${U.escapeHtml(detail.technical_request_type || detail.request_type || '—')}</div>
          <div><span class="muted">Technical Request Message:</span> ${U.escapeHtml(detail.request_message || detail.technical_request_details || detail.technical_admin_request_message || '—')}</div>
          <div><span class="muted">Technical Request Status:</span> ${U.escapeHtml(detail.technical_request_status || detail.technical_admin_request || '—')}</div>
          <div><span class="muted">Assigned CSM:</span> ${U.escapeHtml(detail.csm_assigned_to || '—')}</div>
          <div style="grid-column:1/-1;"><span class="muted">Notes:</span> ${U.escapeHtml(detail.notes || '—')}</div>
        </div>`;
      E.operationsOnboardingDetailsModal.classList.add('open');
      E.operationsOnboardingDetailsModal.setAttribute('aria-hidden', 'false');
    } catch (error) {
      UI.toast('Unable to load onboarding details: ' + (error?.message || 'Unknown error'));
    }
  },
  closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('open');
    modalEl.setAttribute('aria-hidden', 'true');
  },
  openAssignCsmModal(agreementId, onDone) {
    if (!this.canWrite()) return UI.toast('Insufficient permissions.');
    this.state.pendingAgreementId = String(agreementId || '').trim();
    if (!this.state.pendingAgreementId) return UI.toast('Unable to assign CSM for this onboarding row because no Agreement ID is available.');
    this.state.postSubmitHook = typeof onDone === 'function' ? onDone : null;
    if (E.operationsAssignCsmForm) E.operationsAssignCsmForm.reset();
    if (E.operationsAssignCsmModal) {
      E.operationsAssignCsmModal.classList.add('open');
      E.operationsAssignCsmModal.setAttribute('aria-hidden', 'false');
    }
  },
  openUpdateStatusModal(agreementId, onDone) {
    if (!this.canWrite()) return UI.toast('Insufficient permissions.');
    this.state.pendingAgreementId = String(agreementId || '').trim();
    if (!this.state.pendingAgreementId) return UI.toast('Unable to update onboarding status for this row because no Agreement ID is available.');
    this.state.postSubmitHook = typeof onDone === 'function' ? onDone : null;
    if (E.operationsUpdateStatusForm) E.operationsUpdateStatusForm.reset();
    if (E.operationsUpdateStatusModal) {
      E.operationsUpdateStatusModal.classList.add('open');
      E.operationsUpdateStatusModal.setAttribute('aria-hidden', 'false');
    }
  },
  async submitAssignCsm() {
    const agreementId = this.state.pendingAgreementId;
    if (!agreementId) return UI.toast('Agreement ID is required.');
    try {
      await Api.assignAgreementCsm(agreementId, {
        csm_assigned_to: E.operationsAssignCsmName?.value || '',
        handover_note: E.operationsAssignCsmHandoverNote?.value || ''
      });
      this.upsertByAgreement(agreementId, { csm_assigned_to: E.operationsAssignCsmName?.value || '' });
      this.closeModal(E.operationsAssignCsmModal);
      UI.toast('CSM assigned.');
      if (this.state.postSubmitHook) await this.state.postSubmitHook();
    } catch (error) {
      UI.toast('Unable to assign CSM: ' + (error?.message || 'Unknown error'));
    }
  },
  async submitUpdateStatus() {
    const agreementId = this.state.pendingAgreementId;
    if (!agreementId) return UI.toast('Agreement ID is required.');
    try {
      await Api.updateAgreementOnboardingStatus(agreementId, {
        onboarding_status: E.operationsUpdateStatusValue?.value || '',
        notes: E.operationsUpdateStatusNotes?.value || ''
      });
      this.upsertByAgreement(agreementId, { onboarding_status: E.operationsUpdateStatusValue?.value || '' });
      this.closeModal(E.operationsUpdateStatusModal);
      UI.toast('Onboarding status updated.');
      if (this.state.postSubmitHook) await this.state.postSubmitHook();
    } catch (error) {
      UI.toast('Unable to update onboarding status: ' + (error?.message || 'Unknown error'));
    }
  },
  async requestTechnicalAdmin(agreementId) {
    const id = String(agreementId || '').trim();
    if (!id) return UI.toast('Agreement ID is required.');
    if (!this.canRequestTechnicalAdmin()) return UI.toast('Insufficient permissions.');
    const summary = this.state.rows.find(row => String(row.agreement_id || '') === id) || {};
    const agreementLabel = summary.agreement_number || id;
    const message = `Please proceed with the following agreement ${agreementLabel}.`;
    try {
      await Api.requestAgreementTechnicalAdmin(id, message);
      this.upsertByAgreement(id, {
        request_type: 'Technical Admin',
        technical_admin_request: 'Requested',
        technical_admin_request_message: message
      });
      await this.loadAndRefresh({ force: true });
      UI.toast(`Technical Admin requested for agreement ${agreementLabel}.`);
    } catch (error) {
      UI.toast('Unable to request Technical Admin: ' + (error?.message || 'Unknown error'));
    }
  },
  handleAnalyticsClick(event) {
    const trigger = event.target?.closest?.('[data-op-analytics-filter-kind]');
    if (!trigger) return;
    const kind = trigger.getAttribute('data-op-analytics-filter-kind') || '';
    const value = trigger.getAttribute('data-op-analytics-filter-value') || '';
    if (kind === 'clear') return this.clearDrilldown();
    if (this.state.drilldown.kind === kind && this.state.drilldown.value === value) return this.clearDrilldown();
    this.setDrilldown(kind, value, `${kind}:${value}`);
  },
  wire() {
    if (this.state.initialized) return;
    const bind = (el, stateKey) => {
      if (!el) return;
      const update = () => {
        this.state[stateKey] = String(el.value || '').trim() || 'All';
        if (stateKey === 'search') this.state[stateKey] = String(el.value || '').trim();
        this.applyFilters();
        this.render();
      };
      el.addEventListener('input', update);
      el.addEventListener('change', update);
    };
    bind(E.operationsOnboardingSearchInput, 'search');
    bind(E.operationsOnboardingStatusFilter, 'onboardingStatus');
    bind(E.operationsOnboardingRequestTypeFilter, 'requestType');
    bind(E.operationsOnboardingCsmFilter, 'assignedCsm');
    if (E.operationsOnboardingRefreshBtn) E.operationsOnboardingRefreshBtn.addEventListener('click', () => this.loadAndRefresh({ force: true }));
    if (E.operationsOnboardingClearDrilldownBtn) E.operationsOnboardingClearDrilldownBtn.addEventListener('click', () => this.clearDrilldown());

    if (E.operationsOnboardingSummary) E.operationsOnboardingSummary.addEventListener('click', event => this.handleAnalyticsClick(event));
    if (E.operationsOnboardingAnalytics) E.operationsOnboardingAnalytics.addEventListener('click', event => this.handleAnalyticsClick(event));

    if (E.operationsOnboardingTbody)
      E.operationsOnboardingTbody.addEventListener('click', event => {
        const trigger = event.target?.closest?.('button');
        if (!trigger) return;
        const agreementId = trigger.getAttribute('data-op-open-agreement') || trigger.getAttribute('data-op-technical-admin') || trigger.getAttribute('data-op-assign-csm') || trigger.getAttribute('data-op-mark-progress') || trigger.getAttribute('data-op-mark-completed') || '';
        const onboardingId = trigger.getAttribute('data-op-open-details') || '';
        if (trigger.hasAttribute('data-op-open-agreement')) {
          if (typeof setActiveView === 'function') setActiveView('agreements');
          return window.Agreements?.openAgreementFormById?.(agreementId, { readOnly: !this.canWrite() });
        }
        if (trigger.hasAttribute('data-op-open-details')) return this.openOnboardingDetails(onboardingId, agreementId);
        if (trigger.hasAttribute('data-op-technical-admin')) return this.requestTechnicalAdmin(agreementId);
        if (trigger.hasAttribute('data-op-assign-csm')) return this.openAssignCsmModal(agreementId);
        if (trigger.hasAttribute('data-op-mark-progress')) {
          this.openUpdateStatusModal(agreementId);
          if (E.operationsUpdateStatusValue) E.operationsUpdateStatusValue.value = 'In Progress';
          return;
        }
        if (trigger.hasAttribute('data-op-mark-completed')) {
          this.openUpdateStatusModal(agreementId);
          if (E.operationsUpdateStatusValue) E.operationsUpdateStatusValue.value = 'Completed';
        }
      });

    if (E.operationsOnboardingDetailsCloseBtn) E.operationsOnboardingDetailsCloseBtn.addEventListener('click', () => this.closeModal(E.operationsOnboardingDetailsModal));
    if (E.operationsOnboardingDetailsModal)
      E.operationsOnboardingDetailsModal.addEventListener('click', event => {
        if (event.target === E.operationsOnboardingDetailsModal) this.closeModal(E.operationsOnboardingDetailsModal);
      });

    if (E.operationsAssignCsmCloseBtn) E.operationsAssignCsmCloseBtn.addEventListener('click', () => this.closeModal(E.operationsAssignCsmModal));
    if (E.operationsAssignCsmCancelBtn) E.operationsAssignCsmCancelBtn.addEventListener('click', () => this.closeModal(E.operationsAssignCsmModal));
    if (E.operationsAssignCsmForm)
      E.operationsAssignCsmForm.addEventListener('submit', event => {
        event.preventDefault();
        this.submitAssignCsm();
      });

    if (E.operationsUpdateStatusCloseBtn) E.operationsUpdateStatusCloseBtn.addEventListener('click', () => this.closeModal(E.operationsUpdateStatusModal));
    if (E.operationsUpdateStatusCancelBtn) E.operationsUpdateStatusCancelBtn.addEventListener('click', () => this.closeModal(E.operationsUpdateStatusModal));
    if (E.operationsUpdateStatusForm)
      E.operationsUpdateStatusForm.addEventListener('submit', event => {
        event.preventDefault();
        this.submitUpdateStatus();
      });

    this.state.initialized = true;
  }
};

window.OperationsOnboarding = OperationsOnboarding;
