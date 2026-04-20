const Notifications = {
  POLL_INTERVAL_MS: 90000,
  state: {
    items: [],
    rawResponse: null,
    rawRows: [],
    previewItems: [],
    unreadCount: 0,
    loading: false,
    previewLoading: false,
    filters: {
      mode: 'all',
      search: ''
    },
    lastFetchedAt: '',
    pollTimer: null,
    panelOpen: false
  },
  normalize(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const firstValue = (...values) => {
      for (const value of values) {
        if (value !== undefined && value !== null && value !== '') return value;
      }
      return '';
    };
    const parseBoolean = value => {
      if (value === true || value === 1) return true;
      if (value === false || value === 0 || value === null || value === undefined) return false;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
        if (normalized === 'false' || normalized === '0' || normalized === '' || normalized === 'no') return false;
      }
      return false;
    };
    const parseMeta = value => {
      if (!value) return {};
      if (typeof value === 'object') return value;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return {};
        }
      }
      return {};
    };
    const statusValue = String(firstValue(source.status, source.notification_status)).trim().toLowerCase();
    const isRead = parseBoolean(firstValue(source.is_read, source.isRead, source.read)) || statusValue === 'read';
    return {
      notification_id: String(firstValue(source.notification_id, source.id)).trim(),
      created_at: String(firstValue(source.created_at, source.createdAt, source.timestamp, source.date)).trim(),
      type: String(firstValue(source.type, source.notification_type)).trim().toLowerCase(),
      title: String(firstValue(source.title, source.notification_title, 'Untitled notification')).trim(),
      message: String(firstValue(source.message, source.notification_message, source.details)).trim(),
      resource: String(firstValue(source.resource, source.target_resource)).trim().toLowerCase(),
      resource_id: String(firstValue(source.resource_id, source.target_resource_id)).trim(),
      action_required: parseBoolean(source.action_required),
      action_label: String(firstValue(source.action_label, source.actionLabel)).trim(),
      priority: String(firstValue(source.priority, source.priority_level)).trim().toLowerCase(),
      status: String(firstValue(source.status, source.notification_status)).trim(),
      is_read: isRead,
      read_at: String(firstValue(source.read_at, source.readAt)).trim(),
      link_target: String(firstValue(source.link_target, source.link, source.target_link)).trim(),
      meta: parseMeta(firstValue(source.meta, source.meta_json))
    };
  },
  extractRows(payload) {
    const candidates = [
      payload,
      payload?.rows,
      payload?.items,
      payload?.notifications,
      payload?.data,
      payload?.result,
      payload?.payload,
      payload?.data?.rows,
      payload?.data?.items,
      payload?.data?.notifications,
      payload?.result?.rows,
      payload?.result?.items,
      payload?.result?.notifications,
      payload?.payload?.rows,
      payload?.payload?.items,
      payload?.payload?.notifications
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  },
  formatDate(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return U.fmtDisplayDate(value);
  },
  iconForType(type = '') {
    const value = String(type || '').toLowerCase();
    if (value.includes('approval')) return '✅';
    if (value.includes('operation')) return '🧭';
    if (value.includes('ticket')) return '🎫';
    if (value.includes('assign')) return '👤';
    if (value.includes('onboarding')) return '🚀';
    return '🔔';
  },
  isHighPriority(item = {}) {
    return String(item.priority || '').toLowerCase() === 'high';
  },
  isApproval(item = {}) {
    return String(item.type || '').includes('approval');
  },
  isOperations(item = {}) {
    const t = String(item.type || '');
    const r = String(item.resource || '');
    return t.includes('operation') || r.includes('operations_onboarding');
  },
  isTicket(item = {}) {
    const t = String(item.type || '');
    const r = String(item.resource || '');
    return t.includes('ticket') || r.includes('ticket') || r.includes('issues');
  },
  isAssignment(item = {}) {
    const t = String(item.type || '');
    return t.includes('assignment') || t.includes('assigned');
  },
  getFilteredItems() {
    const mode = this.state.filters.mode || 'all';
    const search = String(this.state.filters.search || '').trim().toLowerCase();
    let list = Array.isArray(this.state.items) ? this.state.items.slice() : [];
    if (mode === 'unread') list = list.filter(item => !item.is_read);
    if (mode === 'approvals') list = list.filter(item => this.isApproval(item));
    if (mode === 'operations') list = list.filter(item => this.isOperations(item));
    if (mode === 'tickets') list = list.filter(item => this.isTicket(item));
    if (mode === 'assignments') list = list.filter(item => this.isAssignment(item));
    if (mode === 'high') list = list.filter(item => this.isHighPriority(item));

    if (search) {
      const terms = search.split(/\s+/).filter(Boolean);
      list = list.filter(item => {
        const hay = [
          item.title,
          item.message,
          item.type,
          item.priority,
          item.resource,
          item.resource_id,
          item.action_label
        ]
          .join(' ')
          .toLowerCase();
        return terms.every(term => hay.includes(term));
      });
    }
    return list;
  },
  getTitleFromAny(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    return String(
      source.title ||
      source.notification_title ||
      source.message ||
      source.notification_message ||
      source.details ||
      '—'
    ).trim() || '—';
  },
  toFallbackView(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const firstValue = (...values) => {
      for (const value of values) {
        if (value !== undefined && value !== null && value !== '') return value;
      }
      return '';
    };
    return {
      notification_id: String(firstValue(source.notification_id, source.id)).trim(),
      title: String(firstValue(source.title, source.notification_title, 'Untitled notification')).trim(),
      message: String(firstValue(source.message, source.notification_message, source.details)).trim(),
      type: String(firstValue(source.type, source.notification_type)).trim(),
      created_at: String(firstValue(source.created_at, source.createdAt, source.timestamp, source.date)).trim(),
      status: String(firstValue(source.status, source.notification_status)).trim(),
      action_label: String(firstValue(source.action_label, source.actionLabel)).trim()
    };
  },
  async refreshUnreadCount() {
    if (!Session.isAuthenticated()) {
      this.state.unreadCount = 0;
      this.renderBell();
      return 0;
    }
    try {
      const count = await Api.getNotificationUnreadCount();
      this.state.unreadCount = Number(count) || 0;
      this.renderBell();
      return this.state.unreadCount;
    } catch (error) {
      console.warn('Unable to refresh notification unread count', error);
      return this.state.unreadCount;
    }
  },
  async fetchPreview(force = false) {
    if (!Session.isAuthenticated()) {
      this.state.previewItems = [];
      this.renderPreview();
      return;
    }
    this.state.previewLoading = true;
    this.renderPreview();
    try {
      const response = await Api.listNotifications({
        limit: 10,
        forceRefresh: force
      });
      const rows = this.extractRows(response).map(item => this.normalize(item));
      this.state.previewItems = rows.slice(0, 10);
    } catch (error) {
      console.warn('Unable to load notification preview', error);
      this.state.previewItems = [];
    } finally {
      this.state.previewLoading = false;
      this.renderPreview();
    }
  },
  async loadHub(force = false) {
    if (!E.notificationsView?.classList.contains('active') && !force) return;
    if (force && E.notificationsView?.classList.contains('active') && !this.state.lastFetchedAt) {
      this.state.filters.mode = 'all';
      this.state.filters.search = '';
      if (E.notificationsSearchInput) E.notificationsSearchInput.value = '';
      if (E.notificationsFilterButtons) {
        E.notificationsFilterButtons.querySelectorAll('[data-filter]').forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-filter') === 'all');
        });
      }
    }
    if (!Session.isAuthenticated()) {
      this.state.items = [];
      this.renderHub();
      return;
    }
    this.state.loading = true;
    this.renderHub();
    try {
      const mode = this.state.filters.mode || 'all';
      const search = this.state.filters.search || '';
      const payload = {
        limit: 200,
        unread_only: mode === 'unread',
        search,
        priority: mode === 'high' ? 'high' : ''
      };

      const response = await Api.listNotifications(payload);
      this.state.rawResponse = response;
      console.debug('[notifications] raw response', response);
      const rows = this.extractRows(response);
      this.state.rawRows = Array.isArray(rows) ? rows.slice() : [];
      console.debug('[notifications] extracted rows', rows);
      const normalizedItems = rows.map(item => this.normalize(item));
      console.debug('[notifications] normalized items', normalizedItems);
      console.debug('[notifications] active filters', this.state.filters);
      this.state.items = normalizedItems;
      this.state.lastFetchedAt = new Date().toISOString();
      if (rows.length > 0 && normalizedItems.length === 0) {
        this.state.rawRows = rows.slice();
      }
    } catch (error) {
      console.warn('Unable to load notifications hub', error);
      this.state.items = [];
      this.state.rawResponse = null;
      this.state.rawRows = [];
      UI.toast('Unable to load notifications right now.');
    } finally {
      this.state.loading = false;
      this.renderHub();
    }
  },
  async refreshAll(force = false) {
    await this.refreshUnreadCount();
    await this.fetchPreview(force);
    await this.loadHub(force);
  },
  updateLocalRead(notificationId) {
    if (!notificationId) return;
    const update = list => list.map(item => {
      if (item.notification_id !== notificationId) return item;
      return {
        ...item,
        is_read: true,
        status: item.status || 'read',
        read_at: new Date().toISOString()
      };
    });
    this.state.items = update(this.state.items);
    this.state.previewItems = update(this.state.previewItems);
  },
  async markRead(notificationId) {
    if (!notificationId || !Session.isAuthenticated()) return;
    this.updateLocalRead(notificationId);
    this.renderHub();
    this.renderPreview();
    try {
      await Api.markNotificationRead(notificationId);
    } catch (error) {
      console.warn('Unable to mark notification as read', error);
    }
    await this.refreshUnreadCount();
  },
  async markAllRead() {
    if (!Session.isAuthenticated()) return;
    try {
      await Api.markAllNotificationsRead();
      this.state.items = this.state.items.map(item => ({ ...item, is_read: true, status: item.status || 'read' }));
      this.state.previewItems = this.state.previewItems.map(item => ({ ...item, is_read: true, status: item.status || 'read' }));
      this.state.unreadCount = 0;
      this.renderBell();
      this.renderPreview();
      this.renderHub();
      UI.toast('All notifications marked as read.');
    } catch (error) {
      console.warn('Unable to mark all notifications as read', error);
      UI.toast('Unable to mark all notifications as read.');
    }
  },
  async handleNotificationClick(item) {
    if (!item) return;
    if (!item.is_read) await this.markRead(item.notification_id);
    this.navigateFromNotification(item);
  },
  resolveTicketId(item = {}) {
    return String(item.resource_id || item.meta?.ticket_id || item.meta?.id || '').trim();
  },
  resolveAgreementId(item = {}) {
    return String(item.resource_id || item.meta?.agreement_id || item.meta?.id || '').trim();
  },
  resolveOperationsAgreementId(item = {}) {
    return String(item.meta?.agreement_id || item.resource_id || '').trim();
  },
  navigateFromNotification(item = {}) {
    try {
      const linkTarget = String(item.link_target || '').trim();
      if (linkTarget) {
        if (linkTarget.startsWith('http://') || linkTarget.startsWith('https://')) {
          window.open(linkTarget, '_blank', 'noopener,noreferrer');
          return;
        }
        if (linkTarget.startsWith('#')) {
          window.location.hash = linkTarget;
          return;
        }
      }

      const resource = String(item.resource || '').toLowerCase();
      if (resource.includes('ticket') || resource.includes('issues')) {
        setActiveView('issues');
        const ticketId = this.resolveTicketId(item);
        if (ticketId && window.UI?.Modals?.openIssue) {
          UI.Modals.openIssue(ticketId);
        }
        return;
      }
      if (resource.includes('agreement')) {
        setActiveView('agreements');
        const agreementId = this.resolveAgreementId(item);
        if (agreementId && window.Agreements?.openAgreementFormById) {
          Agreements.openAgreementFormById(agreementId, { readOnly: true });
        }
        return;
      }
      if (resource.includes('operations_onboarding')) {
        setActiveView('operationsOnboarding');
        const agreementId = this.resolveOperationsAgreementId(item);
        if (agreementId && window.OperationsOnboarding?.state) {
          OperationsOnboarding.state.search = agreementId;
          if (E.operationsOnboardingSearchInput) E.operationsOnboardingSearchInput.value = agreementId;
        }
        if (window.OperationsOnboarding?.loadAndRefresh) {
          OperationsOnboarding.loadAndRefresh({ force: true });
        }
        return;
      }
      if (resource.includes('workflow') || resource.includes('approval')) {
        if (Permissions.canAccessTab('workflow')) {
          setActiveView('workflow');
        } else {
          setActiveView('notifications');
        }
        return;
      }
      if (resource.includes('proposal')) {
        setActiveView('proposals');
        return;
      }
      if (resource.includes('deal')) {
        setActiveView('deals');
        return;
      }
      if (resource.includes('lead')) {
        setActiveView('leads');
        return;
      }
      if (resource.includes('invoice')) {
        setActiveView('invoices');
        return;
      }
      if (resource.includes('receipt')) {
        setActiveView('receipts');
        return;
      }
      setActiveView('notifications');
      UI.toast('Notification opened, but no direct route was available.');
    } catch (error) {
      console.warn('Notification navigation failed', error);
      UI.toast('Notification opened, but route was unavailable.');
    }
  },
  openPanel() {
    this.state.panelOpen = true;
    if (E.notificationPreviewPanel) E.notificationPreviewPanel.classList.add('open');
    this.fetchPreview();
  },
  closePanel() {
    this.state.panelOpen = false;
    if (E.notificationPreviewPanel) E.notificationPreviewPanel.classList.remove('open');
  },
  renderBell() {
    if (!E.notificationUnreadBadge) return;
    const count = Number(this.state.unreadCount) || 0;
    E.notificationUnreadBadge.textContent = count > 99 ? '99+' : String(count);
    E.notificationUnreadBadge.style.display = count > 0 ? 'inline-flex' : 'none';
    if (E.notificationBellBtn) E.notificationBellBtn.setAttribute('aria-label', `Notifications (${count} unread)`);
  },
  renderPreview() {
    if (!E.notificationPreviewList || !E.notificationPreviewState) return;
    if (this.state.previewLoading) {
      E.notificationPreviewState.textContent = 'Loading notifications…';
      E.notificationPreviewList.innerHTML = '';
      return;
    }
    const list = this.state.previewItems || [];
    if (!list.length) {
      E.notificationPreviewState.textContent = 'No new notifications.';
      E.notificationPreviewList.innerHTML = '';
      return;
    }
    E.notificationPreviewState.textContent = '';
    E.notificationPreviewList.innerHTML = list
      .map(item => {
        const cls = item.is_read ? 'notification-item' : 'notification-item unread';
        return `<button type="button" class="${cls}" data-notification-id="${U.escapeAttr(item.notification_id)}">
          <div class="notification-item-head">
            <span>${this.iconForType(item.type)} ${U.escapeHtml(item.title)}</span>
            <span class="muted">${U.escapeHtml(this.formatDate(item.created_at))}</span>
          </div>
          <div class="notification-item-body">${U.escapeHtml(item.message || '—')}</div>
        </button>`;
      })
      .join('');
    E.notificationPreviewList.querySelectorAll('[data-notification-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-notification-id');
        const item = this.state.previewItems.find(row => row.notification_id === id);
        this.closePanel();
        this.handleNotificationClick(item);
      });
    });
  },
  renderDebugInfo() {
    const box = document.getElementById('notificationsDebugBox');
    if (!box) return;
    const endpointDiagnostics =
      typeof Api?.getEndpointDiagnostics === 'function' ? Api.getEndpointDiagnostics() : null;
    const resolvedEndpoint = String(
      endpointDiagnostics?.notificationEndpoint ||
      window.API_RUNTIME_DIAGNOSTICS?.notificationHubEndpoint ||
      window.API_RUNTIME_DIAGNOSTICS?.resolvedEndpoint ||
      ''
    ).trim();
    const isProxy =
      endpointDiagnostics?.isProxy !== undefined
        ? Boolean(endpointDiagnostics.isProxy)
        : Boolean(window.API_RUNTIME_DIAGNOSTICS?.isProxy);
    const rawRows = Array.isArray(this.state.rawRows) ? this.state.rawRows : [];
    const normalizedItems = Array.isArray(this.state.items) ? this.state.items : [];
    const mode = this.state.filters.mode || 'all';
    const search = String(this.state.filters.search || '').trim();
    const titleSource = normalizedItems.length ? normalizedItems : rawRows;
    const sample = titleSource.slice(0, 3).map(item => this.getTitleFromAny(item));
    box.textContent = [
      `Resolved endpoint: ${resolvedEndpoint || '—'}`,
      `Is proxy: ${isProxy ? 'yes' : 'no'}`,
      `Raw rows: ${rawRows.length}`,
      `Normalized items: ${normalizedItems.length}`,
      `Mode: ${mode}`,
      `Search: ${search || '—'}`,
      'Sample:',
      ...(sample.length ? sample.map(title => `- ${title}`) : ['- —'])
    ].join('\n');
  },
  renderHub() {
    if (!E.notificationsState || !E.notificationsTbody) return;
    this.renderDebugInfo();
    if (this.state.loading) {
      E.notificationsState.textContent = 'Loading notifications…';
      E.notificationsTbody.innerHTML = '';
      return;
    }
    const list = this.getFilteredItems();
    const unread = this.state.items.filter(item => !item.is_read);
    const highUnread = unread.filter(item => this.isHighPriority(item)).length;
    const approvalsUnread = unread.filter(item => this.isApproval(item)).length;
    const operationsUnread = unread.filter(item => this.isOperations(item)).length;

    if (E.notificationsSummaryTotalUnread) E.notificationsSummaryTotalUnread.textContent = String(unread.length);
    if (E.notificationsSummaryHighUnread) E.notificationsSummaryHighUnread.textContent = String(highUnread);
    if (E.notificationsSummaryApprovalsUnread) E.notificationsSummaryApprovalsUnread.textContent = String(approvalsUnread);
    if (E.notificationsSummaryOperationsUnread) E.notificationsSummaryOperationsUnread.textContent = String(operationsUnread);

    const lastFetched = this.state.lastFetchedAt ? this.formatDate(this.state.lastFetchedAt) : '—';
    E.notificationsState.textContent = `${list.length} item(s) • Last refreshed: ${lastFetched}`;

    if (!list.length) {
      if (this.state.items.length) {
        console.debug('[notifications] items exist but filters removed all rows', {
          totalItems: this.state.items.length,
          activeFilters: this.state.filters,
          sample: this.state.items.slice(0, 5)
        });
        E.notificationsTbody.innerHTML = '<tr><td colspan="8" class="muted">No notifications found for current filters.</td></tr>';
        return;
      }
      if (this.state.rawRows.length) {
        E.notificationsTbody.innerHTML = this.state.rawRows
          .map(rawItem => {
            const item = this.toFallbackView(rawItem);
            const idAttr = U.escapeAttr(item.notification_id);
            return `<tr>
              <td>${U.escapeHtml(item.title || '—')}</td>
              <td>${U.escapeHtml(item.message || '—')}</td>
              <td>${U.escapeHtml(item.type || '—')}</td>
              <td>${U.escapeHtml(this.formatDate(item.created_at))}</td>
              <td>${U.escapeHtml(item.status || '—')}</td>
              <td>
                <div class="notification-actions">
                  <button type="button" class="btn sm" data-open-notification-raw="${idAttr}">Open</button>
                </div>
              </td>
            </tr>`;
          })
          .join('');
        E.notificationsTbody.querySelectorAll('[data-open-notification-raw]').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-open-notification-raw');
            const rawItem = this.state.rawRows.find(row => String(row?.notification_id || row?.id || '').trim() === id);
            this.handleNotificationClick(this.normalize(rawItem || {}));
          });
        });
        return;
      }
      E.notificationsTbody.innerHTML = '<tr><td colspan="8" class="muted">No notifications found for current filters.</td></tr>';
      return;
    }

    E.notificationsTbody.innerHTML = list
      .map(item => {
        const readLabel = item.is_read ? 'Read' : 'Unread';
        const rowClass = item.is_read ? '' : ' class="notification-row-unread"';
        const priorityClass = this.isHighPriority(item) ? 'chip high-priority' : 'chip';
        return `<tr${rowClass}>
          <td>${this.iconForType(item.type)} ${U.escapeHtml(item.title)}</td>
          <td>${U.escapeHtml(item.message || '—')}</td>
          <td>${U.escapeHtml(item.type || '—')}</td>
          <td><span class="${priorityClass}">${U.escapeHtml(item.priority || 'normal')}</span></td>
          <td>${U.escapeHtml(this.formatDate(item.created_at))}</td>
          <td>${U.escapeHtml(readLabel)}</td>
          <td>${U.escapeHtml(item.action_label || '—')}</td>
          <td>
            <div class="notification-actions">
              ${item.is_read ? '' : `<button type="button" class="btn ghost sm" data-mark-read="${U.escapeAttr(item.notification_id)}">Mark read</button>`}
              <button type="button" class="btn sm" data-open-notification="${U.escapeAttr(item.notification_id)}">Open</button>
            </div>
          </td>
        </tr>`;
      })
      .join('');

    E.notificationsTbody.querySelectorAll('[data-mark-read]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const id = btn.getAttribute('data-mark-read');
        await this.markRead(id);
      });
    });
    E.notificationsTbody.querySelectorAll('[data-open-notification]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-open-notification');
        const item = this.state.items.find(row => row.notification_id === id);
        this.handleNotificationClick(item);
      });
    });
  },
  handleFilterChange(mode) {
    this.state.filters.mode = mode;
    if (E.notificationsFilterButtons) {
      E.notificationsFilterButtons.querySelectorAll('[data-filter]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-filter') === mode);
      });
    }
    this.renderHub();
  },
  startPolling() {
    this.stopPolling();
    this.state.pollTimer = window.setInterval(() => {
      if (!Session.isAuthenticated()) return;
      this.refreshUnreadCount();
      if (this.state.panelOpen) this.fetchPreview();
    }, this.POLL_INTERVAL_MS);
  },
  stopPolling() {
    if (this.state.pollTimer) {
      clearInterval(this.state.pollTimer);
      this.state.pollTimer = null;
    }
  },
  reset() {
    this.stopPolling();
    this.state.items = [];
    this.state.rawResponse = null;
    this.state.rawRows = [];
    this.state.previewItems = [];
    this.state.unreadCount = 0;
    this.state.loading = false;
    this.state.previewLoading = false;
    this.state.filters.mode = 'all';
    this.state.filters.search = '';
    this.state.lastFetchedAt = '';
    if (E.notificationsSearchInput) E.notificationsSearchInput.value = '';
    if (E.notificationsFilterButtons) {
      E.notificationsFilterButtons.querySelectorAll('[data-filter]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-filter') === 'all');
      });
    }
    this.closePanel();
    this.renderBell();
    this.renderPreview();
    this.renderHub();
  },
  onAuthStateChanged() {
    if (!Session.isAuthenticated()) {
      this.reset();
      return;
    }
    this.reset();
    this.state.filters.mode = 'all';
    this.state.filters.search = '';
    this.startPolling();
    this.refreshAll(true);
  },
  wire() {
    if (E.notificationBellBtn) {
      E.notificationBellBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (this.state.panelOpen) this.closePanel();
        else this.openPanel();
      });
    }
    document.addEventListener('click', e => {
      if (!this.state.panelOpen) return;
      if (E.notificationPreviewPanel?.contains(e.target) || E.notificationBellBtn?.contains(e.target)) return;
      this.closePanel();
    });
    if (E.notificationOpenHubBtn) {
      E.notificationOpenHubBtn.addEventListener('click', () => {
        this.closePanel();
        setActiveView('notifications');
      });
    }
    if (E.notificationsMarkAllBtn) {
      E.notificationsMarkAllBtn.addEventListener('click', () => this.markAllRead());
    }
    if (E.notificationsRefreshBtn) {
      E.notificationsRefreshBtn.addEventListener('click', () => this.refreshAll(true));
    }
    if (E.notificationsSearchInput) {
      E.notificationsSearchInput.addEventListener('input', debounce(() => {
        this.state.filters.search = String(E.notificationsSearchInput.value || '').trim();
        this.renderHub();
      }, 250));
    }
    if (E.notificationsFilterButtons) {
      E.notificationsFilterButtons.querySelectorAll('[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => this.handleFilterChange(btn.getAttribute('data-filter') || 'all'));
      });
    }
    this.renderBell();
    this.renderPreview();
    this.renderHub();
  }
};

window.Notifications = Notifications;
