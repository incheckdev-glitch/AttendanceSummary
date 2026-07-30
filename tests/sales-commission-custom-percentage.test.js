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
expect(/commission_rate_type:this\.isCustomRate\(\)\?'custom':'preset'/, source, 'Percentage type is not persisted.');
expect(/commission_rate:this\.rate\(\)/, source, 'Final percentage is not persisted.');
expect(/commissionCustomRateInput'\)\.value=this\.percentageType\(row\)==='custom'/, source, 'Saved custom percentage is not restored while editing.');
expect(/alter column commission_rate type numeric\(5,2\)/i, migration, 'Migration must enforce a two-decimal numeric rate.');
expect(/commission_rate_type in \('preset', 'custom'\)/i, migration, 'Migration must constrain percentage type.');

console.log('Sales commission custom percentage checks passed.');
