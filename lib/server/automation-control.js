// lib/server/automation-control.js - the daily steps that need no message to anyone: invoice drafts for won deals, and won deals whose invoice is paid. Never throws.
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, addDoc } from '../server-firestore.js';
import { buildInvoiceWrite } from '../billing.js';
import { wonNotInvoiced } from '../payment-metrics.js';
import { switchState } from '../switches.js';

async function settingsFor(db, uid) {
  return (await getDoc(doc(db, 'users', uid, 'settings', 'business')).then((s) => s.data() || {}).catch(() => ({})));
}

export async function runAutomationControl(db, uid, { now = Date.now(), env = {} } = {}) {
  const settings = await settingsFor(db, uid);
  const invoices = (await getDocs(query(collection(db, 'users', uid, 'invoices'), limit(1000)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const deals = (await getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(500)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  let drafts = 0, won = 0;
  if (switchState('autoInvoiceDrafts', settings, env).on) {
    for (const deal of wonNotInvoiced(deals, invoices, now)) {
      const built = buildInvoiceWrite({ uid, email: deal.email, businessName: deal.businessName || deal.email, amount: deal.value, now: new Date(now) });
      if (!built?.ok) continue;
      await addDoc(collection(db, 'users', uid, 'invoices'), { ...built.write, status: 'draft', dealId: deal.id, number: '', source: 'automation', createdAt: new Date(now).toISOString() });
      drafts++;
    }
  }
  if (switchState('autoDealStages', settings, env).on) {
    for (const inv of invoices) {
      if (inv.status !== 'paid' || !inv.dealId) continue;
      const deal = deals.find((d) => d.id === inv.dealId);
      if (!deal || deal.stage === 'closed_won') continue;
      const at = new Date(now).toISOString();
      await setDoc(doc(db, 'deals', deal.id), { stage: 'closed_won', updatedAt: at, stageTimes: { ...(deal.stageTimes || {}), closed_won: at } }, { merge: true });
      won++;
    }
  }
  return { drafts, won };
}
