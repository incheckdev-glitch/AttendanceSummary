window.AIAssistant = (() => {
  const prompts = [
    'Show overdue payments',
    'Show renewals due in 30 days',
    'Show agreements signed but not invoiced',
    'Show open technical requests',
    'Summarize a client',
    'Show today’s lead/deal follow-ups'
  ];
  const key = 'ai_assistant_session_id';

  function getCurrentUserRole() {
    const user =
      window.currentUser ||
      window.AppState?.currentUser ||
      window.Auth?.currentUser ||
      window.Session?.authContext?.()?.profile ||
      {};

    return String(
      user.role_key ||
      user.roleKey ||
      user.role ||
      user.user_role ||
      user.profile?.role_key ||
      user.profile?.role ||
      ''
    ).trim().toLowerCase();
  }

  const canUse = () => getCurrentUserRole() === 'admin';

  function renderPrompts() {
    if (!E.aiAssistantPrompts) return;
    E.aiAssistantPrompts.innerHTML = prompts.map(p => `<button class="btn sm ghost" data-prompt="${U.escapeHtml(p)}">${U.escapeHtml(p)}</button>`).join('');
    E.aiAssistantPrompts.querySelectorAll('[data-prompt]').forEach(btn => btn.addEventListener('click', () => {
      if (E.aiAssistantInput) E.aiAssistantInput.value = btn.dataset.prompt || '';
      send();
    }));
  }
  function append(role, content) {
    if (!E.aiAssistantMessages) return;
    const item = document.createElement('div');
    item.className = 'card';
    item.style.padding = '10px';
    item.innerHTML = `<div class="muted" style="font-size:12px;margin-bottom:6px;">${role === 'user' ? 'You' : 'Assistant'}</div><div>${window.marked?.parse ? window.marked.parse(String(content||'')) : U.escapeHtml(String(content||''))}</div>`;
    E.aiAssistantMessages.appendChild(item);
    E.aiAssistantMessages.scrollTop = E.aiAssistantMessages.scrollHeight;
  }
  async function send() {
    if (!canUse()) return UI.toast('You do not have AI Assistant access.');
    const message = String(E.aiAssistantInput?.value || '').trim();
    if (!message) return;
    E.aiAssistantInput.value = '';
    append('user', message);
    E.aiAssistantState.textContent = 'Thinking...';
    try {
      const client = window.SupabaseClient?.getClient?.();
      const sessionId = localStorage.getItem(key) || null;
      const currentUser = window.Session?.authContext?.()?.profile || {};
      const { data, error } = await client.functions.invoke('ai-assistant', {
        body: {
          session_id: sessionId,
          message,
          current_user: {
            id: currentUser.id,
            email: currentUser.email,
            role: currentUser.role || currentUser.role_key,
            role_key: currentUser.role_key || currentUser.role
          }
        }
      });
      if (error) throw error;
      if (data?.session_id) localStorage.setItem(key, data.session_id);
      append('assistant', data?.answer || 'No response.');
      E.aiAssistantState.textContent = '';
    } catch (e) {
      E.aiAssistantState.textContent = '';
      UI.toast(`AI Assistant error: ${e.message || e}`);
    }
  }

  function init() {
    if (!E.aiAssistantView) return;
    const role = getCurrentUserRole();
    console.log('[AI Assistant permission]', {
      currentUser: window.Session?.authContext?.()?.profile || window.currentUser || window.AppState?.currentUser,
      detectedRole: role
    });

    if (!canUse()) {
      E.aiAssistantView.innerHTML = '<div class="section"><div class="muted">You do not have permission to use AI Assistant.</div></div>';
      return;
    }
    renderPrompts();
    E.aiAssistantSend?.addEventListener('click', send);
    E.aiAssistantInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  }
  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => window.AIAssistant?.init?.(), 0);
});
