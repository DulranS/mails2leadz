// lib/server/broadcast.js - sends a broadcast in batches, through the owner's own connected Gmail, with every safety check.
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, updateDoc, increment } from '../server-firestore.js';
import { isSuppressed, optOutFor, getSenderAddress } from './route-helpers.js';
import { withTextFooter } from './unsubscribe.js';
import { buildRawEmail } from '../raw-email.js';
import { openMailbox } from './autosend.js';
import { loadList, suppressedEmails } from './signup.js';
import { exportRows } from '../signup.js';
import { newDocRef } from './ids.js';
import { sanitizeBroadcast, fillBroadcast, consentLine, nextBatch, todaysSends, BROADCAST_LIMITS, validSchedule, isDue, roundRobin, CRON_BATCH_BUDGET } from '../broadcast.js';

const STOP_REASON = {
  no_gmail: 'Connect your Gmail in Account first.',
  no_send_access: 'Turn on sending in Account first (Gmail send permission).',
  auth: 'Your Gmail access has expired. Reconnect Gmail in Account.',
  gmail_unreachable: 'Gmail could not be reached just now. Try again in a few minutes.',
};

export async function createBroadcast(db, uid, raw, now = new Date()) {
  const clean = sanitizeBroadcast(raw);
  if (!clean.ok) return { error: clean.error };
  const ref = newDocRef(db, 'broadcasts');
  await setDoc(ref, { userId: uid, subject: clean.value.subject, body: clean.value.body, status: 'draft', recipients: [], cursor: 0, sent: 0, skipped: 0, failed: 0, createdAt: now.toISOString() });
  return { ok: true, id: ref.id };
}

/** Takes the snapshot of who will receive it: confirmed, not suppressed, capped. Refused when nothing is sending first. */
export async function startBroadcast(db, uid, id, now = new Date()) {
  const ref = doc(db, 'broadcasts', id);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().userId !== uid) return { error: 'That broadcast was not found.' };
  if (!['draft', 'scheduled'].includes(snap.data().status)) return { error: 'This broadcast has already started.' };
  const active = await getDocs(query(collection(db, 'broadcasts'), where('userId', '==', uid), where('status', '==', 'sending'), limit(1)));
  if (!active.empty) return { error: 'Another broadcast is still sending. Finish or cancel it first.' };
  const list = await loadList(db, uid);
  const rows = exportRows(list, { status: 'confirmed', suppressed: await suppressedEmails(db, uid), max: BROADCAST_LIMITS.recipientsMax });
  if (!rows.length) return { error: 'There is nobody confirmed on the list to send to yet.' };
  await updateDoc(ref, { status: 'sending', recipients: rows.map((r) => r.id), total: rows.length, startedAt: now.toISOString() });
  return { ok: true, total: rows.length, capped: rows.length >= BROADCAST_LIMITS.recipientsMax };
}

/**
 * Sends the next batch. Checks each person again at send time (still confirmed, not unsubscribed), and refuses to send
 * without an unsubscribe link. Returns counts and whether the broadcast is finished.
 */
export async function runBroadcastBatch(db, uid, id, { now = new Date(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), mailbox = null, businessName = '', baseOk = true } = {}) {
  const ref = doc(db, 'broadcasts', id);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().userId !== uid) return { error: 'That broadcast was not found.' };
  const b = snap.data();
  if (b.status !== 'sending') return { error: 'This broadcast is not sending.' };
  if (!baseOk) return { error: 'Set the public web address (https) in the server settings first, so every email has a working unsubscribe link.' };
  const dayRef = doc(db, 'users', uid, 'settings', 'broadcast_day');
  const day = await getDoc(dayRef);
  const sentToday = todaysSends(day.exists() ? day.data() : null, now);
  const batch = nextBatch({ recipients: b.recipients || [], cursor: Number(b.cursor) || 0, sentToday });
  if (sentToday >= BROADCAST_LIMITS.dailyMax) return { error: `Today's limit of ${BROADCAST_LIMITS.dailyMax} broadcast emails is reached. Continue tomorrow.`, done: false, sent: 0 };
  const box = mailbox || await openMailbox(db, uid);
  if (!box.ok) return { error: STOP_REASON[box.reason] || 'Gmail is not available.', done: false, sent: 0 };
  const address = await getSenderAddress(db, uid);
  let sent = 0; let skipped = 0; let failed = 0;
  for (const cid of batch.ids) {
    const c = await getDoc(doc(db, 'list_contacts', cid));
    if (!c.exists() || c.data().userId !== uid || c.data().status !== 'confirmed' || await isSuppressed(db, uid, c.data().email)) { skipped++; continue; }
    const to = c.data().email;
    try {
      const optOut = optOutFor(uid, to, address);
      const text = fillBroadcast(b.body, { name: c.data().name }) + `\n\n${consentLine(businessName)}`;
      const raw = buildRawEmail({ from: box.email, fromName: businessName, to, subject: fillBroadcast(b.subject, { name: c.data().name }), body: withTextFooter(text, optOut), extraHeaders: optOut?.headers || '' });
      await box.sendRaw(raw);
      sent++;
    } catch (e) {
      failed++;
      console.error('[broadcast] send failed:', String(e?.message || '').slice(0, 120));
    }
    await sleep(1500); // a steady pace, not a burst
  }
  const cursor = batch.nextCursor;
  const done = cursor >= (b.recipients || []).length;
  await updateDoc(ref, { cursor, sent: increment(sent), skipped: increment(skipped), failed: increment(failed), lastRunAt: now.toISOString(), ...(done ? { status: 'done', finishedAt: now.toISOString() } : {}) });
  await setDoc(dayRef, { date: now.toISOString().slice(0, 10), count: sentToday + sent + failed }, { merge: false });
  return { ok: true, sent, skipped, failed, done, remaining: Math.max(0, (b.recipients || []).length - cursor), dailyRoom: Math.max(0, BROADCAST_LIMITS.dailyMax - sentToday - sent - failed) };
}

