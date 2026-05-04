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
      loadingRoles: false
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

    // Delete is the only action that must be explicit. Manage never grants delete.
    if (normalizedAction === 'delete') {
      return resources.some(resource => permissionHas(resource, 'delete', { directDeleteOnly: true }));
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
    const hasConfiguredPermission = resources.some(resource =>
      candidates.some(candidate => permissionHas(resource, candidate))
    );

    // Final business rule for this module: every authenticated app role with the tab can perform
    // all normal Communication Centre actions. Database/RLS still protects real visibility.
    return hasConfiguredPermission || true;
  };
  const canOpenConversation = () => can('open');
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
      .order('last_message_at', { ascending: false, nullsFirst: false })
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
        showFriendlyError('Unable to load conversation. Please refresh and try again.');
        return;
      }
      const { data, error } = await client
        .from('communication_centre_conversations')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) {
        console.error('[Communication Centre] open detail failed', error || new Error('Conversation not found'));
        showFriendlyError('Unable to load conversation. Please refresh and try again.');
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
      } catch (errorMarkRead) {
        console.error('[Communication Centre] mark read failed', errorMarkRead);
      }
    } catch (error) {
      console.error('[Communication Centre] open detail failed', error);
      showFriendlyError('Unable to load conversation. Please refresh and try again.');
    }
  }


  async function notifyParticipants(title, body, conversationId, excludeUserId) {
    try {
      const client = db();
      if (!client) return;
      const { data, error } = await client
        .from('communication_centre_participants')
        .select('user_id')
        .eq('conversation_id', conversationId);
      if (error) throw error;
      const ids = [...new Set((data || [])
        .map(item => item.user_id)
        .filter(Boolean)
        .filter(userId => String(userId) !== String(excludeUserId)))];
      if (!ids.length) return;
      const url = `/#communication_centre?conversation_id=${encodeURIComponent(conversationId)}`;
      if (global.NotificationService?.sendBusinessNotification) {
        await global.NotificationService.sendBusinessNotification({
          resource: 'communication_centre',
          action: 'update',
          eventKey: 'communication_centre.update',
          recordId: conversationId,
          title,
          body,
          targetUsers: ids,
          url,
          metadata: { conversation_id: conversationId },
          channels: ['in_app', 'push']
        });
        return;
      }
      await global.Api?.sendBusinessPwaPush?.({
        resource: 'communication_centre',
        action: 'update',
        recordId: conversationId,
        title,
        body,
        userIds: ids,
        url,
        data: { conversation_id: conversationId }
      });
    } catch (error) {
      console.warn('[Communication Centre] notify failed', error);
    }
  }


  function render() {
    const listEl = $('communicationCentreList');
    if (!listEl) return;
    const activeId = M.state.active?.id;
    const rows = (M.state.rows || []).filter(row => {
      const q = M.state.filters.quick || 'all';
      if (q === 'open') return row.status !== 'Closed';
      if (q === 'closed') return row.status === 'Closed';
      if (q === 'unread') return Number(row.unread_count || 0) > 0;
      return true;
    });
    listEl.innerHTML = rows.map(row => `<button class="cc-item ${activeId===row.id?'active':''} ${Number(row.unread_count||0)>0?'unread':''}" data-cc-open="${escapeAttr(row.id)}" type="button"><div><small>${escapeHtml(row.conversation_no||'')}</small><strong>${escapeHtml(row.title||'Untitled')}</strong><p>${escapeHtml(row.last_message_preview||'No messages yet')}</p></div><div><span>${escapeHtml(relTime(row.updated_at||row.last_message_at))}</span><span class="chip">${escapeHtml(row.status||'Open')}</span>${row.priority?`<span class="chip">${escapeHtml(row.priority)}</span>`:''}${Number(row.unread_count||0)>0?`<span class="chip">${escapeHtml(String(row.unread_count))}</span>`:''}</div></button>`).join('') || '<div class="muted" style="padding:16px;">No conversations yet.</div>';
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
    if (header) header.innerHTML = `<div><h3>${escapeHtml((conversation.conversation_no || '') + ' ' + (conversation.title || ''))}</h3><div class="muted">${escapeHtml(conversation.category || 'General')} • ${escapeHtml(conversation.priority || 'Normal')} • ${escapeHtml(conversation.status || 'Open')}</div></div><button id="communicationCentreOpenDetails" class="btn ghost sm" type="button">Details</button>`;
    if (meta) meta.textContent = `${conversation.status || 'Open'} • ${conversation.priority || 'Normal'} • ${conversation.category || 'General'}`;
    if (participants) {
      participants.innerHTML = M.state.participants.map(participant => `
        <span class="chip">${escapeHtml(participant.participant_type || 'participant')}: ${escapeHtml(participant.user_name || participant.user_id || 'User')}</span>
      `).join(' ');
    }
    const currentUserId = global.Session?.user?.()?.id || global.Session?.currentUser?.()?.id || '';
    if (messages) {
      messages.innerHTML = M.state.messages.length ? M.state.messages.map(message => {
        const isMine = String(message.sender_id || '') === String(currentUserId || '');
        const muted = message.is_system_message ? 'opacity:.72;' : '';
        return `
          <div class="card" style="padding:8px;margin-bottom:6px;${isMine ? 'background:#f1f7ff;' : ''}${muted}">
            <div class="muted">${escapeHtml(message.sender_name || 'System')} • ${message.created_at ? escapeHtml(new Date(message.created_at).toLocaleString()) : ''}</div>
            <div>${escapeHtml(message.message_body || message.body || '')}</div>
          </div>
        `;
      }).join('') : '<div class="muted" style="padding:20px;text-align:center;">Select a conversation to start messaging.</div>';
      messages.scrollTop = messages.scrollHeight;
    }
    if (replyWrap) replyWrap.style.display = (conversation.status !== 'Closed' && can('reply')) ? '' : 'none';
    if (closedMsg) closedMsg.style.display = conversation.status === 'Closed' ? '' : 'none';
    renderDrawerActions();
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
    const closeButton = conversation.status !== 'Closed' && can('close')
      ? '<button id="communicationCentreCloseConversationBtn" class="btn ghost sm" type="button">Close Conversation</button>'
      : '';
    const reopenButton = conversation.status === 'Closed' && can('reopen')
      ? '<button id="communicationCentreReopenConversationBtn" class="btn ghost sm" type="button">Reopen Conversation</button>'
      : '';
    const deleteButton = canDeleteConversation()
      ? '<button id="communicationCentreDeleteConversationBtn" class="btn danger sm" type="button">Delete Conversation</button>'
      : '';
    actionWrap.innerHTML = `${closeButton}${reopenButton}${deleteButton}`;
    $('communicationCentreCloseConversationBtn')?.addEventListener('click', closeActiveConversation);
    $('communicationCentreReopenConversationBtn')?.addEventListener('click', reopenActiveConversation);
    $('communicationCentreDeleteConversationBtn')?.addEventListener('click', deleteActiveConversation);
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
        notifyParticipants(
          'New Communication Centre conversation',
          `${conversation.created_by_name || global.Session?.displayName?.() || 'A user'} created “${conversation.title || title}”`,
          conversation.id,
          conversation.created_by
        );
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
    if (button) button.style.display = can('create') ? '' : 'none';
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
      const tabs = [['all','All'],['open','Open'],['closed','Closed'],['unread','Unread']];
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
    });
    bindOnce($('communicationCentreDrawerClose'), 'DrawerClose', () => $('communicationCentreDrawer')?.classList.toggle('collapsed', true));
    document.addEventListener('click', (e)=>{ if (e.target?.id==='communicationCentreOpenDetails') $('communicationCentreDrawer')?.classList.remove('collapsed'); });
    const replyBtn = $('communicationCentreReplyBtn');
    if (replyBtn) replyBtn.style.display = can('reply') ? '' : 'none';
    const replyInput = $('communicationCentreReplyInput');
    replyInput?.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); replyBtn?.click(); }});
    bindOnce(replyBtn, 'Reply', async () => {
      const conversation = M.state.active;
      const input = $('communicationCentreReplyInput');
      const body = normalizeText(input?.value);
      if (!conversation?.id) return showFriendlyError('Open a conversation first.');
      if (!body) return showFriendlyError('Message is required.');
      try {
        const { error } = await db().rpc('add_communication_centre_reply', {
          p_conversation_id: conversation.id,
          p_message_body: body
        });
        if (error) throw error;
        if (input) input.value = '';
        await openDetail(conversation.id);
        await refresh();
        showFriendlySuccess('Reply sent successfully.');
        notifyParticipants(
          'New Communication Centre reply',
          `${global.Session?.displayName?.() || 'A user'} replied to “${conversation.title}”`,
          conversation.id,
          global.Session?.user?.()?.id
        );
      } catch (error) {
        console.error('[Communication Centre] send reply failed', error);
        showFriendlyError('Unable to send reply. Please try again.');
      }
    });
    await refresh();
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
