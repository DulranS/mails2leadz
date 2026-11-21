// Playbook (lib/playbook.ts) and its wiring: dates, flags, validation, printing, and that every place that must know about
// the new collection does. Hand-worked cases.
// Run: npx tsx scripts/verify-playbook.ts
import fs from "node:fs";
import {
  addDays, attention, buildPlaybookHtml, cleanPlaybookInput, contractStatus, daysBetween, isIsoDate, isoFromEpoch,
  reviewStatus, sortPlaybook, summarizePlaybook, validatePlaybookInput, type PlaybookInput,
} from "../lib/playbook";
import { can } from "../lib/permissions";
import { isMutationName } from "../lib/readOnlyGuard";
import type { PlaybookEntry, Role, Settings } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

const mk = (o: Partial<PlaybookEntry>): PlaybookEntry => ({ id: "x", kind: "procedure", title: "T", body: "", createdAt: new Date(2026, 0, 1, 12).getTime(), updatedAt: 0, ...o });

// ---- dates ------------------------------------------------------------------------------------------------------------
ok(isIsoDate("2026-02-28") && !isIsoDate("2026-02-30") && !isIsoDate("2026-13-01") && !isIsoDate("26-01-01") && !isIsoDate("") && !isIsoDate(undefined) && isIsoDate("2028-02-29") && !isIsoDate("2027-02-29"), "real dates only, leap days handled");
ok(addDays("2026-01-31", 1) === "2026-02-01" && addDays("2026-03-01", -1) === "2026-02-28" && addDays("2026-12-31", 1) === "2027-01-01", "adding days crosses month and year ends");
ok(daysBetween("2026-01-01", "2026-01-31") === 30 && daysBetween("2026-01-31", "2026-01-01") === -30 && daysBetween("2026-03-01", "2026-03-01") === 0, "days between");
ok(daysBetween("2026-10-24", "2026-10-25") === 1 && daysBetween("2026-03-28", "2026-03-30") === 2, "whole days regardless of daylight saving");
ok(isoFromEpoch(new Date(2026, 5, 15, 23, 59).getTime()) === "2026-06-15" && isoFromEpoch(new Date(2026, 5, 15, 0, 1).getTime()) === "2026-06-15", "the calendar day is the person's local day, not UTC");

// ---- review schedule --------------------------------------------------------------------------------------------------
// Written 2026-01-01, review every 90 days, never reviewed: due 2026-04-01.
const p = mk({ reviewEveryDays: 90 });
ok(reviewStatus(p, "2026-01-02").state === "ok" && reviewStatus(p, "2026-01-02").dueOn === "2026-04-01", "never reviewed: due 90 days after it was written");
ok(reviewStatus(p, "2026-03-17").state === "ok" && reviewStatus(p, "2026-03-18").state === "due_soon", "due soon starts 14 days before: 2026-03-18 is 14 days out, 2026-03-17 is 15");
ok(reviewStatus(p, "2026-04-01").state === "due_soon" && reviewStatus(p, "2026-04-01").daysOverdue === 0, "on the due day itself it is due, not yet overdue");
ok(reviewStatus(p, "2026-04-02").state === "overdue" && reviewStatus(p, "2026-04-02").daysOverdue === 1 && reviewStatus(p, "2026-04-11").daysOverdue === 10, "the day after is overdue by 1, then counts up");
ok(reviewStatus({ ...p, lastReviewed: "2026-03-30" }, "2026-04-11").state === "ok" && reviewStatus({ ...p, lastReviewed: "2026-03-30" }, "2026-04-11").dueOn === "2026-06-28", "marking it reviewed restarts the clock from the review date");
ok(reviewStatus(mk({}), "2030-01-01").state === "none" && reviewStatus(mk({ reviewEveryDays: 0 }), "2030-01-01").state === "none" && reviewStatus(mk({ reviewEveryDays: NaN }), "2030-01-01").state === "none", "no schedule (or a bad one): never flagged");
ok(reviewStatus(mk({ reviewEveryDays: 30, lastReviewed: "garbage" }), "2026-01-20").dueOn === "2026-01-31", "a bad last-reviewed date falls back to the day it was written");

