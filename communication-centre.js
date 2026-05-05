(function initCommunicationCentre(global) {
  const M = {
    state: {
      rows: [],
      count: 0,
      page: 1,
      limit: 25,
      filters: { quick: 'all' },
      active: null,
      messages: [],
      participants: [],
      users: [],
      roles: [],
      loadingUsers: false,
      loadingRoles: false,
      mobileView: 'list'
    }
  };

  const $ = id => document.getElementById(id);
  function ccNotify(message, type = 'info') {
    try {
      if (typeof window.showToast === 'function') {
        window.showToast(message, type);
        return;
      }

      if (window.App && typeof window.App.showToast === 'function') {
        window.App.showToast(message, type);
        return;
      }

      if (typeof window.notifyUser === 'function') {
        window.notifyUser(message, type);
        return;
      }

      if (typeof window.showStatus === 'function') {
        window.showStatus(message, type);
        return;
      }

      if (window.NotificationHub && typeof window.NotificationHub.showToast === 'function') {
        window.NotificationHub.showToast(message, type);
        return;
      }

      console[type === 'error' ? 'error' : 'log']('[Communication Centre]', message);
    } catch (err) {
      console.warn('[Communication Centre] notification helper failed', err);
      console.log('[Communication Centre]', message);
    }
  }
  const showFriendlyError = message => ccNotify(message, 'error');
  const showFriendlySuccess = message => ccNotify(message, 'success');
  const db = () => global.SupabaseClient?.getClient?.();
  function isAuthenticated() {
    try {
      if (typeof global.Session?.isAuthenticated === 'function') return Boolean(global.Session.isAuthenticated());
      return Boolean(global.Session?.user?.() || global.Session?.currentUser?.());
    } catch (_error) {
      return false;
    }
  }

  function permissionHas(resource, action, { directDeleteOnly = false } = {}) {
    const P = global.Permissions;
    if (!P) return false;
    try {
      const normalizedResource = String(resource || '').trim().toLowerCase();
      const normalizedAction = String(action || '').trim().toLowerCase();
      if (!normalizedResource || !normalizedAction) return false;

      // For delete we must not allow a global "manage implies delete" alias.
      if (directDeleteOnly) {
        const rows = Array.isArray(P.state?.rows) ? P.state.rows : [];
        const role = typeof P.normalizeRole === 'function'
          ? P.normalizeRole(global.Session?.role?.())
          : String(global.Session?.role?.() || '').trim().toLowerCase();
        return rows.some(row => {
          const rowRole = typeof P.normalizeRole === 'function' ? P.normalizeRole(row.role_key) : String(row.role_key || '').trim().toLowerCase();
          const rowResource = String(row.resource || '').trim().toLowerCase();
          const rowAction = String(row.action || '').trim().toLowerCase();
          const active = row.is_active !== false && String(row.is_active ?? 'true').toLowerCase() !== 'false';
          const allowed = row.is_allowed !== false && String(row.is_allowed ?? 'true').toLowerCase() !== 'false';
          return rowRole === role && rowResource === normalizedResource && rowAction === normalizedAction && active && allowed;
        });
      }

      return Boolean(P.can?.(normalizedResource, normalizedAction) || P.canPerformAction?.(normalizedResource, normalizedAction));
    } catch (error) {
      console.warn('[Communication Centre] permission check failed', { resource, action, error });
      return false;
    }
  }

  const can = action => {
    const normalizedAction = String(action || '').trim().toLowerCase();
    if (!normalizedAction || !isAuthenticated()) return false;

    const resources = ['communication_centre', 'communicationcentre', 'communication-centre'];

    // Final Communication Centre business rule:
    // every authenticated app user can perform all normal Communication Centre actions.
    // Visibility is still protected by Supabase/RLS: admin sees all; other users only created/participant conversations.
    // Delete is the only separate action and must be explicitly granted.
    if (normalizedAction === 'delete') {
      return resources.some(resource => permissionHas(resource, 'delete', { directDeleteOnly: true }));
    }

    if ([
      'view',
      'list',
      'get',
      'open',
      'create',
      'reply',
      'update',
      'close',
      'reopen',
      'manage'
    ].includes(normalizedAction)) {
      return true;
    }

    const actionMap = {
      view: ['view', 'list', 'get', 'manage'],
      list: ['view', 'list', 'get', 'manage'],
      get: ['view', 'list', 'get', 'manage'],
      open: ['view', 'list', 'get', 'manage'],
      create: ['create', 'manage'],
      reply: ['reply', 'manage'],
      update: ['update', 'manage'],
      close: ['close', 'manage'],
      reopen: ['reopen', 'manage'],
      manage: ['manage']
    };
    const candidates = actionMap[normalizedAction] || [normalizedAction, 'manage'];
    return resources.some(resource => candidates.some(candidate => permissionHas(resource, candidate)));
  };
  const canOpenConversation = () => can('open');
  const canManageConversation = () => can('manage');
  const canDeleteConversation = () => can('delete');
  const escapeHtml = value => {
    if (global.U?.escapeHtml) return global.U.escapeHtml(value);
    return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  };
  const escapeAttr = value => {
    if (global.U?.escapeAttr) return global.U.escapeAttr(value);
    return escapeHtml(value).replace(/'/g, '&#39;');
  };
  const normalizeText = value => String(value ?? '').trim();
  const normalizeRole = value => normalizeText(value).toLowerCase();
  const MOBILE_BREAKPOINT = 768;
  const TABLET_BREAKPOINT = 1024;
  const isMobileViewport = () => global.matchMedia ? global.matchMedia(`(max-width:${MOBILE_BREAKPOINT - 1}px)`).matches : global.innerWidth < MOBILE_BREAKPOINT;
  const isTabletViewport = () => global.innerWidth >= MOBILE_BREAKPOINT && global.innerWidth < TABLET_BREAKPOINT;
  function setMobileView(view) {
    M.state.mobileView = ['list', 'chat', 'details'].includes(view) ? view : 'list';
    syncResponsiveLayout();
  }
  function syncResponsiveLayout() {
    const container = $('communicationCentreView');
    const drawer = $('communicationCentreDrawer');
    if (!container) return;
    const mobile = isMobileViewport();
    const tablet = isTabletViewport();
    container.classList.toggle('cc-mobile', mobile);
    container.classList.toggle('cc-tablet', tablet);
    container.classList.toggle('cc-desktop', !mobile && !tablet);
    if (mobile) {
      container.dataset.mobileView = M.state.mobileView || 'list';
    } else {
      delete container.dataset.mobileView;
    }
    if (mobile && M._lastMobileLog !== M.state.mobileView) {
      M._lastMobileLog = M.state.mobileView;
      console.log('[Communication Centre mobile]', { mobileView: M.state.mobileView, width: global.innerWidth });
    }
    if (drawer && (mobile || tablet)) {
      drawer.classList.toggle('collapsed', M.state.mobileView !== 'details');
    } else if (drawer) {
      drawer.classList.remove('collapsed');
    }
  }

  const relTime = value => {
    if (!value) return '—';
    const diff = Date.now() - new Date(value).getTime();
    const mins = Math.floor(diff/60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins/60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs/24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d`;
    return new Date(value).toLocaleDateString();
  };
  const relatedRouteMap = {
    tickets: '/#tickets/',
    events: '/#events/',
    leads: '/#leads/',
    deals: '/#deals/',
    proposals: '/#proposals/',
    agreements: '/#agreements/',
    invoices: '/#invoices/',
    receipts: '/#receipts/',
    clients: '/#clients/',
    operations_onboarding: '/#operations_onboarding/',
    technical_admin_requests: '/#technical_admin_requests/',
    workflow: '/#workflow/'
  };

  const nameOf = (row = {}) => normalizeText(
    row.full_name || row.name || row.display_name || row.username || row.email || row.user_name || row.id || row.user_id
  ) || 'Unknown';
  const idOf = (row = {}) => normalizeText(row.id || row.user_id || row.auth_user_id || row.profile_id);
  const roleOf = (row = {}) => normalizeRole(row.role_key || row.role || row.user_role || row.role_name || row.key);
  const isActiveRow = (row = {}) => {
    const raw = row.is_active ?? row.active ?? row.enabled ?? true;
    return !['false', '0', 'no', 'inactive', 'disabled'].includes(String(raw).trim().toLowerCase());
  };

  function extractRows(response) {
    const candidates = [
      response,
      response?.rows,
      response?.items,
      response?.data,
      response?.result,
      response?.payload,
      response?.users,
      response?.roles,
      response?.data?.rows,
      response?.data?.items,
      response?.data?.users,
      response?.data?.roles,
      response?.result?.rows,
      response?.result?.items,
      response?.payload?.rows,
      response?.payload?.items
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  }

  async function list() {
    const client = db();
    if (!client) throw new Error('Supabase client is not available.');
    let query = client.from('communication_centre_conversations').select('*', { count: 'exact' });
    const filters = M.state.filters;
    if (filters.search) {
      const search = filters.search.trim();
      query = query.or(`conversation_no.ilike.%${search}%,title.ilike.%${search}%,description.ilike.%${search}%,created_by_name.ilike.%${search}%,last_message_preview.ilike.%${search}%`);
    }
    ['status', 'priority', 'category', 'assigned_role', 'created_by_name'].forEach(key => {
      if (filters[key]) query = query.eq(key, filters[key]);
    });
    const from = (M.state.page - 1) * M.state.limit;
    const to = from + M.state.limit - 1;
    const { data, error, count } = await query
      .order('is_pinned', { ascending: false })
      .order('updated_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    M.state.rows = data || [];
    M.state.count = count || 0;
  }

  async function openDetail(id) {
    try {
      const client = db();
      if (!client) {
        showFriendlyError('Unable to open conversation. Please refresh and try again.');
        return;
      }
      const { data, error } = await client
        .from('communication_centre_conversations')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) {
        console.error('[Communication Centre] open detail failed', error || new Error('Conversation not found'));
        showFriendlyError('Unable to open conversation. Please refresh and try again.');
        return;
      }
      M.state.active = data;
      const [messagesResult, participantsResult] = await Promise.all([
        client.from('communication_centre_messages').select('*').eq('conversation_id', id).order('created_at', { ascending: true }),
        client.from('communication_centre_participants').select('*').eq('conversation_id', id).order('participant_type', { ascending: true }).order('user_name', { ascending: true })
      ]);
      if (messagesResult.error) console.error('[Communication Centre] unable to load messages', messagesResult.error);
      if (participantsResult.error) console.error('[Communication Centre] unable to load participants', participantsResult.error);
      // The database/RLS already controls whether this row can be read.
      // Do not re-block here with frontend-only ID matching because profile/auth IDs can differ by deployment.
      const participantRows = participantsResult.data || [];
      M.state.messages = messagesResult.data || [];
      M.state.participants = participantRows;
      renderDrawer();
      try {
        await client.rpc('mark_communication_centre_read', { p_conversation_id: id });
        M.state.rows = (M.state.rows || []).map(row => String(row.id) === String(id) ? { ...row, unread_count: 0 } : row);
        render();
      } catch (errorMarkRead) {
        console.warn('[Communication Centre] mark read failed', errorMarkRead);
      }
    } catch (error) {
      console.error('[Communication Centre] open detail failed', error);
      showFriendlyError('Unable to open conversation. Please refresh and try again.');
    }
  }


  async function dispatchCommunicationCentreNotification({ action, conversationId, actorId, title, body, conversationNo, conversationTitle }) {
    try {
      if (!global.NotificationService?.sendBusinessNotification) return;
      const url = `/#communication_centre?conversation_id=${encodeURIComponent(conversationId)}`;
      await global.NotificationService.sendBusinessNotification({
        resource: 'communication_centre',
        action: String(action || '').trim(),
        eventKey: `communication_centre.${String(action || '').trim()}`,
        recordId: conversationId,
        title,
        body,
        url,
        metadata: { actor_user_id: actorId, conversation_id: conversationId, conversation_no: conversationNo || '', conversation_title: conversationTitle || '' },
        channels: ['in_app', 'push', 'email']
      });
    } catch (error) {
      console.warn('[Communication Centre] notification dispatch failed', error);
    }
  }


  function render() {
    const listEl = $('communicationCentreList');
    if (!listEl) return;
    const activeId = M.state.active?.id;
    const rows = (M.state.rows || []).filter(row => {
      const q = M.state.filters.quick || 'all';
      const archived = Boolean(row.is_archived);
      if (q === 'archived') return archived;
      if (archived) return false;
      if (q === 'open') return row.status !== 'Closed';
      if (q === 'closed') return row.status === 'Closed';
      if (q === 'unread') return Number(row.unread_count || 0) > 0;
      if (q === 'pinned') return Boolean(row.is_pinned);
      if (q === 'mine') return String(row.created_by||'')===String(global.Session?.user?.()?.id||global.Session?.currentUser?.()?.id||'');
      if (q === 'assigned') return Number(row.is_assigned_to_me||0)===1;
      return true;
    });
    rows.sort((a, b) => {
      const pinDiff = Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned));
      if (pinDiff) return pinDiff;
      const unreadDiff = Number((b.unread_count || 0) > 0) - Number((a.unread_count || 0) > 0);
      if (unreadDiff) return unreadDiff;
      return new Date(b.updated_at || b.last_message_at || 0).getTime() - new Date(a.updated_at || a.last_message_at || 0).getTime();
    });
    listEl.innerHTML = rows.map(row => `<button class="cc-item ${activeId===row.id?'active':''} ${Number(row.unread_count||0)>0?'unread':''}" data-cc-open="${escapeAttr(row.id)}" type="button"><div class="cc-item-main"><small>${escapeHtml(row.conversation_no||'')}</small><strong>${escapeHtml(row.title||'Untitled')}</strong><p>${escapeHtml(row.last_message_preview||'No messages yet')}</p><div class="cc-item-submeta">${row.is_pinned?'<span class="chip">📌 Pinned</span>':''}${M.state.filters.quick==='archived'&&row.is_archived?'<span class="chip">Archived</span>':''}${row.participant_count?`<span class="chip">${escapeHtml(String(row.participant_count))} participants</span>`:''}</div></div><div class="cc-item-meta"><span class="cc-time">${escapeHtml(relTime(row.updated_at||row.last_message_at))}</span><span class="chip cc-status-chip">${escapeHtml(row.status||'Open')}</span>${row.priority?`<span class="chip cc-priority-chip">${escapeHtml(row.priority)}</span>`:''}${Number(row.unread_count||0)>0?`<span class="chip cc-unread-chip">● ${escapeHtml(String(row.unread_count))}</span>`:''}</div></button>`).join('') || '<div class="muted" style="padding:16px;">No conversations found for this filter.</div>';
    const pageInfo = $('communicationCentrePageInfo');
    if (pageInfo) pageInfo.textContent = `Page ${M.state.page} • ${M.state.count} total`;
  }
  function renderDrawer() {
    const drawer = $('communicationCentreDrawer');
    if (!drawer || !M.state.active) return;
    const conversation = M.state.active;
    drawer.style.display = 'block';
    const header = $('communicationCentreChatHeader');
    const meta = $('communicationCentreDrawerMeta');
    const participants = $('communicationCentreParticipants');
    const messages = $('communicationCentreMessages');
    const replyWrap = $('communicationCentreReplyWrap');
    const closedMsg = $('communicationCentreClosedMsg');
      const mobileBack = isMobileViewport() ? '<button id="communicationCentreBackToList" class="btn ghost sm" type="button">← Conversations</button>' : '';
      const relatedLabel = conversation.related_module && conversation.related_record_id ? `${conversation.related_module} #${conversation.related_record_id}` : '';
      if (header) header.innerHTML = `${mobileBack}<div class="cc-chat-heading"><h3>${escapeHtml((conversation.conversation_no || '') + ' ' + (conversation.title || ''))}</h3><div class="muted">${escapeHtml(conversation.category || 'General')} • ${escapeHtml(conversation.priority || 'Normal')} • ${escapeHtml(conversation.status || 'Open')}${relatedLabel ? ` • ${escapeHtml(relatedLabel)}` : ''}</div></div><button id="communicationCentreOpenDetails" class="btn ghost sm" type="button">Details</button>`;
    if (meta) meta.textContent = `${conversation.status || 'Open'} • ${conversation.priority || 'Normal'} • ${conversation.category || 'General'}`;
    if (participants) {
      participants.innerHTML = M.state.participants.map(participant => `
        <span class="chip cc-participant-chip">${escapeHtml(participant.participant_type || 'participant')}: ${escapeHtml(participant.user_name || participant.user_id || 'User')}</span>
      `).join(' ');
    }
    const currentUserId = global.Session?.user?.()?.id || global.Session?.currentUser?.()?.id || '';
    if (messages) {
      messages.innerHTML = M.state.messages.length ? M.state.messages.map(message => {
        const isMine = String(message.sender_id || '') === String(currentUserId || '');
        const muted = message.is_system_message ? 'opacity:.72;' : '';
        if (message.is_system_message) {
          return `
            <div class="cc-system-message">${escapeHtml(message.message_body || message.body || 'System update')}</div>
          `;
        }
        return `
          <div class="cc-message-row ${isMine ? 'mine' : 'incoming'}" style="${muted}">
            <div class="cc-bubble">
              <div class="cc-message-meta">${escapeHtml(message.sender_name || 'System')} • ${message.created_at ? escapeHtml(new Date(message.created_at).toLocaleString()) : ''}</div>
              <div class="cc-message-body">${escapeHtml(message.message_body || message.body || '')}</div>
            </div>
          </div>
        `;
      }).join('') : '<div class="muted" style="padding:20px;text-align:center;">Select a conversation to view messages.</div>';
      messages.scrollTop = messages.scrollHeight;
    }
    if (replyWrap) replyWrap.style.display = (conversation.status !== 'Closed' && can('reply')) ? '' : 'none';
    if (closedMsg) closedMsg.style.display = conversation.status === 'Closed' ? '' : 'none';
    renderDrawerActions();
    syncResponsiveLayout();
  }

  function renderDrawerActions() {
    const drawer = $('communicationCentreDrawer');
    if (!drawer || !M.state.active) return;
    let actionWrap = $('communicationCentreDrawerActions');
    if (!actionWrap) {
      const header = drawer.querySelector('.header');
      actionWrap = document.createElement('div');
      actionWrap.id = 'communicationCentreDrawerActions';
      actionWrap.className = 'actions';
      if (header) header.appendChild(actionWrap);
    }
    const conversation = M.state.active;
    const pinButton = canManageConversation()
      ? `<button id="communicationCentrePinConversationBtn" class="btn ghost sm" type="button">${conversation.is_pinned ? 'Unpin' : 'Pin'}</button>` : '';
    const archiveButton = canManageConversation()
      ? `<button id="communicationCentreArchiveConversationBtn" class="btn ghost sm" type="button">${conversation.is_archived ? 'Unarchive' : 'Archive'}</button>` : '';
    const closeButton = conversation.status !== 'Closed' && can('close')
      ? '<button id="communicationCentreCloseConversationBtn" class="btn ghost sm" type="button">Close Conversation</button>'
      : '';
    const reopenButton = conversation.status === 'Closed' && can('reopen')
      ? '<button id="communicationCentreReopenConversationBtn" class="btn ghost sm" type="button">Reopen Conversation</button>'
      : '';
    const copyLinkButton = '<button id="communicationCentreCopyLinkBtn" class="btn ghost sm" type="button">Copy Link</button>';
    const deleteButton = canDeleteConversation()
      ? '<button id="communicationCentreDeleteConversationBtn" class="btn danger sm" type="button">Delete Conversation</button>'
      : '';
    const relatedRoute = relatedRouteMap[String(conversation.related_module || '').trim().toLowerCase()];
    const relatedButton = relatedRoute && conversation.related_record_id
      ? '<button id="communicationCentreOpenRelatedBtn" class="btn ghost sm" type="button">Open Related Record</button>' : '';
    actionWrap.innerHTML = `
      <div class="cc-details-section"><strong>Conversation Info</strong><div class="muted">#${escapeHtml(conversation.conversation_no || '—')} • ${escapeHtml(conversation.status || 'Open')} • ${escapeHtml(conversation.priority || 'Normal')} • ${escapeHtml(conversation.category || 'General')}</div><div class="muted">Created by ${escapeHtml(conversation.created_by_name || 'Unknown')} • ${escapeHtml(new Date(conversation.created_at).toLocaleString())}</div><div class="muted">Updated ${escapeHtml(new Date(conversation.updated_at || conversation.last_message_at || conversation.created_at).toLocaleString())}</div></div>
      <div class="cc-details-section"><strong>Assignment</strong><div class="muted">Assigned role: ${escapeHtml(conversation.assigned_role || '—')}</div><div class="muted">Participants: ${escapeHtml(String(M.state.participants.length || 0))}</div></div>
      <div class="cc-details-section"><strong>Related Record</strong><div class="muted">Module: ${escapeHtml(conversation.related_module || '—')}</div><div class="muted">Record ID: ${escapeHtml(conversation.related_record_id || '—')}</div>${relatedButton}</div>
      <div class="cc-details-section"><strong>Actions</strong><div class="actions">${pinButton}${archiveButton}${closeButton}${reopenButton}${copyLinkButton}${deleteButton}</div></div>`;
    $('communicationCentrePinConversationBtn')?.addEventListener('click', togglePinConversation);
    $('communicationCentreArchiveConversationBtn')?.addEventListener('click', toggleArchiveConversation);
    $('communicationCentreOpenRelatedBtn')?.addEventListener('click', () => { global.location.hash = `${relatedRoute}${encodeURIComponent(conversation.related_record_id)}`.replace('/#', '#'); });
    $('communicationCentreCloseConversationBtn')?.addEventListener('click', closeActiveConversation);
    $('communicationCentreReopenConversationBtn')?.addEventListener('click', reopenActiveConversation);
    $('communicationCentreDeleteConversationBtn')?.addEventListener('click', deleteActiveConversation);
    $('communicationCentreCopyLinkBtn')?.addEventListener('click', async () => {
      const url = `${global.location.origin}${global.location.pathname}#communication_centre?conversation_id=${encodeURIComponent(conversation.id)}`;
      try { await navigator.clipboard.writeText(url); showFriendlySuccess('Link copied.'); } catch(_e){ showFriendlyError('Unable to update conversation. Please try again.'); }
    });
  }
  async function togglePinConversation() {
    const conversation = M.state.active;
    if (!conversation || !canManageConversation()) return;
    try {
      const { error } = await db().rpc('pin_communication_centre_conversation', { p_conversation_id: conversation.id, p_is_pinned: !conversation.is_pinned });
      if (error) throw error;
      conversation.is_pinned = !conversation.is_pinned;
      await refresh(); renderDrawer();
      showFriendlySuccess(conversation.is_pinned ? 'Conversation pinned.' : 'Conversation unpinned.');
    } catch (error) { console.error('[Communication Centre] pin failed', error); showFriendlyError('Unable to update conversation. Please try again.'); }
  }
  async function toggleArchiveConversation() {
    const conversation = M.state.active;
    if (!conversation || !canManageConversation()) return;
    try {
      const { error } = await db().rpc('archive_communication_centre_conversation', { p_conversation_id: conversation.id, p_is_archived: !conversation.is_archived });
      if (error) throw error;
      conversation.is_archived = !conversation.is_archived;
      await refresh(); renderDrawer();
      showFriendlySuccess(conversation.is_archived ? 'Conversation archived.' : 'Conversation unarchived.');
    } catch (error) { console.error('[Communication Centre] archive failed', error); showFriendlyError('Unable to update conversation. Please try again.'); }
  }

  async function refresh() {
    try {
      await list();
      render();
    } catch (error) {
      console.error('[Communication Centre] load conversations failed', error);
      showFriendlyError('Unable to load Communication Centre conversations. Please refresh and try again.');
    }
  }

  async function loadCommunicationCentreAssignableUsers(force = false) {
    if (M.state.loadingUsers) return M.state.users;
    if (M.state.users.length && !force) return M.state.users;
    M.state.loadingUsers = true;
    try {
      const client = db();
      if (!client?.rpc) throw new Error('Supabase client is not available.');
      const { data, error } = await client.rpc('list_communication_centre_assignable_users');
      if (error) throw error;
      const rows = extractRows(data);
      M.state.users = rows
        .map(row => ({ ...row, _id: idOf(row), _name: nameOf(row), _role: roleOf(row) }))
        .filter(row => row._id && isActiveRow(row))
        .sort((a, b) => a._name.localeCompare(b._name));
    } catch (error) {
      console.warn('[Communication Centre] unable to load assignable users', error);
      const current = global.Session?.user?.() || global.Session?.currentUser?.() || {};
      const currentId = idOf(current);
      M.state.users = currentId ? [{ ...current, _id: currentId, _name: nameOf(current), _role: roleOf(current) }] : [];
    } finally {
      M.state.loadingUsers = false;
    }
    return M.state.users;
  }

  async function loadCommunicationCentreAssignableRoles(force = false) {
    if (M.state.loadingRoles) return M.state.roles;
    if (M.state.roles.length && !force) return M.state.roles;
    M.state.loadingRoles = true;
    try {
      const client = db();
      if (!client?.rpc) throw new Error('Supabase client is not available.');
      const { data, error } = await client.rpc('list_communication_centre_assignable_roles');
      if (error) throw error;
      const rows = extractRows(data);
      M.state.roles = rows
        .map(row => ({ ...row, _key: roleOf(row), _label: normalizeText(row.display_name || row.name || row.label || row.role_key || row.key || row.role) }))
        .filter(row => row._key && isActiveRow(row))
        .sort((a, b) => a._label.localeCompare(b._label));
    } catch (error) {
      console.warn('[Communication Centre] unable to load assignable roles', error);
      M.state.roles = [
        { _key: 'admin', _label: 'Admin' },
        { _key: 'dev', _label: 'Dev' },
        { _key: 'csm', _label: 'CSM' },
        { _key: 'hoo', _label: 'HOO' },
        { _key: 'viewer', _label: 'Viewer' }
      ];
    } finally {
      M.state.loadingRoles = false;
    }
    return M.state.roles;
  }

  function ensureCreateModal() {
    let modal = $('communicationCentreCreateModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'communicationCentreCreateModal';
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('aria-labelledby', 'communicationCentreCreateTitle');
    modal.innerHTML = `
      <div class="modal-content" style="max-width:920px;">
        <div class="header">
          <h2 id="communicationCentreCreateTitle" style="margin:0;font-size:20px;">New Communication Centre Conversation</h2>
          <div class="actions"><button class="modal-close" id="communicationCentreCreateClose" type="button" aria-label="Close">✕</button></div>
        </div>
        <form id="communicationCentreCreateForm">
          <div id="communicationCentreCreateError" class="card danger" style="display:none;margin-bottom:12px;padding:10px;border-left:4px solid #d73a49;color:#7f1d1d;"></div>
          <div class="grid cols-2" style="gap:12px;">
            <div class="filter-row" style="grid-column:1/-1;">
              <label class="muted" for="communicationCentreCreateTitleInput">Title</label>
              <input id="communicationCentreCreateTitleInput" class="input" type="text" required placeholder="Conversation title" />
            </div>
            <div class="filter-row" style="grid-column:1/-1;">
              <label class="muted" for="communicationCentreCreateMessageInput">First message</label>
              <textarea id="communicationCentreCreateMessageInput" class="input" rows="5" required placeholder="Write the first message"></textarea>
            </div>
            <div class="filter-row">
              <label class="muted" for="communicationCentreCreateCategory">Category</label>
              <select id="communicationCentreCreateCategory" class="select">
                <option>General</option><option>Ticket</option><option>Event</option><option>Client</option><option>Lead</option><option>Deal</option><option>Proposal</option><option>Agreement</option><option>Invoice</option><option>Receipt</option><option>Operations</option><option>Technical</option><option>Finance</option><option>Sales</option><option>Other</option>
              </select>
            </div>
            <div class="filter-row">
              <label class="muted" for="communicationCentreCreatePriority">Priority</label>
              <select id="communicationCentreCreatePriority" class="select">
                <option>Low</option><option selected>Normal</option><option>High</option><option>Urgent</option>
              </select>
            </div>
            <div class="filter-row">
              <label class="muted" for="communicationCentreCreateUsers">Assign to users</label>
              <select id="communicationCentreCreateUsers" class="select" multiple size="7"></select>
            </div>
            <div class="filter-row">
              <label class="muted" for="communicationCentreCreateRole">Assign to role</label>
              <select id="communicationCentreCreateRole" class="select"><option value="">No role</option></select>
              <div class="muted" style="font-size:12px;margin-top:6px;">Role assignment is snapshotted. Only users currently in this role will be added to this conversation.</div>
            </div>
            <div class="filter-row">
              <label class="muted" for="communicationCentreCreateRelatedResource">Related module</label>
              <select id="communicationCentreCreateRelatedResource" class="select">
                <option value="">None</option><option>Ticket</option><option>Event</option><option>Client</option><option>Lead</option><option>Deal</option><option>Proposal</option><option>Agreement</option><option>Invoice</option><option>Receipt</option><option>Operations Onboarding</option><option>Technical Admin Request</option><option>Other</option>
              </select>
            </div>
            <div class="filter-row">
              <label class="muted" for="communicationCentreCreateRelatedRecordId">Related record ID</label>
              <input id="communicationCentreCreateRelatedRecordId" class="input" type="text" placeholder="Optional" />
            </div>
          </div>
          <div class="actions" style="justify-content:flex-end;margin-top:14px;">
            <button id="communicationCentreCreateCancel" class="btn ghost" type="button">Cancel</button>
            <button id="communicationCentreCreateSubmit" class="btn" type="submit">Create Conversation</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    $('communicationCentreCreateClose')?.addEventListener('click', closeCreateModal);
    $('communicationCentreCreateCancel')?.addEventListener('click', closeCreateModal);
    modal.addEventListener('click', event => {
      if (event.target === modal) closeCreateModal();
    });
    $('communicationCentreCreateForm')?.addEventListener('submit', submitCreateConversation);
    return modal;
  }

  async function populateCreateModalOptions() {
    const [usersResult, rolesResult] = await Promise.allSettled([
      loadCommunicationCentreAssignableUsers(),
      loadCommunicationCentreAssignableRoles()
    ]);
    const users = usersResult.status === 'fulfilled' ? usersResult.value : [];
    const roles = rolesResult.status === 'fulfilled' ? rolesResult.value : [];
    if (!users.length && !roles.length) {
      showFriendlyError('Unable to load assignment options. Please refresh and try again.');
    }
    const usersSelect = $('communicationCentreCreateUsers');
    const roleSelect = $('communicationCentreCreateRole');
    if (usersSelect) {
      usersSelect.innerHTML = users.length
        ? users.map(user => `<option value="${escapeAttr(user._id)}">${escapeHtml(user._name)}${user._role ? ` (${escapeHtml(user._role)})` : ''}</option>`).join('')
        : '<option value="" disabled>No users available</option>';
    }
    if (roleSelect) {
      roleSelect.innerHTML = '<option value="">No role</option>' + roles.map(role => `<option value="${escapeAttr(role._key)}">${escapeHtml(role._label || role._key)}</option>`).join('');
    }
  }

  async function openCreateModal() {
    if (!can('create')) {
      showFriendlyError('Unable to create conversation. Please check your permissions and try again.');
      return;
    }
    const modal = ensureCreateModal();
    const form = $('communicationCentreCreateForm');
    if (form) form.reset();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    await populateCreateModalOptions();
    $('communicationCentreCreateTitleInput')?.focus();
  }

  function closeCreateModal() {
    const modal = $('communicationCentreCreateModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function submitCreateConversation(event) {
    event.preventDefault();
    const submit = $('communicationCentreCreateSubmit');
    const title = normalizeText($('communicationCentreCreateTitleInput')?.value);
    const message = normalizeText($('communicationCentreCreateMessageInput')?.value);
    const category = normalizeText($('communicationCentreCreateCategory')?.value) || 'General';
    const priority = normalizeText($('communicationCentreCreatePriority')?.value) || 'Normal';
    const assignedUserIds = [...($('communicationCentreCreateUsers')?.selectedOptions || [])].map(option => option.value).filter(Boolean);
    const assignedRole = normalizeText($('communicationCentreCreateRole')?.value);
    const relatedResource = normalizeText($('communicationCentreCreateRelatedResource')?.value);
    const relatedRecordId = normalizeText($('communicationCentreCreateRelatedRecordId')?.value);

    if (!title) return showFriendlyError('Title is required.');
    if (!message) return showFriendlyError('First message is required.');
    if (!assignedUserIds.length && !assignedRole) return showFriendlyError('Select at least one assigned user or assigned role.');

    try {
      if (submit) {
        submit.disabled = true;
        submit.textContent = 'Creating...';
        submit.setAttribute('aria-busy','true');
      }
      const client = db();
      if (!client) throw new Error('Supabase client is not available.');
      try {
        const debugResult = await client.rpc('communication_centre_debug_context');
        if (debugResult?.error) {
          console.warn('[Communication Centre] debug context failed before create', debugResult.error);
        } else {
          console.log('[Communication Centre] create debug context', debugResult?.data);
        }
      } catch (debugError) {
        console.warn('[Communication Centre] unable to read debug context before create', debugError);
      }
      const { data, error } = await client.rpc('create_communication_centre_conversation', {
        p_title: title,
        p_description: message,
        p_category: category,
        p_priority: priority,
        p_assigned_user_ids: assignedUserIds,
        p_assigned_role: assignedRole || null,
        p_related_resource: relatedResource || null,
        p_related_record_id: relatedRecordId || null
      });
      if (error) throw error;
      const conversation = Array.isArray(data) ? data[0] : data;
      const inlineError = $('communicationCentreCreateError');
      if (inlineError) {
        inlineError.style.display = 'none';
        inlineError.textContent = '';
      }
      closeCreateModal();
      await refresh();
      if (conversation?.id) {
        await openDetail(conversation.id);
        setMobileView('chat');
        dispatchCommunicationCentreNotification({
          action: 'conversation_created',
          conversationId: conversation.id,
          actorId: conversation.created_by,
          title: 'New Communication Centre conversation',
          body: `${conversation.created_by_name || global.Session?.displayName?.() || 'A user'} created “${conversation.title || title}”`,
          conversationNo: conversation.conversation_no,
          conversationTitle: conversation.title || title
        });
      }
      showFriendlySuccess('Conversation created successfully.');
    } catch (error) {
      console.error('[Communication Centre] create conversation failed', error);
      const inlineError = $('communicationCentreCreateError');
      const rawMessage = String(error?.message || error?.details || error || '');
      const friendlyMessage = rawMessage.includes('Detected role:')
        ? 'Unable to create conversation. Your role could not be verified by the database. Please ask an admin to refresh your user profile role.'
        : 'Unable to create conversation. Please check your permissions and try again.';
      if (inlineError) {
        inlineError.textContent = friendlyMessage;
        inlineError.style.display = 'block';
      }
      showFriendlyError(friendlyMessage);
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Create Conversation';
        submit.removeAttribute('aria-busy');
      }
    }
  }

  async function closeActiveConversation() {
    const conversation = M.state.active;
    if (!conversation?.id) return;
    try {
      const { error } = await db().rpc('close_communication_centre_conversation', { p_conversation_id: conversation.id });
      if (error) throw error;
      await openDetail(conversation.id);
      await refresh();
      dispatchCommunicationCentreNotification({
        action: 'conversation_closed',
        conversationId: conversation.id,
        actorId: global.Session?.user?.()?.id,
        title: 'Communication Centre conversation closed',
        body: `${global.Session?.displayName?.() || 'A user'} closed “${conversation.title}”`,
        conversationNo: conversation.conversation_no,
        conversationTitle: conversation.title
      });
      showFriendlySuccess('Conversation closed successfully.');
    } catch (error) {
      console.error('[Communication Centre] close conversation failed', error);
      showFriendlyError('Unable to close conversation. Please try again.');
    }
  }

  async function reopenActiveConversation() {
    const conversation = M.state.active;
    if (!conversation?.id) return;
    try {
      const { error } = await db().rpc('reopen_communication_centre_conversation', { p_conversation_id: conversation.id });
      if (error) throw error;
      await openDetail(conversation.id);
      await refresh();
      dispatchCommunicationCentreNotification({
        action: 'conversation_reopened',
        conversationId: conversation.id,
        actorId: global.Session?.user?.()?.id,
        title: 'Communication Centre conversation reopened',
        body: `${global.Session?.displayName?.() || 'A user'} reopened “${conversation.title}”`,
        conversationNo: conversation.conversation_no,
        conversationTitle: conversation.title
      });
      showFriendlySuccess('Conversation reopened successfully.');
    } catch (error) {
      console.error('[Communication Centre] reopen conversation failed', error);
      showFriendlyError('Unable to reopen conversation. Please try again.');
    }
  }

  async function deleteActiveConversation() {
    const conversation = M.state.active;
    if (!conversation?.id) return;
    if (!canDeleteConversation()) {
      showFriendlyError('You do not have permission to delete this conversation.');
      return;
    }
    try {
      const { error } = await db().rpc('delete_communication_centre_conversation', { p_conversation_id: conversation.id });
      if (error) throw error;
      const drawer = $('communicationCentreDrawer');
      if (drawer) drawer.style.display = 'none';
      M.state.active = null;
      setMobileView('list');
      await refresh();
      showFriendlySuccess('Conversation deleted successfully.');
    } catch (error) {
      console.error('[Communication Centre] delete conversation failed', error);
      showFriendlyError('Unable to delete conversation. Please try again.');
    }
  }

  function bindOnce(element, key, handler, options) {
    if (!element) return;
    const flag = `ccBound${key}`;
    if (element.dataset?.[flag] === 'true') return;
    if (element.dataset) element.dataset[flag] = 'true';
    element.addEventListener('click', handler, options);
  }

  function wireCreateButton() {
    const button = $('communicationCentreNewBtn') || document.querySelector('[data-cc-new-conversation]');
    if (button) {
      const allowed = can('create');
      button.style.display = allowed ? '' : 'none';
      button.disabled = !allowed;
      button.classList.toggle('is-hidden-by-permission', !allowed);
      button.setAttribute('aria-hidden', allowed ? 'false' : 'true');
    }
    bindOnce(button, 'NewConversation', event => {
      event.preventDefault();
      event.stopPropagation();
      openCreateModal();
    });
    if (button) button.setAttribute('type', 'button');
  }

  M.openConversationById = openDetail;
  M.refresh = refresh;
  M.openCreateModal = openCreateModal;

  M.init = async function () {
    const container = $('communicationCentreView');
    if (!container) {
      console.warn('[Communication Centre] container not found');
      return;
    }
    wireCreateButton();
    const role = String(global.Session?.role?.() || '').trim().toLowerCase();
    const canManage = can('manage');
    const canCreate = can('create');
    const canView = canOpenConversation();
    const canReply = can('reply');
    const canClose = can('close');
    const canReopen = can('reopen');
    const canDelete = canDeleteConversation();
    console.log('[Communication Centre permissions]', { role, canManage, canCreate, canView, canReply, canClose, canReopen, canDelete });
    bindOnce($('communicationCentreRefreshBtn'), 'Refresh', refresh);
    $('communicationCentreSearch')?.addEventListener('input', event => {
      M.state.filters.search = event.target.value;
      M.state.page = 1;
      refresh();
    }, { once: false });
    const filterTabs = $('communicationCentreFilterTabs');
    if (filterTabs) {
      const tabs = [['all','All'],['open','Open'],['closed','Closed'],['unread','Unread'],['pinned','Pinned'],['archived','Archived'],['mine','Created by me'],['assigned','Assigned to me']];
      filterTabs.innerHTML = tabs.map(([k,l])=>`<button class=\"btn ghost sm ${M.state.filters.quick===k?'active':''}\" data-cc-filter=\"${k}\" type=\"button\">${l}</button>`).join(' ');
      bindOnce(filterTabs, 'QuickFilters', (event) => { const b = event.target.closest('[data-cc-filter]'); if (!b) return; M.state.filters.quick = b.getAttribute('data-cc-filter'); render(); if (filterTabs) [...filterTabs.querySelectorAll('[data-cc-filter]')].forEach(x => x.classList.toggle('active', x===b)); }, { once:false });
    }
    bindOnce($('communicationCentrePrevBtn'), 'Prev', () => {
      if (M.state.page > 1) {
        M.state.page -= 1;
        refresh();
      }
    });
    bindOnce($('communicationCentreNextBtn'), 'Next', () => {
      if (M.state.page * M.state.limit < M.state.count) {
        M.state.page += 1;
        refresh();
      }
    });
    const listWrap = $('communicationCentreList');
    bindOnce(listWrap, 'OpenRow', event => {
      const button = event.target.closest('[data-cc-open]');
      if (!canOpenConversation()) {
        showFriendlyError('You do not have permission to open this conversation.');
        return;
      }
      if (button) openDetail(button.getAttribute('data-cc-open'));
      if (button && isMobileViewport()) setMobileView('chat');
    });
    bindOnce($('communicationCentreDrawerClose'), 'DrawerClose', () => {
      if (isMobileViewport()) setMobileView('chat');
      else $('communicationCentreDrawer')?.classList.toggle('collapsed', true);
    });
    document.addEventListener('click', (e)=>{
      if (e.target?.id==='communicationCentreOpenDetails') {
        if (isMobileViewport() || isTabletViewport()) setMobileView('details');
        else $('communicationCentreDrawer')?.classList.remove('collapsed');
      }
      if (e.target?.id === 'communicationCentreBackToList') setMobileView('list');
      if (e.target?.id === 'communicationCentreBackToChat') setMobileView('chat');
    });
    const replyBtn = $('communicationCentreReplyBtn');
    if (replyBtn) replyBtn.style.display = can('reply') ? '' : 'none';
    const replyError = $('communicationCentreReplyError');
    const replyInput = $('communicationCentreReplyInput');
    replyInput?.addEventListener('keydown', (event) => {
      if (isMobileViewport()) return;
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); replyBtn?.click(); }
    });
    bindOnce(replyBtn, 'Reply', async () => {
      const conversation = M.state.active;
      const input = $('communicationCentreReplyInput');
      const body = normalizeText(input?.value);
      if (!conversation?.id) return showFriendlyError('Open a conversation first.');
      if (!body) return showFriendlyError('Please enter a reply message.');
      try {
        const { error } = await db().rpc('add_communication_centre_reply', {
          p_conversation_id: conversation.id,
          p_message_body: body
        });
        if (error) throw error;
        if (input) input.value = '';
        if (replyError) { replyError.textContent=''; replyError.style.display='none'; }
        await openDetail(conversation.id);
        await refresh();
        showFriendlySuccess('Reply sent successfully.');
        dispatchCommunicationCentreNotification({
          action: 'reply_added',
          actorId: global.Session?.user?.()?.id,
          conversationNo: conversation.conversation_no,
          conversationTitle: conversation.title,
          title: 'New Communication Centre reply',
          body: `${global.Session?.displayName?.() || 'A user'} replied to “${conversation.title}”`,
          conversationId: conversation.id
        });
      } catch (error) {
        console.error('[Communication Centre] send reply failed', error);
        if (replyError) { replyError.textContent='Unable to send reply. Please try again.'; replyError.style.display='block'; }
        showFriendlyError('Unable to send reply. Please try again.');
      }
    });
    const hashConversationId = (() => {
      const hash = String(global.location?.hash || '');
      const match = hash.match(/conversation_id=([^&]+)/i);
      return match ? decodeURIComponent(match[1]) : '';
    })();
    await refresh();
    if (hashConversationId && canOpenConversation()) {
      await openDetail(hashConversationId);
      if (isMobileViewport()) setMobileView('chat');
    }
    syncResponsiveLayout();
    global.addEventListener('resize', syncResponsiveLayout, { passive: true });
  };

  global.CommunicationCentre = M;

  document.addEventListener('DOMContentLoaded', () => {
    wireCreateButton();
    const tab = $('communicationCentreTab') || document.querySelector('[data-view="communication_centre"],[data-tab="communication_centre"],[href="#communication_centre"]');
    if (tab && tab.dataset.ccClickFallbackBound !== 'true') {
      tab.dataset.ccClickFallbackBound = 'true';
      tab.addEventListener('click', event => {
        event.preventDefault();
        if (typeof global.setActiveView === 'function') {
          global.setActiveView('communication_centre');
          return;
        }
        if (!M._inited) {
          M._inited = true;
          M.init();
        }
      });
    }
  });
})(window);
