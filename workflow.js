
function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

function normalizeWorkflowStatus(value) {
  return normalizeText(value);
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function getItemCategory(item) {
  const raw = normalizeText(
    item?.item_type ||
    item?.category ||
    item?.section ||
    item?.billing_type ||
    item?.billing_cycle ||
    item?.fee_type ||
    ''
  );

  if (
    raw.includes('saas') ||
    raw.includes('annual') ||
    raw.includes('subscription') ||
    raw.includes('recurring')
  ) {
    return 'annual_saas';
  }

  if (
    raw.includes('one_time') ||
    raw.includes('one-time') ||
    raw.includes('one time') ||
    raw.includes('setup') ||
    raw.includes('implementation') ||
    raw.includes('installation') ||
    raw.includes('fee')
  ) {
    return 'one_time_fee';
  }

  return 'unknown';
}

function getItemDiscountPercent(item) {
  return Math.max(
    toNumber(item?.discount_percent),
    toNumber(item?.discount),
    toNumber(item?.discount_rate),
    toNumber(item?.line_discount_percent)
  );
}

function getProposalDiscountsByCategory(proposal, items = []) {
  let annualSaasDiscount = 0;
  let oneTimeFeeDiscount = 0;
  let overallMaxDiscount = 0;

  for (const item of items || []) {
    const discount = getItemDiscountPercent(item);
    const category = getItemCategory(item);

    overallMaxDiscount = Math.max(overallMaxDiscount, discount);

    if (category === 'annual_saas') {
      annualSaasDiscount = Math.max(annualSaasDiscount, discount);
    }

    if (category === 'one_time_fee') {
      oneTimeFeeDiscount = Math.max(oneTimeFeeDiscount, discount);
    }
  }

  return {
    annualSaasDiscount,
    oneTimeFeeDiscount,
    overallMaxDiscount
  };
}

function roundPercent(value) {
  return Number(toNumber(value).toFixed(2));
}

function needsApprovalAgainstBaseline(currentDiscount, noApprovalLimit, hardStopLimit, approvedBaselineRaw) {
  const current = roundPercent(currentDiscount);
  const noApproval = roundPercent(noApprovalLimit);
  const hardStop = roundPercent(hardStopLimit);

  if (current > hardStop) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: `Discount above ${hardStop}% is not allowed.`
    };
  }

  if (current <= noApproval) {
    return {
      allowed: true,
      requiresApproval: false,
      reason: ''
    };
  }

  // First approval baseline:
  // If no approved baseline exists and discount is above free threshold,
  // approval is required.
  if (!hasValue(approvedBaselineRaw)) {
    return {
      allowed: false,
      requiresApproval: true,
      reason: `Approval required for ${current}% discount.`
    };
  }

  const approved = roundPercent(approvedBaselineRaw);

  // Critical final rule:
  // Only require approval when current discount is HIGHER than approved baseline.
  if (current > approved) {
    return {
      allowed: false,
      requiresApproval: true,
      reason: `Approval required because discount increased from ${approved}% to ${current}%.`
    };
  }

  // Same or lower discount:
  // No approval, even if status changed.
  return {
    allowed: true,
    requiresApproval: false,
    reason: ''
  };
}

function evaluateProposalDiscountApproval(proposal, items, workflowRule) {
  const discounts = getProposalDiscountsByCategory(proposal, items);

  const annualDecision = needsApprovalAgainstBaseline(
    discounts.annualSaasDiscount,
    workflowRule?.annual_saas_no_approval_until_percent ?? 10,
    workflowRule?.annual_saas_hard_stop_discount_percent ?? 20,
    proposal?.approved_annual_saas_discount_percent ?? proposal?.approved_discount_percent
  );

  if (!annualDecision.allowed && !annualDecision.requiresApproval) {
    return { ...annualDecision, discounts };
  }

  const oneTimeDecision = needsApprovalAgainstBaseline(
    discounts.oneTimeFeeDiscount,
    workflowRule?.one_time_fee_no_approval_until_percent ?? 20,
    workflowRule?.one_time_fee_hard_stop_discount_percent ?? 30,
    proposal?.approved_one_time_fee_discount_percent ?? proposal?.approved_discount_percent
  );

  if (!oneTimeDecision.allowed && !oneTimeDecision.requiresApproval) {
    return { ...oneTimeDecision, discounts };
  }

  const reasons = [];

  if (annualDecision.requiresApproval) {
    reasons.push(annualDecision.reason);
  }

  if (oneTimeDecision.requiresApproval) {
    reasons.push(oneTimeDecision.reason);
  }

  if (reasons.length > 0) {
    return {
      allowed: false,
      requiresApproval: true,
      reason: reasons.join(' '),
      discounts,
      annualNeedsApproval: annualDecision.requiresApproval,
      oneTimeNeedsApproval: oneTimeDecision.requiresApproval,
      annualDecision,
      oneTimeDecision
    };
  }

  return {
    allowed: true,
    requiresApproval: false,
    reason: '',
    discounts,
    annualNeedsApproval: false,
    oneTimeNeedsApproval: false,
    annualDecision,
    oneTimeDecision
  };
}

function getProposalCurrentDiscountPercent(proposal, items = []) {
  const discounts = getProposalDiscountsByCategory(proposal, items);
  return discounts.overallMaxDiscount;
}

