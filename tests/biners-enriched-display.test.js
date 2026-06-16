const assert = require('assert');
const fs = require('fs');

const frontend = fs.readFileSync('biners.js', 'utf8');
const api = fs.readFileSync('api.js', 'utf8');
const data = fs.readFileSync('supabase-data.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

assert.match(data, /binersAction === 'list_schedules' \|\| binersAction === 'list_forecast'[\s\S]*from\('biners_payment_schedules'\)/, 'schedule and forecast lists must read Biners payment schedules directly');
assert.match(data, /remaining_amount: Math\.max\(0, number\(row\.scheduled_amount\) - number\(row\.paid_amount\)\)/, 'forecast rows must calculate remaining amounts in the frontend/data layer');
assert.match(data, /payload\?\.schedule_id[\s\S]*\.eq\('id', payload\.schedule_id\)/, 'schedule rows must support schedule lookup');
assert.match(data, /payload\?\.biners_entry_id[\s\S]*\.eq\('biners_entry_id', payload\.biners_entry_id\)/, 'schedule rows must support entry-related lookup');
['getBinersForecastRows', 'getBinersScheduleRows', 'getBinersMonthlyForecastDetails'].forEach(name => assert(api.includes(`${name}(`), `missing API helper ${name}`));
['clientLabel', 'locationLabel', 'moduleLabel', 'licenseLabel', 'timingLabel', 'loadDrawer'].forEach(name => assert(frontend.includes(`${name}(`), `missing enriched display helper ${name}`));
assert(frontend.includes('Entry level / All locations'), 'missing entry-level location fallback');
assert.match(frontend, /miniTable\('Scheduled payments'[\s\S]*\['Client'[\s\S]*\['Entry #'[\s\S]*\['Location'[\s\S]*\['Module'[\s\S]*\['License'/, 'drawer schedule table must render enriched fields');
['binersPaymentLocation', 'binersPaymentModule', 'binersPaymentDueDate'].forEach(id => assert(html.includes(`id="${id}"`), `record payment form missing ${id}`));
console.log('Biners enriched display checks passed.');
