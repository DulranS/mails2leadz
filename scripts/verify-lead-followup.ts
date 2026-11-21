// Lead follow-up defaults and duplicate warnings (lib/leadFollowUp.ts), and their wiring on the Leads page.
// Run: /home/claude/.npm-global/bin/tsx scripts/verify-lead-followup.ts
import fs from "node:fs";
import { contactKey, defaultFollowUpFor, findPossibleDuplicates, normalizeName } from "../lib/leadFollowUp";
import type { Customer, Lead } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const TODAY = "2026-11-01";
const lead = (o: Partial<Lead>): Lead => ({ id: Math.random().toString(36).slice(2), name: "L", stage: "new", createdAt: 0, ...o } as Lead);
const cust = (o: Partial<Customer>): Customer => ({ id: Math.random().toString(36).slice(2), name: "C", createdAt: 0, ...o } as Customer);

// 1. Follow-up defaults: working stages get a date, everything else none, and an existing date is never overwritten.
ok(defaultFollowUpFor("contacted", undefined, TODAY) === "2026-11-04", "contacted gets a follow-up three days out");
ok(defaultFollowUpFor("follow_up", undefined, TODAY) === "2026-11-04", "following up gets three days out");
ok(defaultFollowUpFor("proposal_sent", undefined, TODAY) === "2026-11-06", "a proposal gets five days out");
ok(defaultFollowUpFor("new", undefined, TODAY) === undefined, "a new lead gets no default");
ok(defaultFollowUpFor("won", undefined, TODAY) === undefined, "a won lead gets no default");
ok(defaultFollowUpFor("lost", undefined, TODAY) === undefined, "a lost lead gets no default");
ok(defaultFollowUpFor("contacted", "2026-11-20", TODAY) === undefined, "a date already set is never overwritten");
ok(defaultFollowUpFor("contacted", "2026-10-30", TODAY) === undefined, "an earlier date already set is never overwritten either");

// 2. Name normalisation and contact keys.
ok(normalizeName("  Kamal   Hardware ") === "kamal hardware", "names ignore case and spacing");
ok(contactKey("077 123 4567") === contactKey("0771234567"), "phone numbers compare by digits");
ok(contactKey("Kamal@Example.com ") === "kamal@example.com", "emails compare ignoring case");
ok(contactKey("12") === "", "a short number is not compared");
ok(contactKey("+94 77 123 4567") === contactKey("077-123-4567"), "a Sri Lankan number with +94 and with 0 is the same number");
ok(contactKey(undefined) === "", "no contact gives no key");

// 3. Duplicates: same name or same contact, leads and customers, never the lead being edited.
const leads = [lead({ id: "a", name: "Kamal Hardware", contact: "0771234567" }), lead({ id: "b", name: "Nimal", contact: "nimal@x.lk" })];
const customers = [cust({ name: "Sunil Stores", contact: "+94 77 555 1212" })];
const byName = findPossibleDuplicates("kamal   hardware", undefined, leads, customers);
ok(byName.length === 1 && byName[0].kind === "lead" && byName[0].reason === "name", "the same name matches an existing lead");
const byPhone = findPossibleDuplicates("New Person", "077-555-1212", leads, customers);
ok(byPhone.length === 1 && byPhone[0].kind === "customer" && byPhone[0].reason === "contact", "the same phone matches an existing customer");
ok(findPossibleDuplicates("Someone", "nimal@x.lk", leads, customers).some((d) => d.name === "Nimal"), "the same email matches an existing lead");
ok(findPossibleDuplicates("Kamal Hardware", "0771234567", leads, customers, "a").length === 0, "a lead does not warn about itself when edited");
ok(findPossibleDuplicates("Fresh Name", "", leads, customers).length === 0, "a new name with no matches gives no warning");
ok(findPossibleDuplicates("", "", leads, customers).length === 0, "nothing typed gives no warning");

// 4. Wiring on the Leads page: the default is applied on stage change, the warning is shown, and nothing blocks the save.
const page = fs.readFileSync("app/leads/page.tsx", "utf8");
ok(page.includes("defaultFollowUpFor(stage, lead.nextFollowUpDate, todayIso())"), "a stage change applies the follow-up default");
ok((page.match(/defaultFollowUpFor\(stage/g) ?? []).length === 3, "all three stage controls apply it (mobile, desktop and drag)");
ok(page.includes("Possible duplicate:") && page.includes("Save anyway if this is a different person."), "the form shows the warning and says saving is still allowed");
ok(!/duplicates\.length > 0\)\s*\{[^}]*return/.test(page), "the duplicate warning never stops the save");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
