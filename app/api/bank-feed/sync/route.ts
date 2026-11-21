// Server-only. Reads new transactions for one connected bank and writes them as unmatched statement lines. Read-only at the bank: nothing is
// sent or paid. Each account keeps its own Plaid cursor, saved after each page is written, so a failure part-way is picked up next time
// and no line is written twice (lib/bankFeedServer.ts). Owner only, never the public demo.
import { aiErrorResponse } from "@/lib/apiError";
import { plaidSettings } from "@/lib/bankFeed";
import { baseCurrencyFor, feedItemRef, importFeedTransactions, requireFeedOwner, type StoredFeedItem } from "@/lib/bankFeedServer";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isRateLimited } from "@/lib/rateLimit";
import { PlaidError, syncAccountPages } from "@/lib/plaidClient";
import { loadSecretKey, openValue, SecretKeyMissingError } from "@/lib/secretBox";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYNCS_PER_DAY = 48;

export async function POST(req: Request) {
  try {
    const { businessId } = await requireFeedOwner(req);
    const settings = plaidSettings(process.env);
    if (!settings.configured) {
      return Response.json({ error: `The bank feed isn't set up on this server yet. The operator needs to set ${settings.missing.join(", ")}.` }, { status: 503 });
    }
    const key = loadSecretKey(process.env.BALANCR_ENC_KEY);
    if (!key) return Response.json({ error: new SecretKeyMissingError().message }, { status: 503 });

    const body = (await req.json().catch(() => ({}))) as { itemId?: unknown };
    if (typeof body.itemId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(body.itemId)) {
      return Response.json({ error: "Choose a connected bank to read." }, { status: 400 });
    }
    if (await isRateLimited("bank-feed-sync", businessId, SYNCS_PER_DAY, 24 * 60 * 60 * 1000)) {
      return Response.json({ error: "The bank has been read many times today. Try again tomorrow." }, { status: 429 });
    }

    const db = getAdminDb();
    const itemRef = feedItemRef(db, businessId, body.itemId);
    const snap = await itemRef.get();
    if (!snap.exists) return Response.json({ error: "That bank isn't connected any more." }, { status: 404 });
    const item = snap.data() as StoredFeedItem;

    const accessToken = openValue(item.accessTokenSealed, key);
    if (!accessToken) {
      return Response.json({ error: "The saved bank connection can't be read. Reconnect the bank." }, { status: 409 });
    }
    const baseCurrency = await baseCurrencyFor(db, businessId);
    if (!baseCurrency) {
      return Response.json({ error: "Set the business currency in Settings before reading a bank." }, { status: 409 });
    }

    const totals = { added: 0, duplicates: 0, skipped: { pending: 0, otherCurrency: 0, invalid: 0 }, modified: 0, removed: 0, pages: 0 };
    let hasMore = false;
    try {
      for (const account of item.accounts ?? []) {
        const start = item.cursors?.[account.account_id] ?? null;
        const result = await syncAccountPages(settings, accessToken, account.account_id, start, async (page) => {
          const written = await importFeedTransactions(db, businessId, page.added, baseCurrency);
          totals.added += written.added;
          totals.duplicates += written.duplicates;
          totals.skipped.pending += written.skipped.pending;
          totals.skipped.otherCurrency += written.skipped.otherCurrency;
          totals.skipped.invalid += written.skipped.invalid;
          totals.modified += page.modifiedCount;
          totals.removed += page.removedCount;
          totals.pages++;
          // Saved only after this page's lines are written: a crash here repeats the page, and the duplicate check stops a second copy.
          await itemRef.set({ cursors: { [account.account_id]: page.nextCursor } }, { merge: true });
        });
        if (result.hasMore) hasMore = true;
      }
    } catch (err) {
      if (err instanceof PlaidError) {
        await itemRef.set({ lastError: err.message }, { merge: true });
        return Response.json({ error: err.message }, { status: err.status === null ? 503 : 502 });
      }
      throw err;
    }

    await itemRef.set({ lastSyncAt: Date.now(), lastSyncAdded: totals.added, lastError: null }, { merge: true });
    return Response.json({ ok: true, ...totals, hasMore });
  } catch (err) {
    return aiErrorResponse(err, "bank-feed-sync");
  }
}
