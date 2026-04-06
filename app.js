
/**
 * ticketing Dashboard
 * Single-file architecture:
 *  - CONFIG / LS_KEYS
 *  - DataStore (issues + text analytics)
 *  - Risk engine (technical + biz + ops + severity/impact/urgency)
 *  - DSL query parser & matcher
 *  - Calendar risk (events + collisions + freezes + hot issues)
 *  - Release planner (F&B / Middle East)
 */

/* moved to config.js */


/* moved to api.js */


/* moved to session.js */


/* moved to permissions.js */


/* moved to utils.js */


/* moved to tickets.js */


/* moved to insights.js */

/* moved to calendar.js */
/* moved to planner.js */
/* moved to ui.js */
/** Issues UI */
UI.Issues = {
  renderFilters() {
    const uniq = a =>
      [...new Set(a.filter(Boolean).map(v => v.trim()))].sort((a, b) =>
        a.localeCompare(b)
      );
    
    if (E.moduleFilter)
      E.moduleFilter.innerHTML = ['All', ...uniq(DataStore.rows.map(r => r.module))]
        .map(v => `<option>${v}</option>`)
        .join('');
      if (E.categoryFilter) {
      const categories = buildIssueCategoryOptions();
      E.categoryFilter.innerHTML = ['All', ...categories]
        .map(v => `<option>${v}</option>`)
        .join('');
    }
    if (E.priorityFilter)
      E.priorityFilter.innerHTML = ['All', ...uniq(DataStore.rows.map(r => r.priority))]
        .map(v => `<option>${v}</option>`)
        .join('');
    if (E.statusFilter)
      E.statusFilter.innerHTML = ['All', ...uniq(DataStore.rows.map(r => r.status))]
        .map(v => `<option>${v}</option>`)
        .join('');
    const allowInternalFilters = Permissions.canUseInternalIssueFilters();
    if (E.devTeamStatusFilter && allowInternalFilters)
      E.devTeamStatusFilter.innerHTML = ['All', ...uniq(DataStore.rows.map(r => r.devTeamStatus))]
        .map(v => `<option>${v}</option>`)
        .join('');
    if (E.issueRelatedFilter && allowInternalFilters) {
      const issueRelatedOptions = uniq(
        DataStore.rows.flatMap(r =>
          String(r.issueRelated || '')
            .split(',')
            .map(v => v.trim())
            .filter(Boolean)
        )
      );
      E.issueRelatedFilter.innerHTML = ['All', ...issueRelatedOptions]
        .map(v => `<option>${v}</option>`)
        .join('');
    }
     setIfOptionExists(E.moduleFilter, Filters.state.module);
    setIfOptionExists(E.categoryFilter, Filters.state.category);
    setIfOptionExists(E.priorityFilter, Filters.state.priority);
    setIfOptionExists(E.statusFilter, Filters.state.status);
    if (allowInternalFilters) {
      setIfOptionExists(E.devTeamStatusFilter, Filters.state.devTeamStatus);
      setIfOptionExists(E.issueRelatedFilter, Filters.state.issueRelated);
    }
  },
  applyFilters() {
    const s = Filters.state;
    const allowInternalFilters = Permissions.canUseInternalIssueFilters();
    const qstr = (s.search || '').toLowerCase().trim();
    const terms = qstr ? qstr.split(/\s+/).filter(Boolean) : [];
    const start = s.start ? new Date(s.start) : null;
    const end = s.end ? U.dateAddDays(s.end, 1) : null;

     const matchesCategory = r => {
      if (!s.category || s.category === 'All') return true;
      if (r.type && r.type === s.category) return true;
      const cats = DataStore.computed.get(r.id)?.suggestions?.categories || [];
      return cats.some(c => c.label === s.category);
    };

    return DataStore.rows.filter(r => {
      const hay = [
        r.id,
        r.module,
        r.title,
        r.desc,
        r.log,
        r.type,
        r.name,
        r.department,
        r.emailAddressee,
        r.notificationSent,
        r.notificationUnderReview
      ]
        .concat(
          allowInternalFilters ? [r.youtrackReference, r.devTeamStatus, r.issueRelated, r.notes] : []
        )
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (terms.length && !terms.every(t => hay.includes(t))) return false;

      let keepDate = true;
      if (r.date) {
        const d = new Date(r.date);
        if (!isNaN(d)) {
          if (start && d < start) keepDate = false;
          if (end && d >= end) keepDate = false;
        }
      } else if (start || end) {
        keepDate = false;
      }

      return (
        (!s.module || s.module === 'All' || r.module === s.module) &&
         matchesCategory(r) &&
        (!s.priority || s.priority === 'All' || r.priority === s.priority) &&
        (!s.status || s.status === 'All' || r.status === s.status) &&
        (!allowInternalFilters ||
          (!s.devTeamStatus ||
            s.devTeamStatus === 'All' ||
            (r.devTeamStatus || '') === s.devTeamStatus)) &&
        (!allowInternalFilters ||
          (!s.issueRelated ||
            s.issueRelated === 'All' ||
            String(r.issueRelated || '')
              .split(',')
              .map(v => v.trim())
              .includes(s.issueRelated))) &&
        keepDate
      );
    });
  },
  renderKPIs(list) {
    if (!E.kpis) return;
    const total = list.length,
      counts = {};
    list.forEach(r => (counts[r.status] = (counts[r.status] || 0) + 1));
    E.kpis.innerHTML = '';
    const add = (label, val) => {
      const pct = total ? Math.round((val * 100) / total) : 0;
      const d = document.createElement('div');
      d.className = 'card kpi';
      d.tabIndex = 0;
      d.setAttribute('role', 'button');
      d.setAttribute('aria-label', `${label}: ${val} (${pct} percent)`);
      d.innerHTML = `<div class="label">${label}</div><div class="value">${val}</div><div class="sub">${pct}%</div>`;
      d.onclick = () => {
        if (label === 'Total Issues') {
          Filters.state = {
            search: '',
            module: 'All',
            category: 'All',
            priority: 'All',
            status: 'All',
            devTeamStatus: 'All',
            issueRelated: 'All',
            start: '',
            end: ''
          };
        } else {
          Filters.state.status = label;
          Filters.state.search = '';
        }
        Filters.save();
        UI.refreshAll();
      };
      d.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          d.click();
        }
      });
      E.kpis.appendChild(d);
    };
    add('Total Issues', total);
    Object.entries(counts).forEach(([s, v]) => add(s, v));
  },
  renderTable(list) {
    if (!E.issuesTbody) return;
    const { sortKey, sortAsc } = GridState;
    const sorted = sortKey
      ? [...list].sort((a, b) => {
          const va = a[sortKey] || '',
            vb = b[sortKey] || '';
          if (sortKey === 'date') {
            const da = new Date(va),
              db = new Date(vb);
            if (isNaN(da) && isNaN(db)) return 0;
            if (isNaN(da)) return 1;
            if (isNaN(db)) return -1;
            return da - db;
          }
          return String(va).localeCompare(String(vb), undefined, {
            numeric: true,
            sensitivity: 'base'
          });
        })
      : list;
    const rows = sortAsc ? sorted : sorted.reverse();

    const total = rows.length,
      size = GridState.pageSize,
      page = GridState.page;
    const pages = Math.max(1, Math.ceil(total / size));
    if (GridState.page > pages) GridState.page = pages;
    const start = (GridState.page - 1) * size;
    const pageData = rows.slice(start, start + size);

    const firstRow = total ? start + 1 : 0;
    const lastRow = total ? Math.min(total, start + pageData.length) : 0;

    if (E.rowCount) {
      E.rowCount.textContent = total
        ? `Showing ${firstRow}-${lastRow} of ${total}`
        : 'No rows';
    }
    if (E.pageInfo) E.pageInfo.textContent = `Page ${GridState.page} / ${pages}`;
    ['firstPage', 'prevPage', 'nextPage', 'lastPage'].forEach(id => {
      const btn = E[id];
      if (!btn) return;
      const atFirst = GridState.page <= 1,
        atLast = GridState.page >= pages;
      if (id === 'firstPage' || id === 'prevPage') btn.disabled = atFirst;
      else btn.disabled = atLast;
      if (btn.disabled) btn.setAttribute('disabled', 'true');
      else btn.removeAttribute('disabled');
    });

    const badgeStatus = s =>
      `<span class="pill status-${U.toStatusClass(s)}">${U.escapeHtml(s || '-')}</span>`;
    const badgePrio = p =>
      `<span class="pill priority-${p || ''}">${U.escapeHtml(p || '-')}</span>`;
    const badgeDevTeamStatus = value =>
      `<span class="pill dev-team-${U.toTagClass(value)}">${U.escapeHtml(value || '-')}</span>`;
    const badgeIssueRelated = value =>
      `<span class="pill issue-related-${U.toTagClass(value)}">${U.escapeHtml(value || '-')}</span>`;
    const badgeIssueRelatedGroup = value => {
      const tags = String(value || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
      if (!tags.length) return '-';
      return tags.map(tag => badgeIssueRelated(tag)).join(' ');
    };

    const renderCell = (row, col) => {
      if (col.key === 'priority') return badgePrio(row.priority || '-');
      if (col.key === 'status') return badgeStatus(row.status || '-');
      if (col.key === 'devTeamStatus') return badgeDevTeamStatus(row.devTeamStatus || '-');
      if (col.key === 'issueRelated') return badgeIssueRelatedGroup(row.issueRelated || '');
      if (col.key === 'file') {
        const safeUrl = U.safeExternalUrl(row.file);
        return row.file
          ? safeUrl
            ? `<a href="${U.escapeAttr(
                safeUrl
              )}" target="_blank" rel="noopener noreferrer" aria-label="Open attachment link">🔗</a>`
            : '<span class="muted">Invalid link</span>'
          : '-';
      }
      const value = row[col.key];
      return U.escapeHtml(value || '-');
    };

    if (pageData.length) {
      E.issuesTbody.innerHTML = pageData
      .map(r => {
          const cells = ColumnManager.getAvailableColumns()
            .map(
              col => `<td data-col="${col.key}">${renderCell(r, col)}</td>`
            )
            .join('');
        return `<tr role="button" tabindex="0" aria-label="Open issue ${U.escapeHtml(
            r.id || ''
          )}" data-id="${U.escapeAttr(r.id)}">
            ${cells}
          </tr>`;
        })
        .join('');
    } else {
      const parts = [];
      if (Filters.state.search) parts.push(`search "${Filters.state.search}"`);
      if (Filters.state.module && Filters.state.module !== 'All')
        parts.push(`module = ${Filters.state.module}`);
       if (Filters.state.category && Filters.state.category !== 'All')
        parts.push(`category = ${Filters.state.category}`);
      if (Filters.state.priority && Filters.state.priority !== 'All')
        parts.push(`priority = ${Filters.state.priority}`);
      if (Filters.state.status && Filters.state.status !== 'All')
        parts.push(`status = ${Filters.state.status}`);
      if (Filters.state.devTeamStatus && Filters.state.devTeamStatus !== 'All')
        parts.push(`dev team status = ${Filters.state.devTeamStatus}`);
      if (Filters.state.issueRelated && Filters.state.issueRelated !== 'All')
        parts.push(`issue related = ${Filters.state.issueRelated}`);
      if (Filters.state.start) parts.push(`from ${Filters.state.start}`);
      if (Filters.state.end) parts.push(`to ${Filters.state.end}`);
      const desc = parts.length ? parts.join(', ') : 'no filters';
      E.issuesTbody.innerHTML = `
        <tr>
          <td colspan="${ColumnManager.getVisibleColumnCount()}" style="text-align:center;color:var(--muted)">
            No issues found for ${U.escapeHtml(desc)}.
            <button type="button" class="btn sm" id="clearFiltersBtn" style="margin-left:8px">Clear filters</button>
          </td>
        </tr>`;
      const clearBtn = document.getElementById('clearFiltersBtn');
      if (clearBtn)
        clearBtn.addEventListener('click', () => {
          Filters.state = {
            search: '',
            module: 'All',
            category: 'All',
            priority: 'All',
            status: 'All',
            devTeamStatus: 'All',
            issueRelated: 'All',
            start: '',
            end: ''
          };
          Filters.save();
          if (E.searchInput) E.searchInput.value = '';
          if (E.categoryFilter) E.categoryFilter.value = 'All';
          if (E.startDateFilter) E.startDateFilter.value = '';
          if (E.endDateFilter) E.endDateFilter.value = '';
          UI.Issues.renderFilters();
          UI.refreshAll();
        });
    }
ColumnManager.apply();

    E.issuesTbody.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          UI.Modals.openIssue(tr.getAttribute('data-id'));
        }
      });
      tr.addEventListener('click', e => {
        if (!e.target.closest('a')) UI.Modals.openIssue(tr.getAttribute('data-id'));
      });
    });

    U.qAll('#issuesTable thead th').forEach(th => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      th.setAttribute('aria-sort', 'none');
    });
    if (GridState.sortKey) {
      const th = U.q(`#issuesTable thead th[data-key="${GridState.sortKey}"]`);
      if (th) {
        th.classList.add(GridState.sortAsc ? 'sorted-asc' : 'sorted-desc');
        th.setAttribute('aria-sort', GridState.sortAsc ? 'ascending' : 'descending');
      }
    }
  },
  renderCharts(list) {
    if (typeof Chart === 'undefined') return;
    const cssVar = n =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim();
     const palette = [
      cssVar('--accent'),
      cssVar('--danger'),
      cssVar('--ok'),
      cssVar('--warn'),
      cssVar('--info'),
      cssVar('--purple'),
      cssVar('--neutral'),
      cssVar('--status-onstage')
    ];
    const statusColors = {
      Resolved: cssVar('--status-resolved'),
      'Under Development': cssVar('--status-underdev'),
      Rejected: cssVar('--status-rejected'),
      'On Hold': cssVar('--status-onhold'),
      'Not Started Yet': cssVar('--status-notstarted'),
      Sent: cssVar('--status-sent'),
      'On Stage': cssVar('--status-onstage')
    };
    const priorityColors = {
      High: cssVar('--priority-high'),
      Medium: cssVar('--priority-medium'),
      Low: cssVar('--priority-low')
    };
    const group = (arr, k) =>
      arr.reduce((m, r) => {
        const key = r[k] || 'Unspecified';
        m[key] = (m[key] || 0) + 1;
        return m;
      }, {});
    const make = (id, type, data, colors = {}) => {
      const el = U.q('#' + id);
      if (!el) return;
      UI._charts = UI._charts || {};
      if (UI._charts[id]) UI._charts[id].destroy();
      const labels = Object.keys(data),
        values = Object.values(data);
      UI._charts[id] = new Chart(el, {
        type,
        data: {
          labels,
          datasets: [
            {
              data: values,
               backgroundColor: labels.map((l, i) => colors[l] || palette[i % palette.length])
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: type !== 'bar' },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const total = values.reduce((a, b) => a + b, 0) || 1;
                  return `${ctx.raw} (${Math.round((ctx.raw * 100) / total)}%)`;
                }
              }
            }
          },
          scales:
            type === 'bar'
              ? {
                  x: { grid: { color: 'rgba(128,128,128,.1)' } },
                  y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(128,128,128,.12)' }
                  }
                }
              : {}
        }
      });
    };
    make('byModule', 'bar', group(list, 'module'));
    make('byPriority', 'doughnut', group(list, 'priority'), priorityColors);
    make('byStatus', 'bar', group(list, 'status'), statusColors);

    const categoryOptions = buildIssueCategoryOptions();
    const normalizedCategoryMap = new Map(
      categoryOptions.map(option => [option.toLowerCase(), option])
    );
    const byTypeCounts = list.reduce((acc, row) => {
      const normalized = String(row.type || '')
        .trim()
        .toLowerCase();
      const category = normalizedCategoryMap.get(normalized);
      if (!category) return acc;
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
    const orderedByTypeCounts = categoryOptions.reduce((acc, category) => {
      if (!byTypeCounts[category]) return acc;
      acc[category] = byTypeCounts[category];
      return acc;
    }, {});
    make('byType', 'bar', orderedByTypeCounts);
  }
};

UI.Issues.renderFilterChips = function () {
  if (!E.activeFiltersChips) return;
  const chips = [];
  const addChip = (label, value, key) => {
    if (!value) return;
    chips.push(`<button type="button" class="filter-chip" data-filter-key="${key}">
      <span>${label}: ${U.escapeHtml(value)}</span>
      <span aria-hidden="true">✕</span>
    </button>`);
  };
  const s = Filters.state;
  if (s.search) addChip('Search', s.search, 'search');
  if (s.module && s.module !== 'All') addChip('Module', s.module, 'module');
  if (s.category && s.category !== 'All') addChip('Category', s.category, 'category');
  if (s.priority && s.priority !== 'All') addChip('Priority', s.priority, 'priority');
  if (s.status && s.status !== 'All') addChip('Status', s.status, 'status');
  if (s.devTeamStatus && s.devTeamStatus !== 'All')
    addChip('Dev Team Status', s.devTeamStatus, 'devTeamStatus');
  if (s.issueRelated && s.issueRelated !== 'All')
    addChip('Issue Related', s.issueRelated, 'issueRelated');
  if (s.start) addChip('From', s.start, 'start');
  if (s.end) addChip('To', s.end, 'end');

  if (chips.length) {
    E.activeFiltersChips.innerHTML = chips.join('');
  } else {
    E.activeFiltersChips.innerHTML =
      '<span class="muted" style="font-size:11px;">No filters applied.</span>';
  }

  E.activeFiltersChips.querySelectorAll('[data-filter-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-filter-key');
      if (!key) return;
      if (key === 'search') Filters.state.search = '';
      if (key === 'module') Filters.state.module = 'All';
      if (key === 'category') Filters.state.category = 'All';
      if (key === 'priority') Filters.state.priority = 'All';
      if (key === 'status') Filters.state.status = 'All';
      if (key === 'devTeamStatus') Filters.state.devTeamStatus = 'All';
      if (key === 'issueRelated') Filters.state.issueRelated = 'All';
      if (key === 'start') Filters.state.start = '';
      if (key === 'end') Filters.state.end = '';

      Filters.save();
      if (E.searchInput && key === 'search') E.searchInput.value = '';
      if (E.moduleFilter && key === 'module') E.moduleFilter.value = 'All';
      if (E.categoryFilter && key === 'category') E.categoryFilter.value = 'All';
      if (E.priorityFilter && key === 'priority') E.priorityFilter.value = 'All';
      if (E.statusFilter && key === 'status') E.statusFilter.value = 'All';
      if (E.devTeamStatusFilter && key === 'devTeamStatus') E.devTeamStatusFilter.value = 'All';
      if (E.issueRelatedFilter && key === 'issueRelated') E.issueRelatedFilter.value = 'All';
      if (E.startDateFilter && key === 'start') E.startDateFilter.value = '';
      if (E.endDateFilter && key === 'end') E.endDateFilter.value = '';

      UI.refreshAll();
    });
  });
};

UI.Issues.renderSummary = function (list) {
  if (!E.issuesSummaryText) return;
  const total = list.length;
  let open = 0;
  let highRisk = 0;
  list.forEach(r => {
    const st = (r.status || '').toLowerCase();
    const isClosed = st.startsWith('resolved') || st.startsWith('rejected');
    if (!isClosed) open++;
    const risk = DataStore.computed.get(r.id)?.risk?.total || 0;
    if (risk >= CONFIG.RISK.highRisk) highRisk++;
  });
  E.issuesSummaryText.textContent =
     `${total} issue${total === 1 ? '' : 's'} · ${open} open · ${highRisk} high-risk`;

  if (E.issuesLastUpdated) {
    const lastUpdated = IssuesCache.lastUpdated();
    if (!lastUpdated) {
      E.issuesLastUpdated.textContent = 'Last updated: --';
      E.issuesLastUpdated.classList.remove('stale');
    } else {
      E.issuesLastUpdated.textContent = `Last updated: ${lastUpdated.toLocaleString()}`;
      const ageHours = (Date.now() - lastUpdated.getTime()) / 36e5;
      E.issuesLastUpdated.classList.toggle('stale', ageHours > CONFIG.DATA_STALE_HOURS);
      E.issuesLastUpdated.title =
        ageHours > CONFIG.DATA_STALE_HOURS
          ? `Data is ${Math.round(ageHours)} hours old`
          : '';
    }
  }
};

