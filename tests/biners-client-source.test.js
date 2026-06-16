const assert = require('assert');
const fs = require('fs');

const frontend = fs.readFileSync('biners.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

assert.match(frontend, /ClientsService\.getDashboardData\(\{ page, limit: 200, summaryOnly: true, allowClientMutations: false \}\)/, 'Biners existing-client choices must use the Clients module source');
assert.doesNotMatch(frontend, /requestWithSession\?\.\('companies', 'list'/, 'Biners must not load raw companies for the existing-client dropdown');
assert.match(frontend, /function dedupeClients[\s\S]*client\.company_id[\s\S]*client\.client_id[\s\S]*name:/, 'client choices must deduplicate by identifiers with normalized-name fallback');
assert.match(frontend, /\[client\.legal_name, client\.customer_name, client\.account_number, client\.contact_email\]/, 'client search must cover legal name, customer name, account number, and contact email');
assert.match(frontend, /function isUuid[\s\S]*Expected UUID but received/, 'Biners must validate selected UUIDs before saving');
assert.match(frontend, /<option value="\$\{esc\(client\.id\)\}"[\s\S]*\$\{esc\(clientOptionLabel\(client\)\)\}/, 'existing-client options must use the real UUID value and display label text separately');
assert.match(frontend, /client_id: clientId[\s\S]*company_id: companyId[\s\S]*client_reference: clientDisplayReference\(client\) \|\| null/, 'selected client UUID and display reference must be separated when saving');
[
  ['binersClientName', 'client.customer_name'],
  ['binersClientLegalName', 'client.legal_name'],
  ['binersClientCountry', 'client.country'],
  ['binersClientCity', 'client.city'],
  ['binersClientAddress', 'client.address'],
  ['binersClientContactName', 'client.contact_name'],
  ['binersClientContactEmail', 'client.contact_email'],
  ['binersClientContactPhone', 'client.contact_phone'],
  ['binersCurrency', 'client.currency']
].forEach(([id, source]) => {
  assert(frontend.includes(`$('${id}').value = ${source}`), `selected client must populate ${id}`);
});
assert(html.includes('id="binersExistingClientSearch"'), 'existing-client search input is missing');
assert(html.includes('id="binersExistingClientId"'), 'existing-client dropdown is missing');
console.log('Biners client source checks passed.');
