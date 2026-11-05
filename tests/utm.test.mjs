// UTM tagging of outbound links (Pass 165): external links are tagged; own, opt-out and already-tagged links are left alone.
import assert from 'node:assert/strict';
import { tagLinks, ownHost } from '../lib/utm.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const opts = { host: 'shop.example.com', medium: 'email', campaign: 'autumn' };

t('an external link gets its utm source, medium and campaign', () => {
  const out = tagLinks('See https://news.example.org/post?id=3 now', opts);
  assert.match(out, /utm_source=autoleads/);
  assert.match(out, /utm_medium=email/);
  assert.match(out, /utm_campaign=autumn/);
  assert.match(out, /id=3/);
});

t('our own domain, opt-out and manage links, and links already tagged, are left exactly as they are', () => {
  for (const u of ['https://shop.example.com/products', 'https://other.example.com/unsubscribe?x=1', 'https://other.example.com/manage?t=abc', 'https://x.example.org/a?utm_source=partner']) {
    assert.equal(tagLinks(u, opts), u, u);
  }
});

t('with no own domain configured nothing changes, and the own domain is read from the public base URL', () => {
  assert.equal(tagLinks('https://news.example.org/x', { host: '' }), 'https://news.example.org/x');
  assert.equal(ownHost({ NEXT_PUBLIC_BASE_URL: 'https://app.example.com/' }), 'app.example.com');
  assert.equal(ownHost({}), '');
});

console.log(`\n${n} passed`);
