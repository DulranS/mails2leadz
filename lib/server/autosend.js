// lib/server/autosend.js - Autosend: sends the drafts prepared overnight, from the owner's own Gmail, inside the owner's limits.
// Rules (cap, window, order, pauses) live in lib/autosend.js and are tested; this file only does the I/O around them.
//
// A draft is held to EXACTLY the checks a hand-pressed Send gets (lib/server/queue-checks.js: opted out, Lost, replied, already
// emailed, step already sent, stale) and then goes out with the opt-out link and headers. Everything it sends is recorded the same way
// a manual send is (sent_emails, follow-up counters, completed task), so Customers, KPIs and reply tracking keep working.
import { google } from 'googleapis';
import { collection, doc, addDoc, setDoc, updateDoc, getDocs, getDoc, query, where, isAdminMode } from '../server-firestore.js';
import { accessTokenFor, patchConnection, loadConnection } from './gmail-offline.js';
import { readyDrafts, loadAutopilot } from './prepare-drafts.js';
import { stillGood } from './queue-checks.js';
import { countToday } from './daily-count.js';
import { optOutFor, getSenderAddress, pickOriginal } from './route-helpers.js';
import { withTextFooter } from './unsubscribe.js';
import { inboxDocId } from './ingest-key.js';
import { inboxKey, INBOX_STATUS } from '../lead-inbox.js';
import { QUEUE_KINDS, QUEUE_STATUS } from '../draft-queue.js';
import { followUpTasksFor } from '../first-email-batch.js';
import { DEFAULT_FOLLOW_UP_TEMPLATES } from '../default-templates.js';
import { buildRawEmail } from '../raw-email.js';
import { MAX_FOLLOW_UPS } from './draft-core.js';
import { nicheFields } from '../niche.js';
import {
  AUTOSEND_PER_RUN_MAX, MAX_RUN_FAILURES, inSendWindow, sendRoom, planAutosend, shouldPause, classifyGmailError, pauseBetweenSendsMs, localParts,
} from '../autosend.js';

const PLATFORM_DAILY_CAP = 500; // the same ceiling the manual sender uses
const nowIso = () => new Date().toISOString();
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextGap = (n) => (n === 0 ? 4 : n === 1 ? 2 : n === 2 ? 5 : 10);

/** Switch Autosend off and say why (shown on the Account page). Never throws. */
export async function pauseAutosend(db, uid, reason) {
  try {
    await setDoc(doc(db, 'users', uid, 'settings', 'autopilot'), { autoSendPaused: true, autoSendPauseReason: String(reason || '').slice(0, 200), updatedAt: nowIso() }, { merge: true });
  } catch { /* the run result still reports it */ }
}

async function autoSentToday(db, uid, dateKey) {
  try {
    const snap = await getDoc(doc(db, 'autosend_log', `${uid}_${dateKey}`));
    return snap.exists() ? Number(snap.data().count) || 0 : 0;
  } catch { return 0; }
}
async function bumpAutoSent(db, uid, dateKey, n) {
  try { await setDoc(doc(db, 'autosend_log', `${uid}_${dateKey}`), { userId: uid, date: dateKey, count: n, updatedAt: nowIso() }, { merge: true }); } catch { /* the cap also reads sent_emails */ }
}

/** Last 7 days: how many emails went out and how many addresses bounced (suppressions with source 'bounce'). */
async function bounceStats(db, uid, now) {
  const since = new Date(now - 7 * 86400000).toISOString();
  try {
    const [sent, sup] = await Promise.all([
      getDocs(query(collection(db, 'sent_emails'), where('userId', '==', uid), where('sentAt', '>=', since))),
      getDocs(query(collection(db, 'suppressions'), where('userId', '==', uid), where('source', '==', 'bounce'))),
    ]);
    const bounced = sup.docs.filter((d) => String(d.data().createdAt || '') >= since).length;
    return { sent7: sent.size, bounced7: bounced };
  } catch { return { sent7: 0, bounced7: 0 }; }
}

/**
 * The owner's Gmail, ready to send from: { ok: true, email, sendRaw(raw) } or { ok: false, reason } (reason is a key of AUTOSEND_STOP_TEXT).
 * An expired / revoked grant pauses Autosend with a plain explanation, so nothing keeps failing silently.
 */
