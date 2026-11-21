// Server-only. Reads what each Google Ads campaign spent for a date range and matches it to your promo codes. Runs only when the
// owner presses "Import" on Settings. It reads the ad account and writes nothing. The refresh token and the access token are
// sent to Google only, never returned or logged; error text is cleaned of them before it goes back.
import { requireAiContext, AiAuthError } from "@/lib/firebaseAdmin";
import { aiErrorResponse } from "@/lib/apiError";
import { isConfigured } from "@/lib/connections";
import { matchSpendToCodes } from "@/lib/adSpend";
import {
  campaignCostQuery,
  googleAdsError,
  googleAdsVersion,
  GOOGLE_TOKEN_URL,
  normalizeCustomerId,
  parseAccessToken,
  parseCampaignCosts,
  searchStreamUrl,
} from "@/lib/googleAds";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_CODES = 30;
const fail = (status: number, error: string) => Response.json({ error }, { status });

function scrub(text: string, secrets: string[]): string {
  return secrets.filter(Boolean).reduce((t, s) => t.split(s).join("[hidden]"), text);
}

export async function POST(req: Request) {
  try {
    await requireAiContext(req);
    if (!isConfigured("google-ads")) {
      return fail(503, "Google Ads import is not connected yet. Add GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN and GOOGLE_ADS_CUSTOMER_ID to the app's environment settings, then try again.");
    }
    const env = process.env;
    const devToken = (env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "").trim();
    const clientId = (env.GOOGLE_ADS_CLIENT_ID ?? "").trim();
    const clientSecret = (env.GOOGLE_ADS_CLIENT_SECRET ?? "").trim();
    const refreshToken = (env.GOOGLE_ADS_REFRESH_TOKEN ?? "").trim();
    const customerId = normalizeCustomerId(env.GOOGLE_ADS_CUSTOMER_ID);
    const loginCustomerId = normalizeCustomerId(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
    const version = googleAdsVersion(env.GOOGLE_ADS_API_VERSION);
    const secrets = [devToken, clientSecret, refreshToken];
    if (!customerId) return fail(503, "GOOGLE_ADS_CUSTOMER_ID should be the ten-digit customer id from your Google Ads account.");

    const body = (await req.json().catch(() => null)) as { from?: unknown; to?: unknown; codes?: unknown } | null;
    const from = typeof body?.from === "string" ? body.from : "";
    const to = typeof body?.to === "string" ? body.to : "";
    const codes = Array.isArray(body?.codes) ? body.codes.filter((c): c is string => typeof c === "string").slice(0, MAX_CODES) : [];
    const query = campaignCostQuery(from, to);
    if (!query) return fail(400, "Pick a valid date range.");
    if (codes.length === 0) return fail(400, "Add your promo codes on this page first, so the spend has somewhere to go.");

    // 1. Exchange the long-lived refresh token for a short-lived access token.
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const tokenJson = await tokenRes.json().catch(() => null);
    const accessToken = tokenRes.ok ? parseAccessToken(tokenJson) : null;
    if (!accessToken) {
      return fail(502, "Google didn't accept the Google Ads sign-in. Check the client id, client secret and refresh token.");
    }

    // 2. Ask for the campaign costs.
    const headers: Record<string, string> = {
      "content-type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "developer-token": devToken,
    };
    if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;
    const res = await fetch(searchStreamUrl(customerId, version), {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = googleAdsError(json);
      return fail(502, msg ? `Google Ads said: ${scrub(msg, secrets)}` : "Google Ads didn't return the spend. Check the customer id and developer token.");
    }
    const rows = parseCampaignCosts(json);
    if (!rows) return fail(502, "Google Ads returned something unexpected. Try again later.");

    const match = matchSpendToCodes(rows, codes);
    return Response.json({ from, to, ...match, campaignsRead: rows.length });
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    return aiErrorResponse(err, "ads-google-spend");
  }
}
