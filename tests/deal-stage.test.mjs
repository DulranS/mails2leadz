// Pipeline stages: the labels people really type are understood, and an unknown label never moves a customer back to prospect.
import assert from 'node:assert/strict';
import { normalizeStage, knownStage, buildDealWrite } from '../lib/deal-utils.js';

// Spellings from spreadsheets and notes.
assert.equal(normalizeStage('closed won'), 'closed_won', 'a space instead of an underscore');
assert.equal(normalizeStage('Closed Won'), 'closed_won', 'capitals');
assert.equal(normalizeStage('closed-won'), 'closed_won', 'a hyphen');
assert.equal(normalizeStage('Closed Lost'), 'closed_lost');
assert.equal(normalizeStage('negotiating'), 'negotiation');
assert.equal(normalizeStage('proposal sent'), 'proposal');
assert.equal(normalizeStage('in progress'), 'contacted');
assert.equal(normalizeStage('won '), 'closed_won', 'trailing space');
assert.equal(normalizeStage(''), 'new', 'empty is a new deal');
assert.equal(normalizeStage(undefined), 'new');

// knownStage refuses to guess.
assert.equal(knownStage('frobnicated'), null);
assert.equal(knownStage('closed won'), 'closed_won');
assert.equal(knownStage(''), null);

// A customer is never moved back to prospect by a label we do not recognise.
const won = { uid: 'u1', email: 'Client@Example.com', stage: 'closed_won', businessName: 'Acme' };
const after = buildDealWrite({ uid: 'u1', email: 'client@example.com', stage: 'Sold to them?', existing: won, now: new Date('2026-06-02T10:00:00Z') });
assert.equal(after.stage, 'closed_won', 'an unknown label keeps the customer as won');
const lostAfter = buildDealWrite({ uid: 'u1', email: 'x@example.com', stage: 'negotiatng', existing: { stage: 'negotiation' }, now: new Date() });
assert.equal(lostAfter.stage, 'negotiation', 'a typo keeps the existing stage');
// A brand-new deal with an unknown label is a plain new prospect (nothing to keep).
assert.equal(buildDealWrite({ uid: 'u1', email: 'new@example.com', stage: 'mystery', now: new Date() }).stage, 'new');
// A known label still moves the deal.
assert.equal(buildDealWrite({ uid: 'u1', email: 'client@example.com', stage: 'closed lost', existing: won, now: new Date() }).stage, 'closed_lost');

console.log('deal-stage tests: all passed');
