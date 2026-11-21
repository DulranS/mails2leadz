"use client";

// A customer's page for one invoice, opened from the link the business sends. No sign-in. It shows what is owed, what has been
// paid and how to pay. "I've paid" records a CLAIM only: the business checks its bank and records the payment itself. Nothing on
// this page takes money or changes the books.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatMoney, todayIso } from "@/lib/format";

interface InvoiceView {
  businessName: string;
  currency: string;
  ref: string;
  date: string;
  dueDate: string | null;
  customer: string | null;
  lines: { name: string; qty: number; unitPrice: number; amount: number }[];
  isCredit: boolean;
  gross: number;
  adjustments: number;
  net: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  status: "paid" | "overdue" | "outstanding";
  payments: { date: string; amount: number }[];
  paymentInstructions: string | null;
  onlinePaymentAvailable: boolean;
}

export default function CustomerInvoicePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [view, setView] = useState<InvoiceView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/invoices/public?t=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setLoadError(data.error || "Couldn't load this invoice.");
        else {
          setView(data as InvoiceView);
          setAmount(String((data as InvoiceView).balance ?? ""));
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load this invoice. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Starts a PayHere card payment: the server builds the signed fields, and the browser posts them to PayHere.
  async function payByCard() {
    setPaying(true);
    setPayError(null);
    try {
      const res = await fetch("/api/payments/payhere/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, amount: Number(amount) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't start the card payment.");
      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.url;
      for (const [name, value] of Object.entries(data.fields as Record<string, string>)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Couldn't start the card payment.");
      setPaying(false);
    }
  }

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setClaimError(null);
    try {
      const res = await fetch("/api/invoices/public", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, amount: Number(amount), paidOn, reference, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setClaimError(data.error || "Couldn't send your message. Try again.");
      else setSent(true);
    } catch {
      setClaimError("Couldn't send your message. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Invoice unavailable</h1>
        <p className="text-sm text-muted mt-2">{loadError}</p>
      </Shell>
    );
  }
  if (!view) {
    return (
      <Shell>
        <p className="text-sm text-muted">Loading your invoice…</p>
      </Shell>
    );
  }

  const currency = view.currency;
  const owed = view.isCredit && view.balance > 0.005;
  const business = view.businessName || "the business";

  return (
    <Shell>
      <div className="text-xs uppercase tracking-wider text-muted">Invoice from</div>
      <h1 className="text-xl font-semibold">{view.businessName || "Your invoice"}</h1>
      <div className="text-sm text-muted mt-1">
        {view.ref} · dated <span className="num">{view.date}</span>
        {view.dueDate && (
          <>
            {" "}· due <span className="num">{view.dueDate}</span>
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
          {view.adjustments !== 0 && (
            <div className="flex justify-between">
              <span className="text-muted">Discounts and returns</span>
              <span className="num">{formatMoney(view.adjustments, currency)}</span>
            </div>
          )}
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
          {view.payments.map((p, i) => (
            <div key={i} className="flex justify-between text-muted">
              <span>
                Paid <span className="num">{p.date}</span>
              </span>
              <span className="num">−{formatMoney(p.amount, currency)}</span>
            </div>
          ))}
          {view.isCredit && (
            <div className="flex justify-between font-semibold pt-1 border-t border-line">
              <span>{owed ? "Balance due" : "Balance"}</span>
              <span className="num">{formatMoney(view.balance, currency)}</span>
            </div>
          )}
        </div>
      </div>

      {!view.isCredit && <p className="text-sm mt-4 text-muted">This sale was paid when it was made. Nothing is owed.</p>}
      {view.isCredit && !owed && <p className="text-sm mt-4 text-good">This invoice is paid in full. Thank you, {business}.</p>}
      {view.status === "overdue" && owed && <p className="text-sm mt-4 text-bad">This invoice is past its due date.</p>}

      {owed && view.paymentInstructions && (
        <div className="mt-5 rounded-lg border border-line bg-panel px-3 py-3">
          <div className="text-xs uppercase tracking-wider text-muted mb-1">How to pay</div>
          <div className="text-sm whitespace-pre-line">{view.paymentInstructions}</div>
        </div>
      )}
      {owed && !view.paymentInstructions && (
        <p className="text-sm mt-5 text-muted">Ask {business} how to pay this invoice.</p>
      )}

      {owed && view.onlinePaymentAvailable && (
        <div className="mt-6 rounded-lg border border-line bg-panel px-3 py-3">
          <div className="text-sm font-medium">Pay by card</div>
          <div className="text-xs text-muted mb-2">
            Paid securely through PayHere, into the account of {business}. Balancr never sees or holds your card details. The amount above is what will be charged.
          </div>
          <button type="button" onClick={payByCard} disabled={paying} className="rounded-md bg-good px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50">
            {paying ? "Opening PayHere…" : "Pay by card"}
          </button>
          {payError && <p className="text-sm text-bad mt-2">{payError}</p>}
          <p className="text-xs text-muted mt-2">If the balance has not changed after you pay, wait a minute and reload this page.</p>
        </div>
      )}
      {owed && (
        <div className="mt-6">
          {sent ? (
            <div className="rounded-md border border-line bg-panel px-3 py-2.5 text-sm text-good">
              Thank you. {business} has your message. They check their bank and confirm the payment with you; this page is not updated until they do.
            </div>
          ) : (
            <form onSubmit={claim} className="space-y-3">
              <div className="text-sm font-medium">I have paid this invoice</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-muted">Amount paid</span>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={view.balance + 0.5}
                    className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm num"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-muted">Date paid</span>
                  <input
                    required
                    type="date"
                    className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm num"
                    value={paidOn}
                    onChange={(e) => setPaidOn(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-muted">Bank reference or receipt no. (optional)</span>
                  <input
                    maxLength={120}
                    className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-muted">Your full name</span>
                  <input
                    required
                    minLength={2}
                    maxLength={120}
                    autoComplete="name"
                    className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              </div>
              {claimError && <p className="text-sm text-bad">{claimError}</p>}
              <button type="submit" disabled={busy} className="rounded-md bg-good px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50">
                {busy ? "Sending…" : "Send payment details"}
              </button>
              <p className="text-xs text-muted">
                This sends your details to {business} to check. It is not a payment and does not change this invoice. Balancr takes no money.
              </p>
            </form>
          )}
        </div>
      )}
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
