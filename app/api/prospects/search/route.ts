// Server-only. Finds businesses of one kind in one area from OpenStreetMap (free, no key) and returns them for the owner to
// review. Writes nothing: the owner ticks which to add, and the page adds them as ordinary New leads.
//
// Owner and Manager only (same sign-in, suspension and role rule as the AI routes), never the public demo, and at most a
// handful of searches per business per day: the map services are free community services, so the app is polite to them.
import { requireAiContext } from "@/lib/firebaseAdmin";
import { isRateLimited } from "@/lib/rateLimit";
import { aiErrorResponse } from "@/lib/apiError";
import { runProspectSearch } from "@/lib/prospectSearch";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROSPECT_SEARCHES_PER_DAY = 15;

export async function POST(req: Request) {
  try {
    const { businessId, accountKind } = await requireAiContext(req);
    if (accountKind === "public_demo") {
      return Response.json({ error: "Finding prospects isn't available in the demo. Request a free trial to try it on your own business." }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as { category?: unknown; area?: unknown };
    // Counted only when the request is a real search (a missing field is a form mistake, not a search).
    const valid = typeof body.category === "string" && typeof body.area === "string" && body.area.trim().length >= 2;
    if (valid && (await isRateLimited("prospect-search", businessId, PROSPECT_SEARCHES_PER_DAY, 24 * 60 * 60 * 1000))) {
      return Response.json({ error: `You've used today's ${PROSPECT_SEARCHES_PER_DAY} searches. The free map service is shared, so this is limited. Try again tomorrow.` }, { status: 429 });
    }
    const result = await runProspectSearch({ category: body.category, area: body.area, fetchImpl: fetch, contact: process.env.OSM_CONTACT_EMAIL });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ prospects: result.prospects, place: result.place, categoryLabel: result.categoryLabel });
  } catch (err) {
    return aiErrorResponse(err, "prospects-search");
  }
}
