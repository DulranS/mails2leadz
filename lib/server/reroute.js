// lib/server/reroute.js - moves new deals nobody has touched for an hour to another free owner, once. Run hourly by the cron.
// Only accounts with a team (two or more owners) are changed. Nothing is sent to anyone: the Owners page shows the new owner.
import { collection, doc, getDocs, limit, query, updateDoc, where } from '../server-firestore.js';
import { ownersFor } from './owner-settings.js';
import { planReroutes } from '../assignment.js';

const MAX_ACCOUNTS = 50;     // per run; the rest are picked up on the next hour
const MAX_CANDIDATES = 1000; // deals read per run

export async function runUntouchedReroutes(db, { now = Date.now(), afterHours = 1 } = {}) {
  const cutoffIso = new Date(now - afterHours * 3600000).toISOString();
  const candidates = (await getDocs(query(collection(db, 'deals'), where('assignedAt', '<=', cutoffIso), limit(MAX_CANDIDATES))))
    .docs.map((d) => ({ id: d.id, ...d.data() }));
  const accounts = [...new Set(candidates.filter((d) => d.userId && d.assignedTo && !d.reroutedAt).map((d) => d.userId))].slice(0, MAX_ACCOUNTS);
  let moved = 0;
  let checked = 0;
  const stamp = new Date(now).toISOString();
  for (const uid of accounts) {
    const owners = await ownersFor(db, uid);
    if (owners.length < 2) continue;
    checked++;
    const deals = (await getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(2000)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    for (const c of planReroutes(owners, deals, { now, afterHours })) {
      await updateDoc(doc(db, 'deals', c.id), { assignedTo: c.to, assignedAt: stamp, assignedBy: 'reroute', reroutedAt: stamp, reroutedFrom: c.from });
      moved++;
    }
  }
  return { moved, accountsChecked: checked, candidates: candidates.length };
}
