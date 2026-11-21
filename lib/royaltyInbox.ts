// Royalty to head office (v218b): a site sends its monthly royalty statement to head office, which confirms it before anything is booked.
// The statement is checked here (shape, the royalty against the sales and rate, the month and the currency), and its id makes a repeat
// send a no-op. Pure: no I/O.
export const MAX_STATEMENT_ROWS = 200;

export interface StatementRow { location: string; sales: number; ratePct: number; royalty: number }
export interface StatementInput { sourceBusinessId: string; sourceName: string; period: string; currency: string; rows: StatementRow[] }

const ID_RE = /^[A-Za-z0-9_-]{6,200}$/;

export function statementDocId(sourceBusinessId: string, period: string): string {
  return `${sourceBusinessId}_${period}`;
}

// Each site has its own key. Head office keeps only a SHA-256 hash of it (lowercase hex), never the key, so a copy of the data does not
// expose a working key. A site id is the business id of the sending site.
export const SITE_KEY_PREFIX = "rsk_";
export function isSiteId(value: string): boolean {
  return ID_RE.test(value);
}

export function validateStatement(body: unknown): { ok: true; value: StatementInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Send the statement as a JSON object." };
  const b = body as Record<string, unknown>;
  const sourceBusinessId = typeof b.sourceBusinessId === "string" ? b.sourceBusinessId.trim() : "";
  if (!ID_RE.test(sourceBusinessId)) return { ok: false, error: "The sending site's business id is missing or malformed." };
  const sourceName = typeof b.sourceName === "string" ? b.sourceName.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  if (!sourceName) return { ok: false, error: "Give the sending site's name." };
  const period = typeof b.period === "string" ? b.period : "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return { ok: false, error: "The month must be a real month, as YYYY-MM." };
  const currency = typeof b.currency === "string" ? b.currency.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "The currency must be a three-letter code." };
  if (!Array.isArray(b.rows) || b.rows.length === 0) return { ok: false, error: "The statement has no rows." };
  if (b.rows.length > MAX_STATEMENT_ROWS) return { ok: false, error: `A statement can have at most ${MAX_STATEMENT_ROWS} rows.` };
  const rows: StatementRow[] = [];
  for (const raw of b.rows as Record<string, unknown>[]) {
    const location = typeof raw?.location === "string" ? raw.location.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    const sales = Number(raw?.sales), ratePct = Number(raw?.ratePct), royalty = Number(raw?.royalty);
    if (!location) return { ok: false, error: "Every row needs its location." };
    if (![sales, ratePct, royalty].every(Number.isFinite) || sales < 0 || royalty < 0 || ratePct < 0 || ratePct > 100) {
      return { ok: false, error: `The figures for "${location}" are not valid.` };
    }
    // The royalty must be the rate of the sales, to the cent: a statement that does not add up is refused, not corrected.
    if (Math.abs(royalty - sales * (ratePct / 100)) > 0.01) return { ok: false, error: `The royalty for "${location}" is not its rate of its sales.` };
    rows.push({ location, sales: Math.round(sales * 100) / 100, ratePct, royalty: Math.round(royalty * 100) / 100 });
  }
  return { ok: true, value: { sourceBusinessId, sourceName, period, currency, rows } };
}