function evaluateProposalDiscountApprovalRequirement(proposal, items, nextStatus, workflowRule = {}) {
  const currentStatus = normalizeWorkflowStatus(proposal?.status || proposal?.current_status);
  const targetStatus = normalizeWorkflowStatus(nextStatus || proposal?.next_status || proposal?.status);
  const decision = evaluateProposalDiscountApproval(proposal, items, workflowRule);
  const discounts = decision.discounts || getProposalDiscountsByCategory(proposal, items);
  const result = {
    ...decision,
    discount: discounts.overallMaxDiscount
  };

  console.log('[Proposal category discount workflow]', {
    proposalId: proposal?.id,
    proposalNumber: proposal?.proposal_id || proposal?.proposal_number,
    annualSaasDiscount: discounts.annualSaasDiscount,
    approvedAnnualSaasDiscount: proposal?.approved_annual_saas_discount_percent,
    oneTimeFeeDiscount: discounts.oneTimeFeeDiscount,
    approvedOneTimeFeeDiscount: proposal?.approved_one_time_fee_discount_percent,
    currentStatus,
    targetStatus,
    decision: result
  });

  return result;
}

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
  canRequestProposalDiscountWorkflow(userRole = '') {
    const normalized = normalizeWorkflowRole(userRole);
    return ['sales_executive', 'head_of_sales', 'admin', 'dev'].includes(normalized);
  },
  isProposalWorkflowResource(resource = '') {
    return String(resource || '').trim().toLowerCase() === 'proposals';
  },
  getProposalWorkflowRule(currentStatus = '', targetStatus = '') {
    const rules = Array.isArray(window.Workflow?.state?.rules) ? window.Workflow.state.rules : [];
    const current = normalizeWorkflowStatus(currentStatus);
    const target = normalizeWorkflowStatus(targetStatus);
    return rules.find(rule => {
      if (rule?.is_active === false) return false;
      if (String(rule?.resource || '').trim().toLowerCase() !== 'proposals') return false;
      const ruleCurrent = normalizeWorkflowStatus(rule?.current_status);
      const ruleNext = normalizeWorkflowStatus(rule?.next_status);
      if (ruleCurrent && current && ruleCurrent !== current) return false;
      if (ruleNext && target && ruleNext !== target) return false;
      return true;
    }) || {};
  },
  buildProposalDiscountDecision(record = {}, requestedChanges = {}) {
    const nested = requestedChanges?.requested_changes && typeof requestedChanges.requested_changes === 'object'
      ? requestedChanges.requested_changes
      : {};
    const proposalPayload = nested?.proposal && typeof nested.proposal === 'object' ? nested.proposal : {};
    const recordItems = Array.isArray(record?.items)
      ? record.items
      : Array.isArray(record?.proposal_items)
        ? record.proposal_items
        : [];
    const payloadItems = Array.isArray(proposalPayload?.items)
      ? proposalPayload.items
      : Array.isArray(proposalPayload?.proposal_items)
        ? proposalPayload.proposal_items
        : [];
    const items = Array.isArray(nested?.items)
      ? nested.items
      : Array.isArray(requestedChanges?.items)
        ? requestedChanges.items
        : payloadItems.length
          ? payloadItems
          : recordItems;
    const currentStatus = normalizeWorkflowStatus(requestedChanges?.current_status || record?.status || proposalPayload?.current_status || proposalPayload?.status);
    const targetStatus = normalizeWorkflowStatus(requestedChanges?.requested_status || requestedChanges?.next_status || proposalPayload?.status || record?.status);
    const proposalForDecision = {
      ...(record && typeof record === 'object' ? record : {}),
      ...proposalPayload,
      current_status: currentStatus,
      status: currentStatus,
      next_status: targetStatus,
      discount_percent: requestedChanges?.discount_percent ?? proposalPayload?.discount_percent ?? record?.discount_percent,
      approved_annual_saas_discount_percent: hasValue(proposalPayload?.approved_annual_saas_discount_percent)
        ? proposalPayload.approved_annual_saas_discount_percent
        : hasValue(record?.approved_annual_saas_discount_percent)
          ? record.approved_annual_saas_discount_percent
          : hasValue(record?.approved_discount_percent)
            ? record.approved_discount_percent
            : undefined,
      approved_one_time_fee_discount_percent: hasValue(proposalPayload?.approved_one_time_fee_discount_percent)
        ? proposalPayload.approved_one_time_fee_discount_percent
        : hasValue(record?.approved_one_time_fee_discount_percent)
          ? record.approved_one_time_fee_discount_percent
          : hasValue(record?.approved_discount_percent)
            ? record.approved_discount_percent
            : undefined,
      approved_discount_percent: hasValue(proposalPayload?.approved_discount_percent)
        ? proposalPayload.approved_discount_percent
        : record?.approved_discount_percent
    };
    const workflowRule = this.getProposalWorkflowRule(currentStatus, targetStatus);
    const decision = evaluateProposalDiscountApprovalRequirement(proposalForDecision, items, targetStatus, workflowRule);
    return { decision, proposal: proposalForDecision, items, currentStatus, targetStatus, nestedRequestedChanges: nested, workflowRule };
  },
  async findPendingProposalDiscountApproval(recordId = '', targetStatus = '', discount = 0, discounts = {}) {
    const normalizedRecordId = String(recordId || '').trim();
    if (!normalizedRecordId) return null;
    try {
      const response = await Api.listPendingWorkflowApprovals?.({ resource: 'proposals', record_id: normalizedRecordId });
      const rows = response?.rows || response?.items || response?.data || [];
      const normalizedTarget = normalizeWorkflowStatus(targetStatus);
      const normalizedDiscount = Number(toNumber(discount).toFixed(2));
      const normalizedAnnual = Number(toNumber(discounts?.annualSaasDiscount).toFixed(2));
      const normalizedOneTime = Number(toNumber(discounts?.oneTimeFeeDiscount).toFixed(2));
      return (Array.isArray(rows) ? rows : []).find(row => {
        const requested = row?.requested_changes && typeof row.requested_changes === 'object' ? row.requested_changes : {};
        const requestedDiscounts = requested?.category_discounts && typeof requested.category_discounts === 'object' ? requested.category_discounts : {};
        const rowRecordId = String(row?.record_id || requested?.resource_id || requested?.target_id || requested?.proposal_uuid || '').trim();
        const rowStatus = normalizeWorkflowStatus(row?.new_status || requested?.requested_status || requested?.next_status || requested?.status);
        const rowDiscount = Number(toNumber(requested?.discount_percent).toFixed(2));
        const rowAnnual = Number(toNumber(requestedDiscounts?.annualSaasDiscount ?? requested?.annual_saas_discount_percent).toFixed(2));
        const rowOneTime = Number(toNumber(requestedDiscounts?.oneTimeFeeDiscount ?? requested?.one_time_fee_discount_percent).toFixed(2));
        return String(row?.resource || '').trim().toLowerCase() === 'proposals' &&
          rowRecordId === normalizedRecordId &&
          rowStatus === normalizedTarget &&
          rowDiscount === normalizedDiscount &&
          rowAnnual === normalizedAnnual &&
          rowOneTime === normalizedOneTime;
      }) || null;
    } catch (error) {
      console.warn('[Proposal discount workflow] Unable to check duplicate approval requests', error);
      return null;
    }
  },
  async updateProposalDiscountApprovalSnapshot(proposalId = '', updates = {}) {
    const id = String(proposalId || '').trim();
    if (!id || !updates || typeof updates !== 'object' || !Object.keys(updates).length) return null;
    try {
      return await Api.requestWithSession('proposals', 'update', { id, updates });
    } catch (error) {
      console.warn('[Proposal discount workflow] Unable to update proposal approval snapshot', error);
      return null;
    }
  },
  async createWorkflowApprovalFromDecision(resource, record = {}, requestedChanges = {}, validationResult = {}, discountPercent = 0) {
    const normalizedResource = String(resource || '').trim().toLowerCase();
    const submittedByName =
      window.Session?.authContext?.()?.profile?.name ||
      window.Session?.authContext?.()?.profile?.full_name ||
      '';
    const submittedByEmail = window.Session?.authContext?.()?.user?.email || '';
    const submittedByRole = window.Session?.role?.() || '';
    const nestedRequestedChanges =
      requestedChanges?.requested_changes && typeof requestedChanges.requested_changes === 'object'
        ? requestedChanges.requested_changes
        : {};
    const proposalPayload = nestedRequestedChanges?.proposal && typeof nestedRequestedChanges.proposal === 'object' ? nestedRequestedChanges.proposal : {};
    const approvalItems = Array.isArray(nestedRequestedChanges?.items)
      ? nestedRequestedChanges.items
      : Array.isArray(requestedChanges?.items)
        ? requestedChanges.items
        : Array.isArray(proposalPayload?.items)
          ? proposalPayload.items
          : Array.isArray(proposalPayload?.proposal_items)
            ? proposalPayload.proposal_items
            : Array.isArray(record?.items)
              ? record.items
              : Array.isArray(record?.proposal_items)
                ? record.proposal_items
                : [];
    const categoryDiscounts = validationResult?.discounts && typeof validationResult.discounts === 'object'
      ? validationResult.discounts
      : getProposalDiscountsByCategory({ ...record, ...proposalPayload, ...nestedRequestedChanges }, approvalItems);
    const recordId = String(requestedChanges?.id || requestedChanges?.proposal_uuid || proposalPayload?.id || record?.id || '').trim();
    const resourceDisplayId = String(
      requestedChanges?.resource_display_id ||
      proposalPayload?.proposal_id ||
      proposalPayload?.proposal_number ||
      record?.proposal_id ||
      record?.proposal_number ||
      record?.proposal_reference ||
      recordId ||
      ''
    ).trim();
    const normalizedRequestedChanges = {
      ...nestedRequestedChanges,
      proposal_uuid: recordId,
      proposal_id: proposalPayload?.proposal_id || record?.proposal_id || '',
      proposal_number: proposalPayload?.proposal_id || proposalPayload?.proposal_number || record?.proposal_number || record?.proposal_reference || '',
      current_status: requestedChanges?.current_status || record?.status || '',
      requested_status: requestedChanges?.requested_status || requestedChanges?.next_status || proposalPayload?.status || record?.status || '',
      discount_percent: toNumber(discountPercent),
      annual_saas_discount_percent: categoryDiscounts.annualSaasDiscount,
      one_time_fee_discount_percent: categoryDiscounts.oneTimeFeeDiscount,
      category_discounts: categoryDiscounts,
      submitted_by_name: submittedByName,
      submitted_by_email: submittedByEmail,
      submitted_by_role: submittedByRole,
      resource: normalizedResource,
      target_workflow_resource: normalizedResource,
      record_snapshot: record || {},
      proposal: proposalPayload,
      items: approvalItems,
      resource_id: recordId,
      target_id: recordId,
      resource_display_id: resourceDisplayId
    };
    const approvalPayload = {
      resource: normalizedResource,
      record_id: recordId,
      target_id: recordId,
      resource_id: recordId,
      resource_display_id: resourceDisplayId,
      workflow_rule_id: validationResult?.workflow_rule_id || null,
      requester_user_id: window.Session?.authContext?.()?.user?.id || null,
      requester_role: submittedByRole,
      approval_role: String(validationResult?.approval_role || 'admin').trim(),
      old_status: String(requestedChanges?.current_status || record?.status || '').trim(),
      new_status: String(requestedChanges?.requested_status || requestedChanges?.next_status || proposalPayload?.status || record?.status || '').trim(),
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
          requestedDiscount: toNumber(discountPercent),
          categoryDiscounts,
          reason: approvalResult?.reused
            ? 'Approval is already pending for this discount.'
            : 'Approval request submitted successfully.'
        };
        try { console.info('[workflow] final decision', workflowCheck); } catch {}
        return workflowCheck;
      }
    } catch (error) {
      console.error('[workflow approval create failed]', error);
    }
    return {
      allowed: false,
      pendingApproval: true,
      approvalCreated: false,
      requestedDiscount: toNumber(discountPercent),
      categoryDiscounts,
      reason: 'Approval is required, but the approval request could not be created yet. Please retry.'
    };
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
      if (this.isProposalWorkflowResource(resource)) {
        const proposalWorkflow = this.buildProposalDiscountDecision(record, requestedChanges);
        const { decision, proposal, currentStatus, targetStatus } = proposalWorkflow;
        const isDraftToSent = currentStatus === 'draft' && ['sent', 'send', 'submitted'].includes(targetStatus);
        if (isDraftToSent && !this.canRequestProposalDiscountWorkflow(Session?.role?.() || '')) {
          return {
            allowed: false,
            pendingApproval: false,
            approvalCreated: false,
            reason: 'Only sales_executive and head_of_sales can request this proposal transition.'
          };
        }
        if (decision.allowed === false && decision.requiresApproval !== true) {
          return {
            allowed: false,
            pendingApproval: false,
            approvalCreated: false,
            requestedDiscount: decision.discount,
            categoryDiscounts: decision.discounts,
            reason: decision.reason || 'Proposal discount is not allowed.'
          };
        }
        if (decision.allowed === true && decision.requiresApproval !== true) {
          return {
            allowed: true,
            pendingApproval: false,
            approvalCreated: false,
            proposalDiscountWorkflow: true,
            discountApprovalUpdates: {
              discount_approval_status: decision.discount <= 10 && !hasValue(proposal?.approved_annual_saas_discount_percent) && !hasValue(proposal?.approved_one_time_fee_discount_percent)
                ? 'not_required'
                : (proposal?.discount_approval_status || null),
              approval_required_reason: ''
            },
            requestedDiscount: decision.discount,
            categoryDiscounts: decision.discounts,
            reason: decision.reason || 'Allowed'
          };
        }
        if (decision.requiresApproval === true) {
          console.log('[Proposal workflow approval final decision]', {
            proposalId: proposal?.id,
            proposalNumber: proposal?.proposal_id || proposal?.proposal_number,
            currentStatus: proposal?.status,
            requestedStatus: targetStatus,
            annualSaasDiscount: decision?.discounts?.annualSaasDiscount,
            approvedAnnual: proposal?.approved_annual_saas_discount_percent || proposal?.approved_discount_percent,
            oneTimeFeeDiscount: decision?.discounts?.oneTimeFeeDiscount,
            approvedOneTime: proposal?.approved_one_time_fee_discount_percent || proposal?.approved_discount_percent,
            allowed: decision.allowed,
            requiresApproval: decision.requiresApproval,
            reason: decision.reason
          });
          const recordId = String(requestedChanges?.id || requestedChanges?.proposal_uuid || record?.id || proposal?.id || '').trim();
          const duplicate = await this.findPendingProposalDiscountApproval(recordId, targetStatus, decision.discount, decision.discounts);
          if (duplicate) {
            await this.updateProposalDiscountApprovalSnapshot(recordId, {
              discount_approval_status: 'pending',
              approval_required_reason: 'Approval is already pending for this discount.',
              last_discount_approval_request_id: duplicate?.approval_id || duplicate?.id || duplicate?.workflow_approval_id || null
            });
            return {
              allowed: false,
              pendingApproval: true,
              approvalCreated: true,
              approvalId: duplicate?.approval_id || duplicate?.id || duplicate?.workflow_approval_id,
              requestedDiscount: decision.discount,
              categoryDiscounts: decision.discounts,
              reason: 'Approval is already pending for this discount.'
            };
          }
          const validationResult = {
            allowed: false,
            pendingApproval: true,
            approval_role: 'admin',
            approval_roles: ['admin'],
            reason: decision.reason,
            discounts: decision.discounts,
            annualNeedsApproval: decision.annualNeedsApproval,
            oneTimeNeedsApproval: decision.oneTimeNeedsApproval
          };
          const approvalResult = await this.createWorkflowApprovalFromDecision(resource, record, requestedChanges, validationResult, decision.discount);
          if (approvalResult?.approvalCreated === true) {
            await this.updateProposalDiscountApprovalSnapshot(recordId, {
              discount_approval_status: 'pending',
              approval_required_reason: decision.reason,
              last_discount_approval_request_id: approvalResult.approvalId || null
            });
          }
          return approvalResult;
        }
      }
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
        const normalizedResource = String(resource || '').trim().toLowerCase();
        const submittedByName =
          window.Session?.authContext?.()?.profile?.name ||
          window.Session?.authContext?.()?.profile?.full_name ||
          '';
        const submittedByEmail = window.Session?.authContext?.()?.user?.email || '';
        const submittedByRole = window.Session?.role?.() || '';
        const nestedRequestedChanges =
          requestedChanges?.requested_changes && typeof requestedChanges.requested_changes === 'object'
            ? requestedChanges.requested_changes
            : {};
        const proposalPayload =
          nestedRequestedChanges?.proposal && typeof nestedRequestedChanges.proposal === 'object'
            ? nestedRequestedChanges.proposal
            : {};
        const agreementPayload =
          nestedRequestedChanges?.agreement && typeof nestedRequestedChanges.agreement === 'object'
            ? nestedRequestedChanges.agreement
            : {};
        const invoicePayload =
          nestedRequestedChanges?.invoice && typeof nestedRequestedChanges.invoice === 'object'
            ? nestedRequestedChanges.invoice
            : {};
        const receiptPayload =
          nestedRequestedChanges?.receipt && typeof nestedRequestedChanges.receipt === 'object'
            ? nestedRequestedChanges.receipt
            : {};
        const approvalItems = Array.isArray(nestedRequestedChanges?.items)
          ? nestedRequestedChanges.items
          : Array.isArray(requestedChanges?.items)
            ? requestedChanges.items
            : [];
        const normalizedRequestedChanges = {
          proposal_uuid: proposalPayload?.id || requestedChanges?.id || record?.id || '',
          proposal_id: proposalPayload?.proposal_id || record?.proposal_id || '',
          proposal_number:
            proposalPayload?.proposal_id ||
            record?.proposal_number ||
            record?.proposal_reference ||
            requestedChanges?.proposal_number ||
            requestedChanges?.proposal_reference ||
            '',
          agreement_uuid: agreementPayload?.id || requestedChanges?.agreement_uuid || record?.id || '',
          agreement_id: agreementPayload?.agreement_id || record?.agreement_id || '',
          agreement_number: agreementPayload?.agreement_number || requestedChanges?.agreement_number || '',
          invoice_uuid: invoicePayload?.id || requestedChanges?.invoice_uuid || record?.id || '',
          invoice_id: invoicePayload?.invoice_id || record?.invoice_id || '',
          invoice_number: invoicePayload?.invoice_number || requestedChanges?.invoice_number || '',
          receipt_uuid: receiptPayload?.id || requestedChanges?.receipt_uuid || record?.id || '',
          receipt_id: receiptPayload?.receipt_id || record?.receipt_id || '',
          receipt_number: receiptPayload?.receipt_number || requestedChanges?.receipt_number || '',
          client_id:
            proposalPayload?.client_id ||
            agreementPayload?.client_id ||
            invoicePayload?.client_id ||
            receiptPayload?.client_id ||
            record?.client_id ||
            requestedChanges?.client_id ||
            '',
          client_name:
            proposalPayload?.client_name ||
            agreementPayload?.client_name ||
            invoicePayload?.client_name ||
            receiptPayload?.client_name ||
            record?.client_name ||
            record?.customer_name ||
            record?.company_name ||
            requestedChanges?.client_name ||
            requestedChanges?.company_name ||
            '',
          company_name:
            proposalPayload?.customer_name ||
            agreementPayload?.customer_name ||
            invoicePayload?.customer_name ||
            receiptPayload?.customer_name ||
            record?.company_name ||
            record?.client_name ||
            requestedChanges?.company_name ||
            requestedChanges?.client_name ||
            '',
          current_status: requestedChanges?.current_status || record?.status || '',
          requested_status: requestedChanges?.requested_status || requestedChanges?.next_status || record?.status || '',
          discount_percent: Number(requestedChanges?.discount_percent ?? record?.discount_percent ?? 0),
          total_amount: Number(
            requestedChanges?.total_amount ??
            proposalPayload?.grand_total ??
            agreementPayload?.grand_total ??
            invoicePayload?.invoice_total ??
            receiptPayload?.amount_received ??
            record?.total_amount ??
            0
          ),
          title:
            proposalPayload?.proposal_title ||
            agreementPayload?.agreement_title ||
            invoicePayload?.invoice_number ||
            receiptPayload?.receipt_number ||
            requestedChanges?.title ||
            record?.title ||
            '',
          subject: requestedChanges?.subject || record?.subject || '',
          submitted_by_name: submittedByName,
          submitted_by_email: submittedByEmail,
          submitted_by_role: submittedByRole,
          changed_fields: requestedChanges?.changed_fields || [],
          resource: normalizedResource,
          target_workflow_resource: normalizedResource,
          record_snapshot: record || {},
          proposal: proposalPayload,
          agreement: agreementPayload,
          invoice: invoicePayload,
          receipt: receiptPayload,
          items: approvalItems
        };
        const recordId = String(
          requestedChanges?.id ||
          requestedChanges?.proposal_uuid ||
          requestedChanges?.agreement_uuid ||
          requestedChanges?.invoice_uuid ||
          requestedChanges?.receipt_uuid ||
          record?.id ||
          ''
        ).trim();
        const resourceDisplayId = String(
          requestedChanges?.resource_display_id ||
          requestedChanges?.proposal_id ||
          requestedChanges?.proposal_number ||
          requestedChanges?.agreement_id ||
          requestedChanges?.agreement_number ||
          requestedChanges?.invoice_id ||
          requestedChanges?.invoice_number ||
          requestedChanges?.receipt_id ||
          requestedChanges?.receipt_number ||
          record?.proposal_id ||
          record?.proposal_number ||
          record?.agreement_id ||
          record?.agreement_number ||
          record?.invoice_id ||
          record?.invoice_number ||
          record?.receipt_id ||
          record?.receipt_number ||
          recordId ||
          ''
        ).trim();
        normalizedRequestedChanges.resource_id = recordId;
        normalizedRequestedChanges.target_id = recordId;
        normalizedRequestedChanges.resource_display_id = resourceDisplayId;
        const approvalPayload = {
          resource: normalizedResource,
          record_id: recordId,
          target_id: recordId,
          resource_id: recordId,
          resource_display_id: resourceDisplayId,
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

function normalizeApprovalRole(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
}

function parseApprovalRoleList(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map(normalizeApprovalRole).filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) return [];

    // PostgreSQL array string: "{admin,gm}"
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed
        .slice(1, -1)
        .split(',')
        .map((x) => x.replace(/^"|"$/g, ''))
        .map(normalizeApprovalRole)
        .filter(Boolean);
    }

    return trimmed
      .split(',')
      .map(normalizeApprovalRole)
      .filter(Boolean);
  }

  return [];
}

