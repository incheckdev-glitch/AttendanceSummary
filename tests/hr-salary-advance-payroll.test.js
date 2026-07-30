const assert = require('assert');
const fs = require('fs');
const hr = fs.readFileSync('hr.js', 'utf8');
const migration = fs.readFileSync('sql/migrations/20260730_hr_salary_advance_payslip.sql', 'utf8');

assert.match(hr, /String\(row\.employee_id\).*String\(emp\.id\)[\s\S]*String\(row\.payroll_month\).*month[\s\S]*approval_status\) === 'approved'[\s\S]*row\.is_active !== false[\s\S]*!row\.deducted_at/s, 'selection must match employee/month and only approved active unpaid installments');
assert.match(hr, /advanceInstallments\.reduce[\s\S]*gross - deductions - salaryAdvance/, 'multiple installments must aggregate once and reduce net salary separately');
assert.match(hr, />Salary Advance<\/td><td>\$\{money\(item\.salary_advance_amount/, 'payslip must contain the Salary Advance deduction line');
assert.match(hr, /Approved or paid payroll cannot be recalculated/, 'finalized historical payroll must not be regenerated');
assert.match(hr, /rpc\('hr_finalize_payroll_salary_advances'/, 'approval must use the database finalization transaction');
assert.match(migration, /unique \(installment_id\)/, 'an installment must be linkable to only one payroll item');
assert.match(migration, /round\(coalesce\(sum\(psa\.amount\), 0\), 2\) <> round\(pi\.salary_advance_amount, 2\)/, 'database approval must validate the displayed snapshot against linked installments');
assert.match(migration, /remaining_balance = greatest\(0, sa\.remaining_balance - x\.amount\)/, 'approval must update the remaining advance balance');
assert.match(migration, /where pi\.run_id = p_run_id and sai\.deducted_at is null/, 'balance deduction must be idempotent');
console.log('HR Salary Advance payroll checks passed.');
