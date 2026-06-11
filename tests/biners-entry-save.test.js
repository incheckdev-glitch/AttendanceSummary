const assert = require('assert');
const fs = require('fs');

const frontend = fs.readFileSync('biners.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /<form id="binersEntryForm"[^>]*novalidate>/, 'Biners entry form must route validation through visible custom feedback');
assert.match(html, /id="binersSaveEntryBtn"[^>]*type="submit"/, 'Save Entry must submit the Biners entry form');
assert.match(html, /id="binersEntryErrorBanner"[^>]*role="alert"/, 'Biners entry form must have a visible error banner');
assert.match(frontend, /binersEntryForm'\)\?\.addEventListener\('submit', e => saveEntry\(e\)/, 'Biners entry form submit handler is not wired');
assert.match(frontend, /state\.savingEntry[\s\S]*btn\.disabled = true; btn\.textContent = 'Saving\.\.\.'/, 'Biners save must prevent duplicate submissions and display loading state');
assert.match(frontend, /validateEntry\(\)[\s\S]*'Client is required\.'[\s\S]*'At least one related location name is required\.'/, 'Existing-client validation must provide visible required-field messages');
assert.match(frontend, /Access denied\. You do not have permission to create Biners entries\./, 'Biners permission errors must be surfaced');
assert.match(frontend, /function showEntrySaveError[\s\S]*banner\.textContent = message[\s\S]*toast\(message\)/, 'Biners save failures must be surfaced in the form and toast');
assert.match(frontend, /request\('create', payload\)[\s\S]*refresh\(\)[\s\S]*Biners entry created successfully\./, 'Successful Biners save must persist, refresh, and show success feedback');
assert.match(frontend, /startDate\.getUTCMonth\(\) \+ months \+ 1[\s\S]*end\.setUTCDate\(end\.getUTCDate\(\) - 1\)/, 'Service End must calculate as Service Start plus license months minus one day');
assert.match(frontend, /binersNumberOfLocations'[\s\S]*binersCostPerLocation'[\s\S]*binersLicenseLengthMonths'[\s\S]*\/ 12/, 'Total payable must use locations times annual cost times license months divided by 12');
assert.match(frontend, /locations:[\s\S]*client_id: clientId[\s\S]*company_id: companyId[\s\S]*service_start_date: startDate[\s\S]*service_end_date: endDate/, 'Related locations must retain client identifiers and service/license details');
assert.match(frontend, /isDevelopment\(\)\) console\.log\('Biners Save Clicked'/, 'Save click debug logging must be development-only');
assert.match(frontend, /isDevelopment\(\)\) console\.log\('Biners Entry Created'/, 'Save success debug logging must be development-only');
assert.match(frontend, /isDevelopment\(\)\) console\.error\('Biners Entry Save Failed'/, 'Save error debug logging must be development-only');

console.log('Biners entry save checks passed.');
