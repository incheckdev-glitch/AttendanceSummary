(function initCrmCompanyContactSelectors(global) {
  const doc = global.document;
  if (!doc) return;

  const state = {
    companies: [],
    contactsByCompany: new Map(),
    loadingCompanies: null,
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
      companyFields: {
        name: ['proposalFormCustomerName'],
        address: ['proposalFormCustomerAddress']
      },
      contactFields: {
        fullName: ['proposalFormCustomerContactName', 'proposalFormCustomerSignatoryName'],
        mobile: ['proposalFormCustomerContactMobile'],
        email: ['proposalFormCustomerContactEmail'],
        jobTitle: ['proposalFormCustomerSignatoryTitle']
      },
      updateModule(company, contact) {
        const form = byId('proposalForm');
        if (!form) return;
        if (company) {
          form.dataset.companyId = company.company_id || '';
          form.dataset.companyName = company.company_name || '';
          form.dataset.companyAddress = company.address || '';
        }
        if (contact) {
          form.dataset.contactId = contact.contact_id || '';
          form.dataset.contactName = displayContact(contact);
          form.dataset.contactFirstName = contact.first_name || '';
          form.dataset.contactLastName = contact.last_name || '';
          form.dataset.contactJobTitle = contact.job_title || '';
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
        address: ['agreementFormCustomerAddress'],
        email: ['agreementFormCompanyEmail'],
        phone: ['agreementFormCompanyPhone'],
        country: ['agreementFormCountry'],
        city: ['agreementFormCity'],
        tax: ['agreementFormTaxNumber']
      },
      contactFields: {
        fullName: ['agreementFormCustomerContactName', 'agreementFormContactName', 'agreementFormCustomerSignatoryName'],
        email: ['agreementFormCustomerContactEmail', 'agreementFormContactEmail', 'agreementFormCustomerSignatoryEmail'],
        phone: ['agreementFormCustomerContactPhone', 'agreementFormContactPhone', 'agreementFormCustomerSignatoryPhone'],
        mobile: ['agreementFormCustomerContactMobile', 'agreementFormContactMobile'],
        jobTitle: ['agreementFormCustomerSignatoryTitle']
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
        address: ['invoiceFormCustomerAddress']
      },
      contactFields: {
        fullName: ['invoiceFormCustomerContactName', 'invoiceFormContactName'],
        email: ['invoiceFormCustomerContactEmail', 'invoiceFormContactEmail'],
        phone: ['invoiceFormContactPhone'],
        mobile: ['invoiceFormContactMobile']
      },
      updateModule(company, contact) {
        if (!global.Invoices?.state) return;
        if (company) global.Invoices.state.selectedCompany = company;
        if (contact) global.Invoices.state.selectedContact = contact;
      }
    },
    receipt: {
      formId: 'receiptForm',
      companySelectId: 'receiptFormCompanySelector',
      contactSelectId: 'receiptFormContactSelector',
      companyHiddenId: 'receiptFormCompanyId',
      contactHiddenId: 'receiptFormContactId',
      directSourceIds: ['receiptFormInvoiceId', 'receiptFormInvoiceNumber'],
      companyFields: {
        name: ['receiptFormCustomerName', 'receiptFormCustomerLegalName', 'receiptFormCompanyName'],
        address: ['receiptFormCustomerAddress']
      },
      contactFields: {
        fullName: ['receiptFormContactName'],
        email: ['receiptFormContactEmail'],
        phone: ['receiptFormContactPhone'],
        mobile: ['receiptFormContactMobile']
      },
      updateModule(company, contact) {
        const form = byId('receiptForm');
        if (!form) return;
        if (company) {
          form.dataset.companyId = company.company_id || '';
          form.dataset.companyName = company.company_name || '';
        }
        if (contact) {
          form.dataset.contactId = contact.contact_id || '';
          form.dataset.contactName = displayContact(contact);
          form.dataset.contactEmail = contact.email || '';
          form.dataset.contactPhone = contact.phone || '';
          form.dataset.contactMobile = contact.mobile || '';
        }
      }
    }
  };

  function byId(id) { return id ? doc.getElementById(id) : null; }
  function str(value) { return String(value ?? '').trim(); }
  function rowsFrom(response) {
    const rows = response?.rows || response?.items || response?.data || response?.result || response;
    return Array.isArray(rows) ? rows : [];
  }
  function normalizeCompany(raw = {}) {
    const c = raw && typeof raw === 'object' ? raw : {};
    return {
      id: str(c.id),
      company_id: str(c.company_id || c.companyId),
      company_name: str(c.company_name || c.companyName || c.name),
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
      company_status: str(c.company_status || c.companyStatus),
      currency: str(c.currency),
      payment_term: str(c.payment_term || c.paymentTerm || c.payment_terms || c.paymentTerms)
    };
  }
  function normalizeContact(raw = {}) {
    const c = raw && typeof raw === 'object' ? raw : {};
    const first = str(c.first_name || c.firstName);
    const last = str(c.last_name || c.lastName);
    const full = str(c.full_name || c.fullName || c.contact_name || c.contactName || `${first} ${last}`);
    return {
      id: str(c.id),
      contact_id: str(c.contact_id || c.contactId),
      company_id: str(c.company_id || c.companyId),
      company_name: str(c.company_name || c.companyName),
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
  function displayContact(contact = {}) {
    return str(contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}` || contact.email || contact.contact_id || 'Unnamed contact');
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
  function setSelectOptions(select, rows, placeholder) {
    if (!select) return;
    const currentValue = str(select.value);
    const options = [`<option value="">${escapeHtml(placeholder)}</option>`];
    rows.forEach(row => {
      const value = row.company_id || row.contact_id || row.id || '';
      if (!value) return;
      const label = row.company_id !== undefined
        ? `${displayCompany(row)}${row.company_id ? ` (${row.company_id})` : ''}`
        : `${displayContact(row)}${row.email ? ` — ${row.email}` : ''}`;
      options.push(`<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`);
    });
    select.innerHTML = options.join('');
    if (currentValue && [...select.options].some(opt => opt.value === currentValue)) select.value = currentValue;
  }
  function escapeHtml(value) {
    return str(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  }
  function escapeAttr(value) { return escapeHtml(value).replace(/'/g, '&#39;'); }

  async function fetchCompanies() {
    if (state.companies.length) return state.companies;
    if (state.loadingCompanies) return state.loadingCompanies;
    state.loadingCompanies = (async () => {
      try {
        if (global.Api?.requestWithSession) {
          const response = await global.Api.requestWithSession('companies', 'list', { limit: 200, page: 1, sort_by: 'company_name', sort_dir: 'asc' }, { requireAuth: true });
          state.companies = rowsFrom(response).map(normalizeCompany).filter(c => c.company_id);
          return state.companies;
        }
      } catch (error) {
        console.warn('[crm selectors] company API load failed', error);
      }
      try {
        const client = global.supabaseClient || global.supabase;
        if (client?.from) {
          const { data, error } = await client.from('companies').select('*').order('company_name', { ascending: true }).limit(200);
          if (error) throw error;
          state.companies = (data || []).map(normalizeCompany).filter(c => c.company_id);
        }
      } catch (error) {
        console.warn('[crm selectors] company Supabase load failed', error);
      }
      return state.companies;
    })().finally(() => {
      state.loadingCompanies = null;
    });
    return state.loadingCompanies;
  }

  async function fetchContacts(companyId) {
    const key = str(companyId);
    if (!key) return [];
    if (state.contactsByCompany.has(key)) return state.contactsByCompany.get(key);
    let contacts = [];
    try {
      if (global.Api?.requestWithSession) {
        const response = await global.Api.requestWithSession('contacts', 'list', { filters: { company_id: key }, limit: 200, page: 1, sort_by: 'first_name', sort_dir: 'asc' }, { requireAuth: true });
        contacts = rowsFrom(response).map(normalizeContact).filter(c => c.contact_id);
      }
    } catch (error) {
      console.warn('[crm selectors] contacts API load failed', error);
    }
    if (!contacts.length) {
      try {
        const client = global.supabaseClient || global.supabase;
        if (client?.from) {
          const { data, error } = await client.from('contacts').select('*').eq('company_id', key).order('first_name', { ascending: true }).limit(200);
          if (error) throw error;
          contacts = (data || []).map(normalizeContact).filter(c => c.contact_id);
        }
      } catch (error) {
        console.warn('[crm selectors] contacts Supabase load failed', error);
      }
    }
    state.contactsByCompany.set(key, contacts);
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

  async function populateCompanySelect(cfg) {
    const select = byId(cfg.companySelectId);
    if (!select) return;
    const companies = await fetchCompanies();
    setSelectOptions(select, companies, 'Select company');
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
    const contacts = await fetchContacts(companyId);
    if (!contacts.length) {
      contactSelect.innerHTML = '<option value="">No contacts found for this company</option>';
      contactSelect.disabled = false;
      return [];
    }
    setSelectOptions(contactSelect, contacts, 'Select contact');
    contactSelect.disabled = false;
    if (selectedContactId && [...contactSelect.options].some(opt => opt.value === selectedContactId)) {
      contactSelect.value = selectedContactId;
    }
    return contacts;
  }

  function applyCompany(cfg, company) {
    const c = normalizeCompany(company || {});
    const companyId = c.company_id || '';
    setValue(cfg.companyHiddenId, companyId, { readonly: false });
    setValue(`${cfg.formId.replace('Form', 'Form')}CompanyName`, c.company_name, { readonly: false });
    if (cfg.companyFields) {
      setMany(cfg.companyFields.id, c.company_id);
      setMany(cfg.companyFields.name, displayCompany(c));
      setMany(cfg.companyFields.legalName, c.legal_name || c.company_name);
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
    const currencyField = byId(`${cfg.formId.replace('Form', 'Form')}Currency`);
    if (currencyField && c.currency && !str(currencyField.value)) currencyField.value = c.currency;
    const paymentTermField = byId(`${cfg.formId.replace('Form', 'Form')}PaymentTerm`);
    if (paymentTermField && c.payment_term && !str(paymentTermField.value)) paymentTermField.value = c.payment_term;
    cfg.updateModule?.(c, null);
  }

  function applyContact(cfg, contact) {
    const c = normalizeContact(contact || {});
    setValue(cfg.contactHiddenId, c.contact_id || '', { readonly: false });
    setValue(`${cfg.formId.replace('Form', 'Form')}ContactName`, displayContact(c), { readonly: false });
    setValue(`${cfg.formId.replace('Form', 'Form')}ContactEmail`, c.email, { readonly: false });
    setValue(`${cfg.formId.replace('Form', 'Form')}ContactPhone`, c.phone, { readonly: false });
    setValue(`${cfg.formId.replace('Form', 'Form')}ContactMobile`, c.mobile, { readonly: false });
    if (cfg.contactFields) {
      setMany(cfg.contactFields.id, c.contact_id);
      setMany(cfg.contactFields.firstName, c.first_name);
      setMany(cfg.contactFields.lastName, c.last_name);
      setMany(cfg.contactFields.fullName, displayContact(c));
      setMany(cfg.contactFields.jobTitle, c.job_title);
      setMany(cfg.contactFields.department, c.department);
      setMany(cfg.contactFields.email, c.email);
      setMany(cfg.contactFields.phone, c.phone || c.mobile);
      setMany(cfg.contactFields.mobile, c.mobile);
      setMany(cfg.contactFields.decisionRole, c.decision_role);
      setMany(cfg.contactFields.primary, c.is_primary_contact ? 'Yes' : 'No');
      setMany(cfg.contactFields.status, c.contact_status);
    }
    cfg.updateModule?.(null, c);
  }

  function syncExistingValues(cfg) {
    const form = byId(cfg.formId);
    const companySelect = byId(cfg.companySelectId);
    const contactSelect = byId(cfg.contactSelectId);
    if (!form || !companySelect || !contactSelect) return;
    const currentCompanyId = str(byId(cfg.companyHiddenId)?.value || form.dataset.companyId || companySelect.value);
    const currentContactId = str(byId(cfg.contactHiddenId)?.value || form.dataset.contactId || contactSelect.value);
    if (currentCompanyId && [...companySelect.options].some(opt => opt.value === currentCompanyId)) companySelect.value = currentCompanyId;
    if (currentCompanyId) loadContactsForConfig(cfg, currentCompanyId, currentContactId);
    const direct = isDirectCreate(cfg);
    companySelect.disabled = !direct && currentCompanyId ? true : false;
    contactSelect.disabled = !currentCompanyId || (!direct && currentContactId ? true : contactSelect.disabled);
    companySelect.classList.remove('readonly-field', 'locked-field');
    contactSelect.classList.remove('readonly-field', 'locked-field');
  }

  function bindConfig(cfg) {
    const companySelect = byId(cfg.companySelectId);
    const contactSelect = byId(cfg.contactSelectId);
    if (!companySelect || !contactSelect || companySelect.dataset.crmSelectorBound === 'true') return;
    companySelect.dataset.crmSelectorBound = 'true';
    contactSelect.dataset.crmSelectorBound = 'true';

    companySelect.addEventListener('change', async () => {
      const companyId = str(companySelect.value);
      const company = state.companies.find(c => c.company_id === companyId) || null;
      if (company) applyCompany(cfg, company);
      setValue(cfg.contactHiddenId, '', { readonly: false });
      contactSelect.value = '';
      await loadContactsForConfig(cfg, companyId);
      if (isDirectCreate(cfg)) {
        companySelect.disabled = false;
        contactSelect.disabled = !companyId;
      }
    });

    contactSelect.addEventListener('change', async () => {
      const companyId = str(companySelect.value);
      const contactId = str(contactSelect.value);
      const contacts = await fetchContacts(companyId);
      const contact = contacts.find(c => c.contact_id === contactId) || null;
      if (contact) applyContact(cfg, contact);
      if (isDirectCreate(cfg)) {
        companySelect.disabled = false;
        contactSelect.disabled = !companyId;
      }
    });
  }

  async function refreshAll() {
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
    loadCompanies: fetchCompanies,
    loadContactsForCompany: fetchContacts,
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
