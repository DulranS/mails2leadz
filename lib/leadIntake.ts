// Lead intake (v176b): one set of rules for every way a lead comes in, so the website form, the lead API that Zapier, Make, n8n or
// a form tool calls, and manual entry all agree on what a phone number is, when a lead is already on file, who it goes to, and
// what the owner's automations do to it. Pure: no I/O. It runs in the browser (the Leads page, the key generator) and on the
// server (the enquiry route and the lead API route).
//
// Nothing here sends a message. An automation only sets fields: who the lead belongs to, when it is due, which sequence it is on.
// The person still makes the call or sends the message.
import type { AutomationSettings, Lead } from "./types";
import { MAX_CONTACT_NOTE, attributionFor, startSequencePlan } from "./leadPipeline";
import { addIsoDays } from "./leadPipeline";
import { validateQuietHours } from "./quietHours";

// The automations the owner can switch on or off (Integrations page). The defaults keep everything off except duplicate merging.
export const DEFAULT_AUTOMATIONS: Required<AutomationSettings> = {
  autoAssignInbound: false,
  autoFollowUpInbound: false,
  autoSequenceInbound: false,
  mergeDuplicateInbound: true,
  autoRevisitLostDays: 0,
  autoFollowUpAfterProposalDays: 0,
  defaultCountryCode: "",
  smsTimeZone: "",
  smsSendFromHour: 8,
  smsSendUntilHour: 20,
  outboundWebhookUrl: "",
  alertLowReviews: true,
  alertInspections: true,
  automationsPaused: false,
  alertActions: true,
  alertEscalations: true,
  alertCapacity: true,
  alertWeeklyReview: true,
  alertCycleCounts: true,
};

export const AUTOMATION_MAX_DAYS = 365;

// A webhook address the server will post to: https only, and never a private or local address (so it cannot be used to reach
// the server's own network). Empty means no webhook. Returns the problem to show, or null when the address is fine.
export function webhookUrlProblem(raw: string): string | null {
  if (!raw) return null;
  if (raw.length > 500) return "That webhook address is too long.";
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "That webhook address isn't valid. Paste the full address, starting with https://.";
  }
  if (u.protocol !== "https:") return "The webhook address must start with https://.";
  const h = u.hostname.toLowerCase();
  const local =
    h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.startsWith("[") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  if (local) return "The webhook address must be a public one, not a local or private network address.";
  return null;
}

// The automations in force. When the owner has paused automatic changes, the lead fields and the webhook push stay off until the owner
// turns the pause off; the alerts and the duplicate merging (which protects records) keep working.
export function resolveAutomations(a?: AutomationSettings | null): Required<AutomationSettings> {
  const r = { ...DEFAULT_AUTOMATIONS, ...(a ?? {}) } as Required<AutomationSettings>;
  if (r.automationsPaused) {
    return { ...r, autoAssignInbound: false, autoFollowUpInbound: false, autoSequenceInbound: false, autoRevisitLostDays: 0, autoFollowUpAfterProposalDays: 0, outboundWebhookUrl: "" };
  }
  return r;
}

export function validateAutomations(a: AutomationSettings): string | null {
  for (const k of ["autoRevisitLostDays", "autoFollowUpAfterProposalDays"] as const) {
    const v = a[k];
    if (v !== undefined && (!Number.isInteger(v) || v < 0 || v > AUTOMATION_MAX_DAYS)) {
      return `The number of days must be a whole number from 0 to ${AUTOMATION_MAX_DAYS}. 0 turns it off.`;
    }
  }
  const hook = webhookUrlProblem(a.outboundWebhookUrl ?? "");
  if (hook) return hook;
  const quiet = validateQuietHours({ smsTimeZone: a.smsTimeZone, smsSendFromHour: a.smsSendFromHour, smsSendUntilHour: a.smsSendUntilHour });
  if (quiet) return quiet;
  const cc = (a.defaultCountryCode ?? "").trim();
  if (cc && (!/^\d{1,4}$/.test(cc))) return "The country code is digits only, e.g. 94 for Sri Lanka or 1 for the US.";
  return null;
}

// ---------- the lead API key ----------

export const LEAD_API_KEY_PREFIX = "blk_";

// A new key: a recognisable prefix, then 40 random characters. Stored with the Integrations page's owner-only keys; shown once.
export function generateLeadApiKey(): string {
  const bytes = new Uint8Array(30);
  globalThis.crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 40);
  return `${LEAD_API_KEY_PREFIX}${body}`;
}

