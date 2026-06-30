const assert = require('assert');
const fs = require('fs');

const proposals = fs.readFileSync('proposals.js', 'utf8');

const documentStart = proposals.indexOf('buildProposalDocumentHtml(proposal = {}, items = [], options = {})');
const documentEnd = proposals.indexOf('buildProposalPreviewHtml(proposal = {}, items = [])', documentStart);
assert(documentStart >= 0 && documentEnd > documentStart, 'proposal document renderer must be locatable');
const documentRenderer = proposals.slice(documentStart, documentEnd);

assert.match(documentRenderer, /const isPublicView = Boolean\(options\?\.publicView\);/, 'document renderer must detect public e-proposal mode');
assert.match(documentRenderer, /const totalsRowsHtml = isPublicView\s*\?/, 'public e-proposal totals must use a dedicated public row set');

const publicTotalsStart = documentRenderer.indexOf('const totalsRowsHtml = isPublicView');
const internalTotalsStart = documentRenderer.indexOf(': `', publicTotalsStart);
assert(publicTotalsStart >= 0 && internalTotalsStart > publicTotalsStart, 'public totals branch must be locatable');
const publicTotalsBranch = documentRenderer.slice(publicTotalsStart, internalTotalsStart);

assert.doesNotMatch(publicTotalsBranch, /<span>Subtotal<\/span>|<span>One Time Fees<\/span>|<span>Hardware<\/span>|<span>Subscription Fees<\/span>|Grand Total in Words/, 'public e-proposal totals must not render subtotal, component totals, or extra totals below grand total');
assert.match(publicTotalsBranch, /<span>Total Discount<\/span>/, 'public e-proposal totals should keep the discount row shown by the ERP preview');
assert.match(publicTotalsBranch, /<span>Grand Total<\/span>/, 'public e-proposal totals must keep grand total visible');

console.log('E-proposal public totals checks passed.');
