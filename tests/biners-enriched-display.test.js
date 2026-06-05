const assert = require('assert');
const fs = require('fs');

const frontend = fs.readFileSync('biners.js', 'utf8');
const api = fs.readFileSync('api.js', 'utf8');
const data = fs.readFileSync('supabase-data.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

assert.match(data, /binersAction === 'list_schedules' \|\| binersAction === 'list_forecast'[\s\S]*from\('biners_forecast_rows'\)/, 'schedule display lists must use enriched forecast rows');
assert.doesNotMatch(data, /binersAction === 'list_schedules'[\s\S]{0,200}from\('biners_payment_schedules'\)/, 'scheduled payments display must not use raw schedules');
assert.match(data, /payload\?\.schedule_id[\s\S]*\.eq\('schedule_id', payload\.schedule_id\)/, 'forecast rows must support schedule lookup');
assert.match(data, /payload\?\.biners_entry_id[\s\S]*\.eq\('biners_entry_id', payload\.biners_entry_id\)/, 'forecast rows must support entry-related lookup');
['getBinersForecastRows', 'getBinersScheduleRows', 'getBinersMonthlyForecastDetails'].forEach(name => assert(api.includes(`${name}(`), `missing API helper ${name}`));
['clientLabel', 'locationLabel', 'moduleLabel', 'licenseLabel', 'timingLabel', 'loadDrawer'].forEach(name => assert(frontend.includes(`${name}(`), `missing enriched display helper ${name}`));
assert(frontend.includes('Entry level / All locations'), 'missing entry-level location fallback');
assert.match(frontend, /miniTable\('Scheduled payments'[\s\S]*\['Client'[\s\S]*\['Entry #'[\s\S]*\['Location'[\s\S]*\['Module'[\s\S]*\['License'/, 'drawer schedule table must render enriched fields');
['binersPaymentLocation', 'binersPaymentModule', 'binersPaymentDueDate'].forEach(id => assert(html.includes(`id="${id}"`), `record payment form missing ${id}`));
console.log('Biners enriched display checks passed.');
