(function () {
  const MODULES = [
    { id: 'companyView', subtitle: 'Manage company records, contacts, and lifecycle', summary: 'company' },
    { id: 'contactsView', subtitle: 'Manage contact records and linked companies', summary: 'contacts' },
    { id: 'leadsView', subtitle: 'Track lead intake, follow-ups, and qualification', skipSummary: true },
    { id: 'dealsView', subtitle: 'Monitor pipeline progression and deal health', skipSummary: true },
    { id: 'proposalsView', subtitle: 'Create, review, and track commercial proposals' },
    { id: 'agreementsView', subtitle: 'Manage agreements, renewals, and signatures' },
    { id: 'invoicesView', subtitle: 'Review billing, status, and collections' },
    { id: 'receiptsView', subtitle: 'Track collections and issued receipts' },
    { id: 'clientsView', subtitle: 'Monitor client accounts, renewals, and statements', skipSummary: true },
    { id: 'creditNotesView', subtitle: 'Manage issued credit notes and adjustments' },
    { id: 'paymentForecastView', subtitle: 'Follow scheduled cash collection and overdue payments', skipSummary: true },
    { id: 'renewalForecastView', subtitle: 'Track upcoming renewals and renewal decisions', skipSummary: true },
    { id: 'binersView', subtitle: 'Manage payables, schedules, and payable forecasts', skipSummary: true }
  ];

  function parseNumber(text) {
    const match = String(text || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : 0;
  }

  function getPrimaryCard(view) {
    return view.querySelector(':scope > .card') || view.querySelector('.card') || view.firstElementChild;
  }

  function ensureHeader(view, config) {
    const card = getPrimaryCard(view);
    if (!card) return null;

    let header = card.querySelector(':scope > .module-page-header');
    if (!header) {
      header = Array.from(card.children).find((el) => {
        if (!(el instanceof HTMLElement)) return false;
        if (el.classList.contains('table-wrap') || el.classList.contains('stack')) return false;
        return Boolean(el.querySelector('h1,h2,h3,strong')) && Boolean(el.querySelector('button,.btn,input[type="search"],.input,.select'));
      });
      if (!header) {
        header = Array.from(card.children).find((el) => el.querySelector && el.querySelector('h1,h2,h3,strong'));
      }
      if (header) header.classList.add('module-page-header');
    }
    if (!header) return null;

    let titleWrap = Array.from(header.children || []).find((el) => el.querySelector && el.querySelector('h1,h2,h3,strong'));
    if (!titleWrap) {
      titleWrap = document.createElement('div');
      while (header.firstChild) titleWrap.appendChild(header.firstChild);
      header.appendChild(titleWrap);
    }
    titleWrap.classList.add('module-page-titleblock');

    const titleEl = titleWrap.querySelector('h1,h2,h3,strong');
    if (titleEl) {
      titleEl.classList.add('module-page-title');
      if (titleEl.tagName === 'STRONG') {
        const replacement = document.createElement('h2');
        replacement.innerHTML = titleEl.innerHTML;
        replacement.className = titleEl.className;
        titleEl.replaceWith(replacement);
      }
    }

    if (config.subtitle && !titleWrap.querySelector('.module-page-subtitle')) {
      const subtitle = document.createElement('div');
      subtitle.className = 'module-page-subtitle';
      subtitle.textContent = config.subtitle;
      titleWrap.appendChild(subtitle);
    }

    let actions = Array.from(header.children || []).find((el) => el !== titleWrap);
    if (actions) actions.classList.add('module-page-actions');
    card.classList.add('module-shell-card');
    view.classList.add('module-unified-view');
    view.dataset.moduleEnhanced = 'true';
    return { card, header };
  }

  function ensureFilterPanel(view) {
    const card = getPrimaryCard(view);
    if (!card) return;

    const stack = Array.from(card.children).find((el) => el.classList && el.classList.contains('stack'));
    if (stack) {
      stack.classList.add('module-filter-panel');
      if (!stack.querySelector(':scope > .module-panel-title')) {
        const heading = document.createElement('div');
        heading.className = 'module-panel-title';
        heading.innerHTML = '<span class="module-panel-icon">⌕</span><div><strong>Filters</strong><div class="muted">Narrow down the visible records</div></div>';
        stack.insertBefore(heading, stack.firstChild);
      }
      const rows = Array.from(stack.children).filter((el) => el.classList && el.classList.contains('row'));
      if (rows[0]) rows[0].classList.add('module-filter-grid');
      if (rows[1]) rows[1].classList.add('module-table-toolbar');
    }

    const leadsFilters = document.getElementById('leadsFiltersPanel');
    const dealsFilters = document.getElementById('dealsFiltersPanel');
    if (view.id === 'leadsView' && leadsFilters) leadsFilters.classList.add('module-side-filter-panel');
    if (view.id === 'dealsView' && dealsFilters) dealsFilters.classList.add('module-side-filter-panel');

    const pfFilters = view.querySelector('.pf-filters, .payment-forecast-filters');
    if (pfFilters) pfFilters.classList.add('module-filter-panel');
  }

  function ensureTablePanel(view) {
    const card = getPrimaryCard(view);
    if (!card) return;
    const tableWrap = view.querySelector('.table-wrap');
    if (!tableWrap) return;
    tableWrap.classList.add('module-table-wrap');

    const table = tableWrap.querySelector('table');
    if (table) table.classList.add('module-data-table');

    const tableActions = tableWrap.nextElementSibling;
    if (tableActions && tableActions.classList.contains('table-actions')) {
      tableActions.classList.add('module-pagination-bar');
    }
  }

  function buildSummaryCard(label, value, accentClass) {
    return `<article class="module-summary-card ${accentClass || ''}"><div class="module-summary-label">${label}</div><div class="module-summary-value">${value}</div></article>`;
  }

  function collectTableRows(view) {
    return Array.from(view.querySelectorAll('tbody tr')).filter((row) => row.children && row.children.length);
  }

  function extractTotal(view) {
    const pageInfo = Array.from(view.querySelectorAll('[id$="PageInfo"], #pageInfo, .pf-state, .muted')).find((el) => /of\s+\d+/i.test(el.textContent || ''));
    if (!pageInfo) return collectTableRows(view).length;
    const match = pageInfo.textContent.match(/of\s+([\d,]+)/i);
    return match ? Number(match[1].replace(/,/g, '')) : collectTableRows(view).length;
  }

  function countActiveFilters(view) {
    return Array.from(view.querySelectorAll('input,select,textarea'))
      .filter((el) => !el.disabled && !/rowsperpage|pageSize/i.test(el.id || ''))
      .filter((el) => {
        if (el.type === 'search' || el.type === 'text' || el.type === 'date' || el.tagName === 'SELECT') {
          const value = String(el.value || '').trim().toLowerCase();
          return value && value !== 'all' && value !== 'all statuses' && value !== 'all types' && value !== 'all industries' && value !== 'all companies' && value !== 'all roles' && value !== 'country' && value !== 'city';
        }
        return false;
      }).length;
  }

  function getSummaryData(view, config) {
    const rows = collectTableRows(view);
    const total = extractTotal(view);
    const filters = countActiveFilters(view);
    const rowsPerPage = parseNumber(view.querySelector('#companyRowsPerPage, #contactsRowsPerPage, #pageSize, [id$="RowsPerPage"]')?.value || rows.length);

    if (config.summary === 'company') {
      const verified = rows.filter((row) => /verified/i.test(row.children?.[1]?.textContent || '')).length;
      const active = rows.filter((row) => /active client/i.test(row.children?.[5]?.textContent || '')).length;
      const prospects = rows.filter((row) => /prospect/i.test(row.children?.[5]?.textContent || '')).length;
      return [
        ['Total Companies', total, 'accent-purple'],
        ['Verified', verified, 'accent-green'],
        ['Active Clients', active, 'accent-lime'],
        ['Prospects', prospects, 'accent-blue']
      ];
    }

    if (config.summary === 'contacts') {
      const active = rows.filter((row) => /active/i.test(row.children?.[9]?.textContent || '')).length;
      const primary = rows.filter((row) => /yes|primary/i.test(row.children?.[8]?.textContent || '')).length;
      const companies = new Set(rows.map((row) => (row.children?.[3]?.textContent || '').trim()).filter(Boolean)).size;
      return [
        ['Total Contacts', total, 'accent-purple'],
        ['Active', active, 'accent-green'],
        ['Primary Contacts', primary, 'accent-lime'],
        ['Linked Companies', companies, 'accent-blue']
      ];
    }

    return [
      ['Total Records', total, 'accent-purple'],
      ['Visible Rows', rows.length, 'accent-green'],
      ['Filters Applied', filters, 'accent-lime'],
      ['Rows Per Page', rowsPerPage || rows.length, 'accent-blue']
    ];
  }

  function ensureSummary(view, config) {
    if (config.skipSummary) return;
    if (view.querySelector('.module-summary-grid') || view.querySelector('.leads-analytics, .deals-analytics, #binersSummary, .payment-forecast-summary-grid')) return;
    const info = ensureHeader(view, config);
    if (!info || !info.card) return;
    const grid = document.createElement('div');
    grid.className = 'module-summary-grid';
    grid.innerHTML = getSummaryData(view, config)
      .map(([label, value, accent]) => buildSummaryCard(label, value, accent))
      .join('');
    info.header.insertAdjacentElement('afterend', grid);
  }

  function updateSummary(view, config) {
    const grid = view.querySelector('.module-summary-grid');
    if (!grid) return;
    const data = getSummaryData(view, config);
    grid.innerHTML = data.map(([label, value, accent]) => buildSummaryCard(label, value, accent)).join('');
  }

  function enhance(config) {
    const view = document.getElementById(config.id);
    if (!view) return;
    ensureHeader(view, config);
    ensureFilterPanel(view);
    ensureSummary(view, config);
    ensureTablePanel(view);
    updateSummary(view, config);
  }

  function initObservers() {
    MODULES.forEach((config) => {
      const view = document.getElementById(config.id);
      if (!view || view.dataset.moduleObserverAttached === 'true') return;
      const observer = new MutationObserver(() => enhance(config));
      observer.observe(view, { childList: true, subtree: true, characterData: true });
      view.dataset.moduleObserverAttached = 'true';
    });
  }

  function run() {
    MODULES.forEach(enhance);
    initObservers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }

  window.ModuleListLayout = { refresh: run };
})();
