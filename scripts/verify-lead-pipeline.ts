// Lead pipeline (lib/leadPipeline.ts) and its wiring: contact log, speed to lead, owners, do-not-contact, follow-up sequences,
// close timing, lost-lead revisits, enquiry attribution, membership renewals, and the permission, rule and page wiring.
// Run: npx tsx scripts/verify-lead-pipeline.ts
import fs from "node:fs";
import {
  CONTACT_CHANNELS,
  LEAD_SEQUENCES,
  MAX_CONTACTS_PER_LEAD,
  MAX_CONTACT_NOTE,
  addIsoDays,
  attributionFor,
  closeTiming,
  dayDiff,
  logContactPlan,
  matchesFilter,
  ownerSummary,
  referrerHost,
  revisitDue,
  sequenceStatus,
  speedSummary,
  speedToLeadMinutes,
  startSequencePlan,
} from "../lib/leadPipeline";
import { membershipsEndingSoon } from "../lib/memberships";
import type { Lead, LeadContact, Membership } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const TODAY = "2026-11-03";
const DAY = 86400000;
const NOW = Date.parse("2026-11-03T12:00:00Z");
let n = 0;
const lead = (o: Partial<Lead> = {}): Lead => ({ id: "L" + n++, name: "Kamal Hardware", stage: "new", createdAt: NOW - 2 * 3600000, ...o });
const by = { uid: "u1", name: "Nimal" };

// ---------- the contact log ----------
{
  const a = lead();
  const p1 = logContactPlan(a, { channel: "call", outcome: "no_answer" }, NOW, by, "c1");
  ok(p1.ok, "a valid contact is accepted");
  if (p1.ok) {
    ok(p1.patch.firstContactedAt === NOW && p1.patch.lastContactedAt === NOW, "the first contact sets first and last contact times");
    ok(p1.patch.contacts?.length === 1, "the contact is appended");
    ok(!("note" in p1.contact), "an empty note is left out, not stored as undefined");
    ok(p1.contact.byUid === "u1" && p1.contact.byName === "Nimal", "the contact records who logged it");
  }
  const later = lead({ firstContactedAt: NOW - DAY, lastContactedAt: NOW - DAY, contacts: [] });
  const p2 = logContactPlan(later, { channel: "whatsapp", outcome: "spoke", note: "  wants   a quote\n for 40 chairs  " }, NOW, by, "c2");
  if (p2.ok) {
    ok(p2.patch.firstContactedAt === NOW - DAY, "a later contact keeps the first contact time");
    ok(p2.contact.note === "wants a quote for 40 chairs", "notes are trimmed and whitespace collapsed");
  } else ok(false, "a later contact with a note is accepted");
  const long = logContactPlan(a, { channel: "call", outcome: "spoke", note: "x".repeat(900) }, NOW, by, "c3");
  if (long.ok) ok((long.contact.note ?? "").length === MAX_CONTACT_NOTE, "notes are capped at the maximum length");
  else ok(false, "a long note is trimmed, not refused");
  ok(!logContactPlan(a, { channel: "fax", outcome: "spoke" }, NOW, by, "x").ok, "an unknown channel is refused");
  ok(!logContactPlan(a, { channel: "call", outcome: "maybe" }, NOW, by, "x").ok, "an unknown outcome is refused");
  const full = lead({ contacts: Array.from({ length: MAX_CONTACTS_PER_LEAD }, (_, i) => ({ id: "x" + i, at: i, channel: "call", outcome: "spoke" }) as LeadContact) });
  ok(!logContactPlan(full, { channel: "call", outcome: "spoke" }, NOW, by, "x").ok, `a lead holds at most ${MAX_CONTACTS_PER_LEAD} contacts`);
  ok(MAX_CONTACTS_PER_LEAD === 200, "the contact cap is 200 (stated in the manual)");
  ok(CONTACT_CHANNELS.length === 6, "six contact channels");
}

