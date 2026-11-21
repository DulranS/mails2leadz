// Marketing by channel (lib/channelEconomics.ts): hand-worked case, then the wiring that must know about the new
// optional Expense.channel field.
// Run: npx tsx scripts/verify-channel-economics.ts
import fs from "node:fs";
import { channelKey, channelVerdict, computeChannelEconomics, windowMonthKeys } from "../lib/channelEconomics";
import type { Customer, Expense, Lead } from "../lib/types";
import type { SaleEconomics } from "../lib/calculations";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

const ASOF = "2026-10-24"; // window of 3: 2026-08, 2026-09, 2026-10
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

const exp = (o: Partial<Expense>): Expense => ({ id: Math.random().toString(36).slice(2), name: "x", amount: 0, category: "Marketing", kind: "expense", isRecurring: false, recurrence: "none", startDate: "2026-09-10", createdAt: 0, ...o });
const lead = (o: Partial<Lead>): Lead => ({ id: Math.random().toString(36).slice(2), name: "L", stage: "new", createdAt: at(2026, 9, 5), ...o } as Lead);
const cust = (o: Partial<Customer>): Customer => ({ id: Math.random().toString(36).slice(2), name: "C", createdAt: at(2026, 9, 6), ...o } as Customer);
const econ = (saleId: string, revenue: number, contributionMargin: number): SaleEconomics => ({ saleId, revenue, contributionMargin } as SaleEconomics);

// ---- the window ------------------------------------------------------------------------------------------------------
ok(windowMonthKeys("2026-10-24", 3).join() === "2026-08,2026-09,2026-10", "three months ending this month");
ok(windowMonthKeys("2026-01-15", 3).join() === "2025-11,2025-12,2026-01", "the window crosses the year end");
ok(windowMonthKeys("2026-03-01", 1).join() === "2026-03", "one month is this month");
ok(channelKey("  Social   MEDIA ") === "social media" && channelKey(undefined) === "" && channelKey("   ") === "", "channel names match ignoring case and spacing");

// ---- the worked case -------------------------------------------------------------------------------------------------
const expenses: Expense[] = [
  exp({ name: "FB boost", amount: 6000, channel: "Social media", startDate: "2026-09-10" }), // 6,000 in window
  exp({ name: "Monthly ads", amount: 1000, channel: " social  media ", isRecurring: true, recurrence: "monthly", startDate: "2026-08-15" }), // Aug, Sep, Oct = 3,000
  exp({ name: "Old SEO", amount: 2000, channel: "Search / SEO", startDate: "2026-07-30" }), // outside the window
  exp({ name: "Untagged", amount: 1500, startDate: "2026-10-02" }), // marketing with no channel
  exp({ name: "Blank tag", amount: 500, channel: "   ", startDate: "2026-10-03" }), // a blank tag is no tag
  exp({ name: "Rent", amount: 99999, category: "Rent", channel: "Social media" }), // not marketing: ignored
  exp({ name: "Retainer income", amount: 77777, kind: "revenue", channel: "Social media" }), // not an expense: ignored
  exp({ name: "Sign", amount: 4000, channel: "Print / radio / TV", startDate: "2026-10-03" }), // spend, nothing back
  exp({ name: "Mailer", amount: 3000, channel: "Email / newsletter", startDate: "2026-10-04" }),
  exp({ name: "Ended", amount: 800, channel: "Event / trade show", isRecurring: true, recurrence: "monthly", startDate: "2026-01-01", endDate: "2026-07-31" }), // stopped before the window
];
const leads: Lead[] = [
  lead({ source: "Social media", stage: "won", createdAt: at(2026, 9, 5) }),
  lead({ source: "Social Media", stage: "new", createdAt: at(2026, 10, 1) }),
  lead({ source: "social media", stage: "won", createdAt: at(2026, 7, 1) }), // before the window
  lead({ source: "Flyers/local signage", stage: "lost", createdAt: at(2026, 10, 5) }),
  lead({ stage: "new", createdAt: at(2026, 10, 5) }), // no source
];
const customers: Customer[] = [
  cust({ name: "Kamal", leadSource: "Social media", createdAt: at(2026, 9, 6) }), // new in window
  cust({ name: "Nimali", leadSource: "Social media", createdAt: at(2026, 5, 1) }), // old customer
  cust({ name: "Walk", leadSource: "Walk-in", createdAt: at(2026, 10, 10) }),
  cust({ name: "Email A", leadSource: "Email / newsletter", createdAt: at(2026, 10, 2) }),
  cust({ name: "No source", createdAt: at(2026, 10, 2) }),
];
const sales = [
  { id: "s1", customer: "Kamal", date: "2026-09-07" },
  { id: "s2", customer: "nimali ", date: "2026-10-12" }, // an old customer's sale in the window still counts for the channel
  { id: "s3", customer: "Kamal", date: "2026-07-01" }, // outside the window
  { id: "s4", customer: "Walk", date: "2026-10-11" },
  { id: "s5", customer: "Stranger", date: "2026-10-01" }, // not a known customer
  { id: "s6", date: "2026-10-01" }, // no customer at all
  { id: "s7", customer: "Email A", date: "2026-10-03" },
  { id: "s8", customer: "No source", date: "2026-10-03" },
];
const saleEconomics = [econ("s1", 30000, 12000), econ("s2", 15000, 6000), econ("s3", 99999, 99999), econ("s4", 5000, 2000), econ("s5", 1, 1), econ("s7", 2000, 800), econ("s8", 4000, 1500)];

