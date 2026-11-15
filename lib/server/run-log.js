// lib/server/run-log.js - writes one run record to the owner's workspace (users/{uid}/runs). Never blocks the job it records.
import { collection, addDoc } from '../server-firestore.js';

/** @returns {Promise<boolean>} true when the record was written */
export async function recordRun(db, uid, record) {
  try {
    await addDoc(collection(db, 'users', String(uid), 'runs'), record);
    return true;
  } catch (e) {
    console.error('[run-log] could not record:', String(e?.message || '').slice(0, 120));
    return false;
  }
}
