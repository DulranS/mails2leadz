// Plaid calls for the bank feed (pass v319). Every call takes the fetch to use, so the verifier can mock it and no test reaches Plaid.
// The keys travel in request headers only (PLAID-CLIENT-ID, PLAID-SECRET), never in a URL, a body that is logged, or an error message.
import { plaidBaseUrl, plaidErrorMessage, type PlaidSettings, type PlaidTransaction } from "./bankFeed";

export class PlaidError extends Error {
  readonly status: number | null;
  readonly code: string | undefined;
  constructor(message: string, status: number | null, code?: string) {
    super(message);
    this.name = "PlaidError";
    this.status = status;
    this.code = code;
  }
}

export type FetchImpl = typeof fetch;

/** One POST to Plaid. Throws PlaidError with a plain message; the message never contains a key. */
export async function plaidPost<T>(settings: PlaidSettings, path: string, body: Record<string, unknown>, fetchImpl: FetchImpl = fetch): Promise<T> {
  const base = plaidBaseUrl(settings);
  if (!base) throw new PlaidError("The bank feed isn't set up on this server yet.", null, "NOT_CONFIGURED");
  let res: Response;
  try {
    res = await fetchImpl(`${base}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "PLAID-CLIENT-ID": settings.clientId,
        "PLAID-SECRET": settings.secret,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new PlaidError("Couldn't reach the bank feed service. Try again shortly.", null, "NETWORK");
  }
  const payload = (await res.json().catch(() => ({}))) as { error_code?: string };
  if (!res.ok) {
    throw new PlaidError(plaidErrorMessage(payload.error_code, `The bank feed service answered with an error (${res.status}).`), res.status, payload.error_code);
  }
  return payload as T;
}

/** A link token lets the browser open Plaid Link. It is short-lived and holds no secret the browser can reuse. */
export async function createLinkToken(settings: PlaidSettings, userId: string, fetchImpl: FetchImpl = fetch): Promise<string> {
  const out = await plaidPost<{ link_token?: string }>(
    settings,
    "/link/token/create",
    {
      client_name: "Balancr",
      language: "en",
      country_codes: settings.countryCodes,
      user: { client_user_id: userId },
      products: ["transactions"],
    },
    fetchImpl
  );
  if (!out.link_token) throw new PlaidError("The bank feed service didn't return a link. Try again.", null, "NO_LINK_TOKEN");
  return out.link_token;
}

/** Trades the one-time public token from Plaid Link for a long-lived access token (the server keeps it, sealed). */
export async function exchangePublicToken(
  settings: PlaidSettings,
  publicToken: string,
  fetchImpl: FetchImpl = fetch
): Promise<{ accessToken: string; itemId: string }> {
  const out = await plaidPost<{ access_token?: string; item_id?: string }>(
    settings,
    "/item/public_token/exchange",
    { public_token: publicToken },
    fetchImpl
  );
  if (!out.access_token || !out.item_id) throw new PlaidError("The bank feed service didn't confirm the connection. Try again.", null, "NO_ACCESS_TOKEN");
  return { accessToken: out.access_token, itemId: out.item_id };
}

export interface PlaidAccount {
  account_id: string;
  name: string;
  mask: string | null;
}

export async function listAccounts(settings: PlaidSettings, accessToken: string, fetchImpl: FetchImpl = fetch): Promise<PlaidAccount[]> {
  const out = await plaidPost<{ accounts?: PlaidAccount[] }>(settings, "/accounts/get", { access_token: accessToken }, fetchImpl);
  return (out.accounts ?? []).map((a) => ({ account_id: a.account_id, name: a.name, mask: a.mask ?? null }));
}

export interface SyncPage {
  added: PlaidTransaction[];
  modifiedCount: number;
  removedCount: number;
  nextCursor: string;
}

/**
 * Reads one account's new transactions, page by page. Plaid keeps a separate cursor for each account (options.account_id), so
 * the caller stores the cursor per account. onPage is called with each page BEFORE the next page is asked for, so the caller can
 * save the lines and the cursor together: a failure part-way leaves nothing half-recorded.
 * Modified and removed transactions are counted, not applied, so a line someone has already reviewed is never changed under them.
 */
export async function syncAccountPages(
  settings: PlaidSettings,
  accessToken: string,
  accountId: string,
  startCursor: string | null,
  onPage: (page: SyncPage) => Promise<void>,
  fetchImpl: FetchImpl = fetch,
  maxPages = 10
): Promise<{ pages: number; hasMore: boolean; cursor: string | null }> {
  let cursor = startCursor;
  let pages = 0;
  let hasMore = false;
  while (pages < maxPages) {
    const out = await plaidPost<{
      added?: PlaidTransaction[];
      modified?: unknown[];
      removed?: unknown[];
      next_cursor?: string;
      has_more?: boolean;
    }>(
      settings,
      "/transactions/sync",
      { access_token: accessToken, options: { account_id: accountId }, count: 500, ...(cursor ? { cursor } : {}) },
      fetchImpl
    );
    if (!out.next_cursor) throw new PlaidError("The bank feed service didn't return a position to resume from. Try again.", null, "NO_CURSOR");
    pages++;
    await onPage({
      added: out.added ?? [],
      modifiedCount: (out.modified ?? []).length,
      removedCount: (out.removed ?? []).length,
      nextCursor: out.next_cursor,
    });
    cursor = out.next_cursor;
    hasMore = out.has_more === true;
    if (!hasMore) break;
  }
  return { pages, hasMore, cursor };
}
