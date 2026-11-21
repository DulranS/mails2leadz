// Customer outreach (lib/outreach.ts): the lapsed, birthday, top and new segments with hand-worked dates, the consent rule for offers,
// the message filling, and the wiring of the page. Run: npx tsx scripts/verify-outreach.ts
import fs from "node:fs";
import { canSendTemplate, daysBetween, daysUntilBirthday, DEFAULT_TEMPLATES, renderMessage, segmentCustomers, type OutreachCustomer, type OutreachSale } from "../lib/outreach";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

const today = "2026-11-01";
ok(daysBetween("2026-10-01", "2026-11-01") === 31, "days between dates is counted correctly");
ok(daysUntilBirthday("03-15", today) === 134, "a birthday later this year is counted from today");
ok(daysUntilBirthday("1990-11-05", today) === 4, "a full date counts only the day and month");
ok(daysUntilBirthday("11-01", today) === 0, "a birthday today is 0 days");
ok(daysUntilBirthday("10-30", today) === 363, "a birthday that just passed is next year");
ok(daysUntilBirthday("13-40", today) === null && daysUntilBirthday(undefined, today) === null, "a bad birthday is ignored");

const customers: OutreachCustomer[] = [
  { id: "c1", name: "Ruwan Perera", contact: "0771234567", marketingOptIn: true, birthday: "11-04" },
  { id: "c2", name: "Nimali", contact: "nimali@example.com", marketingOptIn: false },
  { id: "c3", name: "Kasun", contact: "", marketingOptIn: true, lastContactedAt: "2026-10-30" },
  { id: "c4", name: "Dilani Fernando", contact: "0712345678", marketingOptIn: true, birthday: "12-20" },
];
const sales: OutreachSale[] = [
  { customer: "ruwan perera", date: "2026-08-01", qty: 2, unitPrice: 500 },
  { customer: "Nimali", date: "2026-10-25", qty: 1, unitPrice: 300 },
  { customer: "Kasun", date: "2026-10-10", qty: 1, unitPrice: 2000 },
  { customer: "Kasun", date: "2026-09-01", qty: 1, unitPrice: 100 },
  { customer: "Dilani Fernando", date: "2026-10-28", qty: 4, unitPrice: 250 },
];

const lapsed = segmentCustomers(customers, sales, today, "lapsed");
ok(lapsed.length === 1 && lapsed[0].name === "Ruwan Perera", "only Ruwan has not bought for 60 days (last bought 1 Aug)");
ok(lapsed[0].reason === "Last bought 92 days ago (1 order)", "the lapsed reason says how long ago and how many orders");
ok(lapsed[0].consented === true && lapsed[0].contact === "0771234567", "the row carries consent and the contact");

const birthdays = segmentCustomers(customers, sales, today, "birthdays");
ok(birthdays.length === 1 && birthdays[0].name === "Ruwan Perera" && birthdays[0].reason === "Birthday in 3 days", "Ruwan's birthday is in 3 days (4 Nov), and Dilani's is not in the window");

const top = segmentCustomers(customers, sales, today, "top", { topN: 2 });
ok(top[0].name === "Kasun" && top[0].revenue === 2100, "the top spender is Kasun with 2100");
ok(top[1].name === "Dilani Fernando" && top[1].revenue === 1000, "then Dilani with 1000");
ok(top.length === 2, "the top list respects the number asked for");

const fresh = segmentCustomers(customers, sales, today, "new");
ok(fresh.length === 2 && fresh.some((r) => r.name === "Nimali") && fresh.some((r) => r.name === "Dilani Fernando"), "customers whose first order is within 30 days are new (Nimali 7 days, Dilani 4 days)");
ok(!fresh.some((r) => r.name === "Kasun"), "Kasun's first order was over 30 days ago, so not new");

const kasunRecently = segmentCustomers(customers, sales, today, "top").find((r) => r.name === "Kasun")!;
ok(kasunRecently.contactedRecently === true, "someone messaged in the last 7 days is flagged so you don't repeat");

// message filling
ok(renderMessage("Hi {name}, thanks from {business}. {offer}", { name: "Ruwan Perera", business: "Balancr Cafe", offer: "" }) === "Hi Ruwan, thanks from Balancr Cafe.", "placeholders are filled, the first name is used, and an empty offer leaves no gap");
ok(renderMessage("Hi {name}!", { name: "", business: "" }) === "Hi there!", "a missing name falls back to there");
ok(!renderMessage("Hello {unknown} {name}", { name: "Ann", business: "Shop" }).includes("{"), "unknown placeholders never reach the customer");
ok(renderMessage("x".repeat(1000), { name: "A", business: "B" }).length === 600, "messages are capped in length");

