// lib/draft-queue.js - pure rules behind "drafts ready for you" (overnight preparation).
// No Firebase, no network, no AI: given inbox leads / due tasks / settings, say who is worth drafting for and what a queue doc looks like.
//
// The queue only ever holds DRAFTS. Nothing here sends anything: the owner opens the review window, edits, unticks, and presses Send.

export const QUEUE_KINDS = { FIRST: 'first', FOLLOWUP: 'followup' };
export const QUEUE_STATUS = { READY: 'ready', SENT: 'sent', DISMISSED: 'dismissed', STALE: 'stale' };

export const FIRST_PER_RUN_MAX = 10; // same cap as the manual "Draft first emails" window
export const FOLLOWUPS_PER_RUN_MAX = 10;
export const READY_CAP = 30; // never let unreviewed drafts pile up (AI spend and stale-draft risk)
export const DRAFT_MAX_AGE_DAYS = 5; // a draft older than this is stale: leads move, replies arrive

export const AUTOPILOT_DEFAULTS = {
  enabled: false, // preparing drafts overnight is opt-in
  includeWarm: false, // HOT leads only by default
  firstPerRun: FIRST_PER_RUN_MAX,
  followUpsPerRun: FOLLOWUPS_PER_RUN_MAX,
  autoDeals: true, // a positive reply moves/creates the deal (forward only, never to Lost, never sends anything)
  senderName: '', // the sign-off the overnight drafts use (the browser knows it; the server job does not)
};

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** Whatever the browser sends -> a safe settings object (unknown keys dropped, numbers clamped). */
export function sanitizeAutopilotSettings(raw, current = AUTOPILOT_DEFAULTS) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const base = { ...AUTOPILOT_DEFAULTS, ...current };
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : !!base.enabled,
    includeWarm: typeof r.includeWarm === 'boolean' ? r.includeWarm : !!base.includeWarm,
    firstPerRun: clampInt(r.firstPerRun, 0, FIRST_PER_RUN_MAX, base.firstPerRun),
    followUpsPerRun: clampInt(r.followUpsPerRun, 0, FOLLOWUPS_PER_RUN_MAX, base.followUpsPerRun),
    autoDeals: typeof r.autoDeals === 'boolean' ? r.autoDeals : !!base.autoDeals,
    senderName: typeof r.senderName === 'string' ? r.senderName.replace(/[\r\n]+/g, ' ').trim().slice(0, 80) : String(base.senderName || ''),
  };
}

/** One queue document per (owner, kind, lead[, follow-up step]). Same id = the same draft is never created twice. */
export function queueDocId(uid, kind, email, step = 0) {
  const e = String(email || '').trim().toLowerCase();
  return kind === QUEUE_KINDS.FOLLOWUP ? `${uid}_fu${Number(step) || 0}_${e}` : `${uid}_first_${e}`;
}

const QUALITY_RANK = { HOT: 3, WARM: 2, COLD: 1 };

/**
 * Inbox leads worth drafting a first email for tonight: status new, has an email, HOT (or WARM too when allowed),
 * not already in the queue / emailed / blocked (the caller passes those as `skip`). Best first.
 */
export function pickInboxLeads(leads, { includeWarm = false, max = FIRST_PER_RUN_MAX, skip = new Set() } = {}) {
  const skipSet = skip instanceof Set ? skip : new Set([...(skip || [])]);
  const seen = new Set();
  const out = [];
  for (const l of leads || []) {
    const email = String(l?.email || '').trim().toLowerCase();
    if (!email || seen.has(email) || skipSet.has(email)) continue;
    if (l.status && l.status !== 'new') continue;
    const q = String(l.lead_quality || '').toUpperCase();
    if (q !== 'HOT' && !(includeWarm && q === 'WARM')) continue;
    seen.add(email);
    out.push({
      email,
      business: String(l.business_name || '').trim() || 'your business',
      website: String(l.website || ''),
      category: String(l.category || ''),
      address: String(l.address || ''),
      contactName: String(l.first_name || ''),
      quality: q,
      score: Number(l.lead_quality_score) || 0,
    });
  }
  out.sort((a, b) => (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0) || b.score - a.score);
  return out.slice(0, Math.max(0, max));
}

const toMs = (v) => {
  if (!v) return 0;
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
};

/**
 * Due, still-open email follow-up tasks (prospects only: post-sale check-ins are a different flow), earliest first.
 * `postSaleStages` is passed in so this file stays dependency-free.
 */
export function pickDueFollowUps(tasks, { now = Date.now(), max = FOLLOWUPS_PER_RUN_MAX, skip = new Set(), postSaleStages = [] } = {}) {
  const skipSet = skip instanceof Set ? skip : new Set([...(skip || [])]);
  const seen = new Set();
  const out = [];
  const due = (tasks || [])
    .filter((t) => t && t.status !== 'completed' && t.channel === 'email' && t.leadEmail && !postSaleStages.includes(t.followUpStage))
    .filter((t) => !t.scheduledFor || toMs(t.scheduledFor) <= now)
    .sort((a, b) => toMs(a.scheduledFor) - toMs(b.scheduledFor));
  for (const t of due) {
    const email = String(t.leadEmail).trim().toLowerCase();
    if (seen.has(email) || skipSet.has(email)) continue; // one follow-up per lead per run, whatever the number of due tasks
    seen.add(email);
    out.push({ ...t, leadEmail: email });
    if (out.length >= max) break;
  }
  return out;
}

/** Is a ready draft too old to trust? */
export function isDraftStale(createdAt, now = Date.now()) {
  const t = toMs(createdAt);
  return !t || now - t > DRAFT_MAX_AGE_DAYS * 86400000;
}

/** Shape the dashboard needs for the review window (same item shape the manual batches use). */
export function toReviewItem(q, id) {
  if (q.kind === QUEUE_KINDS.FOLLOWUP) {
    return {
      id: q.taskId || q.email,
      queueId: id,
      task: { id: q.taskId || null, leadEmail: q.email, leadName: q.business, companyName: q.business, followUpStage: q.followUpStage || '' },
      email: q.email,
      business: q.business || q.email,
      subject: q.subject,
      body: q.body,
      number: q.number || 1,
      isFinal: !!q.isFinal,
      selected: true,
      state: 'draft',
      error: '',
    };
  }
  return { id: q.email, queueId: id, email: q.email, business: q.business || q.email, quality: q.quality || '', subject: q.subject, body: q.body, selected: true, state: 'draft', ...(q.angleId ? { angleId: q.angleId } : {}), ...(q.inbound ? { inbound: true, context: q.context || '' } : {}) };
}

/** Counts for the banner. `inbound` (someone contacted YOU) is counted apart from `first` (cold outreach you start). */
export function summarizeQueue(items) {
  const s = { first: 0, followup: 0, inbound: 0, total: 0 };
  for (const q of items || []) {
    if (q.kind === QUEUE_KINDS.FOLLOWUP) s.followup++;
    else if (q.inbound) s.inbound++;
    else s.first++;
    s.total++;
  }
  return s;
}
