// Connections and ad spend import (lib/connections.ts, lib/adSpend.ts): switch-on status without leaking keys, the Meta Ads
// request shape and reply parsing, whole-word promo matching, and the month date ranges. Hand-worked values throughout.
// Run: npx tsx scripts/verify-connections.ts
import fs from "node:fs";
import { connectionStatuses, isConfigured } from "../lib/connections";
import {
  codeForCampaign,
  graphVersion,
  insightsUrl,
  isSafeNextPage,
  matchSpendToCodes,
  monthRange,
  parseInsights,
} from "../lib/adSpend";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

// --- status: names only, never values
const SECRET = "sk-live-SECRET-123";
const none = connectionStatuses({});
const adNone = none.find((s) => s.id === "ad-spend")!;
ok(!adNone.configured, "ad spend is off with no keys");
ok(adNone.missing.join(",") === "META_ADS_ACCESS_TOKEN,META_AD_ACCOUNT_ID", "ad spend lists both missing names");
ok(none.find((s) => s.id === "market-data")!.configured, "live FX rates need no key, so they are always on");
ok(!isConfigured("email", {}), "email is off with no keys");
ok(!isConfigured("email", { RESEND_API_KEY: "x" }), "email needs the sender address too");
ok(isConfigured("email", { RESEND_API_KEY: "x", TRIAL_NOTIFICATION_FROM_EMAIL: "a@b.c" }), "email is on with both set");
ok(!isConfigured("ai-assistant", { DEEPSEEK_API_KEY: "   " }), "a blank key counts as missing");
const withKey = connectionStatuses({ DEEPSEEK_API_KEY: SECRET, META_ADS_ACCESS_TOKEN: SECRET, META_AD_ACCOUNT_ID: "123" });
ok(!JSON.stringify(withKey).includes(SECRET), "status output never contains a key value");
ok(withKey.find((s) => s.id === "ad-spend")!.configured, "ad spend is on with token and account");

// --- Graph request
const url = insightsUrl("123", "2026-10-01", "2026-10-31", "v21.0")!;
ok(url.startsWith("https://graph.facebook.com/v21.0/act_123/insights?"), "insights url uses the Graph host, version and account");
ok(!url.includes("SECRET") && !url.toLowerCase().includes("access_token"), "the token is never put in the url");
ok(url.includes("fields=campaign_name%2Cspend"), "asks only for campaign name and spend");
ok(decodeURIComponent(url).includes('time_range={"since":"2026-10-01","until":"2026-10-31"}'), "date range is sent as since/until");
ok(insightsUrl("act_123", "2026-10-01", "2026-10-31", "v21.0") !== null, "accepts the act_ prefix and strips it");
ok(insightsUrl("12a", "2026-10-01", "2026-10-31", "v21.0") === null, "rejects an account id that is not digits");
ok(insightsUrl("123", "2026-10-31", "2026-10-01", "v21.0") === null, "rejects a range that ends before it starts");
ok(insightsUrl("123", "10/01/2026", "2026-10-31", "v21.0") === null, "rejects a date that is not ISO");
ok(graphVersion("v22.0") === "v22.0", "keeps a valid Graph version");
ok(graphVersion("latest; drop") === "v21.0", "falls back to the pinned version when the setting is odd");
ok(isSafeNextPage("https://graph.facebook.com/v21.0/next"), "follows a next page on the Graph host");
ok(!isSafeNextPage("https://evil.example.com/next"), "never follows a next link to another site (token safety)");

// --- reply parsing
const page = parseInsights({
  data: [
    { campaign_name: "SAVE10 reel", spend: "120.50" },
    { campaign_name: "", spend: "9" },
    { campaign_name: "Bad", spend: "abc" },
    { campaign_name: "Neg", spend: "-4" },
    { campaign_name: "Walk-in", spend: 80 },
  ],
  paging: { next: "https://graph.facebook.com/v21.0/act_123/insights?after=abc" },
});
ok(page !== null && page.rows.length === 2, "keeps only rows with a name and a non-negative spend");
ok(page!.rows[0].spend === 120.5 && page!.rows[1].spend === 80, "reads spend as a number whether the reply sends text or a number");
ok(page!.next !== null, "reports a next page when one is offered");
ok(parseInsights({ data: "nope" }) === null, "a reply with no data list is rejected, not guessed");
ok(parseInsights(null) === null, "an empty reply is rejected");
ok(parseInsights({ data: [] })!.next === null, "no paging means no next page");

