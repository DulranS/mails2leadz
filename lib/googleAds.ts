// Google Ads spend import for the promo campaign comparison. Pure: builds the query, reads the reply and turns cost into money.
// The network calls live in app/api/ads/google-spend/route.ts. The result is a suggestion the owner reviews and saves.
//
// Google reports cost in "micros" (millionths of the account currency), so 1,250,000 micros is 1.25. Rows come back per day per
// campaign; they are added up by campaign name here, so a month is one line per campaign.

import type { CampaignSpendRow } from "@/lib/adSpend";

export const DEFAULT_GOOGLE_ADS_VERSION = "v20";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function googleAdsVersion(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  return /^v\d{1,2}$/.test(v) ? v : DEFAULT_GOOGLE_ADS_VERSION;
}

// Google customer ids are ten digits. Dashes (123-456-7890, as Google shows them) are removed. Null when it is not ten digits.
export function normalizeCustomerId(raw: string | undefined): string | null {
  const id = (raw ?? "").replace(/-/g, "").trim();
  return /^\d{10}$/.test(id) ? id : null;
}

export function searchStreamUrl(customerId: string, version: string): string {
  return `https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:searchStream`;
}

// One campaign's cost per day in the range, both dates inclusive. Null when a date is not ISO or the range is backwards.
export function campaignCostQuery(from: string, to: string): string | null {
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return null;
  return `SELECT campaign.name, metrics.cost_micros FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}'`;
}

// The reply is a list of batches, each with results. Null when the shape is wrong (never a guessed figure).
export function parseCampaignCosts(json: unknown): CampaignSpendRow[] | null {
  if (!Array.isArray(json)) return null;
  const totals = new Map<string, number>();
  for (const batch of json) {
    const results = (batch as { results?: unknown })?.results;
    if (!Array.isArray(results)) continue;
    for (const item of results) {
      const r = item as { campaign?: { name?: unknown }; metrics?: { costMicros?: unknown } };
      const name = typeof r?.campaign?.name === "string" ? r.campaign.name.trim() : "";
      const micros = Number(r?.metrics?.costMicros);
      if (!name || !Number.isFinite(micros) || micros < 0) continue;
      totals.set(name, (totals.get(name) ?? 0) + micros);
    }
  }
  return [...totals.entries()].map(([name, micros]) => ({ name, spend: Math.round(micros / 10_000) / 100 }));
}

// A readable message from an error reply, or null when there is none.
export function googleAdsError(json: unknown): string | null {
  const first = Array.isArray(json) ? json[0] : json;
  const msg = (first as { error?: { message?: unknown } })?.error?.message;
  return typeof msg === "string" && msg.trim() ? msg.trim().slice(0, 200) : null;
}

// The short-lived access token from a refresh-token exchange. Null when none came back.
export function parseAccessToken(json: unknown): string | null {
  const t = (json as { access_token?: unknown })?.access_token;
  return typeof t === "string" && t.length > 0 ? t : null;
}

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
