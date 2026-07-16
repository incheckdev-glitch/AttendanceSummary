import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const ADMIN_ROLES = new Set(['admin']);
const DEFAULT_MAX_OBJECTS = 2500;
const DEFAULT_MAX_STORAGE_BYTES = 250 * 1024 * 1024; // 250 MB safety limit for Vercel memory/time.
const DEFAULT_LOCK_SECONDS = 15 * 60;
const DEFAULT_RATE_WINDOW_SECONDS = 5 * 60;
const BACKUP_REQUEST_MARKER = 'incheck360-admin';

function text(value = '') {
  return String(value ?? '').trim();
}

function lower(value = '') {
  return text(value).toLowerCase();
}

function applyNoStoreHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Authorization, Origin');
}

function json(res, status, payload) {
  applyNoStoreHeaders(res);
  res.status(status).json(payload);
}

function extractBearerToken(req) {
  return text(req.headers?.authorization || req.headers?.Authorization).replace(/^Bearer\s+/i, '').trim();
}

function getEnv(...keys) {
  for (const key of keys) {
    const value = text(process.env[key]);
    if (value) return value;
  }
  return '';
}

function getCallerRole(profile) {
  return lower(profile?.role_key || profile?.role || profile?.user_role || profile?.app_role);
}

function parsePositiveInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function getSupabaseProjectRef(supabaseUrl) {
  try {
    const hostname = new URL(supabaseUrl).hostname.toLowerCase();
    const suffix = '.supabase.co';
    if (!hostname.endsWith(suffix)) return '';
    return hostname.slice(0, -suffix.length);
  } catch {
    return '';
  }
}

function validateDeploymentBinding(supabaseUrl) {
  const runtimeEnvironment = lower(process.env.VERCEL_ENV);
  const configuredEnvironment = lower(getEnv('BACKUP_ENVIRONMENT'));
  const expectedProjectRef = lower(getEnv('BACKUP_EXPECTED_PROJECT_REF'));
  const actualProjectRef = lower(getSupabaseProjectRef(supabaseUrl));

  if (!runtimeEnvironment || !configuredEnvironment || runtimeEnvironment !== configuredEnvironment) {
    return { ok: false, status: 503, error: 'Backup environment binding is not configured for this deployment.' };
  }
  if (!expectedProjectRef || !actualProjectRef || expectedProjectRef !== actualProjectRef) {
    return { ok: false, status: 503, error: 'Backup project binding does not match this deployment.' };
  }
  return { ok: true, runtimeEnvironment, projectRef: actualProjectRef };
}

function hasValidRequestMarker(req) {
  return lower(req.headers?.['x-backup-request']) === BACKUP_REQUEST_MARKER;
}

function hasJsonContentType(req) {
  return lower(req.headers?.['content-type']).startsWith('application/json');
}

async function loadProfileByColumn(supabaseAdmin, column, value) {
  const normalized = text(value);
  if (!normalized) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq(column, normalized)
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

async function getCallerProfile(supabaseAdmin, user) {
  if (!user?.id) return null;
  return loadProfileByColumn(supabaseAdmin, 'id', user.id);
}

async function authorize(req, supabaseAdmin) {
  const token = extractBearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'Missing backup authorization. Please sign in again.' };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401, error: 'Invalid backup authorization. Please sign in again.' };

  const profile = await getCallerProfile(supabaseAdmin, data.user);
  if (!profile || profile.is_active !== true) {
    return { ok: false, status: 403, error: 'The active Admin profile could not be verified.' };
  }
  const role = getCallerRole(profile);
  if (!ADMIN_ROLES.has(role)) {
    return { ok: false, status: 403, error: 'Backup download is admin-only.' };
  }

  return { ok: true, type: 'user', userId: data.user.id, email: data.user.email || null, role };
}

async function acquireBackupGuard(supabaseAdmin, auth) {
  const requestId = randomUUID();
  const lockSeconds = parsePositiveInteger(process.env.BACKUP_LOCK_SECONDS, DEFAULT_LOCK_SECONDS, 60, 3600);
  const rateWindowSeconds = parsePositiveInteger(process.env.BACKUP_RATE_WINDOW_SECONDS, DEFAULT_RATE_WINDOW_SECONDS, 30, 3600);
  const { data, error } = await supabaseAdmin.rpc('backup_center_acquire_guard', {
    p_request_id: requestId,
    p_user_id: auth.userId,
    p_lock_seconds: lockSeconds,
    p_rate_window_seconds: rateWindowSeconds
  });
  if (error) throw new Error(`Backup guard unavailable: ${error.message || error}`);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.acquired) {
    return {
      ok: false,
      status: 429,
      retryAfter: Math.max(1, Number(result?.retry_after_seconds || rateWindowSeconds)),
      error: result?.reason === 'backup_in_progress'
        ? 'Another backup is already running.'
        : 'A backup was requested recently. Please try again later.'
    };
  }
  return { ok: true, requestId };
}