/** Analytics (AI tab) */
const Analytics = {
  _debounce: null,
  refresh(list) {
    clearTimeout(this._debounce);
    UI.setAnalyzing(true);
    this._debounce = setTimeout(() => this._render(list), 80);
  },
  _render(list) {
    // Top terms recent
    const recentCut = CONFIG.TREND_DAYS_RECENT;
    const recent = list.filter(r => U.isBetween(r.date, U.daysAgo(recentCut), null));
    const termCounts = new Map();
    recent.forEach(r => {
      const t = DataStore.computed.get(r.id)?.tokens || new Set();
      t.forEach(w => termCounts.set(w, (termCounts.get(w) || 0) + 1));
    });
    const topTerms = Array.from(termCounts.entries())
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    if (E.aiPatternsList) {
      E.aiPatternsList.innerHTML = topTerms.length
        ? topTerms
            .map(
              ([t, c]) =>
                `<li><strong>${U.escapeHtml(t)}</strong> – ${c}</li>`
            )
            .join('')
        : '<li>No strong repeated terms recently.</li>';
    }

    // Suggested categories frequency
    const catCount = new Map();
    list.forEach(r => {
      const cats = DataStore.computed.get(r.id)?.suggestions?.categories || [];
      cats.forEach(c => catCount.set(c.label, (catCount.get(c.label) || 0) + 1));
    });
    const topCats = Array.from(catCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    if (E.aiLabelsList) {
      E.aiLabelsList.innerHTML = topCats.length
        ? topCats
            .map(
              ([l, n]) =>
                `<li class="ai-label-item">
                  <div>
                    <strong>${U.escapeHtml(l)}</strong>
                    <span class="muted">· ${n} suggested</span>
                  </div>
                  <button class="btn ghost sm" type="button" data-apply-category="${U.escapeAttr(
                    l
                  )}">Apply</button>
                </li>`
            )
            .join('')
        : '<li>No clear category suggestions yet.</li>';
    }

    // Scope & signals
    if (E.aiScopeText) {
      E.aiScopeText.textContent = `Analyzing ${list.length} issues (${recent.length} recent, ~last ${recentCut} days).`;
    }
    const signals = ['timeout', 'payments', 'billing', 'login', 'auth', 'error', 'crash'].filter(
      t => termCounts.has(t)
    );
    if (E.aiSignalsText) {
      E.aiSignalsText.textContent = signals.length
        ? `Recent mentions: ${signals.join(', ')}.`
        : 'No strong recurring signals.';
    }

    // Trends
     const buildTermCounts = (items, startDate, endDate) => {
      const counts = new Map();
      items.forEach(r => {
        if (!U.isBetween(r.date, startDate, endDate)) return;
        const toks = DataStore.computed.get(r.id)?.tokens || new Set();
        new Set(toks).forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
      });
      return counts;
    };

    const oldStart = U.daysAgo(CONFIG.TREND_DAYS_WINDOW),
      mid = U.daysAgo(CONFIG.TREND_DAYS_RECENT);
    const oldCounts = new Map(),
      newCounts = new Map();
    const inHalf = r => {
      const d = new Date(r.date);
      if (isNaN(d)) return null;
      if (d < mid && d >= oldStart) return 'old';
      if (d >= mid) return 'new';
      return null;
    };
    list.forEach(r => {
      const half = inHalf(r);
      if (!half) return;
      const toks = DataStore.computed.get(r.id)?.tokens || new Set();
      const tgt = half === 'old' ? oldCounts : newCounts;
      new Set(toks).forEach(t => tgt.set(t, (tgt.get(t) || 0) + 1));
    });
    const trendTerms = new Set([...oldCounts.keys(), ...newCounts.keys()]);
    const trend = [];
    trendTerms.forEach(t => {
      const a = oldCounts.get(t) || 0,
        b = newCounts.get(t) || 0;
      const d = b - a;
      const ratio = a === 0 ? (b >= 2 ? Infinity : 0) : b / a;
      if ((b >= 2 && ratio >= 2) || d >= 2) trend.push({ t, old: a, new: b, delta: d, ratio });
    });
    trend.sort(
      (x, y) =>
        (y.ratio === Infinity) - (x.ratio === Infinity) ||
        y.delta - x.delta ||
        y.new - x.new
    );
    
    const weekCurrentCounts = buildTermCounts(list, U.daysAgo(7), null);
    const weekPrevCounts = buildTermCounts(list, U.daysAgo(14), U.daysAgo(7));
    const monthCurrentCounts = buildTermCounts(list, U.daysAgo(30), null);
    const monthPrevCounts = buildTermCounts(list, U.daysAgo(60), U.daysAgo(30));
    const fmtDelta = value => (value >= 0 ? `+${value}` : `${value}`);

    if (E.aiTrendsList) {
      E.aiTrendsList.innerHTML = trend.length
        ? trend
            .slice(0, 8)
            .map(
             o => {
                const wowNow = weekCurrentCounts.get(o.t) || 0;
                const wowPrev = weekPrevCounts.get(o.t) || 0;
                const wowDelta = wowNow - wowPrev;
                const momNow = monthCurrentCounts.get(o.t) || 0;
                const momPrev = monthPrevCounts.get(o.t) || 0;
                const momDelta = momNow - momPrev;
                return `<li><strong>${U.escapeHtml(o.t)}</strong> – ${o.new} vs ${
                  o.old
              } <span class="muted">(Δ ${fmtDelta(o.delta)} · WoW ${fmtDelta(
                  wowDelta
                )} · MoM ${fmtDelta(momDelta)})</span></li>`;
              }
            )
            .join('')
        : '<li>No strong increases.</li>';
    }

    // Incidents
    const incidentWords = ['incident', 'outage', 'p0', 'p1', 'major', 'sla'];
    const incidents = list
      .filter(r => {
        const txt = [r.title, r.desc, r.log].filter(Boolean).join(' ').toLowerCase();
        return incidentWords.some(w => txt.includes(w));
      })
      .slice(0, 10);
    if (E.aiIncidentsList) {
      E.aiIncidentsList.innerHTML = incidents.length
        ? incidents
            .map(
              r => `
      <li><button class="btn sm" data-open="${U.escapeAttr(
        r.id
      )}">${U.escapeHtml(r.id)}</button> ${U.escapeHtml(r.title || '')}</li>
    `
            )
            .join('')
        : '<li>No incident-like issues detected.</li>';
    }

    // Emerging vs stable
    const emerg = trend.slice(0, 5).map(t => t.t);
    const stable = topTerms
      .filter(([t]) => !emerg.includes(t))
      .slice(0, 5)
      .map(([t]) => t);
    if (E.aiEmergingStable) {
      E.aiEmergingStable.innerHTML = `
      <li><strong>Emerging:</strong> ${
        emerg.length ? emerg.map(x => U.escapeHtml(x)).join(', ') : '—'
      }</li>
      <li><strong>Stable:</strong> ${
        stable.length ? stable.map(x => U.escapeHtml(x)).join(', ') : '—'
      }</li>
    `;
    }

    // Ops cockpit
    const misaligned = list.filter(r => {
      const meta = DataStore.computed.get(r.id);
      if (!meta) return false;
      const gap = prioGap(meta.suggestions?.priority, r.priority);
      return gap >= CONFIG.RISK.misalignedDelta;
    });
    const missingPriority = list.filter(r => !r.priority);
    const missingModule = list.filter(r => !r.module || r.module === 'Unspecified');
    const staleHigh = list.filter(r => {
      const meta = DataStore.computed.get(r.id);
      if (!meta) return false;
      const risk = meta.risk?.total || 0;
      const old = U.daysAgo(CONFIG.RISK.staleDays);
      const st = (r.status || '').toLowerCase();
      return (
        risk >= CONFIG.RISK.highRisk &&
        U.isBetween(r.date, null, old) &&
        !(st.startsWith('resolved') || st.startsWith('rejected'))
      );
    });
    if (E.aiOpsCockpit) {
      E.aiOpsCockpit.innerHTML = `
      <li>Untagged issues (missing category/type): ${
        list.filter(r => !r.type).length
      }</li>
      <li>Missing priority: ${missingPriority.length}</li>
      <li>Missing module: ${missingModule.length}</li>
      <li>Misaligned priority: ${misaligned.length}</li>
      <li>Stale high-risk (&gt;=${CONFIG.RISK.highRisk}) &gt; ${
      CONFIG.RISK.staleDays
    }d: ${staleHigh.length}</li>
    `;
    }

    // Module insights
    const modules = (() => {
      const map = new Map();
      list.forEach(r => {
        let m = map.get(r.module);
        if (!m) {
          m = {
            module: r.module,
            total: 0,
            open: 0,
            high: 0,
            risk: 0,
            tokens: new Map()
          };
          map.set(r.module, m);
        }
        m.total++;
        const st = (r.status || '').toLowerCase();
        if (!st.startsWith('resolved') && !st.startsWith('rejected')) {
          m.open++;
          if (r.priority === 'High') m.high++;
        }
        const rs = DataStore.computed.get(r.id)?.risk?.total || 0;
        m.risk += rs;
        (DataStore.computed.get(r.id)?.tokens || new Set()).forEach(t =>
          m.tokens.set(t, (m.tokens.get(t) || 0) + 1)
        );
      });
      return Array.from(map.values())
        .map(m => {
          const tt = m.tokens.size
            ? Array.from(m.tokens.entries()).sort((a, b) => b[1] - a[1])[0][0]
            : '';
          return {
            module: m.module,
            open: m.open,
            high: m.high,
            risk: m.risk,
            topTerm: tt
          };
        })
        .sort((a, b) => b.risk - a.risk || b.open - a.open)
        .slice(0, 8);
    })();

    const maxModuleRisk = modules.reduce((max, m) => Math.max(max, m.risk), 0) || 1;

    if (E.aiModulesTableBody) {
      E.aiModulesTableBody.innerHTML = modules.length
        ? modules
            .map(m => {
              const ratio = m.risk / maxModuleRisk;
              return `
        <tr>
          <td>${U.escapeHtml(m.module)}</td>
          <td>${m.open}</td>
          <td>${m.high}</td>
          <td>
            ${m.risk}
            <div class="risk-bar-wrap"><div class="risk-bar" style="transform:scaleX(${ratio.toFixed(
              2
            )});"></div></div>
          </td>
          <td>${U.escapeHtml(m.topTerm || '-')}</td>
        </tr>
      `;
            })
            .join('')
        : '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No modules.</td></tr>';
    }

    // Top risks
    const topRisks = recent
      .map(r => ({ r, score: DataStore.computed.get(r.id)?.risk?.total || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .filter(x => x.score > 2);
    if (E.aiRisksList) {
      E.aiRisksList.innerHTML = topRisks.length
        ? topRisks
            .map(({ r, score }) => {
              const badgeClass = CalendarLink.riskBadgeClass(score);
              const meta = DataStore.computed.get(r.id)?.risk || {};
              return `
        <li style="margin-bottom:4px;">
          <strong>[${U.escapeHtml(r.priority || '-')} ] ${U.escapeHtml(
          r.id || ''
        )}</strong>
          <span class="event-risk-badge ${badgeClass}">RISK ${score}</span>
          <span class="muted"> · sev ${meta.severity ?? 0} · imp ${
          meta.impact ?? 0
        } · urg ${meta.urgency ?? 0}</span>
          <br><span class="muted">Status ${U.escapeHtml(r.status || '-')}</span>
          <br>${U.escapeHtml(r.title || '')}
        </li>`;
            })
            .join('')
        : '<li>No high-risk recent issues.</li>';
    }

    // Clusters
   const clusters = buildClustersWeighted(list).map(cluster => {
      const moduleCounts = new Map();
      let riskSum = 0;
      cluster.issues.forEach(issue => {
        moduleCounts.set(issue.module, (moduleCounts.get(issue.module) || 0) + 1);
        const risk = DataStore.computed.get(issue.id)?.risk?.total || 0;
        riskSum += risk;
      });
      const topModules = Array.from(moduleCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      const avgRisk = cluster.issues.length ? riskSum / cluster.issues.length : 0;
      return { ...cluster, moduleCounts, topModules, avgRisk };
    });

    const renderClusterDetail = idx => {
      if (!E.aiClustersDetail) return;
      const cluster = clusters[idx];
      if (!cluster) {
        E.aiClustersDetail.innerHTML = 'Select a cluster to view details.';
        return;
      }
      const modulesHtml = cluster.topModules.length
        ? cluster.topModules
            .map(([m, c]) => `${U.escapeHtml(m || 'Unspecified')} (${c})`)
            .join(', ')
        : 'No module data';
      const issuesHtml = cluster.issues
        .slice(0, 6)
        .map(
          issue => `
            <li>
              <button class="btn sm" data-open="${U.escapeAttr(issue.id)}">${U.escapeHtml(
            issue.id
          )}</button>
              ${U.escapeHtml(issue.title || '')}
            </li>`
        )
        .join('');

      E.aiClustersDetail.innerHTML = `
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">
          Pattern: <strong>${U.escapeHtml(cluster.signature || '(no pattern)')}</strong>
        </div>
        <div style="font-size:13px;margin-bottom:4px;">
          ${cluster.issues.length} issues · Avg risk ${cluster.avgRisk.toFixed(1)}
        </div>
        <div class="muted" style="font-size:12px;margin-bottom:6px;">
          Top modules: ${modulesHtml}
        </div>
        <ul style="margin:0;padding-left:18px;font-size:13px;">
         ${issuesHtml || '<li class="muted">No issues in this cluster.</li>'}
          ${
            cluster.issues.length > 6
              ? `<li class="muted">+ ${cluster.issues.length - 6} more…</li>`
              : ''
          }
        </ul>
    <div class="cluster-detail-actions">
          <button class="btn sm" type="button" data-cluster-apply="${U.escapeAttr(
            cluster.signature || ''
          )}">Apply to Issues</button>
        </div>
      `;

      E.aiClustersDetail.querySelectorAll('[data-open]').forEach(btn => {
        btn.addEventListener('click', () =>
          UI.Modals.openIssue(btn.getAttribute('data-open'))
        );
      });
      E.aiClustersDetail.querySelectorAll('[data-cluster-apply]').forEach(btn => {
        btn.addEventListener('click', () => {
          const sig = btn.getAttribute('data-cluster-apply') || '';
          Filters.state.search = sig;
          Filters.save();
          syncFilterInputs();
          setActiveView('issues');
          UI.toast('Applied cluster filter to issues');
        });
      });
    };

    if (E.aiClustersList) {
      E.aiClustersList.innerHTML = clusters.length
        ? clusters
            .map(
              (c, idx) => `
              <button class="cluster-item ${idx === 0 ? 'active' : ''}" data-cluster-index="${idx}">
                <div class="cluster-title">${U.escapeHtml(c.signature || '(no pattern)')}</div>
                <div class="cluster-meta">${c.issues.length} issues · Avg risk ${c.avgRisk.toFixed(
                  1
                )}</div>
              </button>
            `
            )
            .join('')
        : '<div class="muted">No similar issue groups ≥2.</div>';
      
      E.aiClustersList.querySelectorAll('[data-cluster-index]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-cluster-index'));
          E.aiClustersList
            .querySelectorAll('.cluster-item')
            .forEach(el => el.classList.remove('active'));
          btn.classList.add('active');
          renderClusterDetail(Number.isNaN(idx) ? 0 : idx);
        });
      });
    }

    renderClusterDetail(0);
    
    // Triage queue
    const tri = list
      .filter(r => {
        const meta = DataStore.computed.get(r.id) || {};
        const missing =
          !r.priority || !r.module || r.module === 'Unspecified' || !r.type;
        const gap = prioGap(meta.suggestions?.priority, r.priority);
        return missing || gap >= CONFIG.RISK.misalignedDelta;
      })
      .sort(
        (a, b) =>
          (DataStore.computed.get(b.id)?.risk?.total || 0) -
          (DataStore.computed.get(a.id)?.risk?.total || 0)
      )
      .slice(0, 15);
    if (E.aiTriageList) {
      E.aiTriageList.innerHTML = tri.length
        ? tri
            .map(i => {
              const meta = DataStore.computed.get(i.id) || {};
              const miss = [];
              if (!i.priority) miss.push('priority');
              if (!i.module || i.module === 'Unspecified') miss.push('module');
              if (!i.type) miss.push('type');
              const cats =
                (meta.suggestions?.categories || [])
                  .slice(0, 2)
                  .map(c => c.label)
                  .join(', ') || 'n/a';
              const note = `Suggested priority: ${
                meta.suggestions?.priority || '-'
              }; categories: ${cats}`;
              return `<li style="margin-bottom:6px;">
        <strong>${U.escapeHtml(i.id)}</strong> — ${U.escapeHtml(i.title || '')}
        <div class="muted">Missing: ${
          miss.join(', ') || '—'
        } · ${U.escapeHtml(note)}</div>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn sm" data-open="${U.escapeAttr(i.id)}">Open</button>
          <button class="btn ghost sm" data-copy="${U.escapeAttr(
            i.id
          )}">Copy suggestion</button>
        </div>
      </li>`;
            })
            .join('')
        : '<li>No issues requiring triage.</li>';
    }

    // Upcoming risky events
    const evs = computeEventsRisk(DataStore.rows, DataStore.events);
    if (E.aiEventsList) {
      E.aiEventsList.innerHTML = evs.length
        ? evs
            .map(r => {
              const badge = CalendarLink.riskBadgeClass(r.risk);
              const ev = r.event;
              return `<li style="margin-bottom:6px;">
        <strong>${U.escapeHtml(ev.title || '(no title)')}</strong>
        <span class="event-risk-badge ${badge}">RISK ${r.risk}</span>
        <div class="muted">${U.fmtTS(r.date)} · Env: ${U.escapeHtml(
          ev.env || 'Prod'
        )} · Modules: ${
                r.modules.length
                  ? r.modules.map(U.escapeHtml).join(', ')
                  : 'n/a'
              } · Related issues: ${r.issues.length}</div>
      </li>`;
            })
            .join('')
        : '<li>No notable risk in next 7 days.</li>';
    }

    // Wire AI buttons
    U.qAll('[data-open]').forEach(b =>
      b.addEventListener('click', () =>
        UI.Modals.openIssue(b.getAttribute('data-open'))
      )
    );
    U.qAll('[data-copy]').forEach(b =>
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-copy');
        const r = DataStore.byId.get(id);
        const meta = DataStore.computed.get(id) || {};
        const text = `Issue ${r.id}
Title: ${r.title}
Suggested Priority: ${meta.suggestions?.priority}
Suggested Categories: ${(meta.suggestions?.categories || [])
          .map(c => c.label)
          .join(', ')}
Reasons: ${(meta.risk?.reasons || []).join(', ')}`;
        navigator.clipboard
          .writeText(text)
          .then(() => UI.toast('Suggestion copied'))
          .catch(() => UI.toast('Clipboard blocked'));
      })
    );

     U.qAll('[data-apply-category]').forEach(b =>
      b.addEventListener('click', () => {
        const label = b.getAttribute('data-apply-category');
        if (label) applySuggestedCategory(label);
      })
    );
    
    UI.setAnalyzing(false);
  }
};

async function applySuggestedCategory(label) {
  if (!requirePermission(() => Permissions.canEditTicket(), 'Only admin can apply ticket category suggestions.'))
    return;

  const list = UI.Issues.applyFilters();
  const candidates = list.filter(issue => {
    if (issue.type && issue.type.trim()) return false;
    const meta = DataStore.computed.get(issue.id) || {};
    const suggestions = meta.suggestions?.categories || [];
    return suggestions.some(c => c.label === label);
  });

  if (!candidates.length) {
    UI.toast(`No untagged tickets match "${label}" in this view.`);
    return;
  }

  UI.spinner(true);
  let updated = 0;
  for (const issue of candidates) {
    const updatedIssue = { ...issue, type: label };
    const saved = await saveIssueToSheet(updatedIssue, Session.authContext(), { silent: true });
    if (saved) {
      applyIssueUpdate({ ...updatedIssue, ...saved });
      updated++;
    }
  }
  UI.spinner(false);

  Analytics.refresh(UI.Issues.applyFilters());
  UI.toast(`Applied "${label}" to ${updated} ticket${updated === 1 ? '' : 's'}.`);
}

