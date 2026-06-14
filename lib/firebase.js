// lib/firebase.js
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// Check if Firebase is configured
const isFirebaseConfigured = firebaseConfig.apiKey &&
                            firebaseConfig.authDomain &&
                            firebaseConfig.projectId &&
                            firebaseConfig.appId;

let app, auth, db, googleProvider;

if (isFirebaseConfigured) {
  try {
    // Initialize Firebase app (only once)
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

    // Initialize Firebase services
    auth = getAuth(app);
    if (typeof window !== 'undefined') {
      auth.setPersistence(browserLocalPersistence).catch((error) => {
        console.error('Firebase auth persistence error:', error);
      });
    }
    db = getFirestore(app);

    // Configure Google provider
    googleProvider = new GoogleAuthProvider();
    googleProvider.addScope('https://www.googleapis.com/auth/gmail.send');
    googleProvider.addScope('email');
    googleProvider.addScope('profile');
  } catch (error) {
    console.error('Firebase initialization error:', error);
    app = null;
    auth = null;
    db = null;
    googleProvider = null;
  }
} else {
  console.warn('Firebase not configured: Missing required environment variables');
  app = null;
  auth = null;
  db = null;
  googleProvider = null;
}

export { auth, db, googleProvider };
export default app;