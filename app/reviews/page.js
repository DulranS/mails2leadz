"use client";
// Reviews you log by hand. Two stars or fewer stay on Today as an alert until you mark them answered (pass 341).
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuthUser } from "../components/AuthProvider";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { isOpenAlert, isBadReview, REVIEW_TEXT_MAX } from "../../lib/reviews.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200";

export default function ReviewsPage() {
  const { user, ready } = useAuthUser();
  const [reviews, setReviews] = useState([]);
  const [rating, setRating] = useState("5");
  const [text, setText] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reviews");
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setReviews(Array.isArray(j.reviews) ? j.reviews : []); setError(""); }
      else setError(j.error || "Could not load reviews.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (ready && user) load(); else if (ready) setLoading(false); }, [ready, user, load]);

  // Sends one change and reloads, so the screen always shows what is saved.
  const act = async (body) => {
    setError("");
    try {
      const res = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (res.status === 403) setViewer(true);
      if (!res.ok) { setError(j.error || "Could not save that."); return false; }
      await load();
      return true;
    } catch {
      setError("Could not reach the server. Nothing was saved.");
      return false;
    }
  };

  const add = async (e) => {
    e.preventDefault();
    const ok = await act({ action: "add", rating: Number(rating), text, customerEmail, date });
    if (ok) { setText(""); setCustomerEmail(""); setDate(""); setRating("5"); }
  };

  if (ready && !user) {
    return <DashboardLayout title="Reviews"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 dark:text-blue-400 underline" href="/">sign in</Link> to continue.</p></section></DashboardLayout>;
  }

  const open = reviews.filter(isOpenAlert).length;

  return (
    <DashboardLayout title="Reviews" subtitle="Log reviews you get elsewhere. Two stars or fewer stay on Today until you mark them answered.">
      <div className="space-y-4">
        <section className={card} aria-label="Summary">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            {open ? `${open} bad ${open === 1 ? "review has" : "reviews have"} no reply yet.` : "No bad reviews waiting for a reply."}
          </p>
          {viewer ? <p role="status" className="text-xs text-gray-600 dark:text-gray-300 mt-2">You can read reviews but not change them.</p> : null}
          {error ? <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </section>

        {!viewer ? (
          <form className={`${card} space-y-3`} onSubmit={add} aria-label="New review">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="review-rating" className="text-sm font-medium text-gray-900 dark:text-white">Stars</label>
                <select id="review-rating" className={`${field} mt-1`} value={rating} onChange={(e) => setRating(e.target.value)}>
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="review-date" className="text-sm font-medium text-gray-900 dark:text-white">Date</label>
                <input id="review-date" type="date" className={`${field} mt-1`} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label htmlFor="review-email" className="text-sm font-medium text-gray-900 dark:text-white">Customer email (optional)</label>
                <input id="review-email" type="email" className={`${field} mt-1`} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} maxLength={254} />
              </div>
            </div>
            <div>
              <label htmlFor="review-text" className="text-sm font-medium text-gray-900 dark:text-white">What they said</label>
              <textarea id="review-text" className={`${field} mt-1`} rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={REVIEW_TEXT_MAX} />
            </div>
            <button type="submit" className={`${btn} bg-blue-600 text-white border-blue-600`}>Log review</button>
          </form>
        ) : null}

        <section className={card} aria-label="Logged reviews">
          {loading ? <p className="text-sm text-gray-600 dark:text-gray-300">Loading reviews...</p> : null}
          {!loading && reviews.length === 0 ? <p className="text-sm text-gray-700 dark:text-gray-200">No reviews logged yet.</p> : null}
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {reviews.map((r) => (
              <li key={r.id} className="py-3 flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${isBadReview(r) ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>
                    {r.rating} of 5 stars · {r.date}{r.customerEmail ? ` · ${r.customerEmail}` : ""}
                  </p>
                  {r.text ? <p className="text-sm text-gray-700 dark:text-gray-200 break-words">{r.text}</p> : null}
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    {isBadReview(r) ? (r.answeredAt ? "Marked answered" : "Needs a reply (alert on Today)") : "No alert"}
                  </p>
                </div>
                {!viewer && isOpenAlert(r) ? (
                  <button type="button" className={`${btn} min-w-[44px]`} onClick={() => act({ action: "answer", id: r.id })} aria-label={`Mark answered: ${r.rating} stars on ${r.date}`}>Mark answered</button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </DashboardLayout>
  );
}
