(() => {
  const SUGGESTIONS = [
    'Show overdue payments',
    'Show renewals due in 30 days',
    'Show renewals due in 7 days',
    'Show unpaid invoices',
    'Show signed agreements not invoiced',
    'Show all records related to Agreement#00040',
    'Which technical requests are overdue?',
    'Which proposals are pending approval?',
    'Show open technical requests',
    'Show completed onboarding',
    "Show today’s lead follow-ups",
    "Show today’s deal follow-ups",
    'Summarize GT Karting'
  ];

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
        const root = document.querySelector('#ai-assistant-root, [data-module="ai-assistant"], #aiAssistant, #aiAssistantView');
        if (!root) {
          console.warn('[AI Assistant] root not found yet');
          return;
        }

        this.root = root;
        this.sessionId = this.getActiveSessionId();

        // Always render, even if already initialized, because auth role may have changed.
        this.render();

        if (!this.initialized) {
          this.initialized = true;
          console.log('[AI Assistant] initialized');
        }

        this.bindEvents?.();
      } catch (error) {
        console.error('[AI Assistant] init failed', error);
        this.showError('AI Assistant failed to initialize. Check console logs.');
      }
    },

    bindEvents() {
      if (this.eventsBound) return;
      this.eventsBound = true;

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
        button.type = 'button';
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.sendCurrentMessage();
        });
      }

      if (input) {
        input.disabled = false;
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendCurrentMessage();
          }
        });
      }

      root.addEventListener('click', (event) => {
        const newChatButton = event.target.closest('[data-ai-new-chat]');
        if (newChatButton) {
          event.preventDefault();
          this.startNewChat();
          return;
        }
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
    },

    renderChatUi() {
      const root = this.root || document.querySelector('#aiAssistantView');
      if (!root) return;
      root.innerHTML = `
          <section class="ai-assistant-page">
          <h1>AI Assistant</h1>
          <div class="row" style="justify-content:flex-end;margin:8px 0;">
            <button class="btn sm ghost" type="button" data-ai-new-chat>New Chat</button>
          </div>
          <p class="muted">Ask about clients, invoices, agreements, tickets, onboarding, renewals, or any ERP data...</p>
          <div id="aiAssistantPrompts" data-ai-suggestions class="row" style="gap:8px;flex-wrap:wrap;margin:12px 0;"></div>
          <div id="aiAssistantMessages" data-ai-messages class="col" style="gap:8px;max-height:50vh;overflow:auto;"></div>
          <div id="aiAssistantState" data-ai-state class="muted" style="min-height:20px;margin-top:8px;"></div>
          <form id="ai-assistant-form" data-ai-form class="row" style="gap:8px;margin-top:10px;">
            <input id="ai-assistant-input" data-ai-input class="input" placeholder="Ask about clients, invoices, agreements, tickets, onboarding, renewals, or any ERP data..." style="flex:1;" />
            <button id="ai-assistant-send" data-ai-send class="btn primary" type="button">Send</button>
          </form>
        </section>
      `;
      this.eventsBound = false;
      this.bindEvents();

      const promptsContainer = root.querySelector('#aiAssistantPrompts, [data-ai-suggestions]');
      if (promptsContainer) {
        promptsContainer.innerHTML = SUGGESTIONS.map((text) => (
          `<button class="btn sm ghost" data-ai-suggestion="${this.escapeHtml(text)}">${this.escapeHtml(text)}</button>`
        )).join('');
      }
      for (const message of this.messages) this.appendMessage(message.author, message.content, false);
    },

    getSessionStorageKey() {
      const user = this.getResolvedCurrentUser?.() || {};
      return `incheck360_ai_assistant_session_${user.id || user.email || 'admin'}`;
    },

    getActiveSessionId() {
      return this.sessionId || localStorage.getItem(this.getSessionStorageKey()) || null;
    },

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
      const input = this.root?.querySelector('[data-ai-input], #ai-assistant-input, #aiAssistantInput');
      const message = String(input?.value || '').trim();

      if (!message) {
        console.warn('[AI Assistant] empty message ignored');
        return;
      }

      input.value = '';
      this.sendMessage(message);
    },

    async sendMessage(message) {
      if (this.isSending) {
        console.warn('[AI Assistant] send ignored because request already in progress');
        return;
      }

      const text = String(message || '').trim();
      if (!text) return;

      this.isSending = true;
      this.setLoading(true);

      try {
        console.log('[AI Assistant] sending message', text);

        const permission = this.canUseAiAssistant();
        if (permission !== true) {
          this.render();
          return;
        }

        this.appendUserMessage(text);

        const currentUser = this.getResolvedCurrentUser();
        const role = this.getAppRole();
        const token = window.SupabaseClient?.getAccessToken?.() || window.Session?.token || '';
        const anonKey = window.SUPABASE_ANON_KEY || window.SUPABASE_CONFIG?.anonKey || window.__SUPABASE_ANON_KEY__ || '';
        const SUPABASE_URL =
          window.SUPABASE_URL ||
          window.SUPABASE_CONFIG?.url ||
          window.SupabaseClient?.url ||
          window.__SUPABASE_URL__;

        if (!SUPABASE_URL) {
          throw new Error('Supabase URL is not configured.');
        }

        const functionUrl = `${SUPABASE_URL}/functions/v1/incheck360-ai-assistant`;

        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token || anonKey}`,
            apikey: anonKey
          },
          body: JSON.stringify({
            session_id: this.getActiveSessionId(),
            message: text,
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
          console.error('[AI Assistant] failed response', {
            status: response.status,
            payload
          });

          throw new Error(payload.error || payload.message || `AI Assistant failed with status ${response.status}`);
        }

        this.setActiveSessionId(payload.session_id);
        this.appendAssistantMessage(payload.answer || payload.message || 'No answer returned.');
      } catch (error) {
        console.error('[AI Assistant] send failed', error);
        this.appendAssistantMessage(`AI Assistant error: ${error.message || error}`);
      } finally {
        this.isSending = false;
        this.setLoading(false);
        this.enableInput();
        this.focusInput();
      }
    },

    appendUserMessage(message) { this.appendMessage('You', message); },
    appendAssistantMessage(message) { this.appendMessage('Assistant', message); },
    showError(message) { this.appendAssistantMessage(message); },

    appendMessage(author, content, track = true) {
      if (track) this.messages.push({ author, content });
      const messages = this.root?.querySelector('#aiAssistantMessages, [data-ai-messages]');
      if (!messages) return;
      const item = document.createElement('div');
      item.className = `card ai-message ${author === 'Assistant' ? 'ai-message-assistant' : 'ai-message-user'}`;
      item.style.padding = '10px';
      const renderedContent = author === 'Assistant'
        ? this.renderAssistantContent(content)
        : this.escapeHtml(String(content || '')).replace(/\n/g, '<br>');
      item.innerHTML = `<div class="muted" style="font-size:12px;margin-bottom:6px;">${author}</div><div>${renderedContent}</div>`;
      messages.appendChild(item);
      messages.scrollTop = messages.scrollHeight;
    },
    renderAssistantContent(text) {
      const safeText = this.escapeHtml(String(text || ''));
      return this.renderMarkdown(safeText);
    },

    renderMarkdown(text) {
      const lines = String(text || '').split('\n');
      const output = [];
      let i = 0;

      while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) {
          i += 1;
          continue;
        }

        if (trimmed.startsWith('|') && i + 1 < lines.length && lines[i + 1].includes('|---')) {
          const tableLines = [line, lines[i + 1]];
          i += 2;
          while (i < lines.length && lines[i].trim().startsWith('|')) {
            tableLines.push(lines[i]);
            i += 1;
          }
          output.push(this.renderMarkdownTable(tableLines));
          continue;
        }

        if (/^[-*]\s+/.test(trimmed)) {
          const items = [];
          while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
            items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
            i += 1;
          }
          output.push(`<ul>${items.map((item) => `<li>${this.renderInlineMarkdown(item)}</li>`).join('')}</ul>`);
          continue;
        }

        if (/^\d+\.\s+/.test(trimmed)) {
          const items = [];
          while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
            items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
            i += 1;
          }
          output.push(`<ol>${items.map((item) => `<li>${this.renderInlineMarkdown(item)}</li>`).join('')}</ol>`);
          continue;
        }

        output.push(`<p>${this.renderInlineMarkdown(trimmed)}</p>`);
        i += 1;
      }

      return output.join('');
    },

    renderMarkdownTable(lines) {
      const parseRow = (row) => row.split('|').slice(1, -1).map((cell) => this.renderInlineMarkdown(cell.trim()));
      const header = parseRow(lines[0]);
      const bodyRows = lines.slice(2).map(parseRow).filter((row) => row.length);

      const thead = `<thead><tr>${header.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>`;
      return `<div class="ai-message-table-wrap"><table>${thead}${tbody}</table></div>`;
    },

    renderInlineMarkdown(value) {
      let text = String(value || '');
      text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      text = text.replace(/\[(.*?)\]\((https?:\/\/[^\s)]+|#[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      return text;
    },

    setLoading(isLoading) {
      const input = this.root?.querySelector('[data-ai-input], #ai-assistant-input, #aiAssistantInput');
      const button = this.root?.querySelector('[data-ai-send], #ai-assistant-send, #aiAssistantSend');
      const state = this.root?.querySelector('#aiAssistantState, [data-ai-state]');
      if (input) input.disabled = false;
      if (button) {
        button.disabled = Boolean(isLoading);
        button.textContent = isLoading ? 'Sending...' : 'Send';
      }
      if (state) state.textContent = isLoading ? 'Thinking...' : '';
    },

    enableInput() {
      const input = this.root?.querySelector('[data-ai-input], #ai-assistant-input, #aiAssistantInput');
      const button = this.root?.querySelector('[data-ai-send], #ai-assistant-send, #aiAssistantSend');
      if (input) input.disabled = false;
      if (button) {
        button.disabled = false;
        button.textContent = 'Send';
      }
    },

    focusInput() {
      const input = this.root?.querySelector('[data-ai-input], #ai-assistant-input, #aiAssistantInput');
      if (input) input.focus();
    },

    isAuthReady() {
      return Boolean(
        this.authReady ||
        window.__APP_UNLOCKED__ ||
        window.AppState?.authReady ||
        window.AppState?.role ||
        window.AppState?.currentUser ||
        window.Session?.role ||
        window.Session?.user
      );
    },

    canUseAiAssistant() {
      if (!this.isAuthReady()) return null;
      return this.getAppRole() === 'admin';
    },

    getAppRole() {
      const candidates = [
        this.currentRole,

        window.AppState?.role,
        window.AppState?.currentRole,
        window.AppState?.currentUser?.role_key,
        window.AppState?.currentUser?.role,
        window.AppState?.user?.role_key,
        window.AppState?.user?.role,

        window.Session?.role,
        window.Session?.currentRole,
        window.Session?.user?.role_key,
        window.Session?.user?.role,
        window.Session?.profile?.role_key,
        window.Session?.profile?.role
      ];

      const role = candidates
        .map(value => String(value || '').trim().toLowerCase())
        .find(Boolean) || '';

      console.log('[AI Assistant role detection]', {
        resolvedRole: role,
        currentRole: this.currentRole,
        AppState: window.AppState,
        Session: window.Session
      });

      return role;
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

  window.addEventListener('incheck360:auth-ready', (event) => {
    console.log('[AI Assistant] auth ready received', event.detail);

    if (window.AIAssistant) {
      window.AIAssistant.authReady = true;
      window.AIAssistant.currentUser = event.detail?.currentUser || window.AIAssistant.currentUser || null;
      window.AIAssistant.currentRole = event.detail?.role || event.detail?.currentRole || window.AIAssistant.currentRole || '';

      if (!window.AIAssistant.initialized) {
        window.AIAssistant.init();
      } else {
        window.AIAssistant.render();
        window.AIAssistant.bindEvents?.();
      }
    }
  });
})();
