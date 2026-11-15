// Pass 301: a journey with a "trigger:" line enrols people automatically when a deal is won, an invoice is paid or a question is resolved (spec 7.2).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseJourney, JOURNEY_TRIGGERS } from '../lib/journey.js';
import { triggeredEnrolments } from '../lib/journey-triggers.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = Date.parse('2026-11-15T06:00:00Z');
const DAY = 86400000;
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const SAVED = ago(10);
const wonJourney = { id: 'j1', trigger: 'deal_won', createdAt: SAVED, steps: [] };

t('a trigger line is read and does not count as a step', () => {
  const p = parseJourney('trigger: deal_won\n0 | email | Thanks for choosing us. Here is what happens next.');
  assert.equal(p.trigger, 'deal_won');
  assert.equal(p.steps.length, 1);
  assert.equal(p.skipped, 0);
});

t('an unknown trigger is counted as skipped and does nothing', () => {
  const p = parseJourney('trigger: sunday_mornings\n0 | email | Thanks for choosing us.');
  assert.equal(p.trigger, '');
  assert.equal(p.skipped, 1);
  assert.equal(p.steps.length, 1);
  assert.ok(JOURNEY_TRIGGERS.includes('deal_won'));
});

t('a won deal after the journey was saved enrols that customer once', () => {
  const deals = [{ email: 'Buyer@Acme.co', stage: 'closed_won', lastUpdate: ago(1) }];
  const out = triggeredEnrolments({ journeys: [wonJourney], deals, now: NOW });
  assert.deepEqual(out, [{ journeyId: 'j1', email: 'buyer@acme.co', trigger: 'deal_won' }]);
});

t('a deal won before the journey was saved never enrols anyone (no backlog)', () => {
  const deals = [{ email: 'old@x.lk', stage: 'closed_won', lastUpdate: ago(5) }];
  const late = { ...wonJourney, createdAt: ago(2) };
  assert.equal(triggeredEnrolments({ journeys: [late], deals, now: NOW }).length, 0);
});

t('a journey with no save time is never triggered', () => {
  const deals = [{ email: 'a@x.lk', stage: 'closed_won', lastUpdate: ago(1) }];
  assert.equal(triggeredEnrolments({ journeys: [{ id: 'j2', trigger: 'deal_won' }], deals, now: NOW }).length, 0);
});

t('someone already in the journey is not enrolled again', () => {
  const deals = [{ email: 'a@x.lk', stage: 'closed_won', lastUpdate: ago(1) }];
  const enrolments = [{ journeyId: 'j1', email: 'A@x.lk' }];
  assert.equal(triggeredEnrolments({ journeys: [wonJourney], deals, enrolments, now: NOW }).length, 0);
});

t('events outside the lookback window, open deals and journeys without a trigger are ignored', () => {
  const deals = [{ email: 'a@x.lk', stage: 'closed_won', lastUpdate: ago(9) }, { email: 'b@x.lk', stage: 'proposal', lastUpdate: ago(1) }];
  assert.equal(triggeredEnrolments({ journeys: [wonJourney], deals, now: NOW }).length, 0);
  assert.equal(triggeredEnrolments({ journeys: [{ ...wonJourney, trigger: '' }], deals: [{ email: 'a@x.lk', stage: 'closed_won', lastUpdate: ago(1) }], now: NOW }).length, 0);
});

t('a paid invoice and a resolved question each trigger their own journey', () => {
  const journeys = [{ id: 'pay', trigger: 'invoice_paid', createdAt: SAVED }, { id: 'help', trigger: 'ticket_resolved', createdAt: SAVED }];
  const out = triggeredEnrolments({
    journeys,
    invoices: [{ email: 'c@x.lk', status: 'paid', paidAt: ago(1) }, { email: 'd@x.lk', status: 'open', paidAt: '' }],
    tickets: [{ customerEmail: 'e@x.lk', resolvedAt: ago(1) }],
    now: NOW,
  });
  assert.deepEqual(out.map((x) => `${x.journeyId}:${x.email}`).sort(), ['help:e@x.lk', 'pay:c@x.lk']);
});

t('broken email addresses are skipped, and one run enrols at most 50', () => {
  const deals = [{ email: 'not-an-email', stage: 'closed_won', lastUpdate: ago(1) }];
  assert.equal(triggeredEnrolments({ journeys: [wonJourney], deals, now: NOW }).length, 0);
  const many = Array.from({ length: 80 }, (_, i) => ({ email: `p${i}@x.lk`, stage: 'closed_won', lastUpdate: ago(1) }));
  assert.equal(triggeredEnrolments({ journeys: [wonJourney], deals: many, now: NOW }).length, 50);
});

t('the daily job enrols from triggers, and the owner saves the trigger with the journey', () => {
  const daily = fs.readFileSync('lib/server/daily-ops.js', 'utf8');
  assert.ok(daily.includes('enrolFromTriggers(db, uid, { now })'));
  const save = fs.readFileSync('lib/server/journeys.js', 'utf8');
  assert.ok(save.includes("trigger: trigger || ''"));
});

t('new enrolments wait for consent: auto-send holds them until the owner confirms', () => {
  const src = fs.readFileSync('lib/server/journey-triggers.js', 'utf8');
  assert.ok(src.includes('consentConfirmedAt: null'));
  assert.ok(src.includes("isBlockedContact(db, uid, p.email, 'marketing')"));
});

console.log(`gap-close-301: ${n} checks passed`);
