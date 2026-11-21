"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

// One tap from a public page straight into the sample business — the
// lowest-friction way to let a visitor see the product before deciding to
// request a trial. It signs in to the shared demo business with a one-time
// token from the server (lib/demoServer.ts — no shared password) as a short-lived, this-tab-only session (it ends when
// the tab closes, or after DEMO_SESSION_MINUTES, and lands back on the
// landing page — see AuthContext.signInDemo); AppShell then redirects a signed-in user off the
// marketing page to their dashboard, so there is nothing to navigate here.
//
// The caller passes the styling (className) so the same button can be the
// amber hero CTA on the landing page, a ghost button on the login page, or a
// plain text link in the header, without this file knowing about any of them.
//
// If the sign-in fails (demo not set up, rate limited, offline) the
// button turns into a link to the free-trial form rather than leaving a dead
// end — the visitor is never stuck on an error.
export default function TryDemoButton({
  className = "",
  label = "Try it now — no signup",
  busyLabel = "Opening the sample shop…",
  fallbackLabel = "Demo unavailable — request a free trial →",
}: {
  className?: string;
  label?: string;
  busyLabel?: string;
  fallbackLabel?: string;
}) {
  const { signInDemo } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleClick() {
    if (failed) {
      router.push("/request-trial");
      return;
    }
    setBusy(true);
    try {
      await signInDemo();
      // Success: stay in the busy state while AppShell redirects to the
      // dashboard. The timeout is only a safety net so the button can't stay
      // stuck if that redirect never happens.
      setTimeout(() => setBusy(false), 10000);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={`${className} disabled:cursor-wait disabled:opacity-70`}
      >
        {busy ? busyLabel : failed ? fallbackLabel : label}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {failed ? "The demo is unavailable right now. You can request a free trial instead." : ""}
      </span>
    </>
  );
}
