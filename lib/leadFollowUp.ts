// Two pipeline conveniences, both pure. Neither records money, sends anything or changes a stage on its own.
//
// 1. A lead moved to a working stage with no follow-up date gets a default date, so it does not drop out of the follow-up view.
//    The owner can change or clear it at any time, and a date already set is never overwritten.
// 2. A possible duplicate: a lead or customer with the same name or the same phone or email. Shown as a warning on the lead form,
//    never a block, because two people can share a name.
import { addDays } from "./playbook";
import type { Customer, Lead, LeadStage } from "./types";

// Days after the stage change that the next follow-up is due. Stages not listed get no default.
const FOLLOW_UP_DAYS: Partial<Record<LeadStage, number>> = {
  contacted: 3,
  follow_up: 3,
  proposal_sent: 5,
};

export function defaultFollowUpFor(stage: LeadStage, currentDate: string | undefined, today: string): string | undefined {
  if (currentDate) return undefined;
  const days = FOLLOW_UP_DAYS[stage];
  return days === undefined ? undefined : addDays(today, days);
}

export const normalizeName = (s: string | undefined | null): string => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

// Phone numbers compare by their last nine digits, the national number, so "077 123 4567" and "+94 77 123 4567" are one number.
// Emails compare as typed, ignoring case. Anything shorter than seven digits is not compared.
export function contactKey(contact: string | undefined | null): string {
  const c = (contact ?? "").trim().toLowerCase();
  if (!c) return "";
  if (c.includes("@")) return c;
  const digits = c.replace(/\D/g, "");
  if (digits.length < 7) return "";
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

export interface PossibleDuplicate {
  kind: "lead" | "customer";
  name: string;
  reason: "name" | "contact";
}

export function findPossibleDuplicates(
  name: string,
  contact: string | undefined,
  leads: Lead[],
  customers: Customer[],
  excludeLeadId?: string,
): PossibleDuplicate[] {
  const n = normalizeName(name);
  const k = contactKey(contact);
  if (!n && !k) return [];
  const out: PossibleDuplicate[] = [];
  const check = (kind: "lead" | "customer", other: { name: string; contact?: string }) => {
    if (n && normalizeName(other.name) === n) out.push({ kind, name: other.name, reason: "name" });
    else if (k && contactKey(other.contact) === k) out.push({ kind, name: other.name, reason: "contact" });
  };
  for (const l of leads) if (l.id !== excludeLeadId) check("lead", l);
  for (const c of customers) check("customer", c);
  return out.slice(0, 5);
}
