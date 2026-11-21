// A supplier's order page (app/supplier). Unauthenticated on purpose: the only credential is the signed supplier link, which names one
// business and one supplier. It returns that supplier's open orders (what was ordered, when, and the expected date). It never returns a
// cost, a margin or any sales figure.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyLinkToken } from "@/lib/signedToken";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { openOrdersFor } from "@/lib/accountPortal";
import type { Product, PurchaseOrder } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = "This link is not valid. Ask the business to send it again.";

export async function GET(req: Request) {
  try {
    if (await isRateLimited("supplier-view", requestIp(req), 240, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }
    const subject = verifyLinkToken(new URL(req.url).searchParams.get("t"), "supplier");
    const slash = subject?.indexOf("/") ?? -1;
    if (!subject || slash <= 0) return Response.json({ error: NOT_FOUND }, { status: 404 });
    const businessId = subject.slice(0, slash);
    const supplierId = subject.slice(slash + 1);

    const db = getAdminDb();
    const base = db.collection("users").doc(businessId);
    const [supplierSnap, settingsSnap] = await Promise.all([base.collection("suppliers").doc(supplierId).get(), base.collection("meta").doc("settings").get()]);
    if (!supplierSnap.exists) return Response.json({ error: NOT_FOUND }, { status: 404 });
    const supplierName = (supplierSnap.data() as { name?: string }).name ?? "";
    const settings = (settingsSnap.data() ?? {}) as { businessName?: string };

    // Only this supplier's orders are read (a query on the supplier's name); openOrdersFor then keeps the open ones.
    const mine = (await base.collection("purchaseOrders").where("supplier", "==", supplierName).limit(500).get()).docs.map((d) => ({ ...(d.data() as PurchaseOrder), id: d.id }));
    const open = openOrdersFor(mine, supplierName).slice(0, 200);
    const productIds = [...new Set(open.map((o) => o.productId))];
    const productSnaps = productIds.length ? await db.getAll(...productIds.map((id) => base.collection("products").doc(id))) : [];
    const names = new Map<string, string>();
    for (const s of productSnaps) if (s.exists) names.set(s.id, (s.data() as Product).name);

    return Response.json({
      businessName: settings.businessName ?? "",
      supplierName,
      orders: open.map((o) => ({
        id: o.id,
        product: names.get(o.productId) ?? "Item",
        qtyOrdered: o.qtyOrdered,
        orderDate: o.orderDate,
        expectedDate: o.expectedDate ?? null,
        status: o.status,
        confirmedDate: o.supplierAck?.confirmedDate ?? null,
      })),
    });
  } catch (err) {
    console.error("[supplier GET]", err);
    return Response.json({ error: "Couldn't load the orders. Try again in a moment." }, { status: 500 });
  }
}
