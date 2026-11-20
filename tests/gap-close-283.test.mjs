// Pass 283: the Integrations screen shows the core flow first; vendor keys and connect buttons sit under "Advanced".
// Hide, never delete: every key stays in the catalog, every route stays in the app, and the sales flow is unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CATALOG_GROUPS, CATALOG_NAMES, CORE_GROUP_TITLES, CORE_SERVICE_IDS } from '../lib/integration-catalog.js';
import { INTEGRATIONS } from '../lib/integrations.js';
import { NAV_ITEMS } from '../lib/app-routes.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const titles = CATALOG_GROUPS.map((g) => g.title);
const navIn = (group) => NAV_ITEMS.filter((i) => i.group === group).map((i) => i.href);

t('every core key group names a real group (a typo would hide a core key)', () => {
  for (const c of CORE_GROUP_TITLES) assert.ok(titles.includes(c), `missing group: ${c}`);
});

t('the core key groups are exactly AI, Balancr and Calendar', () => {
  assert.deepEqual([...CORE_GROUP_TITLES].sort(), ['AI', 'Balancr (accounting, two-way)', 'Calendar'].sort());
});

t('the vendor-heavy groups are advanced, not core: ads, tracking, shops, payments, voice, lead enrichment', () => {
  const advanced = titles.filter((x) => !CORE_GROUP_TITLES.includes(x)).join(' | ');
  for (const word of ['Google Ads', 'Meta', 'TikTok', 'Shopify', 'eBay', 'Twilio', 'Stripe', 'Voice agent', 'Contact enrichment', 'Companies House', 'Dropbox Sign']) {
    assert.ok(advanced.includes(word), `${word} should be advanced`);
  }
});

t('core services are the Gmail sending path and the AI writer; both exist as service cards', () => {
  const ids = new Set(INTEGRATIONS.map((i) => i.id));
  for (const id of CORE_SERVICE_IDS) assert.ok(ids.has(id), `unknown core service: ${id}`);
  assert.deepEqual([...CORE_SERVICE_IDS].sort(), ['ai', 'gmail']);
});

t('hiding is not deleting: every catalog key is still listed, once', () => {
  assert.equal(new Set(CATALOG_NAMES).size, CATALOG_NAMES.length);
  assert.ok(CATALOG_NAMES.includes('TWILIO_AUTH_TOKEN'));
  assert.ok(CATALOG_NAMES.includes('STRIPE_PAYMENTS_SECRET_KEY'));
  assert.ok(CATALOG_NAMES.includes('ANTHROPIC_API_KEY'));
});

t('the sales flow stays in the sidebar; secondary pages move to More, under the same labels', () => {
  assert.deepEqual(navIn('Sell'), ['/crm', '/customers', '/quotes', '/orders', '/bookings', '/products']); // Orders added in pass 338
  for (const href of ['/owners', '/partners', '/bets', '/contracts']) assert.ok(navIn('More').includes(href), href);
  assert.equal(NAV_ITEMS.find((i) => i.href === '/owners').label, 'Deal owners');
});

t('every sidebar page still has its route file', () => {
  for (const item of NAV_ITEMS) {
    const file = `app${item.href}/page.js`;
    assert.ok(fs.existsSync(file), `no page for ${item.href}`);
  }
});

console.log(`\n${n} passed`);
