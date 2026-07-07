import { createClient } from '@supabase/supabase-js';

const ADMIN_ROLES = new Set(['admin', 'administrator', 'super_admin']);
const DEFAULT_MAX_OBJECTS = 2500;
const DEFAULT_MAX_STORAGE_BYTES = 250 * 1024 * 1024; // 250 MB safety limit for Vercel memory/time.

function text(value = '') {
  return String(value ?? '').trim();
}

function lower(value = '') {
  return text(value).toLowerCase();
}

function json(res, status, payload) {
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

function getCallerRole(profile, user) {
  return lower(
    profile?.role_key ||
      profile?.role ||
      profile?.user_role ||
      profile?.app_role ||
      user?.app_metadata?.role_key ||
      user?.app_metadata?.role ||
      user?.user_metadata?.role_key ||
      user?.user_metadata?.role
  );
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
  if (!user?.id && !user?.email) return null;
  return (
    (await loadProfileByColumn(supabaseAdmin, 'id', user.id)) ||
    (await loadProfileByColumn(supabaseAdmin, 'auth_user_id', user.id)) ||
    (await loadProfileByColumn(supabaseAdmin, 'user_id', user.id)) ||
    (await loadProfileByColumn(supabaseAdmin, 'email', user.email)) ||
    null
  );
}

async function authorize(req, supabaseAdmin) {
  const configuredSecret = getEnv('BACKUP_CENTER_SECRET', 'ADMIN_BACKUP_SECRET');
  const providedSecret = text(req.headers?.['x-backup-secret'] || req.query?.secret);
  if (configuredSecret && providedSecret && providedSecret === configuredSecret) {
    return { ok: true, type: 'secret', role: 'admin' };
  }

  const token = extractBearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'Missing backup authorization. Please sign in again.' };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401, error: 'Invalid backup authorization. Please sign in again.' };

  const profile = await getCallerProfile(supabaseAdmin, data.user);
  const role = getCallerRole(profile, data.user);
  if (!ADMIN_ROLES.has(role)) {
    return { ok: false, status: 403, error: 'Backup download is admin-only.' };
  }

  return { ok: true, type: 'user', userId: data.user.id, email: data.user.email || null, role };
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

async function exportStorageFiles(supabaseAdmin, manifest) {
  const zipFiles = [];
  const maxBytes = Number(process.env.BACKUP_MAX_STORAGE_BYTES || DEFAULT_MAX_STORAGE_BYTES);
  let totalBytes = 0;
  const skipped = [];

  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  if (error) throw new Error(`Unable to list Storage buckets: ${error.message || error}`);

  for (const bucket of buckets || []) {
    const bucketName = text(bucket.name || bucket.id);
    if (!bucketName) continue;
    let files = [];
    try {
      files = await listBucketFiles(supabaseAdmin, bucketName);
    } catch (error) {
      skipped.push({ bucket: bucketName, reason: error.message || String(error) });
      continue;
    }

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
        manifest.storage.files.push({ bucket: bucketName, path: file.path, size: buffer.length });
      } catch (downloadError) {
        skipped.push({ bucket: bucketName, path: file.path, reason: downloadError.message || String(downloadError) });
      }
    }
  }

  manifest.storage.total_file_bytes = totalBytes;
  manifest.storage.skipped = skipped;
  return zipFiles;
}

async function insertBackupLog(supabaseAdmin, auth, fileName, zipBytes, manifest) {
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
      storage_location: 'Downloaded from Backup Center one-click button',
      notes: manifest.storage.skipped?.length
        ? `One-click backup completed with ${manifest.storage.skipped.length} skipped storage item(s). Check manifest.`
        : 'One-click backup downloaded from Backup Center.',
      created_by_name: auth.email || auth.userId || 'Admin'
    });
  } catch (error) {
    console.warn('[backup/download] Unable to insert backup log', error);
  }
}

export default async function handler(req, res) {
  if (!['POST', 'GET'].includes(req.method)) {
    res.setHeader('Allow', 'POST, GET');
    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const supabaseUrl = getEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json(res, 500, { ok: false, error: 'Missing Vercel env vars SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const auth = await authorize(req, supabaseAdmin).catch(error => ({ ok: false, status: 401, error: error.message || String(error) }));
  if (!auth?.ok) return json(res, auth?.status || 401, { ok: false, error: auth?.error || 'Unauthorized.' });

  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `InCheck360_ERP_Backup_${stamp}.zip`;

  try {
    const { data: databaseExport, error: dbError } = await supabaseAdmin.rpc('backup_center_export_public_data');
    if (dbError) throw new Error(`Database export RPC failed: ${dbError.message || dbError}`);

    const manifest = {
      app: 'InCheck360 ERP',
      backup_type: 'one_click_database_json_plus_storage',
      generated_at: new Date().toISOString(),
      started_at: startedAt,
      finished_at: null,
      generated_by: auth.email || auth.userId || auth.type,
      notes: [
        'This one-click backup includes public ERP table data as JSON plus Supabase Storage bucket files.',
        'It is not a pg_dump replacement for roles, RLS policies, functions, or extensions. Keep manual CLI backups for full disaster recovery.'
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
      { name: 'database/public_tables.json', data: JSON.stringify(databaseExport || {}, null, 2) }
    ];

    const storageFiles = await exportStorageFiles(supabaseAdmin, manifest);
    files.push(...storageFiles);

    manifest.finished_at = new Date().toISOString();
    files.push({ name: 'backup_manifest.json', data: JSON.stringify(manifest, null, 2) });

    const zip = createZip(files);
    await insertBackupLog(supabaseAdmin, auth, fileName, zip.length, manifest);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', String(zip.length));
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
        created_by_name: auth.email || auth.userId || 'Admin'
      });
    } catch (_) {}
    return json(res, 500, { ok: false, error: error.message || 'Backup failed.' });
  }
}
