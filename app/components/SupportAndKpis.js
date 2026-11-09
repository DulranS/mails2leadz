"use client";
import React, { useEffect, useState } from "react";

// Sales measures and the support queue on one screen. Tickets are routed for you; one tap assigns, answers or closes.
const call = (body) => fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json().catch(() => ({})));
const SLA_LABEL = { breached: "Past target", due_soon: "Due soon", on_track: "On track", done: "Done" };
const SLA_STYLE = { breached: "text-red-700 dark:text-red-300 font-medium", due_soon: "text-amber-700 dark:text-amber-300", on_track: "text-gray-600 dark:text-gray-300", done: "text-gray-500" };

export default function SupportAndKpis() {
  const [kpi, setKpi] = useState(null);
  const [sup, setSup] = useState({ tickets: [], kpis: null, smart: null, members: [] });
  const [libText, setLibText] = useState("");
  const [libMsg, setLibMsg] = useState("");
  const [drafts, setDrafts] = useState({});
  const [msg, setMsg] = useState("");
  const [money, setMoney] = useState(null);
  const [profile, setProfile] = useState({ businessModel: "b2c", idealCustomer: "", marketingSpendMonthly: "" });
  const [profileMsg, setProfileMsg] = useState("");

  const load = () => {
    fetch("/api/kpis").then((r) => r.json()).then((j) => { if (j.kpis) setKpi(j.kpis); if (j.money) { setMoney(j.money); setProfile({ businessModel: j.money.businessModel || "b2c", idealCustomer: j.money.idealCustomer || "", marketingSpendMonthly: "" }); } }).catch(() => {});
    fetch("/api/support").then((r) => r.json()).then((j) => { if (j.tickets) setSup(j); }).catch(() => {});
  };
  useEffect(() => {
    load();
    fetch("/api/support/library").then((r) => r.json()).then((j) => { if (j.library) setLibText(j.library.map((x) => `${x.q} | ${x.a}`).join("\n")); }).catch(() => {});
  }, []);

  const open = sup.tickets.filter((t) => t.status !== "resolved");
  const canReply = (t) => t.channel === "whatsapp" || t.channel === "sms";

  const send = async (t) => {
    const text = drafts[t.id] ?? t.suggested ?? "";
    const r = await call({ id: t.id, reply: text });
    setMsg(r.ok ? "Reply sent." : (r.error || "Could not send."));
    load();
  };

  return (
    <section aria-label="Sales measures and support" className="mx-4 my-3 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4 text-sm">
      <h2 className="font-semibold text-gray-900 dark:text-white">Sales measures and support</h2>
      {kpi ? (
        <ul className="text-xs grid sm:grid-cols-2 gap-1">
          <li>Open pipeline: {kpi.pipeline.open} deals worth {kpi.pipeline.value}</li>
          <li>Won in 12 months: {kpi.sales.wonLast12Months} worth {kpi.sales.wonValueLast12Months}</li>
          <li>Win rate: {kpi.sales.winRatePct === null ? "n/a" : `${kpi.sales.winRatePct}%`}</li>
          <li>New leads waiting: {kpi.speed.newLeadsWaiting}</li>
          <li>Buy side tracked: {kpi.buySide.tracked}{kpi.buySide.realisedMarginPct !== null ? `, realised margin ${kpi.buySide.realisedMarginPct}%` : ""}</li>
        </ul>
      ) : null}
      {sup.smart ? (
        <div className="text-xs">
          <p className="font-medium">Support today</p>
          <p>Open: {open.length}{sup.smart.unassigned ? `, unassigned ${sup.smart.unassigned}` : ""}. Target missed in {sup.smart.breachRatePct === null ? "n/a" : `${sup.smart.breachRatePct}%`} of answered tickets. Answered automatically: {sup.smart.autoAnsweredPct === null ? "n/a" : `${sup.smart.autoAnsweredPct}%`}. Repeat customers: {sup.smart.repeatCustomers}.</p>
          {sup.smart.agents.length ? <ul className="mt-1 flex flex-wrap gap-3">{sup.smart.agents.map((a) => <li key={a.id}>{a.name}: {a.open} open, {a.resolved} done{a.breached ? `, ${a.breached} past target` : ""}</li>)}</ul> : null}
        </div>
      ) : null}

      <details className="text-xs">
        <summary className="cursor-pointer font-medium text-sm">Money and your business model</summary>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">Business model
            <select className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-700 mt-1" value={profile.businessModel} onChange={(e) => setProfile({ ...profile, businessModel: e.target.value })}>
              <option value="b2b">B2B (sales-led)</option>
              <option value="b2c">B2C / D2C (online shop)</option>
              <option value="rental">Rentals (bookings)</option>
            </select>
          </label>
          <label className="block">Monthly marketing spend (optional)
            <input className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-700 mt-1" inputMode="decimal" value={profile.marketingSpendMonthly} onChange={(e) => setProfile({ ...profile, marketingSpendMonthly: e.target.value })} placeholder="For customer acquisition cost" />
          </label>
          <label className="block sm:col-span-2">Your ideal customer, in a sentence
            <input className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-700 mt-1" value={profile.idealCustomer} onChange={(e) => setProfile({ ...profile, idealCustomer: e.target.value })} placeholder="Small clinics in Colombo with 2 to 10 staff" />
          </label>
        </div>
        <button type="button" className="mt-2 px-3 py-1 border rounded" onClick={async () => {
          const body = { businessModel: profile.businessModel, idealCustomer: profile.idealCustomer };
          if (profile.marketingSpendMonthly !== "") body.marketingSpendMonthly = profile.marketingSpendMonthly;
          await fetch("/api/kpis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          setProfileMsg("Saved."); load();
        }}>Save</button>
        {profileMsg ? <span className="ml-2">{profileMsg}</span> : null}
        {money ? (
          <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1">
            <li>Average order value: {money.averageOrderValue ?? "n/a"}</li>
            <li>Typical price point (median): {money.pricePoint ?? "n/a"}</li>
            <li>Average contract value (won deals): {money.averageContractValue ?? "n/a"}</li>
            <li>Lifetime value per paying customer: {money.ltv ?? "n/a"}</li>
            <li>Customer acquisition cost: {money.cac ?? "n/a (enter your monthly spend)"}</li>
            <li>Lifetime value to acquisition cost: {money.ltvToCac ?? "n/a"}</li>
            <li>Paid versus organic wins: {money.channelMix.paidSharePct === null ? "n/a" : `${money.channelMix.paidSharePct}% paid`}</li>
            <li>New customers in 12 months: {money.newCustomersLast12Months}</li>
          </ul>
        ) : null}
        {money ? (
          <div className="mt-3">
            <p className="font-medium">Focus for {money.focus ? (profile.businessModel === "b2b" ? "B2B" : profile.businessModel === "rental" ? "rentals" : "B2C and D2C") : ""}</p>
            <ul className="list-disc ml-5">{money.focus.map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        ) : null}
        {money ? <p className="mt-2 text-gray-600 dark:text-gray-300">{money.note}</p> : null}
      </details>

      <details className="text-xs">
        <summary className="cursor-pointer font-medium text-sm">Automatic answers (question | answer, one per line)</summary>
        <p className="mt-1 text-gray-600 dark:text-gray-300">Customers who ask one of these get your answer on WhatsApp or SMS, if auto-answers are on under Account. Everything else, and every complaint, comes here for a person.</p>
        <textarea className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-700 mt-1" rows={5} value={libText} onChange={(e) => setLibText(e.target.value)} placeholder={"What are your opening hours? | We are open 9am to 5pm, Monday to Friday."} />
        <button type="button" className="mt-1 px-3 py-1 border rounded" onClick={async () => { await fetch("/api/support/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: libText }) }); setLibMsg("Saved."); load(); }}>Save answers</button>
        {libMsg ? <span className="ml-2">{libMsg}</span> : null}
      </details>

      <div>
        <p className="font-medium">Support queue</p>
        {msg ? <p className="text-xs text-gray-700 dark:text-gray-200 mt-1">{msg}</p> : null}
        {open.length === 0 ? <p className="text-xs text-gray-600 dark:text-gray-300">Nothing waiting. Good.</p> : null}
        <ul className="mt-2 space-y-3">
          {open.map((t) => (
            <li key={t.id} className="rounded border border-gray-200 dark:border-gray-700 p-2 text-xs space-y-1">
              <div className="flex flex-wrap gap-2 items-center">
                <span className={t.kind === "complaint" ? "text-red-700 dark:text-red-300 font-medium" : "font-medium"}>{t.kind === "complaint" ? "Complaint" : "Question"}</span>
                <span className={SLA_STYLE[t.sla] || ""}>{SLA_LABEL[t.sla] || ""}</span>
                <span className="text-gray-500">due {new Date(t.dueAt).toLocaleString()}</span>
                <span>{t.customerEmail || t.customerPhone || "customer"}</span>
                {t.history && t.history.repeat ? <span className="text-gray-600">repeat customer ({t.history.tickets} tickets)</span> : null}
              </div>
              <p className="text-gray-800 dark:text-gray-100">{t.question || t.summary}</p>
              <div className="flex flex-wrap gap-2 items-center">
                <select className="border rounded px-1 py-0.5 bg-white dark:bg-gray-700" value={t.assignedTo || ""} onChange={async (e) => { const m = sup.members.find((x) => x.id === e.target.value); await call({ id: t.id, assign: e.target.value, assignedName: m?.name || "" }); load(); }}>
                  <option value="">Unassigned</option>
                  {sup.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button type="button" className="underline" onClick={() => call({ id: t.id, status: "in_progress" }).then(load)}>In progress</button>
                <button type="button" className="underline" onClick={() => call({ id: t.id, status: "resolved" }).then(load)}>Resolved</button>
              </div>
              {canReply(t) ? (
                <div className="space-y-1">
                  {t.suggested ? <button type="button" className="underline" onClick={() => setDrafts({ ...drafts, [t.id]: t.suggested })}>Use the ready answer</button> : null}
                  <textarea className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-700" rows={2} placeholder="Reply to the customer" value={drafts[t.id] ?? ""} onChange={(e) => setDrafts({ ...drafts, [t.id]: e.target.value })} />
                  <button type="button" className="px-2 py-0.5 border rounded" onClick={() => send(t)}>Send reply</button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
