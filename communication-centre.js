(function initCommunicationCentre(global) {
  const M = {
    state: {
      rows: [],
      count: 0,
      page: 1,
      limit: 25,
      filters: {},
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
  const toast = message => (global.UI?.toast ? global.UI.toast(message) : alert(message));
  const db = () => global.SupabaseClient?.getClient?.();
  const can = action => Boolean(
    global.Permissions?.can?.('communication_centre', action) ||
    global.Permissions?.can?.('communicationCentre', action) ||
    global.Permissions?.can?.('communication_centre', 'manage') ||
    global.Permissions?.can?.('communicationCentre', 'manage')
  );
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
    const client = db();
    if (!client) return toast('Supabase client is not available.');
    const { data, error } = await client
      .from('communication_centre_conversations')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) {
      toast('You do not have access to this conversation.');
      return;
    }
    M.state.active = data;
    const [messagesResult, participantsResult] = await Promise.all([
      client.from('communication_centre_messages').select('*').eq('conversation_id', id).order('created_at', { ascending: true }),
      client.from('communication_centre_participants').select('*').eq('conversation_id', id).order('participant_type', { ascending: true }).order('user_name', { ascending: true })
    ]);
    if (messagesResult.error) console.warn('[Communication Centre] unable to load messages', messagesResult.error);
    if (participantsResult.error) console.warn('[Communication Centre] unable to load participants', participantsResult.error);
    M.state.messages = messagesResult.data || [];
    M.state.participants = participantsResult.data || [];
    renderDrawer();
    client.rpc('mark_communication_centre_read', { p_conversation_id: id }).then(() => {}).catch(() => {});
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
    const tbody = $('communicationCentreTbody');
    if (!tbody) return;
    tbody.innerHTML = M.state.rows.map(row => `
      <tr>
        <td>${escapeHtml(row.conversation_no || '—')}</td>
        <td>${escapeHtml(row.title || '')}</td>
        <td>${escapeHtml(row.category || '—')}</td>
        <td>${escapeHtml(row.priority || '—')}</td>
        <td>${escapeHtml(row.status || '—')}</td>
        <td>${escapeHtml(row.created_by_name || '—')}</td>
        <td>${escapeHtml(row.assigned_role || '—')}</td>
        <td>${escapeHtml(row.last_message_preview || '—')}</td>
        <td>${row.updated_at ? escapeHtml(new Date(row.updated_at).toLocaleString()) : '—'}</td>
        <td><button class="btn ghost sm" type="button" data-cc-open="${escapeAttr(row.id)}">Open</button></td>
      </tr>
    `).join('') || '<tr><td colspan="10" class="muted" style="text-align:center;">No Communication Centre conversations found.</td></tr>';
    const pageInfo = $('communicationCentrePageInfo');
    if (pageInfo) pageInfo.textContent = `Page ${M.state.page} • ${M.state.count} total`;
  }

  function renderDrawer() {
    const drawer = $('communicationCentreDrawer');
    if (!drawer || !M.state.active) return;
    const conversation = M.state.active;
    drawer.style.display = 'block';
    const title = $('communicationCentreDrawerTitle');
    const meta = $('communicationCentreDrawerMeta');
    const participants = $('communicationCentreParticipants');
    const messages = $('communicationCentreMessages');
    const replyWrap = $('communicationCentreReplyWrap');
    const closedMsg = $('communicationCentreClosedMsg');
    if (title) title.textContent = `${conversation.conversation_no || ''} ${conversation.title || ''}`.trim();
    if (meta) meta.textContent = `${conversation.status || 'Open'} • ${conversation.priority || 'Normal'} • ${conversation.category || 'General'}`;
    if (participants) {
      participants.innerHTML = M.state.participants.map(participant => `
        <span class="chip">${escapeHtml(participant.participant_type || 'participant')}: ${escapeHtml(participant.user_name || participant.user_id || 'User')}</span>
      `).join(' ');
    }
    const currentUserId = global.Session?.user?.()?.id || global.Session?.currentUser?.()?.id || '';
    if (messages) {
      messages.innerHTML = M.state.messages.map(message => {
        const isMine = String(message.sender_id || '') === String(currentUserId || '');
        const muted = message.is_system_message ? 'opacity:.72;' : '';
        return `
          <div class="card" style="padding:8px;margin-bottom:6px;${isMine ? 'background:#f1f7ff;' : ''}${muted}">
            <div class="muted">${escapeHtml(message.sender_name || 'System')} • ${message.created_at ? escapeHtml(new Date(message.created_at).toLocaleString()) : ''}</div>
            <div>${escapeHtml(message.message_body || message.body || '')}</div>
          </div>
        `;
      }).join('');
    }
    if (replyWrap) replyWrap.style.display = (can('reply') && conversation.status !== 'Closed') ? '' : 'none';
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
    actionWrap.innerHTML = `${closeButton}${reopenButton}`;
    $('communicationCentreCloseConversationBtn')?.addEventListener('click', closeActiveConversation);
    $('communicationCentreReopenConversationBtn')?.addEventListener('click', reopenActiveConversation);
  }

  async function refresh() {
    try {
      await list();
      render();
    } catch (error) {
      toast(`Unable to load Communication Centre: ${error.message || error}`);
    }
  }

  async function loadUsers(force = false) {
    if (M.state.loadingUsers) return M.state.users;
    if (M.state.users.length && !force) return M.state.users;
    M.state.loadingUsers = true;
    try {
      let rows = [];
      if (global.UserAdmin?.state?.rows?.length && !force) {
        rows = global.UserAdmin.state.rows;
      }
      if (!rows.length && global.Api?.requestCached) {
        try {
          const response = await global.Api.requestCached('users', 'list', {
            limit: 500,
            page: 1,
            sort_by: 'name',
            sort_dir: 'asc',
            summary_only: true
          }, { forceRefresh: force });
          rows = extractRows(response);
        } catch (error) {
          console.warn('[Communication Centre] Api users list failed, trying direct Supabase', error);
        }
      }
      if (!rows.length && db()) {
        const { data, error } = await db().from('users').select('*').limit(500);
        if (error) throw error;
        rows = data || [];
      }
      M.state.users = rows
        .map(row => ({ ...row, _id: idOf(row), _name: nameOf(row), _role: roleOf(row) }))
        .filter(row => row._id && isActiveRow(row))
        .sort((a, b) => a._name.localeCompare(b._name));
    } catch (error) {
      console.warn('[Communication Centre] unable to load users', error);
      M.state.users = [];
    } finally {
      M.state.loadingUsers = false;
    }
    return M.state.users;
  }

  async function loadRoles(force = false) {
    if (M.state.loadingRoles) return M.state.roles;
    if (M.state.roles.length && !force) return M.state.roles;
    M.state.loadingRoles = true;
    try {
      let rows = [];
      if (global.RolesAdmin?.ensureRolesLoaded) {
        try { rows = await global.RolesAdmin.ensureRolesLoaded(force); }
        catch (error) { console.warn('[Communication Centre] RolesAdmin roles load failed', error); }
      }
      if (!rows.length && global.Api?.listRoles) {
        try {
          const response = await global.Api.listRoles({ limit: 500, page: 1, summary_only: true, forceRefresh: force });
          rows = extractRows(response);
        } catch (error) {
          console.warn('[Communication Centre] Api roles list failed, trying direct Supabase', error);
        }
      }
      if (!rows.length && db()) {
        const { data, error } = await db().from('roles').select('*').limit(500);
        if (error) throw error;
        rows = data || [];
      }
      M.state.roles = rows
        .map(row => ({ ...row, _key: roleOf(row), _label: normalizeText(row.display_name || row.name || row.label || row.role_key || row.key || row.role) }))
        .filter(row => row._key && isActiveRow(row))
        .sort((a, b) => a._label.localeCompare(b._label));
    } catch (error) {
      console.warn('[Communication Centre] unable to load roles', error);
      M.state.roles = [];
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
    const [users, roles] = await Promise.all([loadUsers(), loadRoles()]);
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
      toast('You do not have permission to create Communication Centre conversations.');
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

    if (!title) return toast('Title is required.');
    if (!message) return toast('First message is required.');
    if (!assignedUserIds.length && !assignedRole) return toast('Select at least one assigned user or assigned role.');

    try {
      if (submit) {
        submit.disabled = true;
        submit.textContent = 'Creating…';
      }
      const client = db();
      if (!client) throw new Error('Supabase client is not available.');
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
      toast('Conversation created successfully.');
    } catch (error) {
      toast(`Unable to create conversation: ${error.message || error}`);
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
      toast('Conversation closed.');
    } catch (error) {
      toast(`Unable to close conversation: ${error.message || error}`);
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
      toast('Conversation reopened.');
    } catch (error) {
      toast(`Unable to reopen conversation: ${error.message || error}`);
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
    bindOnce($('communicationCentreRefreshBtn'), 'Refresh', refresh);
    $('communicationCentreSearch')?.addEventListener('input', event => {
      M.state.filters.search = event.target.value;
      M.state.page = 1;
      refresh();
    }, { once: false });
    ['Status', 'Priority', 'Category', 'AssignedRole', 'CreatedBy'].forEach(key => {
      const element = $(`communicationCentreFilter${key}`);
      bindOnce(element, `Filter${key}`, event => {
        const filterKey = key === 'AssignedRole' ? 'assigned_role' : key === 'CreatedBy' ? 'created_by_name' : key.toLowerCase();
        M.state.filters[filterKey] = event.target.value;
        M.state.page = 1;
        refresh();
      }, { once: false });
    });
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
    const tbody = $('communicationCentreTbody');
    bindOnce(tbody, 'OpenRow', event => {
      const button = event.target.closest('[data-cc-open]');
      if (button) openDetail(button.getAttribute('data-cc-open'));
    });
    bindOnce($('communicationCentreDrawerClose'), 'DrawerClose', () => {
      const drawer = $('communicationCentreDrawer');
      if (drawer) drawer.style.display = 'none';
    });
    bindOnce($('communicationCentreReplyBtn'), 'Reply', async () => {
      const conversation = M.state.active;
      const input = $('communicationCentreReplyInput');
      const body = normalizeText(input?.value);
      if (!conversation?.id) return toast('Open a conversation first.');
      if (!body) return toast('Message is required.');
      try {
        const { error } = await db().rpc('add_communication_centre_reply', {
          p_conversation_id: conversation.id,
          p_message_body: body
        });
        if (error) throw error;
        if (input) input.value = '';
        await openDetail(conversation.id);
        await refresh();
        toast('Reply sent.');
        notifyParticipants(
          'New Communication Centre reply',
          `${global.Session?.displayName?.() || 'A user'} replied to “${conversation.title}”`,
          conversation.id,
          global.Session?.user?.()?.id
        );
      } catch (error) {
        toast(`Unable to send reply: ${error.message || error}`);
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
