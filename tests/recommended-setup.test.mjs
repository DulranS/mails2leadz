// Recommended setup (Pass 171): one click for the safe defaults; never sending, data sharing or paid credits; never overwriting a choice.
import assert from 'node:assert/strict';
import { recommendedPatch } from '../lib/recommended-setup.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a fresh account gets the safe defaults, and nothing that sends, shares data or costs credits', () => {
  const p = recommendedPatch({}, {});
  assert.deepEqual(p.business, { switches: { holdClaimRisk: true } });
  assert.deepEqual(p.autopilot, { dailyBrief: true });
  const text = JSON.stringify(p);
  for (const forbidden of ['autoSend', 'dataSharing', 'enrichDeals', 'tiktokSync', 'googleSync', 'liveVoice']) {
    assert.equal(text.includes(forbidden), false, `${forbidden} must not be switched on`);
  }
});

t('a choice the owner already made is kept, even when it is off', () => {
  const p = recommendedPatch({ switches: { holdClaimRisk: false } }, { dailyBrief: false });
  assert.equal(p.business, null);
  assert.equal(p.autopilot, null);
});

console.log(`\n${n} passed`);
