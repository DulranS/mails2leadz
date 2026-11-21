"use client";

// A supplier's order page: the orders this business has open with them, and a place to confirm the day each one will be delivered.
// No sign-in; the signed supplier link is the only credential. Confirming records the supplier's date and leaves the expected date
// the business set unchanged.
import { useEffect, useState } from "react";

interface Order {
  id: string;
  product: string;
  qtyOrdered: number;
  orderDate: string;
  expectedDate: string | null;
  status: "ordered" | "in_transit";
  confirmedDate: string | null;
}
interface View {
  businessName: string;
  supplierName: string;
  orders: Order[];
}

export default function SupplierOrdersPage() {
  const [token, setToken] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, { date: string; note: string }>>({});
  const [message, setMessage] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t") ?? "";
    setToken(t);
    fetch(`/api/supplier?t=${encodeURIComponent(t)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "This link is not valid.");
        setView(data as View);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function confirm(o: Order) {
    const p = picked[o.id];
    if (!p?.date) {
      setMessage({ id: o.id, text: "Choose the day it will be delivered.", ok: false });
      return;
    }
    setBusy(o.id);
    setMessage(null);
    try {
      const res = await fetch("/api/supplier/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, orderId: o.id, confirmedDate: p.date, note: p.note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't record that.");
      setView((v) => (v ? { ...v, orders: v.orders.map((x) => (x.id === o.id ? { ...x, confirmedDate: p.date } : x)) } : v));
      setMessage({ id: o.id, text: `Thank you. Delivery confirmed for ${p.date}.`, ok: true });
    } catch (err) {
      setMessage({ id: o.id, text: (err as Error).message, ok: false });
    } finally {
      setBusy(null);
    }
  }

  if (error) return <Shell><p className="text-sm">{error}</p></Shell>;
  if (!view) return <Shell><p className="text-sm text-muted">Loading your orders…</p></Shell>;

  return (
    <Shell>
      <div className="text-xs text-muted">{view.businessName}</div>
      <h1 className="text-xl font-semibold mt-1">Open orders for {view.supplierName}</h1>
      {view.orders.length === 0 ? (
        <p className="text-sm text-muted mt-6">There are no open orders for you right now.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {view.orders.map((o) => (
            <div key={o.id} className="rounded-md border border-line p-3.5">
              <div className="text-sm font-medium">
                {o.product} <span className="text-muted font-normal">· {o.qtyOrdered} units</span>
              </div>
              <div className="text-xs text-muted mt-1">
                Ordered {o.orderDate}
                {o.expectedDate ? ` · expected ${o.expectedDate}` : ""} · {o.status === "in_transit" ? "on its way" : "ordered"}
              </div>
              {o.confirmedDate ? (
                <div className="text-xs text-good mt-2">You confirmed delivery for {o.confirmedDate}.</div>
              ) : (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-2 items-end">
                  <label className="text-xs text-muted">
                    Delivery day
                    <input
                      type="date"
                      min={o.orderDate}
                      value={picked[o.id]?.date ?? ""}
                      onChange={(e) => setPicked({ ...picked, [o.id]: { date: e.target.value, note: picked[o.id]?.note ?? "" } })}
                      className="mt-1 block w-full rounded border border-line bg-panel px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-muted">
                    Note (optional)
                    <input
                      value={picked[o.id]?.note ?? ""}
                      maxLength={300}
                      onChange={(e) => setPicked({ ...picked, [o.id]: { date: picked[o.id]?.date ?? "", note: e.target.value } })}
                      className="mt-1 block w-full rounded border border-line bg-panel px-2 py-1.5 text-sm"
                    />
                  </label>
                  <button onClick={() => confirm(o)} disabled={busy === o.id} className="rounded border border-line px-3 py-2 text-sm hover:bg-panel disabled:opacity-50">
                    {busy === o.id ? "Confirming…" : "Confirm delivery"}
                  </button>
                </div>
              )}
              {message?.id === o.id && <div className={`text-xs mt-2 ${message.ok ? "text-good" : "text-bad"}`}>{message.text}</div>}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted mt-8">Confirming tells the business when you expect to deliver. It does not change the date they were given.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>;
}
