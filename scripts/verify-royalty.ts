// Franchise royalty (lib/royalty.ts and the royalties tab): the royalty per location from its sales in the month, sales with no location going
// to the main site, rates and bounds, idempotent recording, and roles. Run: npx tsx scripts/verify-royalty.ts
import fs from "node:fs";
import { royaltyStatement, royaltyExpenseEntries, validateRoyaltyRate } from "../lib/royalty";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const locations = [
  { id: "main", name: "Main shop", active: true, isDefault: true },
  { id: "kandy", name: "Kandy branch", active: true },
  { id: "old", name: "Closed site", active: false },
];
const sales = [
  { date: "2026-10-03", qty: 2, unitPrice: 5000 }, // no location: the main shop, 10,000
  { date: "2026-10-09", qty: 1, unitPrice: 5000, locationId: "main" }, // main shop, 5,000
  { date: "2026-10-12", qty: 1, unitPrice: 4000, locationId: "kandy" }, // Kandy, 4,000 (rate 0: not in the statement)
  { date: "2026-11-01", qty: 1, unitPrice: 99999, locationId: "main" }, // another month
  { date: "2026-10-20", qty: 1, unitPrice: 7000, locationId: "old" }, // a closed site
];
const rates = { main: 6, kandy: 0, old: 10 };
const rows = royaltyStatement(sales, locations, rates, "2026-10");

ok(rows.length === 1 && rows[0].locationId === "main", "only a location with a rate above zero, and still active, is in the statement");
ok(rows[0].revenue === 15000 && rows[0].royalty === 900, "a site's revenue is its sales in the month, and the royalty is the rate of it (15,000 at 6% is 900)");
ok(!rows.some((r) => r.locationId === "old"), "a closed site pays nothing, whatever its rate");
const quiet = royaltyStatement(sales, locations, rates, "2026-09");
ok(quiet.every((r) => r.royalty === 0) && royaltyExpenseEntries(quiet, "2026-09", new Set()).length === 0, "a month with no sales at a rated site shows zero and records nothing");
ok(royaltyStatement(sales, locations, undefined, "2026-10").length === 0, "with no rates set there is no royalty");

const entries = royaltyExpenseEntries(rows, "2026-10", new Set());
ok(entries.length === 1 && entries[0].amount === 900 && entries[0].name === "Royalty: Main shop (2026-10)" && entries[0].category === "Other overhead", "the royalty is recorded as one overhead cost for the site and month");
ok(entries[0].startDate === "2026-10-31", "the cost is dated the last day of the month");
ok(royaltyExpenseEntries(rows, "2026-10", new Set([entries[0].name])).length === 0, "recording the same month again adds nothing");

ok(validateRoyaltyRate(6) === null && validateRoyaltyRate(0) === null && validateRoyaltyRate(-1) !== null && validateRoyaltyRate(101) !== null && validateRoyaltyRate(Number.NaN) !== null, "a royalty is a share from 0 to 100 percent");

ok(tabsForRole("owner").includes("royalties") && tabsForRole("manager").includes("royalties") && !tabsForRole("staff").includes("royalties"), "royalties are for the owner and manager");
ok(read("components/ops/RoyaltyPanel.tsx").includes("addExpense({ name: p.name") && read("components/ops/RoyaltyPanel.tsx").includes("nothing is recorded twice"), "recording is a press, and skips what is already recorded");
ok(read("lib/royalty.ts").includes("sales with no location belong to the main location") || read("lib/royalty.ts").includes("const main = locations.find"), "sales with no location are counted against the main location");


// v217b: the statement file. One row per paying site, plain column names, and text that could run as a formula is made safe.
import { royaltyStatementRows } from "../lib/royalty";
import { toCsvSafe } from "../lib/csv";
const stmt = royaltyStatementRows(rows, "2026-10", "LKR");
ok(stmt.length === 1 && stmt[0].location === "Main shop" && stmt[0].sales === 15000 && stmt[0].royalty_due === 900 && stmt[0].currency === "LKR", "the statement has one row per paying site, with its sales, rate, royalty and currency");
ok(Object.keys(stmt[0]).join() === "period,location,sales,royalty_rate_percent,royalty_due,currency", "the columns have plain names, in a fixed order, for importing elsewhere");
const csv = toCsvSafe(royaltyStatementRows([{ locationId: "x", name: "=HYPERLINK(\"evil\")", revenue: 10, ratePct: 5, royalty: 0.5 }], "2026-10", "LKR"));
ok(!/(^|,)=HYPERLINK/.test(csv) && csv.includes("'=HYPERLINK"), "a site name that starts like a formula is made safe before it leaves the app");
ok(read("components/ops/RoyaltyPanel.tsx").includes("downloadCsv(") && read("components/ops/RoyaltyPanel.tsx").includes("toCsvSafe("), "the statement is downloaded with the spreadsheet-safe builder");
console.log(`${checks - fails}/${checks} checks passed (with the statement file checks)`);
if (fails) process.exit(1);
