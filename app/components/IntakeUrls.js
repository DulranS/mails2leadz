import React, { useEffect, useState } from "react";

// The owner's lead-form addresses: paste one per form tool. Each address is only for this account; rotate it if it is shared by mistake.
export default function IntakeUrls() {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");

  const load = async (method = "GET") => {
    try {
      const res = await fetch("/api/integrations/intake", { method });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setData(j); setMsg(method === "POST" ? "New address created. The old one has stopped working." : ""); }
      else setMsg(j.error || "Could not load the address.");
    } catch (e) { setMsg("Could not reach the server."); }
  };
  useEffect(() => { load(); }, []);

  if (!data) return <section className="mx-4 my-3 text-sm text-gray-600 dark:text-gray-300">{msg || "Loading lead-form addresses..."}</section>;
  return (
    <section aria-label="Lead-form addresses" className="mx-4 my-3 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Lead-form addresses</h2>
      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Paste the address into the form tool. Save each form's key or secret under Integrations first. For LinkedIn and TikTok, add <code>&amp;key=</code> followed by the key you saved.</p>
      <ul className="mt-2 space-y-2 text-xs">
        {Object.entries(data.urls).map(([id, u]) => (
          <li key={id} className="break-all">
            <strong>{u.label}:</strong> <code>{u.url}</code>{" "}
            <button type="button" className="underline ml-1" onClick={() => navigator.clipboard?.writeText(u.url)}>Copy</button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => load("POST")} className="mt-3 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-xs">New address (stops the old one)</button>
      {msg ? <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">{msg}</p> : null}
    </section>
  );
}
