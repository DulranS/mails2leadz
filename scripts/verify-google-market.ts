// Google Ads spend import and market price refresh (lib/googleAds.ts, lib/marketPrices.ts): query building, micros to money,
// per-day rows added up by campaign, token and error reading, symbol rules, quote reading (including the provider's rate-limit
// note), and the wiring of the routes and the buttons. Hand-worked values throughout.
// Run: npx tsx scripts/verify-google-market.ts
import fs from "node:fs";
import { isConfigured, connectionStatuses } from "../lib/connections";
import { matchSpendToCodes } from "../lib/adSpend";
import {
  campaignCostQuery,
  googleAdsError,
  googleAdsVersion,
  normalizeCustomerId,
  parseAccessToken,
  parseCampaignCosts,
  searchStreamUrl,
} from "../lib/googleAds";
import { normalizeSymbol, parseQuote, quoteUrl, MAX_SYMBOLS_PER_REFRESH } from "../lib/marketPrices";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

// --- Google Ads: ids, versions, query
ok(normalizeCustomerId("123-456-7890") === "1234567890", "customer id: dashes are removed");
ok(normalizeCustomerId("12345") === null, "customer id: short ids are rejected");
ok(normalizeCustomerId(undefined) === null, "customer id: missing is rejected");
ok(googleAdsVersion("v21") === "v21" && googleAdsVersion("v21; x") === "v20", "version: valid kept, odd value falls back");
ok(searchStreamUrl("1234567890", "v20") === "https://googleads.googleapis.com/v20/customers/1234567890/googleAds:searchStream", "search stream url is built from the id and version");
const q = campaignCostQuery("2026-10-01", "2026-10-31")!;
ok(q === "SELECT campaign.name, metrics.cost_micros FROM campaign WHERE segments.date BETWEEN '2026-10-01' AND '2026-10-31'", "query asks for campaign name and cost by date range");
ok(campaignCostQuery("2026-10-31", "2026-10-01") === null, "query rejects a backwards range");
ok(campaignCostQuery("2026-10-01'; DROP", "2026-10-31") === null, "query rejects anything that is not a plain date");

// --- Google Ads: reply reading
const costs = parseCampaignCosts([
  { results: [
    { campaign: { name: "SAVE10 search" }, metrics: { costMicros: "1250000" } },
    { campaign: { name: "SAVE10 search" }, metrics: { costMicros: "750000" } },
    { campaign: { name: "WELCOME display" }, metrics: { costMicros: 3000000 } },
    { campaign: { name: "" }, metrics: { costMicros: "5000000" } },
    { campaign: { name: "Broken" }, metrics: { costMicros: "x" } },
  ] },
  { results: [{ campaign: { name: "SAVE10 search" }, metrics: { costMicros: "2000000" } }] },
]);
ok(costs !== null, "a well-formed reply is read");
const byName = Object.fromEntries((costs ?? []).map((r) => [r.name, r.spend]));
ok(byName["SAVE10 search"] === 4, "micros are added across days and turned into money (1.25 + 0.75 + 2.00 = 4)");
ok(byName["WELCOME display"] === 3, "a number in micros reads the same as text");
ok(!("Broken" in byName) && Object.keys(byName).length === 2, "unnamed and non-numeric rows are skipped");
ok(parseCampaignCosts({ results: [] }) === null, "a reply that is not a list is rejected, not guessed");
ok(googleAdsError([{ error: { message: "Developer token is not approved." } }]) === "Developer token is not approved.", "reads the error message from a failed reply");
ok(googleAdsError([{ results: [] }]) === null, "no error message when the reply is fine");
const totals = matchSpendToCodes(costs!, ["SAVE10", "WELCOME"]);
ok(totals.spend.SAVE10 === 4 && totals.spend.WELCOME === 3, "Google campaigns match promo codes like Meta ones do");
ok(parseAccessToken({ access_token: "ya29.abc", expires_in: 3599 }) === "ya29.abc", "reads the short-lived access token");
ok(parseAccessToken({ error: "invalid_grant" }) === null, "no access token means no import");

