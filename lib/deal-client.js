// lib/deal-client.js - browser-side helper for changing the per-deal extras (qualification, onboarding, issues, last contact)
// without touching the deal's stage. Reads the deal, builds the write with the shared rules (buildDealWrite), merges it.
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { buildDealWrite, dealDocId } from './deal-utils.js';

/**
 * @param changes object, or function(existingDeal) -> object, with any of: qualification, onboardingDone, issues, touch
 * @returns the deal as it is now, or null when there is no deal document for that email (nothing is created here)
 */
export async function updateDealExtras(db, uid, email, changes, now = new Date()) {
  const ref = doc(db, 'deals', dealDocId(uid, email));
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const existing = snap.data();
  const extra = typeof changes === 'function' ? changes(existing) : changes;
  const write = buildDealWrite({ uid, email, existing, stage: existing.stage, ...extra, now });
  await setDoc(ref, write, { merge: true });
  return { ...existing, ...write };
}
