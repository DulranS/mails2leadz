// Lead intake (lib/leadIntake.ts, lib/leadIntakeServer.ts, the lead API route, the enquiry route, and the Integrations page):
// phone and email matching, duplicate merging, owner choice, the automations (each off unless switched on), the lead API key,
// and the wiring that keeps the key owner-only and out of backups. Run: npx tsx scripts/verify-lead-intake.ts
import fs from "node:fs";
import {
  AUTOMATION_MAX_DAYS, DEFAULT_AUTOMATIONS, chooseOwner, cleanInbound, contactKeysFor, findDuplicateId, followUpAfter,
  generateLeadApiKey, inboundLeadDoc, keysFromParts, looksLikeLeadApiKey, mergedNotes, normalizeEmail, normalizePhone,
  openCountsByOwner, publicLead, readBearerKey, resolveAutomations, validateAutomations,
} from "../lib/leadIntake";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const TODAY = "2026-11-03";
const NOW = Date.parse("2026-11-03T09:00:00Z");

// phones and emails
ok(normalizePhone("077 123 4567", "94") === "+94771234567", "a local number becomes international with the country code");
ok(normalizePhone("+94 77 123 4567", "94") === "+94771234567", "an international number is the same as the local one");
ok(normalizePhone("0094771234567") === "+94771234567", "a 00 prefix is read as international");
ok(normalizePhone("771234567", "94") === "+94771234567", "a local number written without its 0 is placed");
ok(normalizePhone("+1 (555) 010-9999") === "+15550109999", "punctuation is ignored");
ok(normalizePhone("0771234567") === undefined, "a local number with no country code is not matched (set it on Integrations)");
ok(normalizePhone("123") === undefined && normalizePhone("abc") === undefined && normalizePhone(42) === undefined, "non-numbers and short numbers are refused");
ok(normalizeEmail("  Amal@Example.COM ") === "amal@example.com", "emails are trimmed and lowercased");
ok(normalizeEmail("bad@") === undefined && normalizeEmail("two@@x.com") === undefined, "malformed emails are refused");
ok(keysFromParts("077 123 4567", "amal@x.com", "94").join() === "p:+94771234567,e:amal@x.com", "keys come from a phone and an email");
ok(new Set(contactKeysFor("077 123 4567 / Amal@X.com", "94")).size === 2 && contactKeysFor("077 123 4567 / Amal@X.com", "94").includes("p:+94771234567"), "keys are read from a free-text contact line");
ok(contactKeysFor("", "94").length === 0, "an empty contact has no keys");

// inbound input
const bad = (b: Record<string, unknown>) => cleanInbound(b, "94");
ok(!bad({ phone: "0771234567" }).ok, "a name is needed");
ok(!bad({ name: "Amal" }).ok, "a phone or an email is needed");
ok(!bad({ name: "Amal", phone: "12" }).ok, "a phone that does not look right is refused");
ok(!bad({ name: "Amal", email: "nope" }).ok, "an email that does not look right is refused");
const good = bad({ name: "  Amal   Perera ", phone: "+94 77 123 4567", message: "Need 40 chairs", source: "Facebook ad", utm_campaign: "spring", externalId: "fb-8812", consentToContact: true });
ok(good.ok && good.value.name === "Amal Perera" && good.value.source === "Facebook ad" && good.value.campaign === "spring", "a valid lead is cleaned and keeps its source and campaign");
ok(good.ok && good.value.externalId === "fb-8812" && good.value.consentToContact === true, "the external id and the consent answer are kept");
ok(good.ok && bad({ name: "Amal", email: "a@b.co" }).ok && (bad({ name: "Amal", email: "a@b.co" }) as { value: { source: string } }).value.source === "Online form", "the source defaults to an online form");

