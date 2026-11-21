// Server-only. Fetches the latest price for up to five listed symbols, when the owner presses "Refresh prices" on Investments.
// Reads only; the page saves the prices the owner accepts. The provider key stays on the server and is removed from any error.
import { requireAiContext, AiAuthError } from "@/lib/firebaseAdmin";
import { aiErrorResponse } from "@/lib/apiError";
import { isConfigured } from "@/lib/connections";
import { MAX_SYMBOLS_PER_REFRESH, normalizeSymbol, parseQuote, quoteUrl } from "@/lib/marketPrices";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await requireAiContext(req);
    if (!isConfigured("market-prices")) {
      return Response.json({ error: "Market prices are not connected yet. Add MARKET_DATA_API_KEY to the app's environment settings, then try again." }, { status: 503 });
    }
    const key = (process.env.MARKET_DATA_API_KEY ?? "").trim();
    const body = (await req.json().catch(() => null)) as { symbols?: unknown } | null;
    const raw = Array.isArray(body?.symbols) ? body.symbols : [];
    const symbols = [...new Set(raw.map(normalizeSymbol).filter((s): s is string => s !== null))].slice(0, MAX_SYMBOLS_PER_REFRESH);
    if (symbols.length === 0) return Response.json({ error: "Add a symbol to the investment first, such as IBM." }, { status: 400 });

    const quotes: Record<string, { price: number; date: string }> = {};
    const failed: { symbol: string; reason: string }[] = [];
    for (const symbol of symbols) {
      let reading;
      try {
        const res = await fetch(quoteUrl(symbol, key), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000), cache: "no-store" });
        reading = parseQuote(await res.json().catch(() => null));
      } catch {
        failed.push({ symbol, reason: "Couldn't reach the price provider." });
        continue;
      }
      if (reading.kind === "quote") {
        quotes[symbol] = { price: reading.price, date: reading.date };
      } else if (reading.kind === "limited") {
        failed.push({ symbol, reason: "The price provider's limit was reached. Try the rest in a minute." });
        break; // the rest would be refused too
      } else {
        failed.push({ symbol, reason: "No price came back for this symbol." });
      }
    }
    return Response.json({ quotes, failed });
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    return aiErrorResponse(err, "market-quotes");
  }
}