const r = computeChannelEconomics({ expenses, leads, customers, sales, saleEconomics, asOfISO: ASOF });
const by = (name: string) => r.rows.find((x) => x.channel.toLowerCase() === name.toLowerCase());

// Social media: spend 6,000 + 3,000 = 9,000. Leads 2 (one won; the July one is outside). 1 new customer.
// Sales: Kamal 30,000 + Nimali 15,000 = 45,000; profit 12,000 + 6,000 = 18,000. Return 18,000 / 9,000 = 2.00.
const social = by("Social media")!;
ok(!!social && social.channel === "Social media", "one row for every spelling of Social media, labelled as first written");
ok(social.spend === 9000, "spend 9,000: a 6,000 one-off plus a 1,000 monthly cost active in Aug, Sep and Oct; rent and recurring revenue ignored");
ok(social.leads === 2 && social.wonLeads === 1, "2 leads in the window (July's is outside), 1 won");
ok(social.newCustomers === 1, "1 new customer (the old customer is not new)");
ok(social.revenue === 45000 && social.contribution === 18000, "sales 45,000 and profit 18,000, from both customers the channel brought, inside the window only");
ok(social.costPerLead === 4500 && social.cac === 9000 && social.returnOnSpend === 2, "cost per lead 4,500, CAC 9,000, return 2.00");
ok(channelVerdict(social) === "paying", "2.00 back per 1 spent is paying for itself");

// Print: spend only.
const print = by("Print / radio / TV")!;
ok(print.spend === 4000 && print.leads === 0 && print.newCustomers === 0 && print.costPerLead === null && print.cac === null && print.returnOnSpend === 0, "print: 4,000 spent, nothing back, no cost per lead or CAC to divide by");
ok(channelVerdict(print) === "no_customers", "spend with no leads and no customers is flagged");

// Email: spend 3,000, 1 new customer, sales 2,000, profit 800 -> return 0.27 (800 / 3,000 = 0.2667).
const email = by("Email / newsletter")!;
ok(email.spend === 3000 && email.newCustomers === 1 && email.revenue === 2000 && email.cac === 3000 && email.returnOnSpend === 0.27, "email: spend 3,000, CAC 3,000, return 0.27");
ok(channelVerdict(email) === "not_yet", "under 1.00 back is not paid back yet");

ok(channelVerdict({ ...social, returnOnSpend: 1 }) === "paying" && channelVerdict({ ...social, returnOnSpend: 0.99 }) === "not_yet", "exactly 1.00 back counts as paid back, 0.99 does not");

// No spend: shown for the leads and customers, never judged.
const walk = by("Walk-in")!;
ok(walk.spend === 0 && walk.newCustomers === 1 && walk.revenue === 5000 && walk.contribution === 2000 && walk.returnOnSpend === null && walk.cac === null, "walk-in: free channel shows its customers and sales, no return figure");
ok(channelVerdict(walk) === "free", "no spend is never judged");
const flyers = by("Flyers/local signage")!;
ok(flyers.leads === 1 && flyers.wonLeads === 0 && flyers.spend === 0, "flyers: a lead, no spend");

