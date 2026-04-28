const NotificationSetup = {
  state: { rules: [], roles: [], dirty: new Set(), filterModule: '', filterStatus: 'all', search: '' },
  moduleActions: [
    ['tickets',['ticket_created','ticket_high_priority','ticket_status_changed','ticket_dev_team_status_changed','ticket_under_development','ticket_youtrack_changed','ticket_issue_related_changed']],
    ['leads',['lead_created','lead_updated','lead_converted_to_deal']],
    ['deals',['deal_created','deal_updated','deal_created_from_lead','deal_important_stage']],
    ['proposals',['proposal_created','proposal_updated','proposal_requires_approval','proposal_approved','proposal_rejected','proposal_created_from_deal']],
    ['agreements',['agreement_created','agreement_created_from_proposal','agreement_requires_signature','agreement_signed']],
    ['invoices',['invoice_created','invoice_created_from_agreement','invoice_payment_state_changed','invoice_fully_paid']],
    ['receipts',['receipt_created','receipt_created_from_invoice','receipt_updated']],
    ['operations_onboarding',['onboarding_created','operations_onboarding_created','onboarding_status_changed','onboarding_request_submitted']],
    ['technical_admin_requests',['technical_request_submitted','technical_request_status_changed']],
    ['events',['event_created','event_updated','event_status_changed','event_schedule_changed','event_deleted']],
    ['workflow',['workflow_approval_requested','workflow_approved','workflow_rejected']]
  ],

  wire() {
    const root = document.getElementById('notificationSetupCard');
    if (!root) return;
    const bind = (id, fn, evt = 'click') => document.getElementById(id)?.addEventListener(evt, fn);
    bind('notificationSetupRefreshBtn', () => this.load(true));
    bind('notificationSetupSaveAllBtn', () => this.saveAll());
    bind('notificationSetupResetDefaultsBtn', () => this.resetDefaults());
    bind('notificationSetupModuleFilter', e => { this.state.filterModule = e.target.value; this.render(); }, 'change');
    bind('notificationSetupStatusFilter', e => { this.state.filterStatus = e.target.value; this.render(); }, 'change');
    bind('notificationSetupSearchInput', e => { this.state.search = String(e.target.value || '').toLowerCase().trim(); this.render(); }, 'input');
  },

  async load(force = false) {
    if (!Permissions.canManageNotificationSettings()) return;
    try {
      const [rulesRes, rolesRes] = await Promise.all([Api.listNotificationSettings(), Api.listRoles({ forceRefresh: force })]);
      const rawRules = Array.isArray(rulesRes?.rows)
        ? rulesRes.rows
        : Array.isArray(rulesRes?.data)
          ? rulesRes.data
          : Array.isArray(rulesRes?.items)
            ? rulesRes.items
            : Array.isArray(rulesRes)
              ? rulesRes
              : [];
      this.state.rules = rawRules.map(rule => ({
        ...rule,
        is_enabled: (rule?.is_enabled ?? rule?.enabled) !== false,
        in_app_enabled: rule?.in_app_enabled !== false,
        pwa_enabled: rule?.pwa_enabled !== false,
        email_enabled: rule?.email_enabled === true,
        recipient_roles: Array.isArray(rule?.recipient_roles) ? rule.recipient_roles : [],
        recipient_user_ids: Array.isArray(rule?.recipient_user_ids) ? rule.recipient_user_ids : [],
        recipient_emails: Array.isArray(rule?.recipient_emails) ? rule.recipient_emails : [],
        users_from_record: Array.isArray(rule?.users_from_record) ? rule.users_from_record : [],
        exclude_actor: rule?.exclude_actor !== false,
        dedupe_window_seconds: Number(rule?.dedupe_window_seconds || 60)
      }));
      this.state.roles = Array.isArray(rolesRes?.rows) ? rolesRes.rows : Array.isArray(rolesRes) ? rolesRes : [];
      this.render();
    } catch (error) {
      UI.toast(String(error?.message || 'Unable to load notification settings.'));
    }
  },

  getRule(resource, action) {
    return this.state.rules.find(r => String(r.resource) === resource && String(r.action) === action) || null;
  },

  collect(resource, action) {
    const row = document.querySelector(`tr[data-resource="${resource}"][data-action="${action}"]`);
    if (!row) return null;
    const val = sel => row.querySelector(sel)?.value;
    const checked = sel => row.querySelector(sel)?.checked === true;
    const split = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
    const existingRule = this.getRule(resource, action) || {};
    return {
      id: existingRule.id,
      resource,
      action,
      description: String(existingRule.description || '').trim(),
      is_enabled: checked('[data-k="enabled"]'),
      in_app_enabled: checked('[data-k="inapp"]'),
      pwa_enabled: checked('[data-k="pwa"]'),
      email_enabled: checked('[data-k="email"]'),
      exclude_actor: checked('[data-k="exclude"]'),
      dedupe_window_seconds: Math.max(0, Number(val('[data-k="dedupe"]') || 60) || 60),
      recipient_roles: [...row.querySelectorAll('[data-k="roles"] option:checked')].map(o => o.value),
      recipient_user_ids: Array.isArray(existingRule.recipient_user_ids) ? existingRule.recipient_user_ids : [],
      recipient_emails: split(val('[data-k="emails"]')),
      users_from_record: split(val('[data-k="record"]'))
    };
  },

  sanitizeRuleInput(rule = {}) {
    const input = rule && typeof rule === 'object' ? { ...rule } : {};
    if ('enabled' in input && !('is_enabled' in input)) input.is_enabled = input.enabled;
    delete input.enabled;
    const splitTrim = value => String(value || '').split(',').map(v => v.trim()).filter(Boolean);
    const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
    const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
    const asArray = value => Array.isArray(value) ? value : splitTrim(value);
    return {
      id: input?.id || undefined,
      resource: String(input?.resource || '').trim().toLowerCase(),
      action: String(input?.action || '').trim().toLowerCase(),
      description: String(input?.description || '').trim(),
      is_enabled: input?.is_enabled !== false,
      in_app_enabled: input?.in_app_enabled !== false,
      pwa_enabled: input?.pwa_enabled !== false,
      email_enabled: input?.email_enabled === true,
      recipient_roles: asArray(input?.recipient_roles).map(v => String(v || '').trim().toLowerCase()).filter(Boolean),
      recipient_user_ids: asArray(input?.recipient_user_ids).map(v => String(v || '').trim()).filter(isUuid),
      recipient_emails: asArray(input?.recipient_emails).map(v => String(v || '').trim().toLowerCase()).filter(isEmail),
      users_from_record: asArray(input?.users_from_record).map(v => String(v || '').trim()).filter(Boolean),
      exclude_actor: input?.exclude_actor !== false,
      dedupe_window_seconds: Math.max(1, Number(input?.dedupe_window_seconds || 60) || 60)
    };
  },

  async saveOne(resource, action) {
    const rule = this.collect(resource, action);
    if (!rule) return;
    const cleanRule = this.sanitizeRuleInput(rule);
    console.log('[NotificationSetup] save payload', cleanRule);
    const result = await Api.post({
      resource: 'notification_settings',
      action: 'upsert',
      rule: cleanRule
    });
    console.log('[NotificationSetup] save result', result);
    this.state.dirty.delete(`${resource}:${action}`);
  },

  async saveAll() {
    if (!this.state.dirty.size) return UI.toast('No changes to save.');
    const rules = [];
    [...this.state.dirty].forEach(key => {
      const [resource, action] = key.split(':');
      const rule = this.collect(resource, action);
      if (rule) rules.push(rule);
    });
    try {
      const sanitizedRules = rules.map(rule => this.sanitizeRuleInput(rule));
      console.log('[NotificationSetup] save payload', sanitizedRules);
      const result = await Api.post({
        resource: 'notification_settings',
        action: 'bulk_upsert',
        rules: sanitizedRules
      });
      console.log('[NotificationSetup] save result', result);
      UI.toast('Notification setting saved.');
      this.state.dirty.clear();
      await this.load(true);
    } catch (error) {
      const message = String(error?.message || '');
      if (message.toLowerCase().includes('forbidden') || message.toLowerCase().includes('row-level security') || message.toLowerCase().includes('rls')) {
        UI.toast('Unable to save notification setting. Admin access is required.');
      } else {
        UI.toast(String(error?.message || 'Unable to save settings.'));
      }
    }
  },

  async resetDefaults() {
    try {
      await Api.post({
        resource: 'notification_settings',
        action: 'reset_defaults'
      });
      UI.toast('Defaults restored.');
      await this.load(true);
    } catch (error) {
      UI.toast(String(error?.message || 'Unable to reset defaults.'));
    }
  },

  markDirty(resource, action) {
    this.state.dirty.add(`${resource}:${action}`);
  },

  roleOptions(selected = []) {
    const set = new Set((selected || []).map(v => String(v).trim().toLowerCase()));
    const roleRows = Array.isArray(this.state.roles) && this.state.roles.length
      ? this.state.roles
      : ['admin', 'dev', 'hoo', 'sales_executive', 'financial_controller', 'gm', 'accounting', 'viewer'].map(role_key => ({ role_key, role_name: role_key }));
    return roleRows.map(role => {
      const key = String(role.role_key || role.key || role.role || '').trim();
      const name = String(role.role_name || role.display_name || key).trim();
      return `<option value="${U.escapeHtml(key)}" ${set.has(key.toLowerCase()) ? 'selected' : ''}>${U.escapeHtml(name)}</option>`;
    }).join('');
  },

  render() {
    const tbody = document.getElementById('notificationSetupTbody');
    const state = document.getElementById('notificationSetupState');
    if (!tbody || !state) return;
    const rows = [];
    const matches = (module, action, enabled) => {
      if (this.state.filterModule && module !== this.state.filterModule) return false;
      if (this.state.filterStatus === 'enabled' && !enabled) return false;
      if (this.state.filterStatus === 'disabled' && enabled) return false;
      if (this.state.search && !action.includes(this.state.search)) return false;
      return true;
    };
    this.moduleActions.forEach(([resource, actions]) => {
      actions.forEach(action => {
        const rule = this.getRule(resource, action) || {};
        const isEnabled = rule.is_enabled !== false;
        if (!matches(resource, action, isEnabled)) return;
        const noRecipients = !(rule.recipient_roles?.length || rule.recipient_user_ids?.length || rule.recipient_emails?.length || rule.users_from_record?.length);
        rows.push(`<tr data-resource="${resource}" data-action="${action}">
          <td>${resource}</td><td>${action}</td><td class="muted">${action.replaceAll('_',' ')}</td>
          <td><input type="checkbox" data-k="enabled" ${isEnabled ? 'checked' : ''}></td>
          <td><input type="checkbox" data-k="inapp" ${(rule.in_app_enabled !== false) ? 'checked' : ''}></td>
          <td><input type="checkbox" data-k="pwa" ${(rule.pwa_enabled !== false) ? 'checked' : ''}></td>
          <td><input type="checkbox" data-k="email" ${(rule.email_enabled === true) ? 'checked' : ''}></td>
          <td><select data-k="roles" class="select" multiple size="3">${this.roleOptions(rule.recipient_roles || [])}</select></td>
          <td><input data-k="emails" class="input" placeholder="optional: user@company.com" value="${U.escapeHtml((rule.recipient_emails || []).join(','))}"></td>
          <td><input data-k="record" class="input" placeholder="requester_email,owner_email" value="${U.escapeHtml((rule.users_from_record || []).join(','))}"></td>
          <td><input type="checkbox" data-k="exclude" ${(rule.exclude_actor !== false) ? 'checked' : ''}></td>
          <td><input type="number" min="0" data-k="dedupe" class="input" style="width:90px" value="${Number(rule.dedupe_window_seconds || 60)}"></td>
          <td>
            <button class="btn sm ghost" data-save>Save</button>
            <button class="btn sm ghost" data-test>Test</button>
            ${noRecipients ? '<div class="muted" style="font-size:11px;color:#b45309;">No recipients configured. This notification will be skipped.</div>' : ''}
          </td>
        </tr>`);
      });
    });
    tbody.innerHTML = rows.join('') || '<tr><td colspan="13" class="muted">No matching rules.</td></tr>';
    state.textContent = `${rows.length} rules shown · ${this.state.dirty.size} unsaved changes`;
    tbody.querySelectorAll('input,select').forEach(el => el.addEventListener('change', e => {
      const tr = e.target.closest('tr');
      this.markDirty(tr.dataset.resource, tr.dataset.action);
      state.textContent = `${rows.length} rules shown · ${this.state.dirty.size} unsaved changes`;
    }));
    tbody.querySelectorAll('[data-save]').forEach(btn => btn.addEventListener('click', async e => {
      const tr = e.target.closest('tr');
      try {
        await this.saveOne(tr.dataset.resource, tr.dataset.action);
        UI.toast('Notification setting saved.');
      } catch (error) {
        const message = String(error?.message || '');
        if (message.toLowerCase().includes('forbidden') || message.toLowerCase().includes('row-level security') || message.toLowerCase().includes('rls')) {
          UI.toast('Unable to save notification setting. Admin access is required.');
        } else {
          UI.toast(String(error?.message || 'Unable to save rule.'));
        }
      }
    }));
    tbody.querySelectorAll('[data-test]').forEach(btn => btn.addEventListener('click', async e => {
      const tr = e.target.closest('tr');
      try { await Api.testNotificationSetting(this.collect(tr.dataset.resource, tr.dataset.action)); UI.toast('Test dispatched (or skipped based on rule).'); } catch (error) { UI.toast(String(error?.message || 'Unable to test rule.')); }
    }));
  }
};

window.NotificationSetup = NotificationSetup;
