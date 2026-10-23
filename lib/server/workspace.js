// lib/server/workspace.js - "whose workspace is this person working in?" Decided on the SERVER from two records that only the
// server writes: users/{me}/settings/workspace (the pointer) AND users/{owner}/team_access/{me} (the owner's roster). Both must
// agree, so removing someone from the roster ends their access within a minute (the cache time) and instantly in the database rules.
// Anything that goes wrong means "no team": the person simply sees their own workspace. This can never grant more than a record says.
import { isRole } from '../workspace-access.js';

const TTL_MS = 60000;
const cache = new Map(); // uid -> { value, exp }
let resolver = null;     // tests replace this

export const invalidateWorkspace = (uid) => { if (uid) cache.delete(uid); else cache.clear(); };
export const setWorkspaceResolver = (fn) => { resolver = fn; cache.clear(); };

async function lookup(uid) {
  const [{ isAdminMode, doc, getDoc }, { getDb }] = await Promise.all([import('../server-firestore.js'), import('./route-helpers.js')]);
  if (!isAdminMode()) return null;
  const db = getDb();
  const pointer = await getDoc(doc(db, 'users', uid, 'settings', 'workspace'));
  if (!pointer.exists()) return null;
  const ownerUid = String(pointer.data().ownerUid || '');
  if (!ownerUid || ownerUid === uid) return null;
  const seat = await getDoc(doc(db, 'users', ownerUid, 'team_access', uid));
  if (!seat.exists()) return null;
  const role = String(seat.data().role || '');
  if (!isRole(role) || role === 'owner') return null;
  return { ownerUid, role };
}

/** @returns {Promise<{ownerUid:string, role:'manager'|'viewer'}|null>} null = works in their own workspace */
export async function resolveWorkspace(uid) {
  if (!uid) return null;
  const hit = cache.get(uid);
  if (hit && hit.exp > Date.now()) return hit.value;
  let value = null;
  try { value = await (resolver || lookup)(uid); } catch (e) { console.error('[workspace] lookup failed, treating as own workspace:', e?.message); value = null; }
  if (cache.size > 5000) cache.clear();
  cache.set(uid, { value, exp: Date.now() + TTL_MS });
  return value;
}
