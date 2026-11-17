// lib/crm.js - CRM sync (HubSpot and/or Pipedrive), pass 319 contacts and pass 320 deals. Pure: request shapes and the sync decision.
// The calls themselves are in lib/server/crm.js.
//
// Deals sync on the WON / LOST outcome, both ways. Open pipeline stages are not mirrored (they differ per CRM pipeline).
// Each deal remembers the outcome it last wrote to each CRM (crmSynced). On a run:
//   - the CRM's outcome differs from what we last wrote  -> the CRM changed it, so we take its value (pull);
//   - else ours differs from what we last wrote          -> we send ours (push);
//   - else nothing to do.
// A deal the CRM no longer has (deleted or archived) is created again.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 120;

export const OUTCOMES = ['open', 'won', 'lost'];

/** A deal becomes a CRM contact when it has a usable email. Returns null otherwise (nothing to push). */
export function crmContactFromDeal(deal) {
  const email = String(deal?.email || '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return null;
  const company = String(deal?.businessName || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return { email, name: company || email, company };
}

/** HubSpot contact: the first word is the first name, the rest the last name. */
export function hubspotContactBody(c) {
  const parts = c.name.split(' ');
  const properties = { email: c.email, firstname: parts[0] || c.name };
  const last = parts.slice(1).join(' ');
  if (last) properties.lastname = last;
  if (c.company) properties.company = c.company;
  return { properties };
}

/** The Pipedrive API base for a company domain ("acme" or "acme.pipedrive.com"). Null when the domain is not usable. */
export function pipedriveBaseUrl(domain) {
  const d = String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.pipedrive\.com$/, '');
  return /^[a-z0-9-]{2,60}$/.test(d) ? `https://${d}.pipedrive.com/api/v2` : null;
}

/** Pipedrive person: one work email, marked primary. */
export function pipedrivePersonBody(c) {
  return { name: c.name, emails: [{ value: c.email, primary: true, label: 'work' }] };
}

/** The id of the first match in a Pipedrive person search, or null when there is none. */
export function firstPipedriveMatch(json) {
  const item = json?.data?.items?.[0];
  if (!item) return null;
  const id = item.item?.id ?? item.id;
  return id === undefined || id === null ? null : String(id);
}

// ---- deal outcomes ----

/** AutoLeads stage -> outcome in the CRM: won, lost, or open. */
export function outcomeOfStage(stage) {
  if (stage === 'closed_won') return 'won';
  if (stage === 'closed_lost') return 'lost';
  return 'open';
}

/**
 * The stage a CRM outcome lands on in AutoLeads. A deal reopened in the CRM goes back to 'contacted' from a closed stage;
 * an open deal that stays open keeps the stage it has.
 */
export function stageForOutcome(outcome, currentStage) {
  if (outcome === 'won') return 'closed_won';
  if (outcome === 'lost') return 'closed_lost';
  return outcomeOfStage(currentStage) === 'open' ? currentStage : 'contacted';
}

// HubSpot default sales pipeline stage ids (verified against HubSpot's deal docs: closedwon, closedlost; appointmentscheduled is the first stage).
export const HUBSPOT_OPEN_STAGE = 'appointmentscheduled';
export const HUBSPOT_STAGE = { open: HUBSPOT_OPEN_STAGE, won: 'closedwon', lost: 'closedlost' };

/** The owner's HubSpot deal pipeline and its stage ids. Falls back to the default pipeline's ids (pass 324). */
export const HUBSPOT_DEFAULT_PIPELINE = { pipeline: 'default', stages: HUBSPOT_STAGE };

/**
 * Picks the deal pipeline and its won, lost and open stage ids from HubSpot's pipelines response (GET /crm/v3/pipelines/deals).
 * The default pipeline is preferred, else the first. Won is the stage with probability 1.0, lost the one with 0.0, and open the
 * earliest stage between them. Returns null when there is no usable pipeline, so the caller keeps the default ids.
 */
export function hubspotPipelineStages(json) {
  const list = Array.isArray(json?.results) ? json.results : [];
  const p = list.find((x) => x?.id === 'default') || list[0];
  if (!p || !Array.isArray(p.stages)) return null;
  const prob = (s) => Number(s?.metadata?.probability);
  const won = p.stages.find((s) => prob(s) === 1);
  const lost = p.stages.find((s) => prob(s) === 0);
  const open = p.stages
    .filter((s) => prob(s) > 0 && prob(s) < 1)
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))[0];
  if (!won || !lost || !open) return null;
  return { pipeline: String(p.id), stages: { open: open.id, won: won.id, lost: lost.id } };
}

