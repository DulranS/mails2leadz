// lib/server/crm.js - CRM sync for the owner's HubSpot and/or Pipedrive (passes 319 and 320). Run from the daily job.
// Contacts: each deal with an email is matched by email and created if the CRM lacks it (pass 319).
// Deals (pass 320): a deal gets a CRM deal linked to its contact, and won/lost is kept the same both ways (lib/crm.js decideSync).
// Amounts (pass 321): the deal's value is sent on create and again whenever it changes (crmAmounts records what was sent).
// Progress: the last-sent mark for changed deals is kept on users/{uid}/settings/crm. A rejected key or a server error stops the
// run (the next run resumes); a bad-data error skips only that deal.
import { collection, query, where, getDocs, doc, getDoc, setDoc } from '../server-firestore.js';
import { secretsFor } from './integration-secrets.js';
import {
  crmContactFromDeal, hubspotContactBody, pipedriveBaseUrl, pipedrivePersonBody, firstPipedriveMatch,
  outcomeOfStage, stageForOutcome, hubspotOutcome, hubspotDealBody, hubspotStageBody, hubspotPipelineStages, HUBSPOT_DEFAULT_PIPELINE,
  pipedriveOutcome, pipedriveDealBody, pipedriveStatusBody, decideSync,
  dealAmount, dealCurrency, amountDue, hubspotAmountBody, pipedriveAmountBody,
} from '../crm.js';

const MAX_PER_RUN = 200;
const HS = 'https://api.hubapi.com';
const HS_DEALS = `${HS}/crm/objects/2026-09/deals`; // deal endpoints as HubSpot's search doc shows them today
const HS_CONTACTS = `${HS}/crm/v3/objects/contacts`;

/** Which CRMs the owner has connected, with their keys. Null for a CRM with no usable key. */
export async function crmConfigFor(db, uid) {
  const s = await secretsFor(db, uid, ['HUBSPOT_PRIVATE_APP_TOKEN', 'PIPEDRIVE_COMPANY_DOMAIN', 'PIPEDRIVE_API_TOKEN']).catch(() => ({}));
  const base = pipedriveBaseUrl(s.PIPEDRIVE_COMPANY_DOMAIN);
  return {
    hubspot: s.HUBSPOT_PRIVATE_APP_TOKEN ? { token: s.HUBSPOT_PRIVATE_APP_TOKEN } : null,
    pipedrive: base && s.PIPEDRIVE_API_TOKEN ? { base, token: s.PIPEDRIVE_API_TOKEN } : null,
  };
}

// An error that says whether retrying would help: a bad record (400/422) will never succeed, a bad key or outage will.
function httpError(label, status) {
  const e = new Error(`${label} failed (${status})`);
  e.permanent = status === 400 || status === 422;
  return e;
}

// The time a deal last changed: stage moves write updatedAt, other edits write lastUpdate. The later of the two counts.
export function changedAt(d) {
  return [d.lastUpdate, d.updatedAt].filter((x) => typeof x === 'string').sort().pop() || '';
}

// ---- HubSpot ----
function hsHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function hubspotContactId(token, c, fetchImpl) {
  const found = await fetchImpl(`${HS_CONTACTS}/${encodeURIComponent(c.email)}?idProperty=email`, { headers: hsHeaders(token) });
  if (found.ok) return String((await found.json()).id);
  if (found.status !== 404) throw httpError('HubSpot lookup', found.status);
  const made = await fetchImpl(HS_CONTACTS, { method: 'POST', headers: hsHeaders(token), body: JSON.stringify(hubspotContactBody(c)) });
  if (!made.ok) throw httpError('HubSpot create', made.status);
  return String((await made.json()).id);
}

// The owner's deal pipeline and its won, lost and open stages (pass 324). Read once per run. If HubSpot does not answer, the default
// pipeline's ids are used, as before.
async function hubspotPipeline(token, fetchImpl) {
  try {
    const r = await fetchImpl(`${HS}/crm/v3/pipelines/deals`, { headers: hsHeaders(token) });
    if (!r.ok) return HUBSPOT_DEFAULT_PIPELINE;
    return hubspotPipelineStages(await r.json()) || HUBSPOT_DEFAULT_PIPELINE;
  } catch {
    return HUBSPOT_DEFAULT_PIPELINE;
  }
}

