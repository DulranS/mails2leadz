// Business profile (Pass 229): the details entered on the Account page reach the sales features under the names they are saved with.
import assert from 'node:assert/strict';
import { resolveProfile } from '../lib/business-profile.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('the offer and business name come from the Account page profile', () => {
  const r = resolveProfile({ profile: { businessName: 'Ann Clinic', offer: 'Booking system', audience: 'Small clinics', valueProp: 'Saves time' } });
  assert.equal(r.businessName, 'Ann Clinic');
  assert.equal(r.offer, 'Booking system');
  assert.equal(r.valueProp, 'Saves time');
});

t('the ideal customer comes from "Who do you help?" unless an ideal customer was set directly', () => {
  assert.equal(resolveProfile({ profile: { audience: 'Small clinics' } }).idealCustomer, 'Small clinics');
  assert.equal(resolveProfile({ idealCustomer: 'Clinics in Colombo', profile: { audience: 'Small clinics' } }).idealCustomer, 'Clinics in Colombo');
});

t('a missing detail is an empty value, never a made-up one', () => {
  const r = resolveProfile({});
  assert.deepEqual(r, { businessName: '', offer: '', idealCustomer: '', valueProp: '' });
});

console.log(`\n${n} passed`);
