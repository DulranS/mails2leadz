"use client";
import React, { useEffect, useState } from "react";

// Case studies from won customers who agreed in writing. A draft is never published: you read it and use it yourself.
const field = "w-full min-h-[40px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100";
const primary = "min-h-[40px] px-4 py-2 rounded-md bg-gray-900 text-white text-sm hover:bg-gray-700 disabled:opacity-50 dark:bg-white dark:text-gray-900";
const secondary = "min-h-[40px] px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-800 dark:text-gray-100";
const card = "rounded-md border border-gray-200 dark:border-gray-700 p-3 text-sm";
const note = "text-xs text-gray-600 dark:text-gray-300";
const post = (body) => fetch("/api/case-studies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json().catch(() => ({})));

export default function CaseStudyDrafts() {
  const [data, setData] = useState({ won: [], drafts: [] });
  const [msg, setMsg] = useState("");
  const load = () => fetch("/api/case-studies").then((r) => r.json()).then((j) => { if (j.won) setData(j); }).catch(() => {});
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-3 px-2">
      <p className={note}>Only customers who agreed in writing can be featured. Tick the box only after you have that agreement. Drafts are for you to read and edit; nothing is published.</p>
      {msg ? <p role="status" className="text-sm rounded-md bg-gray-100 dark:bg-gray-700 px-3 py-2">{msg}</p> : null}
      {data.won.length === 0 ? <p className={note}>No won customers yet.</p> : null}
      <ul className="space-y-2">
        {data.won.map((w) => (
          <li key={w.email} className={card}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={w.agreed} onChange={async (e) => { await post({ action: "consent", email: w.email, consented: e.target.checked }); load(); }} />
                <span><strong>{w.name}</strong> agreed in writing to a case study</span>
              </label>
              <button type="button" disabled={!w.agreed} className={secondary} onClick={async () => { const r = await post({ action: "draft", email: w.email }); setMsg(r.error || "Draft saved."); load(); }}>Draft case study</button>
            </div>
          </li>
        ))}
      </ul>
      {data.drafts.length ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Drafts</p>
          {data.drafts.map((d) => (
            <article key={d.id} className={card}>
              <p className="font-semibold">{d.title}</p>
              <p className={`mt-1 ${note}`}>{d.customer}</p>
              <p className="mt-2"><strong>Challenge:</strong> {d.challenge}</p>
              <p className="mt-1"><strong>What we did:</strong> {d.solution}</p>
              <p className="mt-1"><strong>Result:</strong> {d.result}</p>
              <p className={`mt-2 ${note}`}>Placeholders in square brackets need your own quote or figures before use.</p>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