export async function openMailbox(db, uid, { send } = {}) {
  const conn = await loadConnection(db, uid);
  if (!conn || conn.status !== 'ok') return { ok: false, reason: 'no_gmail' };
  if (conn.canSend !== true) return { ok: false, reason: 'no_send_access' };
  const tok = await accessTokenFor(db, uid);
  if (!tok.token) {
    if (tok.expired) {
      await patchConnection(db, uid, { status: 'expired', lastError: tok.error || null });
      await pauseAutosend(db, uid, 'Gmail access expired. Reconnect Gmail in Account, then switch Autosend back on.');
      return { ok: false, reason: 'auth' };
    }
    return { ok: false, reason: 'gmail_unreachable' };
  }
  let gmail = null;
  const sendRaw = send || (async (raw) => {
    if (!gmail) {
      const client = new google.auth.OAuth2(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET);
      client.setCredentials({ access_token: tok.token });
      gmail = google.gmail({ version: 'v1', auth: client });
    }
    const r = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return { id: r.data.id, threadId: r.data.threadId };
  });
  return { ok: true, email: tok.email, sendRaw };
}

/**
 * One Autosend run for one owner.
 * @returns {{ sent: number, skipped: number, failed: number, stopped: string }}  stopped = why it ended early ('' when it did not)
 */
export async function autosendForUser(db, uid, { settings, now = Date.now(), deadline = Date.now() + 240000, sleep = defaultSleep, send } = {}) {
  const out = { sent: 0, skipped: 0, failed: 0, stopped: '' };
  if (!isAdminMode()) { out.stopped = 'no_admin'; return out; }
  const cfg = settings || (await loadAutopilot(db, uid));
  if (!cfg.autoSend) { out.stopped = 'off'; return out; }
  if (cfg.autoSendPaused) { out.stopped = 'paused'; return out; }
  const win = inSendWindow(now, cfg);
  if (!win.ok) { out.stopped = win.why; return out; }

  // Bounces first: if too many addresses did not exist, stop before sending anything more.
  const verdict = shouldPause(await bounceStats(db, uid, now));
  if (verdict.pause) { await pauseAutosend(db, uid, verdict.reason); out.stopped = 'bounces'; await recordRun(db, uid, out); return out; }

  const { dateKey } = localParts(now, cfg.tzOffsetMin);
  const [autoCount, sentToday] = await Promise.all([autoSentToday(db, uid, dateKey), countToday(db, 'sent_emails', 'sentAt', uid)]);
  let room = sendRoom({ autoSentToday: autoCount, sentToday: sentToday ?? 0, perDay: cfg.autoSendPerDay, platformCap: PLATFORM_DAILY_CAP, perRun: AUTOSEND_PER_RUN_MAX });
  if (room <= 0) { out.stopped = 'daily_cap'; return out; }

  // The drafts, best first. Each one is re-checked right now (a reply may have arrived since the draft was written).
  const plan = planAutosend(await readyDrafts(db, uid), room * 3);
  if (!plan.length) { out.stopped = 'nothing_ready'; return out; }

  const box = await openMailbox(db, uid, { send });
  if (!box.ok) { out.stopped = box.reason; await recordRun(db, uid, out); return out; }
  const tok = { email: box.email };
  const sendRaw = box.sendRaw;

  const address = await getSenderAddress(db, uid);
  let failuresInRow = 0;
  let sentThisRun = 0;
  for (const q of plan) {
    if (room <= 0) break;
    if (Date.now() > deadline - 20000) { out.stopped = 'time'; break; }
    const ref = doc(db, 'draft_queue', q.id);
    try {
      if (!(await stillGood(db, uid, q))) {
        await setDoc(ref, { status: QUEUE_STATUS.STALE, staleAt: nowIso() }, { merge: true }).catch(() => {});
        out.skipped++;
        continue;
      }
      if (sentThisRun > 0) await sleep(pauseBetweenSendsMs(sentThisRun)); // a human-looking pace, not a burst
      const optOut = optOutFor(uid, q.email, address);
      const raw = buildRawEmail({ from: tok.email, fromName: cfg.senderName, to: q.email, subject: q.subject, body: withTextFooter(q.body, optOut), extraHeaders: optOut?.headers || '' });
      const res = await sendRaw(raw);
      const at = nowIso();

      if (q.kind === QUEUE_KINDS.FOLLOWUP) {
        const snap = await getDocs(query(collection(db, 'sent_emails'), where('userId', '==', uid), where('to', '==', q.email)));
        const picked = snap.empty ? null : pickOriginal(snap.docs);
        if (picked) {
          const n = picked.count + 1;
          await updateDoc(picked.doc.ref, {
            followUpCount: n, followUpSentCount: n, lastFollowUpAt: at, lastFollowUpSentAt: at,
            followUpDates: [...(picked.data.followUpDates || []), at],
            followUpAt: n < MAX_FOLLOW_UPS ? new Date(Date.now() + nextGap(n) * 86400000).toISOString() : null,
          });
        }
        if (q.taskId) await updateDoc(doc(db, 'users', uid, 'follow_up_tasks', q.taskId), { status: 'completed', completedAt: at, completedBy: 'autosend', method: 'autosend' }).catch(() => {});
      } else {
        await addDoc(collection(db, 'sent_emails'), {
          userId: uid, to: q.email, businessName: q.business || '', subject: q.subject, body: q.body, template: 'A', abTest: false, sentAt: at,
          opened: false, openedCount: 0, clicked: false, clickCount: 0, replied: false, followUpCount: 0, followUpSentCount: 0,
          followUpAt: new Date(Date.now() + 2 * 86400000).toISOString(), lastFollowUpAt: null, lastFollowUpSentAt: null, followUpDates: [],
          messageId: res.id || '', threadId: res.threadId || '', csvSource: q.inbound ? 'inbound_reply' : 'autosend', sentBy: 'autosend',
          ...(q.angleId ? { angle: q.angleId } : {}),
          ...nicheFields(q.category),
        });
        if (!q.inbound) {
          // The cold lead enters the follow-up queue (the same schedule the dashboard creates after a hand-sent first email).
          const have = await getDocs(query(collection(db, 'users', uid, 'follow_up_tasks'), where('leadEmail', '==', q.email)));
          if (have.empty) {
            for (const t of followUpTasksFor([{ email: q.email, name: q.business, company: q.business }], DEFAULT_FOLLOW_UP_TEMPLATES)) {
              await addDoc(collection(db, 'users', uid, 'follow_up_tasks'), { ...t, status: 'pending', createdAt: at, completedAt: null }).catch(() => {});
            }
          }
          await setDoc(doc(db, 'lead_inbox', inboxDocId(uid, inboxKey({ email: q.email }))), { status: INBOX_STATUS.LOADED }, { merge: true }).catch(() => {});
        }
      }
      await setDoc(ref, { status: QUEUE_STATUS.SENT, resolvedAt: at, sentBy: 'autosend', messageId: res.id || '' }, { merge: true });
      out.sent++; sentThisRun++; room--; failuresInRow = 0;
      await bumpAutoSent(db, uid, dateKey, autoCount + out.sent);
    } catch (e) {
      const c = classifyGmailError(e);
      out.failed++; failuresInRow++;
      console.error('[autosend] send failed:', uid, c.kind, String(e?.message || '').slice(0, 120)); // never log tokens or message bodies
      if (c.kind === 'auth') { await patchConnection(db, uid, { status: 'expired', lastError: c.reason }).catch(() => {}); await pauseAutosend(db, uid, c.reason); out.stopped = 'auth'; break; }
      if (c.kind === 'limit') { out.stopped = 'gmail_limit'; break; }
      if (failuresInRow >= MAX_RUN_FAILURES) { out.stopped = 'failures'; break; }
    }
  }
  if (out.sent > 0) await setDoc(doc(db, 'users', uid, 'settings', 'autopilot'), { lastAutoSendAt: nowIso(), lastAutoSendCount: out.sent }, { merge: true }).catch(() => {});
  await recordRun(db, uid, out);
  return out;
}

