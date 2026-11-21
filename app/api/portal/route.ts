// The customer's account page (app/portal). Unauthenticated on purpose: the only credential is the signed account link, which names
// one business and one customer. It returns that customer's invoices with their balances, and a signed link to each invoice. Cost
// prices, margins, stock and every other business record are never sent.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyLinkToken, signToken } from "@/lib/signedToken";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { loadInvoice } from "@/lib/invoiceServer";
import { summariseInvoice, invoiceRefFor } from "@/lib/invoicePortal";
import { groupSalesByInvoice } from "@/lib/calculations";
import { accountView, MAX_PORTAL_INVOICES, PORTAL_LINK_DAYS, type PortalInvoiceInput } from "@/lib/accountPortal";
import { todayIso } from "@/lib/format";
import type { Sale } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = "This link is not valid. Ask the business to send it again.";
const DAY_MS = 86_400_000;

export async function GET(req: Request) {
  try {
    if (await isRateLimited("portal-view", requestIp(req), 240, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }
    const subject = verifyLinkToken(new URL(req.url).searchParams.get("t"), "portal");
    const slash = subject?.indexOf("/") ?? -1;
    if (!subject || slash <= 0) return Response.json({ error: NOT_FOUND }, { status: 404 });
    const businessId = subject.slice(0, slash);
    const customerId = subject.slice(slash + 1);

    const db = getAdminDb();
    const base = db.collection("users").doc(businessId);
    const [customerSnap, settingsSnap] = await Promise.all([base.collection("customers").doc(customerId).get(), base.collection("meta").doc("settings").get()]);
    if (!customerSnap.exists) return Response.json({ error: NOT_FOUND }, { status: 404 });
    const settings = (settingsSnap.data() ?? {}) as { businessName?: string; currency?: string };
    const origin = new URL(req.url).origin;
    const today = todayIso();

    const salesSnap = await base.collection("sales").where("customerId", "==", customerId).get();
    const sales = salesSnap.docs.map((d) => ({ ...(d.data() as Sale), id: d.id }));
    const groups = groupSalesByInvoice(sales).slice(0, MAX_PORTAL_INVOICES);

    // Invoices load in small parallel batches: the same reads as before, but a customer with many invoices no longer waits on each in turn.
    const rows: PortalInvoiceInput[] = [];
    const BATCH = 8;
    for (let i = 0; i < groups.length; i += BATCH) {
      const batch = groups.slice(i, i + BATCH);
      const loaded = await Promise.all(batch.map((g) => loadInvoice(db, businessId, g.invoiceId ?? g.primary.id)));
      batch.forEach((g, j) => {
        const invoice = loaded[j];
        if (!invoice) return;
        const key = g.invoiceId ?? g.primary.id;
        const summary = summariseInvoice({ ...invoice, today });
        const token = signToken("invoice", `${businessId}/${key}`, PORTAL_LINK_DAYS * DAY_MS);
        rows.push({
          key,
          reference: invoiceRefFor(key),
          issuedOn: summary.firstDate,
          summary,
          ...(token ? { link: `${origin}/invoice/${token}` } : {}),
        });
      });
    }

    return Response.json({
      businessName: settings.businessName ?? "",
      currency: settings.currency ?? "",
      customerName: (customerSnap.data() as { name?: string }).name ?? "",
      ...accountView(rows),
    });
  } catch (err) {
    console.error("[portal GET]", err);
    return Response.json({ error: "Couldn't load the account. Try again in a moment." }, { status: 500 });
  }
}
