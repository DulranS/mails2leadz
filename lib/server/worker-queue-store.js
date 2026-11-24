// lib/server/worker-queue-store.js - where the "run on my computer" requests live: finder_jobs/{uid}_worker.
// Server-written only (finder_jobs is in the deliberately-not-writable-by-browsers list in firestore.rules).
import { doc, getDoc, setDoc } from '../server-firestore.js';
import { normalizeState } from '../worker-queue.js';

const ref = (db, uid) => doc(db, 'finder_jobs', `${uid}_worker`);

export async function loadWorkerQueue(db, uid) {
  const snap = await getDoc(ref(db, uid));
  return snap.exists() ? normalizeState(snap.data()) : normalizeState(null);
}

export async function saveWorkerQueue(db, uid, state) {
  const requests = normalizeState(state).requests;
  // `pending` lets the daily sweep find only the owners with a queued or running search (a single-field query).
  const pending = requests.some((r) => r.status === 'queued' || r.status === 'running');
  await setDoc(ref(db, uid), { uid, requests, pending, updatedAt: new Date().toISOString() });
}

/** Read-change-write in one place. `change` returns { state } to save or { error, code } to refuse. */
export async function updateWorkerQueue(db, uid, change) {
  const current = await loadWorkerQueue(db, uid);
  const out = change(current);
  if (out.error) return out;
  await saveWorkerQueue(db, uid, out.state);
  return out;
}
