// lib/server/economics.js - reads the owner's records for the money measures, and the model and ideal-buyer settings. Never throws.
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc } from '../server-firestore.js';
import { economics, BUSINESS_MODELS } from '../kpi-economics.js';
import { lifetimeValueByEmail } from '../sales-metrics.js';

export async function economicsFor(db, uid, now = Date.now()) {
  const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
  const [invoices, deals, leads] = await Promise.all([
    getDocs(query(collection(db, 'users', uid, 'invoices'), limit(1000))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
    getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(1000))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
    getDocs(query(collection(db, 'lead_inbox'), where('userId', '==', uid), limit(1000))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
  ]);
  const e = economics({ invoices, deals, leads, customersLtv: lifetimeValueByEmail(invoices), monthlySpend: Number(biz.marketingSpendMonthly) || 0, now, model: biz.businessModel || 'b2c' });
  return { ...e, businessModel: biz.businessModel || 'b2c', idealCustomer: String(biz.idealCustomer || '').slice(0, 400), models: Object.entries(BUSINESS_MODELS).map(([id, m]) => ({ id, label: m.label })) };
}

export async function saveBusinessProfile(db, uid, { businessModel, idealCustomer, marketingSpendMonthly }) {
  const patch = { updatedAt: new Date().toISOString() };
  if (businessModel && BUSINESS_MODELS[businessModel]) patch.businessModel = businessModel;
  if (idealCustomer !== undefined) patch.idealCustomer = String(idealCustomer).slice(0, 400);
  if (marketingSpendMonthly !== undefined) patch.marketingSpendMonthly = Math.max(0, Math.min(1e9, Number(marketingSpendMonthly) || 0));
  await setDoc(doc(db, 'users', uid, 'settings', 'business'), patch, { merge: true });
  return { ok: true };
}
