"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { RATES_STALE_MS, suggestRate, type RateSnapshot } from "@/lib/liveRates";

// Client side of the free daily reference rates (app/api/fx/rates). One request per browser session, shared by every form on
// the page; the server caches it further. If the rates can't be loaded, every hook returns null and the forms behave as before:
// the person types the rate.
let cached: { snap: RateSnapshot; at: number } | null = null;
let inflight: Promise<RateSnapshot | null> | null = null;

async function loadRates(getToken: () => Promise<string>): Promise<RateSnapshot | null> {
  if (cached && Date.now() - cached.at < RATES_STALE_MS / 2) return cached.snap;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/fx/rates", { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) return cached?.snap ?? null;
      const body = (await res.json().catch(() => null)) as { rates?: Record<string, number>; updatedAt?: number } | null;
      if (!body?.rates || typeof body.updatedAt !== "number") return cached?.snap ?? null;
      const snap: RateSnapshot = { base: "USD", rates: body.rates, updatedAt: body.updatedAt };
      cached = { snap, at: Date.now() };
      return snap;
    } catch {
      return cached?.snap ?? null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// The suggested rate (1 foreign unit = this many business units) for this currency pair, or null.
export function useReferenceRate(foreign: string, business: string): number | null {
  const { user } = useAuth();
  const [snap, setSnap] = useState<RateSnapshot | null>(cached?.snap ?? null);
  const needs = !!user && foreign !== business;
  useEffect(() => {
    if (!needs || !user) return;
    let alive = true;
    loadRates(() => user.getIdToken()).then((s) => {
      if (alive && s) setSnap(s);
    });
    return () => {
      alive = false;
    };
  }, [needs, user]);
  if (!snap || !needs) return null;
  return suggestRate(snap, foreign, business);
}

// Fills an empty or default ("1") rate field with the suggestion when the currency is picked or the rate arrives. It never
// overwrites a rate that is already there (a saved record, or a figure the person typed).
export function useFillReferenceRate(args: { currency: string; base: string; rate: string; setRate: (r: string) => void; reference: number | null }) {
  const { currency, base, rate, setRate, reference } = args;
  const refStr = reference === null ? null : String(reference);
  useEffect(() => {
    if (currency === base || refStr === null) return;
    if (rate === "" || Number(rate) === 1) setRate(refStr);
    // Only when the currency or the reference changes: typing never triggers a refill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, base, refStr]);
}
