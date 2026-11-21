// Deal finder (lib/dealFinder.ts, components/DealFinder.tsx): pasted lists (with and without a header, tab or comma), win rate by
// source with the fallback for thin history, the readiness score and its reasons, the ranking of open leads, and the paste path
// through the lead import checks; plus the wiring on the Leads page. Hand-worked values, today = 2026-10-30.
// Run: npx tsx scripts/verify-deal-finder.ts
import fs from "node:fs";
import { FALLBACK_WIN_RATE, parsePastedList, rankOpenLeads, scoreLead, sourceWinRates } from "../lib/dealFinder";
import { leadsFromRows } from "../lib/leadImport";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}
const TODAY = "2026-10-30";

// Parsing
const plain = parsePastedList("Acme Ltd, 0771234567, Referral, 5000\nBo Shop,,Cold call,");
ok(plain.length === 2 && plain[0].name === "Acme Ltd" && plain[0].contact === "0771234567", "a comma list without a header reads name then contact");
ok(plain[0].source === "Referral" && plain[0].estValue === "5000", "the source and value columns are read by position");
ok(plain[1].contact === "" && plain[1].estValue === "", "missing columns are blank, not missing");
const tabbed = parsePastedList("Name\tPhone\tSource\nAcme\t0771\tReferral\nBo\t0772\tCold call");
ok(tabbed.length === 2 && tabbed[0].Phone === "0771" && tabbed[1].Source === "Cold call", "a tab list with a header uses the header names");
ok(parsePastedList("\n  \n").length === 0, "blank text gives no rows");
ok(parsePastedList("Acme\r\nBo").length === 2, "Windows line endings are handled");

// Paste goes through the same checks as a spreadsheet import
const imported = leadsFromRows(parsePastedList("Acme Ltd, 0771234567, Referral, 5000"));
ok(imported.rows.length === 1 && imported.rows[0].estValue === 5000 && imported.errors.length === 0, "a valid pasted line becomes a lead with its value");
const bad = leadsFromRows(parsePastedList("Acme, 0771, Referral, lots"));
ok(bad.errors.length === 1 && bad.errors[0].row === 2, "a value that is not a number is reported, on the line it came from");
const dup = leadsFromRows(parsePastedList("Acme Ltd, 0771234567\nacme ltd, 0771234567"), []);
ok(dup.rows.length === 1 && dup.skippedDuplicates === 1, "the same lead pasted twice is added once");
const existing = leadsFromRows(parsePastedList("Acme Ltd, 0771234567"), [{ name: "Acme Ltd", contact: "0771234567" }]);
ok(existing.rows.length === 0 && existing.skippedDuplicates === 1, "a lead already on the list is skipped");

// Win rate by source
const history = [
  { source: "Referral", stage: "won" }, { source: "Referral", stage: "won" }, { source: "Referral", stage: "lost" },
  { source: "Cold call", stage: "lost" }, { source: "Cold call", stage: "lost" }, { source: "Cold call", stage: "lost" },
  { source: "Walk-in", stage: "won" }, { source: "Walk-in", stage: "new" },
];
const rate = sourceWinRates(history as any);
ok(Math.abs(rate("Referral").rate - 2 / 3) < 1e-9 && rate("Referral").known, "referral: 2 of 3 decided leads won, judged");
ok(rate("Cold call").rate === 0 && rate("Cold call").known, "cold call: none of 3 won, judged at zero");
ok(rate("Walk-in").known === false && rate("Walk-in").rate === FALLBACK_WIN_RATE, "a source with fewer than 3 decided leads uses the fallback and is marked unknown");
ok(rate("Referral ").rate === rate("referral").rate, "source names match regardless of case and spaces");
ok(rate(undefined).known === false, "a lead with no source uses the fallback");

