"use client";
// Opened from a team invite link: /join?token=... Signed in: joins the workspace. Signed out: remembers the invite, sends the person
// to sign in, and the join finishes by itself right after.
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuthUser } from "../components/AuthProvider";
import { clearAll } from "../../lib/swr-cache.js";
import { acceptInvite, rememberInvite } from "../../lib/workspace-client.js";

const card = "max-w-md mx-auto mt-16 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6";

export default function JoinPage() {
  const { raw, ready } = useAuthUser();
  const [state, setState] = useState({ phase: "start", error: "" });
  const tokenRef = useRef("");
  const started = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    tokenRef.current = new URLSearchParams(window.location.search).get("token") || "";
    if (!tokenRef.current) setState({ phase: "bad", error: "This invite link is incomplete. Ask for a new one." });
  }, []);

  useEffect(() => {
    if (!ready || started.current || !tokenRef.current) return;
    if (!raw) { rememberInvite(tokenRef.current); setState({ phase: "signin", error: "" }); return; }
    started.current = true;
    setState({ phase: "joining", error: "" });
    acceptInvite(raw.uid, tokenRef.current).then((r) => {
      if (r.ok) { clearAll(); window.location.assign("/business"); }
      else setState({ phase: "bad", error: r.error });
    });
  }, [ready, raw]);

  return (
    <main className={card}>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Join a workspace</h1>
      {state.phase === "joining" && <p className="text-sm text-gray-700 dark:text-gray-200">Joining…</p>}
      {state.phase === "signin" && (
        <>
          <p className="text-sm text-gray-700 dark:text-gray-200 mb-4">Sign in with your own account (use the email address the invite was sent to). You will join the workspace as soon as you are signed in.</p>
          <Link href="/" className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium">Sign in</Link>
        </>
      )}
      {state.phase === "bad" && (
        <>
          <p role="alert" className="text-sm text-red-600 dark:text-red-300 mb-4">{state.error}</p>
          <Link href="/business" className="text-sm text-blue-600 dark:text-blue-400 underline">Go to your own workspace</Link>
        </>
      )}
    </main>
  );
}
