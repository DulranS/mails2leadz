// Server-only. Asks Plaid for a short-lived link token, which the browser needs to open Plaid Link (the bank picker). The keys stay here.
// Owner only, never the public demo. Without the Plaid settings this answers 503 and names the missing settings (by name, never value).
import { aiErrorResponse } from "@/lib/apiError";
import { plaidSettings } from "@/lib/bankFeed";
import { requireFeedOwner } from "@/lib/bankFeedServer";
import { createLinkToken, PlaidError } from "@/lib/plaidClient";
import { isRateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 20;

const LINKS_PER_DAY = 20;

export async function POST(req: Request) {
  try {
    const { uid, businessId } = await requireFeedOwner(req);
    const settings = plaidSettings(process.env);
    if (!settings.configured) {
      return Response.json(
        { error: `The bank feed isn't set up on this server yet. The operator needs to set ${settings.missing.join(", ")}.`, missing: settings.missing },
        { status: 503 }
      );
    }
    if (await isRateLimited("bank-feed-link", businessId, LINKS_PER_DAY, 24 * 60 * 60 * 1000)) {
      return Response.json({ error: "You've opened the bank picker too many times today. Try again tomorrow." }, { status: 429 });
    }
    const linkToken = await createLinkToken(settings, uid);
    return Response.json({ linkToken });
  } catch (err) {
    if (err instanceof PlaidError) return Response.json({ error: err.message }, { status: err.status === null ? 503 : 502 });
    return aiErrorResponse(err, "bank-feed-link-token");
  }
}
