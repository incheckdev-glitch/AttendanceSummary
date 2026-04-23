const WorkflowEngine = {
  processingRequests: 0,
  beginRequestProcessing(message = 'Processing request…') {
    this.processingRequests += 1;
    if (this.processingRequests !== 1) return;

    if (typeof UI !== 'undefined' && typeof UI.spinner === 'function') UI.spinner(true);
    const statusNode = typeof E !== 'undefined' ? E.loadingStatus : null;
    if (statusNode) statusNode.textContent = message;
  },
  endRequestProcessing() {
    if (this.processingRequests > 0) this.processingRequests -= 1;
    if (this.processingRequests !== 0) return;

    if (typeof UI !== 'undefined' && typeof UI.spinner === 'function') UI.spinner(false);
  },
  toBool(value) {
    if (typeof value === 'boolean') return value;
    const normalized = String(value || '').trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    return false;
  },
  toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  },
  normalizeRole(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ');
  },
  roleMatches(allowedRoles = [], userRole = '') {
    const normalizedUserRole = this.normalizeRole(userRole);
    if (!normalizedUserRole) return false;
    return allowedRoles.some(role => this.normalizeRole(role) === normalizedUserRole);
  },
  parseAllowedRoles(rule = {}) {
    if (Array.isArray(rule.allowed_roles)) return rule.allowed_roles;
    return String(rule.allowed_roles || rule.allowed_roles_csv || '')
      .split(',')
      .map(value => String(value || '').trim())
      .filter(Boolean);
  },
  parseApprovalRoles(rule = {}) {
    if (Array.isArray(rule.approval_roles)) return rule.approval_roles;
    return String(rule.approval_roles_csv || rule.approval_role || '')
      .split(',')
      .map(value => String(value || '').trim())
      .filter(Boolean);
  },
  evaluateLocalRule(resource, record, requestedChanges = {}) {
    const rules = Array.isArray(window.Workflow?.state?.rules) ? window.Workflow.state.rules : [];
    const normalizedResource = String(resource || '').trim().toLowerCase();
    const currentStatus = String(requestedChanges?.current_status || record?.status || '').trim().toLowerCase();
    const requestedStatus = String(requestedChanges?.requested_status || '').trim().toLowerCase();
    const requestedDiscount = this.toNumber(requestedChanges?.discount_percent);
    const userRole = Session?.role?.() || '';

    const matchingRule = rules.find(rule => {
      if (rule?.is_active === false) return false;
      if (String(rule?.resource || '').trim().toLowerCase() !== normalizedResource) return false;
      const ruleCurrent = String(rule?.current_status || '').trim().toLowerCase();
      const ruleNext = String(rule?.next_status || '').trim().toLowerCase();
      if (ruleCurrent && currentStatus && ruleCurrent !== currentStatus) return false;
      if (ruleNext && requestedStatus && ruleNext !== requestedStatus) return false;
      const allowedRoles = this.parseAllowedRoles(rule);
      if (allowedRoles.length && !this.roleMatches(allowedRoles, userRole)) return false;
      return true;
    });

    if (!matchingRule) return null;

    const hardStopLimit = this.toNumber(matchingRule?.hard_stop_discount_percent);
    if (hardStopLimit > 0 && requestedDiscount > hardStopLimit) {
      return {
        allowed: false,
        reason: `Requested discount ${requestedDiscount}% exceeds hard stop limit ${hardStopLimit}%.`,
        requestedDiscount,
        userDiscountLimit: this.toNumber(matchingRule?.max_discount_percent),
        hardStopDiscountLimit: hardStopLimit
      };
    }

    const maxDiscount = this.toNumber(matchingRule?.max_discount_percent);
    const requiresApprovalFlag = this.toBool(matchingRule?.requires_approval);
    if ((maxDiscount > 0 && requestedDiscount > maxDiscount) || requiresApprovalFlag) {
      const approvalRoles = this.parseApprovalRoles(matchingRule);
      const approvalRolesLabel = approvalRoles.join(', ');
      return {
        allowed: false,
        approvalCreated: false,
        pendingApproval: true,
        reason: approvalRolesLabel
          ? `Approval from ${approvalRolesLabel} is required before this transition.`
          : 'Approval is required before this transition.',
        requestedDiscount,
        userDiscountLimit: maxDiscount || null,
        hardStopDiscountLimit: hardStopLimit || null,
        approval_roles: approvalRoles
      };
    }

    return null;
  },
  async validateWorkflowTransition(resource, record, requestedChanges = {}) {
    const normalizedResource = String(resource || '').trim().toLowerCase();
    const safeRecord = record && typeof record === 'object' ? record : {};
    const safeRequestedChanges = requestedChanges && typeof requestedChanges === 'object' ? requestedChanges : {};
    const currentStatus = String(
      safeRequestedChanges.current_status || safeRequestedChanges.from_status || safeRecord.current_status || safeRecord.status || ''
    ).trim();
    const nextStatus = String(
      safeRequestedChanges.next_status || safeRequestedChanges.requested_status || safeRequestedChanges.to_status || ''
    ).trim();
    const parsedDiscount = Number(
      safeRequestedChanges.discount_percent ?? safeRecord.discount_percent ?? 0
    );
    const discountPercent = Number.isFinite(parsedDiscount) ? parsedDiscount : 0;
    const recordId = String(
      safeRequestedChanges.record_id ||
      safeRequestedChanges.id ||
      safeRecord.id ||
      safeRecord.proposal_id ||
      safeRecord.agreement_id ||
      safeRecord.invoice_id ||
      safeRecord.receipt_id ||
      ''
    ).trim();

    const payload = {
      resource: 'workflow',
      action: 'validate_transition',
      target_workflow_resource: normalizedResource,
      current_status: currentStatus,
      requested_status: nextStatus,
      discount_percent: discountPercent,
      record_id: recordId,
      record: safeRecord,
      requested_changes: safeRequestedChanges
    };
    return Api.validateWorkflowTransition(payload);
  },
  async enforceBeforeSave(resource, record, requestedChanges = {}) {
    const validationUnavailableResult = {
      allowed: false,
      pendingApproval: false,
      approvalCreated: false,
      reason: 'Workflow validation is unavailable. Save blocked until workflow is reachable.'
    };
    this.beginRequestProcessing('Checking workflow approval request…');
    try {
      const validationResult = await this.validateWorkflowTransition(resource, record, requestedChanges);
      try { console.info('[workflow] validation result', validationResult); } catch {}
      const hasUsableValidation =
        validationResult &&
        typeof validationResult === 'object' &&
        (
          Object.prototype.hasOwnProperty.call(validationResult, 'allowed') ||
          Object.prototype.hasOwnProperty.call(validationResult, 'is_allowed') ||
          Object.prototype.hasOwnProperty.call(validationResult, 'pendingApproval') ||
          Object.prototype.hasOwnProperty.call(validationResult, 'pending_approval') ||
          Object.prototype.hasOwnProperty.call(validationResult, 'approvalCreated') ||
          Object.prototype.hasOwnProperty.call(validationResult, 'approval_created') ||
          Object.prototype.hasOwnProperty.call(validationResult, 'reason')
        );
      if (!hasUsableValidation) {
        try { console.info('[workflow] final decision', validationUnavailableResult); } catch {}
        return validationUnavailableResult;
      }

      const allowed = this.toBool(validationResult?.allowed ?? validationResult?.is_allowed);
      const pendingApproval = this.toBool(validationResult?.pendingApproval ?? validationResult?.pending_approval);

      if (allowed === true) {
        const workflowCheck = {
          allowed: true,
          pendingApproval: false,
          approvalCreated: false,
          reason: validationResult?.reason || 'Allowed'
        };
        try { console.info('[workflow] final decision', workflowCheck); } catch {}
        return workflowCheck;
      }

      if (pendingApproval === true) {
        const submittedByName =
          window.Session?.authContext?.()?.profile?.name ||
          window.Session?.authContext?.()?.profile?.full_name ||
          '';
        const submittedByEmail = window.Session?.authContext?.()?.user?.email || '';
        const submittedByRole = window.Session?.role?.() || '';
        const normalizedRequestedChanges = {
          proposal_id: record?.proposal_id || requestedChanges?.id || record?.id || '',
          proposal_number:
            record?.proposal_number ||
            record?.proposal_reference ||
            requestedChanges?.proposal_number ||
            requestedChanges?.proposal_reference ||
            '',
          client_id: record?.client_id || requestedChanges?.client_id || '',
          client_name:
            record?.client_name ||
            record?.company_name ||
            requestedChanges?.client_name ||
            requestedChanges?.company_name ||
            '',
          company_name:
            record?.company_name ||
            record?.client_name ||
            requestedChanges?.company_name ||
            requestedChanges?.client_name ||
            '',
          current_status: requestedChanges?.current_status || record?.status || '',
          requested_status: requestedChanges?.requested_status || requestedChanges?.next_status || record?.status || '',
          discount_percent: Number(requestedChanges?.discount_percent ?? record?.discount_percent ?? 0),
          total_amount: Number(requestedChanges?.total_amount ?? record?.total_amount ?? 0),
          title: requestedChanges?.title || record?.title || '',
          subject: requestedChanges?.subject || record?.subject || '',
          submitted_by_name: submittedByName,
          submitted_by_email: submittedByEmail,
          submitted_by_role: submittedByRole,
          changed_fields: requestedChanges?.changed_fields || [],
          record_snapshot: record || {}
        };
        const approvalPayload = {
          resource,
          record_id: String(requestedChanges?.id || record?.proposal_id || record?.id || '').trim(),
          workflow_rule_id: validationResult?.workflow_rule_id || null,
          requester_user_id: window.Session?.authContext?.()?.user?.id || null,
          requester_role: submittedByRole,
          approval_role: String(validationResult?.approval_role || 'admin').trim(),
          old_status: String(requestedChanges?.current_status || record?.status || '').trim(),
          new_status: String(requestedChanges?.requested_status || requestedChanges?.next_status || record?.status || '').trim(),
          requested_changes: normalizedRequestedChanges
        };
        try {
          const approvalResult = await Api.createWorkflowApproval(approvalPayload);
          try { console.info('[workflow] approval creation result', approvalResult); } catch {}
          if (approvalResult?.ok === true) {
            const workflowCheck = {
              allowed: false,
              pendingApproval: true,
              approvalCreated: true,
              approvalId: approvalResult?.approval_id,
              approvalRole: approvalResult?.approval_role,
              reason: approvalResult?.reused
                ? 'Approval request already exists and is pending.'
                : 'Approval request submitted successfully.'
            };
            try { console.info('[workflow] final decision', workflowCheck); } catch {}
            return workflowCheck;
          }
        } catch (error) {
          console.error('[workflow approval create failed]', error);
        }
        const workflowCheck = {
          allowed: false,
          pendingApproval: true,
          approvalCreated: false,
          reason: 'Approval is required, but the approval request could not be created yet. Please retry.'
        };
        try { console.info('[workflow] final decision', workflowCheck); } catch {}
        return workflowCheck;
      }

      const workflowCheck = {
        allowed: false,
        pendingApproval: false,
        approvalCreated: false,
        reason: validationResult?.reason || 'Blocked by workflow rule.'
      };
      try { console.info('[workflow] final decision', workflowCheck); } catch {}
      return workflowCheck;
    } catch (error) {
      console.error('[workflow] validation unavailable', error);
      try { console.info('[workflow] final decision', validationUnavailableResult); } catch {}
      return validationUnavailableResult;
    } finally {
      this.endRequestProcessing();
    }
  },
  getWorkflowBadgeHtml(status) {
    const raw = String(status || '').trim() || 'Unknown';
    const normalized = raw.toLowerCase();
    const css =
      normalized.includes('pending') ? 'warning' : normalized.includes('approved') ? 'success' : normalized.includes('reject') ? 'danger' : normalized.includes('escalat') ? 'info' : 'muted';
    return `<span class="pill ${css}">${U.escapeHtml(raw)}</span>`;
  },
  composeDeniedMessage(result, fallbackPrefix = 'Action blocked by workflow rules.') {
    if (result?.pendingApproval === true && result?.approvalCreated === true) {
      const reason = String(result?.reason || '').trim() || 'Approval request submitted successfully.';
      return `${fallbackPrefix} ${reason}`.trim();
    }
    const reason = String(result?.reason || '').trim();
    const hasDiscountData = result && result.requestedDiscount != null && result.userDiscountLimit != null;
    const discountPart = hasDiscountData
      ? ` Your limit: ${result.userDiscountLimit}% · requested: ${result.requestedDiscount}%.`
      : '';
    const approvalPart = result?.approvalCreated
      ? ' Approval request was created and is pending review.'
      : '';
    return `${fallbackPrefix}${reason ? ` ${reason}` : ''}${discountPart}${approvalPart}`.trim();
  }
};

