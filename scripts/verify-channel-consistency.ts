// The two channel reports must agree: Sales by channel (lib/salesChannels.ts) and channel economics (lib/channelEconomics.ts).
// Same sales, same window, same answer per channel. Run: /home/claude/.npm-global/bin/tsx scripts/verify-channel-consistency.ts
import fs from "node:fs";
import { computeChannelEconomics } from "../lib/channelEconomics";
import { summarizeSalesByChannel, NOT_RECORDED } from "../lib/salesChannels";
import type { Customer, Expense, Lead } from "../lib/types";
import type { SaleEconomics } from "../lib/calculations";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const cust = (o: Partial<Customer>): Customer => ({ id: Math.random().toString(36).slice(2), name: "C", createdAt: at(2026, 9, 1), ...o } as Customer);
const econ = (saleId: string, revenue: number, contributionMargin: number): SaleEconomics => ({ saleId, revenue, contributionMargin, grossProfit: contributionMargin } as unknown as SaleEconomics);

const customers = [
  cust({ name: "Ada", leadSource: "Referral" }),
  cust({ name: "Ben", leadSource: "  referral " }),
];
const sales: { id: string; customer: string; date: string; qty: number; saleChannel?: string }[] = [
  { id: "s1", customer: "Ada", date: "2026-10-04", qty: 1 }, // no own channel: Ada's source, Referral
  { id: "s2", customer: "Zed", date: "2026-10-05", qty: 1, saleChannel: "Online" }, // own channel, no customer record
  { id: "s3", customer: "Ben", date: "2026-10-06", qty: 1, saleChannel: "Walk-in" }, // own channel beats the customer's
  { id: "s4", customer: "Ben", date: "2026-10-07", qty: 1 }, // Ben's source again
  { id: "s5", customer: "Nobody", date: "2026-10-08", qty: 1 }, // neither: Not recorded in Sales by channel, nowhere in economics
];
const economics = [econ("s1", 1000, 400), econ("s2", 2000, 800), econ("s3", 300, 100), econ("s4", 500, 200), econ("s5", 50, 20)];
const expenses: Expense[] = [];
const leads: Lead[] = [];

const byChannel = summarizeSalesByChannel(sales, economics, "2026-08-01", "2026-10-31", new Map(customers.map((c) => [c.name.trim().toLowerCase(), c.leadSource!.trim().toLowerCase()])));
const econReport = computeChannelEconomics({ expenses, leads, customers, sales, saleEconomics: economics, asOfISO: "2026-10-24" });

const salesRev = (label: string) => byChannel.rows.find((r) => r.channel.trim().toLowerCase() === label.toLowerCase())?.revenue ?? 0;
const econRev = (label: string) => econReport.rows.find((r) => r.channel.trim().toLowerCase() === label.toLowerCase())?.revenue ?? 0;

// Each channel gets the same revenue in both reports.
for (const label of ["Referral", "Online", "Walk-in"]) {
  ok(salesRev(label) === econRev(label), `${label}: Sales by channel and channel economics agree on revenue (${salesRev(label)} vs ${econRev(label)})`);
}
ok(salesRev("Referral") === 1500, "Referral is Ada's 1,000 and Ben's 500 (Walk-in sale excluded)");
ok(salesRev("Online") === 2000 && salesRev("Walk-in") === 300, "Online and Walk-in take their own sales");
ok(byChannel.rows.find((r) => r.channel === NOT_RECORDED)?.revenue === 50, "a sale with neither a channel nor a known customer stays Not recorded");
ok(!econReport.rows.some((r) => r.channel.trim().toLowerCase() === NOT_RECORDED.toLowerCase()), "channel economics does not invent a channel for it");

// The sum of channel revenue equals the total in both reports (only the unknown sale differs, by design).
const totalSales = byChannel.totalRevenue;
const totalEcon = econReport.rows.reduce((t, r) => t + r.revenue, 0);
ok(totalSales === totalEcon + 50, "the two totals differ only by the sale with no channel anywhere");

// Wiring: the card passes the customer map, so the page uses the same rule.
const card = fs.readFileSync("components/SalesByChannelCard.tsx", "utf8");
ok(card.includes("customerChannel") && card.includes("summarizeSalesByChannel(sales, saleEconomics, w.from, w.to, customerChannel)"), "the Sales by channel card uses the customer fallback");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
