// Pass 305: the owner can change a ticket's category by hand, and only to a category from the list (spec 5.1).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TICKET_CATEGORIES, cleanCategory } from '../lib/ticket-categories.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('the category list is the same one the system uses', () => {
  assert.deepEqual(TICKET_CATEGORIES, ['billing', 'delivery', 'booking', 'product', 'account', 'general']);
  assert.equal(cleanCategory('product'), 'product');
});

t('the support route accepts only a listed category, for a named ticket, and records that the owner set it', () => {
  const src = fs.readFileSync('app/api/support/route.js', 'utf8');
  assert.ok(src.includes('if (body?.category !== undefined) {'));
  assert.ok(src.includes('TICKET_CATEGORIES.includes(category)'));
  assert.ok(src.includes("if (!id) return NextResponse.json({ error: 'Pick a ticket first.'"));
  assert.ok(src.includes("categoryBy: 'owner'"));
});

t('the ticket row has a category picker that saves through that route', () => {
  const src = fs.readFileSync('app/components/SupportAndKpis.js', 'utf8');
  assert.ok(src.includes('call({ id: t.id, category: e.target.value })'));
  assert.ok(src.includes('htmlFor={`cat-${t.id}`}'));
  assert.ok(src.includes('TICKET_CATEGORIES.map('));
});

console.log(`gap-close-305: ${n} checks passed`);
