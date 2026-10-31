// lib/assignment.js - who owns each open deal. Pure: the caller passes the roster and the deals.
// Owners: the account owner, plus every team member with the manager role. Viewers cannot own a deal.
// Auto-assign gives an unowned open deal to whichever owner has the fewest open deals (ties go to the owner), so the work spreads
// without a rota to maintain.
import { OPEN_STAGES, normalizeStage } from './deal-utils.js';

export const OWNER_KEY = 'owner';

/** @returns {{key:string,label:string}[]} */
export function eligibleOwners(members = []) {
  const list = [{ key: OWNER_KEY, label: 'You (owner)' }];
  for (const m of members) {
    if (m && m.role === 'manager' && m.uid) list.push({ key: m.uid, label: m.name || m.email || 'Team member' });
  }
  return list;
}

const isOpen = (deal) => OPEN_STAGES.includes(normalizeStage(deal?.stage));

/** Open-deal count per owner key. */
export function loadByOwner(owners = [], deals = []) {
  const load = Object.fromEntries(owners.map((o) => [o.key, 0]));
  for (const d of deals) if (isOpen(d) && d.assignedTo && load[d.assignedTo] !== undefined) load[d.assignedTo] += 1;
  return load;
}

/** The owner with the fewest open deals; ties go to the earliest in the list (the owner first). */
export function pickOwner(owners = [], deals = []) {
  if (!owners.length) return null;
  const load = loadByOwner(owners, deals);
  return owners.reduce((best, o) => (load[o.key] < load[best.key] ? o : best), owners[0]).key;
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
    const key = pickOwner(owners, working);
    if (!key) break;
    d.assignedTo = key;
    changes.push({ id: d.id, email: d.email, assignedTo: key });
  }
  return changes;
}
