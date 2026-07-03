(function (global) {
  'use strict';

  function esc(value) {
    if (global.U?.escapeHtml) return global.U.escapeHtml(value);
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }
  function attr(value) {
    if (global.U?.escapeAttr) return global.U.escapeAttr(value);
    return esc(value);
  }
  function getValueByPath(row, path) {
    if (!row || !path) return null;
    return String(path).split('.').reduce((value, key) => value == null ? null : value[key], row);
  }
  function normalizeSortValue(value) {
    if (value == null) return '';
    if (typeof value === 'number') return value;
    const text = String(value).trim();
    const number = Number(text.replace(/,/g, ''));
    if (!Number.isNaN(number) && text !== '') return number;
    const date = Date.parse(text);
    if (!Number.isNaN(date)) return date;
    return text.toLowerCase();
  }
  function sortRows(rows, sortState, columnMap) {
    if (!Array.isArray(rows)) return [];
    if (!sortState?.key || !sortState?.direction) return rows;
    const column = columnMap?.[sortState.key];
    if (!column) return rows;
    const direction = sortState.direction === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = normalizeSortValue(typeof column.accessor === 'function' ? column.accessor(a) : getValueByPath(a, column.accessor || sortState.key));
      const bv = normalizeSortValue(typeof column.accessor === 'function' ? column.accessor(b) : getValueByPath(b, column.accessor || sortState.key));
      if (av < bv) return -1 * direction;
      if (av > bv) return 1 * direction;
      return 0;
    });
  }
  function applyColumnFilters(rows, filters, columnMap) {
    if (!Array.isArray(rows)) return [];
    if (!filters) return rows;
    return rows.filter(row => Object.entries(filters).every(([key, filterValue]) => {
      const value = String(filterValue || '').trim().toLowerCase();
      if (!value) return true;
      const column = columnMap?.[key];
      const rowValue = String(typeof column?.accessor === 'function' ? column.accessor(row) : getValueByPath(row, column?.accessor || key) ?? '').toLowerCase();
      return rowValue.includes(value);
    }));
  }

  function getPaginatedTableRows({ rows, filters, filterFn, sortState, columnMap, currentPage, pageSize }) {
    const allRows = Array.isArray(rows) ? rows : [];
    const safePageSize = Math.max(1, Number(pageSize) || allRows.length || 1);
    const filteredRows = typeof filterFn === 'function'
      ? allRows.filter(row => filterFn(row, filters))
      : allRows;
    const sortedRows = sortRows(filteredRows, sortState, columnMap);
    const totalRows = sortedRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / safePageSize));
    const safePage = Math.min(Math.max(1, Number(currentPage) || 1), totalPages);
    const start = (safePage - 1) * safePageSize;
    const end = start + safePageSize;
    return {
      rows: sortedRows.slice(start, end),
      filteredRows,
      sortedRows,
      totalRows,
      totalPages,
      currentPage: safePage,
      startItem: totalRows === 0 ? 0 : start + 1,
      endItem: Math.min(start + safePageSize, totalRows)
    };
  }
  function nextSortDirection(currentSort, key) {
    if (!currentSort || currentSort.key !== key) return { key, direction: 'asc' };
    if (currentSort.direction === 'asc') return { key, direction: 'desc' };
    return { key: null, direction: null };
  }
  function renderSortableHeader(label, key, sortState) {
    const isActive = sortState?.key === key;
    const direction = isActive ? sortState.direction : null;
    const icon = direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : '↕';
    return `<button type="button" class="sortable-table-header ${isActive ? 'is-active' : ''}" data-action="sort-table" data-sort-key="${attr(key)}" aria-label="Sort by ${attr(label)}"><span>${esc(label)}</span><span class="sortable-table-icon">${icon}</span></button>`;
  }
  function sortState(tableName) { return global.tableSortState?.[tableName] || {}; }
  function columnFilters(tableName) { return global.tableColumnFilters?.[tableName] || {}; }
  function processRows(tableName, rows, columnMap) {
    return sortRows(applyColumnFilters(rows, columnFilters(tableName), columnMap), sortState(tableName), columnMap);
  }
  function resetTablePage(tableName) {
    const map = { invoices: global.Invoices, receipts: global.Receipts, proposals: global.Proposals, agreements: global.Agreements, companies: global.Companies, contacts: global.Contacts, leads: global.Leads, deals: global.Deals, credit_notes: global.CreditNotes, creditNotes: global.CreditNotes, payment_forecast: global.PaymentForecast, paymentForecast: global.PaymentForecast, biners: global.Biners };
    const mod = map[tableName];
    if (mod?.state) { mod.state.page = 1; mod.state.offset = 0; }
  }
  function rerenderTable(tableName) {
    const map = { invoices: global.Invoices, receipts: global.Receipts, proposals: global.Proposals, agreements: global.Agreements, companies: global.Companies, contacts: global.Contacts, leads: global.Leads, deals: global.Deals, credit_notes: global.CreditNotes, creditNotes: global.CreditNotes, payment_forecast: global.PaymentForecast, paymentForecast: global.PaymentForecast, biners: global.Biners };
    const mod = map[tableName];
    if (mod?.refresh) return mod.refresh(true);
    if (mod?.loadAndRefresh) return mod.loadAndRefresh({ force: true });
    if (mod?.renderActiveTab) return mod.renderActiveTab();
    if (mod?.render) return mod.render();
    if (mod?.rerenderVisibleTable) return mod.rerenderVisibleTable();
    if (mod?.render) return mod.render();
  }
  function handleTableSort(tableName, sortKey) {
    if (!tableName || !sortKey) return;
    if (!global.tableSortState) global.tableSortState = {};
    global.tableSortState[tableName] = nextSortDirection(global.tableSortState[tableName] || {}, sortKey);
    resetTablePage(tableName);
    rerenderTable(tableName);
  }
  function ensureHeaders(tableName, table, columns) {
    const tableEl = typeof table === 'string' ? document.getElementById(table) : table;
    const row = tableEl?.querySelector?.('thead tr');
    if (!row) return;
    tableEl.closest('[data-table-name]') || tableEl.parentElement?.setAttribute?.('data-table-name', tableName);
    row.querySelectorAll('th').forEach((th, index) => {
      const col = columns[index];
      if (!col?.key) return;
      th.innerHTML = renderSortableHeader(col.label || th.textContent.trim(), col.key, sortState(tableName));
    });
    const existingFilterRow = row.parentElement?.querySelector?.('tr.table-filter-row');
    const filters = columnFilters(tableName);
    const filterHtml = columns.map(col => col?.key ? `<th><input class="table-column-filter" data-table-filter="${attr(col.key)}" value="${attr(filters[col.key] || '')}" placeholder="Filter..." /></th>` : '<th></th>').join('');
    if (existingFilterRow) existingFilterRow.innerHTML = filterHtml;
    else row.insertAdjacentHTML('afterend', `<tr class="table-filter-row">${filterHtml}</tr>`);
    row.dataset.sortableReady = tableName;
  }
  document.addEventListener('click', event => {
    const sortButton = event.target.closest?.('[data-action="sort-table"]');
    if (!sortButton) return;
    event.preventDefault();
    const tableName = sortButton.closest('[data-table-name]')?.dataset.tableName || global.currentModule || '';
    handleTableSort(tableName, sortButton.dataset.sortKey);
  });
  document.addEventListener('input', event => {
    const filter = event.target.closest?.('[data-table-filter]');
    if (!filter) return;
    const tableName = filter.closest('[data-table-name]')?.dataset.tableName;
    if (!tableName) return;
    if (!global.tableColumnFilters) global.tableColumnFilters = {};
    if (!global.tableColumnFilters[tableName]) global.tableColumnFilters[tableName] = {};
    global.tableColumnFilters[tableName][filter.dataset.tableFilter] = filter.value;
    resetTablePage(tableName); rerenderTable(tableName);
  });
  global.TableUtils = { getValueByPath, normalizeSortValue, sortRows, applyColumnFilters, getPaginatedTableRows, nextSortDirection, renderSortableHeader, sortState, columnFilters, processRows, ensureHeaders, handleTableSort };
})(window);
