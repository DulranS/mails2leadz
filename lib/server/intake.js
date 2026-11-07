// lib/server/intake.js - the owner's intake address: created once, rotated on request, and looked up by the address to find the owner. Never throws.
import { doc, getDoc, setDoc } from '../server-firestore.js';
import { newIntakeId } from '../intake.js';

/** The owner for a live address, or null (unknown, or rotated away). */
export async function ownerForIntake(db, id) {
  if (!id || String(id).length > 80) return null;
  const snap = await getDoc(doc(db, 'intake_index', String(id))).catch(() => null);
  const uid = snap?.exists?.() ? snap.data()?.uid : null;
  return uid || null;
}

/** The owner's current address; created the first time it is asked for. */
export async function currentIntakeId(db, uid) {
  const snap = await getDoc(doc(db, 'users', uid, 'settings', 'intake')).catch(() => null);
  const have = snap?.exists?.() ? snap.data()?.intakeId : null;
  if (have) return have;
  return rotateIntakeId(db, uid);
}

/** A new address for the owner; the old one stops working at once. */
export async function rotateIntakeId(db, uid) {
  const old = (await getDoc(doc(db, 'users', uid, 'settings', 'intake')).catch(() => null))?.data?.()?.intakeId || null;
  if (old) await setDoc(doc(db, 'intake_index', old), { uid: null, revokedAt: new Date().toISOString() }, { merge: true });
  const id = newIntakeId();
  await setDoc(doc(db, 'intake_index', id), { uid, createdAt: new Date().toISOString() });
  await setDoc(doc(db, 'users', uid, 'settings', 'intake'), { intakeId: id, updatedAt: new Date().toISOString() }, { merge: true });
  return id;
}
