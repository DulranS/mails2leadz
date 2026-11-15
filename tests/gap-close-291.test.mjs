// Pass 291: support has a first-reply target (2 hours, as before) and a separate resolution target (spec 5.2).
// A complaint must be closed within 24 hours; a normal ticket within 48. Old tickets without a target use the normal one.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ticketFor, supportKpis, RESOLVE_HOURS, COMPLAINT_RESOLVE_HOURS, SLA_HOURS } from '../lib/support.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const H = 3600000;
const now = Date.parse('2026-11-15T09:00:00Z');

t('the first reply is still due in two hours; the close is due in 48 hours, or 24 for a complaint', () => {
  const normal = ticketFor({ stageKey: 'a', stage: 'question', reason: 'Hours?' }, now);
  assert.equal(Date.parse(normal.dueAt) - now, SLA_HOURS * H);
  assert.equal(Date.parse(normal.resolveDueAt) - now, RESOLVE_HOURS * H);
  const complaint = ticketFor({ stageKey: 'b', stage: 'complaint', reason: 'Broken' }, now);
  assert.equal(Date.parse(complaint.resolveDueAt) - now, COMPLAINT_RESOLVE_HOURS * H);
  assert.equal(complaint.priority, 'high');
});

t('a target set by the caller is kept', () => {
  const tk = ticketFor({ stageKey: 'c', stage: 'question', reason: 'x' }, now, { resolveDueAt: '2026-11-20T00:00:00.000Z' });
  assert.equal(tk.resolveDueAt, '2026-11-20T00:00:00.000Z');
});

t('an open ticket past its close target counts as overdue for resolution; one still in time does not', () => {
  const late = { status: 'open', openedAt: new Date(now - 60 * H).toISOString(), dueAt: new Date(now - 58 * H).toISOString(), resolveDueAt: new Date(now - 12 * H).toISOString() };
  const inTime = { status: 'open', openedAt: new Date(now - 10 * H).toISOString(), dueAt: new Date(now + H).toISOString(), resolveDueAt: new Date(now + 38 * H).toISOString() };
  const k = supportKpis([late, inTime], now);
  assert.equal(k.resolveOverdue, 1);
  assert.equal(k.resolveHours, RESOLVE_HOURS);
});

t('a ticket from before close targets existed is measured against the normal close target', () => {
  const old = { status: 'open', openedAt: new Date(now - (RESOLVE_HOURS + 1) * H).toISOString(), dueAt: new Date(now - 100 * H).toISOString() };
  assert.equal(supportKpis([old], now).resolveOverdue, 1);
  const fresh = { status: 'open', openedAt: new Date(now - 5 * H).toISOString(), dueAt: new Date(now).toISOString() };
  assert.equal(supportKpis([fresh], now).resolveOverdue, 0);
});

t('the share of tickets closed within their close target is shown, and is empty until one is closed', () => {
  assert.equal(supportKpis([], now).resolutionTargetMetPct, null);
  const inTime = { status: 'resolved', openedAt: new Date(now - 5 * H).toISOString(), resolvedAt: new Date(now - 3 * H).toISOString(), dueAt: new Date(now - 4 * H).toISOString(), resolveDueAt: new Date(now + H).toISOString() };
  const late = { status: 'resolved', openedAt: new Date(now - 60 * H).toISOString(), resolvedAt: new Date(now - H).toISOString(), dueAt: new Date(now - 58 * H).toISOString(), resolveDueAt: new Date(now - 30 * H).toISOString() };
  assert.equal(supportKpis([inTime, late], now).resolutionTargetMetPct, 50);
});

t('the support panel shows the count past the close target', () => {
  const src = fs.readFileSync('app/components/SupportAndKpis.js', 'utf8');
  assert.ok(src.includes('sup.kpis.resolveOverdue'));
  assert.ok(src.includes('Past resolve target'));
});

console.log(`\n${n} passed`);
