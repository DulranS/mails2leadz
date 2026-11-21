"use client";

// Where the "Confirm your email" link lands (see lib/email.ts sendTrialConfirmation and
// app/api/trial-requests/verify/route.ts). It confirms by POSTing the token from the browser rather
// than by the link itself doing anything, so a mail scanner that only fetches the URL can't confirm
// an address on someone's behalf. The token is read once, then removed from the address bar.

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TRIAL_DAYS } from "@/lib/pricing";

type State =
  | { kind: "working" }
  | { kind: "confirmed" }
  | { kind: "activated" }
  | { kind: "has_account" }
  | { kind: "failed"; message: string };

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get("t") ?? "";
  const [state, setState] = useState<State>({ kind: "working" });
  // React strict mode runs effects twice in development; one confirmation is all there should be.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState({ kind: "failed", message: "This confirmation link is incomplete. Please use the link from your email." });
      return;
    }
    // Don't leave the token sitting in the address bar / history.
    window.history.replaceState(null, "", "/verify-trial");
    (async () => {
      try {
        const res = await fetch("/api/trial-requests/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ t: token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState({ kind: "failed", message: data.error || "Something went wrong. Please try the link again in a moment." });
          return;
        }
        setState({ kind: data.state === "activated" ? "activated" : data.state === "has_account" ? "has_account" : "confirmed" });
      } catch {
        setState({ kind: "failed", message: "We couldn't reach the server. Check your connection and open the link again." });
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block py-2 font-display text-2xl font-bold tracking-tight">
            Balancr
          </Link>
        </div>
        <div className="bg-panel border border-line rounded-lg p-6 text-sm text-fg leading-relaxed text-center" role="status">
          {state.kind === "working" && <p className="text-muted">Confirming your email…</p>}

          {state.kind === "confirmed" && (
            <>
              <p className="text-good font-medium">Email confirmed.</p>
              <p className="mt-3">Your trial request is in. A real person reads it, usually within one working day.</p>
              <ol className="text-left text-xs text-muted mt-5 space-y-2 list-decimal pl-5">
                <li>We create your account and email you a link to choose your password.</li>
                <li>You have {TRIAL_DAYS} days with the whole product. No card, nothing to cancel.</li>
              </ol>
            </>
          )}

          {state.kind === "activated" && (
            <>
              <p className="text-good font-medium">Email confirmed — your account is ready.</p>
              <p className="mt-3">We&apos;ve emailed you a link to choose your password. It should arrive within a minute — check spam if you don&apos;t see it.</p>
              <ol className="text-left text-xs text-muted mt-5 space-y-2 list-decimal pl-5">
                <li>Open the email and choose your password. The link stays valid for a week.</li>
                <li>Sign in and add your first products or customers.</li>
                <li>You have {TRIAL_DAYS} days with the whole product. No card, nothing to cancel.</li>
              </ol>
            </>
          )}

          {state.kind === "has_account" && (
            <>
              <p className="font-medium">You already have a Balancr account.</p>
              <p className="mt-3 text-muted">Nothing new to set up — sign in, or use “Forgot password” on the sign-in page.</p>
              <Link href="/login" className="inline-block mt-4 text-fg underline underline-offset-2">
                Go to sign in
              </Link>
            </>
          )}

          {state.kind === "failed" && (
            <>
              <p className="text-bad">{state.message}</p>
              <Link href="/request-trial" className="inline-block mt-4 text-fg underline underline-offset-2">
                Request a trial again
              </Link>
            </>
          )}

          {state.kind !== "working" && (
            <Link href="/" className="block mt-4 text-xs text-muted hover:text-fg">
              ← Back to Balancr
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyTrialPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <VerifyInner />
    </Suspense>
  );
}
