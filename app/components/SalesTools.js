"use client";
import React, { useEffect, useState } from "react";
import Collapsible from "./Collapsible.js";
import { pitchOutline } from "../../lib/pitch.js";

// Pricing check, pitch outline and agreement draft. Built only from what you enter; nothing is sent.
const field = "w-full min-h-[40px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100";
const label = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";
const primary = "min-h-[40px] px-4 py-2 rounded-md bg-gray-900 text-white text-sm hover:bg-gray-700 dark:bg-white dark:text-gray-900";
const card = "rounded-md border border-gray-200 dark:border-gray-700 p-3 text-sm";
const note = "text-xs text-gray-600 dark:text-gray-300";
const grid = "grid grid-cols-1 sm:grid-cols-2 gap-3";

function Field({ id, text, children }) { return <div><label htmlFor={id} className={label}>{text}</label>{children}</div>; }

export default function SalesTools() {
  const [outline, setOutline] = useState("");
  const [priceHint, setPriceHint] = useState({});
  useEffect(() => {
    fetch("/api/kpis").then((r) => r.json()).then((j) => {
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
            <span>Subtotal</span><strong>{out.subtotal}</strong>
            <span>Discount</span><strong>{out.discountAmount}</strong>
            <span>Tax</span><strong>{out.tax}</strong>
            <span>Total</span><strong>{out.total}</strong>
            <span>Deposit now</span><strong>{out.deposit}</strong>
            <span>Balance later</span><strong>{out.balance}</strong>
            <span>Per item</span><strong>{out.perUnit}</strong>
          </div>
        ) : out?.error ? <p className="text-sm text-red-600 mt-2">{out.error}</p> : null}
        {priceHint.typical ? <p className={`mt-2 ${note}`}>Your typical price is {priceHint.typical}.</p> : null}
      </Collapsible>

      <Collapsible title="Pitch outline and deck" hint="Built from your own details and numbers; the rest is yours to write">
        <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100 font-sans">{outline || "Save your business details first, then this outline fills in."}</pre>
        <div className="mt-3"><a className={primary} href="/api/sales-tools/deck" target="_blank" rel="noopener noreferrer">Open the deck (print it to PDF)</a></div>
        <p className={`mt-2 ${note}`}>The deck opens as slides. Use your browser's Print, then Save as PDF.</p>
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
