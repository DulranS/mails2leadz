// Advisory seat check (lib/seats.ts) and the plan seat guide (lib/pricing.ts). Hand-worked.
// Run: npx tsx scripts/verify-seats.ts
import { seatCheck } from "../lib/seats";
import { TIERS } from "../lib/pricing";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

const s2 = seatCheck("Starter", 2);
ok(!!s2 && s2.used === 2 && s2.guide === 2 && s2.over === false, "Starter with 2 logins is at the guide, not over");
const s3 = seatCheck("Starter", 3);
ok(!!s3 && s3.over === true && s3.guide === 2, "Starter with 3 logins is over");
ok(seatCheck("starter", 3)?.over === true && seatCheck("  Starter ", 3)?.over === true, "plan name matches ignoring case and spaces");
ok(seatCheck("Growth", 40)?.over === false && seatCheck("Growth", 40)?.guide === null, "Growth has no stated number: never flagged");
ok(seatCheck("Business", 500)?.over === false, "Business has no limit: never flagged");
ok(seatCheck(null, 9)?.over === false && seatCheck("Custom deal", 9)?.over === false && seatCheck("", 9)?.over === false, "no plan or an unknown plan: never flagged, never guessed");
ok(seatCheck("Starter", null) === null && seatCheck("Starter", undefined) === null, "unknown count: no result");
ok(seatCheck("Starter", NaN) === null && seatCheck("Starter", -1) === null, "nonsense count: no result");
ok(seatCheck("Starter", 0)?.over === false, "zero logins is not over");
ok(TIERS.every((t) => t.seatGuide === null || (Number.isInteger(t.seatGuide) && t.seatGuide > 0)), "every seat guide is null or a positive whole number");
ok(TIERS.find((t) => t.id === "Starter")?.seatGuide === 2, "Starter guide matches its \"1–2 logins\" copy");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
