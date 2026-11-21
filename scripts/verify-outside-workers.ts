// Attendance for freelancers and contractors with no login (lib/outsideWorkers.ts, the manual time form in app/time/page.tsx).
// Run: npx tsx scripts/verify-outside-workers.ts
import fs from "node:fs";
import { isOutsideWorkerUid, MAX_OUTSIDE_NAME, OUTSIDE_PREFIX, outsideWorkerUid, validateOutsideName } from "../lib/outsideWorkers";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

// ---- identity -------------------------------------------------------------------------------------------------------------
ok(outsideWorkerUid("  Nimal   K ") === "outside:nimal%20k", `spaces are collapsed and case is folded (got ${outsideWorkerUid("  Nimal   K ")})`);
ok(outsideWorkerUid("Nimal K") === outsideWorkerUid("nimal k"), "the same name in another case is the same person");
ok(outsideWorkerUid("Nimal K") !== outsideWorkerUid("Nimal S"), "different people with different names stay apart");
const sinhala = "නිමල් පෙරේරා";
ok(decodeURIComponent(outsideWorkerUid(sinhala).slice(OUTSIDE_PREFIX.length)) === sinhala, "a Sinhala name survives the round trip");
const tamil = "செல்வி";
ok(outsideWorkerUid(tamil).startsWith(OUTSIDE_PREFIX) && outsideWorkerUid(tamil).length > OUTSIDE_PREFIX.length, "a Tamil name gets a real identity (not blank)");
ok(isOutsideWorkerUid(outsideWorkerUid("Nimal")) && !isOutsideWorkerUid("abc123member"), "outside identities are recognised, login ids are not");
ok(!isOutsideWorkerUid(undefined) && !isOutsideWorkerUid(42), "a missing or non-text id is not an outside worker");

// ---- validation -----------------------------------------------------------------------------------------------------------
ok(validateOutsideName("Nimal") === null, "a name is accepted");
ok(validateOutsideName("") !== null && validateOutsideName("   ") !== null, "a blank name is refused");
ok(validateOutsideName("x".repeat(MAX_OUTSIDE_NAME)) === null && validateOutsideName("x".repeat(MAX_OUTSIDE_NAME + 1)) !== null, "the name limit is exact");
ok(validateOutsideName(undefined) !== null, "a missing name is refused");

// ---- the time form (app/time/page.tsx) -----------------------------------------------------------------------------------
const tp = read("app/time/page.tsx");
ok(/const OUTSIDE_PICK = "__outside__";/.test(tp), "the form has a picker value for outside workers that is never a member id");
ok(/<option value=\{OUTSIDE_PICK\}>Freelancer or contractor \(no login\)<\/option>/.test(tp), "the team member list offers the freelancer option");
ok(/validateOutsideName\(outsideName\)/.test(tp) && /if \(!isOutside && !member\) return;/.test(tp), "an outside entry needs a name, and a missing member still does nothing");
ok(/memberUid: isOutside \? outsideWorkerUid\(outsideName\) : member!\.id,/.test(tp), "an outside entry is saved under its stable identity");
ok(/\.\.\.\(isOutside \? \{ outsideWorker: true \} : \{\}\)/.test(tp), "the outside flag is only added when set (Firestore rejects undefined)");
ok(/setOutsideName\(""\);/.test(tp), "the name box is cleared after saving");
ok(!/outsideWorker: isOutside/.test(tp), "the flag is never written as a possibly-undefined value");

// ---- the rules are unchanged for time entries ---------------------------------------------------------------------------
const rules = read("firestore.rules");
ok(/match \/timeEntries\/\{docId\} \{[\s\S]*?allow create: if isOwnerOrManager\(businessId\)/.test(rules), "owners and managers may log time for an outside worker (no rules change needed)");
ok(/match \/timeEntries\/\{docId\} \{[\s\S]*?\|\| \(isStaff\(businessId\) && resource\.data\.memberUid == request\.auth\.uid\)/.test(rules), "staff still only see their own time");
const types = read("lib/types.ts");
ok(/outsideWorker\?: boolean;/.test(types), "time entries carry the outside flag");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
