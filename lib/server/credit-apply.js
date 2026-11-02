// lib/server/credit-apply.js - applying HELD credit to invoices, safely.
//  - addInvoiceWithCredit: a new invoice takes the held credit for its customer, in one transaction.
//  - applyHeldCreditToInvoice: an existing unpaid invoice takes held credit, in one transaction.
// In both, every credit note is read again inside the transaction; if one changed (someone else used it), nothing is written
// and the whole thing is tried again from the start (up to 3 times). So the same credit can never be used twice.
import { collection, doc, getDocs, getDoc, query, where, limit, setDoc } from '../server-firestore.js';
import { planCreditApplication, applyToBuild } from '../credit-apply.js';
import { invoiceBase } from '../billing.js';
import { runTx } from './tx.js';
import { newDocRef } from './ids.js';

const ATTEMPTS = 3;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** The customer's credit that is being held (not yet used up), for the transaction's plan. */
export async function heldCreditsFor(db, uid, email) {
  const snap = await getDocs(query(collection(db, 'credit_notes'), where('userId', '==', uid), where('status', '==', 'credit_held'), limit(500)));
  const e = String(email || '').trim().toLowerCase();
  return snap.docs.filter((d) => String(d.data().customerEmail || '').trim().toLowerCase() === e).map((d) => ({ id: d.id, ...d.data() }));
}

/** The fields to write to a credit note after it has been used (inside the same transaction). */
export function creditUsePatch(pick, current, invoiceId, now) {
  const appliedAmount = r2((Number(current.appliedAmount) || 0) + pick.applied);
  const left = r2((Number(current.amount) || 0) - appliedAmount);
  return {
    appliedAmount,
    status: left <= 0.005 ? 'applied' : 'credit_held',
    statusAt: now.toISOString(),
    appliedToInvoices: [...(Array.isArray(current.appliedToInvoices) ? current.appliedToInvoices : []), invoiceId].slice(-50),
  };
}

/** True when every credit in the plan is still the same as when it was read: still held, same amount used. */
async function planStillValid(db, tx, plan) {
  const current = [];
  for (const p of plan.picks) {
    const cs = await tx.get(doc(db, 'credit_notes', p.id));
    const d = cs.exists() ? cs.data() : null;
    if (!d || d.status !== 'credit_held' || r2(Number(d.appliedAmount) || 0) !== r2(p.appliedAmount)) return null;
    current.push({ pick: p, data: d });
  }
  return current;
}

/**
 * Saves a new invoice. `write` is changed in place to the final figures (after any credit), so callers see what was saved.
 * @returns {Promise<object>} the reference to the new invoice
 */
export async function addInvoiceWithCredit(db, uid, write, now = new Date()) {
  const ref = newDocRef(db, 'invoices');
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const held = await heldCreditsFor(db, uid, write.email);
    const plan = planCreditApplication({ credits: held, total: write.total });
    if (plan.applied <= 0) {
      await setDoc(ref, write);
      return ref;
    }
    const next = { ...write };
    applyToBuild(next, plan, now);
    const ok = await runTx(db, async (tx) => {
      const current = await planStillValid(db, tx, plan);
      if (!current) return false;
      tx.set(ref, next);
      for (const { pick, data } of current) tx.update(doc(db, 'credit_notes', pick.id), creditUsePatch(pick, data, ref.id, now));
      return true;
    });
    if (ok) { Object.assign(write, next); return ref; }
  }
  throw new Error('Held credit changed while the invoice was being saved. Try again.');
}

/** Applies held credit to an existing UNPAID invoice. Only invoices with no payment and no earlier credit qualify. */
export async function applyHeldCreditToInvoice(db, uid, invoiceId, now = new Date()) {
  const ref = doc(db, 'invoices', invoiceId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().userId !== uid) return { error: 'That invoice was not found.' };
  const inv = snap.data();
  if (inv.status === 'paid' || inv.status === 'void') return { error: 'That invoice is already settled.' };
  if ((Number(inv.amountPaid) || 0) > 0) return { error: 'Credit can only be applied before any payment is made.' };
  if (inv.beforeCredit || inv.creditApplied) return { error: 'Credit has already been applied to this invoice.' };
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const base = { amount: Number(inv.amount) || 0, taxAmount: Number(inv.taxAmount) || 0, total: invoiceBase(inv), status: inv.status };
    const held = await heldCreditsFor(db, uid, inv.email);
    const plan = planCreditApplication({ credits: held, total: base.total });
    if (plan.applied <= 0) return { applied: 0, message: 'This customer has no held credit.' };
    const next = applyToBuild({ ...base }, plan, now);
    const ok = await runTx(db, async (tx) => {
      const cur = await tx.get(ref);
      if (!cur.exists() || r2(invoiceBase(cur.data())) !== r2(base.total) || (Number(cur.data().amountPaid) || 0) > 0 || cur.data().beforeCredit) return false;
      const current = await planStillValid(db, tx, plan);
      if (!current) return false;
      const patch = { amount: next.amount, taxAmount: next.taxAmount, total: next.total, beforeCredit: next.beforeCredit, creditApplied: next.creditApplied, creditNotes: next.creditNotes };
      if (next.status === 'paid') Object.assign(patch, { status: 'paid', amountPaid: 0, paidAt: next.paidAt });
      tx.update(ref, patch);
      for (const { pick, data } of current) tx.update(doc(db, 'credit_notes', pick.id), creditUsePatch(pick, data, invoiceId, now));
      return true;
    });
    if (ok) return { applied: plan.applied, total: next.total, status: next.status || inv.status };
  }
  return { error: 'Held credit changed while this was being applied. Try again.' };
}
