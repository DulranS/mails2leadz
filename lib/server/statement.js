// lib/server/statement.js - reads one customer's invoices and credit notes for the statement.
import { collection, getDocs, query, where, limit } from '../server-firestore.js';

const MAX_ROWS = 5000; // a per-account bound, the same as the other owner reports

export async function loadAccountRecords(db, uid) {
  const [inv, cn] = await Promise.all([
    getDocs(query(collection(db, 'invoices'), where('userId', '==', uid), limit(MAX_ROWS))),
    getDocs(query(collection(db, 'credit_notes'), where('userId', '==', uid), limit(MAX_ROWS))),
  ]);
  return {
    invoices: inv.docs.map((d) => ({ id: d.id, ...d.data() })),
    credits: cn.docs.map((d) => ({ id: d.id, ...d.data() })),
    truncated: inv.size >= MAX_ROWS || cn.size >= MAX_ROWS,
  };
}
