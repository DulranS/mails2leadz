// Autopay for recurring bills (lib/recurringAutopay.ts): which templates post by themselves, and what the posted expense looks like.
import { isAutopay, linesTotal, postedExpenseFields } from "../lib/recurringAutopay";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

ok(!isAutopay({}) && !isAutopay({ autopay: false }) && isAutopay({ autopay: true }), "a template only posts by itself when its autopay switch is on");
ok(linesTotal([{ label: "Power", amount: 10.1 }, { label: "Water", amount: 0.2 }]) === 10.3, "the posted total is the lines added up, to the cent");
ok(linesTotal([{ label: "A", amount: NaN }, { label: "B", amount: 5 }]) === 5, "a line with no amount counts as nothing");

const f = postedExpenseFields({ name: "Operations", category: "Other overhead" }, "2026-11-01", [{ label: "Power", amount: 40 }]);
ok(f.amount === 40 && f.kind === "expense" && f.isRecurring === false && f.recurrence === "none", "the posted expense is a one-off dated entry with the total");
ok(f.startDate === "2026-11-01" && f.name === "Operations" && f.category === "Other overhead", "the posted expense takes the template's name and category, dated to the period");
ok(f.breakdown.length === 1 && f.breakdown[0].label === "Power", "the posted expense keeps the line breakdown");

console.log(`verify-autopay: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
