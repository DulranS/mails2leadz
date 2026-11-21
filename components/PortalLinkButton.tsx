"use client";

// Makes the link a customer (their account) or a supplier (their open orders) gets, and shows it to copy. The owner or manager sends
// it by WhatsApp or email themselves; nothing is sent by Balancr.
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";
import { Button } from "@/components/ui";

export default function PortalLinkButton({ kind, id, label }: { kind: "customer" | "supplier"; id: string; label: string }) {
  const { user, businessId } = useAuth();
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function make() {
    setBusy(true);
    try {
      if (!user) throw new Error("Sign in again to make a link.");
      const idToken = await user.getIdToken();
      const res = await fetch("/api/portal/link", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, ...(businessId ? { [BUSINESS_ID_HEADER]: businessId } : {}) },
        body: JSON.stringify({ kind, id }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string; validDays?: number };
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't make the link. Try again.");
      setUrl(data.url);
      toast.success("Link ready", `Valid for ${data.validDays ?? 60} days. Copy it and send it yourself.`);
    } catch (err) {
      toast.error("Couldn't make the link", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (url) {
    return (
      <span className="flex items-center gap-2 text-xs">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="w-48 rounded border border-line bg-panel px-2 py-1" />
        <button
          onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true))}
          className="text-amber-soft hover:underline min-h-[32px]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </span>
    );
  }
  return (
    <Button variant="ghost" onClick={make} disabled={busy}>
      {busy ? "Making…" : label}
    </Button>
  );
}
