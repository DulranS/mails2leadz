"use client";

// "Import from Meta Ads": asks the server for what each promo campaign spent this month or last month, then hands the amounts
// back to the Settings form. Nothing is saved here. The owner reviews the amounts in the box and presses Save on Settings.
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";
import { monthRange } from "@/lib/adSpend";
import { Button, Select } from "@/components/ui";

export default function AdSpendImport({
  codes,
  onImport,
  endpoint = "/api/ads/spend",
  sourceName = "Meta Ads",
}: {
  codes: string[];
  onImport: (spend: Record<string, number>, summary: string, period: { from: string; to: string }) => void;
  endpoint?: string;
  sourceName?: string;
}) {
  const { user, businessId } = useAuth();
  const toast = useToast();
  const [offset, setOffset] = useState<0 | -1>(0);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!user) return;
    if (codes.length === 0) {
      toast.error("Add promo codes first", "Save your promo codes above, then import the spend for them.");
      return;
    }
    setBusy(true);
    try {
      const { from, to } = monthRange(new Date(), offset);
      const idToken = await user.getIdToken();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, ...(businessId ? { [BUSINESS_ID_HEADER]: businessId } : {}) },
        body: JSON.stringify({ from, to, codes }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Couldn't import the spend.");
      const spend = (payload.spend ?? {}) as Record<string, number>;
      const found = Object.keys(spend).length;
      const summary = `${found} promo code${found === 1 ? "" : "s"} matched from ${from} to ${to}.`;
      onImport(spend, summary, { from, to });
      toast.success("Spend imported", `${summary} Check the amounts, then press Save.`);
    } catch (err) {
      toast.error("Couldn't import the spend", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <div className="w-44">
        <Select value={offset} onChange={(e) => setOffset(Number(e.target.value) as 0 | -1)}>
          <option value={0}>This month so far</option>
          <option value={-1}>Last month</option>
        </Select>
      </div>
      <Button variant="ghost" onClick={run} disabled={busy || !user}>
        {busy ? "Importing…" : `Import from ${sourceName}`}
      </Button>
      <span className="text-[11px] text-muted">Only if {sourceName} is connected. Amounts only come in when you press this.</span>
    </div>
  );
}
