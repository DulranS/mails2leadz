'use client';
// ONE sign-in listener for the whole app. Before, every page started its own onAuthStateChanged, so each navigation began with
// "who is signed in?" (a spinner, an empty avatar) and only then started loading data. Now the answer is already there when a
// page opens. Signing out or switching accounts empties the shared data cache so one person's data is never shown to another.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase-client.js';
import { clearAll } from '../../lib/swr-cache.js';
import { acceptInvite, asWorkspaceUser, fetchWorkspace, forgetWorkspace, ownWorkspace, pendingInvite, peekWorkspace } from '../../lib/workspace-client.js';

const AuthContext = createContext({ user: null, ready: false, workspace: null });

// The person's real account plus, when they were invited to someone else's workspace, the workspace they work in (decided by the
// server). `user` is what pages should use: inside a shared workspace its uid is the owner's, so all data loads from there.
const build = (raw, ws) => (raw ? { user: asWorkspaceUser(raw, ws), raw, workspace: ws, ready: true } : { user: null, raw: null, workspace: null, ready: true });

export function AuthProvider({ children }) {
  // A signed-in user is already known at first render (no waiting); otherwise "ready" turns true when Firebase answers (signed out or restored).
  const [state, setState] = useState(() => {
    const u = auth?.currentUser || null;
    if (!u) return { user: null, raw: null, workspace: null, ready: !auth };
    return build(u, peekWorkspace(u.uid) || ownWorkspace(u.uid));
  });

  useEffect(() => {
    if (!auth) { setState({ user: null, raw: null, workspace: null, ready: true }); return undefined; }
    let lastUid = auth.currentUser?.uid || null;
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, (u) => {
      const uid = u?.uid || null;
      const prevUid = lastUid;
      if (uid !== lastUid) { clearAll(); lastUid = uid; } // another account (or signed out): forget everything cached
      if (!u) { if (prevUid) forgetWorkspace(prevUid); setState((prev) => (prev.ready && !prev.raw ? prev : build(null, null))); return; }
      const known = peekWorkspace(uid) || ownWorkspace(uid);
      // Keep the same state object while nothing changed, so pages are not re-rendered by token refreshes.
      setState((prev) => (prev.ready && prev.raw && prev.raw.uid === uid && prev.workspace?.ownerUid === known.ownerUid && prev.workspace?.role === known.role ? prev : build(u, known)));
      // Ask the server (the authority) in the background. If it disagrees with what was remembered (just invited, or removed),
      // switch workspaces and forget the cached data so nothing from the other workspace stays on screen.
      const check = () => fetchWorkspace(uid).then((ws) => {
        if (cancelled || !ws) return;
        if (ws.ownerUid !== known.ownerUid || ws.role !== known.role) {
          clearAll();
          setState(build(u, ws));
        }
      });
      // Someone opened an invite link while signed out: finish joining now that they are signed in, then open the shared workspace.
      const invite = pendingInvite();
      if (invite) {
        acceptInvite(uid, invite).then((r) => {
          if (cancelled) return;
          if (r.ok && typeof window !== 'undefined') { clearAll(); window.location.assign('/business'); } else check();
        });
      } else check();
    });
    return () => { cancelled = true; unsub(); };
  }, []);

  const value = useMemo(() => state, [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** { user, ready, workspace, raw }: ready = Firebase has answered at least once (user may still be null = signed out).
 *  user = the workspace to work in (a team member sees the owner's uid); raw = the real signed-in account; workspace = { ownerUid, role, isOwner }. */
export function useAuthUser() {
  return useContext(AuthContext);
}
