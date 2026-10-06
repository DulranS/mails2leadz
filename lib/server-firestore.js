// lib/server-firestore.js
//
// Server-only Firestore access for API routes.
//
// WHY THIS EXISTS
// The API routes used the *browser* Firebase SDK on the server. That SDK has no
// logged-in user server-side, so the only way it works is with Firestore rules
// that are open to everyone - which means anyone on the internet can read/write
// every customer's data straight through the public API key.
//
// With a service account configured, this module switches every route to the
// Firebase Admin SDK (which bypasses rules), so Firestore rules can be locked
// down to "owner only" for the browser. Routes keep using the same function
// names (collection, doc, query, where, getDocs, addDoc, ...), only the import
// path changed.
//
// Without a service account it falls back to the client SDK, i.e. exactly the
// previous behaviour, so nothing breaks while you are setting it up.
//
// Env (either form):
//   FIREBASE_SERVICE_ACCOUNT_JSON = raw service-account JSON, or base64 of it
//   FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (+ NEXT_PUBLIC_FIREBASE_PROJECT_ID)

import * as clientFs from 'firebase/firestore';
// firebase-admin is OPTIONAL at load time: if it is missing or cannot start, the routes keep working
// through the browser SDK (as before) instead of crashing every API call with "Internal Server Error".
let adminAppMod = null;
let adminFsMod = null;
try {
  adminAppMod = require('firebase-admin/app');
  adminFsMod = require('firebase-admin/firestore');
} catch (e) {
  console.error('[server-firestore] firebase-admin not available, using client SDK fallback:', e.message);
}
const adminGetApps = () => (adminAppMod ? adminAppMod.getApps() : []);
const adminInitializeApp = (...a) => adminAppMod.initializeApp(...a);
const cert = (...a) => adminAppMod.cert(...a);
const adminGetFirestore = (...a) => adminFsMod.getFirestore(...a);
const FieldValue = adminFsMod ? adminFsMod.FieldValue : null;
const AdminTimestamp = adminFsMod ? adminFsMod.Timestamp : null;

function readServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    try {
      const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      const parsed = JSON.parse(text);
      if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      return parsed;
    } catch (e) {
      console.error('[server-firestore] FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed:', e.message);
      return null;
    }
  }
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return {
      project_id: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }
  return null;
}

let adminDb = null;
(function initAdmin() {
  if (!adminAppMod || !adminFsMod) return;
  const account = readServiceAccount();
  if (!account) return;
  try {
    const app = adminGetApps().length
      ? adminGetApps()[0]
      : adminInitializeApp({ credential: cert(account), projectId: account.project_id });
    adminDb = adminGetFirestore(app);
    try {
      // The client SDK threw on `undefined` fields; keep routes working unchanged.
      adminDb.settings({ ignoreUndefinedProperties: true });
    } catch {
      /* settings() can only be called once per instance - safe to ignore */
    }
  } catch (e) {
    console.error('[server-firestore] Admin SDK init failed, falling back to client SDK:', e.message);
    adminDb = null;
  }
})();

export const isAdminMode = () => !!adminDb;

// ---------------------------------------------------------------------------
// Wrappers (admin mode only). Client mode re-exports the real functions.
// ---------------------------------------------------------------------------
const wrapDocRef = (ref) => ({ __admin: true, kind: 'doc', ref, id: ref.id, path: ref.path });

const wrapSnapshotDoc = (d) => ({
  id: d.id,
  ref: wrapDocRef(d.ref),
  data: () => d.data(),
  exists: () => d.exists,
  get: (field) => d.get(field),
});

const A = {
  getFirestore: () => ({ __admin: true, kind: 'db', db: adminDb }),

  collection: (db, ...segments) => ({
    __admin: true,
    kind: 'col',
    ref: db.db.collection(segments.join('/')),
  }),

  doc: (parent, ...segments) => {
    if (parent.kind === 'col') return wrapDocRef(parent.ref.doc(...segments));
    return wrapDocRef(parent.db.doc(segments.join('/')));
  },

  where: (field, op, value) => ({ __c: 'where', field, op, value }),
  orderBy: (field, dir = 'asc') => ({ __c: 'orderBy', field, dir }),
  limit: (n) => ({ __c: 'limit', n }),

  query: (col, ...constraints) => {
    let ref = col.ref;
    for (const c of constraints.flat()) {
      if (!c) continue;
      if (c.__c === 'where') ref = ref.where(c.field, c.op, c.value);
      else if (c.__c === 'orderBy') ref = ref.orderBy(c.field, c.dir);
      else if (c.__c === 'limit') ref = ref.limit(c.n);
    }
    return { __admin: true, kind: 'query', ref };
  },

  getDocs: async (q) => {
    const snap = await q.ref.get();
    const docs = snap.docs.map(wrapSnapshotDoc);
    return {
      docs,
      empty: snap.empty,
      size: snap.size,
      forEach: (cb) => docs.forEach(cb),
    };
  },

  getDoc: async (ref) => wrapSnapshotDoc(await ref.ref.get()),

  addDoc: async (col, data) => wrapDocRef(await col.ref.add(data)),

  setDoc: async (ref, data, options) => {
    await ref.ref.set(data, options || {});
  },

  updateDoc: async (ref, ...args) => {
    await ref.ref.update(...args);
  },

  deleteDoc: async (ref) => {
    await ref.ref.delete();
  },

  increment: (n) => FieldValue.increment(n),
  serverTimestamp: () => FieldValue.serverTimestamp(),
  arrayUnion: (...v) => FieldValue.arrayUnion(...v),
};

const pick = (name) => (adminDb ? A[name] : clientFs[name]);

export const getFirestore = (app) => (adminDb ? A.getFirestore() : clientFs.getFirestore(app));
export const collection = (...a) => pick('collection')(...a);
export const doc = (...a) => pick('doc')(...a);
export const where = (...a) => pick('where')(...a);
export const orderBy = (...a) => pick('orderBy')(...a);
export const limit = (...a) => pick('limit')(...a);
export const query = (...a) => pick('query')(...a);
export const getDocs = (...a) => pick('getDocs')(...a);
export const getDoc = (...a) => pick('getDoc')(...a);
export const addDoc = (...a) => pick('addDoc')(...a);
export const setDoc = (...a) => pick('setDoc')(...a);
export const updateDoc = (...a) => pick('updateDoc')(...a);
export const deleteDoc = (...a) => pick('deleteDoc')(...a);
export const increment = (...a) => pick('increment')(...a);
export const serverTimestamp = (...a) => pick('serverTimestamp')(...a);
export const arrayUnion = (...a) => pick('arrayUnion')(...a);
export const Timestamp = adminDb ? AdminTimestamp : clientFs.Timestamp;
