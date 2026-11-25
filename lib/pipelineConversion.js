// lib/pipelineConversion.js - lead-to-pipeline conversion (v398). Pure: no I/O.
//
// Of the deals on record, the share now at or beyond the qualified stage. A deal that is still "new" or "contacted" is a lead
// that has not yet become a sales opportunity. The app keeps no history of earlier stages, so this uses where each deal stands
// today: a deal that moved back to an earlier stage counts as a lead, and a lost deal counts as a lead whatever stage it reached.
// Returns null for the rate when there are no deals, never zero.

export const PIPELINE_STAGES = ['qualified', 'demo', 'proposal', 'proposal_sent', 'follow_up', 'negotiation', 'won', 'closed_won'];

export function leadToPipeline(deals = []) {
  const live = (deals || []).filter((d) => d && typeof d.stage === 'string' && d.stage);
  const total = live.length;
  const inPipeline = live.filter((d) => PIPELINE_STAGES.includes(d.stage)).length;
  return { total, inPipeline, ratePct: total > 0 ? Math.round((inPipeline / total) * 1000) / 10 : null };
}
