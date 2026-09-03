(function (global) {
  'use strict';

  function installDocumentLinkSanitizer() {
    const utils = global.U;
    if (!utils || utils.__allDocumentLinksSanitized) return;

    const originalStrip = typeof utils.stripInternalDocumentLinks === 'function'
      ? utils.stripInternalDocumentLinks.bind(utils)
      : value => String(value || '');
    const originalAddLogo = typeof utils.addIncheckDocumentLogo === 'function'
      ? utils.addIncheckDocumentLogo.bind(utils)
      : null;

    const actionLabel = /^(?:open|view in erp|erp link|record link|deep link|open link|internal link|hash link)$/i;
    const rawUrlOnly = /^(?:https?:\/\/|www\.)\S+$/i;
    const rawUrlInText = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
    const pdfCleanupStyle = `
      @page { margin: 0 !important; }
      @media print {
        a[href]::after { content: none !important; }
        a[href] { text-decoration: none !important; color: inherit !important; }
      }
    `;

    const cleanPlainText = value => String(value || '')
      .replace(rawUrlInText, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1');

    const injectPdfCleanupStyle = doc => {
      if (!doc || doc.querySelector?.('style[data-incheck-pdf-cleanup="true"]')) return;
      const style = doc.createElement('style');
      style.setAttribute('data-incheck-pdf-cleanup', 'true');
      style.textContent = pdfCleanupStyle;
      (doc.head || doc.documentElement || doc.body)?.appendChild(style);
    };

    const sanitize = value => {
      const stripped = String(originalStrip(value) || '');
      if (!stripped) return stripped;

      const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(stripped);
      if (!looksLikeHtml) return cleanPlainText(stripped);

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(stripped, 'text/html');

        doc.querySelectorAll('a[href]').forEach(anchor => {
          const label = String(anchor.textContent || '').trim();
          if (actionLabel.test(label) || rawUrlOnly.test(label)) {
            anchor.remove();
            return;
          }
          anchor.replaceWith(doc.createTextNode(label));
        });

        const root = doc.body || doc.documentElement;
        if (root && global.NodeFilter) {
          const walker = doc.createTreeWalker(root, global.NodeFilter.SHOW_TEXT);
          const nodes = [];
          while (walker.nextNode()) nodes.push(walker.currentNode);
          nodes.forEach(node => {
            const parentName = String(node.parentElement?.tagName || '').toLowerCase();
            if (['style', 'script', 'noscript', 'template'].includes(parentName)) return;
            node.nodeValue = cleanPlainText(node.nodeValue);
          });
        }

        injectPdfCleanupStyle(doc);
        const serialized = doc.documentElement?.outerHTML || stripped;
        return /^\s*<!doctype/i.test(stripped) ? `<!DOCTYPE html>\n${serialized}` : serialized;
      } catch (error) {
        let cleaned = stripped
          .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (_, body) => {
            const label = String(body || '').replace(/<[^>]+>/g, '').trim();
            return actionLabel.test(label) || rawUrlOnly.test(label) ? '' : label;
          })
          .replace(rawUrlInText, '');
        const styleTag = `<style data-incheck-pdf-cleanup="true">${pdfCleanupStyle}</style>`;
        if (!/data-incheck-pdf-cleanup/i.test(cleaned)) {
          cleaned = /<\/head>/i.test(cleaned)
            ? cleaned.replace(/<\/head>/i, `${styleTag}</head>`)
            : `${styleTag}${cleaned}`;
        }
        return cleaned;
      }
    };

    utils.stripInternalDocumentLinks = sanitize;
    if (originalAddLogo) {
      utils.addIncheckDocumentLogo = function (...args) {
        return sanitize(originalAddLogo(...args));
      };
    }
    utils.__allDocumentLinksSanitized = true;
  }

  installDocumentLinkSanitizer();

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
  function getPaginatedTableRows({ rows, filters, filterFn, sortState, columnMap, currentPage, pageSize }) {
    const allRows = Array.isArray(rows) ? rows : [];
    const filteredRows = typeof filterFn === 'function'
      ? allRows.filter(row => filterFn(row, filters))
      : allRows;
    const sortedRows = sortRows(filteredRows, sortState, columnMap);
    const safePageSize = Math.max(1, Number(pageSize) || 50);
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
  function getServerSort(tableName, columnMap, fallback = { sort_by: 'updated_at', sort_dir: 'desc' }) {
    const state = sortState(tableName);
    const column = state?.key ? columnMap?.[state.key] : null;
    const serverField = column?.serverField || (typeof column?.accessor === 'string' ? column.accessor : null);
    if (!serverField || !state?.direction) return fallback || {};
    return { sort_by: serverField, sort_dir: state.direction === 'asc' ? 'asc' : 'desc' };
  }
  function getServerColumnFilters(tableName, columnMap) {
    const filters = columnFilters(tableName);
    return Object.entries(filters || {}).reduce((acc, [key, value]) => {
      const clean = String(value || '').trim();
      if (!clean) return acc;
      const column = columnMap?.[key];
      const serverField = column?.serverField || (typeof column?.accessor === 'string' ? column.accessor : null);
      if (serverField) acc[serverField] = clean;
      return acc;
    }, {});
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
  global.TableUtils = { getValueByPath, normalizeSortValue, sortRows, applyColumnFilters, nextSortDirection, renderSortableHeader, sortState, processRows, getPaginatedTableRows, getServerSort, getServerColumnFilters, ensureHeaders, handleTableSort };
})(window);
