// lib/deal-utils.js - single source of truth for how deals are identified, staged and valued.
// (Before this, the dashboard keyed deals by bare email while the CRM page and API used uid_email.)

import { sanitizeQualification, sanitizeOnboardingDone, sanitizeIssues } from './deal-extras.js';
import { looksLikePhone } from './lead-name.js';
import { sanitizeCustomValues } from './custom-fields.js';

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

// Spellings people actually type (in a spreadsheet, a note, a reply). Separators (spaces, hyphens) are treated alike.
const ALIASES = {
  won: 'closed_won', win: 'closed_won', closed_won: 'closed_won', customer: 'closed_won',
  lost: 'closed_lost', closed_lost: 'closed_lost', dead: 'closed_lost',
  engaged: 'contacted', followup: 'contacted', replied: 'contacted', in_progress: 'contacted',
  lead: 'new', prospect: 'new',
  qualified_lead: 'qualified',
  meeting: 'demo', demo_booked: 'demo',
  proposal_sent: 'proposal', quote_sent: 'proposal',
  negotiating: 'negotiation',
};

const cleanKey = (stage) => String(stage ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');

// Custom pipelines (lib/pipelines.js). A custom stage id is the pipeline id ("p" + 8 letters or digits), "_", then 8 more.
// The pipeline is read from the id, so a deal's stage can be checked against its pipeline with no lookup.
export const CUSTOM_STAGE_RE = /^p[a-z0-9]{8}_[a-z0-9]{8}$/;
/** The custom pipeline a stage id belongs to, or null for a fixed (default pipeline) stage. */
export const pipelineOfStage = (stage) => (CUSTOM_STAGE_RE.test(String(stage ?? '')) ? String(stage).slice(0, 9) : null);

/** The canonical stage for a label, or null when the label is not one we know (never a guess). */
export function knownStage(stage) {
  const key = cleanKey(stage);
  if (!key) return null;
  if (CUSTOM_STAGE_RE.test(key)) return key; // a stage of a custom pipeline, kept as it is
  const mapped = ALIASES[key] || key;
  return ALL_STAGES.includes(mapped) ? mapped : null;
}

export function normalizeStage(stage) {
  return knownStage(stage) || 'new';
}

export const isClosed = (stage) => CLOSED_STAGES.includes(normalizeStage(stage));
export const isWon = (stage) => WON_STAGES.includes(normalizeStage(stage));

/** Only set closedAt / createdAt when they are actually changing, so history stays truthful. */
// pipelineMove: { to, stage } moves an existing deal to another pipeline (`to` is 'default' or a pipeline id; `stage` is that
// pipeline's first stage, from lib/pipelines.js moveDealToPipeline). The move is logged on the deal (pipelineLog).
// outcomeOf(stage) returns 'won' or 'lost' for a custom stage marked so (default none), so those deals close like default ones.
export function buildDealWrite({ uid, email, stage, value, businessName, existing, lostReason, source, sourceDetail, country, referralAsked, feedbackAsked, customerQuote, winReason, line, hoursSpent, nps, qualification, onboardingDone, customFields, issues, touch, recurringMonthly, renewalAt, deliveryCost, churn, churnReason, ownerId, pipelineMove = null, outcomeOf = () => null, now = new Date() }) {
  const iso = now.toISOString();
  const currentPid = existing?.pipelineId || 'default';
  // A lead with no deal record yet has no existing deal: its first move still creates the deal on the chosen pipeline.
  const moveTo = pipelineMove ? knownStage(pipelineMove.stage) : null;
  const moving = !!moveTo && (pipelineOfStage(moveTo) || 'default') === pipelineMove.to && pipelineMove.to !== currentPid;
  // An unrecognised label never demotes a deal: an existing deal keeps its stage (a won customer stays a customer).
  let nextStage = moving ? moveTo : (knownStage(stage) || (existing ? normalizeStage(existing.stage) : normalizeStage(stage)));
  // A deal moves only within its own pipeline (lib/pipelines.js): a stage of another pipeline is refused and the deal keeps its stage.
  if (existing && !moving && pipelineOfStage(nextStage) !== (existing.pipelineId || null)) nextStage = normalizeStage(existing.stage);
  const write = {
    userId: uid,
    email: String(email).trim().toLowerCase(),
    stage: nextStage,
    lastUpdate: iso,
  };
  if (moving) {
    // The move is kept on the deal: from, to and the stage it started on. The last 20 moves are kept.
    write.pipelineLog = [...(Array.isArray(existing?.pipelineLog) ? existing.pipelineLog : []).slice(-19), { at: iso, from: currentPid, to: pipelineMove.to, stage: nextStage }];
  }
  // A deal in a custom pipeline records it; the default pipeline is the absence of pipelineId (so default deals are written as before).
  if (pipelineOfStage(nextStage)) write.pipelineId = pipelineOfStage(nextStage);
  else if (existing?.pipelineId) write.pipelineId = null;
  if (businessName && !looksLikePhone(businessName)) write.businessName = businessName; // never store a phone number as the name
  // The buyer's country (two letters), the same field an enquiry sets: it decides consent markets and owner routing. Anything else is ignored.
  if (/^[a-z]{2}$/i.test(String(country || '').trim())) write.country = String(country).trim().toLowerCase();
  if (value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) {
    write.value = Math.max(0, Number(value));
    write.valueIsEstimate = false;
  }
  if (!existing) write.createdAt = iso;
  // A custom won or lost stage closes the deal the same way a default won or lost stage does.
  const closedNow = isClosed(nextStage) || !!outcomeOf(nextStage);
  const wasClosed = existing ? (isClosed(existing.stage) || !!outcomeOf(normalizeStage(existing.stage))) : false;
  if (closedNow && !wasClosed) write.closedAt = iso;
  if (!closedNow && wasClosed) write.closedAt = null; // re-opened
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
  // The owner's own fields for this customer (lib/custom-fields.js, pass 338). Replaced as a whole when given.
  if (customFields !== undefined) write.customFields = sanitizeCustomValues(customFields);
  if (issues !== undefined) write.issues = sanitizeIssues(issues);
  if (referralAsked === true) write.referralAskedAt = iso; // the owner asked this customer for an introduction
  // Why this customer chose the owner (a fixed list; see lib/independence.js). Unknown or empty clears it.
  if (winReason !== undefined) write.winReason = ['convenience', 'only_option', 'identity', 'trust', 'quality', 'price', 'other'].includes(winReason) ? winReason : null;
  // Which of the owner's own lines of business this deal belongs to (see lib/lines.js). Empty clears it.
  if (line !== undefined) write.line = String(line ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || null;
  // The owner's own hours on this customer (selling, delivering, supporting). 0 is a real answer; empty clears it.
  if (hoursSpent !== undefined) {
    const h = hoursSpent === null || hoursSpent === '' ? NaN : Number(hoursSpent);
    write.hoursSpent = Number.isFinite(h) && h >= 0 ? Math.min(100000, Math.round(h * 10) / 10) : null;
  }
  // How likely this customer says they are to recommend the owner, 0 to 10 (whole numbers). Empty clears it.
  if (nps !== undefined) {
    const n = nps === null || nps === '' ? NaN : Number(nps);
    write.nps = Number.isInteger(n) && n >= 0 && n <= 10 ? n : null;
    write.npsAt = write.nps === null ? null : iso;
  }
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
  const lostNow = nextStage === 'closed_lost' || outcomeOf(nextStage) === 'lost';
  if (lostNow && !systemReason && LOST_REASONS.some((r) => r.id === lostReason)) write.lostReason = lostReason;
  if (!lostNow && existing?.lostReason && !systemReason) write.lostReason = null; // re-opened: reason no longer applies
  return write;
}

/** The open stage a deal was in just before it was marked lost (by its stage times). Falls back to 'new'. */
export function reopenStageFor(deal = {}) {
  const times = deal.stageTimes && typeof deal.stageTimes === 'object' ? deal.stageTimes : {};
  const cut = Date.parse(deal.unsubscribedAt || '') || Infinity;
  let best = null; let bestAt = -Infinity;
  for (const s of OPEN_STAGES) {
    const t = Date.parse(times[s] || '');
    if (Number.isFinite(t) && t < cut && t > bestAt) { best = s; bestAt = t; }
  }
  return best || 'new';
}
