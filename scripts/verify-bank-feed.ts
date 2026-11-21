// Automatic bank feed (Plaid, pass v319): the settings and the "not configured" state, the mapping of Plaid transactions to statement
// lines (sign, pending, currency, duplicates), the Plaid calls with a mocked fetch (keys in headers only, paging and cursors), and the
// wiring on the Integrations page. No real network call is made. Run: npx tsx scripts/verify-bank-feed.ts
import fs from "node:fs";
import path from "node:path";
import { feedLineId, mapFeedTransactions, plaidSettings, plaidBaseUrl, earliestDate, plaidErrorMessage, type PlaidTransaction } from "../lib/bankFeed";
import { PlaidError, plaidPost, syncAccountPages, exchangePublicToken, type FetchImpl, type SyncPage } from "../lib/plaidClient";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

const KEYS = { PLAID_CLIENT_ID: "client-abc", PLAID_SECRET: "secret-xyz-123", PLAID_ENV: "sandbox", PLAID_COUNTRY_CODES: "GB" };

// settings
const none = plaidSettings({});
ok(none.configured === false, "no keys: not configured");
ok(none.missing.includes("PLAID_CLIENT_ID") && none.missing.includes("PLAID_SECRET"), "no keys: the missing settings are named");
ok(plaidBaseUrl(none) === null, "no keys: there is no Plaid address to call");
const bad = plaidSettings({ ...KEYS, PLAID_ENV: "staging" });
ok(bad.configured === false && bad.missing.includes("PLAID_ENV"), "an unknown PLAID_ENV is not configured and is named");
const set = plaidSettings(KEYS);
ok(set.configured === true && set.env === "sandbox", "all keys set: configured in sandbox");
ok(plaidBaseUrl(set) === "https://sandbox.plaid.com", "sandbox uses the sandbox address");
ok(plaidBaseUrl(plaidSettings({ ...KEYS, PLAID_ENV: "production" })) === "https://production.plaid.com", "production uses the production address");
ok(plaidSettings({ ...KEYS, PLAID_ENV: undefined }).env === "sandbox", "PLAID_ENV defaults to sandbox");

// mapping
const base = { baseCurrency: "GBP", importedTransactionIds: new Set<string>(), existingLines: [] as { date: string; description: string; amount: number }[] };
const tx = (o: Partial<PlaidTransaction> & { transaction_id: string }): PlaidTransaction => ({
  account_id: "acc1", amount: 10, iso_currency_code: "GBP", date: "2026-11-10", name: "Shop", merchant_name: null, pending: false, ...o,
});
const m1 = mapFeedTransactions([
  tx({ transaction_id: "t1", amount: 25.5, merchant_name: "Tesco", name: "TESCO STORES" }),
  tx({ transaction_id: "t2", amount: -100, name: "Client payment" }),
  tx({ transaction_id: "t3", amount: 5, pending: true }),
  tx({ transaction_id: "t4", amount: 5, iso_currency_code: "USD" }),
  tx({ transaction_id: "t5", amount: 5, date: "10/11/2026" }),
  tx({ transaction_id: "t1", amount: 25.5, merchant_name: "Tesco" }),
], base);
ok(m1.fresh.length === 2, "two new lines from six transactions");
const line1 = m1.fresh.find((l) => l.feedTxnId === "t1");
ok(line1 !== undefined && line1.amount === -25.5, "Plaid's positive amount (money out) becomes a negative Balancr amount");
ok(line1 !== undefined && line1.description === "Tesco" && line1.status === "unmatched", "the merchant name is the description, and the line starts unmatched");
ok(m1.fresh.find((l) => l.feedTxnId === "t2")?.amount === 100, "Plaid's negative amount (money in) becomes a positive Balancr amount");
ok(m1.skipped.pending === 1 && m1.skipped.otherCurrency === 1 && m1.skipped.invalid === 1, "pending, other currency and bad date are each skipped and counted");
ok(m1.duplicates === 1, "the same transaction twice in one batch is counted once");
ok(feedLineId("abc/def 1") === "feed-abc_def_1", "a document id keeps only letters, digits, - and _");

const again = mapFeedTransactions([tx({ transaction_id: "t1", amount: 25.5 })], { ...base, importedTransactionIds: new Set(["t1"]) });
ok(again.fresh.length === 0 && again.duplicates === 1, "a transaction already imported (same Plaid id) is never imported again");
const onStatement = mapFeedTransactions([tx({ transaction_id: "t9", amount: 7, merchant_name: "Post Office" })], {
  ...base, existingLines: [{ date: "2026-11-10", description: "post office", amount: -7 }],
});
ok(onStatement.fresh.length === 0 && onStatement.duplicates === 1, "a line already on the statement (date, description, amount) is a duplicate");
ok(earliestDate([tx({ transaction_id: "a", date: "2026-11-09" }), tx({ transaction_id: "b", date: "2026-10-30" })]) === "2026-10-30", "the earliest date is found");

// Plaid calls with a mocked fetch
type Call = { url: string; init: RequestInit };
function mockFetch(responses: Array<{ status: number; body: unknown } | "network">): { fetch: FetchImpl; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (next === undefined || next === "network") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });
  }) as unknown as FetchImpl;
  return { fetch: fetchImpl, calls };
}