// The key from an Authorization: Bearer header (or an x-api-key header, for tools that cannot set Bearer). Null when neither is there.
export function readBearerKey(headers: { get(name: string): string | null }): string | null {
  const bearer = /^Bearer\s+(\S+)$/i.exec((headers.get("authorization") ?? "").trim());
  if (bearer) return bearer[1];
  const plain = (headers.get("x-api-key") ?? "").trim();
  return plain || null;
}

export function looksLikeLeadApiKey(key: string): boolean {
  return key.startsWith(LEAD_API_KEY_PREFIX) && key.length >= LEAD_API_KEY_PREFIX.length + 20 && key.length <= 200;
}

// ---------- phone and email ----------

// A phone number as digits with a leading +. "077 123 4567" with country code 94 becomes +94771234567; "+94 77 123 4567" and
// "0094771234567" give the same. Without a country code a local number (starting with 0) cannot be placed and is not matched:
// set the country code on the Integrations page to fix that. Undefined for anything that is not a plausible number.
export function normalizePhone(raw: unknown, defaultCountryCode = ""): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return undefined;
  const cc = defaultCountryCode.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    // already international
  } else if (trimmed.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    if (!cc) return undefined;
    digits = cc + digits.slice(1);
  } else if (cc && !digits.startsWith(cc) && digits.length <= 10) {
    digits = cc + digits; // a local number written without its leading 0
  }
  if (digits.length < 8 || digits.length > 15) return undefined;
  return `+${digits}`;
}

export function normalizeEmail(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : undefined;
}

// Match keys for a lead from a phone and an email the person gave: "p:+94…" and "e:name@example.com".
export function keysFromParts(phone: unknown, email: unknown, defaultCountryCode = ""): string[] {
  const keys: string[] = [];
  const p = normalizePhone(phone, defaultCountryCode);
  const e = normalizeEmail(email);
  if (p) keys.push(`p:${p}`);
  if (e) keys.push(`e:${e}`);
  return keys;
}

// Match keys read out of a lead's free-text contact field (what the website form and manual entry store).
export function contactKeysFor(contact: string | undefined | null, defaultCountryCode = ""): string[] {
  if (!contact) return [];
  const keys = new Set<string>();
  for (const m of contact.match(/[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}/g) ?? []) {
    const e = normalizeEmail(m);
    if (e) keys.add(`e:${e}`);
  }
  for (const m of contact.match(/\+?\d[\d\s().-]{6,}\d/g) ?? []) {
    const p = normalizePhone(m, defaultCountryCode);
    if (p) keys.add(`p:${p}`);
  }
  return [...keys];
}

// ---------- an inbound lead (website form or lead API) ----------

export interface InboundInput {
  name: string;
  contactText?: string; // a free-text contact line, when the form sends one (the website enquiry form does)
  phone?: string;
  email?: string;
  message?: string;
  source: string;
  campaign?: string;
  referrer?: string;
  howHeard?: string;
  consentToContact?: boolean;
  externalId?: string;
}

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

// Checks and cleans what a form or a calling tool sent. The errors are plain sentences a person can act on.
export function cleanInbound(
  body: Record<string, unknown>,
  defaultCountryCode = "",
  defaultSource = "Online form",
): { ok: true; value: InboundInput } | { ok: false; error: string } {
  const name = clean(body.name, 120);
  if (name.length < 2) return { ok: false, error: "A name is needed (at least two characters)." };
  const phoneRaw = clean(body.phone, 40);
  const emailRaw = clean(body.email, 254);
  const phone = phoneRaw ? normalizePhone(phoneRaw, defaultCountryCode) : undefined;
  const email = emailRaw ? normalizeEmail(emailRaw) : undefined;
  if (phoneRaw && !phone) return { ok: false, error: "That phone number doesn't look right. Include the country code, e.g. +94 77 123 4567." };
  if (emailRaw && !email) return { ok: false, error: "That email address doesn't look right." };
  if (!phone && !email) return { ok: false, error: "Give a phone number or an email so there is a way to reply." };
  const attribution = attributionFor({
    utm_source: body.utm_source,
    utm_campaign: body.utm_campaign ?? body.campaign,
    referrer: body.referrer,
    howHeard: body.howHeard,
  });
  const consent =
    typeof body.consentToContact === "boolean" ? body.consentToContact : typeof body.consent === "boolean" ? body.consent : undefined;
  return {
    ok: true,
    value: {
      name,
      phone: phoneRaw || undefined,
      email: email ?? undefined,
      message: clean(body.message, 1000) || undefined,
      source: clean(body.source, 60) || defaultSource,
      campaign: attribution.campaign,
      referrer: attribution.referrer,
      howHeard: attribution.howHeard,
      consentToContact: consent,
      externalId: clean(body.externalId, 120) || undefined,
    },
  };
}

