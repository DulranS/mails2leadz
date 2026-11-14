// lib/server/balancr.js - two-way sync with Balancr over its lead API, its stage webhook and its invoice status route. Never throws.
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, addDoc } from '../server-firestore.js';
import { secretsFor } from './integration-secrets.js';
import { leadBodyFor, toBalancrStage, fromBalancrStage, matchDealByContact, invoicePaidState } from '../balancr.js';

async function config(db, uid) {
  const s = await secretsFor(db, uid, ['BALANCR_BASE_URL', 'BALANCR_BUSINESS_ID', 'BALANCR_API_KEY', 'BALANCR_WEBHOOK_TOKEN']).catch(() => ({}));
  const base = String(s.BALANCR_BASE_URL || '').replace(/\/$/, '');
  if (!base || !s.BALANCR_BUSINESS_ID || !s.BALANCR_API_KEY) return null;
  return { base, id: String(s.BALANCR_BUSINESS_ID), key: s.BALANCR_API_KEY, webhookToken: s.BALANCR_WEBHOOK_TOKEN || '' };
}
const apiUrl = (c, path) => `${c.base}/api/v1/businesses/${encodeURIComponent(c.id)}${path}`;
const headers = (c) => ({ Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' });

/** Sends one deal to Balancr as a lead, and moves its stage there when it is past new. A repeat is safe: Balancr keeps one lead per external id. */
export async function pushDeal(db, uid, dealId, fetchImpl = fetch) {
  const c = await config(db, uid);
  if (!c) return { ok: false, error: 'Connect Balancr under Integrations first.' };
  const snap = await getDoc(doc(db, 'deals', String(dealId))).catch(() => null);
  const deal = snap?.data?.();
  if (!deal || deal.userId !== uid) return { ok: false, error: 'That deal was not found.' };
  const body = leadBodyFor({ id: snap.id, ...deal });
  if (!body) return { ok: false, error: 'This deal needs a name and an e-mail or phone to send to Balancr.' };
  const r = await fetchImpl(apiUrl(c, '/leads'), { method: 'POST', headers: headers(c), body: JSON.stringify(body) }).catch(() => null);
  if (!r || !r.ok) return { ok: false, error: 'Balancr did not accept the lead. Check the Balancr settings and try again.' };
  const j = await r.json().catch(() => ({}));
  const leadId = j?.lead?.id || j?.id || null;
  let stageMoved = false;
  const want = toBalancrStage(deal.stage);
  if (leadId && want !== 'new') {
    const p = await fetchImpl(apiUrl(c, `/leads/item/${encodeURIComponent(leadId)}`), { method: 'PATCH', headers: headers(c), body: JSON.stringify({ stage: want }) }).catch(() => null);
    stageMoved = Boolean(p && p.ok);
  }
  // Keep the link: the next reconciliation finds this deal's Balancr lead by this id (v264).
  if (leadId) await setDoc(doc(db, 'deals', snap.id), { balancrLeadId: String(leadId), balancrStage: stageMoved ? want : 'new', balancrSyncedAt: new Date().toISOString() }, { merge: true });
  return { ok: true, leadId, stageMoved };
}

/** Pulls the leads that arrived in Balancr since the last pull, for AutoLeads' inbox. Leads AutoLeads sent are skipped. */
export async function pullLeads(db, uid, fetchImpl = fetch, now = Date.now()) {
  const c = await config(db, uid);
  if (!c) return { ok: false, added: 0 };
  const setting = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).then((s) => s.data() || {}).catch(() => ({})));
  const since = Number(setting.balancrCursor) || 0;
  const r = await fetchImpl(apiUrl(c, `/leads?since=${since}&limit=200`), { headers: headers(c) }).catch(() => null);
  if (!r || !r.ok) return { ok: false, added: 0 };
  const { leads = [], nextSince } = await r.json().catch(() => ({}));
  let added = 0;
  for (const lead of Array.isArray(leads) ? leads : []) {
    if (lead.source === 'AutoLeads') continue;
    const contact = String(lead.contact || '');
    await addDoc(collection(db, 'lead_inbox'), {
      userId: uid, name: String(lead.name || '').slice(0, 120), email: contact.includes('@') ? contact.toLowerCase() : '',
      phone: contact.includes('@') ? '' : contact, source: 'Balancr', status: 'new', receivedAt: new Date(now).toISOString(), balancrId: String(lead.id || ''),
    });
    added++;
  }
  await setDoc(doc(db, 'users', uid, 'settings', 'business'), { balancrCursor: nextSince || now }, { merge: true });
  return { ok: true, added };
}

