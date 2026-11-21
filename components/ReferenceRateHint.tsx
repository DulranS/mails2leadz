"use client";

// Under a foreign-currency rate box: says when the figure came from today's free reference rate, and offers to put it back
// after someone has typed another. Shows nothing when the reference is unavailable or the currency is the business currency.
import { RATES_ATTRIBUTION } from "@/lib/liveRates";

export default function ReferenceRateHint({
  currency,
  base,
  rate,
  setRate,
  reference,
}: {
  currency: string;
  base: string;
  rate: string;
  setRate: (r: string) => void;
  reference: number | null;
}) {
  if (currency === base || reference === null) return null;
  const same = rate === String(reference);
  return same ? (
    <div className="text-[11px] text-muted mt-1">
      Filled from today&apos;s reference rate ({RATES_ATTRIBUTION}). Check it against what you actually paid or received.
    </div>
  ) : (
    <button type="button" onClick={() => setRate(String(reference))} className="text-[11px] text-amber-soft hover:underline mt-1 text-left">
      Use today&apos;s reference rate ({reference})
    </button>
  );
}
