// lib/stage-alert.js - an alert the moment a deal moves into a stage that needs the owner's next step (pass 367).
// Covers changes made in the app. Changes made elsewhere (webhooks, imports) still wait for the scheduled pipeline check.
// Pure: no I/O.
import { normalizeStage, WON_STAGES } from './deal-utils.js';

/** Stages that need the owner's next step: a proposal, a negotiation, or a won deal (won, then delivery, retention or expansion). */
export const STAGE_ALERT_STAGES = ['proposal', 'negotiation', ...WON_STAGES];

const LABEL = { proposal: 'Proposal', negotiation: 'Negotiation', closed_won: 'Won', delivery: 'Delivery', retention: 'Retention', expansion: 'Expansion' };
export const stageLabel = (stage) => LABEL[normalizeStage(stage)] || String(stage || '');

/** The pipeline alert for one deal entering a stage. One alert per deal per stage per day (the stageKey), so a repeated call adds nothing. */
export function stageAlertFor({ email, stage, now = Date.now() } = {}) {
  const addr = String(email || '').trim().toLowerCase();
  const s = normalizeStage(stage);
  const iso = new Date(now).toISOString();
  return {
    leadEmail: addr,
    kind: 'stage_moved',
    stageKey: `moved:${addr}:${s}:${iso.slice(0, 10)}`,
    stage: s,
    reason: `Moved to ${stageLabel(s)}. Next step is yours.`,
    scheduledFor: iso,
    status: 'pending',
    completedAt: null,
    createdAt: iso,
  };
}

/** The push sent with the alert. Names the deal and the stage; nothing is sent to anyone else. */
export function stageAlertPushPayload({ email, stage } = {}) {
  return { title: `Deal moved to ${stageLabel(stage)}`, body: `${String(email || '').trim().toLowerCase()}. Open the CRM for the next step.`, url: '/crm' };
}
