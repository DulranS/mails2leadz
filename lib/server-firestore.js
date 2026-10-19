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
// SECOND OPTION, no service-account key needed ("server login"): the server signs in to Firebase Auth as one dedicated
// email/password user with the normal client SDK, and firestore.rules lets that one user id (and nobody else) read and write
// everything. Useful when the project does not allow creating service-account keys. Env: FIREBASE_SERVER_EMAIL +
// FIREBASE_SERVER_PASSWORD (see lib/server-login.js and DEPLOYMENT_GUIDE.md).
//
// With neither, it falls back to the plain client SDK, i.e. exactly the
// previous behaviour, so nothing breaks while you are setting it up.
//
// Env (any one form):
//   FIREBASE_SERVICE_ACCOUNT_JSON = the service-account JSON as downloaded, on one line, wrapped in quotes, or base64 of it (lib/service-account.js)
//   FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (+ NEXT_PUBLIC_FIREBASE_PROJECT_ID)
//   Nothing at all when the app runs on Google's own hosting (Firebase App Hosting, Cloud Run, Cloud Functions) or GOOGLE_APPLICATION_CREDENTIALS
//   points at a key file: firebase-admin then uses Application Default Credentials.

import * as clientFs from 'firebase/firestore';
import { initializeApp as clientInitializeApp, getApps as clientGetApps } from 'firebase/app';
import { serverLoginConfig } from './server-login.js';
import { parseServiceAccount, normalizeServiceAccount, serviceAccountProblem, projectMismatch } from './service-account.js';
// firebase-admin is OPTIONAL at load time: if it is missing or cannot start, the routes keep working
// through the browser SDK (as before) instead of crashing every API call with "Internal Server Error".
let adminAppMod = null;
let adminFsMod = null;
// Why the server is NOT in admin mode (shown by Account > Run connection check): 'ok' | 'no_credentials' | 'bad_credentials' | 'module_missing' | 'init_failed'
let adminWhy = 'no_credentials';
try {
  adminAppMod = require('firebase-admin/app');
  adminFsMod = require('firebase-admin/firestore');
} catch (e) {
  console.error('[server-firestore] firebase-admin not available, using client SDK fallback:', e.message);
  adminWhy = 'module_missing';
}
const adminGetApps = () => (adminAppMod ? adminAppMod.getApps() : []);
const adminInitializeApp = (...a) => adminAppMod.initializeApp(...a);
const cert = (...a) => adminAppMod.cert(...a);
const adminGetFirestore = (...a) => adminFsMod.getFirestore(...a);
const FieldValue = adminFsMod ? adminFsMod.FieldValue : null;
const AdminTimestamp = adminFsMod ? adminFsMod.Timestamp : null;

// Why the key was refused (plain language), and whether it belongs to another Firebase project: both shown by the connection check.
let adminDetail = '';
let adminMismatch = null;
// Real Google hosting sets one of these; elsewhere (Vercel, a laptop) an explicit key is needed.
const onGoogleHosting = () => !!(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE || process.env.FUNCTION_TARGET || process.env.GAE_ENV || process.env.FIREBASE_CONFIG);

function readServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let account = null;
  if (raw && raw.trim()) {
    account = normalizeServiceAccount(parseServiceAccount(raw));
    if (!account) {
      console.error('[server-firestore] FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be read as a JSON key.');
      adminWhy = 'bad_credentials';
      adminDetail = 'FIREBASE_SERVICE_ACCOUNT_JSON is set but is not a readable JSON key.';
      return null;
    }
  } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    account = normalizeServiceAccount({
      type: 'service_account',
      project_id: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY,
    });
  }
  if (!account) return null;
  const problem = serviceAccountProblem(account);
  if (problem) {
    console.error('[server-firestore] service-account key refused:', problem);
    adminWhy = 'bad_credentials';
    adminDetail = problem;
    return null;
  }
  adminMismatch = projectMismatch(account, process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  if (adminMismatch) console.warn(`[server-firestore] the service-account key is for project "${adminMismatch.key}" but the web app uses "${adminMismatch.app}".`);
  return account;
}

