const assert = require('assert');
const fs = require('fs');

const creditNotes = fs.readFileSync('credit-notes.js', 'utf8');
const loaderStart = creditNotes.indexOf("async loadCreditNoteInvoiceOptions(searchText = '')");
const loaderEnd = creditNotes.indexOf('async refresh(force = false)', loaderStart);
const loader = creditNotes.slice(loaderStart, loaderEnd);
const refreshStart = loaderEnd;
const refreshEnd = creditNotes.indexOf('filteredRows()', refreshStart);
const refresh = creditNotes.slice(refreshStart, refreshEnd);
const selectorStart = creditNotes.indexOf('populateInvoiceDropdown()');
const selectorEnd = creditNotes.indexOf('renderInvoiceInfo()', selectorStart);
const selector = creditNotes.slice(selectorStart, selectorEnd);

assert.notStrictEqual(loaderStart, -1, 'credit note invoice RPC loader must exist');
assert.match(loader, /rpc\('crm_get_credit_note_invoice_options',\s*\{\s*p_search: searchText \|\| '',\s*p_limit: 300\s*\}\)/, 'loader must call the dedicated RPC with search and limit arguments');
assert.doesNotMatch(loader, /Api\.listInvoices|\.from\('invoices'\)/, 'selector loader must not use invoice API or table fallbacks');
assert.match(refresh, /this\.loadCreditNoteInvoiceOptions\(\)/, 'credit note refresh must load invoice options from the RPC');
assert.doesNotMatch(refresh, /isEligibleInvoice|payment_status|balance_due\s*>|status\s*===\s*['"]issued/, 'RPC results must not be filtered again by frontend eligibility fields');
assert.match(selector, /invoice\.display_label \|\| `\$\{invoice\.invoice_ref\} · \$\{invoice\.customer_name\}`/, 'dropdown must use the RPC display label with invoice/customer fallback');
assert.match(selector, /Open: \$\{invoice\.open_balance[\s\S]*Creditable: \$\{invoice\.creditable_amount/, 'dropdown must show RPC open and creditable amounts');
assert.match(selector, /value="\$\{U\.escapeAttr\(invoice\.invoice_uuid\)\}"/, 'dropdown value must be the RPC invoice UUID');
assert.doesNotMatch(creditNotes, /isEligibleInvoice/, 'credit note invoice options must not have a local eligibility filter');

console.log('credit note invoice options RPC checks passed');
