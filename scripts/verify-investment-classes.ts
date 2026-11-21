// Investment asset classes (lib/investments.ts) cover the common investment map: every group has a class to record it under.
import { ASSET_CLASS_LABELS } from "../lib/investments";
import type { InvestmentAssetClass } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

const classes = Object.keys(ASSET_CLASS_LABELS) as InvestmentAssetClass[];
ok(classes.length === 10, `ten asset classes (found ${classes.length})`);
ok(classes.every((c) => (ASSET_CLASS_LABELS[c] ?? "").trim().length > 0), "every class has a label");
ok(new Set(Object.values(ASSET_CLASS_LABELS)).size === classes.length, "no two classes share a label");

// Each instrument on the investment map, and the class it is recorded under. Liquid funds sit under cash on the map, debt
// funds under funds. A class is a choice for the owner; this checks that every instrument on the map has a home.
const MAP: [string, InvestmentAssetClass][] = [
  ["Shares", "shares"], ["IPOs", "shares"],
  ["Equity mutual funds", "funds"], ["Equity ETFs", "funds"], ["Index funds", "funds"], ["Equity PMS", "funds"],
  ["Fixed deposits", "deposits"],
  ["Corporate bonds / NCDs", "bonds"], ["Government securities", "bonds"], ["Debt mutual funds", "funds"],
  ["PPF", "retirement"], ["EPF / VPF", "retirement"], ["NPS", "retirement"], ["NSC / SCSS / SSY", "retirement"],
  ["Gold & silver", "commodities"], ["Energy & metals", "commodities"], ["Soft commodities", "commodities"],
  ["Residential property", "property"], ["Commercial property", "property"], ["Land / plots", "property"], ["REITs / SM REITs", "property"],
  ["AIFs", "alternative"], ["Private equity / VC", "alternative"], ["InvITs", "alternative"], ["Structured products", "alternative"],
  ["Distressed securities", "alternative"], ["Fallen angel bonds", "alternative"],
  ["Savings account", "cash"], ["Liquid funds", "cash"], ["Money market funds", "cash"],
  ["Art and paintings", "other"], ["Collectibles", "other"], ["Crypto assets", "other"],
];
for (const [name, cls] of MAP) {
  ok(classes.includes(cls), `${name} has a class to be recorded under (${cls})`);
}
ok(MAP.length === 33, `all 33 instruments on the map are placed (checked ${MAP.length})`);
ok(new Set(MAP.map(([, c]) => c)).size === classes.length, "every class is used by at least one instrument on the map");

console.log(`verify-investment-classes: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
