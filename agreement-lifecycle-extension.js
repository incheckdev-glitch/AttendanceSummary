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
      const { error } = await client.from('agreement_amendments').insert(payload).select('*').single();
      if (error) throw error;
      toast(`Draft amendment created: ${reference}`);
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
