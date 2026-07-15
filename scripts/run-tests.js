const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

// Keep the established ERP regression order while allowing every test to run,
// even when an earlier test fails. This gives one complete failure report in CI.
const tests = [
  'tests/client-panel-signed-base.test.js',
  'tests/communication-direct-create.test.js',
  'tests/communication-notifications-read.test.js',
  'tests/contact-option-save-shortcut.test.js',
  'tests/contact-uuid-resolution.test.js',
  'tests/contact-company-dropdown.test.js',
  'tests/company-options-freshness.test.js',
  'tests/csm-activity-notes.test.js',
  'tests/proposal-approval-logic.test.js',
  'tests/proposal-default-terms.test.js',
  'tests/payment-forecast-rpc.test.js',
  'tests/payment-forecast-footer.test.js',
  'tests/credit-notes-idempotency-preview.test.js',
  'tests/credit-note-invoice-options-rpc.test.js',
  'tests/statement-of-account-preview.test.js',
  'tests/payment-forecast-drilldown.test.js',
  'tests/biners-enriched-display.test.js',
  'tests/biners-scheduled-payments-direct.test.js',
  'tests/biners-client-source.test.js',
  'tests/biners-entry-save.test.js',
  'tests/lifecycle-status-history.test.js',
  'tests/lifecycle-metrics.test.js',
  'tests/proposal-customer-integrity.test.js',
  'tests/relationship-uuid-integrity.test.js',
  'tests/invoice-payment-schedule-anchor.test.js',
  'tests/create-invoice-gate.test.js',
  'tests/renewal-no-needed.test.js',
  'tests/monthly-renewal-admin-access.test.js',
  'tests/renewal-forecast.test.js',
  'tests/technical-admin-ui-removal.test.js',
  'tests/agreement-preview-totals.test.js',
  'tests/eproposal-public-totals.test.js',
  'tests/agreement-conversion-terms.test.js',
  'tests/phase2-data-integrity.test.js',
  'tests/phase3-auth-permissions.test.js'
];

const failures = [];
const startedAt = Date.now();

for (const test of tests) {
  const testStartedAt = Date.now();
  process.stdout.write(`\n=== ${test} ===\n`);
  const result = spawnSync(process.execPath, [test], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: 'inherit'
  });

  const durationMs = Date.now() - testStartedAt;
  if (result.error || result.status !== 0) {
    failures.push({
      test,
      status: result.status,
      signal: result.signal || null,
      error: result.error ? result.error.message : null,
      durationMs
    });
  }
}

const totalMs = Date.now() - startedAt;
process.stdout.write(`\nExecuted ${tests.length} regression tests in ${(totalMs / 1000).toFixed(2)}s.\n`);

if (failures.length) {
  process.stderr.write(`\n${failures.length} test(s) failed:\n`);
  for (const failure of failures) {
    const details = [
      failure.status !== null ? `exit ${failure.status}` : null,
      failure.signal ? `signal ${failure.signal}` : null,
      failure.error
    ].filter(Boolean).join(', ');
    process.stderr.write(`- ${failure.test}${details ? ` (${details})` : ''}\n`);
  }
  process.exit(1);
}

process.stdout.write('All ERP regression tests passed.\n');
