// Links and targets (Pass 207): a pasted link is read only when it is an eBay search or a Companies House company; targets are compared with the recent average.
import assert from 'node:assert/strict';
import { classifyLink, targetProgress } from '../lib/deals/link.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('an eBay search link gives its words; a Companies House company link gives its number', () => {
  assert.deepEqual(classifyLink('https://www.ebay.co.uk/sch/i.html?_nkw=road+bike'), { kind: 'ebay_search', keyword: 'road bike' });
  assert.deepEqual(classifyLink('companieshouse.gov.uk/company/01234567'), { kind: 'companies_house', companyNumber: '01234567' });
});

t('any other link is refused with the reason, and is never read', () => {
  assert.equal(classifyLink('https://www.facebook.com/marketplace/item/1').kind, 'unsupported');
  assert.equal(classifyLink('https://www.ebay.co.uk/itm/123456').kind, 'unsupported', 'an item page is not a search');
  assert.equal(classifyLink('not a link at all !!').kind, 'unsupported');
});

t('targets are compared with the average month, and a missing target is left out', () => {
  const p = targetProgress({ monthlyRevenue: 1000, newCustomersPerMonth: 4 }, { wonValueLast12Months: 6000, winRatePct: 40 }, { newCustomersLast12Months: 24 });
  assert.equal(p.find((x) => x.name === 'Revenue a month').pct, 50);
  assert.equal(p.find((x) => x.name === 'New customers a month').pct, 50, '24 in twelve months is 2 a month, half of 4');
  assert.equal(p.find((x) => x.name === 'Win rate'), undefined);
});

console.log(`\n${n} passed`);
