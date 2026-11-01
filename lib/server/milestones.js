// lib/server/milestones.js - invoices one payment milestone of an accepted quote, in order. Used at acceptance (the first
// milestone, e.g. the deposit) and by the "Invoice next milestone" button. Each milestone becomes one invoice, at most once.
import { addDoc, collection, doc, getDocs, limit, query, updateDoc, where } from '../server-firestore.js';
import { buildInvoiceWrite, DEFAULT_PAYMENT_TERMS_DAYS } from '../billing.js';
import { nextMilestoneIndex, milestoneNote } from '../quote-core.js';

const round = (n) => Math.round(Number(n) * 100) / 100;
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

/**
 * What an earlier quote has already billed (net). With a schedule: its invoiced milestones (exact). Without one: the invoices sent
 * to the same customer since that quote was accepted (the best available, since the invoices do not name their quote).
 */
export async function billedNetForQuote(db, uid, original) {
  if (Array.isArray(original.milestones) && original.milestones.length) {
    return round(original.milestones.filter((m) => m.invoiceId && m.invoiceId !== 'credited').reduce((sum, m) => sum + Number(m.amount || 0), 0));
  }
  const since = Date.parse(original.acceptedAt || '');
  const email = String(original.customerEmail || '').toLowerCase();
  if (!Number.isFinite(since) || !email) return 0;
  const snap = await getDocs(query(collection(db, 'invoices'), where('userId', '==', uid), limit(2000)));
  return round(snap.docs.map((d) => d.data())
    .filter((i) => String(i.email || '').toLowerCase() === email && Date.parse(i.issuedAt || '') >= since && i.status !== 'void' && !i.bookingId && !i.revisionAdjustment)
    .reduce((sum, i) => sum + Number(i.amount || 0), 0));
}

/** An invoice for the difference when a revision costs more than was already billed. */
export async function issueAdjustmentInvoice(db, uid, quote, amount, note, bs = {}) {
  const termsDays = Number.isFinite(Number(bs.paymentTermsDays)) ? Number(bs.paymentTermsDays) : DEFAULT_PAYMENT_TERMS_DAYS;
  const taxRate = Number(bs.taxRate) > 0 ? Number(bs.taxRate) : 0;
  const built = buildInvoiceWrite({ uid, email: quote.customerEmail, businessName: quote.customerName || '', amount, termsDays, taxRate, note: `${quote.title} · ${note}`.slice(0, 120), now: new Date() });
  if (!built.ok) return { error: built.error };
  built.write.number = await nextInvoiceNumber(db, uid);
  built.write.revisionAdjustment = true;
  const ref = await addDoc(collection(db, 'invoices'), built.write);
  return { ok: true, invoiceId: ref.id };
}