// ---------- opt-out ----------
{
  const a = lead();
  const stop = logContactPlan(a, { channel: "whatsapp", outcome: "asked_stop", note: "stop messaging me" }, NOW, by, "s");
  if (stop.ok) ok(stop.patch.doNotContact === true, "recording that they asked to stop sets do-not-contact");
  else ok(false, "asked-to-stop can always be logged");
  const dnc = lead({ doNotContact: true });
  ok(!logContactPlan(dnc, { channel: "call", outcome: "spoke" }, NOW, by, "x").ok, "do-not-contact blocks a call");
  ok(!logContactPlan(dnc, { channel: "whatsapp", outcome: "left_message" }, NOW, by, "x").ok, "do-not-contact blocks a message");
  ok(logContactPlan(dnc, { channel: "whatsapp", outcome: "asked_stop" }, NOW, by, "x").ok, "do-not-contact still lets the stop itself be recorded");
  ok(!startSequencePlan(dnc, "new_enquiry", TODAY).ok, "no sequence can start for a do-not-contact lead");
  ok(sequenceStatus(lead({ doNotContact: true, sequence: { key: "new_enquiry", startedOn: TODAY, doneSteps: 1 } }), TODAY)?.state === "stopped", "a running sequence stops when do-not-contact is set");
}

// ---------- sequences ----------
{
  const steps = LEAD_SEQUENCES[0].steps;
  ok(steps.length === 5 && steps[0].day === 0, "the new-enquiry sequence has five steps, the first on day 0");
  ok(steps.every((s, i) => i === 0 || s.day > steps[i - 1].day), "sequence steps run in day order");
  ok(steps.every((s) => ["intro", "follow_up", "qualify", "quote_chase", "winback_lead"].includes(s.templateId)), "every step uses a real lead message template");

  const start = startSequencePlan(lead(), "new_enquiry", TODAY);
  if (start.ok) {
    ok(start.patch.sequence?.doneSteps === 0 && start.patch.sequence?.startedOn === TODAY, "starting a sequence records today and zero steps done");
    ok(start.patch.nextFollowUpDate === TODAY, "the first step is due today");
  } else ok(false, "an open lead can start the sequence");
  ok(!startSequencePlan(lead({ stage: "won" }), "new_enquiry", TODAY).ok, "a won lead cannot start a sequence");
  ok(!startSequencePlan(lead({ stage: "lost" }), "new_enquiry", TODAY).ok, "a lost lead cannot start a sequence");
  ok(!startSequencePlan(lead({ sequence: { key: "new_enquiry", startedOn: TODAY, doneSteps: 2 } }), "new_enquiry", TODAY).ok, "a running sequence cannot be started twice");
  ok(!startSequencePlan(lead(), "nope", TODAY).ok, "an unknown sequence is refused");

  const running = lead({ sequence: { key: "new_enquiry", startedOn: "2026-10-30", doneSteps: 1 } });
  const st = sequenceStatus(running, TODAY);
  ok(st?.state === "due" && st.stepNumber === 2 && st.daysLate === 2 && st.dueDate === "2026-11-01", "step 2 is due on day 2 and shows as two days late");
  const future = sequenceStatus(lead({ sequence: { key: "new_enquiry", startedOn: "2026-11-05", doneSteps: 0 } }), TODAY);
  ok(future?.state === "upcoming" && future.dueDate === "2026-11-05", "a step later than today is upcoming");
  ok(sequenceStatus(lead(), TODAY) === null, "a lead with no sequence has no sequence status");

  // Logging a contact that counts as the step moves the sequence on and sets the next date.
  const c1 = logContactPlan(running, { channel: "whatsapp", outcome: "spoke", countsAsStep: true }, NOW, by, "k");
  if (c1.ok) {
    ok(c1.patch.sequence?.doneSteps === 2, "a counted touch moves the sequence to two steps done");
    ok(c1.patch.nextFollowUpDate === addIsoDays("2026-10-30", steps[2].day), "the next follow-up date becomes the next step's date");
  } else ok(false, "a counted touch on a running sequence is accepted");
  const c2 = logContactPlan(running, { channel: "call", outcome: "no_answer", countsAsStep: false }, NOW, by, "k");
  if (c2.ok) ok(c2.patch.sequence === undefined, "a contact that is not the step leaves the sequence alone");
  else ok(false, "a non-step contact is accepted");
  const lastStep = lead({ sequence: { key: "new_enquiry", startedOn: TODAY, doneSteps: 4 } });
  const fin = logContactPlan(lastStep, { channel: "whatsapp", outcome: "left_message", countsAsStep: true }, NOW, by, "k");
  if (fin.ok) ok(fin.patch.sequence?.doneSteps === 5, "the last counted touch finishes the sequence");
  ok(sequenceStatus({ ...lastStep, sequence: { key: "new_enquiry", startedOn: TODAY, doneSteps: 5 } }, TODAY)?.state === "finished", "a finished sequence reports finished");
  ok(sequenceStatus(lead({ stage: "won", sequence: { key: "new_enquiry", startedOn: TODAY, doneSteps: 1 } }), TODAY)?.state === "stopped", "a sequence stops when the lead is won");
  const askStop = logContactPlan(running, { channel: "whatsapp", outcome: "asked_stop", countsAsStep: true }, NOW, by, "k");
  if (askStop.ok) ok(askStop.patch.sequence === undefined, "asking to stop does not count as a step");
  else ok(false, "asking to stop is accepted");
}

