// A site sends its monthly royalty statement to head office. Signed in as the site's owner or manager; the site's own business id is set
// here, from the sign-in, never from the browser. Head office's details come from the site's saved connection (Integrations: royalty to head
// office). Nothing is booked by sending; head office confirms it.
import { revealedValues } from "@/lib/secretBox";
import { requireAiContext, AiAuthError } from "@/lib/firebaseAdmin";
import { isRateLimited } from "@/lib/rateLimit";
import { validateStatement } from "@/lib/royaltyInbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ctx = await requireAiContext(req);
    if (await isRateLimited("royalty-send", ctx.businessId, 60, 60 * 60 * 1000)) return Response.json({ error: "Too many sends. Try again later." }, { status: 429 });
    const base = ctx.db.collection("users").doc(ctx.businessId);
    const linkRaw = (await base.collection("integrations").doc("royalty_head").get()).data() as
      | { enabled?: boolean; values?: Record<string, unknown> } | undefined;
    const link = linkRaw ? { enabled: linkRaw.enabled, values: revealedValues(linkRaw.values) as { headBusinessId?: string; apiKey?: string } } : undefined;
    if (!link?.enabled || !link.values?.headBusinessId || !link.values?.apiKey) throw new AiAuthError("Set up the royalty connection to head office first.", 400);
    const settings = ((await base.collection("meta").doc("settings").get()).data() ?? {}) as { businessName?: string };
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = validateStatement({ ...body, sourceBusinessId: ctx.businessId, sourceName: settings.businessName || "Site" });
    if (!parsed.ok) throw new AiAuthError(parsed.error, 400);

    const origin = new URL(req.url).origin;
    const res = await fetch(`${origin}/api/v1/businesses/${encodeURIComponent(link.values.headBusinessId)}/royalty/statement`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${link.values.apiKey}` },
      body: JSON.stringify(parsed.value),
      signal: AbortSignal.timeout(15_000),
    });
    const reply = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
    if (!res.ok) return Response.json({ error: reply.error ?? "Head office did not accept the statement." }, { status: 502 });
    return Response.json({ ok: true, status: reply.status ?? "received" });
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[royalty send]", err);
    return Response.json({ error: "Couldn't send the statement. Try again in a moment." }, { status: 500 });
  }
}