// duplicates
ok(findDuplicateId([{ id: "L1", contactKeys: ["p:+94771234567"] }, { id: "L2", contactKeys: ["e:x@y.com"] }], ["e:x@y.com"]) === "L2", "a duplicate is found by a shared key");
ok(findDuplicateId([{ id: "L1", contactKeys: ["p:+94771234567"] }], ["p:+94000000000"]) === undefined, "no shared key, no duplicate");
ok(findDuplicateId([{ id: "L1", contactKeys: ["p:+94771234567"] }], []) === undefined, "no keys, no duplicate");
ok(mergedNotes(undefined, { message: "Still interested", source: "Website enquiry" }, TODAY) === "2026-11-03, came in again (Website enquiry): Still interested", "a repeat enquiry is dated in the notes");
ok(mergedNotes("Old note", { source: "Lead API" }, TODAY).startsWith("Old note\n2026-11-03"), "a repeat enquiry is added after the old notes");
ok(mergedNotes("x".repeat(4500), { source: "s" }, TODAY).length <= 4000, "the notes stay under their cap");

// owner choice
const members = [
  { uid: "o", name: "Owner", role: "owner", active: true },
  { uid: "m", name: "Manager", role: "manager", active: true },
  { uid: "s", name: "Staff", role: "staff", active: true },
  { uid: "a", name: "Books", role: "accountant", active: true },
  { uid: "x", name: "Left", role: "staff", active: false },
];
ok(chooseOwner(members, { o: 5, m: 1, s: 3 })?.uid === "m", "the person with the fewest open leads gets the new lead");
ok(chooseOwner(members, {})?.uid === "m" || chooseOwner(members, {})?.uid === "o", "with equal load, a tie is broken by name (Manager before Owner)");
ok(chooseOwner([{ uid: "a", name: "Books", role: "accountant", active: true }], {}) === undefined, "an accountant never owns a lead");
ok(chooseOwner(members, { x: 0, s: 9 })?.uid !== "x", "an inactive member is never chosen");
const counts = openCountsByOwner([{ ownerUid: "m", stage: "new" }, { ownerUid: "m", stage: "won" }, { ownerUid: "s", stage: "lost" }, { stage: "new" }]);
ok(counts.m === 1 && counts.s === undefined, "won, lost and unowned leads do not count as open load");

// automations: off by default
const off = resolveAutomations(undefined);
ok(!off.autoAssignInbound && !off.autoFollowUpInbound && !off.autoSequenceInbound && off.mergeDuplicateInbound === true, "every automation is off by default, except merging duplicates");
ok(off.autoRevisitLostDays === 0 && off.autoFollowUpAfterProposalDays === 0 && off.defaultCountryCode === "", "the day-based automations are off by default");
const input = { name: "Amal", contactText: "077 123 4567", source: "Website enquiry" };
const plain = inboundLeadDoc(input, { now: NOW, today: TODAY, automations: off, createdByName: "t", contactKeys: [] });
ok(plain.ownerUid === undefined && plain.nextFollowUpDate === undefined && plain.sequence === undefined, "with the automations off, a new lead is only filed, not assigned or dated");
ok(plain.contact === "077 123 4567" && plain.stage === "new", "the contact is kept exactly as typed");
ok(Object.values(plain).every((v) => v !== undefined), "no field is stored as undefined");
const on = inboundLeadDoc({ ...input, externalId: "e1" }, {
  now: NOW, today: TODAY, createdByName: "t", contactKeys: ["p:+94771234567"],
  automations: { ...off, autoAssignInbound: true, autoFollowUpInbound: true, autoSequenceInbound: true },
  owner: { uid: "m", name: "Manager" },
});
ok(on.ownerUid === "m" && on.ownerName === "Manager", "assignment writes the owner");
ok(on.nextFollowUpDate === TODAY, "a new lead is due for follow-up today when that is on");
ok((on.sequence as { key: string; doneSteps: number; startedOn: string })?.key === "new_enquiry" && (on.sequence as { doneSteps: number }).doneSteps === 0, "the sequence starts on a new lead when that is on");
ok(on.externalId === "e1" && Array.isArray(on.contactKeys), "the external id and the keys are stored");
ok(followUpAfter(TODAY, 0) === undefined && followUpAfter(TODAY, 3) === "2026-11-06", "a day-based follow-up is off at 0 and dated when set");

