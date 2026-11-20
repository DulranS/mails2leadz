// lib/server/accounting-store.js - the Firestore side of the Xero and QuickBooks sync (pass 341). Tokens are encrypted with the token vault
// (TOKEN_ENC_KEY) and kept in accounting_connections/{uid}_{system}, which only the server reads (Admin SDK, as for Outlook).
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, updateDoc, deleteDoc } from '../server-firestore.js';
import { encryptSecret, decryptSecret } from './token-vault.js';

const MAX_INVOICES = 500;
const connRef = (db, uid, system) => doc(db, 'accounting_connections', `${String(uid)}_${system}`);

/** The callback address registered with the provider. XERO_REDIRECT_URI or QBO_REDIRECT_URI pins it; otherwise it is built from the site. */
export function accountingRedirectFor(system, request) {
  const pinned = process.env[system === 'xero' ? 'XERO_REDIRECT_URI' : 'QBO_REDIRECT_URI'];
  if (pinned) return pinned.trim();
  const envBase = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  const base = /^https:\/\//.test(envBase) ? new URL(envBase).origin : request.nextUrl.origin;
  return `${base}/api/accounting/${system}/callback`;
}

/** Connection status for the owner: whether it is connected, to which company, and when. Never the tokens. */
export async function connectionInfo(db, uid, system) {
  const s = await getDoc(connRef(db, uid, system));
  if (!s.exists()) return null;
  const d = s.data() || {};
  return { connected: !!d.enc, tenantId: d.tenantId || '', connectedAt: d.connectedAt || null };
}

/** The store that lib/accounting-sync.js works through, bound to one owner. */
export function accountingStore(db, uid) {
  return {
    async loadConnection(system) {
      const s = await getDoc(connRef(db, uid, system));
      if (!s.exists()) return null;
      const d = s.data() || {};
      if (!d.enc) return null;
      return { refreshToken: decryptSecret(d.enc), tenantId: d.tenantId || '' };
    },
    async saveConnection(system, { refreshToken, tenantId = '' }) {
      await setDoc(connRef(db, uid, system), { userId: String(uid), enc: encryptSecret(refreshToken), tenantId: String(tenantId || ''), status: 'ok', connectedAt: new Date().toISOString() });
    },
    async saveRefreshToken(system, refreshToken) {
      await setDoc(connRef(db, uid, system), { enc: encryptSecret(refreshToken) }, { merge: true });
    },
    async saveTenantId(system, tenantId) {
      await setDoc(connRef(db, uid, system), { tenantId: String(tenantId) }, { merge: true });
    },
    async removeConnection(system) {
      await deleteDoc(connRef(db, uid, system));
    },
    async listInvoices() {
      const snap = await getDocs(query(collection(db, 'invoices'), where('userId', '==', String(uid)), limit(MAX_INVOICES)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async updateInvoice(id, patch) {
      await updateDoc(doc(db, 'invoices', String(id)), patch);
    },
  };
}
