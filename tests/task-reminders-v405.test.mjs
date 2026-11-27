// Pass 405: the daily task reminder email. The pure rules (lib/task-reminders.js): what is chosen, the digest wording, and the defaults.
import assert from 'node:assert/strict';
import { sanitizeTaskReminderSettings, taskRemindersOn, chooseTaskReminders, buildTaskDigest, REMINDER_LIST_MAX } from '../lib/task-reminders.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

const NOON_UTC_26 = Date.parse('2026-11-26T10:00:00Z');

t('default is off: no settings, a bad value or a non-true value all mean off', () => {
  assert.equal(sanitizeTaskReminderSettings().on, false);
  assert.equal(sanitizeTaskReminderSettings({}).on, false);
  assert.equal(sanitizeTaskReminderSettings({ on: 'yes' }).on, false);
  assert.equal(sanitizeTaskReminderSettings({ on: 1 }).on, false);
  assert.equal(taskRemindersOn(undefined), false);
  assert.equal(taskRemindersOn(sanitizeTaskReminderSettings({})), false);
  assert.equal(taskRemindersOn(sanitizeTaskReminderSettings({ on: true })), true);
});

t('a stored last-reminded day must be a real YYYY-MM-DD, otherwise it is blank', () => {
  assert.equal(sanitizeTaskReminderSettings({ lastRemindedDay: '2026-11-26' }).lastRemindedDay, '2026-11-26');
  assert.equal(sanitizeTaskReminderSettings({ lastRemindedDay: 'yesterday' }).lastRemindedDay, '');
  assert.equal(sanitizeTaskReminderSettings({ lastRemindedDay: 20261126 }).lastRemindedDay, '');
});

t('overdue and due-today tasks are selected', () => {
  const tasks = [
    { title: 'Late quote', dueDate: '2026-11-20', done: false },
    { title: 'Call back today', dueDate: '2026-11-26', done: false },
  ];
  const c = chooseTaskReminders(tasks, { now: NOON_UTC_26 });
  assert.equal(c.overdueCount, 1);
  assert.equal(c.dueTodayCount, 1);
  assert.equal(c.overdue[0].title, 'Late quote');
  assert.equal(c.dueToday[0].title, 'Call back today');
});

t('done tasks are excluded, even when they are past due', () => {
  const c = chooseTaskReminders([{ title: 'Finished', dueDate: '2026-11-01', done: true }, { title: 'Finished today', dueDate: '2026-11-26', done: true }], { now: NOON_UTC_26 });
  assert.equal(c.overdueCount + c.dueTodayCount, 0);
  assert.equal(buildTaskDigest(c), null);
});

t('future tasks and tasks with no due day are excluded', () => {
  const c = chooseTaskReminders([
    { title: 'Next week', dueDate: '2026-12-03', done: false },
    { title: 'Tomorrow', dueDate: '2026-11-27', done: false },
    { title: 'Undated', dueDate: '', done: false },
  ], { now: NOON_UTC_26 });
  assert.equal(c.overdueCount + c.dueTodayCount, 0);
});

t('the owner timezone offset moves the day boundary', () => {
  const lateUtc = Date.parse('2026-11-26T20:00:00Z');
  const task = [{ title: 'Due on the 26th', dueDate: '2026-11-26', done: false }];
  // UTC: still the 26th, so due today.
  assert.equal(chooseTaskReminders(task, { now: lateUtc, offsetMin: 0 }).dueTodayCount, 1);
  // Sri Lanka (+330): already the 27th at 01:30, so the 26th is overdue.
  const sl = chooseTaskReminders(task, { now: lateUtc, offsetMin: 330 });
  assert.equal(sl.day, '2026-11-27');
  assert.equal(sl.overdueCount, 1);
  // UTC-10 at 08:00 UTC is 22:00 on the 25th there, so the 26th is still in the future.
  const west = chooseTaskReminders(task, { now: Date.parse('2026-11-26T08:00:00Z'), offsetMin: -600 });
  assert.equal(west.day, '2026-11-25');
  assert.equal(west.overdueCount + west.dueTodayCount, 0);
});

t('no second digest on the same day', () => {
  const tasks = [{ title: 'Late quote', dueDate: '2026-11-20', done: false }];
  const again = chooseTaskReminders(tasks, { now: NOON_UTC_26, lastRemindedDay: '2026-11-26' });
  assert.equal(again.alreadySent, true);
  assert.equal(again.overdueCount + again.dueTodayCount, 0);
  assert.equal(buildTaskDigest(again), null);
  // The day before does not block today's digest.
  const next = chooseTaskReminders(tasks, { now: NOON_UTC_26, lastRemindedDay: '2026-11-25' });
  assert.equal(next.alreadySent, false);
  assert.ok(buildTaskDigest(next));
});

t('an empty list sends nothing', () => {
  assert.equal(buildTaskDigest(chooseTaskReminders([], { now: NOON_UTC_26 })), null);
  assert.equal(buildTaskDigest(chooseTaskReminders(null, { now: NOON_UTC_26 })), null);
  assert.equal(buildTaskDigest(chooseTaskReminders(undefined, { now: NOON_UTC_26 })), null);
  assert.equal(buildTaskDigest(null), null);
});

t('the digest lists overdue first, then due today, in both the text and the HTML', () => {
  const tasks = [
    { title: 'Due today item', dueDate: '2026-11-26', done: false },
    { title: 'Overdue item', dueDate: '2026-11-19', done: false },
  ];
  const d = buildTaskDigest(chooseTaskReminders(tasks, { now: NOON_UTC_26 }));
  assert.ok(d.text.indexOf('Overdue (1)') < d.text.indexOf('Due today (1)'));
  assert.ok(d.text.indexOf('Overdue item') < d.text.indexOf('Due today item'));
  assert.ok(d.html.indexOf('Overdue item') < d.html.indexOf('Due today item'));
  assert.match(d.text, /Overdue item \(due 2026-11-19\)/);
  assert.equal(d.subject, 'Tasks: 1 overdue and 1 due today');
  assert.equal(d.count, 2);
});

t('overdue rows are oldest due day first, and the digest escapes HTML in titles', () => {
  const tasks = [
    { title: 'Newer late', dueDate: '2026-11-24', done: false },
    { title: '<b>Oldest</b> & co', dueDate: '2026-11-10', done: false },
  ];
  const d = buildTaskDigest(chooseTaskReminders(tasks, { now: NOON_UTC_26 }));
  assert.ok(d.text.indexOf('Oldest') < d.text.indexOf('Newer late'));
  assert.ok(!d.html.includes('<b>Oldest</b>'));
  assert.ok(d.html.includes('&lt;b&gt;Oldest&lt;/b&gt; &amp; co'));
});

t('long lists are capped per section, with a note of how many are left out', () => {
  const tasks = Array.from({ length: REMINDER_LIST_MAX + 3 }, (_, i) => ({ title: `Late ${String(i).padStart(3, '0')}`, dueDate: '2026-11-01', done: false }));
  const d = buildTaskDigest(chooseTaskReminders(tasks, { now: NOON_UTC_26 }));
  assert.equal(d.count, REMINDER_LIST_MAX + 3);
  assert.match(d.text, /\.\.\.and 3 more on the Tasks page/);
});

console.log(`\n${n} passed`);
