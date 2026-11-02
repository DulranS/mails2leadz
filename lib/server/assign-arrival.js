// lib/server/assign-arrival.js - gives a brand-new deal to an owner the moment it arrives (enquiry or booking), using the same
// rule as the Owners page: territory first, then the least-loaded owner who is not away and not full. Only when there is a team
// (two or more owners). A deal that already has an owner is left alone.
import { doc, getDoc, getDocs, collection, query, where, limit, updateDoc } from '../server-firestore.js';
import { ownersFor } from './owner-settings.js';
import { pickOwner, territoryOf, industryOf } from '../assignment.js';
import { dealDocId } from '../deal-utils.js';

const MAX_DEALS_CONSIDERED = 2000; // the load of each owner is counted over this many open deals

export async function assignArrival(db, uid, email, country = '', industry = '', size = '') {
  const owners = await ownersFor(db, uid);
  if (owners.length < 2) return { assigned: false, reason: 'no_team' };
  const ref = doc(db, 'deals', dealDocId(uid, email));
  const snap = await getDoc(ref);
  if (!snap.exists()) return { assigned: false, reason: 'no_deal' };
  if (snap.data().assignedTo) return { assigned: false, reason: 'already_owned' };
  const deals = (await getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(MAX_DEALS_CONSIDERED)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const key = pickOwner(owners, deals, { territory: territoryOf(email, country), industry: industryOf(snap.data().industry || industry), size: snap.data().companySize || size });
  if (!key) return { assigned: false, reason: 'no_owner_free' };
  await updateDoc(ref, { assignedTo: key, assignedAt: new Date().toISOString(), assignedBy: 'arrival' });
  return { assigned: true, owner: key };
}