// ---------- speed to lead and the team ----------
{
  ok(speedToLeadMinutes(lead({ createdAt: NOW - 90 * 60000, firstContactedAt: NOW })) === 90, "speed to lead is the minutes from enquiry to first contact");
  ok(speedToLeadMinutes(lead()) === null, "no first contact means no speed");
  const leads: Lead[] = [
    lead({ createdAt: NOW - 100 * 60000, firstContactedAt: NOW }), // 100
    lead({ createdAt: NOW - 20 * 60000, firstContactedAt: NOW }), // 20
    lead({ createdAt: NOW - 60 * 60000, firstContactedAt: NOW }), // 60
    lead({ createdAt: NOW - 50 * 3600000 }), // untouched 50h, new: counts
    lead({ createdAt: NOW - 3 * 3600000 }), // untouched 3h: not yet
    lead({ createdAt: NOW - 50 * 3600000, doNotContact: true }), // untouched but opted out: not counted
    lead({ createdAt: NOW - 50 * 3600000, stage: "contacted" }), // not new: not counted
  ];
  const s = speedSummary(leads, NOW);
  ok(s.measured === 3 && s.medianMinutes === 60, "median of 20, 60, 100 minutes is 60");
  ok(s.untouched === 1, "only an untouched new lead over 24 hours, not opted out, is flagged");
  ok(speedSummary([lead({ createdAt: NOW - 10 * 60000, firstContactedAt: NOW }), lead({ createdAt: NOW - 30 * 60000, firstContactedAt: NOW })], NOW).medianMinutes === 20, "an even count takes the middle pair's mean");

  const owned: Lead[] = [
    lead({ ownerUid: "u1", ownerName: "Nimal", stage: "contacted", nextFollowUpDate: TODAY, contacts: [{ id: "a", at: NOW - 2 * DAY, channel: "call", outcome: "spoke", byUid: "u2", byName: "Ruwan" }] }),
    lead({ ownerUid: "u1", ownerName: "Nimal", stage: "won" }), // closed: not open
    lead({ stage: "new", contacts: [{ id: "b", at: NOW - 30 * DAY, channel: "call", outcome: "spoke", byUid: "u1", byName: "Nimal" }] }), // unassigned, old contact
    lead({ stage: "new", contacts: [{ id: "c", at: NOW - 1 * DAY, channel: "call", outcome: "spoke" }] }), // contact with no author
  ];
  const rows = ownerSummary(owned, NOW, TODAY);
  const nimal = rows.find((r) => r.key === "u1");
  const un = rows.find((r) => r.key === "");
  ok(nimal?.open === 1 && nimal.dueToday === 1, "an owner's open and due-today leads are counted (won leads excluded)");
  ok(nimal?.contactsThisWeek === 0, "a contact older than the activity window is not counted this week");
  ok(rows.find((r) => r.key === "u2")?.contactsThisWeek === 1, "contacts are credited to the person who logged them");
  ok(un?.open === 2 && un.name === "Unassigned", "unassigned open leads form their own row");
  ok(rows.some((r) => r.key === "\u0000unknown" && r.name === "Unknown" && r.contactsThisWeek === 1), "a contact with no author gets its own row, not the unassigned one");
}

