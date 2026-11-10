"use client";
import React, { useEffect, useState } from "react";
import Collapsible from "./Collapsible.js";
import { targetProgress } from "../../lib/deals/link.js";

// Sales measures, the money picture, automatic answers and the support queue. Same look as the deals panel.
const field = "w-full min-h-[40px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100";
const label = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";
const primary = "min-h-[40px] px-4 py-2 rounded-md bg-gray-900 text-white text-sm hover:bg-gray-700 disabled:opacity-50 dark:bg-white dark:text-gray-900";
const secondary = "min-h-[40px] px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-800 dark:text-gray-100";
const card = "rounded-md border border-gray-200 dark:border-gray-700 p-3";
const note = "text-xs text-gray-600 dark:text-gray-300";
const grid = "grid grid-cols-1 sm:grid-cols-2 gap-3";
const SLA_LABEL = { breached: "Past target", due_soon: "Due soon", on_track: "On track", done: "Done" };
const SLA_STYLE = { breached: "text-red-700 dark:text-red-300 font-medium", due_soon: "text-amber-700 dark:text-amber-300", on_track: "text-gray-600 dark:text-gray-300", done: "text-gray-500" };
const MODEL_NAME = { b2b: "B2B", b2c: "B2C and D2C", rental: "rentals" };
const call = (body) => fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json().catch(() => ({})));
const fmt = (v, suffix = "") => (v === null || v === undefined ? "n/a" : `${v}${suffix}`);

function Stat({ name, value, hint }) {
  return (
    <div className={card}>
      <p className={note}>{name}</p>
      <p className="text-lg font-semibold text-gray-900 dark:text-white">{value}</p>
      {hint ? <p className={note}>{hint}</p> : null}
    </div>
  );
}

function Field({ id, text, children }) {
  return (<div><label htmlFor={id} className={label}>{text}</label>{children}</div>);
}

