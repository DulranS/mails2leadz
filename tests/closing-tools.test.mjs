import assert from 'node:assert/strict';
import { reviveCheck, daysQuiet, REVIVE_AFTER_DAYS, REVIVABLE_REASONS } from '../lib/deal-utils.js';
import { proposalProblem, moneyAmountsIn } from '../lib/deal-extras.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000;
const now = Date.parse('2026-06-01T12:00:00Z');
const ago = (d) => new Date(now - d * DAY).toISOString();

t('daysQuiet: the later of last update and last contact wins; unknown dates give null', () => {
  assert.equal(daysQuiet({ lastUpdate: ago(80) }, now), 80);
  assert.equal(daysQuiet({ lastUpdate: ago(80), lastTouchAt: ago(10) }, now), 10); // you wrote to them recently
  assert.equal(daysQuiet({ lastUpdate: now - 3 * DAY }, now), 3);                  // numeric timestamps work too
  assert.equal(daysQuiet({}, now), null);
  assert.equal(daysQuiet({ lastUpdate: 'garbage' }, now), null);
  assert.equal(daysQuiet({ lastUpdate: ago(-2) }, now), 0);                        // a date in the future is never negative
});

t('reviveCheck: only price / timing / silence, only when lost, only after the wait', () => {
  assert.deepEqual([...REVIVABLE_REASONS].sort(), ['no_response', 'price', 'timing']);
  for (const lostReason of REVIVABLE_REASONS) assert.equal(reviveCheck({ stage: 'closed_lost', lostReason, quietDays: REVIVE_AFTER_DAYS }).ok, true);
  assert.equal(reviveCheck({ stage: 'lost', lostReason: 'timing', quietDays: 90 }).ok, true); // old stage name still means lost
  assert.equal(reviveCheck({ stage: 'proposal', lostReason: 'timing', quietDays: 90 }).code, 'NOT_LOST');
  assert.equal(reviveCheck({ stage: 'closed_won', lostReason: '', quietDays: 90 }).code, 'NOT_LOST');
  assert.equal(reviveCheck({ stage: 'closed_lost', lostReason: 'timing', quietDays: REVIVE_AFTER_DAYS - 1 }).code, 'TOO_SOON');
  assert.equal(reviveCheck({ stage: 'closed_lost', lostReason: 'timing', quietDays: null }).ok, true); // unknown date: do not block forever
});

t('reviveCheck: a plain no, no need, other, opt-out and bounce are all respected', () => {
  for (const lostReason of ['not_interested', 'no_need', 'other', 'competitor', '', undefined]) assert.equal(reviveCheck({ stage: 'closed_lost', lostReason, quietDays: 400 }).code, 'NOT_REVIVABLE', String(lostReason));
  for (const lostReason of ['unsubscribed', 'bounced']) assert.equal(reviveCheck({ stage: 'closed_lost', lostReason, quietDays: 400 }).code, 'OPTED_OUT');
  assert.equal(reviveCheck({ stage: 'closed_lost', lostReason: 'timing', quietDays: 400, optedOut: true }).code, 'OPTED_OUT'); // on the suppression list
  assert.match(reviveCheck({ stage: 'closed_lost', lostReason: 'no_need', quietDays: 400 }).reason, /respected/);
});

t('proposalProblem: a made-up price, a promise, or a stub is refused; a clean proposal passes', () => {
  const body = (extra = '') => `Hi Sam,\n\nWhat we understood: you need your weekly reporting to stop eating Fridays.\nWhat we will do: set up the reporting service described in our offer.\nInvestment: ${extra || '[price to confirm]'}\nNext step: a 20 minute call to confirm the start date.\n\nBest,\nDulran`;
  assert.equal(proposalProblem({ subject: 'Proposal for Acme', body: body(), priceSet: false }), '');
  assert.equal(proposalProblem({ subject: 'Proposal for Acme', body: body('$1,500'), priceSet: true }), '');            // price came from the deal
  assert.equal(proposalProblem({ subject: 'Proposal', body: body('$1,500'), priceSet: false }), 'INVENTED_PRICE');
  assert.equal(proposalProblem({ subject: 'Proposal', body: body('LKR 150,000'), priceSet: false }), 'INVENTED_PRICE');
  assert.equal(proposalProblem({ subject: 'Proposal', body: body('Rs. 90000'), priceSet: false }), 'INVENTED_PRICE');
  assert.equal(proposalProblem({ subject: 'Proposal', body: body('1500 USD'), priceSet: false }), 'INVENTED_PRICE');
  assert.equal(proposalProblem({ subject: 'Proposal', body: body() + '\nWe guarantee results in 30 days.', priceSet: true }), 'PROMISE');
  assert.equal(proposalProblem({ subject: 'Proposal', body: body() + '\nA 10% off launch discount applies.', priceSet: true }), 'PROMISE');
  assert.equal(proposalProblem({ subject: '', body: body(), priceSet: true }), 'TOO_SHORT');
  assert.equal(proposalProblem({ subject: 'Proposal', body: 'Hi, short.', priceSet: true }), 'TOO_SHORT');
  assert.equal(proposalProblem({ subject: 'Proposal', body: body('a 20 minute call and 3 steps'), priceSet: false }), ''); // plain numbers are not prices
});

t('proposalProblem: when a price WAS given, only that price may appear (a different amount is refused, the same one in any format passes)', () => {
  const body = (price) => `Hi Sam,\n\nWhat we understood: you need weekly reporting to stop eating Fridays.\nWhat we will do: set up the reporting service described in our offer.\nInvestment: ${price}\nNext step: a 20 minute call to confirm the start date.\n\nBest,\nDulran`;
  const ok = (price, txt) => proposalProblem({ subject: 'Proposal', body: body(txt), priceSet: true, price });
  assert.equal(ok(1500, '$1,500'), '');
  assert.equal(ok(1500, '$1,500.'), '');
  assert.equal(ok(1500, '1500 USD per month'), '');
  assert.equal(ok(150000, 'LKR 150,000'), '');
  assert.equal(ok(90000, 'Rs. 90000'), '');
  assert.equal(ok(1500, '$1,800'), 'WRONG_PRICE');
  assert.equal(ok(1500, '$1,500 now, then $750 a month'), 'WRONG_PRICE');
  assert.equal(ok(150000, 'LKR 15,000'), 'WRONG_PRICE');
  assert.equal(ok(1500, '$18,000 per year'), 'WRONG_PRICE');
  assert.equal(ok(1500, 'a 20 minute call and 3 steps'), ''); // plain numbers are not prices
  assert.equal(proposalProblem({ subject: 'P', body: body('$1,800'), priceSet: true }), ''); // no price passed in: the check cannot run, so it stays as before
  assert.deepEqual(moneyAmountsIn('Rs. 90,000 or 1500 USD or $2,000.50 in 30 days').sort((a, b) => a - b), [1500, 2000.5, 90000]);
});

console.log(`closing-tools: ${n} passed`);
