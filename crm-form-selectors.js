(function initCrmCompanyContactSelectors(global) {
  const doc = global.document;
  if (!doc) return;

  const state = {
    companies: [],
    loadingCompanies: null,
    companyLoadError: null,
    initialized: false
  };

  const FORM_CONFIG = {
    deal: {
      formId: 'dealForm',
      companySelectId: 'dealFormCompanySelector',
      contactSelectId: 'dealFormContactSelector',
      companyHiddenId: 'dealFormCompanyId',
      contactHiddenId: 'dealFormContactId',
      directSourceIds: ['dealFormLeadId'],
      companyFields: {
        id: ['dealCompanyIdDisplay'],
        name: ['dealCompanyNameDisplay', 'dealFormCompanyName'],
        legalName: ['dealCompanyLegalNameDisplay'],
        type: ['dealCompanyTypeDisplay'],
        industry: ['dealCompanyIndustryDisplay'],
        website: ['dealCompanyWebsiteDisplay'],
        email: ['dealCompanyMainEmailDisplay'],
        phone: ['dealCompanyMainPhoneDisplay'],
        country: ['dealCompanyCountryDisplay', 'dealFormCountry'],
        city: ['dealCompanyCityDisplay'],
        address: ['dealCompanyAddressDisplay'],
        tax: ['dealCompanyTaxNumberDisplay'],
        status: ['dealCompanyStatusDisplay']
      },
      contactFields: {
        id: ['dealContactIdDisplay'],
        firstName: ['dealContactFirstNameDisplay'],
        lastName: ['dealContactLastNameDisplay'],
        jobTitle: ['dealContactJobTitleDisplay'],
        department: ['dealContactDepartmentDisplay'],
        email: ['dealContactEmailDisplay', 'dealFormEmail'],
        phone: ['dealContactPhoneDisplay', 'dealFormPhone'],
        mobile: ['dealContactMobileDisplay'],
        decisionRole: ['dealContactDecisionRoleDisplay'],
        primary: ['dealContactPrimaryDisplay'],
        status: ['dealContactStatusDisplay']
      },
      updateModule(company, contact) {
        const Deals = global.Deals;
        if (!Deals?.state?.form) return;
        if (company) {
          Deals.state.form.selectedCompany = company;
          Deals.state.form.companyId = company.company_id || '';
        }
        if (contact) {
          Deals.state.form.selectedContact = contact;
          Deals.state.form.contactId = contact.contact_id || '';
        }
      }
    },
    proposal: {
      formId: 'proposalForm',
      companySelectId: 'proposalFormCompanySelector',
      contactSelectId: 'proposalFormContactSelector',
      companyHiddenId: 'proposalFormCompanyId',
      contactHiddenId: 'proposalFormContactId',
      directSourceIds: ['proposalFormDealId'],
      uuidSourceOfTruth: true,
      companyFields: {
        name: ['proposalFormCustomerName', 'proposalFormCompanyNameHidden'],
        legalName: ['proposalFormCustomerLegalName'],
        address: ['proposalFormCustomerAddress'],
        email: ['proposalFormCustomerEmail'],
        phone: ['proposalFormCustomerPhone'],
        country: ['proposalFormCountry'],
        city: ['proposalFormCity'],
        tax: ['proposalFormTaxNumber']
      },
      contactFields: {
        id: ['proposalFormContactId'],
        fullName: ['proposalFormCustomerContactName', 'proposalFormContactNameHidden'],
        mobile: ['proposalFormCustomerContactMobile'],
        phone: ['proposalFormCustomerContactMobile'],
        email: ['proposalFormCustomerContactEmail'],
        jobTitle: []
      },
      updateModule(company, contact) {
        const form = byId('proposalForm');
        if (!form) return;
        if (company) {
          form.dataset.companyId = getCompanyOptionValue(company);
          form.dataset.companyName = company.company_name || company.legal_name || '';
          form.dataset.companyAddress = company.address || '';
          form.dataset.companyLegalName = company.legal_name || company.company_name || '';
        }
        if (contact) {
          if (!contact.contact_id) {
            form.dataset.contactId = '';
            form.dataset.contactName = '';
            form.dataset.contactFirstName = '';
            form.dataset.contactLastName = '';
            form.dataset.contactJobTitle = '';
            form.dataset.contactEmail = '';
            form.dataset.contactPhone = '';
            form.dataset.contactMobile = '';
            return;
          }
          form.dataset.contactId = contact.contact_id || '';
          form.dataset.contactName = displayContact(contact, { includeEmail: false });
          form.dataset.contactFirstName = contact.first_name || '';
          form.dataset.contactLastName = contact.last_name || '';
          form.dataset.contactJobTitle = contact.contact_position || contact.job_title || '';
          form.dataset.contactEmail = contact.email || '';
          form.dataset.contactPhone = contact.phone || '';
          form.dataset.contactMobile = contact.mobile || '';
        }
      }
    },
    agreement: {
      formId: 'agreementForm',
      companySelectId: 'agreementFormCompanySelector',
      contactSelectId: 'agreementFormContactSelector',
      companyHiddenId: 'agreementFormCompanyId',
      contactHiddenId: 'agreementFormContactId',
      directSourceIds: ['agreementFormProposalId', 'agreementFormDealId', 'agreementFormLeadId'],
      companyFields: {
        name: ['agreementFormCustomerName', 'agreementFormCustomerLegalName', 'agreementFormCompanyName'],
        legalName: ['agreementFormCustomerLegalName'],
        address: ['agreementFormCustomerAddress'],
        email: ['agreementFormCompanyEmail'],
        phone: ['agreementFormCompanyPhone'],
        country: ['agreementFormCountry'],
        city: ['agreementFormCity'],
        tax: ['agreementFormTaxNumber']
      },
      contactFields: {
        id: ['agreementFormContactId'],
        fullName: ['agreementFormCustomerContactName', 'agreementFormContactName'],
        email: ['agreementFormCustomerContactEmail', 'agreementFormContactEmail', 'agreementFormCustomerSignatoryEmail'],
        phone: ['agreementFormCustomerContactPhone', 'agreementFormContactPhone', 'agreementFormCustomerSignatoryPhone'],
        mobile: ['agreementFormCustomerContactMobile', 'agreementFormContactMobile'],
        jobTitle: []
      },
      updateModule(company, contact) {
        const form = byId('agreementForm');
        if (!form) return;
        if (company) {
          form.dataset.companyId = getCompanyOptionValue(company);
          form.dataset.companyName = company.company_name || company.legal_name || '';
          form.dataset.companyAddress = company.address || '';
        }
        if (contact) {
          if (!contact.contact_id) {
            form.dataset.contactId = '';
            form.dataset.contactName = '';
            return;
          }
          form.dataset.contactId = contact.contact_id || '';
          form.dataset.contactName = displayContact(contact, { includeEmail: false });
          form.dataset.contactEmail = contact.email || '';
          form.dataset.contactPhone = contact.phone || '';
          form.dataset.contactMobile = contact.mobile || '';
          form.dataset.contactJobTitle = contact.contact_position || contact.job_title || '';
        }
      }
    },
    invoice: {
      formId: 'invoiceForm',
      companySelectId: 'invoiceFormCompanySelector',
      contactSelectId: 'invoiceFormContactSelector',
      companyHiddenId: 'invoiceFormCompanyId',
      contactHiddenId: 'invoiceFormContactId',
      directSourceIds: ['invoiceFormAgreementId'],
      companyFields: {
        name: ['invoiceFormCustomerName', 'invoiceFormCustomerLegalName', 'invoiceFormCompanyName'],
        legalName: ['invoiceFormCustomerLegalName'],
        address: ['invoiceFormCustomerAddress']
      },
      contactFields: {
        id: ['invoiceFormContactId'],
        fullName: ['invoiceFormCustomerContactName', 'invoiceFormContactName'],
        email: ['invoiceFormCustomerContactEmail', 'invoiceFormContactEmail'],
        phone: ['invoiceFormContactPhone'],
        mobile: ['invoiceFormContactMobile']
      },
      updateModule(company, contact) {
        if (global.Invoices?.state) {
          if (company) global.Invoices.state.selectedCompany = company;
          if (contact) global.Invoices.state.selectedContact = contact.contact_id ? contact : null;
        }
        if (global.Invoices?.hydrateInvoiceCustomerSection) {
          global.Invoices.hydrateInvoiceCustomerSection({
            agreement: global.Invoices.state?.selectedAgreement || global.Invoices.state?.selectedInvoice || {},
            company: global.Invoices.state?.selectedCompany || {},
            contact: global.Invoices.state?.selectedContact || {}
          });
        }
      }
    },
    receipt: {
      formId: 'receiptForm',
      companySelectId: 'receiptFormCompanySelector',
      contactSelectId: 'receiptFormContactSelector',
      companyHiddenId: 'receiptFormCompanyId',
      contactHiddenId: 'receiptFormContactId',
      directSourceIds: ['receiptFormInvoiceId'],
      companyFields: {
        name: ['receiptFormCustomerName', 'receiptFormCustomerLegalName', 'receiptFormCompanyName'],
        legalName: ['receiptFormCustomerLegalName'],
        address: ['receiptFormCustomerAddress']
      },
      contactFields: {
        id: ['receiptFormContactId'],
        fullName: ['receiptFormContactName'],
        email: ['receiptFormContactEmail'],
        phone: ['receiptFormContactPhone'],
        mobile: ['receiptFormContactMobile']
      },
      updateModule(company, contact) {
        const form = byId('receiptForm');
        if (!form) return;
        if (company) {
          form.dataset.companyId = getCompanyOptionValue(company);
          form.dataset.companyName = company.company_name || company.legal_name || '';
          form.dataset.companyAddress = company.address || '';
        }
        if (contact) {
          if (!contact.contact_id) {
            form.dataset.contactId = '';
            form.dataset.contactName = '';
            form.dataset.contactEmail = '';
            form.dataset.contactPhone = '';
            form.dataset.contactMobile = '';
            return;
          }
          form.dataset.contactId = contact.contact_id || '';
          form.dataset.contactName = displayContact(contact, { includeEmail: false });
          form.dataset.contactEmail = contact.email || '';
          form.dataset.contactPhone = contact.phone || '';
          form.dataset.contactMobile = contact.mobile || '';
        }
      }
    }
  };

  function byId(id) { return id ? doc.getElementById(id) : null; }
  function str(value) { return String(value ?? '').trim(); }
  function normalizeCompare(value) { return str(value).toLowerCase(); }
  function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str(value)); }
  function rowsFrom(response) {
    const rows = response?.rows || response?.items || response?.data || response?.result || response;
    return Array.isArray(rows) ? rows : [];
  }
  function normalizeCompany(raw = {}) {
    const c = raw && typeof raw === 'object' ? raw : {};
    const rawCompanyId = str(c.company_id || c.companyId);
    const uuid = str(c.id || c.company_uuid || c.companyUuid || c.company_uuid_id || c.companyUuidId || c.company_uuid_value);
    const businessId = str(c.company_ref || c.companyRef || c.company_business_id || c.companyBusinessId || c.company_number || c.companyNumber || c.company_code || c.companyCode || c.reference || c.code || (isUuid(rawCompanyId) ? '' : rawCompanyId));
    const canonicalId = uuid || (isUuid(rawCompanyId) ? rawCompanyId : '');
    return {
      ...c,
      id: canonicalId,
      company_id: canonicalId,
      company_uuid: canonicalId,
      company_business_id: businessId,
      company_ref: businessId,
      company_number: str(c.company_number || c.companyNumber || businessId),
      company_code: str(c.company_code || c.companyCode),
      company_name: str(c.company_name || c.companyName || c.companyNameText || c.name),
      name: str(c.name || c.company_name || c.companyName),
      legal_name: str(c.legal_name || c.legalName),
      company_type: str(c.company_type || c.companyType),
      industry: str(c.industry),
      website: str(c.website),
      main_email: str(c.main_email || c.mainEmail || c.email),
      main_phone: str(c.main_phone || c.mainPhone || c.phone),
      country: str(c.country),
      city: str(c.city),
      address: str(c.address),
      tax_number: str(c.tax_number || c.taxNumber),
      company_status: str(c.company_status || c.companyStatus || c.status),
      status: str(c.status || c.company_status || c.companyStatus),
      created_at: str(c.created_at || c.createdAt),
      updated_at: str(c.updated_at || c.updatedAt),
      is_archived: c.is_archived === true || c.isArchived === true,
      is_deleted: c.is_deleted === true || c.isDeleted === true,
      archived_at: str(c.archived_at || c.archivedAt),
      deleted_at: str(c.deleted_at || c.deletedAt),
      currency: str(c.currency),
      payment_term: str(c.payment_term || c.paymentTerm || c.payment_terms || c.paymentTerms),
      authorized_signatory_full_name: str(c.authorized_signatory_full_name || c.authorizedSignatoryFullName),
      authorized_signatory_title: str(c.authorized_signatory_title || c.authorizedSignatoryTitle),
      documents_verified: c.documents_verified === true || c.documentsVerified === true || String(c.documents_verified ?? c.documentsVerified ?? '').toLowerCase() === 'true',
      documents_verification_status: str(c.documents_verification_status || c.documentsVerificationStatus)
    };
  }
  function normalizeContact(raw = {}) {
    const c = raw && typeof raw === 'object' ? raw : {};
    const rawContact = c.raw_contact && typeof c.raw_contact === 'object' ? c.raw_contact : {};
    const contactUuid = str(c.id || c.contact_uuid || c.contactUuid || c.contact_id_uuid || c.contactIdUuid);
    const contactBusinessId = str(c.contact_ref || c.contactRef || c.contact_number || c.contactNumber || c.contact_code || c.contactCode || rawContact.contact_id || rawContact.contact_number || rawContact.contact_code || (!isUuid(c.contact_id || c.contactId) ? (c.contact_id || c.contactId) : ''));
    const rawCompanyId = str(c.company_id || c.companyId || rawContact.company_id || rawContact.companyId);
    const companyUuid = str(c.selected_company_uuid || c.selectedCompanyUuid || c.company_uuid || c.companyUuid || (isUuid(rawCompanyId) ? rawCompanyId : ''));
    const companyBusinessId = str(c.selected_company_ref || c.selectedCompanyRef || c.company_ref || c.companyRef || rawContact.company_id || rawContact.companyId || (isUuid(rawCompanyId) ? '' : rawCompanyId));
    const first = str(c.first_name || c.firstName || rawContact.first_name || rawContact.firstName);
    const last = str(c.last_name || c.lastName || rawContact.last_name || rawContact.lastName);
    const full = str(c.contact_name || c.contactName || c.full_name || c.fullName || c.name || rawContact.full_name || rawContact.contact_name || rawContact.name || `${first} ${last}`);
    return {
      ...rawContact,
      ...c,
      id: contactUuid,
      contact_id: contactUuid,
      contact_uuid: contactUuid,
      contact_business_id: contactBusinessId,
      contact_ref: contactBusinessId,
      company_id: companyUuid,
      company_uuid: companyUuid,
      company_business_id: companyBusinessId,
      company_ref: companyBusinessId,
      company_name: str(c.selected_company_name || c.company_name || c.companyName || rawContact.company_name || rawContact.companyName),
      legal_company_name: str(c.legal_company_name || c.legalCompanyName || rawContact.legal_company_name),
      first_name: first,
      last_name: last,
      full_name: full,
      contact_position: str(c.contact_position || c.contactPosition || c.job_title || c.jobTitle || rawContact.position || rawContact.title || rawContact.job_title),
      job_title: str(c.contact_position || c.contactPosition || c.job_title || c.jobTitle || rawContact.position || rawContact.title || rawContact.job_title),
      department: str(c.department || rawContact.department),
      email: str(c.email || rawContact.email || rawContact.contact_email),
      phone: str(c.phone || rawContact.phone || rawContact.phone_number),
      mobile: str(c.mobile || rawContact.mobile),
      decision_role: str(c.decision_role || c.decisionRole || rawContact.decision_role),
      is_primary_contact: c.is_primary === true || c.isPrimary === true || c.is_primary_contact === true || c.isPrimaryContact === true || String(c.is_primary || c.is_primary_contact || c.isPrimaryContact || rawContact.is_primary_contact || '').toLowerCase() === 'true',
      contact_status: str(c.contact_status || c.contactStatus || rawContact.contact_status || rawContact.status)
    };
  }
  function displayCompany(company = {}) {
    return str(company.legal_name || company.company_name || company.company_id || 'Unnamed company');
  }
  function displayContact(contact = {}, { includeEmail = false } = {}) {
    const c = contact && typeof contact === 'object' ? contact : {};
    const first = str(c.first_name);
    const last = str(c.last_name);
    const firstLast = str([first, last].filter(Boolean).join(' '));
    const stripEmailSuffix = value => str(value).replace(/\s+[—-]\s+\S+@\S+$/u, '').trim();
    const full = stripEmailSuffix(c.full_name || c.fullName);
    const contactName = stripEmailSuffix(c.contact_name || c.contactName || c.name);
    const base = firstLast || full || contactName || str(c.email) || 'Unnamed contact';
    if (includeEmail && str(c.email) && normalizeCompare(base) !== normalizeCompare(c.email)) return `${base} — ${str(c.email)}`;
    return base;
  }
  function setValue(id, value, { readonly = true } = {}) {
    const el = byId(id);
    if (!el) return;
    el.value = value ?? '';
    if (readonly && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      el.readOnly = true;
      el.setAttribute('aria-readonly', 'true');
      el.classList.add('readonly-field', 'locked-field');
    }
  }
  function setMany(ids = [], value, options) {
    ids.forEach(id => setValue(id, value, options));
  }
  function setText(id, value) {
    const el = byId(id);
    if (!el) return;
    if ('value' in el) el.value = value ?? '';
    else el.textContent = value ?? '';
  }
  function companyDisplayName(company = {}) {
    return str(company.legal_name || company.company_name || company.name || company.company_id || company.id);
  }
  function companyMatchesId(company = {}, value = '') {
    const key = str(value);
    if (!key) return false;
    return [company.company_id, company.company_uuid, company.company_business_id, company.id]
      .map(str)
      .filter(Boolean)
      .some(candidate => candidate === key);
  }
  function findCompanyByAnyId(value = '') {
    const key = str(value);
    if (!key) return null;
    return state.companies.find(company => companyMatchesId(company, key)) || null;
  }
  function getCompanyOptionValue(company = {}) {
    // CRM relations must always use the companies.id UUID, never a display/business code.
    return str(company.id || company.company_uuid);
  }
  function contactPhone(contact = {}) {
    return str(contact.mobile || contact.phone);
  }
  function setSelectOptions(select, rows, placeholder, type) {
    if (!select) return;
    const currentValue = str(select.value);
    const options = [`<option value="">${escapeHtml(placeholder)}</option>`];
    rows.forEach(row => {
      const value = type === 'company'
        ? getCompanyOptionValue(row)
        : (row.contact_id || row.id || '');
      if (!value) return;
      const label = type === 'company'
        ? displayCompany(row)
        : displayContact(row, { includeEmail: false });
      options.push(`<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`);
    });
    select.innerHTML = options.join('');
    if (currentValue && [...select.options].some(opt => opt.value === currentValue)) select.value = currentValue;
  }
  function escapeHtml(value) {
    return str(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  }
  function escapeAttr(value) { return escapeHtml(value).replace(/'/g, '&#39;'); }

  function isCompanyListUnavailableError(error) {
    const message = String(error?.message || error || '');
    return message.includes('cannot list companies') || message.includes('Forbidden');
  }

  function isSelectableCompany(company = {}) {
    return company.is_archived !== true && company.is_deleted !== true && !str(company.archived_at) && !str(company.deleted_at);
  }

  function mergeCompanyRows(rows = [], selected = null) {
    const byId = new Map();
    [...rows, selected].filter(Boolean).map(normalizeCompany).filter(isSelectableCompany).forEach(company => {
      const id = getCompanyOptionValue(company);
      if (id) byId.set(id, company);
    });
    return Array.from(byId.values());
  }

  async function resolveCompanyUuid(companyKey) {
    const key = str(companyKey);
    if (!key) return null;
    if (isUuid(key)) return key;
    const client = global.SupabaseClient?.getClient?.() || global.supabaseClient || global.supabase;
    if (!client?.rpc) {
      console.error('[Company Resolver] Failed:', key, new Error('Supabase RPC client is unavailable.'));
      return null;
    }
    const { data, error } = await client.rpc('crm_resolve_company_uuid', { p_company_key: key });
    if (error) {
      console.error('[Company Resolver] Failed:', key, error);
      return null;
    }
    const resolvedId = str(Array.isArray(data) ? data[0] : data);
    return isUuid(resolvedId) ? resolvedId : null;
  }

  async function loadCompanySafe(companyKey) {
    const key = str(companyKey);
    if (!key) return null;
    const client = global.SupabaseClient?.getClient?.() || global.supabaseClient || global.supabase;
    if (client?.rpc) {
      const { data, error } = await client.rpc('crm_get_company_by_key', { p_company_key: key });
      if (!error) {
        const row = Array.isArray(data) ? data[0] : data;
        if (row && typeof row === 'object') return normalizeCompany(row);
      } else {
        console.error('[Company Loader] RPC failed:', key, error);
      }
    }
    const id = await resolveCompanyUuid(key);
    if (!id) return null;
    if (client?.from) {
      const { data, error } = await client.from('companies').select('*').eq('id', id).maybeSingle();
      if (!error && data) return normalizeCompany(data);
      if (error) console.error('[Company Loader] direct UUID lookup failed:', id, error);
    }
    if (global.Api?.requestWithSession) {
      const response = await global.Api.requestWithSession('companies', 'get', { id }, { requireAuth: true });
      const row = response?.row || response?.data || response?.company || response;
      return row && typeof row === 'object' ? normalizeCompany(row) : null;
    }
    return null;
  }

  async function fetchCompanyByUuid(companyId) {
    const id = str(companyId);
    if (!isUuid(id)) return null;
    const client = global.SupabaseClient?.getClient?.() || global.supabaseClient || global.supabase;
    if (client?.from) {
      const { data, error } = await client.from('companies').select('*').eq('id', id).maybeSingle();
      if (error) {
        console.error('[crm selectors] selected company UUID query failed', error);
        throw error;
      }
      return data ? normalizeCompany(data) : null;
    }
    return loadCompanySafe(id);
  }

  async function loadCompanyOptions(searchText = '', includeSelectedId = null) {
    const search = str(searchText);
    const selectedId = str(includeSelectedId);
    const client = global.SupabaseClient?.getClient?.() || global.supabaseClient || global.supabase;
    state.companyLoadError = null;
    let rows = [];

    try {
      if (client?.from) {
        const buildQuery = fields => {
          let query = client.from('companies').select('*');
          if (search) {
            const escaped = search.replace(/[,%()]/g, ' ').trim();
            query = query.or(fields.map(field => `${field}.ilike.%${escaped}%`).join(','));
          }
          return query
            .order('updated_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false, nullsFirst: false })
            .order('legal_name', { ascending: true, nullsFirst: false })
            .order('company_name', { ascending: true, nullsFirst: false })
            .limit(200);
        };
        let result = await buildQuery(['legal_name', 'company_name', 'name', 'company_id', 'company_number', 'company_code']);
        // Deployments do not all have the optional alias/code columns yet.
        if (result.error && search) result = await buildQuery(['legal_name', 'company_name', 'company_id']);
        if (result.error) throw result.error;
        rows = (result.data || []).map(normalizeCompany).filter(company => getCompanyOptionValue(company) && isSelectableCompany(company));
      } else if (global.Api?.requestWithSession) {
        const response = await global.Api.requestWithSession('companies', 'list', {
          limit: 200,
          page: 1,
          search,
          sortBy: 'updated_at',
          sortDir: 'desc'
        }, { requireAuth: true });
        rows = rowsFrom(response).map(normalizeCompany).filter(company => getCompanyOptionValue(company) && isSelectableCompany(company));
      } else {
        throw new Error('No Supabase or company API client is available.');
      }

      const selected = selectedId && !rows.some(company => getCompanyOptionValue(company) === selectedId)
        ? await loadCompanySafe(selectedId)
        : null;
      state.companies = mergeCompanyRows(rows, selected);
      return state.companies;
    } catch (error) {
      state.companies = [];
      state.companyLoadError = error;
      console.error('[crm selectors] fresh company options query failed', error);
      throw error;
    }
  }

  async function fetchCompanies(searchText = '', includeSelectedId = null) {
    // Deliberately do not reuse state.companies: dropdowns must see newly-created rows immediately.
    return loadCompanyOptions(searchText, includeSelectedId);
  }

  function dedupeContacts(rows = []) {
    const byId = new Map();
    rows.map(normalizeContact).forEach(contact => {
      const id = str(contact.contact_id || contact.id);
      if (id) byId.set(id, contact);
    });
    return Array.from(byId.values());
  }

  function contactMatchesSelectedCompany(contact = {}, selectedCompanyId = '', loadedCompany = null) {
    const c = normalizeContact(contact);
    const company = loadedCompany ? normalizeCompany(loadedCompany) : {};
    const selectedUuid = str(selectedCompanyId);
    const companyRef = str(company.company_business_id || company.company_ref || company.company_number || company.company_code);
    const companyName = normalizeCompare(company.legal_name || company.company_name || company.name);
    const contactCompanyUuid = str(c.company_uuid || (isUuid(c.company_id) ? c.company_id : ''));
    const contactCompanyRef = str(c.company_business_id || c.company_ref || (!isUuid(c.company_id) ? c.company_id : ''));
    const contactCompanyName = normalizeCompare(c.company_name || c.legal_company_name);
    if (selectedUuid && contactCompanyUuid && contactCompanyUuid === selectedUuid) return true;
    if (companyRef && contactCompanyRef && normalizeCompare(companyRef) === normalizeCompare(contactCompanyRef)) return true;
    if (companyName && contactCompanyName && companyName === contactCompanyName) return true;
    // Rows returned by our loaders are explicitly stamped with selected_company_uuid.
    if (selectedUuid && str(contact.selected_company_uuid || contact.selectedCompanyUuid) === selectedUuid) return true;
    return false;
  }

  async function apiLoadContactsForCompany(selectedCompanyId, loadedCompany = null) {
    const api = global.Api;
    if (!api?.requestWithSession) return [];
    const company = loadedCompany || await loadCompanySafe(selectedCompanyId);
    const companyUuid = str(selectedCompanyId);
    const companyBusinessId = str(company?.company_business_id || company?.company_ref || company?.company_number || company?.company_code || (!isUuid(company?.company_id) ? company?.company_id : ''));
    const companyName = str(company?.legal_name || company?.company_name || company?.name);
    const refKeys = Array.from(new Set([companyUuid, companyBusinessId, company?.company_number, company?.company_code, company?.company_ref]
      .map(str).filter(Boolean)));
    const nameKeys = Array.from(new Set([companyName, company?.legal_name, company?.company_name, company?.name]
      .map(str).filter(Boolean)));
    const rows = [];
    const run = async (label, payload, localFilter = null) => {
      try {
        const response = await api.requestWithSession('contacts', 'list', payload, { requireAuth: true });
        let resultRows = rowsFrom(response);
        if (typeof localFilter === 'function') resultRows = resultRows.filter(localFilter);
        resultRows.forEach(row => rows.push({
          ...row,
          selected_company_uuid: companyUuid,
          selected_company_ref: companyBusinessId,
          selected_company_name: companyName,
          raw_contact: row
        }));
      } catch (error) {
        console.warn('[Contacts] API fallback contact query failed:', label, error);
      }
    };

    for (const key of refKeys) {
      await run(`api_company_id_${key}`, {
        page: 1,
        limit: 500,
        filters: { company_id: key },
        sortBy: 'updated_at',
        sortDir: 'desc'
      });
    }

    for (const name of nameKeys) {
      const normalizedName = normalizeCompare(name);
      await run(`api_company_name_${name}`, {
        page: 1,
        limit: 500,
        search: name,
        sortBy: 'updated_at',
        sortDir: 'desc'
      }, row => {
        const raw = row || {};
        const candidateNames = [raw.company_name, raw.companyName, raw.company_names, raw.companyNames, raw.legal_company_name, raw.legalCompanyName]
          .map(normalizeCompare).filter(Boolean);
        return candidateNames.some(value => value === normalizedName || value.includes(normalizedName) || normalizedName.includes(value));
      });
    }

    return dedupeContacts(rows).filter(contact => contact.contact_id && contactMatchesSelectedCompany(contact, companyUuid, company));
  }

  async function directSupabaseLoadContactsForCompany(selectedCompanyId, loadedCompany = null) {
    const client = global.SupabaseClient?.getClient?.() || global.supabaseClient || global.supabase;
    if (!client?.from) return [];
    const company = loadedCompany || await loadCompanySafe(selectedCompanyId);
    const companyUuid = str(selectedCompanyId);
    const companyBusinessId = str(company?.company_business_id || company?.company_ref || company?.company_number || company?.company_code || (!isUuid(company?.company_id) ? company?.company_id : ''));
    const companyName = str(company?.legal_name || company?.company_name || company?.name);
    const queries = [];
    const addQuery = (label, builder) => queries.push({ label, builder });

    addQuery('company_id_uuid', () => client.from('contacts').select('*').eq('company_id', companyUuid).limit(500));
    if (companyBusinessId) addQuery('company_id_business_ref', () => client.from('contacts').select('*').eq('company_id', companyBusinessId).limit(500));
    if (companyBusinessId) addQuery('company_ids_contains_ref', () => client.from('contacts').select('*').ilike('company_ids', `%${companyBusinessId}%`).limit(500));
    if (companyName) addQuery('company_name_exact', () => client.from('contacts').select('*').eq('company_name', companyName).limit(500));
    if (companyName) addQuery('company_names_contains_name', () => client.from('contacts').select('*').ilike('company_names', `%${companyName}%`).limit(500));

    const rows = [];
    for (const item of queries) {
      try {
        const { data, error } = await item.builder();
        if (error) {
          console.warn('[Contacts] direct Supabase fallback query failed:', item.label, error);
          continue;
        }
        (data || []).forEach(row => rows.push({
          ...row,
          selected_company_uuid: companyUuid,
          selected_company_ref: companyBusinessId,
          selected_company_name: companyName,
          raw_contact: row
        }));
      } catch (error) {
        console.warn('[Contacts] direct Supabase fallback query exception:', item.label, error);
      }
    }
    return dedupeContacts(rows).filter(contact => contact.contact_id && contactMatchesSelectedCompany(contact, companyUuid, company));
  }

  async function fallbackLoadContactsForCompany(selectedCompanyId, loadedCompany = null) {
    const company = loadedCompany || await loadCompanySafe(selectedCompanyId);
    let contacts = await directSupabaseLoadContactsForCompany(selectedCompanyId, company);
    if (!contacts.length) contacts = await apiLoadContactsForCompany(selectedCompanyId, company);
    return contacts;
  }

  async function loadContactsForCompany(companyId) {
    const selectedCompanyId = await resolveCompanyUuid(companyId);
    if (!selectedCompanyId) return [];

    const loadedCompany = await loadCompanySafe(selectedCompanyId);
    const client = global.SupabaseClient?.getClient?.() || global.supabaseClient || global.supabase;
    let rows = [];

    if (client?.rpc) {
      const { data, error } = await client.rpc('crm_get_contacts_for_company', { p_company_id: selectedCompanyId });
      if (error) console.error('[Contacts] RPC failed for company', selectedCompanyId, error);
      else rows = Array.isArray(data) ? data : [];
    } else {
      console.error('[Contacts] Supabase RPC client is unavailable; using direct fallback.');
    }

    let contacts = dedupeContacts(rows.map(row => ({
      ...row,
      id: row.contact_uuid || row.id,
      contact_id: row.contact_uuid || row.contact_id,
      company_id: row.selected_company_uuid || selectedCompanyId,
      company_uuid: row.selected_company_uuid || selectedCompanyId,
      company_ref: row.selected_company_ref || loadedCompany?.company_ref || loadedCompany?.company_business_id,
      company_name: row.selected_company_name || loadedCompany?.legal_name || loadedCompany?.company_name,
      full_name: row.contact_name || row.full_name,
      contact_position: row.contact_position
    }))).filter(contact => contact.contact_id && contact.company_id === selectedCompanyId);

    // Critical safety net: some deployments may not have the newest RPC deployed yet, or old contacts may store Company# refs only.
    // The direct fallback prevents the UI from showing "No contacts found" when the database contains linked contacts.
    if (!contacts.length) {
      contacts = await fallbackLoadContactsForCompany(selectedCompanyId, loadedCompany);
    }

    console.log('[ContactSelect] contacts loaded for company:', selectedCompanyId, contacts);
    return contacts;
  }

  function isDirectCreate(cfg) {
    const form = byId(cfg.formId);
    if (!form) return false;
    const mode = str(form.dataset.mode || (form.dataset.id ? 'edit' : 'create')).toLowerCase();
    if (mode === 'edit' || str(form.dataset.id)) return false;
    const source = str(form.dataset.source || form.dataset.proposalUuid || form.dataset.agreementId || form.dataset.sourceInvoiceUuid);
    if (source && source !== 'direct') return false;
    return !cfg.directSourceIds.some(id => str(byId(id)?.value || byId(id)?.dataset?.leadUuid));
  }

  async function loadCompanyOptionsSafe(searchText = '', includeSelectedId = null) {
    return fetchCompanies(searchText, includeSelectedId);
  }

  async function populateCompanySelect(cfg, searchText = '') {
    const select = byId(cfg.companySelectId);
    if (!select) return;
    const selectedId = str(select.value || byId(cfg.companyHiddenId)?.value);
    select.dataset.companyLoadState = 'loading';
    try {
      const companies = await loadCompanyOptionsSafe(searchText, selectedId);
      setSelectOptions(select, companies, 'Select company', 'company');
      select.dataset.companyLoadState = 'ready';
    } catch (error) {
      select.innerHTML = '<option value="">Unable to load companies — retry</option>';
      select.dataset.companyLoadState = 'error';
      select.title = String(error?.message || 'Unable to load companies');
      throw error;
    }
  }

  async function loadContactsForConfig(cfg, companyId, selectedContactId = '') {
    const contactSelect = byId(cfg.contactSelectId);
    if (!contactSelect) return [];
    if (!companyId) {
      contactSelect.disabled = true;
      contactSelect.innerHTML = '<option value="">Select company first</option>';
      return [];
    }
    contactSelect.disabled = true;
    contactSelect.innerHTML = '<option value="">Loading contacts…</option>';
    const requestCompanyId = await resolveCompanyUuid(companyId) || str(companyId);
    contactSelect.dataset.loadingCompanyId = requestCompanyId;
    const contacts = await loadContactsForCompany(requestCompanyId);
    const currentCompanyId = await resolveCompanyUuid(byId(cfg.companySelectId)?.value || byId(cfg.companyHiddenId)?.value) || str(byId(cfg.companySelectId)?.value || byId(cfg.companyHiddenId)?.value);
    if (contactSelect.dataset.loadingCompanyId !== requestCompanyId || currentCompanyId !== requestCompanyId) return [];
    if (!contacts.length) {
      contactSelect.innerHTML = '<option value="">No contacts found for this company</option>';
      contactSelect.disabled = false;
      return [];
    }
    setSelectOptions(contactSelect, contacts, 'Select contact', 'contact');
    contactSelect.disabled = false;
    if (selectedContactId && [...contactSelect.options].some(opt => opt.value === selectedContactId)) {
      contactSelect.value = selectedContactId;
    }
    return contacts;
  }

  function applyCompany(cfg, company) {
    const c = normalizeCompany(company || {});
    const companyId = getCompanyOptionValue(c);
    const displayName = companyDisplayName(c);
    setValue(cfg.companyHiddenId, companyId, { readonly: false });
    setValue(`${cfg.formId.replace('Form', 'Form')}CompanyName`, c.company_name || displayName, { readonly: false });
    if (cfg.companyFields) {
      setMany(cfg.companyFields.id, companyId);
      setMany(cfg.companyFields.name, displayName);
      setMany(cfg.companyFields.legalName, c.legal_name || c.company_name || displayName);
      setMany(cfg.companyFields.type, c.company_type);
      setMany(cfg.companyFields.industry, c.industry);
      setMany(cfg.companyFields.website, c.website);
      setMany(cfg.companyFields.email, c.main_email);
      setMany(cfg.companyFields.phone, c.main_phone);
      setMany(cfg.companyFields.country, c.country);
      setMany(cfg.companyFields.city, c.city);
      setMany(cfg.companyFields.address, c.address);
      setMany(cfg.companyFields.tax, c.tax_number);
      setMany(cfg.companyFields.status, c.company_status);
    }
    const prefix = cfg.formId.replace('Form', 'Form');
    // Extra common customer/company aliases used by proposal/agreement/invoice/receipt templates.
    ['CustomerName', 'CustomerLegalName'].forEach(suffix => setText(`${prefix}${suffix}`, suffix === 'CustomerLegalName' ? (c.legal_name || displayName) : displayName));
    setText(`${prefix}CustomerAddress`, c.address);
    setText(`${prefix}CustomerOfficialSignatoryName`, c.authorized_signatory_full_name);
    setText(`${prefix}CustomerOfficialSignatoryTitle`, c.authorized_signatory_title);
    if (cfg.formId !== 'proposalForm' || !str(byId(cfg.contactHiddenId)?.value || byId(cfg.formId)?.dataset?.contactId)) {
      const signatoryNameField = byId(`${prefix}CustomerSignatoryName`);
      const signatoryTitleField = byId(`${prefix}CustomerSignatoryTitle`);
      if (cfg.formId !== 'proposalForm' || !str(signatoryNameField?.value)) setText(`${prefix}CustomerSignatoryName`, c.authorized_signatory_full_name);
      if (cfg.formId !== 'proposalForm' || !str(signatoryTitleField?.value)) setText(`${prefix}CustomerSignatoryTitle`, c.authorized_signatory_title);
    }
    setText(`${prefix}CompanyName`, c.company_name || displayName);
    setText(`${prefix}CompanyEmail`, c.main_email);
    setText(`${prefix}CompanyPhone`, c.main_phone);
    setText(`${prefix}Country`, c.country);
    setText(`${prefix}City`, c.city);
    setText(`${prefix}TaxNumber`, c.tax_number);
    const currencyField = byId(`${prefix}Currency`);
    if (currencyField && c.currency && !str(currencyField.value)) currencyField.value = c.currency;
    const paymentTermField = byId(`${prefix}PaymentTerm`);
    if (paymentTermField && c.payment_term && !str(paymentTermField.value)) paymentTermField.value = c.payment_term;
    cfg.updateModule?.(c, null);
    byId(cfg.formId)?.dispatchEvent?.(new CustomEvent('crm-company-selected', { bubbles: true, detail: { company: c } }));
  }

  function applyContact(cfg, contact) {
    const c = normalizeContact(contact || {});
    const displayName = displayContact(c, { includeEmail: false });
    const phone = contactPhone(c);
    setValue(cfg.contactHiddenId, c.contact_id || '', { readonly: false });
    const prefix = cfg.formId.replace('Form', 'Form');
    setValue(`${prefix}ContactName`, displayName, { readonly: false });
    setValue(`${prefix}ContactEmail`, c.email, { readonly: false });
    setValue(`${prefix}ContactPhone`, phone, { readonly: false });
    setValue(`${prefix}ContactMobile`, c.mobile, { readonly: false });
    if (cfg.contactFields) {
      setMany(cfg.contactFields.id, c.contact_id);
      setMany(cfg.contactFields.firstName, c.first_name);
      setMany(cfg.contactFields.lastName, c.last_name);
      setMany(cfg.contactFields.fullName, displayName);
      setMany(cfg.contactFields.jobTitle, c.job_title);
      setMany(cfg.contactFields.department, c.department);
      setMany(cfg.contactFields.email, c.email);
      setMany(cfg.contactFields.phone, phone);
      setMany(cfg.contactFields.mobile, c.mobile || c.phone);
      setMany(cfg.contactFields.decisionRole, c.decision_role);
      setMany(cfg.contactFields.primary, c.is_primary_contact ? 'Yes' : 'No');
      setMany(cfg.contactFields.status, c.contact_status);
    }
    // Extra common customer/contact/signatory aliases used by downstream forms.
    setText(`${prefix}CustomerContactName`, displayName);
    if (cfg.formId !== 'proposalForm') setText(`${prefix}CustomerSignatoryName`, displayName);
    ['CustomerContactEmail', 'CustomerSignatoryEmail'].forEach(suffix => setText(`${prefix}${suffix}`, c.email));
    ['CustomerContactPhone', 'CustomerSignatoryPhone'].forEach(suffix => setText(`${prefix}${suffix}`, phone));
    setText(`${prefix}CustomerContactMobile`, c.mobile || c.phone);
    if (cfg.formId !== 'proposalForm') setText(`${prefix}CustomerSignatoryTitle`, c.contact_position || c.job_title);
    cfg.updateModule?.(null, c);
    if (cfg.formId === 'proposalForm') global.Proposals?.applyProposalContactSignatory?.(c, { contactChanged: true });
    byId(cfg.formId)?.dispatchEvent?.(new CustomEvent('crm-contact-selected', { bubbles: true, detail: { contact: c } }));
  }

  function syncExistingValues(cfg) {
    const form = byId(cfg.formId);
    const companySelect = byId(cfg.companySelectId);
    const contactSelect = byId(cfg.contactSelectId);
    if (!form || !companySelect || !contactSelect) return;
    const currentCompanyId = str(byId(cfg.companyHiddenId)?.value || form.dataset.companyId || companySelect.value);
    const currentContactId = str(byId(cfg.contactHiddenId)?.value || form.dataset.contactId || contactSelect.value);
    const matchedCompany = findCompanyByAnyId(currentCompanyId);
    const matchedCompanyValue = matchedCompany ? getCompanyOptionValue(matchedCompany) : '';
    if (matchedCompanyValue && [...companySelect.options].some(opt => opt.value === matchedCompanyValue)) {
      companySelect.value = matchedCompanyValue;
    } else if (!currentCompanyId || ![...companySelect.options].some(opt => opt.value === currentCompanyId)) {
      // Never keep a stale company selection from a previously opened agreement.
      // This was causing many agreements to display the first/previous company.
      companySelect.value = '';
    } else {
      companySelect.value = currentCompanyId;
    }
    const contactCompanyKey = matchedCompanyValue || currentCompanyId;
    if (contactCompanyKey) loadContactsForConfig(cfg, contactCompanyKey, currentContactId);
    const direct = isDirectCreate(cfg);
    companySelect.disabled = !direct && currentCompanyId ? true : false;
    contactSelect.disabled = !contactCompanyKey || (!direct && currentContactId ? true : contactSelect.disabled);
    companySelect.classList.remove('readonly-field', 'locked-field');
    contactSelect.classList.remove('readonly-field', 'locked-field');
  }

  function bindConfig(cfg) {
    const companySelect = byId(cfg.companySelectId);
    const contactSelect = byId(cfg.contactSelectId);
    if (!companySelect || !contactSelect || companySelect.dataset.crmSelectorBound === 'true') return;
    companySelect.dataset.crmSelectorBound = 'true';
    contactSelect.dataset.crmSelectorBound = 'true';

    companySelect.addEventListener('focus', () => populateCompanySelect(cfg).catch(() => {}));
    companySelect.addEventListener('change', async () => {
      const selectedCompanyId = str(companySelect.value);
      console.log('[CompanySelect] selected company id:', selectedCompanyId);
      const company = findCompanyByAnyId(selectedCompanyId) || null;
      if (cfg.uuidSourceOfTruth === true) {
        try {
          await global.Proposals?.hydrateCreateCustomerByUuid?.(selectedCompanyId, '', 'dropdown');
        } catch (error) {
          companySelect.value = '';
          global.UI?.toast?.(error?.message || 'Selected company data mismatch. Please reselect the company.');
          return;
        }
      } else if (company) applyCompany(cfg, company);
      setValue(cfg.contactHiddenId, '', { readonly: false });
      ['ContactName', 'ContactEmail', 'ContactPhone', 'ContactMobile', 'CustomerContactName', 'CustomerContactEmail', 'CustomerContactPhone', 'CustomerContactMobile', 'CustomerSignatoryName', 'CustomerSignatoryTitle', 'CustomerSignatoryEmail', 'CustomerSignatoryPhone']
        .filter(suffix => cfg.formId !== 'proposalForm' || !['CustomerSignatoryName', 'CustomerSignatoryTitle'].includes(suffix))
        .forEach(suffix => setText(`${cfg.formId.replace('Form', 'Form')}${suffix}`, ''));
      cfg.updateModule?.(null, { contact_id: '' });
      contactSelect.value = '';
      contactSelect.innerHTML = selectedCompanyId ? '<option value="">Loading contacts…</option>' : '<option value="">Select company first</option>';
      await loadContactsForConfig(cfg, selectedCompanyId);
      if (isDirectCreate(cfg)) {
        companySelect.disabled = false;
        contactSelect.disabled = !selectedCompanyId;
      }
    });

    contactSelect.addEventListener('change', async () => {
      const companyId = str(companySelect.value);
      const contactId = str(contactSelect.value);
      const contacts = await loadContactsForCompany(companyId);
      if (str(companySelect.value) !== companyId || str(contactSelect.value) !== contactId) return;
      const contact = contacts.find(c => c.contact_id === contactId) || null;
      if (cfg.uuidSourceOfTruth === true) {
        try {
          await global.Proposals?.hydrateCreateCustomerByUuid?.(companyId, contactId, 'dropdown');
        } catch (error) {
          contactSelect.value = '';
          global.UI?.toast?.(error?.message || 'Selected contact data mismatch. Please reselect the contact.');
          return;
        }
      } else if (contact) applyContact(cfg, contact);
      if (isDirectCreate(cfg)) {
        companySelect.disabled = false;
        contactSelect.disabled = !companyId;
      }
    });
  }



  function initializeCompanyContactSelectorsForForm(formKey) {
    const cfg = FORM_CONFIG[formKey];
    if (!cfg) return Promise.resolve();
    return populateCompanySelect(cfg).then(() => {
      bindConfig(cfg);
      syncExistingValues(cfg);
    });
  }


  async function refreshAfterCompanySave(savedCompany = {}) {
    const company = normalizeCompany(savedCompany);
    const companyId = getCompanyOptionValue(company);
    state.companies = [];
    state.loadingCompanies = null;
    let freshRows = [];
    try {
      freshRows = await loadCompanyOptions('', companyId);
    } catch (error) {
      // The visible error is rendered below; keep only the just-created response, never stale options.
      console.error('[crm selectors] company refresh after save failed', error);
    }
    state.companies = mergeCompanyRows(freshRows, companyId ? company : null);
    Object.values(FORM_CONFIG).forEach(cfg => {
      const select = byId(cfg.companySelectId);
      if (!select) return;
      if (!state.companies.length) {
        select.innerHTML = '<option value="">Unable to load companies — retry</option>';
        select.dataset.companyLoadState = 'error';
        return;
      }
      setSelectOptions(select, state.companies, 'Select company', 'company');
      const form = byId(cfg.formId);
      const modal = byId(cfg.formId.replace('Form', 'FormModal'));
      const isVisible = form && (!modal || modal.getAttribute('aria-hidden') !== 'true');
      if (companyId && isVisible && [...select.options].some(option => option.value === companyId)) {
        select.value = companyId;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    return state.companies;
  }

  async function loadContactByUuid(contactUuid) {
    const id = str(contactUuid);
    if (!id) return null;
    const client = global.SupabaseClient?.getClient?.() || global.supabaseClient || global.supabase;
    if (!client?.from) throw new Error('Supabase client is unavailable.');
    const { data, error } = await client.from('contacts').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? normalizeContact(data) : null;
  }

  async function validateCompanyContactSelection({ companyId, contactId = '', moduleName = 'record' } = {}) {
    const companyKey = str(companyId);
    const selectedContactId = str(contactId);
    if (!companyKey) throw new Error('Please select a company.');
    const selectedCompanyId = await resolveCompanyUuid(companyKey);
    if (!selectedCompanyId) throw new Error('Selected company could not be resolved. Please reselect the company.');
    const loadedCompany = await loadCompanySafe(selectedCompanyId);
    if (!loadedCompany || loadedCompany.id !== selectedCompanyId) {
      throw new Error('Selected company could not be resolved. Please reselect the company.');
    }
    let loadedContact = null;
    if (selectedContactId) {
      loadedContact = await loadContactByUuid(selectedContactId);
      const contactCompanyId = loadedContact ? await resolveCompanyUuid(loadedContact.company_id || loadedContact.company_uuid) : null;
      if (!loadedContact || loadedContact.id !== selectedContactId || contactCompanyId !== selectedCompanyId) {
        throw new Error('Selected contact does not belong to the selected company.');
      }
      loadedContact.company_id = selectedCompanyId;
    }
    console.log('[SAVE CHECK] module:', moduleName);
    console.log('[SAVE CHECK] form.company_id:', selectedCompanyId);
    console.log('[SAVE CHECK] selectedCompanyId:', selectedCompanyId);
    console.log('[SAVE CHECK] loadedCompany:', loadedCompany);
    console.log('[SAVE CHECK] form.contact_id:', selectedContactId);
    console.log('[SAVE CHECK] loadedContact:', loadedContact);
    return { resolvedCompanyId: selectedCompanyId, loadedCompany, loadedContact };
  }

  function applyLoadedCompanySnapshot(payload = {}, loadedCompany = {}, loadedContact = null) {
    const companyName = str(loadedCompany.legal_name || loadedCompany.company_name || loadedCompany.name);
    const address = str(loadedCompany.address);
    const email = str(loadedCompany.main_email || loadedCompany.email);
    const phone = str(loadedCompany.main_phone || loadedCompany.phone);
    const next = {
      ...payload,
      company_id: str(loadedCompany.id),
      customer_name: companyName,
      client_name: companyName,
      company_name: companyName,
      customer_address: address,
      customer_email: email,
      customer_phone: phone,
      customer_signatory_name: str(loadedCompany.authorized_signatory_full_name || loadedCompany.authorized_signatory_name),
      customer_signatory_title: str(loadedCompany.authorized_signatory_title)
    };
    if (loadedContact) next.contact_id = str(loadedContact.id);
    return next;
  }

  async function refreshAll() {
    state.companies = [];
    state.loadingCompanies = null;
    state.companyLoadError = null;
    await Promise.all(Object.values(FORM_CONFIG).map(cfg => populateCompanySelect(cfg)));
    Object.values(FORM_CONFIG).forEach(cfg => {
      bindConfig(cfg);
      syncExistingValues(cfg);
    });
  }

  function observeModals() {
    const observer = new MutationObserver(() => {
      Object.values(FORM_CONFIG).forEach(cfg => syncExistingValues(cfg));
    });
    Object.values(FORM_CONFIG).forEach(cfg => {
      const modal = byId(cfg.formId.replace('Form', 'FormModal'));
      if (modal) observer.observe(modal, { attributes: true, attributeFilter: ['class', 'style', 'aria-hidden'] });
      const form = byId(cfg.formId);
      if (form) observer.observe(form, { attributes: true, attributeFilter: ['data-mode', 'data-id', 'data-source', 'data-proposal-uuid', 'data-agreement-id', 'data-source-invoice-uuid'] });
    });
  }

  async function init() {
    if (state.initialized) return;
    state.initialized = true;
    await refreshAll();
    observeModals();
    ['dealsCreateBtn','proposalsCreateBtn','agreementsCreateBtn','invoicesCreateBtn','receiptsCreateBtn'].forEach(id => {
      const btn = byId(id);
      if (btn) btn.addEventListener('click', () => global.setTimeout(() => refreshAll().catch(() => {}), 100));
    });
    global.addEventListener('focus', () => refreshAll().catch(() => {}));
  }

  global.CrmCompanyContactSelectors = {
    init,
    refresh: refreshAll,
    initializeCompanyContactSelectorsForDeal: () => initializeCompanyContactSelectorsForForm('deal'),
    initializeCompanyContactSelectorsForProposal: () => initializeCompanyContactSelectorsForForm('proposal'),
    initializeCompanyContactSelectorsForAgreement: () => initializeCompanyContactSelectorsForForm('agreement'),
    initializeCompanyContactSelectorsForInvoice: () => initializeCompanyContactSelectorsForForm('invoice'),
    initializeCompanyContactSelectorsForReceipt: () => initializeCompanyContactSelectorsForForm('receipt'),
    loadCompanies: loadCompanyOptionsSafe,
    loadCompanyOptions,
    resolveCompanyUuid,
    loadCompanySafe,
    loadCompanyByUuid: fetchCompanyByUuid,
    loadContactByUuid,
    validateCompanyContactSelection,
    applyLoadedCompanySnapshot,
    invalidateCompanies() { state.companies = []; state.loadingCompanies = null; state.companyLoadError = null; },
    refreshAfterCompanySave,
    loadContactsForCompany,
    applyCompanyToForm(formKey, company) { const cfg = FORM_CONFIG[formKey]; if (cfg) applyCompany(cfg, company); },
    applyContactToForm(formKey, contact) { const cfg = FORM_CONFIG[formKey]; if (cfg) applyContact(cfg, contact); }
  };

  // Patch immediately so ui.js captures real select elements instead of legacy readonly inputs.
  // Full loading/binding waits until all modules are available.
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', () => init().catch(error => console.warn('[crm selectors] init failed', error)));
  } else {
    global.setTimeout(() => init().catch(error => console.warn('[crm selectors] init failed', error)), 0);
  }
})(window);
