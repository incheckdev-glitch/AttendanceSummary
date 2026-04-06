const CSMDaily = {
  state: {
    active: false,
    loading: false,
    status: 'loading',
    error: '',
    rows: [],
    filteredRows: [],
    filters: { csm: 'All', client: 'All', type: 'All', effort: 'All', channel: 'All', start: '', end: '', search: '', tableSearch: '' },
    page: 1,
    pageSize: 12,
    charts: {}
  },
  loadFilters() {
    try {
      const raw = localStorage.getItem(LS_KEYS.csmDailyFilters);
      if (raw) this.state.filters = { ...this.state.filters, ...JSON.parse(raw) };
    } catch {}
  },
  saveFilters() {
    try { localStorage.setItem(LS_KEYS.csmDailyFilters, JSON.stringify(this.state.filters)); } catch {}
  },
  setActive(active) {
    this.state.active = !!active;
    document.body.dataset.activeView = active ? 'csmDaily' : 'issues';
    if (E.csmFiltersFields) E.csmFiltersFields.style.display = active ? '' : 'none';
    if (E.csmFiltersDates) E.csmFiltersDates.style.display = active ? '' : 'none';
    ['moduleFilter','categoryFilter','priorityFilter','statusFilter','devTeamStatusFilterRow','issueRelatedFilterRow','startDateFilter','endDateFilter'].forEach(id => {
      const el = E[id];
      if (!el) return;
      if (id.endsWith('FilterRow')) el.style.display = active ? 'none' : '';
      else {
        const row = el.closest('.filter-row');
        if (row) row.style.display = active ? 'none' : '';
      }
    });
    if (E.searchInput) {
      E.searchInput.placeholder = active
        ? 'Search notes, client, CSM, support type…  ( / to focus )'
        : 'Search ID, title, description, log…  ( / to focus )';
      E.searchInput.setAttribute('aria-label', active ? 'Search CSM Daily rows' : 'Search issues');
      E.searchInput.value = active ? this.state.filters.search : Filters.state.search || '';
    }
  },
  syncFilterInputs() {
    if (E.searchInput) E.searchInput.value = this.state.filters.search || '';
    if (E.csmNameFilter) setIfOptionExists(E.csmNameFilter, this.state.filters.csm);
    if (E.csmClientFilter) setIfOptionExists(E.csmClientFilter, this.state.filters.client);
    if (E.csmTypeFilter) setIfOptionExists(E.csmTypeFilter, this.state.filters.type);
    if (E.csmEffortFilter) setIfOptionExists(E.csmEffortFilter, this.state.filters.effort);
    if (E.csmChannelFilter) setIfOptionExists(E.csmChannelFilter, this.state.filters.channel);
    if (E.csmStartDateFilter) E.csmStartDateFilter.value = this.state.filters.start || '';
    if (E.csmEndDateFilter) E.csmEndDateFilter.value = this.state.filters.end || '';
    if (E.csmTableSearch) E.csmTableSearch.value = this.state.filters.tableSearch || '';
  },
  setStatus(status, text = '') {
    this.state.status = status;
    this.state.error = text;
    if (!E.csmDailyStatusPill) return;
    E.csmDailyStatusPill.className = `chip ${status}`;
    E.csmDailyStatusPill.textContent = status === 'error' ? `Error${text ? ': ' + text : ''}` : status === 'connected' ? 'Connected' : 'Loading';
  },
  normEffort(value) {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return 'Low';
    if (v.includes('high')) return 'High';
    if (v.includes('medium')) return 'Medium';
    return 'Low';
  },
  normalizeRow(raw) {
    const tsRaw = getEventField(raw, ['timestamp', 'Timestamp', 'timestampDateTime', 'date', 'datetime']);
    const ts = new Date(String(tsRaw || '').trim());
    const csm = String(getEventField(raw, ['csm', 'CSM Name', 'csmName']) || '').trim();
    const client = String(getEventField(raw, ['client', 'Client']) || '').trim();
    const type = String(getEventField(raw, ['type', 'Type of Support']) || '').trim();
    const effort = this.normEffort(getEventField(raw, ['effort', 'Effort Requirement']));
    const channel = String(getEventField(raw, ['channel', 'Support Channel']) || '').trim();
    const notes = String(getEventField(raw, ['notes', 'Notes', 'Notes (optional)']) || '').trim();
    const minutesRaw = getEventField(raw, ['minutes', 'Time Spent (Minutes)', 'Time Spent']);
    const minutes = Number.parseFloat(String(minutesRaw).replace(/[^\d.-]/g, ''));
    const hasAny = [csm, client, type, channel, notes].some(Boolean) || Number.isFinite(minutes);
    if (!hasAny) return null;
    return { timestamp: Number.isFinite(ts.getTime()) ? ts : null, timestampLabel: Number.isFinite(ts.getTime()) ? ts.toISOString() : '', csm: csm || 'Unknown', client: client || 'Unknown', minutes: Number.isFinite(minutes) && minutes >= 0 ? minutes : 0, type: type || 'Unspecified', effort, channel: channel || 'Unspecified', notes };
  },
  extractRows(data) {
    const fromHeaders = payload => {
      if (!payload || typeof payload !== 'object') return [];
      if (Array.isArray(payload.headers) && Array.isArray(payload.rows)) {
        return mapRowsWithHeaders(payload.headers, payload.rows);
      }
      return [];
    };
    const extract = payload => {
      if (typeof payload === 'string') {
        try {
          return extract(JSON.parse(payload));
        } catch {
          return [];
        }
      }
      if (Array.isArray(payload)) {
        if (!payload.length) return [];
        if (Array.isArray(payload[0])) {
          const [headers = [], ...rows] = payload;
          if (Array.isArray(headers) && headers.length) return mapRowsWithHeaders(headers, rows);
        }
        return payload;
      }
      if (!payload || typeof payload !== 'object') return [];

      const mappedRows = fromHeaders(payload);
      if (mappedRows.length) return mappedRows;

      const candidates = [
        payload.rows,
        payload.values,
        payload.records,
        payload.data,
        payload.items,
        payload.result,
        payload.payload,
        payload.response,
        payload.contents
      ];
      for (const candidate of candidates) {
        const rows = extract(candidate);
        if (rows.length) return rows;
      }
      return [];
    };
    return extract(data);
  },
  async load(force = false) {
    const shouldPreserveScroll = this.state.active;
    const scrollYBeforeLoad = shouldPreserveScroll ? window.scrollY : 0;
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(LS_KEYS.csmDailyRows) || '[]');
        if (Array.isArray(cached) && cached.length) {
          this.state.rows = cached.map(r => ({ ...r, timestamp: r.timestampLabel ? new Date(r.timestampLabel) : null }));
          this.renderFilters();
          this.renderAll();
        }
      } catch {}
    }
    this.state.loading = true;
    this.setStatus('loading');
    try {
      if (!CONFIG.CSM_DAILY_API_URL) throw new Error('CSM Daily is not linked to Google Sheets.');
      const res = await fetch(CONFIG.CSM_DAILY_API_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const text = await res.text();
      const data = parseApiJson(text, 'CSM Daily API');
      const rows = this.extractRows(data).map(r => this.normalizeRow(r)).filter(Boolean);
      this.state.rows = rows;
      try {
        localStorage.setItem(LS_KEYS.csmDailyRows, JSON.stringify(rows));
        localStorage.setItem(LS_KEYS.csmDailyLastUpdated, new Date().toISOString());
      } catch {}
      this.setStatus('connected');
      this.renderFilters();
      this.renderAll();
      if (shouldPreserveScroll) {
        requestAnimationFrame(() => {
          window.scrollTo({ top: scrollYBeforeLoad, behavior: 'auto' });
        });
      }
    } catch (e) {
      this.setStatus('error', e.message || 'Failed');
      this.renderAll();
    } finally {
      this.state.loading = false;
    }
  },
  renderFilters() {
    const uniq = arr => ['All', ...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const opts = (el, values) => { if (el) el.innerHTML = uniq(values).map(v => `<option value="${U.escapeAttr(v)}">${U.escapeHtml(v)}</option>`).join(''); };
    opts(E.csmNameFilter, this.state.rows.map(r => r.csm));
    opts(E.csmClientFilter, this.state.rows.map(r => r.client));
    opts(E.csmTypeFilter, this.state.rows.map(r => r.type));
    opts(E.csmEffortFilter, this.state.rows.map(r => r.effort));
    opts(E.csmChannelFilter, this.state.rows.map(r => r.channel));
    this.syncFilterInputs();
  },
  applyFilters() {
    const s = this.state.filters;
    const query = String(s.search || '').toLowerCase();
    const start = s.start ? new Date(`${s.start}T00:00:00`) : null;
    const end = s.end ? new Date(`${s.end}T23:59:59.999`) : null;
    this.state.filteredRows = this.state.rows
      .filter(r => !start || (r.timestamp && r.timestamp >= start))
      .filter(r => !end || (r.timestamp && r.timestamp <= end))
      .filter(r => s.csm === 'All' || r.csm === s.csm)
      .filter(r => s.client === 'All' || r.client === s.client)
      .filter(r => s.type === 'All' || r.type === s.type)
      .filter(r => s.effort === 'All' || r.effort === s.effort)
      .filter(r => s.channel === 'All' || r.channel === s.channel)
      .filter(r => {
        if (!query) return true;
        const hay = [r.client, r.notes, r.csm, r.type, r.channel].join(' ').toLowerCase();
        return hay.includes(query);
      })
      .sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0));
    return this.state.filteredRows;
  },
  metrics(rows) {
    const totalTasks = rows.length;
    const totalMinutes = rows.reduce((a, r) => a + r.minutes, 0);
    const avg = totalTasks ? totalMinutes / totalTasks : 0;
    const activeClients = new Set(rows.map(r => r.client)).size;
    const loadScore = rows.reduce((a, r) => a + (r.effort === 'High' ? 3 : r.effort === 'Medium' ? 2 : 1), 0);
    const highShare = totalTasks ? (rows.filter(r => r.effort === 'High').length / totalTasks) * 100 : 0;
    return { totalTasks, totalMinutes, avg, activeClients, loadScore, highShare };
  },
  renderAll() {
    const rows = this.applyFilters();
    this.renderKpis(rows); this.renderInsights(rows); this.renderSummaryTable(rows); this.renderTaskTable(rows); this.renderCharts(rows);
  },
  renderKpis(rows) {
    if (!E.csmKpis) return;
    const m = this.metrics(rows);
    const cards = [['Total Tasks', m.totalTasks], ['Total Minutes', m.totalMinutes.toFixed(0)], ['Average Minutes / Task', m.avg.toFixed(1)], ['Active Clients', m.activeClients], ['Weighted Load Score', m.loadScore], ['High-Effort Share', `${m.highShare.toFixed(1)}%`]];
    E.csmKpis.innerHTML = cards.map(([label, value]) => `<div class="card kpi"><div class="label">${U.escapeHtml(label)}</div><div class="value">${U.escapeHtml(String(value))}</div></div>`).join('');
  },
  renderInsights(rows) {
    if (!E.csmInsights) return;
    if (!rows.length) { E.csmInsights.innerHTML = '<div class="card muted">No workload insights available for current filters.</div>'; return; }
    const byKey = (key, fn = r => r.minutes) => rows.reduce((m, r) => (m.set(r[key], (m.get(r[key]) || 0) + fn(r)), m), new Map());
    const maxOf = map => Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0] || ['—', 0];
    const topCSM = maxOf(byKey('csm')); const topClient = maxOf(byKey('client')); const topType = maxOf(byKey('type', () => 1)); const topChannel = maxOf(byKey('channel', () => 1));
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekdayMap = rows.reduce((m, r) => (m.set(weekdayNames[r.timestamp?.getDay() || 0], (m.get(weekdayNames[r.timestamp?.getDay() || 0]) || 0) + r.minutes), m), new Map());
    const peakWeekday = maxOf(weekdayMap);
    const mins = rows.map(r => r.minutes).sort((a, b) => a - b); const mid = Math.floor(mins.length / 2); const median = mins.length % 2 ? mins[mid] : (mins[mid - 1] + mins[mid]) / 2;
    const mean = mins.reduce((a, b) => a + b, 0) / mins.length; const std = Math.sqrt(mins.reduce((a, v) => a + (v - mean) ** 2, 0) / mins.length);
    const byCsmMinutes = Array.from(byKey('csm').values()); const avgCsm = byCsmMinutes.reduce((a, b) => a + b, 0) / (byCsmMinutes.length || 1); const overloaded = byCsmMinutes.filter(v => v > avgCsm * 1.25).length;
    const top5Minutes = Array.from(byKey('client').values()).sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0); const totalMinutes = rows.reduce((a, r) => a + r.minutes, 0);
    const insights = [['Busiest CSM', `${topCSM[0]} (${topCSM[1].toFixed(0)}m)`], ['Busiest Client', `${topClient[0]} (${topClient[1].toFixed(0)}m)`], ['Top 5 Client Concentration', `${totalMinutes ? ((top5Minutes / totalMinutes) * 100).toFixed(1) : 0}%`], ['Dominant Work Type', `${topType[0]} (${topType[1]})`], ['Primary Support Channel', `${topChannel[0]} (${topChannel[1]})`], ['Peak Weekday', `${peakWeekday[0]} (${peakWeekday[1].toFixed(0)}m)`], ['Median Task Duration', `${median.toFixed(1)}m`], ['Workload Variability', `${std.toFixed(1)}m std dev`], ['Overloaded CSMs', String(overloaded)]];
    E.csmInsights.innerHTML = insights.map(([k, v]) => `<div class="card"><strong>${U.escapeHtml(k)}</strong><div class="muted">${U.escapeHtml(v)}</div></div>`).join('');
  },
  renderSummaryTable(rows) {
    if (!E.csmSummaryBody) return;
    const map = new Map();
    rows.forEach(r => { const item = map.get(r.csm) || { csm: r.csm, tasks: 0, minutes: 0, clients: new Set() }; item.tasks += 1; item.minutes += r.minutes; item.clients.add(r.client); map.set(r.csm, item); });
    const summary = Array.from(map.values()).sort((a, b) => b.minutes - a.minutes).slice(0, 12);
    E.csmSummaryBody.innerHTML = summary.length ? summary.map(r => `<tr><td>${U.escapeHtml(r.csm)}</td><td>${r.tasks}</td><td>${r.minutes.toFixed(0)}</td><td>${(r.minutes / (r.tasks || 1)).toFixed(1)}</td><td>${r.clients.size}</td></tr>`).join('') : '<tr><td colspan="5" class="muted" style="text-align:center;">No CSM summary data.</td></tr>';
    if (E.csmSummaryRowCount) E.csmSummaryRowCount.textContent = `${summary.length} CSM row${summary.length === 1 ? '' : 's'}`;
  },
  renderTaskTable(rows) {
    if (!E.csmTaskBody) return;
    const q = String(this.state.filters.tableSearch || '').toLowerCase().trim();
    const visible = q ? rows.filter(r => [r.csm, r.client, r.type, r.channel, r.notes].join(' ').toLowerCase().includes(q)) : rows;
    const pages = Math.max(1, Math.ceil(visible.length / this.state.pageSize));
    if (this.state.page > pages) this.state.page = pages;
    const start = (this.state.page - 1) * this.state.pageSize;
    const pageRows = visible.slice(start, start + this.state.pageSize);
    E.csmTaskBody.innerHTML = pageRows.length ? pageRows.map(r => `<tr><td>${U.escapeHtml(r.timestamp ? r.timestamp.toLocaleString() : '—')}</td><td>${U.escapeHtml(r.csm)}</td><td>${U.escapeHtml(r.client)}</td><td>${r.minutes.toFixed(0)}</td><td>${U.escapeHtml(r.type)}</td><td>${U.escapeHtml(r.effort)}</td><td>${U.escapeHtml(r.channel)}</td><td>${U.escapeHtml(r.notes || '—')}</td></tr>`).join('') : '<tr><td colspan="8" class="muted" style="text-align:center;">No tasks match the current filters.</td></tr>';
    if (E.csmPageInfo) E.csmPageInfo.textContent = `Page ${this.state.page} / ${pages}`;
    if (E.csmVisibleRowCount) E.csmVisibleRowCount.textContent = `${visible.length} visible row${visible.length === 1 ? '' : 's'}`;
    if (E.csmPrevPage) E.csmPrevPage.disabled = this.state.page <= 1;
    if (E.csmNextPage) E.csmNextPage.disabled = this.state.page >= pages;
  },
  renderCharts(rows) {
    if (typeof Chart === 'undefined') return;
    const destroy = id => { if (this.state.charts[id]) this.state.charts[id].destroy(); };
    const mk = (id, type, labels, data, datasetsExtra = {}) => { const el = E[id]; if (!el) return; destroy(id); if (!labels.length) return; this.state.charts[id] = new Chart(el, { type, data: { labels, datasets: [{ label: 'Value', data, ...datasetsExtra }] }, options: { responsive: true, maintainAspectRatio: false } }); };
    const group = (key, reducer = r => r.minutes) => rows.reduce((m, r) => (m.set(r[key], (m.get(r[key]) || 0) + reducer(r)), m), new Map());
    const top = (map, n = 8) => Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);
    const byDate = rows.reduce((m, r) => { const k = r.timestampLabel ? r.timestampLabel.slice(0, 10) : 'Unknown'; m.set(k, (m.get(k) || 0) + 1); return m; }, new Map());
    const topCsm = top(group('csm')); const topClient = top(group('client'), 10); const typeDist = Array.from(group('type', () => 1).entries()); const effortDist = Array.from(group('effort', () => 1).entries()); const channelDist = Array.from(group('channel', () => 1).entries());
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekdayMap = rows.reduce((m, r) => { const k = weekdays[r.timestamp?.getDay() || 0]; m.set(k, (m.get(k) || 0) + r.minutes); return m; }, new Map());
    const weekKey = d => { const dt = new Date(d); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day + 3); const firstThursday = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4)); const week = 1 + Math.round(((dt - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7); return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`; };
    const weekly = rows.reduce((m, r) => { const k = r.timestamp ? weekKey(r.timestamp) : 'Unknown'; m.set(k, (m.get(k) || 0) + r.minutes); return m; }, new Map());
    const csmEffort = new Map(); rows.forEach(r => { const base = csmEffort.get(r.csm) || { Low: 0, Medium: 0, High: 0 }; base[r.effort] += 1; csmEffort.set(r.csm, base); });
    const concentration = top(group('client'), 8); const balance = Array.from(group('csm').entries());
    mk('csmTasksOverTimeChart', 'line', Array.from(byDate.keys()), Array.from(byDate.values()));
    mk('csmTopWorkloadChart', 'bar', topCsm.map(x => x[0]), topCsm.map(x => x[1]));
    mk('csmMinutesByClientChart', 'bar', topClient.map(x => x[0]), topClient.map(x => x[1]));
    mk('csmTypeDistributionChart', 'doughnut', typeDist.map(x => x[0]), typeDist.map(x => x[1]));
    mk('csmEffortDistributionChart', 'pie', effortDist.map(x => x[0]), effortDist.map(x => x[1]));
    mk('csmChannelDistributionChart', 'bar', channelDist.map(x => x[0]), channelDist.map(x => x[1]));
    mk('csmWeekdayWorkloadChart', 'bar', weekdays, weekdays.map(d => weekdayMap.get(d) || 0));
    mk('csmWeeklyTrendChart', 'line', Array.from(weekly.keys()), Array.from(weekly.values()));
    destroy('csmEffortMixByCsmChart');
    if (E.csmEffortMixByCsmChart) {
      const labels = Array.from(csmEffort.keys());
      this.state.charts.csmEffortMixByCsmChart = new Chart(E.csmEffortMixByCsmChart, { type: 'bar', data: { labels, datasets: ['Low', 'Medium', 'High'].map(k => ({ label: k, data: labels.map(n => csmEffort.get(n)?.[k] || 0) })) }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } } });
    }
    mk('csmClientConcentrationChart', 'doughnut', concentration.map(x => x[0]), concentration.map(x => x[1]));
    mk('csmWorkloadBalanceChart', 'bar', balance.map(x => x[0]), balance.map(x => x[1]));
  },
  exportCsv() {
    const rows = this.applyFilters();
    const header = ['Timestamp', 'CSM Name', 'Client', 'Time Spent (Minutes)', 'Type of Support', 'Effort Requirement', 'Support Channel', 'Notes'];
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [header.join(','), ...rows.map(r => [r.timestamp ? r.timestamp.toISOString() : '', r.csm, r.client, r.minutes, r.type, r.effort, r.channel, r.notes].map(esc).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `csm_daily_filtered_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
};
