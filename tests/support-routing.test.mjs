// Smart support (Pass 197): the right agent, the right warning before a target is missed, one escalation, history, a ready answer, and honest measures.
import assert from 'node:assert/strict';
import { slaStatus, pickAgent, escalationFor, customerHistory, suggestedAnswer, smartSupportKpis } from '../lib/support-routing.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const H = 3600000;
const now = Date.parse('2026-11-06T12:00:00Z');
const ticket = (o = {}) => ({ status: 'open', openedAt: new Date(now - 1 * H).toISOString(), dueAt: new Date(now + 1 * H).toISOString(), kind: 'support_request', ...o });
const team = [{ id: 'm1', name: 'Ann', role: 'rep' }, { id: 'm2', name: 'Bob', role: 'manager' }, { id: 'v1', name: 'Vi', role: 'viewer' }];

t('a ticket is on track, due soon at three quarters of its target, past target when late, and done when resolved', () => {
  assert.equal(slaStatus(ticket(), now), 'on_track');
  assert.equal(slaStatus(ticket({ openedAt: new Date(now - 1.6 * H).toISOString(), dueAt: new Date(now + 0.4 * H).toISOString() }), now), 'due_soon');
  assert.equal(slaStatus(ticket({ dueAt: new Date(now - 0.5 * H).toISOString() }), now), 'breached');
  assert.equal(slaStatus(ticket({ status: 'resolved' }), now), 'done');
});

t('complaints go to a manager first; other questions go to the least loaded agent; viewers never take tickets', () => {
  const open = [{ assignedTo: 'm1', status: 'open' }, { assignedTo: 'm1', status: 'open' }];
  assert.equal(pickAgent({ kind: 'complaint' }, team, open, now).id, 'm2');
  assert.equal(pickAgent({ kind: 'support_request' }, team, open, now).id, 'm2', 'the manager is also the least loaded here');
  const busyManager = [{ assignedTo: 'm2', status: 'open' }, { assignedTo: 'm2', status: 'open' }, { assignedTo: 'm2', status: 'open' }];
  assert.equal(pickAgent({ kind: 'support_request' }, team, busyManager, now).id, 'm1', 'a question goes to whoever has less to do');
  assert.equal(pickAgent({ kind: 'complaint' }, team, busyManager, now).id, 'm2', 'a complaint still goes to a manager');
  assert.equal(pickAgent({ kind: 'support_request' }, [{ id: 'v1', role: 'viewer' }], [], now), null);
});

t('one escalation: a ticket late by under two hours tells the owner; two hours late reassigns', () => {
  assert.deepEqual(escalationFor(ticket({ dueAt: new Date(now - 1 * H).toISOString() }), now), { level: 1, action: 'tell_owner' });
  assert.equal(escalationFor(ticket({ dueAt: new Date(now - 3 * H).toISOString() }), now).action, 'tell_owner_and_reassign');
  assert.equal(escalationFor(ticket({ dueAt: new Date(now + 3 * H).toISOString() }), now).action, 'none');
});

t('the customer history shows repeat contact and whether they are open now', () => {
  const tickets = [{ customerEmail: 'Ann@x.com', status: 'resolved' }, { customerEmail: 'ann@x.com', status: 'open' }, { customerEmail: 'bob@x.com', status: 'open' }];
  assert.deepEqual(customerHistory('ANN@x.com', tickets), { tickets: 2, openNow: 1, repeat: true });
  assert.equal(customerHistory('', tickets), null);
});

t('a ready answer comes from the owner\'s library, and nothing is offered when there is no match', () => {
  const lib = [{ q: 'What are your opening hours?', a: 'We are open 9am to 5pm.' }];
  assert.match(suggestedAnswer({ question: 'what are your opening hours today' }, lib), /9am to 5pm/);
  assert.equal(suggestedAnswer({ question: 'do you make boats' }, lib), null);
});

t('the measures are honest: breach rate on answered tickets, load per agent, and unassigned work', () => {
  const tickets = [
    { status: 'resolved', resolvedAt: new Date(now - 0.5 * H).toISOString(), dueAt: new Date(now - 1 * H).toISOString(), assignedTo: 'm1', kind: 'complaint', customerEmail: 'a@x.com', auto: true },
    { status: 'resolved', resolvedAt: new Date(now - 3 * H).toISOString(), dueAt: new Date(now - 1 * H).toISOString(), assignedTo: 'm2', kind: 'support_request', customerEmail: 'a@x.com' },
    { status: 'open', dueAt: new Date(now + H).toISOString(), openedAt: new Date(now - H).toISOString(), assignedTo: '', kind: 'support_request', customerEmail: 'c@x.com' },
  ];
  const k = smartSupportKpis(tickets, team, now);
  assert.equal(k.breachRatePct, 50, 'one of the two answered tickets was resolved after its target');
  assert.equal(k.unassigned, 1);
  assert.equal(k.repeatCustomers, 1);
  assert.equal(k.reasons.complaint, 1);
  assert.equal(k.agents.find((a) => a.id === 'm1').resolved, 1);
});

console.log(`\n${n} passed`);
