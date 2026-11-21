// Lost-lead reasons (lib/leadLosses.ts) and their wiring on the Leads page. Run: /home/claude/.npm-global/bin/tsx scripts/verify-lost-reasons.ts
import fs from "node:fs";
import { lostReasonCounts, NO_REASON } from "../lib/leadLosses";
import type { Lead } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const lead = (o: Partial<Lead>): Lead => ({ id: Math.random().toString(36).slice(2), name: "L", stage: "lost", createdAt: 0, ...o } as Lead);

const r = lostReasonCounts([
  lead({ lostReason: "Price" }),
  lead({ lostReason: " price " }),
  lead({ lostReason: "Chose a competitor" }),
  lead({ lostReason: "" }),
  lead({ lostReason: undefined }),
  lead({ stage: "won", lostReason: "Price" }), // not lost: ignored
  lead({ stage: "contacted", lostReason: "Price" }), // not lost: ignored
]);
ok(r.find((x) => x.reason === "Price")?.count === 2, "price counted once across case and spacing, shown as first typed");
ok(r.find((x) => x.reason === "Chose a competitor")?.count === 1, "a single reason counted once");
ok(r.find((x) => x.reason === NO_REASON)?.count === 2, "lost leads without a reason are counted as No reason given");
ok(r.reduce((t, x) => t + x.count, 0) === 5, "only lost leads are counted");
ok(r[0].count >= r[1].count && r[1].count >= r[2].count, "most common first");
ok(lostReasonCounts([]).length === 0, "no lost leads gives nothing");
const page = fs.readFileSync("app/leads/page.tsx", "utf8");
ok(page.includes("lostReasonCounts(leads)") && page.includes("Why: "), "the Leads page shows the reasons in the Lost section");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