export default function SupportAndKpis() {
  const [kpi, setKpi] = useState(null);
  const [money, setMoney] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [atRisk, setAtRisk] = useState([]);
  const [sup, setSup] = useState({ tickets: [], kpis: null, smart: null, members: [] });
  const [profile, setProfile] = useState({ businessModel: "b2c", idealCustomer: "", marketingSpendMonthly: "" });
  const [profileMsg, setProfileMsg] = useState("");
  const [spendText, setSpendText] = useState("");
  const [libText, setLibText] = useState("");
  const [libMsg, setLibMsg] = useState("");
  const [drafts, setDrafts] = useState({});
  const [msg, setMsg] = useState("");
  const [targets, setTargets] = useState({ monthlyRevenue: "", newCustomersPerMonth: "", winRatePct: "" });

  const load = () => {
    fetch("/api/kpis").then((r) => r.json()).then((j) => {
      if (j.kpis) setKpi(j.kpis);
      if (j.forecast) setForecast(j.forecast);
      if (j.atRisk) setAtRisk(j.atRisk);
      if (j.money) {
        setMoney(j.money);
        setProfile((p) => ({ ...p, businessModel: j.money.businessModel || "b2c", idealCustomer: j.money.idealCustomer || "" }));
        setTargets({ monthlyRevenue: j.money.targets?.monthlyRevenue || "", newCustomersPerMonth: j.money.targets?.newCustomersPerMonth || "", winRatePct: j.money.targets?.winRatePct || "" });
      }
    }).catch(() => {});
    fetch("/api/support").then((r) => r.json()).then((j) => { if (j.tickets) setSup(j); }).catch(() => {});
  };
  useEffect(() => {
    load();
    fetch("/api/support/library").then((r) => r.json()).then((j) => { if (j.library) setLibText(j.library.map((x) => `${x.q} | ${x.a}`).join("\n")); }).catch(() => {});
  }, []);

  const open = sup.tickets.filter((t) => t.status !== "resolved");
  const canReply = (t) => t.channel === "whatsapp" || t.channel === "sms";

  const saveProfile = async () => {
    const body = { businessModel: profile.businessModel, idealCustomer: profile.idealCustomer, targets };
    if (spendText.trim()) body.spendByChannel = spendText;
    if (profile.marketingSpendMonthly !== "") body.marketingSpendMonthly = profile.marketingSpendMonthly;
    await fetch("/api/kpis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setProfileMsg("Saved.");
    load();
  };
  const saveLibrary = async () => {
    await fetch("/api/support/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: libText }) });
    setLibMsg("Saved.");
    load();
  };
  const sendReply = async (t) => {
    const text = drafts[t.id] ?? t.suggested ?? "";
    const r = await call({ id: t.id, reply: text });
    setMsg(r.ok ? "Reply sent." : (r.error || "Could not send."));
    load();
  };

  return (
    <div className="space-y-2 px-2">
      {kpi ? (
        <section aria-label="Sales measures" className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white px-2">Sales right now</h3>
          {forecast ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-2">
              <Stat name="Expected this quarter" value={forecast.expected} hint={forecast.target ? `${forecast.pctOfTarget}% of your quarter target` : "Set a monthly revenue target"} />
              <Stat name="Won this quarter" value={forecast.wonThisQuarter} />
              <Stat name="Open, weighted by stage" value={forecast.weightedOpen} />
              <Stat name="Deals at risk" value={atRisk.length} hint={atRisk.length ? "See below" : "None flagged"} />
            </div>
          ) : null}
          {atRisk.length ? (
            <ul className="px-2 space-y-2">
              {atRisk.map((d) => (
                <li key={d.name} className={card}>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{d.name}{d.value ? ` (${d.value})` : ""}</p>
                  <p className={note}>{d.health.risks.join(", ")}</p>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-2">
            <Stat name="Open pipeline" value={`${kpi.pipeline.open} deals`} hint={`Worth ${kpi.pipeline.value}`} />
            <Stat name="Won in 12 months" value={kpi.sales.wonLast12Months} hint={`Worth ${kpi.sales.wonValueLast12Months}`} />
            <Stat name="Win rate" value={fmt(kpi.sales.winRatePct, "%")} />
            <Stat name="New leads waiting" value={kpi.speed.newLeadsWaiting} hint="Waiting for a first reply" />
          </div>
        </section>
      ) : null}

      <Collapsible title="Money and your business model" hint="Your order values, customer value and acquisition cost, from your own records">
        <div className={grid}>
          <Field id="biz-model" text="Business model">
            <select id="biz-model" className={field} value={profile.businessModel} onChange={(e) => setProfile({ ...profile, businessModel: e.target.value })}>
              <option value="b2b">B2B (sales-led)</option>
              <option value="b2c">B2C and D2C (online shop)</option>
              <option value="rental">Rentals (bookings)</option>
            </select>
          </Field>
          <Field id="spend" text="Monthly marketing spend (optional)">
            <input id="spend" className={field} inputMode="decimal" value={profile.marketingSpendMonthly} onChange={(e) => setProfile({ ...profile, marketingSpendMonthly: e.target.value })} placeholder="Used to work out acquisition cost" />
          </Field>
          <div className="sm:col-span-2">
            <Field id="spend-ch" text="Monthly spend by channel, one per line: channel: amount (for the budget suggestion)">
              <textarea id="spend-ch" className={field} rows={3} value={spendText} onChange={(e) => setSpendText(e.target.value)} placeholder={"Meta: 300\nGoogle: 150"} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field id="ideal" text="Your ideal customer, in one sentence">
              <input id="ideal" className={field} value={profile.idealCustomer} onChange={(e) => setProfile({ ...profile, idealCustomer: e.target.value })} placeholder="Small clinics in Colombo with 2 to 10 staff" />
            </Field>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={saveProfile} className={primary}>Save</button>
          {profileMsg ? <span className={note} role="status">{profileMsg}</span> : null}
        </div>

        {money ? (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat name="Average order value" value={fmt(money.averageOrderValue)} />
              <Stat name="Typical price (median)" value={fmt(money.pricePoint)} />
              <Stat name="Average contract value" value={fmt(money.averageContractValue)} hint="From won deals" />
              <Stat name="Lifetime value per customer" value={fmt(money.ltv)} />
              <Stat name="Acquisition cost" value={money.cac === null ? "n/a" : money.cac} hint={money.cac === null ? "Enter your monthly spend" : "Per new customer"} />
              <Stat name="Lifetime value to cost" value={fmt(money.ltvToCac, "x")} />
              <Stat name="Paid share of wins" value={fmt(money.channelMix.paidSharePct, "%")} hint={`${money.channelMix.organicWon} organic`} />
              <Stat name="New customers, 12 months" value={money.newCustomersLast12Months} />
            </div>
            <div className={card}>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Focus for {MODEL_NAME[money.model] || "your business"}</p>
              <ul className="list-disc ml-5 mt-2 text-sm text-gray-800 dark:text-gray-100 space-y-1">{money.focus.map((f) => <li key={f}>{f}</li>)}</ul>
              <p className={`mt-3 ${note}`}>{money.note}</p>
            </div>
          </div>
        ) : null}
      </Collapsible>

      {kpi ? (
        <Collapsible title="Your targets" hint="What you are aiming for, against your recent average">
          <div className={grid}>
            <Field id="t-rev" text="Revenue a month"><input id="t-rev" className={field} inputMode="decimal" value={targets.monthlyRevenue} onChange={(e) => setTargets({ ...targets, monthlyRevenue: e.target.value })} /></Field>
            <Field id="t-new" text="New customers a month"><input id="t-new" className={field} inputMode="decimal" value={targets.newCustomersPerMonth} onChange={(e) => setTargets({ ...targets, newCustomersPerMonth: e.target.value })} /></Field>
            <Field id="t-win" text="Win rate, %"><input id="t-win" className={field} inputMode="decimal" value={targets.winRatePct} onChange={(e) => setTargets({ ...targets, winRatePct: e.target.value })} /></Field>
          </div>
          <div className="mt-3"><button type="button" onClick={saveProfile} className={primary}>Save targets</button></div>
          {money ? (
            <ul className="mt-4 space-y-3">
              {targetProgress(targets, kpi.sales, money).map((p) => (
                <li key={p.name} className={card}>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{p.name}: {p.actual} of {p.target} ({p.pct}%)</p>
                  <div className="mt-2 h-2 rounded bg-gray-200 dark:bg-gray-700"><div className="h-2 rounded bg-gray-900 dark:bg-white" style={{ width: `${Math.min(100, Math.max(0, p.pct))}%` }} /></div>
                </li>
              ))}
            </ul>
          ) : null}
          <p className={`mt-3 ${note}`}>The actual figure is your average over the last twelve months, not this month alone.</p>
        </Collapsible>
      ) : null}

      {sup.smart ? (
        <Collapsible title={`Support today (${open.length} open)`} hint="How the queue is doing against its two-hour target" defaultOpen>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat name="Missed target" value={fmt(sup.smart.breachRatePct, "%")} hint="Of answered tickets" />
            <Stat name="Answered automatically" value={fmt(sup.smart.autoAnsweredPct, "%")} />
            <Stat name="Unassigned" value={sup.smart.unassigned} />
            <Stat name="Repeat customers" value={sup.smart.repeatCustomers} />
          </div>
          {sup.smart.agents.length ? (
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {sup.smart.agents.map((a) => (
                <li key={a.id} className={card}>
                  <strong>{a.name}</strong>
                  <span className={`block ${note}`}>{a.open} open · {a.resolved} done{a.breached ? ` · ${a.breached} past target` : ""}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Collapsible>
      ) : null}

      <Collapsible title="Automatic answers" hint="Customers who ask these get your answer on WhatsApp or SMS">
        <p className={note}>One per line, as "question | answer". Anything else, and every complaint, comes to the queue for a person. Turn answers on under Account.</p>
        <div className="mt-2">
          <label htmlFor="library" className={label}>Your answers</label>
          <textarea id="library" className={field} rows={6} value={libText} onChange={(e) => setLibText(e.target.value)} placeholder={"What are your opening hours? | We are open 9am to 5pm, Monday to Friday."} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={saveLibrary} className={primary}>Save answers</button>
          {libMsg ? <span className={note} role="status">{libMsg}</span> : null}
        </div>
      </Collapsible>

      <Collapsible title={`Support queue (${open.length})`} hint="Assign, answer and close customer messages" defaultOpen>
        {msg ? <p role="status" className="text-sm text-gray-800 dark:text-gray-100 rounded-md bg-gray-100 dark:bg-gray-700 px-3 py-2 mb-3">{msg}</p> : null}
        {open.length === 0 ? <p className={note}>Nothing waiting. Good.</p> : null}
        <ul className="space-y-3">
          {open.map((t) => (
            <li key={t.id} className={`${card} space-y-2`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className={t.kind === "complaint" ? "text-red-700 dark:text-red-300 font-semibold" : "font-semibold text-gray-900 dark:text-white"}>{t.kind === "complaint" ? "Complaint" : "Question"}</span>
                <span className={SLA_STYLE[t.sla] || ""}>{SLA_LABEL[t.sla] || ""}</span>
                <span className={note}>due {new Date(t.dueAt).toLocaleString()}</span>
                <span className={note}>{t.customerEmail || t.customerPhone || "customer"}</span>
                {t.history && t.history.repeat ? <span className={note}>repeat customer ({t.history.tickets} tickets)</span> : null}
              </div>
              <p className="text-sm text-gray-900 dark:text-gray-100">{t.question || t.summary}</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <label className="sr-only" htmlFor={`assign-${t.id}`}>Assign this ticket</label>
                <select id={`assign-${t.id}`} className={`${field} sm:w-56`} value={t.assignedTo || ""} onChange={async (e) => { const m = sup.members.find((x) => x.id === e.target.value); await call({ id: t.id, assign: e.target.value, assignedName: m?.name || "" }); load(); }}>
                  <option value="">Unassigned</option>
                  {sup.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button type="button" className={secondary} onClick={() => call({ id: t.id, status: "in_progress" }).then(load)}>In progress</button>
                <button type="button" className={secondary} onClick={() => call({ id: t.id, status: "resolved" }).then(load)}>Mark resolved</button>
              </div>
              {canReply(t) ? (
                <div className="space-y-2">
                  {t.suggested ? <button type="button" className="text-xs underline" onClick={() => setDrafts({ ...drafts, [t.id]: t.suggested })}>Use the ready answer</button> : null}
                  <label htmlFor={`reply-${t.id}`} className={label}>Reply to the customer</label>
                  <textarea id={`reply-${t.id}`} className={field} rows={2} value={drafts[t.id] ?? ""} onChange={(e) => setDrafts({ ...drafts, [t.id]: e.target.value })} />
                  <button type="button" className={primary} onClick={() => sendReply(t)}>Send reply</button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </Collapsible>
    </div>
  );
}