function getApprovalRolesFromRow(approval) {
  return [
    ...parseApprovalRoleList(approval?.approval_role),
    ...parseApprovalRoleList(approval?.approval_roles),
    ...parseApprovalRoleList(approval?.approver_role),
    ...parseApprovalRoleList(approval?.approver_roles),
    ...parseApprovalRoleList(approval?.allowed_roles),
    ...parseApprovalRoleList(approval?.target_roles),
    ...parseApprovalRoleList(approval?.required_role)
  ].filter(Boolean);
}

function getUniqueApprovalRolesLabel(approval) {
  return [...new Set(getApprovalRolesFromRow(approval))].join(', ');
}

function getCurrentApprovalUserRole() {
  const possible =
    window.AppState?.currentUser?.role ||
    window.AppState?.user?.role ||
    window.Session?.currentUser?.role ||
    window.Session?.user?.role ||
    window.Auth?.currentUser?.role ||
    window.currentUser?.role ||
    window.currentUserRole ||
    window.Session?.role?.() ||
    window.Session?.state?.role ||
    localStorage.getItem('currentUserRole') ||
    localStorage.getItem('userRole') ||
    '';

  return normalizeApprovalRole(possible);
}

function isPendingApprovalRow(approval) {
  const status = normalizeApprovalRole(
    approval?.status ||
    approval?.approval_status ||
    approval?.request_status ||
    ''
  );

  return [
    'pending',
    'pending_approval',
    'awaiting_approval',
    'submitted',
    'open',
    'requested'
  ].includes(status);
}

