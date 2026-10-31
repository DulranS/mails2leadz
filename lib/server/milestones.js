// lib/server/milestones.js - invoices one payment milestone of an accepted quote, in order. Used at acceptance (the first
// milestone, e.g. the deposit) and by the "Invoice next milestone" button. Each milestone becomes one invoice, at most once.
import { addDoc, collection, doc, updateDoc } from '../server-firestore.js';
import { buildInvoiceWrite, DEFAULT_PAYMENT_TERMS_DAYS } from '../billing.js';
import { nextMilestoneIndex, milestoneNote } from '../quote-core.js';
import { nextInvoiceNumber } from './invoice-number.js';

/**
 * @returns {Promise<{ok:true, invoiceId:string, milestones:object[]} | {error:string}>}
 */
export async function releaseMilestone(db, uid, quote, index, bs = {}) {
  const ms = Array.isArray(quote.milestones) ? quote.milestones : [];
  const m = ms[index];
  if (!m) return { error: 'There is no such milestone.' };
  if (m.invoiceId) return { error: 'This milestone is already invoiced.' };
  if (m.superseded) return { error: 'This milestone was replaced by a revised quote.' };
  if (index !== nextMilestoneIndex(ms)) return { error: 'Invoice the milestones in order.' };
  const termsDays = Number.isFinite(Number(bs.paymentTermsDays)) ? Number(bs.paymentTermsDays) : DEFAULT_PAYMENT_TERMS_DAYS;
  const taxRate = Number(bs.taxRate) > 0 ? Number(bs.taxRate) : 0;
  const built = buildInvoiceWrite({
    uid, email: quote.customerEmail, businessName: quote.customerName || '', amount: m.amount,
    termsDays, taxRate, note: milestoneNote(quote, m), now: new Date(),
  });
  if (!built.ok) return { error: built.error };
  if (!built.write.number) built.write.number = await nextInvoiceNumber(db, uid);
  const ref = await addDoc(collection(db, 'invoices'), built.write);
  const milestones = ms.map((x, i) => (i === index ? { ...x, invoiceId: ref.id, invoicedAt: new Date().toISOString() } : x));
  await updateDoc(doc(db, 'users', uid, 'quotes', quote.id), { milestones });
  return { ok: true, invoiceId: ref.id, milestones };
}
