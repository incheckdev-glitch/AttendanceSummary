/*
 * Emergency module activation/load safety net.
 * Keeps the main ERP panels visible even if an optional deep-link/router/module loader
 * fails during startup. This file is intentionally defensive and dependency-light.
 */
(function () {
  const HOTFIX_VERSION = '20260703-module-blank-screen-fix1';
  const DEBUG = false;

  const VIEW_MAP = {
    issues: { section: 'issuesView', loader: () => window.loadIssues?.(true) },
    tickets: { section: 'issuesView', view: 'issues', loader: () => window.loadIssues?.(true) },
    calendar: { section: 'calendarView', loader: () => window.ensureCalendar?.() },
    events: { section: 'calendarView', view: 'calendar', loader: () => window.ensureCalendar?.() },
    insights: { section: 'insightsView', loader: () => window.AIInsights?.refresh?.({ force: true }) },
    csm: { section: 'csmView', loader: () => window.CSMActivity?.loadAndRefresh?.({ force: true }) },
    company: { section: 'companyView', loader: () => window.Companies?.loadAndRefresh?.({ force: true }) || window.Company?.loadAndRefresh?.({ force: true }) },
    companies: { section: 'companyView', view: 'company', loader: () => window.Companies?.loadAndRefresh?.({ force: true }) || window.Company?.loadAndRefresh?.({ force: true }) },
    contacts: { section: 'contactsView', loader: () => window.Contacts?.loadAndRefresh?.({ force: true }) || window.Contacts?.refresh?.({ force: true }) },
    leads: { section: 'leadsView', loader: () => window.Leads?.loadAndRefresh?.({ force: true }) },
    deals: { section: 'dealsView', loader: () => window.Deals?.loadAndRefresh?.({ force: true }) },
    proposals: { section: 'proposalsView', loader: () => window.Proposals?.loadAndRefresh?.({ force: true }) || window.Proposals?.refresh?.({ force: true }) },
    agreements: { section: 'agreementsView', loader: () => window.Agreements?.loadAndRefresh?.({ force: true }) || window.Agreements?.refresh?.({ force: true }) },
    proposalCatalog: { section: 'proposalCatalogView', loader: () => window.ProposalCatalog?.loadAndRefresh?.({ force: true }) },
    proposal_catalog: { section: 'proposalCatalogView', view: 'proposalCatalog', loader: () => window.ProposalCatalog?.loadAndRefresh?.({ force: true }) },
    invoices: { section: 'invoicesView', loader: () => window.Invoices?.refresh?.({ force: true }) || window.Invoices?.refresh?.(true) },
    receipts: { section: 'receiptsView', loader: () => window.Receipts?.refresh?.({ force: true }) || window.Receipts?.refresh?.(true) },
    creditNotes: { section: 'creditNotesView', loader: () => window.CreditNotes?.refresh?.({ force: true }) || window.CreditNotes?.refresh?.(true) },
    credit_notes: { section: 'creditNotesView', view: 'creditNotes', loader: () => window.CreditNotes?.refresh?.({ force: true }) || window.CreditNotes?.refresh?.(true) },
    paymentForecast: { section: 'paymentForecastView', loader: () => window.PaymentForecast?.refresh?.(true) || window.PaymentForecast?.refresh?.({ force: true }) },
    payment_forecast: { section: 'paymentForecastView', view: 'paymentForecast', loader: () => window.PaymentForecast?.refresh?.(true) || window.PaymentForecast?.refresh?.({ force: true }) },
    renewalForecast: { section: 'renewalForecastView', loader: () => window.RenewalForecast?.refresh?.(true) || window.RenewalForecast?.refresh?.() },
    renewal_forecast: { section: 'renewalForecastView', view: 'renewalForecast', loader: () => window.RenewalForecast?.refresh?.(true) || window.RenewalForecast?.refresh?.() },
    biners: { section: 'binersView', loader: () => { window.Biners?.init?.(); return window.Biners?.refresh?.(true); } },
    lifecycleAnalytics: { section: 'lifecycleAnalyticsView', loader: () => window.LifecycleAnalytics?.refresh?.({ force: true }) || window.LifecycleAnalytics?.loadAndRefresh?.({ force: true }) },
    lifecycle_analytics: { section: 'lifecycleAnalyticsView', view: 'lifecycleAnalytics', loader: () => window.LifecycleAnalytics?.refresh?.({ force: true }) || window.LifecycleAnalytics?.loadAndRefresh?.({ force: true }) },
    clients: { section: 'clientsView', loader: () => window.Clients?.loadAndRefresh?.({ force: true }) },
    communicationCentre: { section: 'communicationCentreView', loader: () => window.CommunicationCentre?.init?.() || window.CommunicationCentre?.refresh?.() },
    communication_centre: { section: 'communicationCentreView', view: 'communication_centre', loader: () => window.CommunicationCentre?.init?.() || window.CommunicationCentre?.refresh?.() },
    notifications: { section: 'notificationsView', loader: () => window.Notifications?.refreshAll?.(true) || window.Notifications?.renderHub?.() },
    notificationSetup: { section: 'notificationSetupView', loader: () => window.NotificationSettings?.init?.() || window.NotificationSettings?.refresh?.() },
    workflow: { section: 'workflowView', loader: () => window.Workflow?.loadAndRefresh?.(true) || window.Workflow?.loadAndRefresh?.({ force: true }) },
    users: { section: 'usersView', loader: () => window.Users?.refresh?.(true) || window.Users?.loadAndRefresh?.({ force: true }) },
    rolePermissions: { section: 'rolePermissionsView', loader: () => window.RolesAdmin?.refresh?.() || window.RolePermissions?.refresh?.() }
  };

  const canonicalView = value => String(value || '').trim();

  function log(...args) {
    if (DEBUG) console.info('[module-hotfix]', ...args);
  }

  function getTargetFromHash() {
    const raw = String(window.location.hash || '').replace(/^#/, '').trim();
    if (!raw || raw === 'loginSection') return '';
    const [routePart, queryPart = ''] = raw.split('?');
    const route = decodeURIComponent(routePart || '').trim();
    const params = new URLSearchParams(queryPart || '');
    if (route === 'crm') return params.get('tab') || 'company';
    if (route === 'finance') return params.get('tab') || 'invoices';
    if (route === 'clients' && params.get('tab') === 'renewal_forecast') return 'renewal_forecast';
    if (route === 'communication-centre' || route === 'communication_center') return 'communication_centre';
    if (route === 'tickets') return 'issues';
    if (route === 'events') return 'calendar';
    return route;
  }

  function getActiveButtonView() {
    return document.querySelector('.view-tab.active')?.dataset?.view || '';
  }

  function resolveConfig(viewKey) {
    const key = canonicalView(viewKey);
    return VIEW_MAP[key] || VIEW_MAP[key.replace(/-/g, '_')] || null;
  }

  function setPanelActive(viewKey) {
    const config = resolveConfig(viewKey);
    if (!config?.section) return false;
    const actualView = config.view || viewKey;
    const section = document.getElementById(config.section);
    if (!section) {
      console.warn('[module-hotfix] target section not found', { viewKey, section: config.section });
      return false;
    }

    document.querySelectorAll('.content-panels > .view, main.content .view').forEach(panel => {
      const active = panel === section;
      panel.classList.toggle('active', active);
      panel.hidden = false;
      panel.style.display = active ? 'block' : 'none';
      panel.setAttribute('aria-hidden', active ? 'false' : 'true');
    });

    document.querySelectorAll('.view-tab').forEach(button => {
      const active = button.dataset?.view === actualView || button.dataset?.view === viewKey;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    try { localStorage.setItem('incheck360_active_view', actualView); } catch {}
    log('activated', { viewKey, actualView, section: config.section });
    return true;
  }

  async function safeLoad(viewKey) {
    const config = resolveConfig(viewKey);
    if (!config?.loader) return;
    try {
      const result = config.loader();
      if (result && typeof result.then === 'function') await result;
    } catch (error) {
      console.warn('[module-hotfix] optional module loader failed; panel remains visible', { viewKey, error });
    }
  }

  async function activate(viewKey, options = {}) {
    const key = canonicalView(viewKey || getTargetFromHash() || getActiveButtonView() || 'issues');
    if (!key) return false;
    const activated = setPanelActive(key);
    if (!activated) return false;
    if (options.skipLoad !== true) await safeLoad(key);
    return true;
  }

  function recoverBlankScreen() {
    const activePanel = document.querySelector('.content-panels > .view.active, main.content .view.active');
    const hasVisiblePanel = Boolean(activePanel && getComputedStyle(activePanel).display !== 'none');
    const target = getTargetFromHash() || getActiveButtonView() || 'issues';
    if (!hasVisiblePanel) {
      console.warn('[module-hotfix] no active content panel detected; recovering', { target });
      activate(target);
    }
  }

  function bind() {
    document.addEventListener('click', event => {
      const button = event.target?.closest?.('.view-tab[data-view]');
      if (!button) return;
      const viewKey = button.dataset.view;
      window.setTimeout(() => activate(viewKey), 0);
    }, true);

    window.addEventListener('hashchange', () => {
      window.setTimeout(() => activate(getTargetFromHash()), 0);
    });

    window.addEventListener('incheck360:auth-ready', () => {
      window.setTimeout(() => activate(getTargetFromHash() || getActiveButtonView() || 'issues'), 250);
      window.setTimeout(recoverBlankScreen, 1000);
    });

    window.setTimeout(() => activate(getTargetFromHash() || getActiveButtonView() || 'issues'), 500);
    window.setTimeout(recoverBlankScreen, 1500);
  }

  window.InCheckModuleHotfix = {
    version: HOTFIX_VERSION,
    activate,
    recoverBlankScreen
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
