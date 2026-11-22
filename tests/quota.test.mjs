// Pass 367: monthly sales targets per person. Won value this month against each person's target.
import assert from 'node:assert/strict';
import { quotaProgress } from '../lib/quota.js';
import { eligibleOwners } from '../lib/assignment.js';

const now = Date.parse('2026-11-23T00:00:00Z');
const owners = [{ key: 'owner', label: 'You (owner)', quota: 100000 }, { key: 'u2', label: 'Team member', quota: null }];
const deals = [
  { stage: 'closed_won', assignedTo: 'owner', value: 40000, closedAt: '2026-11-05T09:00:00.000Z' },
  { stage: 'closed_won', assignedTo: 'owner', value: 30000, closedAt: '2026-11-20T09:00:00.000Z' },
  { stage: 'closed_won', assignedTo: 'owner', value: 50000, closedAt: '2026-10-31T09:00:00.000Z' }, // last month: not counted
  { stage: 'negotiation', assignedTo: 'owner', value: 90000 }, // open: not counted
  { stage: 'closed_won', assignedTo: 'u2', value: 20000, closedAt: '2026-11-02T09:00:00.000Z' },
  { stage: 'closed_won', assignedTo: 'nobody', value: 60000, closedAt: '2026-11-03T09:00:00.000Z' }, // not an owner here
  { stage: 'closed_won', assignedTo: 'u2', closedAt: '2026-11-04T09:00:00.000Z' }, // won, no value: counted, adds nothing
];
const rows = quotaProgress({ owners, deals, now });
const me = rows.find((r) => r.key === 'owner');
assert.equal(me.won, 70000, 'won this month adds the value of this month only');
assert.equal(me.wonCount, 2, 'the count covers this month\'s won deals');
assert.equal(me.quota, 100000);
assert.equal(me.pct, 70, 'share of the target, rounded');
assert.equal(me.remaining, 30000, 'what is still needed');
const team = rows.find((r) => r.key === 'u2');
assert.equal(team.quota, null, 'no target set');
assert.equal(team.pct, null, 'no percentage without a target');
assert.equal(team.won, 20000, 'a won deal with no value adds to the count only');
assert.equal(team.wonCount, 2);
const over = quotaProgress({ owners: [{ key: 'owner', label: 'x', quota: 10000 }], deals: [{ stage: 'closed_won', assignedTo: 'owner', value: 25000, closedAt: '2026-11-10T00:00:00.000Z' }], now });
assert.equal(over[0].pct, 250, 'over target shows above 100');
assert.equal(over[0].remaining, 0, 'nothing remaining once the target is passed');
assert.equal(quotaProgress({ owners: [], deals, now }).length, 0, 'no owners, no rows');
// The owner rule carries the target through, and a bad target is ignored.
const shaped = eligibleOwners([], { owner: { quota: 50000 } });
assert.equal(shaped[0].quota, 50000, 'the owner rule keeps the target');
assert.equal(eligibleOwners([], { owner: { quota: -5 } })[0].quota, null, 'a negative target is ignored');
assert.equal(eligibleOwners([], {})[0].quota, null, 'no target when none is set');
console.log('quota targets: all checks pass');
