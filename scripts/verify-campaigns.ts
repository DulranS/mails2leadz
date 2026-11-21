// Promo campaign results and spend (lib/promoCodes.ts): the figures with hand-worked values, the spend parser, and the wiring
// (the Sales page passes the sale economics and spend to the campaign card, settings save the spend).
// Run: npx tsx scripts/verify-campaigns.ts
import fs from "node:fs";
import { campaignResults, formatCampaignSpend, parseCampaignSpend } from "../lib/promoCodes";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

const sales = [
  { id: "s1", date: "2026-10-03", promoCode: "SAVE10", promoOffAmount: 25 },
  { id: "s2", date: "2026-10-10", promoCode: "SAVE10", promoOffAmount: 15 },
  { id: "s3", date: "2026-10-12", promoCode: "WELCOME", promoOffAmount: 10 },
  { id: "s4", date: "2026-09-30", promoCode: "SAVE10", promoOffAmount: 999 },
  { id: "s5", date: "2026-10-20" },
];
const economics = [
  { saleId: "s1", revenue: 225, grossProfit: 100 },
  { saleId: "s2", revenue: 135, grossProfit: 50 },
  { saleId: "s3", revenue: 90, grossProfit: 40 },
  { saleId: "s4", revenue: 1, grossProfit: 1 },
  { saleId: "s5", revenue: 500, grossProfit: 300 },
];
const spend = { SAVE10: 300, WELCOME: 50, NEVERUSED: 200 };
const r = campaignResults(sales, economics, spend, "2026-10-01", "2026-10-31");
const save = r.rows.find((x) => x.code === "SAVE10")!;
ok(save.uses === 2 && save.revenue === 360 && save.grossProfit === 150, "SAVE10 in October: two sales, revenue 360, gross profit 150");
ok(save.spend === 300 && save.profitAfterSpend === -150, "SAVE10 spent 300 against 150 gross profit, so it lost 150 after spend");
ok(save.costPerSale === 150, "SAVE10 cost 150 per sale (300 over 2 sales)");
ok(save.off === 40, "SAVE10 took 40 off in October (September is left out)");
const welcome = r.rows.find((x) => x.code === "WELCOME")!;
ok(welcome.profitAfterSpend === -10, "WELCOME: gross profit 40 less spend 50 is -10");
const unused = r.rows.find((x) => x.code === "NEVERUSED")!;
ok(!!unused && unused.uses === 0 && unused.profitAfterSpend === -200 && unused.costPerSale === null, "a campaign with spend but no sales still shows, with no cost per sale");
ok(r.rows.map((x) => x.code).join(",") === "WELCOME,SAVE10,NEVERUSED", "rows are ordered by profit after spend, best first: WELCOME -10, SAVE10 -150, NEVERUSED -200");
ok(r.revenue === 450 && r.spend === 550, "totals add up across codes: revenue 450 (360 + 90), spend 550 (300 + 50 + 200)");
ok(campaignResults(sales, economics, undefined, "2026-10-01", "2026-10-31").rows.every((x) => x.spend === 0), "no spend typed means no spend figures");

const sp = parseCampaignSpend("save10:5000, WELCOME:1200.5");
ok(!sp.error && sp.spend.SAVE10 === 5000 && sp.spend.WELCOME === 1200.5, "campaign spend is read by code, ignoring case");
ok(formatCampaignSpend(sp.spend) === "SAVE10:5000, WELCOME:1200.5", "campaign spend formats back the way it is typed");
ok(!!parseCampaignSpend("SAVE10").error && !!parseCampaignSpend("SAVE10:-5").error, "a campaign needs an amount, and it cannot be negative");
ok(!!parseCampaignSpend("A:1, a:2").error, "the same campaign listed twice is refused");

const sales2 = fs.readFileSync("app/sales/page.tsx", "utf8");
ok(/<PromoUsageCard sales=\{sales\} economics=\{saleEconomics\} spend=\{settings\.campaignSpend\}/.test(sales2), "the Sales page passes the sale economics and spend to the campaign card");
const settings = fs.readFileSync("app/settings/page.tsx", "utf8");
ok(/campaignSpend: campaign\.spend/.test(settings), "settings save the campaign spend");

console.log(`verify-campaigns: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
