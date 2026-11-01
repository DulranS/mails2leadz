import assert from 'node:assert/strict';
import { eligibleOwners, pickOwner, planAutoAssign, territoryOf, unclaimedDigest, OWNER_KEY } from '../lib/assignment.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = Date.UTC(2026, 10, 2, 12);
const DAY = 86400000;
const members = [{ uid: 'm1', role: 'manager', name: 'Ann' }, { uid: 'm2', role: 'manager', name: 'Bo' }];
const deal = (id, email, extra = {}) => ({ id, email, stage: 'new', ...extra });

t('an away person is skipped; the deal goes to someone who is in', () => {
  const owners = eligibleOwners(members, { m1: { away: true } });
  const key = pickOwner(owners, [deal('a', 'x@x.com', { assignedTo: OWNER_KEY })]);
  assert.equal(key, 'm2', 'the owner has one, Ann is away, so Bo (none) takes it');
});

t('a cap stops a person taking more open deals than they can handle', () => {
  const owners = eligibleOwners(members, { m1: { maxOpen: 1 }, m2: { maxOpen: 5 } });
  const deals = [deal('a', 'x@x.com', { assignedTo: 'm1' }), deal('b', 'y@y.com', { assignedTo: OWNER_KEY })];
  assert.notEqual(pickOwner(owners, deals), 'm1', 'Ann is at her cap of 1');
});

t('a territory specialist is preferred to a generalist, whatever the load', () => {
  const owners = eligibleOwners(members, { m1: { territories: ['lk'] } });
  const key = pickOwner(owners, [deal('a', 'x@x.com', { assignedTo: 'm2' })], { territory: territoryOf('buyer@firm.com.lk') });
  assert.equal(key, 'm1', 'Ann covers .lk, so she takes a .lk deal even though Bo has less');
  assert.equal(territoryOf('buyer@firm.com.lk'), 'lk');
  assert.equal(territoryOf('buyer@firm.com'), 'com');
});

t('a deal is never left without an owner, even when everyone is away or full', () => {
  const owners = eligibleOwners(members, { [OWNER_KEY]: { away: true }, m1: { away: true }, m2: { away: true } });
  assert.ok(pickOwner(owners, []), 'the least loaded owner takes it anyway');
  const changes = planAutoAssign(owners, [deal('a', 'x@x.com')]);
  assert.equal(changes.length, 1);
});

t('auto-assign balances the open deals across the people who are in, and gives each territory to its specialist', () => {
  const owners = eligibleOwners(members, { m2: { territories: ['lk'] } });
  const changes = planAutoAssign(owners, [deal('a', 'x@x.lk'), deal('b', 'y@y.com'), deal('c', 'z@z.com')]);
  assert.equal(changes.find((c) => c.id === 'a').assignedTo, 'm2');
  assert.equal(changes.length, 3);
});

t('the unclaimed reminder names only open deals with no owner for more than a day; a quiet day sends nothing', () => {
  const deals = [
    deal('old', 'a@a.com', { createdAt: new Date(NOW - 3 * DAY).toISOString(), businessName: 'Old Co' }),
    deal('fresh', 'b@b.com', { createdAt: new Date(NOW - 2 * 3600000).toISOString() }),
    deal('owned', 'c@c.com', { assignedTo: OWNER_KEY, createdAt: new Date(NOW - 3 * DAY).toISOString() }),
  ];
  const d = unclaimedDigest({ deals, now: NOW });
  assert.equal(d.subject, 'Deals with no owner: 1');
  assert.match(d.text, /Old Co/);
  assert.doesNotMatch(d.text, /fresh|b@b\.com/);
  assert.equal(unclaimedDigest({ deals: [deals[1]], now: NOW }), null);
});

console.log(`owners: ${n} passed`);
