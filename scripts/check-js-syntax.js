const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const includedDirectories = new Set(['tests', 'scripts']);
const skippedDirectories = new Set(['.git', 'node_modules', 'api', 'src', 'supabase']);

function collectClassicJavaScriptFiles(directory, relativeDirectory = '') {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory.replace(/\\/g, '/'), entry.name);
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (skippedDirectories.has(entry.name)) continue;
      if (!relativeDirectory && !includedDirectories.has(entry.name)) continue;
      files.push(...collectClassicJavaScriptFiles(absolutePath, relativePath));
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    if (!relativeDirectory || includedDirectories.has(relativeDirectory.split('/')[0])) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

const files = collectClassicJavaScriptFiles(root);
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

console.log(`JavaScript syntax validation passed for ${files.length} classic scripts and tests.`);
