// lib/server/routine-owner.js - tells the senders whether AutoLeads should send routine service messages. If the check fails, AutoLeads keeps sending. Never throws.
import { doc, getDoc } from '../server-firestore.js';
import { balancrConfig } from './balancr.js';
import { routineOwner } from '../routine-owner.js';

export async function autoleadsSendsRoutine(db, uid) {
  try {
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).then((s) => s.data() || {}).catch(() => ({})));
    const connected = Boolean(await balancrConfig(db, uid).catch(() => null));
    return routineOwner({ balancrConnected: connected, setting: biz.routineMessagesFrom || '' }) === 'autoleads';
  } catch (e) {
    return true;
  }
}
