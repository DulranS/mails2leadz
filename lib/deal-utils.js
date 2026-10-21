// lib/deal-utils.js - single source of truth for how deals are identified, staged and valued.
// (Before this, the dashboard keyed deals by bare email while the CRM page and API used uid_email.)

import { sanitizeQualification, sanitizeOnboardingDone, sanitizeIssues } from './deal-extras.js';
import { looksLikePhone } from './lead-name.js';

export const OPEN_STAGES = ['new', 'contacted', 'qualified', 'demo', 'proposal', 'negotiation'];
// A cold contact is a PROSPECT, not pipeline. Only deals a human has qualified count toward
// pipeline value and the forecast (otherwise messaging 300 leads would show $300k of "pipeline").
export const PROSPECT_STAGES = ['new', 'contacted'];
export const PIPELINE_STAGES = ['qualified', 'demo', 'proposal', 'negotiation'];
// Post-sale stages (delivery / retention / expansion) are customers who already bought:
// they count as WON revenue once and never re-enter the open pipeline.
export const WON_STAGES = ['closed_won', 'delivery', 'retention', 'expansion'];
export const CLOSED_STAGES = [...WON_STAGES, 'closed_lost'];
export const ALL_STAGES = [...OPEN_STAGES, ...CLOSED_STAGES];

export const STAGE_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  demo: 'Demo / Meeting',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  closed_won: 'Won',
  delivery: 'Delivery',
  retention: 'Retention',
  expansion: 'Expansion',
  closed_lost: 'Lost',
};

// Starting win probabilities. Users can override them in Business Value -> Settings.
export const DEFAULT_STAGE_PROBABILITY = {
  qualified: 0.25,
  demo: 0.4,
  proposal: 0.6,
  negotiation: 0.75,
};

// Why a deal was lost (picked by the owner when marking Lost). 'unsubscribed' / 'bounced' are SYSTEM reasons set by the
// opt-out + bounce handling: they are never offered in the picker and never counted as a lost sale.
export const LOST_REASONS = [
  { id: 'price', label: 'Price / budget' },
  { id: 'timing', label: 'Not now / bad timing' },
  { id: 'competitor', label: 'Chose a competitor' },
  { id: 'no_need', label: 'No real need' },
  { id: 'not_interested', label: 'Said no / not interested' },
  { id: 'no_response', label: 'Went silent' },
  { id: 'other', label: 'Other' },
];
// Where a deal came from. Cold-email deals need no tag: they are recognised from the emails the app sent.
// Set only when the deal is created (CRM -> Add a lead); never changed afterwards.
export const LEAD_SOURCES = [
  { id: 'referral', label: 'Referral' },
  { id: 'inbound', label: 'Inbound enquiry' },
  { id: 'other', label: 'Other (walk-in, event, ...)' },
];
export const SOURCE_LABELS = { email: 'Cold email outreach', referral: 'Referral', inbound: 'Inbound enquiry', other: 'Other', unrecorded: 'Not recorded' };

export const SYSTEM_LOST_REASONS = ['unsubscribed', 'bounced'];
export const lostReasonLabel = (id) => LOST_REASONS.find((r) => r.id === id)?.label || 'Not recorded';

// Lost deals worth another look: the reason can change with time (money, timing, silence). A plain "no", "no need" or
// "other" is respected and left alone, and opted-out / bounced contacts are never contacted again.
export const REVIVABLE_REASONS = ['price', 'timing', 'no_response'];
export const REVIVE_AFTER_DAYS = 45;

/** Whole days since the deal was last updated OR the owner last spoke to the customer (whichever is later); null if unknown. */
export function daysQuiet(deal, now = Date.now()) {
  const times = [deal?.lastUpdate, deal?.lastTouchAt]
    .map((v) => (typeof v === 'number' ? v : Date.parse(v || '')))
    .filter((t) => Number.isFinite(t));
  if (!times.length) return null;
  return Math.max(0, Math.floor((now - Math.max(...times)) / 86400000));
}

/** Can a lost deal be revived (a re-engagement email drafted) right now? Pure, so the screen and the server agree. */
export function reviveCheck({ stage, lostReason, quietDays, optedOut = false }) {
  if (normalizeStage(stage) !== 'closed_lost') return { ok: false, code: 'NOT_LOST', reason: 'Only lost deals can be revived.' };
  if (optedOut || SYSTEM_LOST_REASONS.includes(lostReason)) return { ok: false, code: 'OPTED_OUT', reason: 'This contact opted out or the address bounced, so nothing is drafted.' };
  if (!REVIVABLE_REASONS.includes(lostReason)) return { ok: false, code: 'NOT_REVIVABLE', reason: `This deal was lost because: ${lostReasonLabel(lostReason)}. That is respected, so no re-engagement is drafted.` };
  if (quietDays != null && quietDays < REVIVE_AFTER_DAYS) return { ok: false, code: 'TOO_SOON', reason: `Give it time: ${REVIVE_AFTER_DAYS} days after the last contact (it has been ${quietDays}).` };
  return { ok: true, code: 'OK', reason: '' };
}

export const dealDocId = (uid, email) => `${uid}_${String(email || '').trim().toLowerCase()}`;

const ALIASES = { won: 'closed_won', lost: 'closed_lost', engaged: 'contacted', followup: 'contacted', replied: 'contacted', lead: 'new' };

export function normalizeStage(stage) {
  const s = String(stage || 'new').trim().toLowerCase();
  const mapped = ALIASES[s] || s;
  return ALL_STAGES.includes(mapped) ? mapped : 'new';
}

export const isClosed = (stage) => CLOSED_STAGES.includes(normalizeStage(stage));
export const isWon = (stage) => WON_STAGES.includes(normalizeStage(stage));

