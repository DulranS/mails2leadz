// lib/server/owner-settings.js - each owner's availability and territories, stored per account, and the owners who can take deals.
import { doc, getDoc, setDoc } from '../server-firestore.js';
import { loadRoster } from './team-store.js';
import { eligibleOwners } from '../assignment.js';

export async function ownersFor(db, uid) {
  const roster = await loadRoster(db, uid).catch(() => ({ members: [] }));
  const snap = await getDoc(doc(db, 'users', uid, 'settings', 'owners')).catch(() => null);
  const settings = snap && snap.exists() ? snap.data() : {};
  return eligibleOwners(roster.members || [], settings);
}

/** Saves one owner's availability. A cap of 0 or less means no cap. Territories are short lower-case codes. */
export async function saveOwnerSettings(db, uid, key, { away, maxOpen, territories } = {}) {
  const cap = Number(maxOpen);
  const list = Array.isArray(territories) ? territories : String(territories || '').split(',');
  const entry = {
    away: away === true,
    maxOpen: Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : null,
    territories: list.map((t) => String(t).trim().toLowerCase()).filter((t) => /^[a-z0-9-]{1,20}$/.test(t)).slice(0, 20),
  };
  await setDoc(doc(db, 'users', uid, 'settings', 'owners'), { [key]: entry, updatedAt: new Date().toISOString() }, { merge: true });
  return entry;
}
