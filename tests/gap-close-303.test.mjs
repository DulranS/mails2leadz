// Pass 303: each support question gets a category from the customer's words, and the owner sees the counts (spec 5.1).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { categoryFor, cleanCategory, categoryCounts, TICKET_CATEGORIES } from '../lib/ticket-categories.js';
import { ticketFor, supportKpis } from '../lib/support.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = Date.parse('2026-11-15T06:00:00Z');

t('a question is sorted by what the customer says', () => {
  assert.equal(categoryFor('I was overcharged on my last invoice'), 'billing');
  assert.equal(categoryFor('My parcel has not arrived yet'), 'delivery');
  assert.equal(categoryFor('I need to reschedule my appointment'), 'booking');
  assert.equal(categoryFor("The unit is broken when it arrived"), 'product');
  assert.equal(categoryFor("I can't log in to my account"), 'account');
});

t('a question that matches nothing is general, and empty text is general', () => {
  assert.equal(categoryFor('Hello, just saying hi'), 'general');
  assert.equal(categoryFor(''), 'general');
  assert.equal(categoryFor(undefined), 'general');
});

t('an unknown category is cleaned to general', () => {
  assert.equal(cleanCategory('billing'), 'billing');
  assert.equal(cleanCategory('weather'), 'general');
  assert.equal(cleanCategory(undefined), 'general');
});

t('a new ticket carries its category', () => {
  const tk = ticketFor({ stageKey: 'support', stage: 'question', leadEmail: 'a@x.lk', reason: 'Refund please, I was charged twice' }, NOW);
  assert.equal(tk.category, 'billing');
  assert.equal(tk.summary.startsWith('Refund'), true);
});

t('the counts cover every category, and older tickets count as general', () => {
  const counts = categoryCounts([{ category: 'billing' }, { category: 'billing' }, { category: 'delivery' }, {}, null]);
  assert.deepEqual(Object.keys(counts), TICKET_CATEGORIES);
  assert.equal(counts.billing, 2);
  assert.equal(counts.delivery, 1);
  assert.equal(counts.general, 1);
});

t('the support numbers carry the category counts', () => {
  const k = supportKpis([{ category: 'account', status: 'open', openedAt: new Date(NOW).toISOString(), dueAt: new Date(NOW + 3600000).toISOString() }], NOW);
  assert.equal(k.categories.account, 1);
});

console.log(`gap-close-303: ${n} checks passed`);
