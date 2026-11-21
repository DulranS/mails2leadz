// Sales by channel (lib/salesChannels.ts): channel cleaning, hand-worked totals and window edges, and the wiring that must
// know about the optional Sale.saleChannel field (the sale forms, the delivery line, clearing it on edit, the sales CSV and
// the Sales page card).
// Run: npx tsx scripts/verify-sales-channels.ts
import fs from "node:fs";
import {
  cleanSaleChannel,
  NOT_RECORDED,
  saleChannelKey,
  salesChannelWindow,
  summarizeSalesByChannel,
  type ChannelSaleInput,
} from "../lib/salesChannels";
import type { SaleEconomics } from "../lib/calculations";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}
const read = (p: string) => fs.readFileSync(p, "utf8");

// 1. Cleaning the channel label
ok(cleanSaleChannel("  Online  ") === "Online", "surrounding spaces are trimmed");
ok(cleanSaleChannel("Phone   /  WhatsApp") === "Phone / WhatsApp", "inner spaces collapse to one");
ok(cleanSaleChannel("") === undefined, "blank is not recorded (undefined, not stored blank)");
ok(cleanSaleChannel("   ") === undefined, "spaces only is not recorded");
ok(cleanSaleChannel("not recorded") === undefined, "the untagged label cannot also be a channel name");
ok(cleanSaleChannel("Not Recorded ") === undefined, "the untagged label is refused in any case");
ok((cleanSaleChannel("x".repeat(50)) ?? "").length === 40, "a channel name is capped at 40 characters");
ok(cleanSaleChannel(42 as unknown as string) === undefined, "a non-text value is not recorded");
ok(saleChannelKey("Online ") === saleChannelKey("online"), "channels match ignoring case and spacing");

// 2. Hand-worked totals. October 2026, window 1 to 31 October, both ends included.
//    sale  date        qty  channel        revenue  gross profit  after per-sale costs
//    s2    10 Oct      10   wholesale      800      240           150
//    s3    12 Oct       1   "Wholesale "   100       40            30    (same channel, different spelling)
//    s1     5 Oct       2   Walk-in        200      120           100
//    s8    31 Oct       1   Walk-in         10        5             5    (last day, included)
//    s9     1 Oct       1   Online          40       20            10    (first day, included)
//    s4    14 Oct       3   (none)          60       30            20    -> Not recorded
//    s5    30 Sep       1   Walk-in        500      ...                 -> before the window, left out
//    s6     1 Nov       1   Walk-in        500      ...                 -> after the window, left out
//    s7    20 Oct       1   Online          —                          -> no economics record, left out
const sales: ChannelSaleInput[] = [
  { id: "s2", date: "2026-10-10", qty: 10, saleChannel: "wholesale" },
  { id: "s3", date: "2026-10-12", qty: 1, saleChannel: "Wholesale " },
  { id: "s1", date: "2026-10-05", qty: 2, saleChannel: "Walk-in" },
  { id: "s8", date: "2026-10-31", qty: 1, saleChannel: "Walk-in" },
  { id: "s9", date: "2026-10-01", qty: 1, saleChannel: "Online" },
  { id: "s4", date: "2026-10-14", qty: 3 },
  { id: "s5", date: "2026-09-30", qty: 1, saleChannel: "Walk-in" },
  { id: "s6", date: "2026-11-01", qty: 1, saleChannel: "Walk-in" },
  { id: "s7", date: "2026-10-20", qty: 1, saleChannel: "Online" },
];
const econ = (saleId: string, revenue: number, grossProfit: number, contributionMargin: number): SaleEconomics =>
  ({ saleId, revenue, grossProfit, contributionMargin } as unknown as SaleEconomics);
