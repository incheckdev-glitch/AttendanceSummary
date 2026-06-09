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
          form.dataset.contactJobTitle = contact.position || contact.job_title || contact.title || '';
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
          form.dataset.contactJobTitle = contact.position || contact.job_title || contact.title || '';
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
  function rowsFrom(response) {
    const rows = response?.rows || response?.items || response?.data || response?.result || response;
    return Array.isArray(rows) ? rows : [];
  }
  function normalizeCompany(raw = {}) {
    const c = raw && typeof raw === 'object' ? raw : {};
    const uuid = str(c.id);
    const businessId = str(c.company_id || c.companyId);
    const canonicalId = uuid || businessId;
    return {
      id: uuid,
      company_id: canonicalId,
      company_uuid: uuid,
      company_business_id: businessId,
      company_number: str(c.company_number || c.companyNumber),
      company_code: str(c.company_code || c.companyCode),
      company_name: str(c.company_name || c.companyName || c.name),
      name: str(c.name),
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
    const first = str(c.first_name || c.firstName);
    const last = str(c.last_name || c.lastName);
    const full = str(c.full_name || c.fullName || c.contact_name || c.contactName || c.name || `${first} ${last}`);
    return {
      id: str(c.id),
      contact_id: str(c.id || c.contact_id || c.contactId),
      company_id: str(c.company_id || c.companyId),
      company_uuid: str(c.company_uuid || c.companyUuid),
      company_name: str(c.company_name || c.companyName),
      legal_company_name: str(c.legal_company_name || c.legalCompanyName),
      first_name: first,
      last_name: last,
      full_name: full,
      job_title: str(c.job_title || c.jobTitle || c.position || c.role),
      department: str(c.department),
      email: str(c.email),
      phone: str(c.phone),
      mobile: str(c.mobile),
      decision_role: str(c.decision_role || c.decisionRole),
      is_primary_contact: c.is_primary_contact === true || c.isPrimaryContact === true || String(c.is_primary_contact || c.isPrimaryContact || '').toLowerCase() === 'true',
      contact_status: str(c.contact_status || c.contactStatus)
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

  async function fetchCompanyByUuid(companyId) {
    const id = str(companyId);
    if (!id) return null;
    const client = global.supabaseClient || global.supabase;
    if (client?.from) {
      const { data, error } = await client.from('companies').select('*').eq('id', id).maybeSingle();
      if (error) {
        console.error('[crm selectors] selected company UUID query failed', error);
        throw error;
      }
      return data ? normalizeCompany(data) : null;
    }
    if (global.Api?.requestWithSession) {
      const response = await global.Api.requestWithSession('companies', 'get', { id }, { requireAuth: true });
      const row = response?.row || response?.data || response?.company || response;
      return row && typeof row === 'object' ? normalizeCompany(row) : null;
    }
    return null;
  }

  async function loadCompanyOptions(searchText = '', includeSelectedId = null) {
    const search = str(searchText);
    const selectedId = str(includeSelectedId);
    const client = global.supabaseClient || global.supabase;
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
        ? await fetchCompanyByUuid(selectedId)
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

  async function loadContactsForCompany(companyId) {
    const selectedCompanyId = str(companyId);
    if (!selectedCompanyId) return [];

    const client = global.supabaseClient || global.supabase;
    if (!client?.from) {
      console.error('[Contacts] Failed to load contacts for company', selectedCompanyId, new Error('Supabase client is unavailable.'));
      return [];
    }

    const { data, error } = await client
      .from('contacts')
      .select('*')
      .eq('company_id', selectedCompanyId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[Contacts] Failed to load contacts for company', selectedCompanyId, error);
      return [];
    }

    const contacts = (data || []).map(normalizeContact).filter(contact => contact.contact_id);
    console.log('[ContactSelect] contacts loaded:', contacts);
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
    const requestCompanyId = str(companyId);
    contactSelect.dataset.loadingCompanyId = requestCompanyId;
    const contacts = await loadContactsForCompany(requestCompanyId);
    if (contactSelect.dataset.loadingCompanyId !== requestCompanyId || str(byId(cfg.companySelectId)?.value) !== requestCompanyId) return [];
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
    if (cfg.formId !== 'proposalForm') setText(`${prefix}CustomerSignatoryTitle`, c.position || c.job_title || c.title);
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
    loadCompanyByUuid: fetchCompanyByUuid,
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
