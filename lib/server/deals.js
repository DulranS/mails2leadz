// lib/server/deals.js - buy-side sourcing from public company records (Companies House, one key), owner listings, and the weekly recheck. Never throws.
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, addDoc } from '../server-firestore.js';
import { secretsFor, writeAccountSecret } from './integration-secrets.js';
import { parseSearch, parseProfile, scoreSignals } from '../deals/companies.js';
import { canMove, newRedFlags, DEAL_STAGES } from '../deals/pipeline.js';

const CH = 'https://api.company-information.service.gov.uk';
const authOf = (key) => `Basic ${Buffer.from(`${key}:`).toString('base64')}`;

async function ch(key, path, fetchImpl = fetch) {
  const r = await fetchImpl(`${CH}${path}`, { headers: { Authorization: authOf(key), Accept: 'application/json' } });
  if (!r?.ok) return null;
  return r.json();
}

export async function keyFor(db, uid, env = process.env) {
  const s = await secretsFor(db, uid, ['COMPANIES_HOUSE_API_KEY'], { env }).catch(() => ({}));
  return s.COMPANIES_HOUSE_API_KEY || '';
}

export async function searchCompanies(db, uid, q, { env, fetchImpl } = {}) {
  const key = await keyFor(db, uid, env);
  if (!key) return { ok: false, error: 'Add your Companies House key under Integrations first.' };
  const text = String(q || '').trim().slice(0, 120);
  if (text.length < 2) return { ok: false, error: 'Type at least two letters.' };
  const j = await ch(key, `/search/companies?q=${encodeURIComponent(text)}&items_per_page=20`, fetchImpl);
  if (!j) return { ok: false, error: 'Companies House did not answer. Check the key, then try again.' };
  return { ok: true, results: parseSearch(j) };
}

export async function trackCompany(db, uid, companyNumber, { env, fetchImpl, sicFit = [] } = {}) {
  const num = String(companyNumber || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6,8}$/.test(num)) return { ok: false, error: 'That is not a company number.' };
  const key = await keyFor(db, uid, env);
  if (!key) return { ok: false, error: 'Add your Companies House key under Integrations first.' };
  const [profile, charges, officers] = await Promise.all([ch(key, `/company/${num}`, fetchImpl), ch(key, `/company/${num}/charges`, fetchImpl), ch(key, `/company/${num}/officers`, fetchImpl)]);
  if (!profile) return { ok: false, error: 'That company was not found.' };
  const company = parseProfile({ profile, charges: charges || {}, officers: officers || {} });
  const scored = scoreSignals(company, { sicFit });
  const ref = doc(db, 'users', uid, 'acquisition_targets', num);
  await setDoc(ref, { side: 'buy', companyNumber: num, name: company.name, stage: 'sourced', company, score: scored.score, reasons: scored.reasons, redFlags: scored.redFlags, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() }, { merge: true });
  return { ok: true, id: num, score: scored.score, reasons: scored.reasons };
}

/** Owner listings: businesses for sale that the owner has found (imported from a list they hold). */
export async function addListing(db, uid, row) {
  const name = String(row?.name || '').trim().slice(0, 160);
  if (!name) return { ok: false, error: 'Give the business a name.' };
  const id = addListingId(name);
  await setDoc(doc(db, 'users', uid, 'acquisition_targets', id), { side: 'buy', source: 'listing', name, askingPrice: Number(row.askingPrice) || null, profit: Number(row.profit) || null, revenue: Number(row.revenue) || null, industry: String(row.industry || '').slice(0, 80), location: String(row.location || '').slice(0, 120), stage: 'sourced', updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() }, { merge: true });
  return { ok: true, id };
}
const addListingId = (name) => `l-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}-${Date.now().toString(36)}`;

/** A listing of any asset class (vehicle, property, goods, business), tracked from sourcing to resale. */
export async function addAssetListing(db, uid, body) {
  const name = String(body?.name || '').trim().slice(0, 160);
  if (!name) return { ok: false, error: 'Give the listing a name.' };
  const id = `a-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}-${Date.now().toString(36)}`;
  const fields = {};
  for (const k of ['make', 'model', 'year', 'mileage', 'condition', 'address', 'postcode', 'areaSqm', 'tenure', 'titleChecked', 'item', 'quantity', 'industry', 'location']) {
    if (body[k] !== undefined && body[k] !== '') fields[k] = String(body[k]).slice(0, 80);
  }
  const askingPrice = Number(body.askingPrice) || null;
  await setDoc(doc(db, 'users', uid, 'acquisition_targets', id), { side: 'buy', source: 'asset', assetClass: body.assetClass, name, askingPrice, fields, comps: [], stage: 'sourced', updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() }, { merge: true });
  return { ok: true, id };
}

/** Stores the sold prices the owner entered for a listing. */
export async function setComps(db, uid, id, comps) {
  const ref = doc(db, 'users', uid, 'acquisition_targets', String(id || ''));
  const snap = await getDoc(ref).catch(() => null);
  if (!snap?.exists?.()) return { ok: false, error: 'Not found.' };
  await setDoc(ref, { comps, updatedAt: new Date().toISOString() }, { merge: true });
  return { ok: true, count: comps.length };
}

export async function setStage(db, uid, id, to) {
  const ref = doc(db, 'users', uid, 'acquisition_targets', String(id));
  const snap = await getDoc(ref).catch(() => null);
  if (!snap?.exists?.()) return { ok: false, error: 'Not found.' };
  const from = snap.data().stage;
  const move = canMove(from, to);
  if (!move.ok) return move;
  await setDoc(ref, { stage: to, [`stageTimes.${to}`]: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
  return { ok: true, stage: to };
}

export async function listTargets(db, uid) {
  const rows = (await getDocs(query(collection(db, 'users', uid, 'acquisition_targets'), limit(200)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  return rows;
}

/** Each Monday, tracked companies are checked again (at most 20 a run); only red flags that are new are alerted. */
export async function recheckTargets(db, uid, { env, fetchImpl, now = Date.now(), max = 20 } = {}) {
  try {
    const key = await keyFor(db, uid, env);
    if (!key) return { checked: 0, alerts: [] };
    const rows = (await listTargets(db, uid)).filter((r) => r.companyNumber && DEAL_STAGES.indexOf(r.stage) < 5 && r.side === 'buy').slice(0, max);
    const alerts = [];
    for (const r of rows) {
      const profile = await ch(key, `/company/${r.companyNumber}`, fetchImpl);
      if (!profile) continue;
      const [charges, officers] = await Promise.all([ch(key, `/company/${r.companyNumber}/charges`, fetchImpl), ch(key, `/company/${r.companyNumber}/officers`, fetchImpl)]);
      const company = parseProfile({ profile, charges: charges || {}, officers: officers || {} }, { now });
      const scored = scoreSignals(company);
      const fresh = newRedFlags(r.redFlags || [], scored.redFlags);
      await setDoc(doc(db, 'users', uid, 'acquisition_targets', r.id), { company, score: scored.score, reasons: scored.reasons, redFlags: scored.redFlags, checkedAt: new Date(now).toISOString() }, { merge: true });
      if (fresh.length) alerts.push({ id: r.id, name: r.name, fresh });
    }
    return { checked: rows.length, alerts };
  } catch (e) {
    console.error('[deals] recheck failed:', uid, String(e?.message || '').slice(0, 120));
    return { checked: 0, alerts: [] };
  }
}
