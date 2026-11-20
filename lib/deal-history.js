// lib/deal-history.js - one customer's deal as a short history: where it is now, the steps it went through, and how it ended. Pure.
import { lostReasonLabel, isWon } from './deal-utils.js';
import { stageLabel } from './work-mode.js';

const SYSTEM_LOST = { unsubscribed: 'Opted out of emails', bounced: 'Email bounced' };
const ms = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : null; };

/** Returns null when there is no deal. Steps are oldest first, from the deal's own stage times. */
export function dealHistory(deal, mode = 'sales') {
  if (!deal || typeof deal !== 'object') return null;
  const stage = String(deal.stage || '');
  const times = deal.stageTimes && typeof deal.stageTimes === 'object' ? deal.stageTimes : {};
  const steps = Object.entries(times)
    .map(([s, at]) => ({ label: stageLabel(s, mode), at: ms(at) }))
    .filter((x) => x.at !== null)
    .sort((a, b) => a.at - b.at)
    .map((x) => ({ label: x.label, at: new Date(x.at).toISOString() }));
  const outcome = isWon(stage) ? 'won' : stage === 'closed_lost' ? 'lost' : 'open';
  const reason = outcome === 'lost' ? (SYSTEM_LOST[deal.lostReason] || lostReasonLabel(deal.lostReason)) : '';
  const value = Number(deal.value);
  // The owner's own stage name in the CRM, while the deal is open there (pass 336). Null when none is known.
  const names = deal.crmStageNames && typeof deal.crmStageNames === 'object' ? Object.values(deal.crmStageNames) : [];
  const crmStage = names.find((v) => typeof v === 'string' && v.trim()) || null;
  return {
    stage: stage ? stageLabel(stage, mode) : 'Not set',
    crmStage: outcome === 'open' ? crmStage : null,
    outcome,
    value: Number.isFinite(value) && value > 0 ? value : null,
    lostReason: reason,
    steps,
  };
}
