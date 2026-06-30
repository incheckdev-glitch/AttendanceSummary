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

assert.doesNotMatch(publicTotalsBranch, /<span>Subtotal<\/span>|<span>Total Discount<\/span>|<span>Hardware<\/span>|Grand Total in Words|Total Before Discount/, 'public e-proposal totals must not render subtotal, discount, hardware, or extra totals below grand total');
assert.match(publicTotalsBranch, /<span>One-Time Fees<\/span>/, 'public e-proposal totals must show the exact One-Time Fees label');
assert.match(publicTotalsBranch, /<span>Subscription Fees<\/span>/, 'public e-proposal totals must show subscription fees');
assert.match(publicTotalsBranch, /<span>Grand Total<\/span>/, 'public e-proposal totals must keep grand total visible');

console.log('E-proposal public totals checks passed.');