/** Only set closedAt / createdAt when they are actually changing, so history stays truthful. */
export function buildDealWrite({ uid, email, stage, value, businessName, existing, lostReason, source, sourceDetail, referralAsked, feedbackAsked, customerQuote, qualification, onboardingDone, issues, touch, recurringMonthly, renewalAt, deliveryCost, churn, churnReason, ownerId, now = new Date() }) {
  const iso = now.toISOString();
  const nextStage = normalizeStage(stage ?? existing?.stage);
  const write = {
    userId: uid,
    email: String(email).trim().toLowerCase(),
    stage: nextStage,
    lastUpdate: iso,
  };
  if (businessName && !looksLikePhone(businessName)) write.businessName = businessName; // never store a phone number as the name
  if (value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) {
    write.value = Math.max(0, Number(value));
    write.valueIsEstimate = false;
  }
  if (!existing) write.createdAt = iso;
  const wasClosed = existing ? isClosed(existing.stage) : false;
  if (isClosed(nextStage) && !wasClosed) write.closedAt = iso;
  if (!isClosed(nextStage) && wasClosed) write.closedAt = null; // re-opened
  // Stages this deal has really been in. `reachedFull` marks deals tracked from creation, so stage-chance suggestions
  // only learn from deals whose whole path is known (older deals only know their current stage).
  const prevReached = Array.isArray(existing?.reached) ? existing.reached : existing ? [normalizeStage(existing.stage)] : [];
  write.reached = [...new Set([...prevReached, nextStage])];
  if (!existing) write.reachedFull = true;
  // When each stage was FIRST reached (feeds the weekly report: qualified / demos / wins this week). Never overwritten.
  const prevTimes = existing?.stageTimes && typeof existing.stageTimes === 'object' ? existing.stageTimes : {};
  // Stamped only when the stage really changes (or the deal is new): re-saving an old deal must not look like fresh progress.
  const stageChanged = !existing || normalizeStage(existing.stage) !== nextStage;
  write.stageTimes = stageChanged && !prevTimes[nextStage] ? { ...prevTimes, [nextStage]: iso } : { ...prevTimes };
  // Optional per-deal extras (each is replaced as a whole when given, left alone when not).
  if (qualification !== undefined) write.qualification = { ...sanitizeQualification(qualification), updatedAt: iso };
  if (onboardingDone !== undefined) write.onboardingDone = sanitizeOnboardingDone(onboardingDone);
  if (issues !== undefined) write.issues = sanitizeIssues(issues);
  if (referralAsked === true) write.referralAskedAt = iso; // the owner asked this customer for an introduction
  if (feedbackAsked === true) write.feedbackAskedAt = iso; // the owner asked how it went / for a quotable result
  // The customer's result in the owner's words, kept only with the customer's OK (the owner confirms that). Empty clears it.
  if (customerQuote !== undefined) {
    const q = String(customerQuote ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    write.customerQuote = q || null;
  }
  if (touch === true) write.lastTouchAt = iso; // the owner really spoke to / wrote to this customer
  // Subscription facts (all optional; a one-off business never sets them). Amount is PER MONTH (a yearly plan: the yearly price / 12).
  if (recurringMonthly !== undefined) {
    const n = Number(recurringMonthly);
    write.recurringMonthly = Number.isFinite(n) && n > 0 ? Math.min(1e9, Math.round(n * 100) / 100) : 0;
  }
  if (renewalAt !== undefined) {
    const t = renewalAt ? new Date(renewalAt).getTime() : NaN;
    write.renewalAt = Number.isFinite(t) ? new Date(t).toISOString() : null; // empty or unreadable clears it
  }
  // What it cost to deliver this deal (goods bought, contractor, shipping...), one-off, in the owner's currency. Empty clears it.
  // 0 is a real answer ("it cost nothing"), so only null / empty string mean "not entered".
  if (deliveryCost !== undefined) {
    const n = deliveryCost === null || deliveryCost === '' ? NaN : Number(deliveryCost);
    write.deliveryCost = Number.isFinite(n) && n >= 0 ? Math.min(1e9, Math.round(n * 100) / 100) : null;
  }
  // A customer who leaves is NOT a lost deal (that would corrupt the win rate): the stage stays, churnedAt records when they left.
  if (churn === true) {
    write.churnedAt = existing?.churnedAt || iso; // marking twice keeps the first date
    const why = String(churnReason ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (why) write.churnReason = why;
  } else if (churn === false) {
    write.churnedAt = null; // came back
    write.churnReason = null;
  }
  // Who works this deal (a label from the Team list in Account). Left alone when not given; empty clears it.
  if (ownerId !== undefined) write.ownerId = /^[a-z0-9-]{1,24}$/.test(String(ownerId || '')) ? String(ownerId) : null;
  if (!existing && LEAD_SOURCES.some((x) => x.id === source)) write.source = source;
  // Which channel an inbound enquiry came through (instagram, website, qr ...): the "what brings enquiries" signal. Set once, on creation.
  if (!existing && write.source && typeof sourceDetail === 'string' && sourceDetail.trim()) write.sourceDetail = sourceDetail.trim().slice(0, 40);
  // Lost reason: only for a deal that is Lost, only from the picker list, never over a system reason (opt-out / bounce).
  const systemReason = SYSTEM_LOST_REASONS.includes(existing?.lostReason);
  if (nextStage === 'closed_lost' && !systemReason && LOST_REASONS.some((r) => r.id === lostReason)) write.lostReason = lostReason;
  if (nextStage !== 'closed_lost' && existing?.lostReason && !systemReason) write.lostReason = null; // re-opened: reason no longer applies
  return write;
}
