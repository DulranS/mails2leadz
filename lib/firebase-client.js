// lib/firebase-client.js - one safe browser-side Firebase init for pages.
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, browserLocalPersistence } from 'firebase/auth';

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app = null, db = null, auth = null;
try {
  if (cfg.apiKey && cfg.projectId) {
    app = !getApps().length ? initializeApp(cfg) : getApp();
    db = getFirestore(app);
    auth = getAuth(app);
    if (typeof window !== 'undefined') auth.setPersistence(browserLocalPersistence).catch(() => {});
  }
} catch (e) {
  console.error('Firebase init error:', e);
}
export { app, db, auth };
