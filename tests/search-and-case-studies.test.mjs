// Search and case studies (Pass 208): search opportunities are read from the owner's own data; case studies need written agreement and never invent a number.
import assert from 'node:assert/strict';
import { parseSearchRows, opportunities } from '../lib/seo-insights.js';
import { consentedWins, parseCaseStudy, caseStudyPrompt } from '../lib/case-study.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a search row is read; rows without a query are dropped', () => {
  const r = parseSearchRows({ rows: [{ keys: ['dental clinic colombo'], clicks: 3, impressions: 120, ctr: 0.025, position: 8.4 }, { clicks: 1 }] });
  assert.equal(r.length, 1);
  assert.equal(r[0].query, 'dental clinic colombo');
});

t('an opportunity is a search close to page one with real demand, or seen often and clicked rarely', () => {
  const rows = [
    { query: 'page two term', impressions: 80, ctr: 0.02, position: 9 },
    { query: 'bad title', impressions: 300, ctr: 0.004, position: 2 },
    { query: 'too small', impressions: 10, ctr: 0.0, position: 6 },
    { query: 'already first', impressions: 500, ctr: 0.4, position: 1 },
  ];
  assert.deepEqual(opportunities(rows).map((o) => o.query), ['bad title', 'page two term']);
});

t('only customers who agreed in writing are featured', () => {
  const won = consentedWins([
    { stage: 'closed_won', email: 'a@x.com', caseStudyConsent: true },
    { stage: 'closed_won', email: 'b@x.com' },
    { stage: 'closed_lost', email: 'c@x.com', caseStudyConsent: true },
  ]);
  assert.deepEqual(won.map((d) => d.email), ['a@x.com']);
});

t('a draft is kept only if every number in it was already in the notes; placeholders are fine', () => {
  const facts = 'Customer: Ann Clinic\nNote: They booked 12 patients a week after the new system.';
  assert.equal(parseCaseStudy({ title: 'Ann Clinic books more', challenge: 'Missed calls', solution: 'A booking system', result: 'About 12 patients a week, and [CUSTOMER QUOTE]' }, facts).ok, true);
  assert.match(parseCaseStudy({ title: 'Ann Clinic', challenge: 'Missed calls', solution: 'A system', result: 'Grew 40% in a month' }, facts).error, /not in your notes/);
  assert.match(parseCaseStudy({ title: '', solution: '' }, facts).error, /incomplete/);
});

t('the prompt carries only the facts the owner has, and says so', () => {
  const p = caseStudyPrompt({ businessName: 'Ann Clinic', product: 'Booking system' }, [{ summary: 'Happy with it' }]);
  assert.match(p.facts, /Customer: Ann Clinic/);
  assert.match(p.prompt, /from these facts only/);
});

console.log(`\n${n} passed`);
