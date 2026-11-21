// Customer support log (lib/support.ts) and the wiring of its collection: hand-worked cases.
// Run: npx tsx scripts/verify-support.ts
import fs from "node:fs";
import {
  ageDays, cleanSupportInput, daysToResolve, needsAttention, sortSupport, summarizeSupport, validateSupportInput, customerKey,
  type SupportInput,
} from "../lib/support";
import { can } from "../lib/permissions";
import { isMutationName } from "../lib/readOnlyGuard";
import type { Role, SupportCase } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

const TODAY = "2026-10-24";
let n = 0;
const mk = (o: Partial<SupportCase>): SupportCase => ({ id: `c${++n}`, customerName: "X", kind: "complaint", priority: "normal", subject: "s", openedOn: "2026-10-01", status: "open", createdAt: 0, updatedAt: 0, ...o });

// ---- ages ---------------------------------------------------------------------------------------------------------------
ok(ageDays({ openedOn: "2026-10-23" }, TODAY) === 1 && ageDays({ openedOn: TODAY }, TODAY) === 0 && ageDays({ openedOn: "2026-10-10" }, TODAY) === 14, "age in whole days");
ok(ageDays({ openedOn: "2026-11-01" }, TODAY) === 0, "a case dated in the future is 0 days old, never negative");
ok(daysToResolve({ openedOn: "2026-10-01", resolvedOn: "2026-10-05" }) === 4 && daysToResolve({ openedOn: "2026-10-01", resolvedOn: "2026-10-01" }) === 0 && daysToResolve({ openedOn: "2026-10-01" }) === null, "days to resolve; same day is 0; unresolved is none");

// ---- attention ----------------------------------------------------------------------------------------------------------
ok(needsAttention(mk({ priority: "urgent", openedOn: TODAY }), TODAY), "an urgent open case needs attention at once");
ok(!needsAttention(mk({ openedOn: "2026-10-17" }), TODAY) && needsAttention(mk({ openedOn: "2026-10-16" }), TODAY), "7 days open is fine, 8 is waiting");
ok(!needsAttention(mk({ priority: "urgent", status: "resolved", resolvedOn: TODAY }), TODAY) && !needsAttention(mk({ openedOn: "2026-01-01", status: "resolved", resolvedOn: "2026-01-02" }), TODAY), "a resolved case never needs attention");

// ---- the worked set -----------------------------------------------------------------------------------------------------
// Today 2026-10-24; "last 90 days" starts 2026-07-26.
const A = mk({ customerName: "Kamal", priority: "urgent", openedOn: "2026-10-23" });
const B = mk({ customerName: "Nimali", openedOn: "2026-10-10" });
const C = mk({ customerName: "Kamal", openedOn: "2026-10-24" });
const D = mk({ customerName: "Amali", openedOn: "2026-10-01", status: "resolved", resolvedOn: "2026-10-05" }); // 4 days
const E = mk({ customerName: "Sunil", openedOn: "2026-09-01", status: "resolved", resolvedOn: "2026-09-11" }); // 10 days
const F = mk({ customerName: "Old", openedOn: "2026-01-01", status: "resolved", resolvedOn: "2026-01-04" }); // too old
const G = mk({ customerName: "Kamal", openedOn: "2026-08-01", status: "resolved", resolvedOn: "2026-08-02" }); // 1 day
const H = mk({ customerName: "  KAMAL ", openedOn: "2026-09-15", status: "resolved", resolvedOn: "2026-09-18" }); // 3 days
const all = [A, B, C, D, E, F, G, H];
const s = summarizeSupport(all, TODAY);
ok(s.open === 3 && s.urgent === 1 && s.waiting === 1 && s.oldestOpenDays === 14, "3 open, 1 urgent, 1 waiting over 7 days, oldest 14 days");
ok(s.resolvedRecently === 4 && s.avgDaysToResolve === 4.5, "4 resolved in the last 90 days (the January one is outside), averaging (4 + 10 + 1 + 3) / 4 = 4.5 days");
ok(s.repeatCustomers.length === 1 && s.repeatCustomers[0].name === "Kamal" && s.repeatCustomers[0].cases === 4, "Kamal came back 4 times in 90 days (spelling and spacing ignored); nobody else did");
ok(summarizeSupport([], TODAY).open === 0 && summarizeSupport([], TODAY).avgDaysToResolve === null && summarizeSupport([], TODAY).oldestOpenDays === null && summarizeSupport([], TODAY).repeatCustomers.length === 0, "an empty log summarises to zeros and nothing");