const hubspotAdapter = (token, fetchImpl, pipe = HUBSPOT_DEFAULT_PIPELINE) => ({
  async remoteOutcome(id) {
    const r = await fetchImpl(`${HS_DEALS}/${encodeURIComponent(id)}?properties=dealstage`, { headers: hsHeaders(token) });
    if (r.status === 404) return 'missing'; // deleted or archived in HubSpot
    if (!r.ok) throw httpError('HubSpot deal read', r.status);
    return hubspotOutcome((await r.json())?.properties?.dealstage, pipe.stages);
  },
  async create({ title, contactId, outcome, amount }) {
    const r = await fetchImpl(HS_DEALS, { method: 'POST', headers: hsHeaders(token), body: JSON.stringify(hubspotDealBody({ title, contactId, outcome, amount, pipeline: pipe.pipeline, stages: pipe.stages })) });
    if (!r.ok) throw httpError('HubSpot deal create', r.status);
    return String((await r.json()).id);
  },
  async setOutcome(id, outcome) {
    const r = await fetchImpl(`${HS_DEALS}/${encodeURIComponent(id)}`, { method: 'PATCH', headers: hsHeaders(token), body: JSON.stringify(hubspotStageBody(outcome, pipe.stages)) });
    if (!r.ok) throw httpError('HubSpot deal update', r.status);
  },
  async setAmount(id, amount) {
    const r = await fetchImpl(`${HS_DEALS}/${encodeURIComponent(id)}`, { method: 'PATCH', headers: hsHeaders(token), body: JSON.stringify(hubspotAmountBody(amount)) });
    if (!r.ok) throw httpError('HubSpot deal amount', r.status);
  },
});

// ---- Pipedrive (v2 API) ----
const pdHeaders = (token) => ({ 'x-api-token': token, 'Content-Type': 'application/json' });

async function pipedrivePersonId({ base, token }, c, fetchImpl) {
  const search = await fetchImpl(`${base}/persons/search?term=${encodeURIComponent(c.email)}&fields=email&exact_match=true&limit=1`, { headers: pdHeaders(token) });
  if (!search.ok) throw httpError('Pipedrive search', search.status);
  const found = firstPipedriveMatch(await search.json().catch(() => null));
  if (found) return found;
  const made = await fetchImpl(`${base}/persons`, { method: 'POST', headers: pdHeaders(token), body: JSON.stringify(pipedrivePersonBody(c)) });
  if (!made.ok) throw httpError('Pipedrive create', made.status);
  const id = (await made.json().catch(() => null))?.data?.id;
  if (id === undefined || id === null) throw httpError('Pipedrive create (no id)', 422);
  return String(id);
}

const pipedriveAdapter = ({ base, token }, fetchImpl) => ({
  async remoteOutcome(id) {
    const r = await fetchImpl(`${base}/deals/${encodeURIComponent(id)}`, { headers: pdHeaders(token) });
    if (r.status === 404) return 'missing';
    if (!r.ok) throw httpError('Pipedrive deal read', r.status);
    return pipedriveOutcome((await r.json())?.data?.status);
  },
  async create({ title, contactId, outcome, amount, currency }) {
    const r = await fetchImpl(`${base}/deals`, { method: 'POST', headers: pdHeaders(token), body: JSON.stringify(pipedriveDealBody({ title, personId: contactId, amount, currency })) });
    if (!r.ok) throw httpError('Pipedrive deal create', r.status);
    const id = String((await r.json().catch(() => null))?.data?.id ?? '');
    if (!id) throw httpError('Pipedrive deal create (no id)', 422);
    if (outcome !== 'open') await this.setOutcome(id, outcome);
    return id;
  },
  async setOutcome(id, outcome) {
    const r = await fetchImpl(`${base}/deals/${encodeURIComponent(id)}`, { method: 'PATCH', headers: pdHeaders(token), body: JSON.stringify(pipedriveStatusBody(outcome)) });
    if (!r.ok) throw httpError('Pipedrive deal update', r.status);
  },
  async setAmount(id, amount, currency) {
    const r = await fetchImpl(`${base}/deals/${encodeURIComponent(id)}`, { method: 'PATCH', headers: pdHeaders(token), body: JSON.stringify(pipedriveAmountBody({ amount, currency })) });
    if (!r.ok) throw httpError('Pipedrive deal amount', r.status);
  },
});

/**
 * Syncs contacts and deals with the connected CRMs. Returns counts; never throws for a CRM problem.
 * fetchImpl is injectable so the run can be exercised without a network.
 */
