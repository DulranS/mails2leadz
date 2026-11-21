// Recruiting (lib/recruiting.ts, the screen, the rules and the backup): stages move forward and are dated once, a closed outcome is not reopened,
// time to hire is measured from applying to being hired, stale candidates and hires awaiting onboarding are found, and the tab and roles are set.
// Run: npx tsx scripts/verify-recruiting.ts
import fs from "node:fs";
import { validateCandidate, moveStage, timeToHireDays, pipelineSummary, type Candidate } from "../lib/recruiting";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const today = "2026-11-09";

ok(validateCandidate({ name: "Amali", role: "Cashier", appliedOn: "2026-11-01" }, today) === null, "a named candidate for a role, applied on a real past day, is accepted");
ok(validateCandidate({ name: "A", role: "Cashier", appliedOn: "2026-11-01" }, today) !== null, "a name too short to be a person is refused");
ok(validateCandidate({ name: "Amali", role: "Cashier", appliedOn: "2026-11-20" }, today) !== null, "an application dated in the future is refused");
ok(validateCandidate({ name: "Amali", role: "Cashier", appliedOn: "2026-02-30" }, today) !== null, "a day that does not exist is refused");

let c: Candidate = { id: "c1", name: "Amali", role: "Cashier", stage: "applied", stageDates: { applied: "2026-10-01" } };
c = moveStage(c, "interview", "2026-10-05");
c = moveStage(c, "offer", "2026-10-12");
ok(c.stage === "offer" && c.stageDates.interview === "2026-10-05" && c.stageDates.offer === "2026-10-12", "moving on records the day each stage was reached");
ok(moveStage(c, "offer", "2026-10-30").stageDates.offer === "2026-10-12", "a stage is dated once, the first time it is reached");
c = moveStage(c, "hired", "2026-10-15");
ok(timeToHireDays(c) === 14, "time to hire is the days from applying to being hired (14)");
ok(moveStage(c, "interview", "2026-10-20").stage === "hired", "a hired candidate is not moved back");
const rej = moveStage({ id: "c2", name: "Nuwan", role: "Cashier", stage: "interview", stageDates: { applied: "2026-10-01", interview: "2026-10-03" } }, "rejected", "2026-10-04");
ok(rej.stage === "rejected" && rej.stageDates.interview === "2026-10-03" && timeToHireDays(rej) === null, "a candidate turned down keeps their path, and has no time to hire");

const all: Candidate[] = [
  c,
  { id: "c3", name: "Kasun", role: "Driver", stage: "interview", stageDates: { applied: "2026-10-15", interview: "2026-10-20" } }, // 25 days in interview: stale
  { id: "c4", name: "Dilani", role: "Driver", stage: "applied", stageDates: { applied: "2026-11-05" } },                          // 4 days: not stale
  { id: "c5", name: "Ravi", role: "Cashier", stage: "hired", stageDates: { applied: "2026-09-01", hired: "2026-09-21" }, onboardingStarted: true },
  { id: "c6", name: "Sunil", role: "Driver", stage: "hired", stageDates: { applied: "2026-10-20", hired: "2026-11-02" } },        // hired, not onboarded
];
const s = pipelineSummary(all, today);
ok(s.open === 2 && s.counts.hired === 3 && s.counts.interview === 1, "two candidates are still open; three have been hired; one is in interview");
ok(s.averageTimeToHireDays === 15.7, "average time to hire is the mean of the three hires (14, 20 and 13 days: 15.7)");
ok(s.stale.length === 1 && s.stale[0].candidate.id === "c3" && s.stale[0].daysInStage === 20, "a candidate who has waited 14 days or more in one stage is flagged, with how long");
ok(s.awaitingOnboarding.map((x) => x.id).join() === "c1,c6", "a hire whose onboarding has not started is listed until it does (Ravi, started, is not)");
ok(pipelineSummary([], today).averageTimeToHireDays === null && pipelineSummary([], today).open === 0, "an empty pipeline gives nothing to average or flag");

ok(tabsForRole("owner").includes("recruiting") && tabsForRole("manager").includes("recruiting") && !tabsForRole("staff").includes("recruiting"), "recruiting is for the owner and manager");
ok(read("firestore.rules").includes("match /candidates/{docId}") && read("firestore.rules").includes("allow read, create, update: if isOwnerOrManager(businessId);"), "candidates are readable and writable by the owner and manager only");

ok(read("contexts/DataContext.tsx").includes("addCandidate: async") && read("contexts/DataContext.tsx").includes('requirePermission("manage:team");') && read("contexts/DataContext.tsx").includes("moveStage(current, to, todayIso())"), "adding a candidate and moving them are recorded with the owner's permission, and each stage date is kept");
ok(read("lib/backupPayload.ts").includes("candidates: data.candidates") && read("scripts/restore-from-backup.mjs").includes('"candidates"'), "candidates are included in the backup and restored with it");
ok(read("components/ops/RecruitingPanel.tsx").includes("Onboarding started") && read("components/ops/RecruitingPanel.tsx").includes("Hired, onboarding not yet started"), "hires waiting for onboarding are shown until it starts");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
