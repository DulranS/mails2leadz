// lib/server/inbox-store.js - the one way leads get into the Lead Inbox (used by the worker's ingest route AND the in-app finder).
// Leads are stored with status "new" and nothing is sent. Opted-out contacts, lost deals and people who were already emailed are
// skipped, so the inbox only ever shows people who can still be contacted. Needs the Firebase Admin SDK.
import { doc, getDoc, setDoc, collection, query, where, getDocs } from '../server-firestore.js';
import { isBlockedContact, hasExistingDeal } from './route-helpers.js';
import { inboxDocId } from './ingest-key.js';
import { sanitizeLead, inboxKey, INBOX_STATUS } from '../lead-inbox.js';

/** @returns {Promise<{ added: number, skipped: { invalid: number, duplicate: number, blocked: number, contacted: number, known: number } }>} */
export async function storeLeads(db, uid, incoming, { source = 'autopilot', batchId = '' } = {}) {
  const skipped = { invalid: 0, duplicate: 0, blocked: 0, contacted: 0, known: 0 };
  const unique = new Map();
  for (const raw of incoming) {
    const r = sanitizeLead(raw);
    if (!r.ok) { skipped.invalid++; continue; }
    const id = inboxDocId(uid, inboxKey(r.lead));
    if (unique.has(id)) skipped.duplicate++;
    else unique.set(id, r.lead);
  }
  let added = 0;
  const entries = [...unique.entries()];
  for (let i = 0; i < entries.length; i += 8) {
    await Promise.all(entries.slice(i, i + 8).map(async ([id, lead]) => {
      const ref = doc(db, 'lead_inbox', id);
      if ((await getDoc(ref)).exists()) { skipped.duplicate++; return; } // already received (loaded and dismissed leads stay that way)
      if (lead.email) {
        if (await isBlockedContact(db, uid, lead.email)) { skipped.blocked++; return; }
        const sent = await getDocs(query(collection(db, 'sent_emails'), where('userId', '==', uid), where('to', '==', lead.email)));
        if (!sent.empty) { skipped.contacted++; return; }
        if (await hasExistingDeal(db, uid, lead.email)) { skipped.known++; return; } // already a customer / enquiry / conversation: not a cold lead
      }
      await setDoc(ref, { ...lead, userId: uid, status: INBOX_STATUS.NEW, source, batchId: String(batchId).slice(0, 60), receivedAt: new Date().toISOString() });
      added++;
    }));
  }
  return { added, skipped };
}
