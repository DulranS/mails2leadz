// lib/assignment.js - who owns each open deal (pure). Owners: the account owner, plus every team manager.
// An owner can be away, can have a cap on open deals, and can cover territories. Routing never leaves a deal unowned:
// if nobody is free, the least-loaded owner takes it.
import { OPEN_STAGES, normalizeStage } from './deal-utils.js';

export const OWNER_KEY = 'owner';
/** Company size bands an enquiry can say it is in, and an owner can take. */
export const SIZE_BANDS = ['1-10', '11-50', '51-200', '201+'];
const isOpen = (d) => OPEN_STAGES.includes(normalizeStage(d?.stage));

/** An industry label as stored and compared: lower case, single spaces, at most 40 characters. '' when empty. */
export function industryOf(raw) {
  return String(raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);
}

/** The territory of a deal, from its email's country domain (.lk, .uk, ...); other domains are 'com'. A proxy, not a location. */
export function territoryOf(email, country = '') {
  if (/^[a-z]{2}$/i.test(String(country || '').trim())) return String(country).trim().toLowerCase(); // recorded on the enquiry
  const last = String(email || '').toLowerCase().split('@')[1]?.split('.').pop() || '';
  return /^[a-z]{2}$/.test(last) ? last : 'com';
}

/** @param settings  per owner key: { away, maxOpen, territories } (see lib/server/owner-settings.js). Optional. */
export function eligibleOwners(members = [], settings = {}) {
  const shape = (key, label) => {
    const s = (settings && settings[key]) || {};
    const cap = Number(s.maxOpen);
    return {
      key, label,
      away: s.away === true,
      maxOpen: Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : null,
      territories: Array.isArray(s.territories) ? s.territories.map((t) => String(t).trim().toLowerCase()).filter(Boolean) : [],
      industries: Array.isArray(s.industries) ? s.industries.map(industryOf).filter(Boolean) : [],
      sizes: Array.isArray(s.sizes) ? s.sizes.map((v) => String(v).trim()).filter((v) => SIZE_BANDS.includes(v)) : [],
    };
  };
  const list = [shape(OWNER_KEY, 'You (owner)')];
  for (const m of members || []) if (m && m.role === 'manager' && m.uid) list.push(shape(m.uid, m.name || m.email || 'Team member'));
  return list;
}

/** Open-deal count per owner key. */
export function loadByOwner(owners = [], deals = []) {
  const load = Object.fromEntries(owners.map((o) => [o.key, 0]));
  for (const d of deals) if (isOpen(d) && d.assignedTo && load[d.assignedTo] !== undefined) load[d.assignedTo] += 1;
  return load;
}

/**
 * The owner for one deal. Order of preference: away and full owners are skipped; a territory specialist is preferred to a
 * generalist; among those, the one with the fewest open deals (ties go to the earliest in the list, the owner first).
 */
export function pickOwner(owners = [], deals = [], { territory = '', industry = '', size = '' } = {}) {
  if (!owners.length) return null;
  const load = loadByOwner(owners, deals);
  const room = (o) => o.maxOpen == null || load[o.key] < o.maxOpen;
  const available = owners.filter((o) => !o.away && room(o));
  let pool = available;
  if (territory) {
    const specialists = available.filter((o) => (o.territories || []).includes(territory));
    const generalists = available.filter((o) => !(o.territories || []).length);
    pool = specialists.length ? specialists : generalists.length ? generalists : available;
  }
  const sector = industryOf(industry);
  if (sector) {
    // An owner who lists an industry word (for example "software") takes deals whose industry contains it, if any are free.
    const sector_ = pool.filter((o) => (o.industries || []).some((t) => sector.includes(t)));
    if (sector_.length) pool = sector_;
  }
  if (size) {
    // An owner who lists a company size band takes enquiries from companies in that band, if any are free.
    const sized = pool.filter((o) => (o.sizes || []).includes(String(size)));
    if (sized.length) pool = sized;
  }
  const choose = (list) => list.reduce((best, o) => (load[o.key] < load[best.key] ? o : best), list[0]).key;
  if (pool.length) return choose(pool);
  return choose(owners); // everyone away or full: the deal still gets an owner, the least loaded
}