export async function pushDealsToCrm(db, uid, { now = Date.now(), fetchImpl = fetch } = {}) {
  const cfg = await crmConfigFor(db, uid);
  if (!cfg.hubspot && !cfg.pipedrive) return { skipped: true, pushed: 0, pulled: 0, failed: 0 };

  const stateRef = doc(db, 'users', uid, 'settings', 'crm');
  const state = await getDoc(stateRef).then((s) => (s.exists() ? s.data() : {})).catch(() => ({}));
  const since = typeof state.pushedAt === 'string' ? state.pushedAt : '';

  const all = (await getDocs(query(collection(db, 'deals'), where('userId', '==', uid)))).docs.map((x) => ({ id: x.id, ...x.data() }));
  const changed = all
    .filter((d) => changedAt(d) > since)
    .sort((a, b) => changedAt(a).localeCompare(changedAt(b)))
    .slice(0, MAX_PER_RUN);
  // Linked deals are re-read every run, so a change made in the CRM is found. Least recently checked first, within the run's cap.
  const changedIds = new Set(changed.map((d) => d.id));
  const linked = all
    .filter((d) => !changedIds.has(d.id) && (d.crmHubspotDealId || d.crmPipedriveDealId))
    .sort((a, b) => String(a.crmCheckedAt || '').localeCompare(String(b.crmCheckedAt || '')))
    .slice(0, Math.max(0, MAX_PER_RUN - changed.length));

  const adapters = {
    hubspot: cfg.hubspot ? hubspotAdapter(cfg.hubspot.token, fetchImpl, await hubspotPipeline(cfg.hubspot.token, fetchImpl)) : null,
    pipedrive: cfg.pipedrive ? pipedriveAdapter(cfg.pipedrive, fetchImpl) : null,
  };
  const LINK = { hubspot: 'crmHubspotDealId', pipedrive: 'crmPipedriveDealId' };

  let pushed = 0;
  let pulled = 0;
  let failed = 0;
  let mark = since;
  let transientStop = false;

  async function syncDeal(d) {
    const nowIso = new Date(now).toISOString();
    let stage = d.stage;
    let outcome = outcomeOfStage(stage);
    const amount = dealAmount(d); // pass 321: the quoted value, sent on create and whenever it changes (never read back)
    const currency = dealCurrency(d);
    const patch = {};
    const synced = { ...(d.crmSynced || {}) };
    const amounts = { ...(d.crmAmounts || {}) }; // the amount last sent to each CRM
    const c = crmContactFromDeal(d); // a deal without a usable email is not created in a CRM (a contact needs one); existing links still sync
    const contactIds = {}; // each CRM has its own contact id
    for (const provider of Object.keys(adapters)) {
      const adapter = adapters[provider];
      if (!adapter) continue;
      const linkId = d[LINK[provider]] ? String(d[LINK[provider]]) : null;
      const remote = linkId ? await adapter.remoteOutcome(linkId) : null;
      const dec = decideSync({ linked: !!linkId && remote !== 'missing', remote, ours: outcome, synced: synced[provider] ?? null });
      if (dec.action === 'create') {
        if (!c) continue;
        if (!contactIds[provider]) {
          contactIds[provider] = provider === 'hubspot'
            ? await hubspotContactId(cfg.hubspot.token, c, fetchImpl)
            : await pipedrivePersonId(cfg.pipedrive, c, fetchImpl);
        }
        const id = await adapter.create({ title: c.company || c.email, contactId: contactIds[provider], outcome: dec.outcome, amount, currency });
        patch[LINK[provider]] = id;
        synced[provider] = dec.outcome;
        if (amount !== null) amounts[provider] = amount;
        pushed++;
        continue;
      }
      if (dec.action === 'pull') {
        outcome = dec.outcome;
        stage = stageForOutcome(dec.outcome, stage);
        synced[provider] = dec.outcome;
        pulled++;
      } else if (dec.action === 'push') {
        await adapter.setOutcome(linkId, dec.outcome);
        synced[provider] = dec.outcome;
        pushed++;
      } else {
        synced[provider] = synced[provider] ?? outcome;
      }
      // An amount that changed here goes to the CRM (a cleared value is not sent: the CRM keeps the last amount it had).
      if (amountDue(amount, amounts[provider])) {
        await adapter.setAmount(linkId, amount, currency);
        amounts[provider] = amount;
        pushed++;
      }
    }
    const write = { ...patch, crmSynced: synced, crmAmounts: amounts, crmCheckedAt: nowIso };
    if (stage !== d.stage) Object.assign(write, { stage, updatedAt: nowIso, stageTimes: { ...(d.stageTimes || {}), [stage]: nowIso } });
    await setDoc(doc(db, 'deals', d.id), write, { merge: true });
  }

  // Deals changed since the last run: a failure stops the run (retry next time) or skips the deal (bad data).
  for (const d of changed) {
    if (transientStop) break;
    try {
      await syncDeal(d);
      mark = changedAt(d);
    } catch (e) {
      failed++;
      console.error('[crm] sync failed:', uid, String(e?.message || '').slice(0, 120));
      if (!e.permanent) { transientStop = true; break; }
      mark = changedAt(d);
    }
  }
  // Linked deals that did not change: checked for changes made in the CRM. Not part of the mark.
  for (const d of linked) {
    if (transientStop) break;
    try {
      await syncDeal(d);
    } catch (e) {
      failed++;
      console.error('[crm] check failed:', uid, String(e?.message || '').slice(0, 120));
      if (!e.permanent) transientStop = true;
    }
  }
  if (mark !== since) await setDoc(stateRef, { pushedAt: mark, lastRunAt: new Date(now).toISOString() }, { merge: true });
  return { skipped: false, pushed, pulled, failed };
}