function buildClustersWeighted(list) {
  const max = Math.min(list.length, 400);
  const docs = list.slice(-max).map(r => {
    const meta = DataStore.computed.get(r.id) || {};
    return { issue: r, tokens: meta.tokens || new Set(), idf: meta.idf || new Map() };
  });
  const visited = new Set(),
    clusters = [];
  const wj = (A, IA, B, IB) => {
    let inter = 0,
      sumA = 0,
      sumB = 0;
    const all = new Set([...A, ...B]);
    all.forEach(t => {
      const wa = A.has(t) ? IA.get(t) || 1 : 0;
      const wb = B.has(t) ? IB.get(t) || 1 : 0;
      inter += Math.min(wa, wb);
      sumA += wa;
      sumB += wb;
    });
    const union = sumA + sumB - inter;
    return union ? inter / union : 0;
  };
  for (let i = 0; i < docs.length; i++) {
    if (visited.has(i)) continue;
    const base = docs[i];
    const c = [base];
    visited.add(i);
    for (let j = i + 1; j < docs.length; j++) {
      if (visited.has(j)) continue;
      const other = docs[j];
      if (wj(base.tokens, base.idf, other.tokens, other.idf) >= 0.28) {
        visited.add(j);
        c.push(other);
      }
    }
    if (c.length >= 2) {
      const freq = new Map();
      c.forEach(d => d.tokens.forEach(t => freq.set(t, (freq.get(t) || 0) + 1)));
      const sig = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t]) => t)
        .join(' ');
      clusters.push({ signature: sig, issues: c.map(x => x.issue) });
    }
  }
  clusters.sort((a, b) => b.issues.length - a.issues.length);
  return clusters.slice(0, 6);
}

function getReadinessChecklistState() {
  const checks = {};
  U.qAll('[data-readiness]').forEach(input => {
    const key = input.getAttribute('data-readiness');
    if (key) checks[key] = !!input.checked;
  });
  return checks;
}

function setReadinessChecklistState(state = {}) {
  U.qAll('[data-readiness]').forEach(input => {
    const key = input.getAttribute('data-readiness');
    if (!key) return;
    input.checked = !!state[key];
  });
  updateChecklistStatus(state);
}

function readinessProgress(readiness = {}) {
  const keys = Object.keys(readiness);
  if (!keys.length) return { done: 0, total: 0 };
  const done = keys.filter(k => readiness[k]).length;
  return { done, total: keys.length };
}

function updateChecklistStatus(readiness = {}) {
  if (!E.eventChecklistStatus) return;
  const normalized =
    readiness && Object.keys(readiness).length ? readiness : getReadinessChecklistState();
  const state = readinessProgress(normalized);
  if (!state.total) {
    E.eventChecklistStatus.textContent = 'Checklist completion: 0/0';
    return;
  }
  E.eventChecklistStatus.textContent = `Checklist completion: ${state.done}/${state.total}`;
}

/** Modals */
UI.Modals = {
  selectedIssue: null,
  lastFocus: null,
  lastEventFocus: null,
  openIssue(id) {
    const r = DataStore.byId.get(id);
    if (!r || !E.issueModal) return;
    this.selectedIssue = r;
    this.lastFocus = document.activeElement;
    const ticketId = U.escapeHtml(r.id || '-');
    const personName = U.escapeHtml(r.name || 'Unknown');
    const personInitial = U.escapeHtml((r.name || '?').trim().charAt(0).toUpperCase() || '?');
    const title = U.escapeHtml(r.title || 'Untitled ticket');
    const description = U.escapeHtml(r.desc || '-');
    const status = U.escapeHtml(r.status || '-');
    const priority = U.escapeHtml(r.priority || '-');
    const moduleName = U.escapeHtml(r.module || '-');
    const department = U.escapeHtml(r.department || '-');
    const dateValue = U.escapeHtml(r.date || '-');
    const requesterEmail = U.escapeHtml(r.email || r.emailAddressee || '-');
    const category = U.escapeHtml(r.type || '-');
    const logValue = U.escapeHtml(r.log || '—');
    const youtrackReference = U.escapeHtml(r.youtrackReference || '—');
    const devTeamStatus = U.escapeHtml(r.devTeamStatus || '—');
    const issueRelated = U.escapeHtml(r.issueRelated || '—');
    const devTeamStatusBadge = `<span class="pill dev-team-${U.toTagClass(
      r.devTeamStatus || ''
    )}">${devTeamStatus}</span>`;
    const issueRelatedBadges = String(r.issueRelated || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)
      .map(
        v => `<span class="pill issue-related-${U.toTagClass(v)}">${U.escapeHtml(v)}</span>`
      )
      .join(' ');
    const notesValue = U.escapeHtml(r.notes || '—');

    E.modalTitle.textContent = `TICKET:${r.id || '-'}`;
    const internalMetaHtml = ColumnManager.isColumnAllowed('youtrackReference')
      ? `
            <p class="ticket-meta-item"><span class="ticket-label">🔗 YouTrack Ref:</span> <span>${youtrackReference}</span></p>
            <p class="ticket-meta-item"><span class="ticket-label">🧑‍💻 Dev Team Status:</span> <span>${devTeamStatusBadge}</span></p>
      `
      : '';
    const internalSectionsHtml = ColumnManager.isColumnAllowed('issueRelated')
      ? `
        <section class="ticket-description">
          <h5>Issue Related</h5>
          <p>${issueRelatedBadges || issueRelated}</p>
        </section>
      `
      : '';
    const internalNotesHtml = ColumnManager.isColumnAllowed('notes')
      ? `
        <section class="ticket-description">
          <h5>Notes</h5>
          <p>${notesValue}</p>
        </section>
      `
      : '';

    E.modalBody.innerHTML = `
      <article class="ticket-detail">
        <section class="ticket-hero">
          <div class="ticket-person">
            <div class="ticket-avatar">${personInitial}</div>
            <div>
              <div class="ticket-id">TICKET:${ticketId}</div>
              <h3>${personName}</h3>
            </div>
          </div>
          <div class="ticket-status-pill">${status}</div>
        </section>

        <section class="ticket-title-row">
          <h4>${title}</h4>
          <span class="ticket-priority-pill">🔥 Priority: ${priority}</span>
        </section>

        <section class="ticket-grid">
          <div class="ticket-col">
            <p class="ticket-meta-item"><span class="ticket-label">🗓 Date:</span> <span>${dateValue}</span></p>
            <p class="ticket-meta-item"><span class="ticket-label">👤 Name:</span> <span>${personName}</span></p>
            <p class="ticket-meta-item"><span class="ticket-label">🏢 Department:</span> <span>${department}</span></p>
            <p class="ticket-meta-item"><span class="ticket-label">📦 Module:</span> <span>${moduleName}</span></p>
          </div>
          <div class="ticket-col">
            <p class="ticket-meta-item"><span class="ticket-label">🏷 Category:</span> <span>${category}</span></p>
            <p class="ticket-meta-item"><span class="ticket-label">📧 Email Address:</span> <span>${requesterEmail}</span></p>
            <p class="ticket-meta-item"><span class="ticket-label">📌 Status:</span> <span>${status}</span></p>
            ${internalMetaHtml}
            <p class="ticket-meta-item"><span class="ticket-label">🆔 Ticket #:</span> <span>${ticketId}</span></p>
          </div>
        </section>

        <section class="ticket-description">
          <h5>Description</h5>
          <p>${description}</p>
        </section>

        ${internalSectionsHtml}
        ${internalNotesHtml}

        <section class="ticket-log">
          <h5>Log</h5>
          <p>${logValue}</p>
        </section>
      </article>
    `;
    if (E.editIssueBtn) {
      E.editIssueBtn.disabled = !Permissions.canEditTicket();
      E.editIssueBtn.dataset.id = r.id || '';
    }
    if (E.replyRecipientLabel) E.replyRecipientLabel.textContent = `To: ${r.emailAddressee || r.email || '—'}`;
    E.issueModal.style.display = 'flex';
    E.exportIssuePdf?.focus();
  },
  closeIssue() {
    if (!E.issueModal) return;
    E.issueModal.style.display = 'none';
    this.selectedIssue = null;
    IssueEditor.close();
    if (this.lastFocus?.focus) this.lastFocus.focus();
  },
  openEvent(ev) {
    this.lastEventFocus = document.activeElement;
    const isEdit = !!(ev && ev.id);
    const canManageEvents = Permissions.canManageEvents();
    if (E.eventForm) E.eventForm.dataset.id = isEdit ? ev.id : '';
    if (E.eventModalTitle)
      E.eventModalTitle.textContent = canManageEvents
        ? isEdit
          ? 'Edit Event'
          : 'Add Event'
        : 'Event';
    if (E.eventDelete) E.eventDelete.style.display = canManageEvents && isEdit ? 'inline-flex' : 'none';

    const allDay = !!ev.allDay;
    if (E.eventAllDay) E.eventAllDay.checked = allDay;

    if (E.eventTitle) E.eventTitle.value = ev.title || '';
    if (E.eventType) E.eventType.value = ev.type || 'Deployment';
    if (E.eventEnv) E.eventEnv.value = ev.env || 'Prod';
    if (E.eventStatus) E.eventStatus.value = ev.status || 'Planned';
    if (E.eventOwner) E.eventOwner.value = ev.owner || '';
    if (E.eventModules) {
      const val = Array.isArray(ev.modules)
        ? ev.modules.join(', ')
        : ev.modules || '';
      E.eventModules.value = val;
    }
    if (E.eventImpactType)
      E.eventImpactType.value = ev.impactType || 'No downtime expected';
    if (E.eventIssueId) E.eventIssueId.value = ev.issueId || '';

    if (E.eventStart) {
      E.eventStart.type = allDay ? 'date' : 'datetime-local';
      E.eventStart.value = ev.start
        ? allDay
          ? toLocalDateValue(ev.start)
          : toLocalInputValue(ev.start)
        : '';
    }
    if (E.eventEnd) {
      E.eventEnd.type = allDay ? 'date' : 'datetime-local';
      E.eventEnd.value = ev.end
        ? allDay
          ? toLocalDateValue(ev.end)
          : toLocalInputValue(ev.end)
        : '';
    }
    if (E.eventDescription) E.eventDescription.value = ev.description || '';

    setReadinessChecklistState(ev.readiness || ev.checklist || {});
    
    if (E.eventIssueLinkedInfo) {
      const issueIdStr = ev.issueId || '';
      if (issueIdStr) {
        const ids = issueIdStr
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        const uniqueIds = Array.from(new Set(ids));
        const issues = uniqueIds
          .map(id => DataStore.byId.get(id))
          .filter(Boolean);

        E.eventIssueLinkedInfo.style.display = 'block';

        if (issues.length) {
          const items = issues
            .slice(0, 3)
            .map(issue => {
              const meta = DataStore.computed.get(issue.id) || {};
              const r = meta.risk?.total || 0;
              const badgeClass = r
                ? CalendarLink.riskBadgeClass(r)
                : '';
              return `
                <li>
                  <button type="button" class="btn sm" data-open-issue="${U.escapeAttr(
                    issue.id
                  )}">${U.escapeHtml(issue.id)}</button>
                  ${U.escapeHtml(issue.title || '')}
                  ${
                    r
                      ? `<span class="event-risk-badge ${badgeClass}">RISK ${r}</span>`
                      : ''
                  }
                </li>`;
            })
            .join('');

          const extra = uniqueIds.length - issues.length;
          const extraHtml =
            extra > 0
              ? `<li class="muted">${extra} linked ID(s) not in current dataset</li>`
              : '';

          const more =
            uniqueIds.length > issues.length
              ? uniqueIds
                  .filter(id => !issues.find(i => i.id === id))
                  .join(', ')
              : '';

          E.eventIssueLinkedInfo.innerHTML = `
            Linked ticket(s):
            <ul style="margin:4px 0 0 18px;padding:0;font-size:12px;">
              ${items}
              ${extraHtml}
            </ul>
            ${
              more
                ? `<div class="muted" style="margin-top:4px;">Missing from dataset: ${U.escapeHtml(
                    more
                  )}</div>`
                : ''
            }
          `;
        } else {
          E.eventIssueLinkedInfo.innerHTML = `Linked ticket ID(s): ${U.escapeHtml(
            issueIdStr
          )} (not found in current dataset)`;
        }

        E.eventIssueLinkedInfo
          .querySelectorAll('[data-open-issue]')
          .forEach(btn => {
            btn.addEventListener('click', () => {
              const id = btn.getAttribute('data-open-issue');
              UI.Modals.openIssue(id);
            });
          });
      } else {
        E.eventIssueLinkedInfo.style.display = 'none';
        E.eventIssueLinkedInfo.textContent = '';
      }
    }

    if (E.eventModal) {
      E.eventModal.style.display = 'flex';
      if (!canManageEvents && E.eventForm) {
        E.eventForm
          .querySelectorAll('input,select,textarea,button[type="submit"]')
          .forEach(el => {
            if (el.id === 'eventCancel') return;
            if (el.id === 'eventModalClose') return;
            el.disabled = true;
          });
      } else if (E.eventForm) {
        E.eventForm.querySelectorAll('input,select,textarea,button[type="submit"]').forEach(el => {
          el.disabled = false;
        });
      }
      E.eventTitle?.focus();
    }
  },
  closeEvent() {
    if (!E.eventModal) return;
    E.eventModal.style.display = 'none';
    if (E.eventForm) E.eventForm.dataset.id = '';
    if (this.lastEventFocus?.focus) this.lastEventFocus.focus();
  }
};

const IssueEditor = {
  issue: null,
  DEV_TEAM_STATUS_OPTIONS: [
    'Local',
    'Staging',
    'Tested on stage',
    'Production',
    'Tested on Production',
    'disregard'
  ],
  ISSUE_RELATED_OPTIONS: ['Backend', 'Frontend', 'Mobile App', 'Hosting & infrastructure'],
  syncSelectOptions(selectEl, values = [], selected = '', placeholder = 'Select option') {
    if (!selectEl) return;
    const uniqueValues = [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))];
    const hasSelected = selected && uniqueValues.includes(selected);
    const finalValues = hasSelected ? uniqueValues : uniqueValues.concat(selected ? [selected] : []);
    selectEl.innerHTML = [`<option value="">${U.escapeHtml(placeholder)}</option>`]
      .concat(finalValues.map(v => `<option value="${U.escapeAttr(v)}">${U.escapeHtml(v)}</option>`))
      .join('');
    selectEl.value = selected || '';
  },
  syncMultiSelectOptions(selectEl, values = [], selectedValues = []) {
    if (!selectEl) return;
    const uniqueValues = [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))];
    const selectedSet = new Set(
      (Array.isArray(selectedValues) ? selectedValues : [])
        .map(v => String(v || '').trim())
        .filter(Boolean)
    );
    selectEl.innerHTML = uniqueValues
      .map(v => `<option value="${U.escapeAttr(v)}">${U.escapeHtml(v)}</option>`)
      .join('');
    Array.from(selectEl.options).forEach(option => {
      option.selected = selectedSet.has(option.value);
    });
  },
  parseIssueRelatedSelections(value = '') {
    return String(value || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
  },
  getSelectedMultiValues(selectEl) {
    if (!selectEl) return [];
    return Array.from(selectEl.selectedOptions || [])
      .map(option => String(option.value || '').trim())
      .filter(Boolean);
  },
  syncSheetDropdowns(selectedDevTeamStatus = '', selectedIssueRelated = '') {
    const rows = Array.isArray(DataStore.rows) ? DataStore.rows : [];
    const devTeamStatusValues = this.DEV_TEAM_STATUS_OPTIONS.concat(
      rows.map(r => r.devTeamStatus)
    );
    this.syncSelectOptions(
      E.editIssueDevTeamStatus,
      devTeamStatusValues,
      selectedDevTeamStatus,
      'Select dev team status'
    );
    this.syncMultiSelectOptions(
      E.editIssueRelated,
      this.ISSUE_RELATED_OPTIONS,
      this.parseIssueRelatedSelections(selectedIssueRelated)
    );
  },
  syncCategoryOptions(selected = '') {
    if (!E.editIssueType) return;
    const categories = buildIssueCategoryOptions(selected ? [selected] : []);
    E.editIssueType.innerHTML = ['<option value="">Select category</option>']
      .concat(categories.map(v => `<option value="${U.escapeAttr(v)}">${U.escapeHtml(v)}</option>`))
      .join('');
    if (selected && categories.includes(selected)) {
      E.editIssueType.value = selected;
    } else {
      E.editIssueType.value = '';
    }
  },
  open(issue) {
    if (!issue || !E.editIssueModal) return;
    this.issue = issue;

    const setVal = (el, val = '') => {
      if (el) el.value = val || '';
    };

    setVal(E.editIssueTitleInput, issue.title || '');
    setVal(E.editIssueDesc, issue.desc || '');
    setVal(E.editIssueModule, issue.module || '');
    setVal(E.editIssuePriority, issue.priority || '');
    setVal(E.editIssueStatus, issue.status || '');
    this.syncCategoryOptions(issue.type || '');
    setVal(E.editIssueDepartment, issue.department || '');
    setVal(E.editIssueName, issue.name || '');
    setVal(E.editIssueEmail, issue.emailAddressee || '');
    setVal(E.editIssueYoutrackReference, issue.youtrackReference || '');
    this.syncSheetDropdowns(issue.devTeamStatus || '', issue.issueRelated || '');
    setVal(E.editIssueFile, issue.file || '');

    if (E.editIssueDate) {
      const d = issue.date ? new Date(issue.date) : null;
      setVal(E.editIssueDate, d && !isNaN(d) ? toLocalDateValue(d) : '');
    }

    E.editIssueModal.style.display = 'flex';
    E.editIssueTitleInput?.focus?.();
  },
  close() {
    if (E.editIssueModal) E.editIssueModal.style.display = 'none';
    this.issue = null;
  },
  collectForm() {
    if (!this.issue) return null;
    return {
      id: this.issue.id,
      title: (E.editIssueTitleInput?.value || '').trim(),
      desc: (E.editIssueDesc?.value || '').trim(),
      module: (E.editIssueModule?.value || '').trim() || 'Unspecified',
      priority: E.editIssuePriority?.value || '',
      status: E.editIssueStatus?.value || '',
      type: (E.editIssueType?.value || '').trim(),
      department: (E.editIssueDepartment?.value || '').trim(),
      name: (E.editIssueName?.value || '').trim(),
      emailAddressee: (E.editIssueEmail?.value || '').trim(),
      notificationSent: this.issue.notificationSent || '',
      notificationUnderReview: this.issue.notificationUnderReview || '',
      youtrackReference: (E.editIssueYoutrackReference?.value || '').trim(),
      devTeamStatus: (E.editIssueDevTeamStatus?.value || '').trim(),
      issueRelated: this.getSelectedMultiValues(E.editIssueRelated).join(', '),
      notes: this.issue.notes || '',
      log: this.issue.log || '',
      file: (E.editIssueFile?.value || '').trim(),
      date: E.editIssueDate?.value || ''
    };
  }
};

const BulkEditor = {
  parseIds(raw = '') {
    return Array.from(
      new Set(
        String(raw || '')
          .split(/[\n,]/g)
          .map(v => v.trim())
          .filter(Boolean)
      )
    );
  },
  open() {
    if (!E.bulkEditModal) return;
    if (E.bulkIssueIds) {
      const filtered = UI.Issues.applyFilters().map(r => r.id).filter(Boolean);
      E.bulkIssueIds.value = filtered.slice(0, 30).join(', ');
    }
    IssueEditor.syncSelectOptions(
      E.bulkDevTeamStatus,
      IssueEditor.DEV_TEAM_STATUS_OPTIONS.concat((DataStore.rows || []).map(r => r.devTeamStatus)),
      '',
      'Keep current'
    );
    if (E.bulkPriority) E.bulkPriority.value = '';
    if (E.bulkStatus) E.bulkStatus.value = '';
    if (E.bulkNotes) E.bulkNotes.value = '';
    E.bulkEditModal.style.display = 'flex';
    E.bulkIssueIds?.focus?.();
  },
  close() {
    if (E.bulkEditModal) E.bulkEditModal.style.display = 'none';
  }
};