const Workflow = {
  state: {
    rules: [],
    approvals: [],
    audit: [],
    loading: false,
    loadError: '',
    loaded: false,
    lastLoadedAt: 0,
    cacheTtlMs: 2 * 60 * 1000,
    editingRuleLegacyId: ''
  },
  resourceOptions: ['proposals', 'agreements', 'invoices', 'receipts'],
  resourceStatusOptions: {
    proposals: ['Draft', 'Pending Approval', 'Sent', 'Viewed', 'Under Discussion', 'Accepted', 'Rejected', 'Expired'],
    agreements: ['Draft', 'Sent', 'Under Review', 'Revision Required', 'Approved', 'Signed', 'Rejected', 'Expired', 'Cancelled'],
    invoices: ['Draft', 'Issued', 'Sent', 'Unpaid', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'],
    receipts: ['Issued', 'Partially Paid', 'Paid', 'Cancelled']
  },
  resourceFieldOptions: {
    proposals: ['title', 'status', 'customer_name', 'subtotal', 'discount_percent', 'tax_percent', 'total_amount', 'valid_until', 'notes'],
    agreements: ['status', 'customer_name', 'service_start_date', 'service_end_date', 'payment_term', 'grand_total', 'notes'],
    invoices: ['status', 'customer_name', 'issue_date', 'due_date', 'subtotal_locations', 'subtotal_one_time', 'invoice_total', 'received_amount', 'pending_amount', 'payment_state', 'amount_in_words', 'notes'],
    receipts: ['status', 'customer_name', 'receipt_date', 'payment_method', 'payment_reference', 'amount_received', 'invoice_total', 'pending_amount', 'payment_state', 'amount_in_words', 'notes']
  },
  currentRole() {
    return String(Session?.role?.() || Session?.state?.role || '').trim().toLowerCase();
  },
  canManageWorkflowRules() {
    if (typeof Permissions?.canManageWorkflow === 'function') return Boolean(Permissions.canManageWorkflow());
    return ['admin', 'dev'].includes(this.currentRole());
  },
  canProcessApprovals() {
    return ['admin', 'dev'].includes(this.currentRole());
  },
  normalizeRows(response) {
    const parseJsonIfNeeded = value => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      if (!(trimmed.startsWith('[') || trimmed.startsWith('{'))) return value;
      try {
        return JSON.parse(trimmed);
      } catch (_error) {
        return value;
      }
    };
    const normalizeKey = key =>
      String(key || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    const normalizeRowObject = row => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
      const normalized = {};
      Object.entries(row).forEach(([key, value]) => {
        const canonical = normalizeKey(key);
        if (!canonical) return;
        normalized[canonical] = value;
      });
      return normalized;
    };
    const rowsFromColumns = (columns, rows) => {
      if (!Array.isArray(columns) || !Array.isArray(rows)) return [];
      const normalizedColumns = columns.map(col => normalizeKey(col));
      return rows
        .map(row => {
          if (!Array.isArray(row)) return normalizeRowObject(row);
          return normalizedColumns.reduce((acc, key, idx) => {
            if (key) acc[key] = row[idx];
            return acc;
          }, {});
        })
        .filter(Boolean);
    };
    const coerceRows = value => {
      const parsed = parseJsonIfNeeded(value);
      if (Array.isArray(parsed)) {
        if (!parsed.length) return [];
        if (Array.isArray(parsed[0])) {
          const [header, ...rows] = parsed;
          if (Array.isArray(header) && header.length) return rowsFromColumns(header, rows);
          return [];
        }
        return parsed.map(item => normalizeRowObject(item)).filter(Boolean);
      }
      if (!parsed || typeof parsed !== 'object') return [];

      if (Array.isArray(parsed.columns) && Array.isArray(parsed.rows)) {
        const mapped = rowsFromColumns(parsed.columns, parsed.rows);
        if (mapped.length) return mapped;
      }
      if (Array.isArray(parsed.headers) && Array.isArray(parsed.values)) {
        const mapped = rowsFromColumns(parsed.headers, parsed.values);
        if (mapped.length) return mapped;
      }
      if (Array.isArray(parsed.values) && Array.isArray(parsed.values[0])) {
        const [header, ...rows] = parsed.values;
        if (Array.isArray(header) && header.length) {
          const mapped = rowsFromColumns(header, rows);
          if (mapped.length) return mapped;
        }
      }
      const values = Object.values(parsed).filter(Boolean);
      if (values.length && values.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
        return values.map(item => normalizeRowObject(item)).filter(Boolean);
      }
      return [];
    };
    const candidates = [
      response,
      response?.items,
      response?.rows,
      response?.data,
      response?.result,
      response?.payload,
      response?.data?.items,
      response?.data?.rows,
      response?.result?.items,
      response?.result?.rows,
      response?.payload?.items,
      response?.payload?.rows
    ];
    for (const candidate of candidates) {
      const rows = coerceRows(candidate);
      if (rows.length) return rows;
    }
    return [];
  },
  normalizeWorkflowRule(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const pick = (...values) => {
      for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
      return '';
    };
    const normalizedAllowedRoles = (() => {
      const value = pick(source.allowed_roles, source.allowed_roles_csv, source.allowedroles);
      if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
      return String(value || '')
        .split(',')
        .map(item => String(item || '').trim())
        .filter(Boolean);
    })();
    const normalizedApprovalRoles = (() => {
      const value = pick(source.approval_roles, source.approval_roles_csv, source.approval_role, source.approvalrole);
      if (Array.isArray(value)) return value.map(item => String(item || '').trim().toLowerCase()).filter(Boolean);
      return String(value || '')
        .split(',')
        .map(item => String(item || '').trim().toLowerCase())
        .filter(Boolean);
    })();
    const resolvedWorkflowRuleId = String(
      pick(source.workflow_rule_id, source.rule_id, source.miorder, source.minorder, source.id)
    ).trim();
    return {
      ...source,
      workflow_rule_id: resolvedWorkflowRuleId,
      id: String(pick(source.id)).trim(),
      resource: String(pick(source.resource)).trim().toLowerCase(),
      current_status: String(pick(source.current_status)).trim(),
      next_status: String(pick(source.next_status)).trim(),
      allowed_roles: normalizedAllowedRoles,
      allowed_roles_csv: normalizedAllowedRoles.join(','),
      requires_approval: WorkflowEngine.toBool(
        pick(source.requires_approval, source.requiresapproval)
      ),
      approval_roles: normalizedApprovalRoles,
      approval_roles_csv: normalizedApprovalRoles.join(','),
      approval_role: normalizedApprovalRoles[0] || '',
      max_discount_percent: Number(pick(source.max_discount_percent, source.maxdiscountpercent) || 0),
      hard_stop_discount_percent: Number(
        pick(source.hard_stop_discount_percent, source.hardstopdiscountpercent) || 0
      ),
      editable_fields: Array.isArray(source.editable_fields)
        ? source.editable_fields
        : String(pick(source.editable_fields, source.editablefields))
            .split(',')
            .map(field => String(field || '').trim())
            .filter(Boolean),
      required_fields: Array.isArray(source.required_fields)
        ? source.required_fields
        : String(pick(source.required_fields, source.requiredfields))
            .split(',')
            .map(field => String(field || '').trim())
            .filter(Boolean),
      require_comment: WorkflowEngine.toBool(
        pick(source.require_comment, source.requirecomment)
      ),
      require_attachment: WorkflowEngine.toBool(
        pick(source.require_attachment, source.requireattachment)
      ),
      is_active: WorkflowEngine.toBool(pick(source.is_active, source.isactive, true))
    };
  },
  getRulePayloadFromForm() {
    const get = id => String(E[id]?.value || '').trim();
    const workflowRuleId = get('workflowRuleId');
    const legacyId = String(this.state.editingRuleLegacyId || '').trim();
    const payload = {
      id: legacyId,
      resource: get('workflowResource').toLowerCase(),
      current_status: get('workflowCurrentStatus'),
      next_status: get('workflowNextStatus'),
      allowed_roles: this.getMultiSelectValues(E.workflowAllowedRoles).map(v => v.toLowerCase()),
      requires_approval: String(get('workflowRequiresApproval')) === 'true',
      approval_roles: this.getMultiSelectValues(E.workflowApprovalRoles).map(v => v.toLowerCase()),
      max_discount_percent: Number(get('workflowMaxDiscount') || 0),
      hard_stop_discount_percent: Number(get('workflowHardStopDiscount') || 0),
      editable_fields: this.getMultiSelectValues(E.workflowEditableFields),
      required_fields: this.getMultiSelectValues(E.workflowRequiredFields),
      require_comment: String(get('workflowRequireComment')) === 'true',
      require_attachment: String(get('workflowRequireAttachment')) === 'true',
      is_active: String(get('workflowIsActive')) !== 'false'
    };
    if (workflowRuleId) payload.workflow_rule_id = workflowRuleId;
    return payload;
  },
  sanitizeRuleSavePayload(payload = {}) {
    const clean = payload && typeof payload === 'object' ? { ...payload } : {};
    delete clean.allowed_roles_csv;
    delete clean.approval_roles_csv;
    delete clean.rule_id;
    delete clean.miorder;
    delete clean.minorder;
    return clean;
  },
  fillRuleForm(rule = {}) {
    const normalizedRule = this.normalizeWorkflowRule(rule);
    const editableFields = Array.isArray(rule.editable_fields) ? rule.editable_fields : String(rule.editable_fields || '').split(',');
    const requiredFields = Array.isArray(rule.required_fields) ? rule.required_fields : String(rule.required_fields || '').split(',');
    if (E.workflowRuleId) E.workflowRuleId.value = normalizedRule.workflow_rule_id || '';
    this.state.editingRuleLegacyId = String(normalizedRule.id || '').trim();
    if (E.workflowResource) E.workflowResource.value = normalizedRule.resource || '';
    if (E.workflowCurrentStatus) E.workflowCurrentStatus.value = normalizedRule.current_status || '';
    if (E.workflowNextStatus) E.workflowNextStatus.value = normalizedRule.next_status || '';
    if (E.workflowRequiresApproval) E.workflowRequiresApproval.value = String(WorkflowEngine.toBool(normalizedRule.requires_approval));
    if (E.workflowMaxDiscount) E.workflowMaxDiscount.value = normalizedRule.max_discount_percent ?? '';
    if (E.workflowHardStopDiscount) E.workflowHardStopDiscount.value = normalizedRule.hard_stop_discount_percent ?? '';
    if (E.workflowRequireComment) E.workflowRequireComment.value = String(WorkflowEngine.toBool(normalizedRule.require_comment));
    if (E.workflowRequireAttachment) E.workflowRequireAttachment.value = String(WorkflowEngine.toBool(normalizedRule.require_attachment));
    if (E.workflowIsActive) E.workflowIsActive.value = String(normalizedRule.is_active !== false);
    this.populateRuleSelects();
    this.setMultiSelectValues(E.workflowAllowedRoles, normalizedRule.allowed_roles || []);
    this.setMultiSelectValues(E.workflowApprovalRoles, normalizedRule.approval_roles || [normalizedRule.approval_role].filter(Boolean));
    this.setMultiSelectValues(E.workflowEditableFields, editableFields);
    this.setMultiSelectValues(E.workflowRequiredFields, requiredFields);
  },
  resetRuleForm() {
    if (E.workflowRuleForm) E.workflowRuleForm.reset();
    if (E.workflowRuleId) E.workflowRuleId.value = '';
    this.state.editingRuleLegacyId = '';
    this.populateRuleSelects();
  },
  setSelectOptions(selectEl, values = [], placeholder = '') {
    if (!selectEl) return;
    const currentValue = String(selectEl.value || '').trim();
    const uniq = [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))];
    selectEl.innerHTML = [placeholder ? `<option value="">${U.escapeHtml(placeholder)}</option>` : '', ...uniq.map(value => `<option value="${U.escapeAttr(value)}">${U.escapeHtml(value)}</option>`)]
      .filter(Boolean)
      .join('');
    if (currentValue && uniq.includes(currentValue)) selectEl.value = currentValue;
  },
  getStatusesForResource(resourceValue = '') {
    const resource = String(resourceValue || '').trim().toLowerCase();
    const statuses = new Set();
    (this.resourceStatusOptions[resource] || []).forEach(status => statuses.add(status));
    if (resource === 'invoices' && Array.isArray(window.Invoices?.statusOptions)) {
      window.Invoices.statusOptions.forEach(status => statuses.add(String(status || '').trim()));
    }
    this.state.rules
      .filter(rule => String(rule.resource || '').trim().toLowerCase() === resource)
      .forEach(rule => {
        if (rule.current_status) statuses.add(String(rule.current_status).trim());
        if (rule.next_status) statuses.add(String(rule.next_status).trim());
      });
    const moduleStateRows = {
      proposals: window.Proposals?.state?.rows,
      agreements: window.Agreements?.state?.rows,
      invoices: window.Invoices?.state?.rows,
      receipts: window.Receipts?.state?.rows
    }[resource];
    if (Array.isArray(moduleStateRows)) {
      moduleStateRows.forEach(row => {
        const status = String(row?.status || '').trim();
        if (status) statuses.add(status);
      });
    }
    return [...statuses].sort((a, b) => a.localeCompare(b));
  },
  getSystemRoles() {
    const roleMap = new Map();
    (window.RolesAdmin?.state?.roles || []).forEach(role => {
      const key = String(role?.role_key || role?.key || role?.role || '').trim().toLowerCase();
      if (!key) return;
      const display = String(role?.display_name || role?.name || '').trim();
      roleMap.set(key, display || key);
    });
    this.state.rules.forEach(rule => {
      const roles = Array.isArray(rule.allowed_roles)
        ? rule.allowed_roles
        : String(rule.allowed_roles || rule.allowed_roles_csv || '').split(',');
      roles.map(v => String(v || '').trim().toLowerCase()).filter(Boolean).forEach(role => {
        if (!roleMap.has(role)) roleMap.set(role, role);
      });
      const approvalRoles = Array.isArray(rule.approval_roles)
        ? rule.approval_roles
        : String(rule.approval_roles || rule.approval_roles_csv || rule.approval_role || '').split(',');
      approvalRoles.map(v => String(v || '').trim().toLowerCase()).filter(Boolean).forEach(role => {
        if (!roleMap.has(role)) roleMap.set(role, role);
      });
    });
    return [...roleMap.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => String(a.label || a.value).localeCompare(String(b.label || b.value)));
  },
  setRoleSelectOptions(selectEl, roles = [], placeholder = '') {
    if (!selectEl) return;
    const currentValue = String(selectEl.value || '').trim().toLowerCase();
    const options = roles
      .map(item => ({
        value: String(item?.value || '').trim().toLowerCase(),
        label: String(item?.label || item?.value || '').trim()
      }))
      .filter(item => item.value)
      .filter((item, idx, arr) => arr.findIndex(candidate => candidate.value === item.value) === idx);
    selectEl.innerHTML = [
      placeholder ? `<option value="">${U.escapeHtml(placeholder)}</option>` : '',
      ...options.map(({ value, label }) => `<option value="${U.escapeAttr(value)}">${U.escapeHtml(label)}</option>`)
    ]
      .filter(Boolean)
      .join('');
    if (currentValue && options.some(option => option.value === currentValue)) selectEl.value = currentValue;
  },
  getMultiSelectValues(selectEl) {
    if (!selectEl) return [];
    return Array.from(selectEl.selectedOptions || [])
      .map(option => String(option.value || '').trim())
      .filter(Boolean);
  },
  parseRoleList(value, fallback = '') {
    if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
    return String(value || fallback || '')
      .split(',')
      .map(item => String(item || '').trim())
      .filter(Boolean);
  },
  normalizePendingApproval(row = {}) {
    let requestedChanges = row?.requested_changes;
    if (typeof requestedChanges === 'string') {
      try {
        requestedChanges = JSON.parse(requestedChanges);
      } catch (_error) {
        requestedChanges = {};
      }
    }
    if (!requestedChanges || typeof requestedChanges !== 'object') requestedChanges = {};
    return {
      ...row,
      displayResource: row?.resource || '—',
      displayRecordNumber:
        requestedChanges?.proposal_number ||
        requestedChanges?.proposal_reference ||
        requestedChanges?.proposal_id ||
        row?.record_id ||
        '—',
      displayCompany: requestedChanges?.client_name || requestedChanges?.company_name || '—',
      displayRequestedBy:
        requestedChanges?.submitted_by_name ||
        requestedChanges?.submitted_by_email ||
        row?.requester_role ||
        '—',
      displayCurrent: row?.old_status || requestedChanges?.current_status || '—',
      displayRequested: row?.new_status || requestedChanges?.requested_status || '—',
      displayDiscount: Number(requestedChanges?.discount_percent ?? 0),
      displayApprovalRoles: row?.approval_role || '—'
    };
  },
  formatDiscountPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0%';
    return `${numeric}%`;
  },
  async openApproval(item = {}) {
    const normalized = this.normalizePendingApproval(item);
    const normalizedResource = String(normalized.resource || '').trim().toLowerCase();
    const requestedChanges = normalized.requested_changes && typeof normalized.requested_changes === 'object'
      ? normalized.requested_changes
      : {};
    if (normalizedResource === 'proposals') {
      const proposalId = String(
        normalized.record_id ||
        requestedChanges?.proposal_id ||
        ''
      ).trim();
      if (proposalId && typeof window.Proposals?.openProposalFormById === 'function') {
        try {
          await window.Proposals.openProposalFormById(proposalId, { readOnly: true, trigger: 'workflow-approval-open' });
          return;
        } catch (error) {
          console.warn('Unable to open proposal directly from approval row', error);
        }
      }
    }
    const action = window.prompt(
      [
        'Approval details',
        `Proposal #: ${normalized.displayRecordNumber}`,
        `Company: ${normalized.displayCompany}`,
        `Current status: ${normalized.displayCurrent}`,
        `Requested status: ${normalized.displayRequested}`,
        `Discount: ${this.formatDiscountPercent(normalized.displayDiscount)}`,
        `Requested by: ${normalized.displayRequestedBy}`,
        `Approval role: ${normalized.displayApprovalRoles}`,
        '',
        'Submitted changes:',
        JSON.stringify(requestedChanges, null, 2),
        '',
        'Type "approve" to approve, "reject" to reject, or leave empty to close.'
      ].join('\n'),
      ''
    );
    const normalizedAction = String(action || '').trim().toLowerCase();
    if (normalizedAction === 'approve' || normalizedAction === 'reject') {
      await this.actOnApproval(normalizedAction, normalized.approval_id);
    }
  },
  setMultiSelectValues(selectEl, values = []) {
    if (!selectEl) return;
    const normalized = new Set(
      (Array.isArray(values) ? values : [values])
        .map(value => String(value || '').trim())
        .filter(Boolean)
    );
    Array.from(selectEl.options || []).forEach(option => {
      option.selected = normalized.has(String(option.value || '').trim());
    });
  },
  setMultiSelectOptions(selectEl, values = []) {
    if (!selectEl) return;
    const selected = new Set(this.getMultiSelectValues(selectEl));
    const options = [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    selectEl.innerHTML = options.map(value => `<option value="${U.escapeAttr(value)}">${U.escapeHtml(value)}</option>`).join('');
    Array.from(selectEl.options || []).forEach(option => {
      option.selected = selected.has(String(option.value || '').trim());
    });
  },
  getFieldsForResource(resourceValue = '') {
    const resource = String(resourceValue || '').trim().toLowerCase();
    const fields = new Set(this.resourceFieldOptions[resource] || []);
    this.state.rules
      .filter(rule => String(rule.resource || '').trim().toLowerCase() === resource)
      .forEach(rule => {
        const editable = Array.isArray(rule.editable_fields) ? rule.editable_fields : String(rule.editable_fields || '').split(',');
        const required = Array.isArray(rule.required_fields) ? rule.required_fields : String(rule.required_fields || '').split(',');
        [...editable, ...required]
          .map(field => String(field || '').trim())
          .filter(Boolean)
          .forEach(field => fields.add(field));
      });
    const moduleStateRows = {
      proposals: window.Proposals?.state?.rows,
      agreements: window.Agreements?.state?.rows,
      invoices: window.Invoices?.state?.rows,
      receipts: window.Receipts?.state?.rows
    }[resource];
    if (Array.isArray(moduleStateRows)) {
      moduleStateRows.slice(0, 10).forEach(row => {
        Object.keys(row || {}).forEach(key => {
          const field = String(key || '').trim();
          if (!field || field.endsWith('_id') || field === 'id') return;
          fields.add(field);
        });
      });
    }
    return [...fields];
  },
  populateRuleSelects() {
    this.setSelectOptions(E.workflowResource, this.resourceOptions, 'Select resource');
    const selectedResource = String(E.workflowResource?.value || '').trim().toLowerCase();
    const statusOptions = selectedResource ? this.getStatusesForResource(selectedResource) : [];
    this.setSelectOptions(E.workflowCurrentStatus, statusOptions, 'Select current status');
    this.setSelectOptions(E.workflowNextStatus, statusOptions, 'Select next status');
    const roles = this.getSystemRoles();
    this.setRoleSelectOptions(E.workflowAllowedRoles, roles, 'Select allowed roles');
    this.setRoleSelectOptions(E.workflowApprovalRoles, roles, 'Select approval roles');
    const fieldOptions = selectedResource ? this.getFieldsForResource(selectedResource) : [];
    this.setMultiSelectOptions(E.workflowEditableFields, fieldOptions);
    this.setMultiSelectOptions(E.workflowRequiredFields, fieldOptions);
  },
  renderRules() {
    if (!E.workflowRulesTbody) return;
    const resourceFilter = String(E.workflowResourceFilter?.value || '').trim().toLowerCase();
    const allRows = Array.isArray(this.state.rules) ? this.state.rules : [];
    const rows = allRows.filter(rule => !resourceFilter || String(rule.resource || '').toLowerCase() === resourceFilter);
    const infoEl = document.getElementById('workflowRulesDebug');
    if (infoEl) {
      infoEl.textContent = `Loaded ${allRows.length} workflow rule(s)` + (resourceFilter ? ` • filter: ${resourceFilter}` : '');
    }
    if (this.state.loadError) {
      E.workflowRulesTbody.innerHTML = `<tr><td colspan="9" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(this.state.loadError)}</td></tr>`;
      return;
    }
    if (!allRows.length) {
      E.workflowRulesTbody.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;">No workflow rules returned by API.</td></tr>';
      return;
    }
    if (!rows.length) {
      E.workflowRulesTbody.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;">No rules match the current filter. Clear filter to see all.</td></tr>';
      return;
    }
    E.workflowRulesTbody.innerHTML = rows.map(rule => {
      const approvalRoles = this.parseRoleList(rule.approval_roles, rule.approval_roles_csv || rule.approval_role);
      return `
      <tr>
        <td>${U.escapeHtml(rule.resource || '—')}</td>
        <td>${U.escapeHtml(rule.current_status || '—')}</td>
        <td>${U.escapeHtml(rule.next_status || '—')}</td>
        <td>${U.escapeHtml(Array.isArray(rule.allowed_roles) ? rule.allowed_roles.join(', ') : String(rule.allowed_roles || rule.allowed_roles_csv || '—'))}</td>
        <td>${WorkflowEngine.toBool(rule.requires_approval) ? `Yes (${U.escapeHtml(approvalRoles.join(', ') || 'required')})` : 'No'}</td>
        <td>${U.escapeHtml(String(rule.max_discount_percent ?? '—'))}</td>
        <td>${U.escapeHtml(String(rule.hard_stop_discount_percent ?? '—'))}</td>
        <td>${WorkflowEngine.toBool(rule.is_active) ? 'Yes' : 'No'}</td>
        <td>${this.canManageWorkflowRules()
          ? `<button class="chip-btn" data-rule-edit="${U.escapeHtml(rule.workflow_rule_id || rule.id || '')}">Edit</button> <button class="chip-btn" data-rule-delete="${U.escapeHtml(rule.workflow_rule_id || rule.id || '')}">Delete</button>`
          : '<span class="muted">Read only</span>'}</td>
      </tr>`;
    }).join('');
  },
  renderDiscountPolicy() {
    if (!E.workflowDiscountPolicyTbody) return;
    const rows = [];
    this.state.rules.forEach(rule => {
      const allowedRoles = Array.isArray(rule.allowed_roles) ? rule.allowed_roles : String(rule.allowed_roles || '').split(',').map(v => v.trim()).filter(Boolean);
      allowedRoles.forEach(role => rows.push({ resource: rule.resource, role, max: rule.max_discount_percent, hardStop: rule.hard_stop_discount_percent }));
    });
    E.workflowDiscountPolicyTbody.innerHTML = rows.map(row => `<tr><td>${U.escapeHtml(row.resource || '—')}</td><td>${U.escapeHtml(row.role || '—')}</td><td>${U.escapeHtml(String(row.max ?? '—'))}</td><td>${U.escapeHtml(String(row.hardStop ?? '—'))}</td></tr>`).join('') || '<tr><td colspan="4" class="muted" style="text-align:center;">No discount policy found.</td></tr>';
  },
  renderApprovals() {
    if (!E.workflowApprovalsTbody) return;
    const currentRole = this.currentRole();
    E.workflowApprovalsTbody.innerHTML = this.state.approvals.map(item => {
      const normalized = this.normalizePendingApproval(item);
      const approvalRoles = this.parseRoleList(item.approval_roles, item.approval_roles_csv || normalized.displayApprovalRoles).map(v => v.toLowerCase());
      return `
      <tr>
        <td>${U.escapeHtml(normalized.displayResource)}</td><td>${U.escapeHtml(normalized.displayRecordNumber)}</td><td>${U.escapeHtml(normalized.displayCompany)}</td><td>${U.escapeHtml(normalized.displayRequestedBy)}</td>
        <td>${WorkflowEngine.getWorkflowBadgeHtml(normalized.displayCurrent)}</td><td>${WorkflowEngine.getWorkflowBadgeHtml(normalized.displayRequested)}</td><td>${U.escapeHtml(this.formatDiscountPercent(normalized.displayDiscount))}</td><td>${U.escapeHtml(approvalRoles.join(', ') || normalized.displayApprovalRoles)}</td>
        <td>${WorkflowEngine.getWorkflowBadgeHtml(item.status || 'Pending Approval')}</td>
        <td>${this.canProcessApprovals() || approvalRoles.includes(currentRole)
          ? `<button class="chip-btn" data-approval-action="open" data-approval-id="${U.escapeHtml(item.approval_id || '')}">Open</button> <button class="chip-btn" data-approval-action="approve" data-approval-id="${U.escapeHtml(item.approval_id || '')}">Approve</button> <button class="chip-btn" data-approval-action="reject" data-approval-id="${U.escapeHtml(item.approval_id || '')}">Reject</button>`
          : '<span class="muted">No action</span>'}</td>
      </tr>
    `; }).join('') || '<tr><td colspan="10" class="muted" style="text-align:center;">No pending approvals.</td></tr>';
  },
  renderAudit() {
    if (!E.workflowAuditTbody) return;
    if (!this.canProcessApprovals()) {
      E.workflowAuditTbody.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;">Audit log is visible to admin/dev only.</td></tr>';
      return;
    }
    const query = String(E.workflowAuditSearch?.value || '').trim().toLowerCase();
    const resource = String(E.workflowAuditResourceFilter?.value || '').trim().toLowerCase();
    const allowedFilter = String(E.workflowAuditAllowedFilter?.value || '').trim();
    const rows = this.state.audit.filter(item => {
      if (resource && String(item.resource || '').toLowerCase() !== resource) return false;
      if (allowedFilter && String(item.allowed) !== allowedFilter) return false;
      if (!query) return true;
      const hay = [item.resource, item.record_id, item.action, item.user_name, item.reason, item.old_status, item.new_status].join(' ').toLowerCase();
      return hay.includes(query);
    });
    E.workflowAuditTbody.innerHTML = rows.map(item => `<tr><td>${U.escapeHtml(U.fmtTS(item.created_at) || item.created_at || '—')}</td><td>${U.escapeHtml(item.resource || '—')}</td><td>${U.escapeHtml(String(item.record_id || '—'))}</td><td>${U.escapeHtml(item.action || '—')}</td><td>${U.escapeHtml(item.old_status || '—')}</td><td>${U.escapeHtml(item.new_status || '—')}</td><td>${U.escapeHtml(item.user_name || '—')}</td><td>${WorkflowEngine.toBool(item.allowed) ? '✅' : '❌'}</td><td>${U.escapeHtml(item.reason || '—')}</td></tr>`).join('') || '<tr><td colspan="9" class="muted" style="text-align:center;">No audit entries.</td></tr>';
  },
  renderMatrix() {
    if (!E.workflowMatrixContainer) return;
    const resource = String(E.workflowMatrixResource?.value || 'proposals').trim().toLowerCase();
    const rules = this.state.rules.filter(rule => String(rule.resource || '').toLowerCase() === resource);
    const configuredStatuses = rules
      .flatMap(rule => [rule.current_status, rule.next_status])
      .map(status => String(status || '').trim())
      .filter(Boolean);
    const fallbackStatuses = this.getStatusesForResource(resource);
    const statuses = [...new Set([...(configuredStatuses.length ? configuredStatuses : fallbackStatuses)])]
      .sort((a, b) => String(a).localeCompare(String(b)));
    if (!statuses.length) {
      E.workflowMatrixContainer.innerHTML = '<div class="muted">No status transitions configured for this resource.</div>';
      return;
    }
    const cells = statuses.map(from => `<tr><th>${U.escapeHtml(from)}</th>${statuses.map(to => {
      const matched = rules.find(rule => String(rule.current_status||'').toLowerCase()===String(from).toLowerCase() && String(rule.next_status||'').toLowerCase()===String(to).toLowerCase());
      return `<td><button class="chip-btn" data-matrix-from="${U.escapeHtml(from)}" data-matrix-to="${U.escapeHtml(to)}">${matched ? 'Configured' : '—'}</button></td>`;
    }).join('')}</tr>`).join('');
    E.workflowMatrixContainer.innerHTML = `<table><thead><tr><th>From \ To</th>${statuses.map(s=>`<th>${U.escapeHtml(s)}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table>`;
  },
  async loadAndRefresh(force = false) {
    if (this.state.loading && !force) return;
    const hasWarmCache = this.state.loaded && Date.now() - this.state.lastLoadedAt <= this.state.cacheTtlMs;
    if (hasWarmCache && !force) {
      this.renderRules();
      this.renderDiscountPolicy();
      this.renderApprovals();
      this.renderAudit();
      this.renderMatrix();
      return;
    }
    this.state.loading = true;
    this.state.loadError = '';
    try {
      if (window.RolesAdmin?.ensureRolesLoaded) {
        try {
          await window.RolesAdmin.ensureRolesLoaded(force);
        } catch (error) {
          console.warn('Workflow roles preload failed', error);
        }
      }
      const canReadWorkflowAdminData = this.canProcessApprovals();
      const [rulesResult, approvalsResult, auditResult] = await Promise.allSettled([
        Api.listWorkflowRules({}, { forceRefresh: true }),
        Api.listPendingWorkflowApprovals(),
        canReadWorkflowAdminData ? Api.listWorkflowAudit() : Promise.resolve([])
      ]);
      if (rulesResult.status !== 'fulfilled') {
        throw rulesResult.reason || new Error('Workflow rules request failed.');
      }
      const normalizedRules = this.normalizeRows(rulesResult.value).map(rule => this.normalizeWorkflowRule(rule));
      this.state.rules = normalizedRules;
      this.state.approvals = approvalsResult.status === 'fulfilled' ? this.normalizeRows(approvalsResult.value) : [];
      this.state.audit = auditResult.status === 'fulfilled' ? this.normalizeRows(auditResult.value) : [];
      if (approvalsResult.status !== 'fulfilled') {
        console.warn('Workflow approvals load failed', approvalsResult.reason);
      }
      if (auditResult.status !== 'fulfilled') {
        console.warn('Workflow audit load failed', auditResult.reason);
      }
      this.state.loadError = '';
      this.state.loaded = true;
      this.state.lastLoadedAt = Date.now();
      this.renderRules();
      this.renderDiscountPolicy();
      this.renderApprovals();
      this.renderAudit();
      this.renderMatrix();
      this.populateRuleSelects();
    } catch (error) {
      console.warn('Workflow load failed', error);
      this.state.rules = [];
      this.state.approvals = [];
      this.state.audit = [];
      this.state.loadError = `Unable to load workflow data. ${String(error?.message || 'Unknown error').trim()}`;
      UI.toast(this.state.loadError);
      this.renderRules();
    } finally {
      this.state.loading = false;
    }
  },
  async saveRule() {
    if (!this.canManageWorkflowRules()) {
      UI.toast('Forbidden.');
      return;
    }
    const payload = this.sanitizeRuleSavePayload(this.getRulePayloadFromForm());
    if (!payload.resource || !payload.current_status || !payload.next_status || !payload.allowed_roles.length) {
      return UI.toast('resource, current status, next status, and allowed roles are required.');
    }
    const response = await Api.saveWorkflowRule(payload);
    const normalizedRows = this.normalizeRows(response);
    const responseRule = normalizedRows[0] || response?.rule || response?.data?.rule || payload;
    const savedRule = this.normalizeWorkflowRule(responseRule);
    const resolvedRuleId =
      String(savedRule.workflow_rule_id || '').trim() ||
      String(payload.workflow_rule_id || '').trim();
    if (!resolvedRuleId) {
      throw new Error('Workflow rule saved but no database workflow_rule_id was returned.');
    }
    savedRule.workflow_rule_id = resolvedRuleId;
    savedRule.id = String(savedRule.id || payload.id || '').trim();

    const payloadLegacyId = String(payload.id || '').trim();
    const idx = this.state.rules.findIndex(rule => {
      const ruleWorkflowId = String(rule.workflow_rule_id || '').trim();
      const ruleLegacyId = String(rule.id || '').trim();
      if (ruleWorkflowId && ruleWorkflowId === resolvedRuleId) return true;
      if (payloadLegacyId && ruleLegacyId && ruleLegacyId === payloadLegacyId) return true;
      return false;
    });
    if (idx === -1) this.state.rules.unshift(savedRule);
    else this.state.rules[idx] = { ...this.state.rules[idx], ...savedRule, workflow_rule_id: resolvedRuleId };

    if (E.workflowResourceFilter) {
      const activeFilter = String(E.workflowResourceFilter.value || '').trim().toLowerCase();
      if (activeFilter && activeFilter !== savedRule.resource) E.workflowResourceFilter.value = '';
    }
    UI.toast(payload.workflow_rule_id ? 'Workflow rule updated.' : 'Workflow rule created.');
    this.resetRuleForm();
    this.renderRules();
    this.renderMatrix();
    await this.loadAndRefresh(true);
  },
  async deleteRule(ruleOrId) {
    if (!this.canManageWorkflowRules()) {
      UI.toast('Forbidden.');
      return;
    }
    const normalizedRuleOrId = String(ruleOrId || '').trim();
    const rule = ruleOrId && typeof ruleOrId === 'object'
      ? ruleOrId
      : this.state.rules.find(item => {
          const itemWorkflowId = String(item.workflow_rule_id || '').trim();
          const itemLegacyId = String(item.id || '').trim();
          return (itemWorkflowId && itemWorkflowId === normalizedRuleOrId) || (itemLegacyId && itemLegacyId === normalizedRuleOrId);
        }) || {};
    const id = String(rule.workflow_rule_id || normalizedRuleOrId || '').trim();
    const legacyId = String(rule.id || '').trim();
    if (!id && !legacyId) return;
    if (!window.confirm(`Delete workflow rule ${id}?`)) return;
    await Api.deleteWorkflowRule({ workflow_rule_id: id, id: legacyId });
    this.state.rules = this.state.rules.filter(item => {
      const itemWorkflowId = String(item.workflow_rule_id || '').trim();
      const itemLegacyId = String(item.id || '').trim();
      if (itemWorkflowId && itemWorkflowId === id) return false;
      if (legacyId && itemLegacyId && itemLegacyId === legacyId) return false;
      return true;
    });
    UI.toast('Workflow rule deleted.');
    this.renderRules();
    this.renderMatrix();
  },
  async actOnApproval(action, approvalId) {
    if (!this.canProcessApprovals()) {
      UI.toast('Forbidden.');
      return;
    }
    const id = String(approvalId || '').trim();
    if (!id) return;
    const reviewer_comment = window.prompt(`${action === 'approve' ? 'Approval' : 'Rejection'} comment`, '') || '';
    if (action === 'approve') await Api.approveWorkflowRequest({ approval_id: id, reviewer_comment });
    else await Api.rejectWorkflowRequest({ approval_id: id, reviewer_comment });
    UI.toast(`Approval ${action}d.`);
    await this.loadAndRefresh(true);
  },
  wire() {
    if (E.workflowRuleForm) {
      E.workflowRuleForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (!this.canManageWorkflowRules()) return UI.toast('Forbidden.');
        try {
          await this.saveRule();
        } catch (error) {
          UI.toast(error?.message || 'Unable to save workflow rule.');
        }
      });
    }
    if (E.workflowRuleResetBtn) E.workflowRuleResetBtn.addEventListener('click', () => this.resetRuleForm());
    if (E.workflowRefreshBtn) E.workflowRefreshBtn.addEventListener('click', () => this.loadAndRefresh(true));
    if (E.workflowResourceFilter) E.workflowResourceFilter.addEventListener('change', () => this.renderRules());
    if (E.workflowResource) E.workflowResource.addEventListener('change', () => this.populateRuleSelects());
    if (E.workflowMatrixResource) E.workflowMatrixResource.addEventListener('change', () => this.renderMatrix());
    [E.workflowAuditSearch, E.workflowAuditResourceFilter, E.workflowAuditAllowedFilter].forEach(el => {
      if (!el) return;
      el.addEventListener('input', () => this.renderAudit());
      el.addEventListener('change', () => this.renderAudit());
    });

    if (E.workflowRulesTbody) {
      E.workflowRulesTbody.addEventListener('click', async event => {
        const editId = event.target?.closest?.('[data-rule-edit]')?.getAttribute('data-rule-edit');
        const deleteId = event.target?.closest?.('[data-rule-delete]')?.getAttribute('data-rule-delete');
        if (editId) {
          const normalizedEditId = String(editId || '').trim();
          const rule = this.state.rules.find(item => {
            const itemWorkflowId = String(item.workflow_rule_id || '').trim();
            const itemLegacyId = String(item.id || '').trim();
            return (itemWorkflowId && itemWorkflowId === normalizedEditId) || (itemLegacyId && itemLegacyId === normalizedEditId);
          });
          if (rule) this.fillRuleForm(rule);
        }
        if (deleteId) {
          try {
            const normalizedDeleteId = String(deleteId || '').trim();
            const rule = this.state.rules.find(item => {
              const itemWorkflowId = String(item.workflow_rule_id || '').trim();
              const itemLegacyId = String(item.id || '').trim();
              return (itemWorkflowId && itemWorkflowId === normalizedDeleteId) || (itemLegacyId && itemLegacyId === normalizedDeleteId);
            });
            await this.deleteRule(rule || deleteId);
          } catch (error) {
            UI.toast(error?.message || 'Unable to delete workflow rule.');
          }
        }
      });
    }
    if (E.workflowApprovalsTbody) {
      E.workflowApprovalsTbody.addEventListener('click', async event => {
        const button = event.target?.closest?.('[data-approval-action]');
        if (!button) return;
        try {
          const action = button.getAttribute('data-approval-action');
          const approvalId = button.getAttribute('data-approval-id');
          if (action === 'open') {
            const approval = this.state.approvals.find(item => String(item?.approval_id || '').trim() === String(approvalId || '').trim());
            await this.openApproval(approval || {});
            return;
          }
          await this.actOnApproval(action, approvalId);
        } catch (error) {
          UI.toast(error?.message || 'Unable to process approval action.');
        }
      });
    }
    if (E.workflowMatrixContainer) {
      E.workflowMatrixContainer.addEventListener('click', event => {
        const button = event.target?.closest?.('[data-matrix-from]');
        if (!button) return;
        const from = button.getAttribute('data-matrix-from');
        const to = button.getAttribute('data-matrix-to');
        const resource = String(E.workflowMatrixResource?.value || '').trim();
        const rule = this.state.rules.find(item => String(item.resource || '').toLowerCase() === resource.toLowerCase() && String(item.current_status || '').toLowerCase() === String(from || '').toLowerCase() && String(item.next_status || '').toLowerCase() === String(to || '').toLowerCase());
        this.fillRuleForm(rule || { resource, current_status: from, next_status: to, is_active: true });
      });
    }
  }
};

window.WorkflowEngine = WorkflowEngine;
window.Workflow = Workflow;