// --- market prices: symbols and URL
ok(normalizeSymbol(" ibm ") === "IBM", "symbols are trimmed and upper-cased");
ok(normalizeSymbol("BRK.B") === "BRK.B", "dotted symbols are kept");
ok(normalizeSymbol("IBM; drop") === null && normalizeSymbol("") === null && normalizeSymbol(5) === null, "odd symbols are refused");
ok(MAX_SYMBOLS_PER_REFRESH === 5, "a refresh asks for at most five symbols");
const u = quoteUrl("IBM", "KEY123");
ok(u.startsWith("https://www.alphavantage.co/query?") && u.includes("function=GLOBAL_QUOTE") && u.includes("symbol=IBM"), "quote url asks the global quote for the symbol");

// --- market prices: reply reading
const quote = parseQuote({ "Global Quote": { "01. symbol": "IBM", "05. price": "140.5012", "07. latest trading day": "2026-10-30" } });
ok(quote.kind === "quote" && quote.price === 140.5012 && quote.date === "2026-10-30", "a full quote gives price (4 places) and its trading day");
ok(parseQuote({ Note: "Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day." }).kind === "limited", "a rate-limit note is reported as limited, never a price");
ok(parseQuote({ Information: "Premium endpoint" }).kind === "limited", "an information note is also reported as limited");
ok(parseQuote({ "Global Quote": {} }).kind === "none", "an empty quote is no price");
ok(parseQuote({ "Global Quote": { "05. price": "0", "07. latest trading day": "2026-10-30" } }).kind === "none", "a zero price is refused");
ok(parseQuote({ "Global Quote": { "05. price": "10", "07. latest trading day": "30/10/2026" } }).kind === "none", "a price without an ISO date is refused");
ok(parseQuote(null).kind === "none", "an empty reply is no price");

// --- wiring
ok(isConfigured("google-ads", {}) === false, "google ads is off with no keys");
ok(isConfigured("google-ads", { GOOGLE_ADS_DEVELOPER_TOKEN: "a", GOOGLE_ADS_CLIENT_ID: "b", GOOGLE_ADS_CLIENT_SECRET: "c", GOOGLE_ADS_REFRESH_TOKEN: "d", GOOGLE_ADS_CUSTOMER_ID: "e" }), "google ads is on with the five required keys");
ok(!isConfigured("market-prices", {}) && isConfigured("market-prices", { MARKET_DATA_API_KEY: "k" }), "market prices needs its key");
const withKeys = JSON.stringify(connectionStatuses({ MARKET_DATA_API_KEY: "SECRETVALUE" }));
ok(!withKeys.includes("SECRETVALUE"), "status never shows the key value");

const gRoute = fs.readFileSync("app/api/ads/google-spend/route.ts", "utf8");
ok(gRoute.includes("requireAiContext") && gRoute.includes('isConfigured("google-ads")'), "google route checks owner/manager and the switch");
ok(gRoute.includes("scrub(msg, secrets)") && gRoute.includes('"developer-token": devToken'), "google route cleans errors and sends the developer token in a header");
const mRoute = fs.readFileSync("app/api/market/quotes/route.ts", "utf8");
ok(mRoute.includes("requireAiContext") && mRoute.includes('isConfigured("market-prices")'), "market route checks owner/manager and the switch");
ok(mRoute.includes("break; // the rest would be refused too"), "market route stops at the provider's limit");
ok(mRoute.includes("cache: \"no-store\""), "market route never caches a reply");
const refresh = fs.readFileSync("components/MarketPriceRefresh.tsx", "utf8");
ok(refresh.includes("updateSecurity(s.id") && !/addDoc|setDoc|addInvestmentTxn/.test(refresh), "the refresh only sets a price, never a trade");
ok(refresh.includes("setBusy(true)") && !refresh.includes("useEffect"), "the refresh runs only on a button press");
const inv = fs.readFileSync("app/investments/page.tsx", "utf8");
ok(inv.includes("<MarketPriceRefresh") && inv.includes('placeholder="e.g. IBM. Lets Refresh prices fetch it"'), "investments shows the refresh button and the symbol hint");
const settings = fs.readFileSync("app/settings/page.tsx", "utf8");
ok(settings.includes('endpoint="/api/ads/google-spend"') && settings.includes('sourceName="Google Ads"'), "settings offers the Google Ads import");

console.log(`verify-google-market: ${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
