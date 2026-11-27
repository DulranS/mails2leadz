// lib/server/task-reminders.js - the daily task reminder (pass 405). Runs from the daily-ops cron, after the owners' jobs.
// Opt-in per owner: users/{uid}/settings/task_reminders.on, mirrored as autopilot_users/{uid}.taskReminders so the job can find them.
// One digest per owner per day, sent from the owner's own connected Gmail to the owner's own address (the same way the owner's
// quote and report digests go out), and only when something is overdue or due today. The pure rules are in lib/task-reminders.js.
import { collection, doc, getDoc, getDocs, query, where, setDoc, isAdminMode } from '../server-firestore.js';
import { listTasks } from './tasks.js';
import { openMailbox } from './autosend.js';
import { buildRawEmail } from '../raw-email.js';
import { ownerOffsetMin } from './owner-clock.js';
import { sanitizeTaskReminderSettings, taskRemindersOn, chooseTaskReminders, buildTaskDigest } from '../task-reminders.js';

const nowIso = () => new Date().toISOString();
const settingsRef = (db, uid) => doc(db, 'users', String(uid), 'settings', 'task_reminders');
const indexRef = (db, uid) => doc(db, 'autopilot_users', String(uid));

/** The owner's reminder settings. Off on any read problem. */
export async function loadTaskReminders(db, uid) {
  try {
    const snap = await getDoc(settingsRef(db, uid));
    return sanitizeTaskReminderSettings(snap.exists() ? snap.data() : {});
  } catch {
    return sanitizeTaskReminderSettings({});
  }
}

/** Switch the reminder on or off. Writes the owner's settings doc and the index the daily job reads. Server-written only. */
export async function setTaskReminders(db, uid, on) {
  const next = on === true;
  await setDoc(settingsRef(db, uid), { on: next, updatedAt: nowIso() }, { merge: true });
  await setDoc(indexRef(db, uid), { userId: String(uid), taskReminders: next, updatedAt: nowIso() }, { merge: true });
  return { on: next };
}

/**
 * Sends today's digest to every owner who has the reminder on. Never throws for one owner's problem; the caller gets counts.
 * An owner already reminded today (lastRemindedDay) gets nothing. A digest is recorded only after the email went out.
 * @returns {Promise<{owners: number, sent: number, nothingDue: number, alreadySent: number, off: number, failed: number}>}
 */
export async function runTaskReminders(db, { now = Date.now(), send } = {}) {
  const out = { owners: 0, sent: 0, nothingDue: 0, alreadySent: 0, off: 0, failed: 0 };
  if (!isAdminMode()) return out;
  const snap = await getDocs(query(collection(db, 'autopilot_users'), where('taskReminders', '==', true)));
  for (const d of snap.docs) {
    const uid = String(d.data()?.userId || d.id || '');
    if (!uid) continue;
    out.owners++;
    try {
      const cfg = await loadTaskReminders(db, uid);
      if (!taskRemindersOn(cfg)) { out.off++; continue; } // the index is behind the owner's own switch, which decides
      const offsetMin = await ownerOffsetMin(db, uid, now);
      const chosen = chooseTaskReminders(await listTasks(db, uid), { now, offsetMin, lastRemindedDay: cfg.lastRemindedDay });
      if (chosen.alreadySent) { out.alreadySent++; continue; }
      const digest = buildTaskDigest(chosen);
      if (!digest) { out.nothingDue++; continue; }
      const box = await openMailbox(db, uid, { send });
      if (!box.ok) { out.failed++; continue; }
      await box.sendRaw(buildRawEmail({ from: box.email, fromName: 'AutoLeads', to: box.email, subject: digest.subject, body: digest.text, html: digest.html }));
      await setDoc(settingsRef(db, uid), { lastRemindedDay: chosen.day, updatedAt: nowIso() }, { merge: true });
      out.sent++;
    } catch (e) {
      out.failed++;
      console.error('[task-reminders] owner failed:', uid, String(e?.message || '').slice(0, 120));
    }
  }
  return out;
}
