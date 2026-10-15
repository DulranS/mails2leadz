// lib/server/prepare-drafts.js - "drafts ready for you": prepares first emails (HOT leads in the Lead Inbox) and due follow-ups
// ahead of time and parks them in `draft_queue`. The owner opens the review window, edits / unticks, and presses Send.
//
// NOTHING IS SENT HERE. The queue holds drafts only, and every draft goes through the same checks as a hand-made one
// (lib/server/draft-core.js) and through the normal send routes later (opt-out, Lost, replied, daily cap, follow-up limits).
// Needs the Firebase Admin SDK (the queue is server-written) and an AI key. Without them it does nothing.
import { collection, doc, getDoc, getDocs, query, where, setDoc, isAdminMode } from '../server-firestore.js';
import { AiError } from '../ai-client.js';
import { DraftError, draftFirstEmail, draftFollowUp } from './draft-core.js';
import { POST_SALE_STAGES } from '../default-templates.js';
import {
  AUTOPILOT_DEFAULTS, QUEUE_KINDS, QUEUE_STATUS, READY_CAP, sanitizeAutopilotSettings,
  pickInboxLeads, pickDueFollowUps, queueDocId, isDraftStale,
} from '../draft-queue.js';

const nowIso = () => new Date().toISOString();

// ---- settings: users/{uid}/settings/autopilot (owner-editable) + autopilot_users/{uid} (index the nightly job reads) ----
export async function loadAutopilot(db, uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'settings', 'autopilot'));
    return sanitizeAutopilotSettings(snap.exists() ? snap.data() : {}, AUTOPILOT_DEFAULTS);
  } catch {
    return { ...AUTOPILOT_DEFAULTS };
  }
}

export async function saveAutopilot(db, uid, patch) {
  const current = await loadAutopilot(db, uid);
  const next = sanitizeAutopilotSettings(patch, current);
  await setDoc(doc(db, 'users', uid, 'settings', 'autopilot'), { ...next, updatedAt: nowIso() }, { merge: true });
  await setDoc(doc(db, 'autopilot_users', uid), { userId: uid, enabled: next.enabled, updatedAt: nowIso() }, { merge: true });
  return next;
}

export async function listAutopilotUsers(db) {
  const snap = await getDocs(query(collection(db, 'autopilot_users'), where('enabled', '==', true)));
  return snap.docs.map((d) => d.data().userId || d.id);
}

// ---- queue ----
export async function readyDrafts(db, uid) {
  const snap = await getDocs(query(collection(db, 'draft_queue'), where('userId', '==', uid), where('status', '==', QUEUE_STATUS.READY)));
  return snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
}

/**
 * Prepare drafts for one owner.
 * @returns {{ first: number, followup: number, skipped: number, stopped: string }}  stopped = why it ended early ('' when it did not)
 */
