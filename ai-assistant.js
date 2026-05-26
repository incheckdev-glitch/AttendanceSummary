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
        this.bindEvents();

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

      const promptsContainer = root.querySelector('#aiAssistantPrompts, [data-ai-suggestions]');
      const messages = root.querySelector('#aiAssistantMessages, [data-ai-messages]');
      const state = root.querySelector('#aiAssistantState, [data-ai-state]');

      if (!this.authReady && !window.__AUTH_RESTORED__ && !window.__APP_UNLOCKED__) {
        if (state) state.textContent = 'Loading AI Assistant...';
        if (messages && !messages.children.length) {
          messages.innerHTML = '<div class="muted">Loading AI Assistant...</div>';
        }
      } else if (!this.canUseAiAssistant()) {
        if (state) state.textContent = '';
        if (messages) {
          messages.innerHTML = '<div class="muted">You do not have permission to use AI Assistant.</div>';
        }
      } else if (state) {
        state.textContent = '';
      }

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

        if (!this.isAuthReady()) {
          this.showError('Loading AI Assistant...');
          return;
        }

        if (!this.canUseAiAssistant()) {
          this.appendAssistantMessage('You do not have permission to use AI Assistant.');
          return;
        }

        this.appendUserMessage(message);
        this.setLoading(true);

        const currentUser = this.getResolvedCurrentUser();
        const role = this.getResolvedRole(currentUser);
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
        this.authReady ||
        window.__AUTH_RESTORED__ ||
        window.__APP_UNLOCKED__ ||
        window.AppState?.authReady ||
        window.AuthState?.ready ||
        window.Permissions?.state?.loaded
      );
    },

    canUseAiAssistant() {
      const user = this.getResolvedCurrentUser();
      const role = this.getResolvedRole(user);
      return role === 'admin';
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
