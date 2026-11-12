"use client";
import React, { useEffect, useState } from "react";

// Lists and segments, email broadcasts you approve before anything is sent, consent records, and the campaign report.
const field = "w-full min-h-[40px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100";
const label = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";
const primary = "min-h-[40px] px-4 py-2 rounded-md bg-gray-900 text-white text-sm dark:bg-white dark:text-gray-900";
const secondary = "min-h-[40px] px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-800 dark:text-gray-100";
const card = "rounded-md border border-gray-200 dark:border-gray-700 p-3 text-sm";
const note = "text-xs text-gray-600 dark:text-gray-300";
const post = (body) => fetch("/api/broadcasts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json().catch(() => ({})));
const list = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);

export default function Broadcasts() {
  const [filter, setFilter] = useState({ tags: "", sources: "", stages: "", city: "", minValue: "", activeWithinDays: "" });
  const [preview, setPreview] = useState(null);
  const [draft, setDraft] = useState({ name: "", subject: "", text: "" });
  const [msg, setMsg] = useState("");
  const [data, setData] = useState({ broadcasts: [], report: [] });
  const [confirmFor, setConfirmFor] = useState({});
  const [consentEmail, setConsentEmail] = useState("");
  const [consentOk, setConsentOk] = useState(false);

  const load = () => fetch("/api/broadcasts").then((r) => r.json()).then((j) => { if (j.broadcasts) setData(j); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const segment = () => ({ tags: list(filter.tags), sources: list(filter.sources), stages: list(filter.stages), city: filter.city.trim(), minValue: Number(filter.minValue) || 0, activeWithinDays: Number(filter.activeWithinDays) || 0 });

  return (
    <div className="space-y-4 px-2">
      <p className={note}>Nothing is sent until you approve a batch. Only people who agreed to hear from you are included, and anyone who opted out is always left out.</p>
      {msg ? <p role="status" className="text-sm rounded-md bg-gray-100 dark:bg-gray-700 px-3 py-2">{msg}</p> : null}

      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Who to reach</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><label htmlFor="sg-tags" className={label}>Tags (any of)</label><input id="sg-tags" className={field} value={filter.tags} onChange={(e) => setFilter({ ...filter, tags: e.target.value })} placeholder="vip, referral" /></div>
          <div><label htmlFor="sg-sources" className={label}>Sources (any of)</label><input id="sg-sources" className={field} value={filter.sources} onChange={(e) => setFilter({ ...filter, sources: e.target.value })} placeholder="meta, google" /></div>
          <div><label htmlFor="sg-stages" className={label}>Stages (any of)</label><input id="sg-stages" className={field} value={filter.stages} onChange={(e) => setFilter({ ...filter, stages: e.target.value })} placeholder="won, proposal" /></div>
          <div><label htmlFor="sg-city" className={label}>City contains</label><input id="sg-city" className={field} value={filter.city} onChange={(e) => setFilter({ ...filter, city: e.target.value })} /></div>
          <div><label htmlFor="sg-min" className={label}>Value at least</label><input id="sg-min" className={field} inputMode="decimal" value={filter.minValue} onChange={(e) => setFilter({ ...filter, minValue: e.target.value })} /></div>
          <div><label htmlFor="sg-active" className={label}>Active in the last (days)</label><input id="sg-active" className={field} inputMode="numeric" value={filter.activeWithinDays} onChange={(e) => setFilter({ ...filter, activeWithinDays: e.target.value })} /></div>
        </div>
        <button type="button" className={secondary} onClick={async () => { const r = await post({ action: "preview", filter: segment() }); setPreview(r.ok ? r : null); setMsg(r.ok ? "" : (r.error || "Could not preview.")); }}>Preview this list</button>
        {preview ? <p className={card} role="status">{preview.matched} match. {preview.agreed} agreed to hear from you. {preview.notAgreed} have not agreed and will be left out.</p> : null}
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Draft a broadcast</p>
        <div><label htmlFor="bc-name" className={label}>Name, for your records</label><input id="bc-name" className={field} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
        <div><label htmlFor="bc-subject" className={label}>Subject</label><input id="bc-subject" className={field} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></div>
        <div><label htmlFor="bc-text" className={label}>Message</label><textarea id="bc-text" rows={5} className={field} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} /></div>
        <button type="button" className={primary} onClick={async () => { const r = await post({ action: "draft", name: draft.name, subject: draft.subject, text: draft.text, filter: segment() }); if (r.ok) { setMsg(`Draft saved for ${r.recipients} people. ${r.excluded} left out. Approve it below to send.`); setDraft({ name: "", subject: "", text: "" }); load(); } else setMsg(r.error || "Could not save the draft."); }}>Save draft</button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Broadcasts</p>
        {data.broadcasts.length === 0 ? <p className={note}>None yet.</p> : null}
        {data.broadcasts.map((b) => (
          <div key={b.id} className={card}>
            <p className="font-medium">{b.name} · {b.status === "sent" ? `sent to ${b.sentCount || 0}${b.failedCount ? `, ${b.failedCount} failed` : ""}` : `draft for ${b.recipientCount} people`}</p>
            {b.status === "draft" ? (
              <div className="mt-2 flex flex-col sm:flex-row gap-2">
                <input aria-label={`Type SEND to approve ${b.name}`} className={field} placeholder="Type SEND to approve" value={confirmFor[b.id] || ""} onChange={(e) => setConfirmFor({ ...confirmFor, [b.id]: e.target.value })} />
                <button type="button" className={primary} disabled={(confirmFor[b.id] || "") !== "SEND"} onClick={async () => { const r = await post({ action: "send", id: b.id, confirm: "SEND" }); setMsg(r.ok ? `Sent ${r.sent}${r.failed ? `, ${r.failed} failed` : ""}${r.skipped ? `, ${r.skipped} skipped (opted out)` : ""}.` : (r.error || "Could not send.")); load(); }}>Approve and send</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Record that someone agreed</p>
        <p className={note}>Only add someone here after they have told you, in writing, that they want to hear from you.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input aria-label="Contact email" className={field} placeholder="their@email.com" value={consentEmail} onChange={(e) => setConsentEmail(e.target.value)} />
          <button type="button" className={secondary} onClick={async () => { const r = await post({ action: "consent", email: consentEmail, consented: true }); setConsentOk(r.ok === true); setMsg(r.ok ? "Recorded." : (r.error || "Could not record.")); if (r.ok) setConsentEmail(""); }}>Record agreement</button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Campaign results</p>
        {data.report.length === 0 ? <p className={note}>No campaigns with results yet.</p> : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.report.map((r) => (<li key={r.campaign} className={card}><strong>{r.campaign}</strong><span className={`block ${note}`}>{r.sends} sent · {r.won} won · revenue {r.revenue}</span></li>))}
          </ul>
        )}
        <p className={note}>Revenue is matched to a campaign through the campaign tag on each deal or invoice. Results without a tag show as untagged.</p>
      </div>
    </div>
  );
}
