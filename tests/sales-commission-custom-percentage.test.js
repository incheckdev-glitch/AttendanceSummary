const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'commission-tracker.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', '20260730_sales_commission_custom_percentage.sql'), 'utf8');

function expect(pattern, text, message) {
  if (!pattern.test(text)) throw new Error(message);
}

expect(/<option value="custom">Custom %<\/option>/, source, 'Custom percentage option is missing.');
expect(/id="commissionCustomRateInput"[^>]+min="0"[^>]+max="100"[^>]+step="0\.01"/, source, 'Custom input bounds are missing.');
expect(/no more than two decimal places/, source, 'Custom precision validation is missing.');
expect(/base\*this\.rate\(\)\/100/, source, 'Commission formula must use eligible amount times percentage divided by 100.');
expect(/commission_rate_mode:selectedRateMode/, source, 'Percentage mode is not persisted in the database field.');
expect(/commission_rate:Number\(this\.rate\(\)\)/, source, 'Final percentage is not persisted as a number.');
expect(/commission_amount:calc\.total/, source, 'Calculated commission amount is not persisted.');
expect(/commission_type:existingCommissionType/, source, 'The existing business commission type is not preserved.');
expect(/update\(updatePayload\)\.eq\('id',commissionId\)\.select\(\)\.single\(\)/, source, 'Updates must select the persisted UUID row.');
expect(/insert\(insertPayload\)\.select\(\)\.single\(\)/, source, 'Inserts must return the persisted row.');
expect(/await this\.refresh\(\);[\s\S]*?Commission saved successfully/, source, 'Success must follow a direct Supabase refresh.');
expect(/commissionCustomRateInput'\)\.value=this\.percentageType\(row\)==='custom'/, source, 'Saved custom percentage is not restored while editing.');
expect(/alter column commission_rate type numeric\(5,2\)/i, migration, 'Migration must enforce a two-decimal numeric rate.');
expect(/commission_rate_type in \('preset', 'custom'\)/i, migration, 'Migration must constrain percentage type.');

console.log('Sales commission custom percentage checks passed.');
