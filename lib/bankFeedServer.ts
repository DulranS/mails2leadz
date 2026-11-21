// Server-only helpers for the bank feed routes (pass v319): the owner gate, the feed record, and writing new statement lines.
// Writes use a deterministic document id per Plaid transaction and create() (not set()), so a transaction written twice, by two
// syncs running at once or by a retry after a failure, is refused by the database and counted as a duplicate.
import { requireAiContext, AiAuthError, type AiRequestContext } from "./firebaseAdmin";
import { mapFeedTransactions, earliestDate, type PlaidTransaction, type FeedMapping } from "./bankFeed";
import type { PlaidAccount } from "./plaidClient";

type Db = AiRequestContext["db"];

/** The owner of a real (non-demo) business. The bank feed is owner-only, like the keys on the Integrations page. */
export async function requireFeedOwner(req: Request): Promise<AiRequestContext> {
  const ctx = await requireAiContext(req, { roles: ["owner"] });
  if (ctx.role !== "owner") throw new AiAuthError("Only the owner can change the bank feed.", 403);
  if (ctx.accountKind === "public_demo") throw new AiAuthError("The bank feed isn't available in the demo. Request a free trial to connect your own bank.", 403);
  return ctx;
}

export interface StoredFeedItem {
  itemId: string;
  institutionName: string;
  accessTokenSealed: string; // sealed with BALANCR_ENC_KEY (lib/secretBox.ts); never returned to the page
  accounts: PlaidAccount[];
  cursors?: Record<string, string>; // one Plaid cursor per account
  lastSyncAt?: number;
  lastSyncAdded?: number;
  lastError?: string | null;
}

export function feedItemRef(db: Db, businessId: string, itemId: string) {
  return db.collection("users").doc(businessId).collection("bankFeeds").doc(itemId);
}

/** The business's currency, from its settings (upper case), or "" when it has not been set. */
export async function baseCurrencyFor(db: Db, businessId: string): Promise<string> {
  const snap = await db.doc(`users/${businessId}/meta/settings`).get();
  const cur = (snap.data() as { currency?: string } | undefined)?.currency ?? "";
  return cur.trim().toUpperCase();
}

const CREATE_CHUNK = 25;

/**
 * Maps one page of Plaid transactions to statement lines and writes the new ones. Returns the counts. Existing lines are read from the
 * earliest date on the page, so the duplicate rule sees every line that could clash (lib/bankImport.ts).
 */
export async function importFeedTransactions(
  db: Db,
  businessId: string,
  transactions: PlaidTransaction[],
  baseCurrency: string
): Promise<FeedMapping & { added: number }> {
  const coll = db.collection("users").doc(businessId).collection("bankStatementLines");
  const from = earliestDate(transactions);
  const existing: Array<{ date: string; description: string; amount: number; feedTxnId?: string }> = [];
  if (from) {
    const snap = await coll.where("date", ">=", from).get();
    snap.docs.forEach((d) => existing.push(d.data() as (typeof existing)[number]));
  }
  const importedIds = new Set<string>();
  for (const e of existing) if (e.feedTxnId) importedIds.add(e.feedTxnId);

  const mapped = mapFeedTransactions(transactions, { baseCurrency, importedTransactionIds: importedIds, existingLines: existing });

  let added = 0;
  for (let i = 0; i < mapped.fresh.length; i += CREATE_CHUNK) {
    const chunk = mapped.fresh.slice(i, i + CREATE_CHUNK);
    const results = await Promise.allSettled(
      chunk.map((line) =>
        coll.doc(line.id).create({
          date: line.date,
          description: line.description,
          amount: line.amount,
          status: "unmatched",
          feedTxnId: line.feedTxnId,
          createdAt: Date.now(),
        })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        added++;
        continue;
      }
      // Already written (gRPC ALREADY_EXISTS = 6): a duplicate, not a failure.
      const code = (r.reason as { code?: unknown })?.code;
      if (code === 6 || code === "already-exists") mapped.duplicates++;
      else throw r.reason;
    }
  }
  return { ...mapped, added };
}