async function run() {
  // not configured: no call at all
  const nc = mockFetch([]);
  let threw: unknown = null;
  try { await plaidPost(none, "/link/token/create", {}, nc.fetch); } catch (e) { threw = e; }
  ok(threw instanceof PlaidError && (threw as PlaidError).code === "NOT_CONFIGURED", "not configured throws NOT_CONFIGURED, without calling Plaid");
  ok(nc.calls.length === 0, "not configured: fetch is never called");

  // configured: keys go in headers, never in the URL or body
  const okCall = mockFetch([{ status: 200, body: { link_token: "link-sandbox-1" } }]);
  const { createLinkToken } = await import("../lib/plaidClient");
  const token = await createLinkToken(set, "user-1", okCall.fetch);
  ok(token === "link-sandbox-1", "the link token is returned");
  const c0 = okCall.calls[0];
  const headers = c0.init.headers as Record<string, string>;
  ok(c0.url === "https://sandbox.plaid.com/link/token/create", "the call goes to the sandbox address for the path");
  ok(headers["PLAID-CLIENT-ID"] === KEYS.PLAID_CLIENT_ID && headers["PLAID-SECRET"] === KEYS.PLAID_SECRET, "keys are sent in headers");
  ok(!c0.url.includes(KEYS.PLAID_SECRET) && !String(c0.init.body ?? "").includes(KEYS.PLAID_SECRET), "the secret is not in the URL or the body");

  // a Plaid error: a plain message, no key
  const errCall = mockFetch([{ status: 400, body: { error_code: "ITEM_LOGIN_REQUIRED" } }]);
  let errMsg = "";
  try { await plaidPost(set, "/transactions/sync", {}, errCall.fetch); } catch (e) { errMsg = (e as Error).message; }
  ok(errMsg.includes("sign in again") && !errMsg.includes(KEYS.PLAID_SECRET), "a login-required error gets a plain message with no key in it");
  ok(plaidErrorMessage("RATE_LIMIT_EXCEEDED", "x").includes("busy"), "a rate limit gets its own message");
  ok(plaidErrorMessage("UNKNOWN_CODE", "fallback text") === "fallback text", "an unknown code gets the fallback");

  // a network failure is a PlaidError, not a crash
  const net = mockFetch(["network"]);
  let netErr: unknown = null;
  try { await plaidPost(set, "/accounts/get", {}, net.fetch); } catch (e) { netErr = e; }
  ok(netErr instanceof PlaidError && (netErr as PlaidError).code === "NETWORK", "a network failure is a PlaidError with code NETWORK");

  // exchange: returns the access token to the server caller only
  const ex = mockFetch([{ status: 200, body: { access_token: "access-sandbox-9", item_id: "item-1" } }]);
  const got = await exchangePublicToken(set, "public-sandbox-1", ex.fetch);
  ok(got.itemId === "item-1" && got.accessToken === "access-sandbox-9", "the exchange returns the item and the access token for the server to seal");

  // paging: two pages; each page is handed over before the next is asked for; the cursor moves on
  const pages = mockFetch([
    { status: 200, body: { added: [{ transaction_id: "p1", account_id: "a", amount: 1, iso_currency_code: "GBP", date: "2026-11-01", pending: false }], modified: [], removed: [], next_cursor: "c1", has_more: true } },
    { status: 200, body: { added: [{ transaction_id: "p2", account_id: "a", amount: 2, iso_currency_code: "GBP", date: "2026-11-02", pending: false }], modified: [{}], removed: [], next_cursor: "c2", has_more: false } },
  ]);
  const seen: Array<{ n: number; cursorAtCall: string | null }> = [];
  const result = await syncAccountPages(set, "access-sandbox-9", "acc1", null, async (page: SyncPage) => {
    seen.push({ n: page.added.length, cursorAtCall: page.nextCursor });
  }, pages.fetch);
  ok(seen.length === 2 && seen[0].cursorAtCall === "c1" && seen[1].cursorAtCall === "c2", "each page is handed over with its own cursor, in order");
  ok(result.pages === 2 && result.cursor === "c2" && result.hasMore === false, "paging stops when Plaid says there are no more pages");
  const secondBody = JSON.parse(String(pages.calls[1].init.body));
  ok(secondBody.cursor === "c1" && secondBody.options?.account_id === "acc1", "the second request resumes from the first cursor, for that account");

  // the existing sync route and the page both exist and are wired
  const root = path.resolve(process.cwd());
  const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");
  const exchangeSrc = read("app/api/bank-feed/exchange/route.ts");
  ok(!/Response\.json\([^)]*accessToken/.test(exchangeSrc) && !/Response\.json\([^)]*accessTokenSealed/.test(exchangeSrc), "the exchange route never returns the access token");
  for (const f of ["app/api/bank-feed/route.ts", "app/api/bank-feed/link-token/route.ts", "app/api/bank-feed/exchange/route.ts", "app/api/bank-feed/sync/route.ts"]) {
    const src = read(f);
    ok(src.includes("requireFeedOwner"), `${f} is owner only`);
    ok(!/console\.(log|error|warn)\([^)]*(secret|SECRET|accessToken)/.test(src), `${f} does not log a secret`);
  }
  const integ = read("app/integrations/page.tsx");
  ok(integ.includes("BankFeedCard") && read("components/BankFeedCard.tsx").includes("/api/bank-feed"), "the Integrations page has the bank feed card, reading the server state");
  const card = read("components/BankFeedCard.tsx");
  ok(card.includes("Not configured") && card.includes("state.missing.join"), "the card says Not configured and names the missing settings");
  ok(card.includes("https://cdn.plaid.com/link/v2/stable/link-initialize.js") && !card.includes("PLAID_SECRET=") , "the card loads Plaid Link from Plaid and never holds a secret");

  console.log(`${checks - fails}/${checks} checks passed`);
  if (fails) { console.error(`${fails} failed`); process.exit(1); }
}

run();
