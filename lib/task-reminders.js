// lib/task-reminders.js - the daily email of the team's tasks that are overdue or due today (pass 405). Pure: no database, no mail.
// Off unless the owner switches it on. At most one digest per owner per day. Days are the owner's calendar days, given as an offset
// from UTC in minutes (the same offset Today and the Tasks page use).
import { dayKey, taskState, TASK_TITLE_MAX } from './task-rules.js';

export const REMINDER_LIST_MAX = 25; // per section, so one very long list cannot make a huge email

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const clip = (v, n) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** The stored settings, cleaned. Anything that is not exactly `true` means off. */
export function sanitizeTaskReminderSettings(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    on: r.on === true,
    lastRemindedDay: typeof r.lastRemindedDay === 'string' && DAY_RE.test(r.lastRemindedDay) ? r.lastRemindedDay : '',
  };
}

/** True only when the owner has switched the reminder on. */
export function taskRemindersOn(settings) {
  return !!settings && settings.on === true;
}

/**
 * Which tasks need a reminder today. Not done, due today or earlier (overdue first, oldest due day first), and nothing at all
 * when the owner was already reminded on this day. Tasks with no due day never get a reminder.
 * @returns {{ day: string, alreadySent: boolean, overdue: {title: string, dueDate: string}[], dueToday: {title: string, dueDate: string}[], overdueCount: number, dueTodayCount: number }}
 */
export function chooseTaskReminders(tasks = [], { now = Date.now(), offsetMin = 0, lastRemindedDay = '' } = {}) {
  const day = dayKey(now, offsetMin);
  const base = { day, alreadySent: false, overdue: [], dueToday: [], overdueCount: 0, dueTodayCount: 0 };
  if (lastRemindedDay === day) return { ...base, alreadySent: true };
  const overdue = [];
  const dueToday = [];
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (!t || typeof t !== 'object' || typeof t.title !== 'string') continue;
    const state = taskState(t, now, offsetMin);
    const row = { title: clip(t.title, TASK_TITLE_MAX), dueDate: clip(t.dueDate, 10) };
    if (state === 'overdue') overdue.push(row);
    else if (state === 'due_today') dueToday.push(row);
  }
  overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
  dueToday.sort((a, b) => a.title.localeCompare(b.title));
  return {
    ...base,
    overdue: overdue.slice(0, REMINDER_LIST_MAX),
    dueToday: dueToday.slice(0, REMINDER_LIST_MAX),
    overdueCount: overdue.length,
    dueTodayCount: dueToday.length,
  };
}

/**
 * The email for the owner: overdue first, then due today, each with its title and due day.
 * @returns {{ subject: string, text: string, html: string, count: number } | null} null when nothing needs a reminder (send nothing).
 */
export function buildTaskDigest(chosen) {
  if (!chosen || chosen.alreadySent) return null;
  const { overdueCount = 0, dueTodayCount = 0 } = chosen;
  if (overdueCount + dueTodayCount === 0) return null;
  const parts = [];
  if (overdueCount) parts.push(`${overdueCount} overdue`);
  if (dueTodayCount) parts.push(`${dueTodayCount} due today`);
  const subject = `Tasks: ${parts.join(' and ')}`;
  const sections = [
    { heading: 'Overdue', count: overdueCount, rows: chosen.overdue || [] },
    { heading: 'Due today', count: dueTodayCount, rows: chosen.dueToday || [] },
  ].filter((s) => s.count > 0);
  const footer = 'You are getting this because the daily task reminder is on. Turn it off on the Tasks page.';

  const text = [`Tasks for ${chosen.day}`, '']
    .concat(...sections.map((s) => {
      const lines = [`${s.heading} (${s.count})`];
      for (const r of s.rows) lines.push(`- ${r.title} (due ${r.dueDate})`);
      if (s.count > s.rows.length) lines.push(`...and ${s.count - s.rows.length} more on the Tasks page`);
      return [...lines, ''];
    }))
    .concat([footer])
    .join('\n');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827">`
    + `<p>Tasks for ${esc(chosen.day)}</p>`
    + sections.map((s) => {
      const items = s.rows.map((r) => `<li>${esc(r.title)} <span style="color:#4b5563">(due ${esc(r.dueDate)})</span></li>`).join('');
      const more = s.count > s.rows.length ? `<p style="color:#4b5563">...and ${s.count - s.rows.length} more on the Tasks page</p>` : '';
      return `<h3 style="font-size:15px;margin:16px 0 4px">${esc(s.heading)} (${s.count})</h3><ul style="margin:0 0 8px;padding-left:20px">${items}</ul>${more}`;
    }).join('')
    + `<p style="color:#4b5563;font-size:12px;margin-top:20px">${esc(footer)}</p></div>`;

  return { subject, text, html, count: overdueCount + dueTodayCount };
}