// ---- contracts --------------------------------------------------------------------------------------------------------
// Ends 2026-12-31, 60 days notice: decide by 2026-11-01.
const c = { endDate: "2026-12-31", noticeDays: 60 };
ok(contractStatus(c, "2026-11-01").state === "act_now" && contractStatus(c, "2026-11-01").decideBy === "2026-11-01", "from the decide-by day the notice period has started: act now");
ok(contractStatus(c, "2026-10-31").state === "ending_soon" && contractStatus(c, "2026-10-02").state === "ending_soon" && contractStatus(c, "2026-10-01").state === "running", "ending soon is the 30 days before the decide-by day (2026-10-02 in, 2026-10-01 out)");
ok(contractStatus(c, "2026-12-31").state === "act_now" && contractStatus(c, "2026-12-31").daysToEnd === 0, "on the last day it is still running out, not ended");
ok(contractStatus(c, "2027-01-01").state === "ended" && contractStatus(c, "2027-01-01").daysToEnd === -1, "the day after the end date it has ended");
ok(contractStatus({ endDate: "2026-12-31" }, "2026-12-01").decideBy === "2026-12-31" && contractStatus({ endDate: "2026-12-31" }, "2026-12-01").state === "ending_soon", "no notice given: decide by the end date itself");
ok(contractStatus({ endDate: "2026-12-31", noticeDays: 0 }, "2026-12-31").state === "act_now", "0 notice days behaves like none");
ok(contractStatus({}, "2026-01-01").state === "none" && contractStatus({ endDate: "nope" }, "2026-01-01").state === "none", "no end date (or a bad one): open-ended, never flagged");

// ---- attention, order, summary ----------------------------------------------------------------------------------------
const overdue = mk({ id: "a", title: "Zeta", reviewEveryDays: 10 }); // due 2026-01-11
const soon = mk({ id: "b", title: "Beta", kind: "contract", endDate: "2026-02-20", noticeDays: 10 }); // decide by 02-10
const quiet = mk({ id: "c", title: "Alpha" });
const decide = mk({ id: "d", title: "Mu", kind: "contract", endDate: "2026-02-05", noticeDays: 10 }); // decide by 01-26
const today = "2026-01-27";
ok(attention(overdue, today) === "act" && attention(decide, today) === "act" && attention(soon, today) === "watch" && attention(quiet, today) === null, "overdue review and an open notice window need action; a window opening within 30 days is a watch");
ok(sortPlaybook([quiet, soon, overdue, decide], today).map((e) => e.id).join("") === "dabc", "action first (Mu before Zeta, alphabetical inside), then coming up, then the rest");
const sum = summarizePlaybook([quiet, soon, overdue, decide, mk({ kind: "other" })], today);
ok(sum.procedures === 2 && sum.contracts === 2 && sum.other === 1 && sum.act === 2 && sum.watch === 1, "counts by kind and by attention");
ok(summarizePlaybook([], today).act === 0, "an empty playbook summarises to zeros");

