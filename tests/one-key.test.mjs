// One key (Pass 200): the Google login sets up the GA4 stream and the purchase conversion action; the voice key alone is enough.
import assert from 'node:assert/strict';
import { pickWebStream, firstProperty, conversionActionBody } from '../lib/google-setup.js';
import { CONNECT_PROVIDERS } from '../lib/connect.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('the web stream with a measurement id is picked; app streams are skipped', () => {
  const s = pickWebStream([
    { type: 'ANDROID_APP_DATA_STREAM', name: 'properties/1/dataStreams/9' },
    { type: 'WEB_DATA_STREAM', name: 'properties/1/dataStreams/7', webStreamData: { measurementId: 'G-ABC123' } },
  ]);
  assert.deepEqual(s, { measurementId: 'G-ABC123', streamName: 'properties/1/dataStreams/7' });
  assert.equal(pickWebStream([{ type: 'WEB_DATA_STREAM', name: 'x' }]), null);
});

t('the first property of the owner\'s first account is used', () => {
  assert.equal(firstProperty({ accountSummaries: [{ propertySummaries: [{ property: 'properties/42' }, { property: 'properties/43' }] }] }), 'properties/42');
  assert.equal(firstProperty({ accountSummaries: [] }), null);
});

t('the purchase conversion action is an upload action that counts each purchase once', () => {
  const body = conversionActionBody('AutoLeads purchase');
  const c = body.operations[0].create;
  assert.equal(c.category, 'PURCHASE');
  assert.equal(c.type, 'UPLOAD_CLICKS');
  assert.equal(c.countingType, 'ONE_PER_CLICK');
  assert.equal(c.name, 'AutoLeads purchase');
});

t('the Google login asks for analytics as well as ads, so GA4 can be set up from it', () => {
  assert.match(CONNECT_PROVIDERS.google_ads.scope, /analytics\.edit/);
  assert.match(CONNECT_PROVIDERS.google_ads.scope, /adwords/);
});

console.log(`\n${n} passed`);
