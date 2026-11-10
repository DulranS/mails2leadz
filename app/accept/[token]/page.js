"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// The customer's page: read the agreement, type your name, accept. Typed-name acceptance, recorded with the time and a fingerprint of the text.
export default function AcceptPage() {
  const params = useParams();
  const token = String(params?.token || "");
  const [doc, setDoc] = useState(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    fetch(`/api/agreements/accept?t=${encodeURIComponent(token)}`).then((r) => r.json()).then((j) => setDoc(j)).catch(() => setDoc({ state: "not_found" }));
  }, [token]);

  const accept = async (e) => {
    e.preventDefault();
    setErr("");
    const r = await fetch("/api/agreements/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, name }) }).then((x) => x.json()).catch(() => ({ error: "Could not reach the server." }));
    if (r.ok) setDone(r); else setErr(r.error || "Could not accept.");
  };

  const shell = "min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-10";
  if (!doc) return <main className={shell}><p>Loading the agreement...</p></main>;
  if (doc.state === "not_found") return <main className={shell}><h1 className="text-xl font-semibold">This link is not valid</h1></main>;
  if (doc.state === "expired") return <main className={shell}><h1 className="text-xl font-semibold">This link has expired</h1><p className="mt-2">Ask the sender for a new one.</p></main>;
  if (doc.state === "accepted" || done) {
    const n = done?.acceptedName || doc.acceptedName;
    const at = done?.acceptedAt || doc.acceptedAt;
    return <main className={shell}><h1 className="text-xl font-semibold">Accepted</h1><p className="mt-2">{n} accepted this agreement on {new Date(at).toLocaleString()}.</p></main>;
  }
  return (
    <main className={shell}>
      <article className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold">{doc.title}</h1>
        <pre className="mt-4 whitespace-pre-wrap rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-sm font-sans">{doc.text}</pre>
        <form onSubmit={accept} className="mt-6 space-y-3">
          <label htmlFor="accept-name" className="block text-sm font-medium">Type your full name to accept</label>
          <input id="accept-name" className="w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-800" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          {err ? <p role="alert" className="text-sm text-red-600">{err}</p> : null}
          <button type="submit" className="min-h-[44px] px-5 py-2 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900">Accept</button>
          <p className="text-xs text-gray-600 dark:text-gray-300">Your typed name, the time and a fingerprint of this exact text are recorded. This is typed-name acceptance; it is not a qualified electronic signature.</p>
        </form>
      </article>
    </main>
  );
}
