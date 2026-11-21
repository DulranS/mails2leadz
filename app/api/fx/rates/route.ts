// Server-only. Fetches the free daily reference rates once and shares them: every business reads the same cached copy, so the
// free source is asked about once every few hours however many businesses are open. Signed-in members only (any role; the rates
// are public market data and reveal nothing about a business). Never writes anything.
import { requireSignedIn, AiAuthError } from "@/lib/firebaseAdmin";
import { aiErrorResponse } from "@/lib/apiError";
import { parseRates, RATES_URL, type RateSnapshot } from "@/lib/liveRates";

export const runtime = "nodejs";
export const maxDuration = 20;

const CACHE_MS = 6 * 60 * 60 * 1000;
let cache: { snap: RateSnapshot; fetchedAt: number } | null = null;

async function loadRates(fetchImpl: typeof fetch = fetch): Promise<RateSnapshot | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache.snap;
  try {
    const res = await fetchImpl(RATES_URL, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
    if (res.ok) {
      const snap = parseRates(await res.json().catch(() => null));
      if (snap) {
        cache = { snap, fetchedAt: Date.now() };
        return snap;
      }
    }
  } catch {
    // fall through: serve the last good copy, if any
  }
  return cache?.snap ?? null;
}

export async function GET(req: Request) {
  try {
    await requireSignedIn(req);
    const snap = await loadRates();
    if (!snap) return Response.json({ error: "Reference rates are unavailable right now." }, { status: 503 });
    return Response.json({ base: snap.base, rates: snap.rates, updatedAt: snap.updatedAt });
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    return aiErrorResponse(err, "fx-rates");
  }
}
