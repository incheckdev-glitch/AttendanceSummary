const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = {
  window: { Workflow: { state: { rules: [] } } },
  console,
  document: { addEventListener() {} },
  E: {},
  Api: {},
  UI: {},
  Session: { role() { return 'admin'; } }
};

vm.createContext(context);
vm.runInContext(fs.readFileSync('workflow.js', 'utf8'), context);

const evaluate = context.evaluateProposalDiscountApproval;
assert.strictEqual(typeof evaluate, 'function', 'evaluateProposalDiscountApproval should be available');

function annualItem(discount) {
  return { item_type: 'Annual SaaS', discount_percent: discount };
}

function oneTimeItem(discount) {
  return { item_type: 'One-Time Fee', discount_percent: discount };
}

function decisionFor(proposal, items) {
  return evaluate(proposal, items, {});
}

const cases = [
  {
    name: 'Approved annual SaaS = 15, current = 15: no approval',
    proposal: { approved_annual_saas_discount_percent: 15 },
    items: [annualItem(15)],
    allowed: true,
    requiresApproval: false
  },
  {
    name: 'Approved annual SaaS = 15, current = 14: no approval',
    proposal: { approved_annual_saas_discount_percent: 15 },
    items: [annualItem(14)],
    allowed: true,
    requiresApproval: false
  },
  {
    name: 'Approved annual SaaS = 15, current = 16: approval required',
    proposal: { approved_annual_saas_discount_percent: 15 },
    items: [annualItem(16)],
    allowed: false,
    requiresApproval: true
  },
  {
    name: 'Approved annual SaaS = 15, current = 8: no approval',
    proposal: { approved_annual_saas_discount_percent: 15 },
    items: [annualItem(8)],
    allowed: true,
    requiresApproval: false
  },
  {
    name: 'No approved annual baseline, current = 15: approval required',
    proposal: {},
    items: [annualItem(15)],
    allowed: false,
    requiresApproval: true
  },
  {
    name: 'No approved annual baseline, current = 8: no approval',
    proposal: {},
    items: [annualItem(8)],
    allowed: true,
    requiresApproval: false
  },
  {
    name: 'Current annual SaaS = 21: blocked',
    proposal: {},
    items: [annualItem(21)],
    allowed: false,
    requiresApproval: false
  },
  {
    name: 'Approved one-time fee = 25, current = 25: no approval',
    proposal: { approved_one_time_fee_discount_percent: 25 },
    items: [oneTimeItem(25)],
    allowed: true,
    requiresApproval: false
  },
  {
    name: 'Approved one-time fee = 25, current = 24: no approval',
    proposal: { approved_one_time_fee_discount_percent: 25 },
    items: [oneTimeItem(24)],
    allowed: true,
    requiresApproval: false
  },
  {
    name: 'Approved one-time fee = 25, current = 26: approval required',
    proposal: { approved_one_time_fee_discount_percent: 25 },
    items: [oneTimeItem(26)],
    allowed: false,
    requiresApproval: true
  }
];

for (const testCase of cases) {
  const decision = decisionFor(testCase.proposal, testCase.items);
  assert.strictEqual(decision.allowed, testCase.allowed, `${testCase.name}: allowed`);
  assert.strictEqual(decision.requiresApproval, testCase.requiresApproval, `${testCase.name}: requiresApproval`);
}

console.log(`Passed ${cases.length} proposal approval baseline tests.`);
