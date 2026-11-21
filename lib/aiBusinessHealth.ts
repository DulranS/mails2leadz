// Lets the Assistant answer "how healthy is my business?", "what are my growth levers?" and "how often do I fix
// entries?" with the SAME numbers the Financial Health and Growth pages show.
//
// Why a snapshot from the screen instead of recomputing on the server: those figures need the whole ledger (sales
// economics, loans, assets, investments, lending, payments...). Rebuilding that server-side would be a second copy of
// the maths that could drift from the screens. Here the browser sends the figures it has already computed, the server
// checks they are plain numbers (never free text that could carry instructions), and the model reads them through a
// tool. Nothing is added to the prompt unless the tool is called, so a normal turn costs the same as before.
//
// Safe by construction: the Assistant is owner/manager only, the figures describe the caller's own business, and the
// sanitizer below only lets through short key names, finite numbers, null, and dates.
import type { FinancialHealthRatios, GrowthLevers, ManualOpsSignals } from "./calculations";

export interface BusinessHealthSnapshot {
  currency?: string;
  financialHealth: Record<string, unknown>;
  growthLevers: Record<string, unknown>;
  manualOps: Record<string, unknown>;
}

// The only strings allowed through are dates/months (2026-10, 2026-10-11): no free text can ride along.
const DATE_LIKE = /^\d{4}-\d{2}(-\d{2})?$/;

const round = (n: number) => Math.round(n * 100) / 100;

function numericFields(obj: object): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = round(v);
    else if (v === null || v === undefined) out[k] = null;
    else if (typeof v === "string" && DATE_LIKE.test(v)) out[k] = v;
    // arrays / nested objects are handled explicitly by the caller below
  }
  return out;
}

export function buildBusinessHealthSnapshot(
  financialHealth: FinancialHealthRatios,
  growthLevers: GrowthLevers,
  manualOps: ManualOpsSignals,
  currency?: string
): BusinessHealthSnapshot {
  const levers: Record<string, unknown> = {
    windowMonths: growthLevers.windowMonths,
    currentFrom: growthLevers.currentMonths[0] ?? null,
    currentTo: growthLevers.currentMonths[growthLevers.currentMonths.length - 1] ?? null,
    priorFrom: growthLevers.priorMonths[0] ?? null,
    priorTo: growthLevers.priorMonths[growthLevers.priorMonths.length - 1] ?? null,
  };
  for (const key of ["cogsPctOfRevenue", "operatingExpenses", "operatingExpensesPctOfRevenue", "avgSellingPrice", "averageOrderValue"] as const) {
    const c = growthLevers[key];
    levers[key] = numericFields(c);
  }
  return {
    currency: currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : undefined,
    financialHealth: numericFields(financialHealth),
    growthLevers: levers,
    manualOps: numericFields(manualOps),
  };
}

const MAX_BYTES = 8000;
const MAX_DEPTH = 3;

function cleanValue(v: unknown, depth: number): unknown | undefined {
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") return DATE_LIKE.test(v) ? v : undefined;
  if (typeof v === "object" && !Array.isArray(v) && depth < MAX_DEPTH) {
    const out: Record<string, unknown> = {};
    let n = 0;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (++n > 80) break;
      if (!/^[A-Za-z0-9_]{1,40}$/.test(k)) continue;
      const cleaned = cleanValue(val, depth + 1);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  return undefined;
}

// Returns a trusted-shape copy, or null when there's nothing usable (no snapshot, wrong shape, or too big) — in which
// case the tool simply isn't offered to the model for that turn.
export function sanitizeBusinessHealthSnapshot(raw: unknown): BusinessHealthSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const fh = cleanValue(r.financialHealth, 1);
  const gl = cleanValue(r.growthLevers, 1);
  const mo = cleanValue(r.manualOps, 1);
  if (!fh || !gl || !mo || typeof fh !== "object" || typeof gl !== "object" || typeof mo !== "object") return null;
  const currency = typeof r.currency === "string" && /^[A-Za-z]{3}$/.test(r.currency) ? r.currency.toUpperCase() : undefined;
  const snapshot: BusinessHealthSnapshot = {
    currency,
    financialHealth: fh as Record<string, unknown>,
    growthLevers: gl as Record<string, unknown>,
    manualOps: mo as Record<string, unknown>,
  };
  if (JSON.stringify(snapshot).length > MAX_BYTES) return null;
  if (Object.keys(snapshot.financialHealth).length === 0) return null;
  return snapshot;
}

// What the model is told alongside the numbers, so it reads them the way the pages do instead of guessing.
export const BUSINESS_HEALTH_GUIDE =
  "These are the figures shown on the Financial Health and Growth pages right now, as the owner's browser calculated them. " +
  "Report them as given; do not recalculate or invent any. A null means there is not enough history yet: say so rather than filling in a number. " +
  "Percent fields end in Pct. Ratios like currentRatio are times (1.5 = 1.5x). Days fields are days. " +
  "growthLevers compare the latest window with the window before it: lower is better for cogsPctOfRevenue and operatingExpensesPctOfRevenue, higher is better for avgSellingPrice and averageOrderValue. " +
  "manualOps counts edits, deletes, stock adjustments, write-offs and returns in the recent window; a high correctionRatePct is a data-quality signal worth a gentle mention, not an accusation. " +
  "Money amounts are in the business currency.";
