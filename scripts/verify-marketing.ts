// Email campaigns (lib/marketing.ts, app/api/marketing/send, app/api/unsubscribe): who receives, the unsubscribe link, the caps.
// Run: npx tsx scripts/verify-marketing.ts
import fs from "node:fs";
import { campaignRecipients, campaignText, remainingToday, validateCampaign, firstName, MARKETING_DAILY_LIMIT, MARKETING_RUN_LIMIT } from "../lib/marketing";
import { signToken, verifyLinkToken } from "../lib/signedToken";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

// ---- validation ----
ok(validateCampaign({ subject: "Diwali sale", body: "20% off all board games this week." }) === null, "a normal campaign is accepted");
ok(validateCampaign({ subject: "Hi", body: "20% off all board games this week." }) !== null, "a too-short subject is refused");
ok(validateCampaign({ subject: "Sale\nBcc: x@y.z", body: "20% off all board games this week." }) !== null, "a subject with a line break is refused (header injection)");
ok(validateCampaign({ subject: "Diwali sale", body: "short" }) !== null, "an empty-ish message is refused");
ok(validateCampaign({ subject: "Diwali sale", body: "x".repeat(2001) }) !== null, "an over-long message is refused");
ok(validateCampaign({ subject: "S".repeat(121), body: "20% off all board games." }) !== null, "an over-long subject is refused");

// ---- who receives ----
const customers = [
  { id: "1", name: "Kasun Perera", contact: "kasun@x.lk 0771234567", marketingOptIn: true },
  { id: "2", name: "No consent", contact: "no@x.lk" },
  { id: "3", name: "Said no", contact: "said@x.lk", marketingOptIn: false },
  { id: "4", name: "Phone only", contact: "0771111111", marketingOptIn: true },
  { id: "5", name: "Kasun again", contact: "KASUN@x.lk", marketingOptIn: true },
  { id: "6", name: "Nimal", contact: "nimal@x.lk", marketingOptIn: true },
  { id: "7", name: "Blank", marketingOptIn: true },
];
const r = campaignRecipients(customers);
ok(r.map((x) => x.customerId).join() === "1,6", "only opted-in customers with an email, once per address");
ok(!r.some((x) => ["2", "3", "4", "7"].includes(x.customerId)), "no consent, said no, no email and no contact are all left out");

// ---- the email ----
const text = campaignText({ businessName: "Lanka Games", customerName: "Kasun Perera", body: "20% off this week.", unsubscribeUrl: "https://app.example/unsubscribe/TOKEN" });
ok(text.startsWith("Hi Kasun,"), "greets by first name");
ok(text.includes("20% off this week.") && text.includes("https://app.example/unsubscribe/TOKEN") && text.includes("Lanka Games"), "carries the message, the business and the unsubscribe link");
ok(campaignText({ businessName: "", customerName: "", body: "Hello there folks", unsubscribeUrl: "u" }).startsWith("Hello,"), "no name, no business still reads properly");
ok(firstName("  Kasun   Perera ") === "Kasun" && firstName("") === "", "first-name helper");

// ---- caps ----
ok(remainingToday(0) === MARKETING_DAILY_LIMIT && remainingToday(150) === MARKETING_DAILY_LIMIT - 150 && remainingToday(999) === 0 && remainingToday(-5) === MARKETING_DAILY_LIMIT, "daily allowance counts down and never goes negative");
ok(MARKETING_RUN_LIMIT <= MARKETING_DAILY_LIMIT, "one send cannot exceed the daily cap");

// ---- unsubscribe token ----
const secret = "x".repeat(40);
const tok = signToken("unsubscribe", "biz1/cust1", 86_400_000, { secret })!;
ok(verifyLinkToken(tok, "unsubscribe", { secret }) === "biz1/cust1", "the unsubscribe link verifies");
ok(verifyLinkToken(tok, "invoice", { secret }) === null && verifyLinkToken(tok, "quote", { secret }) === null, "it cannot be used as another kind of link");
ok(verifyLinkToken(signToken("invoice", "biz1/k", 86_400_000, { secret }), "unsubscribe", { secret }) === null, "an invoice link cannot unsubscribe anyone");
ok(verifyLinkToken(tok.slice(0, -2) + "xx", "unsubscribe", { secret }) === null, "a tampered link is refused");
ok(verifyLinkToken(tok, "unsubscribe", { secret, now: Date.now() + 2 * 86_400_000 }) === null, "an expired link is refused");

// ---- wiring ----
const send = read("app/api/marketing/send/route.ts");
ok(/requireSignedIn\(req\)/.test(send) && /role !== "owner" && role !== "manager"/.test(send), "sending needs a signed-in owner or manager");
ok(/campaignRecipients\(customers\)/.test(send) && /signToken\("unsubscribe"/.test(send), "recipients come from the consent rule and each gets their own unsubscribe link");
ok(/MARKETING_RUN_LIMIT/.test(send) && /remainingToday\(/.test(send), "per-send and per-day caps are enforced");
ok(/resolveAccess\(.*\)\.locked/.test(send) && /isEmailConfigured\(\)/.test(send), "locked accounts and unconfigured email send nothing");
ok(!/receivable|sales|purchases/.test(send), "a campaign touches no sale, payment or stock");
const unsub = read("app/api/unsubscribe/route.ts");
ok(/marketingOptIn: false/.test(unsub) && /export async function POST/.test(unsub) && !/export async function GET/.test(unsub), "unsubscribing is a POST that switches consent off (a mail scanner opening the link changes nothing)");
ok(/isRateLimited\(/.test(unsub) && unsub.indexOf("verifyLinkToken(") < unsub.indexOf("getAdminDb("), "rate limited, and the link is checked before any data is touched");
ok(/pathname\.startsWith\("\/unsubscribe\/"\)/.test(read("components/AppShell.tsx")), "the unsubscribe page opens without signing in");
ok(/<EmailCampaignCard \/>/.test(read("app/outreach/page.tsx")) && /role !== "owner" && role !== "manager"\) return null/.test(read("components/EmailCampaignCard.tsx")), "the campaign card shows for owner and manager only");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