/** A HubSpot deal's outcome from its stage id, in the given pipeline's stages. Any stage that is not closed is open. */
export function hubspotOutcome(stageId, stages = HUBSPOT_STAGE) {
  if (stageId && stageId === stages.won) return 'won';
  if (stageId && stageId === stages.lost) return 'lost';
  return 'open';
}

// ---- deal amounts (pass 321) ----

/** The deal's quoted value in money, to 2 decimals (AutoLeads keeps it as deal.value). Null when there is no usable value: nothing is sent. */
export function dealAmount(deal) {
  const n = Number(deal?.value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/** The deal's currency as a 3-letter code, or null (the CRM then uses its own default currency). */
export function dealCurrency(deal) {
  const c = typeof deal?.currency === 'string' ? deal.currency.trim().toUpperCase() : '';
  return /^[A-Z]{3}$/.test(c) ? c : null;
}

/** Whether a CRM needs the amount sent: we have one, and it differs from the amount we last sent to that CRM. */
export function amountDue(amount, sent) {
  return amount !== null && amount !== undefined && amount !== sent;
}

/** HubSpot amount property: a string with 2 decimals (HubSpot's docs show "1500.00"). */
export function hubspotAmountBody(amount) {
  return { properties: { amount: Number(amount).toFixed(2) } };
}

/** Pipedrive value (and currency, when the deal has one) for a PATCH. Verified: PATCH /api/v2/deals/{id} takes value and currency. */
export function pipedriveAmountBody({ amount, currency }) {
  return currency ? { value: amount, currency } : { value: amount };
}

/** HubSpot deal to create, linked to its contact (association type 3 = deal to contact, HUBSPOT_DEFINED). Amount only when there is one. */
export function hubspotDealBody({ title, contactId, outcome, amount = null, pipeline = 'default', stages = HUBSPOT_STAGE }) {
  const properties = { dealname: title, pipeline, dealstage: stages[outcome] || stages.open };
  if (amount !== null && amount !== undefined) properties.amount = Number(amount).toFixed(2);
  return {
    properties,
    associations: [{ to: { id: Number(contactId) }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }] }],
  };
}

/** A HubSpot deal's stage change, for an outcome. */
export function hubspotStageBody(outcome, stages = HUBSPOT_STAGE) {
  return { properties: { dealstage: stages[outcome] || stages.open } };
}

/** Pipedrive deal's status (open, won, lost, deleted) -> outcome. Deleted or anything else is 'missing': the CRM no longer has it. */
export function pipedriveOutcome(status) {
  if (status === 'won' || status === 'lost' || status === 'open') return status;
  return 'missing';
}

/** Pipedrive deal to create: a title and its person (v2 API: title and person_id); value and currency when there is an amount. */
export function pipedriveDealBody({ title, personId, amount = null, currency = null }) {
  const body = { title, person_id: Number(personId) };
  if (amount !== null && amount !== undefined) {
    body.value = amount;
    if (currency) body.currency = currency;
  }
  return body;
}

/** Pipedrive status change for an outcome. */
export function pipedriveStatusBody(outcome) {
  return { status: outcome };
}

// ---- the sync decision ----

/**
 * Decides what one CRM does for one deal this run.
 *   linked: the deal already points at a CRM record that still exists.
 *   remote: that record's outcome now ('open' | 'won' | 'lost'), or null when there is no record.
 *   ours:   our outcome now.
 *   synced: the outcome we last wrote to that CRM (null when never written).
 */
export function decideSync({ linked, remote, ours, synced }) {
  if (!linked) return { action: 'create', outcome: ours };
  if (remote && remote !== synced) return { action: 'pull', outcome: remote };
  if (ours !== synced) return { action: 'push', outcome: ours };
  return { action: 'none', outcome: ours };
}
