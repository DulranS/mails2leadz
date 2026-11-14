// Battle card (Pass 273): built only from catalogue facts; never invents stock; parsed into parts, with nothing made up when a part is missing.
import assert from 'node:assert/strict';
import { buildBattleCard, parseBattleCard } from '../lib/battle-card.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };
const now = Date.parse('2026-11-14T10:00:00Z');

t('the prompt carries the catalogue facts and the rule against inventing stock', () => {
  const p = buildBattleCard({ customerName: 'Ann', customerMessage: 'Do you have the blue mug?', keyword: 'mug', catalogItems: [{ kind: 'product', name: 'Blue mug', price: 1500, stock: 2 }], now });
  assert.match(p.prompt, /Blue mug at 1500 \(only 2 left\)/);
  assert.match(p.system, /Never invent/);
});

t('with no catalogue, the prompt says not to invent anything', () => {
  assert.match(buildBattleCard({ catalogItems: [], now }).prompt, /Do not invent any product/);
});

t('the card is read into its parts, with the objections and the closer tip', () => {
  const card = parseBattleCard(`LEAD SNAPSHOT
Ann wants a mug for a gift and asked about stock today.

TOP 3 SELLING POINTS
1. Two left at 1500, so a gift can be sent this week.
2. Dishwasher safe, which suits an everyday gift.
3. Matches the blue set she already owns.

OBJECTION 1: Too expensive for a gift
Why: Worried about overspending on someone else.
Script: It is the price of a nice lunch, and it is the one she will use every day.

OBJECTION 2: Want to think about it
Why: Does not want to rush the decision.
Script: Take your time, I will hold the last two until Friday if that helps.

CLOSER TIP
She mentioned the gift is for a birthday, so ask the date first.`);
  assert.equal(card.sellingPoints.length, 3);
  assert.equal(card.objections.length, 2);
  assert.equal(card.objections[0].name, 'Too expensive for a gift');
  assert.match(card.closerTip, /birthday/);
});

t('a missing part comes back empty, not made up', () => {
  const card = parseBattleCard('LEAD SNAPSHOT\nOne line only.');
  assert.deepEqual(card.objections, []);
  assert.equal(card.closerTip, '');
});

console.log(`\n${n} passed`);
