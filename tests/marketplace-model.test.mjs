// Marketplace seller business model (v390): its playbook guidance, and the fallback for an unknown model. Run: node tests/marketplace-model.test.mjs
import assert from 'node:assert/strict';
import { BUSINESS_MODELS, economics } from '../lib/kpi-economics.js';

const NOW = Date.parse('2026-11-24T00:00:00Z');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('marketplace seller is a business model with four pieces of guidance', () => {
  assert.ok(BUSINESS_MODELS.marketplace);
  assert.match(BUSINESS_MODELS.marketplace.label, /Marketplace/);
  assert.equal(BUSINESS_MODELS.marketplace.focus.length, 4);
});

t('the economics report uses the marketplace guidance when the owner picks it', () => {
  const e = economics({ invoices: [], deals: [], leads: [], now: NOW, model: 'marketplace' });
  assert.equal(e.model, 'marketplace');
  assert.deepEqual(e.focus, BUSINESS_MODELS.marketplace.focus);
});

t('an unknown model still falls back to B2C', () => {
  const e = economics({ invoices: [], deals: [], leads: [], now: NOW, model: 'nonsense' });
  assert.equal(e.model, 'b2c');
});

console.log(`\nmarketplace-model: ${n} passed`);
