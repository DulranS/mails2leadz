// The owner's message for finished queued searches (v391): the text, the address checks, and that a failed send changes nothing.
// Run: node tests/notify-owner.test.mjs
import assert from 'node:assert/strict';
import { queueNoticeText, sendNotice } from '../lib/server/notify-owner.js';
import { cleanNotifyUrl, sanitizeFinderSettings, FINDER_DEFAULTS } from '../lib/lead-finder.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('  ok -', name); };

await t('a finished search says what was added and what was already known', () => {
  const m = queueNoticeText({ query: 'plumbers', location: 'Colombo' }, { status: 'done', added: 4, skipped: 2 });
  assert.equal(m.title, 'Lead search finished');
  assert.equal(m.text, 'plumbers in Colombo: 4 added to your Lead Inbox, 2 already known.');
});

await t('a search that did not finish says so, with the reason', () => {
  const m = queueNoticeText({ query: 'dentists' }, { status: 'failed', note: 'The search stopped before it finished.' });
  assert.equal(m.title, 'Lead search did not finish');
  assert.equal(m.text, 'dentists: The search stopped before it finished.');
});

await t('only secure addresses are kept; anything else is dropped without an error', () => {
  assert.equal(cleanNotifyUrl('https://hooks.slack.com/services/abc'), 'https://hooks.slack.com/services/abc');
  assert.equal(cleanNotifyUrl('http://hooks.example.com/x'), '');
  assert.equal(cleanNotifyUrl('javascript:alert(1)'), '');
  assert.equal(cleanNotifyUrl('https://user:pw@example.com/x'), '');
  assert.equal(cleanNotifyUrl('https://example.com/has space'), '');
  assert.equal(cleanNotifyUrl(''), '');
  assert.equal(cleanNotifyUrl(42), '');
});

await t('the address survives every settings save, and defaults to none', () => {
  const saved = sanitizeFinderSettings({ enabled: true, notifyUrl: 'https://ntfy.sh/mytopic' });
  assert.equal(saved.notifyUrl, 'https://ntfy.sh/mytopic');
  assert.equal(sanitizeFinderSettings({ ...saved, enabled: false }).notifyUrl, 'https://ntfy.sh/mytopic');
  assert.equal(FINDER_DEFAULTS.notifyUrl, '');
});

await t('no address means nothing is sent, and the call says why', async () => {
  const r = await sendNotice('', { title: 'x', text: 'y' });
  assert.deepEqual(r, { sent: false, reason: 'no address set' });
});

await t('a private or local address is refused before anything is sent', async () => {
  const r = await sendNotice('https://localhost/hook', { title: 'x', text: 'y' });
  assert.equal(r.sent, false);
  const r2 = await sendNotice('https://192.168.1.10/hook', { title: 'x', text: 'y' });
  assert.equal(r2.sent, false);
});

console.log(`\nnotify-owner: ${n} passed`);
