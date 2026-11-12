"use client";
import React, { useEffect, useState } from "react";

// Posts to your own Facebook Page and Instagram. Nothing goes live until you type POST for that draft.
const field = "w-full min-h-[40px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100";
const label = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";
const primary = "min-h-[40px] px-4 py-2 rounded-md bg-gray-900 text-white text-sm dark:bg-white dark:text-gray-900";
const card = "rounded-md border border-gray-200 dark:border-gray-700 p-3 text-sm";
const note = "text-xs text-gray-600 dark:text-gray-300";
const post = (body) => fetch("/api/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json().catch(() => ({})));

export default function SocialPosts() {
  const [drafts, setDrafts] = useState([]);
  const [form, setForm] = useState({ channel: "facebook", text: "", link: "", imageUrl: "" });
  const [msg, setMsg] = useState("");
  const [confirm, setConfirm] = useState({});
  const load = () => fetch("/api/social").then((r) => r.json()).then((j) => { if (j.drafts) setDrafts(j.drafts); }).catch(() => {});
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4 px-2">
      <p className={note}>Posts go to your own Facebook Page and Instagram account. Each one is published only when you type POST next to it.</p>
      {msg ? <p role="status" className="text-sm rounded-md bg-gray-100 dark:bg-gray-700 px-3 py-2">{msg}</p> : null}
      <div className="space-y-3">
        <div><label htmlFor="sp-channel" className={label}>Where</label>
          <select id="sp-channel" className={field} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
            <option value="facebook">Facebook Page</option><option value="instagram">Instagram (needs a picture)</option>
          </select></div>
        <div><label htmlFor="sp-text" className={label}>Post</label><textarea id="sp-text" rows={4} className={field} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></div>
        {form.channel === "facebook" ? (
          <div><label htmlFor="sp-link" className={label}>Link (optional, https)</label><input id="sp-link" className={field} value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} /></div>
        ) : (
          <div><label htmlFor="sp-image" className={label}>Picture link (https, JPG or PNG)</label><input id="sp-image" className={field} value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} /></div>
        )}
        <button type="button" className={primary} onClick={async () => { const r = await post({ action: "draft", ...form, caption: form.text }); if (r.ok) { setMsg("Draft saved. Publish it below when you are ready."); setForm({ ...form, text: "", link: "", imageUrl: "" }); load(); } else setMsg(r.error || "Could not save the draft."); }}>Save draft</button>
      </div>
      <div className="space-y-2">
        {drafts.length === 0 ? <p className={note}>No drafts yet.</p> : null}
        {drafts.map((d) => (
          <div key={d.id} className={card}>
            <p className="font-medium">{d.channel === "instagram" ? "Instagram" : "Facebook Page"} · {d.status === "posted" ? "posted" : "draft"}</p>
            <p className="mt-1 whitespace-pre-wrap">{d.text || d.caption}</p>
            {d.status === "draft" ? (
              <div className="mt-2 flex flex-col sm:flex-row gap-2">
                <input aria-label="Type POST to publish" className={field} placeholder="Type POST to publish" value={confirm[d.id] || ""} onChange={(e) => setConfirm({ ...confirm, [d.id]: e.target.value })} />
                <button type="button" className={primary} disabled={(confirm[d.id] || "") !== "POST"} onClick={async () => { const r = await post({ action: "post", id: d.id, confirm: "POST" }); setMsg(r.ok ? "Published." : (r.error || "Could not publish.")); load(); }}>Publish</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