function buildIssueReplyMail(issue) {
  const khaledEmail = 'khaled.yakan@incheck360.nl';
  const toEmail = khaledEmail;
  const safeTitle = issue?.title || '(no title)';
  const subject = `Re: Ticket ${issue?.id || ''} - ${safeTitle}`.trim();
  const body =
    `Hi,\n\n` +
    `Regarding ticket ${issue?.id || '-'} (${safeTitle}),\n\n` +
    `[Write your reply here]\n\n` +
    `Best regards,`;

  return {
    toEmail,
    subject,
    body
  };
}

function openReplyComposerForIssue(issue) {
  if (!issue) {
    UI.toast('Open a ticket first.');
    return;
  }

  const mail = buildIssueReplyMail(issue);

  const outlookCompose = new URL('https://outlook.office.com/mail/deeplink/compose');
  outlookCompose.searchParams.set('to', mail.toEmail);
  outlookCompose.searchParams.set('subject', mail.subject);
  outlookCompose.searchParams.set('body', mail.body);

  window.open(outlookCompose.toString(), '_blank', 'noopener,noreferrer');
}

function applyIssueUpdate(savedIssue) {
  if (!savedIssue) return;
  const normalized = normalizeIssueForStore(savedIssue);
  const rows = DataStore.rows.slice();
  const idx = rows.findIndex(r => r.id === normalized.id);
  if (idx === -1) rows.push(normalized);
  else rows[idx] = { ...rows[idx], ...normalized };
  DataStore.hydrateFromRows(rows);
  IssuesCache.save(DataStore.rows);
}

async function onEditIssueSubmit(event) {
  console.log('Edit form submitted');
  event.preventDefault();
  if (!requirePermission(() => Permissions.canEditTicket(), 'Only admin can edit tickets.')) return;

  const id = (IssueEditor.issue?.id || '').trim();
  const title = (E.editIssueTitleInput?.value || '').trim();
  const description = (E.editIssueDesc?.value || '').trim();
  const module = (E.editIssueModule?.value || '').trim();
  const priority = E.editIssuePriority?.value || '';
  const status = E.editIssueStatus?.value || '';
  const type = (E.editIssueType?.value || '').trim();
  const department = (E.editIssueDepartment?.value || '').trim();
  const name = (E.editIssueName?.value || '').trim();
  const emailAddressee = (E.editIssueEmail?.value || '').trim();
  const notificationSent = IssueEditor.issue?.notificationSent || '';
  const notificationUnderReview = IssueEditor.issue?.notificationUnderReview || '';
  const youtrackReference = (E.editIssueYoutrackReference?.value || '').trim();
  const devTeamStatus = (E.editIssueDevTeamStatus?.value || '').trim();
  const issueRelated = IssueEditor.getSelectedMultiValues(E.editIssueRelated).join(', ');
  const notes = IssueEditor.issue?.notes || '';
  const log = IssueEditor.issue?.log || '';
  const link = (E.editIssueFile?.value || '').trim();
  const date = E.editIssueDate?.value || '';

  const missingFields = [];
  if (!id) missingFields.push('Ticket ID');
  if (!title) missingFields.push('Title');
  if (!description) missingFields.push('Description');
  if (!module) missingFields.push('Module');
  if (!priority) missingFields.push('Priority');
  if (!status) missingFields.push('Status');

  if (missingFields.length) {
    console.warn('Edit blocked: missing fields', missingFields);
    UI.toast(`Please fill the required fields: ${missingFields.join(', ')}`);
    return;
  }

const issueUpdate = {
    id,
    title,
     desc: description,
    module,
    priority,
    status,
    type,
    department,
    name,
    emailAddressee,
    notificationSent,
    notificationUnderReview,
    youtrackReference,
    devTeamStatus,
    issueRelated,
    notes,
    log,
  file: link,
    date
  };

  console.log('Saving edit issue update', issueUpdate);

  try {
    const updatedIssue = await saveIssueToSheet(issueUpdate, Session.authContext());
    if (!updatedIssue) {
      throw new Error('Issue update did not return a response.');
    }

    applyIssueUpdate(updatedIssue);
    IssueEditor.close();
    UI.Modals.closeIssue();
    UI.refreshAll();
  } catch (error) {
    console.error('Failed to update ticket', error);
    UI.toast(`Failed to update ticket: ${error.message}`);
  }
  }

async function onBulkEditSubmit(event) {
  event.preventDefault();
  if (!requirePermission(() => Permissions.canEditTicket(), 'Only admin can bulk edit tickets.')) return;

  const ticketIds = BulkEditor.parseIds(E.bulkIssueIds?.value || '');
  const patch = {
    priority: E.bulkPriority?.value || '',
    status: E.bulkStatus?.value || '',
    devTeamStatus: (E.bulkDevTeamStatus?.value || '').trim(),
    notes: (E.bulkNotes?.value || '').trim()
  };
  const changedKeys = Object.keys(patch).filter(key => patch[key]);

  if (!ticketIds.length) {
    UI.toast('Enter at least one ticket ID.');
    return;
  }
  if (!changedKeys.length) {
    UI.toast('Choose at least one field to update.');
    return;
  }

  let success = 0;
  const failures = [];
  UI.spinner(true);
  try {
    for (const id of ticketIds) {
      const baseIssue = DataStore.byId.get(id);
      if (!baseIssue) {
        failures.push(`${id} (not found in dataset)`);
        continue;
      }
      const payload = {
        ...baseIssue,
        ...patch,
        id
      };
      try {
        const updated = await saveIssueToSheet(payload, Session.authContext(), { silent: true });
        if (!updated) throw new Error('No response');
        applyIssueUpdate(updated);
        success += 1;
      } catch (error) {
        failures.push(`${id} (${error.message})`);
      }
    }
  } finally {
    UI.spinner(false);
  }

  BulkEditor.close();
  UI.refreshAll();
  if (!failures.length) {
    UI.toast(`Bulk update completed: ${success} ticket(s) updated.`);
    return;
  }
  UI.toast(`Bulk update done: ${success} updated, ${failures.length} failed.`);
  console.error('Bulk update failures', failures);
}


function debounce(fn, ms = 250) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function trapFocus(container, e) {
  const focusables = container.querySelectorAll(
    'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
  );
  if (!focusables.length) return;
  const first = focusables[0],
    last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    last.focus();
    e.preventDefault();
  } else if (!e.shiftKey && document.activeElement === last) {
    first.focus();
    e.preventDefault();
  }
}

function setActiveView(view) {
 const names = ['issues', 'calendar', 'insights'];
  names.forEach(name => {
    const tab =
      name === 'issues'
        ? E.issuesTab
        : name === 'calendar'
        ? E.calendarTab
      : E.insightsTab;
    const panel =
      name === 'issues'
        ? E.issuesView
        : name === 'calendar'
        ? E.calendarView
       : E.insightsView;
    const active = name === view;
    if (tab) {
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if (panel) panel.classList.toggle('active', active);
  });
  try {
    localStorage.setItem(LS_KEYS.view, view);
  } catch {}
  if (view === 'calendar') {
    ensureCalendar();
    renderCalendarEvents();
    scheduleCalendarResize();
  }
  if (view === 'insights') Analytics.refresh(UI.Issues.applyFilters());
}

/* ---------- Calendar wiring ---------- */
let calendar = null,
calendarReady = false,
  calendarResizeTimer = null,
  calendarResizeObserver = null,
  calendarResizeObservedEl = null;

function wireCalendar() {
  if (E.addEventBtn)
    E.addEventBtn.addEventListener('click', () => {
      if (!requirePermission(() => Permissions.canManageEvents(), 'Only admin can create events.')) return;
      const now = new Date();
      UI.Modals.openEvent({
        start: now,
        end: new Date(now.getTime() + 60 * 60 * 1000),
        allDay: false,
        env: 'Prod',
        status: 'Planned'
      });
    });

  [E.eventFilterDeployment, E.eventFilterMaintenance, E.eventFilterRelease, E.eventFilterOther].forEach(
    input => {
      if (input) input.addEventListener('change', renderCalendarEvents);
    }
  );

  if (E.calendarTz) {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
      E.calendarTz.textContent = `Times shown in: ${tz}`;
    } catch {
      E.calendarTz.textContent = '';
    }
  }

  observeCalendarContainer();
  window.addEventListener('resize', scheduleCalendarResize);
}

