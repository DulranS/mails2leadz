// Niche scoreboard: category cleaning, per-niche stats, honest verdicts, evidence lines for the AI target finder.
import assert from 'node:assert/strict';
import { cleanNiche, nicheFields, computeNicheStats, nicheEvidenceLines, MIN_PER_NICHE } from '../lib/niche.js';

// ---- cleaning ----
assert.equal(cleanNiche('Plumber'), 'plumber');
assert.equal(cleanNiche('  Dental   Clinic ; Dentist '), 'dental clinic');
assert.equal(cleanNiche('plumbers | Colombo'), 'plumbers');
assert.equal(cleanNiche('craft_plumber'), 'craft plumber');
assert.equal(cleanNiche('Hair & Beauty,Salon'), 'hair & beauty');
for (const bad of ['', '   ', '12345', 'https://x.lk', 'info@acme.lk', 'www.acme.lk', null, undefined, 42, '--', 'a']) assert.equal(cleanNiche(bad), '', String(bad));
assert.equal(cleanNiche('x'.repeat(100)).length, 40);
assert.deepEqual(nicheFields('Roofer'), { category: 'roofer' });
assert.deepEqual(nicheFields('12'), {});
assert.equal(cleanNiche('line one\nline two'), 'line one line two');

// ---- stats ----
const T = 1_700_000_000_000;
const mk = (n, cat, { replied = 0, t = T } = {}) => Array.from({ length: n }, (_, i) => ({ to: `${cat}${i}@x.lk`, category: cat, replied: i < replied, t: t + i }));
const emails = [...mk(12, 'plumbers', { replied: 4 }), ...mk(12, 'dentists', { replied: 1 }), ...mk(3, 'roofers', { replied: 1 })];
const deals = new Map([
  ['plumbers0@x.lk', { stage: 'closed_won', value: 1500 }],
  ['plumbers1@x.lk', { stage: 'qualified', value: 900 }],
  ['dentists0@x.lk', { stage: 'closed_lost', value: 500, reached: ['qualified'] }],
  ['roofers0@x.lk', { stage: 'closed_won', value: 700 }],
]);
const s = computeNicheStats({ emails, dealsByEmail: deals });
assert.equal(s.active, true);
assert.equal(s.totalLeads, 27);
const by = Object.fromEntries(s.rows.map((r) => [r.niche, r]));
assert.deepEqual([by.plumbers.leads, by.plumbers.replied, by.plumbers.qualified, by.plumbers.won, by.plumbers.revenue], [12, 4, 2, 1, 1500]);
assert.equal(by.dentists.qualified, 1, 'a lost deal that reached qualified still counted as an opportunity');
assert.equal(by.roofers.enough, false);
assert.equal(by.plumbers.enough, true);
assert.equal(s.rows[0].niche, 'plumbers', 'highest revenue first');
assert.deepEqual(s.verdict, { niche: 'plumbers', gapPoints: 25 }, '33% vs 8% reply rate');
assert.deepEqual(s.proven.map((p) => p.niche).sort(), ['plumbers', 'roofers']);

// a verdict needs two niches with enough leads and a clear gap
assert.equal(computeNicheStats({ emails: mk(12, 'plumbers', { replied: 4 }) }).verdict, null);
assert.equal(computeNicheStats({ emails: [...mk(12, 'a1', { replied: 3 }), ...mk(12, 'b1', { replied: 3 })] }).verdict, null);
assert.equal(computeNicheStats({ emails: [...mk(MIN_PER_NICHE, 'a1', { replied: 5 }), ...mk(MIN_PER_NICHE - 1, 'b1', { replied: 0 })] }).verdict, null, 'one niche is below the minimum');

