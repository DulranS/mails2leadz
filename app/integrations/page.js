"use client";
// Integrations: which services are connected for THIS account, and where each key comes from. Keys are entered here, stored
// encrypted for this account, and never shown again (the page only shows whether a key is set). Self-hosted owners may instead put
// keys in the server settings; the page says so.
import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { useAuthUser } from "../components/AuthProvider";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const solid = `${btn} bg-teal-600 hover:bg-teal-500 text-white`;
const ghost = `${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`;
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const BADGE = {
  ready: ["Ready", "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200"],
  needs_keys: ["Needs keys", "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"],
  not_built: ["Not built yet", "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200"],
};
const KEY_GROUPS = [
  { title: "Ad spend", items: [
    ["META_ACCESS_TOKEN", "Meta access token", true], ["META_AD_ACCOUNT_ID", "Meta ad account id", false],
    ["GOOGLE_ADS_DEVELOPER_TOKEN", "Google Ads developer token", true], ["GOOGLE_ADS_CLIENT_ID", "Google Ads client id", false],
    ["GOOGLE_ADS_CLIENT_SECRET", "Google Ads client secret", true], ["GOOGLE_ADS_REFRESH_TOKEN", "Google Ads refresh token", true],
    ["GOOGLE_ADS_CUSTOMER_ID", "Google Ads customer id", false], ["GOOGLE_ADS_LOGIN_CUSTOMER_ID", "Google Ads manager id (optional)", false],
  ] },
  { title: "Company contact lookup (Hunter)", items: [
    ["HUNTER_API_KEY", "Hunter API key", true],
  ] },
  { title: "Card payments on invoices (your own Stripe account)", items: [
    ["STRIPE_PAYMENTS_SECRET_KEY", "Stripe secret key", true], ["STRIPE_PAYMENTS_WEBHOOK_SECRET", "Stripe webhook secret", true],
  ] },
  { title: "Twilio (SMS, calls, WhatsApp and AI calls)", items: [
    ["TWILIO_ACCOUNT_SID", "Twilio account SID", false], ["TWILIO_AUTH_TOKEN", "Twilio auth token", true],
    ["TWILIO_PHONE_NUMBER", "Phone number for SMS and calls", false],
    ["TWILIO_WHATSAPP_FROM", "WhatsApp sender number", false],
    ["TWILIO_WA_TEMPLATE_QUOTE", "Approved template id: quote", false],
    ["TWILIO_WA_TEMPLATE_FOLLOWUP", "Approved template id: follow-up", false],
    ["TWILIO_WA_TEMPLATE_INVOICE", "Approved template id: invoice", false],
  ] },
];

async function post(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok !== false, data };
}

