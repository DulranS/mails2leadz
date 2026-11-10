// Google Places lead search (Pass 215): official API only; requests and replies read safely; rows the lead-list import recognises.
import assert from 'node:assert/strict';
import { placesRequest, placesToRows, parseQueries, PLACES_URL, PLACES_FIELDS, MAX_RESULTS } from '../lib/places.js';
import { mapImportRows } from '../lib/lead-import.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('the request goes to the official Places endpoint, with a capped result count and only the fields it needs', () => {
  assert.equal(PLACES_URL, 'https://places.googleapis.com/v1/places:searchText');
  assert.match(PLACES_FIELDS, /places\.websiteUri/);
  assert.equal(placesRequest('dentists in Colombo', 999).maxResultCount, MAX_RESULTS);
  assert.equal(placesRequest('dentists in Colombo', 0).maxResultCount, 1);
});

t('a reply becomes import rows; places without a name are dropped', () => {
  const rows = placesToRows({ places: [
    { displayName: { text: 'Smile Dental' }, websiteUri: 'https://smile.example', nationalPhoneNumber: '011 234 5678', formattedAddress: 'Colombo 3' },
    { websiteUri: 'https://nameless.example' },
  ] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['Business name'], 'Smile Dental');
});

t('the lead-list import recognises the Places columns and keeps the businesses', () => {
  const rows = placesToRows({ places: [{ displayName: { text: 'Smile Dental' }, websiteUri: 'https://smile.example', nationalPhoneNumber: '011 234 5678', formattedAddress: 'Colombo 3' }] });
  const { candidates, stats } = mapImportRows(rows, { label: 'Google Places: dentists' });
  assert.equal(candidates.length, 1, `usable rows: ${stats.usable}, no name: ${stats.noName}, no contact: ${stats.noContact}`);
});

t('saved searches are read one per line, at most three, and junk is ignored', () => {
  assert.deepEqual(parseQueries('dentists in Colombo\n\nx\nplumbers in Kandy\ncafes in Galle\nhotels in Ella'), ['dentists in Colombo', 'plumbers in Kandy', 'cafes in Galle']);
});

console.log(`\n${n} passed`);
