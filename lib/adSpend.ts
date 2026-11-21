// Ad spend import for the promo campaign comparison. Pure: builds the request, reads the reply, and matches campaigns to promo
// codes. The network call lives in app/api/ads/spend/route.ts. The result is a suggestion the owner reviews and saves; nothing
// is posted to expenses or profit from here.
//
// Matching rule: a promo code counts a campaign when the code appears in the campaign's name as a whole word (case-insensitive).
// "SUMMER10 - Instagram" matches SUMMER10 but not SUMMER1. If a name holds more than one code, the longest code wins, so the
// spend is never counted twice.

export const DEFAULT_GRAPH_VERSION = "v21.0";
const GRAPH_HOST = "https://graph.facebook.com/";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT_RE = /^\d{1,20}$/;
const VERSION_RE = /^v\d{1,2}\.\d{1,2}$/;

export interface CampaignSpendRow {
  name: string;
  spend: number;
}

export function graphVersion(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  return VERSION_RE.test(v) ? v : DEFAULT_GRAPH_VERSION;
}

// The account id is written as the digits only (the "act_" prefix is added here). Null when it is not digits.
export function insightsUrl(accountId: string, from: string, to: string, version: string): string | null {
  const id = accountId.trim().replace(/^act_/, "");
  if (!ACCOUNT_RE.test(id) || !DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return null;
  const params = new URLSearchParams({
    level: "campaign",
    fields: "campaign_name,spend",
    time_range: JSON.stringify({ since: from, until: to }),
    limit: "500",
  });
  return `${GRAPH_HOST}${version}/act_${id}/insights?${params.toString()}`;
}

// Only follow a "next page" link that stays on the Graph host, so a token is never sent to another site.
export function isSafeNextPage(url: string): boolean {
  return url.startsWith(GRAPH_HOST);
}

// Reads one page of insights. Null when the reply is not the expected shape (never a guessed figure).
export function parseInsights(json: unknown): { rows: CampaignSpendRow[]; next: string | null } | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (!Array.isArray(o.data)) return null;
  const rows: CampaignSpendRow[] = [];
  for (const item of o.data) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.campaign_name === "string" ? r.campaign_name.trim() : "";
    const spend = Number(r.spend);
    if (!name || !Number.isFinite(spend) || spend < 0) continue;
    rows.push({ name, spend });
  }
  const paging = o.paging as Record<string, unknown> | undefined;
  const next = typeof paging?.next === "string" && isSafeNextPage(paging.next) ? paging.next : null;
  return { rows, next };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The promo code a campaign name points at, or null. Longest code first, so the most specific match wins.
export function codeForCampaign(name: string, codes: string[]): string | null {
  const upper = name.toUpperCase();
  const ordered = [...codes].map((c) => c.toUpperCase()).sort((a, b) => b.length - a.length);
  for (const code of ordered) {
    const re = new RegExp(`(^|[^A-Z0-9_-])${escapeRe(code)}(?=$|[^A-Z0-9_-])`);
    if (re.test(upper)) return code;
  }
  return null;
}

export interface SpendMatch {
  spend: Record<string, number>; // promo code -> amount, rounded to cents
  matchedCampaigns: number;
  unmatched: CampaignSpendRow[]; // campaigns with spend that no promo code claims, biggest first
  totalSpend: number;
}

export function matchSpendToCodes(rows: CampaignSpendRow[], codes: string[]): SpendMatch {
  const spend: Record<string, number> = {};
  const unmatched: CampaignSpendRow[] = [];
  let matchedCampaigns = 0;
  let totalSpend = 0;
  for (const row of rows) {
    totalSpend += row.spend;
    const code = codeForCampaign(row.name, codes);
    if (!code) {
      if (row.spend > 0) unmatched.push(row);
      continue;
    }
    matchedCampaigns += 1;
    spend[code] = Math.round(((spend[code] ?? 0) + row.spend) * 100) / 100;
  }
  unmatched.sort((a, b) => b.spend - a.spend);
  return {
    spend,
    matchedCampaigns,
    unmatched: unmatched.slice(0, 20),
    totalSpend: Math.round(totalSpend * 100) / 100,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The date range for a month: offset 0 = this month up to today, offset -1 = all of last month. Uses the local calendar date so
// a user in Colombo does not get yesterday's date near midnight.
export function monthRange(now: Date, offset: 0 | -1): { from: string; to: string } {
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  if (offset === 0) return { from: isoDay(first), to: isoDay(now) };
  const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: isoDay(first), to: isoDay(lastDay) };
}

// v212b: the campaign spend read from an ad account, turned into Marketing expenses so the cost reaches the profit figures. One expense
// per campaign for the period; a campaign already recorded for the same period (same name) is skipped, so recording twice adds nothing.
// Pure: the caller passes the spend, the period and the expense names already recorded.
export function campaignCostEntries(
  spend: Record<string, number>,
  period: { from: string; to: string },
  alreadyRecorded: Set<string>,
): { name: string; amount: number; category: "Marketing"; startDate: string; notes: string }[] {
  const out: { name: string; amount: number; category: "Marketing"; startDate: string; notes: string }[] = [];
  for (const [code, raw] of Object.entries(spend)) {
    const amount = Math.round(Number(raw) * 100) / 100;
    if (!code.trim() || !Number.isFinite(amount) || amount <= 0) continue;
    const name = `Ads: ${code.trim()} (${period.from} to ${period.to})`;
    if (alreadyRecorded.has(name)) continue;
    out.push({ name, amount, category: "Marketing", startDate: period.to, notes: "Recorded from the ad account's campaign spend." });
  }
  return out;
}
