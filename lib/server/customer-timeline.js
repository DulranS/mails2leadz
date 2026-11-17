// lib/server/customer-timeline.js - loads one customer's records from the owner's workspace and builds their history.
import { collection, getDocs, query, where, limit } from '../server-firestore.js';
import { customerTimeline } from '../customer-timeline.js';
import { dealHistory } from '../deal-history.js';
import { workModeFor } from './work-mode.js';

const rows = (p) => p.then((s) => s.docs.map((d) => d.data())).catch(() => []);
const rowsWithId = (p) => p.then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []);

export async function loadCustomerTimeline(db, uid, email) {
  const who = String(email || '').trim().toLowerCase();
  const [sentEmails, quotes, invoices, bookings, tickets, activities, callNotes, calls, deals] = await Promise.all([
    rows(getDocs(query(collection(db, 'sent_emails'), where('userId', '==', uid), where('to', '==', who), limit(200)))),
    rows(getDocs(query(collection(db, 'users', uid, 'quotes'), limit(500)))),
    rows(getDocs(query(collection(db, 'invoices'), where('userId', '==', uid), limit(500)))),
    rows(getDocs(query(collection(db, 'users', uid, 'bookings'), limit(500)))),
    rows(getDocs(query(collection(db, 'users', uid, 'support_tickets'), limit(500)))),
    rowsWithId(getDocs(query(collection(db, 'deal_activity'), where('userId', '==', uid), where('email', '==', who), limit(200)))),
    rows(getDocs(query(collection(db, 'users', uid, 'call_notes'), limit(300)))),
    rows(getDocs(query(collection(db, 'calls'), where('userId', '==', uid), where('email', '==', who), limit(200)))),
    rows(getDocs(query(collection(db, 'deals'), where('userId', '==', uid), where('email', '==', who), limit(20)))),
  ]);
  const mode = await workModeFor(db, uid);
  return customerTimeline({ email: who, sentEmails, quotes, invoices, bookings, tickets, activities, callNotes, calls, deals, mode });
}

/** The customer's most recently updated deal, as a short history. Null when there is none. */
export async function loadDealHistory(db, uid, email) {
  const who = String(email || '').trim().toLowerCase();
  const found = await rows(getDocs(query(collection(db, 'deals'), where('userId', '==', uid), where('email', '==', who), limit(5))));
  const latest = found.sort((a, b) => String(b.lastUpdate || '').localeCompare(String(a.lastUpdate || '')))[0];
  return dealHistory(latest, await workModeFor(db, uid));
}
