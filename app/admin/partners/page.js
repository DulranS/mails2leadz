"use client";
// app/admin/partners/page.js - the operator's software partner programme (pass 348). ADMIN_EMAILS only (the API refuses everyone else).
// Shows partners, what each is owed, and their statement links. Records payments you make to them. Never shows a customer's leads or deals.
import { useCallback, useEffect, useState } from "react";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const input = "min-h-[44px] w-full px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm";
const btn = "min-h-[44px] px-3 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50";
const money = (minor, cur) => `${cur} ${(Number(minor || 0) / 100).toFixed(2)}`;
const EMPTY = { name: "", email: "", company: "", payoutMethod: "bank_transfer", payoutNote: "" };

export default function PartnersPage() {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [form, setForm] = useState(EMPTY);
  const [pay, setPay] = useState({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/partners");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setState({ loading: false, error: res.status === 403 ? "This page is for the operator of this deployment only." : data.error || "Could not load.", data: null }); return; }
      setState({ loading: false, error: "", data });
    } catch { setState({ loading: false, error: "Could not reach the server.", data: null }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const send = async (body, label) => {
    setBusy(label); setMsg("");
    try {
      const res = await fetch("/api/admin/partners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error || "Could not save."); return null; }
      await load();
      return data;
    } catch { setMsg("Could not reach the server."); return null; } finally { setBusy(""); }
  };

  const create = async (e) => {
    e.preventDefault();
    const data = await send({ action: "create", partner: form }, "create");
    if (data?.partner) { setMsg(`Created ${data.partner.name}. Referral code ${data.partner.code}.`); setForm(EMPTY); }
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setMsg("Statement link copied."); } catch { setMsg(text); }
  };

  if (state.loading) return <div className="p-4 text-sm text-gray-500">Loading…</div>;
  if (state.error) return <div className="p-4 text-sm text-red-600">{state.error}</div>;
  const { partners = [], terms, note } = state.data || {};

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Partners</h1>
        <p className="text-sm text-gray-500">
          {terms ? `Each partner earns ${terms.pct}% of each paid invoice from the companies they refer, for ${terms.months} months from the company's first payment. Paid out once owed reaches ${money(terms.minPayoutMinor, "")}.` : "The programme's terms are not set."}
        </p>
        {note && <p className="text-sm text-amber-600 mt-1">{note}</p>}
        {msg && <p role="status" className="text-sm mt-2 text-gray-700 dark:text-gray-200 break-all">{msg}</p>}
      </div>

      <form onSubmit={create} className={`${card} grid gap-3 sm:grid-cols-2`}>
        <h2 className="sm:col-span-2 font-medium text-gray-900 dark:text-gray-100">Add a partner</h2>
        <label className="text-sm">Name<input className={input} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="text-sm">Email<input className={input} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="text-sm">Company (optional)<input className={input} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></label>
        <label className="text-sm">How you pay them
          <select className={input} value={form.payoutMethod} onChange={(e) => setForm({ ...form, payoutMethod: e.target.value })}>
            <option value="bank_transfer">Bank transfer</option><option value="card_wallet">Card or wallet</option><option value="cheque">Cheque</option><option value="other">Other</option>
          </select>
        </label>
        <label className="text-sm sm:col-span-2">Payout note (no account numbers)<input className={input} value={form.payoutNote} onChange={(e) => setForm({ ...form, payoutNote: e.target.value })} /></label>
        <div className="sm:col-span-2"><button type="submit" disabled={busy === "create"} className={`${btn} bg-indigo-600 text-white border-indigo-600`}>Add partner</button></div>
      </form>

      {partners.length === 0 && <div className={card}><p className="text-sm text-gray-500">No partners yet.</p></div>}

      {partners.map((p) => {
        const row = pay[p.code] || {};
        const bal = p.balances?.[0];
        return (
          <div key={p.code} className={`${card} space-y-3`}>
            <div className="flex flex-wrap gap-2 justify-between items-baseline">
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{p.name}{p.company ? ` · ${p.company}` : ""}</div>
                <div className="text-xs text-gray-500">Code {p.code} · {p.email} · {p.payoutMethod}{p.payoutNote ? ` · ${p.payoutNote}` : ""}</div>
              </div>
              <select aria-label="Status" className="min-h-[44px] px-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm" value={p.status} onChange={(e) => send({ action: "status", code: p.code, status: e.target.value }, `s-${p.code}`)}>
                <option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option>
              </select>
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-200">
              {p.balances?.length ? p.balances.map((b) => (
                <div key={b.currency}>Earned {money(b.earned, b.currency)} · reversed {money(b.clawedBack, b.currency)} · paid {money(b.paidOut, b.currency)} · <strong>owed {money(b.payable, b.currency)}</strong>{b.eligible ? " · ready to pay" : ""}</div>
              )) : <div>Nothing earned yet.</div>}
            </div>
            {p.statementLink && <button type="button" className={btn} onClick={() => copy(p.statementLink)}>Copy statement link</button>}
            {bal?.payable > 0 && (
              <form className="grid gap-2 sm:grid-cols-4" onSubmit={async (e) => {
                e.preventDefault();
                const amount = Math.round(Number(row.amount || 0) * 100);
                const data = await send({ action: "payout", code: p.code, currency: row.currency || bal.currency, amountMinor: amount, reference: row.reference || "" }, `p-${p.code}`);
                if (data) { setPay({ ...pay, [p.code]: {} }); setMsg(`Recorded a payment of ${money(amount, row.currency || bal.currency)} to ${p.name}.`); }
              }}>
                <input aria-label="Currency" className={input} placeholder={bal.currency} value={row.currency ?? bal.currency} onChange={(e) => setPay({ ...pay, [p.code]: { ...row, currency: e.target.value.toUpperCase().slice(0, 3) } })} />
                <input aria-label="Amount paid" className={input} inputMode="decimal" placeholder="Amount" value={row.amount || ""} onChange={(e) => setPay({ ...pay, [p.code]: { ...row, amount: e.target.value } })} />
                <input aria-label="Reference" className={input} placeholder="Reference (e.g. transfer ID)" value={row.reference || ""} onChange={(e) => setPay({ ...pay, [p.code]: { ...row, reference: e.target.value } })} />
                <button type="submit" disabled={busy === `p-${p.code}`} className={btn}>Record payment</button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