function wireFreezeWindows() {
  const openModal = () => {
    if (!E.freezeModal) return;
    E.freezeModal.style.display = 'flex';
    renderFreezeWindows();
  };
  const closeModal = () => {
    if (!E.freezeModal) return;
    E.freezeModal.style.display = 'none';
  };

  [E.freezeManageBtn, E.freezeManageBtnSecondary].forEach(btn => {
    if (btn)
      btn.addEventListener('click', () => {
        if (!requirePermission(() => Permissions.canManageFreezeWindows(), 'Only admin can manage freeze windows.'))
          return;
        openModal();
      });
  });

  if (E.freezeModalClose) {
    E.freezeModalClose.addEventListener('click', closeModal);
  }

  if (E.freezeModal) {
    E.freezeModal.addEventListener('click', e => {
      if (e.target === E.freezeModal) closeModal();
    });
  }

  if (E.freezeForm) {
    E.freezeForm.addEventListener('submit', e => {
      e.preventDefault();
      if (!requirePermission(() => Permissions.canManageFreezeWindows(), 'Only admin can change freeze windows.'))
        return;
      const days = Array.from(
        E.freezeForm.querySelectorAll('.freeze-day-grid input[type="checkbox"]:checked')
      ).map(input => Number(input.value));

      const startValue = E.freezeStart?.value || '';
      const endValue = E.freezeEnd?.value || '';
      const startHour = startValue ? Number(startValue.split(':')[0]) : NaN;
      const endHour = endValue ? Number(endValue.split(':')[0]) : NaN;

      if (!days.length) {
        UI.toast('Select at least one day for the freeze window.');
        return;
      }
      if (Number.isNaN(startHour) || Number.isNaN(endHour)) {
        UI.toast('Provide valid start and end times.');
        return;
      }
      if (endHour <= startHour) {
        UI.toast('End time must be after start time.');
        return;
      }

      const nextWindow = {
        id: `fw_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        dow: days,
        startHour,
        endHour
      };

      DataStore.freezeWindows = [...getFreezeWindows(), nextWindow];
      saveFreezeWindowsCache();
      renderFreezeWindows();
      renderCalendarEvents();
      E.freezeForm.reset();
    });
  }

  if (E.freezeReset) {
    E.freezeReset.addEventListener('click', () => {
      if (!requirePermission(() => Permissions.canManageFreezeWindows(), 'Only admin can reset freeze windows.'))
        return;
      DataStore.freezeWindows = withFreezeIds(CONFIG.CHANGE.freezeWindows || []);
      saveFreezeWindowsCache();
      renderFreezeWindows();
      renderCalendarEvents();
    });
  }
}

function scheduleCalendarResize() {
  if (!calendar) return;
  clearTimeout(calendarResizeTimer);
  calendarResizeTimer = setTimeout(() => {
    if (calendar) calendar.updateSize();
  }, 120);
}

function observeCalendarContainer() {
  const el = document.getElementById('calendar');
  const card = el ? el.closest('.card') || el : null;

  if (!card) return;
  if (calendarResizeObservedEl === card) return;

  if (calendarResizeObserver) {
    calendarResizeObserver.disconnect();
  }

  calendarResizeObservedEl = card;
  calendarResizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      if (entry.contentRect && entry.contentRect.width > 0) {
        scheduleCalendarResize();
        break;
      }
    }
  });

  calendarResizeObserver.observe(card);
}

function scheduleCalendarResize() {
  if (!calendar) return;
  clearTimeout(calendarResizeTimer);
  calendarResizeTimer = setTimeout(() => {
    if (calendar) calendar.updateSize();
  }, 120);
}

function ensureCalendar() {
  if (calendarReady) return;
  const el = document.getElementById('calendar');
  if (!el || typeof FullCalendar === 'undefined') {
    UI.toast('Calendar library failed to load');
    return;
  }
  calendar = new FullCalendar.Calendar(el, {
    initialView: 'dayGridMonth',
    selectable: true,
    editable: Permissions.canManageEvents(),
    height: 'auto',
    headerToolbar: {
      left: 'title',
      center: '',
      right: 'dayGridMonth,timeGridWeek,listWeek today prev,next'
    },
    select: info => {
      if (!requirePermission(() => Permissions.canManageEvents(), 'Only admin can create events.')) return;
      UI.Modals.openEvent({
        start: info.start,
        end: info.end,
        allDay: info.allDay,
        env: 'Prod',
        status: 'Planned'
      });
    },
    eventClick: info => {
      const ev =
        DataStore.events.find(e => e.id === info.event.id) || {
          id: info.event.id,
          title: info.event.title,
          type: info.event.extendedProps.type || 'Other',
          start: info.event.start,
          end: info.event.end,
          description: info.event.extendedProps.description || '',
          issueId: info.event.extendedProps.issueId || '',
          allDay: info.event.allDay,
          env: info.event.extendedProps.env || 'Prod',
          status: info.event.extendedProps.status || 'Planned',
          owner: info.event.extendedProps.owner || '',
          modules: info.event.extendedProps.modules || [],
          impactType: info.event.extendedProps.impactType || 'No downtime expected',
          readiness:
            info.event.extendedProps.readiness ||
            info.event.extendedProps.checklist ||
            {},
          notificationStatus: info.event.extendedProps.notificationStatus || ''
        };
      UI.Modals.openEvent(ev);
    },
    eventDrop: async info => {
      if (!requirePermission(() => Permissions.canManageEvents(), 'Only admin can move events.')) {
        info.revert();
        return;
      }
      const ev = DataStore.events.find(e => e.id === info.event.id);
      if (!ev) {
        info.revert();
        return;
      }
      const updated = {
        ...ev,
        start: info.event.start,
        end: info.event.end,
        allDay: info.event.allDay
      };
      const saved = await saveEventToSheet(updated, Session.authContext());
      if (!saved) {
        info.revert();
        return;
      }
      const idx = DataStore.events.findIndex(e => e.id === saved.id);
      if (idx > -1) DataStore.events[idx] = saved;
      saveEventsCache();
      renderCalendarEvents();
      refreshPlannerReleasePlans();
      Analytics.refresh(UI.Issues.applyFilters());
    },
    eventDidMount(info) {
      const ext = info.event.extendedProps || {};
      const riskSum = ext.risk || 0;
      if (riskSum) {
        const span = document.createElement('span');
        span.className = 'event-risk-badge ' + CalendarLink.riskBadgeClass(riskSum);
        span.textContent = `RISK ${riskSum}`;
        const titleEl = info.el.querySelector('.fc-event-title');
        if (titleEl) titleEl.appendChild(span);
      }

      const env = ext.env || 'Prod';
      const status = ext.status || 'Planned';
const readiness = ext.readiness || ext.checklist || {};
      const readinessState = readinessProgress(readiness);
      
      let tooltip = ext.description || '';
      if (ext.issueId) {
        const idStr = ext.issueId;
        const ids = idStr
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        const issues = ids
          .map(id => DataStore.byId.get(id))
          .filter(Boolean);
        if (issues.length) {
          const first = issues[0];
          const meta = DataStore.computed.get(first.id) || {};
          const r = meta.risk?.total || 0;
          tooltip =
            `${first.id} – ${first.title || ''}\nStatus: ${
              first.status || '-'
            } · Priority: ${first.priority || '-'} · Risk: ${r}` +
            (issues.length > 1
              ? `\n+ ${issues.length - 1} more linked ticket(s)`
              : '') +
            (tooltip ? `\n\n${tooltip}` : '');
        } else {
          tooltip =
            `Linked ticket(s): ${idStr}` + (tooltip ? `\n\n${tooltip}` : '');
        }
      }

      tooltip += `\nEnvironment: ${env} · Change status: ${status}`;
      if (readinessState.total) {
        tooltip += `\nReadiness: ${readinessState.done}/${readinessState.total} complete`;
      }
      if (ext.collision || ext.freeze || ext.hotIssues) {
        tooltip += `\n⚠️ Change risk signals:`;
        if (ext.collision) tooltip += ` overlaps with other change(s)`;
        if (ext.freeze) tooltip += ` · in freeze window`;
        if (ext.hotIssues) tooltip += ` · high-risk open issues`;
      }

      if (tooltip.trim()) info.el.setAttribute('title', tooltip);
    }
  });
  calendarReady = true;
  renderCalendarEvents();
  calendar.render();
  scheduleCalendarResize();
}

 function renderCalendarEvents() {
  if (!calendar) return;
  const activeTypes = new Set();
  if (E.eventFilterDeployment && E.eventFilterDeployment.checked)
    activeTypes.add('Deployment');
  if (E.eventFilterMaintenance && E.eventFilterMaintenance.checked)
    activeTypes.add('Maintenance');
  if (E.eventFilterRelease && E.eventFilterRelease.checked)
    activeTypes.add('Release');
  if (E.eventFilterOther && E.eventFilterOther.checked) activeTypes.add('Other');

  const links = computeEventsRisk(DataStore.rows, DataStore.events);
  const riskMap = new Map(links.map(r => [r.event.id, r.risk]));
  const { flagsById } = computeChangeCollisions(DataStore.rows, DataStore.events);

  calendar.removeAllEvents();
      DataStore.events.forEach(ev => {
    const type = ev.type || 'Other';
    if (activeTypes.size && !activeTypes.has(type)) return;
    const risk = riskMap.get(ev.id) || 0;

    const env = ev.env || 'Prod';
    const status = ev.status || 'Planned';
    const owner = ev.owner || '';
    const modules = Array.isArray(ev.modules)
      ? ev.modules
      : typeof ev.modules === 'string'
      ? ev.modules
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];
    const impactType = ev.impactType || '';
 const readiness = ev.readiness || ev.checklist || {};
        
    const flags = flagsById.get(ev.id) || {};
    const classNames = [
      'event-type-' + type.toLowerCase().replace(/\s+/g, '-'),
      'event-env-' + env.toLowerCase()
    ];
    if (flags.collision) classNames.push('event-collision');
    if (flags.freeze) classNames.push('event-freeze');
    if (flags.hotIssues) classNames.push('event-hot');

      calendar.addEvent({
      id: ev.id,
      title: ev.title,
      start: ev.start,
      end: ev.end || null,
      allDay: !!ev.allDay,
      extendedProps: {
        type,
        description: ev.description,
        issueId: ev.issueId || '',
        risk,
        env,
        status,
        owner,
        modules,
        impactType,
         readiness,
        notificationStatus: ev.notificationStatus || '',
        collision: !!flags.collision,
        freeze: !!flags.freeze,
        hotIssues: !!flags.hotIssues
      },
      classNames
    });    
    });
  scheduleCalendarResize();
  }

/* ---------- Networking & data loading ---------- */
async function safeFetchText(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, { cache: 'no-store', ...opts });
  } catch (error) {
    throw buildNetworkRequestError(url, error);
  }
  if (!res.ok)
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return await res.text();
}

function loadEventsCache() {
  try {
    const lastUpdated = localStorage.getItem(LS_KEYS.eventsLastUpdated);
    if (!U.isRecentIso(lastUpdated, CONFIG.DATA_STALE_HOURS)) return [];
    const raw = localStorage.getItem(LS_KEYS.events);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
function saveEventsCache() {
  try {
    localStorage.setItem(LS_KEYS.events, JSON.stringify(DataStore.events || []));
    localStorage.setItem(LS_KEYS.eventsLastUpdated, new Date().toISOString());
  } catch {}
}

function loadFreezeWindowsCache() {
  try {
    const raw = localStorage.getItem(LS_KEYS.freezeWindows);
    if (!raw) {
      DataStore.freezeWindows = withFreezeIds(CONFIG.CHANGE.freezeWindows || []);
      return;
    }
    const parsed = JSON.parse(raw);
    DataStore.freezeWindows = Array.isArray(parsed)
      ? withFreezeIds(parsed)
      : withFreezeIds(CONFIG.CHANGE.freezeWindows || []);
  } catch {
    DataStore.freezeWindows = withFreezeIds(CONFIG.CHANGE.freezeWindows || []);
  }
}

function saveFreezeWindowsCache() {
  try {
    localStorage.setItem(
      LS_KEYS.freezeWindows,
      JSON.stringify(DataStore.freezeWindows || [])
    );
  } catch {}
}

function renderFreezeWindows() {
  const windows = getFreezeWindows();
  const renderList = (el, allowRemove) => {
    if (!el) return;
    if (!windows.length) {
      el.innerHTML = '<div class="muted">No freeze windows configured.</div>';
      return;
    }
    el.innerHTML = windows
      .map(
        win => `
        <div class="freeze-window-item">
          <div class="freeze-window-tags">
            <span>${U.escapeHtml(formatFreezeWindow(win))}</span>
          </div>
          ${
            allowRemove
              ? `<button class="btn ghost sm" type="button" data-remove-freeze="${U.escapeAttr(
                  win.id || ''
                )}">Remove</button>`
              : ''
          }
        </div>
      `
      )
      .join('');
  };

  renderList(E.freezeWindowsList, false);
  renderList(E.freezeModalList, true);

  if (E.freezeModalList) {
    E.freezeModalList.querySelectorAll('[data-remove-freeze]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!requirePermission(() => Permissions.canManageFreezeWindows(), 'Only admin can remove freeze windows.'))
          return;
        const id = btn.getAttribute('data-remove-freeze');
        if (!id) return;
        DataStore.freezeWindows = getFreezeWindows().filter(win => win.id !== id);
        saveFreezeWindowsCache();
        renderFreezeWindows();
        renderCalendarEvents();
      });
    });
  }
}


function getIssueIdFromLink() {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get('issue');
  if (fromQuery) return fromQuery;

  const rawHash = (window.location.hash || '').replace(/^#/, '');
  if (rawHash.startsWith('issue-')) {
    return decodeURIComponent(rawHash.slice('issue-'.length));
  }

  return '';
}

function openIssueFromLink() {
  const issueId = getIssueIdFromLink();
  if (!issueId || !DataStore.byId.has(issueId)) return;
  if (UI.Modals.selectedIssue?.id === issueId && E.issueModal?.style.display === 'flex') return;
  UI.Modals.openIssue(issueId);
}

async function loadIssues(force = false) {
  if (!force && !DataStore.rows.length) {
    const cached = IssuesCache.load();
    if (cached && cached.length) {
      DataStore.hydrateFromRows(cached.map(raw => DataStore.normalizeRow(raw)));
      UI.Issues.renderFilters();
      setIfOptionExists(E.moduleFilter, Filters.state.module);
      setIfOptionExists(E.categoryFilter, Filters.state.category);
      setIfOptionExists(E.priorityFilter, Filters.state.priority);
      setIfOptionExists(E.statusFilter, Filters.state.status);
      setIfOptionExists(E.devTeamStatusFilter, Filters.state.devTeamStatus);
      setIfOptionExists(E.issueRelatedFilter, Filters.state.issueRelated);
      UI.skeleton(false);
      UI.refreshAll();
      openIssueFromLink();
    }
  }

  try {
    UI.spinner(true);
    UI.skeleton(true);
    const response = await Api.postAuthenticated(
      'tickets',
      'list',
      { filters: buildTicketListFiltersPayload() },
      { requireAuth: true }
    );
    const rawRows = extractEventsPayload(response);
    const rows = rawRows.map(raw => DataStore.normalizeRow(raw));
    DataStore.hydrateFromRows(rows.filter(r => r.id && String(r.id).trim() !== ''));
    IssuesCache.save(rawRows);
    UI.Issues.renderFilters();
    setIfOptionExists(E.moduleFilter, Filters.state.module);
    setIfOptionExists(E.categoryFilter, Filters.state.category);
    setIfOptionExists(E.priorityFilter, Filters.state.priority);
    setIfOptionExists(E.statusFilter, Filters.state.status);
    setIfOptionExists(E.devTeamStatusFilter, Filters.state.devTeamStatus);
    setIfOptionExists(E.issueRelatedFilter, Filters.state.issueRelated);
    UI.refreshAll();
    openIssueFromLink();
    UI.setSync('issues', true, new Date());
  } catch (e) {
    if (isAuthError(e)) {
      await handleExpiredSession('Session expired while loading tickets.');
      return;
    }
    if (!DataStore.rows.length && E.issuesTbody) {
      E.issuesTbody.innerHTML = `
        <tr>
          <td colspan="${ColumnManager.getVisibleColumnCount()}" style="color:#ffb4b4;text-align:center">
            Error loading data and no cached data found.
            <button type="button" id="retryLoad" class="btn sm" style="margin-left:8px">Retry</button>
          </td>
        </tr>`;
      const retryBtn = document.getElementById('retryLoad');
      if (retryBtn) retryBtn.addEventListener('click', () => loadIssues(true));
    }
    UI.toast('Error loading issues: ' + e.message);
    UI.setSync('issues', !!DataStore.rows.length, null);
  } finally {
    UI.spinner(false);
    UI.skeleton(false);
  }
}

async function loadEvents(force = false, options = {}) {
  const cached = loadEventsCache();
  if (cached && cached.length && !force) {
    DataStore.events = cached;
    ensureCalendar();
    renderCalendarEvents();
    refreshPlannerReleasePlans();
    Analytics.refresh(UI.Issues.applyFilters());
    UI.setSync('events', true, new Date());
  }

  if (!CONFIG.CALENDAR_API_URL) return;

  try {
    UI.spinner(true);
    const data = await Api.postAuthenticated(
      'events',
      'list',
      {
        sheetName: CONFIG.CALENDAR_SHEET_NAME,
        tabName: CONFIG.CALENDAR_SHEET_NAME
      },
      { requireAuth: true }
    );

    const events = extractEventsPayload(data);

    const normalized = events.map(ev => {
      const modulesArr = Array.isArray(ev.modules)
        ? ev.modules
        : typeof getEventField(ev, ['modules', 'module']) === 'string'
        ? getEventField(ev, ['modules', 'module'])
            .split(/[,\n;|]/)
            .map(s => s.trim())
            .filter(Boolean)
        : [];
      let readiness =
        getEventField(ev, ['readiness', 'checklist', 'readinessChecklist']) || {};
      if (typeof readiness === 'string') {
        try {
          readiness = JSON.parse(readiness);
        } catch {
          readiness = {};
        }
      }
      return {
        id:
          getEventField(ev, ['id', 'eventId', 'event_id']) ||
          'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        title: getEventField(ev, ['title', 'eventTitle', 'name']) || '',
        type: getEventField(ev, ['type', 'eventType']) || 'Other',
        start: normalizeEventDate(
          getEventField(ev, ['start', 'startDate', 'start date', 'date']) || ''
        ),
        end: normalizeEventDate(
          getEventField(ev, ['end', 'endDate', 'end date', 'finish']) || ''
        ),
        allDay: parseBoolean(getEventField(ev, ['allDay', 'all_day', 'all day'])),
        description: getEventField(ev, ['description', 'notes']) || '',
        issueId: getEventField(ev, ['issueId', 'issue_id', 'ticketId']) || '',
        env: getEventField(ev, ['env', 'environment']) || 'Prod',
        status: getEventField(ev, ['status']) || 'Planned',
        owner: getEventField(ev, ['owner']) || '',
        modules: modulesArr,
        impactType:
          getEventField(ev, ['impactType', 'impact', 'impact type']) ||
          'No downtime expected',
        notificationStatus:
          getEventField(ev, ['notificationStatus', 'notification_status']) || '',
        readiness: readiness && typeof readiness === 'object' ? readiness : {},
        checklist: readiness && typeof readiness === 'object' ? readiness : {}
      };
    }).filter(ev => ev.start);

    DataStore.events = normalized;
    saveEventsCache();
    ensureCalendar();
    renderCalendarEvents();
    refreshPlannerReleasePlans();
    Analytics.refresh(UI.Issues.applyFilters());
    UI.setSync('events', true, new Date());
  } catch (e) {
    const errMsg = String(e?.message || 'Unknown error');
    if (isAuthError(e)) {
      await handleExpiredSession('Session expired while loading calendar events.');
      return;
    }

    DataStore.events = cached || [];
    ensureCalendar();
    renderCalendarEvents();
    refreshPlannerReleasePlans();
    UI.setSync('events', !!DataStore.events.length, null);
    UI.toast(
      DataStore.events.length
        ? 'Using cached events (API error)'
        : 'Unable to load calendar events: ' + errMsg
    );
  } finally {
    UI.spinner(false);
  }
}

function parseApiJson(text, sourceName = 'API') {
  if (!text || !String(text).trim()) return {};

  const raw = String(text).trim();
  try {
    return JSON.parse(raw);
  } catch {}

  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const candidate = raw.slice(first, last + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  // Some backends return URL-encoded objects (e.g. "ok=true&token=...").
  if (raw.includes('=') && !raw.includes('<')) {
    try {
      const params = new URLSearchParams(raw);
      if (Array.from(params.keys()).length) {
        const mapped = {};
        params.forEach((value, key) => {
          mapped[key] = value;
        });
        return mapped;
      }
    } catch {}
  }

  // Support simple "key: value" response bodies.
  if (/^[A-Za-z0-9_.-]+\s*:\s*.+$/m.test(raw) && !raw.includes('<')) {
    const mapped = {};
    raw.split(/\r?\n/).forEach(line => {
      const idx = line.indexOf(':');
      if (idx <= 0) return;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!key) return;
      mapped[key] = value;
    });
    if (Object.keys(mapped).length) return mapped;
  }

  const looksLikeHtml = /<!doctype html|<html[\s>]/i.test(raw);
  if (looksLikeHtml) {
    throw new Error(`${sourceName} returned HTML instead of JSON. Check API_BASE_URL/proxy.`);
  }

  throw new Error(
    `${sourceName} returned a non-JSON response.`
  );
}

function extractEventsPayload(data) {
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return extractEventsPayload(parsed);
    } catch {
      return [];
    }
  }
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  // Backend responses may nest JSON in different envelope keys.
  const candidates = [
    data.events,
    data.data,
    data.items,
    data.rows,
    data.result,
    data.payload,
    data.response,
    data.contents
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === 'object') {
      const nested = extractEventsPayload(candidate);
      if (nested.length) return nested;
    }
    if (typeof candidate === 'string') {
      const nested = extractEventsPayload(candidate);
      if (nested.length) return nested;
    }
  }

  if (typeof data.events === 'string') {
    try {
      const parsed = JSON.parse(data.events);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }

  return [];
}

function normalizeEventDate(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  // FullCalendar parses ISO formats reliably; normalize common "YYYY-MM-DD HH:mm" values.
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(raw)) {
    return raw.replace(/\s+/, 'T');
  }
  return raw;
}

function getEventField(eventObj, aliases) {
  if (!eventObj || typeof eventObj !== 'object' || !Array.isArray(aliases)) return '';
  const normalize = value => String(value).replace(/[\s_-]+/g, '').toLowerCase();
  for (const alias of aliases) {
    if (!alias) continue;
    if (Object.prototype.hasOwnProperty.call(eventObj, alias) && eventObj[alias] != null) {
      return eventObj[alias];
    }
    const normalizedAlias = normalize(alias);
    const key = Object.keys(eventObj).find(
      k => normalize(k) === normalizedAlias
    );
    if (key && eventObj[key] != null) return eventObj[key];
  }
  return '';
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return ['1', 'true', 'yes', 'y', 'up', 'online', 'ok', 'healthy', 'success'].includes(normalized);
}

const RESTRICTED_VIEWER_FIELDS = ['youtrackReference', 'devTeamStatus', 'issueRelated', 'notes'];

function getCurrentAuthToken() {
  return typeof Session?.getAuthToken === 'function'
    ? Session.getAuthToken()
    : String(Session?.authContext?.().authToken || '');
}

function buildTicketListFiltersPayload() {
  const state = Filters?.state || {};
  const payload = {};
  if (state.search) payload.search = state.search;
  if (state.module && state.module !== 'All') payload.module = state.module;
  if (state.category && state.category !== 'All') payload.category = state.category;
  if (state.priority && state.priority !== 'All') payload.priority = state.priority;
  if (state.status && state.status !== 'All') payload.status = state.status;
  if (state.start) payload.start = state.start;
  if (state.end) payload.end = state.end;
  if (Permissions.canUseInternalIssueFilters()) {
    if (state.devTeamStatus && state.devTeamStatus !== 'All')
      payload.devTeamStatus = state.devTeamStatus;
    if (state.issueRelated && state.issueRelated !== 'All')
      payload.issueRelated = state.issueRelated;
  }
  return payload;
}

/* ---------- Save/Delete via backend proxy ---------- */
function normalizeIssueForStore(issue, options = {}) {
  const includeRestricted =
    options.includeRestrictedFields !== undefined
      ? !!options.includeRestrictedFields
      : Permissions.isAdmin();
  const normalized = {
    id: issue.id || '',
    name: issue.name || '',
    department: issue.department || '',
    module: issue.module || 'Unspecified',
    title: issue.title || '',
    desc: issue.desc || '',
    file: issue.file || '',
    emailAddressee: issue.emailAddressee || '',
    notificationSent: issue.notificationSent || '',
    notificationUnderReview: issue.notificationUnderReview || '',
    priority: DataStore.normalizePriority(issue.priority),
    status: DataStore.normalizeStatus(issue.status),
    type: issue.type || '',
    date: issue.date || '',
    log: issue.log || ''
  };
  if (includeRestricted) {
    normalized.youtrackReference = issue.youtrackReference || '';
    normalized.devTeamStatus = issue.devTeamStatus || '';
    normalized.issueRelated = issue.issueRelated || '';
    normalized.notes = issue.notes || '';
  }
  return normalized;
}

function buildIssueIdCandidates(id) {
  const raw = String(id || '').trim();
  if (!raw) return [];
  const candidates = new Set([raw]);

  // Some Google Sheet exports preserve a leading apostrophe for text IDs (e.g. "'12345").
  const withoutLeadingQuote = raw.replace(/^'+/, '').trim();
  if (withoutLeadingQuote) candidates.add(withoutLeadingQuote);

  // Preserve compatibility for handlers that normalize casing internally.
  candidates.add(raw.toUpperCase());
  candidates.add(raw.toLowerCase());

  return Array.from(candidates).filter(Boolean);
}

function buildIssueUpdateFields(payload, candidateId) {
  const fields = {
    id: candidateId,
    ticket_id: candidateId,
    title: payload.title,
    description: payload.desc,
    desc: payload.desc,
    module: payload.module,
    impactedModule: payload.module,
    'impacted module': payload.module,
    priority: payload.priority,
    status: payload.status,
    category: payload.type,
    issueType: payload.type,
    type: payload.type,
    log: payload.log,
    date: payload.date,
    file: payload.file,
    link: payload.file,
    fileUpload: payload.file,
    'file upload': payload.file,
    department: payload.department,
    name: payload.name,
    emailAddressee: payload.emailAddressee,
    email: payload.emailAddressee,
    'email addressee': payload.emailAddressee,
    notificationSent: payload.notificationSent,
    'notification sent': payload.notificationSent,
    notificationUnderReview: payload.notificationUnderReview,
    notificationSentUnderReview: payload.notificationUnderReview,
    'notification sent under review': payload.notificationUnderReview,
    youtrackReference: payload.youtrackReference,
    youTrackReference: payload.youtrackReference,
    youtrack_reference: payload.youtrackReference,
    'youtrack reference': payload.youtrackReference,
    'YouTrack Reference': payload.youtrackReference,
    devTeamStatus: payload.devTeamStatus,
    dev_team_status: payload.devTeamStatus,
    'dev team status': payload.devTeamStatus,
    'Dev Team Status': payload.devTeamStatus,
    issueRelated: payload.issueRelated,
    issue_related: payload.issueRelated,
    'issue related': payload.issueRelated,
    'Issue Related': payload.issueRelated,
    notes: payload.notes
  };
  if (!Permissions.isAdmin()) {
    RESTRICTED_VIEWER_FIELDS.forEach(field => {
      delete fields[field];
    });
    delete fields.youTrackReference;
    delete fields.youtrack_reference;
    delete fields['youtrack reference'];
    delete fields['YouTrack Reference'];
    delete fields.dev_team_status;
    delete fields['dev team status'];
    delete fields['Dev Team Status'];
    delete fields.issue_related;
    delete fields['issue related'];
    delete fields['Issue Related'];
  }
  return fields;
}

async function saveIssueToSheet(issue, auth = {}, options = {}) {
  if (!CONFIG.ISSUE_API_URL) {
    UI.toast('Issue update endpoint is not configured.');
    return null;
  }

 const useSpinner = !options.silent;
  if (useSpinner) UI.spinner(true);
  try {
    const payload = normalizeIssueForStore(issue, { includeRestrictedFields: Permissions.isAdmin() });
     const issueId = payload.id || issue.id || '';
    const issueIdCandidates = buildIssueIdCandidates(issueId);
    if (!issueIdCandidates.length) {
      throw new Error('Missing ticket ID for update.');
    }
    const compatibilityBodies = issueIdCandidates.flatMap(candidateId => {
      const updates = buildIssueUpdateFields(payload, candidateId);
      const updateRequestBody = {
        id: candidateId,
        ticket_id: candidateId,
        key: {
          id: candidateId,
          ticket_id: candidateId
        },
        authToken: auth.authToken || getCurrentAuthToken(),
        updates
      };

     return [
        {
          label: `update payload [id=${candidateId}]`,
          body: updateRequestBody
        },
        {
          // Legacy backend variants that expect flattened update fields
          // instead of an "updates" envelope.
          label: `update payload (flat) [id=${candidateId}]`,
          body: {
            id: candidateId,
            ticket_id: candidateId,
            key: {
              id: candidateId,
              ticket_id: candidateId
            },
            authToken: auth.authToken || getCurrentAuthToken(),
            ...updateRequestBody.updates
          }
        }
       ];
    });
    for (const variant of compatibilityBodies) {
      try {
        const result = await Api.postAuthenticated('tickets', 'update', variant.body, {
          requireAuth: true
        });
        UI.toast('Issue updated');
        const returnedIssue = result?.issue || result || {};
        return normalizeIssueForStore({ ...payload, ...returnedIssue });
      } catch (error) {
        if (isAuthError(error)) throw error;
      }
    }
    throw new Error('Issue update rejected by backend.');
  } catch (e) {
    if (isAuthError(e)) {
      await handleExpiredSession('Session expired while updating ticket.');
      return null;
    }
    UI.toast('Error updating issue: ' + e.message);
   throw e;
  } finally {
    if (useSpinner) UI.spinner(false);
  }
 }

async function saveEventToSheet(event, auth = {}) {
  UI.spinner(true);
  try {
    // Ensure we always have a clean ID
    const evId =
      event.id && String(event.id).trim()
        ? String(event.id).trim()
        : 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2);

    // Normalize modules into an array of strings
    const modulesArr = Array.isArray(event.modules)
      ? event.modules
      : typeof event.modules === 'string'
      ? event.modules
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];

    // Canonical payload with all fields expected by backend proxy
    const payload = {
      id: evId,
      title: event.title || '',
      type: event.type || 'Deployment',

      env: event.env || event.environment || 'Prod',
      status: event.status || 'Planned',
      owner: event.owner || '',
      modules: modulesArr,
      impactType: event.impactType || event.impact || 'No downtime expected',
      issueId: event.issueId || '',

      start: event.start || '',
      end: event.end || '',
      description: event.description || '',

      notificationStatus: event.notificationStatus || '',
     allDay: !!event.allDay,
      readiness: event.readiness || event.checklist || {},
      checklist: event.checklist || event.readiness || {}
    };

     console.log('[Ticketing Dashboard] sending event payload to backend proxy:', payload);

    const data = await Api.postAuthenticated('events', 'save', {
      authToken: auth.authToken || getCurrentAuthToken(),
      sheetName: CONFIG.CALENDAR_SHEET_NAME,
      tabName: CONFIG.CALENDAR_SHEET_NAME,
      event: payload
    });
    if (data) {
      UI.toast('Event saved');
      const savedEvent = data.event || data || payload;
      if (!savedEvent.notificationStatus && payload.notificationStatus) {
        savedEvent.notificationStatus = payload.notificationStatus;
      }
      if (!savedEvent.readiness && payload.readiness) {
        savedEvent.readiness = payload.readiness;
      }
         if (!savedEvent.checklist && payload.checklist) {
        savedEvent.checklist = payload.checklist;
      }
      return savedEvent;
    }
    return null;
  } catch (e) {
    if (isAuthError(e)) {
      await handleExpiredSession('Session expired while saving event.');
      return null;
    }
    UI.toast('Network error saving event: ' + e.message);
    return null;
  } finally {
    UI.spinner(false);
  }
}

async function deleteEventFromSheet(id, auth = {}) {
  UI.spinner(true);
  try {
    await Api.postAuthenticated('events', 'delete', {
      authToken: auth.authToken || getCurrentAuthToken(),
      sheetName: CONFIG.CALENDAR_SHEET_NAME,
      tabName: CONFIG.CALENDAR_SHEET_NAME,
      id
    });
    UI.toast('Event deleted');
    return true;
  } catch (e) {
    if (isAuthError(e)) {
      await handleExpiredSession('Session expired while deleting event.');
      return false;
    }
    UI.toast('Error deleting event: ' + e.message);
    return false;
  } finally {
    UI.spinner(false);
  }
}

/* ---------- Excel export ---------- */
function buildIssueExportRow(issue) {
  const row = {
     'Ticket ID': issue.id,
    Date: issue.date,
    Name: issue.name,
    Department: issue.department,
    Title: issue.title,
    Description: issue.desc,
    Priority: issue.priority,
    Module: issue.module,
    Link: issue.file,
    'Email Addressee': issue.emailAddressee,
    Category: issue.type,
    Status: issue.status,
    'Notification Sent': issue.notificationSent,
    Log: issue.log,
    'Notification Sent Under Review': issue.notificationUnderReview
  };
  if (Permissions.isAdmin()) {
    row['YouTrack Reference'] = issue.youtrackReference;
    row['Dev Team Status'] = issue.devTeamStatus;
    row['Issue Related'] = issue.issueRelated;
    row.Notes = issue.notes;
  }
  return row;
}

const ISSUE_EXPORT_HEADERS = [
  'Ticket ID',
  'Date',
  'Name',
  'Department',
  'Title',
  'Description',
  'Priority',
  'Module',
  'Link',
  'Email Addressee',
  'Category',
  'Status',
  'Notification Sent',
  'Log',
  'Notification Sent Under Review'
];

const ISSUE_EXPORT_HEADERS_ADMIN_ONLY = [
  'YouTrack Reference',
  'Dev Team Status',
  'Issue Related',
  'Notes'
];

function exportIssuesToExcel(rows, suffix) {
  if (!rows.length) return UI.toast('Nothing to export (no rows).');
    if (typeof XLSX === 'undefined') {
    UI.toast('Excel export unavailable (missing XLSX library).');
    return;
  }

 
  
  const issueRows = rows.map(buildIssueExportRow);
  const headers = Permissions.isAdmin()
    ? [...ISSUE_EXPORT_HEADERS.slice(0, 13), ...ISSUE_EXPORT_HEADERS_ADMIN_ONLY, ...ISSUE_EXPORT_HEADERS.slice(13)]
    : ISSUE_EXPORT_HEADERS;
  const wsIssues = XLSX.utils.json_to_sheet([]);
  XLSX.utils.sheet_add_aoa(wsIssues, [headers]);
  XLSX.utils.sheet_add_json(wsIssues, issueRows, {
    header: headers,
    skipHeader: true,
    origin: 'A2'
  });
   wsIssues['!cols'] = headers.map(h => ({ wch: Math.max(12, h.length + 4) }));

  const statusCounts = rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const summaryRows = [
    ['Generated at', new Date().toLocaleString()],
    ['Filter - Search', Filters.state.search || ''],
    ['Filter - Module', Filters.state.module || 'All'],
    ['Filter - Category', Filters.state.category || 'All'],
    ['Filter - Priority', Filters.state.priority || 'All'],
    ['Filter - Status', Filters.state.status || 'All'],
    ['Filter - Start Date', Filters.state.start || ''],
    ['Filter - End Date', Filters.state.end || ''],
    ['Total issues (all)', DataStore.rows.length],
    ['Total issues (filtered)', rows.length],
    [],
    ['Status breakdown', 'Count']
  ];
  Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => summaryRows.push([status, count]));
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 24 }, { wch: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
  XLSX.utils.book_append_sheet(wb, wsIssues, 'Issues');

  const ts = new Date().toISOString().slice(0, 10);
 const filename = `incheck_issues_${suffix || 'filtered'}_${ts}.xlsx`;
  XLSX.writeFile(wb, filename);
  UI.toast('Exported Excel workbook');
}

function exportFilteredExcel() {
  const rows = UI.Issues.applyFilters();
 exportIssuesToExcel(rows, 'filtered');
}

function buildIssueDetailExportRows(issue, risk = {}, meta = {}) {
  const categories = (meta.suggestions?.categories || [])
    .slice(0, 3)
    .map(c => c.label)
    .join(', ') || '—';
  const reasons = risk.reasons?.length ? risk.reasons.join(', ') : '—';
  const rows = [
    ['Ticket', `TICKET:${issue.id || '-'}`],
    ['Name', issue.name || 'Unknown'],
    ['Title', issue.title || 'Untitled ticket'],
    ['Description', issue.desc || '—'],
    ['Status', issue.status || '—'],
    ['Priority', issue.priority || '—'],
    ['Risk Score', risk.total || 0],
    ['Submitted', issue.createdAt || issue.date || '—'],
    ['Date', issue.date || '—'],
    ['Department', issue.department || '—'],
    ['Module', issue.module || '—'],
    ['Email', issue.email || '—'],
    ['Email Addressee', issue.emailAddressee || '—'],
    ['Notification Sent', issue.notificationSent || '—'],
    ['Notification Under Review', issue.notificationUnderReview || '—'],
    ['Log', issue.log || '—'],
    ['Suggested Priority', meta.suggestions?.priority || '—'],
    ['Suggested Categories', categories],
    ['Risk Signals', `Tech ${risk.technical || 0}, Biz ${risk.business || 0}, Ops ${risk.operational || 0}, Time ${risk.time || 0}`],
    ['Severity / Impact / Urgency', `${risk.severity || 0} / ${risk.impact || 0} / ${risk.urgency || 0}`],
    ['Reasons', reasons]
  ];
  if (Permissions.isAdmin()) {
    rows.splice(
      14,
      0,
      ['YouTrack Reference', issue.youtrackReference || '—'],
      ['Dev Team Status', issue.devTeamStatus || '—'],
      ['Issue Related', issue.issueRelated || '—'],
      ['Notes', issue.notes || '—']
    );
  }
  return rows;
}

function exportSelectedIssueToExcel() {
  const issue = UI.Modals.selectedIssue;
  if (!issue) return UI.toast('Open a ticket before exporting.');
  if (typeof XLSX === 'undefined') {
    UI.toast('Excel export unavailable (missing XLSX library).');
    return;
  }

  const meta = DataStore.computed.get(issue.id) || {};
  const risk = meta.risk || {};
  const rows = buildIssueDetailExportRows(issue, risk, meta).map(([field, value]) => [
    field,
    value == null ? '' : String(value)
  ]);
  const ws = XLSX.utils.aoa_to_sheet([['Field', 'Value'], ...rows]);
  ws['!cols'] = [{ wch: 30 }, { wch: 110 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ticket View');
  const safeId = String(issue.id || 'ticket').replace(/[^\w-]+/g, '_');
  XLSX.writeFile(wb, `ticket_${safeId}.xlsx`);
  UI.toast('Ticket exported as Excel');
}

function exportSelectedIssueToPdf() {
  const issue = UI.Modals.selectedIssue;
  if (!issue) return UI.toast('Open a ticket before exporting.');
  const detailHtml = E.modalBody?.innerHTML || '';
  if (!detailHtml.trim()) return UI.toast('Nothing to export.');

  const title = `TICKET:${issue.id || '-'}`;
  const baseHref = U.escapeAttr(window.location.href);
  const printableDoc = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${U.escapeHtml(title)}</title>
        <base href="${baseHref}" />
        <link rel="stylesheet" href="styles.css" />
        <style>
          body { margin: 24px; background: #fff; color: #111; }
          .ticket-detail { box-shadow: none; border: 1px solid #ddd; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>${detailHtml}</body>
    </html>
  `;

  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1080,height=900');
  if (printWindow) {
    printWindow.document.write(printableDoc);
    printWindow.document.close();
    const printNow = () => {
      printWindow.focus();
      printWindow.print();
      UI.toast('Use Save as PDF in the print dialog.');
    };
    if (printWindow.document.readyState === 'complete') {
      setTimeout(printNow, 150);
    } else {
      printWindow.addEventListener('load', () => setTimeout(printNow, 150), { once: true });
    }
    return;
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

  const cleanup = () => {
    setTimeout(() => iframe.remove(), 1500);
  };

  const printFromFrame = () => {
    const frameWindow = iframe.contentWindow;
    if (!frameWindow) {
      cleanup();
      UI.toast('Unable to open print dialog. Check browser print settings.');
      return;
    }
    frameWindow.focus();
    frameWindow.print();
    UI.toast('Pop-up blocked. Opened print dialog without a new window.');
    cleanup();
  };

  const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!frameDoc) {
    cleanup();
    UI.toast('Unable to prepare PDF export.');
    return;
  }
  frameDoc.open();
  frameDoc.write(printableDoc);
  frameDoc.close();

  if (frameDoc.readyState === 'complete') {
    setTimeout(printFromFrame, 150);
  } else {
    iframe.addEventListener('load', () => setTimeout(printFromFrame, 150), { once: true });
  }
}

/* ---------- Release Planner wiring & rendering ---------- */

let LAST_PLANNER_CONTEXT = null;
let LAST_PLANNER_RESULT = null;

function renderPlannerResults(result, context) {
  if (!E.plannerResults) return;
  const { slots, bug, bomb, ticketContext } = result;
  const { env, modules, releaseType, horizonDays, region, description, tickets } = context;
  const allowPlannerChanges = Permissions.canChangePlanner();

  if (!slots.length) {
    E.plannerResults.innerHTML =
      '<span>No suitable windows found in the selected horizon. Try widening the horizon or targeting fewer modules.</span>';
    if (E.plannerAddEvent) E.plannerAddEvent.disabled = true;
    return;
  }

  const regionLabel =
    region === 'gulf'
      ? 'Gulf (KSA / UAE / Qatar)'
      : region === 'levant'
      ? 'Levant'
      : 'North Africa';

  const modulesLabel = modules && modules.length ? modules.join(', ') : 'All modules';
  const bugLabel = ReleasePlanner.bugLabel(bug.risk);
  const bombLabel = ReleasePlanner.bombLabel(bomb.risk);

  const ticketIssues = (ticketContext && ticketContext.issues) || [];
  const ticketsCount = ticketIssues.length;
  const maxTicketRisk = ticketContext?.maxRisk || 0;
  const avgTicketRisk = ticketContext?.avgRisk || 0;
  const ticketsLine = ticketsCount
    ? `Tickets in scope: ${ticketsCount} issue(s), max risk ${maxTicketRisk.toFixed(
        1
      )}, avg risk ${avgTicketRisk.toFixed(1)}.`
    : 'No specific tickets selected – using module + description only.';

  const intro = `
    <div style="margin-bottom:6px;">
      Top ${slots.length} suggested windows for a <strong>${U.escapeHtml(
        releaseType
      )}</strong> release on <strong>${U.escapeHtml(
    env
  )}</strong> touching <strong>${U.escapeHtml(
    modulesLabel
  )}</strong><br/>
      Horizon: next ${horizonDays} day(s), region profile: ${U.escapeHtml(regionLabel)}.<br/>
      <span class="muted">${U.escapeHtml(ticketsLine)}</span><br/>
      <span class="muted">Recent bug pressure: ${U.escapeHtml(
        bugLabel
      )}. Historical &ldquo;bomb bug&rdquo; pattern: ${U.escapeHtml(
    bombLabel
  )}.</span>
    </div>
  `;

  let bombExamplesHtml = '';
  if (bomb.examples && bomb.examples.length) {
    const items = bomb.examples
      .map(ex => {
        const days = Math.round(ex.ageDays);
        return `<li><strong>${U.escapeHtml(ex.id)}</strong> — ${U.escapeHtml(
          ex.title || ''
        )} <span class="muted">(risk ${ex.risk}, ~${days}d old)</span></li>`;
      })
      .join('');
    bombExamplesHtml = `
      <div class="muted" style="font-size:11px;margin-bottom:4px;">
        Related historical incidents:
        <ul style="margin:4px 0 0 18px;padding:0;">
          ${items}
        </ul>
      </div>`;
  }

  const htmlSlots = slots
    .map((slot, idx) => {
      const d = slot.start;
      const dateStr = d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
      const timeStr = d.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      });

      const bucket = ReleasePlanner.riskBucket(slot.totalRisk);
      const rushLabel = ReleasePlanner.rushLabel(slot.rushRisk);
      const bugLabelPerSlot = ReleasePlanner.bugLabel(slot.bugRisk);
      const bombLabelPerSlot = ReleasePlanner.bombLabel(slot.bombRisk);
      const eventsLabelRaw = slot.eventCount
        ? `${slot.eventCount} overlapping change event(s)`
        : 'no overlapping change events';
      const holidayLabel = slot.holidayCount
        ? `${slot.holidayCount} holiday(s) in window`
        : 'no holidays in window';
      const eventsLabel = slot.holidayCount
        ? `${holidayLabel} · ${eventsLabelRaw}`
        : eventsLabelRaw;

      const safetyIndex = (slot.safetyScore / 10) * 100;
      const blastComment =
        bucket.label === 'Low'
          ? 'Low blast radius; safe default with rollback buffer.'
          : bucket.label === 'Medium'
          ? 'Medium blast radius; keep tight monitoring and rollback plan.'
          : 'High blast risk; only use with strict approvals and on-call coverage.';

      const startIso = d.toISOString();
      const endIso = slot.end.toISOString();

      return `
      <div class="planner-slot" data-index="${idx}">
        <div class="planner-slot-header">
          <span>#${idx + 1} · ${U.escapeHtml(dateStr)} · ${U.escapeHtml(timeStr)}</span>
          <span class="planner-slot-score ${bucket.className}">
            Risk ${slot.totalRisk.toFixed(1)} / 10 · ${bucket.label}
          </span>
        </div>
        <div class="planner-slot-meta">
          Rush: ${U.escapeHtml(rushLabel)} · Bugs: ${U.escapeHtml(
        bugLabelPerSlot
      )} · Bomb-bug: ${U.escapeHtml(
        bombLabelPerSlot
      )}<br/>Calendar: ${U.escapeHtml(
        eventsLabel
      )}<br/>Safety index: ${safetyIndex.toFixed(0)}%
        </div>
        <div class="planner-slot-meta">
          Expected effect on F&amp;B clients: ${U.escapeHtml(blastComment)}
        </div>
        ${
          allowPlannerChanges
            ? `<div class="planner-slot-meta">
          <button type="button"
                  class="btn sm"
                  data-add-release="${U.escapeAttr(startIso)}"
                  data-add-release-end="${U.escapeAttr(endIso)}">
            ➕ Add this window as Release event
          </button>
        </div>`
            : ''
        }
      </div>
    `;
    })
    .join('');

  E.plannerResults.innerHTML = `${intro}${bombExamplesHtml}${htmlSlots}`;

  if (E.plannerAddEvent) E.plannerAddEvent.disabled = !slots.length;

  // Wire per-slot "Add" buttons – include selected tickets as linked issue IDs
  E.plannerResults.querySelectorAll('[data-add-release]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!requirePermission(() => Permissions.canChangePlanner(), 'Only admin can create planner events.'))
        return;
      const startIso = btn.getAttribute('data-add-release');
      const endIso = btn.getAttribute('data-add-release-end');
      if (!startIso || !endIso) return;

      const startLocal = toLocalInputValue(new Date(startIso));
      const endLocal = toLocalInputValue(new Date(endIso));

      const modulesLabelLocal =
        modules && modules.length ? modules.join(', ') : 'General';

      const releaseDescription = (E.plannerDescription?.value || '').trim();

      const ticketIds =
        (LAST_PLANNER_CONTEXT &&
          Array.isArray(LAST_PLANNER_CONTEXT.tickets) &&
          LAST_PLANNER_CONTEXT.tickets) ||
        [];

      const newEvent = {
        id: '',
        title: `Release – ${modulesLabelLocal} (${releaseType})`,
        type: 'Release',
        env: env,
        status: 'Planned',
        owner: '',
        modules: modules,
        impactType:
          env === 'Prod'
            ? 'High risk change'
            : 'Internal only',
        issueId: ticketIds.join(', '),
        start: startLocal,
        end: endLocal,
        description:
          `Auto-scheduled by Release Planner. Region profile: ${regionLabel}. Modules: ${modulesLabelLocal}.` +
          (releaseDescription ? `\nRelease notes: ${releaseDescription}` : '') +
          `\nHeuristic risk index computed from F&B rush hours, bug history, holidays and existing calendar events.` +
          `\nTickets in scope at scheduling time: ${
            ticketIds.length ? ticketIds.join(', ') : 'none explicitly selected.'
          }`,
        allDay: false,
        notificationStatus: ''
      };

      const saved = await saveEventToSheet(newEvent, Session.authContext());
      if (!saved) {
        UI.toast('Could not save release event');
        return;
      }
      const idx = DataStore.events.findIndex(x => x.id === saved.id);
      if (idx === -1) DataStore.events.push(saved);
      else DataStore.events[idx] = saved;
      saveEventsCache();
      renderCalendarEvents();
      refreshPlannerReleasePlans(context);
      Analytics.refresh(UI.Issues.applyFilters());
    });
  });
}

