// lib/account-data.js - self-service export and deletion of one customer's data (browser side).
// Everything is scoped by userId; Firestore rules independently enforce that.
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';

// Top-level collections whose docs carry a `userId` field.
export const USER_COLLECTIONS = [
  'deals', 'sent_emails', 'contacted_companies', 'calls', 'sms_sent', 'whatsapp_sent', 'whatsapp_contacts',
  'replies', 'manual_contact_status', 'contact_history', 'company_research', 'ai_smart_outreach',
  'ai_usage', 'ai_usage_daily', 'ai_usage_monthly', 'sent_leads', 'send_time_optimization', 'clicks', 'ab_results',
];
// Subcollections under users/{uid}/...
export const USER_SUBCOLLECTIONS = ['follow_up_tasks', 'lead_states', 'lead_notes', 'contacts', 'settings'];

async function eachDoc(db, uid, fn) {
  for (const name of USER_COLLECTIONS) {
    try {
      const snap = await getDocs(query(collection(db, name), where('userId', '==', uid)));
      for (const d of snap.docs) await fn(`${name}/${d.id}`, d.data(), d.ref);
    } catch (e) {
      /* collection not used / no access: skip */
    }
  }
  for (const name of USER_SUBCOLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, 'users', uid, name));
      for (const d of snap.docs) await fn(`users/${uid}/${name}/${d.id}`, d.data(), d.ref);
    } catch (e) {}
  }
}

export async function exportAllData(db, uid) {
  const out = {};
  await eachDoc(db, uid, (path, data) => {
    const [head] = path.split('/');
    const bucket = head === 'users' ? `users.${path.split('/')[2]}` : head;
    (out[bucket] ||= []).push({ id: path.split('/').pop(), ...data });
  });
  return { exportedAt: new Date().toISOString(), userId: uid, data: out };
}

export async function deleteAllData(db, uid) {
  let n = 0;
  await eachDoc(db, uid, async (_path, _data, ref) => {
    await deleteDoc(ref);
    n++;
  });
  try {
    await deleteDoc(doc(db, 'users', uid));
  } catch {}
  return n;
}
