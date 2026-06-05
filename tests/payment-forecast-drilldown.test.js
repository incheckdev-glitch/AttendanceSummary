const assert = require('assert');
const fs = require('fs');

const frontend = fs.readFileSync('payment-forecast.js', 'utf8');
const api = fs.readFileSync('api.js', 'utf8');
const data = fs.readFileSync('supabase-data.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');

['scheduled_rows','gross_scheduled','paid_amount','credit_adjusted','net_expected','overdue_amount','due_this_week','due_this_month','next_30_days','next_90_days','collection_risk_percent']
  .forEach(metric => assert(frontend.includes(`['${metric}'`), `missing clickable summary metric ${metric}`));
['row','client','month','followup'].forEach(type => assert(frontend.includes(`data-pf-drilldown="${type}"`), `missing ${type} row drill-down`));
['openPaymentForecastDetailsDrawer','closePaymentForecastDetailsDrawer','loadPaymentForecastDetails','renderPaymentForecastDetailsSummary','renderPaymentForecastDetailsScheduleRows','renderPaymentForecastDetailsReceipts','renderPaymentForecastDetailsCreditNotes','renderPaymentForecastDetailsFollowups','renderPaymentForecastDetailsLogs']
  .forEach(name => assert(frontend.includes(`${name}(`), `missing frontend helper ${name}`));
['getPaymentForecastDrilldown','getPaymentForecastRowDetails','getPaymentForecastClientDetails','getPaymentForecastMonthDetails','getPaymentForecastFollowupLogs']
  .forEach(name => assert(api.includes(`${name}(`), `missing API helper ${name}`));
assert(data.includes("action === 'drilldown'"), 'missing drill-down backend action');
assert(data.includes("filter(isUuid)"), 'related-record queries must only receive UUID invoice IDs');
assert(html.includes('id="paymentForecastDetailsDrawer"'), 'missing details drawer markup');
['payment-forecast-details-drawer','payment-forecast-details-backdrop','payment-forecast-details-header','payment-forecast-details-section','payment-forecast-details-grid','payment-forecast-mini-table','payment-forecast-log-timeline']
  .forEach(name => assert(css.includes(`.${name}`), `missing drawer style ${name}`));
console.log('Payment Forecast drill-down checks passed.');
