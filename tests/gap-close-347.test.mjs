// Pass 347: the CRM sync log. Each deal's CRM action (created, matched, sent, pulled, skipped, failed) is recorded with its reason,
// kept on settings/crm (last 50, from the latest run that did something), and shown to the owner on Integrations.
// Pure helpers are tested directly; the wiring is checked against the source (the server module needs Firestore to run).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncLogEntry, capSyncLog, syncLogSummary, SYNC_RESULTS, SYNC_LOG_MAX } from '../lib/crm.js';

let n = 0;
const t = (name, fn) => { fn(); n++; };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

t('an entry keeps the deal, CRM, result and reason', () => {
  const e = syncLogEntry({ dealId: 'd1', name: 'Acme Ltd', provider: 'pipedrive', result: 'created', reason: 'new contact', at: '2026-11-21T00:00:00.000Z' });
  assert.deepEqual(e, { dealId: 'd1', name: 'Acme Ltd', provider: 'pipedrive', result: 'created', reason: 'new contact', at: '2026-11-21T00:00:00.000Z' });
});

t('an unknown result is refused', () => {
  assert.equal(syncLogEntry({ dealId: 'd1', result: 'deleted' }), null);
  assert.equal(syncLogEntry({ dealId: 'd1' }), null);
});

t('only hubspot or pipedrive is kept as the CRM; anything else is null (for example, an error before a CRM was chosen)', () => {
  assert.equal(syncLogEntry({ result: 'failed', provider: 'salesforce' }).provider, null);
  assert.equal(syncLogEntry({ result: 'failed', provider: null }).provider, null);
  assert.equal(syncLogEntry({ result: 'failed', provider: 'hubspot' }).provider, 'hubspot');
});

t('control characters and runs of spaces are removed; name is capped at 80 and reason at 160', () => {
  const e = syncLogEntry({ dealId: 'x\u0007y  z', name: 'A'.repeat(200), result: 'skipped', reason: 'R'.repeat(400) });
  assert.equal(e.dealId, 'x y z');
  assert.equal(e.name.length, 80);
  assert.equal(e.reason.length, 160);
});

t('every result type is accepted', () => {
  for (const r of SYNC_RESULTS) assert.ok(syncLogEntry({ dealId: 'd', result: r }), r);
  assert.deepEqual(SYNC_RESULTS, ['created', 'pushed', 'pulled', 'skipped', 'failed']);
});

t('the log keeps the latest 50 entries', () => {
  const entries = Array.from({ length: 80 }, (_, i) => ({ dealId: `d${i}`, result: 'pushed' }));
  const kept = capSyncLog(entries);
  assert.equal(SYNC_LOG_MAX, 50);
  assert.equal(kept.length, 50);
  assert.equal(kept[0].dealId, 'd30');
  assert.equal(kept[49].dealId, 'd79');
});

t('a stored value that is not a list gives an empty log, and empty slots are dropped', () => {
  assert.deepEqual(capSyncLog(undefined), []);
  assert.deepEqual(capSyncLog('oops'), []);
  assert.deepEqual(capSyncLog([null, { result: 'failed' }, undefined]), [{ result: 'failed' }]);
});

t('the summary counts each result and shows zero for the rest', () => {
  const c = syncLogSummary([{ result: 'created' }, { result: 'failed' }, { result: 'failed' }, { result: 'bogus' }, null]);
  assert.deepEqual(c, { created: 1, pushed: 0, pulled: 0, skipped: 0, failed: 2 });
  assert.deepEqual(syncLogSummary(undefined), { created: 0, pushed: 0, pulled: 0, skipped: 0, failed: 0 });
});

// ---- Wiring (source checks) ----
const crm = read('lib/server/crm.js');

t('a deal with no usable email is logged as skipped, not dropped silently', () => {
  assert.ok(crm.includes("note(d, provider, 'skipped', 'no usable email"));
  assert.ok(!/if \(!c\) continue;/.test(crm), 'the silent skip is gone');
});

t('created, pulled and pushed actions, and amount sends, are each logged', () => {
  assert.ok(crm.includes("note(d, provider, 'created'"));
  assert.ok(crm.includes("note(d, provider, 'pulled'"));
  assert.ok(crm.includes("note(d, provider, 'pushed', `sent ${dec.outcome}"));
  assert.ok(crm.includes("note(d, provider, 'pushed', 'amount sent to the CRM')"));
});

t('a matched contact is told apart from a new one in the reason (both CRMs)', () => {
  assert.equal((crm.match(/created: false/g) || []).length, 2);
  assert.equal((crm.match(/created: true/g) || []).length, 2);
  assert.ok(crm.includes("matched existing contact by email"));
});

t('both failure paths are logged with the error message (sync and check)', () => {
  assert.equal((crm.match(/note\(d, null, 'failed'/g) || []).length, 2);
});

t('the run saves the log and last check time; a quiet run keeps the earlier log', () => {
  assert.ok(crm.includes('lastLog: runLog, lastLogAt: runAt'));
  assert.ok(crm.includes('lastRunAt: runAt'));
  assert.ok(crm.includes('export async function loadCrmSyncLog'));
});

t('the owner route reads only with a signed-in user and never sends to a CRM', () => {
  const route = read('app/api/crm-sync/route.js');
  assert.ok(route.includes('export async function GET'));
  assert.ok(route.includes("uidFromRequest(request)") && route.includes("'Please sign in again.'") && route.includes('401'));
  assert.ok(route.includes('loadCrmSyncLog(getDb(), uid)'));
  assert.ok(!/fetchImpl|api\.hubapi|pipedrive\.com/.test(route), 'the route does not call a CRM');
});

t('the Integrations page shows the panel, and the panel reads /api/crm-sync', () => {
  const page = read('app/integrations/page.js');
  assert.ok(page.includes('CrmSyncLog from') && page.includes('components/CrmSyncLog'));
  assert.ok(page.includes('<CrmSyncLog />'));
  const panel = read('app/components/CrmSyncLog.js');
  assert.ok(panel.includes('fetch("/api/crm-sync")'));
  assert.ok(panel.includes('Nothing to report from the last run.'));
});

t('the pure helpers are the ones the server module uses', () => {
  assert.ok(crm.includes('syncLogEntry, capSyncLog, syncLogSummary'));
  assert.ok(read('lib/crm.js').includes('export function syncLogEntry'));
});

console.log(`gap-close-347: ${n} checks passed`);