async function releaseBackupGuard(supabaseAdmin, requestId) {
  if (!requestId) return;
  const { error } = await supabaseAdmin.rpc('backup_center_release_guard', { p_request_id: requestId });
  if (error) console.warn('[backup/download] Unable to release backup guard', error);
}

function crc32Buffer(buffer) {
  let table = crc32Buffer.table;
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let j = 0; j < 8; j += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c >>> 0;
    }
    crc32Buffer.table = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) crc = table[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function normalizeZipName(name) {
  return text(name).replace(/^\/+/, '').replace(/\\/g, '/').replace(/\.\.(\/|$)/g, '').replace(/[\u0000-\u001f]/g, '_') || 'file';
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = dosDateTime(new Date());
  const flags = 0x0800; // UTF-8 filenames
  const method = 0; // stored, no compression; safer in serverless without native binaries

  for (const file of files) {
    const name = normalizeZipName(file.name);
    const nameBuffer = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data ?? ''), 'utf8');
    const crc = crc32Buffer(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const centralOffset = offset;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

async function arrayBufferFromDownloadPayload(payload) {
  if (!payload) return Buffer.alloc(0);
  if (Buffer.isBuffer(payload)) return payload;
  if (payload instanceof ArrayBuffer) return Buffer.from(payload);
  if (payload?.arrayBuffer) return Buffer.from(await payload.arrayBuffer());
  return Buffer.from(String(payload));
}

async function listBucketFiles(supabaseAdmin, bucketName, prefix = '', state = { count: 0 }) {
  const files = [];
  let offset = 0;
  const limit = 1000;
  const maxObjects = Number(process.env.BACKUP_MAX_STORAGE_OBJECTS || DEFAULT_MAX_OBJECTS);

  while (state.count < maxObjects) {
    const { data, error } = await supabaseAdmin.storage.from(bucketName).list(prefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' }
    });
    if (error) throw new Error(`Storage list failed for ${bucketName}/${prefix}: ${error.message || error}`);
    const items = Array.isArray(data) ? data : [];
    if (!items.length) break;

    for (const item of items) {
      const itemName = text(item.name);
      if (!itemName || itemName === '.emptyFolderPlaceholder') continue;
      const fullPath = prefix ? `${prefix}/${itemName}` : itemName;
      const looksLikeFolder = !item.id && !item.metadata?.size && !/\.[^/]+$/.test(itemName);
      if (looksLikeFolder) {
        files.push(...await listBucketFiles(supabaseAdmin, bucketName, fullPath, state));
      } else {
        files.push({ bucket: bucketName, path: fullPath, size: Number(item.metadata?.size || 0), metadata: item.metadata || null });
        state.count += 1;
        if (state.count >= maxObjects) break;
      }
    }
    if (items.length < limit) break;
    offset += limit;
  }

  return files;
}


async function listStorageObjectsFromMetadata(supabaseAdmin) {
  if (typeof supabaseAdmin.schema !== 'function') {
    throw new Error('Supabase client does not support schema("storage") metadata listing.');
  }

  const maxObjects = Number(process.env.BACKUP_MAX_STORAGE_OBJECTS || DEFAULT_MAX_OBJECTS);
  const limit = 1000;
  let from = 0;
  const objects = [];
  const storageSchema = supabaseAdmin.schema('storage');

  while (objects.length < maxObjects) {
    const to = Math.min(from + limit - 1, maxObjects - 1);
    const { data, error } = await storageSchema
      .from('objects')
      .select('bucket_id,name,metadata,created_at,updated_at,last_accessed_at')
      .order('bucket_id', { ascending: true })
      .order('name', { ascending: true })
      .range(from, to);

    if (error) throw new Error(`Storage metadata list failed: ${error.message || error}`);
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) break;

    for (const row of rows) {
      const bucket = text(row.bucket_id);
      const path = text(row.name);
      if (!bucket || !path || path.endsWith('/.emptyFolderPlaceholder') || path === '.emptyFolderPlaceholder') continue;
      objects.push({
        bucket,
        path,
        size: Number(row.metadata?.size || row.metadata?.contentLength || 0),
        metadata: row.metadata || null,
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        last_accessed_at: row.last_accessed_at || null
      });
      if (objects.length >= maxObjects) break;
    }

    if (rows.length < limit) break;
    from += limit;
  }

  return objects;
}

