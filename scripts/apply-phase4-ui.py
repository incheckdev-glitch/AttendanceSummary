from pathlib import Path

path = Path('backup-center.js')
text = path.read_text()

def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    text = text.replace(old, new, 1)

replace_once(
'''        ${visibleRows.length ? `<div class="backup-table-wrap backup-print-area"><table class="backup-table"><thead><tr><th>Date</th><th>Type</th><th>Status</th><th>File</th><th>Location</th><th>Size</th><th>Created By</th><th>Created At</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${visibleRows.map(row => `<tr>
          <td>${fmtDate(row.backup_date || row.created_at)}</td>
          <td>${esc(row.backup_type || '')}</td>
          <td>${statusBadge(row.status)}</td>
          <td>${esc(row.file_name || '—')}</td>
          <td>${esc(row.storage_location || '—')}</td>
          <td>${num(row.file_size_mb).toLocaleString(undefined, { maximumFractionDigits:2 })} MB</td>
          <td>${esc(row.created_by_name || '—')}</td>''',
'''        ${visibleRows.length ? `<div class="backup-table-wrap backup-print-area"><table class="backup-table"><thead><tr><th>Date</th><th>Type</th><th>Status</th><th>File</th><th>Location</th><th>Size</th><th>Checksum</th><th>Created By</th><th>Created At</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${visibleRows.map(row => `<tr>
          <td>${fmtDate(row.backup_date || row.created_at)}</td>
          <td>${esc(row.backup_type || '')}</td>
          <td>${statusBadge(row.status)}</td>
          <td>${esc(row.file_name || '—')}</td>
          <td>${esc(row.storage_location || '—')}</td>
          <td>${num(row.file_size_mb).toLocaleString(undefined, { maximumFractionDigits:2 })} MB</td>
          <td><code title="${esc(row.checksum || '')}">${row.checksum ? esc(String(row.checksum).slice(0, 16)) + '…' : '—'}</code></td>
          <td>${esc(row.created_by_name || '—')}</td>''',
'backup history checksum column')

replace_once(
'''      const response = await fetch('/api/backup/download', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });''',
'''      const response = await fetch('/api/backup/download', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Backup-Request': 'incheck360-admin'
        },
        body: JSON.stringify({ requested_at: nowIso() })
      });''',
'secure backup request')

replace_once(
'''      const blob = await response.blob();''',
'''      const contentType = String(response.headers.get('Content-Type') || '').toLowerCase();
      if (!contentType.includes('application/zip')) throw new Error('Backup service returned an unexpected file type.');
      const checksum = String(response.headers.get('X-Backup-SHA256') || '').trim();
      const blob = await response.blob();''',
'backup response validation')

replace_once(
'''      toast('Backup ZIP download started. Store it outside Supabase.');''',
'''      toast(checksum ? `Backup ZIP download started. SHA-256: ${checksum.slice(0, 16)}…` : 'Backup ZIP download started. Store it outside Supabase.');''',
'backup checksum toast')

replace_once(
'''    const headers = ['Date','Type','Status','File','Location','Size MB','Created By','Created At','Notes'];
    const csvRows = [headers, ...rows.map(row => [
      row.backup_date || '', row.backup_type || '', row.status || '', row.file_name || '', row.storage_location || '', row.file_size_mb || '', row.created_by_name || '', row.created_at || '', row.notes || ''
    ])];''',
'''    const headers = ['Date','Type','Status','File','Location','Size MB','SHA-256','Created By','Created At','Notes'];
    const csvRows = [headers, ...rows.map(row => [
      row.backup_date || '', row.backup_type || '', row.status || '', row.file_name || '', row.storage_location || '', row.file_size_mb || '', row.checksum || '', row.created_by_name || '', row.created_at || '', row.notes || ''
    ])];''',
'backup CSV checksum')

path.write_text(text)
