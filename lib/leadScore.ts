// Lead score (v177b): a transparent 0 to 100 score for how worth working a lead is now, with the reasons listed so anyone can
// check it. No model, no outside data: every point comes from a fact already on the lead. Pure: the caller passes the day.
import { contactKeysFor } from "./leadIntake";
import type { Lead } from "./types";

const STAGE_POINTS: Record<string, number> = { new: 5, contacted: 10, qualified: 20, follow_up: 15, proposal_sent: 25 };

export interface LeadScore {
  score: number;
  reasons: string[];
}

export function leadScore(l: Lead & { consentToContact?: boolean }, today: string, nowMs: number, defaultCountryCode = ""): LeadScore {
  if (l.stage === "won" || l.stage === "lost") return { score: 0, reasons: ["Closed"] };
  if (l.doNotContact) return { score: 0, reasons: ["Asked not to be contacted"] };

  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, why: string) => {
    score += points;
    reasons.push(`${points >= 0 ? "+" : ""}${points} ${why}`);
  };

  // Can we reach them? A phone and an email each count.
  const keys = contactKeysFor(l.contact, defaultCountryCode);
  const hasPhone = keys.some((k) => k.startsWith("p:"));
  const hasEmail = keys.some((k) => k.startsWith("e:"));
  if (hasPhone || hasEmail) add(hasPhone && hasEmail ? 15 : 10, hasPhone && hasEmail ? "phone and email" : hasPhone ? "phone number" : "email address");

  // How far along.
  add(STAGE_POINTS[l.stage] ?? 0, `stage: ${l.stage.replace("_", " ")}`);

  // A value estimated.
  if (typeof l.estValue === "number" && l.estValue > 0) add(10, "a value is estimated");

  // Talking to them so far.
  const contacts = l.contacts ?? [];
  if (contacts.length >= 2) add(10, "two or more contacts logged");
  else if (contacts.length === 1) add(5, "one contact logged");
  if (contacts.some((c) => c.outcome === "spoke" || c.outcome === "meeting_set")) add(10, "spoke with them or a meeting is agreed");

  // Recency of the last contact.
  if (typeof l.lastContactedAt === "number") {
    const days = Math.floor((nowMs - l.lastContactedAt) / 86_400_000);
    if (days <= 7) add(10, "contacted in the last week");
    else if (days <= 30) add(5, "contacted in the last month");
  }

  // Consent and timing.
  if (l.consentToContact === true) add(5, "agreed to be contacted");
  if (l.expectedCloseDate && l.expectedCloseDate >= today && dayGap(today, l.expectedCloseDate) <= 30) add(10, "expected to close within 30 days");
  if (l.nextFollowUpDate && l.nextFollowUpDate < today) add(-5, "follow-up is overdue");

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

function dayGap(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
