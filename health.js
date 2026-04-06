const HealthMonitor = {
  history: [],
  allHistory: [],
  rangeHistory: [],
  checksPage: 1,
  checksPerPage: 10,
  timerId: null,
  loading: false,
  lastLoadedAt: null,
  charts: {},
  rangePreset: 'all',
  targetPreset: 'all',

  formatTs(ts) {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return '--';
    }
  },

  normalizeRow(raw) {
    const rawTimestamp = getEventField(raw, [
      'checked_at_utc',
      'checked at utc',
      'checkedAtUtc',
      'checked_at',
      'checked at',
      'checkedAt',
      'timestamp',
      'created_at',
      'created at',
      'datetime',
      'date'
    ]);
    const parsedTs = Date.parse(String(rawTimestamp || '').trim());
    const ts = Number.isFinite(parsedTs) ? parsedTs : NaN;
    const okRaw = getEventField(raw, ['is_up', 'is up', 'up', 'status', 'health', 'state']);
    const latencyRaw = getEventField(raw, ['latency_ms', 'latency ms', 'latency']);
    const failureNote = getEventField(raw, ['failure_note', 'failure note', 'note', 'error']);
    const tcpConnectRaw = getEventField(raw, ['tcp_connect_ms', 'tcp connect ms', 'tcp_ms']);
    const tlsHandshakeRaw = getEventField(raw, ['tls_handshake_ms', 'tls handshake ms', 'tls_ms']);
    const ttfbRaw = getEventField(raw, ['ttfb_ms', 'ttfb ms', 'ttfb']);
    const contentCheckRaw = getEventField(raw, ['content_check_passed', 'content check passed', 'content_ok']);
    const sslExpiryDaysRaw = getEventField(raw, ['ssl_expiry_days', 'ssl expiry days', 'ssl days']);
    const consecutiveFailuresRaw = getEventField(raw, ['consecutive_failures', 'consecutive failures']);
    const alertSentRaw = getEventField(raw, ['alert_sent', 'alert sent']);

    return {
      ts,
      ok: parseBoolean(okRaw),
      latency: Number.isFinite(Number(latencyRaw)) ? Number(latencyRaw) : null,
      note: String(failureNote || '').trim(),
      targetLabel: String(getEventField(raw, ['target_label', 'target label']) || '').trim(),
      targetUrl: String(getEventField(raw, ['target_url', 'target url']) || '').trim(),
      timeoutMs: Number(getEventField(raw, ['timeout_ms', 'timeout ms'])),
      checkIntervalMs: Number(getEventField(raw, ['check_interval_ms', 'check interval ms'])),
      environment: String(getEventField(raw, ['environment']) || '').trim(),
      region: String(getEventField(raw, ['region']) || '').trim(),
      tcpConnectMs: Number.isFinite(Number(tcpConnectRaw)) ? Number(tcpConnectRaw) : null,
      tlsHandshakeMs: Number.isFinite(Number(tlsHandshakeRaw)) ? Number(tlsHandshakeRaw) : null,
      ttfbMs: Number.isFinite(Number(ttfbRaw)) ? Number(ttfbRaw) : null,
      contentCheckPassed: parseBoolean(contentCheckRaw),
      sslExpiryDays: Number.isFinite(Number(sslExpiryDaysRaw)) ? Number(sslExpiryDaysRaw) : null,
      consecutiveFailures: Number.isFinite(Number(consecutiveFailuresRaw)) ? Number(consecutiveFailuresRaw) : null,
      alertSent: parseBoolean(alertSentRaw)
    };
  },

  candidateTabNames() {
    const preferred = String(CONFIG.HEALTH_MONITOR.SHEET_NAME || '').trim();
    const fallbacks = ['Table2', 'Monitor Health', 'Sheet1'];
    const deduped = new Set();
    [preferred, ...fallbacks].forEach(name => {
      const tab = String(name || '').trim();
      if (tab) deduped.add(tab);
    });
    return [...deduped];
  },

  async fetchRowsForTab(tabName) {
    const auth = Session.authContext();
    const readPasscode = String(CONFIG.HEALTH_MONITOR.WRITE_PASSCODE || '').trim();
    const data = await Api.get('monitor_health', {
      action: 'read',
      sheetName: tabName,
      tabName,
      public: 'true',
      access: 'public',
      role: auth.role || '',
      authToken: auth.authToken || '',
      passcode: readPasscode
    });

    if (
      data &&
      typeof data === 'object' &&
      (data.ok === false || data.success === false)
    ) {
      throw new Error(data.error || data.message || 'Health monitor API rejected read access.');
    }

    return extractHealthMonitorPayload(data)
      .map(item => this.normalizeRow(item))
      .filter(item => Number.isFinite(item.ts))
      .sort((a, b) => b.ts - a.ts);
  },

  async loadFromSheet(force = false) {
    if (this.loading || !CONFIG.HEALTH_MONITOR.READ_URL) return;
    this.loading = true;
    this.render();

    try {
      const tabNames = this.candidateTabNames();
      let rows = [];
      let chosenTab = '';
      let latestError = null;
      for (const tabName of tabNames) {
        try {
          const candidateRows = await this.fetchRowsForTab(tabName);
          if (candidateRows.length > rows.length) {
            rows = candidateRows;
            chosenTab = tabName;
          }
          if (candidateRows.length) break;
        } catch (error) {
          latestError = error;
        }
      }
      if (!rows.length && latestError) throw latestError;

      this.allHistory = rows;
      this.applyRangePreset();
      this.lastLoadedAt = Date.now();
      if (chosenTab && E.healthSheetSubtext) {
        E.healthSheetSubtext.textContent = `Health telemetry loaded directly from Google Sheet tab ${chosenTab}.`;
      }
      if (force) UI.toast('Health monitor refreshed from sheet.');
    } catch (error) {
      UI.toast(`Unable to load Monitor Health: ${error.message}`);
    } finally {
      this.loading = false;
      this.render();
    }
  },

  async checkNow() {
    await this.loadFromSheet(true);
  },

  getRangeBounds() {
    if (this.rangePreset === 'all') return null;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    switch (this.rangePreset) {
      case 'today':
        return { start: startOfDay, end: startOfDay + oneDayMs };
      case 'yesterday':
        return { start: startOfDay - oneDayMs, end: startOfDay };
      case 'last7days':
        return { start: startOfDay - (6 * oneDayMs), end: startOfDay + oneDayMs };
      case 'thisMonth':
        return { start: startOfThisMonth, end: Number.POSITIVE_INFINITY };
      case 'lastMonth': {
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
        return { start: startOfLastMonth, end: startOfThisMonth };
      }
      default:
        return null;
    }
  },

  applyRangePreset() {
    const bounds = this.getRangeBounds();
    if (!bounds) {
      this.rangeHistory = [...this.allHistory];
      this.applyTargetPreset();
      return;
    }
    this.rangeHistory = this.allHistory.filter(item => item.ts >= bounds.start && item.ts < bounds.end);
    this.checksPage = 1;
    this.applyTargetPreset();
  },

  setRangePreset(preset) {
    this.rangePreset = String(preset || 'all');
    this.applyRangePreset();
    this.render();
  },

  getTargetKey(item) {
    const label = String(item?.targetLabel || '').trim();
    const url = String(item?.targetUrl || '').trim();
    if (label) return label;
    if (url) return url;
    return 'Unknown target';
  },

  getTargetOptions() {
    const options = new Map();
    (CONFIG.HEALTH_MONITOR.TARGETS || []).forEach(target => {
      const key = String(target?.label || target?.url || '').trim();
      if (!key) return;
      options.set(key, {
        key,
        label: String(target?.label || key).trim(),
        url: String(target?.url || '').trim()
      });
    });
    this.allHistory.forEach(item => {
      const key = this.getTargetKey(item);
      if (!options.has(key)) {
        options.set(key, {
          key,
          label: String(item.targetLabel || key).trim(),
          url: String(item.targetUrl || '').trim()
        });
      }
    });
    return [{ key: 'all', label: 'All targets', url: '' }, ...[...options.values()]];
  },

  applyTargetPreset() {
    if (this.targetPreset === 'all') {
      this.history = [...this.rangeHistory];
    } else {
      this.history = this.rangeHistory.filter(item => this.getTargetKey(item) === this.targetPreset);
    }
    this.checksPage = 1;
  },

  setTargetPreset(preset) {
    this.targetPreset = String(preset || 'all');
    this.applyTargetPreset();
    this.render();
  },

  setChecksPage(page) {
    const totalPages = Math.max(1, Math.ceil(this.history.length / this.checksPerPage));
    this.checksPage = Math.min(totalPages, Math.max(1, Number(page) || 1));
    this.render();
  },

  bucketizeLatencies(list) {
    const buckets = { '<250ms': 0, '250-499ms': 0, '500-999ms': 0, '1000ms+': 0, 'n/a': 0 };
    list.forEach(item => {
      if (!Number.isFinite(item.latency)) {
        buckets['n/a'] += 1;
        return;
      }
      if (item.latency < 250) buckets['<250ms'] += 1;
      else if (item.latency < 500) buckets['250-499ms'] += 1;
      else if (item.latency < 1000) buckets['500-999ms'] += 1;
      else buckets['1000ms+'] += 1;
    });
    return buckets;
  },

  formatDurationMs(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return '0m';
    const totalSeconds = Math.floor(durationMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (!parts.length) parts.push(`${seconds}s`);
    return parts.slice(0, 2).join(' ');
  },

  computeDowntimeMs() {
    if (!this.history.length) return 0;
    const timeline = this.history.slice().sort((a, b) => a.ts - b.ts);
    let total = 0;
    for (let i = 0; i < timeline.length; i += 1) {
      const current = timeline[i];
      const next = timeline[i + 1];
      if (current.ok) continue;
      if (next && Number.isFinite(next.ts)) {
        total += Math.max(0, next.ts - current.ts);
      } else if (Number.isFinite(current.checkIntervalMs) && current.checkIntervalMs > 0) {
        total += current.checkIntervalMs;
      }
    }
    return total;
  },

  renderCharts() {
    if (typeof Chart === 'undefined') return;
    const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const textColor = cssVar('--text') || '#e5e7eb';
    const mutedColor = cssVar('--muted') || '#9ca3af';
    const gridColor = 'rgba(128,128,128,.2)';
    const upColor = cssVar('--ok') || '#16a34a';
    const downColor = cssVar('--warn') || '#d97706';
    const latencyColor = cssVar('--info') || '#2563eb';
    const bucketColors = [cssVar('--ok'), cssVar('--info'), cssVar('--warn'), cssVar('--danger'), cssVar('--neutral')];

    const make = (id, cfg) => {
      const canvas = E[id];
      if (!canvas) return;
      if (this.charts[id]) this.charts[id].destroy();
      this.charts[id] = new Chart(canvas, cfg);
    };

    const timeline = this.history.slice().reverse();
    const labels = timeline.map(item =>
      new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    const latencyData = timeline.map(item => (Number.isFinite(item.latency) ? item.latency : null));
    const statusData = timeline.map(item => (item.ok ? 1 : 0));

    make('healthLatencyTrendChart', {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Latency (ms)',
            data: latencyData,
            borderColor: latencyColor,
            backgroundColor: 'rgba(37,99,235,.25)',
            tension: 0.35,
            yAxisID: 'yLatency'
          },
          {
            label: 'Availability',
            data: statusData,
            borderColor: upColor,
            backgroundColor: 'rgba(22,163,74,.2)',
            stepped: true,
            tension: 0,
            yAxisID: 'yStatus'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor } } },
        scales: {
          x: { ticks: { color: mutedColor }, grid: { color: gridColor } },
          yLatency: {
            position: 'left',
            ticks: { color: mutedColor },
            grid: { color: gridColor },
            beginAtZero: true
          },
          yStatus: {
            position: 'right',
            min: 0,
            max: 1,
            ticks: {
              stepSize: 1,
              color: mutedColor,
              callback: value => (Number(value) === 1 ? 'Up' : 'Down')
            },
            grid: { display: false }
          }
        }
      }
    });

    const upCount = this.history.filter(item => item.ok).length;
    const downCount = this.history.filter(item => !item.ok).length;
    make('healthStatusDistributionChart', {
      type: 'doughnut',
      data: {
        labels: ['Online', 'Offline'],
        datasets: [{ data: [upCount, downCount], backgroundColor: [upColor, downColor] }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor } } }
      }
    });

    const latencyBuckets = this.bucketizeLatencies(this.history);
    make('healthLatencyBucketsChart', {
      type: 'bar',
      data: {
        labels: Object.keys(latencyBuckets),
        datasets: [{ label: 'Checks', data: Object.values(latencyBuckets), backgroundColor: bucketColors }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor } } },
        scales: {
          x: { ticks: { color: mutedColor }, grid: { color: gridColor } },
          y: { beginAtZero: true, ticks: { color: mutedColor }, grid: { color: gridColor } }
        }
      }
    });
  },

  render() {
    const targetOptions = this.getTargetOptions();
    const knownTargetKeys = new Set(targetOptions.map(item => item.key));
    if (!knownTargetKeys.has(this.targetPreset)) {
      this.targetPreset = 'all';
      this.applyTargetPreset();
    }
    const latest = this.history[0] || null;
    const latencies = this.history
      .map(item => item.latency)
      .filter(v => Number.isFinite(v))
      .sort((a, b) => a - b);
    const failures = this.history.filter(item => !item.ok).length;
    const totalDowntimeMs = this.computeDowntimeMs();
    const uptimePct = this.history.length
      ? (this.history.filter(h => h.ok).length / this.history.length) * 100
      : null;
    const avgLatency = latencies.length
      ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : null;
    const p95Latency = latencies.length
      ? latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)]
      : null;
    const currentFailureStreak = this.history.reduce((streak, item) => {
      if (streak.broken || item.ok) return { ...streak, broken: true };
      return { broken: false, count: streak.count + 1 };
    }, { broken: false, count: 0 }).count;

    if (E.healthStatusBadge) {
      E.healthStatusBadge.textContent = latest ? (latest.ok ? 'Online' : 'Offline') : 'Unknown';
      E.healthStatusBadge.className = `chip ${latest?.ok ? 'online' : 'offline'}`;
    }
    if (E.healthLastChecked) E.healthLastChecked.textContent = latest ? this.formatTs(latest.ts) : '--';
    if (E.healthLatency) {
      E.healthLatency.textContent = latest && Number.isFinite(latest.latency) ? `${latest.latency} ms` : 'n/a';
    }
    if (E.healthUptime) {
      if (!this.history.length) {
        E.healthUptime.textContent = '--';
      } else {
        const up = this.history.filter(h => h.ok).length;
        E.healthUptime.textContent = `${uptimePct.toFixed(2)}% (${up}/${this.history.length})`;
      }
    }
    if (E.healthUptimeWidget) {
      E.healthUptimeWidget.textContent = Number.isFinite(uptimePct) ? `${uptimePct.toFixed(2)}%` : '--';
    }
    if (E.healthAvgLatency) E.healthAvgLatency.textContent = Number.isFinite(avgLatency) ? `${avgLatency} ms` : 'n/a';
    if (E.healthP95Latency) E.healthP95Latency.textContent = Number.isFinite(p95Latency) ? `${p95Latency} ms` : 'n/a';
    if (E.healthFailureStreak) E.healthFailureStreak.textContent = `${currentFailureStreak} check${currentFailureStreak === 1 ? '' : 's'}`;
    if (E.healthFailureCount) E.healthFailureCount.textContent = `${failures} / ${this.history.length || 0}`;
    if (E.healthDowntime) E.healthDowntime.textContent = `${this.formatDurationMs(totalDowntimeMs)} (${failures} checks)`;
    if (E.healthDowntimeWidget) E.healthDowntimeWidget.textContent = this.formatDurationMs(totalDowntimeMs);
    if (E.healthWindowBar) {
      if (!this.history.length) {
        E.healthWindowBar.innerHTML = '<span class="muted">No checks yet.</span>';
      } else {
        E.healthWindowBar.innerHTML = this.history
          .slice()
          .reverse()
          .map(item => {
            const status = item.ok ? 'Up' : 'Down';
            const latencyText = Number.isFinite(item.latency) ? `${item.latency} ms` : 'n/a';
            const label = `${this.formatTs(item.ts)} · ${status} · ${latencyText}`;
            return `<span class="health-window-pill ${item.ok ? 'ok' : 'bad'}" title="${U.escapeHtml(label)}" aria-label="${U.escapeHtml(label)}"></span>`;
          })
          .join('');
      }
    }
    if (E.healthChecksList) {
      const totalPages = Math.max(1, Math.ceil(this.history.length / this.checksPerPage));
      if (this.checksPage > totalPages) this.checksPage = totalPages;
      const startIndex = (this.checksPage - 1) * this.checksPerPage;
      const endIndex = startIndex + this.checksPerPage;
      const pagedHistory = this.history.slice(startIndex, endIndex);
      if (!this.history.length) {
        E.healthChecksList.innerHTML = '<li>No checks yet.</li>';
      } else {
        E.healthChecksList.innerHTML = pagedHistory
          .map(item => {
            const failureText = item.note ? ` (${U.escapeHtml(item.note)})` : '';
            const status = item.ok ? '✅ Online' : `❌ Offline${failureText}`;
            const latencyText = Number.isFinite(item.latency) ? ` · ${item.latency} ms` : '';
            const meta = [item.environment, item.region, item.targetLabel].filter(Boolean).join(' · ');
            const metaText = meta ? `<div class="muted">${U.escapeHtml(meta)}</div>` : '';
            const metrics = [
              Number.isFinite(item.tcpConnectMs) ? `TCP ${item.tcpConnectMs} ms` : '',
              Number.isFinite(item.tlsHandshakeMs) ? `TLS ${item.tlsHandshakeMs} ms` : '',
              Number.isFinite(item.ttfbMs) ? `TTFB ${item.ttfbMs} ms` : '',
              Number.isFinite(item.sslExpiryDays) ? `SSL ${item.sslExpiryDays}d` : '',
              Number.isFinite(item.consecutiveFailures) ? `Fails ${item.consecutiveFailures}` : '',
              item.contentCheckPassed ? 'Content ✅' : '',
              item.alertSent ? 'Alert sent' : ''
            ].filter(Boolean).join(' · ');
            const metricsText = metrics ? `<div class="muted">${U.escapeHtml(metrics)}</div>` : '';
            return `<li><span>${U.escapeHtml(this.formatTs(item.ts))}</span><span>${status}${latencyText}${metaText}${metricsText}</span></li>`;
          })
          .join('');
      }
      if (E.healthChecksPagination) {
        E.healthChecksPagination.style.display = this.history.length ? 'flex' : 'none';
      }
      if (E.healthChecksPageInfo) {
        E.healthChecksPageInfo.textContent = `Page ${this.checksPage} of ${totalPages}`;
      }
      if (E.healthChecksPrevPage) {
        E.healthChecksPrevPage.disabled = this.checksPage <= 1;
      }
      if (E.healthChecksNextPage) {
        E.healthChecksNextPage.disabled = this.checksPage >= totalPages;
      }
    }
    if (E.healthRefreshBtn) {
      E.healthRefreshBtn.disabled = this.loading;
      E.healthRefreshBtn.textContent = this.loading ? 'Refreshing…' : 'Refresh from sheet';
    }
    if (E.healthRangePreset && E.healthRangePreset.value !== this.rangePreset) {
      E.healthRangePreset.value = this.rangePreset;
    }
    if (E.healthTargetPreset) {
      const currentHtml = E.healthTargetPreset.innerHTML;
      const nextHtml = targetOptions
        .map(item => `<option value="${U.escapeHtml(item.key)}">${U.escapeHtml(item.label)}</option>`)
        .join('');
      if (currentHtml !== nextHtml) E.healthTargetPreset.innerHTML = nextHtml;
      if (E.healthTargetPreset.value !== this.targetPreset) E.healthTargetPreset.value = this.targetPreset;
    }
    this.renderCharts();
  },

  start() {
    this.render();
    if (!this.history.length) this.loadFromSheet(false);
    if (!this.timerId) {
      this.timerId = setInterval(() => this.loadFromSheet(false), CONFIG.HEALTH_MONITOR.INTERVAL_MS);
    }
  }
};
