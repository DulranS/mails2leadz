// Procedure coverage (lib/coverage.ts): who is qualified on each procedure's current version, the single-person and no-one flags, the
// order they are listed in, the Coverage tab's roles, and the review agenda's use of it. Run: npx tsx scripts/verify-coverage.ts
import fs from "node:fs";
import { coverageFor } from "../lib/coverage";
import { buildReviewPack } from "../lib/reviewPack";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const members = [
  { id: "u1", name: "Nimal", role: "owner", active: true },
  { id: "u2", name: "Ruwan", role: "staff", active: true },
  { id: "u3", name: "Kamal", role: "staff", active: true },
  { id: "u4", name: "Ex", role: "staff", active: false },
  { id: "u5", name: "Books", role: "accountant", active: true },
];
const procedures: { id: string; title: string; version: number; acks?: Record<string, { name: string; version: number }> }[] = [
  { id: "p1", title: "Open the shop", version: 2, acks: { u1: { name: "Nimal", version: 2 }, u2: { name: "Ruwan", version: 2 }, u3: { name: "Kamal", version: 2 } } },
  { id: "p2", title: "Cash count", version: 3, acks: { u1: { name: "Nimal", version: 3 }, u2: { name: "Ruwan", version: 2 } } },
  { id: "p3", title: "Fire drill", version: 1, acks: {} },
];
const rows = coverageFor(procedures, members);
const byId = (id: string) => rows.find((r) => r.procedureId === id)!;

ok(byId("p1").status === "covered" && byId("p1").qualified.length === 3, "a procedure with two or more people on the current version is covered");
ok(byId("p2").status === "single" && byId("p2").qualified.join() === "Nimal" && byId("p2").notQualified.includes("Ruwan"), "a procedure only one person has on the current version is a single point of failure; an out-of-date acknowledgement does not count");
ok(byId("p3").status === "none", "a procedure nobody has read is flagged as nobody qualified");
ok(!byId("p1").qualified.includes("Ex") && !byId("p1").notQualified.includes("Books"), "removed people and the accountant are not counted either way");
ok(rows[0].status === "none" && rows[rows.length - 1].status === "covered", "the worst gaps are listed first");

const pack = buildReviewPack({
  escalations: [], decisionsDue: [], kpisOffTarget: [], capacityProblems: [], complianceDue: [], incidentsOpen: [],
  pendingRequests: 0, proceduresToRead: 0, risksToReview: [], objectivesOverdue: [], areasWithNoOwner: [],
  procedureGaps: rows.filter((r) => r.status !== "covered").map((r) => ({ title: r.title, status: r.status as "none" | "single" })),
});
const people = pack.find((s) => s.key === "people");
ok(!!people && people.items.some((x) => x.includes("nobody is qualified for this procedure")) && people.items.some((x) => x.includes("only one person is qualified")), "the review agenda raises procedures with no one, or one person, qualified");
ok(buildReviewPack({ escalations: [], decisionsDue: [], kpisOffTarget: [], capacityProblems: [], complianceDue: [], incidentsOpen: [], pendingRequests: 0, proceduresToRead: 0, risksToReview: [], objectivesOverdue: [], areasWithNoOwner: [] }).length === 0, "without procedure gaps the review adds nothing for them");
ok(tabsForRole("owner").includes("coverage") && tabsForRole("manager").includes("coverage") && !tabsForRole("staff").includes("coverage"), "coverage is for the owner and manager");
ok(read("components/ops/CoveragePanel.tsx").includes("coverageFor(procedures, members)") && read("components/ops/useReviewSections.ts").includes("procedureGaps"), "the coverage view and the review use the same calculation");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