/**
 * Gives each unowned open deal an owner, least-loaded first, counting the assignments made along the way.
 * @returns {{id: string, email: string, assignedTo: string}[]}  only the deals that changed
 */
export function planAutoAssign(owners = [], deals = []) {
  const working = deals.map((d) => ({ ...d }));
  const changes = [];
  for (const d of working) {
    if (!isOpen(d) || d.assignedTo) continue;
    const key = pickOwner(owners, working, { territory: territoryOf(d.email, d.country), industry: d.industry, size: d.companySize });
    if (!key) break;
    d.assignedTo = key;
    changes.push({ id: d.id, email: d.email, assignedTo: key });
  }
  return changes;
}

/** The last time anyone worked a deal: the later of its last update and its last touch. NaN when neither is known. */
export function lastTouchMs(d = {}) {
  const read = (v) => (typeof v === 'number' ? v : Date.parse(v || ''));
  const times = [read(d.lastUpdate), read(d.lastTouchAt)].filter(Number.isFinite);
  return times.length ? Math.max(...times) : NaN;
}

/**
 * A new deal that its owner has not touched within `afterHours` of being handed over moves once to another free owner.
 * Only 'new' deals; never a deal already moved; never when the time of the last touch is unknown; never to an owner who is
 * away or full. A deal with a notes, stage, send or any other update since the handover counts as touched and stays put.
 * @returns {{id: string, email: string, from: string, to: string}[]}  only the deals that changed
 */
export function planReroutes(owners = [], deals = [], { now = Date.now(), afterHours = 1 } = {}) {
  if (owners.length < 2) return [];
  const cutoff = now - afterHours * 3600000;
  const working = deals.map((d) => ({ ...d }));
  const changes = [];
  for (const d of working) {
    if (!isOpen(d) || !d.assignedTo || d.reroutedAt || normalizeStage(d.stage) !== 'new') continue;
    const assigned = Date.parse(d.assignedAt || '');
    if (!Number.isFinite(assigned) || assigned > cutoff) continue;
    const touched = lastTouchMs(d);
    if (!Number.isFinite(touched) || touched > assigned) continue;
    const load = loadByOwner(owners, working);
    const room = owners.filter((o) => o.key !== d.assignedTo && !o.away && (o.maxOpen == null || load[o.key] < o.maxOpen));
    if (!room.length) continue;
    const to = pickOwner(room, working, { territory: territoryOf(d.email, d.country), industry: d.industry, size: d.companySize });
    if (!to || to === d.assignedTo) continue;
    changes.push({ id: d.id, email: d.email, from: d.assignedTo, to });
    d.assignedTo = to;
    d.reroutedAt = new Date(now).toISOString();
  }
  return changes;
}

/** One reminder for open deals that have had no owner for a while. Null when there are none (no email on a quiet day). */
export function unclaimedDigest({ deals = [], now = Date.now(), afterHours = 24 } = {}) {
  const cutoff = now - afterHours * 3600000;
  const stale = deals.filter((d) => isOpen(d) && !d.assignedTo && d.email && Date.parse(d.createdAt || d.lastUpdate || '') <= cutoff);
  if (!stale.length) return null;
  const n = stale.length;
  const lines = [`${n} open deal${n === 1 ? '' : 's'} ${n === 1 ? 'has' : 'have'} had no owner for over ${afterHours} hours.`, ''];
  for (const d of stale.slice(0, 30)) lines.push(`- ${d.businessName || d.email} (${normalizeStage(d.stage)})`);
  lines.push('', 'Open AutoLeads, then Deal owners, to give them an owner or spread them.');
  return { subject: `Deals with no owner: ${n}`, text: lines.join('\n') };
}
