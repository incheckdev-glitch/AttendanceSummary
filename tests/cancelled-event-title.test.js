const assert = require('assert');
const path = require('path');

require(path.join(__dirname, '..', 'events.js'));

for (const status of ['Cancelled', 'Canceled', 'cancelled', 'canceled', '  Cancelled  ']) {
  assert.strictEqual(globalThis.isCancelledEvent({ status }), true, `${status} should be cancelled`);
}

assert.strictEqual(globalThis.isCancelledEvent({ event_status: 'CANCELED' }), true);

for (const status of ['Planned', 'Open', 'In Progress', 'Completed', 'Rescheduled', 'Pending', '']) {
  assert.strictEqual(globalThis.isCancelledEvent({ status }), false, `${status} should not be cancelled`);
}

assert.strictEqual(globalThis.isCancelledEvent(null), false);
console.log('cancelled-event-title tests passed');