// ---------- close timing ----------
{
  const L = [
    lead({ estValue: 100, expectedCloseDate: "2026-10-20" }), // overdue
    lead({ estValue: 200, expectedCloseDate: "2026-11-25" }), // this month
    lead({ estValue: 300, expectedCloseDate: "2026-12-02" }), // next month
    lead({ estValue: 400, expectedCloseDate: "2027-03-01" }), // later
    lead({ estValue: 500 }), // unset
    lead({ estValue: 999, stage: "won", expectedCloseDate: "2026-11-25" }), // closed: ignored
  ];
  const t = closeTiming(L, TODAY);
  ok(t.overdue.count === 1 && t.overdue.value === 100, "a close date before today is overdue");
  ok(t.this_month.count === 1 && t.this_month.value === 200, "a close date in this month is this month");
  ok(t.next_month.count === 1 && t.next_month.value === 300, "a close date in the next month is next month");
  ok(t.later.count === 1 && t.later.value === 400, "a later close date is later");
  ok(t.unset.count === 1 && t.unset.value === 500, "no close date is unset");
  const dec = closeTiming([lead({ expectedCloseDate: "2027-01-10" })], "2026-12-15");
  ok(dec.next_month.count === 1, "next month rolls over from December to January");
  ok(dayDiff("2026-11-01", "2026-11-03") === 2, "dayDiff counts whole days");
}

// ---------- lost leads to revisit ----------
{
  const L = [
    lead({ stage: "lost", revisitOn: "2026-11-01" }),
    lead({ stage: "lost", revisitOn: "2026-12-01" }), // not yet
    lead({ stage: "lost", revisitOn: "2026-10-01", doNotContact: true }), // opted out
    lead({ stage: "lost", revisitOn: "" }), // cleared
    lead({ stage: "new", revisitOn: "2026-10-01" }), // not lost
    lead({ stage: "lost", revisitOn: "2026-10-15" }),
  ];
  const due = revisitDue(L, TODAY);
  ok(due.length === 2 && due[0].revisitOn === "2026-10-15" && due[1].revisitOn === "2026-11-01", "only lost leads whose date has come, oldest first, not opted out");
}

// ---------- enquiry attribution ----------
{
  ok(referrerHost("https://www.instagram.com/p/abc") === "instagram.com", "the referring host drops the www");
  ok(referrerHost("javascript:alert(1)") === undefined, "a non-web referrer is dropped");
  ok(referrerHost("not a url") === undefined, "a garbled referrer is dropped");
  ok(referrerHost(undefined) === undefined, "no referrer gives nothing");
  const a = attributionFor({ utm_source: "instagram", utm_campaign: "spring\x07sale", referrer: "https://google.com/", howHeard: "Friend or family" });
  ok(a.campaign === "instagram / spring sale", "campaign joins source and campaign and drops control characters");
  ok(a.referrer === "google.com" && a.howHeard === "Friend or family", "referrer and how-heard are kept");
  const empty = attributionFor({ utm_source: "   ", howHeard: "" });
  ok(Object.keys(empty).length === 0, "blank attribution is left out entirely, not stored as empty strings");
  ok(attributionFor({ utm_source: 42 as unknown as string }).campaign === undefined, "a non-text tag is ignored");
  ok(attributionFor({ howHeard: "x".repeat(200) }).howHeard?.length === 60, "how-heard is capped at 60 characters");
}

// ---------- filter chips ----------
{
  const mine = lead({ ownerUid: "u1" });
  ok(matchesFilter(mine, "mine", "u1", TODAY) && !matchesFilter(mine, "mine", "u2", TODAY), "Mine shows only leads the signed-in person owns");
  ok(matchesFilter(lead(), "unassigned", undefined, TODAY), "Unassigned shows leads with no owner");
  ok(matchesFilter(lead({ nextFollowUpDate: "2026-11-01" }), "due", undefined, TODAY), "Follow-up due includes dates already passed");
  ok(!matchesFilter(lead({ nextFollowUpDate: "2026-11-09" }), "due", undefined, TODAY), "Follow-up due excludes dates still ahead");
  ok(matchesFilter(lead({ stage: "new" }), "untouched", undefined, TODAY) && !matchesFilter(lead({ stage: "new", firstContactedAt: NOW }), "untouched", undefined, TODAY), "Not contacted yet excludes leads already contacted");
}

