// Diaspora priority (Pass 387): leads abroad with a Sri Lankan marker score higher; leads in Sri Lanka do not get the boost.
import assert from 'node:assert/strict';
import { isDiasporaLead, calculateLeadScore, buildRow, DIASPORA_BOOST } from '../lib/lead-finder.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a Sri Lankan restaurant in London is a diaspora lead', () => {
  assert.equal(isDiasporaLead({ business_name: 'Lanka Spice Kitchen', website: 'https://lankaspice.co.uk', address: '12 High Street, London' }, 'London, UK'), true);
});

t('a Sri Lankan business in Colombo is not diaspora, even with a Sri Lankan name', () => {
  assert.equal(isDiasporaLead({ business_name: 'Lanka Tyres', website: 'https://lanka-tyres.lk', address: 'Colombo 3' }, 'Colombo, Sri Lanka'), false);
});

t('a business with no Sri Lankan marker is not diaspora', () => {
  assert.equal(isDiasporaLead({ business_name: 'Blue Bottle Cafe', address: '1 Main Road, London' }, 'London, UK'), false);
});

t('a Sri Lankan name searched inside Sri Lanka is not diaspora', () => {
  assert.equal(isDiasporaLead({ business_name: 'Ceylon Tea House', address: '' }, 'Colombo'), false);
});

t('a .lk website marks the business as domestic', () => {
  assert.equal(isDiasporaLead({ business_name: 'Ceylon Travels', website: 'https://ceylontravels.lk', address: '' }, 'London'), false);
});

t('the diaspora boost adds exactly DIASPORA_BOOST points, and nothing when off', () => {
  const row = { phone_primary: '0771234567' };
  const plain = calculateLeadScore(row);
  assert.equal(calculateLeadScore(row, { diaspora: true }) - plain, DIASPORA_BOOST);
  assert.equal(calculateLeadScore(row, { diaspora: false }), plain);
});

t('a diaspora lead is scored higher than the same business searched in Colombo', () => {
  const cand = { place_id: 'osm:node/1', business_name: 'Lanka Spice Kitchen', address: 'High Street, London', search_query: 'restaurant', website: '' };
  const abroad = buildRow({ ...cand }, null, { searchLocation: 'London, UK' });
  const home = buildRow({ ...cand, address: 'Galle Road, Colombo' }, null, { searchLocation: 'Colombo, Sri Lanka' });
  assert.equal(Number(abroad.lead_quality_score) - Number(home.lead_quality_score), DIASPORA_BOOST);
});

console.log(`diaspora priority: ${n} passed`);
