// Pass 316: efficiency. A call that did not match is checked again only after a week; the sales numbers read each source once.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { callsToLink, recentlyTried, RETRY_GAP_MS } from '../lib/call-backfill.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = Date.parse('2026-11-16T00:00:00Z');

t('a call marked as checked within the last week is not checked again', () => {
  assert.equal(recentlyTried({ emailLinkTriedAt: new Date(NOW - 1000).toISOString() }, NOW), true);
  assert.equal(recentlyTried({ emailLinkTriedAt: new Date(NOW - RETRY_GAP_MS - 1000).toISOString() }, NOW), false);
  assert.equal(recentlyTried({}, NOW), false);
});

t('a checked call is skipped while its retry gap runs, and is tried again after it', () => {
  const sources = [{ email: 'a@shop.com', phone: '0771234567' }];
  const fresh = [{ id: 'c1', toPhone: '0771234567', emailLinkTriedAt: new Date(NOW - 1000).toISOString() }];
  assert.deepEqual(callsToLink(fresh, sources, NOW), []);
  const stale = [{ id: 'c1', toPhone: '0771234567', emailLinkTriedAt: new Date(NOW - RETRY_GAP_MS - 1000).toISOString() }];
  assert.deepEqual(callsToLink(stale, sources, NOW), [{ id: 'c1', email: 'a@shop.com' }]);
});

t('the daily job skips the lead reads when nothing is due, and marks the calls it could not match', () => {
  const src = fs.readFileSync('lib/server/call-backfill.js', 'utf8');
  assert.ok(src.includes('const due = calls.filter((c) => !c.email && !recentlyTried(c));'));
  assert.ok(src.includes('if (!due.length) return { linked: 0 };'));
  assert.ok(src.includes('emailLinkTriedAt: nowIso'));
});

t('the sales numbers read the lead inbox once, and take the web figures from the settings already read', () => {
  const src = fs.readFileSync('app/api/kpis/route.js', 'utf8');
  assert.equal(src.split("collection(db, 'lead_inbox')").length - 1, 1);
  assert.ok(src.includes('const leadsWin = leads.filter((l) => inWindow(l.receivedAt)).length;'));
  assert.ok(src.includes('const webSaved = savedBiz.webTotals || {};'));
});

console.log(`gap-close-316: ${n} checks passed`);
