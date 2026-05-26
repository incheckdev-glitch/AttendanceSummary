(() => {
  const SUGGESTIONS = [
    'Show overdue payments',
    'Show renewals due in 30 days',
    'Show renewals due in 7 days',
    'Show unpaid invoices',
    'Show signed agreements not invoiced',
    'Show open technical requests',
    'Show completed onboarding',
    "Show today’s lead follow-ups",
    "Show today’s deal follow-ups",
    'Summarize a client'
  ];

  const STORAGE_KEY = 'ai_assistant_session_id';

  window.AIAssistant = window.AIAssistant || {
    initialized: false,
    authReady: false,
    root: null,
    sessionId: null,

    init() {
      try {
        if (this.initialized) {
          console.log('[AI Assistant] init skipped (already initialized)');
          return;
        }

        const root = document.querySelector('#ai-assistant-root, [data-module="ai-assistant"], #aiAssistant, #aiAssistantView');
        if (!root) {
          console.warn('[AI Assistant] root not found yet');
          return;
        }

        this.root = root;
        this.sessionId = localStorage.getItem(STORAGE_KEY) || null;
        this.render();

        this.initialized = true;
        console.log('[AI Assistant] initialized');
      } catch (error) {
        console.error('[AI Assistant] init failed', error);
        this.showError('AI Assistant failed to initialize. Check console logs.');
      }
    },

    markAuthReady() {
      this.authReady = true;
      console.log('[AI Assistant] auth ready received');
      this.render();
    },

    bindEvents() {
      const root = this.root || document;
      const form = root.querySelector('[data-ai-form], #ai-assistant-form');
      const input = root.querySelector('[data-ai-input], #ai-assistant-input, #aiAssistantInput');
      const button = root.querySelector('[data-ai-send], #ai-assistant-send, #aiAssistantSend');

      console.log('[AI Assistant] bindEvents', {
        hasForm: Boolean(form),
        hasInput: Boolean(input),
        hasButton: Boolean(button)
      });

      if (form) {
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          this.sendCurrentMessage();
        });
      }

      if (button) {
        button.setAttribute('type', 'button');
        button.addEventListener('click', (event) => {
          event.preventDefault();
          this.sendCurrentMessage();
        });
      }

      if (input) {
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendCurrentMessage();
          }
        });
      }

      root.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-ai-suggestion]');
        if (!btn) return;
        const text = btn.getAttribute('data-ai-suggestion') || btn.textContent || '';
        this.sendMessage(text.trim());
      });
    },

    render() {
      const root = this.root || document.querySelector('#aiAssistantView');
      if (!root) return;
      const permission = this.canUseAiAssistant();

      if (permission === null) {
        root.innerHTML = `
          <section class="ai-assistant-page">
            <h1>AI Assistant</h1>
            <p>Loading AI Assistant...</p>
          </section>
        `;
        return;
      }

      if (permission === false) {
        root.innerHTML = `
          <section class="ai-assistant-page">
            <h1>AI Assistant</h1>
            <p>You do not have permission to use AI Assistant.</p>
          </section>
        `;
        return;
      }

      this.renderChatUi();
      this.bindEvents();
    },

    renderChatUi() {
      const root = this.root || document.querySelector('#aiAssistantView');
      if (!root) return;
      root.innerHTML = `
        <section class="ai-assistant-page">
          <h1>AI Assistant</h1>
          <p class="muted">Ask for account, invoicing, agreement, onboarding, lead, and deal insights.</p>
          <div id="aiAssistantPrompts" data-ai-suggestions class="row" style="gap:8px;flex-wrap:wrap;margin:12px 0;"></div>
          <div id="aiAssistantMessages" data-ai-messages class="col" style="gap:8px;max-height:50vh;overflow:auto;"></div>
          <div id="aiAssistantState" data-ai-state class="muted" style="min-height:20px;margin-top:8px;"></div>
          <form id="ai-assistant-form" data-ai-form class="row" style="gap:8px;margin-top:10px;">
            <input id="ai-assistant-input" data-ai-input class="input" placeholder="Ask AI Assistant..." style="flex:1;" />
            <button id="ai-assistant-send" data-ai-send class="btn primary" type="button">Send</button>
          </form>
        </section>
      `;
      const promptsContainer = root.querySelector('#aiAssistantPrompts, [data-ai-suggestions]');
      if (promptsContainer) {
        promptsContainer.innerHTML = SUGGESTIONS.map((text) => (
          `<button class="btn sm ghost" data-ai-suggestion="${this.escapeHtml(text)}">${this.escapeHtml(text)}</button>`
        )).join('');
      }
    },

    sendCurrentMessage() {
      const input = this.root?.querySelector('[data-ai-input], #ai-assistant-input, #aiAssistantInput');
      const message = String(input?.value || '').trim();

      if (!message) {
        console.warn('[AI Assistant] empty message ignored');
        return;
      }

      input.value = '';
      return this.sendMessage(message);
    },

    async sendMessage(message) {
      try {
        console.log('[AI Assistant] sending message', message);

        const permission = this.canUseAiAssistant();
        if (permission !== true) {
          this.render();
          return;
        }

        this.appendUserMessage(message);
        this.setLoading(true);

        const currentUser = this.getResolvedCurrentUser();
        const role = this.getAppRole();
        const token = window.SupabaseClient?.getAccessToken?.() || window.Session?.token || '';

        const response = await fetch('/functions/v1/ai-assistant', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            session_id: this.sessionId || null,
            message,
            current_user: {
              id: currentUser?.id,
              email: currentUser?.email,
              role,
              role_key: role
            }
          })
        });

        const payload = await response.json().catch(() => ({}));

        console.log('[AI Assistant] response', {
          status: response.status,
          ok: response.ok,
          payload
        });

        if (!response.ok) {
          throw new Error(payload.error || payload.message || `AI Assistant failed with status ${response.status}`);
        }

        this.sessionId = payload.session_id || this.sessionId;
        if (this.sessionId) localStorage.setItem(STORAGE_KEY, this.sessionId);
        this.appendAssistantMessage(payload.answer || payload.message || 'No answer returned.');
      } catch (error) {
        console.error('[AI Assistant] send failed', error);
        this.appendAssistantMessage(`AI Assistant error: ${error.message || error}`);
      } finally {
        this.setLoading(false);
      }
    },

    appendUserMessage(message) { this.appendMessage('You', message); },
    appendAssistantMessage(message) { this.appendMessage('Assistant', message); },
    showError(message) { this.appendAssistantMessage(message); },

    appendMessage(author, content) {
      const messages = this.root?.querySelector('#aiAssistantMessages, [data-ai-messages]');
      if (!messages) return;
      const item = document.createElement('div');
      item.className = 'card';
      item.style.padding = '10px';
      item.innerHTML = `<div class="muted" style="font-size:12px;margin-bottom:6px;">${author}</div><div>${this.escapeHtml(String(content || ''))}</div>`;
      messages.appendChild(item);
      messages.scrollTop = messages.scrollHeight;
    },

    setLoading(isLoading) {
      const state = this.root?.querySelector('#aiAssistantState, [data-ai-state]');
      if (state) state.textContent = isLoading ? 'Thinking...' : '';
    },

    isAuthReady() {
      return Boolean(
        window.Session?.user ||
        window.Session?.profile ||
        window.Session?.role ||
        window.Permissions?.matrix ||
        window.Permissions?.permissions ||
        window.Permissions?.matrixLoaded ||
        window.AppState?.currentUser ||
        window.AppState?.authReady ||
        window.__APP_UNLOCKED__
      );
    },

    canUseAiAssistant() {
      if (!this.isAuthReady()) return null;
      return this.getAppRole() === 'admin';
    },

    getAppRole() {
      const candidates = [
        window.Session?.role,
        window.Session?.currentRole,
        window.Session?.user?.role,
        window.Session?.user?.role_key,
        window.Session?.profile?.role,
        window.Session?.profile?.role_key,
        window.Permissions?.role,
        window.Permissions?.currentRole,
        window.Permissions?.roleKey,
        window.Permissions?.currentRoleKey,
        window.AppState?.role,
        window.AppState?.currentRole,
        window.AppState?.currentUser?.role,
        window.AppState?.currentUser?.role_key,
        window.AppState?.user?.role,
        window.AppState?.user?.role_key,
        window.currentUser?.role,
        window.currentUser?.role_key
      ];
      const role = candidates
        .map(value => String(value || '').trim().toLowerCase())
        .find(Boolean);
      console.log('[AI Assistant role detection]', {
        role,
        Session: window.Session,
        Permissions: window.Permissions,
        AppState: window.AppState,
        currentUser: window.currentUser
      });
      return role || '';
    },

    getResolvedCurrentUser() {
      return (
        window.App?.currentUser ||
        window.app?.currentUser ||
        window.AppState?.currentUser ||
        window.AppState?.user ||
        window.AuthState?.currentUser ||
        window.AuthState?.user ||
        window.Session?.currentUser ||
        window.Session?.user ||
        null
      );
    },

    getResolvedRole(user = null) {
      const u = user || this.getResolvedCurrentUser() || {};
      return String(
        u.role_key ||
        u.roleKey ||
        u.role ||
        u.user_role ||
        u.profile?.role_key ||
        u.profile?.role ||
        u.app_metadata?.role_key ||
        u.app_metadata?.role ||
        u.user_metadata?.role_key ||
        u.user_metadata?.role ||
        window.Session?.role ||
        window.AppState?.role ||
        ''
      ).trim().toLowerCase();
    },

    escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    console.log('[AI Assistant] DOMContentLoaded');
    window.AIAssistant?.init?.();
  });

  window.addEventListener('incheck360:auth-ready', () => {
    window.AIAssistant?.markAuthReady?.();
    window.AIAssistant?.init?.();
  });
})();
