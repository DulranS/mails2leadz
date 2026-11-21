// Head office receives a site's monthly royalty statement. The site authenticates with its own key, which head office issued for it: the
// route finds that site's stored hash and compares in constant time. A revoked or unknown site is refused. The statement is stored once, as
// pending, for head office to confirm; nothing is booked here. A repeat send for the same site and month is a no-op.
import { createHash, timingSafeEqual } from "node:crypto";
import { openBusinessAdmin } from "@/lib/businessGate";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { businessIdFrom, json } from "@/lib/leadApiAuth";
import { validateStatement, statementDocId } from "@/lib/royaltyInbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

export async function POST(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    if (await isRateLimited("royalty-statement-ip", requestIp(req), 120, 60 * 60 * 1000)) return json({ error: "Too many requests. Try again later." }, 429);
    const found = await openBusinessAdmin(businessId);
    if (!found) return json({ error: "This business can't take statements right now." }, 404);

    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: "Send the statement as a JSON body." }, 400); }
    const parsed = validateStatement(body);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const st = parsed.value;

    const auth = req.headers.get("authorization") ?? "";
    const given = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const site = (await found.base.collection("royaltyInboxSites").doc(st.sourceBusinessId).get()).data() as
      | { keyHash?: string; revokedAt?: number } | undefined;
    if (!site?.keyHash || site.revokedAt || !given) return json({ error: "That site is not allowed to send statements to this business." }, 403);
    const a = Buffer.from(sha256Hex(given)), b = Buffer.from(site.keyHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return json({ error: "That key does not match this site." }, 401);

    const id = statementDocId(st.sourceBusinessId, st.period);
    try {
      await found.base.collection("royaltyStatements").doc(id).create({
        sourceBusinessId: st.sourceBusinessId,
        sourceName: st.sourceName,
        period: st.period,
        currency: st.currency,
        rows: st.rows,
        royaltyDue: Math.round(st.rows.reduce((t, r) => t + r.royalty, 0) * 100) / 100,
        status: "pending",
        receivedAt: Date.now(),
      });
    } catch (err) {
      if ((err as { code?: number }).code === 6) return json({ status: "duplicate", id }, 200);
      throw err;
    }
    return json({ status: "received", id }, 201);
  } catch (err) {
    console.error("[royalty statement POST]", err);
    return json({ error: "Couldn't receive that statement. Try again in a moment." }, 500);
  }
}
