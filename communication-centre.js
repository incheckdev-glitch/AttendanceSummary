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
      relatedRecordOptions: [],
      relatedRecordLabels: {},
      relatedRecordLoading: false,
      mentionCandidates: [],
      replyToMessage: null,
      editingMessageId: null,
      editingMessageOriginal: null,
      composerType: 'message',
      loadingUsers: false,
      loadingRoles: false,
      mobileView: 'list',
      detailsVisible: true,
      exportingPdf: false
    },
    realtimeChannel: null,
    realtimeReady: false,
    realtimeStatus: 'idle',
    realtimeRefreshTimer: null,
    activeRefreshTimer: null,
    pollingTimer: null,
    readPollingTimer: null,
    lastRealtimeAt: null,
    activeConversationId: null,
    openedConversationIds: new Set(),
    userScrolledUpByConversation: new Map(),
    lastMessageCountByConversation: new Map()
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

  function currentRoleKey() {
    try {
      const P = global.Permissions;
      if (typeof P?.normalizeRole === 'function') return P.normalizeRole(global.Session?.role?.());
    } catch (_error) {}
    return String(global.Session?.role?.() || '').trim().toLowerCase().replace(/\s+/g, '_');
  }

  function hasDirectPermissionRow(action) {
    const P = global.Permissions;
    const rows = Array.isArray(P?.state?.rows) ? P.state.rows : [];
    const role = currentRoleKey();
    const wantedAction = String(action || '').trim().toLowerCase();
    if (!rows.length || !role || !wantedAction) return false;
    const resources = ['communication_centre', 'communicationcentre', 'communication-centre', 'communication_center'];
    return rows.some(row => {
      const rowRole = typeof P?.normalizeRole === 'function' ? P.normalizeRole(row.role_key) : String(row.role_key || '').trim().toLowerCase();
      const rowResource = String(row.resource || '').trim().toLowerCase();
      const rowAction = String(row.action || '').trim().toLowerCase();
      const active = row.is_active !== false && String(row.is_active ?? 'true').toLowerCase() !== 'false';
      const allowed = row.is_allowed !== false && String(row.is_allowed ?? 'true').toLowerCase() !== 'false';
      return rowRole === role && resources.includes(rowResource) && rowAction === wantedAction && active && allowed;
    });
  }

  async function ensurePermissionMatrixReady() {
    const P = global.Permissions;
    if (!P) return;
    try {
      const ready = () => (typeof P.isReady === 'function' ? P.isReady() : Boolean(P.state?.loaded || P.state?.rows?.length));
      if (ready()) return;
      if (typeof P.loadMatrix === 'function') await P.loadMatrix(false);
      for (let i = 0; i < 12 && !ready(); i += 1) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    } catch (error) {
      console.warn('[Communication Centre] permission matrix load failed', error);
    }
  }

  function hasManageAccessSync() {
    if (!isAuthenticated()) return false;
    if (M.state.accessGranted) return true;
    if (hasDirectPermissionRow('manage')) return true;
    return ['communication_centre', 'communicationcentre', 'communication-centre'].some(resource => permissionHas(resource, 'manage'));
  }

  async function checkBackendCommunicationCentreAccess() {
    try {
      const client = db();
      if (!client?.rpc) return false;
      const { data, error } = await client.rpc('cc_has_permission', { p_action: 'manage' });
      if (error) throw error;
      return data === true;
    } catch (error) {
      console.warn('[Communication Centre] backend access check failed', error);
      return false;
    }
  }

  async function ensureCommunicationCentreAccess() {
    if (!isAuthenticated()) return false;
    if (hasManageAccessSync()) {
      M.state.accessGranted = true;
      return true;
    }
    await ensurePermissionMatrixReady();
    if (hasManageAccessSync()) {
      M.state.accessGranted = true;
      return true;
    }
    const backendAllowed = await checkBackendCommunicationCentreAccess();
    M.state.accessGranted = backendAllowed;
    return backendAllowed;
  }

  const can = action => {
    const normalizedAction = String(action || '').trim().toLowerCase();
    if (!normalizedAction || !isAuthenticated()) return false;

    const resources = ['communication_centre', 'communicationcentre', 'communication-centre'];

    // Final Communication Centre access rule:
    // communication_centre:manage is the ONLY normal access permission.
    // Do not fall back to "authenticated user" and do not use view/list/get for module access.
    // Delete remains separate and is never granted by manage.
    if (normalizedAction === 'delete') {
      return hasDirectPermissionRow('delete') || resources.some(resource => permissionHas(resource, 'delete', { directDeleteOnly: true }));
    }

    const normalActions = ['view', 'list', 'get', 'open', 'create', 'reply', 'update', 'close', 'reopen', 'manage', 'pin', 'archive', 'assign', 'follow_up', 'action_item'];
    if (normalActions.includes(normalizedAction)) {
      return hasManageAccessSync();
    }

    return hasDirectPermissionRow(normalizedAction) || resources.some(resource => permissionHas(resource, normalizedAction));
  };
  const canOpenConversation = () => can('open');
  const canManageConversation = () => can('manage');
  const canDeleteConversation = () => can('delete');
  function hasCommunicationCentreAccess() {
    return hasManageAccessSync();
  }
  function renderNoAccessState() {
    const container = $('communicationCentreView');
    if (!container) return;
    container.innerHTML = `
      <div class="card communication-centre-empty-state" style="max-width:720px;margin:32px auto;padding:24px;text-align:center;">
        <h2 style="margin:0 0 8px;">Communication Centre</h2>
        <p class="muted" style="margin:0;">You do not have access to Communication Centre.</p>
      </div>
    `;
  }
  const escapeHtml = value => {
    if (global.U?.escapeHtml) return global.U.escapeHtml(value);
    return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  };
  const escapeAttr = value => {
    if (global.U?.escapeAttr) return global.U.escapeAttr(value);
    return escapeHtml(value).replace(/'/g, '&#39;');
  };
  const normalizeText = value => String(value ?? '').trim();

  function firstNonEmpty(...values) {
    for (const value of values) {
      const normalized = normalizeText(value);
      if (normalized) return normalized;
    }
    return '';
  }

  function formatCommunicationExportDate(value) {
    if (!value) return '-';
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleString();
    } catch (_error) {
      return String(value);
    }
  }

  function formatCommunicationExportDateStamp(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const yyyy = safeDate.getFullYear();
    const mm = String(safeDate.getMonth() + 1).padStart(2, '0');
    const dd = String(safeDate.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }

  function sanitizeCommunicationExportText(value) {
    const withLineBreaks = String(value || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n')
      .replace(/<\/div\s*>/gi, '\n')
      .replace(/<\/li\s*>/gi, '\n')
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ');
    return withLineBreaks
      .split(/\r?\n/)
      .map(line => line.replace(/[ \t]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function preserveMessageLineBreaks(value) {
    const sanitized = sanitizeCommunicationExportText(value);
    if (!sanitized) return '<span class="muted">No message content</span>';
    return sanitized.split('\n').map(line => escapeHtml(line)).join('<br>');
  }

  function safeCommunicationFilePart(value) {
    return String(value || 'conversation').trim().replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'conversation';
  }

  function getCommunicationCurrentUserProfileFallback() {
    const sessionState = global.Session?.state || {};
    const authContext = typeof global.Session?.authContext === 'function' ? global.Session.authContext() : {};
    const candidates = [sessionState.profile, authContext.profile, sessionState.user, authContext.user, global.Session?.user?.(), global.Session?.currentUser?.()].filter(Boolean);
    const merged = Object.assign({}, ...candidates.reverse());
    return {
      id: firstNonEmpty(merged.id, merged.user_id, merged.profile_id, sessionState.user_id),
      name: firstNonEmpty(merged.full_name, merged.name, merged.display_name, sessionState.name, typeof global.Session?.displayName === 'function' ? global.Session.displayName() : ''),
      email: firstNonEmpty(merged.email, sessionState.email),
      role: firstNonEmpty(merged.role_key, merged.role, sessionState.role)
    };
  }

  async function loadCommunicationCurrentUserProfile(client) {
    const fallback = getCommunicationCurrentUserProfileFallback();
    const currentUserId = fallback.id || global.Session?.userId?.() || global.Session?.user?.()?.id || '';
    if (!client?.from || !currentUserId) return fallback;
    try {
      const { data, error } = await client
        .from('profiles')
        .select('id,full_name,name,display_name,email,username,role_key,role')
        .eq('id', currentUserId)
        .maybeSingle();
      if (error || !data) return fallback;
      return {
        id: firstNonEmpty(data.id, fallback.id),
        name: firstNonEmpty(data.full_name, data.name, data.display_name, data.username, fallback.name),
        email: firstNonEmpty(data.email, fallback.email),
        role: firstNonEmpty(data.role_key, data.role, fallback.role)
      };
    } catch (error) {
      console.warn('[Communication Centre export] unable to load current user profile', error);
      return fallback;
    }
  }

  function getParticipantDisplayName(row = {}) {
    return firstNonEmpty(row.user_name, row.name, row.full_name, row.display_name, row.email, row.user_id, row.profile_id, 'User');
  }

  function getParticipantEmail(row = {}) {
    return firstNonEmpty(row.user_email, row.email, row.participant_email);
  }

  function getParticipantRole(row = {}) {
    return firstNonEmpty(row.participant_role, row.role, row.role_key, row.user_role, row.participant_type);
  }

  function getParticipantJoinedDate(row = {}) {
    return firstNonEmpty(row.joined_at, row.created_at, row.added_at);
  }

  function getActionItemOwner(actionItem = {}, participants = []) {
    const ownerId = firstNonEmpty(actionItem.assigned_to, actionItem.owner_id, actionItem.assignee_id, actionItem.user_id);
    if (ownerId) {
      const owner = participants.find(participant => [participant.user_id, participant.profile_id, participant.id, participant.auth_user_id].some(value => String(value || '') === String(ownerId)));
      if (owner) return getParticipantDisplayName(owner);
    }
    return firstNonEmpty(actionItem.assigned_to_name, actionItem.owner_name, actionItem.assignee_name, ownerId, '-');
  }

  function getMessageAttachmentRows(message = {}) {
    const raw = message.attachments || message.files || message.attachment_names || message.attachment_links || [];
    const rows = Array.isArray(raw) ? raw : (typeof raw === 'string' && raw.trim().startsWith('[') ? (() => { try { return JSON.parse(raw); } catch (_error) { return [raw]; } })() : (raw ? [raw] : []));
    return rows.map(item => {
      if (item && typeof item === 'object') {
        return {
          name: firstNonEmpty(item.name, item.file_name, item.filename, item.title, item.path, item.url, 'Attachment'),
          url: firstNonEmpty(item.url, item.signed_url, item.public_url, item.href, item.path)
        };
      }
      return { name: String(item || '').trim(), url: '' };
    }).filter(item => item.name);
  }

  function buildCommunicationExportRows(labelValuePairs) {
    return labelValuePairs.map(([label, value]) => `
      <tr>
        <th>${escapeHtml(label)}</th>
        <td>${escapeHtml(firstNonEmpty(value, '-'))}</td>
      </tr>
    `).join('');
  }

  function getCommunicationMessageBody(message = {}) {
    if (message.is_deleted) return 'This message was deleted.';
    return firstNonEmpty(message.message_body, message.body, message.content, message.decrypted_body, message.decrypted_message);
  }

  function buildCommunicationConversationExportHtml({ conversation, messages, participants, actionItems, exportedBy, exportedAt }) {
    const exportDate = formatCommunicationExportDate(exportedAt);
    const relatedLabel = firstNonEmpty(conversation._relatedRecordLabel, conversation.related_record_label, conversation.related_label, conversation.related_record_name, conversation.related_record_id);
    const conversationNumber = firstNonEmpty(conversation.conversation_no, conversation.conversation_number, conversation.id);
    const sortedMessages = [...(messages || [])].sort((a, b) => new Date(a.created_at || a.sent_at || 0).getTime() - new Date(b.created_at || b.sent_at || 0).getTime());
    const participantRows = (participants || []).map(participant => `
      <tr>
        <td>${escapeHtml(getParticipantDisplayName(participant))}</td>
        <td>${escapeHtml(getParticipantEmail(participant) || '-')}</td>
        <td>${escapeHtml(getParticipantRole(participant) || '-')}</td>
        <td>${escapeHtml(formatCommunicationExportDate(getParticipantJoinedDate(participant)))}</td>
      </tr>
    `).join('') || '<tr><td colspan="4">No participants found.</td></tr>';
    const messageCards = sortedMessages.map(message => {
      const sender = firstNonEmpty(message.sender_name, message.created_by_name, message.user_name, message.sender_email, message.created_by_email, 'System');
      const senderEmail = firstNonEmpty(message.sender_email, message.created_by_email, message.email);
      const sentAt = formatCommunicationExportDate(firstNonEmpty(message.created_at, message.sent_at, message.updated_at));
      const attachments = getMessageAttachmentRows(message);
      const attachmentHtml = attachments.length ? `
        <div class="attachments"><strong>Attachments:</strong>${attachments.map(attachment => {
          const safeUrl = global.U?.sanitizeUrl ? global.U.sanitizeUrl(attachment.url) : attachment.url;
          return safeUrl
            ? `<div><a href="${escapeAttr(safeUrl)}">${escapeHtml(attachment.name)}</a></div>`
            : `<div>${escapeHtml(attachment.name)}</div>`;
        }).join('')}</div>
      ` : '';
      const markerParts = [];
      if (message.edited_at || message.is_edited) markerParts.push(`Edited${message.edited_at ? ` ${formatCommunicationExportDate(message.edited_at)}` : ''}`);
      if (message.is_deleted || message.deleted_at) markerParts.push(`Deleted${message.deleted_at ? ` ${formatCommunicationExportDate(message.deleted_at)}` : ''}`);
      return `
        <article class="message-card ${message.is_deleted ? 'deleted' : ''}">
          <div class="message-card__meta">
            <div><strong>${escapeHtml(sender)}</strong>${senderEmail ? `<span>${escapeHtml(senderEmail)}</span>` : ''}</div>
            <div>${escapeHtml(sentAt)}</div>
          </div>
          ${markerParts.length ? `<div class="message-card__markers">${escapeHtml(markerParts.join(' • '))}</div>` : ''}
          <div class="message-card__body">${preserveMessageLineBreaks(getCommunicationMessageBody(message))}</div>
          ${attachmentHtml}
        </article>
      `;
    }).join('') || '<p class="muted">No messages found.</p>';
    const actionItemSection = (actionItems || []).length ? `
      <section class="section">
        <h2>Action Items</h2>
        <table>
          <thead><tr><th>Title</th><th>Owner</th><th>Due Date</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>${actionItems.map(item => `
            <tr>
              <td>${escapeHtml(firstNonEmpty(item.title, item.name, '-'))}</td>
              <td>${escapeHtml(getActionItemOwner(item, participants))}</td>
              <td>${escapeHtml(formatCommunicationExportDate(firstNonEmpty(item.due_at, item.due_date)))}</td>
              <td>${escapeHtml(firstNonEmpty(item.status, '-'))}</td>
              <td>${escapeHtml(sanitizeCommunicationExportText(firstNonEmpty(item.notes, item.description, item.note, '')) || '-')}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      </section>
    ` : '';
    const baseHref = escapeAttr(global.location?.href || '');
    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(`Communication_Conversation_${conversationNumber}_${formatCommunicationExportDateStamp(exportedAt)}`)}</title>
          <base href="${baseHref}" />
          <style>
            @page { size: A4; margin: 16mm 14mm 18mm; }
            * { box-sizing: border-box; }
            body { margin: 0; background: #fff; color: #1f2937; font: 12px/1.45 Arial, Helvetica, sans-serif; }
            .document { max-width: 190mm; margin: 0 auto; }
            .doc-header { display: grid; grid-template-columns: 40mm 1fr 40mm; gap: 10mm; align-items: start; border-bottom: 2px solid #111827; padding-bottom: 8mm; margin-bottom: 8mm; }
            .doc-logo { min-height: 20mm; display: flex; align-items: flex-start; }
            .doc-title { text-align: center; }
            .doc-title h1 { margin: 0 0 4mm; font-size: 20px; color: #111827; letter-spacing: .01em; }
            .doc-title p { margin: 1mm 0; color: #4b5563; }
            .section { break-inside: avoid; margin: 0 0 8mm; }
            .section h2 { margin: 0 0 3mm; color: #111827; font-size: 15px; border-bottom: 1px solid #d1d5db; padding-bottom: 2mm; }
            table { width: 100%; border-collapse: collapse; margin: 0; }
            th, td { border: 1px solid #d1d5db; padding: 7px 8px; vertical-align: top; text-align: left; }
            th { width: 32%; background: #f3f4f6; color: #374151; font-weight: 700; }
            thead th { width: auto; }
            .message-card { break-inside: avoid; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; margin: 0 0 8px; background: #fff; }
            .message-card.deleted { background: #f9fafb; color: #6b7280; }
            .message-card__meta { display: flex; justify-content: space-between; gap: 14px; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 8px; }
            .message-card__meta span { display: block; color: #6b7280; font-size: 11px; font-weight: 400; margin-top: 1px; }
            .message-card__markers { display: inline-block; margin-bottom: 7px; padding: 2px 7px; border-radius: 999px; background: #f3f4f6; color: #4b5563; font-size: 11px; }
            .message-card__body { white-space: normal; color: #111827; }
            .attachments { margin-top: 8px; padding-top: 7px; border-top: 1px dashed #d1d5db; color: #374151; }
            .attachments a { color: #1d4ed8; text-decoration: none; }
            .muted { color: #6b7280; }
            .footer { position: fixed; left: 14mm; right: 14mm; bottom: 6mm; display: flex; justify-content: space-between; border-top: 1px solid #d1d5db; padding-top: 3mm; color: #6b7280; font-size: 10px; }
            .footer .page::after { content: counter(page); }
            @media screen { body { background: #f3f4f6; padding: 18px; } .document { background: #fff; padding: 16mm 14mm 18mm; box-shadow: 0 12px 32px rgba(15,23,42,.12); } .footer { position: static; margin-top: 10mm; } }
            @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } .document { max-width: none; } }
          </style>
        </head>
        <body>
          <main class="document">
            <header class="doc-header">
              <div class="doc-logo"><div data-incheck360-doc-logo-slot></div></div>
              <div class="doc-title">
                <h1>Communication Conversation Export</h1>
                <p><strong>Export date/time:</strong> ${escapeHtml(exportDate)}</p>
                <p><strong>Exported by:</strong> ${escapeHtml(firstNonEmpty(exportedBy.name, exportedBy.email, 'Current user'))}${exportedBy.email && exportedBy.email !== exportedBy.name ? ` (${escapeHtml(exportedBy.email)})` : ''}</p>
              </div>
              <div></div>
            </header>
            <section class="section">
              <h2>Conversation Details</h2>
              <table><tbody>${buildCommunicationExportRows([
                ['Conversation title/subject', firstNonEmpty(conversation.title, conversation.subject, 'Untitled')],
                ['Conversation ID', conversationNumber],
                ['Status', firstNonEmpty(conversation.status, 'Open')],
                ['Priority', firstNonEmpty(conversation.priority, '-')],
                ['Created date', formatCommunicationExportDate(conversation.created_at)],
                ['Created by', firstNonEmpty(conversation.created_by_name, conversation.created_by_email, conversation.created_by, '-')],
                ['Related module', firstNonEmpty(getRelatedModuleLabel(conversation.related_module || ''), conversation.related_module, '-')],
                ['Related record', relatedLabel || '-']
              ])}</tbody></table>
            </section>
            <section class="section">
              <h2>Participants</h2>
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined Date</th></tr></thead>
                <tbody>${participantRows}</tbody>
              </table>
            </section>
            <section class="section">
              <h2>Messages</h2>
              ${messageCards}
            </section>
            ${actionItemSection}
            <footer class="footer"><span>Generated by InCheck 360</span><span>Page <span class="page"></span></span></footer>
          </main>
        </body>
      </html>`;
    return global.U?.addIncheckDocumentLogo ? global.U.addIncheckDocumentLogo(html) : html;
  }

  function openCommunicationExportPrintWindow(html, fileName) {
    const printWindow = global.open('', '_blank', 'noopener,noreferrer,width=1080,height=900');
    const writeAndPrint = targetWindow => {
      targetWindow.document.open();
      targetWindow.document.write(html);
      targetWindow.document.close();
      targetWindow.document.title = fileName;
      const printNow = () => {
        targetWindow.focus();
        targetWindow.print();
        showFriendlySuccess('Use Save as PDF in the print dialog.');
      };
      if (targetWindow.document.readyState === 'complete') setTimeout(printNow, 200);
      else targetWindow.addEventListener('load', () => setTimeout(printNow, 200), { once: true });
    };
    if (printWindow) {
      writeAndPrint(printWindow);
      return true;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);
    const frameWindow = iframe.contentWindow;
    const frameDoc = iframe.contentDocument || frameWindow?.document;
    if (!frameWindow || !frameDoc) {
      iframe.remove();
      return false;
    }
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();
    frameDoc.title = fileName;
    const cleanup = () => setTimeout(() => iframe.remove(), 1500);
    const printFrame = () => {
      frameWindow.focus();
      frameWindow.print();
      showFriendlySuccess('Pop-up blocked. Use Save as PDF in the print dialog.');
      cleanup();
    };
    if (frameDoc.readyState === 'complete') setTimeout(printFrame, 200);
    else iframe.addEventListener('load', () => setTimeout(printFrame, 200), { once: true });
    return true;
  }

  async function exportActiveConversationPdf() {
    const activeId = getActiveConversationId();
    const button = $('communicationCentreExportPdfBtn');
    if (!activeId) return showFriendlyError('Open a conversation before exporting.');
    if (!canOpenConversation()) return showFriendlyError('You do not have access to export this conversation.');
    if (M.state.exportingPdf) return;

    const originalText = button?.textContent || 'Export PDF';
    M.state.exportingPdf = true;
    if (button) {
      button.disabled = true;
      button.textContent = 'Preparing PDF...';
    }
    try {
      const client = db();
      if (!client?.from) throw new Error('Supabase client is not available.');
      const { data: conversation, error: conversationError } = await client
        .from('communication_centre_conversations')
        .select('*')
        .eq('id', activeId)
        .maybeSingle();
      if (conversationError || !conversation) throw conversationError || new Error('Conversation not found or access denied.');

      const [messagesResult, participantsResult, actionItemsResult, exportedBy] = await Promise.all([
        client.rpc('list_communication_centre_messages_secure', { p_conversation_id: activeId }),
        client.from('communication_centre_participants').select('*').eq('conversation_id', activeId).order('participant_type', { ascending: true }).order('user_name', { ascending: true }),
        client.from('communication_centre_action_items').select('*').eq('conversation_id', activeId).order('created_at', { ascending: true }),
        loadCommunicationCurrentUserProfile(client)
      ]);
      if (messagesResult.error) throw messagesResult.error;
      if (participantsResult.error) throw participantsResult.error;
      const ignoredActionItemErrorCodes = new Set(['42P01', 'PGRST205', 'PGRST116']);
      if (actionItemsResult.error && !ignoredActionItemErrorCodes.has(String(actionItemsResult.error.code || ''))) throw actionItemsResult.error;

      const exportConversation = {
        ...conversation,
        _relatedRecordLabel: await resolveRelatedRecordLabel(conversation.related_module, conversation.related_record_id)
      };
      const exportedAt = new Date();
      const conversationFileId = safeCommunicationFilePart(firstNonEmpty(exportConversation.conversation_no, exportConversation.id));
      const fileName = `Communication_Conversation_${conversationFileId}_${formatCommunicationExportDateStamp(exportedAt)}.pdf`;
      const html = buildCommunicationConversationExportHtml({
        conversation: exportConversation,
        messages: messagesResult.data || [],
        participants: participantsResult.data || [],
        actionItems: actionItemsResult.error ? [] : (actionItemsResult.data || []),
        exportedBy,
        exportedAt
      });
      if (!openCommunicationExportPrintWindow(html, fileName)) throw new Error('Unable to open print window.');
    } catch (error) {
      console.error('[Communication Centre export] PDF export failed', error);
      showFriendlyError('Unable to export conversation PDF. Please try again.');
    } finally {
      M.state.exportingPdf = false;
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  }

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
    return `<div class="cc-message-status ${hasRead ? 'read' : 'received'}">${escapeHtml(label)}</div>`;
  }

  function renderReplyTargetPreview() {
    const target = $('communicationCentreReplyTarget');
    const replyBtn = $('communicationCentreReplyBtn');
    if (!target) return;
    if (M.state.editingMessageId) {
      const body = normalizeText(M.state.editingMessageOriginal?.message_body || M.state.editingMessageOriginal?.body || 'Message');
      target.style.display = '';
      target.innerHTML = `<div><strong>Editing message</strong><span>${escapeHtml(body.slice(0, 120))}${body.length > 120 ? '…' : ''}</span></div><button type="button" class="btn ghost sm" id="communicationCentreCancelReplyTarget">Cancel</button>`;
      if (replyBtn) replyBtn.textContent = 'Save Edit';
      return;
    }
    if (replyBtn) replyBtn.textContent = 'Send';
    const message = M.state.replyToMessage;
    if (!message) {
      target.style.display = 'none';
      target.innerHTML = '';
      return;
    }
    const body = normalizeText(message.message_body || message.body || 'Message');
    target.style.display = '';
    target.innerHTML = `<div><strong>Replying to ${escapeHtml(message.sender_name || 'user')}</strong><span>${escapeHtml(body.slice(0, 120))}${body.length > 120 ? '…' : ''}</span></div><button type="button" class="btn ghost sm" id="communicationCentreCancelReplyTarget">Cancel</button>`;
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
  const RELATED_RECORD_CONFIG = {
    lead: { table: 'leads', idField: 'lead_id', route: 'leads', queryKey: 'lead_id', labelFields: ['lead_id', 'legal_company_name', 'company_name', 'contact_name', 'status'] },
    deal: { table: 'deals', idField: 'deal_id', route: 'deals', queryKey: 'deal_id', labelFields: ['deal_id', 'legal_company_name', 'company_name', 'deal_title', 'status'] },
    proposal: { table: 'proposals', idField: 'proposal_id', route: 'proposals', queryKey: 'proposal_id', labelFields: ['proposal_reference', 'proposal_id', 'legal_company_name', 'company_name', 'grand_total', 'status'] },
    agreement: { table: 'agreements', idField: 'agreement_id', route: 'agreements', queryKey: 'agreement_id', labelFields: ['agreement_reference', 'agreement_id', 'legal_company_name', 'company_name', 'status'] },
    invoice: { table: 'invoices', idField: 'invoice_id', route: 'invoices', queryKey: 'invoice_id', labelFields: ['invoice_reference', 'invoice_id', 'legal_company_name', 'company_name', 'balance_due', 'payment_status'] },
    receipt: { table: 'receipts', idField: 'receipt_id', route: 'receipts', queryKey: 'receipt_id', labelFields: ['receipt_reference', 'receipt_id', 'legal_company_name', 'company_name', 'payment_amount'] },
    ticket: { table: 'tickets', idField: 'ticket_id', route: 'tickets', queryKey: 'ticket_id', labelFields: ['ticket_id', 'title', 'status'] },
    event: { table: 'calendar_events', idField: 'event_id', route: 'events', queryKey: 'event_id', labelFields: ['title', 'event_date', 'status'] },
    client: { table: 'clients', idField: 'client_id', route: 'clients', queryKey: 'client_id', labelFields: ['legal_company_name', 'company_name', 'client_id'] },
    operations_onboarding: { table: 'operations_onboarding', idField: 'onboarding_id', route: 'operations-onboarding', queryKey: 'onboarding_id', labelFields: ['onboarding_id', 'legal_company_name', 'company_name', 'status'] },
    technical_admin_request: { table: 'technical_admin_requests', idField: 'request_id', route: 'technical-admin-requests', queryKey: 'request_id', labelFields: ['request_id', 'legal_company_name', 'company_name', 'status'] }
  };

  const RELATED_MODULE_LABELS = {
    lead: 'Lead',
    deal: 'Deal',
    proposal: 'Proposal',
    agreement: 'Agreement',
    invoice: 'Invoice',
    receipt: 'Receipt',
    ticket: 'Ticket',
    event: 'Event',
    client: 'Client',
    operations_onboarding: 'Operations Onboarding',
    technical_admin_request: 'Technical Admin Request'
  };

  const RELATED_MODULE_ALIASES = {
    leads: 'lead',
    deals: 'deal',
    proposals: 'proposal',
    agreements: 'agreement',
    invoices: 'invoice',
    receipts: 'receipt',
    tickets: 'ticket',
    events: 'event',
    calendar_events: 'event',
    clients: 'client',
    operations_onboarding: 'operations_onboarding',
    operations_onboardings: 'operations_onboarding',
    'operations onboarding': 'operations_onboarding',
    'operations-onboarding': 'operations_onboarding',
    technical_admin_requests: 'technical_admin_request',
    'technical admin request': 'technical_admin_request',
    'technical-admin-requests': 'technical_admin_request'
  };

  function normalizeRelatedModuleKey(value) {
    const raw = normalizeText(value).toLowerCase();
    if (!raw) return '';
    const key = raw.replace(/[\s-]+/g, '_');
    return RELATED_RECORD_CONFIG[key] ? key : (RELATED_MODULE_ALIASES[key] || RELATED_MODULE_ALIASES[raw] || '');
  }

  function getRelatedModuleLabel(moduleKeyOrValue) {
    const key = normalizeRelatedModuleKey(moduleKeyOrValue) || normalizeText(moduleKeyOrValue).toLowerCase();
    return RELATED_MODULE_LABELS[key] || normalizeText(moduleKeyOrValue) || 'Related record';
  }

  function buildRelatedRecordDeepLink(moduleKey, recordId) {
    const key = normalizeRelatedModuleKey(moduleKey);
    const config = RELATED_RECORD_CONFIG[key];
    if (!config || !recordId) return null;
    return `#${config.route}?${config.queryKey}=${encodeURIComponent(recordId)}`;
  }

  function canAccessRelatedModule(moduleKey) {
    const key = normalizeRelatedModuleKey(moduleKey);
    const config = RELATED_RECORD_CONFIG[key];
    if (!config) return false;
    const P = global.Permissions;
    if (!P || (!P.state?.rows?.length && typeof P.can !== 'function' && typeof P.canPerformAction !== 'function')) return true;
    const resources = [config.route, config.table, key];
    return resources.some(resource => permissionHas(resource, 'view') || permissionHas(resource, 'list') || permissionHas(resource, 'manage'));
  }

  function formatMoneyLike(value) {
    if (value === null || value === undefined || value === '') return '';
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return normalizeText(value);
    try {
      return numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (_error) {
      return String(numeric);
    }
  }

  function formatRelatedRecordLabel(moduleKey, row = {}) {
    const key = normalizeRelatedModuleKey(moduleKey);
    const config = RELATED_RECORD_CONFIG[key];
    if (!config) return normalizeText(row?.id || row?.related_record_id || '');
    const idValue = normalizeText(row[config.idField] || row.id);
    const reference = normalizeText(row.proposal_reference || row.agreement_reference || row.invoice_reference || row.receipt_reference);
    const primary = reference || idValue;
    const company = normalizeText(row.legal_company_name || row.company_name || row.client_name || row.customer_name);
    const contact = normalizeText(row.contact_name || row.primary_contact_name);
    const title = normalizeText(row.deal_title || row.title || row.event_title || row.subject);
    const status = normalizeText(row.status || row.payment_status);
    const eventDate = normalizeText(row.event_date || row.start_date || row.start_at);
    const amount = formatMoneyLike(row.grand_total ?? row.balance_due ?? row.payment_amount);
    const prefix = { lead: 'Lead#', deal: 'Deal#', ticket: 'Ticket#' }[key] || '';
    const first = prefix && primary && !primary.toLowerCase().startsWith(prefix.toLowerCase()) ? `${prefix}${primary}` : primary;
    const partsByKey = {
      lead: [first, company, contact || status],
      deal: [first, company, title || status],
      proposal: [first, company, amount || status],
      agreement: [first, company, status],
      invoice: [first, company, amount || status],
      receipt: [first, company, amount],
      ticket: [first, title, status],
      event: [title || first, eventDate, status],
      client: [company || first, first && company ? first : ''],
      operations_onboarding: [first, company, status],
      technical_admin_request: [first, company, status]
    };
    const seen = new Set();
    const parts = (partsByKey[key] || config.labelFields.map(field => normalizeText(row[field]))).filter(part => {
      const normalized = normalizeText(part);
      if (!normalized || seen.has(normalized.toLowerCase())) return false;
      seen.add(normalized.toLowerCase());
      return true;
    });
    return parts.join(' - ') || idValue || 'Related record unavailable';
  }

  function relatedRecordCacheKey(moduleKey, recordId) {
    const key = normalizeRelatedModuleKey(moduleKey);
    const id = normalizeText(recordId);
    return key && id ? `${key}:${id}` : '';
  }

  async function fetchRelatedRecordOptions(moduleKey) {
    const key = normalizeRelatedModuleKey(moduleKey);
    const config = RELATED_RECORD_CONFIG[key];
    if (!config) return [];
    if (!canAccessRelatedModule(key)) return [];
    const client = db();
    if (!client) throw new Error('Supabase client is not available.');
    const { data, error } = await client
      .from(config.table)
      .select('*')
      .limit(100);
    if (error) throw error;
    return (data || []).map(row => {
      const id = normalizeText(row[config.idField] || row.id);
      const label = formatRelatedRecordLabel(key, row);
      const cacheKey = relatedRecordCacheKey(key, id);
      if (cacheKey) M.state.relatedRecordLabels[cacheKey] = label;
      return { id, label, row, moduleKey: key, searchText: `${label} ${id}`.toLowerCase() };
    }).filter(option => option.id);
  }

  async function resolveRelatedRecordLabel(moduleKey, recordId) {
    const key = normalizeRelatedModuleKey(moduleKey);
    const id = normalizeText(recordId);
    if (!key || !id) return '';
    const cacheKey = relatedRecordCacheKey(key, id);
    if (cacheKey && M.state.relatedRecordLabels[cacheKey]) return M.state.relatedRecordLabels[cacheKey];
    const config = RELATED_RECORD_CONFIG[key];
    if (!config) return id;
    if (!canAccessRelatedModule(key)) return 'Related record unavailable';
    const client = db();
    if (!client) return id;
    try {
      const { data, error } = await client
        .from(config.table)
        .select('*')
        .eq(config.idField, id)
        .maybeSingle();
      if (error) {
        console.warn('[Communication Centre] unable to load related record label', error);
        return 'Related record unavailable';
      }
      if (!data) return 'Related record unavailable';
      const label = formatRelatedRecordLabel(key, data);
      if (cacheKey) M.state.relatedRecordLabels[cacheKey] = label;
      return label || id;
    } catch (error) {
      console.warn('[Communication Centre] unable to resolve related record label', error);
      return 'Related record unavailable';
    }
  }

  function renderCreateRelatedRecordOptions(filterText = '') {
    const list = $('communicationCentreCreateRelatedRecordResults');
    const hidden = $('communicationCentreCreateRelatedRecordId');
    const moduleKey = normalizeRelatedModuleKey($('communicationCentreCreateRelatedResource')?.value);
    if (!list) return;
    if (!moduleKey) {
      list.innerHTML = '<div class="muted" style="padding:8px 10px;">Select related module first</div>';
      return;
    }
    if (M.state.relatedRecordLoading) {
      list.innerHTML = '<div class="muted" style="padding:8px 10px;">Loading related records...</div>';
      return;
    }
    const q = normalizeText(filterText).toLowerCase();
    const options = (M.state.relatedRecordOptions || []).filter(option => !q || option.searchText.includes(q)).slice(0, 30);
    if (!options.length) {
      list.innerHTML = '<div class="muted" style="padding:8px 10px;">No matching related records found.</div>';
      return;
    }
    list.innerHTML = options.map(option => `
      <button class="cc-related-record-option communication-related-record-option" type="button" data-related-record-id="${escapeAttr(option.id)}">
        <strong>${escapeHtml(option.label)}</strong><br><span class="muted">ID: ${escapeHtml(option.id)}</span>
      </button>
    `).join('');
    list.querySelectorAll('[data-related-record-id]').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-related-record-id') || '';
        const option = M.state.relatedRecordOptions.find(item => String(item.id) === String(id));
        if (hidden) hidden.value = id;
        const search = $('communicationCentreCreateRelatedRecordSearch');
        if (search) search.value = option?.label || id;
        list.style.display = 'none';
      });
    });
  }

  async function loadCreateRelatedRecords() {
    const moduleSelect = $('communicationCentreCreateRelatedResource');
    const search = $('communicationCentreCreateRelatedRecordSearch');
    const hidden = $('communicationCentreCreateRelatedRecordId');
    const list = $('communicationCentreCreateRelatedRecordResults');
    const moduleKey = normalizeRelatedModuleKey(moduleSelect?.value);
    M.state.relatedRecordOptions = [];
    if (hidden) hidden.value = '';
    if (search) search.value = '';
    if (!moduleKey) {
      if (search) {
        search.disabled = true;
        search.placeholder = 'Select related module first';
      }
      if (list) list.style.display = 'none';
      renderCreateRelatedRecordOptions();
      return;
    }
    if (!canAccessRelatedModule(moduleKey)) {
      if (search) {
        search.disabled = true;
        search.placeholder = 'No access to this related module';
      }
      if (list) {
        list.style.display = '';
        list.innerHTML = '<div class="muted" style="padding:8px 10px;">No accessible records for this module.</div>';
      }
      return;
    }
    M.state.relatedRecordLoading = true;
    if (search) {
      search.disabled = true;
      search.placeholder = 'Loading related records...';
    }
    if (list) list.style.display = '';
    renderCreateRelatedRecordOptions();
    try {
      M.state.relatedRecordOptions = await fetchRelatedRecordOptions(moduleKey);
      if (search) {
        search.disabled = false;
        search.placeholder = `Search ${getRelatedModuleLabel(moduleKey).toLowerCase()} records (optional)`;
      }
    } catch (error) {
      console.warn('[Communication Centre] related record options failed', error);
      if (search) {
        search.disabled = true;
        search.placeholder = 'Related records unavailable';
      }
      if (list) list.innerHTML = '<div class="muted" style="padding:8px 10px;">Related records unavailable.</div>';
      return;
    } finally {
      M.state.relatedRecordLoading = false;
    }
    renderCreateRelatedRecordOptions(search?.value || '');
  }

  function wireCreateRelatedRecordPicker() {
    const moduleSelect = $('communicationCentreCreateRelatedResource');
    const search = $('communicationCentreCreateRelatedRecordSearch');
    const hidden = $('communicationCentreCreateRelatedRecordId');
    const list = $('communicationCentreCreateRelatedRecordResults');
    moduleSelect?.addEventListener('change', loadCreateRelatedRecords);
    search?.addEventListener('input', () => {
      if (hidden) hidden.value = '';
      if (list) list.style.display = '';
      renderCreateRelatedRecordOptions(search.value);
    });
    search?.addEventListener('focus', () => {
      if (!search.disabled && list) {
        list.style.display = '';
        renderCreateRelatedRecordOptions(search.value);
      }
    });
    document.addEventListener('click', event => {
      if (!list || !search) return;
      if (event.target === search || list.contains(event.target)) return;
      list.style.display = 'none';
    });
  }

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
      const conversationId = String(id || '');
      const wasActiveConversation = String(M.state.active?.id || '') === conversationId;
      const isFirstOpen = conversationId && !M.openedConversationIds.has(conversationId);
      M.activeConversationId = conversationId || null;
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
      M.state.active = {
        ...data,
        _relatedRecordLabel: await resolveRelatedRecordLabel(data.related_module, data.related_record_id)
      };
      const [messagesResult, participantsResult, reactionsResult, readReceiptsResult, actionItemsResult] = await Promise.all([
        client.rpc('list_communication_centre_messages_secure', { p_conversation_id: id }),
        client.from('communication_centre_participants').select('*').eq('conversation_id', id).order('participant_type', { ascending: true }).order('user_name', { ascending: true }),
        client.from('communication_centre_message_reactions').select('*').eq('conversation_id', id),
        client.from('communication_centre_read_receipts').select('*').eq('conversation_id', id),
        client.from('communication_centre_action_items').select('*').eq('conversation_id', id).order('created_at', { ascending: false })
      ]);
      if (messagesResult.error) console.error('[Communication Centre encryption] secure message load failed', messagesResult.error);
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
      const autoScrollReason = options.autoScrollReason || (options.forceScroll === true ? 'force_scroll' : (isFirstOpen ? 'first_open' : 'none'));
      renderConversationMessages(conversationId, {
        autoScrollReason,
        conversationChanged: !wasActiveConversation
      });
      if (conversationId) M.openedConversationIds.add(conversationId);
      try {
        if (options.markRead !== false) await client.rpc('mark_communication_centre_read', { p_conversation_id: id });
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



  function getActiveConversationId() {
    return M.state.active?.id ? String(M.state.active.id) : '';
  }

  function isRealtimePayloadForActiveConversation(payload) {
    const activeId = getActiveConversationId();
    if (!activeId || !payload) return false;
    const row = payload.new || payload.old || {};
    const conversationId = row.conversation_id || row.id;
    return String(conversationId || '') === activeId;
  }

  function scheduleConversationListRefresh(reason = 'change') {
    clearTimeout(M.realtimeRefreshTimer);
    M.realtimeRefreshTimer = setTimeout(async () => {
      try {
        await refresh();
        M.lastRealtimeAt = Date.now();
        console.log('[Communication Centre realtime] list refreshed', { reason });
      } catch (error) {
        console.warn('[Communication Centre realtime] list refresh failed', { reason, error });
      }
    }, 350);
  }

  function scheduleActiveConversationRefresh(reason = 'change', { markRead = true } = {}) {
    const activeId = getActiveConversationId();
    if (!activeId) return;
    clearTimeout(M.activeRefreshTimer);
    M.activeRefreshTimer = setTimeout(async () => {
      try {
        await openDetail(activeId, {
          markRead,
          autoScrollReason: 'background_refresh',
          fromRealtime: true,
          reason
        });
        M.lastRealtimeAt = Date.now();
        console.log('[Communication Centre realtime] active conversation refreshed', { reason, activeId });
      } catch (error) {
        console.warn('[Communication Centre realtime] active refresh failed', { reason, activeId, error });
      }
    }, 250);
  }

  function handleRealtimePayload(payload, source = 'realtime') {
    const table = payload?.table || payload?.schema_table || '';
    const eventType = payload?.eventType || payload?.type || 'change';
    console.log('[Communication Centre realtime] event', { source, table, eventType, payload });
    scheduleConversationListRefresh(`${source}:${table}:${eventType}`);
    if (isRealtimePayloadForActiveConversation(payload)) {
      const markRead = table !== 'communication_centre_read_receipts';
      scheduleActiveConversationRefresh(`${source}:${table}:${eventType}`, { markRead });
    }
  }

  function teardownRealtime() {
    const client = db();
    if (M.realtimeChannel && client?.removeChannel) {
      try { client.removeChannel(M.realtimeChannel); } catch (error) { console.warn('[Communication Centre realtime] remove channel failed', error); }
    } else if (M.realtimeChannel?.unsubscribe) {
      try { M.realtimeChannel.unsubscribe(); } catch (error) { console.warn('[Communication Centre realtime] unsubscribe failed', error); }
    }
    M.realtimeChannel = null;
    M.realtimeReady = false;
    M.realtimeStatus = 'idle';
  }

  async function logCommunicationCentreDebugContext() {
    try {
      const client = db();
      if (!client?.rpc) return;
      const { data, error } = await client.rpc('communication_centre_realtime_debug');
      if (error) {
        console.warn('[Communication Centre debug] RPC failed', error);
        return;
      }
      console.log('[Communication Centre debug]', data);
    } catch (error) {
      console.warn('[Communication Centre debug] unavailable', error);
    }
  }

  function setupCommunicationCentreRealtime() {
    const client = db();
    if (!client?.channel) {
      console.warn('[Communication Centre realtime] Supabase realtime channel API unavailable. Polling fallback will be used.');
      startCommunicationCentrePolling();
      return;
    }
    if (M.realtimeChannel) return;
    try {
      const channelName = `communication-centre-live-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const channel = client.channel(channelName);
      [
        'communication_centre_conversations',
        'communication_centre_messages',
        'communication_centre_participants',
        'communication_centre_read_receipts',
        'communication_centre_message_reactions',
        'communication_centre_action_items'
      ].forEach(table => {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, payload => handleRealtimePayload(payload, 'postgres_changes'));
      });
      channel.subscribe(status => {
        M.realtimeStatus = status;
        console.log('[Communication Centre realtime] subscription status', status);
        if (status === 'SUBSCRIBED') {
          M.realtimeReady = true;
          M.lastRealtimeAt = Date.now();
        }
      });
      M.realtimeChannel = channel;
    } catch (error) {
      console.warn('[Communication Centre realtime] subscription setup failed. Polling fallback will be used.', error);
    }
    startCommunicationCentrePolling();
  }

  function startCommunicationCentrePolling() {
    if (M.pollingTimer) return;
    M.pollingTimer = setInterval(async () => {
      try {
        await refresh();
        const activeId = getActiveConversationId();
        if (activeId) await openDetail(activeId, { markRead: true, autoScrollReason: 'background_refresh', fromRealtime: true, reason: 'polling' });
      } catch (error) {
        console.warn('[Communication Centre polling] refresh failed', error);
      }
    }, 12000);
    if (!M.readPollingTimer) {
      M.readPollingTimer = setInterval(async () => {
        const activeId = getActiveConversationId();
        if (!activeId) return;
        try {
          await openDetail(activeId, { markRead: false, autoScrollReason: 'background_refresh', fromRealtime: true, reason: 'read_receipt_polling' });
        } catch (error) {
          console.warn('[Communication Centre polling] read receipt refresh failed', error);
        }
      }, 5000);
    }
  }

  function stopCommunicationCentrePolling() {
    if (M.pollingTimer) clearInterval(M.pollingTimer);
    if (M.readPollingTimer) clearInterval(M.readPollingTimer);
    M.pollingTimer = null;
    M.readPollingTimer = null;
  }

  function normalizeCommunicationMessagePreview(value) {
    const text = String(value || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) return 'You have a new message.';
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
  }

  async function getCommunicationCentrePushRecipients(conversationId, senderUserId) {
    const normalizedConversationId = String(conversationId || '').trim();
    if (!normalizedConversationId) return [];

    const client = db();
    if (!client?.from) {
      console.warn('[Communication Centre PWA] Supabase client is unavailable while loading participants');
      return [];
    }

    const { data, error } = await client
      .from('communication_centre_participants')
      .select('*')
      .eq('conversation_id', normalizedConversationId);

    if (error) {
      console.warn('[Communication Centre PWA] Unable to load participants', error);
      return [];
    }

    const recipients = (data || [])
      .filter((row) => {
        const userId = row.user_id || row.participant_user_id || row.profile_id;
        if (!userId) return false;
        if (String(userId) === String(senderUserId)) return false;
        if (row.is_active === false) return false;
        if (row.status && ['inactive', 'removed', 'left'].includes(String(row.status).toLowerCase())) return false;
        if (row.left_at) return false;
        if (row.muted === true || row.is_muted === true) return false;
        return true;
      })
      .map((row) => row.user_id || row.participant_user_id || row.profile_id)
      .filter(Boolean)
      .filter((value, index, arr) => arr.findIndex((x) => String(x) === String(value)) === index);

    console.log('[Communication Centre PWA] recipients resolved', {
      conversationId: normalizedConversationId,
      senderUserId,
      recipients
    });

    return recipients;
  }

  async function sendCommunicationCentrePwaPush({
    conversationId,
    messageId,
    senderUserId,
    senderName,
    messageBody
  }) {
    try {
      if (!conversationId || !messageId || !senderUserId) return;
      if (!global.Api?.sendWebPush) {
        console.warn('[Communication Centre PWA] Api.sendWebPush is unavailable');
        return;
      }
      const channelDecision = await global.NotificationService?.resolveNotificationChannels?.('communication_centre', 'message_created', { eventKey: 'communication_centre.message_created' });
      if (channelDecision && !channelDecision.pwa) {
        console.info('[Communication Centre PWA] skipped: disabled_by_notification_settings', {
          action: 'message_created',
          conversationId,
          channel_skipped_reason: 'disabled_by_notification_settings'
        });
        return;
      }

      const recipients = await getCommunicationCentrePushRecipients(conversationId, senderUserId);

      if (!recipients.length) {
        console.info('[Communication Centre PWA] No recipients for conversation', conversationId);
        return;
      }

      const deepLink = `#communication-centre?conversation_id=${encodeURIComponent(conversationId)}`;
      const preview = normalizeCommunicationMessagePreview(messageBody);
      const safeSenderName = senderName || 'Communication Centre';

      const pushPromises = recipients.map((recipientUserId) => {
        const payload = {
          recipient_user_id: recipientUserId,
          user_id: recipientUserId,
          user_ids: [recipientUserId],
          target_user_ids: [recipientUserId],
          recipient_user_ids: [recipientUserId],
          title: 'New message in Communication Centre',
          body: `${safeSenderName}: ${preview}`,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: `communication-centre-${conversationId}`,
          resource: 'communication_centre',
          action: 'message_created',
          event_key: 'message_created',
          related_module: 'communication_centre',
          related_record_id: conversationId,
          record_id: conversationId,
          deep_link: deepLink,
          url: deepLink,
          data: {
            module: 'communication_centre',
            resource: 'communication_centre',
            action: 'message_created',
            event_key: 'message_created',
            conversation_id: conversationId,
            message_id: messageId,
            record_id: conversationId,
            related_record_id: conversationId,
            deep_link: deepLink,
            url: deepLink
          }
        };
        console.log('[Communication Centre PWA] calling Api.sendWebPush', {
          conversationId,
          messageId,
          recipientUserId,
          deepLink
        });
        return global.Api.sendWebPush(payload, { context: 'communication_centre:message_created:direct-pwa' });
      });

      const results = await Promise.allSettled(pushPromises);
      console.log('[Communication Centre PWA] push results', {
        conversationId,
        messageId,
        sent: results.filter((item) => item.status === 'fulfilled').length,
        failed: results.filter((item) => item.status === 'rejected').length,
        results
      });

      const failed = results.filter((item) => item.status === 'rejected');
      if (failed.length) {
        console.warn('[Communication Centre PWA] Some push notifications failed', failed);
      }
    } catch (error) {
      console.warn('[Communication Centre PWA] Push failed but message save remains successful', error);
    }
  }

  async function dispatchCommunicationCentreNotification({ action, conversationId, actorId, conversationNo, conversationTitle }) {
    const normalizedAction = String(action || '').trim();
    const normalizedConversationId = String(conversationId || '').trim();
    if (!normalizedAction || !normalizedConversationId) return null;

    try {
      const client = db();
      if (client?.rpc) {
        const { data, error } = await client.rpc('notify_communication_centre_event', {
          p_conversation_id: normalizedConversationId,
          p_action: normalizedAction
        });
        if (error) throw error;

        const rows = Array.isArray(data) ? data : [];
        const targetUserIds = [...new Set(rows.flatMap(row => [
          row?.recipient_user_id,
          row?.source_user_id,
          row?.app_user_id,
          row?.push_user_id,
          row?.profile_id,
          row?.auth_user_id,
          row?.auth_id
        ].map(value => String(value || '').trim()).filter(Boolean)))];
        const targetEmails = [...new Set(rows.flatMap(row => [
          row?.recipient_email,
          row?.email,
          row?.user_email,
          row?.push_email
        ].map(value => String(value || '').trim().toLowerCase()).filter(Boolean)))];
        const targetRoles = [...new Set(rows.flatMap(row => [
          row?.recipient_role,
          row?.role_key,
          row?.role
        ].map(value => String(value || '').trim().toLowerCase()).filter(Boolean)))];
        const first = rows[0] || {};
        const title = String(first.title || '').trim() || (
          normalizedAction === 'conversation_created' ? 'New Communication Centre conversation' :
          normalizedAction === 'reply_added' ? 'New Communication Centre reply' :
          normalizedAction === 'conversation_closed' ? 'Communication Centre conversation closed' :
          normalizedAction === 'conversation_reopened' ? 'Communication Centre conversation reopened' :
          'Communication Centre notification'
        );
        const body = String(first.message || '').trim() || `Conversation ${conversationTitle || conversationNo || ''} was updated.`;
        const url = `/#communication_centre?conversation_id=${encodeURIComponent(normalizedConversationId)}`;

        console.log('[Communication Centre PWA]', {
          action: normalizedAction,
          conversationId: normalizedConversationId,
          recipientUserIds: targetUserIds,
          recipientEmails: targetEmails,
          recipientRoles: targetRoles,
          title,
          body,
          url
        });

        const hasPushTargets = Boolean(targetUserIds.length || targetEmails.length || targetRoles.length);
        const channelDecision = await global.NotificationService?.resolveNotificationChannels?.('communication_centre', normalizedAction, { eventKey: `communication_centre.${normalizedAction}` });
        if (hasPushTargets && global.Api?.sendWebPush && (!channelDecision || channelDecision.pwa)) {
          try {
            await global.Api.sendWebPush({
              // Keep every alias because older/newer Edge Function versions have used different names.
              user_ids: targetUserIds,
              target_user_ids: targetUserIds,
              recipient_user_ids: targetUserIds,
              emails: targetEmails,
              target_emails: targetEmails,
              recipient_emails: targetEmails,
              roles: targetRoles,
              target_roles: targetRoles,
              title,
              body,
              url,
              resource: 'communication_centre',
              action: normalizedAction,
              event_key: normalizedAction,
              record_id: normalizedConversationId,
              record_number: conversationNo || '',
              data: {
                resource: 'communication_centre',
                action: normalizedAction,
                event_key: normalizedAction,
                record_id: normalizedConversationId,
                conversation_id: normalizedConversationId,
                conversation_no: conversationNo || '',
                conversation_title: conversationTitle || '',
                actor_id: actorId || '',
                url
              },
              metadata: {
                conversation_id: normalizedConversationId,
                conversation_no: conversationNo || '',
                conversation_title: conversationTitle || '',
                actor_id: actorId || ''
              }
            }, { context: `communication_centre:${normalizedAction}:direct-pwa` });
          } catch (error) {
            console.warn('[Communication Centre PWA failed]', error);
          }
        } else if (channelDecision && !channelDecision.pwa) {
          console.info('[Communication Centre PWA skipped: disabled_by_notification_settings]', {
            action: normalizedAction,
            conversationId: normalizedConversationId,
            channel_skipped_reason: 'disabled_by_notification_settings'
          });
        } else {
          console.warn('[Communication Centre PWA skipped: no push target returned]', {
            action: normalizedAction,
            conversationId: normalizedConversationId,
            rows
          });
        }

        return { ok: true, recipients: targetUserIds, emails: targetEmails, roles: targetRoles, inserted: rows.length };
      }
    } catch (error) {
      console.warn('[Communication Centre PWA failed]', error);
    }

    // Last-resort compatibility fallback. This should not be the main path anymore.
    try {
      if (!global.NotificationService?.dispatchConfiguredNotification) return null;
      const deepLink = `#communication_centre?conversation_id=${encodeURIComponent(normalizedConversationId)}`;
      return await global.NotificationService.dispatchConfiguredNotification({
        resource: 'communication_centre',
        action: normalizedAction,
        recordId: normalizedConversationId,
        actorId,
        deepLink,
        context: {
          conversation_id: normalizedConversationId,
          conversation_no: conversationNo || '',
          conversation_title: conversationTitle || '',
          actor_name: global.Session?.displayName?.() || 'A user',
          deep_link: deepLink
        }
      });
    } catch (fallbackError) {
      console.warn('[Communication Centre notification fallback failed]', fallbackError);
      return null;
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
    listEl.innerHTML = rows.map(row => `<button class="cc-item communication-conversation-card ${activeId===row.id?'active':''} ${Number(row.unread_count||0)>0?'unread':''}" data-cc-open="${escapeAttr(row.id)}" type="button"><div class="cc-item-main"><small>${escapeHtml(row.conversation_no||'')}</small><strong>${escapeHtml(row.title||'Untitled')}</strong><p>${escapeHtml(row.last_message_preview||'No messages yet')}</p><div class="cc-item-submeta">${row.is_pinned?'<span class="chip">📌 Pinned</span>':''}${M.state.filters.quick==='archived'&&row.is_archived?'<span class="chip">Archived</span>':''}${row.participant_count?`<span class="chip">${escapeHtml(String(row.participant_count))} participants</span>`:''}</div></div><div class="cc-item-meta"><span class="cc-time">${escapeHtml(relTime(row.updated_at||row.last_message_at))}</span><span class="chip cc-status-chip">${escapeHtml(row.status||'Open')}</span>${row.priority?`<span class="chip cc-priority-chip">${escapeHtml(row.priority)}</span>`:''}${Number(row.unread_count||0)>0?`<span class="chip cc-unread-chip">● ${escapeHtml(String(row.unread_count))}</span>`:''}</div></button>`).join('') || '<div class="muted communication-centre-empty-state" style="padding:16px;">No conversations found for this filter.</div>';
    const pageInfo = $('communicationCentrePageInfo');
    if (pageInfo) pageInfo.textContent = `Page ${M.state.page} • ${M.state.count} total`;
  }

  function showNewMessagesButton() {
    const button = $('communicationCentreNewMessagesBtn');
    if (button) button.style.display = '';
  }

  function hideNewMessagesButton() {
    const button = $('communicationCentreNewMessagesBtn');
    if (button) button.style.display = 'none';
  }

  function getCommunicationMessagesContainer() {
    return $('communicationCentreMessages') || document.querySelector('[data-communication-messages]');
  }

  function isNearBottom(container, threshold = 120) {
    if (!container) return true;
    return (container.scrollHeight - container.scrollTop - container.clientHeight) <= threshold;
  }

  function preserveScrollPosition(container, renderFn) {
    if (!container) {
      renderFn();
      return;
    }

    const previousScrollHeight = container.scrollHeight;
    const previousScrollTop = container.scrollTop;

    renderFn();

    const newScrollHeight = container.scrollHeight;
    const heightDiff = newScrollHeight - previousScrollHeight;

    container.scrollTop = previousScrollTop + heightDiff;
  }

  function scrollMessagesToBottom(container) {
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }

  function isCommunicationCentreNearBottom() {
    return isNearBottom(getCommunicationMessagesContainer());
  }

  function scrollCommunicationCentreToBottom(force = true) {
    const el = getCommunicationMessagesContainer();
    if (!el) return;
    if (!force && !isNearBottom(el)) {
      showNewMessagesButton();
      return;
    }
    requestAnimationFrame(() => {
      scrollMessagesToBottom(el);
      setTimeout(() => {
        scrollMessagesToBottom(el);
      }, 80);
    });
    hideNewMessagesButton();
  }

  function renderConversationMessages(conversationId, options = {}) {
    const container = getCommunicationMessagesContainer();
    const wasNearBottom = isNearBottom(container);
    const previousMessageCount = M.lastMessageCountByConversation.get(String(conversationId || '')) || 0;
    const currentMessageCount = Array.isArray(M.state.messages) ? M.state.messages.length : 0;
    const hasNewMessages = currentMessageCount > previousMessageCount;
    const shouldAutoScroll =
      options.autoScrollReason === 'first_open' ||
      options.autoScrollReason === 'sent_by_current_user' ||
      options.autoScrollReason === 'force_scroll' ||
      (hasNewMessages && wasNearBottom);

    if (shouldAutoScroll) {
      renderDrawer({ skipAutoScroll: true });
      requestAnimationFrame(() => scrollCommunicationCentreToBottom(true));
    } else {
      preserveScrollPosition(container, () => {
        renderDrawer({ skipAutoScroll: true });
      });
      if (hasNewMessages && !wasNearBottom) showNewMessagesButton();
    }

    M.lastMessageCountByConversation.set(String(conversationId || ''), currentMessageCount);
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
      const relatedLabel = conversation.related_module && conversation.related_record_id
        ? `Related: ${conversation._relatedRecordLabel || conversation.related_record_id}`
        : '';
      const detailsLabel = (isMobileViewport() || isTabletViewport()) ? 'Details' : (M.state.detailsVisible === false ? 'Show details' : 'Hide details');
      if (header) header.innerHTML = `${mobileBack}<div class="cc-chat-heading"><h3>${escapeHtml((conversation.conversation_no || '') + ' ' + (conversation.title || ''))}</h3><div class="muted">${escapeHtml(conversation.category || 'General')} • ${escapeHtml(conversation.priority || 'Normal')} • ${escapeHtml(conversation.status || 'Open')}${relatedLabel ? ` • ${escapeHtml(relatedLabel)}` : ''}</div></div><div class="cc-chat-header-actions"><button id="communicationCentreExportPdfBtn" class="btn ghost sm" type="button">${M.state.exportingPdf ? 'Preparing PDF...' : 'Export PDF'}</button><button id="communicationCentreOpenDetails" class="btn ghost sm" type="button">${detailsLabel}</button></div>`;
      $('communicationCentreExportPdfBtn')?.addEventListener('click', exportActiveConversationPdf);
    if (meta) meta.textContent = `${conversation.status || 'Open'} • ${conversation.priority || 'Normal'} • ${conversation.category || 'General'}`;
    if (participants) {
      participants.innerHTML = M.state.participants.map(participant => `
        <span class="chip cc-participant-chip">${escapeHtml(participant.participant_type || 'participant')}: ${escapeHtml(participant.user_name || participant.user_id || 'User')}</span>
      `).join(' ');
    }
    if (messages) {
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
            <div class="cc-bubble communication-message-bubble ${isMine ? 'outgoing' : 'incoming'}">
              <div class="cc-message-meta"><span class="cc-sender">${senderName}</span><span class="cc-sep">•</span><span>${message.created_at ? escapeHtml(new Date(message.created_at).toLocaleString()) : ''}</span>${message.edited_at ? '<span class="cc-sep">•</span><span>edited</span>' : ''}</div>
              <div class="cc-message-body">${message.is_deleted ? 'This message was deleted.' : escapeHtml(message.message_body || message.body || '')}</div>
              ${renderMessageDeliveryStatus(message, isMine)}
              ${!message.is_deleted ? `<div class="cc-message-actions"><button class="btn ghost sm" data-cc-reply-message="${escapeAttr(message.id)}" type="button">Reply</button>${isMine ? `<button class="btn ghost sm" data-cc-edit-message="${escapeAttr(message.id)}" type="button">Edit</button><button class="btn ghost sm" data-cc-delete-message="${escapeAttr(message.id)}" type="button">Delete message</button>` : ''}</div>` : ''}
              ${renderMessageReactions(message.id)}
            </div>
            ${isMine ? `<div class="cc-avatar mine">${initials}</div>` : ''}
          </div>
        `;
      }).join('') : '<div class="muted communication-centre-empty-state" style="padding:20px;text-align:center;">Select a conversation to view messages.</div>';
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
    const relatedLink = buildRelatedRecordDeepLink(conversation.related_module, conversation.related_record_id);
    const relatedDisplay = conversation.related_record_id
      ? (conversation._relatedRecordLabel || conversation.related_record_id || 'Related record unavailable')
      : '—';
    const relatedButton = relatedLink
      ? '<button id="communicationCentreOpenRelatedBtn" class="btn ghost sm" type="button">Open Related Record</button>' : '';
    actionWrap.innerHTML = `
      <div class="cc-details-section"><strong>Conversation Info</strong><div class="muted">#${escapeHtml(conversation.conversation_no || '—')} • ${escapeHtml(conversation.status || 'Open')} • ${escapeHtml(conversation.priority || 'Normal')} • ${escapeHtml(conversation.category || 'General')}</div><div class="muted">Created by ${escapeHtml(conversation.created_by_name || 'Unknown')} • ${escapeHtml(new Date(conversation.created_at).toLocaleString())}</div><div class="muted">Updated ${escapeHtml(new Date(conversation.updated_at || conversation.last_message_at || conversation.created_at).toLocaleString())}</div></div>
      <div class="cc-details-section"><strong>Assignment</strong><div class="muted">Assigned role: ${escapeHtml(conversation.assigned_role || '—')}</div><div class="muted">Participants: ${escapeHtml(String(M.state.participants.length || 0))}</div></div>
      <div class="cc-details-section"><strong>Related Record</strong><div><span class="chip">Related: ${escapeHtml(relatedDisplay)}</span></div><div class="muted">Module: ${escapeHtml(getRelatedModuleLabel(conversation.related_module || '') || '—')}</div><div class="muted">Record ID: ${escapeHtml(conversation.related_record_id || '—')}</div>${relatedButton}</div>
      <div class="cc-details-section cc-assignment-manage-section"><strong>Add Assignment</strong><div class="muted">Add an existing user or snapshot all users currently under a role.</div><label class="muted" for="communicationCentreAssignUserSelect">Add user</label><select id="communicationCentreAssignUserSelect" class="select"><option value="">Select user</option></select><label class="muted" for="communicationCentreAssignRoleSelect">Add role snapshot</label><select id="communicationCentreAssignRoleSelect" class="select"><option value="">Select role</option></select><div class="muted cc-assignment-hint">Role assignment is snapshotted. Only users currently in the selected role will be added.</div><div class="actions"><button id="communicationCentreAddAssignmentBtn" class="btn ghost sm" type="button">Add Assignment</button></div></div>
      <div class="cc-details-section"><strong>Actions</strong><div class="actions">${pinButton}${archiveButton}${closeButton}${reopenButton}${copyLinkButton}${deleteButton}<button id="communicationCentreEscalateBtn" class="btn ghost sm" type="button">${conversation.is_escalated ? 'Clear escalation' : 'Mark as escalated'}</button></div></div>
      <div class="cc-details-section"><strong>Follow-up</strong><input id="communicationCentreFollowUpAt" class="input" type="datetime-local" value="${conversation.follow_up_at ? escapeAttr(new Date(conversation.follow_up_at).toISOString().slice(0,16)) : ''}" /><div class="actions"><button id="communicationCentreFollowUpSaveBtn" class="btn ghost sm" type="button">Save follow-up</button><button id="communicationCentreFollowUpClearBtn" class="btn ghost sm" type="button">Clear</button></div></div>
      <div class="cc-details-section communication-action-item-card"><strong>Action Items</strong><div class="muted">Open: ${escapeHtml(String((M.state.actionItems||[]).filter(x => (x.status || 'open') === 'open').length))}</div><div class="actions"><input id="communicationCentreActionItemTitle" class="input" placeholder="Action item title" /><button id="communicationCentreActionItemAddBtn" class="btn ghost sm" type="button">Add</button></div></div>`;
    $('communicationCentrePinConversationBtn')?.addEventListener('click', togglePinConversation);
    $('communicationCentreArchiveConversationBtn')?.addEventListener('click', toggleArchiveConversation);
    $('communicationCentreOpenRelatedBtn')?.addEventListener('click', () => {
      if (relatedLink) global.location.hash = relatedLink;
    });
    $('communicationCentreCloseConversationBtn')?.addEventListener('click', closeActiveConversation);
    $('communicationCentreReopenConversationBtn')?.addEventListener('click', reopenActiveConversation);
    $('communicationCentreDeleteConversationBtn')?.addEventListener('click', deleteActiveConversation);
    $('communicationCentreCopyLinkBtn')?.addEventListener('click', async () => {
      const url = `${global.location.origin}${global.location.pathname}#communication_centre?conversation_id=${encodeURIComponent(conversation.id)}`;
      try { await navigator.clipboard.writeText(url); showFriendlySuccess('Link copied.'); } catch(_e){ showFriendlyError('Unable to update conversation. Please try again.'); }
    });
    $('communicationCentreEscalateBtn')?.addEventListener('click', toggleEscalation);
    $('communicationCentreAddAssignmentBtn')?.addEventListener('click', addAssignmentFromDetails);
    populateAssignmentPanelOptions();
    $('communicationCentreFollowUpSaveBtn')?.addEventListener('click', saveFollowUp);
    $('communicationCentreFollowUpClearBtn')?.addEventListener('click', clearFollowUp);
    $('communicationCentreActionItemAddBtn')?.addEventListener('click', addActionItem);
  }
  async function populateAssignmentPanelOptions() {
    try {
      const [users, roles] = await Promise.all([
        loadCommunicationCentreAssignableUsers(),
        loadCommunicationCentreAssignableRoles()
      ]);
      const currentParticipantIds = new Set((M.state.participants || []).map(p => String(p.user_id || '').trim()).filter(Boolean));
      const userSelect = $('communicationCentreAssignUserSelect');
      const roleSelect = $('communicationCentreAssignRoleSelect');
      if (userSelect) {
        const availableUsers = (users || []).filter(user => user._id && !currentParticipantIds.has(String(user._id)));
        userSelect.innerHTML = '<option value="">Select user</option>' + (availableUsers.length
          ? availableUsers.map(user => `<option value="${escapeAttr(user._id)}">${escapeHtml(user._name)}${user._role ? ` (${escapeHtml(user._role)})` : ''}</option>`).join('')
          : '<option value="" disabled>No additional users available</option>');
      }
      if (roleSelect) {
        roleSelect.innerHTML = '<option value="">Select role</option>' + (roles || []).map(role => `<option value="${escapeAttr(role._key)}">${escapeHtml(role._label || role._key)}</option>`).join('');
      }
    } catch (error) {
      console.warn('[Communication Centre] unable to load assignment options', error);
    }
  }

  async function addAssignmentFromDetails() {
    const conversation = M.state.active;
    if (!conversation?.id) return showFriendlyError('Open a conversation first.');
    const userId = normalizeText($('communicationCentreAssignUserSelect')?.value);
    const roleKey = normalizeText($('communicationCentreAssignRoleSelect')?.value);
    if (!userId && !roleKey) return showFriendlyError('Select a user or role to assign.');
    const button = $('communicationCentreAddAssignmentBtn');
    try {
      if (button) { button.disabled = true; button.textContent = 'Adding...'; }
      const client = db();
      if (!client?.rpc) throw new Error('Supabase client is not available.');
      const { error } = await client.rpc('add_communication_centre_assignment', {
        p_conversation_id: conversation.id,
        p_assigned_user_ids: userId ? [userId] : [],
        p_assigned_role: roleKey || null
      });
      if (error) throw error;
      showFriendlySuccess('Assignment added.');
      await openDetail(conversation.id);
      await refresh();
    } catch (error) {
      console.error('[Communication Centre] add assignment failed', error);
      showFriendlyError('Unable to add assignment. Please try again.');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Add Assignment'; }
    }
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
    modal.className = 'modal communication-centre-modal';
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
          <div id="communicationCentreCreateError" class="card danger communication-centre-error" style="display:none;margin-bottom:12px;padding:10px;border-left:4px solid #d73a49;"></div>
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
              <select id="communicationCentreCreateRelatedResource" class="select communication-related-record-select">
                <option value="">None</option>
                <option value="ticket">Ticket</option><option value="event">Event</option><option value="client">Client</option><option value="lead">Lead</option><option value="deal">Deal</option><option value="proposal">Proposal</option><option value="agreement">Agreement</option><option value="invoice">Invoice</option><option value="receipt">Receipt</option><option value="operations_onboarding">Operations Onboarding</option><option value="technical_admin_request">Technical Admin Request</option>
              </select>
            </div>
            <div class="filter-row" style="position:relative;">
              <label class="muted" for="communicationCentreCreateRelatedRecordSearch">Related record</label>
              <input id="communicationCentreCreateRelatedRecordSearch" class="input communication-related-record-select" type="search" placeholder="Select related module first" autocomplete="off" disabled />
              <input id="communicationCentreCreateRelatedRecordId" type="hidden" />
              <div id="communicationCentreCreateRelatedRecordResults" class="card communication-related-record-results" style="display:none;position:absolute;z-index:40;left:0;right:0;top:100%;max-height:260px;overflow:auto;padding:4px;margin-top:4px;"></div>
              <div class="muted" style="font-size:12px;margin-top:6px;">Optional. Search and select a record to link this conversation.</div>
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
    wireCreateRelatedRecordPicker();
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
    M.state.relatedRecordOptions = [];
    M.state.relatedRecordLoading = false;
    await loadCreateRelatedRecords();
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
    const relatedResource = normalizeRelatedModuleKey($('communicationCentreCreateRelatedResource')?.value);
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
      if (!can('create')) {
        showFriendlyError('You do not have access to create Communication Centre conversations.');
        return;
      }
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
    container.classList.add('communication-centre-module');
    const hasAccess = await ensureCommunicationCentreAccess();
    if (!hasAccess) {
      console.warn('[Communication Centre] access denied', { role: currentRoleKey(), permissionsReady: Boolean(global.Permissions?.isReady?.()), rows: global.Permissions?.state?.rows?.length || 0 });
      renderNoAccessState();
      return;
    }
    M.state.accessGranted = true;
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
        const input = $('communicationCentreReplyInput');
        if (!row || !input) { showFriendlyError('Unable to edit message. Please try again.'); return; }
        M.state.editingMessageId = id;
        M.state.editingMessageOriginal = row;
        M.state.replyToMessage = null;
        input.value = normalizeText(row.message_body || row.body || '');
        renderReplyTargetPreview();
        input.focus();
      } else if (deleteBtnEl) {
        const id = deleteBtnEl.getAttribute('data-cc-delete-message');
        try {
          const { error } = await db().rpc('soft_delete_communication_centre_message', { p_message_id: id });
          if (error) throw error;
          await openDetail(conversation.id, { autoScrollReason: 'background_refresh', reason: 'delete_message' });
        } catch (error) { console.error(error); showFriendlyError('Unable to delete message. Please try again.'); return; }
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
    const messagesEl = $('communicationCentreMessages');
    if (messagesEl && messagesEl.dataset.ccScrollTracked !== 'true') {
      messagesEl.dataset.ccScrollTracked = 'true';
      messagesEl.addEventListener('scroll', () => {
        const nearBottom = isCommunicationCentreNearBottom();
        const activeId = getActiveConversationId() || M.activeConversationId;
        if (activeId) M.userScrolledUpByConversation.set(String(activeId), !nearBottom);
        if (nearBottom) hideNewMessagesButton();
      }, { passive: true });
    }
    bindOnce($('communicationCentreNewMessagesBtn'), 'NewMessages', () => scrollCommunicationCentreToBottom(true));
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
      if (e.target?.id === 'communicationCentreCancelReplyTarget') { M.state.replyToMessage = null; M.state.editingMessageId = null; M.state.editingMessageOriginal = null; if ($('communicationCentreReplyInput')) $('communicationCentreReplyInput').value = ''; renderReplyTargetPreview(); }
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
      if (!body) return showFriendlyError(M.state.editingMessageId ? 'Updated message cannot be empty.' : 'Please enter a reply message.');
      try {
        if (replyBtn) { replyBtn.disabled = true; replyBtn.textContent = M.state.editingMessageId ? 'Saving...' : 'Sending...'; }
        const msgType = $('communicationCentreReplyType')?.value || 'message';
        if (M.state.editingMessageId) {
          const { error } = await db().rpc('edit_communication_centre_message_secure', { p_message_id: M.state.editingMessageId, p_message_body: body });
          if (error) throw error;
          M.state.editingMessageId = null;
          M.state.editingMessageOriginal = null;
          if (input) input.value = '';
          renderReplyTargetPreview();
          await openDetail(conversation.id, { autoScrollReason: 'background_refresh', reason: 'edit_message' });
          showFriendlySuccess('Message updated.');
          dispatchCommunicationCentreNotification({
            action: 'message_edited',
            actorId: global.Session?.user?.()?.id,
            conversationNo: conversation.conversation_no,
            conversationTitle: conversation.title,
            conversationId: conversation.id
          });
          if (replyBtn) { replyBtn.disabled = false; replyBtn.textContent = 'Send'; }
          return;
        }
        const { data: insertedMessageId, error } = await db().rpc('add_communication_centre_reply_secure', {
          p_conversation_id: conversation.id,
          p_message_body: body,
          p_message_type: msgType || 'message',
          p_reply_to_message_id: M.state.replyToMessage?.id || null
        });
        if (error) throw error;
        const insertedBody = body;
        const messageId = Array.isArray(insertedMessageId)
          ? (insertedMessageId[0]?.message_id || insertedMessageId[0]?.id || insertedMessageId[0])
          : (insertedMessageId?.message_id || insertedMessageId?.id || insertedMessageId);
        const currentUser = global.Session?.user?.() || global.Session?.currentUser?.() || {};
        const senderUserId = currentUser.id || global.Session?.state?.user?.id || global.Session?.state?.profile?.id || null;
        const senderName = currentUser.full_name || currentUser.fullName || currentUser.name || currentUser.display_name || currentUser.displayName || global.Session?.displayName?.() || currentUser.email || 'User';
        console.log('[Communication Centre PWA] message saved', {
          conversationId: conversation.id,
          messageId,
          senderUserId
        });
        sendCommunicationCentrePwaPush({
          conversationId: conversation.id,
          messageId,
          senderUserId,
          senderName,
          messageBody: insertedBody
        }).catch((pushError) => {
          console.warn('[Communication Centre PWA] Push failed but message save remains successful', pushError);
        });
        const tags = [...insertedBody.matchAll(/@([a-z0-9_]+)/gi)].map(m => m[1].toLowerCase());
        if (tags.length) console.log('[Communication Centre] mentions detected', tags);
        if (input) input.value = '';
        M.state.replyToMessage = null;
        if (replyError) { replyError.textContent=''; replyError.style.display='none'; }
        await openDetail(conversation.id, { autoScrollReason: 'sent_by_current_user' });
        await refresh();
        showFriendlySuccess('Reply sent successfully.');
        if (replyBtn) { replyBtn.disabled = false; replyBtn.textContent = 'Send'; }
        dispatchCommunicationCentreNotification({
          action: 'reply_added',
          actorId: global.Session?.user?.()?.id,
          conversationNo: conversation.conversation_no,
          conversationTitle: conversation.title,
          conversationId: conversation.id
        });
      } catch (error) {
        if (replyBtn) { replyBtn.disabled = false; replyBtn.textContent = M.state.editingMessageId ? 'Save Edit' : 'Send'; }
        console.error('[Communication Centre] send reply/edit failed', error);
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
    setupCommunicationCentreRealtime();
    logCommunicationCentreDebugContext();
    if (hashConversationId && canOpenConversation()) {
      await openDetail(hashConversationId);
      if (isMobileViewport()) setMobileView('chat');
    }
    syncResponsiveLayout();
    global.addEventListener('resize', syncResponsiveLayout, { passive: true });
  };

  global.addEventListener('beforeunload', () => { teardownRealtime(); stopCommunicationCentrePolling(); });
  global.CommunicationCentre = M;

  document.addEventListener('DOMContentLoaded', () => {
    wireCreateButton();
    const tab = $('communicationCentreTab') || document.querySelector('[data-view="communication_centre"],[data-tab="communication_centre"],[href="#communication_centre"]');
    if (tab && tab.dataset.ccClickFallbackBound !== 'true') {
      tab.dataset.ccClickFallbackBound = 'true';
      tab.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const centreContainer = $('communicationCentreView');
        if (centreContainer) centreContainer.classList.add('communication-centre-module');
        const hasAccess = await ensureCommunicationCentreAccess();
        if (!hasAccess) {
          console.warn('[Communication Centre] access denied', { role: currentRoleKey(), permissionsReady: Boolean(global.Permissions?.isReady?.()), rows: global.Permissions?.state?.rows?.length || 0 });
          renderNoAccessState();
          return;
        }
        if (typeof global.setActiveView === 'function') {
          global.setActiveView('communication_centre');
          return;
        }
        M.init();
      });
    }
  });
})(window);