// Left out entirely.
ok(!by("Search / SEO"), "a channel whose only spend is before the window, with no leads or customers, is not shown");
ok(!by("Event / trade show"), "a recurring cost that ended before the window is not counted");
ok(r.rows.every((x) => x.channel !== ""), "a lead with no source never makes a blank row");
ok(!r.rows.some((x) => x.revenue === 4000 || x.contribution === 1500), "a customer with no source adds nothing to any channel");

// ---- lifetime value: every sale to every customer the channel has ever brought, any date ----------------------------
// Social media: Kamal (12,000 in the window, 99,999 in July) and Nimali (6,000). Profit 12,000 + 99,999 + 6,000 = 117,999,
// shared by 2 customers = 58,999.50 each. CAC 9,000, so 58,999.50 / 9,000 = 6.56.
ok(social.customersEver === 2 && social.ltv === 58999.5 && social.ltvToCac === 6.56, "lifetime: 2 customers ever, 58,999.50 profit each, 6.56 times the CAC; the July sale counts");
ok(email.customersEver === 1 && email.ltv === 800 && email.ltvToCac === 0.27, "email: one customer, lifetime 800, 0.27 of its CAC of 3,000");
ok(walk.customersEver === 1 && walk.ltv === 2000 && walk.ltvToCac === null, "walk-in: lifetime shown, but no ratio without a CAC");
ok(print.customersEver === 0 && print.ltv === null && print.ltvToCac === null, "print: no customers ever, so no lifetime value and no ratio");

// Referral: 1,500 spent this month, 2 new customers (CAC 750). Ada: 2,000 this month and 1,000 in March 2025, outside the window.
// Ben: no sales yet. Lifetime profit 3,000 over 2 customers = 1,500 each, which is 2.00 times the CAC.
const ref = computeChannelEconomics({
  expenses: [exp({ name: "Referral bonus", amount: 1500, channel: "Referral", startDate: "2026-10-05" })],
  leads: [],
  customers: [cust({ name: "Ada", leadSource: "Referral", createdAt: at(2026, 10, 2) }), cust({ name: "Ben", leadSource: "referral ", createdAt: at(2026, 10, 3) })],
  sales: [{ id: "r1", customer: "Ada", date: "2026-10-04" }, { id: "r2", customer: "Ada", date: "2025-03-01" }],
  saleEconomics: [econ("r1", 4000, 2000), econ("r2", 1000, 1000)],
  asOfISO: ASOF,
});
const referral = ref.rows.find((x) => x.channel === "Referral")!;
ok(referral.cac === 750 && referral.customersEver === 2 && referral.ltv === 1500 && referral.ltvToCac === 2, "referral: 1,500 each over 2 customers, twice the CAC of 750; a customer with no sales counts as 0");

// Totals and ordering.
ok(r.totalSpend === 16000, "tagged spend 9,000 + 4,000 + 3,000");
ok(r.unattributedSpend === 2000, "marketing spend with no channel (1,500 untagged + 500 blank tag) is reported, not guessed into a channel");
ok(r.rows.map((x) => x.channel).join("|") === "Social media|Print / radio / TV|Email / newsletter|Walk-in|Flyers/local signage", "ordered by spend, then sales, then leads");

// ---- window edges and clamping -----------------------------------------------------------------------------------------
const edge = computeChannelEconomics({
  expenses: [], customers: [], sales: [], saleEconomics: [], asOfISO: ASOF,
  leads: [
    lead({ source: "A", createdAt: new Date(2026, 7, 1, 0, 0, 0).getTime() }), // first moment of August: in
    lead({ source: "A", createdAt: new Date(2026, 6, 31, 23, 59, 59).getTime() }), // last moment of July: out
    lead({ source: "A", createdAt: new Date(2026, 9, 31, 23, 59, 59).getTime() }), // last moment of October: in
    lead({ source: "A", createdAt: new Date(2026, 10, 1, 0, 0, 0).getTime() }), // first moment of November: out
  ],
});
ok(edge.rows[0].leads === 2, "the window runs from the first moment of its first month to the last of its last");
ok(computeChannelEconomics({ expenses: [], leads: [], customers: [], sales: [], saleEconomics: [], asOfISO: ASOF, windowMonths: 0 }).windowMonths === 1, "a window below 1 month is 1");
ok(computeChannelEconomics({ expenses: [], leads: [], customers: [], sales: [], saleEconomics: [], asOfISO: ASOF, windowMonths: 100 }).windowMonths === 24, "a window above 24 months is 24");
ok(computeChannelEconomics({ expenses: [], leads: [], customers: [], sales: [], saleEconomics: [], asOfISO: ASOF }).rows.length === 0, "nothing in, nothing out");