// 90-day edges.
const edge = summarizeSupport([
  mk({ customerName: "Edge", openedOn: "2026-07-26", status: "resolved", resolvedOn: "2026-07-27" }),
  mk({ customerName: "Edge", openedOn: "2026-07-25", status: "resolved", resolvedOn: "2026-07-26" }),
  mk({ customerName: "Edge", openedOn: "2026-07-24", status: "resolved", resolvedOn: "2026-07-25" }),
  mk({ customerName: "Future", openedOn: "2026-11-02" }),
  mk({ customerName: "Future", openedOn: "2026-11-03" }),
], TODAY);
ok(edge.resolvedRecently === 2, "resolved on the 90th day back counts, the day before does not");
ok(edge.repeatCustomers.length === 0, "only one Edge case opened inside the window, and future-dated cases do not make a repeat customer");

ok(summarizeSupport([mk({ openedOn: "2026-10-17" })], TODAY).waiting === 0 && summarizeSupport([mk({ openedOn: "2026-10-16" })], TODAY).waiting === 1, "the summary counts waiting from the 8th day, like the badge");
const two = summarizeSupport([mk({ customerName: "Pair", openedOn: "2026-10-01" }), mk({ customerName: "pair", openedOn: "2026-10-02" })], TODAY);
ok(two.repeatCustomers.length === 1 && two.repeatCustomers[0].cases === 2, "two cases in 90 days already make a repeat customer");

// ---- order --------------------------------------------------------------------------------------------------------------
const order = sortSupport(all, TODAY).map((c) => c.id);
ok(order.join() === [A, B, C, D, H, E, G, F].map((c) => c.id).join(), "urgent open first, then open oldest first, then resolved latest first");
ok(sortSupport([C, A], TODAY)[0].id === A.id, "sorting puts the urgent case first from any starting order");
ok(all[0].id === A.id && all[7].id === H.id, "the input order is untouched");

// ---- validation ---------------------------------------------------------------------------------------------------------
const V = (o: Partial<SupportInput> = {}): SupportInput => ({ customerName: "Kamal", kind: "complaint", priority: "normal", subject: "Broken", openedOn: "2026-10-20", status: "open", ...o });
ok(validateSupportInput(V()) === null, "a plain open case is valid");
ok(validateSupportInput(V({ customerName: "  " })) !== null && validateSupportInput(V({ customerName: "x".repeat(101) })) !== null, "customer required, 100 characters at most");
ok(validateSupportInput(V({ subject: "" })) !== null && validateSupportInput(V({ subject: "x".repeat(151) })) !== null && validateSupportInput(V({ subject: "x".repeat(150) })) === null, "subject required, 150 at most");
ok(validateSupportInput(V({ kind: "gossip" as never })) !== null && validateSupportInput(V({ priority: "high" as never })) !== null && validateSupportInput(V({ status: "closed" as never })) !== null, "kind, priority and status must be real");
ok(validateSupportInput(V({ openedOn: "2026-02-30" })) !== null && validateSupportInput(V({ openedOn: "" })) !== null, "opened-on must be a real date");
ok(validateSupportInput(V({ detail: "x".repeat(2001) })) !== null && validateSupportInput(V({ detail: "x".repeat(2000) })) === null, "details 2,000 at most");
ok(validateSupportInput(V({ resolution: "x".repeat(1001) })) !== null, "resolution 1,000 at most");
ok(validateSupportInput(V({ status: "resolved" })) !== null, "resolved needs a date");
ok(validateSupportInput(V({ status: "resolved", resolvedOn: "2026-10-19" })) !== null, "cannot be resolved before it was opened");
ok(validateSupportInput(V({ status: "resolved", resolvedOn: "2026-10-20" })) === null && validateSupportInput(V({ status: "resolved", resolvedOn: "2026-10-24" })) === null, "resolved the same day or later is fine");
ok(validateSupportInput(V({ resolvedOn: "2026-10-24" })) !== null, "an open case cannot carry a resolved date");
ok(validateSupportInput(V({ contact: "x".repeat(101) })) !== null && validateSupportInput(V({ assignedTo: "x".repeat(81) })) !== null, "contact and assignee limits");

