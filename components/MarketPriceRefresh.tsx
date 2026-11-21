"use client";

// "Refresh prices" for investments with a listed symbol. Fetches the latest price for the five stalest ones, then saves each
// accepted price with the trading day it is for. Pressing the button is the only way prices change; nothing runs on its own.
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";
import { MAX_SYMBOLS_PER_REFRESH } from "@/lib/marketPrices";
import type { Security } from "@/lib/types";
import { Button } from "@/components/ui";

export default function MarketPriceRefresh({
  securities,
  updateSecurity,
}: {
  securities: Security[];
  updateSecurity: (id: string, s: Partial<Security>) => Promise<void>;
}) {
  const { user, businessId } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // Oldest price first, so the ones that have waited longest are refreshed first.
  const listed = securities
    .filter((s) => s.symbol && s.symbol.trim())
    .sort((a, b) => (a.priceDate ?? "").localeCompare(b.priceDate ?? ""));
  if (listed.length === 0) return null;

  async function run() {
    if (!user) return;
    setBusy(true);
    const batch = listed.slice(0, MAX_SYMBOLS_PER_REFRESH);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/market/quotes", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, ...(businessId ? { [BUSINESS_ID_HEADER]: businessId } : {}) },
        body: JSON.stringify({ symbols: batch.map((s) => s.symbol) }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Couldn't refresh the prices.");
      const quotes = (payload.quotes ?? {}) as Record<string, { price: number; date: string }>;
      let saved = 0;
      for (const s of batch) {
        const q = quotes[(s.symbol ?? "").trim().toUpperCase()];
        if (!q) continue;
        await updateSecurity(s.id, { currentPrice: q.price, priceDate: q.date });
        saved++;
      }
      const failed = (payload.failed ?? []) as { symbol: string; reason: string }[];
      const rest = listed.length - batch.length;
      const detail = [
        `${saved} price${saved === 1 ? "" : "s"} updated.`,
        failed.length ? `${failed.length} didn't update: ${failed.map((f) => f.symbol).join(", ")}.` : "",
        rest > 0 ? `${rest} more to refresh: press again.` : "",
      ].filter(Boolean).join(" ");
      if (saved > 0) toast.success("Prices refreshed", detail);
      else toast.info("No prices updated", detail);
    } catch (err) {
      toast.error("Couldn't refresh the prices", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <Button variant="ghost" onClick={run} disabled={busy || !user}>
        {busy ? "Refreshing…" : "Refresh prices"}
      </Button>
      <span className="text-[11px] text-muted">
        Up to {MAX_SYMBOLS_PER_REFRESH} listed investments at a time, stalest first. Needs market prices connected.
      </span>
    </div>
  );
}
