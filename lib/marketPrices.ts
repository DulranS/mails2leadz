// Market prices for investments: a manual "refresh" that fetches the latest price for each listed symbol, which the owner then
// keeps by pressing the button. Pure: symbol rules and reply reading. The network call lives in app/api/market/quotes/route.ts.
//
// Only a complete, well-formed quote is used. A rate-limit note from the provider is reported as such, and never as a price.

export const QUOTE_BASE = "https://www.alphavantage.co/query";
const SYMBOL_RE = /^[A-Z0-9.-]{1,12}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_SYMBOLS_PER_REFRESH = 5; // free data plans allow only a few requests a minute

export function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase();
  return SYMBOL_RE.test(s) ? s : null;
}

export function quoteUrl(symbol: string, apiKey: string): string {
  const params = new URLSearchParams({ function: "GLOBAL_QUOTE", symbol, apikey: apiKey });
  return `${QUOTE_BASE}?${params.toString()}`;
}

export type QuoteReading =
  | { kind: "quote"; price: number; date: string }
  | { kind: "limited"; message: string }
  | { kind: "none" };

export function parseQuote(json: unknown): QuoteReading {
  if (!json || typeof json !== "object") return { kind: "none" };
  const o = json as Record<string, unknown>;
  const note = typeof o.Note === "string" ? o.Note : typeof o.Information === "string" ? o.Information : null;
  if (note) return { kind: "limited", message: note.slice(0, 160) };
  const q = o["Global Quote"] as Record<string, unknown> | undefined;
  if (!q || typeof q !== "object") return { kind: "none" };
  const price = Number(q["05. price"]);
  const date = typeof q["07. latest trading day"] === "string" ? q["07. latest trading day"] : "";
  if (!Number.isFinite(price) || price <= 0 || !ISO_DAY.test(date)) return { kind: "none" };
  return { kind: "quote", price: Math.round(price * 10_000) / 10_000, date };
}