/** Balancr's stage webhook: a lead that moved stage in Balancr moves its matching deal here. Other events are ignored. */
export async function applyStageWebhook(db, uid, payload) {
  if (payload?.event !== 'lead.stage_changed') return { ok: true, applied: false, reason: 'ignored' };
  const target = fromBalancrStage(payload?.to);
  if (!target) return { ok: true, applied: false, reason: 'unknown stage' };
  const deals = (await getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(500)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const deal = matchDealByContact(payload?.lead?.contact, deals);
  if (!deal) return { ok: true, applied: false, reason: 'no matching deal' };
  const now = new Date().toISOString();
  await setDoc(doc(db, 'deals', deal.id), { stage: target, updatedAt: now, stageTimes: { ...(deal.stageTimes || {}), [target]: now } }, { merge: true });
  return { ok: true, applied: true, dealId: deal.id, stage: target };
}

/** Checks one invoice in Balancr. When it is paid, the AutoLeads invoice is marked paid. Only the owner's own invoice is touched. */
export async function syncInvoice(db, uid, invoiceId, balancrKey, fetchImpl = fetch, now = Date.now()) {
  const c = await config(db, uid);
  if (!c) return { ok: false, error: 'Connect Balancr under Integrations first.' };
  const ref = doc(db, 'users', uid, 'invoices', String(invoiceId));
  const inv = (await getDoc(ref).catch(() => null))?.data?.();
  if (!inv) return { ok: false, error: 'That invoice was not found.' };
  const r = await fetchImpl(apiUrl(c, `/invoices/item/${encodeURIComponent(String(balancrKey))}`), { headers: headers(c) }).catch(() => null);
  if (!r || !r.ok) return { ok: false, error: 'Balancr did not return that invoice. Check the invoice key.' };
  const j = await r.json().catch(() => ({}));
  const state = invoicePaidState(j?.invoice?.status);
  if (state === 'paid' && inv.status !== 'paid') await setDoc(ref, { status: 'paid', paidAt: new Date(now).toISOString(), balancrInvoiceKey: String(balancrKey) }, { merge: true });
  return { ok: true, state };
}

/** Keeps each linked deal's stage in step with its Balancr lead (v264). Balancr decides won and lost (the money side): a deal Balancr has closed follows it.
 *  Before that, AutoLeads decides the outreach stages: a deal that has moved on here is pushed to Balancr. Never throws. */
export async function reconcileDealStages(db, uid, fetchImpl = fetch, now = Date.now()) {
  const c = await config(db, uid);
  if (!c) return { ok: false, error: 'Connect Balancr under Integrations first.', checked: 0, updated: 0, pushed: 0 };
  const deals = (await getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(500)))).docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.balancrLeadId);
  let checked = 0, updated = 0, pushed = 0;
  for (const deal of deals) {
    checked++;
    const r = await fetchImpl(apiUrl(c, `/leads/item/${encodeURIComponent(deal.balancrLeadId)}`), { headers: headers(c) }).catch(() => null);
    if (!r || !r.ok) continue;
    const j = await r.json().catch(() => ({}));
    const theirs = j?.lead?.stage;
    if (!theirs) continue;
    const closedHere = theirs === 'won' || theirs === 'lost';
    const mapped = fromBalancrStage(theirs);
    if (closedHere && mapped && deal.stage !== mapped) {
      const at = new Date(now).toISOString();
      await setDoc(doc(db, 'deals', deal.id), { stage: mapped, updatedAt: at, balancrStage: theirs, balancrSyncedAt: at, stageTimes: { ...(deal.stageTimes || {}), [mapped]: at } }, { merge: true });
      updated++;
    } else if (!closedHere && deal.stage && toBalancrStage(deal.stage) !== theirs) {
      const want = toBalancrStage(deal.stage);
      const p = await fetchImpl(apiUrl(c, `/leads/item/${encodeURIComponent(deal.balancrLeadId)}`), { method: 'PATCH', headers: headers(c), body: JSON.stringify({ stage: want }) }).catch(() => null);
      if (p && p.ok) { pushed++; await setDoc(doc(db, 'deals', deal.id), { balancrStage: want, balancrSyncedAt: new Date(now).toISOString() }, { merge: true }); }
    } else if (deal.balancrStage !== theirs) {
      await setDoc(doc(db, 'deals', deal.id), { balancrStage: theirs, balancrSyncedAt: new Date(now).toISOString() }, { merge: true });
    }
  }
  return { ok: true, checked, updated, pushed };
}

export { config as balancrConfig };