// --- whole-word promo matching
ok(codeForCampaign("SUMMER10 - Instagram", ["SUMMER10"]) === "SUMMER10", "matches a code at the start of a campaign name");
ok(codeForCampaign("spring summer10 reel", ["SUMMER10"]) === "SUMMER10", "matches case-insensitively, inside the name");
ok(codeForCampaign("SUMMER100", ["SUMMER10"]) === null, "does not match a code that is only part of a longer word");
ok(codeForCampaign("xSUMMER10", ["SUMMER10"]) === null, "does not match a code glued to another word");
ok(codeForCampaign("summer10_reel", ["SUMMER10"]) === null, "an underscore joins words, so no match");
ok(codeForCampaign("SUMMER1 and SUMMER10 mix", ["SUMMER1", "SUMMER10"]) === "SUMMER10", "longest code wins when a name holds two");
ok(codeForCampaign("Brand awareness", ["SUMMER10"]) === null, "a campaign with no code is unmatched");

// --- matching totals
const m = matchSpendToCodes(
  [
    { name: "SAVE10 reel", spend: 120.5 },
    { name: "SAVE10 story", spend: 79.5 },
    { name: "WELCOME ads", spend: 300 },
    { name: "Brand awareness", spend: 500 },
    { name: "Retargeting", spend: 0 },
    { name: "Old boost", spend: 40 },
  ],
  ["SAVE10", "WELCOME"]
);
ok(m.spend.SAVE10 === 200, "sums the campaigns that carry the same code");
ok(m.spend.WELCOME === 300, "keeps another code's spend separate");
ok(m.matchedCampaigns === 3, "counts the matched campaigns");
ok(m.unmatched.length === 2 && m.unmatched[0].name === "Brand awareness" && m.unmatched[1].name === "Old boost", "unmatched lists spend with no code, biggest first, and skips zero spend");
ok(m.totalSpend === 1040, "total spend covers every campaign read");
ok(!("Retargeting" in m.spend) && Object.keys(m.spend).length === 2, "codes with no campaigns are not invented");

// --- month ranges (local calendar dates)
const nov = new Date(2026, 10, 1, 9, 0);
ok(JSON.stringify(monthRange(nov, 0)) === '{"from":"2026-11-01","to":"2026-11-01"}', "this month runs from the 1st to today");
ok(JSON.stringify(monthRange(new Date(2026, 10, 15), -1)) === '{"from":"2026-10-01","to":"2026-10-31"}', "last month covers all of October");
ok(JSON.stringify(monthRange(new Date(2026, 0, 3), -1)) === '{"from":"2025-12-01","to":"2025-12-31"}', "last month rolls back across the new year");

// --- wiring
const route = fs.readFileSync("app/api/ads/spend/route.ts", "utf8");
ok(route.includes("requireAiContext") && route.includes("isConfigured(\"ad-spend\")"), "ad spend route checks owner/manager and the switch");
ok(route.includes("Authorization: `Bearer ${token}`") && !/access_token/.test(route), "ad spend route sends the token in a header only");
ok(route.includes("cache: \"no-store\""), "ad spend route never caches the reply");
const settings = fs.readFileSync("app/settings/page.tsx", "utf8");
ok(settings.includes("<AdSpendImport") && settings.includes("<ConnectionsCard />"), "settings shows the import and the connections card");
const importer = fs.readFileSync("components/AdSpendImport.tsx", "utf8");
ok(!/setDoc|addDoc|updateDoc|updateSettings/.test(importer), "the import never saves anything itself");
const connRoute = fs.readFileSync("app/api/connections/route.ts", "utf8");
ok(!/process\.env\.[A-Z_]+\s*[,)}]/.test(connRoute) || connRoute.includes("connectionStatuses(process.env)"), "connections route reads env only through the status helper");

console.log(`verify-connections: ${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