// Scores (hand-worked)
const winRateOf = rate;
const hot = scoreLead({ contact: "077", source: "Referral", stage: "proposal_sent", estValue: 10000, nextFollowUpDate: "2026-10-29", createdAt: Date.parse("2026-10-25T12:00:00") } as any, { today: TODAY, winRateOf });
ok(hot.score === 95, "a lead with contact, value, a 67% source, a proposal, an overdue follow-up and recent arrival scores 95");
ok(hot.expectedValue === 6666.67, "its expected value is the value times the source win rate");
ok(hot.reasons.includes("follow-up overdue") && hot.reasons.some((r) => r.startsWith("67%")), "its reasons name the overdue follow-up and the source win rate");
const cold = scoreLead({ source: "Cold call", stage: "new", estValue: 10000 } as any, { today: TODAY, winRateOf });
ok(cold.score === 15 && cold.expectedValue === 0, "a cold-call lead with no contact scores 15 and has an expected value of zero");
ok(cold.reasons.includes("no contact yet"), "a lead with no contact says so");
const mid = scoreLead({ source: "X", stage: "follow_up", nextFollowUpDate: TODAY } as any, {
  today: TODAY,
  winRateOf: () => ({ rate: 0.2, known: true }),
});
ok(mid.score === 30, "a 20% source at follow-up stage, due today, with no contact or value scores 30");
ok(mid.reasons.includes("follow-up due today") && mid.reasons.includes("20% of X leads are won"), "its reasons name the due follow-up and the source");
const weekFollow = scoreLead({ contact: "x", stage: "new", nextFollowUpDate: "2026-11-04" } as any, { today: TODAY, winRateOf: () => ({ rate: 0.1, known: true }) });
ok(weekFollow.score === 30 && weekFollow.reasons.includes("follow-up this week"), "a follow-up within the week adds 5 and says so");
ok(scoreLead({ contact: "x", estValue: 1, source: "Referral", stage: "proposal_sent", nextFollowUpDate: "2026-10-01", createdAt: 1 } as any, { today: TODAY, winRateOf: () => ({ rate: 1, known: true }) }).score <= 100, "a score never goes above 100");

// Ranking
const leads = [
  { name: "A", source: "Referral", stage: "won" }, { name: "B", source: "Referral", stage: "won" }, { name: "C", source: "Referral", stage: "lost" },
  { name: "D", source: "Cold call", stage: "lost" }, { name: "E", source: "Cold call", stage: "lost" }, { name: "F", source: "Cold call", stage: "lost" },
  { name: "Hot", contact: "077", source: "Referral", stage: "proposal_sent", estValue: 10000, nextFollowUpDate: "2026-10-29", createdAt: Date.parse("2026-10-25T12:00:00") },
  { name: "Cold", source: "Cold call", stage: "new", estValue: 10000 },
  { name: "Small", contact: "078", source: "Referral", stage: "contacted", estValue: 1000 },
];
const ranked = rankOpenLeads(leads as any, TODAY);
ok(ranked.every((r) => !["won", "lost"].includes(r.lead.stage)), "won and lost leads are not in the work list");
ok(ranked.map((r) => r.lead.name).join() === "Hot,Small,Cold", "the work list is ordered by expected value: Hot (6667), Small (667), Cold (0)");
ok(rankOpenLeads([{ name: "Z", stage: "new" }, { name: "Y", stage: "new" }] as any, TODAY).map((r) => r.lead.name).join() === "Y,Z", "leads with equal worth are ordered by name");

// Wiring
const page = fs.readFileSync("app/leads/page.tsx", "utf8");
ok(/<DealFinder \/>/.test(page) && /import DealFinder from "@\/components\/DealFinder"/.test(page), "the Leads page shows the deal finder");
const comp = fs.readFileSync("components/DealFinder.tsx", "utf8");
ok(/rankOpenLeads\(leads, today\)/.test(comp), "the work list is the ranking from the module");
ok(/leadsFromRows\(parsePastedList\(text\)/.test(comp), "pasted lists go through the lead import checks");
ok(/bulkAddLeads\(checked\.rows\)/.test(comp) && /checked\.errors\.length > 0\) return/.test(comp), "adding is refused while any line has an error");
ok(/Nothing is added until you press Add/.test(comp), "the paste box says nothing is added until Add is pressed");
ok(!/fetch\(|http/.test(comp), "the deal finder fetches nothing from other sites");

console.log(`verify-deal-finder: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
