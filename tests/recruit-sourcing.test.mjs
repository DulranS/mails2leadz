// Recruitment sourcing (pass 331): brief, scoring, screening. Run: node tests/recruit-sourcing.test.mjs
import assert from 'node:assert/strict';
import { addOneMonthIso, normaliseBrief, scoreCandidate, prepareCandidates } from '../lib/recruit-sourcing.js';

let n = 0;
const t = (name, fn) => { fn(); n++; };
const brief = normaliseBrief({ role: 'Senior backend engineer', mustHave: 'node, postgres', niceToHave: 'kubernetes, aws', location: 'Colombo', excludeCompanies: 'Acme' });

t('brief keeps the lists and drops blanks', () => {
  assert.deepEqual(brief.mustHave, ['node', 'postgres']);
  assert.deepEqual(brief.niceToHave, ['kubernetes', 'aws']);
  assert.equal(normaliseBrief({ minScore: 250 }).minScore, 100);
  assert.equal(normaliseBrief({ minScore: 'x' }).minScore, 0);
});

t('scores whole words only', () => {
  assert.equal(scoreCandidate('node and postgres', brief).score, 70);
  assert.equal(scoreCandidate('nodejs and postgresql', brief).matched.length, 0);
  assert.equal(scoreCandidate('node, postgres, kubernetes, aws', brief).score, 100);
  assert.deepEqual(scoreCandidate('node', brief).missing, ['postgres']);
});

t('keeps a contactable candidate with a basis, scored and ordered', () => {
  const res = prepareCandidates([
    { Name: 'Ann', Title: 'Engineer', Skills: 'node, postgres', Email: 'ann@example.com' },
    { Name: 'Ben', Title: 'Engineer', Skills: 'node', Email: 'ben@example.com' },
  ], brief, { source: 'ATS export', lawfulBasis: 'applied to us' });
  assert.equal(res.error, '');
  assert.equal(res.rows.length, 2);
  assert.equal(res.rows[0].name, 'Ann');
  assert.match(res.rows[0].category, /100% fit|70% fit/);
});

t('refuses without a source or lawful basis', () => {
  assert.ok(prepareCandidates([{ name: 'A', email: 'a@x.com' }], brief, { lawfulBasis: 'x' }).error);
  assert.ok(prepareCandidates([{ name: 'A', email: 'a@x.com' }], brief, { source: 'x' }).error);
});

t('screens out no name, no contact, opt-outs, excluded companies, low scores', () => {
  const res = prepareCandidates([
    { Name: '', Email: 'a@x.com' },
    { Name: 'NoContact', Skills: 'node' },
    { Name: 'OptedOut', Email: 'o@x.com', Consent: 'no' },
    { Name: 'Excluded', Email: 'e@x.com', Company: 'Acme Ltd', Skills: 'node' },
    { Name: 'Weak', Email: 'w@x.com', Skills: 'python' },
    { Name: 'Good', Email: 'g@x.com', Skills: 'node postgres' },
  ], brief, { source: 'list', lawfulBasis: 'consent given' });
  assert.equal(res.rows.length, 2);
  assert.equal(res.stats.noName, 1);
  assert.equal(res.stats.noContact, 1);
  assert.equal(res.stats.optedOut, 1);
  assert.equal(res.stats.excludedCompany, 1);
  assert.equal(res.rejected.length, 4);
});

t('minimum score is applied', () => {
  const strict = normaliseBrief({ role: 'x', mustHave: 'node, postgres', minScore: 90 });
  const res = prepareCandidates([{ Name: 'Half', Email: 'h@x.com', Skills: 'node' }], strict, { source: 's', lawfulBasis: 'b' });
  assert.equal(res.rows.length, 0);
  assert.equal(res.stats.belowMinScore, 1);
});

t('bad email and phone are dropped, a profile URL is kept', () => {
  const res = prepareCandidates([{ Name: 'Profile', Email: 'not-an-email', Linkedin: 'https://linkedin.com/in/x', Skills: 'node' }], brief, { source: 's', lawfulBasis: 'b' });
  assert.equal(res.rows[0].email, '');
  assert.equal(res.rows[0].website, 'https://linkedin.com/in/x');
});


t('privacy notice date is one calendar month on, clamped to month end', () => {
  assert.equal(addOneMonthIso('2026-11-18'), '2026-12-18');
  assert.equal(addOneMonthIso('2026-12-15'), '2027-01-15');
  assert.equal(addOneMonthIso('2026-01-31'), '2026-02-28');
});

t('the notice date is returned for the notice record, not written into the category text', () => {
  const res = prepareCandidates([{ Name: 'Dana', Email: 'd@x.com', Title: 'Engineer', Skills: 'node' }], brief, { source: 's', lawfulBasis: 'b', now: '2026-11-18' });
  assert.equal(res.noticeBy, '2026-12-18');
  assert.ok(!res.rows[0].category.includes('privacy notice'));
});

console.log(`recruit sourcing: ${n} checks passed`);