// ---- the numbers do not move any other figure ---------------------------------------------------------------------------
const before = JSON.stringify(expenses);
computeChannelEconomics({ expenses, leads, customers, sales, saleEconomics, asOfISO: ASOF });
ok(JSON.stringify(expenses) === before, "the inputs are not modified");

// ---- wiring --------------------------------------------------------------------------------------------------------------
ok(/EXPENSE_CLEARABLE_FIELDS = \[[^\]]*"channel"/.test(fs.readFileSync("lib/firestorePatch.ts", "utf8")), "removing a channel tag really removes it (listed as a clearable field)");
const form = fs.readFileSync("app/expenses/page.tsx", "utf8");
ok(/channel: kind === "expense" && category === "Marketing" \? channel\.trim\(\) \|\| undefined : undefined/.test(form), "the form sends a channel only for a marketing expense, never an empty one");
ok(form.includes('list="marketing-channels"') && form.includes("CUSTOMER_LEAD_SOURCES"), "the form suggests the same names leads and customers use");
ok(/channel\?: string;/.test(fs.readFileSync("lib/types.ts", "utf8")), "Expense.channel is optional");
const leadsPage = fs.readFileSync("app/leads/page.tsx", "utf8");
ok(/can\(role, "view:reports"\) && <ChannelEconomicsCard \/>/.test(leadsPage), "the card is on the Leads page for roles that can see reports only");
ok(!/match \/expenses\/\{docId\}[\s\S]{0,400}hasOnly/.test(fs.readFileSync("firestore.rules", "utf8")), "the expenses rule does not whitelist fields, so no rules change is needed");

const cardSrc = fs.readFileSync("components/ChannelEconomicsCard.tsx", "utf8");
ok(cardSrc.includes("Lifetime profit per customer") && /r\.ltvToCac/.test(cardSrc), "the card shows lifetime profit per customer and its ratio");
ok(fs.readFileSync("USER-MANUAL.md", "utf8").includes("lifetime profit ÷ cost per customer"), "the manual explains the lifetime ratio");

// ---- a sale belongs to the channel it was made by ---------------------------------------------------------------------
// A booking or won-lead sale carries its own channel and may have no customer record. It must count under that channel.
const own = computeChannelEconomics({
  expenses: [exp({ name: "Ad", amount: 900, channel: "Online", startDate: "2026-10-05" })],
  leads: [],
  customers: [cust({ name: "Ada", leadSource: "Referral", createdAt: at(2026, 10, 2) })],
  sales: [
    { id: "b1", customer: "Zed", date: "2026-10-10", saleChannel: "Online" }, // booking sale, no customer record
    { id: "b2", customer: "Zed", date: "2026-10-11" }, // no channel and no customer record: belongs to nothing
    { id: "b3", customer: "Ada", date: "2026-10-12", saleChannel: "Online" }, // its own channel beats the customer's
  ],
  saleEconomics: [econ("b1", 2000, 800), econ("b2", 500, 200), econ("b3", 300, 100)],
  asOfISO: ASOF,
});
const onlineRow = own.rows.find((x) => x.channel === "Online")!;
const referralRow = own.rows.find((x) => x.channel === "Referral")!;
ok(onlineRow.revenue === 2300 && onlineRow.contribution === 900, "booking and walk-in sales with a channel count under it (2,300 revenue, 900 contribution)");
ok(referralRow.revenue === 0, "a sale that names its own channel does not also count under the customer's channel");
ok(onlineRow.returnOnSpend === 1, "return on spend uses the channel's own sales (900 contribution on 900 spend)");

// A sale with no channel and no customer record still counts for nothing (as before).
ok(own.rows.reduce((t, x) => t + x.revenue, 0) === 2300, "a sale with no channel and no customer record belongs to no channel");

console.log(fails === 0 ? `OK: ${checks} checks passed` : `${fails} of ${checks} checks FAILED`);
process.exit(fails === 0 ? 0 : 1);
