// Bank rules (lib/bankRules.ts): an ignore rule, a match that needs exactly one fitting entry, the review for anything ambiguous or unmatched, the direction
// rule, lines already decided left alone, and the rule text checks. Worked numbers. Run: npx tsx scripts/verify-bank-rules.ts
import { applyRules, validateRule, type BankRule } from "../lib/bankRules";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

const rules: BankRule[] = [
  { id: "r1", contains: "transfer to savings", direction: "any", action: { kind: "ignore" } },
  { id: "r2", contains: "DD RENT", direction: "out", action: { kind: "match", label: "Rent" } },
  { id: "r3", contains: "POS", direction: "in", action: { kind: "match", label: "Sale" } },
];
const lines = [
  { id: "L1", date: "2026-11-01", description: "Transfer to savings", amount: -500, status: "unmatched" },
  { id: "L2", date: "2026-11-03", description: "DD RENT LANDLORD", amount: -20000, status: "unmatched" },
  { id: "L3", date: "2026-11-04", description: "POS KAMAL", amount: 1200, status: "unmatched" },
  { id: "L4", date: "2026-11-05", description: "DD RENT LANDLORD", amount: -20000, status: "matched" },   // already decided: left alone
  { id: "L5", date: "2026-11-06", description: "Electricity bill", amount: -3000, status: "unmatched" }, // no rule: left for a person
  { id: "L6", date: "2026-11-07", description: "POS SHOP", amount: -50, status: "unmatched" },           // rule is for money in: does not fit
];
const cands = [
  { id: "E1", date: "2026-11-02", label: "Rent — landlord", amount: -20000 },
  { id: "S1", date: "2026-11-04", label: "Sale to Kamal", amount: 1200 },
  { id: "S2", date: "2026-11-04", label: "Sale to Nimal", amount: 1200 },   // a second sale of the same amount: the sale is not guessed
];
const r = applyRules(lines, rules, cands);
ok(r.toIgnore.join() === "L1", "a line that matches an ignore rule is ignored, whatever the amount");
ok(r.toMatch.length === 1 && r.toMatch[0].lineId === "L2" && r.toMatch[0].note.startsWith("Rent"), "a rent payment is matched to the one rent entry that fits, within three days and the same amount");
ok(!r.toMatch.some((m) => m.lineId === "L3") && r.review.includes("L3"), "a sale that could be either of two identical sales is left for a person, not guessed");
ok(!r.toMatch.some((m) => m.lineId === "L4") && !r.review.includes("L4") && !r.toIgnore.includes("L4"), "a line already matched is not touched again");
ok(!r.toMatch.some((m) => m.lineId === "L5") && !r.review.includes("L5"), "a line with no rule is not decided here, and is not counted for review either");
ok(!r.toMatch.some((m) => m.lineId === "L6") && !r.review.includes("L6"), "a rule for money coming in does not apply to money going out");
ok(new Set([...r.toMatch.map((m) => m.lineId), ...r.review, ...r.toIgnore]).size === r.toMatch.length + r.review.length + r.toIgnore.length, "each line is decided once: matched, ignored or left for review");

ok(applyRules([{ id: "X", date: "2026-11-02", description: "DD RENT", amount: -20000, status: "unmatched" }], [rules[1]], [{ id: "E9", date: "2026-11-20", label: "Rent", amount: -20000 }]).toMatch.length === 0, "an entry dated outside the three-day window is not matched");
ok(applyRules([{ id: "X", date: "2026-11-02", description: "DD RENT", amount: -20000, status: "unmatched" }], [rules[1]], [{ id: "E9", date: "2026-11-02", label: "Rent", amount: -20050 }]).toMatch.length === 0, "an amount that differs by more than one unit is not matched");

ok(validateRule({ contains: "DD RENT", direction: "out", action: { kind: "match", label: "Rent" } }) === null, "a sensible rule is accepted");
ok(validateRule({ contains: "DD", direction: "out", action: { kind: "ignore" } }) !== null, "text to look for shorter than three letters is refused, so a rule cannot match almost everything");
ok(validateRule({ contains: "POS", direction: "in", action: { kind: "match", label: "" } }) !== null, "a match rule must name the entry it matches");
ok(validateRule({ contains: "POS", direction: "sideways" as never, action: { kind: "ignore" } }) !== null, "a rule must say whether the money is in, out or either");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
