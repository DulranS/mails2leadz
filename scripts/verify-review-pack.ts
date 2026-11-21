// Management review pack (lib/reviewPack.ts): empty sections drop out, the order of the review, the flags it raises, the text it
// produces, and who may open it. Run: npx tsx scripts/verify-review-pack.ts
import fs from "node:fs";
import { buildReviewPack, reviewPackText, type ReviewPackInput } from "../lib/reviewPack";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const empty: ReviewPackInput = {
  escalations: [], decisionsDue: [], kpisOffTarget: [], capacityProblems: [], complianceDue: [], incidentsOpen: [],
  pendingRequests: 0, proceduresToRead: 0, risksToReview: [], objectivesOverdue: [], areasWithNoOwner: [],
};
ok(buildReviewPack(empty).length === 0, "a business with nothing to review gets an empty pack");
ok(reviewPackText([], "Shop", "2026-11-03").includes("Nothing needs a decision today"), "an empty pack says so plainly");

const full: ReviewPackInput = {
  ...empty,
  escalations: [{ title: "Supplier invoice", area: "Payables", daysLate: 33, severity: "high" }],
  decisionsDue: [{ title: "Second driver", targetDate: "2026-10-01" }, { title: "Move supplier", ownerName: "Nimal", targetDate: "2026-12-01" }],
  kpisOffTarget: [{ name: "On-time orders", latest: 82, target: 95, unit: "%", hasDecision: false }],
  complianceDue: [{ name: "Trade licence", state: "expired", daysLeft: -3 }, { name: "Insurance", state: "due_soon", daysLeft: 12 }],
  pendingRequests: 2,
  areasWithNoOwner: ["Stock counting"],
};
const sections = buildReviewPack(full);
ok(sections.map((s) => s.key).join() === "escalations,decisions,kpis,compliance,people", "the review runs in the order the meeting should take it, and drops the empty sections");
ok(sections.find((s) => s.key === "decisions")!.items.some((x) => x.includes("NO OWNER")), "a decision with no owner is called out");
ok(sections.find((s) => s.key === "kpis")!.items[0].includes("no decision linked"), "a number off target with no decision behind it is flagged");
ok(sections.find((s) => s.key === "compliance")!.items.some((x) => x.includes("EXPIRED 3 days ago")) && sections.find((s) => s.key === "compliance")!.items.some((x) => x.includes("renew in 12 days")), "expired and due-soon items say how long");
ok(sections.find((s) => s.key === "people")!.items.some((x) => x.includes("no one is responsible")) && sections.find((s) => s.key === "people")!.items.some((x) => x.includes("2 requests")), "areas with no owner and waiting requests are in the people section");
const text = reviewPackText(sections, "Shop", "2026-11-03");
ok(text.startsWith("Shop management review, 2026-11-03") && text.includes("ESCALATIONS") === false && text.includes("OVERDUE AND LATE") && text.endsWith("set the day it will be done by."), "the agenda text opens with the business and date, and closes with the decision prompt");

ok(tabsForRole("owner").includes("review") && tabsForRole("manager").includes("review") && !tabsForRole("staff").includes("review"), "the management review is for the owner and manager");
ok(read("components/ops/useReviewSections.ts").includes("useEscalations") && read("components/ops/useReviewSections.ts").includes("useCapacity"), "the review draws on the same escalations and capacity as the rest of operations");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