// What the last real run did, so the Account and Business pages can show it. Quiet outcomes (off, weekend, nothing ready) are not recorded.
const QUIET_STOPS = new Set(['off', 'paused', 'weekend', 'before_window', 'after_window', 'daily_cap', 'nothing_ready', 'no_admin', 'time', '']);
async function recordRun(db, uid, out) {
  if (QUIET_STOPS.has(out.stopped) && !out.sent && !out.failed) return;
  await setDoc(doc(db, 'users', uid, 'settings', 'autopilot'), { lastAutoSend: { at: nowIso(), sent: out.sent, failed: out.failed, stopped: out.stopped || '' } }, { merge: true }).catch(() => {});
}

export const AUTOSEND_STOP_TEXT = {
  off: 'Autosend is off.', paused: 'Autosend is paused.', weekend: 'Weekend: nothing sent.', before_window: 'Before the send window.', after_window: 'After the send window.',
  bounces: 'Paused: too many bounces.', no_gmail: 'Gmail is not connected.', no_send_access: 'Gmail has no permission to send.', daily_cap: 'Daily cap reached.',
  nothing_ready: 'No drafts ready.', auth: 'Gmail access expired.', gmail_unreachable: 'Could not reach Gmail.', gmail_limit: 'Gmail asked to slow down.', failures: 'Several sends failed in a row.', time: 'Ran out of time; continues next run.', no_admin: 'Server has no database access.',
};
export { AUTOSEND_PER_RUN_MAX };