export function contactTextFor(input: { contactText?: string; phone?: string; email?: string }): string {
  return input.contactText?.trim() || [input.phone, input.email].filter(Boolean).join(" · ");
}

export interface MemberLike {
  uid: string;
  name: string;
  role: string;
  active: boolean;
}

// The operating member with the fewest open leads (ties by name). The accountant never owns leads.
export function chooseOwner(members: MemberLike[], openCountByUid: Record<string, number>): MemberLike | undefined {
  const eligible = members.filter((m) => m.active && (m.role === "owner" || m.role === "manager" || m.role === "staff"));
  if (eligible.length === 0) return undefined;
  return [...eligible].sort((a, b) => (openCountByUid[a.uid] ?? 0) - (openCountByUid[b.uid] ?? 0) || a.name.localeCompare(b.name))[0];
}

// How many open leads each person owns, from a list of leads.
export function openCountsByOwner(leads: { ownerUid?: string; stage: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of leads) {
    if (!l.ownerUid || l.stage === "won" || l.stage === "lost") continue;
    out[l.ownerUid] = (out[l.ownerUid] ?? 0) + 1;
  }
  return out;
}

// The lead document for a new inbound lead, with the automations applied. Fields without a value are left out.
export function inboundLeadDoc(
  input: InboundInput,
  opts: {
    now: number;
    today: string;
    automations: Required<AutomationSettings>;
    owner?: { uid: string; name: string };
    createdByName: string;
    contactKeys: string[];
  },
): Record<string, unknown> {
  const a = opts.automations;
  const contact = contactTextFor(input);
  const fields: Record<string, unknown> = {
    name: input.name,
    contact,
    source: input.source,
    stage: "new",
    contactKeys: opts.contactKeys,
    createdByName: opts.createdByName,
    createdAt: opts.now,
    ...(input.message ? { notes: input.message.slice(0, MAX_CONTACT_NOTE * 4) } : {}),
    ...(input.campaign ? { campaign: input.campaign } : {}),
    ...(input.referrer ? { referrer: input.referrer } : {}),
    ...(input.howHeard ? { howHeard: input.howHeard } : {}),
    ...(input.externalId ? { externalId: input.externalId } : {}),
    ...(typeof input.consentToContact === "boolean" ? { consentToContact: input.consentToContact } : {}),
  };
  if (a.autoAssignInbound && opts.owner) {
    fields.ownerUid = opts.owner.uid;
    fields.ownerName = opts.owner.name;
  }
  if (a.autoFollowUpInbound) fields.nextFollowUpDate = opts.today;
  if (a.autoSequenceInbound) {
    const lead = { id: "", name: input.name, contact, stage: "new", source: input.source, createdAt: opts.now } as Lead;
    const plan = startSequencePlan(lead, "new_enquiry", opts.today);
    if (plan.ok) Object.assign(fields, plan.patch);
  }
  return fields;
}

// A repeat enquiry added to the lead already on file: the message is added to its notes with the date. Nothing else changes.
export function mergedNotes(existing: string | undefined, add: { message?: string; source: string }, dayIso: string): string {
  const line = `${dayIso}, came in again (${add.source})${add.message ? `: ${add.message}` : "."}`;
  return (existing ? `${existing}\n${line}` : line).slice(-4000);
}

// Which existing lead (if any) shares a contact key with the new one.
export function findDuplicateId(existing: { id: string; contactKeys?: string[] }[], keys: string[]): string | undefined {
  if (keys.length === 0) return undefined;
  const wanted = new Set(keys);
  return existing.find((l) => (l.contactKeys ?? []).some((k) => wanted.has(k)))?.id;
}

// A follow-up date a number of days after today, or undefined when the automation is off.
export function followUpAfter(today: string, days: number): string | undefined {
  return days > 0 ? addIsoDays(today, days) : undefined;
}

// The shape of a lead a calling tool may read: what it needs to post or sort a lead. Notes and the contact log stay private.
export function publicLead(id: string, d: Record<string, unknown>) {
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : undefined);
  const n = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : undefined);
  return {
    id,
    name: s("name") ?? "",
    contact: s("contact"),
    stage: s("stage") ?? "new",
    source: s("source"),
    campaign: s("campaign"),
    referrer: s("referrer"),
    howHeard: s("howHeard"),
    ownerName: s("ownerName"),
    estValue: n("estValue"),
    expectedCloseDate: s("expectedCloseDate"),
    nextFollowUpDate: s("nextFollowUpDate"),
    externalId: s("externalId"),
    consentToContact: typeof d.consentToContact === "boolean" ? (d.consentToContact as boolean) : undefined,
    createdAt: n("createdAt") ?? 0,
  };
}
