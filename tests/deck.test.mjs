// Pitch deck (Pass 210): slides come only from the owner's figures; text is escaped; the deck prints as landscape slides.
import assert from 'node:assert/strict';
import { deckSlides, deckHtml } from '../lib/deck.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('the deck has the usual seven slides, and figures appear only when given', () => {
  const s = deckSlides({ businessName: 'Ann Clinic', offer: 'Booking system', won: 12 });
  assert.equal(s.length, 7);
  assert.equal(s[0].title, 'Ann Clinic');
  assert.ok(s.find((x) => x.title === 'Traction').body.includes('Customers won in the last twelve months: 12'));
  assert.deepEqual(s.find((x) => x.title === 'Pricing').body, ['[YOUR PRICES]']);
});

t('the deck escapes anything typed by the owner, so it cannot inject markup', () => {
  const html = deckHtml(deckSlides({ businessName: '<img src=x onerror=alert(1)>' }));
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});

t('the deck is landscape slides, one per page, for printing to PDF', () => {
  const html = deckHtml(deckSlides({ businessName: 'Ann' }));
  assert.match(html, /@page \{ size: 297mm 210mm/);
  assert.equal((html.match(/class="slide"/g) || []).length, 7);
});

console.log(`\n${n} passed`);
