"use client";
// POS days (pass 340): the saved till day checks, newest first. A day that does not match is flagged, with the difference.
// Read only: nothing here changes a sale or a check. The checks themselves are made on the till day check above.
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { formatMoney } from "@/lib/format";
import { Card } from "@/components/ui";
import type { PosDayRow } from "@/lib/pos-ingest";

export default function PosDaysCard() {
  const { user } = useAuth();
  const { settings } = useData();
  const currency = settings.currency;
  const [days, setDays] = useState<PosDayRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let live = true;
    (async () => {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/sales/pos-days", { headers: { authorization: `Bearer ${idToken}` } });
        const data = await res.json();
        if (!live) return;
        if (!res.ok) { setError(data.error || "Could not load the POS days."); return; }
        setDays(data.days as PosDayRow[]);
      } catch {
        if (live) setError("Could not reach the server. Try again.");
      }
    })();
    return () => { live = false; };
  }, [user]);

  if (!user) return null;
  const mismatches = days ? days.filter((d) => d.status === "mismatch").length : 0;

  return (
    <Card>
      <h3 className="font-semibold mb-1">POS days</h3>
      <p className="text-xs text-gray-500 mb-2">Sales from the POS are posted to Balancr as they arrive or are imported, and each day here compares the till&apos;s totals with the sales posted for that day.</p>
      <details className="text-xs text-gray-600 mb-2">
        <summary className="cursor-pointer">How POS sales are handled</summary>
        <ul className="list-disc pl-5 mt-1 space-y-1">
          <li>A POS sale is posted to the books once, when it arrives or is imported. A till day check never posts it a second time.</li>
          <li>An import with a product the system does not know is refused as a whole, with an error for each line. Nothing is half-posted.</li>
          <li>Duplicate products are merged by hand. The system never merges them on its own.</li>
        </ul>
      </details>
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      {!days && !error ? <p className="text-sm text-gray-500">Loading...</p> : null}
      {days && days.length === 0 ? <p className="text-sm text-gray-500">No POS days have been checked yet. Check a day above to see it here.</p> : null}
      {days && days.length > 0 ? (
        <>
          <p className="text-sm mb-2">{mismatches === 0 ? "All checked days match." : `${mismatches} day${mismatches === 1 ? "" : "s"} do not match. Look at the sales for those days.`}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500">
                <tr><th className="py-1 pr-3">Date</th><th className="py-1 pr-3 text-right">Till</th><th className="py-1 pr-3 text-right">Balancr</th><th className="py-1 pr-3 text-right">Difference</th><th className="py-1">Status</th></tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.date} className="border-t">
                    <td className="py-1 pr-3 whitespace-nowrap">{d.date}</td>
                    <td className="py-1 pr-3 text-right whitespace-nowrap">{formatMoney(d.expectedTotal, currency)} · {d.expectedTransactions}</td>
                    <td className="py-1 pr-3 text-right whitespace-nowrap">{formatMoney(d.postedTotal, currency)} · {d.postedTransactions}</td>
                    <td className="py-1 pr-3 text-right whitespace-nowrap">{formatMoney(d.difference, currency)}</td>
                    <td className="py-1">{d.status === "matched" ? "Matched" : "Mismatch"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </Card>
  );
}
