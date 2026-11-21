// Bulk lead import (lib/leadImport.ts) and its wiring. Hand-worked cases.
// Run: npx tsx scripts/verify-lead-import.ts
import fs from "node:fs";
import { leadsFromRows, looseNumber, MAX_LEAD_IMPORT_ROWS } from "../lib/leadImport";
import { isMutationName } from "../lib/readOnlyGuard";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

// ---- Loose column names: a list from another tool needs little editing ----------------------------------------------
const a = leadsFromRows([{ "Business Name": "Acme Ltd", Phone: "077 123 4567", Email: "a@acme.lk", Website: "acme.lk", Address: "Galle" }]);
ok(a.errors.length === 0 && a.rows.length === 1, "a directory-style row imports");
ok(a.rows[0].name === "Acme Ltd" && a.rows[0].contact === "077 123 4567", "business name -> name; a phone number beats an email for contact");
ok(a.rows[0].notes === "acme.lk | Galle", "website and address are kept in notes");
ok(leadsFromRows([{ company: "B", email: "b@x.lk" }]).rows[0].contact === "b@x.lk", "with no phone, the email is the contact");
ok(leadsFromRows([{ name: "C", contact: "explicit", phone: "0771" }]).rows[0].contact === "explicit", "an explicit contact column wins over phone");
ok(leadsFromRows([{ "  NAME ": "D", "Lead Source": "Cold outreach" }]).rows[0].source === "Cold outreach", "header case, spaces and punctuation are ignored");
// Every column this app's own export writes imports back (stage and lostReason are ignored).
const re = leadsFromRows([{ name: "E", contact: "0772", source: "Referral", stage: "won", estValue: "5000", nextFollowUpDate: "2026-11-05", lostReason: "x", notes: "n" }]);
ok(re.errors.length === 0 && re.rows[0].estValue === 5000 && re.rows[0].nextFollowUpDate === "2026-11-05" && re.rows[0].source === "Referral", "the app's own export columns import back");
ok(!("stage" in re.rows[0]) && !("lostReason" in re.rows[0]), "stage and lostReason are never imported: a list is not a pipeline");
// No undefined values: Firestore rejects them.
ok(Object.values(leadsFromRows([{ name: "F" }]).rows[0]).every((v) => v !== undefined) && Object.keys(leadsFromRows([{ name: "F" }]).rows[0]).join() === "name", "a name-only row has only a name, no undefined fields");

// ---- Row problems: row numbers match the spreadsheet, nothing is hidden ---------------------------------------------
const e1 = leadsFromRows([{ name: "ok" }, { name: "" , phone: "0771"}, { name: "ok2" }]);
ok(e1.errors.length === 1 && e1.errors[0].row === 3, "a missing name is reported on its spreadsheet row (header = row 1, so the second lead is row 3)");
const blank = leadsFromRows([{ name: "A" }, { name: "", phone: "" }, { name: "" }, { name: "" , phone: "x"}]);
ok(blank.rows.length === 1 && blank.errors.length === 1 && blank.errors[0].row === 5, "fully blank lines are skipped without shifting later row numbers; a row with a phone but no name is an error");
ok(leadsFromRows([{ name: "x".repeat(201) }]).errors.length === 1, "a name over 200 characters is refused");
ok(leadsFromRows([{ name: "ok", notes: "x".repeat(2001) }]).errors.length === 1, "notes over 2000 characters are refused");
// Money
ok(looseNumber("Rs. 1,200") === 1200 && looseNumber("1,200/-") === 1200 && looseNumber("$1,200.50") === 1200.5 && looseNumber("LKR 5000") === 5000, "spreadsheet-style money is read");
ok(looseNumber("abc") === null && looseNumber("") === null && looseNumber("12abc") === null && looseNumber("1.2.3") === null, "non-numbers are not numbers");
ok(leadsFromRows([{ name: "a", value: "abc" }]).errors.length === 1 && leadsFromRows([{ name: "a", value: "-5" }]).errors.length === 1, "a bad or negative value is an error, not a silent zero");
ok(!("estValue" in leadsFromRows([{ name: "a", value: "0" }]).rows[0]) && !("estValue" in leadsFromRows([{ name: "a", value: "" }]).rows[0]), "0 or blank value means no value is stored");
// Dates: year-month-day only, because 05/11 is a different day in different countries
ok(leadsFromRows([{ name: "a", followup: "2026-11-05" }]).rows[0].nextFollowUpDate === "2026-11-05", "a valid follow-up date is kept");
ok(leadsFromRows([{ name: "a", followup: "05/11/2026" }]).errors.length === 1 && leadsFromRows([{ name: "a", followup: "2026-02-30" }]).errors.length === 1 && leadsFromRows([{ name: "a", followup: "2026-13-01" }]).errors.length === 1, "day/month/year and impossible dates are refused with a message, never guessed");
ok(/2026-11-05/.test(leadsFromRows([{ name: "a", followup: "tomorrow" }]).errors[0].message), "the date error says what a good date looks like");
ok(leadsFromRows([{ name: "a", followup: "2028-02-29" }]).errors.length === 0 && leadsFromRows([{ name: "a", followup: "2027-02-29" }]).errors.length === 1, "leap days are handled");

