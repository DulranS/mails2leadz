// lib/server/operator-owner.js - records the first person to sign in as the app-keys owner, once. Never throws.
import { doc, getDoc, setDoc } from '../server-firestore.js';
import { claimOwner, canManageKeys } from '../operator-owner.js';

const DOC = ['operator_settings', 'owner'];
let known = null; // read once per instance; the owner never changes after the first claim

export async function ownerUid(db) {
  if (known) return known;
  try {
    const snap = await getDoc(doc(db, ...DOC));
    known = snap?.data?.()?.uid || null;
  } catch (e) { return null; }
  return known;
}

/** Called on every signed-in request: the first person to get here becomes the owner. */
export async function claimIfUnset(db, uid) {
  const current = await ownerUid(db);
  const { owner, claimed } = claimOwner(current, uid);
  if (claimed) {
    try {
      await setDoc(doc(db, ...DOC), { uid: owner, claimedAt: new Date().toISOString() }, { merge: false });
      known = owner;
    } catch (e) { /* if the write fails, the next request tries again */ }
  }
  return owner;
}

export async function isKeysOwner(db, uid) {
  const owner = await ownerUid(db);
  return canManageKeys(owner, uid);
}
