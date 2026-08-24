(() => {
  const MAX_ACTION_STEPS = 8;

  const SUGGESTIONS = [
    'Show overdue payments',
    'Summarize Agreement#00120',
    'Show signed agreements not invoiced',
    'Create an invoice from Agreement#00120',
    'Mark Proposal#00058 as accepted',
    'Show today’s lead follow-ups',
    'Create a receipt from invoice SA/2026/71',
    'Show renewals due in 30 days'
  ];

  // The AI may propose only actions that already exist in the ERP action layer.
  // Security administration is intentionally excluded from AI execution.
  const AI_ACTION_POLICY = Object.freeze({
    companies: ['create', 'update', 'delete', 'verify', 'verify_company'],
    contacts: ['create', 'update', 'delete'],
    leads: ['create', 'update', 'delete', 'convert', 'convert_to_deal'],
    deals: ['create', 'update', 'delete'],
    proposal_catalog: ['create', 'update', 'delete'],
    proposals: ['create', 'save', 'update', 'delete', 'create_from_deal', 'accept_expired'],
    agreements: ['create', 'update', 'delete', 'create_from_proposal', 'send_to_operations', 'request_incheck_lite', 'request_incheck_full', 'assign_csm', 'update_onboarding_status'],
    clients: ['create', 'update', 'delete', 'create_proposal', 'create_agreement', 'create_invoice', 'create_from_previous_agreement'],
    invoices: ['create', 'update', 'delete', 'create_from_agreement', 'create_payment_schedule', 'recalculate_payment_schedule', 'save_payment_schedule', 'update_payment_schedule_reminder', 'create_operations_onboarding'],
    receipts: ['create', 'update', 'delete', 'create_from_invoice'],
    credit_notes: ['create', 'cancel', 'recalculate_invoice_totals'],
    tickets: ['create', 'update', 'delete'],
    events: ['create', 'update', 'delete'],
    csm: ['create', 'update', 'delete'],
    operations_onboarding: ['create', 'update', 'delete', 'assign_csm'],
    technical_admin_requests: ['create', 'update', 'update_status', 'delete'],
    payment_forecast: ['save_followup', 'mark_followed_up', 'create_followup_log', 'add_followup_note'],
    biners: ['create', 'update', 'delete', 'record_scheduled_payment'],
    workflow: ['create_approval', 'request_approval', 'approve', 'reject'],
    communication_centre_messages: ['update_message', 'soft_delete_message']
  });

  const ALWAYS_CONFIRM_ACTIONS = new Set([
    'delete', 'cancel', 'approve', 'reject', 'accept_expired', 'create_from_agreement',
    'create_from_invoice', 'create_invoice', 'create_agreement', 'create_proposal'
  ]);

  const FINANCIAL_OR_LEGAL_RESOURCES = new Set([
    'proposals', 'agreements', 'invoices', 'receipts', 'credit_notes', 'workflow', 'biners'
  ]);

  const safeJsonParse = (value, fallback = {}) => {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(String(value || '{}')); } catch { return fallback; }
  };

  window.AIAssistant = window.AIAssistant || {
    initialized: false,
    authReady: false,
    currentUser: null,
    currentRole: '',
    root: null,
    sessionId: null,
    messages: [],
    isSending: false,
    eventsBound: false,

    init() {
      try {
        const root = document.querySelector('#aiAssistantView, #ai-assistant-root, [data-module="ai-assistant"], #aiAssistant');
        if (!root) return;
        this.root = root;
        this.sessionId = this.getActiveSessionId();
        this.render();
        this.initialized = true;
        this.bindEvents();
      } catch (error) {
        console.error('[AI Assistant] init failed', error);
      }
    },

    canUseAiAssistant() {
      if (!this.isAuthReady()) return null;
      if (this.getAppRole() !== 'admin') return false;
      if (window.Permissions?.canPerformAction) {
        return Boolean(window.Permissions.canPerformAction('ai_assistant', 'use'));
      }
      return true;
    },

    render() {
      const root = this.root || document.querySelector('#aiAssistantView');
      if (!root) return;
      const permission = this.canUseAiAssistant();
      if (permission === null) {
        root.innerHTML = '<section class="ai-assistant-page"><div class="ai-assistant-loading">Loading AI Assistant…</div></section>';
        return;
      }
      if (!permission) {
        root.innerHTML = '<section class="ai-assistant-page"><h1>AI Assistant</h1><p class="muted">You do not have permission to use the AI Assistant.</p></section>';
        return;
      }
      this.renderChatUi();
    },

    renderChatUi() {
      const root = this.root || document.querySelector('#aiAssistantView');
      if (!root) return;
      root.innerHTML = `
        <section class="ai-assistant-page">
          <div class="ai-assistant-hero">
            <div>
              <div class="ai-assistant-kicker">InCheck360 Copilot</div>
              <h1>Ask. Review. Execute.</h1>
              <p>Use natural language to read ERP data or perform controlled actions using your existing permissions and business rules.</p>
            </div>
            <button class="btn ghost" type="button" data-ai-new-chat>New Chat</button>
          </div>
          <div class="ai-assistant-safety-note">
            <strong>Action-safe by design:</strong> OpenAI plans the action; your signed-in ERP session executes it. Destructive, financial, or legal actions require confirmation.
          </div>
          <div id="aiAssistantPrompts" data-ai-suggestions class="ai-assistant-prompts"></div>
          <div id="aiAssistantMessages" data-ai-messages class="ai-assistant-messages"></div>
          <div id="aiAssistantState" data-ai-state class="muted ai-assistant-state" aria-live="polite"></div>
          <form id="ai-assistant-form" data-ai-form class="ai-assistant-composer">
            <textarea id="ai-assistant-input" data-ai-input class="input" rows="2" maxlength="12000" placeholder="Example: Create an invoice from Agreement#00120 and tell me the result."></textarea>
            <button id="ai-assistant-send" data-ai-send class="btn primary" type="submit">Send</button>
          </form>
        </section>`;
      this.eventsBound = false;
      this.bindEvents();
      const prompts = root.querySelector('[data-ai-suggestions]');
      if (prompts) prompts.innerHTML = SUGGESTIONS.map(text => `<button class="btn sm ghost" type="button" data-ai-suggestion="${this.escapeHtml(text)}">${this.escapeHtml(text)}</button>`).join('');
      for (const message of this.messages) this.appendMessage(message.author, message.content, false, message.meta || {});
    },

    bindEvents() {
      if (this.eventsBound || !this.root) return;
      this.eventsBound = true;
      const form = this.root.querySelector('[data-ai-form]');
      const input = this.root.querySelector('[data-ai-input]');
      form?.addEventListener('submit', event => {
        event.preventDefault();
        this.sendCurrentMessage();
      });
      input?.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          this.sendCurrentMessage();
        }
      });
      this.root.addEventListener('click', event => {
        const newChat = event.target.closest('[data-ai-new-chat]');
        if (newChat) {
          event.preventDefault();
          this.startNewChat();
          return;
        }
        const suggestion = event.target.closest('[data-ai-suggestion]');
        if (!suggestion) return;
        this.sendMessage(String(suggestion.getAttribute('data-ai-suggestion') || '').trim());
      });
    },

    getSessionStorageKey() {
      const user = this.getResolvedCurrentUser() || {};
      return `incheck360_ai_assistant_session_${user.id || user.email || 'user'}`;
    },
    getActiveSessionId() { return this.sessionId || localStorage.getItem(this.getSessionStorageKey()) || null; },
    setActiveSessionId(sessionId) {
      if (!sessionId) return;
      this.sessionId = sessionId;
      localStorage.setItem(this.getSessionStorageKey(), sessionId);
    },
    startNewChat() {
      localStorage.removeItem(this.getSessionStorageKey());
      this.sessionId = null;
      this.messages = [];
      this.renderChatUi();
    },

    sendCurrentMessage() {
      const input = this.root?.querySelector('[data-ai-input]');
      const message = String(input?.value || '').trim();
      if (!message) return;
      input.value = '';
      this.sendMessage(message);
    },

    async postToAssistant(body = {}) {
      const token = await window.Api?.getCurrentAccessToken?.() || window.SupabaseClient?.getAccessToken?.() || window.Session?.token || '';
      const anonKey = window.SUPABASE_ANON_KEY || window.SUPABASE_CONFIG?.anonKey || window.__SUPABASE_ANON_KEY__ || '';
      const supabaseUrl = window.SUPABASE_URL || window.SUPABASE_CONFIG?.url || window.SupabaseClient?.url || window.__SUPABASE_URL__;
      if (!supabaseUrl) throw new Error('Supabase URL is not configured.');
      if (!token) throw new Error('Your session expired. Please log in again.');
      const response = await fetch(`${supabaseUrl}/functions/v1/incheck360-ai-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: anonKey
        },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.message || `AI Assistant failed with status ${response.status}`);
      return payload;
    },

    async sendMessage(message) {
      if (this.isSending) return;
      const text = String(message || '').trim();
      if (!text) return;
      this.isSending = true;
      this.setLoading(true, 'Understanding your request…');
      try {
        if (this.canUseAiAssistant() !== true) throw new Error('You do not have permission to use AI Assistant.');
        this.appendUserMessage(text);
        const attemptedSignatures = new Set();
        let payload = await this.postToAssistant({
          session_id: this.getActiveSessionId(),
          message: text
        });
        this.setActiveSessionId(payload.session_id);

        let step = 0;
        let lastResults = [];
        while (Array.isArray(payload.pending_actions) && payload.pending_actions.length && step < MAX_ACTION_STEPS) {
          step += 1;
          this.setLoading(true, `Executing ERP step ${step}…`);
          lastResults = await this.executePendingActions(payload.pending_actions, attemptedSignatures);
          this.setLoading(true, 'Checking the ERP result and next step…');
          payload = await this.postToAssistant({
            session_id: this.getActiveSessionId(),
            message: text,
            plan_id: payload.plan_id || null,
            action_results: lastResults
          });
          this.setActiveSessionId(payload.session_id);
        }

        if (Array.isArray(payload.pending_actions) && payload.pending_actions.length) {
          this.appendAssistantMessage(`I stopped after ${MAX_ACTION_STEPS} controlled ERP steps to prevent an accidental action loop. Review the completed actions, then send a follow-up command to continue.`, { actionResults: lastResults });
        } else {
          this.appendAssistantMessage(payload.answer || payload.message || this.summarizeActionResults(lastResults), { actionResults: lastResults });
        }
      } catch (error) {
        console.error('[AI Assistant] send failed', error);
        this.appendAssistantMessage(`AI Assistant error: ${error.message || error}`);
      } finally {
        this.isSending = false;
        this.setLoading(false);
        this.focusInput();
      }
    },

    validateAction(action = {}) {
      const resource = String(action.resource || '').trim().toLowerCase();
      const actionName = String(action.action || '').trim().toLowerCase();
      if (!resource || !actionName) return { ok: false, reason: 'Action resource/action is missing.' };
      const allowed = AI_ACTION_POLICY[resource] || [];
      if (!allowed.includes(actionName)) return { ok: false, reason: `AI execution is not enabled for ${resource}:${actionName}.` };
      if (window.Permissions?.canPerformAction && !window.Permissions.canPerformAction(resource, actionName)) {
        return { ok: false, reason: `Your ERP role does not allow ${actionName} on ${resource}.` };
      }
      return { ok: true, resource, actionName };
    },

    shouldConfirmAction(action = {}) {
      const actionName = String(action.action || '').trim().toLowerCase();
      const resource = String(action.resource || '').trim().toLowerCase();
      const risk = String(action.risk || '').trim().toLowerCase();
      return action.requires_confirmation === true || risk === 'high' || ALWAYS_CONFIRM_ACTIONS.has(actionName) || FINANCIAL_OR_LEGAL_RESOURCES.has(resource);
    },

    actionConfirmationText(action = {}) {
      const label = action.summary || action.reason || `${action.action} ${action.resource}`;
      return `AI Assistant wants to perform this ERP action:\n\n${label}\n\nResource: ${action.resource}\nAction: ${action.action}\n\nContinue?`;
    },

    async executePendingActions(actions = [], attemptedSignatures = new Set()) {
      const results = [];
      for (let index = 0; index < actions.length; index += 1) {
        const action = actions[index] || {};
        const signature = `${String(action.resource || '').toLowerCase()}|${String(action.action || '').toLowerCase()}|${String(action.payload_json || JSON.stringify(action.payload || {}))}`;
        if (attemptedSignatures.has(signature)) {
          results.push({ action_id: action.action_id || '', status: 'blocked', resource: action.resource, action: action.action, error: 'Duplicate AI action prevented.' });
          continue;
        }
        attemptedSignatures.add(signature);
        const validation = this.validateAction(action);
        if (!validation.ok) {
          results.push({ action_id: action.action_id || '', status: 'blocked', error: validation.reason, resource: action.resource, action: action.action });
          continue;
        }

        if (this.shouldConfirmAction(action)) {
          const confirmed = window.confirm(this.actionConfirmationText(action));
          if (!confirmed) {
            results.push({ action_id: action.action_id || '', status: 'cancelled', resource: validation.resource, action: validation.actionName, message: 'User cancelled the action.' });
            continue;
          }
        }

        const payload = safeJsonParse(action.payload_json ?? action.payload, {});
        this.appendActionStatus(action, 'running');
        try {
          const data = await window.Api.requestWithSession(validation.resource, validation.actionName, payload);
          const normalizedData = this.compactResult(data);
          results.push({
            action_id: action.action_id || '',
            status: 'success',
            resource: validation.resource,
            action: validation.actionName,
            result: normalizedData
          });
          this.appendActionStatus(action, 'success', normalizedData);
          this.refreshAffectedModule(validation.resource);
        } catch (error) {
          const errorMessage = String(error?.message || error || 'Unknown ERP error');
          results.push({ action_id: action.action_id || '', status: 'failed', resource: validation.resource, action: validation.actionName, error: errorMessage });
          this.appendActionStatus(action, 'failed', errorMessage);
        }
      }
      return results;
    },

    compactResult(data) {
      const value = data?.data ?? data?.result ?? data?.item ?? data;
      if (!value || typeof value !== 'object') return value;
      if (Array.isArray(value)) return value.slice(0, 10);
      const preferred = [
        'id','company_id','contact_id','lead_id','deal_id','proposal_id','proposal_number','agreement_id','agreement_number',
        'invoice_id','invoice_number','receipt_id','receipt_number','credit_note_id','credit_note_number','ticket_id','status','payment_state','payment_status','total','grand_total','balance_due','currency'
      ];
      const out = {};
      preferred.forEach(key => { if (value[key] !== undefined) out[key] = value[key]; });
      return Object.keys(out).length ? out : value;
    },

    refreshAffectedModule(resource = '') {
      const map = {
        companies: () => window.Companies?.loadAndRefresh?.(),
        contacts: () => window.Contacts?.loadAndRefresh?.(),
        leads: () => window.Leads?.loadAndRefresh?.(),
        deals: () => window.Deals?.loadAndRefresh?.(),
        proposals: () => window.Proposals?.loadAndRefresh?.(),
        agreements: () => window.Agreements?.loadAndRefresh?.(),
        clients: () => window.Clients?.loadAndRefresh?.(),
        invoices: () => window.Invoices?.loadAndRefresh?.(),
        receipts: () => window.Receipts?.loadAndRefresh?.(),
        credit_notes: () => window.CreditNotes?.loadAndRefresh?.(),
        tickets: () => window.loadIssues?.(true),
        events: () => window.Events?.loadAndRefresh?.(),
        biners: () => window.Biners?.refresh?.()
      };
      try { map[String(resource || '').trim().toLowerCase()]?.(); } catch (error) { console.warn('[AI Assistant] refresh failed', error); }
    },

    summarizeActionResults(results = []) {
      const successful = results.filter(row => row.status === 'success').length;
      const failed = results.filter(row => row.status === 'failed').length;
      const cancelled = results.filter(row => row.status === 'cancelled').length;
      return `ERP actions completed: ${successful} successful, ${failed} failed, ${cancelled} cancelled.`;
    },

    appendUserMessage(message) { this.appendMessage('You', message); },
    appendAssistantMessage(message, meta = {}) { this.appendMessage('Assistant', message, true, meta); },
    appendActionStatus(action, status, details = '') {
      const label = action.summary || action.reason || `${action.action} ${action.resource}`;
      const statusLabel = status === 'running' ? 'Executing' : status === 'success' ? 'Completed' : 'Failed';
      this.appendMessage('System', `**${statusLabel}:** ${label}${details ? `\n${typeof details === 'string' ? details : `\`${JSON.stringify(details)}\``}` : ''}`);
    },

    appendMessage(author, content, track = true, meta = {}) {
      if (track) this.messages.push({ author, content, meta });
      const messages = this.root?.querySelector('[data-ai-messages]');
      if (!messages) return;
      const item = document.createElement('div');
      const kind = author === 'Assistant' ? 'assistant' : author === 'You' ? 'user' : 'system';
      item.className = `ai-message ai-message-${kind}`;
      const renderedContent = author === 'You'
        ? this.escapeHtml(String(content || '')).replace(/\n/g, '<br>')
        : this.renderMarkdown(this.escapeHtml(String(content || '')));
      item.innerHTML = `<div class="ai-message-author">${this.escapeHtml(author)}</div><div class="ai-message-body">${renderedContent}</div>`;
      messages.appendChild(item);
      messages.scrollTop = messages.scrollHeight;
    },

    renderMarkdown(text) {
      const lines = String(text || '').split('\n');
      const output = [];
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) { i += 1; continue; }
        if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|?[\s:-]+\|/.test(lines[i + 1])) {
          const tableLines = [line, lines[i + 1]];
          i += 2;
          while (i < lines.length && lines[i].trim().startsWith('|')) tableLines.push(lines[i++]);
          output.push(this.renderMarkdownTable(tableLines));
          continue;
        }
        if (/^[-*]\s+/.test(trimmed)) {
          const items = [];
          while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) items.push(lines[i++].trim().replace(/^[-*]\s+/, ''));
          output.push(`<ul>${items.map(item => `<li>${this.renderInlineMarkdown(item)}</li>`).join('')}</ul>`);
          continue;
        }
        if (/^\d+\.\s+/.test(trimmed)) {
          const items = [];
          while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) items.push(lines[i++].trim().replace(/^\d+\.\s+/, ''));
          output.push(`<ol>${items.map(item => `<li>${this.renderInlineMarkdown(item)}</li>`).join('')}</ol>`);
          continue;
        }
        output.push(`<p>${this.renderInlineMarkdown(trimmed)}</p>`);
        i += 1;
      }
      return output.join('');
    },
    renderMarkdownTable(lines) {
      const parseRow = row => row.split('|').slice(1, -1).map(cell => this.renderInlineMarkdown(cell.trim()));
      const header = parseRow(lines[0]);
      const bodyRows = lines.slice(2).map(parseRow).filter(row => row.length);
      return `<div class="ai-message-table-wrap"><table><thead><tr>${header.map(cell => `<th>${cell}</th>`).join('')}</tr></thead><tbody>${bodyRows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    },
    renderInlineMarkdown(value) {
      let text = String(value || '');
      text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
      text = text.replace(/\[(.*?)\]\((https?:\/\/[^\s)]+|#[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      return text;
    },

    setLoading(isLoading, message = '') {
      const input = this.root?.querySelector('[data-ai-input]');
      const button = this.root?.querySelector('[data-ai-send]');
      const state = this.root?.querySelector('[data-ai-state]');
      if (input) input.disabled = Boolean(isLoading);
      if (button) {
        button.disabled = Boolean(isLoading);
        button.textContent = isLoading ? 'Working…' : 'Send';
      }
      if (state) state.textContent = isLoading ? (message || 'Working…') : '';
    },
    focusInput() { this.root?.querySelector('[data-ai-input]')?.focus?.(); },

    isAuthReady() {
      return Boolean(this.authReady || window.__APP_UNLOCKED__ || window.AppState?.authReady || window.Session?.isAuthenticated?.());
    },
    getAppRole() {
      const user = this.getResolvedCurrentUser() || {};
      return String(this.currentRole || window.Session?.role?.() || window.AppState?.role || user.role_key || user.role || '').trim().toLowerCase();
    },
    getResolvedCurrentUser() {
      return window.App?.currentUser || window.app?.currentUser || window.AppState?.currentUser || window.AppState?.user || window.Session?.user?.() || window.Session?.user || null;
    },
    escapeHtml(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }
  };

  document.addEventListener('DOMContentLoaded', () => window.AIAssistant?.init?.());
  window.addEventListener('incheck360:auth-ready', event => {
    if (!window.AIAssistant) return;
    window.AIAssistant.authReady = true;
    window.AIAssistant.currentUser = event.detail?.currentUser || window.AIAssistant.currentUser || null;
    window.AIAssistant.currentRole = event.detail?.role || event.detail?.currentRole || window.AIAssistant.currentRole || '';
    window.AIAssistant.init();
  });
})();
