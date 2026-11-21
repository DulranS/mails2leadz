"use client";

// A customer's page for one quote, opened from the link the business sends. No sign-in. It shows the quote and records
// an accept or a decline. Accepting records the customer's answer; it is not a legal e-signature, and the business still
// confirms the order before any stock is committed. The server (app/api/quotes/public) decides every rule; this page only
// shows what it returns.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatMoney } from "@/lib/format";

interface QuoteLine {
  name: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

interface QuoteView {
  businessName: string;
  currency: string;
  ref: string;
  date: string;
  validUntil: string | null;
  customer: string | null;
  notes: string | null;
  lines: QuoteLine[];
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  decidedAs: "accepted" | "declined" | null;
  block: string | null;
  blockMessage: string | null;
}

export default function CustomerQuotePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [view, setView] = useState<QuoteView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<"accepted" | "declined" | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/quotes/public?t=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setLoadError(data.error || "Couldn't load this quote.");
        else setView(data as QuoteView);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load this quote. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function respond(decision: "accept" | "decline") {
    if (decision === "decline" && !window.confirm("Decline this quote? The business will see that you have declined it.")) return;
    setBusy(true);
    setAnswerError(null);
    try {
      const res = await fetch("/api/quotes/public", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, decision, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAnswerError(data.error || "Couldn't record your answer. Try again.");
      } else {
        setAnswer(decision === "accept" ? "accepted" : "declined");
      }
    } catch {
      setAnswerError("Couldn't record your answer. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Quote unavailable</h1>
        <p className="text-sm text-muted mt-2">{loadError}</p>
      </Shell>
    );
  }
  if (!view) {
    return (
      <Shell>
        <p className="text-sm text-muted">Loading your quote…</p>
      </Shell>
    );
  }

  const currency = view.currency;
  const done = answer ?? view.decidedAs;
  const canAnswer = !view.block && !done;

  return (
    <Shell>
      <div className="text-xs uppercase tracking-wider text-muted">Quote from</div>
      <h1 className="text-xl font-semibold">{view.businessName || "Your quote"}</h1>
      <div className="text-sm text-muted mt-1">
        {view.ref} · issued <span className="num">{view.date}</span>
        {view.validUntil && (
          <>
            {" "}· valid until <span className="num">{view.validUntil}</span>
          </>
        )}
      </div>
      {view.customer && <div className="text-sm mt-2">For {view.customer}</div>}

      <div className="mt-5 rounded-lg border border-line overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
              <th className="py-2 px-3 font-medium">Item</th>
              <th className="py-2 px-3 font-medium text-right">Qty</th>
              <th className="py-2 px-3 font-medium text-right">Price</th>
              <th className="py-2 px-3 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {view.lines.map((l, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="py-2 px-3">{l.name}</td>
                <td className="py-2 px-3 text-right num">{l.qty}</td>
                <td className="py-2 px-3 text-right num">{formatMoney(l.unitPrice, currency)}</td>
                <td className="py-2 px-3 text-right num">{formatMoney(l.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2.5 space-y-1 text-sm bg-panel2">
          <div className="flex justify-between">
            <span className="text-muted">Subtotal</span>
            <span className="num">{formatMoney(view.subtotal, currency)}</span>
          </div>
          {view.tax > 0 && (
            <div className="flex justify-between">
              <span className="text-muted">Tax</span>
              <span className="num">{formatMoney(view.tax, currency)}</span>
            </div>
          )}
          <div className="flex justify-between font-medium pt-1 border-t border-line">
            <span>Total</span>
            <span className="num">{formatMoney(view.total, currency)}</span>
          </div>
        </div>
      </div>

      {view.notes && <p className="text-sm mt-4 whitespace-pre-line">{view.notes}</p>}

      <div className="mt-6">
        {done === "accepted" && (
          <Notice tone="good">Thank you. {view.businessName || "The business"} has your acceptance and will confirm the order with you.</Notice>
        )}
        {done === "declined" && <Notice tone="muted">You have declined this quote. {view.businessName || "The business"} has been told.</Notice>}
        {!done && view.block && <Notice tone="muted">{view.blockMessage}</Notice>}

        {canAnswer && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm text-muted">Your full name (to accept)</span>
              <input
                className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                autoComplete="name"
              />
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                disabled={busy || name.trim().length < 2}
                onClick={() => respond("accept")}
                className="rounded-md bg-good px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50"
              >
                {busy ? "Sending…" : "Accept quote"}
              </button>
              <button type="button" disabled={busy} onClick={() => respond("decline")} className="rounded-md border border-line px-4 py-2.5 text-sm disabled:opacity-50">
                Decline
              </button>
            </div>
            {answerError && <p className="text-sm text-bad">{answerError}</p>}
            <p className="text-xs text-muted">
              Accepting records your answer to this quote. It is not an electronic signature, and nothing is charged or ordered until{" "}
              {view.businessName || "the business"} confirms with you.
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">{children}</div>
    </main>
  );
}

function Notice({ tone, children }: { tone: "good" | "muted"; children: React.ReactNode }) {
  return <div className={`rounded-md border border-line bg-panel px-3 py-2.5 text-sm ${tone === "good" ? "text-good" : "text-muted"}`}>{children}</div>;
}