export async function prepareDraftsForUser(db, uid, { settings, kinds = [QUEUE_KINDS.FIRST, QUEUE_KINDS.FOLLOWUP], deadline = Date.now() + 240000 } = {}) {
  const out = { first: 0, followup: 0, skipped: 0, stopped: '' };
  if (!isAdminMode()) { out.stopped = 'no_admin'; return out; }
  const cfg = settings || (await loadAutopilot(db, uid));

  const ready = await readyDrafts(db, uid);
  // Old unreviewed drafts go stale (leads move on, replies arrive). They are marked, not deleted, so the owner can still see them in an export.
  const fresh = [];
  for (const q of ready) {
    if (isDraftStale(q.createdAt)) await setDoc(q.ref, { status: QUEUE_STATUS.STALE, staleAt: nowIso() }, { merge: true }).catch(() => {});
    else fresh.push(q);
  }
  let room = READY_CAP - fresh.length;
  if (room <= 0) { out.stopped = 'queue_full'; return out; }

  const stop = (e) => {
    // Out of AI budget / no profile / provider down: stop quietly, try again tomorrow.
    if (e instanceof AiError || (e instanceof DraftError && e.code === 'NO_PROFILE')) { out.stopped = e.code || 'ai'; return true; }
    return false;
  };
  const save = (id, data) => setDoc(doc(db, 'draft_queue', id), { userId: uid, ...data }, { merge: false });

  // 1) first emails for HOT inbox leads
  if (kinds.includes(QUEUE_KINDS.FIRST) && cfg.firstPerRun > 0) {
    const inbox = await getDocs(query(collection(db, 'lead_inbox'), where('userId', '==', uid), where('status', '==', 'new')));
    const picks = pickInboxLeads(inbox.docs.map((d) => d.data()), { includeWarm: cfg.includeWarm, max: cfg.firstPerRun * 3 });
    let made = 0;
    for (const c of picks) {
      if (made >= cfg.firstPerRun || room <= 0 || out.stopped || Date.now() > deadline) break;
      const id = queueDocId(uid, QUEUE_KINDS.FIRST, c.email);
      if ((await getDoc(doc(db, 'draft_queue', id))).exists()) continue; // drafted before (sent, dismissed or still waiting)
      try {
        const r = await draftFirstEmail({ db, uid, companyName: c.business, companyWebsite: c.website, contactEmail: c.email, contactName: c.contactName, senderName: cfg.senderName, category: c.category, location: c.address });
        await save(id, { kind: QUEUE_KINDS.FIRST, status: QUEUE_STATUS.READY, email: c.email, business: c.business, quality: c.quality, score: c.score, subject: String(r.draft.subject).slice(0, 200), body: String(r.draft.body).slice(0, 2500), angle: r.angle, createdAt: nowIso() });
        made++; room--; out.first++;
      } catch (e) {
        if (stop(e)) break;
        if (e instanceof DraftError && e.status === 409) { // already emailed / opted out / Lost: remember it so tomorrow does not try again
          await save(id, { kind: QUEUE_KINDS.FIRST, status: QUEUE_STATUS.DISMISSED, email: c.email, business: c.business, reason: e.code || 'already_emailed', createdAt: nowIso() }).catch(() => {});
        }
        out.skipped++;
      }
    }
  }

  // 2) follow-ups that are due (never for someone who replied: the draft rules refuse them)
  if (kinds.includes(QUEUE_KINDS.FOLLOWUP) && cfg.followUpsPerRun > 0 && !out.stopped) {
    const tasksSnap = await getDocs(query(collection(db, 'users', uid, 'follow_up_tasks'), where('status', '==', 'pending')));
    const haveReady = new Set(fresh.filter((q) => q.kind === QUEUE_KINDS.FOLLOWUP).map((q) => q.email));
    const due = pickDueFollowUps(tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() })), { max: cfg.followUpsPerRun, skip: haveReady, postSaleStages: POST_SALE_STAGES });
    let made = 0;
    for (const t of due) {
      if (made >= cfg.followUpsPerRun || room <= 0 || out.stopped || Date.now() > deadline) break;
      try {
        const r = await draftFollowUp({ db, uid, email: t.leadEmail, senderName: cfg.senderName });
        const id = queueDocId(uid, QUEUE_KINDS.FOLLOWUP, t.leadEmail, r.followUpNumber);
        await save(id, { kind: QUEUE_KINDS.FOLLOWUP, status: QUEUE_STATUS.READY, email: t.leadEmail, business: t.leadName || t.companyName || r.businessName || t.leadEmail, subject: r.draft.subject, body: r.draft.body, number: r.followUpNumber, isFinal: r.isFinal, taskId: t.id, followUpStage: t.followUpStage || '', createdAt: nowIso() });
        made++; room--; out.followup++;
      } catch (e) {
        if (stop(e)) break;
        out.skipped++; // replied / opted out / Lost / limit reached: nothing to prepare for this lead
      }
    }
  }
  return out;
}