function exportPlannerScorecard() {
  if (!LAST_PLANNER_CONTEXT || !LAST_PLANNER_RESULT) {
    UI.toast('Run the release planner before exporting.');
    return;
  }
  if (typeof XLSX === 'undefined') {
    UI.toast('Excel export unavailable (missing XLSX library).');
    return;
  }

  const { env, modules, releaseType, horizonDays, region, description, tickets } =
    LAST_PLANNER_CONTEXT;
  const { slots, bug, bomb, ticketContext } = LAST_PLANNER_RESULT;

  const summaryRows = [
    ['Generated at', new Date().toLocaleString()],
    ['Environment', env],
    ['Region', region],
    ['Release type', releaseType],
    ['Horizon (days)', horizonDays],
    ['Modules', modules && modules.length ? modules.join(', ') : 'All modules'],
    ['Selected tickets', tickets && tickets.length ? tickets.join(', ') : 'None'],
    ['Release description', description || ''],
    ['Bug pressure risk', bug?.risk ?? 0],
    ['Bomb-bug risk', bomb?.risk ?? 0],
    ['Ticket risk avg', ticketContext?.avgRisk ?? 0],
    ['Ticket risk max', ticketContext?.maxRisk ?? 0]
  ];

  const slotsRows = [
    [
      'Rank',
      'Start',
      'End',
      'Total risk',
      'Safety score',
      'Rush risk',
      'Bug risk',
      'Bomb-bug risk',
      'Events count',
      'Holiday count'
    ]
  ];
  slots.forEach((slot, idx) => {
    slotsRows.push([
      idx + 1,
      slot.start ? new Date(slot.start).toLocaleString() : '',
      slot.end ? new Date(slot.end).toLocaleString() : '',
      Number(slot.totalRisk || 0).toFixed(2),
      Number(slot.safetyScore || 0).toFixed(2),
      Number(slot.rushRisk || 0).toFixed(2),
      Number(slot.bugRisk || 0).toFixed(2),
      Number(slot.bombRisk || 0).toFixed(2),
      slot.eventCount || 0,
      slot.holidayCount || 0
    ]);
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(slotsRows), 'Suggested Slots');

  const ts = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `release_scorecard_${ts}.xlsx`);
  UI.toast('Release scorecard exported');
}

