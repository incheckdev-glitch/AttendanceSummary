const assert = require('assert');
const fs = require('fs');

const accounting = fs.readFileSync('accounting.js', 'utf8');
const waitStart = accounting.indexOf('async function waitForExpenseReport');
const exportEnd = accounting.indexOf('async function saveExpenseForm', waitStart);
const expensePdf = accounting.slice(waitStart, exportEnd);

assert.ok(waitStart >= 0, 'expense PDF rendering readiness helper must exist');
assert.match(expensePdf, /reportDocument\.fonts\?\.ready/, 'PDF export must await document fonts');
assert.match(expensePdf, /Promise\.all\(images\.map/, 'PDF export must await every report image');
assert.match(expensePdf, /requestAnimationFrame\(\(\) => reportWindow\.requestAnimationFrame/, 'PDF export must await completed browser layout');
assert.match(expensePdf, /Expense report PDF container was not found\./, 'PDF export must reject a missing report container');
assert.match(expensePdf, /Expense report PDF container is empty\./, 'PDF export must reject an empty report container');
assert.match(expensePdf, /querySelectorAll\('tbody tr'\)\.length !== expectedRows/, 'PDF export must verify that every filtered row rendered');
assert.match(expensePdf, /bounds\.width === 0 \|\| bounds\.height === 0/, 'PDF export must reject a zero-size report');
assert.match(expensePdf, /global\.open\('', '_blank', 'width=1480,height=940'\)/, 'report window must remain writable by its creator');
assert.doesNotMatch(expensePdf, /global\.open\([^\n]+noopener/, 'noopener must not cause a detached blank report window');
assert.match(expensePdf, /<main class="report" data-expense-report-pdf>/, 'the populated report itself must be selected for capture');
assert.match(expensePdf, /triggerButton\.disabled = true/, 'duplicate PDF exports must be disabled while rendering');
assert.match(expensePdf, /reportWindow\.print\(\)/, 'printing must begin only after report readiness validation');
assert.match(expensePdf, /Expense Report PDF could not be generated:/, 'PDF failures must be shown to the user');
assert.match(expensePdf, /thead\{display:table-header-group\}/, 'table headers must repeat across printed pages');
assert.match(expensePdf, /tr,td\{break-inside:avoid;page-break-inside:avoid\}/, 'expense rows must not be split across pages');
assert.doesNotMatch(expensePdf, /\.report\{[^}]*display:\s*none|\.report\{[^}]*visibility:\s*hidden|\.report\{[^}]*opacity:\s*0/, 'the report must never be hidden during export');

console.log('Expense report PDF flow checks passed.');