// ---------- membership renewals ----------
{
  const mem = (o: Partial<Membership>): Membership => ({ id: "m" + n++, customer: "Ayesha", plan: "10 hours", hours: 10, startDate: "2026-10-01", endDate: "2026-11-10", createdAt: 1, updatedAt: 1, ...o } as Membership);
  const L = [
    mem({ customer: "Ayesha" }), // ends in 7 days, 10 h left: in
    mem({ customer: "Bashir", endDate: "2026-12-20" }), // ends in 47 days: out
    mem({ customer: "Chamila", endDate: "2026-10-30" }), // already ended: out
    mem({ customer: "Dilan", startDate: "2026-11-20", endDate: "2026-12-30" }), // not started: out
    mem({ customer: "Eshan", hours: 2, endDate: "2026-11-05" }), // used up by a booking: out
  ];
  const bookings = [{ membershipId: L[4].id, status: "done", durationMin: 120 }] as { membershipId: string; status: "done"; durationMin: number }[];
  const soon = membershipsEndingSoon(L, bookings, TODAY);
  ok(soon.length === 1 && soon[0].m.customer === "Ayesha" && soon[0].bal.left === 10, "only active memberships ending within 14 days with hours left are listed");
}

// ---------- wiring ----------
{
  const perms = read("lib/permissions.ts");
  ok(/\| "log:leadContact"/.test(perms), "the log:leadContact permission is declared");
  const staffBlock = perms.slice(perms.indexOf("  staff: ["), perms.indexOf("  ],", perms.indexOf("  staff: [")));
  ok(staffBlock.includes('"log:leadContact"'), "staff hold log:leadContact");
  ok(perms.slice(perms.indexOf("const OWNER_MANAGER_SHARED"), perms.indexOf("];", perms.indexOf("const OWNER_MANAGER_SHARED"))).includes('"log:leadContact"'), "owners and managers hold log:leadContact");

  const ctx = read("contexts/DataContext.tsx");
  ok(ctx.includes("logLeadContact: (id: string"), "DataContext declares logLeadContact");
  ok(/logLeadContact: async \(docId, patch\) => \{\s*requirePermission\("log:leadContact"\)/.test(ctx), "logLeadContact checks log:leadContact before writing");
  ok(ctx.includes('where("ownerUid", "==", uid)'), "staff also listen for leads assigned to them");
  ok(ctx.includes("mergeStaffLeads"), "staff lead listeners are merged, not overwriting each other");

  const rules = read("firestore.rules");
  ok(rules.includes("resource.data.ownerUid == request.auth.uid"), "staff can read leads assigned to them");
  ok(/hasOnly\(\s*\['contacts', 'firstContactedAt', 'lastContactedAt', 'sequence', 'nextFollowUpDate', 'doNotContact'\]\)/.test(rules), "staff may only change the contact-log fields");
  ok(rules.includes("request.resource.data.get('doNotContact', false) == true"), "staff cannot clear an opt-out");

  const idx = JSON.parse(read("firestore.indexes.json"));
  ok(idx.indexes.some((i: { collectionGroup: string; fields: { fieldPath: string }[] }) => i.collectionGroup === "leads" && i.fields[0].fieldPath === "ownerUid"), "an ownerUid index exists for assigned leads");

  ok(read("app/api/enquiry/route.ts").includes("attributionFor("), "website enquiries store their attribution");
  const enq = read("app/enquire/[businessId]/page.tsx");
  ok(enq.includes("howHeard") && enq.includes("utm_campaign") && enq.includes("referrer: document.referrer"), "the enquiry form sends how-heard, campaign and referrer");

  const leads = read("app/leads/page.tsx");
  ok(leads.includes("<LeadPipelinePanel") && leads.includes("LogLeadContactDialog"), "the Leads page shows the pipeline panel and the contact dialog");
  ok(leads.includes("canOwn") && leads.includes("doNotContact: dnc"), "owner, close date, revisit and opt-out are saved only for Owners and Managers");
  ok(leads.includes("!lead.doNotContact && ("), "an opted-out lead gets no message button");
  ok(leads.includes("visibleActive"), "the filter chips narrow the stage columns");

  const mp = read("app/memberships/page.tsx");
  ok(mp.includes("membershipsEndingSoon"), "the Memberships page lists renewals");
  ok(read("components/LogLeadContactDialog.tsx").includes("logContactPlan("), "the contact dialog builds its write with logContactPlan");
  ok(read("components/LeadPipelinePanel.tsx").includes("updateLead(l.id, { revisitOn: \"\" })"), "clearing a revisit uses an empty string (undefined is ignored on write)");
}

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
