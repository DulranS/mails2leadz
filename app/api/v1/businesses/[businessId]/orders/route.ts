// The web order API (v183). A shop platform or a form tool (through Zapier, Make or n8n) posts a new order here with the business's
// lead API key. It goes into the queue for the owner to confirm; it is not recorded as a sale, and no stock or money moves until the
// owner confirms it on the Operations page. A repeated externalId is not queued twice.
//
//   POST /api/v1/businesses/{businessId}/orders  body: { externalId, customerName?, contact?, note?, placedOn?, lines: [{ name, sku?, qty, unitPrice? }] }
//                                                -> 201 queued | 200 duplicate
import { authoriseLeadApi, businessIdFrom, json } from "@/lib/leadApiAuth";
import { notifyOwner } from "@/lib/leadIntakeServer";
import { cleanWebOrder, matchLines, orderTotal } from "@/lib/webOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    const auth = await authoriseLeadApi(req, businessId);
    if (!auth.ok) return auth.response;
    const { found } = auth;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Send the order as a JSON body." }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Send the order as a JSON object." }, 400);

    const parsed = cleanWebOrder(body as Record<string, unknown>, new Date().toISOString().slice(0, 10));
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const o = parsed.value;

    const same = await found.base.collection("webOrders").where("externalId", "==", o.externalId).limit(1).get();
    if (!same.empty) return json({ status: "duplicate", id: same.docs[0].id }, 200);

    const productSnap = await found.base.collection("products").get();
    const products = productSnap.docs.map((d) => {
      const x = d.data();
      return { id: d.id, name: String(x.name ?? ""), sku: x.sku as string | undefined, barcode: x.barcode as string | undefined, price: typeof x.price === "number" ? x.price : undefined };
    });
    const lines = matchLines(o.lines, products).map((l) => ({
      name: l.name,
      qty: l.qty,
      ...(l.productId ? { productId: l.productId } : {}),
      ...(l.unitPrice !== undefined ? { unitPrice: l.unitPrice } : {}),
    }));
    const unmatched = lines.filter((l) => !("productId" in l)).length;

    const ref = await found.base.collection("webOrders").add({
      externalId: o.externalId,
      customerName: o.customerName,
      ...(o.contact ? { contact: o.contact } : {}),
      ...(o.note ? { note: o.note } : {}),
      placedOn: o.placedOn,
      ...(o.promisedDate ? { promisedDate: o.promisedDate } : {}),
      ...(o.customerAddress ? { customerAddress: o.customerAddress } : {}),
      lines,
      total: orderTotal(lines),
      status: "new",
      createdAt: Date.now(),
    });
    await notifyOwner(found.base, {
      type: "order_received",
      title: `Web order from ${o.customerName}`,
      message: `${lines.length} line${lines.length === 1 ? "" : "s"}${unmatched ? `, ${unmatched} need matching to a product` : ""}. Confirm it on Operations to record the sales.`,
      entityId: ref.id,
      entityType: "webOrder",
    });
    return json({ status: "queued", id: ref.id, unmatchedLines: unmatched }, 201);
  } catch (err) {
    console.error("[order api POST]", err);
    return json({ error: "Couldn't queue that order. Try again in a moment." }, 500);
  }
}