export default function IntegrationsPage() {
  const { user, ready } = useAuthUser();
  const [items, setItems] = useState([]);
  const [presence, setPresence] = useState({});
  const [vaultReady, setVaultReady] = useState(true);
  const [saas, setSaas] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState({ email: "", phone: "", agreed: false });
  const [send, setSend] = useState({ email: "", kind: "quote", v1: "", v2: "" });
  const [voiceConsent, setVoiceConsent] = useState({ email: "", phone: "", agreed: false });
  const [call, setCall] = useState({ email: "", purpose: "" });
  const [calls, setCalls] = useState([]);
  const [replies, setReplies] = useState([]);
  const [unmatched, setUnmatched] = useState([]);
  const [domain, setDomain] = useState("");
  const [attach, setAttach] = useState({});
  const [checks, setChecks] = useState({});
  const [contacts, setContacts] = useState([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Could not read the connections."); return; }
      setItems(data.items || []); setPresence(data.presence || {}); setVaultReady(data.vaultReady !== false); setSaas(data.saas === true);
      setError("");
    } catch (e) { console.error(e); setError("Could not read the connections."); }
  }, []);
  useEffect(() => { if (ready && user) load(); }, [ready, user, load]);
  const loadCalls = useCallback(async () => {
    try {
      const res = await fetch("/api/voice/calls");
      const data = await res.json().catch(() => ({}));
      if (res.ok) setCalls(data.items || []);
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { if (ready && user) loadCalls(); }, [ready, user, loadCalls]);
  const loadReplies = useCallback(async () => {
    try {
      const res = await fetch("/api/inbound/messages");
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setReplies(data.items || []); setUnmatched(data.unmatched || []); }
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { if (ready && user) loadReplies(); }, [ready, user, loadReplies]);

  const run = async (fn) => { setBusy(true); setError(""); setNotice(""); try { await fn(); } catch (e) { console.error(e); setError("Something went wrong. Try again."); } finally { setBusy(false); } };

  const saveKey = (name, value) => run(async () => {
    const r = await post("/api/integrations/secrets", { name, value });
    if (!r.ok) { setError(r.data.error || "Could not save the key."); return; }
    setDrafts((d) => ({ ...d, [name]: "" }));
    setNotice(r.data.set ? "Saved for this account. It is not shown again." : "Removed.");
    await load();
  });

  const syncSpend = () => run(async () => {
    const r = await post("/api/ad-spend/sync", {});
    if (!r.ok) { setError(r.data.error || "Could not sync the spend."); return; }
    const lines = Object.entries(r.data.result || {}).filter(([, v]) => v).map(([src, v]) => {
      const name = src === "meta" ? "Meta Ads" : "Google Ads";
      if (v.error) return `${name}: ${v.error}`;
      return `${name}: ${v.imported.length ? `imported ${v.imported.join(", ")}` : "nothing new"}${v.skipped?.length ? `; kept your own entries for ${v.skipped.join(", ")}` : ""}.`;
    });
    setNotice(lines.join(" ") || "Nothing to sync yet.");
  });

  const recordConsent = () => run(async () => {
    const r = await post("/api/whatsapp/consent", { email: consent.email, phone: consent.phone, consent: consent.agreed });
    if (!r.ok) { setError(r.data.error || "Could not save the consent."); return; }
    setNotice(consent.agreed ? "Consent recorded. You can now send a WhatsApp template to this customer." : "Withdrawn. No WhatsApp messages will be sent to this customer.");
  });

  const sendTemplate = () => run(async () => {
    const r = await post("/api/whatsapp/send", { email: send.email, kind: send.kind, variables: { "1": send.v1, "2": send.v2 } });
    if (!r.ok) { setError(r.data.error || "Could not send."); return; }
    setNotice("WhatsApp template sent.");
  });

  const recordVoiceConsent = () => run(async () => {
    const r = await post("/api/voice/consent", { email: voiceConsent.email, phone: voiceConsent.phone, consent: voiceConsent.agreed });
    if (!r.ok) { setError(r.data.error || "Could not save the consent."); return; }
    setNotice(voiceConsent.agreed ? "Agreement recorded. An AI call can now be made to this person, within calling hours." : "Withdrawn. No AI calls will be made to this person.");
  });

  const startCall = () => run(async () => {
    const r = await post("/api/voice/call", { email: call.email, purpose: call.purpose });
    if (!r.ok) { setError(r.data.error || "The call was not made."); return; }
    setNotice("The call is being placed. It appears in the list below, with what was said, once it has happened.");
    await loadCalls();
  });

  const testConnection = (service) => run(async () => {
    const r = await post("/api/integrations/test", { service });
    setChecks((c) => ({ ...c, [service]: { ok: !!r.data.ok, message: r.data.message || r.data.error || "No answer." } }));
  });

  const attachNumber = (phone) => run(async () => {
    const a = attach[phone] || {};
    const r = await post("/api/inbound/attach", { phone, email: a.email, businessName: a.businessName });
    if (!r.ok) { setError(r.data.error || "Could not make the lead."); return; }
    setNotice(`Lead made for ${r.data.email}. Earlier replies from this number are linked to it.`);
    await loadReplies();
  });

  const listenToCall = async (id) => {
    setError("");
    try {
      const res = await fetch(`/api/voice/recording-audio?id=${encodeURIComponent(id)}`);
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.error || "The recording could not be played."); return; }
      const audio = new Audio(URL.createObjectURL(await res.blob()));
      audio.play();
    } catch (e) { console.error(e); setError("The recording could not be played."); }
  };

  const addContactsToInbox = () => run(async () => {
    const r = await post("/api/contacts/inbox", { domain: domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0], contacts: contacts.map((c) => ({ email: c.email, name: c.name, position: c.position })) });
    if (!r.ok) { setError(r.data.error || "Could not add the contacts."); return; }
    const sk = r.data.skipped || {};
    setNotice(`${r.data.added} added to the outreach inbox. Skipped: ${sk.blocked || 0} opted out, ${sk.contacted || 0} already emailed, ${sk.known || 0} already customers or enquiries, ${sk.duplicate || 0} duplicates, ${sk.invalid || 0} invalid.`);
  });

  const lookupCompany = () => run(async () => {
    const r = await post("/api/contacts/lookup", { domain });
    if (!r.ok) { setError(r.data.error || "The lookup did not run."); setContacts([]); return; }
    setContacts(r.data.contacts || []);
    setNotice(r.data.contacts?.length ? `${r.data.contacts.length} contact${r.data.contacts.length === 1 ? "" : "s"} found at ${r.data.domain}. Nothing was saved.` : `No public contacts found at ${r.data.domain}.`);
  });

  const find = (id) => items.find((i) => i.id === id);
  const adReady = ["meta_ads", "google_ads"].some((id) => find(id)?.state === "ready");
  const waReady = find("whatsapp")?.state === "ready";

  const keyRow = ([name, label, secret]) => {
    const where = presence[name];
    const status = where === "account" ? "Set for this account" : where === "server" ? "Set in the server settings" : "Not set";
    return (
      <div key={name} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
        <div className="sm:col-span-4 text-sm text-gray-700 dark:text-gray-200"><div>{label}</div><div className="text-xs text-gray-500 dark:text-gray-400">{status}</div></div>
        <label className="sm:col-span-5 text-xs text-gray-500 dark:text-gray-400">Enter a new value<input className={field} type={secret ? "password" : "text"} autoComplete="off" value={drafts[name] || ""} onChange={(e) => setDrafts((d) => ({ ...d, [name]: e.target.value }))} /></label>
        <div className="sm:col-span-3 flex gap-2">
          <button type="button" disabled={busy || !vaultReady || !(drafts[name] || "").trim()} onClick={() => saveKey(name, drafts[name])} className={solid}>Save</button>
          {where === "account" && <button type="button" disabled={busy} onClick={() => saveKey(name, "")} className={ghost}>Remove</button>}
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout title="Integrations" subtitle="Connect a service with its keys. Keys are stored encrypted for this account and are never shown again.">
      <div className="space-y-4">
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        {notice && <p role="status" className="text-sm text-teal-700 dark:text-teal-300">{notice}</p>}
        {!vaultReady && (
          <section className={card}>
            <p className="text-sm text-amber-700 dark:text-amber-300">Keys cannot be saved for each account yet: the server owner needs to set TOKEN_ENC_KEY first. {saas ? "" : "Self-hosted owners can put these keys in the server settings instead."}</p>
          </section>
        )}

        {items.map((i) => {
          const [label, cls] = BADGE[i.state] || BADGE.needs_keys;
          return (
            <section key={i.id} className={card}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-gray-900 dark:text-white">{i.label}</h2>
                <span className={`text-xs px-2 py-1 rounded-full ${cls}`}>{label}</span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-200 mt-2"><span className="font-medium">Unlocks:</span> {i.unlocks}</p>
              {i.state !== "not_built" && <p className="text-sm text-gray-700 dark:text-gray-200 mt-1"><span className="font-medium">Runs by itself:</span> {i.automatic}</p>}
              {i.state !== "not_built" && <p className="text-sm text-gray-700 dark:text-gray-200 mt-1"><span className="font-medium">Consent and limits:</span> {i.consent}</p>}
              {i.state === "needs_keys" && <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">Still needed: {i.missing.join("; ")}</p>}
              {i.state === "not_built" && <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">{i.reason}</p>}
              {i.state === "ready" && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="button" disabled={busy} onClick={() => testConnection(i.id)} className={ghost}>Test this connection</button>
                  {checks[i.id] && <span className={`text-sm ${checks[i.id].ok ? "text-teal-700 dark:text-teal-300" : "text-red-600 dark:text-red-300"}`}>{checks[i.id].message}</span>}
                </div>
              )}
            </section>
          );
        })}

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Keys</h2>
          <div className="space-y-4">
            {KEY_GROUPS.map((g) => (
              <div key={g.title} className="space-y-2">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{g.title}</p>
                {g.items.map(keyRow)}
              </div>
            ))}
          </div>
          {!saas && <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">Self-hosted: a key you do not set here can come from the server settings (.env), and the page says where it is set.</p>}
        </section>

        {adReady && (
          <section className={card}>
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Sync ad spend</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Brings in the last three months from each connected ad account. It also runs nightly once the morning brief is on. Months you entered by hand are kept as they are.</p>
            <button type="button" disabled={busy} onClick={syncSpend} className={solid}>Sync now</button>
          </section>
        )}

        {waReady && (
          <>
            <section className={card}>
              <h2 className="font-semibold text-gray-900 dark:text-white mb-1">WhatsApp: record consent</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Tick only when the customer has told you, in writing or in person, that they agree to WhatsApp messages from you.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm text-gray-700 dark:text-gray-200">Customer email<input className={field} type="email" value={consent.email} onChange={(e) => setConsent({ ...consent, email: e.target.value })} /></label>
                <label className="text-sm text-gray-700 dark:text-gray-200">WhatsApp number (with country code)<input className={field} value={consent.phone} onChange={(e) => setConsent({ ...consent, phone: e.target.value })} /></label>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 mt-3 min-h-[44px]"><input type="checkbox" checked={consent.agreed} onChange={(e) => setConsent({ ...consent, agreed: e.target.checked })} /> The customer agreed to WhatsApp messages from me</label>
              <button type="button" disabled={busy || !consent.email || !consent.phone} onClick={recordConsent} className={`${solid} mt-2`}>Save</button>
            </section>
            <section className={card}>
              <h2 className="font-semibold text-gray-900 dark:text-white mb-1">WhatsApp: send an approved template</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Only to a customer with consent on record. The text comes from the template Meta approved; fill in its variables.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm text-gray-700 dark:text-gray-200">Customer email<input className={field} type="email" value={send.email} onChange={(e) => setSend({ ...send, email: e.target.value })} /></label>
                <label className="text-sm text-gray-700 dark:text-gray-200">Message kind<select className={field} value={send.kind} onChange={(e) => setSend({ ...send, kind: e.target.value })}><option value="quote">Quote</option><option value="followup">Follow-up</option><option value="invoice">Invoice</option></select></label>
                <label className="text-sm text-gray-700 dark:text-gray-200">Variable 1<input className={field} value={send.v1} onChange={(e) => setSend({ ...send, v1: e.target.value })} /></label>
                <label className="text-sm text-gray-700 dark:text-gray-200">Variable 2<input className={field} value={send.v2} onChange={(e) => setSend({ ...send, v2: e.target.value })} /></label>
              </div>
              <button type="button" disabled={busy || !send.email} onClick={sendTemplate} className={`${solid} mt-2`}>Send on WhatsApp</button>
            </section>
          </>
        )}

        {find("voice_agent")?.state === "ready" && (
          <>
            <section className={card}>
              <h2 className="font-semibold text-gray-900 dark:text-white mb-1">AI calls: record agreement</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Only when the person has agreed to AI phone calls from you. Check the law where the person is before you call. Withdrawing stops calls at once.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm text-gray-700 dark:text-gray-200">Email<input className={field} type="email" value={voiceConsent.email} onChange={(e) => setVoiceConsent({ ...voiceConsent, email: e.target.value })} /></label>
                <label className="text-sm text-gray-700 dark:text-gray-200">Phone number (with country code)<input className={field} value={voiceConsent.phone} onChange={(e) => setVoiceConsent({ ...voiceConsent, phone: e.target.value })} /></label>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 mt-3 min-h-[44px]"><input type="checkbox" checked={voiceConsent.agreed} onChange={(e) => setVoiceConsent({ ...voiceConsent, agreed: e.target.checked })} /> The person agreed to AI phone calls from me</label>
              <button type="button" disabled={busy || !voiceConsent.email || !voiceConsent.phone} onClick={recordVoiceConsent} className={`${solid} mt-2`}>Save</button>
            </section>
            <section className={card}>
              <h2 className="font-semibold text-gray-900 dark:text-white mb-1">AI calls: start a call</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">The assistant introduces itself as an AI, stops at once if asked, and hands anything outside the purpose to a person. It never quotes prices.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm text-gray-700 dark:text-gray-200">Email of the person (must have agreed)<input className={field} type="email" value={call.email} onChange={(e) => setCall({ ...call, email: e.target.value })} /></label>
                <label className="text-sm text-gray-700 dark:text-gray-200">What the call is about (one sentence)<input className={field} value={call.purpose} onChange={(e) => setCall({ ...call, purpose: e.target.value })} /></label>
              </div>
              <button type="button" disabled={busy || !call.email || call.purpose.trim().length < 8} onClick={startCall} className={`${solid} mt-2`}>Start the call</button>
            </section>
            <section className={card}>
              <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Recent AI calls</h2>
              {calls.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No AI calls yet.</p>}
              <ul className="space-y-3">
                {calls.slice(0, 20).map((c) => (
                  <li key={c.id} className="border-b border-gray-100 dark:border-gray-700 pb-3 last:border-0">
                    <p className="text-sm text-gray-900 dark:text-white">{c.direction === "inbound" ? "Inbound call" : c.purpose} <span className="text-gray-500 dark:text-gray-400">{c.direction === "inbound" ? `from ${c.phone}` : `with ${c.email}`}</span></p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{c.startedAt ? c.startedAt.slice(0, 16).replace("T", " ") : ""} · {c.status === "ended" ? `ended${c.endReason ? ` (${c.endReason.replace(/_/g, " ")})` : ""}` : c.status}</p>
                    {c.recording && <button type="button" onClick={() => listenToCall(c.id)} className="text-xs text-teal-700 dark:text-teal-300 underline mt-1">Listen to the recording ({c.recording.duration}s)</button>}
                    {c.turns.length > 0 && <details className="mt-1"><summary className="text-xs text-teal-700 dark:text-teal-300 cursor-pointer">What was said</summary><div className="mt-1 space-y-1">{c.turns.map((t, i) => <p key={i} className="text-xs text-gray-700 dark:text-gray-200"><span className="font-medium">{t.role === "caller" ? "Them" : "Assistant"}:</span> {t.text}</p>)}</div></details>}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Replies by SMS and WhatsApp</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Every reply sent to your numbers is recorded here. A STOP withdraws that person's consent and stops emails to them. Numbers saved before this update need to be saved again once, so their replies can be matched.</p>
          {replies.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No replies yet.</p>}
          <ul className="space-y-2">
            {replies.slice(0, 30).map((r) => (
              <li key={r.id} className="text-sm border-b border-gray-100 dark:border-gray-700 pb-2 last:border-0">
                <span className="text-xs text-gray-500 dark:text-gray-400">{r.receivedAt ? r.receivedAt.slice(0, 16).replace("T", " ") : ""} · {r.channel} · {r.from}{r.matchedEmail ? ` · ${r.matchedEmail}` : " · not matched to a customer"}</span>
                <p className="text-gray-900 dark:text-white">{r.body || <span className="text-gray-400">(empty)</span>}</p>
              </li>
            ))}
          </ul>
          {unmatched.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">Numbers with no matching customer</p>
              <ul className="space-y-1">
                {unmatched.map((u) => (
                  <li key={u.phone} className="text-xs text-gray-700 dark:text-gray-200 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <div>{u.phone} · {u.channel} · {u.count} message{u.count === 1 ? "" : "s"} · last: "{u.lastBody}"</div>
                    {u.attachedEmail ? <div className="text-teal-700 dark:text-teal-300">Linked to {u.attachedEmail} as a lead</div> : (
                      <div className="flex flex-wrap gap-2 mt-1">
                        <input className={field} style={{ maxWidth: 260 }} placeholder="Their email" value={attach[u.phone]?.email || ""} onChange={(e) => setAttach({ ...attach, [u.phone]: { ...(attach[u.phone] || {}), email: e.target.value } })} />
                        <input className={field} style={{ maxWidth: 200 }} placeholder="Business name (optional)" value={attach[u.phone]?.businessName || ""} onChange={(e) => setAttach({ ...attach, [u.phone]: { ...(attach[u.phone] || {}), businessName: e.target.value } })} />
                        <button type="button" disabled={busy || !attach[u.phone]?.email} onClick={() => attachNumber(u.phone)} className={solid}>Make a lead</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">A lead is made only when you add the person's email. It does not give consent to any messages.</p>
            </div>
          )}
        </section>

        {find("contact_lookup")?.state === "ready" && (
          <section className={card}>
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Find contacts at a company</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Public business contacts at a company's website. Nothing is saved; choose who to add in the CRM. Each lookup uses your Hunter credits.</p>
            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-sm text-gray-700 dark:text-gray-200 flex-1 min-w-[200px]">Company website<input className={field} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" /></label>
              <button type="button" disabled={busy || !domain.trim()} onClick={lookupCompany} className={solid}>Look up</button>
            </div>
            {contacts.length > 0 && (
              <div className="mt-3"><button type="button" disabled={busy} onClick={addContactsToInbox} className={solid}>Add all {contacts.length} to the outreach inbox</button></div>
            )}
            {contacts.length > 0 && (
              <ul className="mt-3 space-y-2">
                {contacts.map((c) => (
                  <li key={c.email} className="text-sm border-b border-gray-100 dark:border-gray-700 pb-2 last:border-0">
                    <span className="text-gray-900 dark:text-white">{c.email}</span>
                    <span className="text-gray-500 dark:text-gray-400"> {c.name ? `· ${c.name}` : ""} {c.position ? `· ${c.position}` : ""} · confidence {c.confidence}%</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
