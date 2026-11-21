// Lead pipeline (v175): what happened with a lead, who is working it, and what to do next. Pure: no I/O, no Firestore, no clock
// reads (the caller passes `now` and `today`), so the page, the rules and scripts/verify-lead-pipeline.ts apply the same rules.
//
// Nothing here contacts anyone. A sequence step tells the owner what to send and when; the owner sends it from WhatsApp, the
// phone or email and then logs the contact. Balancr never sends a lead a message on its own.
import type { Lead, LeadContact, LeadContactChannel, LeadContactOutcome, LeadSequenceState } from "./types";

export const MAX_CONTACTS_PER_LEAD = 200;
export const MAX_CONTACT_NOTE = 500;
export const UNTOUCHED_HOURS = 24; // a new lead with no contact after this long is flagged
export const ACTIVITY_DAYS = 7; // the owner summary counts contacts logged in this many days

export const CONTACT_CHANNELS: { value: LeadContactChannel; label: string }[] = [
  { value: "call", label: "Phone call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "visit", label: "Visit" },
  { value: "other", label: "Other" },
];

export const CONTACT_OUTCOMES: { value: LeadContactOutcome; label: string }[] = [
  { value: "no_answer", label: "No answer" },
  { value: "left_message", label: "Left a message" },
  { value: "spoke", label: "Spoke with them" },
  { value: "meeting_set", label: "Meeting or visit agreed" },
  { value: "not_interested", label: "Not interested" },
  { value: "asked_stop", label: "Asked us to stop contacting them" },
];

const CHANNELS = new Set<string>(CONTACT_CHANNELS.map((c) => c.value));
const OUTCOMES = new Set<string>(CONTACT_OUTCOMES.map((o) => o.value));

// ---------- dates (ISO YYYY-MM-DD, UTC arithmetic so the result never depends on the server's time zone) ----------

export function addIsoDays(iso: string, n: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

// Whole days from `from` to `to` (negative when `to` is earlier).
export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

const monthOf = (iso: string) => iso.slice(0, 7);

// ---------- the contact log ----------

export function isOpenLead(l: Pick<Lead, "stage">): boolean {
  return l.stage !== "won" && l.stage !== "lost";
}

export function contactProblem(lead: Pick<Lead, "doNotContact" | "contacts">, input: { channel: string; outcome: string }): string | null {
  if (!CHANNELS.has(input.channel)) return "Choose how you reached them.";
  if (!OUTCOMES.has(input.outcome)) return "Choose what happened.";
  if ((lead.contacts?.length ?? 0) >= MAX_CONTACTS_PER_LEAD) {
    return `This lead already has ${MAX_CONTACTS_PER_LEAD} contacts logged. Put anything new in its notes.`;
  }
  // Once someone asks not to be contacted, the only thing still recorded is that they asked.
  if (lead.doNotContact && input.outcome !== "asked_stop") {
    return "This person asked not to be contacted. The only thing to log now is \"Asked us to stop contacting them\".";
  }
  return null;
}

export interface ContactInput {
  channel: string;
  outcome: string;
  note?: string;
  countsAsStep?: boolean; // true when this touch is the next step of the running sequence
}

export type ContactPlan =
  | { ok: true; contact: LeadContact; patch: Partial<Lead> }
  | { ok: false; error: string };

// The contact to add and the lead fields it changes. The caller writes `patch` in one update.
export function logContactPlan(
  lead: Lead,
  input: ContactInput,
  at: number,
  by: { uid?: string; name?: string },
  newId: string,
): ContactPlan {
  const problem = contactProblem(lead, input);
  if (problem) return { ok: false, error: problem };

  const note = (input.note ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CONTACT_NOTE);
  const contact: LeadContact = {
    id: newId,
    at,
    channel: input.channel as LeadContactChannel,
    outcome: input.outcome as LeadContactOutcome,
    ...(note ? { note } : {}),
    ...(by.uid ? { byUid: by.uid } : {}),
    ...(by.name ? { byName: by.name } : {}),
  };

  const patch: Partial<Lead> = {
    contacts: [...(lead.contacts ?? []), contact],
    lastContactedAt: at,
    firstContactedAt: lead.firstContactedAt ?? at,
  };
  if (input.outcome === "asked_stop") patch.doNotContact = true;

  // A touch that counts as the sequence step moves the sequence on. The next step's date becomes the follow-up date.
  if (input.countsAsStep && lead.sequence && !patch.doNotContact && isOpenLead(lead)) {
    const seq = sequenceByKey(lead.sequence.key);
    if (seq && lead.sequence.doneSteps < seq.steps.length) {
      const done = lead.sequence.doneSteps + 1;
      patch.sequence = { ...lead.sequence, doneSteps: done };
      if (done < seq.steps.length) patch.nextFollowUpDate = addIsoDays(lead.sequence.startedOn, seq.steps[done].day);
    }
  }
  return { ok: true, contact, patch };
}

// ---------- speed to lead and the team's response ----------

export function speedToLeadMinutes(l: Pick<Lead, "createdAt" | "firstContactedAt">): number | null {
  if (typeof l.firstContactedAt !== "number" || typeof l.createdAt !== "number") return null;
  const mins = (l.firstContactedAt - l.createdAt) / 60000;
  return mins < 0 ? 0 : Math.round(mins);
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

// Median minutes from enquiry to first contact, over the leads that have been contacted; and how many new leads are
// still untouched after UNTOUCHED_HOURS. A do-not-contact lead is not counted as untouched: it must not be chased.
export function speedSummary(leads: Lead[], now: number): { measured: number; medianMinutes: number | null; untouched: number } {
  const mins = leads.map(speedToLeadMinutes).filter((m): m is number => m !== null);
  const cutoff = now - UNTOUCHED_HOURS * 3600000;
  const untouched = leads.filter(
    (l) => l.stage === "new" && typeof l.firstContactedAt !== "number" && !l.doNotContact && l.createdAt <= cutoff,
  ).length;
  return { measured: mins.length, medianMinutes: median(mins), untouched };
}

export interface OwnerRow {
  key: string; // the owner's uid, or "" for unassigned
  name: string;
  open: number; // open leads they own
  dueToday: number; // of those, follow-up due today or earlier
  contactsThisWeek: number; // contacts they logged in the last ACTIVITY_DAYS days
}

export function ownerSummary(leads: Lead[], now: number, today: string): OwnerRow[] {
  const rows = new Map<string, OwnerRow>();
  const row = (key: string, name: string): OwnerRow => {
    let r = rows.get(key);
    if (!r) {
      r = { key, name, open: 0, dueToday: 0, contactsThisWeek: 0 };
      rows.set(key, r);
    }
    return r;
  };
  const since = now - ACTIVITY_DAYS * 86400000;
  for (const l of leads) {
    if (isOpenLead(l)) {
      const r = row(l.ownerUid ?? "", l.ownerUid ? (l.ownerName ?? "Team member") : "Unassigned");
      r.open++;
      if (l.nextFollowUpDate && l.nextFollowUpDate <= today) r.dueToday++;
    }
    for (const c of l.contacts ?? []) {
      if (c.at < since) continue;
      // A contact with no author gets its own row, so it never merges with unassigned leads (key "").
      const key = c.byUid ?? "\u0000unknown";
      const r = row(key, c.byUid ? (c.byName ?? "Team member") : "Unknown");
      r.contactsThisWeek++;
    }
  }
  return [...rows.values()].sort((a, b) => b.open - a.open || b.contactsThisWeek - a.contactsThisWeek || a.name.localeCompare(b.name));
}

// ---------- follow-up sequences ----------

export interface SequenceStep {
  day: number; // days after the sequence starts
  channel: LeadContactChannel;
  templateId: string; // a lead message template (lib/messageTemplates.ts)
  label: string;
}

export const LEAD_SEQUENCES: { key: string; label: string; steps: SequenceStep[] }[] = [
  {
    key: "new_enquiry",
    label: "New enquiry: five touches over three weeks",
    steps: [
      { day: 0, channel: "call", templateId: "intro", label: "First contact: call or WhatsApp" },
      { day: 2, channel: "whatsapp", templateId: "follow_up", label: "Follow-up message" },
      { day: 5, channel: "call", templateId: "qualify", label: "Second call: ask what matters most" },
      { day: 10, channel: "email", templateId: "quote_chase", label: "Email with the next step" },
      { day: 21, channel: "whatsapp", templateId: "follow_up", label: "Last check-in before closing the lead" },
    ],
  },
];

export function sequenceByKey(key: string) {
  return LEAD_SEQUENCES.find((s) => s.key === key);
}

export type SequencePlan = { ok: true; patch: Partial<Lead> } | { ok: false; error: string };

export function startSequencePlan(lead: Lead, key: string, today: string): SequencePlan {
  const seq = sequenceByKey(key);
  if (!seq) return { ok: false, error: "That sequence doesn't exist." };
  if (!isOpenLead(lead)) return { ok: false, error: "Only an open lead can start a sequence." };
  if (lead.doNotContact) return { ok: false, error: "This person asked not to be contacted, so no sequence can run on them." };
  if (lead.sequence && lead.sequence.doneSteps < seq.steps.length) {
    return { ok: false, error: "A sequence is already running on this lead." };
  }
  const sequence: LeadSequenceState = { key, startedOn: today, doneSteps: 0 };
  return { ok: true, patch: { sequence, nextFollowUpDate: addIsoDays(today, seq.steps[0].day) } };
}

export type SequenceView =
  | { state: "stopped"; reason: string }
  | { state: "finished"; total: number }
  | { state: "due" | "upcoming"; step: SequenceStep; stepNumber: number; total: number; dueDate: string; daysLate: number };

// Where a lead's sequence stands today. Null when no sequence was ever started.
export function sequenceStatus(lead: Lead, today: string): SequenceView | null {
  if (!lead.sequence) return null;
  const seq = sequenceByKey(lead.sequence.key);
  if (!seq) return { state: "stopped", reason: "This sequence no longer exists." };
  if (!isOpenLead(lead)) return { state: "stopped", reason: "The lead is closed." };
  if (lead.doNotContact) return { state: "stopped", reason: "Do not contact is set." };
  const total = seq.steps.length;
  const done = lead.sequence.doneSteps;
  if (done >= total) return { state: "finished", total };
  const step = seq.steps[done];
  const dueDate = addIsoDays(lead.sequence.startedOn, step.day);
  const daysLate = Math.max(0, dayDiff(dueDate, today));
  return {
    state: dueDate <= today ? "due" : "upcoming",
    step,
    stepNumber: done + 1,
    total,
    dueDate,
    daysLate,
  };
}

// ---------- when deals are expected to close ----------

export type CloseBucket = "overdue" | "this_month" | "next_month" | "later" | "unset";
export const CLOSE_BUCKET_LABEL: Record<CloseBucket, string> = {
  overdue: "Expected close date has passed",
  this_month: "Expected to close this month",
  next_month: "Expected next month",
  later: "Expected later",
  unset: "No close date set",
};

// Open leads grouped by their expected close date, with the estimated value in each group. Read-only.
export function closeTiming(leads: Lead[], today: string): Record<CloseBucket, { count: number; value: number }> {
  const out: Record<CloseBucket, { count: number; value: number }> = {
    overdue: { count: 0, value: 0 },
    this_month: { count: 0, value: 0 },
    next_month: { count: 0, value: 0 },
    later: { count: 0, value: 0 },
    unset: { count: 0, value: 0 },
  };
  const thisMonth = monthOf(today);
  const nextMonth = monthOf(addIsoDays(`${thisMonth}-01`, 32).slice(0, 7) + "-01");
  for (const l of leads) {
    if (!isOpenLead(l)) continue;
    const v = typeof l.estValue === "number" && l.estValue > 0 ? l.estValue : 0;
    let bucket: CloseBucket;
    if (!l.expectedCloseDate) bucket = "unset";
    else if (l.expectedCloseDate < today) bucket = "overdue";
    else if (monthOf(l.expectedCloseDate) === thisMonth) bucket = "this_month";
    else if (monthOf(l.expectedCloseDate) === nextMonth) bucket = "next_month";
    else bucket = "later";
    out[bucket].count++;
    out[bucket].value += v;
  }
  for (const k of Object.keys(out) as CloseBucket[]) out[k].value = Math.round(out[k].value * 100) / 100;
  return out;
}

// ---------- lost leads to revisit ----------

// Lost leads whose revisit date has come, oldest first. Do-not-contact leads are never returned.
export function revisitDue(leads: Lead[], today: string): Lead[] {
  return leads
    .filter((l) => l.stage === "lost" && !!l.revisitOn && l.revisitOn <= today && !l.doNotContact)
    .sort((a, b) => (a.revisitOn ?? "").localeCompare(b.revisitOn ?? ""));
}

// ---------- where an online enquiry came from ----------

export const HOW_HEARD_OPTIONS = [
  "Google search",
  "Instagram",
  "Facebook",
  "TikTok",
  "WhatsApp",
  "Friend or family",
  "Walked past",
  "Other",
];

function cleanText(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  // Printable characters only; control characters and newlines are dropped.
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return t || undefined;
}

// The host of a referring page, e.g. "instagram.com". Only http and https addresses count; anything else is dropped.
export function referrerHost(v: unknown): string | undefined {
  if (typeof v !== "string" || !v) return undefined;
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return u.hostname.replace(/^www\./, "").slice(0, 120) || undefined;
  } catch {
    return undefined;
  }
}

export function attributionFor(input: {
  utm_source?: unknown;
  utm_campaign?: unknown;
  referrer?: unknown;
  howHeard?: unknown;
}): { campaign?: string; referrer?: string; howHeard?: string } {
  const source = cleanText(input.utm_source, 60);
  const campaign = cleanText(input.utm_campaign, 60);
  const joined = [source, campaign].filter(Boolean).join(" / ");
  const heard = cleanText(input.howHeard, 60);
  const out: { campaign?: string; referrer?: string; howHeard?: string } = {};
  if (joined) out.campaign = joined.slice(0, 120);
  const host = referrerHost(input.referrer);
  if (host) out.referrer = host;
  if (heard) out.howHeard = heard;
  return out;
}

// ---------- the filter chips above the active pipeline ----------

export type LeadFilter = "all" | "mine" | "unassigned" | "due" | "untouched";

export const LEAD_FILTER_LABEL: Record<LeadFilter, string> = {
  all: "All open",
  mine: "Mine",
  unassigned: "Unassigned",
  due: "Follow-up due",
  untouched: "Not contacted yet",
};

// Whether an open lead is in the chosen view. `uid` is the signed-in person (for "Mine").
export function matchesFilter(l: Lead, filter: LeadFilter, uid: string | undefined, today: string): boolean {
  switch (filter) {
    case "all": return true;
    case "mine": return !!uid && l.ownerUid === uid;
    case "unassigned": return !l.ownerUid;
    case "due": return !!l.nextFollowUpDate && l.nextFollowUpDate <= today;
    case "untouched": return l.stage === "new" && typeof l.firstContactedAt !== "number";
  }
}