// settings validation
ok(validateAutomations({ autoRevisitLostDays: 90, autoFollowUpAfterProposalDays: 3, defaultCountryCode: "94" }) === null, "valid automation settings pass");
ok(validateAutomations({ autoRevisitLostDays: AUTOMATION_MAX_DAYS + 1 }) !== null, "a revisit period beyond the maximum is refused");
ok(validateAutomations({ autoRevisitLostDays: 2.5 }) !== null, "a fractional number of days is refused");
ok(validateAutomations({ defaultCountryCode: "9a" }) !== null, "a country code with letters is refused");
ok(DEFAULT_AUTOMATIONS.defaultCountryCode === "", "no country code is assumed");

// the lead API key
const k1 = generateLeadApiKey(), k2 = generateLeadApiKey();
ok(looksLikeLeadApiKey(k1) && k1 !== k2 && k1.startsWith("blk_"), "a generated key has the blk_ prefix and is unique");
ok(!looksLikeLeadApiKey("blk_short") && !looksLikeLeadApiKey("notakey-at-all-1234567890"), "anything that is not a key shape is refused");
ok(readBearerKey(new Headers({ authorization: "Bearer blk_abcdefghijklmnopqrstuvwxyz" })) === "blk_abcdefghijklmnopqrstuvwxyz", "a Bearer header gives the key");
ok(readBearerKey(new Headers({ "x-api-key": " blk_x " })) === "blk_x", "an x-api-key header gives the key");
ok(readBearerKey(new Headers()) === null, "no key header gives nothing");

// what a calling tool may read
const pub = publicLead("L9", { name: "Amal", stage: "new", contact: "077", notes: "private note", contactKeys: ["p:+94"], createdAt: 5, ownerName: "M" });
ok(pub.id === "L9" && pub.ownerName === "M" && pub.createdAt === 5, "a calling tool reads the lead's id, owner and time");
ok(!("notes" in pub) && !("contactKeys" in pub), "private notes and match keys are never returned");

// wiring
const cat = read("lib/integrations.ts");
ok(/id: "lead_api"[\s\S]*?secret: true, required: true/.test(cat), "Lead API is one catalogue entry with one secret key");
const route = read("app/api/v1/businesses/[businessId]/leads/route.ts") + read("lib/leadApiAuth.ts");
ok(/export async function POST/.test(route) && /export async function GET/.test(route), "the lead API route has POST and GET");
ok(route.includes("timingSafeEqual") && route.includes("saved?.enabled"), "the key is compared in constant time and only when the lead API is switched on");
ok(route.includes("openBusinessAdmin") && route.includes("isRateLimited"), "the key check opens the business and rate limits it");
ok(!route.includes("notes: undefined") && read("lib/leadIntake.ts").includes("publicLead"), "the read shape is the only one returned");
ok(read("app/api/v1/businesses/[businessId]/reviews/route.ts").includes("authoriseLeadApi(req, businessId)"), "the review route uses the same key check");
const enq = read("app/api/enquiry/route.ts");
ok(enq.includes("openBusinessAdmin") && enq.includes("findDuplicate(") && enq.includes("pickOwner("), "the enquiry route merges duplicates and applies the automations");
ok(read("contexts/DataContext.tsx").includes("contactKeysFor(l.contact") && read("contexts/DataContext.tsx").includes("auto.autoRevisitLostDays"), "manual leads get match keys and the revisit automation applies");
ok(read("lib/types.ts").includes("automations?: AutomationSettings"), "the automation settings are part of the settings record");
ok(read("app/integrations/page.tsx").includes("<AutomationsCard />") && read("app/integrations/page.tsx").includes("<LeadApiHelp"), "the Integrations page shows the automations and the lead API help");
ok(!/integrations/.test(read("lib/backupPayload.ts")), "integration keys stay out of the backup on purpose");
const rules = read("firestore.rules");
ok(/match \/integrations\/\{providerId\} \{[\s\S]*?allow read: if isOwner\(businessId\)/.test(rules), "integration keys are readable and writable by the owner only");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
