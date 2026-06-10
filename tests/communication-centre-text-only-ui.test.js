const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'communication-centre.js'), 'utf8');
const emojiOrTextIcon = /[\u2190-\u21ff\u2300-\u23ff\u2600-\u27ff\u{1F000}-\u{1FAFF}]/u;

const tab = html.match(/<button id="communicationCentreTab"[\s\S]*?<\/button>/)?.[0] || '';
const section = html.match(/<section id="communicationCentreView"[\s\S]*?<\/section>/)?.[0] || '';

assert(tab, 'Communication Centre tab should exist');
assert(section, 'Communication Centre section should exist');
assert.strictEqual(emojiOrTextIcon.test(tab), false, 'Communication Centre tab should be text-only');
assert.strictEqual(emojiOrTextIcon.test(section), false, 'Communication Centre static UI should be text-only');
assert.strictEqual(emojiOrTextIcon.test(script), false, 'Communication Centre generated UI should not contain literal emoji or text icons');

for (const label of ['Like', 'Acknowledge', 'Review', 'Thanks', 'Urgent']) {
  assert(script.includes(`label: '${label}'`), `Reaction UI should include the text label ${label}`);
}

for (const label of ['Read', 'Received', 'Sent', 'Pinned', 'Back to conversations', '>Close</button>']) {
  assert(script.includes(label), `Generated Communication Centre UI should include ${label}`);
}

console.log('communication-centre-text-only-ui tests passed');
