/* InCheck360 Agreement Annex Flow
 * Adds a controlled "Annex - Additional Location" workflow to signed agreements.
 * The original signed agreement remains unchanged. The annex is saved as a linked
 * agreement row and can use the existing signing, signed-document and invoice flow.
 */
(function agreementAnnexModule() {
  'use strict';

  const RELATIONSHIP_FIELDS = [
    'parent_agreement_id',
    'root_agreement_id',
    'source_agreement_id',
    'agreement_relationship_type',
    'agreement_version',
    'relationship_notes'
  ];

  const state = {
    currentParent: null,
    currentReference: '',
    currentSequence: 1,
    annualTemplate: null,
    setupTemplate: null,
    loadingParentId: '',
    listRequestToken: 0
  };

  function esc(value) {
    if (window.U?.escapeHtml) return window.U.escapeHtml(String(value ?? ''));
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function attr(value) {
    if (window.U?.escapeAttr) return window.U.escapeAttr(String(value ?? ''));
    return esc(value);
  }

  function toast(message) {
    if (window.UI?.toast) window.UI.toast(message);
    else window.alert(message);
  }

  function normalize(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
  }

  function getClient() {
    return window.SupabaseClient?.getClient?.() || window.supabaseClient || window.supabase || null;
  }

  function agreements() {
    return window.Agreements || null;
  }

  function currentUserId() {
    const session = window.Session || {};
    const user = typeof session.user === 'function' ? session.user() : {};
    const auth = typeof session.authContext === 'function' ? session.authContext() : {};
    const profile = session.state?.profile || user.profile || auth.profile || {};
    return String(user.id || user.user_id || auth.user?.id || profile.auth_user_id || profile.user_id || profile.id || '').trim();
  }

  function currentUserLabel() {
    const session = window.Session || {};
    const user = typeof session.user === 'function' ? session.user() : {};
    const profile = session.state?.profile || user.profile || {};
    return String(profile.full_name || profile.name || user.full_name || user.name || user.email || profile.email || '').trim();
  }

  function agreementId(record = {}) {
    return String(record.id || record.agreement_uuid || record.uuid || '').trim();
  }

  function agreementRef(record = {}) {
    return String(record.agreement_number || record.agreement_id || record.id || '').trim();
  }

  function relationshipType(record = {}) {
    return normalize(record.agreement_relationship_type || record.relationship_type || 'original') || 'original';
  }

  function isSigned(record = {}) {
    const module = agreements();
    if (typeof module?.isAgreementLockedAsSigned === 'function') {
      try {
        if (module.isAgreementLockedAsSigned(record)) return true;
      } catch (_) {}
    }
    const status = normalize(record.status || record.agreement_status);
    if (status === 'signed' || status.endsWith('_signed') || status.startsWith('signed_')) return true;
    return Boolean(
      record.signed_document_path || record.signed_agreement_document_path ||
      record.signed_document_uploaded_at || record.signed_agreement_document_uploaded_at ||
      record.customer_official_sign_date || record.customer_sign_date || record.signed_date
    );
  }

  function canAdminInvoiceUnsignedAgreement() {
    return Boolean(
      window.AdminOverride?.canOverride?.() ||
      window.Permissions?.isAdmin?.() ||
      window.Permissions?.hasAdminOverride?.()
    );
  }

  function canCreateAnnex() {
    const permissions = window.Permissions || {};
    const createAllowed = typeof permissions.canCreateAgreement === 'function' ? permissions.canCreateAgreement() : true;
    const updateAllowed = typeof permissions.canUpdateAgreement === 'function' ? permissions.canUpdateAgreement() : false;
    const invoiceAllowed = typeof permissions.canCreateInvoiceFromAgreement === 'function' ? permissions.canCreateInvoiceFromAgreement() : false;
    return createAllowed || updateAllowed || invoiceAllowed;
  }

  function isDraft(record = {}) {
    return normalize(record.status || record.agreement_status || 'draft') === 'draft';
  }

  function isAnnex(record = {}) {
    return relationshipType(record) === 'annex';
  }

  function number(value, fallback = 0) {
    const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function dateOnly(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.includes('T') ? raw.slice(0, 10) : raw;
  }

  function today() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatDate(value) {
    const raw = dateOnly(value);
    if (!raw) return '—';
    const date = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  }

  function formatMoney(value, currency = 'USD') {
    const amount = number(value, 0);
    const code = String(currency || 'USD').trim().toUpperCase() || 'USD';
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, minimumFractionDigits: 2 }).format(amount);
    } catch (_) {
      return `${code} ${amount.toFixed(2)}`;
    }
  }

  function fieldId(field) {
    return `agreementForm${String(field || '')
      .split('_')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')}`;
  }

  function ensureRelationshipFields() {
    const module = agreements();
    if (!module || !Array.isArray(module.agreementFields)) return;
    RELATIONSHIP_FIELDS.forEach(field => {
      if (!module.agreementFields.includes(field)) module.agreementFields.push(field);
    });

    const form = document.getElementById('agreementForm');
    if (!form) return;
    RELATIONSHIP_FIELDS.forEach(field => {
      const id = fieldId(field);
      if (document.getElementById(id)) return;
      const input = document.createElement('input');
      input.type = 'hidden';
      input.id = id;
      input.name = field;
      input.dataset.agreementAnnexHidden = 'true';
      form.appendChild(input);
    });
  }

  function setField(field, value) {
    const element = document.getElementById(fieldId(field));
    if (element) element.value = value ?? '';
  }

  function ensureStyles() {
    if (document.getElementById('agreementAnnexStyles')) return;
    const style = document.createElement('style');
    style.id = 'agreementAnnexStyles';
    style.textContent = `
      .agreement-annex-panel { margin-top:14px; border:1px solid var(--border); border-radius:14px; background:var(--card, rgba(255,255,255,.03)); overflow:hidden; }
      .agreement-annex-panel__head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:14px; flex-wrap:wrap; }
      .agreement-annex-panel__title { margin:0; font-size:15px; font-weight:800; color:var(--text); }
      .agreement-annex-panel__subtitle { margin:4px 0 0; max-width:760px; color:var(--muted); font-size:12px; line-height:1.45; }
      .agreement-annex-panel__body { border-top:1px solid var(--border); padding:12px 14px 14px; }
      .agreement-annex-table-wrap { overflow:auto; border:1px solid var(--border); border-radius:10px; }
      .agreement-annex-table { width:100%; min-width:980px; border-collapse:collapse; font-size:12px; }
      .agreement-annex-table th, .agreement-annex-table td { padding:9px 10px; border-bottom:1px solid var(--border); text-align:left; vertical-align:top; }
      .agreement-annex-table th { color:var(--muted); background:rgba(148,163,184,.08); font-weight:800; }
      .agreement-annex-table tr:last-child td { border-bottom:0; }
      .agreement-annex-actions { display:flex; gap:6px; flex-wrap:wrap; }
      .agreement-annex-status { display:inline-flex; align-items:center; border:1px solid var(--border); border-radius:999px; padding:2px 8px; font-weight:800; white-space:nowrap; }
      .agreement-annex-context { margin:0 0 12px; border:1px solid rgba(37,99,235,.35); background:rgba(37,99,235,.08); border-radius:12px; padding:11px 12px; display:flex; gap:10px 18px; align-items:center; flex-wrap:wrap; color:var(--text); }
      .agreement-annex-context__badge { display:inline-flex; border-radius:999px; padding:3px 9px; font-size:12px; font-weight:900; background:rgba(37,99,235,.14); color:#2563eb; }
      .agreement-annex-context__steps { flex-basis:100%; color:var(--muted); font-size:12px; }
      .agreement-annex-context__actions { margin-left:auto; display:flex; gap:7px; flex-wrap:wrap; }
      .agreement-annex-context__actions .btn { white-space:nowrap; }
      .agreement-annex-empty, .agreement-annex-loading, .agreement-annex-error { margin:0; color:var(--muted); font-size:12px; }
      .agreement-annex-error { color:var(--danger, #dc2626); }
      .agreement-annex-wizard .modal-content { width:min(960px, calc(100vw - 28px)); max-width:960px; }
      .agreement-annex-wizard-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
      .agreement-annex-wizard-grid .span-2 { grid-column:1 / -1; }
      .agreement-annex-wizard-summary { margin-top:12px; border:1px solid var(--border); border-radius:10px; padding:10px 12px; background:rgba(148,163,184,.06); font-size:12px; color:var(--muted); }
      .agreement-annex-one-time-fields[hidden] { display:none !important; }
      .agreement-annex-header-action { margin-left:auto; margin-right:10px; white-space:nowrap; }
      .agreement-annex-row-btn { white-space:nowrap; }
      @media (max-width:720px) { .agreement-annex-wizard-grid { grid-template-columns:1fr; } .agreement-annex-wizard-grid .span-2 { grid-column:auto; } .agreement-annex-header-action { margin-left:0; } }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    ensureStyles();
    ensureRelationshipFields();
    const form = document.getElementById('agreementForm');
    if (!form) return null;
    let panel = document.getElementById('agreementAnnexPanel');
    if (panel) return panel;

    panel = document.createElement('section');
    panel.id = 'agreementAnnexPanel';
    panel.className = 'agreement-annex-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="agreement-annex-panel__head">
        <div>
          <h3 class="agreement-annex-panel__title">Agreement Annex · Additional Locations</h3>
          <p id="agreementAnnexPanelHelp" class="agreement-annex-panel__subtitle">Create a linked annex for a new location without changing the signed parent agreement.</p>
        </div>
        <div class="agreement-annex-actions">
          <button id="agreementCreateAnnexBtn" type="button" class="btn">Create Annex · Add Location</button>
          <button id="agreementRefreshAnnexesBtn" type="button" class="btn ghost">Refresh</button>
        </div>
      </div>
      <div class="agreement-annex-panel__body">
        <div id="agreementAnnexList"><p class="agreement-annex-loading">Loading annexes…</p></div>
      </div>
    `;

    const signedDocument = document.getElementById('agreementSignedDocumentSection');
    if (signedDocument?.parentElement) signedDocument.parentElement.insertBefore(panel, signedDocument);
    else {
      const actionRow = document.getElementById('agreementFormSaveBtn')?.closest('.actions');
      if (actionRow?.parentElement) actionRow.parentElement.insertBefore(panel, actionRow);
      else form.appendChild(panel);
    }
    return panel;
  }

  function ensureHeaderButton() {
    const modal = document.getElementById('agreementFormModal');
    const header = modal?.querySelector?.('.agreement-modal-header');
    const closeBtn = document.getElementById('agreementFormCloseBtn');
    if (!header || !closeBtn) return null;
    let button = document.getElementById('agreementCreateAnnexHeaderBtn');
    if (!button) {
      button = document.createElement('button');
      button.id = 'agreementCreateAnnexHeaderBtn';
      button.type = 'button';
      button.className = 'btn agreement-annex-header-action';
      button.textContent = 'Create Annex · Add Location';
      button.hidden = true;
      header.insertBefore(button, closeBtn);
    }
    return button;
  }

  function ensureContextBanner() {
    const form = document.getElementById('agreementForm');
    if (!form) return null;
    let banner = document.getElementById('agreementAnnexContext');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'agreementAnnexContext';
      banner.className = 'agreement-annex-context';
      banner.hidden = true;
      form.insertBefore(banner, form.firstChild);
    }
    return banner;
  }

  function ensureWizard() {
    ensureStyles();
    let modal = document.getElementById('agreementAnnexWizardModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'agreementAnnexWizardModal';
    modal.className = 'modal agreement-annex-wizard';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="modal-content">
        <div class="header">
          <div>
            <h2 style="margin:0;font-size:20px;">Create Annex · Add Extra Location</h2>
            <p class="muted" style="margin:4px 0 0;">The annex will be linked to the signed agreement and can be invoiced after signing.</p>
          </div>
          <button type="button" class="modal-close" data-annex-close aria-label="Close">✕</button>
        </div>
        <form id="agreementAnnexWizardForm">
          <div class="agreement-annex-wizard-grid">
            <label>Parent Agreement<input id="agreementAnnexParentReference" readonly></label>
            <label>Annex Reference<input id="agreementAnnexReference" readonly></label>
            <label class="span-2">Location Name *<input id="agreementAnnexLocationName" required autocomplete="off"></label>
            <label class="span-2">Location Address<textarea id="agreementAnnexLocationAddress" rows="2"></textarea></label>
            <label>Service Start Date *<input id="agreementAnnexStartDate" type="date" required></label>
            <label>Service End Date *<input id="agreementAnnexEndDate" type="date" required></label>
            <label>License / Month *<input id="agreementAnnexMonths" type="number" min="0.01" max="12" step="0.01" required></label>
            <label>Currency<input id="agreementAnnexCurrency" readonly></label>
            <label class="span-2">SaaS License / Item *<input id="agreementAnnexItemName" required></label>
            <label>Annual Unit Price *<input id="agreementAnnexUnitPrice" type="number" min="0" step="0.01" required></label>
            <label>Discount %<input id="agreementAnnexDiscount" type="number" min="0" max="100" step="0.01" value="0"></label>
            <label class="span-2" style="display:flex;align-items:center;gap:8px;">
              <input id="agreementAnnexIncludeSetup" type="checkbox" style="width:auto;"> Include one-time setup / implementation fee
            </label>
            <div id="agreementAnnexOneTimeFields" class="agreement-annex-one-time-fields span-2" hidden>
              <div class="agreement-annex-wizard-grid">
                <label>One-time Item<input id="agreementAnnexSetupName"></label>
                <label>One-time Amount<input id="agreementAnnexSetupAmount" type="number" min="0" step="0.01"></label>
              </div>
            </div>
            <label class="span-2">Annex Notes<textarea id="agreementAnnexNotes" rows="3" placeholder="Example: Additional location added under the same commercial terms and end date as the parent agreement."></textarea></label>
          </div>
          <div id="agreementAnnexWizardSummary" class="agreement-annex-wizard-summary"></div>
          <div class="actions" style="justify-content:flex-end;gap:8px;margin-top:14px;">
            <button type="button" class="btn ghost" data-annex-close>Cancel</button>
            <button id="agreementAnnexCreateDraftBtn" type="submit" class="btn">Open Annex Draft</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal.open')) document.body.classList.remove('modal-open');
  }

  function calculateMonths(startValue, endValue) {
    const start = new Date(`${dateOnly(startValue)}T00:00:00Z`);
    const end = new Date(`${dateOnly(endValue)}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
    const inclusiveDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    return Math.max(0.01, Math.min(12, Math.round((inclusiveDays / 365.25 * 12) * 100) / 100));
  }

  function updateWizardSummary() {
    const currency = String(document.getElementById('agreementAnnexCurrency')?.value || 'USD').trim() || 'USD';
    const months = number(document.getElementById('agreementAnnexMonths')?.value, 0);
    const unit = number(document.getElementById('agreementAnnexUnitPrice')?.value, 0);
    const discount = Math.max(0, Math.min(100, number(document.getElementById('agreementAnnexDiscount')?.value, 0)));
    const setupIncluded = Boolean(document.getElementById('agreementAnnexIncludeSetup')?.checked);
    const setup = setupIncluded ? number(document.getElementById('agreementAnnexSetupAmount')?.value, 0) : 0;
    const saas = unit * (months / 12) * (1 - discount / 100);
    const total = saas + setup;
    const node = document.getElementById('agreementAnnexWizardSummary');
    if (node) {
      node.innerHTML = `<strong>Draft commercial value:</strong> ${esc(formatMoney(total, currency))} · SaaS ${esc(formatMoney(saas, currency))}${setupIncluded ? ` · One-time ${esc(formatMoney(setup, currency))}` : ''}. You can add hardware or more fee lines in the agreement editor before saving.`;
    }
  }

  function syncWizardMonthsFromDates() {
    const start = document.getElementById('agreementAnnexStartDate')?.value || '';
    const end = document.getElementById('agreementAnnexEndDate')?.value || '';
    const monthsInput = document.getElementById('agreementAnnexMonths');
    if (!monthsInput || monthsInput.dataset.manual === 'true') return;
    const months = calculateMonths(start, end);
    if (months) monthsInput.value = String(months);
    updateWizardSummary();
  }

  function activeAnnualItems(items = []) {
    const module = agreements();
    return (Array.isArray(items) ? items : []).filter(item => {
      if (module?.isAgreementAnnualSaasItem) return module.isAgreementAnnualSaasItem(item);
      return normalize(item.section) === 'annual_saas';
    });
  }

  function oneTimeItems(items = []) {
    const module = agreements();
    return (Array.isArray(items) ? items : []).filter(item => {
      if (module?.isAgreementOneTimeFeeItem) return module.isAgreementOneTimeFeeItem(item);
      return normalize(item.section) === 'one_time_fee';
    });
  }

  function chooseTemplates(items = []) {
    const annualRows = activeAnnualItems(items);
    const setupRows = oneTimeItems(items);
    state.annualTemplate = annualRows.find(item => /incheck\s*basic/i.test(String(item.item_name || ''))) || annualRows[0] || null;
    state.setupTemplate = setupRows.find(item => /account\s*setup|setup|implementation/i.test(String(item.item_name || ''))) || null;
  }

  async function getNextAnnexSequence(parent) {
    const client = getClient();
    const parentId = agreementId(parent);
    if (!client || !parentId) return 1;
    const { data, error } = await client
      .from('agreements')
      .select('agreement_id,agreement_number,agreement_version')
      .eq('parent_agreement_id', parentId)
      .eq('agreement_relationship_type', 'annex');
    if (error) throw error;
    let max = 0;
    (Array.isArray(data) ? data : []).forEach(row => {
      const version = number(row.agreement_version, 0);
      const ref = String(row.agreement_number || row.agreement_id || '');
      const match = ref.match(/-AN-(\d+)$/i);
      max = Math.max(max, version, match ? number(match[1], 0) : 0);
    });
    return max + 1;
  }

  function annexReference(parent, sequence) {
    return `${agreementRef(parent) || `Agreement-${Date.now()}`}-AN-${String(sequence).padStart(2, '0')}`;
  }

  async function showCreateWizard() {
    const module = agreements();
    const parent = module?.state?.currentAgreement || {};
    if (!agreementId(parent)) return toast('Open the signed agreement first.');
    if (!isSigned(parent)) return toast('Only signed agreements can have an annex.');
    if (isAnnex(parent)) return toast('Create the annex from the parent agreement, not from another annex.');
    if (!canCreateAnnex()) return toast('You do not have permission to create an agreement annex.');

    chooseTemplates(module?.state?.currentItems || []);
    let sequence;
    try {
      sequence = await getNextAnnexSequence(parent);
    } catch (error) {
      console.error('[Agreement Annex] Unable to generate annex sequence', error);
      return toast(`Unable to prepare annex. Run the annex SQL migration first. ${error?.message || ''}`.trim());
    }

    state.currentParent = { ...parent };
    state.currentSequence = sequence;
    state.currentReference = annexReference(parent, sequence);

    const modal = ensureWizard();
    const start = today();
    const parentEnd = dateOnly(parent.service_end_date);
    const end = parentEnd && parentEnd >= start
      ? parentEnd
      : (module?.calculateServiceEndDate?.(start, 12) || '');
    const months = calculateMonths(start, end) || 12;
    const annual = state.annualTemplate || {};
    const setup = state.setupTemplate || {};

    const set = (id, value) => { const node = document.getElementById(id); if (node) node.value = value ?? ''; };
    set('agreementAnnexParentReference', agreementRef(parent));
    set('agreementAnnexReference', state.currentReference);
    set('agreementAnnexLocationName', '');
    set('agreementAnnexLocationAddress', '');
    set('agreementAnnexStartDate', start);
    set('agreementAnnexEndDate', end);
    set('agreementAnnexMonths', months);
    set('agreementAnnexCurrency', parent.currency || 'USD');
    set('agreementAnnexItemName', annual.item_name || 'InCheck Basic');
    set('agreementAnnexUnitPrice', number(annual.unit_price, 0));
    set('agreementAnnexDiscount', number(annual.discount_percent, 0));
    set('agreementAnnexSetupName', setup.item_name || 'Account Setup');
    set('agreementAnnexSetupAmount', number(setup.unit_price, 0));
    set('agreementAnnexNotes', `Additional location annex linked to ${agreementRef(parent)}.`);

    const includeSetup = document.getElementById('agreementAnnexIncludeSetup');
    if (includeSetup) includeSetup.checked = Boolean(state.setupTemplate);
    const oneTimeFields = document.getElementById('agreementAnnexOneTimeFields');
    if (oneTimeFields) oneTimeFields.hidden = !includeSetup?.checked;
    const monthsInput = document.getElementById('agreementAnnexMonths');
    if (monthsInput) monthsInput.dataset.manual = 'false';
    updateWizardSummary();
    openModal(modal);
    window.setTimeout(() => document.getElementById('agreementAnnexLocationName')?.focus(), 50);
  }

  function clearSigningAndSystemFields(draft) {
    const clearFields = [
      'id','proposal_id','deal_id','lead_id','created_at','updated_at','sent_at','agreement_sent_at','issued_at',
      'valid_until','signing_deadline','expires_at','signed_date','customer_official_sign_date','customer_sign_date',
      'provider_official_signatory_1_sign_date','provider_official_signatory_2_sign_date','provider_sign_date',
      'signed_document_path','signed_document_name','signed_document_uploaded_at','signed_document_uploaded_by','signed_document_url',
      'signed_agreement_document_path','signed_agreement_document_name','signed_agreement_document_uploaded_at','signed_agreement_document_uploaded_by','signed_agreement_document_url',
      'customer_signed_at','imported_at','imported_by','imported_document_bucket',
      'imported_document_path','imported_document_name','imported_document_uploaded_at','imported_document_uploaded_by',
      'invoice_id','invoice_number','invoice_reference','invoiced_at','invoiced_by'
    ];
    clearFields.forEach(field => { draft[field] = ''; });
    draft.gm_signed = false;
    draft.financial_controller_signed = false;
    draft.is_imported = false;
    draft.is_historical_agreement = false;
    return draft;
  }

  function buildAnnexDraftFromWizard() {
    const module = agreements();
    const parent = state.currentParent || {};
    const locationName = String(document.getElementById('agreementAnnexLocationName')?.value || '').trim();
    const locationAddress = String(document.getElementById('agreementAnnexLocationAddress')?.value || '').trim();
    const start = dateOnly(document.getElementById('agreementAnnexStartDate')?.value);
    const end = dateOnly(document.getElementById('agreementAnnexEndDate')?.value);
    const months = number(document.getElementById('agreementAnnexMonths')?.value, 0);
    const itemName = String(document.getElementById('agreementAnnexItemName')?.value || '').trim();
    const unitPrice = number(document.getElementById('agreementAnnexUnitPrice')?.value, 0);
    const discount = Math.max(0, Math.min(100, number(document.getElementById('agreementAnnexDiscount')?.value, 0)));
    const notes = String(document.getElementById('agreementAnnexNotes')?.value || '').trim();
    const includeSetup = Boolean(document.getElementById('agreementAnnexIncludeSetup')?.checked);
    const setupName = String(document.getElementById('agreementAnnexSetupName')?.value || '').trim();
    const setupAmount = number(document.getElementById('agreementAnnexSetupAmount')?.value, 0);

    if (!locationName) throw new Error('Location name is required.');
    if (!start || !end) throw new Error('Service start and end dates are required.');
    if (end < start) throw new Error('Service end date cannot be before the start date.');
    if (!(months > 0 && months <= 12)) throw new Error('License / Month must be between 0.01 and 12.');
    if (!itemName) throw new Error('SaaS license / item is required.');
    if (unitPrice < 0) throw new Error('Annual unit price cannot be negative.');
    if (includeSetup && (!setupName || setupAmount < 0)) throw new Error('Complete the one-time fee details.');

    const parentId = agreementId(parent);
    const reference = state.currentReference;
    const sequence = state.currentSequence;
    const rootId = String(parent.root_agreement_id || parent.parent_agreement_id || parentId).trim() || parentId;
    const draft = clearSigningAndSystemFields({ ...parent });
    draft.agreement_id = reference;
    draft.agreement_number = reference;
    draft.agreement_title = `Annex ${String(sequence).padStart(2, '0')} · Additional Location · ${locationName}`;
    draft.agreement_date = today();
    draft.effective_date = start;
    draft.service_start_date = start;
    draft.service_end_date = end;
    draft.agreement_length = `${months} month${months === 1 ? '' : 's'}`;
    draft.contract_term = draft.agreement_length;
    draft.status = 'Draft';
    draft.parent_agreement_id = parentId;
    draft.root_agreement_id = rootId;
    draft.source_agreement_id = parentId;
    draft.agreement_relationship_type = 'annex';
    draft.agreement_version = sequence;
    draft.relationship_notes = notes || `Additional location ${locationName} under ${agreementRef(parent)}.`;
    draft.notes = notes || draft.relationship_notes;
    draft.generated_by = currentUserLabel() || parent.generated_by || '';
    draft.created_by = currentUserId() || '';
    draft.updated_by = currentUserId() || '';
    draft.saas_total = 0;
    draft.one_time_total = 0;
    draft.grand_total = 0;
    draft.total_discount = 0;
    draft.subtotal_locations = 0;
    draft.subtotal_one_time = 0;
    draft.is_poc = false;
    draft.poc_location_count = null;
    draft.poc_license_count = null;
    draft.poc_license_months = null;
    draft.poc_service_start_date = null;
    draft.poc_service_end_date = null;
    draft.poc_success_kpis = null;
    draft.poc_conversion_commitment = null;

    const annualTemplate = state.annualTemplate || {};
    let annual = {
      section: 'annual_saas',
      line_no: 1,
      item_id: module?.generateAgreementItemId?.() || `annex-item-${Date.now()}-1`,
      location_name: locationName,
      location_address: locationAddress,
      service_start_date: start,
      service_end_date: end,
      item_name: itemName,
      description: annualTemplate.description || annualTemplate.notes || `Additional location under annex ${reference}.`,
      unit_price: unitPrice,
      discount_percent: months < 12 ? 0 : discount,
      quantity: months,
      license_quantity: Math.max(1, number(annualTemplate.license_quantity, 1)),
      invoice_status: 'not_invoiced',
      invoiced_invoice_id: '',
      invoiced_at: '',
      notes: `Parent agreement: ${agreementRef(parent)}`
    };
    annual = module?.computeCommercialRow ? module.computeCommercialRow(annual) : annual;

    const items = [annual];
    if (includeSetup) {
      let setup = {
        section: 'one_time_fee',
        line_no: items.length + 1,
        item_id: module?.generateAgreementItemId?.() || `annex-item-${Date.now()}-2`,
        location_name: locationName,
        location_address: locationAddress,
        item_name: setupName,
        description: state.setupTemplate?.description || `One-time fee for ${locationName}.`,
        unit_price: setupAmount,
        discount_percent: 0,
        quantity: 1,
        license_quantity: 1,
        invoice_status: 'not_invoiced',
        invoiced_invoice_id: '',
        invoiced_at: '',
        notes: `Parent agreement: ${agreementRef(parent)}`
      };
      setup = module?.computeCommercialRow ? module.computeCommercialRow(setup) : setup;
      items.push(setup);
    }
    return { draft, items, parent };
  }

  function openDraftInAgreementEditor() {
    const module = agreements();
    if (!module?.openAgreementForm) throw new Error('Agreement editor is unavailable.');
    const { draft, items, parent } = buildAnnexDraftFromWizard();
    closeModal(document.getElementById('agreementAnnexWizardModal'));
    ensureRelationshipFields();
    module.openAgreementForm(draft, items, { readOnly: false });
    const form = document.getElementById('agreementForm');
    if (form) {
      form.dataset.id = '';
      form.dataset.mode = 'create';
      form.dataset.source = 'annex';
      form.dataset.proposalUuid = '';
      form.dataset.annexParentId = agreementId(parent);
    }
    if (module.state) {
      module.state.currentAgreementId = '';
      module.state.currentAgreement = { ...draft, id: '' };
      module.state.currentItems = [...items];
    }
    RELATIONSHIP_FIELDS.forEach(field => setField(field, draft[field]));
    renderForAgreement(draft);
    toast('Annex draft prepared. Review the location, fees and terms, then save. After signing and uploading the signed annex, use Create Invoice.');
  }

  function getParentIdForList(record = {}) {
    if (isAnnex(record)) return String(record.parent_agreement_id || record.source_agreement_id || '').trim();
    return agreementId(record);
  }

  async function fetchAnnexes(record = {}) {
    const client = getClient();
    const parentId = getParentIdForList(record);
    if (!client || !parentId) return { annexes: [], itemsByAgreement: new Map(), invoicesByAgreement: new Map() };

    const { data: rows, error } = await client
      .from('agreements')
      .select('*')
      .eq('parent_agreement_id', parentId)
      .eq('agreement_relationship_type', 'annex')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const annexes = Array.isArray(rows) ? rows : [];
    const ids = annexes.map(row => agreementId(row)).filter(isUuid);
    const refs = annexes.map(row => agreementRef(row)).filter(Boolean);
    const itemsByAgreement = new Map();
    const invoicesByAgreement = new Map();
    if (!ids.length) return { annexes, itemsByAgreement, invoicesByAgreement };

    const itemPromise = client
      .from('agreement_items')
      .select('id,agreement_id,section,location_name,item_name,service_start_date,service_end_date,invoice_status,invoiced_invoice_id,invoiced_at')
      .in('agreement_id', ids);
    const invoiceUuidPromise = client
      .from('invoices')
      .select('id,invoice_id,invoice_number,agreement_uuid,agreement_id,agreement_number,status,invoice_total,created_at')
      .in('agreement_uuid', ids);
    const invoiceRefPromise = refs.length
      ? client.from('invoices').select('id,invoice_id,invoice_number,agreement_uuid,agreement_id,agreement_number,status,invoice_total,created_at').in('agreement_id', refs)
      : Promise.resolve({ data: [], error: null });

    const [itemResult, invoiceUuidResult, invoiceRefResult] = await Promise.all([itemPromise, invoiceUuidPromise, invoiceRefPromise]);
    if (itemResult.error) console.warn('[Agreement Annex] Unable to load annex items', itemResult.error);
    (Array.isArray(itemResult.data) ? itemResult.data : []).forEach(item => {
      const key = String(item.agreement_id || '').trim();
      if (!itemsByAgreement.has(key)) itemsByAgreement.set(key, []);
      itemsByAgreement.get(key).push(item);
    });

    const invoiceRows = [];
    [invoiceUuidResult, invoiceRefResult].forEach(result => {
      if (result?.error) console.warn('[Agreement Annex] Unable to load annex invoices', result.error);
      (Array.isArray(result?.data) ? result.data : []).forEach(row => {
        if (!invoiceRows.some(existing => String(existing.id || '') === String(row.id || ''))) invoiceRows.push(row);
      });
    });
    annexes.forEach(annex => {
      const id = agreementId(annex);
      const ref = agreementRef(annex);
      const linked = invoiceRows
        .filter(invoice => String(invoice.agreement_uuid || '').trim() === id || String(invoice.agreement_id || invoice.agreement_number || '').trim() === ref)
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      invoicesByAgreement.set(id, linked);
    });
    return { annexes, itemsByAgreement, invoicesByAgreement };
  }

  function renderAnnexList(data, record = {}) {
    const container = document.getElementById('agreementAnnexList');
    if (!container) return;
    const annexes = Array.isArray(data?.annexes) ? data.annexes : [];
    if (!annexes.length) {
      container.innerHTML = '<p class="agreement-annex-empty">No annexes have been created for this agreement.</p>';
      return;
    }
    const canInvoice = window.Permissions?.canCreateInvoiceFromAgreement?.() !== false;
    container.innerHTML = `
      <div class="agreement-annex-table-wrap">
        <table class="agreement-annex-table">
          <thead><tr><th>Annex</th><th>Additional Location</th><th>Status</th><th>Service Period</th><th>Annex Value</th><th>Invoice</th><th>Actions</th></tr></thead>
          <tbody>
            ${annexes.map(annex => {
              const id = agreementId(annex);
              const items = data.itemsByAgreement?.get(id) || [];
              const locations = [...new Set(items.filter(item => normalize(item.section) === 'annual_saas').map(item => String(item.location_name || '').trim()).filter(Boolean))];
              const invoice = (data.invoicesByAgreement?.get(id) || [])[0] || null;
              const status = String(annex.status || 'Draft').trim() || 'Draft';
              const draft = isDraft(annex);
              const signed = isSigned(annex);
              return `<tr>
                <td><strong>${esc(agreementRef(annex))}</strong><div class="muted">${esc(annex.agreement_title || '')}</div></td>
                <td>${locations.length ? locations.map(esc).join('<br>') : '—'}</td>
                <td><span class="agreement-annex-status">${esc(status)}</span></td>
                <td>${esc(formatDate(annex.service_start_date))} – ${esc(formatDate(annex.service_end_date))}</td>
                <td>${esc(formatMoney(annex.grand_total, annex.currency || record.currency))}</td>
                <td>${invoice ? `<strong>${esc(invoice.invoice_number || invoice.invoice_id || 'Invoice')}</strong><div class="muted">${esc(invoice.status || '')}</div>` : '<span class="muted">Not issued</span>'}</td>
                <td><div class="agreement-annex-actions">
                  <button type="button" class="btn ghost sm" data-annex-open="${attr(id)}" data-annex-readonly="${draft ? 'false' : 'true'}">${draft ? 'Edit Annex' : 'View Annex'}</button>
                  <button type="button" class="btn ghost sm" data-annex-preview="${attr(id)}">Preview</button>
                  ${invoice ? `<button type="button" class="btn ghost sm" data-annex-view-invoice="${attr(invoice.id || '')}">View Invoice</button>` : ((signed || canAdminInvoiceUnsignedAgreement()) && canInvoice ? `<button type="button" class="btn sm" data-annex-create-invoice="${attr(id)}">Create Invoice</button>` : '')}
                </div></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  async function loadAnnexList(record = {}) {
    const container = document.getElementById('agreementAnnexList');
    const parentId = getParentIdForList(record);
    if (!container || !parentId) return;
    const token = ++state.listRequestToken;
    state.loadingParentId = parentId;
    container.innerHTML = '<p class="agreement-annex-loading">Loading annexes…</p>';
    try {
      const data = await fetchAnnexes(record);
      if (token !== state.listRequestToken) return;
      renderAnnexList(data, record);
    } catch (error) {
      console.error('[Agreement Annex] Unable to load annexes', error);
      if (token !== state.listRequestToken) return;
      container.innerHTML = `<p class="agreement-annex-error">Unable to load annexes. Run the included Supabase migration, then refresh. ${esc(error?.message || '')}</p>`;
    }
  }

  function renderContext(record = {}) {
    const banner = ensureContextBanner();
    if (!banner) return;
    if (!isAnnex(record)) {
      banner.hidden = true;
      return;
    }
    const id = agreementId(record);
    const parent = String(record.parent_agreement_id || record.source_agreement_id || '').trim();
    banner.innerHTML = `
      <span class="agreement-annex-context__badge">Agreement Annex</span>
      <span><strong>Annex:</strong> ${esc(agreementRef(record) || 'New Draft')}</span>
      <span><strong>Parent Agreement:</strong> ${esc(record.parent_agreement_reference || parent || '—')}</span>
      ${id ? `<span class="agreement-annex-context__actions">
        <button type="button" class="btn sm" data-annex-view-self="${attr(id)}">View Annex</button>
        <button type="button" class="btn ghost sm" data-annex-preview="${attr(id)}">Preview Annex</button>
        ${parent ? `<button type="button" class="btn ghost sm" data-annex-open-parent="${attr(parent)}">Open Parent Agreement</button>` : ''}
      </span>` : ''}
      <span class="agreement-annex-context__steps">Workflow: review and save the annex → complete signatures → upload the signed annex → create the linked invoice for the additional location.</span>`;
    banner.hidden = false;
  }

  function renderForAgreement(record = {}) {
    ensureRelationshipFields();
    const panel = ensurePanel();
    renderContext(record);
    if (!panel) return;

    const id = agreementId(record);
    const rel = relationshipType(record);
    const parentId = getParentIdForList(record);
    panel.hidden = !id && !isAnnex(record);
    if (panel.hidden) return;

    const createBtn = document.getElementById('agreementCreateAnnexBtn');
    const headerBtn = ensureHeaderButton();
    const help = document.getElementById('agreementAnnexPanelHelp');
    const canCreate = canCreateAnnex();
    const canCreateHere = Boolean(id && isSigned(record) && rel !== 'annex' && canCreate);
    const titleText = rel === 'annex'
      ? 'Open the parent agreement to create another annex.'
      : isSigned(record)
        ? 'Create a linked annex for an additional location.'
        : 'The agreement must be signed before an annex can be created.';
    if (createBtn) {
      createBtn.disabled = !canCreateHere;
      createBtn.title = titleText;
    }
    if (headerBtn) {
      headerBtn.hidden = !canCreateHere;
      headerBtn.disabled = !canCreateHere;
      headerBtn.title = titleText;
    }
    if (help) {
      help.textContent = rel === 'annex'
        ? `This is a linked annex to ${String(record.parent_agreement_reference || record.parent_agreement_id || 'the parent agreement')}. Sign and upload it before issuing its invoice.`
        : isSigned(record)
          ? `Add a location through a separate annex. The signed agreement remains unchanged, and the invoice is issued from the signed annex.`
          : `Sign this agreement before creating an additional-location annex.`;
    }
    if (parentId) loadAnnexList(record);
  }

  function patchPreview() {
    const module = agreements();
    if (!module?.buildAgreementPreviewHtml || module.__annexPreviewPatched) return;
    const original = module.buildAgreementPreviewHtml.bind(module);
    module.buildAgreementPreviewHtml = function patchedAnnexPreview(record = {}, items = []) {
      let html = original(record, items);
      if (!isAnnex(record)) return html;
      const parentRef = String(record.parent_agreement_reference || record.relationship_notes || record.parent_agreement_id || '').trim();
      html = html
        .replace('<title>Commercial Agreement ·', '<title>Agreement Annex ·')
        .replace('<h2 class="doc-label">Commercial Agreement</h2>', '<h2 class="doc-label">Agreement Annex</h2>')
        .replace('<div class="meta-key">Agreement ID</div>', '<div class="meta-key">Annex ID</div>')
        .replace('<div class="meta-key">Agreement #</div>', '<div class="meta-key">Annex #</div>')
        .replace('<div class="meta-key">Agreement Date</div>', '<div class="meta-key">Annex Date</div>');
      if (parentRef) {
        html = html.replace(
          '</div>\n          </div>\n        </section>\n      </header>',
          `<div class="meta-row"><div class="meta-key">Parent Agreement</div><div>${esc(parentRef)}</div></div></div>\n          </div>\n        </section>\n      </header>`
        );
      }
      return html;
    };
    module.__annexPreviewPatched = true;
  }

  function findAgreementRecord(id) {
    const module = agreements();
    if (!module) return null;
    if (typeof module.findDetailsRow === 'function') {
      const found = module.findDetailsRow(id);
      if (found) return found;
    }
    const target = String(id || '').trim();
    return [...(module.state?.rows || []), ...(module.state?.filteredRows || [])].find(row =>
      [row?.id, row?.agreement_id, row?.agreement_number, row?.agreementId].some(value => String(value || '').trim() === target)
    ) || null;
  }

  function injectAnnexRowActions() {
    if (!canCreateAnnex()) return;
    document.querySelectorAll('tr[data-agreement-row]').forEach(rowElement => {
      const id = String(rowElement.getAttribute('data-agreement-row') || '').trim();
      if (!id || rowElement.querySelector('[data-agreement-create-annex]')) return;
      const record = findAgreementRecord(id);
      if (!record || !isSigned(record) || isAnnex(record)) return;
      const actions = rowElement.querySelector('.commercial-row-actions');
      if (!actions) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'commercial-view-btn agreement-annex-row-btn';
      button.setAttribute('data-agreement-create-annex', id);
      button.textContent = 'Create Annex';
      button.title = 'Create an additional-location annex from this signed agreement.';
      const menu = actions.querySelector('.commercial-actions-menu');
      if (menu) actions.insertBefore(button, menu);
      else actions.appendChild(button);
    });
  }

  async function openAgreementRecordById(id, { readOnly = true, trigger = null } = {}) {
    const module = agreements();
    const recordId = String(id || '').trim();
    if (!module || !recordId) return false;

    const permissions = window.Permissions || {};
    if (typeof permissions.canPreviewAgreement === 'function' && !permissions.canPreviewAgreement()) {
      toast('You do not have permission to view agreements.');
      return false;
    }

    // Use the native agreement loader first because it also refreshes invoice status,
    // signatures, signed-document state and cached details.
    if (typeof module.openAgreementFormById === 'function') {
      try {
        await module.openAgreementFormById(recordId, { readOnly, trigger });
        const openedId = agreementId(module.state?.currentAgreement || {});
        if (openedId === recordId) return true;
      } catch (error) {
        console.warn('[Agreement Annex] Native agreement open failed; using direct fallback.', error);
      }
    }

    // Fallback for deployments where the normal Agreements list/RPC does not return annex rows.
    const client = getClient();
    if (!client) {
      toast('Unable to open annex: Supabase client is unavailable.');
      return false;
    }
    try {
      const [{ data: row, error: rowError }, { data: itemRows, error: itemError }] = await Promise.all([
        client.from('agreements').select('*').eq('id', recordId).maybeSingle(),
        client.from('agreement_items').select('*').eq('agreement_id', recordId).order('created_at', { ascending: true })
      ]);
      if (rowError) throw rowError;
      if (!row) throw new Error('The annex record was not found.');
      if (itemError) throw itemError;

      const normalizedRecord = typeof module.normalizeAgreement === 'function' ? module.normalizeAgreement(row) : row;
      const normalizedItems = (Array.isArray(itemRows) ? itemRows : []).map(item =>
        typeof module.normalizeItem === 'function' ? module.normalizeItem(item) : item
      );
      module.openAgreementForm(normalizedRecord, normalizedItems, { readOnly });
      if (module.state) {
        module.state.currentAgreementId = recordId;
        module.state.currentAgreement = normalizedRecord;
        module.state.currentItems = normalizedItems;
      }
      renderForAgreement(normalizedRecord);
      return true;
    } catch (error) {
      console.error('[Agreement Annex] Unable to open annex directly.', error);
      toast(`Unable to open annex: ${error?.message || 'Unknown error'}`);
      return false;
    }
  }

  async function startAnnexFromAgreementId(id, trigger = null) {
    const module = agreements();
    const agreementIdValue = String(id || '').trim();
    if (!module || !agreementIdValue) return;
    const opened = await openAgreementRecordById(agreementIdValue, { readOnly: true, trigger });
    if (!opened) return;
    const current = module.state?.currentAgreement || {};
    if (!agreementId(current)) return toast('Unable to load the selected agreement.');
    if (!isSigned(current)) return toast('Only signed agreements can have an annex.');
    await showCreateWizard();
  }

  function patchAgreements() {
    const module = agreements();
    if (!module || module.__agreementAnnexPatched) return;
    ensureRelationshipFields();
    patchPreview();

    const originalOpen = module.openAgreementForm?.bind(module);
    module.openAgreementForm = function patchedOpenAgreementForm(record, items, options) {
      ensureRelationshipFields();
      const result = originalOpen ? originalOpen(record, items, options) : undefined;
      ensureRelationshipFields();
      const current = this.state?.currentAgreement || record || {};
      RELATIONSHIP_FIELDS.forEach(field => setField(field, current[field]));
      renderForAgreement(current);
      if (isAnnex(current)) {
        const title = document.getElementById('agreementFormTitle');
        const subtitle = document.getElementById('agreementFormSubtitle');
        const saveBtn = document.getElementById('agreementFormSaveBtn');
        if (title) title.textContent = isDraft(current) ? 'Annex Draft · Additional Location' : 'Agreement Annex';
        if (subtitle) subtitle.textContent = 'Linked to an existing signed agreement. Save, sign, upload the signed annex, then issue its invoice.';
        if (saveBtn && isDraft(current)) saveBtn.textContent = current.id ? 'Update Annex' : 'Create Annex';
      }
      return result;
    };

    const originalClose = module.closeAgreementForm?.bind(module);
    module.closeAgreementForm = function patchedCloseAgreementForm() {
      const context = document.getElementById('agreementAnnexContext');
      const panel = document.getElementById('agreementAnnexPanel');
      const headerBtn = document.getElementById('agreementCreateAnnexHeaderBtn');
      if (context) context.hidden = true;
      if (panel) panel.hidden = true;
      if (headerBtn) headerBtn.hidden = true;
      return originalClose ? originalClose() : undefined;
    };

    const originalNormalize = module.normalizeAgreement?.bind(module);
    module.normalizeAgreement = function patchedNormalizeAgreement(raw = {}) {
      const normalizedRecord = originalNormalize ? originalNormalize(raw) : { ...(raw || {}) };
      RELATIONSHIP_FIELDS.forEach(field => {
        const camel = field.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
        const value = raw?.[field] ?? raw?.[camel] ?? normalizedRecord?.[field] ?? '';
        normalizedRecord[field] = typeof value === 'string' ? value.trim() : value;
      });
      return normalizedRecord;
    };

    const originalRender = module.render?.bind(module);
    if (originalRender) {
      module.render = function patchedAgreementRender(...args) {
        const result = originalRender(...args);
        window.setTimeout(injectAnnexRowActions, 0);
        return result;
      };
    }

    module.__agreementAnnexPatched = true;
    window.setTimeout(injectAnnexRowActions, 0);
  }

  function bindEvents() {
    if (document.documentElement.dataset.agreementAnnexBound === 'true') return;
    document.addEventListener('click', async event => {
      const create = event.target?.closest?.('#agreementCreateAnnexBtn, #agreementCreateAnnexHeaderBtn');
      if (create) {
        event.preventDefault();
        await showCreateWizard();
        return;
      }
      const rowCreate = event.target?.closest?.('[data-agreement-create-annex]');
      if (rowCreate) {
        event.preventDefault();
        event.stopPropagation();
        const id = rowCreate.getAttribute('data-agreement-create-annex') || '';
        await startAnnexFromAgreementId(id, rowCreate);
        return;
      }
      if (event.target?.closest?.('#agreementRefreshAnnexesBtn')) {
        event.preventDefault();
        renderForAgreement(agreements()?.state?.currentAgreement || {});
        return;
      }
      if (event.target?.closest?.('[data-annex-close]')) {
        event.preventDefault();
        closeModal(document.getElementById('agreementAnnexWizardModal'));
        return;
      }
      const open = event.target?.closest?.('[data-annex-open]');
      if (open) {
        event.preventDefault();
        const id = open.getAttribute('data-annex-open') || '';
        const readOnly = open.getAttribute('data-annex-readonly') === 'true';
        await openAgreementRecordById(id, { readOnly, trigger: open });
        return;
      }
      const viewSelf = event.target?.closest?.('[data-annex-view-self]');
      if (viewSelf) {
        event.preventDefault();
        const id = viewSelf.getAttribute('data-annex-view-self') || '';
        await openAgreementRecordById(id, { readOnly: true, trigger: viewSelf });
        return;
      }
      const openParent = event.target?.closest?.('[data-annex-open-parent]');
      if (openParent) {
        event.preventDefault();
        const parentId = openParent.getAttribute('data-annex-open-parent') || '';
        await openAgreementRecordById(parentId, { readOnly: true, trigger: openParent });
        return;
      }
      const preview = event.target?.closest?.('[data-annex-preview]');
      if (preview) {
        event.preventDefault();
        await agreements()?.previewAgreementHtml?.(preview.getAttribute('data-annex-preview') || '');
        return;
      }
      const createInvoice = event.target?.closest?.('[data-annex-create-invoice]');
      if (createInvoice) {
        event.preventDefault();
        const id = createInvoice.getAttribute('data-annex-create-invoice') || '';
        if (!id) return;
        await agreements()?.createInvoiceFromAgreementFlow?.(id);
        return;
      }
      const viewInvoice = event.target?.closest?.('[data-annex-view-invoice]');
      if (viewInvoice) {
        event.preventDefault();
        const invoiceId = viewInvoice.getAttribute('data-annex-view-invoice') || '';
        if (!invoiceId) return;
        if (typeof window.setActiveView === 'function') window.setActiveView('invoices');
        await window.Invoices?.openInvoiceById?.(invoiceId, { readOnly: true, trigger: viewInvoice });
      }
    }, true);

    document.addEventListener('submit', event => {
      if (event.target?.id !== 'agreementAnnexWizardForm') return;
      event.preventDefault();
      const button = document.getElementById('agreementAnnexCreateDraftBtn');
      if (button?.disabled) return;
      if (button) {
        button.disabled = true;
        button.textContent = 'Preparing…';
      }
      try {
        openDraftInAgreementEditor();
      } catch (error) {
        console.error('[Agreement Annex] Unable to prepare draft', error);
        toast(error?.message || 'Unable to prepare annex draft.');
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = 'Open Annex Draft';
        }
      }
    }, true);

    document.addEventListener('change', event => {
      if (['agreementAnnexStartDate', 'agreementAnnexEndDate'].includes(event.target?.id)) syncWizardMonthsFromDates();
      if (event.target?.id === 'agreementAnnexIncludeSetup') {
        const fields = document.getElementById('agreementAnnexOneTimeFields');
        if (fields) fields.hidden = !event.target.checked;
        updateWizardSummary();
      }
    });
    document.addEventListener('input', event => {
      if (event.target?.id === 'agreementAnnexMonths') event.target.dataset.manual = 'true';
      if (['agreementAnnexMonths','agreementAnnexUnitPrice','agreementAnnexDiscount','agreementAnnexSetupAmount'].includes(event.target?.id)) updateWizardSummary();
    });

    document.documentElement.dataset.agreementAnnexBound = 'true';
  }

  function boot() {
    if (!agreements()) {
      window.setTimeout(boot, 80);
      return;
    }
    patchAgreements();
    ensureRelationshipFields();
    ensureWizard();
    ensureHeaderButton();
    bindEvents();
    window.setTimeout(injectAnnexRowActions, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
