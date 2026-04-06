/* ---------- Elements cache ---------- */
const E = {};
function cacheEls() {
  [
    'issuesTable',
    'issuesTbody',
    'tbodySkeleton',
    'columnToggleBtn',
    'bulkEditBtn',
    'bulkEditModal',
    'bulkEditForm',
    'bulkEditClose',
    'bulkEditCancel',
    'bulkIssueIds',
    'bulkPriority',
    'bulkStatus',
    'bulkDevTeamStatus',
    'bulkNotes',
    'columnPanel',
    'columnList',
    'rowCount',
    'moduleFilter',
    'categoryFilter',
    'priorityFilter',
    'statusFilter',
    'devTeamStatusFilter',
    'devTeamStatusFilterRow',
    'issueRelatedFilter',
    'issueRelatedFilterRow',
    'resetBtn',
    'refreshNow',
    'exportCsv',
    'kpis',
    'issueModal',
    'modalBody',
    'modalTitle',
    'replyRecipientLabel',
    'replyEmailBtn',
    'exportIssuePdf',
    'exportIssueExcel',
    'copyLink',
    'editIssueBtn',
    'modalClose',
    'editIssueModal',
    'editIssueForm',
    'editIssueClose',
    'editIssueCancel',
    'editIssueTitleInput',
    'editIssueDesc',
    'editIssueModule',
    'editIssuePriority',
    'editIssueStatus',
    'editIssueType',
    'editIssueDepartment',
    'editIssueName',
    'editIssueEmail',
    'editIssueYoutrackReference',
    'editIssueDevTeamStatus',
    'editIssueRelated',
    'editIssueFile',
    'editIssueDate',
    'drawerBtn',
    'drawerBtn',
    'sidebar',
     'app',
    'spinner',
    'toast',
    'searchInput',
    'loginForm',
    'loginRole',
    'loginPasscode',
    'loginBtn',
    'loginHint',
    'logoutBtn',
     'savedViews',
    'saveViewBtn',
    'deleteViewBtn',
    'themeSelect',
    'firstPage',
    'prevPage',
    'nextPage',
    'lastPage',
    'pageInfo',
    'pageSize',
    'createTicketBtn',
    'startDateFilter',
    'endDateFilter',
    'issuesTab',
    'calendarTab',
    'insightsTab',
    'issuesView',
    'calendarView',
    'insightsView',
    'addEventBtn',
    'eventModal',
    'eventModalTitle',
    'eventModalClose',
    'eventForm',
    'eventTitle',
    'eventType',
    'eventIssueId',
    'eventStart',
    'eventEnd',
    'eventDescription',
    'eventSave',
    'eventCancel',
    'eventDelete',
    'eventIssueLinkedInfo',
    'eventChecklistStatus',
    'aiPatternsList',
    'aiLabelsList',
    'aiRisksList',
   'aiClustersList',
    'aiClustersDetail',
    'aiScopeText',
    'aiSignalsText',
    'aiTrendsList',
    'aiModulesTableBody',
    'aiTriageList',
    'aiEventsList',
    'aiQueryInput',
    'aiQueryRun',
    'aiQueryResults',
    'aiQueryApplyFilters',
    'aiIncidentsList',
    'aiEmergingStable',
    'aiOpsCockpit',
    'syncIssuesText',
    'syncIssuesDot',
    'syncEventsText',
    'syncEventsDot',
    'aiAnalyzing',
    'eventFilterDeployment',
    'eventFilterMaintenance',
    'eventFilterRelease',
    'eventFilterOther',
    'loadingStatus',
    'issuesSummaryText',
    'issuesLastUpdated',
    'activeFiltersChips',
    'calendarTz',
    'onlineStatusChip',
    'currentRoleChip',
    'accentColor',
    'heroTriagePct',
    'heroHighImpactCount',
    'heroChangeReadiness',
    'shortcutsHelp',
    'aiQueryExport',
    'eventAllDay',
    'eventEnv',
    'eventOwner',
    'eventStatus',
    'eventModules',
    'eventImpactType',
    // Release Planner IDs
    'plannerRegion',
    'plannerEnv',
    'plannerModules',
    'plannerHorizon',
    'plannerReleaseType',
    'plannerRun',
    'plannerResults',
    'plannerDescription',
    'plannerSlotsPerDay',
    'plannerReleasePlan',
    'plannerTickets',
    'plannerAssignBtn',
    'plannerAddEvent',
    'plannerExportScorecard',
    'releasePlannerCard',
    'freezeWindowsCard',
    'freezeManageBtn',
    'freezeManageBtnSecondary',
    'freezeWindowsList',
    'freezeModal',
    'freezeModalClose',
    'freezeModalList',
    'freezeForm',
    'freezeStart',
    'freezeEnd',
    'freezeReset'
    ,
  ].forEach(id => (E[id] = document.getElementById(id)));
}

