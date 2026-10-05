// lib/deal-utils.js - single source of truth for how deals are identified, staged and valued.
// (Before this, the dashboard keyed deals by bare email while the CRM page and API used uid_email.)

export const OPEN_STAGES = ['new', 'contacted', 'qualified', 'demo', 'proposal', 'negotiation'];
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
  new: 0.05,
  contacted: 0.1,
  qualified: 0.25,
  demo: 0.4,
  proposal: 0.6,
  negotiation: 0.75,
};

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
export function buildDealWrite({ uid, email, stage, value, businessName, existing, now = new Date() }) {
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
  return write;
}
