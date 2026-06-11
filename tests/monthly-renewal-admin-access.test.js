const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const permissionsSource = fs.readFileSync('permissions.js', 'utf8');
const forecastSource = fs.readFileSync('renewal-forecast.js', 'utf8');
const appSource = fs.readFileSync('app.js', 'utf8');
const htmlSource = fs.readFileSync('index.html', 'utf8');
const hardeningMigration = fs.readFileSync('sql/migrations/20260611_monthly_renewal_forecast_admin_security.sql', 'utf8');
const forecastMigration = fs.readFileSync('sql/migrations/20260610_monthly_renewal_forecast_admin_guard.sql', 'utf8');
const overrideMigration = fs.readFileSync('sql/migrations/20260610_renewal_no_needed_override.sql', 'utf8');

const helperMatch = permissionsSource.match(/function isMonthlyRenewalForecastAdmin\(user\) \{[\s\S]*?\n\}/);
assert(helperMatch, 'shared Monthly Renewal Forecast admin helper must exist');
const helperContext = {};
vm.createContext(helperContext);
vm.runInContext(`${helperMatch[0]}; this.check = isMonthlyRenewalForecastAdmin;`, helperContext);
['dev', 'csm', 'hoo', 'viewer', 'sales_executive', 'head_of_sales', 'accounting', 'Senior Financial Controller', 'General Manager', ' administrator ', ''].forEach(role => {
  assert.strictEqual(helperContext.check({ role }), false, `${role || 'empty role'} must not have access`);
});
assert.strictEqual(helperContext.check({ profile: { role_key: ' ADMIN ' } }), true, 'normalized admin must have access');

let rpcCalls = 0;
const elements = {
  renewalForecastState: { textContent: '' },
  renewalForecastBody: { innerHTML: 'old content' },
  renewalForecastDetailsDrawer: { hidden: true }
};
const forecastContext = {
  console,
  Blob: class {},
  URL: {},
  window: {
    isMonthlyRenewalForecastAdmin: helperContext.check,
    Permissions: { getResolvedCurrentUser: () => ({ role: 'viewer' }) },
    SupabaseClient: { getClient: () => ({ rpc: async () => { rpcCalls += 1; return { data: [], error: null }; } }) }
  },
  document: {
    body: { classList: { remove() {} } },
    getElementById: id => elements[id] || null
  },
  U: { fmtNumber: String, fmtDate: String, escapeHtml: String, escapeAttr: String },
  UI: { toast() {} }
};
vm.createContext(forecastContext);
vm.runInContext(forecastSource, forecastContext);
const forecast = forecastContext.window.RenewalForecast;

(async () => {
  await forecast.refresh();
  await forecast.fetchMonthSummaries();
  await forecast.fetchMonthDetails('2026-06-01');
  await forecast.fetchManualRenewals();
  await forecast.fetchNoRenewalNeededOverrides();
  assert.strictEqual(rpcCalls, 0, 'non-admin component and loading paths must never call an RPC');
  assert.strictEqual(elements.renewalForecastState.textContent, 'Access denied. This forecast is available for admin users only.');
  assert.strictEqual(elements.renewalForecastBody.innerHTML, '');
  assert.strictEqual(forecast.detailActions({ renewal_status: 'upcoming' }), '', 'non-admin action buttons must not render');

  assert(permissionsSource.includes("if (key === 'renewalForecast') return isMonthlyRenewalForecastAdmin"), 'navigation access must use shared helper');
  assert(appSource.includes("requestedView === 'renewalForecast'") && appSource.includes('Access denied. This forecast is available for admin users only.'), 'direct route must show required denial');
  assert(forecastMigration.includes('if not public.crm_is_admin_user() then'), 'forecast RPC must use crm_is_admin_user');
  assert(overrideMigration.includes('if not public.crm_is_admin_user() then'), 'override RPC guard must use crm_is_admin_user');
  assert(hardeningMigration.includes('monthly_renewal_overrides_admin_all') && hardeningMigration.includes('crm_renewal_no_needed_overrides_admin_select'), 'override tables must have admin-only RLS');
  assert(!hardeningMigration.includes('payment_forecast'), 'Payment Forecast permissions must remain untouched');
  assert(!htmlSource.match(/id="renewalForecast(?:Tab|ExportBtn)"[^>]+data-permission-resource="payment_forecast"/), 'renewal forecast controls must not inherit Payment Forecast permissions');
  console.log('Monthly Renewal Forecast admin access checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
