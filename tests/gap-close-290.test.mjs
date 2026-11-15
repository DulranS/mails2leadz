// Pass 290: each owner sees their own automation runs (spec 7.3). Counts and plain codes only; no customer data, no raw error text.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runRecord, runsView, noteLabel, RUN_LOG_MAX } from '../lib/run-log-rules.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a run record keeps counts and status only; raw error text and customer details never reach it', () => {
  const r = runRecord({ ok: false, counts: { invoices: 1, invoiceEmails: 0, reminders: 2, report: false, customer: 'Jo Buyer', error: 'boom to buyer@private.com' }, notes: ['run_error'] });
  assert.deepEqual(Object.keys(r).sort(), ['at', 'invoiceEmails', 'invoices', 'notes', 'posts', 'reminders', 'report', 'status']);
  assert.equal(r.status, 'failed');
  assert.ok(!JSON.stringify(r).includes('buyer@private.com'));
  assert.ok(!JSON.stringify(r).includes('Jo Buyer'));
});

t('counts are whole non-negative numbers; the notes are short and capped', () => {
  const r = runRecord({ ok: true, counts: { invoices: '3.9', reminders: -4, posts: 'x' }, notes: Array.from({ length: 20 }, (_, i) => `n${i}`) });
  assert.equal(r.invoices, 3); assert.equal(r.reminders, 0); assert.equal(r.posts, 0);
  assert.equal(r.notes.length, 12);
  assert.equal(r.status, 'done');
});

t('known codes read as plain sentences; an unknown code is shown as words, not raw text', () => {
  assert.equal(noteLabel('time'), 'Stopped early at the time limit; the rest runs tomorrow');
  assert.equal(noteLabel('some_new_step'), 'some new step');
  assert.equal(noteLabel(''), '');
});

t('the view is newest first, capped at 30, drops bad rows and reads well for one run or many', () => {
  const rows = [
    runRecord({ at: '2026-11-13T01:00:00Z', ok: true, counts: { invoices: 1, invoiceEmails: 1, reminders: 1 } }),
    runRecord({ at: '2026-11-15T01:00:00Z', ok: true, counts: { invoices: 2, invoiceEmails: 0, reminders: 0, report: true }, notes: ['billing_error'] }),
    { status: 'weird', at: '2026-11-16T00:00:00Z' },
  ];
  const v = runsView(rows);
  assert.equal(v.length, 2);
  assert.equal(v[0].at, '2026-11-15T01:00:00Z');
  assert.equal(v[0].summary, '2 invoices made, 0 emailed, 0 reminders, weekly report sent');
  assert.deepEqual(v[0].notes, ['Billing step failed (see the Billing page)']);
  assert.equal(v[1].summary, '1 invoice made, 1 emailed, 1 reminder');
  assert.equal(runsView(Array.from({ length: RUN_LOG_MAX + 9 }, (_, i) => runRecord({ at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(), ok: true }))).length, RUN_LOG_MAX);
});

t('the daily job writes a run for each owner it processes, success or failure', () => {
  const s = fs.readFileSync('app/api/cron/daily-ops/route.js', 'utf8');
  assert.ok(s.includes('await recordRun(db, uid, runRecord({ ok: true, counts: r, notes: r.notes }))'));
  assert.ok(s.includes("await recordRun(db, uid, runRecord({ ok: false, notes: ['run_error'] }))"));
});

t('the run writer never blocks the job, and writes only to the owner workspace', () => {
  const s = fs.readFileSync('lib/server/run-log.js', 'utf8');
  assert.ok(s.includes("collection(db, 'users', String(uid), 'runs')"));
  assert.ok(s.includes('try {') && s.includes('catch (e)'));
});

t('the audit route returns the owner runs, and the page shows them', () => {
  const r = fs.readFileSync('app/api/audit/route.js', 'utf8');
  assert.ok(r.includes("collection(db, 'users', who.uid, 'runs')") && r.includes("runs: runsView("));
  assert.ok(r.includes('canReadAudit(actorFromRequest(request))'));
  const p = fs.readFileSync('app/audit/page.js', 'utf8');
  assert.ok(p.includes('setRuns(Array.isArray(j.runs)'));
  assert.ok(p.includes('Automation runs (daily job)'));
});

console.log(`\n${n} passed`);
