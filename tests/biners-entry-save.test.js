const assert = require('assert');
const fs = require('fs');

const frontend = fs.readFileSync('biners.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const dataLayer = fs.readFileSync('supabase-data.js', 'utf8');

assert.match(html, /<form id="binersEntryForm"[^>]*novalidate>/, 'Biners entry form must route validation through visible custom feedback');
assert.match(html, /id="binersSaveEntryBtn"[^>]*type="submit"/, 'Save Entry must submit the Biners entry form');
assert.match(html, /id="binersEntryErrorBanner"[^>]*role="alert"/, 'Biners entry form must have a visible error banner');
assert.match(frontend, /binersEntryForm'\)\?\.addEventListener\('submit', e => saveEntry\(e\)/, 'Biners entry form submit handler is not wired');
assert.match(frontend, /state\.savingEntry[\s\S]*btn\.disabled = true; btn\.textContent = 'Saving\.\.\.'/, 'Biners save must prevent duplicate submissions and display loading state');
assert.match(frontend, /validateEntry\(\)[\s\S]*'Client is required\.'[\s\S]*'At least one related location name is required\.'/, 'Existing-client validation must provide visible required-field messages');
assert.match(frontend, /Access denied\. You do not have permission to create Biners entries\./, 'Biners permission errors must be surfaced');
assert.match(frontend, /function showEntrySaveError[\s\S]*banner\.textContent = message[\s\S]*toast\(message\)/, 'Biners save failures must be surfaced in the form and toast');
assert.match(frontend, /withTimeout\(request\('create', payload\)\)[\s\S]*withTimeout\(refresh\(\)[\s\S]*Biners entry created successfully\./, 'Successful Biners save must persist with timeout protection, refresh, and show success feedback');
assert.match(frontend, /state\.entries = \[result[\s\S]*if \(!state\.entries\.some[\s\S]*render\(\)/, 'A newly created entry must remain visible even when refresh data is delayed or stale');
assert.match(frontend, /startDate\.getUTCMonth\(\) \+ months \+ 1[\s\S]*end\.setUTCDate\(end\.getUTCDate\(\) - 1\)/, 'Service End must calculate as Service Start plus license months minus one day');
assert.match(frontend, /binersNumberOfLocations'[\s\S]*binersCostPerLocation'[\s\S]*binersLicenseLengthMonths'[\s\S]*\/ 12/, 'Total payable must use locations times annual cost times license months divided by 12');
assert.match(frontend, /function buildBinersEntryPayload[\s\S]*client_id: clientId[\s\S]*module: form\.module[\s\S]*license: form\.license/, 'Biners entries must be built from explicit stable payload fields.');
assert.match(frontend, /function buildBinersSchedulePayload[\s\S]*scheduled_amount: toNumber\(amount\)[\s\S]*paid_amount: 0[\s\S]*status: 'upcoming'/, 'Biners schedules must be built from explicit stable payload fields.');
assert.doesNotMatch(frontend, /remaining_amount:\s*scheduledAmount|module_name:\s*moduleName|license_type:\s*licenseType/, 'Biners create payloads must not insert generated or legacy schedule columns.');
assert.match(frontend, /isDevelopment\(\)\) console\.log\('Biners Save Clicked'/, 'Save click debug logging must be development-only');
assert.match(frontend, /const SAVE_TIMEOUT_MS = 20000/, 'Biners save requests must time out instead of loading forever');
assert.match(frontend, /if \(!result\) throw new Error\('No result returned while creating the Biners entry\.'\)/, 'Biners saves must reject empty create results');
assert.match(frontend, /isDevelopment\(\)\) console\.log\('Biners Save Payload'/, 'Save payload debug logging must be development-only');
assert.match(frontend, /isDevelopment\(\)\) console\.log\('Biners Save Success'/, 'Save success debug logging must be development-only');
assert.match(frontend, /isDevelopment\(\)\) console\.error\('Biners Save Error'/, 'Save error debug logging must be development-only');
assert.match(dataLayer, /if \(!locations\.length[\s\S]*at least one related location name is required/, 'The create data layer must reject entries without related locations before inserting');
assert.match(dataLayer, /const allowedSchedule = \['schedule_key','biners_entry_id','entry_number','client_id','client_reference','client_name','location_id','location_name','location_reference','module','license','due_date','scheduled_amount','paid_amount','status','notes'\]/, 'The create data layer must allow only stable schedule insert fields.');
assert.doesNotMatch(dataLayer, /remaining_amount[\s\S]{0,80}insert|module_name[\s\S]{0,80}insert|license_type[\s\S]{0,80}insert/, 'The create data layer must not insert generated or legacy schedule fields.');

console.log('Biners entry save checks passed.');
