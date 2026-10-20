// lib/client-firestore.js - drop-in replacement for "firebase/firestore" in browser code.
// It re-exports everything unchanged, except the four write calls (and batches), which also drop whatever cached read they may
// have changed (lib/client-data.js). That keeps the shared cache honest without every screen having to remember to refresh it:
// a screen writes, and the next screen that asks gets fresh data. Reads are untouched (use lib/client-data.js for cached ones).
import * as fs from 'firebase/firestore';
import { invalidatePath } from './client-data.js';

export * from 'firebase/firestore';

const touch = (ref) => {
  try { invalidatePath(ref?.path); } catch { /* a cache problem must never break a save */ }
};

export async function setDoc(ref, ...rest) {
  const out = await fs.setDoc(ref, ...rest);
  touch(ref);
  return out;
}
export async function updateDoc(ref, ...rest) {
  const out = await fs.updateDoc(ref, ...rest);
  touch(ref);
  return out;
}
export async function addDoc(ref, ...rest) {
  const out = await fs.addDoc(ref, ...rest);
  touch(ref); // a collection reference: its path names the collection
  return out;
}
export async function deleteDoc(ref, ...rest) {
  const out = await fs.deleteDoc(ref, ...rest);
  touch(ref);
  return out;
}

/** A batch that remembers where it wrote and drops those cache entries once it commits. */
export function writeBatch(db) {
  const batch = fs.writeBatch(db);
  const paths = [];
  const wrapped = {
    set(ref, ...rest) { paths.push(ref?.path); batch.set(ref, ...rest); return wrapped; },
    update(ref, ...rest) { paths.push(ref?.path); batch.update(ref, ...rest); return wrapped; },
    delete(ref) { paths.push(ref?.path); batch.delete(ref); return wrapped; },
    async commit() {
      const out = await batch.commit();
      paths.forEach((p) => touch({ path: p }));
      return out;
    },
  };
  return wrapped;
}
