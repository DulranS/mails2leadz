// Making Tax Digital for Income Tax, quarterly updates to HMRC (v319). Pure: no I/O. The network part is in lib/hmrcClient.ts.
//
// What it does: connects the business to HMRC (OAuth), and sends one quarter's turnover and expenses for a self-employment business.
// The figures come from the books (sales and one-off expenses in the quarter). Sending needs the owner to confirm the figures, the
// server switch HMRC_SUBMIT_ENABLED to be "true", and a live connection. Until then nothing is sent.
//
// Keys and settings are read from the environment only: HMRC_CLIENT_ID, HMRC_CLIENT_SECRET, HMRC_REDIRECT_URI, HMRC_API_BASE (default:
// the HMRC sandbox), HMRC_AUTH_BASE (default: the sandbox sign-in), HMRC_SUBMIT_ENABLED. Nothing here returns or logs a value.
//
// Not verified against live HMRC: the endpoint path, the period body and the Gov-Client headers below come from HMRC's published
// specification as understood when this was written. CHANGELOG v319 lists what is and is not filled with certainty.

export const HMRC_SANDBOX_API = "https://test-api.service.hmrc.gov.uk";
export const HMRC_SANDBOX_AUTH = "https://test-www.tax.service.gov.uk";
export const HMRC_SCOPES = "read:self-assessment write:self-assessment";

export interface HmrcSettings {
  configured: boolean;
  missing: string[]; // the NAMES of settings that are not set or not valid
  apiBase: string | null;
  authBase: string | null;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  submitEnabled: boolean;
}

