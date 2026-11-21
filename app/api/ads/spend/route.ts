// Server-only. Reads what each campaign spent in ad platform (Meta Ads) for a date range and matches it to your promo codes.
// Runs only when the owner presses "Import" on Settings. It reads the ad account and writes nothing: the result is a suggestion
// the owner reviews and saves. The access token is sent in a request header, never in a URL, and is never returned or logged.
import { requireAiContext, AiAuthError } from "@/lib/firebaseAdmin";
import { aiErrorResponse } from "@/lib/apiError";
import { isConfigured } from "@/lib/connections";
import { graphVersion, insightsUrl, isSafeNextPage, matchSpendToCodes, parseInsights, type CampaignSpendRow } from "@/lib/adSpend";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_PAGES = 5;
const MAX_CODES = 30;

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

export async function POST(req: Request) {
  try {
    await requireAiContext(req);
    if (!isConfigured("ad-spend")) {
      return fail(503, "Ad spend import is not connected yet. Add META_ADS_ACCESS_TOKEN and META_AD_ACCOUNT_ID to the app's environment settings, then try again.");
    }
    const token = (process.env.META_ADS_ACCESS_TOKEN ?? "").trim();
    const accountId = (process.env.META_AD_ACCOUNT_ID ?? "").trim();
    const version = graphVersion(process.env.META_GRAPH_VERSION);

    const body = (await req.json().catch(() => null)) as { from?: unknown; to?: unknown; codes?: unknown } | null;
    const from = typeof body?.from === "string" ? body.from : "";
    const to = typeof body?.to === "string" ? body.to : "";
    const codes = Array.isArray(body?.codes) ? body.codes.filter((c): c is string => typeof c === "string").slice(0, MAX_CODES) : [];
    const url = insightsUrl(accountId, from, to, version);
    if (!url) return fail(400, "Pick a valid date range.");
    if (codes.length === 0) return fail(400, "Add your promo codes on this page first, so the spend has somewhere to go.");

    const rows: CampaignSpendRow[] = [];
    let next: string | null = url;
    for (let page = 0; next && page < MAX_PAGES; page++) {
      const res: Response = await fetch(next, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = String((json as { error?: { message?: unknown } } | null)?.error?.message ?? "").slice(0, 200);
        const safe = token ? msg.split(token).join("[hidden]") : msg;
        return fail(502, safe ? `Meta Ads said: ${safe}` : "Meta Ads didn't return the spend. Check the token and the ad account id.");
      }
      const parsed = parseInsights(json);
      if (!parsed) return fail(502, "Meta Ads returned something unexpected. Try again later.");
      rows.push(...parsed.rows);
      next = parsed.next && isSafeNextPage(parsed.next) ? parsed.next : null;
    }

    const match = matchSpendToCodes(rows, codes);
    return Response.json({ from, to, ...match, campaignsRead: rows.length });
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    return aiErrorResponse(err, "ads-spend");
  }
}
