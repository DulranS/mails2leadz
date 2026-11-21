// Server-only (v319). Orders one driver's delivery stops by distance from the business address, for the delivery run sheet. The order
// is a suggestion: nothing on any order is changed. The addresses are read here from the database; the browser sends only order ids.
// Owner and manager only. Without GOOGLE_MAPS_KEY it answers { configured: false } and calls nothing.
import { requireAiContext, AiAuthError } from "@/lib/firebaseAdmin";
import { planRoute, MAX_ROUTE_STOPS, type RouteStop } from "@/lib/routePlan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ID_RE = /^[A-Za-z0-9_-]{6,200}$/;

export async function POST(req: Request) {
  try {
    const ctx = await requireAiContext(req, { roles: ["owner", "manager"] });
    const key = process.env.GOOGLE_MAPS_KEY;
    if (!key || !key.trim()) {
      return Response.json({ configured: false, error: "Route planning isn't set up on this server yet. The operator needs to set GOOGLE_MAPS_KEY." });
    }
    const body = (await req.json().catch(() => ({}))) as { orderIds?: unknown };
    const ids = Array.isArray(body.orderIds) ? body.orderIds : [];
    if (ids.length === 0 || ids.length > MAX_ROUTE_STOPS || !ids.every((x) => typeof x === "string" && ID_RE.test(x))) {
      throw new AiAuthError(`Choose between 1 and ${MAX_ROUTE_STOPS} orders to plan.`, 400);
    }
    const base = ctx.db.collection("users").doc(ctx.businessId);
    const settings = (await base.collection("meta").doc("settings").get()).data() as { businessAddress?: string } | undefined;
    const stops: RouteStop[] = [];
    for (const id of ids as string[]) {
      const snap = await base.collection("webOrders").doc(id).get();
      if (!snap.exists) continue;
      const o = snap.data() as { customerName?: string; customerAddress?: string };
      stops.push({ id, name: (o.customerName ?? "Customer").slice(0, 120), address: (o.customerAddress ?? "").slice(0, 300) });
    }
    const plan = await planRoute({ depotAddress: settings?.businessAddress ?? "", stops, key });
    return Response.json(plan);
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[routes/plan]", err instanceof Error ? err.name : "error");
    return Response.json({ error: "Couldn't plan the route. Try again." }, { status: 500 });
  }
}
