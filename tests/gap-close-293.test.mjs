// Pass 293: team tasks (spec 3.3). A title, a due day and one assignee; overdue and due-today tasks show on Today.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeTask, taskState, tasksSummary, tasksView, dayKey, validTaskId } from '../lib/task-rules.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const owners = [{ key: 'owner' }, { key: 'uid_manager_1' }];
// 20:00 UTC on 15 Nov is 01:30 on 16 Nov in Colombo (+330 minutes).
const now = Date.parse('2026-11-15T20:00:00Z');

t('a task needs a title; a due day must be a real date; the assignee must be on the team', () => {
  assert.equal(sanitizeTask({ title: 'x' }, owners).ok, false);
  assert.equal(sanitizeTask({ title: 'Call back', dueDate: '2026-02-31' }, owners).ok, false);
  assert.equal(sanitizeTask({ title: 'Call back', dueDate: 'tomorrow' }, owners).ok, false);
  assert.equal(sanitizeTask({ title: 'Call back', assignedTo: 'stranger' }, owners).ok, false);
  const ok = sanitizeTask({ title: '  Call   back  ', dueDate: '2026-11-20', assignedTo: 'uid_manager_1' }, owners);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.task, { title: 'Call back', dueDate: '2026-11-20', assignedTo: 'uid_manager_1', done: false });
  assert.equal(sanitizeTask({ title: 'No date, no one' }, owners).task.assignedTo, '');
});

t('"today" is the owner\'s calendar day: a task due 16 Nov is due today at 01:30 in Colombo, not yesterday', () => {
  assert.equal(dayKey(now, 330), '2026-11-16');
  assert.equal(dayKey(now, 0), '2026-11-15', 'UTC would say the 15th');
  assert.equal(taskState({ dueDate: '2026-11-16' }, now, 330), 'due_today');
  assert.equal(taskState({ dueDate: '2026-11-15' }, now, 330), 'overdue');
  assert.equal(taskState({ dueDate: '2026-11-17' }, now, 330), 'open');
  assert.equal(taskState({ dueDate: '' }, now, 330), 'no_date');
  assert.equal(taskState({ dueDate: '2026-11-01', done: true }, now, 330), 'done');
});

t('Today counts only what needs attention now: overdue and due today', () => {
  const tasks = [{ dueDate: '2026-11-15' }, { dueDate: '2026-11-16' }, { dueDate: '2026-11-18' }, { dueDate: '' }, { dueDate: '2026-11-01', done: true }];
  assert.deepEqual(tasksSummary(tasks, now, 330), { overdue: 1, dueToday: 1, open: 2, needsAttention: 2 });
});

t('the list shows open tasks first, soonest due first, undated last; done tasks only when asked', () => {
  const rows = [
    { id: 'a1', title: 'Later', dueDate: '2026-11-20' },
    { id: 'a2', title: 'Undated' },
    { id: 'a3', title: 'Sooner', dueDate: '2026-11-16' },
    { id: 'a4', title: 'Finished', dueDate: '2026-11-01', done: true },
  ];
  assert.deepEqual(tasksView(rows, now, 330).map((r) => r.title), ['Sooner', 'Later', 'Undated']);
  assert.deepEqual(tasksView(rows, now, 330, { includeDone: true }).map((r) => r.title), ['Sooner', 'Later', 'Undated', 'Finished']);
});

t('a task id is a plain Firestore id, so it cannot point at another path', () => {
  assert.equal(validTaskId('abc12345XYZ'), true);
  assert.equal(validTaskId('../users/other/tasks/x'), false);
  assert.equal(validTaskId('a/b'), false);
  assert.equal(validTaskId(undefined), false);
});

t('the route checks the assignee against the team, blocks viewers, and feeds Today', () => {
  const r = fs.readFileSync('app/api/tasks/route.js', 'utf8');
  assert.ok(r.includes('ownersFor(db, who.uid)'));
  assert.ok(r.includes("actor.role === 'viewer'"));
  assert.ok(r.includes('sanitizeTask(body'));
  const today = fs.readFileSync('lib/server/today-actions.js', 'utf8');
  assert.ok(today.includes('tasksNeedAttention: tasksSummary(taskRows'));
  const items = fs.readFileSync('lib/today-actions.js', 'utf8');
  assert.ok(items.includes("key: 'tasksNeedAttention'"));
});

t('the page and the menu link to tasks, and the page never writes HTML from the server', () => {
  const page = fs.readFileSync('app/tasks/page.js', 'utf8');
  assert.ok(page.includes('fetch("/api/tasks"'));
  assert.ok(!/dangerouslySetInnerHTML/.test(page));
  assert.ok(fs.readFileSync('lib/app-routes.js', 'utf8').includes("'/account', '/audit', '/tasks'"));
});

t('the role a route sees comes from the verified workspace, never from the request (so a viewer is stopped)', () => {
  const p = fs.readFileSync('proxy.js', 'utf8');
  assert.ok(p.includes('headers.delete(\'x-actor-role\')'), 'client role header is removed');
  assert.ok(p.includes('headers.set(\'x-actor-role\', role)'), 'role is set from the verified workspace');
});

console.log(`\n${n} passed`);