function shouldShowApprovalActionButtons(approval) {
  if (!isPendingApprovalRow(approval)) return false;

  const currentRole = getCurrentApprovalUserRole();
  const roles = getApprovalRolesFromRow(approval);

  if (!currentRole) {
    console.warn('[Workflow approval buttons] current role not detected', {
      approval,
      roles
    });
    return false;
  }

  if (['admin', 'dev'].includes(currentRole)) return true;

  return roles.includes(currentRole);
}

function normalizeWorkflowRole(value) {
  return normalizeApprovalRole(value);
}

function normalizeWorkflowRoleList(value) {
  return parseApprovalRoleList(value);
}

function uniqueWorkflowRoles(value) {
  return [...new Set(parseApprovalRoleList(value))];
}

function isPendingWorkflowStatus(status) {
  return isPendingApprovalRow({ status });
}

function getApprovalRoles(approval) {
  return [
    ...getApprovalRolesFromRow(approval),
    ...parseApprovalRoleList(approval?.approval_roles_csv),
    ...parseApprovalRoleList(approval?.allowed_roles_csv),
    ...parseApprovalRoleList(approval?.requested_for_role)
  ].filter(Boolean);
}

function getCurrentWorkflowRole() {
  return getCurrentApprovalUserRole();
}

function canActOnWorkflowApproval(approval) {
  return shouldShowApprovalActionButtons(approval);
}

function normalizeRole(value) {
  return normalizeWorkflowRole(value);
}

function normalizeRoleList(value) {
  return normalizeWorkflowRoleList(value);
}

function isPendingApprovalStatus(status) {
  return isPendingWorkflowStatus(status);
}

function roleMatchesApproval(currentRole, approval) {
  return getApprovalRoles(approval).includes(normalizeWorkflowRole(currentRole));
}

