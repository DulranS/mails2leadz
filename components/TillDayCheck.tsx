"use client";
// Owner check of one till day (pass 313). Type the till's day total and sale count; Balancr compares them with the sales that came
// from the till for that date (POST /api/sales/reconcile-day). Nothing is changed.
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { formatMoney, todayIso } from "@/lib/format";
import { Button, Card } from "@/components/ui";

interface DayResult {
  ok: boolean;
  date: string;
  status: "matched" | "mismatch";
  expectedTotal: number;
  postedTotal: number;
  difference: number;
  expectedTransactions: number;
  postedTransactions: number;
}

export default function TillDayCheck() {
  const { user } = useAuth();
  const { settings } = useData();
  const currency = settings.currency;
  const [date, setDate] = useState(todayIso());
  const [total, setTotal] = useState("");
  const [count, setCount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DayResult | null>(null);

  const run = async () => {
    setError("");
    setResult(null);
    const expectedTotal = Number(total);
    const expectedTransactions = Number(count);
    if (!total.trim() || !Number.isFinite(expectedTotal) || expectedTotal < 0) { setError("Type the till's day total (zero or more)."); return; }
    if (!count.trim() || !Number.isInteger(expectedTransactions) || expectedTransactions < 0) { setError("Type how many sales the till counted (a whole number)."); return; }
    if (!user) { setError("Sign in again to run the check."); return; }
    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/sales/reconcile-day", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ date, expectedTotal, expectedTransactions }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Could not check the day."); return; }
      setResult(data as DayResult);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="text-sm font-medium mb-1">Check a till day</div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Type the day total and sale count from the till&apos;s end-of-day report. Balancr compares them with the sales that came from the till for that date. Nothing is changed.</p>
      <div className="grid sm:grid-cols-4 gap-2">
        <label className="text-sm">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800" /></label>
        <label className="text-sm">Till total ({currency})<input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800" /></label>
        <label className="text-sm">Till sale count<input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800" /></label>
        <div className="flex items-end"><Button onClick={run} disabled={busy}>{busy ? "Checking…" : "Check this day"}</Button></div>
      </div>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300 mt-3">{error}</p>}
      {result && (
        <div className="mt-3 text-sm space-y-1">
          <p className={result.status === "matched" ? "font-medium text-green-700 dark:text-green-300" : "font-medium text-amber-700 dark:text-amber-300"}>
            {result.status === "matched" ? "Matched." : "Does not match."}
          </p>
          <p>Till: {formatMoney(result.expectedTotal, currency)} from {result.expectedTransactions} sales · Balancr: {formatMoney(result.postedTotal, currency)} from {result.postedTransactions} till sales</p>
          {result.status === "mismatch" && <p>Difference: {formatMoney(result.difference, currency)}. Check the sales for {result.date} on this page.</p>}
        </div>
      )}
    </Card>
  );
}
