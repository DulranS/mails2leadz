// lib/deal-utils.js - single source of truth for how deals are identified, staged and valued.
// (Before this, the dashboard keyed deals by bare email while the CRM page and API used uid_email.)

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
export function buildDealWrite({ uid, email, stage, value, businessName, existing, lostReason, source, now = new Date() }) {
  const iso = now.toISOString();
  const nextStage = normalizeStage(stage ?? existing?.stage);
  const write = {
    userId: uid,
    email: String(email).trim().toLowerCase(),
    stage: nextStage,
    lastUpdate: iso,
  };
  if (businessName) write.businessName = businessName;
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
  if (!existing && LEAD_SOURCES.some((x) => x.id === source)) write.source = source;
  // Lost reason: only for a deal that is Lost, only from the picker list, never over a system reason (opt-out / bounce).
  const systemReason = SYSTEM_LOST_REASONS.includes(existing?.lostReason);
  if (nextStage === 'closed_lost' && !systemReason && LOST_REASONS.some((r) => r.id === lostReason)) write.lostReason = lostReason;
  if (nextStage !== 'closed_lost' && existing?.lostReason && !systemReason) write.lostReason = null; // re-opened: reason no longer applies
  return write;
}
