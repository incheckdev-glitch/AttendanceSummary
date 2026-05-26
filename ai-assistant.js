window.AIAssistant = (() => {
  const prompts = [
    'Show overdue payments',
    'Show renewals due in 30 days',
    'Show agreements signed but not invoiced',
    'Show open technical requests',
    'Summarize a client',
    'Show today's lead/deal follow-ups'
  ];
  const key = 'ai_assistant_session_id';

  function getResolvedCurrentUser() {
    return (
      window.App?.currentUser ||
      window.app?.currentUser ||
      window.InCheck360?.currentUser ||
      window.InCheck360App?.currentUser ||
      window.AppState?.user ||
      window.AppState?.currentUser ||
      window.AuthState?.user ||
      window.AuthState?.currentUser ||
      window.authUser ||
      window.currentSession?.user ||
      window.supabaseSession?.user ||
      window.Session?.authContext?.()?.profile ||
      null
    );
  }

  function getResolvedRole(user = null) {
    const u = user || getResolvedCurrentUser() || {};
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
      ''
    ).trim().toLowerCase();
  }

  function isAuthReady() {
    return Boolean(
      window.__AUTH_RESTORED__ ||
      window.__APP_UNLOCKED__ ||
      window.AppState?.authReady ||
      window.AuthState?.ready ||
      window.Permissions?.state?.loaded
    );
  }

  function canUseAiAssistant() {
    if (!isAuthReady()) return null;
    const user = getResolvedCurrentUser();
    const role = getResolvedRole(user);
    console.log('[AI Assistant permission resolved]', { authReady: isAuthReady(), user, role });
    return role === 'admin';
  }

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
    if (canUseAiAssistant() !== true) return UI.toast('You do not have AI Assistant access.');
    const message = String(E.aiAssistantInput?.value || '').trim();
    if (!message) return;
    E.aiAssistantInput.value = '';
    append('user', message);
    E.aiAssistantState.textContent = 'Thinking...';
    try {
      const client = window.SupabaseClient?.getClient?.();
      const sessionId = localStorage.getItem(key) || null;
      const user = getResolvedCurrentUser() || {};
      const role = getResolvedRole(user);
      const { data, error } = await client.functions.invoke('ai-assistant', {
        body: {
          session_id: sessionId,
          message,
          current_user: {
            id: user?.id,
            email: user?.email,
            role,
            role_key: role
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

  function render() {
    if (!E.aiAssistantView) return;
    const permission = canUseAiAssistant();
    if (permission === null) {
      E.aiAssistantView.innerHTML = '<div class="section"><div class="muted">Loading AI Assistant...</div></div>';
      return;
    }
    if (permission === false) {
      E.aiAssistantView.innerHTML = '<div class="section"><div class="muted">You do not have permission to use AI Assistant.</div></div>';
      return;
    }
    renderPrompts();
  }

  function init() {
    if (!E.aiAssistantView) return;
    render();
    E.aiAssistantSend?.addEventListener('click', send);
    E.aiAssistantInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    window.addEventListener('incheck360:auth-ready', render);
  }
  return { init, render, getResolvedCurrentUser, getResolvedRole, isAuthReady, canUseAiAssistant };
})();

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => window.AIAssistant?.init?.(), 0);
});
