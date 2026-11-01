// lib/assignment.js - who owns each open deal (pure). Owners: the account owner, plus every team manager.
// An owner can be away, can have a cap on open deals, and can cover territories. Routing never leaves a deal unowned:
// if nobody is free, the least-loaded owner takes it.
import { OPEN_STAGES, normalizeStage } from './deal-utils.js';

export const OWNER_KEY = 'owner';
const isOpen = (d) => OPEN_STAGES.includes(normalizeStage(d?.stage));

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
export function pickOwner(owners = [], deals = [], { territory = '' } = {}) {
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
    const key = pickOwner(owners, working, { territory: territoryOf(d.email, d.country) });
    if (!key) break;
    d.assignedTo = key;
    changes.push({ id: d.id, email: d.email, assignedTo: key });
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
