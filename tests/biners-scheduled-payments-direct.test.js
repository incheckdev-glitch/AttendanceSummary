const assert = require('assert');
const fs = require('fs');

const frontend = fs.readFileSync('biners.js', 'utf8');

assert.match(
  frontend,
  /async function loadBinersScheduledPayments\(\)[\s\S]*\.from\('biners_payment_schedules'\)[\s\S]*\.select\('\*'\)[\s\S]*\.order\('due_date', \{ ascending: true \}\)[\s\S]*\.order\('schedule_no', \{ ascending: true \}\)/,
  'Scheduled Payments tab must load rows directly from biners_payment_schedules ordered by due date and schedule number.'
);

assert.match(
  frontend,
  /function filteredScheduledPaymentRows\(\)[\s\S]*state\.schedules[\s\S]*row\.entry_number[\s\S]*row\.client_name[\s\S]*rowStatus[\s\S]*matchesStatus[\s\S]*matchesPaymentStatus[\s\S]*matchesCurrency/,
  'Scheduled Payments table must filter the same scheduled rows source used for rendering.'
);

assert.match(
  frontend,
  /function calculateSummary\(\) \{\s*const rows = state\.schedules;[\s\S]*gross_payable: rows\.reduce[\s\S]*remaining_payable: rows\.reduce[\s\S]*overdue_amount: rows\.filter/,
  'Summary cards must calculate payable totals from scheduled payment rows.'
);

assert.doesNotMatch(
  frontend,
  /schedules: normalizedSchedules\.length \? normalizedSchedules : \(schedulesLoaded \? fallbackForecast : \[\]\)/,
  'Scheduled Payments must not fall back to generated Biners entry rows.'
);