// a lead is counted once, in the niche of their FIRST email; a reply to a later email counts
const multi = computeNicheStats({ emails: [
  { to: 'a@x.lk', category: 'dentists', replied: false, t: 2 },
  { to: 'A@x.lk', category: 'plumbers', replied: true, t: 1 },
  { to: 'a@x.lk', category: '', replied: true, t: 3 },
] });
assert.equal(multi.rows.length, 1);
assert.deepEqual([multi.rows[0].niche, multi.rows[0].leads, multi.rows[0].replied], ['plumbers', 1, 1]);

// an email with no date is never treated as the earliest one
const undated = computeNicheStats({ emails: [{ to: 'u@x.lk', category: 'cafes' }, { to: 'u@x.lk', category: 'bakers', t: 5 }] });
assert.equal(undated.rows[0].niche, 'bakers');

// emails with no usable category are counted as uncategorised, not hidden and not guessed
const mix = computeNicheStats({ emails: [{ to: 'n1@x.lk', t: 1 }, { to: 'n2@x.lk', category: '123', t: 1 }, { to: 'n3@x.lk', category: 'cafes', t: 1 }, { to: 'n3@x.lk', t: 2 }] });
assert.equal(mix.uncategorised, 2);
assert.equal(mix.totalLeads, 1);
assert.equal(computeNicheStats({ emails: [{ to: 'x@x.lk' }] }).active, false);
assert.equal(computeNicheStats().active, false);
assert.equal(computeNicheStats({ emails: [{ to: '', category: 'cafes' }, null, undefined].filter(Boolean) }).active, false);

// ---- evidence lines for the AI ----
const lines = nicheEvidenceLines(s);
assert.equal(lines[0], 'plumbers: 12 emailed, 4 replied (33%), 1 won');
assert.ok(lines.some((l) => l.startsWith('roofers:')), 'a niche with a sale is evidence even with few emails');
assert.ok(lines.some((l) => l.startsWith('dentists:')), 'a niche with enough emails is evidence even with no sale');
assert.deepEqual(nicheEvidenceLines(computeNicheStats({ emails: mk(4, 'cafes') })), [], 'four emails and no sale is not evidence');
assert.deepEqual(nicheEvidenceLines(null), []);
assert.equal(nicheEvidenceLines(s, { max: 1 }).length, 1);

console.log('niche tests passed');

// ---- profit per kind of business (only from costs the owner entered) ----
{
  const em = [...mk(2, 'plumbers'), ...mk(2, 'dentists')];
  const wonDeal = (value, deliveryCost) => ({ stage: 'closed_won', value, deliveryCost, reached: [] });
  const deals = new Map([
    ['plumbers0@x.lk', wonDeal(1000, 400)],
    ['plumbers1@x.lk', wonDeal(500, null)],     // cost not entered: never guessed
    ['dentists0@x.lk', wonDeal(800, 0)],         // zero is a real answer
  ]);
  const s = computeNicheStats({ emails: em, dealsByEmail: deals });
  const plumbers = s.rows.find((r) => r.niche === 'plumbers');
  assert.equal(plumbers.revenue, 1500);
  assert.equal(plumbers.costedWon, 1);
  assert.equal(plumbers.profit, 600);          // only the costed win counts toward profit
  assert.equal(plumbers.marginPct, 60);
  const dentists = s.rows.find((r) => r.niche === 'dentists');
  assert.equal(dentists.profit, 800);
  assert.equal(dentists.marginPct, 100);
  const none = computeNicheStats({ emails: mk(2, 'roofers'), dealsByEmail: new Map([['roofers0@x.lk', wonDeal(300, null)]]) }).rows[0];
  assert.equal(none.profit, null);
  assert.equal(none.marginPct, null);
  assert.match(nicheEvidenceLines(s).join(' '), /60% margin on the 1 with costs entered/);
  assert.doesNotMatch(nicheEvidenceLines(computeNicheStats({ emails: mk(2, 'roofers'), dealsByEmail: new Map([['roofers0@x.lk', wonDeal(300, null)]]) })).join(' '), /margin/);
}
console.log('niche profit tests passed');
