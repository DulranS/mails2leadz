// Server-only. Trades the one-time public token from Plaid Link for an access token, seals the access token with BALANCR_ENC_KEY and
// stores it on the business's bank feed record. The access token is never returned to the page. Owner only, never the public demo.
import { aiErrorResponse } from "@/lib/apiError";
import { plaidSettings } from "@/lib/bankFeed";
import { feedItemRef, requireFeedOwner } from "@/lib/bankFeedServer";
import { exchangePublicToken, listAccounts, PlaidError } from "@/lib/plaidClient";
import { loadSecretKey, sealValue, SecretKeyMissingError } from "@/lib/secretBox";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 20;

const PUBLIC_TOKEN = /^public-[A-Za-z0-9-]{1,200}$/;

export async function POST(req: Request) {
  try {
    const ctx = await requireFeedOwner(req);
    const settings = plaidSettings(process.env);
    if (!settings.configured) {
      return Response.json({ error: `The bank feed isn't set up on this server yet. The operator needs to set ${settings.missing.join(", ")}.` }, { status: 503 });
    }
    const key = loadSecretKey(process.env.BALANCR_ENC_KEY);
    if (!key) return Response.json({ error: new SecretKeyMissingError().message }, { status: 503 });

    const body = (await req.json().catch(() => ({}))) as { publicToken?: unknown; institutionName?: unknown };
    if (typeof body.publicToken !== "string" || !PUBLIC_TOKEN.test(body.publicToken)) {
      return Response.json({ error: "That bank connection didn't come through. Try connecting the bank again." }, { status: 400 });
    }
    const institutionName = typeof body.institutionName === "string" && body.institutionName.trim() ? body.institutionName.trim().slice(0, 120) : "Bank";

    const { accessToken, itemId } = await exchangePublicToken(settings, body.publicToken);
    const accounts = await listAccounts(settings, accessToken);

    const db = getAdminDb();
    await feedItemRef(db, ctx.businessId, itemId).set(
      {
        itemId,
        institutionName,
        accessTokenSealed: sealValue(accessToken, key),
        accounts: accounts.map((a) => ({ account_id: a.account_id, name: a.name.slice(0, 120), mask: a.mask })),
        connectedByName: ctx.memberName ?? "Owner",
        connectedAt: Date.now(),
        lastError: null,
      },
      { merge: true } // a reconnect keeps the Plaid cursors already stored
    );
    return Response.json({ ok: true, itemId, institutionName, accountCount: accounts.length });
  } catch (err) {
    if (err instanceof PlaidError) return Response.json({ error: err.message }, { status: err.status === null ? 503 : 502 });
    return aiErrorResponse(err, "bank-feed-exchange");
  }
}
