const assert = require('assert');
const fs = require('fs');

const read = file => fs.readFileSync(file, 'utf8');
const index = read('index.html');
const app = read('app.js');
const onboarding = read('operations-onboarding.js');
const lifecycle = read('lifecycle-analytics.js');
const permissions = read('roles-admin.js');
const notifications = read('notifications.js');

assert.doesNotMatch(index, /technicalAdminTab|technicalAdminView|technical-admin\.js|Technical Admin|Technical Request|lifecycleTechnicalFilter/);
assert.doesNotMatch(index, /operationsOnboardingRequestTypeFilter|<th>Request Type<\/th>/);
assert.doesNotMatch(onboarding, /data-op-technical-admin|canCreateTechnicalRequest|Technical Request Status:|Technical Request Message:/);
assert.doesNotMatch(lifecycle, /technical/i, 'Lifecycle Analytics must have no Technical Admin data, status, metric, timeline, or activity dependency');
assert.match(app, /technical-admin-requests.*unavailable: true/);
assert.match(permissions, /technical_admin_requests.*return false/);
assert.match(notifications, /isRemovedModuleNotification/);
assert.strictEqual(fs.existsSync('technical-admin.js'), false, 'standalone Technical Admin frontend module must be removed');

console.log('Technical Admin UI removal checks passed.');
