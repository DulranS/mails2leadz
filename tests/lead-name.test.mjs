import assert from 'node:assert/strict';
import { looksLikePhone, nameFromHost, cleanBusinessName, pickBusinessName, businessLabel, NO_NAME_LABEL } from '../lib/lead-name.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('phone-like values are recognised in every common format', () => {
  for (const v of ['0771234567', '+94 77 123 4567', '(011) 234-5678', '077-123-4567', '+1 (415) 555-0132', '94771234567', 'whatsapp:+94771234567', 'Tel: 011 2345678', 'Mobile no. 0771234567', '011 2345678 ext 12', ' 0771234567 ']) assert.equal(looksLikePhone(v), true, v);
});
t('real names are never mistaken for a phone number', () => {
  for (const v of ['7 Eleven', '24/7 Plumbing', 'Acme 2000', 'Studio 54', 'Ceylon Cold Stores', '', null, undefined, '12345', '+94', 'A1 Auto 0771234567', '1234 Main Street Cafe']) assert.equal(looksLikePhone(v), false, String(v));
});
t('a name is derived from a website, with country and "co" suffixes handled', () => {
  assert.equal(nameFromHost('https://www.acme-plumbing.lk/contact'), 'Acme Plumbing');
  assert.equal(nameFromHost('acme.co.uk'), 'Acme');
  assert.equal(nameFromHost('http://perera_hardware.com'), 'Perera Hardware');
  assert.equal(nameFromHost('shop.cityfloors.com.au'), 'Cityfloors');
});
t('hosts that say nothing about the business give no name', () => {
  for (const h of ['https://facebook.com/acme', 'instagram.com/acme', 'https://linktr.ee/acme', 'wa.me/94771234567', 'gmail.com', 'myshop.wixsite.com', '12345.com', 'ab.com', 'localhost', '']) assert.equal(nameFromHost(h), '', h);
});
t('cleanBusinessName keeps real names, replaces a phone number from the website or e-mail domain, and never invents one', () => {
  assert.equal(cleanBusinessName('  Ceylon   Cold Stores '), 'Ceylon Cold Stores');
  assert.equal(cleanBusinessName('0771234567', { website: 'https://www.acme-plumbing.lk' }), 'Acme Plumbing');
  assert.equal(cleanBusinessName('0771234567', { email: 'info@ceyloncold.lk' }), 'Ceyloncold');
  assert.equal(cleanBusinessName('0771234567', { website: 'facebook.com/x', email: 'owner@gmail.com' }), '');
  assert.equal(cleanBusinessName('0771234567'), '');
  assert.equal(cleanBusinessName('', { website: 'acme.lk' }), ''); // a blank name stays blank: nameless rows are the caller's call
  assert.equal(cleanBusinessName('   '), '');
  assert.equal(cleanBusinessName('Real Name', { website: 'other.lk' }), 'Real Name'); // a real name always wins over the hints
});
t('pickBusinessName takes the first real candidate, skipping numbers and blanks', () => {
  assert.equal(pickBusinessName(['0771234567', '', null, 'Acme Plumbing', 'Other']), 'Acme Plumbing');
  assert.equal(pickBusinessName(['0771234567'], { website: 'acme.lk' }), 'Acme');
  assert.equal(pickBusinessName([], {}), '');
  assert.equal(pickBusinessName(['', null], { website: 'acme.lk' }), 'Acme'); // screens: a blank is shown as the website's name
  assert.equal(pickBusinessName(['', null], { website: 'acme.lk' }, { deriveBlank: false }), ''); // ingest: a blank stays nameless
  assert.equal(pickBusinessName(['0771234567'], { website: 'acme.lk' }, { deriveBlank: false }), 'Acme'); // but a phone number in the name is replaced
});
t('businessLabel never prints a raw number', () => {
  assert.equal(businessLabel('0771234567'), NO_NAME_LABEL);
  assert.equal(businessLabel('+94 77 123 4567', { website: 'acme.lk' }), 'Acme');
  assert.equal(businessLabel('Acme'), 'Acme');
});
console.log(`\n${n} lead-name tests ok`);
