const NotificationSound = {
  STORAGE_KEY: 'notifications:soundEnabled',
  AUDIO_SRC: '/assets/notification.mp3',
  audio: null,
  audioUnlocked: false,
  soundEnabled: true,
  initialized: false,
  seenNotificationIds: new Set(),
  init() {
    if (this.initialized) return;
    this.initialized = true;
    this.soundEnabled = this.readStoredPreference();
    this.audio = new Audio(this.AUDIO_SRC);
    this.audio.preload = 'auto';
    this.audio.volume = 0.7;
    const unlockHandler = () => this.unlock();
    const options = { once: true, passive: true };
    document.addEventListener('click', unlockHandler, options);
    document.addEventListener('keydown', unlockHandler, options);
    document.addEventListener('touchstart', unlockHandler, options);
  },
  readStoredPreference() {
    try {
      const raw = window.localStorage?.getItem(this.STORAGE_KEY);
      if (raw === null) return true;
      return raw === 'true';
    } catch (error) {
      console.debug('[notifications] unable to read sound preference', error);
      return true;
    }
  },
  unlock() {
    if (this.audioUnlocked) return true;
    if (!this.audio) this.audio = new Audio(this.AUDIO_SRC);
    try {
      const maybePromise = this.audio.play();
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise
          .then(() => {
            this.audio.pause();
            this.audio.currentTime = 0;
            this.audioUnlocked = true;
          })
          .catch(error => {
            console.debug('[notifications] audio unlock blocked', error);
          });
      } else {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.audioUnlocked = true;
      }
    } catch (error) {
      console.debug('[notifications] audio unlock failed', error);
      return false;
    }
    return this.audioUnlocked;
  },
  hasSeen(notificationId) {
    return this.seenNotificationIds.has(String(notificationId || ''));
  },
  markSeen(notificationId) {
    const id = String(notificationId || '').trim();
    if (!id) return false;
    const alreadySeen = this.seenNotificationIds.has(id);
    this.seenNotificationIds.add(id);
    return !alreadySeen;
  },
  markSeenMany(items = []) {
    items.forEach(item => this.markSeen(item?.notification_id));
  },
  isEnabled() {
    return this.soundEnabled;
  },
  setEnabled(value) {
    this.soundEnabled = Boolean(value);
    try {
      window.localStorage?.setItem(this.STORAGE_KEY, this.soundEnabled ? 'true' : 'false');
    } catch (error) {
      console.debug('[notifications] unable to persist sound preference', error);
    }
  },
  play() {
    if (!this.soundEnabled || !this.audioUnlocked) return;
    if (!this.audio) this.audio = new Audio(this.AUDIO_SRC);
    try {
      this.audio.currentTime = 0;
      const maybePromise = this.audio.play();
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(error => {
          console.debug('[notifications] audio play blocked', error);
        });
      }
    } catch (error) {
      console.debug('[notifications] audio play failed', error);
    }
  }
};

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
    realtimeChannel: null,
    panelOpen: false,
    unavailable: false,
    unavailableReason: '',
    permissionDenied: false,
    permissionDeniedLogged: false,
    refreshCycleId: 0,
    cyclePermissionLogKey: '',
    seenHydrated: false,
    seenRealtimeNotificationIds: new Set(),
    autoPopupTimer: null,
    previewHovering: false
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
      recipient_user_id: String(firstValue(source.recipient_user_id, source.user_id)).trim(),
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
    return U.formatDateTimeMMDDYYYYHHMM(value);
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
  messageFromError(error) {
    const parts = [
      error?.message,
      error?.details,
      error?.hint,
      error?.error_description,
      error?.code,
      error?.status,
      error?.statusCode,
      error
    ];
    return parts
      .map(part => String(part || '').toLowerCase())
      .filter(Boolean)
      .join(' ');
  },
  isNotificationsUnavailableError(error) {
    const hay = this.messageFromError(error);
    return (
      hay.includes("could not find the table 'public.notifications' in the schema cache") ||
      (hay.includes('schema cache') && hay.includes('notifications')) ||
      (hay.includes('public.notifications') && hay.includes('not found')) ||
      hay.includes('pgrst205') ||
      (hay.includes('404') && hay.includes('notifications')) ||
      (hay.includes('rest') && hay.includes('notifications') && hay.includes('not found'))
    );
  },
  setUnavailable(reason = 'Notifications feature unavailable') {
    if (this.state.unavailable) return;
    this.state.unavailable = true;
    this.state.unavailableReason = String(reason || 'Notifications feature unavailable');
    this.state.items = [];
    this.state.previewItems = [];
    this.state.rawResponse = null;
    this.state.rawRows = [];
    this.state.unreadCount = 0;
    this.state.loading = false;
    this.state.previewLoading = false;
    this.stopPolling();
    this.stopRealtime();
    if (E.notificationBellBtn) {
      E.notificationBellBtn.disabled = true;
      E.notificationBellBtn.setAttribute('aria-disabled', 'true');
      E.notificationBellBtn.title = 'Notifications are unavailable in this environment.';
    }
    if (E.notificationsTab) {
      E.notificationsTab.classList.add('disabled');
      E.notificationsTab.setAttribute('aria-disabled', 'true');
      E.notificationsTab.title = 'Notifications are unavailable in this environment.';
    }
    this.renderBell();
    this.renderPreview();
    this.renderHub();
    console.warn('[notifications] notifications feature marked unavailable for this session', { reason: this.state.unavailableReason });
  },
  clearUnavailable() {
    this.state.unavailable = false;
    this.state.unavailableReason = '';
    if (E.notificationBellBtn) {
      E.notificationBellBtn.disabled = false;
      E.notificationBellBtn.removeAttribute('aria-disabled');
      E.notificationBellBtn.title = '';
    }
    if (E.notificationsTab) {
      E.notificationsTab.classList.remove('disabled');
      E.notificationsTab.removeAttribute('aria-disabled');
      E.notificationsTab.title = '';
    }
  },
  setPermissionDenied(context = 'notifications', error = null) {
    this.state.permissionDenied = true;
    this.state.items = [];
    this.state.previewItems = [];
    this.state.unreadCount = 0;
    this.state.rawResponse = null;
    this.state.rawRows = [];
    this.state.loading = false;
    this.state.previewLoading = false;
    const cycleLogKey = `${this.state.refreshCycleId}:${String(context || 'notifications')}`;
    if (!this.state.permissionDeniedLogged || this.state.cyclePermissionLogKey !== cycleLogKey) {
      console.info('[notifications] permission denied for current role; using empty state.', {
        context,
        message: error?.message || ''
      });
      this.state.permissionDeniedLogged = true;
      this.state.cyclePermissionLogKey = cycleLogKey;
    }
    this.renderBell();
    this.renderPreview();
    this.renderHub();
  },
  hasPermission(action) {
    if (!Session.isAuthenticated()) return false;
    if (!Permissions.state?.loaded) return true;
    return Permissions.canPerformAction('notifications', action, Session.role());
  },
  async refreshUnreadCount() {
    if (!Session.isAuthenticated()) {
      this.state.unreadCount = 0;
      this.renderBell();
      return 0;
    }
    if (this.state.unavailable) {
      this.state.unreadCount = 0;
      this.renderBell();
      return 0;
    }
    if (this.state.permissionDenied) {
      this.state.unreadCount = 0;
      this.renderBell();
      return 0;
    }
    if (!this.hasPermission('get_unread_count')) {
      this.setPermissionDenied('get_unread_count');
      return 0;
    }
    const isNotificationPermissionError = error => {
      if (typeof isPermissionError === 'function' && isPermissionError(error)) return true;
      const message = this.messageFromError(error);
      return (
        (message.includes('forbidden') || message.includes('permission')) &&
        (message.includes('notification') || message.includes('get_unread_count'))
      );
    };
    const isSessionAuthError = error => {
      if (typeof isAuthError === 'function') return isAuthError(error);
      const message = this.messageFromError(error);
      return message.includes('unauthorized') || message.includes('invalid session') || message.includes('expired session');
    };
    try {
      const count = await Api.getNotificationUnreadCount();
      this.state.unreadCount = Number(count) || 0;
      this.renderBell();
      return this.state.unreadCount;
    } catch (error) {
      if (isNotificationPermissionError(error)) {
        this.setPermissionDenied('get_unread_count', error);
        return 0;
      }
      if (this.isNotificationsUnavailableError(error)) {
        this.setUnavailable(error?.message || 'Notifications feature unavailable');
        return 0;
      }
      if (isSessionAuthError(error)) {
        console.warn('Notification unread count refresh detected a true session/auth error; expiring session.', error);
        await handleExpiredSession('Session expired while refreshing notifications.');
        return 0;
      }
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
    if (this.state.unavailable) {
      this.state.previewItems = [];
      this.renderPreview();
      return;
    }
    if (this.state.permissionDenied) {
      this.state.previewItems = [];
      this.renderPreview();
      return;
    }
    if (!this.hasPermission('list')) {
      this.setPermissionDenied('list_preview');
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
      this.handleIncomingNotifications(rows, { source: 'preview' });
    } catch (error) {
      if (this.isNotificationsUnavailableError(error)) {
        this.setUnavailable(error?.message || 'Notifications feature unavailable');
        this.state.previewItems = [];
      } else if (typeof isPermissionError === 'function' && isPermissionError(error)) {
        this.setPermissionDenied('list_preview', error);
      } else {
        console.warn('Unable to load notification preview', error);
        this.state.previewItems = [];
      }
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
    if (this.state.unavailable) {
      this.state.items = [];
      this.renderHub();
      return;
    }
    if (this.state.permissionDenied) {
      this.state.items = [];
      this.renderHub();
      return;
    }
    if (!this.hasPermission('list')) {
      this.setPermissionDenied('list_hub');
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
      this.handleIncomingNotifications(normalizedItems, { source: 'hub' });
      this.state.lastFetchedAt = new Date().toISOString();
      if (rows.length > 0 && normalizedItems.length === 0) {
        this.state.rawRows = rows.slice();
      }
    } catch (error) {
      if (this.isNotificationsUnavailableError(error)) {
        this.setUnavailable(error?.message || 'Notifications feature unavailable');
      } else if (typeof isPermissionError === 'function' && isPermissionError(error)) {
        this.setPermissionDenied('list_hub', error);
      } else {
        console.warn('Unable to load notifications hub', error);
        this.state.items = [];
        this.state.rawResponse = null;
        this.state.rawRows = [];
        UI.toast('Unable to load notifications right now.');
      }
    } finally {
      this.state.loading = false;
      this.renderHub();
    }
  },
  async refreshAll(force = false) {
    this.state.refreshCycleId = Number(this.state.refreshCycleId || 0) + 1;
    if (this.state.unavailable) {
      this.renderBell();
      this.renderPreview();
      this.renderHub();
      return;
    }
    if (this.state.permissionDenied) {
      this.renderBell();
      this.renderPreview();
      this.renderHub();
      return;
    }
    await this.refreshUnreadCount();
    if (this.state.unavailable || this.state.permissionDenied) return;
    await this.fetchPreview(force);
    if (this.state.unavailable || this.state.permissionDenied) return;
    await this.loadHub(force);
  },
  handleIncomingNotifications(items = [], options = {}) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return;
    const userId = String(Session.userId?.() || '').trim();
    if (!this.state.seenHydrated) {
      NotificationSound.markSeenMany(list);
      this.state.seenHydrated = true;
      return;
    }
    list.forEach(item => {
      const id = String(item?.notification_id || '').trim();
      if (!id) return;
      if (NotificationSound.hasSeen(id)) return;
      NotificationSound.markSeen(id);
      const recipientId = String(item?.recipient_user_id || '').trim();
      const belongsToCurrentUser = !recipientId || !userId || recipientId === userId;
      if (!belongsToCurrentUser) return;
      if (item.is_read) return;
      NotificationSound.play();
      console.debug('[notifications] played notification sound', {
        source: options.source || 'unknown',
        notificationId: id
      });
    });
  },
  renderSoundToggle() {
    if (!E.notificationSoundToggleBtn) return;
    const enabled = NotificationSound.isEnabled();
    E.notificationSoundToggleBtn.textContent = enabled ? '🔊 Sound on' : '🔇 Sound off';
    E.notificationSoundToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    E.notificationSoundToggleBtn.title = enabled ? 'Mute notification sound' : 'Unmute notification sound';
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
  sortByNewest(items = []) {
    return (Array.isArray(items) ? items.slice() : []).sort((a, b) => {
      const aTime = Date.parse(a?.created_at || '');
      const bTime = Date.parse(b?.created_at || '');
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
      if (Number.isNaN(aTime)) return 1;
      if (Number.isNaN(bTime)) return -1;
      return bTime - aTime;
    });
  },
  recalculateUnreadCount() {
    this.state.unreadCount = Array.isArray(this.state.items)
      ? this.state.items.filter(item => !item?.is_read).length
      : 0;
    return this.state.unreadCount;
  },
  upsertNotification(rawItem) {
    const item = this.normalize(rawItem);
    const id = String(item?.notification_id || '').trim();
    if (!id) return null;

    const upsertInto = (arr, max = null) => {
      const next = Array.isArray(arr) ? [...arr] : [];
      const idx = next.findIndex(row => String(row?.notification_id || '').trim() === id);
      if (idx >= 0) next[idx] = item;
      else next.unshift(item);
      next.sort((a, b) => {
        const ad = new Date(a?.created_at || 0).getTime();
        const bd = new Date(b?.created_at || 0).getTime();
        return bd - ad;
      });
      return Number.isFinite(max) ? next.slice(0, max) : next;
    };

    this.state.items = upsertInto(this.state.items);
    this.state.previewItems = upsertInto(this.state.previewItems, 10);
    this.recalculateUnreadCount();
    return item;
  },
  removeNotification(notificationId) {
    const id = String(notificationId || '').trim();
    if (!id) return;
    this.state.items = (this.state.items || []).filter(row => String(row?.notification_id || '').trim() !== id);
    this.state.previewItems = (this.state.previewItems || []).filter(row => String(row?.notification_id || '').trim() !== id);
    this.recalculateUnreadCount();
  },
  showInstantNotificationPopup(item) {
    if (!item) return;
    this.renderBell();
    this.renderPreview();
    this.renderHub();

    try {
      if (window.UI?.toast) {
        const title = String(item.title || 'Notification').trim();
        const message = String(item.message || '').trim();
        UI.toast(message ? `${title}: ${message}` : title);
      }
    } catch (error) {
      console.warn('[notifications] toast failed', error);
    }

    if (!E.notificationsView?.classList.contains('active')) {
      this.openPanel();
      if (this.state.autoPopupTimer) clearTimeout(this.state.autoPopupTimer);
      this.state.autoPopupTimer = window.setTimeout(() => {
        if (!this.state.panelOpen) return;
        if (this.state.previewHovering) return;
        if (E.notificationsView?.classList.contains('active')) return;
        this.closePanel();
      }, 5000);
    }
  },
  handleRealtimeInsert(raw) {
    const item = this.normalize(raw);
    const id = String(item?.notification_id || '').trim();
    if (!id) return;
    if (this.state.seenRealtimeNotificationIds.has(id)) return;
    this.state.seenRealtimeNotificationIds.add(id);

    const saved = this.upsertNotification(item);
    if (!saved) return;

    if (!saved.is_read) {
      this.showInstantNotificationPopup(saved);
    } else {
      this.renderBell();
      this.renderPreview();
      this.renderHub();
    }

    this.refreshUnreadCount();
  },
  handleRealtimeUpdate(raw) {
    const item = this.upsertNotification(raw);
    if (!item) return;
    this.renderBell();
    this.renderPreview();
    this.renderHub();
  },
  handleRealtimeDelete(raw) {
    const id = String(raw?.notification_id || raw?.id || '').trim();
    if (!id) return;
    this.removeNotification(id);
    this.renderBell();
    this.renderPreview();
    this.renderHub();
  },
  async markRead(notificationId) {
    if (!notificationId || !Session.isAuthenticated() || this.state.unavailable) return;
    if (!this.hasPermission('mark_read')) {
      this.setPermissionDenied('mark_read');
      return;
    }
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
    if (!Session.isAuthenticated() || this.state.unavailable) return;
    if (!this.hasPermission('mark_all_read')) {
      this.setPermissionDenied('mark_all_read');
      return;
    }
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
  resolveTechnicalAdminTargetId(item = {}) {
    return String(item.meta?.onboarding_uuid || item.resource_id || item.meta?.id || '').trim();
  },
  isTechnicalAdminNotification(item = {}) {
    const type = String(item.type || '').trim().toLowerCase();
    const resource = String(item.resource || '').trim().toLowerCase();
    const linkTarget = String(item.link_target || '').trim().toLowerCase();
    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {};
    if (linkTarget === 'technical_admin' || linkTarget === 'technical_admin_requests') return true;
    if (type === 'technical_admin_request_created' || type === 'technical_request_status_changed') return true;
    return resource === 'operations_onboarding' && !!meta.technical_request_status;
  },
  openTechnicalAdminFromNotification(item = {}) {
    this.closePanel();
    setActiveView('technicalAdmin');
    const highlightRequestId = this.resolveTechnicalAdminTargetId(item);
    if (window.TechnicalAdmin?.loadAndRefresh) {
      TechnicalAdmin.loadAndRefresh({ force: true, highlightRequestId });
    }
  },
  navigateFromNotification(item = {}) {
    try {
      const linkTarget = String(item.link_target || '').trim();
      if (linkTarget) {
        const normalizedLinkTarget = linkTarget.toLowerCase();
        if (normalizedLinkTarget === 'technical_admin' || normalizedLinkTarget === 'technical_admin_requests') {
          this.openTechnicalAdminFromNotification(item);
          return;
        }
        if (linkTarget.startsWith('http://') || linkTarget.startsWith('https://')) {
          window.open(linkTarget, '_blank', 'noopener,noreferrer');
          return;
        }
        if (linkTarget.startsWith('#')) {
          window.location.hash = linkTarget;
          return;
        }
      }

      if (this.isTechnicalAdminNotification(item)) {
        this.openTechnicalAdminFromNotification(item);
        return;
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
    this.fetchPreview(true);
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
    if (this.state.unavailable) {
      E.notificationPreviewState.textContent = 'Notifications are unavailable in this environment.';
      E.notificationPreviewList.innerHTML = '';
      return;
    }
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
    box.style.display = '';
    const rawRows = Array.isArray(this.state.rawRows) ? this.state.rawRows : [];
    const normalizedItems = Array.isArray(this.state.items) ? this.state.items : [];
    const mode = this.state.filters.mode || 'all';
    const search = String(this.state.filters.search || '').trim();
    const titleSource = normalizedItems.length ? normalizedItems : rawRows;
    const sample = titleSource.slice(0, 3).map(item => this.getTitleFromAny(item));
    box.textContent = [
      'Mode: supabase-only',
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
    if (this.state.unavailable) {
      E.notificationsState.textContent = 'Notifications are unavailable in this environment.';
      E.notificationsTbody.innerHTML = '<tr><td colspan="8" class="muted">Notifications are unavailable in this environment.</td></tr>';
      if (E.notificationsSummaryTotalUnread) E.notificationsSummaryTotalUnread.textContent = '0';
      if (E.notificationsSummaryHighUnread) E.notificationsSummaryHighUnread.textContent = '0';
      if (E.notificationsSummaryApprovalsUnread) E.notificationsSummaryApprovalsUnread.textContent = '0';
      if (E.notificationsSummaryOperationsUnread) E.notificationsSummaryOperationsUnread.textContent = '0';
      return;
    }
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
  stopRealtime() {
    try {
      const client = window.SupabaseClient?.getClient?.();
      if (client && this.state.realtimeChannel) client.removeChannel(this.state.realtimeChannel);
    } catch (error) {
      console.warn('Unable to stop notifications realtime channel', error);
    } finally {
      this.state.realtimeChannel = null;
    }
  },
  startRealtime() {
    this.stopRealtime();
    if (!Session.isAuthenticated() || this.state.unavailable || this.state.permissionDenied) return;
    if (!this.hasPermission('list') || !this.hasPermission('get_unread_count')) return;
    const client = window.SupabaseClient?.getClient?.();
    const userId = String(Session.userId?.() || '').trim();
    if (!client || !userId || typeof client.channel !== 'function') return;
    try {
      this.state.realtimeChannel = client
        .channel(`notifications-${userId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${userId}`
        }, payload => {
          try {
            const eventType = String(payload?.eventType || '').toUpperCase();
            if (eventType === 'INSERT') {
              this.handleRealtimeInsert(payload?.new || {});
              return;
            }
            if (eventType === 'UPDATE') {
              this.handleRealtimeUpdate(payload?.new || {});
              return;
            }
            if (eventType === 'DELETE') {
              this.handleRealtimeDelete(payload?.old || {});
              return;
            }
        } catch (error) {
          console.warn('[notifications] realtime handler failed', error);
          this.refreshUnreadCount();
          if (this.state.panelOpen) this.fetchPreview(true);
          if (E.notificationsView?.classList.contains('active')) this.loadHub(true);
        }
      })
      .subscribe((status) => {
        console.debug('[notifications] realtime status', status);
      });
    } catch (error) {
      console.warn('Unable to start notifications realtime channel', error);
      this.state.realtimeChannel = null;
    }
  },
  startPolling() {
    this.stopPolling();
    this.state.pollTimer = window.setInterval(() => {
      if (!Session.isAuthenticated() || this.state.unavailable || this.state.permissionDenied) return;
      if (!this.hasPermission('get_unread_count')) return;
      this.refreshUnreadCount();
      if (this.state.panelOpen && this.hasPermission('list')) this.fetchPreview();
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
    this.stopRealtime();
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
    this.state.permissionDenied = false;
    this.state.permissionDeniedLogged = false;
    this.state.cyclePermissionLogKey = '';
    this.state.refreshCycleId = 0;
    this.state.seenHydrated = false;
    if (this.state.autoPopupTimer) {
      clearTimeout(this.state.autoPopupTimer);
      this.state.autoPopupTimer = null;
    }
    this.state.seenRealtimeNotificationIds = new Set();
    this.state.previewHovering = false;
    this.clearUnavailable();
    NotificationSound.seenNotificationIds.clear();
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
    this.renderSoundToggle();
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
    this.startRealtime();
    this.refreshAll(true);
  },
  wire() {
    NotificationSound.init();
    if (E.notificationBellBtn) {
      E.notificationBellBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (this.state.unavailable) return;
        if (this.state.panelOpen) this.closePanel();
        else this.openPanel();
      });
    }
    if (E.notificationPreviewPanel) {
      E.notificationPreviewPanel.addEventListener('mouseenter', () => {
        this.state.previewHovering = true;
      });
      E.notificationPreviewPanel.addEventListener('mouseleave', () => {
        this.state.previewHovering = false;
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
        if (this.state.unavailable) return;
        setActiveView('notifications');
      });
    }
    if (E.notificationSoundToggleBtn) {
      E.notificationSoundToggleBtn.addEventListener('click', () => {
        const nextValue = !NotificationSound.isEnabled();
        NotificationSound.setEnabled(nextValue);
        this.renderSoundToggle();
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
    this.renderSoundToggle();
  }
};

window.Notifications = Notifications;