function refreshPlannerTickets(currentList) {
  if (!E.plannerTickets) return;
  const list = currentList || UI.Issues.applyFilters();

  if (!list.length) {
    E.plannerTickets.innerHTML =
      '<option disabled>No tickets match the current filters</option>';
    return;
  }

  const max = 250;
  const subset = list.slice(0, max);

  E.plannerTickets.innerHTML = subset
    .map(r => {
      const meta = DataStore.computed.get(r.id) || {};
      const risk = meta.risk?.total || 0;
      const label = `[${r.priority || '-'} | R${risk}] ${r.id} — ${
        r.title || ''
      }`.slice(0, 140);
      return `<option value="${U.escapeAttr(r.id)}">${U.escapeHtml(label)}</option>`;
    })
    .join('');
}

function refreshPlannerReleasePlans(context) {
  if (!E.plannerReleasePlan) return;
  const env = context?.env || (E.plannerEnv?.value || '');
  const horizonDays =
    context?.horizonDays ||
    parseInt(E.plannerHorizon?.value || '7', 10) ||
    7;

  const now = new Date();
  const horizonEnd = U.dateAddDays(now, horizonDays);

  const releaseEvents = (DataStore.events || []).filter(ev => {
    const type = (ev.type || '').toLowerCase();
    if (type !== 'release') return false;
    if (!ev.start) return false;
    const d = new Date(ev.start);
    if (isNaN(d)) return false;
    if (d < now) return false;
    if (d > horizonEnd) return false;

    const evEnv = ev.env || 'Prod';
    if (env && env !== 'Other' && evEnv && evEnv !== env) return false;

    return true;
  });

  releaseEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

  if (!releaseEvents.length) {
    E.plannerReleasePlan.innerHTML =
      '<option value="">No Release events in horizon</option>';
    return;
  }

  const options = releaseEvents
    .map(ev => {
      const d = ev.start ? new Date(ev.start) : null;
      const when =
        d && !isNaN(d)
          ? d.toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })
          : '(no date)';
      const label = `[${when}] ${ev.title || 'Release'} (${ev.env || 'Prod'})`;
      return `<option value="${U.escapeAttr(ev.id)}">${U.escapeHtml(label)}</option>`;
    })
    .join('');

  E.plannerReleasePlan.innerHTML =
    '<option value="">Select a Release event…</option>' + options;
}

function wirePlanner() {
  if (!E.plannerRun) return;

  E.plannerRun.addEventListener('click', () => {
    if (!DataStore.rows.length) {
      UI.toast('Issues are still loading. Try again in a few seconds.');
      return;
    }

    const regionValue = (E.plannerRegion?.value || 'gulf').toLowerCase();
    const region = ReleasePlanner.regionKey(regionValue);

    const env = E.plannerEnv?.value || 'Prod';
    const modulesStr = (E.plannerModules?.value || '').trim();
    const modules = modulesStr
      ? modulesStr
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];
    const horizonDays =
      parseInt(E.plannerHorizon?.value || '7', 10) || 7;
    const releaseTypeValue =
      (E.plannerReleaseType?.value || 'feature').toLowerCase();
    const releaseType =
      releaseTypeValue === 'major' || releaseTypeValue === 'minor'
        ? releaseTypeValue
        : 'feature';
    const slotsPerDay =
      parseInt(E.plannerSlotsPerDay?.value || '4', 10) || 4;
    const description = (E.plannerDescription?.value || '').trim();

    const selectedTicketIds = Array.from(E.plannerTickets?.selectedOptions || [])
      .map(o => o.value)
      .filter(Boolean);

    const context = {
      region,
      env,
      modules,
      releaseType,
      horizonDays,
      slotsPerDay,
      description,
      tickets: selectedTicketIds
    };

    const result = ReleasePlanner.suggestSlots(context);

    LAST_PLANNER_CONTEXT = context;
    LAST_PLANNER_RESULT = result;
    renderPlannerResults(result, context);
    refreshPlannerReleasePlans(context);
  });

  if (E.plannerAddEvent) {
    E.plannerAddEvent.addEventListener('click', async () => {
      if (!requirePermission(() => Permissions.canChangePlanner(), 'Only admin can create planner events.'))
        return;
      if (
        !LAST_PLANNER_CONTEXT ||
        !LAST_PLANNER_RESULT ||
        !LAST_PLANNER_RESULT.slots.length
      ) {
        UI.toast('Run the planner first to get suggestions.');
        return;
      }
      const context = LAST_PLANNER_CONTEXT;
      const slot = LAST_PLANNER_RESULT.slots[0];

      const startIso = slot.start.toISOString();
      const endIso = slot.end.toISOString();
      const startLocal = toLocalInputValue(new Date(startIso));
      const endLocal = toLocalInputValue(new Date(endIso));

      const regionLabel =
        context.region === 'gulf'
          ? 'Gulf (KSA / UAE / Qatar)'
          : context.region === 'levant'
          ? 'Levant'
          : 'North Africa';

      const modulesLabelLocal =
        context.modules && context.modules.length
          ? context.modules.join(', ')
          : 'General';
      const releaseDescription = (E.plannerDescription?.value || '').trim();
      const ticketIds = Array.isArray(context.tickets) ? context.tickets : [];

      const newEvent = {
        id: '',
        title: `Release – ${modulesLabelLocal} (${context.releaseType})`,
        type: 'Release',
        env: context.env,
        status: 'Planned',
        owner: '',
        modules: context.modules,
        impactType:
          context.env === 'Prod'
            ? 'High risk change'
            : 'Internal only',
        issueId: ticketIds.join(', '),
        start: startLocal,
        end: endLocal,
        description:
          `Auto-scheduled by Release Planner (top suggestion). Region profile: ${regionLabel}. Modules: ${modulesLabelLocal}.` +
          (releaseDescription ? `\nRelease notes: ${releaseDescription}` : '') +
          `\nHeuristic risk index computed from F&B rush hours, bug history, holidays and existing calendar events.` +
          `\nTickets in scope at scheduling time: ${
            ticketIds.length ? ticketIds.join(', ') : 'none explicitly selected.'
          }`,
        allDay: false,
        notificationStatus: ''
      };

      const saved = await saveEventToSheet(newEvent, Session.authContext());
      if (!saved) {
        UI.toast('Could not save release event');
        return;
      }
      const idx = DataStore.events.findIndex(x => x.id === saved.id);
      if (idx === -1) DataStore.events.push(saved);
      else DataStore.events[idx] = saved;
      saveEventsCache();
      renderCalendarEvents();
      refreshPlannerReleasePlans(context);
      Analytics.refresh(UI.Issues.applyFilters());
    });
  }

  if (E.plannerExportScorecard) {
    E.plannerExportScorecard.addEventListener('click', () => {
      exportPlannerScorecard();
    });
  }

  if (E.plannerEnv) {
    E.plannerEnv.addEventListener('change', () => {
      refreshPlannerReleasePlans();
    });
  }
  if (E.plannerHorizon) {
    E.plannerHorizon.addEventListener('change', () => {
      refreshPlannerReleasePlans();
    });
  }

  if (E.plannerAssignBtn) {
    E.plannerAssignBtn.addEventListener('click', async () => {
      if (!requirePermission(() => Permissions.canChangePlanner(), 'Only admin can assign planner tickets.'))
        return;
      const planId = E.plannerReleasePlan?.value || '';
      if (!planId) {
        UI.toast('Select a Release event first.');
        return;
      }
      const options = Array.from(E.plannerTickets?.selectedOptions || []);
      const ticketIds = options.map(o => o.value).filter(Boolean);
      if (!ticketIds.length) {
        UI.toast('Select at least one ticket to assign.');
        return;
      }

      const idx = DataStore.events.findIndex(ev => ev.id === planId);
      if (idx === -1) {
        UI.toast('Selected Release event not found. Try refreshing events.');
        return;
      }

      const ev = DataStore.events[idx];
      const existing = (ev.issueId || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const merged = Array.from(new Set([...existing, ...ticketIds]));

      const updatedEvent = {
        ...ev,
        issueId: merged.join(', ')
      };

      const saved = await saveEventToSheet(updatedEvent, Session.authContext());
      if (!saved) {
        UI.toast('Could not assign tickets to Release event.');
        return;
      }

      DataStore.events[idx] = saved;
      saveEventsCache();
      renderCalendarEvents();
      refreshPlannerReleasePlans();
      Analytics.refresh(UI.Issues.applyFilters());

      UI.toast(
        `Assigned ${ticketIds.length} ticket${ticketIds.length > 1 ? 's' : ''} to the Release plan.`
      );
    });
  }
}

/* ---------- Misc wiring ---------- */
function setIfOptionExists(select, value) {
  if (!select || !value) return;
  const options = Array.from(select.options || []);
  if (options.some(o => o.value === value)) select.value = value;
}

function syncFilterInputs() {
  if (E.searchInput) E.searchInput.value = Filters.state.search || '';
  if (E.moduleFilter) setIfOptionExists(E.moduleFilter, Filters.state.module);
  if (E.categoryFilter) setIfOptionExists(E.categoryFilter, Filters.state.category);
  if (E.priorityFilter) setIfOptionExists(E.priorityFilter, Filters.state.priority);
  if (E.statusFilter) setIfOptionExists(E.statusFilter, Filters.state.status);
  if (E.devTeamStatusFilter)
    setIfOptionExists(E.devTeamStatusFilter, Filters.state.devTeamStatus);
  if (E.issueRelatedFilter) setIfOptionExists(E.issueRelatedFilter, Filters.state.issueRelated);
  if (E.startDateFilter) E.startDateFilter.value = Filters.state.start || '';
  if (E.endDateFilter) E.endDateFilter.value = Filters.state.end || '';
}


function wireCore() {
   [E.issuesTab, E.calendarTab, E.insightsTab].forEach(btn => {
    if (!btn) return;
    btn.addEventListener('click', () => setActiveView(btn.dataset.view));
  });

  if (E.drawerBtn)
    E.drawerBtn.addEventListener('click', () => {
      const open = !E.sidebar.classList.contains('open');
      E.sidebar.classList.toggle('open');
      E.drawerBtn.setAttribute('aria-expanded', String(open));
    });

  if (E.searchInput)
    E.searchInput.addEventListener(
      'input',
      debounce(() => {
        Filters.state.search = E.searchInput.value || '';
        Filters.save();
        UI.refreshAll();
      }, 250)
    );

  if (E.savedViews) {
    E.savedViews.addEventListener('change', () => {
      const name = E.savedViews.value;
      if (!name) return;
      const applied = SavedViews.apply(name);
      if (!applied) UI.toast('Saved view not found.');
    });
  }

  if (E.saveViewBtn) {
    E.saveViewBtn.addEventListener('click', () => {
      const name = window.prompt('Name this view');
      if (!name) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      if (SavedViews.views[trimmed]) {
        const overwrite = window.confirm(`Replace saved view "${trimmed}"?`);
        if (!overwrite) return;
      }
      SavedViews.add(trimmed, {
        filters: { ...Filters.state },
        columns: ColumnManager.getState(),
        sort: { key: GridState.sortKey, asc: GridState.sortAsc }
      });
      if (E.savedViews) E.savedViews.value = trimmed;
      UI.toast(`Saved view "${trimmed}"`);
    });
  }

  if (E.deleteViewBtn) {
    E.deleteViewBtn.addEventListener('click', () => {
      const name = E.savedViews?.value;
      if (!name) {
        UI.toast('Select a saved view to delete.');
        return;
      }
      const confirmed = window.confirm(`Delete saved view "${name}"?`);
      if (!confirmed) return;
      SavedViews.remove(name);
      if (E.savedViews) E.savedViews.value = '';
      UI.toast(`Deleted view "${name}"`);
    });
  }

  if (E.refreshNow)
    E.refreshNow.addEventListener('click', () => {
      loadIssues(true);
      loadEvents(true);
    });
  if (E.exportCsv)
    E.exportCsv.addEventListener('click', () => {
      exportFilteredExcel();
    });
  if (E.createTicketBtn)
    E.createTicketBtn.addEventListener('click', () => {
      if (!requirePermission(() => Permissions.canCreateTicket(), 'Login is required to create a ticket.'))
        return;
      window.open(
        'https://forms.gle/PPnEP1AQneoBT79s5',
        '_blank',
        'noopener,noreferrer'
      );
    });

  if (E.shortcutsHelp) {
    E.shortcutsHelp.addEventListener('click', () => {
     UI.toast('Shortcuts: 1/2/3 switch tabs · / focus search · Ctrl+K AI query');
    });
  }


  if (E.columnToggleBtn && E.columnPanel) {
    const setPanel = open => {
      E.columnPanel.classList.toggle('open', open);
      E.columnPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
      E.columnToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    E.columnToggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      const open = !E.columnPanel.classList.contains('open');
      setPanel(open);
    });
    document.addEventListener('click', e => {
      if (!E.columnPanel.classList.contains('open')) return;
      if (E.columnPanel.contains(e.target) || E.columnToggleBtn.contains(e.target)) return;
      setPanel(false);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && E.columnPanel.classList.contains('open')) {
        setPanel(false);
      }
    });
  }
  
  UI.refreshAll = () => {
    const list = UI.Issues.applyFilters();
    UI.Issues.renderSummary(list);
    UI.Issues.renderFilterChips();
    UI.Issues.renderKPIs(list);
    UI.Issues.renderTable(list);
    UI.Issues.renderCharts(list);
    UI.updateHeroMetrics(DataStore.rows);
    refreshPlannerTickets(list);
    if (E.insightsView && E.insightsView.classList.contains('active')) {
      Analytics.refresh(list);
    }
  };
}

function wireSorting() {
  U.qAll('#issuesTable thead th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-key');
      if (GridState.sortKey === key) GridState.sortAsc = !GridState.sortAsc;
      else {
        GridState.sortKey = key;
        GridState.sortAsc = true;
      }
      UI.refreshAll();
    });
    th.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        th.click();
      }
    });
    th.tabIndex = 0;
    th.setAttribute('role', 'button');
    th.setAttribute('aria-label', `Sort by ${th.textContent}`);
  });
}

function wirePaging() {
  if (E.pageSize)
    E.pageSize.addEventListener('change', () => {
      GridState.pageSize = +E.pageSize.value;
      localStorage.setItem(LS_KEYS.pageSize, GridState.pageSize);
      GridState.page = 1;
      UI.refreshAll();
    });
  if (E.firstPage)
    E.firstPage.addEventListener('click', () => {
      GridState.page = 1;
      UI.refreshAll();
    });
  if (E.prevPage)
    E.prevPage.addEventListener('click', () => {
      if (GridState.page > 1) {
        GridState.page--;
        UI.refreshAll();
      }
    });
  if (E.nextPage)
    E.nextPage.addEventListener('click', () => {
      const list = UI.Issues.applyFilters();
      const pages = Math.max(1, Math.ceil(list.length / GridState.pageSize));
      if (GridState.page < pages) {
        GridState.page++;
        UI.refreshAll();
      }
    });
  if (E.lastPage)
    E.lastPage.addEventListener('click', () => {
      const list = UI.Issues.applyFilters();
      GridState.page = Math.max(1, Math.ceil(list.length / GridState.pageSize));
      UI.refreshAll();
    });
}

function wireFilters() {
  if (E.moduleFilter) {
    E.moduleFilter.addEventListener('change', () => {
      Filters.state.module = E.moduleFilter.value;
      Filters.save();
      UI.refreshAll();
    });
    setIfOptionExists(E.moduleFilter, Filters.state.module);
  }
   if (E.categoryFilter) {
    E.categoryFilter.addEventListener('change', () => {
      Filters.state.category = E.categoryFilter.value;
      Filters.save();
      UI.refreshAll();
    });
    setIfOptionExists(E.categoryFilter, Filters.state.category);
  }
  if (E.priorityFilter) {
    E.priorityFilter.addEventListener('change', () => {
      Filters.state.priority = E.priorityFilter.value;
      Filters.save();
      UI.refreshAll();
    });
     setIfOptionExists(E.priorityFilter, Filters.state.priority);
  }
  if (E.statusFilter) {
    E.statusFilter.addEventListener('change', () => {
      Filters.state.status = E.statusFilter.value;
      Filters.save();
      UI.refreshAll();
    });
    setIfOptionExists(E.statusFilter, Filters.state.status);
  }
  if (E.devTeamStatusFilter) {
    E.devTeamStatusFilter.addEventListener('change', () => {
      Filters.state.devTeamStatus = E.devTeamStatusFilter.value;
      Filters.save();
      UI.refreshAll();
    });
    setIfOptionExists(E.devTeamStatusFilter, Filters.state.devTeamStatus);
  }
  if (E.issueRelatedFilter) {
    E.issueRelatedFilter.addEventListener('change', () => {
      Filters.state.issueRelated = E.issueRelatedFilter.value;
      Filters.save();
      UI.refreshAll();
    });
    setIfOptionExists(E.issueRelatedFilter, Filters.state.issueRelated);
  }
  if (E.startDateFilter) {
    E.startDateFilter.value = Filters.state.start || '';
    E.startDateFilter.addEventListener('change', () => {
      Filters.state.start = E.startDateFilter.value;
      Filters.save();
      UI.refreshAll();
    });
  }
  if (E.endDateFilter) {
    E.endDateFilter.value = Filters.state.end || '';
    E.endDateFilter.addEventListener('change', () => {
      Filters.state.end = E.endDateFilter.value;
      Filters.save();
      UI.refreshAll();
    });
  }
  if (E.searchInput) E.searchInput.value = Filters.state.search || '';

  if (E.resetBtn)
    E.resetBtn.addEventListener('click', () => {
      Filters.state = {
        search: '',
        module: 'All',
        category: 'All',
        priority: 'All',
        status: 'All',
        devTeamStatus: 'All',
        issueRelated: 'All',
        start: '',
        end: ''
      };
      Filters.save();
      if (E.searchInput) E.searchInput.value = '';
      if (E.categoryFilter) E.categoryFilter.value = 'All';
      if (E.startDateFilter) E.startDateFilter.value = '';
      if (E.endDateFilter) E.endDateFilter.value = '';
      UI.Issues.renderFilters();
      UI.refreshAll();
    });
}

function wireTheme() {
  const media = window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  const applySystem = () => {
    if (media?.matches) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'light');
  };
  const saved = localStorage.getItem(LS_KEYS.theme) || 'system';
  if (E.themeSelect) E.themeSelect.value = saved;
  if (saved === 'system') applySystem();
  else if (saved === 'dark') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', 'light');

  media?.addEventListener('change', () => {
    if ((localStorage.getItem(LS_KEYS.theme) || 'system') === 'system')
      applySystem();
  });

  if (E.themeSelect)
    E.themeSelect.addEventListener('change', () => {
      const v = E.themeSelect.value;
      localStorage.setItem(LS_KEYS.theme, v);
      if (v === 'system') applySystem();
      else if (v === 'dark') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', 'light');
    });

  if (E.accentColor) {
    const rootStyle = getComputedStyle(document.documentElement);
    const defaultAccent = rootStyle.getPropertyValue('--accent').trim() || '#4f8cff';
    const savedAccent =
      localStorage.getItem(LS_KEYS.accentColorStorage) || defaultAccent;
    E.accentColor.value = savedAccent;
    document.documentElement.style.setProperty('--accent', savedAccent);

    E.accentColor.addEventListener('input', () => {
      const val = E.accentColor.value || defaultAccent;
      document.documentElement.style.setProperty('--accent', val);
      try {
        localStorage.setItem(LS_KEYS.accentColorStorage, val);
      } catch {}
      UI.Issues.renderCharts(UI.Issues.applyFilters());
    });
  }
}