/** Sets a start time for a draft. The scheduled run starts it then, and sends it in batches like any other. */
export async function scheduleBroadcast(db, uid, id, at, now = new Date()) {
  const v = validSchedule(at, now.getTime());
  if (!v.ok) return { error: v.error };
  const ref = doc(db, 'broadcasts', id);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().userId !== uid) return { error: 'That broadcast was not found.' };
  if (snap.data().status !== 'draft') return { error: 'Only a draft can be scheduled.' };
  await updateDoc(ref, { status: 'scheduled', scheduledFor: v.iso, scheduledAt: now.toISOString() });
  return { ok: true, scheduledFor: v.iso };
}

export async function unscheduleBroadcast(db, uid, id) {
  const ref = doc(db, 'broadcasts', id);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().userId !== uid) return { error: 'That broadcast was not found.' };
  if (snap.data().status !== 'scheduled') return { error: 'That broadcast is not scheduled.' };
  await updateDoc(ref, { status: 'draft', scheduledFor: null });
  return { ok: true };
}

/**
 * The scheduled run (once a day, from the cron job at 09:15 UTC). Starts scheduled broadcasts whose time has come, then sends up to
 * CRON_BATCH_BUDGET batches, fairly across accounts. A start that fails (nobody to send to) goes back to draft with the reason.
 */
export async function runDueBroadcasts(db, { now = new Date(), maxBatches = CRON_BATCH_BUDGET, sleep, baseOk = true } = {}) {
  const out = { started: 0, batches: 0, sent: 0, failed: 0, skipped: 0, finished: 0, errors: 0 };
  const nowMs = now.getTime();
  const due = await getDocs(query(collection(db, 'broadcasts'), where('status', '==', 'scheduled'), limit(50)));
  for (const d of due.docs) {
    if (!isDue({ ...d.data(), status: 'scheduled' }, nowMs)) continue;
    const r = await startBroadcast(db, d.data().userId, d.id, now);
    if (r.ok) { out.started++; continue; }
    out.errors++;
    await updateDoc(d.ref, { status: 'draft', scheduledFor: null, lastError: String(r.error || '').slice(0, 200) });
  }
  const active = await getDocs(query(collection(db, 'broadcasts'), where('status', '==', 'sending'), limit(100)));
  const byUser = new Map();
  for (const d of active.docs) {
    const uid = d.data().userId;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push(d.id);
  }
  const order = roundRobin([...byUser.values()], maxBatches);
  const businessNames = new Map();
  for (const id of order) {
    const snap = await getDoc(doc(db, 'broadcasts', id));
    if (!snap.exists() || snap.data().status !== 'sending') continue;
    const uid = snap.data().userId;
    if (!businessNames.has(uid)) {
      const b = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
      businessNames.set(uid, b.exists() ? String((b.data().profile || {}).businessName || '') : '');
    }
    const r = await runBroadcastBatch(db, uid, id, { now, sleep, businessName: businessNames.get(uid), baseOk });
    out.batches++;
    if (r.error) { out.errors++; continue; }
    out.sent += r.sent; out.failed += r.failed; out.skipped += r.skipped;
    if (r.done) out.finished++;
  }
  return out;
}

export async function cancelBroadcast(db, uid, id, now = new Date()) {
  const ref = doc(db, 'broadcasts', id);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().userId !== uid) return { error: 'That broadcast was not found.' };
  if (!['draft', 'sending'].includes(snap.data().status)) return { error: 'This broadcast has already finished.' };
  await updateDoc(ref, { status: 'cancelled', cancelledAt: now.toISOString() });
  return { ok: true };
}

export async function loadBroadcasts(db, uid) {
  const snap = await getDocs(query(collection(db, 'broadcasts'), where('userId', '==', uid), limit(50)));
  return snap.docs.map((d) => { const x = d.data(); return { id: d.id, subject: x.subject, status: x.status, scheduledFor: x.scheduledFor || null, total: x.total || (x.recipients || []).length, sent: x.sent || 0, skipped: x.skipped || 0, failed: x.failed || 0, createdAt: x.createdAt || null }; });
}
