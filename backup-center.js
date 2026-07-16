(function initBackupCenter(global) {
  'use strict';

  const STORAGE_KEY = 'incheck360_backup_center_v1';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  const norm = value => String(value ?? '').trim().toLowerCase();
  const today = () => new Date().toISOString().slice(0, 10);
  const nowIso = () => new Date().toISOString();
  const uid = prefix => (global.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const num = value => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const fmtDate = value => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'2-digit' }) : '—';
  const fmtDateTime = value => value ? new Date(value).toLocaleString() : '—';
  const authProfile = () => global.Session?.authContext?.()?.profile || {};
  const authName = () => global.Session?.displayName?.() || authProfile()?.full_name || authProfile()?.email || 'Admin';

  function isAdmin() {
    const role = norm(authProfile()?.role_key || authProfile()?.role || authProfile()?.user_role || global.Session?.role?.() || '');
    return role === 'admin' || Boolean(global.Permissions?.hasAdminOverride?.());
  }

  const TABLES = {
    settings: 'backup_settings',
    logs: 'backup_logs'
  };

  const state = {
    initialized: false,
    activeTab: 'overview',
    dataSource: 'local',
    loading: false,
    logs: [],
    settings: {
      project_ref: '',
      preferred_destination: 'Google Drive / External Drive',
      bucket_method: 'rclone / S3 protocol',
      retention_daily: 7,
      retention_weekly: 4,
      retention_monthly: 12,
      notes: ''
    },
    filters: { type: 'all', status: 'all', from: '', to: '', search: '' },
    oneClickRunning: false
  };

  function client() {
    try { return global.SupabaseClient?.getClient?.() || null; }
    catch { return null; }
  }

  function toast(message) { global.UI?.toast?.(message); }

  function defaultSettings() {
    return { ...state.settings };
  }

  function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ logs: state.logs, settings: state.settings })); }
    catch (error) { console.warn('[BackupCenter] local save failed', error); }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.logs = Array.isArray(parsed.logs) ? parsed.logs : [];
        state.settings = { ...defaultSettings(), ...(parsed.settings || {}) };
        return;
      }
    } catch (error) { console.warn('[BackupCenter] local load failed', error); }
    state.logs = [];
    state.settings = defaultSettings();
  }

  async function fetchTable(table) {
    const sb = client();
    if (!sb) throw new Error('Supabase client not available');
    const { data, error } = await sb.from(table).select('*').order('created_at', { ascending:false });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function loadRemote() {
    const sb = client();
    if (!sb) { state.dataSource = 'local'; loadLocal(); return; }
    try {
      const [logs, settingsRows] = await Promise.all([
        fetchTable(TABLES.logs),
        fetchTable(TABLES.settings)
      ]);
      state.logs = logs;
      const merged = defaultSettings();
      settingsRows.forEach(row => {
        if (row?.setting_key) merged[row.setting_key] = row.setting_value ?? row.value_text ?? merged[row.setting_key];
      });
      state.settings = merged;
      state.dataSource = 'supabase';
      saveLocal();
    } catch (error) {
      console.warn('[BackupCenter] Supabase load failed, using local fallback', error);
      state.dataSource = 'local';
      loadLocal();
      toast('Backup Center loaded locally. Run the Backup Center SQL migration for Supabase history.');
    }
  }

  async function upsertSettings() {
    const sb = client();
    if (!sb) { saveLocal(); return; }
    const rows = Object.entries(state.settings).map(([setting_key, setting_value]) => ({
      setting_key,
      setting_value: String(setting_value ?? ''),
      updated_at: nowIso(),
      updated_by_name: authName()
    }));
    const { error } = await sb.from(TABLES.settings).upsert(rows, { onConflict: 'setting_key' });
    if (error) throw error;
  }

  async function insertLog(log) {
    const sb = client();
    const row = {
      id: log.id || uid('backup'),
      backup_type: log.backup_type,
      backup_scope: log.backup_scope || log.backup_type,
      status: log.status,
      backup_date: log.backup_date,
      started_at: log.started_at || null,
      finished_at: log.finished_at || null,
      file_name: log.file_name || '',
      storage_location: log.storage_location || '',
      file_size_mb: num(log.file_size_mb),
      checksum: log.checksum || '',
      notes: log.notes || '',
      created_by_name: authName(),
      created_at: nowIso(),
      updated_at: nowIso()
    };
    if (!sb) {
      state.logs.unshift(row);
      saveLocal();
      return row;
    }
    const { data, error } = await sb.from(TABLES.logs).insert(row).select('*').single();
    if (error) throw error;
    return data || row;
  }

  async function deleteLog(id) {
    const sb = client();
    if (!sb) {
      state.logs = state.logs.filter(row => String(row.id) !== String(id));
      saveLocal();
      return;
    }
    const { error } = await sb.from(TABLES.logs).delete().eq('id', id);
    if (error) throw error;
  }

  function filteredLogs() {
    const f = state.filters;
    return state.logs.filter(row => {
      const date = String(row.backup_date || row.created_at || '').slice(0, 10);
      const hay = [row.backup_type, row.status, row.file_name, row.storage_location, row.notes, row.created_by_name].map(v => String(v || '').toLowerCase()).join(' ');
      if (f.type !== 'all' && norm(row.backup_type) !== f.type) return false;
      if (f.status !== 'all' && norm(row.status) !== f.status) return false;
      if (f.from && date < f.from) return false;
      if (f.to && date > f.to) return false;
      if (f.search && !hay.includes(norm(f.search))) return false;
      return true;
    }).sort((a,b) => String(b.backup_date || b.created_at || '').localeCompare(String(a.backup_date || a.created_at || '')));
  }

  function latestLog(type) {
    return state.logs
      .filter(row => type === 'any' || norm(row.backup_type) === type || (type === 'database' && norm(row.backup_type) === 'full') || (type === 'storage' && norm(row.backup_type) === 'full'))
      .sort((a,b) => String(b.backup_date || b.created_at || '').localeCompare(String(a.backup_date || a.created_at || '')))[0] || null;
  }

  function statusBadge(status) {
    const key = norm(status || 'unknown');
    const cls = key === 'success' ? 'success' : key === 'failed' ? 'failed' : key === 'running' ? 'running' : 'warning';
    return `<span class="backup-badge ${cls}">${esc(status || 'Unknown')}</span>`;
  }

  function backupCommandText() {
    const projectRef = state.settings.project_ref || 'YOUR_PROJECT_REF';
    return `# InCheck360 manual backup commands\n# Run from your PC. Do not paste secrets into the ERP frontend.\n\n# 1) Create folder\nDATE=$(date +"%Y-%m-%d_%H-%M")\nmkdir -p backups/$DATE/db\nmkdir -p backups/$DATE/storage\n\n# 2) Set database URL locally on your PC\nexport SUPABASE_DB_URL="postgresql://postgres.${projectRef}:YOUR_PASSWORD@aws-0-region.pooler.supabase.com:5432/postgres"\n\n# 3) Database backup\nsupabase db dump --db-url "$SUPABASE_DB_URL" -f "backups/$DATE/db/roles.sql" --role-only\nsupabase db dump --db-url "$SUPABASE_DB_URL" -f "backups/$DATE/db/schema.sql"\nsupabase db dump --db-url "$SUPABASE_DB_URL" -f "backups/$DATE/db/data.sql" --use-copy --data-only\n\n# 4) Storage buckets backup using rclone S3 remote named supabase\nrclone copy supabase: "backups/$DATE/storage" --progress\n\n# 5) Compress\nzip -r "InCheck360_Backup_$DATE.zip" "backups/$DATE"\n\n# 6) Store ZIP outside Supabase\n# Example: Google Drive, OneDrive, external disk, private S3/R2/B2.`;
  }

  function renderHeader() {
    return `
      <div class="backup-page-header">
        <div>
          <span class="backup-eyebrow">Admin · Database · Storage Buckets</span>
          <h2>Backup Center</h2>
          <p class="muted">Track manual database and bucket backups. This page does not store database passwords or service keys.</p>
          <div class="backup-toolbar">
            <span class="backup-chip ${state.dataSource === 'supabase' ? 'success' : 'warning'}">${state.dataSource === 'supabase' ? 'Supabase history' : 'Local fallback'}</span>
            <span class="backup-chip">Admin only</span>
          </div>
        </div>
        <div class="backup-actions">
          <button class="btn" type="button" data-backup-action="refresh">Refresh</button>
          <button class="btn" type="button" data-backup-action="download-guide">Download Guide</button>
          <button class="btn primary" type="button" data-backup-action="download-one-click" ${state.oneClickRunning ? 'disabled' : ''}>${state.oneClickRunning ? 'Preparing ZIP…' : 'Download Backup ZIP'}</button>
          <button class="btn" type="button" data-backup-tab-open="new-log">Add Backup Log</button>
        </div>
      </div>
      <div class="backup-tabs" role="tablist" aria-label="Backup Center tabs">
        ${[
          ['overview','Overview'], ['new-log','Add Backup Log'], ['history','Backup History'], ['settings','Settings'], ['guide','Manual Guide']
        ].map(([key,label]) => `<button class="backup-tab ${state.activeTab === key ? 'active' : ''}" type="button" data-backup-tab="${key}">${label}</button>`).join('')}
      </div>`;
  }

  function renderOverview() {
    const db = latestLog('database');
    const storage = latestLog('storage');
    const full = latestLog('full');
    const monthKey = today().slice(0, 7);
    const thisMonth = state.logs.filter(row => String(row.backup_date || row.created_at || '').startsWith(monthKey)).length;
    const failed = state.logs.filter(row => norm(row.status) === 'failed').length;
    return `
      <div class="backup-grid">
        <div class="backup-kpi"><div class="label">Last DB Backup</div><div class="value">${db ? fmtDate(db.backup_date || db.created_at) : '—'}</div><div class="hint">${db ? esc(db.status || '') : 'No database backup logged yet'}</div></div>
        <div class="backup-kpi"><div class="label">Last Bucket Backup</div><div class="value">${storage ? fmtDate(storage.backup_date || storage.created_at) : '—'}</div><div class="hint">${storage ? esc(storage.status || '') : 'No storage backup logged yet'}</div></div>
        <div class="backup-kpi"><div class="label">Last Full Backup</div><div class="value">${full ? fmtDate(full.backup_date || full.created_at) : '—'}</div><div class="hint">Database + buckets together</div></div>
        <div class="backup-kpi"><div class="label">This Month</div><div class="value">${thisMonth}</div><div class="hint">Logged backup runs</div></div>
        <div class="backup-kpi"><div class="label">Failed Logs</div><div class="value">${failed}</div><div class="hint">Review failed/manual issues</div></div>
      </div>
      <div class="backup-card">
        <div class="backup-card-header"><div><h3>Required backup checklist</h3><p class="muted">Use this before big SQL migrations or frontend releases.</p></div></div>
        <div class="backup-warning"><strong>Important:</strong> Supabase database backups do not include the actual files in Storage buckets. You must back up both database SQL and bucket files.</div>
        <ol class="backup-checklist">
          <li>Export database roles, schema, and data.</li>
          <li>Copy all Storage buckets using Dashboard download or rclone/S3.</li>
          <li>Zip the backup folder.</li>
          <li>Store the ZIP outside Supabase, such as Google Drive, OneDrive, external disk, or private object storage.</li>
          <li>Add a backup log here after confirming the backup file exists.</li>
        </ol>
      </div>
      <div class="backup-card backup-one-click">
        <div class="backup-card-header">
          <div>
            <h3>One-click ERP backup</h3>
            <p class="muted">Downloads one ZIP containing public ERP database data as JSON plus Supabase Storage bucket files.</p>
          </div>
          <button class="btn primary" type="button" data-backup-action="download-one-click" ${state.oneClickRunning ? 'disabled' : ''}>${state.oneClickRunning ? 'Preparing ZIP…' : 'Download Backup ZIP'}</button>
        </div>
        <div class="backup-success-note"><strong>What it includes:</strong> table data exported as JSON, storage bucket files, and a manifest file.</div>
        <div class="backup-warning"><strong>Important:</strong> This needs Vercel environment variables <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code>. For a full PostgreSQL schema/roles dump, keep using the manual CLI backup guide.</div>
      </div>
      ${renderHistory(true)}
    `;
  }

  function renderNewLog() {
    return `
      <div class="backup-card">
        <div class="backup-card-header"><div><h3>Add Backup Log</h3><p class="muted">Record that a manual database/storage backup was completed. This does not run the backup.</p></div></div>
        <form id="backupLogForm" class="backup-form-grid">
          <label class="backup-field">Backup Type
            <select name="backup_type" required>
              <option value="full">Full: database + buckets</option>
              <option value="database">Database only</option>
              <option value="storage">Storage buckets only</option>
            </select>
          </label>
          <label class="backup-field">Status
            <select name="status" required>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="running">Running</option>
              <option value="partial">Partial</option>
            </select>
          </label>
          <label class="backup-field">Backup Date<input type="date" name="backup_date" value="${today()}" required /></label>
          <label class="backup-field">File Size MB<input type="number" step="0.01" min="0" name="file_size_mb" placeholder="0.00" /></label>
          <label class="backup-field">Backup File Name<input name="file_name" placeholder="InCheck360_Backup_2026-07-07.zip" /></label>
          <label class="backup-field">Backup Location<input name="storage_location" placeholder="Google Drive / external disk / S3 path" /></label>
          <label class="backup-field">Checksum / Reference<input name="checksum" placeholder="Optional checksum or drive link reference" /></label>
          <label class="backup-field wide">Notes<textarea name="notes" placeholder="What was included, any issue, who verified it..."></textarea></label>
          <div class="backup-actions wide">
            <button class="btn primary" type="submit">Save Backup Log</button>
            <button class="btn" type="button" data-backup-tab-open="guide">Open Manual Guide</button>
          </div>
        </form>
      </div>`;
  }

  function renderHistory(limitLatest = false) {
    const rows = filteredLogs();
    const visibleRows = limitLatest ? rows.slice(0, 6) : rows;
    return `
      <div class="backup-card">
        <div class="backup-card-header">
          <div><h3>Backup History</h3><p class="muted">Manual backup log history. Keep this matched with your real ZIP files.</p></div>
          <div class="backup-actions">
            <button class="btn" type="button" data-backup-action="export-csv">Export CSV</button>
            <button class="btn" type="button" data-backup-action="print-history">Print</button>
          </div>
        </div>
        ${limitLatest ? '' : renderFilters()}
        ${visibleRows.length ? `<div class="backup-table-wrap backup-print-area"><table class="backup-table"><thead><tr><th>Date</th><th>Type</th><th>Status</th><th>File</th><th>Location</th><th>Size</th><th>Checksum</th><th>Created By</th><th>Created At</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${visibleRows.map(row => `<tr>
          <td>${fmtDate(row.backup_date || row.created_at)}</td>
          <td>${esc(row.backup_type || '')}</td>
          <td>${statusBadge(row.status)}</td>
          <td>${esc(row.file_name || '—')}</td>
          <td>${esc(row.storage_location || '—')}</td>
          <td>${num(row.file_size_mb).toLocaleString(undefined, { maximumFractionDigits:2 })} MB</td>
          <td><code title="${esc(row.checksum || '')}">${row.checksum ? esc(String(row.checksum).slice(0, 16)) + '…' : '—'}</code></td>
          <td>${esc(row.created_by_name || '—')}</td>
          <td>${fmtDateTime(row.created_at)}</td>
          <td>${esc(row.notes || '')}</td>
          <td><button class="btn ghost sm" type="button" data-backup-delete="${esc(row.id)}">Delete</button></td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="backup-empty">No backup logs found yet.</div>'}
      </div>`;
  }

  function renderFilters() {
    const f = state.filters;
    return `<div class="backup-form-grid" style="margin-bottom:12px;">
      <label class="backup-field">Type<select data-backup-filter="type"><option value="all">All</option><option value="full">Full</option><option value="database">Database</option><option value="storage">Storage</option></select></label>
      <label class="backup-field">Status<select data-backup-filter="status"><option value="all">All</option><option value="success">Success</option><option value="partial">Partial</option><option value="failed">Failed</option><option value="running">Running</option></select></label>
      <label class="backup-field">From<input type="date" data-backup-filter="from" value="${esc(f.from)}" /></label>
      <label class="backup-field">To<input type="date" data-backup-filter="to" value="${esc(f.to)}" /></label>
      <label class="backup-field">Search<input data-backup-filter="search" value="${esc(f.search)}" placeholder="file, location, notes" /></label>
      <div class="backup-actions"><button class="btn" type="button" data-backup-action="clear-filters">Clear Filters</button></div>
    </div>`;
  }

  function renderSettings() {
    const s = state.settings;
    return `
      <div class="backup-card">
        <div class="backup-card-header"><div><h3>Backup Settings</h3><p class="muted">No passwords, service keys, or database URLs are stored here.</p></div></div>
        <form id="backupSettingsForm" class="backup-form-grid">
          <label class="backup-field">Supabase Project Ref<input name="project_ref" value="${esc(s.project_ref)}" placeholder="ghvceonzwcvdxccdtoua" /></label>
          <label class="backup-field">Preferred Destination<input name="preferred_destination" value="${esc(s.preferred_destination)}" /></label>
          <label class="backup-field">Bucket Backup Method<input name="bucket_method" value="${esc(s.bucket_method)}" /></label>
          <label class="backup-field">Daily Retention<input type="number" min="0" name="retention_daily" value="${esc(s.retention_daily)}" /></label>
          <label class="backup-field">Weekly Retention<input type="number" min="0" name="retention_weekly" value="${esc(s.retention_weekly)}" /></label>
          <label class="backup-field">Monthly Retention<input type="number" min="0" name="retention_monthly" value="${esc(s.retention_monthly)}" /></label>
          <label class="backup-field wide">Notes<textarea name="notes">${esc(s.notes)}</textarea></label>
          <div class="backup-actions wide"><button class="btn primary" type="submit">Save Settings</button></div>
        </form>
      </div>
      <div class="backup-card"><h3>Recommended Retention</h3><p class="muted">Daily backups for ${esc(s.retention_daily)} days, weekly backups for ${esc(s.retention_weekly)} weeks, monthly archives for ${esc(s.retention_monthly)} months.</p></div>`;
  }

  function renderGuide() {
    return `
      <div class="backup-card">
        <div class="backup-card-header"><div><h3>Manual Backup Guide</h3><p class="muted">Run these commands locally on your PC. Replace placeholders with your private values.</p></div><button class="btn" type="button" data-backup-action="copy-commands">Copy Commands</button></div>
        <div class="backup-danger-note"><strong>Do not paste passwords or service keys into the ERP frontend.</strong> Keep credentials on your PC, terminal, or secret manager only.</div>
        <pre class="backup-command" id="backupCommandBlock">${esc(backupCommandText())}</pre>
      </div>`;
  }

  function renderContent() {
    if (state.activeTab === 'new-log') return renderNewLog();
    if (state.activeTab === 'history') return renderHistory(false);
    if (state.activeTab === 'settings') return renderSettings();
    if (state.activeTab === 'guide') return renderGuide();
    return renderOverview();
  }

  function render() {
    const root = $('backupCenterRoot');
    if (!root) return;
    if (!isAdmin()) {
      root.innerHTML = `<div class="backup-card"><h3>Restricted</h3><p class="muted">Backup Center is admin-only.</p></div>`;
      return;
    }
    root.innerHTML = `${renderHeader()}${renderContent()}`;
    syncFilters();
  }

  function syncFilters() {
    Object.entries(state.filters).forEach(([key, value]) => {
      const el = document.querySelector(`[data-backup-filter="${key}"]`);
      if (el) el.value = value;
    });
  }

  async function refresh() {
    state.loading = true;
    try { await loadRemote(); }
    finally { state.loading = false; render(); }
  }


  async function getAccessToken() {
    const sb = client();
    if (!sb?.auth?.getSession) return '';
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    return data?.session?.access_token || '';
  }

  function getFileNameFromDisposition(disposition) {
    const value = String(disposition || '');
    const utf = value.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf?.[1]) return decodeURIComponent(utf[1].replace(/"/g, ''));
    const plain = value.match(/filename="?([^";]+)"?/i);
    return plain?.[1] || `InCheck360_ERP_Backup_${today()}.zip`;
  }

  async function downloadOneClickBackup() {
    if (state.oneClickRunning) return;
    if (!isAdmin()) { toast('Backup download is admin-only.'); return; }
    state.oneClickRunning = true;
    render();
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Please sign in again before downloading a backup.');
      const response = await fetch('/api/backup/download', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Backup-Request': 'incheck360-admin'
        },
        body: JSON.stringify({ requested_at: nowIso() })
      });
      if (!response.ok) {
        let message = `Backup download failed (${response.status}).`;
        try {
          const payload = await response.json();
          if (payload?.error) message = payload.error;
        } catch (_) {}
        throw new Error(message);
      }
      const contentType = String(response.headers.get('Content-Type') || '').toLowerCase();
      if (!contentType.includes('application/zip')) throw new Error('Backup service returned an unexpected file type.');
      const checksum = String(response.headers.get('X-Backup-SHA256') || '').trim();
      const blob = await response.blob();
      const fileName = getFileNameFromDisposition(response.headers.get('Content-Disposition'));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(checksum ? `Backup ZIP download started. SHA-256: ${checksum.slice(0, 16)}…` : 'Backup ZIP download started. Store it outside Supabase.');
      setTimeout(() => refresh(), 1200);
    } catch (error) {
      console.error('[BackupCenter] one-click backup failed', error);
      toast(error.message || 'Unable to download backup ZIP.');
    } finally {
      state.oneClickRunning = false;
      render();
    }
  }

  function exportCsv() {
    const rows = filteredLogs();
    const headers = ['Date','Type','Status','File','Location','Size MB','SHA-256','Created By','Created At','Notes'];
    const csvRows = [headers, ...rows.map(row => [
      row.backup_date || '', row.backup_type || '', row.status || '', row.file_name || '', row.storage_location || '', row.file_size_mb || '', row.checksum || '', row.created_by_name || '', row.created_at || '', row.notes || ''
    ])];
    const csv = csvRows.map(cols => cols.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `backup-history-${today()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function downloadGuide() {
    const blob = new Blob([backupCommandText()], { type:'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `incheck360-backup-guide-${today()}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  async function handleSubmitLog(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await insertLog(data);
      toast('Backup log saved.');
      state.activeTab = 'history';
      await refresh();
    } catch (error) {
      console.error('[BackupCenter] save log failed', error);
      toast(`Unable to save backup log: ${error.message || error}`);
    }
  }

  async function handleSubmitSettings(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    state.settings = { ...state.settings, ...data };
    try {
      await upsertSettings();
      saveLocal();
      toast('Backup settings saved.');
      await refresh();
    } catch (error) {
      console.error('[BackupCenter] save settings failed', error);
      toast(`Unable to save settings: ${error.message || error}`);
    }
  }

  function printHistory() {
    document.body.classList.add('backup-print-active');
    window.print();
    setTimeout(() => document.body.classList.remove('backup-print-active'), 300);
  }

  function bindEvents() {
    if (document.body.dataset.backupCenterBound === 'true') return;
    document.body.dataset.backupCenterBound = 'true';

    document.addEventListener('click', async event => {
      const tab = event.target?.closest?.('[data-backup-tab],[data-backup-tab-open]');
      if (tab) {
        state.activeTab = tab.dataset.backupTab || tab.dataset.backupTabOpen || state.activeTab;
        render();
        return;
      }
      const action = event.target?.closest?.('[data-backup-action]')?.dataset.backupAction;
      if (action === 'refresh') { await refresh(); return; }
      if (action === 'clear-filters') { state.filters = { type:'all', status:'all', from:'', to:'', search:'' }; render(); return; }
      if (action === 'export-csv') { exportCsv(); return; }
      if (action === 'print-history') { printHistory(); return; }
      if (action === 'download-guide') { downloadGuide(); return; }
      if (action === 'download-one-click') { await downloadOneClickBackup(); return; }
      if (action === 'copy-commands') {
        try { await navigator.clipboard.writeText(backupCommandText()); toast('Backup commands copied.'); }
        catch { toast('Could not copy commands. You can select and copy manually.'); }
        return;
      }
      const del = event.target?.closest?.('[data-backup-delete]')?.dataset.backupDelete;
      if (del) {
        if (!confirm('Delete this backup log?')) return;
        try { await deleteLog(del); toast('Backup log deleted.'); await refresh(); }
        catch (error) { toast(`Unable to delete backup log: ${error.message || error}`); }
      }
    });

    document.addEventListener('input', event => {
      const key = event.target?.dataset?.backupFilter;
      if (!key) return;
      state.filters[key] = event.target.value || (key === 'type' || key === 'status' ? 'all' : '');
      render();
    });

    document.addEventListener('change', event => {
      const key = event.target?.dataset?.backupFilter;
      if (!key) return;
      state.filters[key] = event.target.value || (key === 'type' || key === 'status' ? 'all' : '');
      render();
    });

    document.addEventListener('submit', event => {
      if (event.target?.id === 'backupLogForm') {
        event.preventDefault();
        handleSubmitLog(event.target);
      }
      if (event.target?.id === 'backupSettingsForm') {
        event.preventDefault();
        handleSubmitSettings(event.target);
      }
    });
  }

  async function init() {
    if (!isAdmin()) { render(); return; }
    bindEvents();
    if (!state.initialized) {
      state.initialized = true;
      await refresh();
    } else {
      render();
    }
  }

  global.BackupCenter = { init, refresh, render, downloadOneClickBackup };
})(window);
