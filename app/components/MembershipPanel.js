"use client";
// The owner's monthly membership: the plan, the offer to copy and send, and members added by email.
// Taking payment is not part of this: a member is recorded on their deal with the monthly amount, and the owner marks it won when paid.
import React, { useEffect, useState } from "react";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5 space-y-3";
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium bg-blue-600 text-white";
const JSON_HEADERS = { "Content-Type": "application/json" };

export default function MembershipPanel() {
  const [offer, setOffer] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [includes, setIncludes] = useState("");
  const [currency, setCurrency] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberName, setMemberName] = useState("");
  const [hasPlan, setHasPlan] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => fetch("/api/membership")
    .then((r) => r.json())
    .then((j) => {
      if (j && j.plan) {
        setHasPlan(true);
        setName(j.plan.name || "");
        setPrice(String(j.plan.monthlyPrice || ""));
        setIncludes(j.plan.includes || "");
        setCurrency(j.plan.currency || "");
        setOffer(j.offer || "");
      }
    })
    .catch(() => {});

  useEffect(() => { load(); }, []);

  const savePlan = async (e) => {
    e.preventDefault();
    setMsg("");
    const r = await fetch("/api/membership", { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ name, monthlyPrice: price, includes, currency }) })
      .then((x) => x.json()).catch(() => ({ ok: false, error: "Could not reach the server." }));
    if (r.ok) { setMsg("Membership saved."); load(); } else setMsg(r.error || "Could not save that.");
  };

  const addMember = async (e) => {
    e.preventDefault();
    setMsg("");
    const r = await fetch("/api/membership", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ email: memberEmail, businessName: memberName }) })
      .then((x) => x.json()).catch(() => ({ ok: false, error: "Could not reach the server." }));
    if (r.ok) {
      setMsg(`Added ${r.email} as a member. Mark the deal won when the first payment arrives.`);
      setMemberEmail("");
      setMemberName("");
    } else setMsg(r.error || "Could not add that member.");
  };

  const copyOffer = async () => {
    try { await navigator.clipboard.writeText(offer); setMsg("Offer copied."); } catch { setMsg("Could not copy. Select the text and copy it."); }
  };

  return (
    <section className={card} aria-label="Monthly membership">
      <p className="font-medium text-gray-900 dark:text-white text-sm">Monthly membership</p>
      <form onSubmit={savePlan} className="space-y-2">
        <label htmlFor="mem-name" className="text-xs text-gray-600 dark:text-gray-300">Membership name</label>
        <input id="mem-name" className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        <label htmlFor="mem-price" className="text-xs text-gray-600 dark:text-gray-300">Monthly price</label>
        <input id="mem-price" type="number" min="0" step="0.01" className={field} value={price} onChange={(e) => setPrice(e.target.value)} required />
        <label htmlFor="mem-currency" className="text-xs text-gray-600 dark:text-gray-300">Currency (optional, e.g. USD)</label>
        <input id="mem-currency" className={field} value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} />
        <label htmlFor="mem-includes" className="text-xs text-gray-600 dark:text-gray-300">What it includes</label>
        <input id="mem-includes" className={field} value={includes} onChange={(e) => setIncludes(e.target.value)} maxLength={300} />
        <button type="submit" className={btn}>Save membership</button>
      </form>

      {hasPlan ? (
        <>
          <div className="space-y-2">
            <p className="text-xs text-gray-600 dark:text-gray-300">Offer to send</p>
            <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">{offer}</pre>
            <button type="button" className={btn} onClick={copyOffer}>Copy offer</button>
          </div>
          <form onSubmit={addMember} aria-label="Add member" className="space-y-2">
            <label htmlFor="mem-email" className="text-xs text-gray-600 dark:text-gray-300">Member email</label>
            <input id="mem-email" type="email" className={field} value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} required maxLength={254} />
            <label htmlFor="mem-business" className="text-xs text-gray-600 dark:text-gray-300">Business name (optional)</label>
            <input id="mem-business" className={field} value={memberName} onChange={(e) => setMemberName(e.target.value)} maxLength={120} />
            <button type="submit" className={btn}>Add member</button>
          </form>
        </>
      ) : null}

      {msg ? <p role="status" className="text-sm text-gray-700 dark:text-gray-200">{msg}</p> : null}
    </section>
  );
}