// ---- cleaning -----------------------------------------------------------------------------------------------------------
const cl = cleanSupportInput(V({ customerName: "  Kamal   Perera ", contact: " ", detail: "", assignedTo: " Nuwan ", resolution: "  ", subject: " Broken  " }));
ok(JSON.stringify(cl) === JSON.stringify({ customerName: "Kamal Perera", kind: "complaint", priority: "normal", subject: "Broken", openedOn: "2026-10-20", status: "open", assignedTo: "Nuwan" }), "names tidied, blank optional fields dropped, no undefined fields");
ok(!("resolvedOn" in cleanSupportInput(V({ status: "open", resolvedOn: "2026-10-24" }))), "an open case never keeps a resolved date (reopening clears it)");
ok(cleanSupportInput(V({ status: "resolved", resolvedOn: "2026-10-22", resolution: " Replaced " })).resolution === "Replaced", "a real resolution is kept, trimmed");
ok(customerKey("  KAMAL   Perera ") === "kamal perera", "customer names match ignoring case and spacing");

// ---- wiring -------------------------------------------------------------------------------------------------------------
const roles: Role[] = ["owner", "manager", "staff", "accountant"];
ok(roles.filter((r) => can(r, "manage:support")).join() === "owner,manager", "Owner and Manager write, Staff and Accountant do not");
ok(isMutationName("addSupportCase") && isMutationName("updateSupportCase") && isMutationName("deleteSupportCase"), "the accountant read-only guard recognises the writers");
const ctx = fs.readFileSync("contexts/DataContext.tsx", "utf8");
const ownerList = /if \(role === "owner"\)\s*return \[([\s\S]*?)\];/.exec(ctx)?.[1] ?? "";
const mgrList = /if \(role === "manager" \|\| role === "accountant"\)\s*return \[([\s\S]*?)\];/.exec(ctx)?.[1] ?? "";
const staffLine = /if \(role === "staff"\) return \[([^\]]*)\]/.exec(ctx)?.[1] ?? "";
ok(ownerList.includes('"supportCases"') && mgrList.includes('"supportCases"') && !staffLine.includes("supportCases"), "loaded for owner, manager and accountant, not staff (staff cannot read it in the rules)");
ok(/(?:onSnapshot|trackedSnapshot)\(query\(collection\(db, "users", businessId, "supportCases"\)/.test(ctx) && /bump\("supportCases"\)/.test(ctx), "a listener bumps the ready counter");
ok(/addSupportCase: async[\s\S]{0,120}requirePermission\("manage:support"\)/.test(ctx) && /updateSupportCase: async[\s\S]{0,120}requirePermission\("manage:support"\)/.test(ctx) && /deleteSupportCase: async[\s\S]{0,120}requirePermission\("delete:records"\)/.test(ctx), "write and delete permissions");
ok(/getDoc\(ref\)[\s\S]{0,500}createdAt: old\.createdAt/.test(ctx.slice(ctx.indexOf("updateSupportCase: async"))), "an edit keeps who opened it and when");
const rules = fs.readFileSync("firestore.rules", "utf8");
ok(/match \/supportCases\/\{docId\}\s*\{\s*allow read: if canReadBooks\(businessId\);\s*allow create, update: if isOwnerOrManager\(businessId\);\s*allow delete: if isOwner\(businessId\) && !isPublicDemo\(businessId\);/.test(rules), "rules: read as the books, Owner/Manager write, Owner deletes");
ok(fs.readFileSync("lib/backupPayload.ts", "utf8").includes("supportCases: data.supportCases"), "in the full backup");
ok(fs.readFileSync("scripts/restore-from-backup.mjs", "utf8").includes('"supportCases"'), "restorable");
ok(fs.readFileSync("lib/backup.ts", "utf8").includes("support_cases.csv"), "support_cases.csv in the backup zip");
const lock = fs.readFileSync("scripts/verify-period-lock.ts", "utf8");
ok(["addSupportCase", "updateSupportCase", "deleteSupportCase"].every((m) => lock.includes(`"${m}"`)), "listed as deliberately outside the period lock");
ok(/href: "\/support"[^}]*roles: \["owner", "manager", "accountant"\]/.test(fs.readFileSync("components/AppShell.tsx", "utf8")), "in the menu for the roles that can open it");
const page = fs.readFileSync("app/support/page.tsx", "utf8");
ok(page.includes('useRequireRole(["owner", "manager", "accountant"])') && page.includes('can(role, "manage:support")'), "the page guards the roles and hides write buttons from the accountant");

console.log(fails === 0 ? `OK: ${checks} checks passed` : `${fails} of ${checks} checks FAILED`);
process.exit(fails === 0 ? 0 : 1);
