// lib/lead-merge.js - finding likely duplicate leads and combining two of them into one. Pure: no I/O.
// Two emails can be the same business or person (a second address, the same phone, the same website). Merging keeps one lead,
// moves the other's history under it, and remembers the merged-away email so its outreach still shows on the kept lead.
import { OPEN_STAGES, normalizeStage } from './deal-utils.js';
import { sanitizeCommittee, COMMITTEE_MAX } from './deal-extras.js';

const norm = (e) => String(e || '').trim().toLowerCase();
const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Last nine digits: a Sri Lankan 0771234567 and +94771234567 compare equal.
const phoneKey = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const hostKey = (w) => {
  const s = String(w || '').trim();
  if (!s) return '';
  try { return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
};

/** Why two leads may be the same: a shared phone, website or business name. Empty when they do not look alike. */
export function duplicateReasons(a, b) {
  if (!a || !b || norm(a.email) === norm(b.email)) return [];
  const reasons = [];
  if (phoneKey(a.phone) && phoneKey(a.phone).length === 9 && phoneKey(a.phone) === phoneKey(b.phone)) reasons.push('same phone');
  if (hostKey(a.website) && hostKey(a.website) === hostKey(b.website)) reasons.push('same website');
  const na = nameKey(a.business || a.company);
  if (na.length >= 4 && na === nameKey(b.business || b.company)) reasons.push('same business name');
  return reasons;
}

/** Leads that look like the target, each with the reasons. The target itself is never in the result. */
export function findDuplicatesOf(target, leads = []) {
  return leads
    .map((lead) => ({ lead, reasons: duplicateReasons(target, lead) }))
    .filter((x) => x.reasons.length > 0);
}

const rank = (stage) => OPEN_STAGES.indexOf(stage);

/** The stage the merged lead should sit in: a win always wins; otherwise the further-along open stage; a closed keep stays closed. */
export function mergedStage(keepStage, dropStage) {
  const a = normalizeStage(keepStage);
  const b = normalizeStage(dropStage);
  if (a === 'closed_won' || b === 'closed_won') return 'closed_won';
  if (a === 'closed_lost' || a === 'closed_won') return a;
  if (b === 'closed_lost' || b === 'closed_won') return rank(a) >= 0 ? a : b;
  return rank(b) > rank(a) ? b : a;
}

const uniqueStrings = (...lists) => [...new Set(lists.flat().filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()))];

/**
 * The fields to write on the kept deal after a merge. `keep` and `drop` are deal records (or null when the lead had no deal).
 * Nothing the owner typed on the kept lead is overwritten; blanks are filled from the duplicate.
 */
export function mergedDealFields(keep, drop, { now = new Date().toISOString() } = {}) {
  const k = keep || {};
  const d = drop || {};
  const qk = k.qualification || {};
  const qd = d.qualification || {};
  const qual = {};
  for (const f of ['budget', 'authority', 'need', 'timeline']) {
    qual[f] = qk[f] && qk[f] !== 'unknown' ? qk[f] : qd[f] || 'unknown';
  }
  const committee = sanitizeCommittee([...(qk.committee || []), ...(qd.committee || [])]);
  const seen = new Set();
  qual.committee = committee.filter((m) => {
    const key = m.name.toLowerCase();
    if (!m.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, COMMITTEE_MAX);

  return {
    stage: mergedStage(k.stage, d.stage),
    value: Number(k.value) > 0 ? k.value : Number(d.value) > 0 ? d.value : k.value ?? null,
    ownerId: k.ownerId || d.ownerId || null,
    tags: uniqueStrings(k.tags || [], d.tags || []),
    notes: [...(Array.isArray(k.notes) ? k.notes : []), ...(Array.isArray(d.notes) ? d.notes : [])],
    qualification: { ...qual, updatedAt: now },
    lastUpdate: now,
  };
}