const economics: SaleEconomics[] = [
  econ("s2", 800, 240, 150),
  econ("s3", 100, 40, 30),
  econ("s1", 200, 120, 100),
  econ("s8", 10, 5, 5),
  econ("s9", 40, 20, 10),
  econ("s4", 60, 30, 20),
  econ("s5", 500, 250, 200),
  econ("s6", 500, 250, 200),
];
const r = summarizeSalesByChannel(sales, economics, "2026-10-01", "2026-10-31");
const names = r.rows.map((x) => x.channel);
ok(names.join("|") === ["wholesale", "Walk-in", "Online", NOT_RECORDED].join("|"), `rows: highest revenue first, Not recorded last (got ${names.join("|")})`);
const by = (name: string) => r.rows.find((x) => x.channel === name)!;
const w = by("wholesale");
ok(w.sales === 2 && w.units === 11, `wholesale: 2 sale lines and 11 units, the spelling variants merged (got ${w.sales}, ${w.units})`);
ok(w.revenue === 900 && w.grossProfit === 280 && w.contribution === 180, `wholesale money (got ${w.revenue}, ${w.grossProfit}, ${w.contribution})`);
ok(w.grossMarginPct === 31.1, `wholesale gross margin 280/900 is 31.1% (got ${w.grossMarginPct})`);
ok(w.sharePct === 74.4, `wholesale share 900/1210 is 74.4% (got ${w.sharePct})`);
const wk = by("Walk-in");
ok(wk.sales === 2 && wk.units === 3 && wk.revenue === 210, `walk-in includes both window edges (got ${wk.sales} sales, ${wk.units} units, ${wk.revenue})`);
ok(wk.grossProfit === 125 && wk.contribution === 105, `walk-in profit (got ${wk.grossProfit}, ${wk.contribution})`);
ok(wk.grossMarginPct === 59.5, `walk-in margin 125/210 is 59.5% (got ${wk.grossMarginPct})`);
const on = by("Online");
ok(on.sales === 1 && on.revenue === 40, `online counts only its sale with economics, on the first day (got ${on.sales}, ${on.revenue})`);
const nr = by(NOT_RECORDED);
ok(nr.sales === 1 && nr.revenue === 60 && nr.grossMarginPct === 50, `untagged sale is grouped as Not recorded (got ${nr.sales}, ${nr.revenue}, ${nr.grossMarginPct})`);
ok(r.totalRevenue === 1210, `total sales value 1210 (got ${r.totalRevenue})`);
ok(r.totalGrossProfit === 455 && r.totalContribution === 315, `totals of profit (got ${r.totalGrossProfit}, ${r.totalContribution})`);
ok(r.totalSales === 6, `six sale lines in the window (got ${r.totalSales})`);
ok(Math.abs(r.rows.reduce((a, x) => a + x.sharePct, 0) - 100) < 0.5, "shares add up to about 100%");

// 3. A window with no sales, and a channel with zero revenue gives no margin rather than a divide by zero
const empty = summarizeSalesByChannel(sales, economics, "2025-01-01", "2025-01-31");
ok(empty.rows.length === 0 && empty.totalRevenue === 0, "a window with no sales is empty, not an error");
const zero = summarizeSalesByChannel(
  [{ id: "z", date: "2026-10-02", qty: 1, saleChannel: "Free" }],
  [econ("z", 0, 0, 0)],
  "2026-10-01",
  "2026-10-31"
);
ok(zero.rows[0].grossMarginPct === null && zero.rows[0].sharePct === 0, "zero revenue gives a null margin and a 0% share");

// 4. Windows the page offers, with the day counts worked by hand
const today = "2026-10-28";
ok(salesChannelWindow(today, "month").from === "2026-10-01", "this month starts on the 1st");
ok(salesChannelWindow(today, "last30").from === "2026-09-29", "last 30 days is 29 Sep to 28 Oct: 30 days inclusive");
ok(salesChannelWindow(today, "last90").from === "2026-07-31", "last 90 days is 31 Jul to 28 Oct: 90 days inclusive");
ok(salesChannelWindow(today, "year").from === "2026-01-01", "this year starts 1 January");
ok(salesChannelWindow(today, "year").to === today, "every window ends today");

// 5. Wiring: the optional field reaches each place it must
const qf = read("components/QuickForms.tsx");
ok(qf.split("saleChannel: cleanSaleChannel(saleChannel)").length - 1 >= 3, "the single sale, the invoice goods lines and the invoice delivery line all save the channel");
ok(qf.split("<SoldThroughField value={saleChannel} onChange={setSaleChannel} />").length - 1 === 2, "the field is on both sale forms: the single sale and the multi-item invoice");
ok(/saleChannel: values\.saleChannel/.test(qf), "the single sale passes its channel to the delivery line");
const dl = read("lib/delivery.ts");
ok(/\.\.\.\(g\.saleChannel \? \{ saleChannel: g\.saleChannel \} : \{\}\)/.test(dl), "the delivery line carries the channel only when one is set");
const dc = read("contexts/DataContext.tsx");
ok(dc.includes('"batchPurchaseId", "serialNo", "saleChannel"'), "clearing the channel on edit removes the stored value");
const csv = read("lib/csv.ts");
ok(csv.includes("saleChannel: s.saleChannel ?? \"\""), "the sales CSV has a sold-through column");
const sp = read("app/sales/page.tsx");
ok(sp.includes('import SalesByChannelCard from "@/components/SalesByChannelCard";') && sp.includes("<SalesByChannelCard />"), "the Sales page shows the card");
const types = read("lib/types.ts");
ok(/saleChannel\?: string;/.test(types), "the Sale type has the optional field");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exitCode = 1;