function groupStorageObjectsByBucket(objects) {
  const grouped = new Map();
  for (const object of objects || []) {
    const bucket = text(object.bucket);
    if (!bucket) continue;
    if (!grouped.has(bucket)) grouped.set(bucket, []);
    grouped.get(bucket).push(object);
  }
  return grouped;
}

async function exportStorageFiles(supabaseAdmin, manifest) {
  const zipFiles = [];
  const maxBytes = Number(process.env.BACKUP_MAX_STORAGE_BYTES || DEFAULT_MAX_STORAGE_BYTES);
  let totalBytes = 0;
  const skipped = [];

  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  if (error) throw new Error(`Unable to list Storage buckets: ${error.message || error}`);

  const bucketMap = new Map();
  for (const bucket of buckets || []) {
    const bucketName = text(bucket.name || bucket.id);
    if (bucketName) bucketMap.set(bucketName, bucket);
  }

  let groupedFiles = new Map();
  try {
    const metadataObjects = await listStorageObjectsFromMetadata(supabaseAdmin);
    groupedFiles = groupStorageObjectsByBucket(metadataObjects);
    manifest.storage.list_mode = 'storage.objects metadata';
    manifest.storage.inventory = metadataObjects.map(item => ({
      bucket: item.bucket,
      path: item.path,
      size: item.size,
      created_at: item.created_at,
      updated_at: item.updated_at
    }));
  } catch (metadataError) {
    manifest.storage.list_mode = 'Storage API recursive fallback';
    manifest.storage.metadata_list_error = metadataError.message || String(metadataError);
    for (const bucket of buckets || []) {
      const bucketName = text(bucket.name || bucket.id);
      if (!bucketName) continue;
      try {
        groupedFiles.set(bucketName, await listBucketFiles(supabaseAdmin, bucketName));
      } catch (error) {
        skipped.push({ bucket: bucketName, reason: error.message || String(error) });
      }
    }
  }

  for (const [bucketName, files] of groupedFiles.entries()) {
    if (!bucketMap.has(bucketName)) bucketMap.set(bucketName, { name: bucketName, public: null });
  }

  for (const [bucketName, bucket] of bucketMap.entries()) {
    const files = groupedFiles.get(bucketName) || [];
    manifest.storage.buckets.push({ bucket: bucketName, file_count: files.length, public: Boolean(bucket.public) });

    for (const file of files) {
      if (totalBytes + Number(file.size || 0) > maxBytes) {
        skipped.push({ bucket: bucketName, path: file.path, size: file.size, reason: `Skipped because BACKUP_MAX_STORAGE_BYTES limit ${maxBytes} was reached.` });
        continue;
      }
      try {
        const { data, error: downloadError } = await supabaseAdmin.storage.from(bucketName).download(file.path);
        if (downloadError) throw downloadError;
        const buffer = await arrayBufferFromDownloadPayload(data);
        totalBytes += buffer.length;
        zipFiles.push({ name: `storage/${bucketName}/${file.path}`, data: buffer });
        manifest.storage.files.push({ bucket: bucketName, path: file.path, size: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') });
      } catch (downloadError) {
        skipped.push({ bucket: bucketName, path: file.path, reason: downloadError.message || String(downloadError) });
      }
    }
  }

  zipFiles.push({ name: 'storage/storage_inventory.json', data: JSON.stringify(manifest.storage.inventory || manifest.storage.files || [], null, 2) });
  manifest.storage.total_file_bytes = totalBytes;
  manifest.storage.skipped = skipped;
  return zipFiles;
}

async function insertBackupLog(supabaseAdmin, auth, fileName, zipBytes, checksum, manifest) {
  try {
    await supabaseAdmin.from('backup_logs').insert({
      backup_type: 'full',
      backup_scope: 'one_click_database_json_plus_storage',
      status: manifest.storage.skipped?.length ? 'partial' : 'success',
      backup_date: new Date().toISOString().slice(0, 10),
      started_at: manifest.started_at,
      finished_at: manifest.finished_at,
      file_name: fileName,
      file_size_mb: Number((zipBytes / 1024 / 1024).toFixed(2)),
      checksum,
      storage_location: 'Downloaded from Backup Center one-click button',
      notes: manifest.storage.skipped?.length
        ? `One-click backup completed with ${manifest.storage.skipped.length} skipped storage item(s). Check manifest.`
        : 'One-click backup downloaded from Backup Center.',
      created_by: auth.userId || null,
      created_by_name: auth.email || auth.userId || 'Admin'
    });
  } catch (error) {
    console.warn('[backup/download] Unable to insert backup log', error);
  }
}

export default async function handler(req, res) {
  applyNoStoreHeaders(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }
  if (!hasValidRequestMarker(req)) {
    return json(res, 400, { ok: false, error: 'Invalid backup request.' });
  }
  if (!hasJsonContentType(req)) {
    return json(res, 415, { ok: false, error: 'Backup requests must use application/json.' });
  }

  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json(res, 503, { ok: false, error: 'Backup service is not configured.' });
  }

  const deployment = validateDeploymentBinding(supabaseUrl);
  if (!deployment.ok) return json(res, deployment.status, { ok: false, error: deployment.error });

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const auth = await authorize(req, supabaseAdmin).catch(error => {
    console.warn('[backup/download] Authorization failed', error);
    return { ok: false, status: 401, error: 'Unable to verify backup authorization.' };
  });
  if (!auth?.ok) return json(res, auth?.status || 401, { ok: false, error: auth?.error || 'Unauthorized.' });

  let guard = null;
  try {
    guard = await acquireBackupGuard(supabaseAdmin, auth);
  } catch (error) {
    console.error('[backup/download] Backup guard failed', error);
    return json(res, 503, { ok: false, error: 'Backup protection is not available. Apply the latest backup security migration.' });
  }
  if (!guard?.ok) {
    res.setHeader('Retry-After', String(guard.retryAfter || 60));
    return json(res, guard.status || 429, { ok: false, error: guard.error || 'Backup request is temporarily limited.' });
  }

  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `InCheck360_ERP_Backup_${stamp}.zip`;

  try {
    const { data: databaseExport, error: dbError } = await supabaseAdmin.rpc('backup_center_export_public_data');
    if (dbError) throw new Error(`Database export RPC failed: ${dbError.message || dbError}`);

    const databaseJson = Buffer.from(JSON.stringify(databaseExport || {}, null, 2), 'utf8');
    const manifest = {
      app: 'InCheck360 ERP',
      backup_type: 'one_click_database_json_plus_storage',
      generated_at: new Date().toISOString(),
      started_at: startedAt,
      finished_at: null,
      generated_by: auth.email || auth.userId || auth.type,
      deployment: {
        environment: deployment.runtimeEnvironment,
        project_ref: deployment.projectRef
      },
      integrity: {
        algorithm: 'sha256',
        database_export_sha256: createHash('sha256').update(databaseJson).digest('hex'),
        zip_checksum_delivery: 'X-Backup-SHA256 response header and backup_logs.checksum'
      },
      notes: [
        'This one-click backup includes public ERP table data as JSON plus Supabase Storage bucket files.',
        'It is not a pg_dump replacement for roles, RLS policies, functions, or extensions. Keep manual CLI backups for full disaster recovery.',
        'Storage files are listed from storage.objects metadata first, so proposal/agreement buckets include all object paths instead of only the latest document path saved in public tables.'
      ],
      database: {
        format: 'json',
        source: 'public.backup_center_export_public_data()'
      },
      storage: {
        max_bytes: Number(process.env.BACKUP_MAX_STORAGE_BYTES || DEFAULT_MAX_STORAGE_BYTES),
        buckets: [],
        files: [],
        skipped: [],
        total_file_bytes: 0
      }
    };

    const files = [
      { name: 'README_BACKUP.txt', data: manifest.notes.join('\n') + '\n' },
      { name: 'database/public_tables.json', data: databaseJson }
    ];

    const storageFiles = await exportStorageFiles(supabaseAdmin, manifest);
    files.push(...storageFiles);

    manifest.finished_at = new Date().toISOString();
    files.push({ name: 'backup_manifest.json', data: JSON.stringify(manifest, null, 2) });

    const zip = createZip(files);
    const checksum = createHash('sha256').update(zip).digest('hex');
    await insertBackupLog(supabaseAdmin, auth, fileName, zip.length, checksum, manifest);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(zip.length));
    res.setHeader('X-Backup-SHA256', checksum);
    res.setHeader('X-Backup-Environment', deployment.runtimeEnvironment);
    return res.status(200).send(zip);
  } catch (error) {
    console.error('[backup/download] Backup failed', error);
    try {
      await supabaseAdmin.from('backup_logs').insert({
        backup_type: 'full',
        backup_scope: 'one_click_database_json_plus_storage',
        status: 'failed',
        backup_date: new Date().toISOString().slice(0, 10),
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        file_name: fileName,
        storage_location: 'Backup Center one-click button',
        notes: error.message || String(error),
        created_by: auth.userId || null,
        created_by_name: auth.email || auth.userId || 'Admin'
      });
    } catch (_) {}
    return json(res, 500, { ok: false, error: 'Backup failed. Review the server logs and Backup Center history.' });
  } finally {
    await releaseBackupGuard(supabaseAdmin, guard?.requestId);
  }
}
