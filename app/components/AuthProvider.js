'use client';
// ONE sign-in listener for the whole app. Before, every page started its own onAuthStateChanged, so each navigation began with
// "who is signed in?" (a spinner, an empty avatar) and only then started loading data. Now the answer is already there when a
// page opens. Signing out or switching accounts empties the shared data cache so one person's data is never shown to another.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase-client.js';
import { clearAll } from '../../lib/swr-cache.js';

const AuthContext = createContext({ user: null, ready: false });

export function AuthProvider({ children }) {
  // A signed-in user is already known at first render (no waiting); otherwise "ready" turns true when Firebase answers (signed out or restored).
  const [state, setState] = useState(() => ({ user: auth?.currentUser || null, ready: !auth || !!auth.currentUser }));

  useEffect(() => {
    if (!auth) { setState({ user: null, ready: true }); return undefined; }
    let lastUid = auth.currentUser?.uid || null;
    return onAuthStateChanged(auth, (u) => {
      const uid = u?.uid || null;
      if (uid !== lastUid) { clearAll(); lastUid = uid; } // another account (or signed out): forget everything cached
      // Keep the same state object while nothing changed, so pages are not re-rendered by token refreshes.
      setState((prev) => (prev.ready && (prev.user?.uid || null) === uid ? prev : { user: u, ready: true }));
    });
  }, []);

  const value = useMemo(() => state, [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** { user, ready }: ready = Firebase has answered at least once (user may still be null = signed out). */
export function useAuthUser() {
  return useContext(AuthContext);
}