function webAddress(v: string | undefined): string | null {
  if (!v || !v.trim()) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin + u.pathname.replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

/** The HMRC settings from an environment map. Anything missing or invalid gives configured: false and names it. */
export function hmrcSettings(env: Record<string, string | undefined>): HmrcSettings {
  const missing: string[] = [];
  const clientId = (env.HMRC_CLIENT_ID ?? "").trim();
  const clientSecret = (env.HMRC_CLIENT_SECRET ?? "").trim();
  const redirectUri = (env.HMRC_REDIRECT_URI ?? "").trim();
  const apiBase = env.HMRC_API_BASE !== undefined && env.HMRC_API_BASE.trim() !== "" ? webAddress(env.HMRC_API_BASE) : HMRC_SANDBOX_API;
  const authBase = env.HMRC_AUTH_BASE !== undefined && env.HMRC_AUTH_BASE.trim() !== "" ? webAddress(env.HMRC_AUTH_BASE) : HMRC_SANDBOX_AUTH;
  if (!clientId) missing.push("HMRC_CLIENT_ID");
  if (!clientSecret) missing.push("HMRC_CLIENT_SECRET");
  if (!redirectUri || !webAddress(redirectUri)) missing.push("HMRC_REDIRECT_URI");
  if (!apiBase) missing.push("HMRC_API_BASE");
  if (!authBase) missing.push("HMRC_AUTH_BASE");
  return {
    configured: missing.length === 0,
    missing,
    apiBase,
    authBase,
    clientId,
    clientSecret,
    redirectUri,
    submitEnabled: (env.HMRC_SUBMIT_ENABLED ?? "").trim() === "true",
  };
}

/** The sign-in address the owner is sent to. `state` is a random value kept on the server and checked when HMRC comes back. */
export function authorizeUrl(s: { authBase: string; clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({ response_type: "code", client_id: s.clientId, scope: HMRC_SCOPES, state: s.state, redirect_uri: s.redirectUri });
  return `${s.authBase}/oauth/authorize?${q.toString()}`;
}

/** The tax year that starts in the given calendar year (6 April). 2026 is 2026-27. */
export function taxYearLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export interface QuarterPeriod { index: number; from: string; to: string; label: string }

/** The four quarterly periods of a tax year that starts on 6 April of `startYear`. The fourth ends on 5 April. */
export function quarterPeriods(startYear: number): QuarterPeriod[] {
  const y = startYear;
  const y1 = startYear + 1;
  return [
    { index: 1, from: `${y}-04-06`, to: `${y}-07-05`, label: "6 Apr to 5 Jul" },
    { index: 2, from: `${y}-07-06`, to: `${y}-10-05`, label: "6 Jul to 5 Oct" },
    { index: 3, from: `${y}-10-06`, to: `${y1}-01-05`, label: "6 Oct to 5 Jan" },
    { index: 4, from: `${y1}-01-06`, to: `${y1}-04-05`, label: "6 Jan to 5 Apr" },
  ];
}

export function quarterFor(startYear: number, index: number): QuarterPeriod | null {
  return quarterPeriods(startYear).find((q) => q.index === index) ?? null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const inQuarter = (date: string | undefined, q: { from: string; to: string }) => !!date && ISO.test(date) && date >= q.from && date <= q.to;
const money = (n: number) => Math.round(n * 100) / 100;

/**
 * The quarter's figures from the books. Turnover is the net sales (quantity times unit price, before sales tax), the same measure the
 * MTD threshold test uses (lib/mtd.ts: sales stand in for income). Expenses are one-off expenses dated in the quarter; recurring
 * expenses and cost of goods are not included here, so the owner must check the figures before sending.
 */
export function quarterFigures(
  q: { from: string; to: string },
  sales: Array<{ date: string; qty?: number; unitPrice?: number }>,
  expenses: Array<{ startDate: string; amount: number; isRecurring?: boolean }>
): { turnover: number; expenses: number; salesCount: number; expenseCount: number } {
  let turnover = 0;
  let salesCount = 0;
  for (const s of sales) {
    if (!inQuarter(s.date, q)) continue;
    turnover += (s.qty ?? 0) * (s.unitPrice ?? 0);
    salesCount++;
  }
  let spent = 0;
  let expenseCount = 0;
  for (const e of expenses) {
    if (e.isRecurring || !inQuarter(e.startDate, q)) continue;
    spent += e.amount;
    expenseCount++;
  }
  return { turnover: money(turnover), expenses: money(spent), salesCount, expenseCount };
}

export interface QuarterlyUpdateBody {
  periodDates: { periodStartDate: string; periodEndDate: string };
  periodIncome: { turnover: number };
  periodExpenses: { consolidatedExpenses: number };
}

/** The quarterly update body. Refuses a bad period or a negative or non-finite figure, with a reason, rather than sending it. */
export function buildQuarterlyUpdate(i: { from: string; to: string; turnover: number; expenses: number }): { body: QuarterlyUpdateBody } | { error: string } {
  if (!ISO.test(i.from) || !ISO.test(i.to) || i.from > i.to) return { error: "The quarter's dates are not valid." };
  for (const [name, v] of [["turnover", i.turnover], ["expenses", i.expenses]] as const) {
    if (!Number.isFinite(v) || v < 0 || v > 1e12) return { error: `The ${name} for the quarter is not a valid amount.` };
  }
  return {
    body: {
      periodDates: { periodStartDate: i.from, periodEndDate: i.to },
      periodIncome: { turnover: money(i.turnover) },
      periodExpenses: { consolidatedExpenses: money(i.expenses) },
    },
  };
}

/** The national insurance number in its usual shape (two letters, six digits, a final letter A to D), or null. */
export function normaliseNino(raw: string): string | null {
  const t = raw.replace(/\s+/g, "").toUpperCase();
  return /^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$/.test(t) ? t : null;
}

/** The self-employment business id HMRC issues (X, then letters, then IS, then eleven digits), or null. */
export function normaliseBusinessId(raw: string): string | null {
  const t = raw.replace(/\s+/g, "").toUpperCase();
  return /^X[A-Z0-9]{1,2}IS\d{11}$/.test(t) ? t : null;
}

/**
 * Why a quarter must not be sent, or null when it may be. In order: the server switch, the owner's confirmation, a live connection,
 * and the business and quarter being set. Each reason is plain words and names no value.
 */
export function submitRefusal(i: { submitEnabled: boolean; confirmed: boolean; connected: boolean; hasBusiness: boolean }): string | null {
  if (!i.submitEnabled) return "Sending to HMRC is switched off on this server (HMRC_SUBMIT_ENABLED is not true). Nothing has been sent.";
  if (!i.confirmed) return "Confirm the figures for this quarter before sending.";
  if (!i.connected) return "Connect the business to HMRC first.";
  if (!i.hasBusiness) return "Save the National Insurance number and the business ID first.";
  return null;
}

/**
 * The fraud-prevention headers this build can fill with confidence. Each value is set from something the server knows for certain.
 * Not filled (needs the browser, the device or the sign-in details, and is listed in CHANGELOG v319): Gov-Client-Device-ID,
 * Gov-Client-Multi-Factor, Gov-Client-Local-IPs, Gov-Client-Public-IP, Gov-Client-Public-Port, Gov-Client-Timezone,
 * Gov-Client-Screens, Gov-Client-Window-Size, Gov-Client-Browser-Plugins, Gov-Client-Browser-JS-User-Agent, Gov-Client-User-Agent,
 * Gov-Vendor-Forwarded, Gov-Vendor-License-IDs.
 */
export function govHeaders(i: { appVersion: string; userId: string }): Record<string, string> {
  return {
    "Gov-Vendor-Product-Name": "Balancr",
    "Gov-Vendor-Version": `balancr=${i.appVersion}`,
    "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
    "Gov-Client-User-IDs": `balancr=${encodeURIComponent(i.userId)}`,
  };
}
