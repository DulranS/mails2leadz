"use client";
import React, { useEffect, useState } from "react";

// Publish or unpublish the public help page. Only your answer library is shown on it.
const primary = "min-h-[40px] px-4 py-2 rounded-md bg-gray-900 text-white text-sm dark:bg-white dark:text-gray-900";
const note = "text-xs text-gray-600 dark:text-gray-300";

export default function HelpCentre() {
  const [st, setSt] = useState(null);
  const [msg, setMsg] = useState("");
  const load = () => fetch("/api/help/publish").then((r) => r.json()).then((j) => { if (j.path) setSt(j); }).catch(() => {});
  useEffect(() => { load(); }, []);
  const toggle = async () => {
    const r = await fetch("/api/help/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published: !(st && st.published) }) }).then((x) => x.json()).catch(() => ({ error: "Could not reach the server." }));
    setMsg(r.error || (r.published ? "Published." : "Taken down.")); load();
  };
  if (!st) return <p className={note}>Loading...</p>;
  return (
    <div className="space-y-3">
      <p className={note}>{st.published ? "Live now at" : "Not published. It would be at"} {st.path}</p>
      <button type="button" className={primary} onClick={toggle}>{st.published ? "Take the help page down" : "Publish the help page"}</button>
      {msg ? <p role="status" className={note}>{msg}</p> : null}
    </div>
  );
}