/** UI helpers */
const UI = {
  toast(msg, ms = 3500) {
    if (!E.toast) return;
    const normalizedMsg = String(msg ?? '')
      .replace(/\\n/g, ' ')
      .replace(/\s*\n\s*/g, ' ')
      .trim();
    E.toast.textContent = normalizedMsg;
    E.toast.style.display = 'block';
    setTimeout(() => {
      if (E.toast) E.toast.style.display = 'none';
    }, ms);
  },
  spinner(v = true) {
    if (E.spinner) E.spinner.style.display = v ? 'flex' : 'none';
    if (E.loadingStatus) E.loadingStatus.textContent = v ? 'Loading…' : '';
  },
  setSync(which, ok, when) {
    const txt = which === 'issues' ? E.syncIssuesText : E.syncEventsText;
    const dot = which === 'issues' ? E.syncIssuesDot : E.syncEventsDot;
    if (!txt || !dot) return;
    const rawTimestamp = when == null ? '' : String(when).replace(/\s*\n\s*/g, ' ').trim();
    const formattedTimestamp = rawTimestamp ? U.fmtTS(rawTimestamp) : '';
    const syncTimestamp = formattedTimestamp && formattedTimestamp !== '—' ? formattedTimestamp : 'never';
    txt.textContent = `${which === 'issues' ? 'Issues' : 'Events'}: ${syncTimestamp}`;
    dot.className = 'dot ' + (ok ? 'ok' : 'err');
  },
  setAnalyzing(v) {
    if (E.aiAnalyzing) E.aiAnalyzing.style.display = v ? 'block' : 'none';
  },
  applyRolePermissions() {
    const role = Session.role() || 'guest';
    const canUseInternalIssueFilters = Permissions.canUseInternalIssueFilters();
    const canManageFreezeWindows = Permissions.canManageFreezeWindows();
    const canChangePlanner = Permissions.canChangePlanner();

    if (!canUseInternalIssueFilters) {
      Filters.state.devTeamStatus = 'All';
      Filters.state.issueRelated = 'All';
      Filters.save();
      setIfOptionExists(E.devTeamStatusFilter, 'All');
      setIfOptionExists(E.issueRelatedFilter, 'All');
    }

    if (E.currentRoleChip) E.currentRoleChip.textContent = `Role: ${role}`;
    if (E.addEventBtn) E.addEventBtn.style.display = Permissions.canManageEvents() ? '' : 'none';
    if (E.freezeManageBtn) E.freezeManageBtn.style.display = canManageFreezeWindows ? '' : 'none';
    if (E.freezeManageBtnSecondary) E.freezeManageBtnSecondary.style.display = canManageFreezeWindows ? '' : 'none';
    if (E.freezeWindowsCard) E.freezeWindowsCard.style.display = canManageFreezeWindows ? '' : 'none';
    if (E.plannerAddEvent) E.plannerAddEvent.style.display = canChangePlanner ? '' : 'none';
    if (E.plannerAssignBtn) E.plannerAssignBtn.style.display = canChangePlanner ? '' : 'none';
    if (E.releasePlannerCard) E.releasePlannerCard.style.display = canChangePlanner ? '' : 'none';
    if (E.editIssueBtn) E.editIssueBtn.style.display = Permissions.canEditTicket() ? '' : 'none';
    if (E.bulkEditBtn) E.bulkEditBtn.style.display = Permissions.canEditTicket() ? '' : 'none';
    if (E.devTeamStatusFilterRow)
      E.devTeamStatusFilterRow.style.display = canUseInternalIssueFilters ? '' : 'none';
    if (E.issueRelatedFilterRow)
      E.issueRelatedFilterRow.style.display = canUseInternalIssueFilters ? '' : 'none';
    // Re-apply role-scoped column visibility immediately after login/logout
    // so viewer-restricted columns are hidden without requiring refresh.
    ColumnManager.renderPanel();
    ColumnManager.apply();
  },
  updateHeroMetrics(rows) {
    if (!E.heroTriagePct && !E.heroHighImpactCount && !E.heroChangeReadiness) return;
    const safeRows = Array.isArray(rows) ? rows : [];
    const parseDate = value => {
      if (!value) return null;
      const d = new Date(value);
      return isNaN(d) ? null : d;
    };

    const triageDurations = safeRows
      .map(r => {
        const created = parseDate(r.date);
        const triaged = parseDate(r.notificationSent || r.notificationUnderReview);
        if (!created || !triaged) return null;
        return (triaged - created) / 3600000;
      })
      .filter(v => v != null && v >= 0);

    const triageUnderTwo = triageDurations.filter(v => v <= 2).length;
    const triagePct = triageDurations.length
      ? Math.round((triageUnderTwo / triageDurations.length) * 100)
      : 0;
    if (E.heroTriagePct) E.heroTriagePct.textContent = `${triagePct}%`;

    const dailyHighImpact = safeRows.filter(r => {
      const created = parseDate(r.date);
      if (!created) return false;
      if (!U.isBetween(created, U.daysAgo(1), null)) return false;
      const meta = DataStore.computed.get(r.id);
      const impactScore = meta?.risk?.impact ?? 0;
      return impactScore >= 4 || r.priority === 'High';
    }).length;
    if (E.heroHighImpactCount) E.heroHighImpactCount.textContent = String(dailyHighImpact);

    const reviewDurations = safeRows
      .map(r => {
        const created = parseDate(r.date);
        const reviewed = parseDate(r.notificationUnderReview);
        if (!created || !reviewed) return null;
        return (reviewed - created) / 3600000;
      })
      .filter(v => v != null && v >= 0);
    const avgReviewHours = reviewDurations.length
      ? reviewDurations.reduce((a, b) => a + b, 0) / reviewDurations.length
      : 0;
    const baselineHours = 24;
    const speed = avgReviewHours ? baselineHours / avgReviewHours : 0;
    if (E.heroChangeReadiness) {
      E.heroChangeReadiness.textContent = `${speed ? speed.toFixed(1) : '0'}x`;
    }
  },
  skeleton(show) {
    if (!E.issuesTbody || !E.tbodySkeleton) return;
    E.tbodySkeleton.style.display = show ? '' : 'none';
    E.issuesTbody.style.display = show ? 'none' : '';
  }
};

const GridState = {
  sortKey: 'date',
  sortAsc: false,
  page: 1,
  pageSize: +(localStorage.getItem(LS_KEYS.pageSize) || 20)
};

function buildIssueCategoryOptions(extra = []) {
  const allowedCategories = ['Bug', 'Enhancement', 'New Features'];
  const selectedExtras = extra
    .filter(Boolean)
    .map(v => String(v).trim().toLowerCase())
    .filter(v => allowedCategories.includes(v));
  return [...new Set([...allowedCategories, ...selectedExtras])];
}
