/* Agreement Lifecycle Extension
 * Adds professional contract lifecycle actions without editing signed agreements:
 * - Create Amendment draft linked to the signed agreement
 * - Create Sub-Agreement draft linked to the signed/master agreement
 */
(function agreementLifecycleExtension() {
  const LIFECYCLE_FIELDS = [
    'parent_agreement_id',
    'root_agreement_id',
    'source_agreement_id',
    'agreement_relationship_type',
    'agreement_version',
    'relationship_notes'
  ];

  function escapeHtml(value) {
    if (window.U?.escapeHtml) return window.U.escapeHtml(String(value ?? ''));
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeStatus(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  }

  function getSupabaseClient() {
    return window.Agreements?.getSupabaseClient?.() || window.SupabaseClient?.getClient?.() || window.supabaseClient || window.supabase || null;
  }

  function getUiToast() {
    return window.UI?.toast?.bind(window.UI) || (message => window.alert(message));
  }

  function getCurrentUserId() {
    const session = window.Session || {};
    const user = typeof session.user === 'function' ? session.user() : {};
    const authContext = typeof session.authContext === 'function' ? session.authContext() : {};
    const profile = session.state?.profile || user.profile || authContext.profile || {};
    return String(user.user_id || user.id || authContext.user?.id || profile.auth_user_id || profile.user_id || profile.id || '').trim();
  }

  function getCurrentUserLabel() {
    const session = window.Session || {};
    const user = typeof session.user === 'function' ? session.user() : {};
    const profile = session.state?.profile || user.profile || {};
    return String(profile.full_name || profile.name || user.full_name || user.name || user.email || profile.email || '').trim();
  }

  function getAgreementPrimaryKey(agreement = {}) {
    return String(agreement.id || agreement.agreement_uuid || agreement.uuid || '').trim();
  }

  function getAgreementBusinessRef(agreement = {}) {
    return String(agreement.agreement_number || agreement.agreement_id || agreement.id || '').trim();
  }

  function getRootAgreementId(agreement = {}) {
    return String(agreement.root_agreement_id || agreement.parent_agreement_id || getAgreementPrimaryKey(agreement) || agreement.agreement_id || '').trim();
  }

  function isSignedAgreement(agreement = {}) {
    return normalizeStatus(agreement.status || agreement.agreement_status) === 'signed';
  }

  function ensureAgreementFieldsPatched() {
    const agreements = window.Agreements;
    if (!agreements || !Array.isArray(agreements.agreementFields)) return;
    LIFECYCLE_FIELDS.forEach(field => {
      if (!agreements.agreementFields.includes(field)) agreements.agreementFields.push(field);
    });
  }

  function fieldToFormId(field = '') {
    return `agreementForm${String(field || '')
      .split('_')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')}`;
  }

  function ensureHiddenLifecycleInputs() {
    const form = document.getElementById('agreementForm');
    if (!form) return;
    LIFECYCLE_FIELDS.forEach(field => {
      const id = fieldToFormId(field);
      if (document.getElementById(id)) return;
      const input = document.createElement('input');
      input.type = 'hidden';
      input.id = id;
      input.name = field;
      input.setAttribute('data-agreement-lifecycle-hidden', 'true');
      form.appendChild(input);
    });
  }

  function ensureLifecycleStyles() {
    if (document.getElementById('agreementLifecycleExtensionStyles')) return;
    const style = document.createElement('style');
    style.id = 'agreementLifecycleExtensionStyles';
    style.textContent = `
      .agreement-lifecycle-panel { border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin-top: 12px; background: var(--card, rgba(255,255,255,.03)); }
      .agreement-lifecycle-panel__header { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap; }
      .agreement-lifecycle-panel__title { margin:0; font-size:15px; font-weight:700; color:var(--text); }
      .agreement-lifecycle-panel__subtitle { margin:4px 0 0; font-size:12px; color:var(--muted); line-height:1.4; }
      .agreement-lifecycle-panel__actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-start; margin-top:10px; }
      .agreement-lifecycle-badge { display:inline-flex; align-items:center; border:1px solid var(--border); border-radius:999px; padding:3px 8px; font-size:12px; color:var(--muted); }
      .agreement-lifecycle-panel .btn[disabled] { opacity:.55; cursor:not-allowed; }
      .agreement-amendments-section { margin-top:14px; border-top:1px solid var(--border); padding-top:12px; }
      .agreement-amendments-section__title { margin:0 0 8px; font-size:14px; font-weight:700; color:var(--text); }
      .agreement-amendments-empty, .agreement-amendments-loading, .agreement-amendments-error { color:var(--muted); font-size:12px; margin:0; }
      .agreement-amendments-error { color:var(--danger, #ef4444); }
      .agreement-amendments-table-wrap { overflow-x:auto; border:1px solid var(--border); border-radius:10px; }
      .agreement-amendments-table { width:100%; border-collapse:collapse; font-size:12px; min-width:760px; }
      .agreement-amendments-table th, .agreement-amendments-table td { padding:8px; border-bottom:1px solid var(--border); text-align:left; vertical-align:top; }
      .agreement-amendments-table th { color:var(--muted); font-weight:700; background:rgba(148,163,184,.08); }
      .agreement-amendments-table tr:last-child td { border-bottom:0; }
      .agreement-amendments-actions { display:flex; gap:6px; flex-wrap:wrap; }
      .agreement-amendment-status { display:inline-flex; border:1px solid var(--border); border-radius:999px; padding:2px 7px; font-weight:700; }
      .agreement-amendment-doc { color:#111827; font-family:Arial,sans-serif; line-height:1.45; padding:32px; }
      .agreement-amendment-doc h1 { margin:0 0 4px; font-size:26px; }
      .agreement-amendment-doc h2 { margin:24px 0 8px; font-size:16px; border-bottom:1px solid #e5e7eb; padding-bottom:6px; }
      .agreement-amendment-doc table { width:100%; border-collapse:collapse; margin-top:8px; }
      .agreement-amendment-doc th, .agreement-amendment-doc td { border:1px solid #e5e7eb; padding:8px; text-align:left; vertical-align:top; }
      .agreement-amendment-doc th { background:#f9fafb; }
      .agreement-amendment-signatures { display:grid; grid-template-columns:1fr 1fr; gap:28px; margin-top:36px; }
      .agreement-amendment-signature-line { border-top:1px solid #111827; padding-top:8px; min-height:42px; }
    `;
    document.head.appendChild(style);
  }

  function ensureLifecyclePanel() {
    ensureLifecycleStyles();
    ensureHiddenLifecycleInputs();
    const form = document.getElementById('agreementForm');
    if (!form) return null;
    let panel = document.getElementById('agreementLifecyclePanel');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'agreementLifecyclePanel';
    panel.className = 'agreement-lifecycle-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="agreement-lifecycle-panel__header">
        <div>
          <div class="agreement-lifecycle-badge" id="agreementLifecycleRelationshipBadge">Original Agreement</div>
          <h3 class="agreement-lifecycle-panel__title">Agreement Lifecycle</h3>
          <p class="agreement-lifecycle-panel__subtitle" id="agreementLifecycleHelpText">
            Signed agreements stay locked. Use amendments or sub-agreements for controlled changes.
          </p>
        </div>
      </div>
      <div class="agreement-lifecycle-panel__actions">
        <button id="agreementCreateAmendmentBtn" class="btn ghost sm" type="button">Create Amendment</button>
        <button id="agreementCreateSubAgreementBtn" class="btn ghost sm" type="button">Create Sub-Agreement</button>
      </div>
      <section class="agreement-amendments-section" aria-label="Amendments">
        <h4 class="agreement-amendments-section__title">Amendments</h4>
        <div id="agreementAmendmentsList"><p class="agreement-amendments-loading">Loading amendments…</p></div>
      </section>
    `;
    const signedDocSection = document.getElementById('agreementSignedDocumentSection');
    if (signedDocSection?.parentElement) {
      signedDocSection.parentElement.insertBefore(panel, signedDocSection);
    } else {
      const actionRow = document.getElementById('agreementFormSaveBtn')?.closest('.actions');
      if (actionRow?.parentElement) actionRow.parentElement.insertBefore(panel, actionRow);
      else form.appendChild(panel);
    }
    return panel;
  }

  function setHiddenField(field, value) {
    const el = document.getElementById(fieldToFormId(field));
    if (el) el.value = value ?? '';
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '');
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  }

  function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '');
    return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function formatMoney(value, currency = '') {
    if (value === null || value === undefined || value === '') return '';
    const amount = Number(value);
    if (!Number.isFinite(amount)) return String(value || '');
    const code = String(currency || '').trim();
    try {
      return new Intl.NumberFormat(undefined, code ? { style: 'currency', currency: code } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    } catch (_) {
      return `${code ? `${code} ` : ''}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }

  function humanize(value) {
    return String(value || '')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, ch => ch.toUpperCase());
  }

  function getAmendmentKey(amendment = {}) {
    return String(amendment.id || amendment.amendment_id || amendment.amendment_reference || '').trim();
  }

  function getAmendmentReference(amendment = {}) {
    return String(amendment.amendment_reference || amendment.amendment_id || amendment.id || '').trim();
  }

  function cacheAmendments(amendments = []) {
    const agreements = window.Agreements;
    if (!agreements?.state) return;
    agreements.state.currentAmendments = Array.isArray(amendments) ? amendments : [];
  }

  function findCachedAmendment(key = '') {
    const normalizedKey = String(key || '').trim();
    const amendments = Array.isArray(window.Agreements?.state?.currentAmendments) ? window.Agreements.state.currentAmendments : [];
    return amendments.find(amendment => [amendment.id, amendment.amendment_id, amendment.amendment_reference].some(value => String(value || '').trim() === normalizedKey)) || null;
  }

  function getAgreementLookupValues(agreement = {}) {
    const values = [
      agreement.id,
      agreement.agreement_uuid,
      agreement.uuid,
      agreement.agreement_id,
      agreement.agreement_number,
      agreement.root_agreement_id || agreement.id || agreement.agreement_id
    ].map(value => String(value || '').trim()).filter(Boolean);
    return [...new Set(values)];
  }

  function buildAmendmentOrFilter(agreement = {}) {
    const parentValues = getAgreementLookupValues(agreement);
    const rootValues = getAgreementLookupValues({ id: agreement.root_agreement_id || agreement.id, agreement_id: agreement.root_agreement_id || agreement.agreement_id, agreement_number: agreement.root_agreement_id || agreement.agreement_number });
    const filters = [];
    parentValues.forEach(value => filters.push(`parent_agreement_id.eq.${value}`));
    rootValues.forEach(value => filters.push(`root_agreement_id.eq.${value}`));
    return filters.join(',');
  }

  function renderAmendmentsList(amendments = []) {
    const container = document.getElementById('agreementAmendmentsList');
    if (!container) return;
    if (!Array.isArray(amendments) || amendments.length === 0) {
      container.innerHTML = '<p class="agreement-amendments-empty">No amendments created yet.</p>';
      return;
    }
    container.innerHTML = `
      <div class="agreement-amendments-table-wrap">
        <table class="agreement-amendments-table">
          <thead>
            <tr>
              <th>Amendment Reference</th>
              <th>Status</th>
              <th>Effective Date</th>
              <th>Billing Impact</th>
              <th>Grand Total</th>
              <th>Created At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${amendments.map(amendment => {
              const key = escapeHtml(getAmendmentKey(amendment));
              const isDraft = normalizeStatus(amendment.status) === 'draft';
              return `
                <tr>
                  <td><strong>${escapeHtml(getAmendmentReference(amendment))}</strong></td>
                  <td><span class="agreement-amendment-status">${escapeHtml(humanize(amendment.status || 'Draft'))}</span></td>
                  <td>${escapeHtml(formatDate(amendment.effective_date) || '—')}</td>
                  <td>${escapeHtml(humanize(amendment.billing_impact) || '—')}</td>
                  <td>${escapeHtml(formatMoney(amendment.grand_total, amendment.currency) || '—')}</td>
                  <td>${escapeHtml(formatDateTime(amendment.created_at) || '—')}</td>
                  <td>
                    <div class="agreement-amendments-actions">
                      <button class="btn ghost sm" type="button" data-agreement-amendment-action="open" data-amendment-key="${key}">Open</button>
                      ${isDraft ? `<button class="btn ghost sm" type="button" data-agreement-amendment-action="edit" data-amendment-key="${key}">Edit Draft</button>` : ''}
                      <button class="btn ghost sm" type="button" data-agreement-amendment-action="preview" data-amendment-key="${key}">Preview</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function loadAgreementAmendments(agreement = {}) {
    const container = document.getElementById('agreementAmendmentsList');
    const client = getSupabaseClient();
    if (!container || !getAgreementPrimaryKey(agreement)) return [];
    if (!client) {
      container.innerHTML = '<p class="agreement-amendments-error">Unable to load amendments: Supabase client is not available.</p>';
      return [];
    }
    container.innerHTML = '<p class="agreement-amendments-loading">Loading amendments…</p>';
    try {
      const filter = buildAmendmentOrFilter(agreement);
      let query = client.from('agreement_amendments').select('*').order('created_at', { ascending: false });
      if (filter) query = query.or(filter);
      const { data, error } = await query;
      if (error) throw error;
      const amendments = Array.isArray(data) ? data : [];
      cacheAmendments(amendments);
      renderAmendmentsList(amendments);
      return amendments;
    } catch (error) {
      console.error('[Agreement Lifecycle] Unable to load amendments', error);
      container.innerHTML = '<p class="agreement-amendments-error">Unable to load amendments.</p>';
      return [];
    }
  }

  function refreshCurrentAgreementAmendments() {
    const agreement = window.Agreements?.state?.currentAgreement || {};
    if (!getAgreementPrimaryKey(agreement)) return Promise.resolve([]);
    return loadAgreementAmendments(agreement);
  }

  function renderLifecyclePanel(agreement = {}) {
    const panel = ensureLifecyclePanel();
    if (!panel) return;
    const hasAgreement = Boolean(getAgreementPrimaryKey(agreement));
    panel.style.display = hasAgreement ? '' : 'none';
    if (!hasAgreement) return;

    const relationshipType = String(agreement.agreement_relationship_type || '').trim() || 'original';
    const relationshipLabel = relationshipType === 'sub_agreement'
      ? 'Sub-Agreement'
      : relationshipType === 'renewal'
        ? 'Renewal Agreement'
        : 'Original Agreement';
    const badge = document.getElementById('agreementLifecycleRelationshipBadge');
    if (badge) badge.textContent = relationshipLabel;

    const signed = isSignedAgreement(agreement);
    const help = document.getElementById('agreementLifecycleHelpText');
    if (help) {
      const ref = getAgreementBusinessRef(agreement) || 'this agreement';
      help.textContent = signed
        ? `${ref} is signed and locked. Create an amendment for changes to the same contract, or a sub-agreement for a separate related scope.`
        : `${ref} must be signed before creating amendments or sub-agreements.`;
    }

    const canCreate = window.Permissions?.canCreateAgreement?.() !== false;
    const amendmentBtn = document.getElementById('agreementCreateAmendmentBtn');
    const subBtn = document.getElementById('agreementCreateSubAgreementBtn');
    if (amendmentBtn) {
      amendmentBtn.disabled = !signed || !canCreate;
      amendmentBtn.title = signed ? 'Create a draft amendment linked to this agreement.' : 'Available only after the agreement is signed.';
    }
    if (subBtn) {
      subBtn.disabled = !signed || !canCreate;
      subBtn.title = signed ? 'Create a new draft sub-agreement under this agreement.' : 'Available only after the agreement is signed.';
    }

    refreshCurrentAgreementAmendments();
  }

  async function getNextAmendmentNumber(parentAgreement) {
    const client = getSupabaseClient();
    const parentId = getAgreementPrimaryKey(parentAgreement) || parentAgreement.agreement_id || '';
    if (!client || !parentId) return 1;
    try {
      const { data, error } = await client
        .from('agreement_amendments')
        .select('amendment_id')
        .eq('parent_agreement_id', parentId);
      if (error) throw error;
      return (Array.isArray(data) ? data.length : 0) + 1;
    } catch (error) {
      console.warn('[Agreement Lifecycle] Unable to count amendments', error);
      return 1;
    }
  }

  function getNextSubAgreementNumber(parentAgreement) {
    const agreements = window.Agreements;
    const parentId = getAgreementPrimaryKey(parentAgreement);
    const parentBusinessRef = getAgreementBusinessRef(parentAgreement);
    const rows = Array.isArray(agreements?.state?.rows) ? agreements.state.rows : [];
    const count = rows.filter(row => {
      const relationship = String(row.agreement_relationship_type || '').trim().toLowerCase();
      const parentMatch = String(row.parent_agreement_id || '').trim() === parentId || String(row.source_agreement_id || '').trim() === parentId;
      const refMatch = parentBusinessRef && String(row.agreement_number || row.agreement_id || '').includes(`${parentBusinessRef}-SUB-`);
      return relationship === 'sub_agreement' && (parentMatch || refMatch);
    }).length;
    return count + 1;
  }

  function formatSequence(value) {
    return String(Number(value || 1)).padStart(2, '0');
  }

  function buildAmendmentReference(parentAgreement, sequence) {
    const base = getAgreementBusinessRef(parentAgreement) || `AG-${Date.now()}`;
    return `${base}-AM-${formatSequence(sequence)}`;
  }

  function buildSubAgreementReference(parentAgreement, sequence) {
    const base = getAgreementBusinessRef(parentAgreement) || `AG-${Date.now()}`;
    return `${base}-SUB-${formatSequence(sequence)}`;
  }

  async function createAgreementAmendmentDraft() {
    const toast = getUiToast();
    const agreements = window.Agreements;
    const source = agreements?.state?.currentAgreement || {};
    if (!getAgreementPrimaryKey(source)) return toast('Open an agreement first.');
    if (!isSignedAgreement(source)) return toast('Only signed agreements can be amended.');

    const reason = window.prompt('Amendment reason / summary:', 'Commercial scope change');
    if (reason === null) return;
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) return toast('Amendment reason is required.');

    const billingImpactRaw = window.prompt(
      'Billing impact: no_billing_impact, invoice_difference_only, or replace_value_going_forward',
      'invoice_difference_only'
    );
    if (billingImpactRaw === null) return;
    const billingImpact = String(billingImpactRaw || 'invoice_difference_only').trim().toLowerCase().replace(/\s+/g, '_');
    const allowedImpacts = ['no_billing_impact', 'invoice_difference_only', 'replace_value_going_forward'];
    if (!allowedImpacts.includes(billingImpact)) {
      return toast('Invalid billing impact. Use no_billing_impact, invoice_difference_only, or replace_value_going_forward.');
    }

    const client = getSupabaseClient();
    if (!client) return toast('Supabase client is not available.');

    const sequence = await getNextAmendmentNumber(source);
    const reference = buildAmendmentReference(source, sequence);
    const now = new Date().toISOString();
    const parentId = getAgreementPrimaryKey(source) || source.agreement_id;
    const payload = {
      amendment_reference: reference,
      parent_agreement_id: parentId,
      root_agreement_id: getRootAgreementId(source),
      client_id: source.client_id || null,
      company_id: source.company_id || null,
      company_name: source.company_name || source.customer_name || source.customer_legal_name || null,
      amendment_type: 'commercial_amendment',
      reason: trimmedReason,
      effective_date: source.service_start_date || source.effective_date || source.agreement_date || null,
      status: 'Draft',
      billing_impact: billingImpact,
      currency: source.currency || null,
      subtotal_locations: Number(source.saas_total || source.subtotal_locations || 0) || 0,
      subtotal_one_time: Number(source.one_time_total || source.subtotal_one_time || 0) || 0,
      grand_total: Number(source.grand_total || 0) || 0,
      notes: `Draft amendment created from agreement ${getAgreementBusinessRef(source)}.`,
      created_by: getCurrentUserId() || null,
      updated_by: getCurrentUserId() || null,
      created_at: now,
      updated_at: now
    };

    try {
      const { data, error } = await client.from('agreement_amendments').insert(payload).select('*').single();
      if (error) throw error;
      const existing = Array.isArray(agreements?.state?.currentAmendments) ? agreements.state.currentAmendments : [];
      cacheAmendments([data || payload, ...existing]);
      renderAmendmentsList(window.Agreements?.state?.currentAmendments || []);
      refreshCurrentAgreementAmendments();
      toast(`Draft amendment created: ${getAmendmentReference(data || payload) || reference}`);
    } catch (error) {
      console.error('[Agreement Lifecycle] Unable to create amendment', error);
      toast('Unable to create amendment. Run the agreement lifecycle SQL migration first, then try again.');
    }
  }

  function resetAgreementSigningFields(draft) {
    const resetFields = [
      'id',
      'signed_date',
      'customer_official_sign_date',
      'customer_sign_date',
      'provider_official_signatory_1_sign_date',
      'provider_official_signatory_2_sign_date',
      'provider_sign_date',
      'signed_document_path',
      'signed_document_name',
      'signed_document_uploaded_at',
      'signed_document_uploaded_by',
      'signed_document_url',
      'signed_agreement_document_path',
      'signed_agreement_document_name',
      'signed_agreement_document_uploaded_at',
      'signed_agreement_document_uploaded_by',
      'signed_agreement_document_url'
    ];
    resetFields.forEach(field => { draft[field] = ''; });
    draft.gm_signed = false;
    draft.financial_controller_signed = false;
    return draft;
  }

  async function createSubAgreementDraft() {
    const toast = getUiToast();
    const agreements = window.Agreements;
    const source = agreements?.state?.currentAgreement || {};
    if (!getAgreementPrimaryKey(source)) return toast('Open an agreement first.');
    if (!isSignedAgreement(source)) return toast('Only signed agreements can have sub-agreements.');
    if (window.Permissions?.canCreateAgreement?.() === false) return toast('You do not have permission to create agreements.');

    const sequence = getNextSubAgreementNumber(source);
    const subReference = buildSubAgreementReference(source, sequence);
    const parentId = getAgreementPrimaryKey(source);
    const draft = resetAgreementSigningFields({ ...source });
    draft.agreement_id = subReference;
    draft.agreement_number = subReference;
    draft.agreement_title = `Sub-Agreement - ${source.agreement_title || getAgreementBusinessRef(source)}`;
    draft.status = 'Draft';
    draft.parent_agreement_id = parentId;
    draft.root_agreement_id = getRootAgreementId(source);
    draft.source_agreement_id = parentId;
    draft.agreement_relationship_type = 'sub_agreement';
    draft.agreement_version = sequence;
    draft.relationship_notes = `Sub-agreement created from ${getAgreementBusinessRef(source)} by ${getCurrentUserLabel() || 'user'}.`;
    draft.proposal_id = '';
    draft.agreement_date = '';

    const clonedItems = (Array.isArray(agreements?.state?.currentItems) ? agreements.state.currentItems : []).map((item, index) => ({
      ...item,
      id: '',
      item_id: agreements?.generateAgreementItemId?.() || `sub-item-${Date.now()}-${index}`,
      agreement_id: '',
      line_no: index + 1
    }));

    ensureHiddenLifecycleInputs();
    agreements.openAgreementForm(draft, clonedItems, { readOnly: false });
    setHiddenField('parent_agreement_id', parentId);
    setHiddenField('root_agreement_id', draft.root_agreement_id);
    setHiddenField('source_agreement_id', parentId);
    setHiddenField('agreement_relationship_type', 'sub_agreement');
    setHiddenField('agreement_version', sequence);
    setHiddenField('relationship_notes', draft.relationship_notes);
    toast('Sub-agreement draft prepared. Review, adjust scope/items if needed, then save.');
  }

  function ensureAmendmentModals() {
    ensureLifecycleStyles();
    let detail = document.getElementById('agreementAmendmentDetailModal');
    if (!detail) {
      detail = document.createElement('div');
      detail.id = 'agreementAmendmentDetailModal';
      detail.className = 'modal';
      detail.setAttribute('role', 'dialog');
      detail.setAttribute('aria-modal', 'true');
      detail.setAttribute('aria-labelledby', 'agreementAmendmentDetailTitle');
      detail.setAttribute('aria-hidden', 'true');
      detail.innerHTML = `
        <div class="modal-content" style="max-width:980px;">
          <div class="header">
            <h2 id="agreementAmendmentDetailTitle" style="margin:0;font-size:20px">Amendment Detail</h2>
            <button class="modal-close" type="button" data-agreement-amendment-close aria-label="Close amendment detail">✕</button>
          </div>
          <form id="agreementAmendmentDetailForm">
            <input type="hidden" id="agreementAmendmentDetailId">
            <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
              <label>Amendment Reference<input id="agreementAmendmentReference" readonly></label>
              <label>Status<input id="agreementAmendmentStatus" readonly></label>
              <label>Reason<textarea id="agreementAmendmentReason" rows="3"></textarea></label>
              <label>Effective Date<input id="agreementAmendmentEffectiveDate" type="date"></label>
              <label>Billing Impact<select id="agreementAmendmentBillingImpact"><option value="no_billing_impact">No Billing Impact</option><option value="invoice_difference_only">Invoice Difference Only</option><option value="replace_value_going_forward">Replace Value Going Forward</option></select></label>
              <label>Currency<input id="agreementAmendmentCurrency"></label>
              <label>Subtotal<input id="agreementAmendmentSubtotalLocations" type="number" step="0.01"></label>
              <label>One-time Subtotal<input id="agreementAmendmentSubtotalOneTime" type="number" step="0.01"></label>
              <label>Tax / Discount<input id="agreementAmendmentTax" type="number" step="0.01"></label>
              <label>Grand Total<input id="agreementAmendmentGrandTotal" type="number" step="0.01"></label>
              <label style="grid-column:1 / -1;">Notes<textarea id="agreementAmendmentNotes" rows="3"></textarea></label>
            </div>
            <div class="card" style="margin-top:12px;">
              <strong>Items</strong>
              <div id="agreementAmendmentItemsList" style="margin-top:8px;"><p class="muted">No amendment items found.</p></div>
            </div>
            <div class="actions" style="justify-content:space-between;gap:8px;margin-top:12px;">
              <div style="display:flex;gap:8px;flex-wrap:wrap;"><button id="agreementAmendmentPreviewBtn" type="button" class="btn ghost">Preview</button></div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                <button type="button" class="btn ghost" data-agreement-amendment-close>Cancel</button>
                <button id="agreementAmendmentSaveDraftBtn" type="submit" class="btn ghost">Save Draft</button>
                <button id="agreementAmendmentMarkSentBtn" type="button" class="btn ghost">Mark as Sent</button>
                <button id="agreementAmendmentMarkSignedBtn" type="button" class="btn">Mark as Signed</button>
              </div>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(detail);
    }

    let preview = document.getElementById('agreementAmendmentPreviewModal');
    if (!preview) {
      preview = document.createElement('div');
      preview.id = 'agreementAmendmentPreviewModal';
      preview.className = 'modal';
      preview.setAttribute('role', 'dialog');
      preview.setAttribute('aria-modal', 'true');
      preview.setAttribute('aria-labelledby', 'agreementAmendmentPreviewTitle');
      preview.setAttribute('aria-hidden', 'true');
      preview.innerHTML = `
        <div class="modal-content" style="max-width:1100px;">
          <div class="header">
            <h2 id="agreementAmendmentPreviewTitle" style="margin:0;font-size:20px">Amendment Preview</h2>
            <button class="modal-close" type="button" data-agreement-amendment-preview-close aria-label="Close amendment preview">✕</button>
          </div>
          <iframe id="agreementAmendmentPreviewFrame" title="Amendment preview content" style="width:100%;min-height:70vh;border:1px solid var(--border);border-radius:10px;background:#fff;"></iframe>
        </div>
      `;
      document.body.appendChild(preview);
    }
  }

  function setModalOpen(modal, open) {
    if (!modal) return;
    modal.classList.toggle('open', Boolean(open));
    modal.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  async function fetchAmendmentItems(amendment = {}) {
    const client = getSupabaseClient();
    const amendmentId = String(amendment.id || '').trim();
    if (!client || !amendmentId) return [];
    try {
      const { data, error } = await client
        .from('agreement_amendment_items')
        .select('*')
        .eq('amendment_id', amendmentId)
        .order('line_no', { ascending: true });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn('[Agreement Lifecycle] Unable to load amendment items', error);
      return [];
    }
  }

  function renderAmendmentItems(items = [], currency = '') {
    if (!Array.isArray(items) || !items.length) return '<p class="muted">No amendment items found.</p>';
    return `
      <div class="agreement-amendments-table-wrap">
        <table class="agreement-amendments-table">
          <thead><tr><th>#</th><th>Item</th><th>Location</th><th>Qty</th><th>Unit Price</th><th>Billing Effect</th><th>Total</th></tr></thead>
          <tbody>${items.map((item, index) => `
            <tr>
              <td>${escapeHtml(item.line_no || index + 1)}</td>
              <td>${escapeHtml(item.item_name || item.section || '—')}</td>
              <td>${escapeHtml(item.location_name || item.location_address || '—')}</td>
              <td>${escapeHtml(item.quantity ?? '—')}</td>
              <td>${escapeHtml(formatMoney(item.unit_price, currency) || '—')}</td>
              <td>${escapeHtml(humanize(item.billing_effect) || '—')}</td>
              <td>${escapeHtml(formatMoney(item.line_total, currency) || '—')}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      </div>
    `;
  }

  function readAmendmentForm() {
    const id = document.getElementById('agreementAmendmentDetailId')?.value || '';
    return {
      id,
      reason: document.getElementById('agreementAmendmentReason')?.value || '',
      effective_date: document.getElementById('agreementAmendmentEffectiveDate')?.value || null,
      billing_impact: document.getElementById('agreementAmendmentBillingImpact')?.value || 'invoice_difference_only',
      currency: document.getElementById('agreementAmendmentCurrency')?.value || null,
      subtotal_locations: Number(document.getElementById('agreementAmendmentSubtotalLocations')?.value || 0),
      subtotal_one_time: Number(document.getElementById('agreementAmendmentSubtotalOneTime')?.value || 0),
      total_discount: Number(document.getElementById('agreementAmendmentTax')?.value || 0),
      grand_total: Number(document.getElementById('agreementAmendmentGrandTotal')?.value || 0),
      notes: document.getElementById('agreementAmendmentNotes')?.value || ''
    };
  }

  function populateAmendmentForm(amendment = {}, items = [], { forceEdit = false } = {}) {
    ensureAmendmentModals();
    const isDraft = normalizeStatus(amendment.status) === 'draft';
    const canEdit = isDraft && (forceEdit || true);
    const setValue = (id, value) => { const el = document.getElementById(id); if (el) el.value = value ?? ''; };
    setValue('agreementAmendmentDetailId', amendment.id || '');
    setValue('agreementAmendmentReference', getAmendmentReference(amendment));
    setValue('agreementAmendmentStatus', humanize(amendment.status || 'Draft'));
    setValue('agreementAmendmentReason', amendment.reason || '');
    setValue('agreementAmendmentEffectiveDate', amendment.effective_date || '');
    setValue('agreementAmendmentBillingImpact', amendment.billing_impact || 'invoice_difference_only');
    setValue('agreementAmendmentCurrency', amendment.currency || '');
    setValue('agreementAmendmentSubtotalLocations', amendment.subtotal_locations ?? 0);
    setValue('agreementAmendmentSubtotalOneTime', amendment.subtotal_one_time ?? 0);
    setValue('agreementAmendmentTax', amendment.total_discount ?? amendment.tax ?? 0);
    setValue('agreementAmendmentGrandTotal', amendment.grand_total ?? 0);
    setValue('agreementAmendmentNotes', amendment.notes || '');

    const editableIds = ['agreementAmendmentReason', 'agreementAmendmentEffectiveDate', 'agreementAmendmentBillingImpact', 'agreementAmendmentCurrency', 'agreementAmendmentSubtotalLocations', 'agreementAmendmentSubtotalOneTime', 'agreementAmendmentTax', 'agreementAmendmentGrandTotal', 'agreementAmendmentNotes'];
    editableIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !canEdit;
    });
    const itemsList = document.getElementById('agreementAmendmentItemsList');
    if (itemsList) itemsList.innerHTML = renderAmendmentItems(items, amendment.currency);
    const saveBtn = document.getElementById('agreementAmendmentSaveDraftBtn');
    if (saveBtn) saveBtn.style.display = isDraft ? '' : 'none';
    const sentBtn = document.getElementById('agreementAmendmentMarkSentBtn');
    if (sentBtn) sentBtn.style.display = normalizeStatus(amendment.status) === 'signed' ? 'none' : '';
    const signedBtn = document.getElementById('agreementAmendmentMarkSignedBtn');
    if (signedBtn) signedBtn.style.display = normalizeStatus(amendment.status) === 'signed' ? 'none' : '';
    const title = document.getElementById('agreementAmendmentDetailTitle');
    if (title) title.textContent = `Amendment Detail · ${getAmendmentReference(amendment)}`;
    const modal = document.getElementById('agreementAmendmentDetailModal');
    if (modal) {
      modal.dataset.amendmentKey = getAmendmentKey(amendment);
      modal.dataset.amendmentItems = JSON.stringify(items || []);
    }
  }

  async function resolveAmendment(key = '') {
    let amendment = findCachedAmendment(key);
    const client = getSupabaseClient();
    if (!amendment && client && key) {
      const { data, error } = await client
        .from('agreement_amendments')
        .select('*')
        .or(`id.eq.${key},amendment_id.eq.${key},amendment_reference.eq.${key}`)
        .maybeSingle();
      if (error) throw error;
      amendment = data;
    }
    return amendment;
  }

  async function openAmendmentDetail(key = '', { edit = false } = {}) {
    const toast = getUiToast();
    try {
      const amendment = await resolveAmendment(key);
      if (!amendment) return toast('Unable to find amendment.');
      const items = await fetchAmendmentItems(amendment);
      populateAmendmentForm(amendment, items, { forceEdit: edit });
      setModalOpen(document.getElementById('agreementAmendmentDetailModal'), true);
    } catch (error) {
      console.error('[Agreement Lifecycle] Unable to open amendment', error);
      toast('Unable to open amendment.');
    }
  }

  async function saveAmendmentDraft(statusOverride = '') {
    const toast = getUiToast();
    const client = getSupabaseClient();
    const payload = readAmendmentForm();
    if (!client || !payload.id) return toast('Unable to save amendment.');
    const current = findCachedAmendment(payload.id) || {};
    if (normalizeStatus(current.status) === 'signed') return toast('Signed amendments are locked.');
    const updates = {
      reason: payload.reason,
      effective_date: payload.effective_date,
      billing_impact: payload.billing_impact,
      currency: payload.currency,
      subtotal_locations: payload.subtotal_locations,
      subtotal_one_time: payload.subtotal_one_time,
      total_discount: payload.total_discount,
      grand_total: payload.grand_total,
      notes: payload.notes,
      updated_by: getCurrentUserId() || null,
      updated_at: new Date().toISOString()
    };
    if (statusOverride) {
      updates.status = statusOverride;
      if (normalizeStatus(statusOverride) === 'signed') updates.signed_at = new Date().toISOString();
    }
    try {
      const { data, error } = await client.from('agreement_amendments').update(updates).eq('id', payload.id).select('*').single();
      if (error) throw error;
      const amendments = (Array.isArray(window.Agreements?.state?.currentAmendments) ? window.Agreements.state.currentAmendments : []).map(amendment => String(amendment.id) === String(payload.id) ? data : amendment);
      cacheAmendments(amendments);
      renderAmendmentsList(amendments);
      populateAmendmentForm(data, await fetchAmendmentItems(data));
      toast(statusOverride ? `Amendment marked as ${humanize(statusOverride)}.` : 'Draft amendment saved.');
    } catch (error) {
      console.error('[Agreement Lifecycle] Unable to save amendment', error);
      toast('Unable to save amendment.');
    }
  }

  function buildAmendmentPreviewHtml(amendment = {}, items = []) {
    const parent = window.Agreements?.state?.currentAgreement || {};
    const currency = amendment.currency || parent.currency || '';
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(getAmendmentReference(amendment))}</title><style>
        body{margin:0;background:#fff;color:#111827;font-family:Arial,sans-serif;}
        .agreement-amendment-doc{line-height:1.45;padding:32px;}
        h1{margin:0 0 4px;font-size:26px;}
        h2{margin:24px 0 8px;font-size:16px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;}
        table{width:100%;border-collapse:collapse;margin-top:8px;}
        th,td{border:1px solid #e5e7eb;padding:8px;text-align:left;vertical-align:top;}
        th{background:#f9fafb;}
        .agreement-amendment-signatures{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:36px;}
        .agreement-amendment-signature-line{border-top:1px solid #111827;padding-top:8px;min-height:42px;}
      </style></head><body>
      <article class="agreement-amendment-doc">
        <h1>Agreement Amendment</h1>
        <p><strong>Parent Agreement:</strong> ${escapeHtml(getAgreementBusinessRef(parent) || amendment.parent_agreement_id || '—')}</p>
        <p><strong>Amendment Reference:</strong> ${escapeHtml(getAmendmentReference(amendment))}</p>
        <h2>Parties and Summary</h2>
        <table><tbody>
          <tr><th>Client / Company</th><td>${escapeHtml(amendment.company_name || parent.company_name || parent.customer_name || '—')}</td></tr>
          <tr><th>Status</th><td>${escapeHtml(humanize(amendment.status || 'Draft'))}</td></tr>
          <tr><th>Reason</th><td>${escapeHtml(amendment.reason || '—')}</td></tr>
          <tr><th>Effective Date</th><td>${escapeHtml(formatDate(amendment.effective_date) || '—')}</td></tr>
          <tr><th>Billing Impact</th><td>${escapeHtml(humanize(amendment.billing_impact) || '—')}</td></tr>
        </tbody></table>
        <h2>Commercial Summary</h2>
        <table><tbody>
          <tr><th>Currency</th><td>${escapeHtml(currency || '—')}</td></tr>
          <tr><th>Subtotal</th><td>${escapeHtml(formatMoney(amendment.subtotal_locations, currency) || '—')}</td></tr>
          <tr><th>One-time Subtotal</th><td>${escapeHtml(formatMoney(amendment.subtotal_one_time, currency) || '—')}</td></tr>
          <tr><th>Tax / Discount</th><td>${escapeHtml(formatMoney(amendment.total_discount, currency) || '—')}</td></tr>
          <tr><th>Grand Total</th><td><strong>${escapeHtml(formatMoney(amendment.grand_total, currency) || '—')}</strong></td></tr>
        </tbody></table>
        <h2>Items</h2>
        ${renderAmendmentItems(items, currency).replace('agreement-amendments-table-wrap', '').replaceAll('agreement-amendments-table', '')}
        <h2>Notes</h2>
        <p>${escapeHtml(amendment.notes || 'No additional notes.')}</p>
        <h2>Signatures</h2>
        <div class="agreement-amendment-signatures">
          <div><div class="agreement-amendment-signature-line">Client Authorized Signatory</div></div>
          <div><div class="agreement-amendment-signature-line">Provider Authorized Signatory</div></div>
        </div>
      </article>
    </body></html>`;
  }

  async function previewAmendment(key = '') {
    const toast = getUiToast();
    try {
      const amendment = key ? await resolveAmendment(key) : { ...findCachedAmendment(document.getElementById('agreementAmendmentDetailModal')?.dataset?.amendmentKey), ...readAmendmentForm() };
      if (!amendment) return toast('Unable to preview amendment.');
      const modal = document.getElementById('agreementAmendmentDetailModal');
      let items = [];
      try { items = JSON.parse(modal?.dataset?.amendmentItems || '[]'); } catch (_) { items = []; }
      if (key || !items.length) items = await fetchAmendmentItems(amendment);
      ensureAmendmentModals();
      const title = document.getElementById('agreementAmendmentPreviewTitle');
      if (title) title.textContent = `Amendment Preview · ${getAmendmentReference(amendment)}`;
      const frame = document.getElementById('agreementAmendmentPreviewFrame');
      if (frame) frame.srcdoc = buildAmendmentPreviewHtml(amendment, items);
      setModalOpen(document.getElementById('agreementAmendmentPreviewModal'), true);
    } catch (error) {
      console.error('[Agreement Lifecycle] Unable to preview amendment', error);
      toast('Unable to preview amendment.');
    }
  }

  function bindLifecycleActions() {
    if (document.body?.dataset?.agreementLifecycleBound === 'true') return;
    document.body?.addEventListener('click', event => {
      const amendmentBtn = event.target?.closest?.('#agreementCreateAmendmentBtn');
      if (amendmentBtn) {
        event.preventDefault();
        createAgreementAmendmentDraft();
        return;
      }
      const subBtn = event.target?.closest?.('#agreementCreateSubAgreementBtn');
      if (subBtn) {
        event.preventDefault();
        createSubAgreementDraft();
        return;
      }

      const amendmentAction = event.target?.closest?.('[data-agreement-amendment-action]');
      if (amendmentAction) {
        event.preventDefault();
        const key = amendmentAction.getAttribute('data-amendment-key') || '';
        const action = amendmentAction.getAttribute('data-agreement-amendment-action') || '';
        if (action === 'preview') previewAmendment(key);
        else openAmendmentDetail(key, { edit: action === 'edit' });
        return;
      }

      if (event.target?.closest?.('[data-agreement-amendment-close]')) {
        event.preventDefault();
        setModalOpen(document.getElementById('agreementAmendmentDetailModal'), false);
        return;
      }

      if (event.target?.closest?.('[data-agreement-amendment-preview-close]')) {
        event.preventDefault();
        setModalOpen(document.getElementById('agreementAmendmentPreviewModal'), false);
        return;
      }

      if (event.target?.closest?.('#agreementAmendmentPreviewBtn')) {
        event.preventDefault();
        previewAmendment();
        return;
      }

      if (event.target?.closest?.('#agreementAmendmentMarkSentBtn')) {
        event.preventDefault();
        saveAmendmentDraft('Sent');
        return;
      }

      if (event.target?.closest?.('#agreementAmendmentMarkSignedBtn')) {
        event.preventDefault();
        saveAmendmentDraft('Signed');
      }
    });
    document.body?.addEventListener('submit', event => {
      if (event.target?.id === 'agreementAmendmentDetailForm') {
        event.preventDefault();
        saveAmendmentDraft();
      }
    });
    if (document.body) document.body.dataset.agreementLifecycleBound = 'true';
  }

  function patchAgreements() {
    const agreements = window.Agreements;
    if (!agreements || agreements.__lifecycleExtensionPatched) return;
    ensureAgreementFieldsPatched();

    const originalOpen = agreements.openAgreementForm?.bind(agreements);
    agreements.openAgreementForm = function patchedOpenAgreementForm(agreement, items, options) {
      const result = originalOpen ? originalOpen(agreement, items, options) : undefined;
      ensureAgreementFieldsPatched();
      ensureHiddenLifecycleInputs();
      renderLifecyclePanel(this.state?.currentAgreement || agreement || {});
      return result;
    };

    const originalClose = agreements.closeAgreementForm?.bind(agreements);
    agreements.closeAgreementForm = function patchedCloseAgreementForm() {
      const panel = document.getElementById('agreementLifecyclePanel');
      if (panel) panel.style.display = 'none';
      return originalClose ? originalClose() : undefined;
    };

    const originalWire = agreements.wire?.bind(agreements);
    agreements.wire = function patchedAgreementWire() {
      ensureAgreementFieldsPatched();
      ensureHiddenLifecycleInputs();
      bindLifecycleActions();
      return originalWire ? originalWire() : undefined;
    };

    const originalNormalize = agreements.normalizeAgreement?.bind(agreements);
    agreements.normalizeAgreement = function patchedNormalizeAgreement(raw = {}) {
      const normalized = originalNormalize ? originalNormalize(raw) : { ...(raw || {}) };
      LIFECYCLE_FIELDS.forEach(field => {
        const camel = field.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
        const value = raw?.[field] ?? raw?.[camel] ?? normalized?.[field] ?? '';
        normalized[field] = typeof value === 'string' ? value.trim() : value;
      });
      return normalized;
    };

    agreements.__lifecycleExtensionPatched = true;
  }

  function boot() {
    patchAgreements();
    ensureHiddenLifecycleInputs();
    bindLifecycleActions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
