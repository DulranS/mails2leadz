"use client";
// Companies: the people on your records grouped by their email domain (free email providers are left out).
// You can give a company its own name, website and notes. Viewers can read the list only.
import React, { useCallback, useEffect, useState } from "react";
import { useAuthUser } from "../components/AuthProvider";
import { DashboardLayout } from "../components/ui/DashboardLayout";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200";

export default function CompaniesPage() {
  const { user, ready } = useAuthUser();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState(false);
  const [editing, setEditing] = useState(null); // the domain being edited
  const [form, setForm] = useState({ name: "", website: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/companies");
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setCompanies(Array.isArray(j.companies) ? j.companies : []); setError(""); }
      else setError(j.error || "Could not load companies.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (ready && user) load(); }, [ready, user, load]);

  const startEdit = (c) => {
    setEditing(c.domain);
    setForm({ name: c.name === c.domain ? "" : c.name, website: c.website === `https://${c.domain}` ? "" : c.website, notes: c.notes || "" });
    setError("");
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/companies", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: editing, ...form }) });
      const j = await res.json().catch(() => ({}));
      if (res.status === 403) setViewer(true);
      if (!res.ok) { setError(j.error || "Could not save the company."); return; }
      setEditing(null);
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="Companies" subtitle="The people on your records, grouped by their company's email domain">
      <div className="space-y-4">
        <section className={card} aria-label="Summary">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            {loading ? "Loading companies..." : companies.length ? `${companies.length} compan${companies.length === 1 ? "y" : "ies"} on your records.` : "No companies yet. A company appears once two or more people share its email domain, or one person has a deal."}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">Gmail, Yahoo, Outlook and other free email addresses are not grouped into companies.</p>
          {error ? <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </section>

        <ul className="space-y-3" aria-label="Companies">
          {companies.map((c) => (
            <li key={c.domain} className={card}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white break-words">{c.name}</p>
                  <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 underline break-all">{c.website}</a>
                  <p className="text-sm text-gray-700 dark:text-gray-200 mt-1">{c.contactCount} contact{c.contactCount === 1 ? "" : "s"} · {c.dealCount} deal{c.dealCount === 1 ? "" : "s"}</p>
                  {c.notes ? <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-line break-words">{c.notes}</p> : null}
                </div>
                {!viewer && editing !== c.domain ? <button type="button" className={btn} onClick={() => startEdit(c)}>Edit</button> : null}
              </div>

              {editing === c.domain ? (
                <form onSubmit={save} className="mt-3 space-y-3" aria-label={`Edit ${c.domain}`}>
                  <label className="block text-sm text-gray-700 dark:text-gray-200">Name (leave blank to use {c.domain})
                    <input className={field} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </label>
                  <label className="block text-sm text-gray-700 dark:text-gray-200">Website (leave blank to use https://{c.domain})
                    <input className={field} maxLength={200} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="example.com" />
                  </label>
                  <label className="block text-sm text-gray-700 dark:text-gray-200">Notes
                    <textarea className={field} rows={3} maxLength={2000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" disabled={saving} className="min-h-[44px] px-4 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
                    <button type="button" className={btn} onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </DashboardLayout>
  );
}
