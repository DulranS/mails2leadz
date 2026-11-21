// Server-only. The bank feed's state for the Integrations page: whether the server is set up for Plaid (and which settings are missing,
// by name only), and the banks connected for this business. No token, key or account number leaves here (account names and the last
// four digits only). Owner only, never the public demo.
import { aiErrorResponse } from "@/lib/apiError";
import { plaidSettings } from "@/lib/bankFeed";
import { requireFeedOwner } from "@/lib/bankFeedServer";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { businessId } = await requireFeedOwner(req);
    const settings = plaidSettings(process.env);
    const db = getAdminDb();
    const snap = await db.collection("users").doc(businessId).collection("bankFeeds").get();
    const items = snap.docs.map((d) => {
      const data = d.data() as {
        institutionName?: string;
        accounts?: Array<{ name?: string; mask?: string | null }>;
        lastSyncAt?: number;
        lastSyncAdded?: number;
        lastError?: string | null;
      };
      return {
        id: d.id,
        institutionName: data.institutionName ?? "Bank",
        accounts: (data.accounts ?? []).map((a) => ({ name: a.name ?? "Account", mask: a.mask ?? null })),
        lastSyncAt: data.lastSyncAt ?? null,
        lastSyncAdded: data.lastSyncAdded ?? null,
        lastError: data.lastError ?? null,
      };
    });
    return Response.json({ configured: settings.configured, missing: settings.missing, env: settings.env, items });
  } catch (err) {
    return aiErrorResponse(err, "bank-feed-status");
  }
}
