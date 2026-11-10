// Gaps closed (Pass 212): rental texts only to agreed customers; objectives measured from real figures; competitor prices; referral asks; account outreach; creator brief; a real PowerPoint deck.
import assert from 'node:assert/strict';
import { rentalText, rentalTextsDue } from '../lib/rental-texts.js';
import { okrProgress } from '../lib/okr.js';
import { positionVs, parseCompetitorLines } from '../lib/competitor.js';
import { referralAsks, referralCode } from '../lib/referral.js';
import { abmActions, parseAccounts } from '../lib/abm.js';
import { ugcBrief } from '../lib/ugc.js';
import { deckPptx } from '../lib/pptx-deck.js';
import { deckSlides } from '../lib/deck.js';

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ok -', name); };
const DAY = 86400000, now = Date.parse('2026-11-06T12:00:00Z');

await t('a rental text is built only for a customer who agreed to texts, and only near the end time', async () => {
  const end = now + 60 * 60000;
  const b = { status: 'confirmed', textConsent: true, phone: '+94770000000', name: 'Ann Perera', startIso: new Date(end - 120 * 60000).toISOString(), minutes: 120 };
  assert.equal(rentalText(b, now).kind, 'extension');
  assert.equal(rentalText({ ...b, textConsent: false }, now), null);
  assert.equal(rentalText({ ...b, startIso: new Date(now - 300 * 60000).toISOString(), minutes: 60 }, now), null, 'already ended, not near');
  assert.equal(rentalTextsDue([{ id: 'x', ...b }], now)[0].id, 'x');
});

await t('objectives are measured from real figures; a missing figure is not measured, never zero', async () => {
  const p = okrProgress([{ objective: 'Grow', keyResults: [{ metric: 'win_rate', target: 50 }, { metric: 'ltv', target: 100 }, { metric: 'nope', target: 1 }] }], { sales: { winRatePct: 25 } }, { ltv: null });
  assert.equal(p[0].keyResults[0].pct, 50);
  assert.equal(p[0].keyResults[1].measured, false);
  assert.equal(p[0].keyResults[2].label, 'Unknown measure');
});

await t('a competitor comparison uses only the prices entered, and bad lines are counted', async () => {
  const pos = positionVs(90, [100, 110, 120]);
  assert.equal(pos.verdict, 'well_below');
  assert.equal(parseCompetitorLines('Acme, Basic plan, 100\nbad line\nBeta, Basic, 1,200').skipped, 1);
  assert.equal(parseCompetitorLines('Beta, Basic, 1,200').rows[0].price, 1200);
});

await t('referral asks go only to settled, happy customers, and not twice in 90 days', async () => {
  const deals = [
    { stage: 'closed_won', email: 'old@x.com', businessName: 'Old Co', stageTimes: { closed_won: new Date(now - 90 * DAY).toISOString() } },
    { stage: 'closed_won', email: 'new@x.com', stageTimes: { closed_won: new Date(now - 10 * DAY).toISOString() } },
    { stage: 'closed_won', email: 'unhappy@x.com', stageTimes: { closed_won: new Date(now - 90 * DAY).toISOString() } },
  ];
  const asks = referralAsks(deals, [{ customerEmail: 'unhappy@x.com', status: 'open' }], {}, now);
  assert.deepEqual(asks.map((a) => a.email), ['old@x.com']);
  assert.equal(asks[0].code, referralCode('old@x.com'));
  assert.equal(referralAsks(deals, [{ customerEmail: 'unhappy@x.com', status: 'open' }], { 'old@x.com': new Date(now - 10 * DAY).toISOString() }, now).length, 0, 'asked ten days ago: not again yet');
});

await t('an account with no contact, or quiet for two weeks, gets an action; won accounts do not', async () => {
  const acts = abmActions([{ name: 'Big Co', stage: 'open' }, { name: 'Quiet Ltd', stage: 'open', lastTouchAt: new Date(now - 20 * DAY).toISOString() }, { name: 'Done', stage: 'won' }], now);
  assert.deepEqual(acts.map((a) => a.name), ['Big Co', 'Quiet Ltd']);
  assert.equal(parseAccounts('Big Co | ceo@big.com\n\nQuiet Ltd')[0].contact, 'ceo@big.com');
});

await t('the creator brief is built from the owner\'s offer and asks for permission and no invented results', async () => {
  const b = ugcBrief({ businessName: 'Ann Clinic', offer: 'Booking system', idealCustomer: 'clinics' });
  assert.match(b, /Ann Clinic/);
  assert.match(b, /no invented results/);
});

await t('the PowerPoint deck is a real Office file with one slide part per slide', async () => {
  const buf = await deckPptx(deckSlides({ businessName: 'Ann Clinic', offer: 'Booking system' }), 'Ann Clinic pitch');
  assert.equal(buf.slice(0, 2).toString('latin1'), 'PK');
  const s = buf.toString('latin1');
  assert.ok(s.includes('ppt/slides/slide7.xml'), 'seven slides');
  assert.ok(!s.includes('ppt/slides/slide8.xml'));
});

console.log(`\n${n} passed`);