// ---- Duplicates: skipped and counted, never errors, never added twice -----------------------------------------------
const d1 = leadsFromRows([{ name: "Acme Ltd", phone: "077 123 4567" }, { name: "  acme   LTD ", phone: "(077)-123-4567" }, { name: "Acme Ltd", phone: "0779999999" }]);
ok(d1.rows.length === 2 && d1.skippedDuplicates === 1 && d1.errors.length === 0, "same name and same number (ignoring case, spacing, punctuation) is one lead; same name, different number is another");
const d2 = leadsFromRows([{ name: "Kamal", phone: "0771" }, { name: "New one", phone: "0772" }], [{ name: "kamal", contact: "0771" }]);
ok(d2.rows.length === 1 && d2.rows[0].name === "New one" && d2.skippedDuplicates === 1, "a lead already in the pipeline is skipped");
ok(leadsFromRows([{ name: "Nimal" }, { name: "nimal" }]).skippedDuplicates === 1, "same name with no contact on either is a duplicate");
ok(leadsFromRows([{ name: "Nimal", phone: "0771" }], [{ name: "Nimal" }]).skippedDuplicates === 0, "same name where only one has a contact is NOT assumed to be the same person");
ok(leadsFromRows([{ name: "A", value: "bad" }, { name: "A", value: "5" }]).skippedDuplicates === 0, "a row with a problem is not remembered as a duplicate");

// ---- Size limit ------------------------------------------------------------------------------------------------------
const many = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Lead ${i}` }));
ok(leadsFromRows(many(MAX_LEAD_IMPORT_ROWS)).rows.length === 500 && leadsFromRows(many(MAX_LEAD_IMPORT_ROWS)).errors.length === 0, "exactly 500 rows is accepted");
const big = leadsFromRows(many(501));
ok(big.rows.length === 0 && big.errors.length === 1 && /500/.test(big.errors[0].message), "501 rows: nothing imported, one clear message");
ok(leadsFromRows([]).rows.length === 0 && leadsFromRows([]).errors.length === 0, "an empty file is not an error");

// ---- Wiring ---------------------------------------------------------------------------------------------------------
const page = fs.readFileSync("app/import-export/page.tsx", "utf8");
ok(/if \(errors\.length === 0\) await data\.bulkAddLeads\(rows\)/.test(page), "the page adds nothing when any row has a problem (all or nothing)");
ok(/importLeads\(file, data\.leads\)/.test(page), "the page checks for duplicates against the leads already there");
const ctx = fs.readFileSync("contexts/DataContext.tsx", "utf8");
const m = /bulkAddLeads: async \(rows\) => \{([\s\S]*?)\n    \},\n    updateLead/.exec(ctx);
ok(!!m, "DataContext implements bulkAddLeads");
if (m) {
  const body = m[1];
  ok(/requireAnyPermission\(\["manage:sales", "create:sale"\]\)/.test(body), "same permission as adding one lead");
  ok(/stage: "new" as const/.test(body) && /createdByUid: myUid/.test(body) && /createdByName/.test(body) && /createdAt/.test(body), "every imported lead starts at New and carries who created it (the rules require createdByUid = the caller)");
  ok(/i \+= BATCH_SIZE/.test(body) && /writeBatch/.test(body), "written in batches under Firestore's 500-write limit");
  ok(/logAudit\("lead"/.test(body), "the import is in the audit log");
}
ok(/const BATCH_SIZE = 400;/.test(ctx), "batch size stays under Firestore's limit of 500");
const rules = fs.readFileSync("firestore.rules", "utf8");
ok(/match \/leads\/\{docId\} \{[\s\S]*?allow create: if isOwnerOrOperatingMember\(businessId\) && createdBySelf\(\);/.test(rules), "the existing leads rule already allows exactly this write: no rules change is needed");
ok(isMutationName("bulkAddLeads"), "an Accountant (view-only) is blocked from bulkAddLeads by the read-only guard");

if (fails) { console.error(`\n${fails} of ${checks} checks FAILED`); process.exit(1); }
console.log(`OK: ${checks} checks passed`);
