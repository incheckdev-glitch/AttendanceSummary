const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const permissionsSource = fs.readFileSync('permissions.js', 'utf8');
const forecastSource = fs.readFileSync('renewal-forecast.js', 'utf8');
const rolesAdminSource = fs.readFileSync('roles-admin.js', 'utf8');
const htmlSource = fs.readFileSync('index.html', 'utf8');
const permissionMigration = fs.readFileSync('sql/migrations/20260611_monthly_renewal_forecast_permissions.sql', 'utf8');
const hardeningMigration = fs.readFileSync('sql/migrations/20260611_monthly_renewal_forecast_admin_security.sql', 'utf8');
const forecastMigration = fs.readFileSync('sql/migrations/20260610_monthly_renewal_forecast_admin_guard.sql', 'utf8');
const overrideMigration = fs.readFileSync('sql/migrations/20260610_renewal_no_needed_override.sql', 'utf8');
const actionFixMigration = fs.readFileSync('sql/migrations/20260616_monthly_renewal_no_needed_action_fix.sql', 'utf8');

const actions = ['view', 'export', 'view_details', 'mark_renewed', 'mark_no_renewal_needed', 'undo_override', 'create_renewal_invoice'];
actions.forEach(action => {
  assert(permissionsSource.includes(`${action}: ['admin', 'senior_financial_controller', 'senior_fc', 'sfc', 'general_manager', 'gm', 'accounting', 'accountant']`), `${action} must default to allowed finance/admin roles`);
  assert(permissionMigration.includes(`('${action}')`), `${action} must be seeded`);
});
assert(permissionsSource.includes("renewalForecast: [{ resource: 'monthly_renewal_forecast', action: 'view' }]"), 'tab access must use the view permission');
assert(permissionsSource.includes("renewalForecast: 'monthly_renewal_forecast'"), 'tab resource map must use the new resource');
assert(rolesAdminSource.includes("moduleName: 'Monthly Renewal Forecast'") && rolesAdminSource.includes("displayGroup: 'Reports / Forecasts'"), 'permissions UI must include module and group labels');
['View Monthly Renewal Forecast', 'Export Monthly Renewal Forecast', 'View Renewal Details', 'Mark Renewal as Renewed', 'Mark No Renewal Needed', 'Undo Renewal Override', 'Create Renewal Invoice'].forEach(label => assert(rolesAdminSource.includes(label), `missing UI permission label ${label}`));

let rpcCalls = 0;
const elements = {
  renewalForecastState: { textContent: '' },
  renewalForecastBody: { innerHTML: 'old content' },
  renewalForecastDetailsDrawer: { hidden: true }
};
const allowed = new Set();
const permissionApi = {
  canPerformAction(resource, action) { return resource === 'monthly_renewal_forecast' && allowed.has(action); },
  can(resource, action) { return this.canPerformAction(resource, action); }
};
const forecastContext = {
  console,
  Blob: class {},
  URL: {},
  window: {
    Permissions: permissionApi,
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
  assert.strictEqual(rpcCalls, 0, 'users without view permission must never call an RPC');
  assert.strictEqual(elements.renewalForecastState.textContent, 'Access denied. You need permission to view Monthly Renewal Forecast.');
  assert.strictEqual(elements.renewalForecastBody.innerHTML, '');
  assert.strictEqual(forecast.detailActions({ renewal_status: 'upcoming' }), '', 'detail actions require view_details');

  allowed.add('view_details');
  allowed.add('mark_renewed');
  let rendered = forecast.detailActions({ renewal_status: 'upcoming', opportunity_id: 'renewal-1' });
  assert(rendered.includes('Mark Renewed'), 'mark renewed button must use mark_renewed');
  assert(!rendered.includes('Mark as No Renewal Needed'), 'No Renewal Needed button must require its permission');
  assert(!rendered.includes('Create Renewal Invoice'), 'invoice button must require create_renewal_invoice');

  allowed.add('mark_no_renewal_needed');
  allowed.add('create_renewal_invoice');
  allowed.add('undo_override');
  rendered = forecast.detailActions({ renewal_status: 'upcoming', opportunity_id: 'renewal-1', manual_renewal: true });
  assert(rendered.includes('Mark as No Renewal Needed'));
  assert(rendered.includes('Create Renewal Invoice'));
  assert(rendered.includes('Unmark Renewed'));

  assert(htmlSource.includes('data-permission-resource="monthly_renewal_forecast" data-permission-action="view"'), 'tab must declare view permission');
  assert(htmlSource.includes('data-permission-resource="monthly_renewal_forecast" data-permission-action="export"'), 'export button must declare export permission');
  assert(!permissionMigration.includes("'payment_forecast'"), 'Payment Forecast permissions must remain untouched');
  ['dev', 'csm', 'hoo', 'viewer', 'sales_executive', 'head_of_sales', 'accounting', 'senior_financial_controller', 'general_manager'].forEach(role => assert(permissionMigration.includes(`'${role}'`), `${role} must be seeded`));
  ['accounting', 'accountant', 'senior_financial_controller', 'general_manager'].forEach(role => assert(actionFixMigration.includes(`'${role}'`), `${role} must be allowed by action fix migration`));
  ['crm_get_monthly_renewal_forecast', 'crm_get_monthly_renewal_forecast_details', 'crm_mark_renewal_manual', 'crm_mark_renewal_no_needed', 'crm_unmark_renewal_override', 'crm_get_renewal_no_needed_overrides'].forEach(rpc => assert(permissionMigration.includes(`'${rpc}'`), `${rpc} admin guard must be verified`));
  assert(forecastMigration.includes('if not public.crm_is_admin_user() then'), 'forecast RPC must use crm_is_admin_user');
  assert(actionFixMigration.includes('crm_require_monthly_renewal_forecast_action') && actionFixMigration.includes('mark_no_renewal_needed'), 'override RPC guard must use Monthly Renewal Forecast action permission');
  assert(hardeningMigration.includes('monthly_renewal_overrides_admin_all') && hardeningMigration.includes('crm_renewal_no_needed_overrides_admin_select'), 'override tables must have admin-only RLS');
  console.log('Monthly Renewal Forecast permission access checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