let adminDb = null;
(function initAdmin() {
  if (!adminAppMod || !adminFsMod) return;
  const account = readServiceAccount();
  let credential = null;
  let projectId = '';
  if (account) {
    credential = cert(account);
    projectId = account.project_id;
  } else if (adminWhy === 'no_credentials' && onGoogleHosting() && adminAppMod.applicationDefault) {
    // No key, but we are on Google's own hosting (or GOOGLE_APPLICATION_CREDENTIALS is set): let firebase-admin find the credentials itself.
    credential = adminAppMod.applicationDefault();
    projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '';
    adminDetail = 'Using Google default credentials (no key needed on this host).';
  } else {
    if (adminWhy === 'no_credentials' && !serverLoginConfig()) console.warn('[server-firestore] No service account in the environment (FIREBASE_SERVICE_ACCOUNT_JSON): server writes will be refused by the Firestore rules.');
    return;
  }
  try {
    const app = adminGetApps().length
      ? adminGetApps()[0]
      : adminInitializeApp({ credential, ...(projectId ? { projectId } : {}) });
    adminDb = adminGetFirestore(app);
    adminWhy = 'ok';
    try {
      // The client SDK threw on `undefined` fields; keep routes working unchanged.
      adminDb.settings({ ignoreUndefinedProperties: true });
    } catch {
      /* settings() can only be called once per instance - safe to ignore */
    }
  } catch (e) {
    console.error('[server-firestore] Admin SDK init failed, falling back to client SDK:', e.message);
    adminDb = null;
    adminWhy = 'init_failed';
    adminDetail = String(e?.message || '');
  }
})();

// True whenever the server has FULL database access (service account or server login). Routes use it as "the server can save".
export const isAdminMode = () => !!adminDb || !!LOGIN;
export const adminReason = () => adminWhy;
/** Plain-language detail behind adminReason() (why a key was refused, or that default credentials are used). */
export const adminProblem = () => adminDetail;
/** { key, app } when the service-account key is for a different Firebase project than the web app; otherwise null. */
export const adminProjectMismatch = () => adminMismatch;

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

// ---------------------------------------------------------------------------
// Server login mode (no service account): the real client SDK, signed in as the dedicated server user.
// ---------------------------------------------------------------------------
const LOGIN = adminDb ? null : serverLoginConfig();
const LOGIN_APP = 'autoleads-server';
let loginApp = null;
let loginDb = null;
let loginPromise = null;
let loginError = '';

function loginFirestore() {
  if (loginDb) return loginDb;
  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  };
  loginApp = clientGetApps().find((a) => a.name === LOGIN_APP) || clientInitializeApp(cfg, LOGIN_APP);
  try {
    loginDb = clientFs.initializeFirestore(loginApp, { ignoreUndefinedProperties: true }); // same leniency as admin mode
  } catch {
    loginDb = clientFs.getFirestore(loginApp); // already initialised (hot reload): reuse it
  }
  return loginDb;
}

/** Sign in once per server instance (the SDK keeps the session and refreshes the token itself). A failure is not cached: the next call retries. */
function ensureLogin() {
  if (loginPromise) return loginPromise;
  loginPromise = (async () => {
    loginFirestore();
    const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
    const auth = getAuth(loginApp);
    if (!auth.currentUser) await signInWithEmailAndPassword(auth, LOGIN.email, LOGIN.password);
    loginError = '';
  })().catch((e) => {
    loginPromise = null;
    loginError = String(e?.code || e?.message || e);
    console.error('[server-firestore] server login failed:', loginError);
    throw new Error(`The server could not sign in to Firebase (${loginError}). Check FIREBASE_SERVER_EMAIL / FIREBASE_SERVER_PASSWORD and that Email/Password sign-in is enabled.`);
  });
  return loginPromise;
}
const signedIn = (fn) => async (...a) => { await ensureLogin(); return fn(...a); };
const LOGIN_OPS = LOGIN ? {
  getDoc: signedIn(clientFs.getDoc), getDocs: signedIn(clientFs.getDocs), addDoc: signedIn(clientFs.addDoc),
  setDoc: signedIn(clientFs.setDoc), updateDoc: signedIn(clientFs.updateDoc), deleteDoc: signedIn(clientFs.deleteDoc),
} : {};

/** 'admin' (service account) | 'login' (server user, no key) | 'none' (plain client SDK: the Firestore rules will refuse server writes). */
export const serverMode = () => (adminDb ? 'admin' : LOGIN ? 'login' : 'none');
export const serverLoginProblem = () => loginError;

const pick = (name) => (adminDb ? A[name] : LOGIN && LOGIN_OPS[name] ? LOGIN_OPS[name] : clientFs[name]);

export const getFirestore = (app) => (adminDb ? A.getFirestore() : LOGIN ? loginFirestore() : clientFs.getFirestore(app));
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
