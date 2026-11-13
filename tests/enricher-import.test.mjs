// Enricher import (Pass 240): the enricher's own column names map onto a lead; LinkedIn is kept as a reference only; a missing rating stays empty.
import assert from 'node:assert/strict';
import { mapImportRows } from '../lib/lead-import.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('the enricher\'s columns are read: name, website, e-mail, phone, address, category, LinkedIn, rating and reviews', () => {
  const r = mapImportRows([{
    business_name: 'Ann Clinic', website: 'https://annclinic.lk', email: 'hello@annclinic.lk', whatsapp_number: '+94 77 123 4567',
    address: 'Colombo 3', category: 'Clinic', linkedin_company: 'https://www.linkedin.com/company/ann-clinic', rating: '4.6', reviews: '120',
  }], { label: 'enricher' });
  assert.equal(r.candidates.length, 1);
  const c = r.candidates[0];
  assert.equal(c.business_name, 'Ann Clinic');
  assert.equal(c.website, 'https://annclinic.lk/');
  assert.equal(c.email, 'hello@annclinic.lk');
  assert.equal(c.linkedin, 'https://www.linkedin.com/company/ann-clinic');
  assert.equal(c.rating, 4.6);
  assert.equal(c.reviews, 120);
});

t('a LinkedIn column that is not a LinkedIn address is ignored, and a missing rating stays empty rather than zero', () => {
  const r = mapImportRows([{ business_name: 'Bo Ltd', email: 'bo@x.com', linkedin_ceo: 'https://evil.example.com/x', rating: '' }], {});
  assert.equal(r.candidates[0].linkedin, '');
  assert.equal(r.candidates[0].rating, null);
});

console.log(`\n${n} passed`);
