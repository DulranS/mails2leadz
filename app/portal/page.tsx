"use client";

// A customer's account page: every invoice they have with the business, what is paid, and what is still owed, each with a link
// to its invoice. Opened from the signed account link the business sends. No sign-in. Shows nothing but the customer's own invoices.
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";

interface Row {
  key: string;
  reference: string;
  issuedOn: string;
  total: number;
  paid: number;
  balance: number;
  status: "paid" | "overdue" | "outstanding";
  dueDate: string | null;
  link?: string;
}
interface View {
  businessName: string;
  currency: string;
  customerName: string;
  invoices: Row[];
  owed: number;
  overdue: number;
}

const STATUS = { paid: "Paid", overdue: "Overdue", outstanding: "Due" } as const;

export default function CustomerAccountPage() {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t") ?? "";
    fetch(`/api/portal?t=${encodeURIComponent(t)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "This link is not valid.");
        setView(data as View);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <Shell><p className="text-sm">{error}</p></Shell>;
  if (!view) return <Shell><p className="text-sm text-muted">Loading your account…</p></Shell>;

  return (
    <Shell>
      <div className="text-xs text-muted">{view.businessName}</div>
      <h1 className="text-xl font-semibold mt-1">{view.customerName ? `${view.customerName}, your account` : "Your account"}</h1>
      <div className="mt-4 rounded-md border border-line p-4">
        <div className="text-xs text-muted">Still owed</div>
        <div className="text-2xl font-semibold num">{formatMoney(view.owed, view.currency)}</div>
        {view.overdue > 0 && <div className="text-xs text-bad mt-1">{formatMoney(view.overdue, view.currency)} of it is overdue.</div>}
      </div>
      {view.invoices.length === 0 ? (
        <p className="text-sm text-muted mt-6">There are no invoices on this account yet.</p>
      ) : (
        <div className="mt-6 space-y-2">
          {view.invoices.map((r) => (
            <div key={r.key} className="rounded-md border border-line p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {r.reference} <span className="text-xs text-muted font-normal">· {r.issuedOn}</span>
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {STATUS[r.status]}
                  {r.dueDate && r.balance > 0 ? ` · due ${r.dueDate}` : ""} · paid {formatMoney(r.paid, view.currency)} of {formatMoney(r.total, view.currency)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="num text-sm font-medium">{formatMoney(r.balance, view.currency)}</span>
                {r.link && (
                  <a href={r.link} className="text-xs text-amber-soft hover:underline min-h-[32px] flex items-center">
                    View invoice
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted mt-8">This page shows only what is invoiced to you. To ask about anything on it, contact {view.businessName || "the business"} directly.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>;
}
