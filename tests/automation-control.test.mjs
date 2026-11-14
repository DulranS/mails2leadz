// Automation control (Pass 265): one pause stops every switch that contacts people; the internal steps keep running; the view lists what runs and what waits for keys.
import assert from 'node:assert/strict';
import { switchState, SENDS_TO_PEOPLE, SWITCHES } from '../lib/switches.js';
import { automationSummary } from '../lib/automation-control.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };
const keysFor = (id) => Object.fromEntries((SWITCHES[id]?.needs || []).map((k) => [k, 'x']));

t('the pause stops switches that contact people, and leaves the internal steps running', () => {
  const settings = { automationPaused: true, switches: { journeyAutoSend: true, autoInvoiceDrafts: true } };
  assert.equal(switchState('journeyAutoSend', settings, keysFor('journeyAutoSend')).status, 'paused');
  assert.equal(switchState('autoInvoiceDrafts', settings, {}).status, 'on');
  assert.ok(SENDS_TO_PEOPLE.has('journeyAutoSend'));
});

t('without the pause, a switch that is on and has its keys runs', () => {
  assert.equal(switchState('journeyAutoSend', { switches: { journeyAutoSend: true } }, keysFor('journeyAutoSend')).status, 'on');
});

t('the view lists what runs, and what is on but waits for keys', () => {
  const s = automationSummary({ automationPaused: false, switches: { journeyAutoSend: true } }, {});
  assert.ok(s.needsKeys.some((r) => r.id === 'journeyAutoSend'));
  assert.ok(s.running.some((r) => r.id === 'autoInvoiceDrafts'));
  assert.equal(s.paused, false);
});

console.log(`\n${n} passed`);
