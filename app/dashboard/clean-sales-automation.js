'use client';

import { useState, useEffect, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import Head from 'next/head';
import { useRouter } from 'next/navigation';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

export default function CleanSalesAutomation() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const router = useRouter();

  // Authentication handlers
  const signIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Sign in error:', error);
    }
  };

  const signOutUser = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoadingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  // Loading state
  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Not signed in
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-white text-3xl font-bold mb-8">Sales Automation System</h1>
          <p className="text-gray-300 mb-8">Please sign in to continue</p>
          <button
            onClick={signIn}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium transition-colors"
          >
            Sign In with Google
          </button>
        </div>
      </div>
    );
  }

  // Main dashboard
  return (
    <>
      <Head>
        <title>Sales Automation Dashboard</title>
      </Head>
      
      <div className="min-h-screen bg-gray-900">
        <div className="container mx-auto p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-white text-3xl font-bold">Sales Automation Dashboard</h1>
              <p className="text-gray-400 mt-2">Welcome back, {user.displayName}</p>
            </div>
            <button
              onClick={signOutUser}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Sign Out
            </button>
          </div>

          {/* Main Content */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Stats Cards */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-white text-lg font-semibold mb-2">Total Leads</h3>
              <p className="text-3xl font-bold text-blue-400">0</p>
              <p className="text-gray-400 text-sm mt-2">Leads in system</p>
            </div>

            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-white text-lg font-semibold mb-2">Emails Sent</h3>
              <p className="text-3xl font-bold text-green-400">0</p>
              <p className="text-gray-400 text-sm mt-2">Campaign emails</p>
            </div>

            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-white text-lg font-semibold mb-2">Reply Rate</h3>
              <p className="text-3xl font-bold text-yellow-400">0%</p>
              <p className="text-gray-400 text-sm mt-2">Response rate</p>
            </div>

            {/* Quick Actions */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 lg:col-span-3">
              <h3 className="text-white text-lg font-semibold mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-medium transition-colors">
                  Import CSV
                </button>
                <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors">
                  Start Campaign
                </button>
                <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-lg font-medium transition-colors">
                  View Reports
                </button>
              </div>
            </div>

            {/* System Status */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 lg:col-span-3">
              <h3 className="text-white text-lg font-semibold mb-4">System Status</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Authentication</span>
                  <span className="text-green-400 font-medium">Connected</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Database</span>
                  <span className="text-green-400 font-medium">Ready</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Email Service</span>
                  <span className="text-green-400 font-medium">Active</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notice about browser extensions */}
          <div className="mt-8 bg-yellow-900 bg-opacity-30 border border-yellow-700 rounded-lg p-4">
            <p className="text-yellow-300 text-sm">
              <strong>Note:</strong> You may see browser extension errors in the console (like TronWeb, bybit, etc.). 
              These are from your browser extensions and do not affect the application functionality.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
