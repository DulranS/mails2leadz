"use client";
import React, { useEffect, useState } from "react";
import Collapsible from "./Collapsible.js";
import { pitchOutline } from "../../lib/pitch.js";
import { JOURNEY_PRESETS } from "../../lib/journey-presets.js";
import { parsePackages, comparePackages } from "../../lib/packages.js";
import { groupNumber as g } from "../../lib/format.js";
import { cachedJson } from "../../lib/client-cache.js";
import { parseProof, approvedProof } from "../../lib/insights.js";

// Pricing check, pitch outline and agreement draft. Built only from what you enter; nothing is sent.
const field = "w-full min-h-[40px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100";
const label = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";
const primary = "min-h-[40px] px-4 py-2 rounded-md bg-gray-900 text-white text-sm hover:bg-gray-700 dark:bg-white dark:text-gray-900";
const card = "rounded-md border border-gray-200 dark:border-gray-700 p-3 text-sm";
const secondary = "min-h-[40px] px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-800 dark:text-gray-100";
const note = "text-xs text-gray-600 dark:text-gray-300";
const grid = "grid grid-cols-1 sm:grid-cols-2 gap-3";

function Field({ id, text, children }) { return <div><label htmlFor={id} className={label}>{text}</label>{children}</div>; }

export default function SalesTools() {
  const [manage, setManage] = useState(null);
  const [patternOut, setPatternOut] = useState(null);
  const [patternBusy, setPatternBusy] = useState(false);
  const [standardText, setStandardText] = useState("");
  const [channel, setChannel] = useState("general");
  const [standardsByChannel, setStandardsByChannel] = useState({});
  const [auditOut, setAuditOut] = useState(null);
  const [reactOut, setReactOut] = useState(null);
  const [standardMsg, setStandardMsg] = useState("");
  const [critiqueDraft, setCritiqueDraft] = useState("");
  const [critiqueOut, setCritiqueOut] = useState(null);
  const [critiqueBusy, setCritiqueBusy] = useState(false);
  const [proofText, setProofText] = useState("");
  const [proofMsg, setProofMsg] = useState("");
  const [okrText, setOkrText] = useState("");
  const [okrMsg, setOkrMsg] = useState("");
  const [compText, setCompText] = useState("");
  const [yourPrice, setYourPrice] = useState("");
  const [abmText, setAbmText] = useState("");
  const [abmMsg, setAbmMsg] = useState("");
  const [journeyName, setJourneyName] = useState("");
  const [journeyText, setJourneyText] = useState("");
  const [enrolEmails, setEnrolEmails] = useState("");
  const [enrolAgreed, setEnrolAgreed] = useState(false);
  const [journeyMsg, setJourneyMsg] = useState("");
  const [placesText, setPlacesText] = useState("");
  const [pkText, setPkText] = useState("");
  const [pkTax, setPkTax] = useState("0");
  const [pkDep, setPkDep] = useState("0");
  const [placesMsg, setPlacesMsg] = useState("");
  const [evForm, setEvForm] = useState({ title: "", startsAt: "", place: "", capacity: "" });
  const [evMsg, setEvMsg] = useState("");
  const [events, setEvents] = useState([]);
  const loadEvents = (fresh = true) => cachedJson("/api/events", { fresh }).then((j) => setEvents(j.events || [])).catch(() => {});
  const loadManage = (fresh = true) => cachedJson("/api/sales-tools/manage", { fresh }).then((j) => { setManage(j); setOkrText(j.okrText || ""); setAbmText(j.abmText || ""); setYourPrice(j.yourPrice || ""); setStandardText(j.standard || ""); setStandardsByChannel(j.standards || {}); setProofText(j.proofText || ""); }).catch(() => {});
  const saveAction = (body) => fetch("/api/sales-tools/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ error: "Could not reach the server." }));
  const [outline, setOutline] = useState("");
  const [priceHint, setPriceHint] = useState({});
  useEffect(() => {
    loadManage(false);
    loadEvents(false);
    cachedJson("/api/kpis").then((j) => {
      const m = j.money || {};
      const k = j.kpis || {};
      setPriceHint({ typical: m.pricePoint ?? null });
      setOutline(pitchOutline({
        businessName: m.businessName || "",
        offer: m.offer || "",
        idealCustomer: m.idealCustomer || "",
        measures: { won: k.sales?.wonLast12Months, winRatePct: k.sales?.winRatePct, wonValue: k.sales?.wonValueLast12Months },
        pricePoint: m.pricePoint ?? null,
        averageContractValue: m.averageContractValue ?? null,
      }));
    }).catch(() => {});
  }, []);
  const [price, setPrice] = useState({ unitPrice: "", quantity: "1", discountPct: "0", taxPct: "0", depositPct: "0" });
  const [out, setOut] = useState(null);
  const [agr, setAgr] = useState({ kind: "service", seller: "", buyer: "", date: "", value: "", scope: "" });
  const [draft, setDraft] = useState("");
  const [agrErr, setAgrErr] = useState("");
  const [link, setLink] = useState("");

  const calc = async () => {
    const r = await fetch("/api/sales-tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "price", ...price }) }).then((x) => x.json()).catch(() => ({ error: "Could not reach the server." }));
    setOut(r);
  };
  const makeDraft = async () => {
    const r = await fetch("/api/sales-tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "agreement", ...agr }) }).then((x) => x.json()).catch(() => ({ error: "Could not reach the server." }));
    if (r.ok) { setDraft(r.text); setAgrErr(""); } else { setDraft(""); setAgrErr(r.error || "Could not make the draft."); }
  };

  return (
    <div className="space-y-2 px-2">
      <Collapsible title="Pricing check" hint="Total, discount, tax, deposit and balance for a quote">
        <div className={grid}>
          <Field id="p-unit" text="Price per item"><input id="p-unit" className={field} inputMode="decimal" value={price.unitPrice} onChange={(e) => setPrice({ ...price, unitPrice: e.target.value })} /></Field>
          <Field id="p-qty" text="Quantity"><input id="p-qty" className={field} inputMode="numeric" value={price.quantity} onChange={(e) => setPrice({ ...price, quantity: e.target.value })} /></Field>
          <Field id="p-disc" text="Discount, %"><input id="p-disc" className={field} inputMode="decimal" value={price.discountPct} onChange={(e) => setPrice({ ...price, discountPct: e.target.value })} /></Field>
          <Field id="p-tax" text="Tax, %"><input id="p-tax" className={field} inputMode="decimal" value={price.taxPct} onChange={(e) => setPrice({ ...price, taxPct: e.target.value })} /></Field>
          <Field id="p-dep" text="Deposit now, %"><input id="p-dep" className={field} inputMode="decimal" value={price.depositPct} onChange={(e) => setPrice({ ...price, depositPct: e.target.value })} /></Field>
        </div>
        <div className="mt-3"><button type="button" onClick={calc} className={primary}>Work it out</button></div>
        {out?.ok ? (
          <div className={`${card} mt-3 grid grid-cols-2 gap-2`} role="status">
            <span>Subtotal</span><strong>{g(out.subtotal)}</strong>
            <span>Discount</span><strong>{g(out.discountAmount)}</strong>
            <span>Tax</span><strong>{g(out.tax)}</strong>
            <span>Total</span><strong>{g(out.total)}</strong>
            <span>Deposit now</span><strong>{g(out.deposit)}</strong>
            <span>Balance later</span><strong>{g(out.balance)}</strong>
            <span>Per item</span><strong>{g(out.perUnit)}</strong>
          </div>
        ) : out?.error ? <p className="text-sm text-red-600 mt-2">{out.error}</p> : null}
        {priceHint.typical ? <p className={`mt-2 ${note}`}>Your typical price is {priceHint.typical}.</p> : null}
      </Collapsible>

      <Collapsible title="Packages" hint="Compare packages with the same tax and deposit">
        <textarea id="pk-lines" className={field} rows={4} value={pkText} onChange={(e) => setPkText(e.target.value)} placeholder={"Basic | 100 | 1 | Setup\nPro | 80 | 3 | Setup, support"} />
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field id="pk-tax" text="Tax, %"><input id="pk-tax" className={field} inputMode="decimal" value={pkTax} onChange={(e) => setPkTax(e.target.value)} /></Field>
          <Field id="pk-dep" text="Deposit now, %"><input id="pk-dep" className={field} inputMode="decimal" value={pkDep} onChange={(e) => setPkDep(e.target.value)} /></Field>
        </div>
        {(() => { const c = comparePackages(parsePackages(pkText).packages, { taxPct: Number(pkTax) || 0, depositPct: Number(pkDep) || 0 }); return c.length ? (
          <ul className="mt-3 space-y-2">{c.map((p) => (<li key={p.name} className={card}><strong>{p.name}</strong>: total {g(p.quote.total)}, deposit {g(p.quote.deposit)}, balance {g(p.quote.balance)}{p.included ? ` · ${p.included}` : ""}</li>))}</ul>
        ) : null; })()}
      </Collapsible>

      <Collapsible title="Pitch outline and deck" hint="Built from your own details and numbers; the rest is yours to write">
        <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100 font-sans">{outline || "Save your business details first, then this outline fills in."}</pre>
        <div className="mt-3"><a className={primary} href="/api/sales-tools/deck" target="_blank" rel="noopener noreferrer">Open the deck (print it to PDF)</a> <a className={secondary} href="/api/sales-tools/deck.pptx">Download PowerPoint (.pptx)</a></div>
        <p className={`mt-2 ${note}`}>The deck opens as slides. Use your browser's Print, then Save as PDF.</p>
      </Collapsible>

      <Collapsible title="Objectives and key results" hint="Measured from your own figures">
        <p className={note}>One objective per line, then its measures and targets: "Grow | revenue_month 2000, win_rate 40". Measures: revenue_month, new_customers_month, win_rate, paid_share, ltv.</p>
        <textarea id="okr-text" className={field} rows={4} value={okrText} onChange={(e) => setOkrText(e.target.value)} />
        <div className="mt-3 flex items-center gap-3">
          <button type="button" className={primary} onClick={async () => { const r = await saveAction({ action: "save_okrs", text: okrText }); setOkrMsg(r.ok ? `Saved ${r.saved}.` : (r.error || "Could not save.")); loadManage(); }}>Save objectives</button>
          {okrMsg ? <span className={note} role="status">{okrMsg}</span> : null}
        </div>
        {(manage?.okrs || []).map((o) => (
          <div key={o.objective} className={`${card} mt-3`}>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{o.objective}</p>
            <ul className="mt-2 space-y-2">
              {o.keyResults.map((k) => (
                <li key={k.label + k.target} className="text-sm">
                  {k.label}: {k.measured ? `${g(k.current)} of ${g(k.target)}` : "not measured yet"}
                  {k.measured && k.pct !== null ? <div className="mt-1 h-2 rounded bg-gray-200 dark:bg-gray-700"><div className="h-2 rounded bg-gray-900 dark:bg-white" style={{ width: `${k.pct}%` }} /></div> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Collapsible>

      <Collapsible title="Competitor prices" hint="Only the prices you enter; competitor sites are not read">
        <div className={grid}>
          <Field id="comp-lines" text="One per line: competitor, product, price"><textarea id="comp-lines" className={field} rows={4} value={compText} onChange={(e) => setCompText(e.target.value)} placeholder={"Acme, Basic plan, 100\nBeta, Basic plan, 120"} /></Field>
          <div className="space-y-3">
            <Field id="your-price" text="Your price for the same product"><input id="your-price" className={field} inputMode="decimal" value={yourPrice} onChange={(e) => setYourPrice(e.target.value)} /></Field>
            <button type="button" className={secondary} onClick={async () => { await saveAction({ action: "save_your_price", price: yourPrice }); await saveAction({ action: "add_competitors", text: compText }); setCompText(""); loadManage(); }}>Save prices</button>
          </div>
        </div>
        {manage?.position ? (
          <div className={`${card} mt-3 text-sm`} role="status">Your price is {manage.position.differencePct}% against the middle of {g(manage.position.competitorMedian)} ({manage.position.verdict.replace(/_/g, " ")}). Range {g(manage.position.low)} to {g(manage.position.high)}.</div>
        ) : null}
        {manage?.competitors?.length ? <p className={`mt-2 ${note}`}>{manage.competitors.length} competitor prices on record.</p> : null}
      </Collapsible>

      <Collapsible title="Accounts to reach" hint="Named accounts; you are reminded when one goes quiet for two weeks">
        <textarea id="abm-text" className={field} rows={4} value={abmText} onChange={(e) => setAbmText(e.target.value)} placeholder={"Big Co | ceo@bigco.example"} />
        <div className="mt-3 flex items-center gap-3">
          <button type="button" className={primary} onClick={async () => { const r = await saveAction({ action: "save_abm", text: abmText }); setAbmMsg(r.ok ? `Saved ${r.saved}.` : "Could not save."); loadManage(); }}>Save accounts</button>
          {abmMsg ? <span className={note} role="status">{abmMsg}</span> : null}
        </div>
      </Collapsible>

      <Collapsible title="Automatic lead search" hint="Up to three searches, run each week on Google Places (connect the key under Integrations)">
        <textarea id="places-q" className={field} rows={3} value={placesText} onChange={(e) => setPlacesText(e.target.value)} placeholder={"dentists in Colombo\nplumbers in Kandy"} />
        <div className="mt-3 flex items-center gap-3">
          <button type="button" className={primary} onClick={async () => { const r = await fetch("/api/sales-tools/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save_places_queries", text: placesText }) }).then((x) => x.json()).catch(() => ({})); setPlacesMsg(r.ok ? `Saved ${r.saved} search${r.saved === 1 ? "" : "es"}.` : "Could not save."); }}>Save searches</button>
          {placesMsg ? <span className={note} role="status">{placesMsg}</span> : null}
        </div>
        <p className={`mt-2 ${note}`}>Found businesses join your lead list for review. Contact them only under your own consent and opt-out rules.</p>
      </Collapsible>

      <Collapsible title="Events" hint="A public page with an RSVP, capacity and an optional marketing tick">
        <div className={grid}>
          <Field id="ev-title" text="Event name"><input id="ev-title" className={field} value={evForm.title} onChange={(e) => setEvForm({ ...evForm, title: e.target.value })} /></Field>
          <Field id="ev-when" text="Date and time"><input id="ev-when" type="datetime-local" className={field} value={evForm.startsAt} onChange={(e) => setEvForm({ ...evForm, startsAt: e.target.value })} /></Field>
          <Field id="ev-place" text="Place (optional)"><input id="ev-place" className={field} value={evForm.place} onChange={(e) => setEvForm({ ...evForm, place: e.target.value })} /></Field>
          <Field id="ev-cap" text="Capacity (optional)"><input id="ev-cap" className={field} inputMode="numeric" value={evForm.capacity} onChange={(e) => setEvForm({ ...evForm, capacity: e.target.value })} /></Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button type="button" className={primary} onClick={async () => { const r = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...evForm, startsAt: evForm.startsAt ? new Date(evForm.startsAt).toISOString() : "" }) }).then((x) => x.json()).catch(() => ({})); setEvMsg(r.ok ? "Event created. Copy its link below." : (r.error || "Could not create.")); if (r.ok) { setEvForm({ title: "", startsAt: "", place: "", capacity: "" }); loadEvents(); } }}>Create event</button>
          {evMsg ? <span className={note} role="status">{evMsg}</span> : null}
        </div>
        <ul className="mt-4 space-y-2">
          {events.map((e) => (
            <li key={e.token} className={card}>
              <p className="text-sm font-medium">{e.title} · {new Date(e.startsAt).toLocaleString()}</p>
              <p className={note}>{e.going} going{e.spotsLeft !== null ? `, ${e.spotsLeft} spaces left` : ""}{e.consented ? `, ${e.consented} agreed to hear from you again` : ""}</p>
              <p className="mt-1 break-all font-mono text-xs">{typeof window !== "undefined" ? `${window.location.origin}/events/${e.token}` : `/events/${e.token}`}</p>
            </li>
          ))}
        </ul>
      </Collapsible>

      <Collapsible title="Patterns in your wins and losses" hint="What your buyers have in common, from your own call notes">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={patternBusy} className={primary} onClick={async () => { setPatternBusy(true); const r = await fetch("/api/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "patterns" }) }).then((x) => x.json()).catch(() => ({ error: "Could not reach the server." })); setPatternOut(r); setPatternBusy(false); }}>{patternBusy ? "Reading your notes..." : "Find the patterns"}</button>
        </div>
        {patternOut?.ok ? <div className={`${card} mt-3`}><p className="text-xs text-gray-600 dark:text-gray-300 mb-2">Based on {patternOut.basis.won} note{patternOut.basis.won === 1 ? "" : "s"} from won deals and {patternOut.basis.lost} from lost deals.</p><pre className="whitespace-pre-wrap text-sm font-sans">{patternOut.text}</pre></div> : patternOut?.error ? <p className="text-sm text-red-600 mt-2">{patternOut.error}</p> : null}
      </Collapsible>

      <Collapsible title="Check a message against your standard" hint="Nothing is sent. You get five points at most.">
        <Field id="std-text" text="Channel"><select id="std-text-channel" className={field} value={channel} onChange={(e) => { setChannel(e.target.value); setStandardText((manage?.standards || {})[e.target.value] || ""); }}><option value="general">General</option><option value="email">Email</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option><option value="web">Website copy</option><option value="video">Video scripts</option></select></Field>
        <Field id="std-text" text="Your standard for this channel, in a few sentences"><textarea id="std-text" className={field} rows={3} value={standardText} onChange={(e) => setStandardText(e.target.value)} placeholder="Warm, brief, plain English. No hype. Never promise what we cannot deliver." /></Field>
        <div className="mt-2 flex items-center gap-3"><button type="button" className={secondary} onClick={async () => { const r = await saveAction({ action: "save_standard", text: standardText, channel }); setStandardMsg(r.ok ? "Standard saved." : "Could not save."); loadManage(); }}>Save standard</button>{standardMsg ? <span className={note} role="status">{standardMsg}</span> : null}</div>
        <div className="mt-4"><Field id="critique-draft" text="Paste the message to check"><textarea id="critique-draft" className={field} rows={4} value={critiqueDraft} onChange={(e) => setCritiqueDraft(e.target.value)} /></Field></div>
        <div className="mt-2"><button type="button" disabled={critiqueBusy || critiqueDraft.trim().length < 10} className={primary} onClick={async () => { setCritiqueBusy(true); const r = await fetch("/api/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "critique", text: critiqueDraft, channel }) }).then((x) => x.json()).catch(() => ({ error: "Could not reach the server." })); setCritiqueOut(r); setCritiqueBusy(false); }}>{critiqueBusy ? "Checking..." : "Check it"}</button></div>
        {critiqueOut?.ok ? <pre className={`${card} mt-3 whitespace-pre-wrap text-sm font-sans`}>{critiqueOut.text}</pre> : critiqueOut?.error ? <p className="text-sm text-red-600 mt-2">{critiqueOut.error}</p> : null}
      </Collapsible>

      <Collapsible title="Ad spend audit" hint="Reads your synced spend and won deals only. Points to waste and the best source.">
        <button type="button" className={primary} onClick={async () => { const r = await fetch("/api/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "spend_audit" }) }).then((x) => x.json()).catch(() => ({ error: "Could not reach the server." })); setAuditOut(r); }}>Audit my ad spend</button>
        {auditOut?.ok ? <pre className={`${card} mt-3 whitespace-pre-wrap text-sm font-sans`}>{auditOut.text}</pre> : auditOut?.error ? <p className="text-sm text-red-600 mt-2">{auditOut.error}</p> : null}
      </Collapsible>

      <Collapsible title="Reactivate lost deals" hint="Groups lost deals by what they were interested in. Drafts only; nothing is sent.">
        <button type="button" className={primary} onClick={async () => { const r = await fetch("/api/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reactivation" }) }).then((x) => x.json()).catch(() => ({ error: "Could not reach the server." })); setReactOut(r); }}>Group and draft</button>
        {reactOut?.ok ? <pre className={`${card} mt-3 whitespace-pre-wrap text-sm font-sans`}>{reactOut.text}</pre> : reactOut?.error ? <p className="text-sm text-red-600 mt-2">{reactOut.error}</p> : null}
      </Collapsible>

      <Collapsible title="Proof bank" hint="Testimonials. Only lines marked yes (you hold written consent) are usable.">
        <Field id="proof-text" text="One per line: quote | customer | yes or no"><textarea id="proof-text" className={field} rows={4} value={proofText} onChange={(e) => setProofText(e.target.value)} placeholder={"They fixed our booking problem in a week. | Ann Clinic | yes"} /></Field>
        <div className="mt-2 flex items-center gap-3"><button type="button" className={primary} onClick={async () => { const r = await saveAction({ action: "save_proof", text: proofText }); setProofMsg(r.ok ? `Saved ${r.saved}. ${r.usable} usable.` : "Could not save."); loadManage(); }}>Save proof</button>{proofMsg ? <span className={note} role="status">{proofMsg}</span> : null}</div>
        <p className={`mt-2 ${note}`}>{approvedProof(parseProof(proofText)).length} usable now.</p>
      </Collapsible>

      <Collapsible title="Journeys" hint="Steps you send, one at a time, from your list. Nothing is sent for you.">
        <p className={note}>One step per line: "wait days | email or sms | message". Up to eight steps. A reply to a journey stops it for that person.</p>
        <div className={grid}>
          <Field id="j-name" text="Journey name"><input id="j-name" className={field} value={journeyName} onChange={(e) => setJourneyName(e.target.value)} /></Field>
          <Field id="j-enrol" text="Enrol these emails (comma or space separated)"><input id="j-enrol" className={field} value={enrolEmails} onChange={(e) => setEnrolEmails(e.target.value)} /></Field>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={enrolAgreed} onChange={(e) => setEnrolAgreed(e.target.checked)} /><span>These people have agreed to hear from me by email. Tick only if that is true; automatic sending (when switched on in Account) needs it.</span></label>
        <div className="mt-3 flex flex-wrap gap-2">{Object.entries(JOURNEY_PRESETS).map(([id, p]) => (<button key={id} type="button" className={secondary} onClick={() => { setJourneyName(p.name); setJourneyText(p.text); }}>Start from {p.name.toLowerCase()}</button>))}</div>
        <textarea id="j-steps" className={`${field} mt-3`} rows={4} value={journeyText} onChange={(e) => setJourneyText(e.target.value)} placeholder={"0 | email | Thanks for getting in touch. Here is what we do.\n3 | email | Did you get a chance to look?"} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={primary} onClick={async () => { const r = await saveAction({ action: "save_journey", name: journeyName, text: journeyText }); setJourneyMsg(r.ok ? `Journey saved with ${r.steps} step${r.steps === 1 ? "" : "s"}.` : (r.error || "Could not save.")); loadManage(); }}>Save journey</button>
          {(manage?.journeys || []).map((j) => (
            <button key={j.id} type="button" className={secondary} onClick={async () => { const r = await saveAction({ action: "enrol", journeyId: j.id, emails: enrolEmails, agreed: enrolAgreed }); setJourneyMsg(r.ok ? `Enrolled ${r.enrolled}.` : (r.error || "Could not enrol.")); loadManage(); }}>Enrol into {j.name}</button>
          ))}
        </div>
        {journeyMsg ? <p className={`mt-2 ${note}`} role="status">{journeyMsg}</p> : null}
        {manage?.dueSteps?.length ? (
          <ul className="mt-4 space-y-2">
            {manage.dueSteps.map((d) => (
              <li key={d.enrolmentId} className={card}>
                <p className="text-sm font-medium">{d.journey}: step {d.stepIndex + 1} of {d.total} for {d.email} ({d.channel})</p>
                <p className={`mt-1 ${note}`}>{d.text}</p>
                <button type="button" className={`${secondary} mt-2`} onClick={async () => { await saveAction({ action: "mark_step_sent", enrolmentId: d.enrolmentId }); loadManage(); }}>I have sent this step</button>
              </li>
            ))}
          </ul>
        ) : <p className={`mt-3 ${note}`}>No steps are due right now.</p>}
      </Collapsible>

      <Collapsible title="Short video brief" hint="For creators or customers who make videos for you">
        <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100 font-sans">{manage?.ugc || ""}</pre>
      </Collapsible>

      <Collapsible title="Contract or NDA draft" hint="Filled from the deal; the legal terms are for a lawyer to write">
        <div className={grid}>
          <Field id="a-kind" text="Type"><select id="a-kind" className={field} value={agr.kind} onChange={(e) => setAgr({ ...agr, kind: e.target.value })}><option value="service">Service agreement</option><option value="nda">NDA</option></select></Field>
          <Field id="a-date" text="Date"><input id="a-date" className={field} value={agr.date} onChange={(e) => setAgr({ ...agr, date: e.target.value })} placeholder="2026-11-06" /></Field>
          <Field id="a-seller" text="Your business"><input id="a-seller" className={field} value={agr.seller} onChange={(e) => setAgr({ ...agr, seller: e.target.value })} /></Field>
          <Field id="a-buyer" text="Customer"><input id="a-buyer" className={field} value={agr.buyer} onChange={(e) => setAgr({ ...agr, buyer: e.target.value })} /></Field>
          <Field id="a-value" text="Fee (service agreement)"><input id="a-value" className={field} inputMode="decimal" value={agr.value} onChange={(e) => setAgr({ ...agr, value: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field id="a-scope" text="What the work is"><input id="a-scope" className={field} value={agr.scope} onChange={(e) => setAgr({ ...agr, scope: e.target.value })} /></Field></div>
        </div>
        <div className="mt-3"><button type="button" onClick={makeDraft} className={primary}>Make the draft</button></div>
        {agrErr ? <p className="text-sm text-red-600 mt-2">{agrErr}</p> : null}
        {draft ? <pre className="whitespace-pre-wrap text-sm mt-3 text-gray-900 dark:text-gray-100 font-sans">{draft}</pre> : null}
        {draft ? (
          <div className="mt-3 space-y-2">
            <div className={grid}>
              <Field id="e-name" text="Signer's full name"><input id="e-name" className={field} value={agr.signerName || ""} onChange={(e) => setAgr({ ...agr, signerName: e.target.value })} /></Field>
              <Field id="e-email" text="Signer's email"><input id="e-email" className={field} value={agr.signerEmail || ""} onChange={(e) => setAgr({ ...agr, signerEmail: e.target.value })} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!agr.testMode} onChange={(e) => setAgr({ ...agr, testMode: e.target.checked })} /> Test send (not legally binding)</label>
            <button type="button" className={primary} onClick={async () => {
              const r = await fetch("/api/esign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", text: draft, title: agr.kind === "nda" ? "Mutual Non-Disclosure Agreement" : "Service Agreement", signerEmail: agr.signerEmail || "", signerName: agr.signerName || "", testMode: !!agr.testMode }) }).then((x) => x.json()).catch(() => ({ error: "Could not reach the server." }));
              setLink(r.ok ? `Sent for electronic signature. Status is checked daily.` : ""); setAgrErr(r.ok ? "" : (r.error || "Could not send."));
            }}>Send for electronic signature</button>
            <Field id="a-to" text="Send to (their email, for your records)"><input id="a-to" className={field} value={agr.email || ""} onChange={(e) => setAgr({ ...agr, email: e.target.value })} /></Field>
            <button type="button" className={primary} onClick={async () => {
              const r = await fetch("/api/agreements/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: draft, title: agr.kind === "nda" ? "Mutual Non-Disclosure Agreement" : "Service Agreement", email: agr.email || "" }) }).then((x) => x.json()).catch(() => ({ error: "Could not reach the server." }));
              setLink(r.ok ? r.link : ""); setAgrErr(r.ok ? "" : (r.error || "Could not make the link."));
            }}>Make a link to accept by typed name</button>
            {link ? <p className={note}>Send this link: <span className="break-all font-mono text-xs">{link}</span>. It works for {14} days and only once.</p> : null}
          </div>
        ) : null}
        <p className={`mt-2 ${note}`}>This is a draft for a lawyer to review before anyone signs. It is not legal advice.</p>
      </Collapsible>
    </div>
  );
}
