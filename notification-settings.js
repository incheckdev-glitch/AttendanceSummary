const NotificationSetup = {
  state: { rules: [], roles: [], dirty: new Set(), filterModule: '', filterStatus: 'all', search: '' },
  moduleActions: [
    ['tickets',['ticket_created','ticket_assigned']],
    ['leads',['lead_created','lead_updated','lead_converted_to_deal','lead_follow_up_due_today']],
    ['deals',['deal_created','deal_updated','deal_created_from_lead','deal_important_stage','deal_follow_up_due_today']],
    ['proposals',['proposal_created','proposal_approval_required']],
    ['agreements',['agreement_signed']],
    ['invoices',['invoice_issued']],
    ['invoice_payment_schedule',['payment_followup_due']],
    ['receipts',['receipt_created','credit_note_created']],
    ['biners',['biners_entry_created']],
    ['operations_onboarding',['onboarding_created','renewal_due','csm_activity_created']],
    ['events',['event_created']],
    ['workflow',['workflow_approval_requested','workflow_approved','workflow_rejected']],
    ['communication_centre',['communication_message_created']]
  ],



  formatResourceLabel(resource = '') {
    return String(resource || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  },

  formatActionLabel(action = '') {
    if (action === 'assigned_csm') return 'New Client / Location Assigned to You';
    if (action === 'conversation_created') return 'Conversation Created';
    if (action === 'reply_added') return 'Reply Added';
    if (action === 'conversation_closed') return 'Conversation Closed';
    if (action === 'conversation_reopened') return 'Conversation Reopened';
    return String(action || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  },

  getNotificationDescription(resource, action) {
    if (resource === 'operations_onboarding' && action === 'assigned_csm') {
      return 'Notify the selected CSM when a new client or location is assigned to them in Operations Onboarding.';
    }
    if (resource === 'invoice_payment_schedule' && action === 'payment_due_reminder') {
      return 'Notify selected users 30, 14, or 7 days before an invoice payment schedule due date.';
    }
    if (resource === 'biners' && action === 'biners_entry_created') {
      return 'Notify relevant users when a new Biners payable entry is created.';
    }
    return '';
  },

  getEventRegistry() {
    const registry = new Map();
    this.moduleActions.forEach(([resource, actions]) => {
      actions.forEach(action => {
        registry.set(`${resource}:${action}`, { resource, action });
      });
    });
    this.state.rules.forEach(rule => {
      const resource = String(rule?.resource || '').trim();
      const action = String(rule?.action || '').trim();
      if (!resource || !action) return;
      registry.set(`${resource}:${action}`, { resource, action });
    });
    return [...registry.values()];
  },

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
      const client = window.SupabaseClient?.getClient?.();
      const [rulesRes, rolesRes, eventTypesRes, userSettingsRes] = await Promise.all([
        Api.listNotificationSettings(),
        Api.listRoles({ forceRefresh: force }),
        client ? client.from('notification_event_types').select('*').order('module', { ascending: true }).order('event_key', { ascending: true }) : Promise.resolve({ data: [] }),
        client ? client.from('notification_user_settings').select('*').limit(1000) : Promise.resolve({ data: [] })
      ]);
      const eventTypeRows = Array.isArray(eventTypesRes?.data) ? eventTypesRes.data : [];
      const rawRules = eventTypeRows.length
        ? eventTypeRows.map(eventType => ({
            ...eventType,
            resource: eventType.module || eventType.resource,
            action: eventType.action || eventType.event_key,
            event_key: eventType.event_key,
            is_enabled: eventType.enabled ?? eventType.is_enabled,
            in_app_enabled: eventType.default_in_app ?? eventType.in_app_enabled,
            pwa_enabled: eventType.default_pwa ?? eventType.pwa_enabled,
            email_enabled: eventType.default_email ?? eventType.email_enabled
          }))
        : (Array.isArray(rulesRes?.rows) ? rulesRes.rows : Array.isArray(rulesRes) ? rulesRes : []);
      this.state.rules = rawRules.map(rule => ({
        ...rule,
        is_enabled: (rule?.is_enabled ?? rule?.enabled) !== false,
        in_app_enabled: rule?.in_app_enabled !== false,
        pwa_enabled: rule?.pwa_enabled !== false,
        email_enabled: rule?.email_enabled !== false,
        recipient_roles: Array.isArray(rule?.recipient_roles) ? rule.recipient_roles : [],
        recipient_user_ids: Array.isArray(rule?.recipient_user_ids) ? rule.recipient_user_ids : [],
        recipient_emails: Array.isArray(rule?.recipient_emails) ? rule.recipient_emails : [],
        users_from_record: Array.isArray(rule?.users_from_record) ? rule.users_from_record : [],
        exclude_actor: rule?.exclude_actor !== false,
        dedupe_window_seconds: Number(rule?.dedupe_window_seconds || 60),
        title_template: String(rule?.title_template || rule?.title || '').trim(),
        body_template: String(rule?.body_template || rule?.body || rule?.message_template || '').trim(),
        recipient_mode: String(rule?.recipient_mode || '').trim(),
        deep_link_template: String(rule?.deep_link_template || rule?.url_template || '').trim(),
        resource_label: String(rule?.resource_label || '').trim(),
        action_label: String(rule?.action_label || '').trim(),
        event_key: String(rule?.event_key || rule?.action || '').trim()
      }));
      this.state.userSettings = Array.isArray(userSettingsRes?.data) ? userSettingsRes.data : [];
      this.state.roles = Array.isArray(rolesRes?.rows) ? rolesRes.rows : Array.isArray(rolesRes) ? rolesRes : [];
      console.info('[notification setup] rules loaded', {
        count: this.state.rules.length,
        hasAssignedCsm: this.state.rules.some(rule =>
          rule.resource === 'operations_onboarding' &&
          rule.action === 'assigned_csm'
        )
      });
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
      users_from_record: split(val('[data-k="record"]')),
      recipient_mode: String(val('[data-k="recipient_mode"]') || existingRule.recipient_mode || '').trim(),
      title_template: String(val('[data-k="title_template"]') || '').trim(),
      body_template: String(val('[data-k="body_template"]') || '').trim(),
      deep_link_template: String(val('[data-k="deep_link_template"]') || '').trim(),
      resource_label: String(existingRule.resource_label || this.formatResourceLabel(resource)).trim(),
      action_label: String(existingRule.action_label || this.formatActionLabel(action)).trim()
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
    this.getEventRegistry().forEach(({ resource, action }) => {
        const rule = this.getRule(resource, action) || {};
        const isEnabled = rule.is_enabled !== false;
        if (!matches(resource, action, isEnabled)) return;
        const hasRecipientMode = Boolean(String(rule.recipient_mode || '').trim());
        const noRecipients = !(hasRecipientMode || rule.recipient_roles?.length || rule.recipient_user_ids?.length || rule.recipient_emails?.length || rule.users_from_record?.length);
        const actionLabel = String(rule.action_label || this.formatActionLabel(action));
        const resourceLabel = String(rule.resource_label || this.formatResourceLabel(resource));
        const description = String(rule.description || this.getNotificationDescription(resource, action) || '').trim();
        const templateBlock = `
          <div class="notification-template-grid" style="display:grid;grid-template-columns:1fr;gap:6px;min-width:280px;">
            <input data-k="title_template" class="input" placeholder="Title template" value="${U.escapeHtml(rule.title_template || '')}">
            <textarea data-k="body_template" class="input" rows="2" placeholder="Body template">${U.escapeHtml(rule.body_template || '')}</textarea>
            <input data-k="deep_link_template" class="input" placeholder="Deep link template" value="${U.escapeHtml(rule.deep_link_template || '')}">
          </div>`;
        rows.push(`<tr data-resource="${resource}" data-action="${action}">
          <td>${U.escapeHtml(resourceLabel)}</td><td>${U.escapeHtml(actionLabel)}<div class="muted" style="font-size:11px;">event key: ${U.escapeHtml(rule.event_key || action)}</div><div class="muted" style="font-size:11px;">module: ${U.escapeHtml(resource)}</div></td><td class="muted">${U.escapeHtml(description || actionLabel)}${templateBlock}</td>
          <td><input type="checkbox" data-k="enabled" ${isEnabled ? 'checked' : ''}></td>
          <td><input type="checkbox" data-k="inapp" ${(rule.in_app_enabled !== false) ? 'checked' : ''}></td>
          <td><input type="checkbox" data-k="pwa" ${(rule.pwa_enabled !== false) ? 'checked' : ''}></td>
          <td><input type="checkbox" data-k="email" ${(rule.email_enabled === true) ? 'checked' : ''}></td>
          <td><input data-k="recipient_mode" class="input" placeholder="participants_except_actor" value="${U.escapeHtml(rule.recipient_mode || '')}"><div class="muted" style="font-size:11px;">Use recipient mode for dynamic CC recipients.</div></td>
          <td><select data-k="roles" class="select" multiple size="3">${this.roleOptions(rule.recipient_roles || [])}</select></td>
          <td><input data-k="emails" class="input" placeholder="optional: user@company.com" value="${U.escapeHtml((rule.recipient_emails || []).join(','))}"></td>
          <td><input data-k="record" class="input" placeholder="requester_email,owner_email" value="${U.escapeHtml((rule.users_from_record || []).join(','))}"></td>
          <td><input type="checkbox" data-k="exclude" ${(rule.exclude_actor !== false) ? 'checked' : ''}></td>
          <td><input type="number" min="0" data-k="dedupe" class="input" style="width:90px" value="${Number(rule.dedupe_window_seconds || 60)}"></td>
          <td>
            <button class="btn sm ghost" data-save>Save</button>
            <button class="btn sm ghost" data-test>Test</button>
            ${noRecipients ? '<div class="muted" style="font-size:11px;color:#b45309;">No recipients configured. This notification will be skipped.</div>' : '<div class="muted" style="font-size:11px;color:#067647;">Recipients configured.</div>'}
          </td>
        </tr>`);
      if (resource === 'operations_onboarding' && action === 'assigned_csm') {
        console.info('[notification setup] rendered event', { resource, action });
      }
    });
    tbody.innerHTML = rows.join('') || '<tr><td colspan="14" class="muted">No matching rules.</td></tr>';
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
      try {
        const selectedEvent = this.collect(tr.dataset.resource, tr.dataset.action);
        const currentUser = window.Session?.user?.() || window.Session?.currentUser?.() || {};
        const currentUserId = window.Session?.userId?.() || currentUser.id || currentUser.user_id;
        const supabase = window.SupabaseClient?.getClient?.();
        if (!supabase || !currentUserId) throw new Error('Unable to resolve current user for notification test.');
        const dispatchResult = await window.dispatchNotification({
          supabase,
          eventKey: selectedEvent.event_key || selectedEvent.action,
          recipientUserIds: [currentUserId],
          resource: selectedEvent.resource,
          resourceId: 'test',
          deepLink: '/notifications-test',
          payload: {
            sender_name: currentUser.full_name || currentUser.email,
            client_name: 'Test Client',
            invoice_number: 'INV-TEST',
            proposal_number: 'PROPOSAL-TEST',
            entry_number: 'BIN-TEST',
            conversation_title: 'Test Conversation',
            channels: ['in_app', 'pwa', 'email'],
          },
        });
        const eventKey = selectedEvent.event_key || selectedEvent.action;
        const { data: queueRows } = await supabase
          .from('notification_delivery_queue')
          .select('id,channel,status,last_error,updated_at,created_at')
          .eq('event_key', eventKey)
          .order('created_at', { ascending: false })
          .limit(10);
        const { data: logs } = await supabase.from('notification_delivery_logs').select('*').eq('event_key', eventKey).order('created_at', { ascending: false }).limit(10);
        const queueByChannel = channel => (queueRows || []).find(row => row.channel === channel) || null;
        const logByChannel = channel => (logs || []).find(row => row.channel === channel) || null;
        const formatChannel = channel => {
          const queueRow = queueByChannel(channel);
          const logRow = logByChannel(channel);
          const status = queueRow?.status || logRow?.status || 'not queued';
          const errorMessage = queueRow?.last_error || logRow?.error_message || '';
          return `${status}${errorMessage ? ` (${errorMessage})` : ''}`;
        };
        const emailStatus = formatChannel('email');
        const pwaStatus = formatChannel('pwa');
        const inAppCreated = Array.isArray(dispatchResult) && dispatchResult.length > 0;
        const allChannelsOk = inAppCreated && !/^not queued/i.test(emailStatus) && !/^not queued/i.test(pwaStatus) && !/failed/i.test(emailStatus + pwaStatus);
        UI.toast(`${allChannelsOk ? 'Test notification result' : 'Notification test incomplete'} — In-app: ${inAppCreated ? 'created' : 'not created'} (${Array.isArray(dispatchResult) ? dispatchResult.length : 0}) · Email: ${emailStatus} · PWA: ${pwaStatus}`);
      } catch (error) {
        UI.toast(String(error?.message || 'Unable to test rule.'));
      }
    }));
  }
};

window.NotificationSetup = NotificationSetup;