// ---- validation and cleaning ------------------------------------------------------------------------------------------
const base: PlaybookInput = { kind: "procedure", title: "Opening", body: "1. Unlock" };
ok(validatePlaybookInput(base) === null, "a plain procedure is valid");
ok(validatePlaybookInput({ ...base, title: "   " }) !== null && validatePlaybookInput({ ...base, title: "x".repeat(151) }) !== null, "a title is required and bounded");
ok(validatePlaybookInput({ ...base, body: "x".repeat(20001) }) !== null && validatePlaybookInput({ ...base, body: "x".repeat(20000) }) === null, "20,000 characters of text is the limit");
ok(validatePlaybookInput({ ...base, reviewEveryDays: 0 }) !== null && validatePlaybookInput({ ...base, reviewEveryDays: 1.5 }) !== null && validatePlaybookInput({ ...base, reviewEveryDays: 3651 }) !== null && validatePlaybookInput({ ...base, reviewEveryDays: 3650 }) === null && validatePlaybookInput({ ...base, reviewEveryDays: 1 }) === null, "review every: a whole number of days, 1 to 3650");
ok(validatePlaybookInput({ kind: "contract", title: "Lease", body: "", endDate: "2026-05-01", startDate: "2026-06-01" }) !== null, "an end date before the start date is refused");
ok(validatePlaybookInput({ kind: "contract", title: "Lease", body: "", endDate: "2026-02-30" }) !== null, "an impossible date is refused");
ok(validatePlaybookInput({ kind: "contract", title: "Lease", body: "", noticeDays: 30 }) !== null && validatePlaybookInput({ kind: "contract", title: "Lease", body: "", noticeDays: 30, endDate: "2026-05-01" }) === null, "notice days need an end date");
ok(validatePlaybookInput({ kind: "contract", title: "Lease", body: "", noticeDays: -1, endDate: "2026-05-01" }) !== null && validatePlaybookInput({ kind: "contract", title: "Lease", body: "", noticeDays: 2.5, endDate: "2026-05-01" }) !== null, "notice days: a whole number, not negative");
ok(validatePlaybookInput({ ...base, kind: "bogus" as never }) !== null, "an unknown kind is refused");
const cl = cleanPlaybookInput({ kind: "procedure", title: "  Opening  ", body: "a\r\nb  ", owner: "  ", counterparty: "Landlord", endDate: "2026-12-31", noticeDays: 30, startDate: "2026-01-01" });
ok(cl.title === "Opening" && cl.body === "a\nb" && !("owner" in cl), "text is trimmed, line endings normalised, blank optional fields dropped");
ok(!("counterparty" in cl) && !("endDate" in cl) && !("noticeDays" in cl) && !("startDate" in cl), "contract fields on a non-contract are dropped, never saved");
ok(Object.values(cleanPlaybookInput({ kind: "contract", title: "L", body: "" })).every((v) => v !== undefined), "no undefined values reach the database");
const cc = cleanPlaybookInput({ kind: "contract", title: "L", body: "", endDate: "2026-12-31", noticeDays: 30, counterparty: "X" });
ok(cc.endDate === "2026-12-31" && cc.noticeDays === 30 && cc.counterparty === "X", "a contract keeps its dates and counterparty");
ok(!("noticeDays" in cleanPlaybookInput({ kind: "contract", title: "L", body: "", noticeDays: 30 })), "notice without an end date is dropped");

// ---- printing ---------------------------------------------------------------------------------------------------------
const settings = { currency: "LKR", businessName: "Test <Shop>" } as unknown as Settings;
const html = buildPlaybookHtml(mk({ title: "A <b>bold</b> title", body: "Step 1 & <script>alert(1)</script>\nStep 2", owner: "Nimal", kind: "contract", counterparty: "Landlord & Co", endDate: "2026-12-31", noticeDays: 60 }), settings, "2026-10-24");
ok(!/<script>/.test(html) && /&lt;script&gt;/.test(html) && /A &lt;b&gt;bold&lt;\/b&gt; title/.test(html) && /Landlord &amp; Co/.test(html), "everything typed is escaped in the printout");
ok(/white-space:pre-wrap/.test(html) && /Step 2/.test(html) && /not the signed agreement/.test(html) && /Notice:<\/strong> 60 days/.test(html), "line breaks kept, contract summary is labelled as not the signed agreement");
ok(!/not the signed agreement/.test(buildPlaybookHtml(mk({}), settings, "2026-10-24")), "the signed-agreement note appears only on contracts");

