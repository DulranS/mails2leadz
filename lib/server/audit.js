// lib/server/audit.js - writes one audit entry to the owner's workspace (users/{uid}/audit). Never blocks the action it records:
// if the write fails, the action still stands and the failure is logged.
import { collection, addDoc } from '../server-firestore.js';
import { auditEntry } from '../audit-rules.js';

/** @returns {Promise<boolean>} true when the entry was written */
export async function recordAudit(db, uid, input = {}) {
  try {
    const entry = auditEntry({ ...input, actorUid: input.actorUid || uid });
    if (!entry) return false;
    await addDoc(collection(db, 'users', String(uid), 'audit'), entry);
    return true;
  } catch (e) {
    console.error('[audit] could not record:', String(input?.action || ''), String(e?.message || '').slice(0, 120));
    return false;
  }
}
