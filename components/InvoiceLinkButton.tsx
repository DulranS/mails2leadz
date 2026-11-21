"use client";

// Owner or manager: copies a customer link to one invoice. Creating the link changes no sale, payment or balance.
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";

export default function InvoiceLinkButton({ invoiceKey, className }: { invoiceKey: string; className?: string }) {
  const { user, businessId, role } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (role !== "owner" && role !== "manager") return null;
  return (
    <button
      type="button"
      className={className ?? "text-xs text-amber-soft font-medium disabled:opacity-50"}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          if (!user) throw new Error("Sign in again to create a link.");
          const idToken = await user.getIdToken();
          const res = await fetch("/api/invoices/link", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${idToken}`,
              ...(businessId ? { [BUSINESS_ID_HEADER]: businessId } : {}),
            },
            body: JSON.stringify({ key: invoiceKey }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Couldn't create the link.");
          try {
            await navigator.clipboard.writeText(String(data.url));
            toast.success("Customer link copied", `Valid for ${data.validDays} days. Send it with the amount due.`);
          } catch {
            toast.success("Customer link ready", String(data.url));
          }
        } catch (err) {
          toast.error("Couldn't create the link", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Creating…" : "Customer link"}
    </button>
  );
}