function wireConnectivity() {
  if (!E.onlineStatusChip) return;
  const update = () => {
    const online = navigator.onLine !== false;
    E.onlineStatusChip.textContent = online ? 'Online' : 'Offline · using cache';
    E.onlineStatusChip.classList.toggle('online', online);
    E.onlineStatusChip.classList.toggle('offline', !online);
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

function wireDashboardGate() {
  if (!E.app || !E.loginForm || !E.loginRole || !E.loginPasscode) return;

  const getDefaultViewForRole = role => {
    if (role === ROLES.ADMIN) return 'issues';
    if (role === ROLES.VIEWER) return 'calendar';
    return 'issues';
  };

  const unlockApp = () => {
    document.body.classList.remove('auth-locked');
    E.app.classList.remove('is-locked');
    E.app.setAttribute('aria-hidden', 'false');
    if (E.logoutBtn) E.logoutBtn.hidden = false;
    const role = Session.role();
    setActiveView(getDefaultViewForRole(role));
    // Avoid forcing a jump to #app after login (caused unwanted auto-scrolling).
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  const lockApp = () => {
    document.body.classList.add('auth-locked');
    E.app.classList.add('is-locked');
    E.app.setAttribute('aria-hidden', 'true');
    if (E.logoutBtn) E.logoutBtn.hidden = true;
    window.location.hash = '#loginSection';
  };

  lockApp();
  UI.applyRolePermissions();
  E.loginRole.value = ROLES.VIEWER;

  const updateLoginHint = () => {
    if (!E.loginHint) return;
    const isAdmin = E.loginRole.value === ROLES.ADMIN;
    E.loginHint.textContent = isAdmin
      ? 'Enter your admin passcode.'
      : 'Enter your viewer passcode.';
  };

  E.loginRole.addEventListener('change', updateLoginHint);
  updateLoginHint();
  if (Session.isAuthenticated()) {
    E.loginRole.value = Session.role() || ROLES.VIEWER;
    unlockApp();
  }

  E.loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const selectedRole = String(E.loginRole.value || '').trim().toLowerCase();
    const passcode = String(E.loginPasscode.value || '');

    if (selectedRole !== ROLES.ADMIN && selectedRole !== ROLES.VIEWER) {
      UI.toast('Role is required.');
      return;
    }
    if (!passcode.trim()) {
      UI.toast('Passcode is required.');
      return;
    }

    try {
      const session = await Session.login(selectedRole, passcode);
      UI.applyRolePermissions();
      E.loginPasscode.value = '';
      E.loginRole.value = session.role || selectedRole || ROLES.VIEWER;
      unlockApp();
      await Promise.all([loadIssues(true), loadEvents(true)]);
      if (selectedRole && session.role !== selectedRole) {
        UI.toast(`Logged in as ${session.role}. Selected role was adjusted to match backend.`);
      } else {
        UI.toast(`Logged in as ${session.role}.`);
      }
    } catch (error) {
      UI.toast(`Login failed: ${error.message}`);
      return;
    }
  });

  if (E.logoutBtn) {
    E.logoutBtn.addEventListener('click', async () => {
      await Session.logout();
      UI.applyRolePermissions();
      E.loginPasscode.value = '';
      E.loginRole.value = ROLES.VIEWER;
      updateLoginHint();
      lockApp();
      UI.toast('Logged out.');
    });
  }
}

function wireModals() {
  // Issue modal
  if (E.modalClose) {
    E.modalClose.addEventListener('click', () => UI.Modals.closeIssue());
  }
  if (E.issueModal) {
    E.issueModal.addEventListener('click', e => {
      // click outside panel closes
      if (e.target === E.issueModal) UI.Modals.closeIssue();
    });
    E.issueModal.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        UI.Modals.closeIssue();
            } else if (e.key === 'Tab') {
        trapFocus(E.issueModal, e);
      }
    });
  }

  if (E.exportIssuePdf) {
    E.exportIssuePdf.addEventListener('click', () => {
      exportSelectedIssueToPdf();
    });
  }

  if (E.exportIssueExcel) {
    E.exportIssueExcel.addEventListener('click', () => {
      exportSelectedIssueToExcel();
    });
  }

  if (E.copyLink) {
    E.copyLink.addEventListener('click', () => {
      const r = UI.Modals.selectedIssue;
      if (!r) return;
      const url = new URL(window.location.href);
      url.searchParams.set('issue', r.id || '');
      const link = url.toString();
      navigator.clipboard
        .writeText(link)
        .then(() => UI.toast('Issue link copied'))
        .catch(() => UI.toast('Clipboard blocked'));
    });
  }

  if (E.replyEmailBtn) {
    E.replyEmailBtn.addEventListener('click', () => {
      openReplyComposerForIssue(UI.Modals.selectedIssue);
    });
  }

  if (E.editIssueBtn) {
    E.editIssueBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (!requirePermission(() => Permissions.canEditTicket(), 'Only admin can edit tickets.')) return;
      const selectedIssue =
        UI.Modals.selectedIssue ||
        DataStore.byId.get(E.editIssueBtn?.dataset?.id || '');
      if (!selectedIssue) {
        UI.toast('Open a ticket before editing.');
        return;
      }
      IssueEditor.open(selectedIssue);
    });
  }

  if (E.editIssueClose) {
    E.editIssueClose.addEventListener('click', () => IssueEditor.close());
  }
  if (E.editIssueCancel) {
    E.editIssueCancel.addEventListener('click', () => IssueEditor.close());
  }
  if (E.editIssueModal) {
    E.editIssueModal.addEventListener('click', e => {
      if (e.target === E.editIssueModal) IssueEditor.close();
    });
    E.editIssueModal.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        IssueEditor.close();
      } else if (e.key === 'Tab') {
        trapFocus(E.editIssueModal, e);
      }
    });
  }

 const editIssueForm = document.getElementById('editIssueForm');
  if (editIssueForm) {
    editIssueForm.addEventListener('submit', onEditIssueSubmit);
  }
  if (E.bulkEditBtn) {
    E.bulkEditBtn.addEventListener('click', () => {
      if (!requirePermission(() => Permissions.canEditTicket(), 'Only admin can bulk edit tickets.')) return;
      BulkEditor.open();
    });
  }
  if (E.bulkEditClose) {
    E.bulkEditClose.addEventListener('click', () => BulkEditor.close());
  }
  if (E.bulkEditCancel) {
    E.bulkEditCancel.addEventListener('click', () => BulkEditor.close());
  }
  if (E.bulkEditModal) {
    E.bulkEditModal.addEventListener('click', e => {
      if (e.target === E.bulkEditModal) BulkEditor.close();
    });
    E.bulkEditModal.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        BulkEditor.close();
      } else if (e.key === 'Tab') {
        trapFocus(E.bulkEditModal, e);
      }
    });
  }
  if (E.bulkEditForm) {
    E.bulkEditForm.addEventListener('submit', onBulkEditSubmit);
  }
  // Event modal
  if (E.eventModalClose) {
    E.eventModalClose.addEventListener('click', () => UI.Modals.closeEvent());
  }
  if (E.eventCancel) {
    E.eventCancel.addEventListener('click', () => UI.Modals.closeEvent());
  }
  if (E.eventModal) {
    E.eventModal.addEventListener('click', e => {
      if (e.target === E.eventModal) UI.Modals.closeEvent();
    });
    E.eventModal.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        UI.Modals.closeEvent();
      } else if (e.key === 'Tab') {
        trapFocus(E.eventModal, e);
      }
    });
  }

  if (E.eventAllDay) {
    E.eventAllDay.addEventListener('change', () => {
      const allDay = E.eventAllDay.checked;
      if (E.eventStart) {
        const val = E.eventStart.value;
        const d = val ? new Date(val) : null;
        E.eventStart.type = allDay ? 'date' : 'datetime-local';
        if (d && !isNaN(d)) {
          E.eventStart.value = allDay ? toLocalDateValue(d) : toLocalInputValue(d);
        }
      }
      if (E.eventEnd) {
        const val = E.eventEnd.value;
        const d = val ? new Date(val) : null;
        E.eventEnd.type = allDay ? 'date' : 'datetime-local';
        if (d && !isNaN(d)) {
          E.eventEnd.value = allDay ? toLocalDateValue(d) : toLocalInputValue(d);
        }
      }
    });
  }

  U.qAll('[data-readiness]').forEach(input => {
    input.addEventListener('change', () => {
      updateChecklistStatus(getReadinessChecklistState());
    });
  });
  
  if (E.eventForm) {
    E.eventForm.addEventListener('submit', async e => {
      e.preventDefault();
      if (!requirePermission(() => Permissions.canManageEvents(), 'Only admin can create or edit events.'))
        return;
      const id = E.eventForm.dataset.id || '';
      const allDay = !!(E.eventAllDay && E.eventAllDay.checked);

      const title = (E.eventTitle?.value || '').trim();
      if (!title) {
        UI.toast('Title is required');
        return;
      }

      const readiness = getReadinessChecklistState();
      const impactType = E.eventImpactType?.value || 'No downtime expected';
      const readinessState = readinessProgress(readiness);

      if (
        impactType === 'High risk change' &&
        readinessState.total &&
        readinessState.done < readinessState.total
      ) {
        const proceed = window.confirm(
          'This event is marked as a high-risk change, but the checklist is incomplete. Save anyway?'
        );
        if (!proceed) return;
      }
      
      const ev = {
        id,
        title,
        type: E.eventType?.value || 'Deployment',
        env: E.eventEnv?.value || 'Prod',
        status: E.eventStatus?.value || 'Planned',
        owner: (E.eventOwner?.value || '').trim(),
        modules: E.eventModules?.value || '',
       impactType,
        issueId: (E.eventIssueId?.value || '').trim(),
        start: E.eventStart?.value || '',
        end: E.eventEnd?.value || '',
        description: (E.eventDescription?.value || '').trim(),
        readiness,
         checklist: readiness,
        allDay,
        notificationStatus: ''
      };

      const saved = await saveEventToSheet(ev, Session.authContext());
      if (!saved) return;

      const idx = DataStore.events.findIndex(x => x.id === saved.id);
      if (idx === -1) DataStore.events.push(saved);
      else DataStore.events[idx] = saved;

      saveEventsCache();
      renderCalendarEvents();
      refreshPlannerReleasePlans();
      Analytics.refresh(UI.Issues.applyFilters());
      UI.Modals.closeEvent();
    });
  }

  if (E.eventDelete) {
    E.eventDelete.addEventListener('click', async () => {
      if (!requirePermission(() => Permissions.canManageEvents(), 'Only admin can delete events.')) return;
      if (!E.eventForm) return;
      const id = E.eventForm.dataset.id;
      if (!id) {
        UI.Modals.closeEvent();
        return;
      }
      if (!window.confirm('Delete this event from the calendar?')) return;
      const ok = await deleteEventFromSheet(id, Session.authContext());
      if (!ok) return;
      const idx = DataStore.events.findIndex(ev => ev.id === id);
      if (idx > -1) DataStore.events.splice(idx, 1);
      saveEventsCache();
      renderCalendarEvents();
      refreshPlannerReleasePlans();
      Analytics.refresh(UI.Issues.applyFilters());
      UI.Modals.closeEvent();
    });
  }
}

/* ---------- AI query / DSL wiring ---------- */

let LAST_AI_QUERY = null;

function applyDSLToFilters(q) {
  if (!q) return;
  const next = {
    search: '',
    module: 'All',
    category: 'All',
    priority: 'All',
    status: 'All',
    start: '',
    end: ''
  };

  if (q.words && q.words.length) {
    next.search = q.words.join(' ');
  }

  if (q.module) {
    const modules = Array.from(DataStore.byModule.keys());
    const target = q.module.toLowerCase();
    const exact = modules.find(m => (m || '').toLowerCase() === target);
    if (exact) next.module = exact;
  }

  if (q.priority) {
    const p = q.priority[0]?.toUpperCase();
    if (p === 'H') next.priority = 'High';
    else if (p === 'M') next.priority = 'Medium';
    else if (p === 'L') next.priority = 'Low';
  }

  if (q.status && q.status !== 'open' && q.status !== 'closed') {
    const statuses = Array.from(DataStore.byStatus.keys());
    const target = q.status.toLowerCase();
    const match = statuses.find(s => (s || '').toLowerCase().includes(target));
    if (match) next.status = match;
  }

  if (q.lastDays && Number.isFinite(q.lastDays)) {
    const start = U.daysAgo(q.lastDays);
    next.start = toLocalDateValue(start);
    next.end = '';
  }

  Filters.state = next;
  Filters.save();
  UI.refreshAll();
}

function wireAIQuery() {
  if (!E.aiQueryInput || !E.aiQueryRun || !E.aiQueryResults) return;

  const renderHelp = () => {
    E.aiQueryResults.innerHTML = `
      <div class="muted" style="font-size:12px;">
        Examples:
        <ul style="margin:4px 0 0 16px;padding:0;">
          <li><code>status:open priority:h risk&gt;=10 last:7d</code></li>
          <li><code>module:payments severity&gt;=3 impact&gt;=3</code></li>
          <li><code>missing:priority last:30d</code></li>
          <li><code>cluster:timeout sort:risk</code></li>
        </ul>
      </div>`;
  };

  const runQuery = () => {
    const raw = (E.aiQueryInput.value || '').trim();
    if (!raw) {
      LAST_AI_QUERY = null;
      renderHelp();
      return;
    }
    if (!DataStore.rows.length) {
      UI.toast('Issues are still loading; try again in a moment.');
      return;
    }

    const q = DSL.parse(raw);
    let rows = DataStore.rows.filter(r =>
      DSL.matches(r, DataStore.computed.get(r.id) || {}, q)
    );

    if (q.sort === 'risk') {
      rows = rows
        .map(r => ({
          r,
          risk: DataStore.computed.get(r.id)?.risk?.total || 0
        }))
        .sort((a, b) => b.risk - a.risk)
        .map(x => x.r);
    } else if (q.sort === 'date') {
      rows = rows.slice().sort((a, b) => {
        const da = new Date(a.date);
        const db = new Date(b.date);
        if (isNaN(da) && isNaN(db)) return 0;
        if (isNaN(da)) return 1;
        if (isNaN(db)) return -1;
        return db - da; // newest first
      });
    } else if (q.sort === 'priority') {
      rows = rows.slice().sort((a, b) => prioMap(b.priority) - prioMap(a.priority));
    }

    LAST_AI_QUERY = { text: raw, q, rows };

    if (!rows.length) {
      E.aiQueryResults.innerHTML = `<div>No issues matched this query.</div>`;
      return;
    }

    const maxShow = 50;
    const slice = rows.slice(0, maxShow);

    const summary = `
      <div style="margin-bottom:4px;">
        Found <strong>${slice.length}</strong> of ${rows.length} matching issue${
      rows.length === 1 ? '' : 's'
    } for query <code>${U.escapeHtml(raw)}</code>.
      </div>`;

    const items = slice
      .map(r => {
        const meta = DataStore.computed.get(r.id) || {};
        const risk = meta.risk || {};
        const riskScore = risk.total || 0;
        const badgeClass = CalendarLink.riskBadgeClass(riskScore);
        return `
        <li style="margin-bottom:6px;">
          <button class="btn sm" data-open="${U.escapeAttr(r.id)}">${U.escapeHtml(
          r.id
        )}</button>
          <strong>${U.escapeHtml(r.title || '')}</strong>
          <div class="muted">
            Module: ${U.escapeHtml(r.module || '-')},
            Priority: ${U.escapeHtml(r.priority || '-')},
            Status: ${U.escapeHtml(r.status || '-')}
          </div>
          <div class="muted">
            <span class="event-risk-badge ${badgeClass}">RISK ${riskScore}</span>
            · sev ${risk.severity ?? 0} · imp ${risk.impact ?? 0} · urg ${risk.urgency ?? 0}
          </div>
        </li>`;
      })
      .join('');

    const overflow =
      rows.length > maxShow
        ? `<div class="muted" style="font-size:11px;">+ ${
            rows.length - maxShow
          } more not shown. Use "Export" to download all.</div>`
        : '';

    E.aiQueryResults.innerHTML = `
      ${summary}
      <ul style="margin:4px 0 0 16px;padding:0;font-size:13px;">
        ${items}
      </ul>
      ${overflow}
    `;

    E.aiQueryResults.querySelectorAll('[data-open]').forEach(btn => {
      btn.addEventListener('click', () =>
        UI.Modals.openIssue(btn.getAttribute('data-open'))
      );
    });
  };

  E.aiQueryRun.addEventListener('click', runQuery);
  E.aiQueryInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runQuery();
    }
  });

  if (E.aiQueryApplyFilters) {
    E.aiQueryApplyFilters.addEventListener('click', () => {
      if (!LAST_AI_QUERY || !LAST_AI_QUERY.q) {
        UI.toast('Run a query first.');
        return;
      }
      applyDSLToFilters(LAST_AI_QUERY.q);
      setActiveView('issues');
      UI.toast('Applied AI query filters to issues table');
    });
  }

  if (E.aiQueryExport) {
    E.aiQueryExport.addEventListener('click', () => {
      if (!LAST_AI_QUERY || !LAST_AI_QUERY.rows?.length) {
        UI.toast('Nothing to export yet.');
        return;
      }
      exportIssuesToExcel(LAST_AI_QUERY.rows, 'aiquery');
    });
  }

  // Initial help
  renderHelp();
}

/* ---------- Keyboard shortcuts ---------- */

function wireKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    const tag = (e.target && e.target.tagName) || '';
    const isInputLike =
      tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;

    // Ctrl/Cmd + K → AI query box (Insights tab)
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setActiveView('insights');
      if (E.aiQueryInput) {
        E.aiQueryInput.focus();
        if (E.aiQueryInput.select) E.aiQueryInput.select();
      }
      return;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return;

    // "/" → focus search (when not already in an input)
    if (e.key === '/' && !isInputLike) {
      e.preventDefault();
      setActiveView('issues');
      if (E.searchInput) {
        E.searchInput.focus();
        if (E.searchInput.select) E.searchInput.select();
      }
      return;
    }

    if (isInputLike) return;

    // 1/2/3 → switch tabs
    if (e.key === '1') {
      setActiveView('issues');
    } else if (e.key === '2') {
      setActiveView('calendar');
    } else if (e.key === '3') {
      setActiveView('insights');
    }
  });
}

/* ---------- Bootstrapping ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  cacheEls();
  if (!API_BASE_URL) {
    console.error(
      'API_BASE_URL is not configured. Set window.RUNTIME_CONFIG.API_BASE_URL before app.js loads.'
    );
    UI.toast('Backend URL is not configured. Please set RUNTIME_CONFIG.API_BASE_URL.');
  }
  const hadSession = Session.restore();
  Filters.load();
  ColumnManager.load();
  SavedViews.load();
  ColumnManager.renderPanel();
  ColumnManager.apply();
  SavedViews.refreshSelect();
  
  if (E.pageSize) {
    E.pageSize.value = String(GridState.pageSize);
  }

  wireDashboardGate();
  wireCore();
  wireSorting();
  wirePaging();
  wireFilters();
  wireTheme();
  wireConnectivity();
  wireModals();
  wireCalendar();
  wireFreezeWindows();
  wirePlanner();
  wireAIQuery();
  wireKeyboardShortcuts();

  let isAuthenticated = Session.isAuthenticated();
  if (hadSession) {
    try {
      const valid = await Session.validateSession();
      if (!valid) {
        await handleExpiredSession('Saved session is invalid or expired. Please log in again.');
      } else {
        isAuthenticated = true;
      }
    } catch (error) {
      await handleExpiredSession('Unable to restore session. Please log in again.');
    }
  }

  loadFreezeWindowsCache();
  renderFreezeWindows();
  
  if (!Session.isAuthenticated()) {
    const view = localStorage.getItem(LS_KEYS.view) || 'issues';
    setActiveView(
      view === 'calendar' || view === 'insights' ? view : 'issues'
    );
  }

  if (isAuthenticated && Session.isAuthenticated()) {
    await Promise.all([loadIssues(false), loadEvents(false)]);
  }
});
