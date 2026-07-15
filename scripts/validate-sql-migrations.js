const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migrationsRoot = path.join(root, 'sql', 'migrations');

function collectSqlFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSqlFiles(absolutePath);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.sql') ? [absolutePath] : [];
  }).sort();
}

const files = collectSqlFiles(migrationsRoot);
const errors = [];
const warnings = [];

for (const absolutePath of files) {
  const relativePath = path.relative(root, absolutePath).replace(/\\/g, '/');
  const fileName = path.basename(absolutePath);
  const sql = fs.readFileSync(absolutePath, 'utf8');
  const normalized = sql.trim();

  if (!normalized) errors.push(`${relativePath}: migration is empty.`);
  if (/^(<<<<<<<|=======|>>>>>>>)/m.test(sql)) errors.push(`${relativePath}: unresolved merge-conflict marker found.`);
  if (sql.includes('\u0000')) errors.push(`${relativePath}: NUL byte found.`);
  if (!/^\d{8}_[a-z0-9][a-z0-9_-]*\.sql$/i.test(fileName)) {
    warnings.push(`${relativePath}: use YYYYMMDD_description.sql naming for new migrations.`);
  }

  const destructivePatterns = [
    { regex: /\bdrop\s+table\b/i, label: 'DROP TABLE' },
    { regex: /\btruncate\b/i, label: 'TRUNCATE' },
    { regex: /\bdelete\s+from\b/i, label: 'DELETE FROM' }
  ];
  for (const pattern of destructivePatterns) {
    if (pattern.regex.test(sql)) warnings.push(`${relativePath}: contains ${pattern.label}; confirm backup and rollback steps in the PR.`);
  }

  if (/postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i.test(sql)) {
    errors.push(`${relativePath}: possible database credentials embedded in migration.`);
  }
  if (/SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/i.test(sql)) {
    errors.push(`${relativePath}: possible service-role key embedded in migration.`);
  }
}

for (const warning of warnings) console.warn(`WARNING: ${warning}`);

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log(`SQL migration safety validation passed for ${files.length} migration file(s) with ${warnings.length} warning(s).`);
