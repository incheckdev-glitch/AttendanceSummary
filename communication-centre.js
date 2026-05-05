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
      reactionsByMessage: {},
      readReceipts: [],
      actionItems: [],
      mentionCandidates: [],
      replyToMessage: null,
      editingMessage: null,
      composerType: 'message',
      loadingUsers: false,
      loadingRoles: false,
      mobileView: 'list',
      detailsVisible: true
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
  function setDetailsVisible(visible) {
    M.state.detailsVisible = visible !== false;
    syncResponsiveLayout();
  }
  function normalizeIdentityValue(value) {
    return String(value ?? '').trim().toLowerCase();
  }
  function getCurrentIdentity() {
    const ids = new Set();
    const names = new Set();
    const addId = value => { const v = normalizeIdentityValue(value); if (v) ids.add(v); };
    const addName = value => { const v = normalizeIdentityValue(value); if (v) names.add(v); };
    const sources = [global.Session?.user?.(), global.Session?.currentUser?.(), global.Session?.profile?.(), global.Session?.currentProfile?.()].filter(Boolean);
    sources.forEach(source => {
      ['id','user_id','profile_id','auth_user_id','uuid'].forEach(key => addId(source?.[key]));
      [source?.name, source?.full_name, source?.display_name, source?.user_name, source?.email].forEach(addName);
      const first = normalizeText(source?.first_name);
      const last = normalizeText(source?.last_name);
      if (first || last) addName(`${first} ${last}`.trim());
    });
    return { ids, names };
  }
  function isMessageMine(message) {
    const identity = getCurrentIdentity();
    const messageIds = [message?.sender_id, message?.sender_user_id, message?.user_id, message?.created_by].map(normalizeIdentityValue);
    if (messageIds.some(id => id && identity.ids.has(id))) return true;
    const senderNames = [message?.sender_name, message?.created_by_name, message?.user_name].map(normalizeIdentityValue);
    return senderNames.some(name => name && identity.names.has(name));
  }
  function renderMessageDeliveryStatus(message, isMine) {
    if (!isMine || message?.is_system_message) return '';
    const createdAt = message?.created_at ? new Date(message.created_at).getTime() : 0;
    const identity = getCurrentIdentity();
    const others = (M.state.readReceipts || []).filter(row => {
      const uid = normalizeIdentityValue(row.user_id || row.profile_id || row.auth_user_id);
      return uid && !identity.ids.has(uid);
    });
    const hasRead = others.some(row => {
      const t = new Date(row.last_read_at || row.read_at || row.updated_at || row.created_at || 0).getTime();
      return t && createdAt && t >= createdAt;
    });
    const hasOtherParticipants = (M.state.participants || []).some(row => {
      const uid = normalizeIdentityValue(row.user_id || row.profile_id || row.auth_user_id);
      const name = normalizeIdentityValue(row.user_name || row.name || row.email);
      return (uid && !identity.ids.has(uid)) || (name && !identity.names.has(name));
    });
    const label = hasRead ? '✓✓ Read' : (hasOtherParticipants ? '✓✓ Received' : '✓ Sent');
    return `<div class="cc-message-status ${hasRead ? 'read' : (hasOtherParticipants ? 'received' : 'sent')}">${escapeHtml(label)}</div>`;
  }

  function renderReplyTargetPreview() {
    const target = $('communicationCentreReplyTarget');
    const replyBtn = $('communicationCentreReplyBtn');
    const input = $('communicationCentreReplyInput');
    if (!target) return;
    const editing = M.state.editingMessage;
    if (editing) {
      const body = normalizeText(editing.message_body || editing.body || 'Message');
      target.style.display = '';
      target.innerHTML = `<div><strong>Editing your message</strong><span>${escapeHtml(body.slice(0, 120))}${body.length > 120 ? '…' : ''}</span></div><button type="button" class="btn ghost sm" id="communicationCentreCancelReplyTarget">Cancel</button>`;
      if (replyBtn) replyBtn.textContent = 'Save edit';
      return;
    }
    const message = M.state.replyToMessage;
    if (!message) {
      target.style.display = 'none';
      target.innerHTML = '';
      if (replyBtn) replyBtn.textContent = 'Send';
      return;
    }
    const body = normalizeText(message.message_body || message.body || 'Message');
    target.style.display = '';
    target.innerHTML = `<div><strong>Replying to ${escapeHtml(message.sender_name || 'user')}</strong><span>${escapeHtml(body.slice(0, 120))}${body.length > 120 ? '…' : ''}</span></div><button type="button" class="btn ghost sm" id="communicationCentreCancelReplyTarget">Cancel</button>`;
    if (replyBtn) replyBtn.textContent = 'Send';
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
    container.classList.toggle('cc-details-hidden', !mobile && !tablet && M.state.detailsVisible === false);
    if (mobile) {
      container.dataset.mobileView = M.state.mobileView || 'list';
    } else {
      delete container.dataset.mobileView;
    }
    if (mobile && M._lastMobileLog !== M.state.mobileView) {
      M._lastMobileLog = M.state.mobileView;
      console.log('[Communication Centre mobile]', { mobileView: M.state.mobileView, width: global.innerWidth });
    }
    if (!drawer) return;
    if (mobile || tablet) {
      drawer.style.display = '';
      drawer.classList.toggle('collapsed', M.state.mobileView !== 'details');
      return;
    }
    const visible = M.state.detailsVisible !== false;
    drawer.classList.toggle('collapsed', !visible);
    drawer.style.display = visible ? '' : 'none';
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

  async function openDetail(id, options = {}) {
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
      const [messagesResult, participantsResult, reactionsResult, readReceiptsResult, actionItemsResult] = await Promise.all([
        client.from('communication_centre_messages').select('*').eq('conversation_id', id).order('created_at', { ascending: true }),
        client.from('communication_centre_participants').select('*').eq('conversation_id', id).order('participant_type', { ascending: true }).order('user_name', { ascending: true }),
        client.from('communication_centre_message_reactions').select('*').eq('conversation_id', id),
        client.from('communication_centre_read_receipts').select('*').eq('conversation_id', id),
        client.from('communication_centre_action_items').select('*').eq('conversation_id', id).order('created_at', { ascending: false })
      ]);
      if (messagesResult.error) console.error('[Communication Centre] unable to load messages', messagesResult.error);
      if (participantsResult.error) console.error('[Communication Centre] unable to load participants', participantsResult.error);
      if (readReceiptsResult.error) console.warn('[Communication Centre] unable to load read receipts', readReceiptsResult.error);
      // The database/RLS already controls whether this row can be read.
      // Do not re-block here with frontend-only ID matching because profile/auth IDs can differ by deployment.
      const participantRows = participantsResult.data || [];
      M.state.messages = messagesResult.data || [];
      M.state.participants = participantRows;
      M.state.readReceipts = readReceiptsResult.data || [];
      M.state.actionItems = actionItemsResult.data || [];
      M.state.reactionsByMessage = (reactionsResult.data || []).reduce((acc, row) => {
        const k = String(row.message_id || '');
        if (!k) return acc;
        acc[k] = acc[k] || [];
        acc[k].push(row);
        return acc;
      }, {});
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

  function renderMessageReactions(messageId) {
    const rows = M.state.reactionsByMessage[String(messageId)] || [];
    const grouped = rows.reduce((acc, row) => {
      const key = row.reaction;
      acc[key] = acc[key] || { count: 0, users: [] };
      acc[key].count += 1;
      acc[key].users.push(row.user_name || row.user_id);
      return acc;
    }, {});
    const allowed = ['👍', '✅', '👀', '🙏', '🔥'];
    return `<div class="cc-reactions">${allowed.map(r => {
      const g = grouped[r];
      const count = g?.count || 0;
      const title = g?.users?.join(', ') || '';
      return `<button type="button" class="btn ghost sm cc-reaction-btn" data-cc-react="${escapeAttr(String(messageId))}" data-reaction="${escapeAttr(r)}" title="${escapeAttr(title)}">${r}${count ? ` ${count}` : ''}</button>`;
    }).join('')}</div>`;
  }


  function scheduleActiveRefresh(reason = 'change') {
    if (M._activeRefreshTimer) clearTimeout(M._activeRefreshTimer);
    M._activeRefreshTimer = setTimeout(async () => {
      if (!M.state.active?.id) return;
      try {
        await openDetail(M.state.active.id, { silent: true, keepScroll: true });
      } catch (error) {
        console.warn('[Communication Centre] active refresh failed', reason, error);
      }
    }, 350);
  }

  function scheduleListRefresh(reason = 'change') {
    if (M._listRefreshTimer) clearTimeout(M._listRefreshTimer);
    M._listRefreshTimer = setTimeout(async () => {
      try { await refresh(); } catch (error) { console.warn('[Communication Centre] list refresh failed', reason, error); }
    }, 600);
  }

  function setupRealtimeAutoUpdate() {
    const client = db();
    if (M._realtimeSetup) return;
    M._realtimeSetup = true;

    try {
      if (client?.removeChannel && M._realtimeChannel) client.removeChannel(M._realtimeChannel);
    } catch (_error) {}

    try {
      if (client?.channel) {
        const channel = client.channel('communication-centre-live-updates');
        const onAnyChange = (payload) => {
          const row = payload?.new || payload?.old || {};
          const conversationId = row.conversation_id || row.id;
          if (M.state.active?.id && String(conversationId || '') === String(M.state.active.id)) {
            scheduleActiveRefresh(payload?.table || 'realtime');
          }
          scheduleListRefresh(payload?.table || 'realtime');
        };
        ['communication_centre_messages','communication_centre_read_receipts','communication_centre_message_reactions','communication_centre_conversations','communication_centre_action_items'].forEach(table => {
          channel.on('postgres_changes', { event: '*', schema: 'public', table }, onAnyChange);
        });
        channel.subscribe(status => {
          if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
            console.warn('[Communication Centre] realtime status', status);
          }
        });
        M._realtimeChannel = channel;
      }
    } catch (error) {
      console.warn('[Communication Centre] realtime setup failed; polling fallback remains active', error);
    }

    if (M._activePollingTimer) clearInterval(M._activePollingTimer);
    M._activePollingTimer = setInterval(() => {
      if (document.hidden) return;
      if (M.state.active?.id) scheduleActiveRefresh('poll');
    }, 4500);

    if (M._listPollingTimer) clearInterval(M._listPollingTimer);
    M._listPollingTimer = setInterval(() => {
      if (document.hidden) return;
      scheduleListRefresh('poll');
    }, 12000);
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
  function renderDrawer(options = {}) {
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
      const detailsLabel = (isMobileViewport() || isTabletViewport()) ? 'Details' : (M.state.detailsVisible === false ? 'Show details' : 'Hide details');
      if (header) header.innerHTML = `${mobileBack}<div class="cc-chat-heading"><h3>${escapeHtml((conversation.conversation_no || '') + ' ' + (conversation.title || ''))}</h3><div class="muted">${escapeHtml(conversation.category || 'General')} • ${escapeHtml(conversation.priority || 'Normal')} • ${escapeHtml(conversation.status || 'Open')}${relatedLabel ? ` • ${escapeHtml(relatedLabel)}` : ''}</div></div><button id="communicationCentreOpenDetails" class="btn ghost sm" type="button">${detailsLabel}</button>`;
    if (meta) meta.textContent = `${conversation.status || 'Open'} • ${conversation.priority || 'Normal'} • ${conversation.category || 'General'}`;
    if (participants) {
      const participantRows = M.state.participants || [];
      participants.innerHTML = `
        <div class="cc-details-section cc-participants-section">
          <div class="cc-section-title-row"><strong>Participants</strong><span class="chip">${escapeHtml(String(participantRows.length || 0))}</span></div>
          <div class="cc-participant-list">
            ${participantRows.length ? participantRows.map(participant => {
              const name = participant.user_name || participant.full_name || participant.email || participant.user_id || 'User';
              const role = participant.role_key || participant.user_role || participant.role || '';
              const type = participant.participant_type || 'participant';
              return `
                <div class="cc-participant-card">
                  <div class="cc-participant-avatar">${escapeHtml(String(name).split(/\s+/).slice(0,2).map(x => x[0] || '').join('').toUpperCase() || 'U')}</div>
                  <div class="cc-participant-info">
                    <strong>${escapeHtml(name)}</strong>
                    <span>${escapeHtml(type)}${role ? ` • ${escapeHtml(role)}` : ''}</span>
                  </div>
                </div>
              `;
            }).join('') : '<div class="muted">No participants found.</div>'}
          </div>
        </div>
      `;
    }
    if (messages) {
      const wasNearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 80;
      messages.innerHTML = M.state.messages.length ? M.state.messages.map(message => {
        const isMine = isMessageMine(message);
        const muted = message.is_system_message ? 'opacity:.72;' : '';
        if (message.is_system_message) {
          return `
            <div class="cc-system-message">${escapeHtml(message.message_body || message.body || 'System update')}</div>
          `;
        }
        const senderName = escapeHtml(message.sender_name || message.created_by_name || 'System');
        const initials = escapeHtml((message.sender_name || message.created_by_name || 'U').split(/\s+/).slice(0,2).map(x => x[0] || '').join('').toUpperCase());
        return `
          <div class="cc-message-row ${isMine ? 'mine' : 'incoming'}" style="${muted}">
            ${isMine ? '' : `<div class="cc-avatar">${initials}</div>`}
            <div class="cc-bubble">
              <div class="cc-message-meta"><span class="cc-sender">${senderName}</span><span class="cc-sep">•</span><span>${message.created_at ? escapeHtml(new Date(message.created_at).toLocaleString()) : ''}</span>${message.edited_at ? '<span class="cc-sep">•</span><span>edited</span>' : ''}</div>
              <div class="cc-message-body">${message.is_deleted ? 'This message was deleted.' : escapeHtml(message.message_body || message.body || '')}</div>
              ${renderMessageDeliveryStatus(message, isMine)}
              ${!message.is_deleted ? `<div class="cc-message-actions"><button class="btn ghost sm" data-cc-reply-message="${escapeAttr(message.id)}" type="button">Reply</button>${isMine ? `<button class="btn ghost sm" data-cc-edit-message="${escapeAttr(message.id)}" type="button">Edit</button><button class="btn ghost sm" data-cc-delete-message="${escapeAttr(message.id)}" type="button">Delete message</button>` : ''}</div>` : ''}
              ${renderMessageReactions(message.id)}
            </div>
            ${isMine ? `<div class="cc-avatar mine">${initials}</div>` : ''}
          </div>
        `;
      }).join('') : '<div class="muted" style="padding:20px;text-align:center;">Select a conversation to view messages.</div>';
      if (!options.keepScroll || wasNearBottom) messages.scrollTop = messages.scrollHeight;
    }
    if (replyWrap) replyWrap.style.display = (conversation.status !== 'Closed' && can('reply')) ? '' : 'none';
    if (closedMsg) closedMsg.style.display = conversation.status === 'Closed' ? '' : 'none';
    renderReplyTargetPreview();
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
      actionWrap.className = 'cc-details-content';
      if (header) header.appendChild(actionWrap);
    }
    actionWrap.className = 'cc-details-content';
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
    const actionItems = M.state.actionItems || [];
    const openActionItems = actionItems.filter(x => (x.status || 'open') === 'open');
    const formatDate = value => value ? new Date(value).toLocaleString() : '—';
    actionWrap.innerHTML = `
      <div class="cc-details-section">
        <div class="cc-section-title-row"><strong>Conversation Info</strong><span class="chip cc-status-chip">${escapeHtml(conversation.status || 'Open')}</span></div>
        <div class="cc-detail-grid">
          <div><span>Conversation</span><strong>${escapeHtml(conversation.conversation_no || '—')}</strong></div>
          <div><span>Priority</span><strong>${escapeHtml(conversation.priority || 'Normal')}</strong></div>
          <div><span>Category</span><strong>${escapeHtml(conversation.category || 'General')}</strong></div>
          <div><span>Created by</span><strong>${escapeHtml(conversation.created_by_name || 'Unknown')}</strong></div>
          <div><span>Created at</span><strong>${escapeHtml(formatDate(conversation.created_at))}</strong></div>
          <div><span>Updated at</span><strong>${escapeHtml(formatDate(conversation.updated_at || conversation.last_message_at || conversation.created_at))}</strong></div>
        </div>
      </div>
      <div class="cc-details-section">
        <strong>Assignment</strong>
        <div class="cc-detail-grid">
          <div><span>Assigned role</span><strong>${escapeHtml(conversation.assigned_role || '—')}</strong></div>
          <div><span>Participants</span><strong>${escapeHtml(String(M.state.participants.length || 0))}</strong></div>
          <div><span>Pinned</span><strong>${conversation.is_pinned ? 'Yes' : 'No'}</strong></div>
          <div><span>Archived</span><strong>${conversation.is_archived ? 'Yes' : 'No'}</strong></div>
          <div><span>Escalated</span><strong>${conversation.is_escalated ? 'Yes' : 'No'}</strong></div>
          <div><span>Follow-up</span><strong>${escapeHtml(formatDate(conversation.follow_up_at))}</strong></div>
        </div>
      </div>
      <div class="cc-details-section">
        <strong>Related Record</strong>
        <div class="cc-detail-grid">
          <div><span>Module</span><strong>${escapeHtml(conversation.related_module || '—')}</strong></div>
          <div><span>Record ID</span><strong>${escapeHtml(conversation.related_record_id || '—')}</strong></div>
        </div>
        ${relatedButton ? `<div class="actions cc-section-actions">${relatedButton}</div>` : ''}
      </div>
      <div class="cc-details-section">
        <strong>Actions</strong>
        <div class="actions cc-section-actions">${pinButton}${archiveButton}${closeButton}${reopenButton}${copyLinkButton}${deleteButton}<button id="communicationCentreEscalateBtn" class="btn ghost sm" type="button">${conversation.is_escalated ? 'Clear escalation' : 'Mark as escalated'}</button></div>
      </div>
      <div class="cc-details-section">
        <strong>Follow-up</strong>
        <input id="communicationCentreFollowUpAt" class="input" type="datetime-local" value="${conversation.follow_up_at ? escapeAttr(new Date(conversation.follow_up_at).toISOString().slice(0,16)) : ''}" />
        <div class="actions cc-section-actions"><button id="communicationCentreFollowUpSaveBtn" class="btn ghost sm" type="button">Save follow-up</button><button id="communicationCentreFollowUpClearBtn" class="btn ghost sm" type="button">Clear</button></div>
      </div>
      <div class="cc-details-section">
        <div class="cc-section-title-row"><strong>Action Items</strong><span class="chip">Open: ${escapeHtml(String(openActionItems.length))}</span></div>
        <div class="cc-action-item-list">${actionItems.length ? actionItems.slice(0,8).map(item => `<div class="cc-action-item-row"><span>${escapeHtml(item.title || 'Action item')}</span><small>${escapeHtml(item.status || 'open')}</small></div>`).join('') : '<div class="muted">No action items yet.</div>'}</div>
        <div class="actions cc-section-actions"><input id="communicationCentreActionItemTitle" class="input" placeholder="Action item title" /><button id="communicationCentreActionItemAddBtn" class="btn ghost sm" type="button">Add</button></div>
      </div>`;
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
    $('communicationCentreEscalateBtn')?.addEventListener('click', toggleEscalation);
    $('communicationCentreFollowUpSaveBtn')?.addEventListener('click', saveFollowUp);
    $('communicationCentreFollowUpClearBtn')?.addEventListener('click', clearFollowUp);
    $('communicationCentreActionItemAddBtn')?.addEventListener('click', addActionItem);
  }
  async function toggleEscalation(){ const c=M.state.active; if(!c) return; try{const v=!c.is_escalated; const {error}=await db().from('communication_centre_conversations').update({is_escalated:v,escalated_at:v?new Date().toISOString():null,escalated_by:v?(global.Session?.user?.()?.id||null):null}).eq('id',c.id); if(error) throw error; c.is_escalated=v; renderDrawer(); await refresh();}catch(e){console.error(e);showFriendlyError('Unable to update conversation. Please try again.');}}
  async function saveFollowUp(){ const c=M.state.active; if(!c) return; const val=$('communicationCentreFollowUpAt')?.value||null; try{const {error}=await db().from('communication_centre_conversations').update({follow_up_at:val?new Date(val).toISOString():null,follow_up_by:global.Session?.user?.()?.id||null,follow_up_status:'pending'}).eq('id',c.id); if(error) throw error; await openDetail(c.id); await refresh();}catch(e){console.error(e);showFriendlyError('Unable to set follow-up. Please try again.');}}
  async function clearFollowUp(){ const c=M.state.active; if(!c) return; try{const {error}=await db().from('communication_centre_conversations').update({follow_up_at:null,follow_up_by:null,follow_up_status:'pending'}).eq('id',c.id); if(error) throw error; await openDetail(c.id); await refresh();}catch(e){console.error(e);showFriendlyError('Unable to set follow-up. Please try again.');}}
  async function addActionItem(){ const c=M.state.active; const title=normalizeText($('communicationCentreActionItemTitle')?.value); if(!c||!title) return; try{const {error}=await db().from('communication_centre_action_items').insert({conversation_id:c.id,title,created_by:global.Session?.user?.()?.id||null,status:'open'}); if(error) throw error; await openDetail(c.id);}catch(e){console.error(e);showFriendlyError('Unable to update action item. Please try again.');}}
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
    bindOnce($('communicationCentreMessages'), 'MessageActions', async event => {
      const replyBtnEl = event.target.closest('[data-cc-reply-message]');
      const editBtnEl = event.target.closest('[data-cc-edit-message]');
      const deleteBtnEl = event.target.closest('[data-cc-delete-message]');
      const reactBtnEl = event.target.closest('[data-cc-react]');
      const conversation = M.state.active;
      if (!conversation?.id) return;
      if (replyBtnEl) {
        M.state.replyToMessage = M.state.messages.find(m => String(m.id) === String(replyBtnEl.getAttribute('data-cc-reply-message'))) || null;
        renderReplyTargetPreview();
        $('communicationCentreReplyInput')?.focus();
        showFriendlySuccess('Reply target selected.');
      } else if (editBtnEl) {
        const id = editBtnEl.getAttribute('data-cc-edit-message');
        const row = M.state.messages.find(m => String(m.id) === String(id));
        if (!row) { showFriendlyError('Unable to update message. Please try again.'); return; }
        M.state.editingMessage = row;
        M.state.replyToMessage = null;
        const input = $('communicationCentreReplyInput');
        if (input) {
          input.value = row.message_body || row.body || '';
          input.focus();
        }
        renderReplyTargetPreview();
      } else if (deleteBtnEl) {
        const id = deleteBtnEl.getAttribute('data-cc-delete-message');
        try {
          const res = await db().rpc('soft_delete_communication_centre_message', { p_message_id: id });
          if (res.error) throw res.error;
          await openDetail(conversation.id);
          scheduleListRefresh('message-delete');
        } catch (error) {
          console.error('[Communication Centre] delete message failed', error);
          showFriendlyError('Unable to delete message. Please try again.');
        }
      } else if (reactBtnEl) {
        const messageId = reactBtnEl.getAttribute('data-cc-react');
        const reaction = reactBtnEl.getAttribute('data-reaction');
        try {
          const res = await db().rpc('toggle_communication_centre_reaction', { p_message_id: messageId, p_reaction: reaction });
          if (res.error) throw res.error;
        } catch (rpcError) {
          console.warn('[Communication Centre] reaction RPC failed, trying direct fallback', rpcError);
          const uid = global.Session?.user?.()?.id || global.Session?.currentUser?.()?.id || '';
          const existing = (M.state.reactionsByMessage[String(messageId)] || []).find(x => String(x.user_id || '') === String(uid) && x.reaction === reaction);
          const query = db().from('communication_centre_message_reactions');
          const res = existing ? await query.delete().eq('id', existing.id) : await query.insert({ message_id: messageId, conversation_id: conversation.id, user_id: uid, reaction });
          if (res.error) { console.error(res.error); showFriendlyError('Unable to add reaction. Please try again.'); return; }
        }
        await openDetail(conversation.id);
      }
    }, { once: false });
    bindOnce($('communicationCentreDrawerClose'), 'DrawerClose', () => {
      if (isMobileViewport() || isTabletViewport()) setMobileView('chat');
      else setDetailsVisible(false);
    });
    document.addEventListener('click', (e)=>{
      if (e.target?.id==='communicationCentreOpenDetails') {
        if (isMobileViewport() || isTabletViewport()) setMobileView('details');
        else setDetailsVisible(M.state.detailsVisible === false);
      }
      if (e.target?.id === 'communicationCentreBackToList') setMobileView('list');
      if (e.target?.id === 'communicationCentreBackToChat') setMobileView('chat');
      if (e.target?.id === 'communicationCentreCancelReplyTarget') { M.state.replyToMessage = null; M.state.editingMessage = null; const input = $('communicationCentreReplyInput'); if (input) input.value = ''; renderReplyTargetPreview(); }
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
        const editing = M.state.editingMessage;
        if (replyBtn) { replyBtn.disabled = true; replyBtn.textContent = editing ? 'Saving...' : 'Sending...'; }
        if (editing?.id) {
          const { error } = await db().rpc('edit_communication_centre_message', {
            p_message_id: editing.id,
            p_message_body: body
          });
          if (error) throw error;
          if (input) input.value = '';
          M.state.editingMessage = null;
          M.state.replyToMessage = null;
          if (replyError) { replyError.textContent=''; replyError.style.display='none'; }
          await openDetail(conversation.id);
          scheduleListRefresh('message-edit');
          showFriendlySuccess('Message updated.');
          if (replyBtn) { replyBtn.disabled = false; replyBtn.textContent = 'Send'; }
          return;
        }
        const msgType = $('communicationCentreReplyType')?.value || 'message';
        const { error } = await db().rpc('add_communication_centre_reply', {
          p_conversation_id: conversation.id,
          p_message_body: body,
          p_reply_to_message_id: M.state.replyToMessage?.id || null,
          p_message_type: msgType
        });
        if (error) throw error;
        const insertedBody = body;
        const tags = [...insertedBody.matchAll(/@([a-z0-9_]+)/gi)].map(m => m[1].toLowerCase());
        if (tags.length) console.log('[Communication Centre] mentions detected', tags);
        if (input) input.value = '';
        M.state.replyToMessage = null;
        if (replyError) { replyError.textContent=''; replyError.style.display='none'; }
        await openDetail(conversation.id);
        await refresh();
        scheduleActiveRefresh('reply-sent');
        showFriendlySuccess('Reply sent successfully.');
        if (replyBtn) { replyBtn.disabled = false; replyBtn.textContent = 'Send'; }
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
        if (replyBtn) { replyBtn.disabled = false; replyBtn.textContent = 'Send'; }
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
    setupRealtimeAutoUpdate();
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
