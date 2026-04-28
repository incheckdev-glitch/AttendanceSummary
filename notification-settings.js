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
      this.state.rules = Array.isArray(rulesRes?.rows) ? rulesRes.rows : Array.isArray(rulesRes) ? rulesRes : [];
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
    return {
      resource,
      action,
      enabled: checked('[data-k="enabled"]'),
      in_app_enabled: checked('[data-k="inapp"]'),
      pwa_enabled: checked('[data-k="pwa"]'),
      email_enabled: checked('[data-k="email"]'),
      exclude_actor: checked('[data-k="exclude"]'),
      dedupe_window_seconds: Math.max(0, Number(val('[data-k="dedupe"]') || 60) || 60),
      recipient_roles: [...row.querySelectorAll('[data-k="roles"] option:checked')].map(o => o.value),
      recipient_emails: split(val('[data-k="emails"]')),
      users_from_record: split(val('[data-k="record"]'))
    };
  },

  async saveOne(resource, action) {
    const rule = this.collect(resource, action);
    if (!rule) return;
    await Api.upsertNotificationSetting(rule);
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
      await Api.bulkUpsertNotificationSettings(rules);
      UI.toast('Notification settings saved.');
      this.state.dirty.clear();
      await this.load(true);
    } catch (error) {
      UI.toast(String(error?.message || 'Unable to save settings.'));
    }
  },

  async resetDefaults() {
    try {
      await Api.resetNotificationSettingsDefaults();
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
    const set = new Set((selected || []).map(v => String(v).toLowerCase()));
    return (this.state.roles || []).map(role => {
      const key = String(role.role_key || '').trim();
      const name = String(role.role_name || key).trim();
      return `<option value="${U.escapeHtml(key)}" ${set.has(key) ? 'selected' : ''}>${U.escapeHtml(name)}</option>`;
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
        const enabled = rule.enabled !== false;
        if (!matches(resource, action, enabled)) return;
        const noRecipients = !(rule.recipient_roles?.length || rule.recipient_user_ids?.length || rule.recipient_emails?.length || rule.users_from_record?.length);
        rows.push(`<tr data-resource="${resource}" data-action="${action}">
          <td>${resource}</td><td>${action}</td><td class="muted">${action.replaceAll('_',' ')}</td>
          <td><input type="checkbox" data-k="enabled" ${enabled ? 'checked' : ''}></td>
          <td><input type="checkbox" data-k="inapp" ${(rule.in_app_enabled !== false) ? 'checked' : ''}></td>
          <td><input type="checkbox" data-k="pwa" ${(rule.pwa_enabled !== false) ? 'checked' : ''}></td>
          <td><input type="checkbox" data-k="email" ${(rule.email_enabled === true) ? 'checked' : ''}></td>
          <td><select data-k="roles" class="select" multiple size="3">${this.roleOptions(rule.recipient_roles || [])}</select></td>
          <td><input data-k="emails" class="input" placeholder="a@x.com,b@y.com" value="${U.escapeHtml((rule.recipient_emails || []).join(','))}"></td>
          <td><input data-k="record" class="input" placeholder="owner_email,created_by_email" value="${U.escapeHtml((rule.users_from_record || []).join(','))}"></td>
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
      try { await this.saveOne(tr.dataset.resource, tr.dataset.action); UI.toast('Rule saved.'); } catch (error) { UI.toast(String(error?.message || 'Unable to save rule.')); }
    }));
    tbody.querySelectorAll('[data-test]').forEach(btn => btn.addEventListener('click', async e => {
      const tr = e.target.closest('tr');
      try { await Api.testNotificationSetting(this.collect(tr.dataset.resource, tr.dataset.action)); UI.toast('Test dispatched (or skipped based on rule).'); } catch (error) { UI.toast(String(error?.message || 'Unable to test rule.')); }
    }));
  }
};

window.NotificationSetup = NotificationSetup;
