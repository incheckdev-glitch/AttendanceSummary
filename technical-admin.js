const TechnicalAdmin = {
  state: {
    rows: [],
    filteredRows: [],
    loading: false,
    loadError: '',
    loaded: false,
    initialized: false,
    search: '',
    status: 'All',
    assignee: 'All Assignees',
    client: 'All Clients',
    dateRangeDays: '30',
    onlyOverdue: false,
    myRequestsOnly: false,
    volumeRangeDays: 30,
    page: 1,
    limit: 50,
    offset: 0,
    returned: 0,
    hasMore: false,
    activeRequestId: '',
    rowActionInFlight: new Set(),
    detailPreviewLoading: false,
    pendingHighlightId: ''
  },
  pick(...values) {
    for (const value of values) {
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  },
  hasInvoiceScope(row = {}) {
    return Boolean(this.pick(
      row.source_invoice_id, row.sourceInvoiceId, row.invoice_id, row.invoiceId,
      row.source_invoice_number, row.sourceInvoiceNumber, row.invoice_number, row.invoiceNumber,
      row.invoiced_location_names, row.invoicedLocationNames,
      row.invoiced_agreement_item_ids, row.invoicedAgreementItemIds
    ));
  },
  countStoredLocations(value = '') {
    return String(value || '')
      .split(/[;,|\n]+/)
      .map(item => item.trim())
      .filter(Boolean).length;
  },
  normalizeToken(value = '') {
    return String(value || '').toLowerCase().trim();
  },
  norm(value) {
    return String(value || '').trim().toLowerCase();
  },
  same(a, b) {
    return Boolean(this.norm(a) && this.norm(b) && this.norm(a) === this.norm(b));
  },
  parseOptionalNumber(...values) {
    for (const value of values) {
      if (value === undefined || value === null || String(value).trim() === '') continue;
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  },
  safeTextFromObject(source = {}, keys = []) {
    const safe = source && typeof source === 'object' ? source : {};
    return (Array.isArray(keys) ? keys : [])
      .map(key => safe[key])
      .filter(value => value !== undefined && value !== null && String(value).trim() !== '')
      .map(value => String(value).trim())
      .join(' ');
  },
  firstNonUuidText(...values) {
    for (const value of values) {
      const text = String(value || '').trim();
      if (!text) continue;
      if (this.isUuid(text)) continue;
      return text;
    }
    return '';
  },
  isOneTimeFeeItem(item = {}) {
    const safe = item && typeof item === 'object' ? item : {};
    const text = this.safeTextFromObject(safe, [
      'item_name','itemName','product_name','productName','service_name','serviceName','description',
      'category','section','section_name','section_label','type','item_type','itemType','line_type','lineType',
      'module','module_name','moduleName','billing_frequency','billingFrequency','billing_cycle','billingCycle','frequency',
      'license','license_name','licenseName'
    ]).toLowerCase().replace(/[_-]+/g, ' ');

    if (/one\s*time|one time fee|setup|implementation|onboarding|activation|installation/.test(text)) return true;
    if (/annual\s*saas|saas\s*annual|subscription|license/.test(text)) return false;
    return false;
  },
  isUuid(value = '') {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
  },
  toDisplayDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '—';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '—';
    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
  },
  toDisplayDateTime(value) {
    const raw = String(value || '').trim();
    if (!raw) return '—';
    return U.formatDateTimeMMDDYYYYHHMM(raw);
  },
  parseAgreementPayload(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;
    try {
      return JSON.parse(trimmed);
    } catch (_error) {
      return value;
    }
  },
  extractLinkedAgreement(source = {}) {
    const candidates = [
      source.agreement,
      source.linked_agreement,
      source.linkedAgreement,
      source.agreement_row,
      source.agreementRow,
      source.data,
      source.item,
      source.payload
    ];
    for (const candidateRaw of candidates) {
      const candidate = this.parseAgreementPayload(candidateRaw);
      if (!candidate) continue;
      if (Array.isArray(candidate)) {
        const first = candidate[0];
        if (first && typeof first === 'object') return first;
        continue;
      }
      if (typeof candidate !== 'object') continue;
      if (candidate.agreement && typeof candidate.agreement === 'object') return candidate.agreement;
      if (candidate.item && typeof candidate.item === 'object') return candidate.item;
      if (candidate.agreement_id || candidate.agreement_number || candidate.id || Array.isArray(candidate.agreement_items) || Array.isArray(candidate.items)) {
        return candidate;
      }
    }
    return {};
  },
  extractAgreementItems(source = {}, agreement = {}) {
    const itemCandidates = [source.agreement_items, source.agreementItems, source.items, agreement.agreement_items, agreement.agreementItems, agreement.items];
    for (const candidate of itemCandidates) {
      const parsed = this.parseAgreementPayload(candidate);
      if (Array.isArray(parsed)) return parsed;
    }
    return [];
  },
  isAnnualSaasLocationItem(item = {}) {
    const safe = item && typeof item === 'object' ? item : {};
    if (this.isOneTimeFeeItem(safe)) return false;
    const text = this.safeTextFromObject(safe, [
      'item_name','itemName','product_name','productName','service_name','serviceName','description',
      'category','section','section_name','section_label','type','item_type','itemType','line_type','lineType',
      'module','module_name','moduleName','billing_frequency','billingFrequency','billing_cycle','billingCycle','frequency',
      'license','license_name','licenseName','location','location_name','locationName'
    ]).toLowerCase().replace(/[_-]+/g, ' ');

    if (/annual\s*saas|saas\s*annual|subscription|license/.test(text)) return true;
    if (safe.license_price_year !== undefined || safe.license_price_per_year !== undefined || safe.license_price_yearly !== undefined) return true;
    if (safe.license_month !== undefined || safe.license_months !== undefined || safe.license_per_month !== undefined) return true;
    if ((safe.service_start_date || safe.serviceStartDate) && (safe.service_end_date || safe.serviceEndDate) && (safe.location || safe.location_name || safe.locationName)) return true;
    return false;
  },
  deriveAgreementLocationCount(agreementItems = []) {
    const safeItems = Array.isArray(agreementItems) ? agreementItems : [];
    const annualSaasRows = safeItems.filter(item => this.isAnnualSaasLocationItem(item));
    return annualSaasRows.length || null;
  },
  profileDisplay(profile = null, fallback = '') {
    if (!profile || typeof profile !== 'object') return String(fallback || '').trim();
    const firstLast = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
    const name = String(profile.name || profile.full_name || profile.display_name || profile.username || firstLast || '').trim();
    const email = String(profile.email || profile.user_email || '').trim();
    return name || email || String(fallback || '').trim();
  },
  resolvePersonDisplay(value = '', profileMap = new Map(), fallback = '') {
    const raw = String(value || '').trim();
    const fallbackText = String(fallback || '').trim();
    if (!raw) return fallbackText;
    if (!this.isUuid(raw)) return raw;
    return this.profileDisplay(profileMap.get(raw), fallbackText || raw);
  },
  async fetchPeopleByIds(client, ids = []) {
    const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).map(id => String(id || '').trim()).filter(id => this.isUuid(id)))];
    const peopleById = new Map();
    if (!client || !uniqueIds.length) return peopleById;

    const addPerson = row => {
      if (!row || typeof row !== 'object') return;
      const keys = [row.id, row.auth_user_id, row.user_id].map(value => String(value || '').trim()).filter(Boolean);
      keys.forEach(key => {
        if (this.isUuid(key) && !peopleById.has(key)) peopleById.set(key, row);
      });
    };

    const currentSession = window.Session?.user?.() || {};
    const currentProfile = currentSession.profile || {};
    const currentAuthUser = currentSession.user || {};
    addPerson({
      ...currentProfile,
      id: currentProfile.id || currentSession.user_id || currentAuthUser.id,
      auth_user_id: currentProfile.auth_user_id || currentAuthUser.id || currentSession.user_id,
      user_id: currentProfile.user_id || currentAuthUser.id || currentSession.user_id,
      name: currentProfile.name || currentSession.name,
      full_name: currentProfile.full_name || currentSession.name,
      display_name: currentProfile.display_name || currentSession.name,
      email: currentProfile.email || currentSession.email || currentAuthUser.email
    });

    const profileFields = ['id', 'auth_user_id', 'user_id'];
    for (const field of profileFields) {
      const unresolved = uniqueIds.filter(id => !peopleById.has(id));
      if (!unresolved.length) break;
      try {
        const { data, error } = await client.from('profiles').select('*').in(field, unresolved);
        if (error) {
          console.warn(`[technical admin] profiles.${field} people enrichment failed`, error);
          continue;
        }
        (data || []).forEach(addPerson);
      } catch (error) {
        console.warn(`[technical admin] profiles.${field} people enrichment failed`, error);
      }
    }

    for (const tableName of ['users']) {
      const unresolved = uniqueIds.filter(id => !peopleById.has(id));
      if (!unresolved.length) break;
      try {
        const { data, error } = await client.from(tableName).select('*').in('id', unresolved);
        if (error) {
          console.warn(`[technical admin] ${tableName} people enrichment failed`, error);
          continue;
        }
        (data || []).forEach(addPerson);
      } catch (error) {
        console.warn(`[technical admin] ${tableName} people enrichment failed`, error);
      }
    }
    return peopleById;
  },
  extractAgreementTokens(agreement = {}) {
    return {
      id: String(this.pick(agreement.id, agreement.agreement_id, agreement.agreementId)).trim(),
      number: String(this.pick(agreement.agreement_number, agreement.number, agreement.agreement_code, agreement.agreementNumber)).trim()
    };
  },
  findLinkedAgreement(request = {}, agreements = []) {
    const requestAgreementId = String(this.pick(request.agreement_id, request.agreementId)).trim();
    const requestAgreementNumber = String(this.pick(request.agreement_number, request.agreementNumber)).trim();
    return (Array.isArray(agreements) ? agreements : []).find(agreement => {
      const tokens = this.extractAgreementTokens(agreement);
      return this.same(requestAgreementId, tokens.id) || this.same(requestAgreementNumber, tokens.number);
    }) || null;
  },
  splitStoredIds(value = '') {
    if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
    return String(value || '')
      .split(/[;,|\n]+/)
      .map(item => item.trim())
      .filter(Boolean);
  },
  getRequestAgreementItemIdSet(request = {}) {
    const ids = this.splitStoredIds(this.pick(
      request.invoiced_agreement_item_ids,
      request.invoicedAgreementItemIds,
      request.source_agreement_item_ids,
      request.sourceAgreementItemIds
    ));
    return new Set(ids);
  },
  getLinkedAgreementItems({ request = {}, agreement = {}, agreementItems = [] } = {}) {
    const requestAgreementId = String(this.pick(request.agreement_id, request.agreementId)).trim();
    const requestAgreementNumber = String(this.pick(request.agreement_number, request.agreementNumber)).trim();
    const agreementTokens = this.extractAgreementTokens(agreement);
    const scopedItemIds = this.getRequestAgreementItemIdSet(request);
    return (Array.isArray(agreementItems) ? agreementItems : []).filter(item => {
      const itemId = String(this.pick(item.id, item.agreement_item_id, item.source_agreement_item_id, item.sourceAgreementItemId)).trim();
      if (scopedItemIds.size && itemId && !scopedItemIds.has(itemId)) return false;
      const itemAgreementId = String(this.pick(
        item.agreement_id, item.agreementId, item.agreement_uuid, item.agreementUuid,
        item.source_agreement_id, item.sourceAgreementId, item.parent_id, item.parentId
      )).trim();
      const itemAgreementNumber = String(this.pick(
        item.agreement_number, item.agreementNumber, item.agreement_ref, item.agreementRef,
        item.parent_number, item.parentNumber, item.parent_ref, item.parentRef
      )).trim();
      return (
        this.same(itemAgreementId, agreementTokens.id) ||
        this.same(itemAgreementId, requestAgreementId) ||
        this.same(itemAgreementNumber, agreementTokens.number) ||
        this.same(itemAgreementNumber, requestAgreementNumber)
      );
    });
  },
  normalizeRow(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const agreement = this.extractLinkedAgreement(source);
    const agreementItems = this.extractAgreementItems(source, agreement);
    const requestLocationCount = this.parseOptionalNumber(
      source.invoiced_location_count,
      source.invoicedLocationCount,
      source.location_count,
      source.number_of_locations,
      source.locations_count,
      source.locationCount,
      source.numberOfLocations,
      source.locationsCount
    );
    const agreementLocationCount = this.parseOptionalNumber(
      agreement.location_count,
      agreement.locations_count,
      agreement.number_of_locations,
      agreement.locationCount,
      agreement.locationsCount,
      agreement.numberOfLocations
    );
    const scopedItemIds = this.getRequestAgreementItemIdSet(source);
    const invoiceScoped = this.hasInvoiceScope(source);
    const scopedAgreementItems = scopedItemIds.size
      ? agreementItems.filter(item => scopedItemIds.has(String(this.pick(item.id, item.agreement_item_id, item.source_agreement_item_id, item.sourceAgreementItemId)).trim()))
      : (invoiceScoped ? [] : agreementItems);
    const derivedLocationCount = scopedAgreementItems.length ? this.deriveAgreementLocationCount(scopedAgreementItems) : null;
    const namedLocationCount = this.countStoredLocations(this.pick(source.invoiced_location_names, source.invoicedLocationNames, source.invoiced_locations, source.invoicedLocations, source.location_names, source.locationNames));
    const resolvedLocationCount = invoiceScoped
      ? (requestLocationCount ?? derivedLocationCount ?? namedLocationCount ?? null)
      : (requestLocationCount ?? derivedLocationCount ?? agreementLocationCount ?? null);
    const sourceId = String(source.id || '').trim();
    const onboardingId = String(this.pick(source.onboarding_id, source.onboardingId)).trim();
    const technicalRequestType = String(this.pick(source.technical_request_type, source.request_type, source.requestType, 'Technical Admin')).trim();
    const technicalRequestDetails = String(this.pick(source.technical_request_details, source.request_details, source.request_message, source.requestMessage)).trim();
    const technicalRequestStatus = String(this.pick(source.technical_request_status, source.request_status, source.requestStatus)).trim() || 'Requested';
    return {
      id: sourceId,
      db_id: sourceId,
      technical_request_id: onboardingId || sourceId,
      agreement_id: String(this.pick(source.agreement_id, source.agreementId)).trim(),
      agreement_number: String(this.pick(source.agreement_number, source.agreementNumber)).trim(),
      onboarding_id: onboardingId,
      client_id: String(this.pick(source.client_id, source.clientId)).trim(),
      client_name: String(this.pick(source.client_name, source.clientName, source.customer_name, source.customerName)).trim(),
      request_type: technicalRequestType,
      technical_request_type: technicalRequestType,
      request_title: 'Technical Admin Request',
      request_message: technicalRequestDetails,
      request_details: technicalRequestDetails,
      technical_request_details: technicalRequestDetails,
      request_status: technicalRequestStatus,
      technical_request_status: technicalRequestStatus,
      priority: String(this.pick(source.priority)).trim(),
      location_count: Number.isFinite(Number(resolvedLocationCount)) ? Number(resolvedLocationCount) : null,
      number_of_locations: Number.isFinite(Number(resolvedLocationCount)) ? Number(resolvedLocationCount) : null,
      invoiced_location_names: String(this.pick(source.invoiced_location_names, source.invoicedLocationNames, source.invoiced_locations, source.invoicedLocations, source.location_names, source.locationNames)).trim(),
      invoiced_locations: String(this.pick(source.invoiced_locations, source.invoicedLocations, source.invoiced_location_names, source.invoicedLocationNames, source.location_names, source.locationNames)).trim(),
      location_names: String(this.pick(source.location_names, source.locationNames, source.invoiced_locations, source.invoicedLocations, source.invoiced_location_names, source.invoicedLocationNames)).trim(),
      invoiced_agreement_item_ids: String(this.pick(source.invoiced_agreement_item_ids, source.invoicedAgreementItemIds, source.source_agreement_item_ids, source.sourceAgreementItemIds)).trim(),
      source_invoice_id: String(this.pick(source.source_invoice_id, source.sourceInvoiceId, source.invoice_id, source.invoiceId)).trim(),
      source_invoice_number: String(this.pick(source.source_invoice_number, source.sourceInvoiceNumber, source.invoice_number, source.invoiceNumber)).trim(),
      invoice_number: String(this.pick(source.invoice_number, source.invoiceNumber, source.source_invoice_number, source.sourceInvoiceNumber)).trim(),
      service_start_date: String(this.pick(source.service_start_date, source.serviceStartDate, agreement.service_start_date, agreement.serviceStartDate)).trim(),
      service_end_date: String(this.pick(source.service_end_date, source.serviceEndDate, agreement.service_end_date, agreement.serviceEndDate)).trim(),
      billing_frequency: String(this.pick(source.billing_frequency, source.billingFrequency, agreement.billing_frequency, agreement.billingFrequency, agreement.frequency)).trim(),
      payment_term: String(this.pick(source.payment_term, source.paymentTerm, agreement.payment_term, agreement.paymentTerm, agreement.payment_terms, agreement.paymentTerms)).trim(),
      module_summary: String(this.pick(source.module_summary, source.moduleSummary)).trim(),
      agreement_status: String(this.pick(source.agreement_status, source.agreementStatus)).trim(),
      requested_by: String(this.pick(source.requested_by, source.requestedBy)).trim(),
      requested_at: String(this.pick(source.requested_at, source.requestedAt)).trim(),
      csm_assigned_to: String(this.pick(source.csm_assigned_to, source.csmAssignedTo)).trim(),
      assigned_to: String(this.pick(source.technical_admin_assigned_to, source.technicalAdminAssignedTo, source.assigned_to, source.assignedTo)).trim(),
      requested_by_display: String(this.pick(source.requested_by_display, source.requested_by, source.requestedBy)).trim(),
      assigned_to_display: String(this.pick(source.assigned_to_display, source.technical_admin_assigned_to, source.assigned_to, source.assignedTo)).trim(),
      completed_at: String(this.pick(source.completed_at, source.completedAt)).trim(),
      updated_by: String(this.pick(source.updated_by, source.updatedBy)).trim(),
      updated_at: String(this.pick(source.updated_at, source.updatedAt)).trim(),
      notes: String(this.pick(source.notes)).trim()
    };
  },
  async enrichRows(rows = []) {
    const rawRows = Array.isArray(rows) ? rows : [];
    const client = window.SupabaseClient?.getClient?.();
    if (!client || !rawRows.length) return rawRows.map(row => this.normalizeRow(row));

    const agreementIds = [...new Set(rawRows.map(row => String(this.pick(row?.agreement_id, row?.agreementId)).trim()).filter(Boolean))];
    const agreementNumbers = [...new Set(rawRows.map(row => String(this.pick(row?.agreement_number, row?.agreementNumber)).trim()).filter(Boolean))];
    const profileIds = [
      ...new Set(
        rawRows
          .flatMap(row => [
            row?.requested_by, row?.requestedBy, row?.requested_by_id, row?.requestedById, row?.created_by, row?.createdBy,
            row?.technical_admin_assigned_to, row?.technicalAdminAssignedTo, row?.assigned_to, row?.assignedTo,
            row?.assigned_user, row?.assignedUser, row?.csm_assigned_to, row?.csmAssignedTo, row?.updated_by, row?.updatedBy
          ])
          .map(value => String(value || '').trim())
          .filter(value => this.isUuid(value))
      )
    ];

    const agreementsByIdPromise = agreementIds.length ? client.from('agreements').select('*').in('id', agreementIds) : Promise.resolve({ data: [], error: null });
    const agreementsByNumberPromise = agreementNumbers.length
      ? client.from('agreements').select('*').in('agreement_number', agreementNumbers)
      : Promise.resolve({ data: [], error: null });
    const itemsByAgreementIdPromise = agreementIds.length
      ? client.from('agreement_items').select('*').in('agreement_id', agreementIds)
      : Promise.resolve({ data: [], error: null });
    const itemsByParentIdPromise = agreementIds.length
      ? client.from('agreement_items').select('*').in('parent_id', agreementIds)
      : Promise.resolve({ data: [], error: null });
    const itemsByAgreementNumberPromise = agreementNumbers.length
      ? client.from('agreement_items').select('*').in('agreement_number', agreementNumbers)
      : Promise.resolve({ data: [], error: null });
    const itemsByParentNumberPromise = agreementNumbers.length
      ? client.from('agreement_items').select('*').in('parent_number', agreementNumbers)
      : Promise.resolve({ data: [], error: null });
    const peoplePromise = this.fetchPeopleByIds(client, profileIds);

    const [agreementsByIdRes, agreementsByNumberRes, itemsByAgreementIdRes, itemsByParentIdRes, itemsByAgreementNumberRes, itemsByParentNumberRes, peopleById] = await Promise.all([
      agreementsByIdPromise,
      agreementsByNumberPromise,
      itemsByAgreementIdPromise,
      itemsByParentIdPromise,
      itemsByAgreementNumberPromise,
      itemsByParentNumberPromise,
      peoplePromise
    ]);
    if (agreementsByIdRes?.error) console.warn('[technical admin] agreements enrichment failed', agreementsByIdRes.error);
    if (agreementsByNumberRes?.error) console.warn('[technical admin] agreements by number enrichment failed', agreementsByNumberRes.error);
    if (itemsByAgreementIdRes?.error) console.warn('[technical admin] agreement_items enrichment failed', itemsByAgreementIdRes.error);
    if (itemsByParentIdRes?.error) console.warn('[technical admin] agreement_items parent enrichment failed', itemsByParentIdRes.error);
    if (itemsByAgreementNumberRes?.error) console.warn('[technical admin] agreement_items by number enrichment failed', itemsByAgreementNumberRes.error);
    if (itemsByParentNumberRes?.error) console.warn('[technical admin] agreement_items parent number enrichment failed', itemsByParentNumberRes.error);

    const agreements = [...(agreementsByIdRes?.data || []), ...(agreementsByNumberRes?.data || [])];
    const agreementMap = new Map();
    agreements.forEach(agreement => {
      const agreementKey = String(this.pick(agreement?.id, agreement?.agreement_id, agreement?.agreement_number)).trim();
      if (!agreementKey) return;
      if (!agreementMap.has(agreementKey)) agreementMap.set(agreementKey, agreement);
    });
    const agreementRows = [...agreementMap.values()];
    const agreementItems = [
      ...(itemsByAgreementIdRes?.data || []),
      ...(itemsByParentIdRes?.data || []),
      ...(itemsByAgreementNumberRes?.data || []),
      ...(itemsByParentNumberRes?.data || [])
    ];
    const itemMap = new Map();
    agreementItems.forEach(item => {
      const itemKey = String(this.pick(item?.id, item?.agreement_item_id)).trim() || JSON.stringify(item);
      if (!itemKey || itemMap.has(itemKey)) return;
      itemMap.set(itemKey, item);
    });
    const uniqueAgreementItems = [...itemMap.values()];
    const profileById = peopleById instanceof Map ? peopleById : new Map();

    const enrichedRows = rawRows.map(raw => {
      const row = this.normalizeRow(raw);
      const rawAgreement = this.extractLinkedAgreement(raw);
      const agreement = this.findLinkedAgreement(row, [rawAgreement, ...agreementRows]) || rawAgreement || {};
      if (!agreement || !Object.keys(agreement).length) {
        console.warn('[TechnicalAdmin] no linked agreement found', {
          requestId: row.technical_request_id || row.id,
          agreementId: row.agreement_id,
          agreementNumber: row.agreement_number
        });
      }
      const invoiceScoped = this.hasInvoiceScope(row) || this.hasInvoiceScope(raw);
      const linkedItems = this.getLinkedAgreementItems({ request: row, agreement, agreementItems: uniqueAgreementItems });
      const annualSaasLocationCount = linkedItems.filter(item => this.isAnnualSaasLocationItem(item)).length;
      const itemLocationCount = annualSaasLocationCount || null;
      const namedLocationCount = this.countStoredLocations(this.pick(row.invoiced_location_names, raw.invoiced_location_names, row.invoicedLocationNames, raw.invoicedLocationNames, row.invoiced_locations, raw.invoiced_locations, row.location_names, raw.location_names));
      const earliestItemStart = linkedItems
        .map(item => String(item?.service_start_date || '').trim())
        .filter(Boolean)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] || '';
      const latestItemEnd = linkedItems
        .map(item => String(item?.service_end_date || '').trim())
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || '';
      const firstItem = linkedItems[0] || {};
      const requestedByValue = String(this.pick(
        raw.requested_by, raw.requestedBy, raw.requested_by_id, raw.requestedById,
        row.requested_by, raw.created_by, raw.createdBy
      )).trim();
      const assignedToValue = String(this.pick(
        raw.technical_admin_assigned_to, raw.technicalAdminAssignedTo, raw.assigned_to, raw.assignedTo,
        raw.assigned_user, raw.assignedUser, raw.csm_assigned_to, raw.csmAssignedTo,
        row.assigned_to, row.csm_assigned_to, agreement.technical_admin_assigned_to, agreement.assigned_to, agreement.owner, agreement.created_by
      )).trim();

      const locationCount = invoiceScoped
        ? this.parseOptionalNumber(
          row.invoiced_location_count,
          raw.invoiced_location_count,
          row.number_of_locations,
          row.location_count,
          raw.number_of_locations,
          raw.location_count,
          raw.locations_count,
          itemLocationCount,
          namedLocationCount
        )
        : this.parseOptionalNumber(
          row.invoiced_location_count,
          raw.invoiced_location_count,
          row.number_of_locations,
          row.location_count,
          raw.number_of_locations,
          raw.location_count,
          raw.locations_count,
          itemLocationCount,
          agreement.number_of_locations,
          agreement.locations_count,
          agreement.location_count
        );
      return {
        ...row,
        agreement_number: String(this.pick(row.agreement_number, agreement.agreement_number, agreement.number, agreement.agreement_code, agreement.agreementNumber)).trim(),
        client_name: String(this.pick(row.client_name, agreement.client_name, agreement.company_name, agreement.customer_name)).trim(),
        location_count: Number.isFinite(Number(locationCount)) ? Number(locationCount) : null,
        number_of_locations: Number.isFinite(Number(locationCount)) ? Number(locationCount) : null,
        invoiced_location_names: String(this.pick(row.invoiced_location_names, raw.invoiced_location_names, row.invoiced_locations, raw.invoiced_locations, row.location_names, raw.location_names)).trim(),
        service_start_date: String(invoiceScoped
          ? this.pick(row.service_start_date, raw.service_start_date, earliestItemStart)
          : this.pick(row.service_start_date, raw.service_start_date, earliestItemStart, agreement.service_start_date, agreement.contract_start_date, agreement.start_date, agreement.agreement_start_date)
        ).trim(),
        service_end_date: String(invoiceScoped
          ? this.pick(row.service_end_date, raw.service_end_date, latestItemEnd)
          : this.pick(row.service_end_date, raw.service_end_date, latestItemEnd, agreement.service_end_date, agreement.contract_end_date, agreement.end_date, agreement.valid_until)
        ).trim(),
        billing_frequency: String(
          this.pick(
            row.billing_frequency,
            agreement.billing_frequency,
            agreement.billing_cycle,
            agreement.billing_period,
            firstItem.billing_cycle,
            firstItem.billing_frequency,
            raw.billing_cycle,
            raw.billing_frequency
          )
        ).trim(),
        payment_term: String(this.pick(row.payment_term, agreement.payment_term, agreement.payment_terms, raw.payment_terms, raw.payment_term)).trim(),
        requested_by: requestedByValue || row.requested_by,
        requested_by_display: this.firstNonUuidText(raw.requested_by_display, raw.requestedByDisplay, row.requested_by_display) || this.resolvePersonDisplay(requestedByValue || row.requested_by, profileById, row.requested_by),
        assigned_to: assignedToValue || row.assigned_to,
        assigned_to_display: this.firstNonUuidText(raw.assigned_to_display, raw.assignedToDisplay, row.assigned_to_display) || this.resolvePersonDisplay(assignedToValue || row.assigned_to, profileById, row.assigned_to)
      };
    });
    console.log('[TechnicalAdmin] enrichment counts', {
      requests: rawRows.length,
      agreements: agreementRows.length,
      agreementItems: uniqueAgreementItems.length,
      people: profileById.size,
      enriched: enrichedRows.length
    });
    return enrichedRows;
  },
  highlightRow(requestId = '') {
    const targetId = String(requestId || '').trim();
    if (!targetId || !E.technicalAdminTbody) return;
    const rowEl =
      E.technicalAdminTbody.querySelector(`tr[data-technical-request-id="${targetId}"]`) ||
      E.technicalAdminTbody.querySelector(`tr[data-technical-onboarding-id="${targetId}"]`) ||
      E.technicalAdminTbody.querySelector(`tr[data-technical-request-key="${targetId}"]`);
    if (!rowEl) return;
    rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    rowEl.classList.add('row-highlight-pulse');
    window.setTimeout(() => rowEl.classList.remove('row-highlight-pulse'), 2200);
  },
  statusBucket(status = '') {
    const normalized = String(status || '').trim().toLowerCase();
    if (!normalized) return 'Requested';
    if (normalized.includes('progress')) return 'In Progress';
    if (normalized.includes('complete')) return 'Completed';
    return 'Requested';
  },
  statusBadge(status = '') {
    const normalized = String(status || '').trim();
    const label = normalized || 'Requested';
    return `<span class="pill status-${U.toStatusClass(label)}">${U.escapeHtml(label)}</span>`;
  },
  setTriggerBusy(trigger, busy, loadingLabel = 'Loading…') {
    if (!trigger || !('disabled' in trigger)) return;
    const isBusy = !!busy;
    trigger.disabled = isBusy;
    if (isBusy) {
      trigger.dataset.originalLabel = String(trigger.textContent || '');
      trigger.textContent = loadingLabel;
      trigger.setAttribute('aria-busy', 'true');
      return;
    }
    if (trigger.dataset.originalLabel !== undefined) {
      trigger.textContent = trigger.dataset.originalLabel;
      delete trigger.dataset.originalLabel;
    }
    trigger.removeAttribute('aria-busy');
  },
  async runRowAction(actionKey, trigger, fn, loadingLabel = 'Loading…') {
    const key = String(actionKey || '').trim();
    if (!key) return;
    if (this.state.rowActionInFlight.has(key)) return;
    this.state.rowActionInFlight.add(key);
    this.setTriggerBusy(trigger, true, loadingLabel);
    try {
      await fn();
    } finally {
      this.state.rowActionInFlight.delete(key);
      this.setTriggerBusy(trigger, false, loadingLabel);
    }
  },
  async openAgreementRecord(agreementId, trigger = null) {
    const id = String(agreementId || '').trim();
    if (!id) {
      UI.toast('Linked agreement not available');
      return;
    }
    if (!window.Agreements?.openAgreementFormById) {
      UI.toast('Unable to open linked agreement');
      return;
    }
    if (typeof setActiveView === 'function') setActiveView('agreements');
    try {
      await window.Agreements.openAgreementFormById(id, { readOnly: true, trigger });
    } catch (_error) {
      UI.toast('Unable to open linked agreement');
    }
  },
  async previewAgreement(agreementId) {
    const id = String(agreementId || '').trim();
    if (!id) {
      UI.toast('Linked agreement not available');
      return;
    }
    if (!window.Agreements?.previewAgreementHtml) {
      UI.toast('Unable to load agreement preview');
      return;
    }
    try {
      await window.Agreements.previewAgreementHtml(id);
    } catch (_error) {
      UI.toast('Unable to load agreement preview');
    }
  },
  applyFilters() {
    const query = String(this.state.search || '').trim().toLowerCase();
    const statusFilter = String(this.state.status || 'All').trim();
    const assigneeFilter = String(this.state.assignee || 'All Assignees').trim();
    const clientFilter = String(this.state.client || 'All Clients').trim();
    const days = Number(this.state.dateRangeDays || 30);
    const cutoff = Number.isFinite(days) && days > 0 ? (Date.now() - (days * 86400000)) : null;
    const currentUser = String(window.Session?.user?.()?.profile?.name || window.Session?.user?.()?.email || '').trim().toLowerCase();
    this.state.filteredRows = this.state.rows.filter(row => {
      const hay = [
        row.technical_request_id,
        row.agreement_id,
        row.agreement_number,
        row.client_name,
        row.request_title,
        row.request_message,
        row.request_status,
        row.requested_by_display,
        row.requested_by,
        row.assigned_to_display,
        row.assigned_to
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (query && !hay.includes(query)) return false;
      if (statusFilter !== 'All' && row.request_status !== statusFilter) return false;
      const assignee = String(row.assigned_to_display || row.assigned_to || '').trim();
      const client = String(row.client_name || '').trim();
      if (assigneeFilter !== 'All Assignees' && assignee !== assigneeFilter) return false;
      if (clientFilter !== 'All Clients' && client !== clientFilter) return false;
      const due = new Date(this.pick(row.service_start_date, row.target_date, row.due_date)).getTime();
      if (this.state.onlyOverdue && (!due || due >= Date.now())) return false;
      if (this.state.myRequestsOnly && currentUser && !String(assignee).toLowerCase().includes(currentUser)) return false;
      if (cutoff) {
        const created = new Date(this.pick(row.created_at, row.requested_at, row.updated_at)).getTime();
        if (created && created < cutoff) return false;
      }
      return true;
    });
  },
  canUpdateStatus() {
    return canAnyPermission([['technical_admin_requests','update_status'], ['technical_admin_requests','update'], ['technical_admin_requests','manage']]);
  },
  canAssignRequest() {
    return canAnyPermission([['technical_admin_requests','assign'], ['technical_admin_requests','update'], ['technical_admin_requests','manage']]);
  },
  renderSummary() {
    if (!E.technicalAdminSummary) return;
    const rows = this.state.filteredRows;
    const total = rows.length;
    const requested = rows.filter(row => !/completed|cancelled/i.test(String(row.request_status || ''))).length;
    const inProgress = rows.filter(row => this.statusBucket(row.request_status) === 'In Progress').length;
    const now = new Date();
    const overdue = rows.filter(row => new Date(this.pick(row.service_start_date, row.target_date, row.due_date)).getTime() < Date.now() && !/completed|cancelled/i.test(String(row.request_status || ''))).length;
    const completed = rows.filter(row => {
      if (this.statusBucket(row.request_status) !== 'Completed') return false;
      const d = new Date(this.pick(row.completed_at, row.updated_at));
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const cards = [
      ['Pending Requests', requested],
      ['In Progress', inProgress],
      ['Overdue / SLA Risk', overdue],
      ['Completed This Month', completed]
    ];
    E.technicalAdminSummary.innerHTML = cards
      .map(([label, value]) => `<button class="technical-admin-kpi-card" data-kpi-filter="${U.escapeAttr(label)}"><div class="label">${U.escapeHtml(label)}</div><div class="value">${U.escapeHtml(String(value))}</div><div class="muted">Live from filtered dataset</div></button>`)
      .join('');
    this.renderSecondaryMetrics(rows);
    this.renderDashboardPanels(rows);
  },
  renderSecondaryMetrics(rows = []) {
    const host = document.getElementById('technicalAdminSecondaryMetrics'); if (!host) return;
    const open = rows.filter(r => !/completed|cancelled/i.test(String(r.request_status || '')));
    const clients = new Set(open.map(r => String(r.client_name || '').trim()).filter(Boolean));
    const unassigned = open.filter(r => !String(r.assigned_to || r.assigned_to_display || '').trim()).length;
    const locations = rows.reduce((a, r) => a + Number(r.number_of_locations || r.location_count || 0), 0);
    const dueWeek = open.filter(r => { const d = new Date(this.pick(r.service_start_date, r.target_date, r.due_date)).getTime(); return d && d <= Date.now() + 7 * 86400000 && d >= Date.now(); }).length;
    host.innerHTML = [['Total Requests', rows.length], ['Active Clients', clients.size], ['Total Locations', locations], ['Unassigned', unassigned], ['Due This Week', dueWeek]]
      .map(([l,v]) => `<div class="technical-admin-kpi-card"><div class="label">${U.escapeHtml(l)}</div><div class="value">${U.escapeHtml(String(v))}</div></div>`).join('');
  },
  renderDashboardPanels(rows = []) {
    const statusHost = document.getElementById('technicalAdminStatusPipeline');
    const workloadHost = document.getElementById('technicalAdminAssigneeWorkload');
    const critHost = document.getElementById('technicalAdminCriticalQueue');
    const upcomingHost = document.getElementById('technicalAdminUpcomingPanel');
    const recentHost = document.getElementById('technicalAdminRecentActivity');
    const volumeHost = document.getElementById('technicalAdminVolumeChart');
    if (statusHost) {
      const counts = rows.reduce((a,r)=>{const k=String(r.request_status||'Unknown');a[k]=(a[k]||0)+1;return a;},{});
      const total = rows.length || 1;
      statusHost.innerHTML = Object.entries(counts).map(([k,v])=>`<div class="technical-admin-mini-row"><button class="btn ghost sm" data-status-quick="${U.escapeAttr(k)}">${U.escapeHtml(k)}</button><span>${v} (${Math.round(v*100/total)}%)</span></div>`).join('');
    }
    if (workloadHost) {
      const open = rows.filter(r=>!/completed|cancelled/i.test(String(r.request_status||'')));
      const map = {};
      open.forEach(r=>{const a=String(r.assigned_to_display||r.assigned_to||'Unassigned'); map[a]=(map[a]||0)+1;});
      workloadHost.innerHTML = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([a,v])=>`<div class="technical-admin-mini-row"><button class="btn ghost sm" data-assignee-quick="${U.escapeAttr(a)}">${U.escapeHtml(a)}</button><strong>${v}</strong></div>`).join('');
    }
    const dueRows = rows.map(r=>({r,d:new Date(this.pick(r.service_start_date,r.target_date,r.due_date)).getTime()})).filter(x=>x.d).sort((a,b)=>a.d-b.d);
    if (upcomingHost) upcomingHost.innerHTML = dueRows.slice(0,6).map(({r,d})=>`<div class="technical-admin-mini-row"><span>${U.escapeHtml(r.technical_request_id||r.id||'')} · ${U.escapeHtml(r.client_name||'')}</span><span>${Math.ceil((d-Date.now())/86400000)}d</span></div>`).join('');
    if (critHost) critHost.innerHTML = dueRows.filter(x=>x.d < Date.now()).slice(0,6).map(({r,d})=>`<div class="technical-admin-mini-row"><span>${U.escapeHtml(r.technical_request_id||r.id||'')} overdue</span><button class="btn ghost sm" data-technical-open="${U.escapeAttr(r.id||r.technical_request_id||'')}">Open</button></div>`).join('') || '<div class="muted">No critical items.</div>';
    if (recentHost) recentHost.innerHTML = rows.slice().sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at)).slice(0,6).map(r=>`<div class="technical-admin-mini-row"><span>${U.escapeHtml(r.client_name||'')}</span><span>${U.escapeHtml(this.toDisplayDateTime(r.updated_at))}</span></div>`).join('');
    if (volumeHost) {
      const days = Number(this.state.volumeRangeDays || 30); const buckets = {};
      for (let i=days-1;i>=0;i--){const d=new Date(Date.now()-i*86400000); buckets[d.toISOString().slice(0,10)]=0;}
      rows.forEach(r=>{const k=new Date(this.pick(r.created_at,r.requested_at,r.updated_at)).toISOString().slice(0,10); if (k in buckets) buckets[k]+=1;});
      const max = Math.max(1,...Object.values(buckets));
      volumeHost.innerHTML = `<div class="tech-chart-bars">${Object.entries(buckets).map(([k,v])=>`<div class="tech-bar-line"><span>${k.slice(5)}</span><div class="bar" style="width:${Math.max(4,(v/max)*100)}%"></div><span>${v}</span></div>`).join('')}</div>`;
    }
  },
  renderFilters() {
    if (!E.technicalAdminStatusFilter) return;
    const statuses = [...new Set(this.state.rows.map(row => String(row.request_status || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const options = ['All', ...statuses];
    E.technicalAdminStatusFilter.innerHTML = options.map(v => `<option>${U.escapeHtml(v)}</option>`).join('');
    E.technicalAdminStatusFilter.value = options.includes(this.state.status) ? this.state.status : 'All';
    if (E.technicalAdminSearchInput) E.technicalAdminSearchInput.value = this.state.search;
    const assigneeEl = document.getElementById('technicalAdminAssigneeFilter');
    const clientEl = document.getElementById('technicalAdminClientFilter');
    if (assigneeEl) {
      const assignees = [...new Set(this.state.rows.map(r => String(r.assigned_to_display || r.assigned_to || '').trim()).filter(Boolean))].sort();
      assigneeEl.innerHTML = ['All Assignees', ...assignees].map(v => `<option>${U.escapeHtml(v)}</option>`).join('');
      assigneeEl.value = this.state.assignee;
    }
    if (clientEl) {
      const clients = [...new Set(this.state.rows.map(r => String(r.client_name || '').trim()).filter(Boolean))].sort();
      clientEl.innerHTML = ['All Clients', ...clients].map(v => `<option>${U.escapeHtml(v)}</option>`).join('');
      clientEl.value = this.state.client;
    }
  },
  render() {
    if (!E.technicalAdminState || !E.technicalAdminTbody) return;
    if (this.state.loading) {
      E.technicalAdminState.textContent = 'Loading technical admin requests…';
      E.technicalAdminTbody.innerHTML = '<tr><td colspan="13" class="muted" style="text-align:center;">Loading technical admin requests…</td></tr>';
      return;
    }
    if (this.state.loadError) {
      E.technicalAdminState.textContent = this.state.loadError;
      E.technicalAdminTbody.innerHTML = `<tr><td colspan="13" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(this.state.loadError)}</td></tr>`;
      return;
    }
    const rows = this.state.filteredRows;
    E.technicalAdminState.textContent = `${rows.length} request${rows.length === 1 ? '' : 's'} · page ${this.state.page}`;
    this.renderSummary();
    if (!rows.length) {
      E.technicalAdminTbody.innerHTML = '<tr><td colspan="13" class="muted" style="text-align:center;">No technical admin requests found.</td></tr>';
      return;
    }
    const text = value => U.escapeHtml(String(value || '').trim() || '—');
    E.technicalAdminTbody.innerHTML = rows
      .map(row => {
        const requestId = U.escapeAttr(row.technical_request_id || '');
        const requestDbId = U.escapeAttr(row.id || row.technical_request_id || '');
        const onboardingId = U.escapeAttr(row.onboarding_id || '');
        const agreementId = String(row.agreement_id || '').trim();
        const agreementAction = agreementId
          ? `<button class="btn ghost sm" type="button" data-permission-resource="agreements" data-permission-action="view" data-technical-open-agreement="${U.escapeAttr(agreementId)}" data-technical-request-preview="${requestId}">Open Agreement</button><button class="btn ghost sm" type="button" data-permission-resource="agreements" data-permission-action="view" data-technical-preview="${U.escapeAttr(agreementId)}" data-technical-request-preview="${requestId}">Preview Agreement</button>`
          : '';
        return `<tr data-technical-request-id="${requestDbId}" data-technical-onboarding-id="${onboardingId}" data-technical-request-key="${requestId}">
          <td>${text(row.technical_request_id)}</td>
          <td>${text(row.agreement_number)}</td>
          <td>${text(row.client_name)}</td>
          <td>${text(row.number_of_locations || row.location_count || row.locations_count || '')}</td>
          <td>${U.escapeHtml(this.toDisplayDate(row.service_start_date))}</td>
          <td>${U.escapeHtml(this.toDisplayDate(row.service_end_date))}</td>
          <td>${text(row.billing_frequency)}</td>
          <td>${text(row.payment_term || row.payment_terms)}</td>
          <td>${this.statusBadge(row.request_status)}</td>
          <td>${text(row.requested_by_display || row.requested_by)}</td>
          <td>${U.escapeHtml(this.toDisplayDateTime(row.requested_at))}</td>
          <td>${text(row.assigned_to_display || row.assigned_to || row.assigned_user)}</td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="btn ghost sm" type="button" data-permission-resource="technical_admin_requests" data-permission-action="view" data-technical-open="${requestDbId}">Open</button>
              ${agreementAction}
            </div>
          </td>
        </tr>`;
      })
      .join('');
    const paginationHost = U.ensurePaginationHost({
      hostId: 'technicalAdminPagination',
      anchor: E.technicalAdminTbody?.closest?.('.table-wrap')
    });
    U.renderPaginationControls({
      host: paginationHost,
      moduleKey: 'technical-admin',
      page: this.state.page,
      pageSize: this.state.limit,
      hasMore: this.state.hasMore,
      returned: this.state.returned,
      loading: this.state.loading,
      pageSizeOptions: [25, 50, 100],
      onPageChange: nextPage => {
        this.state.page = U.normalizePageNumber(nextPage, 1);
        this.loadAndRefresh({ force: true });
      },
      onPageSizeChange: nextSize => {
        this.state.limit = U.normalizePageSize(nextSize, 50, 200);
        this.state.page = 1;
        this.loadAndRefresh({ force: true });
      }
    });
    if (this.state.pendingHighlightId) {
      const pendingId = this.state.pendingHighlightId;
      this.state.pendingHighlightId = '';
      window.requestAnimationFrame(() => this.highlightRow(pendingId));
    }
  },
  async loadAndRefresh(options = {}) {
    if (!Permissions.canViewTechnicalAdmin()) return;
    this.state.loading = true;
    this.state.loadError = '';
    this.render();
    try {
      const response = await Api.listTechnicalAdminRequests({
        search: this.state.search,
        request_status: this.state.status !== 'All' ? this.state.status : '',
        page: this.state.page,
        limit: this.state.limit,
        sort_by: 'updated_at',
        sort_dir: 'desc'
      }, { forceRefresh: !!options.force });
      const rows = Api.normalizeListResponse(response)?.rows || [];
      this.state.rows = (await this.enrichRows(rows)).filter(row => row.id || row.technical_request_id);
      const normalized = Api.normalizeListResponse(response);
      this.state.page = Number(normalized.page || this.state.page || 1);
      this.state.limit = U.normalizePageSize(normalized.limit ?? this.state.limit, 50, 200);
      this.state.offset = Number(normalized.offset ?? Math.max(0, (this.state.page - 1) * this.state.limit));
      this.state.returned = Number(normalized.returned ?? this.state.rows.length);
      this.state.hasMore = Boolean(normalized.hasMore);
      if (options?.highlightRequestId) this.state.pendingHighlightId = String(options.highlightRequestId || '').trim();
      this.state.loaded = true;
    } catch (error) {
      this.state.rows = [];
      this.state.loadError = String(error?.message || 'Unable to load technical admin requests.').trim();
    } finally {
      this.state.loading = false;
      this.applyFilters();
      this.renderFilters();
      this.render();
    }
  },
  upsertLocalRow(row) {
    const normalized = this.normalizeRow(row);
    const requestId = String(normalized.id || normalized.technical_request_id || '').trim();
    if (!requestId) return;
    const idx = this.state.rows.findIndex(item => String(item.id || item.technical_request_id || '') === requestId);
    if (idx === -1) this.state.rows.unshift(normalized);
    else this.state.rows[idx] = { ...this.state.rows[idx], ...normalized };
    this.applyFilters();
    this.renderFilters();
    this.render();
  },
  getRowById(requestId = '') {
    const id = String(requestId || '').trim();
    if (!id) return null;
    return this.state.rows.find(row => String(row.id || row.technical_request_id || '') === id) || null;
  },
  closeDetails() {
    if (!E.technicalAdminDetailsModal) return;
    E.technicalAdminDetailsModal.classList.remove('open');
    E.technicalAdminDetailsModal.setAttribute('aria-hidden', 'true');
    if (window.setAppHashRoute) setAppHashRoute('#technical-admin');
  },
  async openDetails(requestId) {
    const id = String(requestId || '').trim();
    if (!id) return;
    let row = this.getRowById(id);
    this.state.activeRequestId = String(row?.id || id).trim();
    try {
      const response = await Api.getTechnicalAdminRequest(this.state.activeRequestId);
      const detail = Api.unwrapApiPayload(response);
      const detailRow = this.normalizeRow(detail?.technical_request || detail?.request || detail || response || {});
      if (detailRow.id || detailRow.technical_request_id) {
        this.upsertLocalRow(detailRow);
        row = detailRow;
        this.state.activeRequestId = String(detailRow.id || this.state.activeRequestId).trim();
      }
    } catch (_error) {
      // Render local row fallback.
    }
    if (!row) return UI.toast('Unable to load technical admin request details.');
    if (E.technicalAdminDetailsTitle) {
      E.technicalAdminDetailsTitle.textContent = `Technical Admin Request ${row.technical_request_id || ''}`.trim();
    }
    if (E.technicalAdminDetailsContent) {
      const agreementId = String(row.agreement_id || '').trim();
      const hasAgreementId = !!agreementId;
      const hasAgreementNumberOnly = !hasAgreementId && !!String(row.agreement_number || '').trim();
      const previewDisabledAttr = hasAgreementId ? '' : 'disabled';
      const previewHint = hasAgreementNumberOnly
        ? '<div class="muted" style="font-size:12px;">Linked agreement not available</div>'
        : '';
      E.technicalAdminDetailsContent.innerHTML = `
        <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
          <div><span class="muted">Technical Request ID:</span> ${U.escapeHtml(row.technical_request_id || '—')}</div>
          <div><span class="muted">Agreement ID:</span> ${U.escapeHtml(row.agreement_id || '—')}</div>
          <div><span class="muted">Agreement Number:</span> ${U.escapeHtml(row.agreement_number || '—')}</div>
          <div><span class="muted">Onboarding ID:</span> ${U.escapeHtml(row.onboarding_id || '—')}</div>
          <div><span class="muted">Client ID:</span> ${U.escapeHtml(row.client_id || '—')}</div>
          <div><span class="muted">Client Name:</span> ${U.escapeHtml(row.client_name || '—')}</div>
          <div><span class="muted">Request Type:</span> ${U.escapeHtml(row.request_type || '—')}</div>
          <div><span class="muted">Status:</span> ${this.statusBadge(row.request_status)}</div>
          <div><span class="muted">Number of Locations:</span> ${U.escapeHtml(String(row.number_of_locations || row.location_count || '—'))}</div>
          <div><span class="muted">Invoice Number:</span> ${U.escapeHtml(row.invoice_number || row.source_invoice_number || '—')}</div>
          <div style="grid-column:1/-1;"><span class="muted">Invoiced Locations:</span> ${U.escapeHtml(row.invoiced_location_names || row.invoiced_locations || row.location_names || '—')}</div>
          <div><span class="muted">Service Start Date:</span> ${U.escapeHtml(this.toDisplayDate(row.service_start_date))}</div>
          <div><span class="muted">Service End Date:</span> ${U.escapeHtml(this.toDisplayDate(row.service_end_date))}</div>
          <div><span class="muted">Billing Frequency:</span> ${U.escapeHtml(row.billing_frequency || '—')}</div>
          <div><span class="muted">Payment Term:</span> ${U.escapeHtml(row.payment_term || row.payment_terms || '—')}</div>
          <div><span class="muted">Requested By:</span> ${U.escapeHtml(row.requested_by_display || row.requested_by || '—')}</div>
          <div><span class="muted">Requested At:</span> ${U.escapeHtml(this.toDisplayDateTime(row.requested_at))}</div>
          <div><span class="muted">Assigned To:</span> ${U.escapeHtml(row.assigned_to_display || row.assigned_to || '—')}</div>
          <div><span class="muted">Updated At:</span> ${U.escapeHtml(U.fmtDisplayDate(row.updated_at))}</div>
          <div style="grid-column:1/-1;"><span class="muted">Request Title:</span> ${U.escapeHtml(row.request_title || '—')}</div>
          <div style="grid-column:1/-1;"><span class="muted">Request Message:</span> ${U.escapeHtml(row.request_message || '—')}</div>
          <div style="grid-column:1/-1;"><span class="muted">Module Summary:</span> ${U.escapeHtml(row.module_summary || '—')}</div>
          <div style="grid-column:1/-1;"><span class="muted">Request Details:</span> ${U.escapeHtml(row.request_details || '—')}</div>
          <div style="grid-column:1/-1;"><span class="muted">Notes:</span> ${U.escapeHtml(row.notes || '—')}</div>
        </div>
        <div class="actions" style="justify-content:flex-end;gap:8px;margin-top:14px;">
          <div style="margin-right:auto;display:flex;flex-direction:column;gap:4px;align-items:flex-start;">
            <button class="btn ghost" type="button" data-permission-resource="agreements" data-permission-action="view" data-technical-open-agreement-detail="${U.escapeAttr(agreementId)}" ${previewDisabledAttr}>Open Agreement</button>
            <button class="btn ghost" type="button" data-permission-resource="agreements" data-permission-action="view" data-technical-preview-detail="${U.escapeAttr(agreementId)}" ${previewDisabledAttr}>Preview Agreement</button>
            ${previewHint}
          </div>
          <button class="btn ghost" type="button" data-permission-resource="technical_admin_requests" data-permission-action="update_status" data-technical-status="In Progress">Mark In Progress</button>
          <button class="btn ghost" type="button" data-permission-resource="technical_admin_requests" data-permission-action="update_status" data-technical-status="Completed">Mark Completed</button>
          <button class="btn ghost" type="button" data-permission-resource="technical_admin_requests" data-permission-action="update_status" data-technical-status="Requested">Reopen</button>
          <button class="btn ghost" type="button" data-permission-resource="technical_admin_requests" data-permission-action="update" data-technical-assign="1">Assign To…</button>
        </div>
      `;
      applyPermissionVisibility(E.technicalAdminDetailsContent);
    }
    if (E.technicalAdminDetailsModal) {
      E.technicalAdminDetailsModal.classList.add('open');
      E.technicalAdminDetailsModal.setAttribute('aria-hidden', 'false');
    if (window.setAppHashRoute && window.buildRecordHashRoute) setAppHashRoute(buildRecordHashRoute('technical_admin_requests', row || {}));
    }
  },
  async updateStatus(status, extra = {}) {
    if (!Permissions.canManageTechnicalAdmin()) {
      UI.toast('You do not have permission to update technical requests.');
      return;
    }
    const activeId = String(this.state.activeRequestId || '').trim();
    if (!activeId) return;
    const row = this.getRowById(activeId);
    const rowId = String(row?.id || activeId).trim();
    if (!rowId) return;
    const onboardingId = String(row?.onboarding_id || row?.operations_onboarding_id || '').trim();
    const agreementId = String(row?.agreement_id || '').trim();
    const nowIso = new Date().toISOString();
    const nextStatus = String(status || '').trim() || 'Requested';
    const statusPayload = {
      updated_at: nowIso,
      completed_at: nextStatus === 'Completed' ? nowIso : null,
      ...(extra && typeof extra === 'object' ? extra : {})
    };
    try {
      const response = await Api.updateTechnicalAdminRequestStatus(rowId, nextStatus, statusPayload);
      const payload = Api.unwrapApiPayload(response);
      const returned = payload?.technical_request || payload?.request || payload;
      const existing = this.getRowById(rowId) || row || { id: rowId, technical_request_id: rowId };
      this.upsertLocalRow({
        ...existing,
        ...(returned && typeof returned === 'object' ? returned : {}),
        request_status: nextStatus,
        technical_request_status: nextStatus,
        updated_at: nowIso,
        completed_at: nextStatus === 'Completed' ? nowIso : null
      });
      if (onboardingId) {
        Api.updateOperationsOnboardingAction({
          onboardingId,
          agreementId,
          updates: {
            technical_request_status: nextStatus,
            updated_at: nowIso,
            completed_at: nextStatus === 'Completed' ? nowIso : null
          }
        }).catch(syncError => {
          console.warn('[TechnicalAdmin] unable to sync operations_onboarding technical status', syncError);
        });
      }
      const labelId = String(this.getRowById(rowId)?.technical_request_id || row?.technical_request_id || rowId).trim();
      UI.toast(`Technical request ${labelId} updated to ${nextStatus}.`);
      await this.loadAndRefresh({ force: true });
      if (window.OperationsOnboarding?.loadAndRefresh) {
        await window.OperationsOnboarding.loadAndRefresh({ force: true });
      }
      await this.openDetails(rowId);
    } catch (error) {
      const rawMessage = String(error?.message || 'Unknown error');
      const safeMessage = /coerce the result to a single json object|not found|no rows|matched multiple rows/i.test(rawMessage)
        ? 'Technical admin request was not found or is no longer available.'
        : rawMessage;
      UI.toast('Unable to update technical admin request status: ' + safeMessage);
    }
  },
  async assignToFlow() {
    if (!this.canAssignRequest()) { UI.toast('You do not have permission to assign technical admin requests.'); return; }
    const assignee = window.prompt('Assign Technical Admin to:');
    if (assignee == null) return;
    const activeId = String(this.state.activeRequestId || '').trim();
    const row = this.getRowById(activeId);
    const rowId = String(row?.id || activeId).trim();
    if (!rowId) return;
    const onboardingId = String(row?.onboarding_id || row?.operations_onboarding_id || '').trim();
    const agreementId = String(row?.agreement_id || '').trim();
    const nowIso = new Date().toISOString();
    const assigneeText = String(assignee || '').trim();
    try {
      const updates = {
        assigned_to: assigneeText,
        technical_admin_assigned_to: assigneeText,
        updated_at: nowIso
      };
      await Api.updateTechnicalAdminRequest(rowId, updates);
      if (onboardingId) {
        Api.updateOperationsOnboardingAction({
          onboardingId,
          agreementId,
          updates: {
            technical_admin_assigned_to: assigneeText,
            updated_at: nowIso
          }
        }).catch(syncError => {
          console.warn('[TechnicalAdmin] unable to sync operations_onboarding assignee', syncError);
        });
      }
      this.upsertLocalRow({ ...(row || { id: rowId }), ...updates, assigned_to_display: assigneeText });
      UI.toast('Technical admin assignee updated.');
      await this.loadAndRefresh({ force: true });
      if (window.OperationsOnboarding?.loadAndRefresh) await window.OperationsOnboarding.loadAndRefresh({ force: true });
      await this.openDetails(rowId);
    } catch (error) {
      UI.toast('Unable to assign technical admin: ' + (error?.message || 'Unknown error'));
    }
  },
  wire() {
    if (this.state.initialized) return;
    const bindState = (el, key) => {
      if (!el) return;
      const sync = () => {
        this.state[key] = String(el.value || '').trim();
        this.state.page = 1;
        this.loadAndRefresh({ force: true });
      };
      el.addEventListener('input', sync);
      el.addEventListener('change', sync);
    };
    bindState(E.technicalAdminSearchInput, 'search');
    bindState(E.technicalAdminStatusFilter, 'status');
    bindState(document.getElementById('technicalAdminAssigneeFilter'), 'assignee');
    bindState(document.getElementById('technicalAdminClientFilter'), 'client');
    bindState(document.getElementById('technicalAdminDateRangeFilter'), 'dateRangeDays');
    document.getElementById('technicalAdminMyRequestsToggle')?.addEventListener('change', e => { this.state.myRequestsOnly = !!e.target.checked; this.applyFilters(); this.render(); });
    document.getElementById('technicalAdminOnlyOverdueToggle')?.addEventListener('change', e => { this.state.onlyOverdue = !!e.target.checked; this.applyFilters(); this.render(); });
    document.getElementById('technicalAdminResetFiltersBtn')?.addEventListener('click', () => { this.state.search=''; this.state.status='All'; this.state.assignee='All Assignees'; this.state.client='All Clients'; this.state.dateRangeDays='30'; this.state.myRequestsOnly=false; this.state.onlyOverdue=false; this.applyFilters(); this.renderFilters(); this.render(); });
    document.getElementById('technicalAdminExportBtn')?.addEventListener('click', () => {
      const rows = this.state.filteredRows || []; const header = ['request_id','client','status','assignee']; const csv = [header.join(',')].concat(rows.map(r => [r.technical_request_id||r.id,r.client_name,r.request_status,r.assigned_to_display||r.assigned_to].map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','))).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'technical-admin-dashboard.csv'; a.click(); URL.revokeObjectURL(url);
    });
    if (E.technicalAdminRefreshBtn) E.technicalAdminRefreshBtn.addEventListener('click', () => this.loadAndRefresh({ force: true }));
    if (E.technicalAdminTbody)
      E.technicalAdminTbody.addEventListener('click', event => {
        const trigger = event.target?.closest?.('button[data-technical-open], button[data-technical-open-agreement], button[data-technical-preview], button[data-status-quick], button[data-assignee-quick], button[data-kpi-filter], button[data-volume-range]');
        if (!trigger) return;
        const quickStatus = trigger.getAttribute('data-status-quick'); if (quickStatus) { this.state.status = quickStatus; this.applyFilters(); this.renderFilters(); this.render(); return; }
        const quickAssignee = trigger.getAttribute('data-assignee-quick'); if (quickAssignee) { this.state.assignee = quickAssignee; this.applyFilters(); this.renderFilters(); this.render(); return; }
        const kpi = trigger.getAttribute('data-kpi-filter'); if (kpi) { if (/In Progress/i.test(kpi)) this.state.status='In Progress'; if (/Overdue/i.test(kpi)) this.state.onlyOverdue=true; this.applyFilters(); this.render(); return; }
        const range = trigger.getAttribute('data-volume-range'); if (range) { this.state.volumeRangeDays = Number(trigger.getAttribute('data-range') || 30); this.renderDashboardPanels(this.state.filteredRows); return; }
        const id = trigger.getAttribute('data-technical-open') || '';
        if (id) return this.openDetails(id);
        const openAgreementId = trigger.getAttribute('data-technical-open-agreement') || '';
        if (openAgreementId) {
          const requestId = trigger.getAttribute('data-technical-request-preview') || openAgreementId;
          return this.runRowAction(`open-agreement:${requestId}`, trigger, () => this.openAgreementRecord(openAgreementId, trigger), 'Opening…');
        }
        const previewId = trigger.getAttribute('data-technical-preview') || '';
        if (!previewId) return;
        const requestId = trigger.getAttribute('data-technical-request-preview') || previewId;
        return this.runRowAction(`preview:${requestId}`, trigger, () => this.previewAgreement(previewId), 'Loading…');
      });
    if (E.technicalAdminDetailsContent)
      E.technicalAdminDetailsContent.addEventListener('click', event => {
        const statusBtn = event.target?.closest?.('button[data-technical-status]');
        if (statusBtn) {
          if (!Permissions.canManageTechnicalAdmin()) return UI.toast('You do not have permission to update technical requests.');
          const nextStatus = statusBtn.getAttribute('data-technical-status') || 'Requested';
          return this.updateStatus(nextStatus);
        }
        const assignBtn = event.target?.closest?.('button[data-technical-assign]');
        if (assignBtn) return this.assignToFlow();
        const openAgreementBtn = event.target?.closest?.('button[data-technical-open-agreement-detail]');
        if (openAgreementBtn) {
          const openId = String(openAgreementBtn.getAttribute('data-technical-open-agreement-detail') || '').trim();
          if (!openId) return UI.toast('Linked agreement not available');
          return this.openAgreementRecord(openId, openAgreementBtn);
        }
        const previewBtn = event.target?.closest?.('button[data-technical-preview-detail]');
        if (previewBtn) {
          const previewId = String(previewBtn.getAttribute('data-technical-preview-detail') || '').trim();
          if (!previewId) return UI.toast('Linked agreement not available');
          if (this.state.detailPreviewLoading) return;
          this.state.detailPreviewLoading = true;
          this.setTriggerBusy(previewBtn, true, 'Loading…');
          this.previewAgreement(previewId).finally(() => {
            this.state.detailPreviewLoading = false;
            this.setTriggerBusy(previewBtn, false, 'Loading…');
          });
        }
      });
    if (E.technicalAdminDetailsCloseBtn) E.technicalAdminDetailsCloseBtn.addEventListener('click', () => this.closeDetails());
    if (E.technicalAdminDetailsModal)
      E.technicalAdminDetailsModal.addEventListener('click', event => {
        if (event.target === E.technicalAdminDetailsModal) this.closeDetails();
      });
    this.state.initialized = true;
  }
};

window.TechnicalAdmin = TechnicalAdmin;