async function canCurrentUserActOnApproval(approval) {
  const canAct = await canActOnWorkflowApproval(approval);

  console.log('[Workflow approval buttons]', {
    approvalId: approval?.id || approval?.approval_id || approval?.workflow_approval_id,
    resource: approval?.resource,
    status: approval?.status || approval?.approval_status || approval?.request_status,
    currentRole: getCurrentWorkflowRole(),
    approvalRoles: getApprovalRoles(approval),
    canAct
  });

  return canAct;
}

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
    editingRuleLegacyId: '',
    activeApprovalPreview: null
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
    return getCurrentWorkflowRole();
  },
  isWorkflowAdminConfigAllowed() {
    const role =
      window.Session?.currentUser?.role ||
      window.AppState?.currentUser?.role ||
      window.currentUser?.role ||
      this.currentRole() ||
      '';
    return String(role || '').trim().toLowerCase() === 'admin';
  },
  canManageWorkflowRules() {
    return this.isWorkflowAdminConfigAllowed();
  },
  canProcessApprovals() {
    return Permissions.can('workflow_approvals','approve') || Permissions.can('workflow_approvals','reject') || Permissions.can('workflow_approvals','manage') ||
      Permissions.can('workflow','approve') || Permissions.can('workflow','reject') || Permissions.can('workflow','manage') || Permissions.can('workflow','view') || Permissions.can('workflow','list') ||
      Permissions.can('approvals','approve') || Permissions.can('approvals','reject') || Permissions.can('approvals','manage');
  },
  currentUserIdentifiers() {
    const ctx = Session?.authContext?.() || {};
    const profile = ctx.profile || {};
    const email = String(profile.email || profile.user_email || Session.username?.() || '').trim().toLowerCase();
    const id = String(profile.id || profile.user_id || profile.auth_user_id || Session.userId?.() || '').trim().toLowerCase();
    return { id, email, role: this.currentRole() };
  },
  approvalRoleList(approval = {}) {
    return [...new Set(getApprovalRoles(approval))];
  },
  approvalRoleDisplay(approval = {}) {
    return getUniqueApprovalRolesLabel(approval) || '—';
  },
  getApprovalId(approval = {}) {
    return String(approval?.approval_id || approval?.id || approval?.workflow_approval_id || '').trim();
  },
  canSeeApproval(approval = {}) {
    if (['admin', 'dev'].includes(getCurrentWorkflowRole())) return true;
    const { id, email, role } = this.currentUserIdentifiers();
    if (roleMatchesApproval(role, approval)) return true;
    const assignedIds = [approval.assigned_user_id, approval.approver_user_id, approval.reviewer_user_id, approval.user_id].map(v => String(v || '').trim().toLowerCase()).filter(Boolean);
    if (id && assignedIds.includes(id)) return true;
    const assignedEmails = [approval.assigned_email, approval.approver_email, approval.reviewer_email, approval.email].map(v => String(v || '').trim().toLowerCase()).filter(Boolean);
    if (email && assignedEmails.includes(email)) return true;
    return false;
  },
  async canActOnApproval(approval = {}, action = 'approve') {
    if (!this.canSeeApproval(approval)) return false;
    return canCurrentUserActOnApproval(approval);
  },

  renderAdminConfigVisibility() {
    const allowed = this.isWorkflowAdminConfigAllowed();
    const toggle = (id, visible) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = visible ? '' : 'none';
    };
    toggle('workflowBuilderCard', allowed);
    toggle('workflowDiscountPolicyCard', allowed);
    toggle('workflowTransitionMatrixCard', allowed);
    toggle('workflowAdminConfigMessage', false);
    return allowed;
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
  proposalCategoryDiscountDefaults: {
    annual_saas_no_approval_until_percent: 10,
    annual_saas_hard_stop_discount_percent: 20,
    one_time_fee_no_approval_until_percent: 20,
    one_time_fee_hard_stop_discount_percent: 30
  },
  proposalCategoryApprovalMetadata: {
    approval_condition: 'category_discount_above_no_approval_limit_and_above_last_approved_baseline',
    approval_basis: 'approved_annual_saas_discount_percent_and_approved_one_time_fee_discount_percent',
    reapproval_mode: 'only_if_category_discount_increases_above_approved_baseline'
  },
  normalizePercentValue(value, fallback = 0) {
    if (value === undefined || value === null || String(value).trim() === '') return fallback;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
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
      max_discount_percent: this.normalizePercentValue(pick(source.max_discount_percent, source.maxdiscountpercent), 0),
      hard_stop_discount_percent: this.normalizePercentValue(
        pick(source.hard_stop_discount_percent, source.hardstopdiscountpercent),
        0
      ),
      annual_saas_no_approval_until_percent: this.normalizePercentValue(
        pick(source.annual_saas_no_approval_until_percent, source.annualsaasnoapprovaluntilpercent),
        this.proposalCategoryDiscountDefaults.annual_saas_no_approval_until_percent
      ),
      annual_saas_hard_stop_discount_percent: this.normalizePercentValue(
        pick(source.annual_saas_hard_stop_discount_percent, source.annualsaashardstopdiscountpercent),
        this.proposalCategoryDiscountDefaults.annual_saas_hard_stop_discount_percent
      ),
      one_time_fee_no_approval_until_percent: this.normalizePercentValue(
        pick(source.one_time_fee_no_approval_until_percent, source.onetimefeenoapprovaluntilpercent),
        this.proposalCategoryDiscountDefaults.one_time_fee_no_approval_until_percent
      ),
      one_time_fee_hard_stop_discount_percent: this.normalizePercentValue(
        pick(source.one_time_fee_hard_stop_discount_percent, source.onetimefeehardstopdiscountpercent),
        this.proposalCategoryDiscountDefaults.one_time_fee_hard_stop_discount_percent
      ),
      approval_condition: String(pick(source.approval_condition, source.approvalcondition)).trim(),
      approval_basis: String(pick(source.approval_basis, source.approvalbasis)).trim(),
      reapproval_mode: String(pick(source.reapproval_mode, source.reapprovalmode)).trim(),
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
    const resource = get('workflowResource').toLowerCase();
    const annualSaasNoApproval = this.normalizePercentValue(
      get('workflowAnnualSaasNoApproval'),
      this.proposalCategoryDiscountDefaults.annual_saas_no_approval_until_percent
    );
    const annualSaasHardStop = this.normalizePercentValue(
      get('workflowAnnualSaasHardStop'),
      this.proposalCategoryDiscountDefaults.annual_saas_hard_stop_discount_percent
    );
    const oneTimeFeeNoApproval = this.normalizePercentValue(
      get('workflowOneTimeFeeNoApproval'),
      this.proposalCategoryDiscountDefaults.one_time_fee_no_approval_until_percent
    );
    const oneTimeFeeHardStop = this.normalizePercentValue(
      get('workflowOneTimeFeeHardStop'),
      this.proposalCategoryDiscountDefaults.one_time_fee_hard_stop_discount_percent
    );
    const payload = {
      id: legacyId,
      resource,
      current_status: get('workflowCurrentStatus'),
      next_status: get('workflowNextStatus'),
      allowed_roles: this.getMultiSelectValues(E.workflowAllowedRoles).map(v => v.toLowerCase()),
      requires_approval: String(get('workflowRequiresApproval')) === 'true',
      approval_roles: this.getMultiSelectValues(E.workflowApprovalRoles).map(v => v.toLowerCase()),
      max_discount_percent: resource === 'proposals'
        ? annualSaasNoApproval
        : this.normalizePercentValue(get('workflowMaxDiscount'), 0),
      hard_stop_discount_percent: resource === 'proposals'
        ? annualSaasHardStop
        : this.normalizePercentValue(get('workflowHardStopDiscount'), 0),
      editable_fields: this.getMultiSelectValues(E.workflowEditableFields),
      required_fields: this.getMultiSelectValues(E.workflowRequiredFields),
      require_comment: String(get('workflowRequireComment')) === 'true',
      require_attachment: String(get('workflowRequireAttachment')) === 'true',
      is_active: String(get('workflowIsActive')) !== 'false'
    };
    if (resource === 'proposals') {
      Object.assign(payload, {
        annual_saas_no_approval_until_percent: annualSaasNoApproval,
        annual_saas_hard_stop_discount_percent: annualSaasHardStop,
        one_time_fee_no_approval_until_percent: oneTimeFeeNoApproval,
        one_time_fee_hard_stop_discount_percent: oneTimeFeeHardStop,
        ...this.proposalCategoryApprovalMetadata
      });
    }
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
    if (E.workflowAnnualSaasNoApproval) E.workflowAnnualSaasNoApproval.value = normalizedRule.annual_saas_no_approval_until_percent;
    if (E.workflowAnnualSaasHardStop) E.workflowAnnualSaasHardStop.value = normalizedRule.annual_saas_hard_stop_discount_percent;
    if (E.workflowOneTimeFeeNoApproval) E.workflowOneTimeFeeNoApproval.value = normalizedRule.one_time_fee_no_approval_until_percent;
    if (E.workflowOneTimeFeeHardStop) E.workflowOneTimeFeeHardStop.value = normalizedRule.one_time_fee_hard_stop_discount_percent;
    this.toggleWorkflowDiscountFields(normalizedRule.resource);
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
    if (E.workflowAnnualSaasNoApproval) E.workflowAnnualSaasNoApproval.value = this.proposalCategoryDiscountDefaults.annual_saas_no_approval_until_percent;
    if (E.workflowAnnualSaasHardStop) E.workflowAnnualSaasHardStop.value = this.proposalCategoryDiscountDefaults.annual_saas_hard_stop_discount_percent;
    if (E.workflowOneTimeFeeNoApproval) E.workflowOneTimeFeeNoApproval.value = this.proposalCategoryDiscountDefaults.one_time_fee_no_approval_until_percent;
    if (E.workflowOneTimeFeeHardStop) E.workflowOneTimeFeeHardStop.value = this.proposalCategoryDiscountDefaults.one_time_fee_hard_stop_discount_percent;
    this.populateRuleSelects();
    this.toggleWorkflowDiscountFields(E.workflowResource?.value);
  },
  toggleWorkflowDiscountFields(resourceValue = '') {
    const isProposal = String(resourceValue || '').trim().toLowerCase() === 'proposals';
    if (E.workflowCategoryDiscountFields) E.workflowCategoryDiscountFields.style.display = isProposal ? '' : 'none';
    if (E.workflowGenericDiscountFields) E.workflowGenericDiscountFields.style.display = isProposal ? 'none' : '';
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
    let recordSnapshot = requestedChanges?.record_snapshot;
    if (typeof recordSnapshot === 'string') {
      try {
        recordSnapshot = JSON.parse(recordSnapshot);
      } catch (_error) {
        recordSnapshot = {};
      }
    }
    if (!recordSnapshot || typeof recordSnapshot !== 'object') recordSnapshot = {};
    const normalizeApprovalBusinessResource = approval => {
      const actualResource = String(
        approval?.resource ||
        approval?.requested_changes?.resource ||
        approval?.requested_changes?.target_workflow_resource ||
        approval?.requested_changes?.record_snapshot?.resource ||
        ''
      ).trim().toLowerCase();
      if (actualResource && actualResource !== 'workflow') return actualResource;
      const requested = approval?.requested_changes && typeof approval.requested_changes === 'object'
        ? approval.requested_changes
        : {};
      if (requested?.proposal_id || requested?.proposal_number) return 'proposals';
      if (requested?.agreement_id || requested?.agreement_number) return 'agreements';
      if (requested?.invoice_id || requested?.invoice_number) return 'invoices';
      if (requested?.receipt_id || requested?.receipt_number) return 'receipts';
      if (requested?.deal_id || requested?.deal_number) return 'deals';
      if (requested?.lead_id || requested?.lead_number) return 'leads';
      return actualResource || '';
    };
    const resource = normalizeApprovalBusinessResource({
      resource: row?.resource,
      requested_changes: {
        ...requestedChanges,
        record_snapshot: recordSnapshot
      }
    }) || 'unknown';
    const targetRecordId =
      requestedChanges?.proposal_uuid ||
      requestedChanges?.agreement_uuid ||
      requestedChanges?.invoice_uuid ||
      requestedChanges?.receipt_uuid ||
      requestedChanges?.proposal?.id ||
      requestedChanges?.agreement?.id ||
      requestedChanges?.invoice?.id ||
      requestedChanges?.receipt?.id ||
      row?.record_id ||
      requestedChanges?.proposal_id ||
      requestedChanges?.agreement_id ||
      requestedChanges?.invoice_id ||
      requestedChanges?.receipt_id ||
      '';
    const previewTitle =
      requestedChanges?.proposal_number ||
      requestedChanges?.proposal_id ||
      requestedChanges?.agreement_number ||
      requestedChanges?.agreement_id ||
      requestedChanges?.invoice_number ||
      requestedChanges?.invoice_id ||
      requestedChanges?.receipt_number ||
      requestedChanges?.receipt_id ||
      row?.record_id ||
      '';
    const requestedBy =
      requestedChanges?.submitted_by_name ||
      requestedChanges?.submitted_by_email ||
      row?.requester_role ||
      '';
    return {
      ...row,
      resource,
      recordId: String(row?.record_id || targetRecordId || '').trim(),
      workflowRuleId: String(row?.workflow_rule_id || '').trim(),
      approvalId: this.getApprovalId(row),
      proposalId: String(requestedChanges?.proposal_id || '').trim(),
      proposalUuid: String(requestedChanges?.proposal_uuid || requestedChanges?.proposal?.id || '').trim(),
      agreementId: String(requestedChanges?.agreement_id || '').trim(),
      agreementUuid: String(requestedChanges?.agreement_uuid || requestedChanges?.agreement?.id || '').trim(),
      invoiceId: String(requestedChanges?.invoice_id || '').trim(),
      invoiceUuid: String(requestedChanges?.invoice_uuid || requestedChanges?.invoice?.id || '').trim(),
      receiptId: String(requestedChanges?.receipt_id || '').trim(),
      receiptUuid: String(requestedChanges?.receipt_uuid || requestedChanges?.receipt?.id || '').trim(),
      previewRecordId: String(targetRecordId || '').trim(),
      targetRecordId: String(targetRecordId || '').trim(),
      previewTitle: String(previewTitle || '').trim(),
      companyName: requestedChanges?.client_name || requestedChanges?.company_name || '',
      currentStatus: row?.old_status || requestedChanges?.current_status || '',
      requestedStatus: row?.new_status || requestedChanges?.requested_status || '',
      discountPercent: Number(requestedChanges?.discount_percent ?? 0),
      requestedBy,
      recordSnapshot,
      requestedChanges,
      displayResource: resource || row?.resource || '—',
      displayRecordNumber: String(previewTitle || requestedChanges?.proposal_reference || targetRecordId || row?.record_id || '—'),
      displayCompany: requestedChanges?.client_name || requestedChanges?.company_name || '—',
      displayRequestedBy: requestedBy || '—',
      displayCurrent: row?.old_status || requestedChanges?.current_status || '—',
      displayRequested: row?.new_status || requestedChanges?.requested_status || '—',
      displayDiscount: Number(requestedChanges?.discount_percent ?? 0),
      displayApprovalRoles: this.approvalRoleDisplay(row)
    };
  },
  buildApprovalContext(normalizedApproval = {}) {
    const normalized = this.normalizePendingApproval(normalizedApproval);
    return {
      ...normalized,
      approval_id: normalized.approvalId || '',
      approvalId: normalized.approvalId || '',
      resource: normalized.resource || '',
      requester_role: normalized.requester_role || '',
      approval_role: normalized.approval_role || '',
      old_status: normalized.old_status || normalized.currentStatus || '',
      new_status: normalized.new_status || normalized.requestedStatus || '',
      requested_changes: normalized.requestedChanges || {}
    };
  },
  isPreviewModalOpen(resource = '') {
    const normalizedResource = String(resource || '').trim().toLowerCase();
    if (normalizedResource === 'proposals') return E.proposalPreviewModal?.style?.display === 'flex';
    if (normalizedResource === 'agreements') return E.agreementPreviewModal?.classList?.contains('open') === true;
    if (normalizedResource === 'invoices') return E.invoicePreviewModal?.classList?.contains('open') === true;
    if (normalizedResource === 'receipts') return E.receiptPreviewModal?.classList?.contains('open') === true;
    return false;
  },
  getWorkflowDisplayId(record = {}) {
    return record?.proposal_id || record?.proposal_number || record?.agreement_id || record?.agreement_number || record?.invoice_id || record?.invoice_number || record?.receipt_id || record?.receipt_number || record?.deal_id || record?.deal_number || record?.lead_id || record?.lead_number || record?.display_id || '';
  },
  async resolveApprovalResourceRecord(resource = '', rawId = '') {
    const resolver = window.WorkflowResourceResolver?.resolveResourceRecord;
    if (typeof resolver !== 'function') return null;
    const record = await resolver(resource, rawId);
    console.log('[Workflow resolver]', {
      resource,
      rawId,
      resolvedId: record?.id,
      displayId: this.getWorkflowDisplayId(record)
    });
    return record;
  },
  async openResourcePreview(resource = '', recordId = '') {
    const normalizedResource = String(resource || '').trim().toLowerCase();
    const id = String(recordId || '').trim();
    if (!id) return false;
    if (normalizedResource === 'proposals' && typeof window.Proposals?.previewProposalHtml === 'function') {
      await window.Proposals.previewProposalHtml(id);
      return this.isPreviewModalOpen(normalizedResource);
    }
    if (normalizedResource === 'agreements' && typeof window.Agreements?.previewAgreementHtml === 'function') {
      await window.Agreements.previewAgreementHtml(id);
      return this.isPreviewModalOpen(normalizedResource);
    }
    if (normalizedResource === 'invoices' && typeof window.Invoices?.previewInvoice === 'function') {
      await window.Invoices.previewInvoice(id);
      return this.isPreviewModalOpen(normalizedResource);
    }
    if (normalizedResource === 'receipts' && typeof window.Receipts?.previewReceipt === 'function') {
      await window.Receipts.previewReceipt(id);
      return this.isPreviewModalOpen(normalizedResource);
    }
    return false;
  },
  clearResourcePreviewApprovalActions() {
    document.querySelectorAll('[data-workflow-resource-approval-actions]').forEach(node => node.remove());
  },
  async renderResourcePreviewApprovalActions(approval = {}) {
    this.clearResourcePreviewApprovalActions();
    const normalized = this.normalizePendingApproval(approval);
    const canAct = await canActOnWorkflowApproval(normalized);
    if (!canAct) return;
    const modal = {
      proposals: E.proposalPreviewModal,
      agreements: E.agreementPreviewModal,
      invoices: E.invoicePreviewModal,
      receipts: E.receiptPreviewModal
    }[String(normalized.resource || '').trim().toLowerCase()];
    const content = modal?.querySelector?.('.modal-content');
    if (!content) return;
    const actions = document.createElement('div');
    actions.setAttribute('data-workflow-resource-approval-actions', 'true');
    actions.className = 'actions';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';
    actions.style.marginTop = '12px';
    actions.innerHTML = `
      <button class="btn btn-success btn-sm" data-resource-approval-action="approve" type="button">Approve</button>
      <button class="btn btn-danger btn-sm" data-resource-approval-action="reject" type="button">Reject</button>
    `;
    actions.addEventListener('click', async event => {
      const button = event.target?.closest?.('[data-resource-approval-action]');
      if (!button) return;
      const action = button.getAttribute('data-resource-approval-action');
      try {
        await this.actOnApproval(action, normalized.approvalId);
        this.clearResourcePreviewApprovalActions();
      } catch (error) {
        UI.toast(error?.message || 'Unable to process approval action.');
      }
    });
    content.appendChild(actions);
  },
  formatDiscountPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0%';
    return `${numeric}%`;
  },
  toResourceLabel(resource) {
    const value = String(resource || 'approval').trim().toLowerCase();
    if (!value) return 'Approval';
    return value.charAt(0).toUpperCase() + value.slice(1);
  },
  buildApprovalPreviewModalHtml(normalized = {}) {
    const title = `${String(normalized.resource || 'approval').replace(/_/g, ' ')} · ${normalized.previewTitle || normalized.previewRecordId || 'Details'}`;
    const changedFields = Array.isArray(normalized.requestedChanges?.changed_fields) ? normalized.requestedChanges.changed_fields : [];
    const items = Array.isArray(normalized.requestedChanges?.items)
      ? normalized.requestedChanges.items
      : Array.isArray(normalized.recordSnapshot?.items) ? normalized.recordSnapshot.items : [];
    return `
      <div><strong>${U.escapeHtml(title)}</strong></div>
      <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px;">
        <div><span class="muted">Company / Client:</span> ${U.escapeHtml(normalized.companyName || '—')}</div>
        <div><span class="muted">Record:</span> ${U.escapeHtml(normalized.previewRecordId || normalized.recordId || '—')}</div>
        <div><span class="muted">Current status:</span> ${WorkflowEngine.getWorkflowBadgeHtml(normalized.currentStatus || '—')}</div>
        <div><span class="muted">Requested status:</span> ${WorkflowEngine.getWorkflowBadgeHtml(normalized.requestedStatus || '—')}</div>
        <div><span class="muted">Discount:</span> ${U.escapeHtml(this.formatDiscountPercent(normalized.discountPercent))}</div>
        <div><span class="muted">Total amount:</span> ${U.escapeHtml(String(normalized.requestedChanges?.total_amount ?? normalized.recordSnapshot?.total_amount ?? '—'))}</div>
        <div><span class="muted">Requested by:</span> ${U.escapeHtml(normalized.requestedBy || '—')}</div>
        <div><span class="muted">Approval roles:</span> ${U.escapeHtml(this.approvalRoleDisplay(normalized))}</div>
      </div>
      <div style="margin-top:10px;">
        <strong>Changed fields</strong>
        <div class="muted" style="margin-top:4px;">${U.escapeHtml(changedFields.join(', ') || 'Not specified')}</div>
      </div>
      <div style="margin-top:10px;">
        <strong>Items</strong>
        <pre style="max-height:120px;overflow:auto;margin-top:4px;">${U.escapeHtml(JSON.stringify(items, null, 2) || '[]')}</pre>
      </div>
      <div style="margin-top:10px;">
        <strong>Notes</strong>
        <div class="muted" style="margin-top:4px;">${U.escapeHtml(normalized.requestedChanges?.notes || normalized.recordSnapshot?.notes || '—')}</div>
      </div>
      <div style="margin-top:10px;">
        <strong>Requested Changes JSON</strong>
        <pre style="max-height:180px;overflow:auto;margin-top:4px;">${U.escapeHtml(JSON.stringify(normalized.requestedChanges || {}, null, 2))}</pre>
      </div>
      <div style="margin-top:10px;">
        <strong>Record Snapshot (read-only)</strong>
        <pre style="max-height:180px;overflow:auto;margin-top:4px;">${U.escapeHtml(JSON.stringify(normalized.recordSnapshot || {}, null, 2))}</pre>
      </div>
    `;
  },
  async openGenericApprovalPreview(normalizedApproval = {}) {
    this.clearResourcePreviewApprovalActions();
    const normalized = this.normalizePendingApproval(normalizedApproval);
    this.state.activeApprovalPreview = normalized;
    const canAct = await canCurrentUserActOnApproval(normalized);
    if (E.workflowApprovalPreviewTitle) E.workflowApprovalPreviewTitle.textContent = `${this.toResourceLabel(normalized.resource)} Preview · ${normalized.previewTitle || normalized.previewRecordId || 'Details'}`;
    if (E.workflowApprovalPreviewBody) E.workflowApprovalPreviewBody.innerHTML = this.buildApprovalPreviewModalHtml(normalized);
    [E.workflowApprovalPreviewApproveBtn, E.workflowApprovalPreviewRejectBtn].forEach(button => {
      if (button) button.style.display = canAct ? '' : 'none';
    });
    if (E.workflowApprovalPreviewModal) {
      E.workflowApprovalPreviewModal.classList.add('open');
      E.workflowApprovalPreviewModal.setAttribute('aria-hidden', 'false');
    }
    if (window.setAppHashRoute && window.buildRecordHashRoute) setAppHashRoute(buildRecordHashRoute('workflow', normalized || {}));
  },
  closeApprovalPreview() {
    this.clearResourcePreviewApprovalActions();
    this.state.activeApprovalPreview = null;
    if (!E.workflowApprovalPreviewModal) return;
    E.workflowApprovalPreviewModal.classList.remove('open');
    E.workflowApprovalPreviewModal.setAttribute('aria-hidden', 'true');
    if (E.workflowApprovalPreviewBody) E.workflowApprovalPreviewBody.innerHTML = '';
    if (window.setAppHashRoute) setAppHashRoute('#workflow');
  },
  async openApprovalPreview(approvalRow = {}) {
    const normalized = this.normalizePendingApproval(approvalRow);
    const context = this.buildApprovalContext(normalized);
    const resource = String(context.resource || '').trim().toLowerCase();
    const rawPreviewId = String(
      context?.resource_id ||
      context?.target_id ||
      context?.requested_changes?.resource_id ||
      context?.requested_changes?.target_id ||
      context?.requested_changes?.proposal_uuid ||
      context?.requested_changes?.agreement_uuid ||
      context?.requested_changes?.invoice_uuid ||
      context?.requested_changes?.receipt_uuid ||
      context?.requested_changes?.proposal?.id ||
      context?.requested_changes?.agreement?.id ||
      context?.requested_changes?.invoice?.id ||
      context?.requested_changes?.receipt?.id ||
      context?.recordId ||
      context?.requested_changes?.proposal_id ||
      context?.requested_changes?.agreement_id ||
      context?.requested_changes?.invoice_id ||
      context?.requested_changes?.receipt_id ||
      ''
    ).trim();
    let previewId = rawPreviewId;
    this.state.activeApprovalPreview = context;
    try {
      const resolvedRecord = await this.resolveApprovalResourceRecord(resource, rawPreviewId);
      if (resolvedRecord?.id) {
        previewId = String(resolvedRecord.id).trim();
        this.state.activeApprovalPreview = {
          ...context,
          resolvedRecordId: previewId,
          resource_display_id: this.getWorkflowDisplayId(resolvedRecord) || context.resource_display_id || context?.requested_changes?.resource_display_id || ''
        };
      }
      const opened = await this.openResourcePreview(resource, previewId);
      if (opened) {
        await this.renderResourcePreviewApprovalActions(this.state.activeApprovalPreview);
        return;
      }
    } catch (error) {
      console.warn(`Unable to open ${resource} preview from workflow approval, falling back to generic preview.`, error);
    }
    await this.openGenericApprovalPreview(context);
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
    this.toggleWorkflowDiscountFields(selectedResource);
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
      E.workflowRulesTbody.innerHTML = `<tr><td colspan="11" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(this.state.loadError)}</td></tr>`;
      return;
    }
    if (!allRows.length) {
      E.workflowRulesTbody.innerHTML = '<tr><td colspan="11" class="muted" style="text-align:center;">No workflow rules returned by API.</td></tr>';
      return;
    }
    if (!rows.length) {
      E.workflowRulesTbody.innerHTML = '<tr><td colspan="11" class="muted" style="text-align:center;">No rules match the current filter. Clear filter to see all.</td></tr>';
      return;
    }
    E.workflowRulesTbody.innerHTML = rows.map(rule => {
      const normalizedRule = this.normalizeWorkflowRule(rule);
      const isProposal = String(normalizedRule.resource || '').trim().toLowerCase() === 'proposals';
      const approvalRoles = this.parseRoleList(normalizedRule.approval_roles, normalizedRule.approval_roles_csv || normalizedRule.approval_role);
      const annualLimit = isProposal ? normalizedRule.annual_saas_no_approval_until_percent : normalizedRule.max_discount_percent;
      const annualHardStop = isProposal ? normalizedRule.annual_saas_hard_stop_discount_percent : normalizedRule.hard_stop_discount_percent;
      const oneTimeLimit = isProposal ? normalizedRule.one_time_fee_no_approval_until_percent : '—';
      const oneTimeHardStop = isProposal ? normalizedRule.one_time_fee_hard_stop_discount_percent : '—';
      return `
      <tr>
        <td>${U.escapeHtml(normalizedRule.resource || '—')}</td>
        <td>${U.escapeHtml(normalizedRule.current_status || '—')}</td>
        <td>${U.escapeHtml(normalizedRule.next_status || '—')}</td>
        <td>${U.escapeHtml(Array.isArray(normalizedRule.allowed_roles) ? normalizedRule.allowed_roles.join(', ') : String(normalizedRule.allowed_roles || normalizedRule.allowed_roles_csv || '—'))}</td>
        <td>${WorkflowEngine.toBool(normalizedRule.requires_approval) ? `Yes (${U.escapeHtml(approvalRoles.join(', ') || 'required')})` : 'No'}</td>
        <td>${U.escapeHtml(String(annualLimit ?? '—'))}</td>
        <td>${U.escapeHtml(String(annualHardStop ?? '—'))}</td>
        <td>${U.escapeHtml(String(oneTimeLimit ?? '—'))}</td>
        <td>${U.escapeHtml(String(oneTimeHardStop ?? '—'))}</td>
        <td>${WorkflowEngine.toBool(normalizedRule.is_active) ? 'Yes' : 'No'}</td>
        <td>${this.canManageWorkflowRules()
          ? `<button class="chip-btn" data-rule-edit="${U.escapeHtml(normalizedRule.workflow_rule_id || normalizedRule.id || '')}">Edit</button> <button class="chip-btn" data-rule-delete="${U.escapeHtml(normalizedRule.workflow_rule_id || normalizedRule.id || '')}">Delete</button>`
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
  async renderApprovals() {
    if (!E.workflowApprovalsTbody) return;
    const rows = await Promise.all(this.state.approvals.map(async item => {
      const normalized = this.normalizePendingApproval(item);
      const approvalId = this.getApprovalId(item);
      const approvalRolesDisplay = getUniqueApprovalRolesLabel(item) || '—';
      const canAct = shouldShowApprovalActionButtons(item);
      console.log('[Workflow approval buttons]', {
        approvalId: item?.id || item?.approval_id || item?.workflow_approval_id,
        resource: item?.resource,
        status: item?.status || item?.approval_status || item?.request_status,
        currentRole: getCurrentApprovalUserRole(),
        approvalRoles: getApprovalRolesFromRow(item),
        canAct
      });
      const actionButtons = `<button class="chip-btn" data-approval-action="open" data-approval-id="${U.escapeHtml(approvalId)}">Open</button> ${canAct ? `<button class="btn btn-success btn-sm" data-approval-action="approve" data-approval-id="${U.escapeHtml(approvalId)}">Approve</button> <button class="btn btn-danger btn-sm" data-approval-action="reject" data-approval-id="${U.escapeHtml(approvalId)}">Reject</button>` : ''}`;
      return `
      <tr>
        <td>${U.escapeHtml(normalized.resource || normalized.displayResource)}</td><td>${U.escapeHtml(normalized.displayRecordNumber)}</td><td>${U.escapeHtml(normalized.displayCompany)}</td><td>${U.escapeHtml(normalized.displayRequestedBy)}</td>
        <td>${WorkflowEngine.getWorkflowBadgeHtml(normalized.displayCurrent)}</td><td>${WorkflowEngine.getWorkflowBadgeHtml(normalized.displayRequested)}</td><td>${U.escapeHtml(this.formatDiscountPercent(normalized.displayDiscount))}</td><td>${U.escapeHtml(approvalRolesDisplay || normalized.displayApprovalRoles)}</td>
        <td>${WorkflowEngine.getWorkflowBadgeHtml(item.status || item.approval_status || item.request_status || 'Pending Approval')}</td>
        <td>${actionButtons}</td>
      </tr>
    `;
    }));
    E.workflowApprovalsTbody.innerHTML = rows.join('') || '<tr><td colspan="10" class="muted" style="text-align:center;">No pending approvals.</td></tr>';
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
      const hay = [item.resource, item.record_id, item.action, item.user_name || item.user_role, item.reason, item.old_status, item.new_status].join(' ').toLowerCase();
      return hay.includes(query);
    });
    E.workflowAuditTbody.innerHTML = rows.map(item => `<tr><td>${U.escapeHtml(U.fmtTS(item.created_at) || item.created_at || '—')}</td><td>${U.escapeHtml(item.resource || '—')}</td><td>${U.escapeHtml(String(item.record_id || '—'))}</td><td>${U.escapeHtml(item.action || '—')}</td><td>${U.escapeHtml(item.old_status || '—')}</td><td>${U.escapeHtml(item.new_status || '—')}</td><td>${U.escapeHtml(item.user_name || item.user_role || '—')}</td><td>${WorkflowEngine.toBool(item.allowed) ? '✅' : '❌'}</td><td>${U.escapeHtml(item.reason || '—')}</td></tr>`).join('') || '<tr><td colspan="9" class="muted" style="text-align:center;">No audit entries.</td></tr>';
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
      this.renderAdminConfigVisibility();
      this.renderRules();
      if (this.isWorkflowAdminConfigAllowed()) {
        this.renderDiscountPolicy();
        this.renderMatrix();
      }
      await this.renderApprovals();
      this.renderAudit();
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
      const isAdminConfigAllowed = this.isWorkflowAdminConfigAllowed();
      const canReadWorkflowApprovals = this.canProcessApprovals();
      this.renderAdminConfigVisibility();
      const [rulesResult, approvalsResult, auditResult] = await Promise.allSettled([
        isAdminConfigAllowed ? Api.listWorkflowRules({}, { forceRefresh: true }) : Promise.resolve([]),
        canReadWorkflowApprovals ? Api.listPendingWorkflowApprovals() : Promise.resolve([]),
        canReadWorkflowApprovals ? Api.listWorkflowAudit() : Promise.resolve([])
      ]);
      const normalizedRules = rulesResult.status === 'fulfilled' ? this.normalizeRows(rulesResult.value).map(rule => this.normalizeWorkflowRule(rule)) : [];
      if (rulesResult.status !== 'fulfilled' && isAdminConfigAllowed) { throw rulesResult.reason || new Error('Workflow rules request failed.'); }
      this.state.rules = normalizedRules;
      const loadedApprovals = approvalsResult.status === 'fulfilled' ? this.normalizeRows(approvalsResult.value) : [];
      this.state.approvals = loadedApprovals.filter(row => this.canSeeApproval(row));
      const loadedAudit = auditResult.status === 'fulfilled' ? this.normalizeRows(auditResult.value) : [];
      if (this.isWorkflowAdminConfigAllowed()) this.state.audit = loadedAudit;
      else {
        const allowedApprovalIds = new Set(this.state.approvals.map(row => String(row.approval_id || '').trim()).filter(Boolean));
        const allowedRecordIds = new Set(this.state.approvals.flatMap(row => [row.record_id, row.proposal_id, row.agreement_id, row.invoice_id, row.receipt_id]).map(v => String(v || '').trim()).filter(Boolean));
        this.state.audit = loadedAudit.filter(row => allowedApprovalIds.has(String(row.approval_id || '').trim()) || allowedRecordIds.has(String(row.record_id || '').trim()));
      }
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
      if (this.isWorkflowAdminConfigAllowed()) {
        this.renderDiscountPolicy();
        this.renderMatrix();
      }
      await this.renderApprovals();
      this.renderAudit();
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
    if (payload.resource === 'proposals') {
      const categoryPairs = [
        ['Annual SaaS', payload.annual_saas_no_approval_until_percent, payload.annual_saas_hard_stop_discount_percent],
        ['One-Time Fees', payload.one_time_fee_no_approval_until_percent, payload.one_time_fee_hard_stop_discount_percent]
      ];
      for (const [label, noApproval, hardStop] of categoryPairs) {
        if (!Number.isFinite(noApproval) || !Number.isFinite(hardStop) || noApproval < 0 || hardStop < 0) {
          return UI.toast(`${label} discount limits must be numbers greater than or equal to 0.`);
        }
        if (noApproval > hardStop) {
          return UI.toast(`${label} no-approval limit must be less than or equal to hard stop.`);
        }
      }
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
  async actOnApproval(action, approvalId, { reviewerComment = null, closePreview = false } = {}) {
    const id = String(approvalId || '').trim();
    if (!id) return;
    const reviewer_comment = reviewerComment == null
      ? (window.prompt(`${action === 'approve' ? 'Approval' : 'Rejection'} comment`, '') || '')
      : String(reviewerComment || '');
    const activeApproval = this.state.approvals.find(item => this.getApprovalId(item) === id)
      || (this.getApprovalId(this.state.activeApprovalPreview) === id ? this.state.activeApprovalPreview : null);
    if (!activeApproval || !(await this.canActOnApproval(activeApproval, action))) { UI.toast('This approval is not assigned to your role/user.'); return; }
    const normalizedApproval = this.normalizePendingApproval(activeApproval || { approval_id: id });
    if (action === 'approve') await Api.approveWorkflowRequest({ approval_id: id, reviewer_comment });
    else await Api.rejectWorkflowRequest({ approval_id: id, reviewer_comment });
    UI.toast(action === 'approve' ? 'Approval applied successfully.' : 'Approval rejected.');
    if (closePreview) this.closeApprovalPreview();
    await this.loadAndRefresh(true);
    await this.refreshResourceAfterApproval(normalizedApproval);
  },
  async refreshResourceAfterApproval(approval = {}) {
    const resource = String(approval?.resource || '').trim().toLowerCase();
    const tasks = [];
    if (resource === 'proposals' && window.Proposals?.loadAndRefresh) tasks.push(window.Proposals.loadAndRefresh({ force: true }));
    if (resource === 'agreements' && window.Agreements?.loadAndRefresh) tasks.push(window.Agreements.loadAndRefresh({ force: true }));
    if (resource === 'invoices' && window.Invoices?.refresh) tasks.push(window.Invoices.refresh(true));
    if (resource === 'receipts' && window.Receipts?.refresh) tasks.push(window.Receipts.refresh(true));
    if (!tasks.length) return;
    await Promise.allSettled(tasks);
  },
  wire() {
    this.renderAdminConfigVisibility();
    const blockedHash = ['workflow-builder', 'discount-policy', 'transition-matrix'].some(seg => window.location.hash.toLowerCase().includes(seg));
    if (blockedHash && !this.isWorkflowAdminConfigAllowed()) UI.toast('Only administrators can access Workflow Builder, Discount Policy, and Transition Matrix.');
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
    if (E.workflowResource) E.workflowResource.addEventListener('change', () => {
      this.populateRuleSelects();
      this.toggleWorkflowDiscountFields(E.workflowResource.value);
    });
    if (E.workflowMatrixResource) E.workflowMatrixResource.addEventListener('change', () => this.renderMatrix());
    [E.workflowAuditSearch, E.workflowAuditResourceFilter, E.workflowAuditAllowedFilter].forEach(el => {
      if (!el) return;
      el.addEventListener('input', () => this.renderAudit());
      el.addEventListener('change', () => this.renderAudit());
    });

    if (E.workflowRulesTbody) {
      E.workflowRulesTbody.addEventListener('click', async event => {
        if (!this.isWorkflowAdminConfigAllowed()) return UI.toast('Only administrators can access Workflow Builder, Discount Policy, and Transition Matrix.');
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
        const action = button.getAttribute('data-approval-action');
        const approvalId = button.getAttribute('data-approval-id');
        try {
          if (action === 'open') {
            const approval = this.state.approvals.find(item => this.getApprovalId(item) === String(approvalId || '').trim());
            await this.openApprovalPreview(approval || {});
            return;
          }
          button.disabled = true;
          await this.actOnApproval(action, approvalId);
        } catch (error) {
          button.disabled = false;
          console.error(`[Workflow approval ${action} failed]`, error);
          UI.toast(error?.message || `Unable to ${action === 'approve' ? 'approve' : 'reject'} workflow request.`);
        }
      });
    }
    if (E.workflowMatrixContainer) {
      E.workflowMatrixContainer.addEventListener('click', event => {
        if (!this.isWorkflowAdminConfigAllowed()) return UI.toast('Only administrators can access Workflow Builder, Discount Policy, and Transition Matrix.');
        const button = event.target?.closest?.('[data-matrix-from]');
        if (!button) return;
        const from = button.getAttribute('data-matrix-from');
        const to = button.getAttribute('data-matrix-to');
        const resource = String(E.workflowMatrixResource?.value || '').trim();
        const rule = this.state.rules.find(item => String(item.resource || '').toLowerCase() === resource.toLowerCase() && String(item.current_status || '').toLowerCase() === String(from || '').toLowerCase() && String(item.next_status || '').toLowerCase() === String(to || '').toLowerCase());
        this.fillRuleForm(rule || { resource, current_status: from, next_status: to, is_active: true });
      });
    }
    if (E.workflowApprovalPreviewCloseBtn) E.workflowApprovalPreviewCloseBtn.addEventListener('click', () => this.closeApprovalPreview());
    if (E.workflowApprovalPreviewFooterCloseBtn) E.workflowApprovalPreviewFooterCloseBtn.addEventListener('click', () => this.closeApprovalPreview());
    if (E.workflowApprovalPreviewModal) {
      E.workflowApprovalPreviewModal.addEventListener('click', event => {
        if (event.target === E.workflowApprovalPreviewModal) this.closeApprovalPreview();
      });
    }
    if (E.workflowApprovalPreviewApproveBtn) {
      E.workflowApprovalPreviewApproveBtn.addEventListener('click', async () => {
        const active = this.state.activeApprovalPreview;
        if (!active?.approvalId) return;
        try {
          await this.actOnApproval('approve', active.approvalId, { closePreview: true });
        } catch (error) {
          UI.toast(error?.message || 'Unable to approve request.');
        }
      });
    }
    if (E.workflowApprovalPreviewRejectBtn) {
      E.workflowApprovalPreviewRejectBtn.addEventListener('click', async () => {
        const active = this.state.activeApprovalPreview;
        if (!active?.approvalId) return;
        try {
          await this.actOnApproval('reject', active.approvalId, { closePreview: true });
        } catch (error) {
          UI.toast(error?.message || 'Unable to reject request.');
        }
      });
    }
  }
};

window.normalizeWorkflowApprovalRole = normalizeRole;
window.normalizeWorkflowApprovalRoleList = normalizeRoleList;
window.isPendingApprovalStatus = isPendingApprovalStatus;
window.roleMatchesApproval = roleMatchesApproval;
window.canCurrentUserActOnApproval = canCurrentUserActOnApproval;
window.WorkflowEngine = WorkflowEngine;
window.Workflow = Workflow;
