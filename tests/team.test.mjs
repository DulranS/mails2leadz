import assert from 'node:assert/strict';
import { sanitizeTeam, cleanOwnerId, computeTeam, MAX_MEMBERS } from '../lib/team.js';
import { buildDealWrite } from '../lib/deal-utils.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = Date.parse('2026-10-20T06:00:00Z');

t('team list: names required, ids made once and kept, duplicates get unique ids, role and commission clamped, capped at 8', () => {
  const s = sanitizeTeam([{ name: ' Aqeel  Khan ', role: 'inbound', commissionPct: 5 }, { name: 'Sam', role: 'wizard', commissionPct: 99 }, { name: 'Sam', commissionPct: -3 }, { name: '' }, null, { id: 'keep-me', name: 'Nimal', commissionPct: '12.34' }]);
  assert.deepEqual(s.map((m) => m.id), ['aqeel-khan', 'sam', 'sam-2', 'keep-me']);
  assert.deepEqual(s.map((m) => m.role), ['inbound', 'other', 'other', 'other']);
  assert.deepEqual(s.map((m) => m.commissionPct), [5, 50, 0, 12.3]);
  assert.equal(s[0].name, 'Aqeel Khan');
  assert.equal(sanitizeTeam(Array.from({ length: 20 }, (_, i) => ({ name: `P${i}` }))).length, MAX_MEMBERS);
  assert.deepEqual(sanitizeTeam('nope'), []);
  assert.equal(cleanOwnerId('aqeel-khan'), 'aqeel-khan'); assert.equal(cleanOwnerId('Bad Id!'), ''); assert.equal(cleanOwnerId(null), '');
});
t('a deal can carry an owner (set, changed and cleared) without touching anything else', () => {
  const now = new Date(NOW);
  const w = buildDealWrite({ uid: 'u', email: 'A@x.lk', stage: 'qualified', ownerId: 'sam', now });
  assert.equal(w.ownerId, 'sam');
  const existing = { email: 'a@x.lk', stage: 'qualified', ownerId: 'sam', createdAt: 'c' };
  assert.equal('ownerId' in buildDealWrite({ uid: 'u', email: 'a@x.lk', existing, stage: 'demo', now }), false); // untouched when not given
  assert.equal(buildDealWrite({ uid: 'u', email: 'a@x.lk', existing, ownerId: 'nimal', now }).ownerId, 'nimal');
  assert.equal(buildDealWrite({ uid: 'u', email: 'a@x.lk', existing, ownerId: '', now }).ownerId, null);
  assert.equal(buildDealWrite({ uid: 'u', email: 'a@x.lk', existing, ownerId: 'Bad Id!', now }).ownerId, null);
});
const members = sanitizeTeam([{ name: 'Sam', role: 'bdr', commissionPct: 10 }, { name: 'Aqeel', role: 'inbound', commissionPct: 5 }]);
const deals = [
  { email: 'a@x.lk', stage: 'closed_won', value: 1000, ownerId: 'sam' }, { email: 'b@x.lk', stage: 'retention', value: 500, ownerId: 'sam' },
  { email: 'c@x.lk', stage: 'qualified', value: 2000, ownerId: 'sam' }, { email: 'd@x.lk', stage: 'closed_lost', value: 300, ownerId: 'sam' },
  { email: 'e@x.lk', stage: 'closed_won', value: 800, ownerId: 'aqeel' }, { email: 'f@x.lk', stage: 'closed_won', value: 400 }, { email: 'g@x.lk', stage: 'demo', value: 100, ownerId: 'gone' },
];
const inv = (email, amount, status, paidAt) => ({ email, amount, status, paidAt });
t('report: pipeline and wins per person; unknown or missing owners fall to Unassigned; win rate only from decided deals', () => {
  const r = computeTeam({ deals, members, now: NOW });
  const sam = r.rows.find((x) => x.id === 'sam'); const aq = r.rows.find((x) => x.id === 'aqeel');
  assert.deepEqual([sam.open, sam.openValue, sam.won, sam.wonValue, sam.lost], [1, 2000, 2, 1500, 1]);
  assert.equal(sam.winRate, 2 / 3); assert.equal(aq.winRate, 1); assert.deepEqual([aq.open, aq.won], [0, 1]);
  assert.deepEqual([r.unassigned.won, r.unassigned.wonValue, r.unassigned.open], [1, 400, 1]); // f (no owner) and g (owner no longer in the team)
  assert.equal(r.any, true); assert.equal(computeTeam({ deals, members: [], now: NOW }).any, false);
});
t('commission is on cash COLLECTED (paid invoices): this month and all time; unpaid, void and unowned money earns nothing', () => {
  const invoices = [
    inv('a@x.lk', 1000, 'paid', '2026-10-05T00:00:00Z'), inv('b@x.lk', 250, 'paid', '2026-09-20T00:00:00Z'), inv('c@x.lk', 700, 'sent', null), inv('a@x.lk', 90, 'void', null),
    inv('e@x.lk', 800, 'paid', '2026-10-19T00:00:00Z'), inv('f@x.lk', 400, 'paid', '2026-10-02T00:00:00Z'), inv('A@X.LK', 100.555, 'paid', '2026-10-06T00:00:00Z'),
  ];
  const r = computeTeam({ deals, invoices, members, now: NOW });
  const sam = r.rows.find((x) => x.id === 'sam'); const aq = r.rows.find((x) => x.id === 'aqeel');
  assert.deepEqual([sam.collected, sam.collectedMonth], [1350.56, 1100.56]);
  assert.equal(sam.commissionMonth, 110.06); assert.equal(sam.commissionAll, 135.06);
  assert.deepEqual([aq.collectedMonth, aq.commissionMonth], [800, 40]);
  assert.equal(r.unassigned.collected, 400); // paid, but nobody owns it
  assert.equal(r.commissionMonthTotal, 150.06);
  assert.equal(computeTeam({ deals, invoices: [inv('a@x.lk', 0, 'paid', '2026-10-05T00:00:00Z'), inv('a@x.lk', 50, 'paid', null)], members, now: NOW }).rows[0].collected, 0);
});
console.log(`\n${n} team tests ok`);