// ---- who can do what --------------------------------------------------------------------------------------------------
const roles: Role[] = ["owner", "manager", "accountant", "staff"];
const write = Object.fromEntries(roles.map((r) => [r, can(r, "manage:playbook")]));
ok(write.owner && write.manager && !write.accountant && !write.staff, "Owner and Manager write; the Accountant (view only) and Staff cannot");
ok(can("owner", "delete:records") && !can("manager", "delete:records"), "only the Owner deletes");
ok(isMutationName("addPlaybookEntry") && isMutationName("updatePlaybookEntry") && isMutationName("deletePlaybookEntry"), "the Accountant's read-only guard covers all three methods");

// ---- wiring -----------------------------------------------------------------------------------------------------------
const ctx = fs.readFileSync("contexts/DataContext.tsx", "utf8");
const rules = fs.readFileSync("firestore.rules", "utf8");
const lists = [...ctx.matchAll(/"stockTransfers", "openingBalances", "playbook",/g)].length;
ok(lists === 2, "Owner and Manager/Accountant listener lists include playbook");
const staffLine = /if \(role === "staff"\) return \[([^\]]*)\]/.exec(ctx);
ok(!!staffLine && !/playbook/.test(staffLine[1]), "Staff never load the playbook");
ok(/collection\(db, "users", businessId, "playbook"\)/.test(ctx), "one listener on the playbook collection");
const blockStart = rules.indexOf("match /playbook/{docId}");
const block = blockStart >= 0 ? rules.slice(blockStart, rules.indexOf("}", rules.indexOf("allow delete", blockStart)) + 1) : "";
ok(/allow read: if canReadBooks\(businessId\)/.test(block) && /allow create, update: if isOwnerOrManager\(businessId\)/.test(block) && /allow delete: if isOwner\(businessId\) && !isPublicDemo\(businessId\)/.test(block), "rules: books readers read, Owner/Manager write, Owner deletes, never in the public demo");
ok(/playbook: data\.playbook/.test(fs.readFileSync("lib/backupPayload.ts", "utf8")), "in the full backup");
ok(/"playbook"/.test(fs.readFileSync("scripts/restore-from-backup.mjs", "utf8")), "restorable from a backup");
ok(/playbook\.csv/.test(fs.readFileSync("lib/backup.ts", "utf8")), "a readable playbook.csv is in the backup zip");
ok(/href: "\/playbook"[^}]*roles: \["owner", "manager", "accountant"\]/.test(fs.readFileSync("components/AppShell.tsx", "utf8")), "in the menu for Owner, Manager and Accountant only");
const page = fs.readFileSync("app/playbook/page.tsx", "utf8");
ok(/useRequireRole\(\["owner", "manager", "accountant"\]\)/.test(page) && /can\(role, "manage:playbook"\)/.test(page), "the page is guarded and hides writes from view-only roles");
ok(/const clean = cleanPlaybookInput\(input\);\s*\n\s*const problem = validatePlaybookInput\(clean\)/.test(page), "the page cleans before it validates, so hidden fields can't block a save");
const upd = /updatePlaybookEntry: async \(docId, e\) => \{([\s\S]*?)\n    \},\n    deletePlaybookEntry/.exec(ctx);
ok(!!upd && /requirePermission\("manage:playbook"\)/.test(upd[1]) && /setDoc\(ref, \{/.test(upd[1]) && !/merge: true/.test(upd[1]), "an edit replaces the entry, so a removed end date is really removed, and keeps who wrote it and when");
ok(!!upd && /createdAt: old\.createdAt/.test(upd[1]), "an edit keeps the original creation time (review dates count from it)");
const del = /deletePlaybookEntry: async \(docId\) => \{([\s\S]*?)\n    \},/.exec(ctx);
ok(!!del && /requirePermission\("delete:records"\)/.test(del[1]), "deleting needs the Owner's permission");

if (fails) { console.error(`\n${fails} of ${checks} checks FAILED`); process.exit(1); }
console.log(`OK: ${checks} checks passed`);
