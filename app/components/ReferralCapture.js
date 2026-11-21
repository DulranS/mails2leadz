"use client";
// Pass 348: a company that arrives with ?ref=CODE is linked to that partner once it is signed in. The code is kept on this device until
// the server accepts it (or refuses it for good). It is removed from the address bar either way.
import { useEffect } from "react";
import { useAuthUser } from "./AuthProvider";

const KEY = "al_partner_ref";

export default function ReferralCapture() {
  const { user, ready } = useAuthUser();

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const fromUrl = url.searchParams.get("ref");
      if (!fromUrl) return;
      localStorage.setItem(KEY, fromUrl.slice(0, 20));
      url.searchParams.delete("ref");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch { /* private mode or no storage: the link simply has no effect */ }
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    let code = "";
    try { code = localStorage.getItem(KEY) || ""; } catch { return; }
    if (!code) return;
    fetch("/api/partners/referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, email: user.email || "" }),
    })
      .then((r) => {
        // 200: linked (or already had a partner). 400: the code is not usable, so stop asking. Anything else (401, 5xx) is kept and retried.
        if (r.status === 200 || r.status === 400) { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
      })
      .catch(() => { /* network: kept for the next visit */ });
  }, [ready, user]);

  return null;
}
