const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('clients-service.js', 'utf8');

assert.match(
  source,
  /from\("client_panel_clients_unified"\)\s*\.select\("\*"\)/,
  'Client Panel must load signed agreement clients from client_panel_clients_unified first'
);

assert.match(
  source,
  /console\.error\("Failed to load signed agreement clients:", error\)/,
  'Client Panel must log signed agreement client view failures with the required message'
);

assert.match(
  source,
  /const clientMap = new Map\(\);[\s\S]*for \(const client of signedClients \|\| \[\]\)[\s\S]*clientMap\.set\(key, this\.mapSignedAgreementClientToUi_\(client\)\)/,
  'Client Panel must seed its client map from signed agreements before other client sources'
);

assert.match(
  source,
  /Number\(client\.total_agreements \|\| 0\) > 0 \|\|[\s\S]*\(client\.invoices \|\| \[\]\)\.length > 0 \|\|[\s\S]*\(client\.receipts \|\| \[\]\)\.length > 0/,
  'Client Panel final filter must keep signed-agreement clients even when they have no invoices'
);

assert.match(
  source,
  /isPocAgreementItem_[\s\S]*proof of concept\|pilot/,
  'Client Panel location counts must exclude POC agreement items'
);

assert.doesNotMatch(
  source,
  /clients\s*=\s*clients\.filter\(\(client\)\s*=>\s*client\.invoices\.length > 0\)/,
  'Client Panel must not filter out clients without invoices'
);
