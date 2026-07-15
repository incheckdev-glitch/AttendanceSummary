const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function collectJavaScriptFiles(directory, relativeDirectory = '') {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.posix.join(relativeDirectory.replace(/\\/g, '/'), entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJavaScriptFiles(absolutePath, relativePath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(relativePath);
    }
  }
  return files;
}

function classicBrowserEntrypoints() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const files = [];
  const scriptTag = /<script\b([^>]*)>/gi;
  let match;
  while ((match = scriptTag.exec(html))) {
    const attributes = match[1] || '';
    if (/\btype\s*=\s*["']module["']/i.test(attributes)) continue;
    const srcMatch = attributes.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch) continue;
    const rawSrc = srcMatch[1].split(/[?#]/)[0];
    if (!rawSrc.startsWith('/') || rawSrc.startsWith('//')) continue;
    const relativePath = decodeURIComponent(rawSrc.replace(/^\/+/, ''));
    if (!relativePath.endsWith('.js')) continue;
    if (fs.existsSync(path.join(root, relativePath))) files.push(relativePath);
  }
  if (fs.existsSync(path.join(root, 'service-worker.js'))) files.push('service-worker.js');
  return files;
}

const files = [...new Set([
  ...classicBrowserEntrypoints(),
  ...collectJavaScriptFiles(path.join(root, 'tests'), 'tests'),
  ...collectJavaScriptFiles(path.join(root, 'scripts'), 'scripts')
])].sort();

const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: root,
    encoding: 'utf8'
  });
  if (result.status !== 0 || result.error) {
    failures.push({
      file,
      output: [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n').trim()
    });
  }
}

if (failures.length) {
  console.error(`JavaScript syntax validation failed for ${failures.length} file(s):`);
  for (const failure of failures) {
    console.error(`\n--- ${failure.file} ---`);
    console.error(failure.output || 'Unknown syntax-check failure.');
  }
  process.exit(1);
}

console.log(`JavaScript syntax validation passed for ${files.length} deployed classic scripts, tests, and safety scripts.`);
