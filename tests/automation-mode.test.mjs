// Automation mode (Pass 172): one explicit confirmation turns it on; without it nothing changes; opt-out and claim hold stay on.
import assert from 'node:assert/strict';
import { automationPatch, ALL_ANGLES } from '../lib/automation-mode.js';
import { filterApprovedAngles } from '../lib/autosend.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('nothing is written without the confirmation', () => {
  assert.ok(automationPatch({ confirmed: false }).error);
  assert.ok(automationPatch({}).error);
});

t('with the confirmation, sending, sharing and enrichment are on, and the claim hold stays on', () => {
  const p = automationPatch({ confirmed: true, now: Date.parse('2026-11-04T09:00:00Z') });
  assert.equal(p.autopilot.autoSend, true);
  assert.equal(p.autopilot.autoSendApprovedAt, '2026-11-04T09:00:00.000Z');
  assert.deepEqual(p.autopilot.autoSendApprovedAngles, [ALL_ANGLES]);
  assert.equal(p.business.dataSharingConfirmed, true);
  assert.equal(p.business.switches.enrichDeals, true);
  assert.equal(p.business.switches.holdClaimRisk, true);
});

t('the all-angles setting lets every draft through the angle check', () => {
  const drafts = [{ id: 'a', angle: 'referral' }, { id: 'b' }, { id: 'c', angle: 'cold' }];
  assert.equal(filterApprovedAngles(drafts, [ALL_ANGLES]).length, 3);
  assert.equal(filterApprovedAngles(drafts, ['referral']).length, 1);
});

console.log(`\n${n} passed`);