// consent rule
const offer = DEFAULT_TEMPLATES.find((t) => t.key === "lapsed")!;
const thanks = DEFAULT_TEMPLATES.find((t) => t.key === "thanks")!;
ok(canSendTemplate(offer, { consented: true, contact: "0771" }).ok, "an offer goes to a customer who agreed");
ok(!canSendTemplate(offer, { consented: false, contact: "0771" }).ok, "an offer is never sent to a customer who did not agree");
ok(canSendTemplate(thanks, { consented: false, contact: "0771" }).ok, "an order message can go to anyone with a contact");
ok(!canSendTemplate(thanks, { consented: true, contact: "" }).ok, "nobody without a contact can be messaged");

// wiring
const page = fs.readFileSync("app/outreach/page.tsx", "utf8");
ok(page.includes("buildShareTargets(") && page.includes("canSendTemplate("), "the page builds links through the shared helper and checks consent");
ok(page.includes("markMessaged") && page.includes("lastContactedAt"), "the page records when a customer was messaged");
ok(!/fetch\(|sendEmail|sendSms|api\/outreach/.test(page), "the page sends nothing itself");
const nav = fs.readFileSync("components/AppShell.tsx", "utf8");
ok(nav.includes('href: "/outreach"'), "the menu links to Outreach");

// review requests and referrers
import { socialCaption } from "../lib/outreach";
const refCustomers: OutreachCustomer[] = [
  { id: "a", name: "Asha", contact: "0771" },
  { id: "b", name: "Bimal", contact: "0772", referredBy: "Asha" },
  { id: "c", name: "Chamal", contact: "0773", referredBy: "asha" },
  { id: "d", name: "Dinu", contact: "0774", referredBy: "Bimal" },
];
const refs = segmentCustomers(refCustomers, [], today, "referrers");
ok(refs.length === 2 && refs[0].name === "Asha" && refs[0].reason === "Sent 2 customers your way", "referrers: Asha sent two customers (matched ignoring case), so she is first");
ok(refs[1].name === "Bimal" && refs[1].reason === "Sent 1 customer your way", "referrers: Bimal sent one");
const reviewSales: OutreachSale[] = [
  { customer: "Bimal", date: "2026-10-30", qty: 1, unitPrice: 100 },
  { customer: "Chamal", date: "2026-10-01", qty: 1, unitPrice: 100 },
  { customer: "Dinu", date: "2026-10-31", qty: 1, unitPrice: 100 },
];
const reviews = segmentCustomers(refCustomers, reviewSales, today, "review");
ok(reviews.length === 2 && reviews[0].name === "Dinu" && reviews[0].reason === "Bought 1 day ago", "review: the most recent buyer comes first");
ok(!reviews.some((r) => r.name === "Chamal"), "review: a purchase older than 14 days is not asked about");
const asked = segmentCustomers([{ ...refCustomers[1], reviewRequestedAt: "2026-10-25" }], reviewSales, today, "review");
ok(asked.length === 0, "review: someone asked in the last 60 days is not asked again");
const reviewTpl = DEFAULT_TEMPLATES.find((x) => x.key === "review")!;
ok(!canSendTemplate(reviewTpl, { consented: false, contact: "0771" }, {}).ok, "review: needs the review link first");
ok(canSendTemplate(reviewTpl, { consented: false, contact: "0771" }, { reviewLink: "https://g.page/r/x" }).ok, "review: an order message needs no consent once the link is set");
ok(renderMessage(reviewTpl.text, { name: "Bimal", business: "Shop", review: "https://g.page/r/x" }).endsWith("https://g.page/r/x"), "review: the link is filled into the message");
ok(socialCaption({ business: "Shop", offer: "10% off", reviewLink: "https://g.page/r/x" }).includes("Tell us how we did: https://g.page/r/x"), "caption includes the review link");
ok(socialCaption({ business: "Shop" }) === "Thank you for choosing Shop.", "caption works with no offer and no link");

const pageSrc = fs.readFileSync("app/outreach/page.tsx", "utf8");
ok(pageSrc.includes("updateSettings({ reviewLink") && pageSrc.includes("referredBy"), "the page saves the review link and referred-by");
ok(pageSrc.includes("reviewRequestedAt: today"), "marking a review request sent records the date");

const queuePage = fs.readFileSync("app/outreach/page.tsx", "utf8");
ok(queuePage.includes("Messaged, next") && queuePage.includes("Work through"), "the one-at-a-time queue is on the page");
ok(!/useEffect\([^)]*\)[\s\S]{0,200}window\.open/.test(queuePage) && !/window\.open\(/.test(queuePage), "the queue never opens a message by itself");
ok(queuePage.includes("canSendTemplate(template, r, { reviewLink }).ok"), "the queue only holds messages that are allowed");

console.log(`verify-outreach: ${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
