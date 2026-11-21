// Risk management and quality (v177e), from the business framework: risk, security & insurance (24, with business continuity as a
// category) and quality management (14, with corrective actions under 29). Pure: no I/O; the caller passes `today`.
// Nothing here posts to the books, moves stock or contacts anyone.
import { isIsoDay, dayDiff } from "./operations";

export const MAX_RISK_TEXT = 1000;
export const RISK_CATEGORIES: { value: string; label: string }[] = [
  { value: "financial", label: "Financial (cash, debtors, price, interest)" },
  { value: "operational", label: "Operational (delivery, capacity, equipment)" },
  { value: "supply", label: "Supply (suppliers, stock, prices)" },
  { value: "people", label: "People (staff leaving, skills, safety)" },
  { value: "it_cyber", label: "IT and cyber (systems, data, access)" },
  { value: "legal", label: "Legal and regulatory (licences, contracts, tax)" },
  { value: "reputation", label: "Reputation (customers, reviews, complaints)" },
  { value: "continuity", label: "Business continuity (what to do if the normal way fails)" },
  { value: "other", label: "Other" },
];
export const RISK_STATUSES: { value: string; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "mitigated", label: "Mitigated" },
  { value: "accepted", label: "Accepted (knowingly kept)" },
  { value: "closed", label: "Closed" },
];

export interface RiskInput {
  title: string;
  category: string;
  likelihood: number; // 1 rare to 5 almost certain
  impact: number; // 1 minor to 5 severe
  description?: string;
  mitigation?: string;
  ownerName?: string;
  reviewOn?: string;
  status: string;
}

export function validateRisk(i: RiskInput): string | null {
  if (!i.title || i.title.trim().length < 2) return "Name the risk in a few words.";
  if (!RISK_CATEGORIES.some((c) => c.value === i.category)) return "Choose what kind of risk this is.";
  if (!Number.isInteger(i.likelihood) || i.likelihood < 1 || i.likelihood > 5) return "Likelihood is a whole number from 1 (rare) to 5 (almost certain).";
  if (!Number.isInteger(i.impact) || i.impact < 1 || i.impact > 5) return "Impact is a whole number from 1 (minor) to 5 (severe).";
  if (!RISK_STATUSES.some((s) => s.value === i.status)) return "Choose the status.";
  if (i.reviewOn && !isIsoDay(i.reviewOn)) return "The review date is not a valid date.";
  if ((i.description ?? "").length > MAX_RISK_TEXT || (i.mitigation ?? "").length > MAX_RISK_TEXT) return `Keep each note under ${MAX_RISK_TEXT} characters.`;
  return null;
}

// Likelihood times impact, 1 to 25.
export function riskScore(likelihood: number, impact: number): number {
  return likelihood * impact;
}

export type RiskBand = "high" | "medium" | "low";
export function riskBand(score: number): RiskBand {
  if (score >= 15) return "high";
  if (score >= 8) return "medium";
  return "low";
}

// An open risk whose review date has passed needs looking at again. Mitigated, accepted and closed risks are not chased.
export function riskReviewDue(r: { status: string; reviewOn?: string }, today: string): boolean {
  return (r.status === "open") && !!r.reviewOn && r.reviewOn < today;
}

export function riskSummary(risks: { likelihood: number; impact: number; status: string; reviewOn?: string }[], today: string) {
  let open = 0, high = 0, reviewDue = 0;
  for (const r of risks) {
    if (r.status !== "open") continue;
    open++;
    if (riskBand(riskScore(r.likelihood, r.impact)) === "high") high++;
    if (riskReviewDue(r, today)) reviewDue++;
  }
  return { open, high, reviewDue, total: risks.length };
}

// ---------- quality checks and corrective actions ----------

export const QUALITY_AREAS: { value: string; label: string }[] = [
  { value: "product", label: "Product" },
  { value: "service", label: "Service" },
  { value: "production", label: "Production batch" },
  { value: "delivery", label: "Delivery or goods received" },
  { value: "complaint", label: "Customer complaint" },
  { value: "other", label: "Other" },
];
export const QUALITY_RESULTS: { value: string; label: string }[] = [
  { value: "pass", label: "Pass" },
  { value: "conditional", label: "Pass with a note" },
  { value: "fail", label: "Fail" },
];

export interface QualityInput {
  title: string;
  date: string;
  area: string;
  result: string;
  defectsFound?: number;
  defectNote?: string;
  correctiveAction?: string;
  actionOwner?: string;
  actionDueOn?: string;
}

export function validateQualityCheck(i: QualityInput): string | null {
  if (!i.title || i.title.trim().length < 2) return "Say what was checked.";
  if (!isIsoDay(i.date)) return "Choose the date of the check.";
  if (!QUALITY_AREAS.some((a) => a.value === i.area)) return "Choose what kind of check this was.";
  if (!QUALITY_RESULTS.some((r) => r.value === i.result)) return "Choose the result.";
  if (i.defectsFound !== undefined && (!Number.isInteger(i.defectsFound) || i.defectsFound < 0 || i.defectsFound > 100000)) return "Defects found is a whole number, zero or more.";
  if (i.result === "fail" && !i.defectNote?.trim()) return "A failed check needs a note of what was wrong.";
  if (i.actionDueOn && !isIsoDay(i.actionDueOn)) return "The action due date is not a valid date.";
  if (i.actionDueOn && i.actionDueOn < i.date) return "The action can't be due before the check.";
  if ((i.defectNote ?? "").length > MAX_RISK_TEXT || (i.correctiveAction ?? "").length > MAX_RISK_TEXT) return `Keep each note under ${MAX_RISK_TEXT} characters.`;
  return null;
}

// A corrective action is open when one is written and nothing marks it done.
export function correctiveActionOpen(q: { correctiveAction?: string; actionDoneOn?: string }): boolean {
  return !!q.correctiveAction?.trim() && !q.actionDoneOn;
}

// Share of checks passed in the last `days` days (pass with a note counts as pass), and corrective actions still open.
export function qualitySummary(checks: { date: string; result: string; correctiveAction?: string; actionDoneOn?: string }[], today: string, days = 30) {
  const window = checks.filter((c) => {
    const ago = dayDiff(c.date, today);
    return ago >= 0 && ago <= days;
  });
  const passed = window.filter((c) => c.result === "pass" || c.result === "conditional").length;
  return {
    checks: window.length,
    passRate: window.length === 0 ? null : Math.round((passed / window.length) * 1000) / 10,
    openActions: checks.filter(correctiveActionOpen).length,
    days,
  };
}

// Closing a corrective action: the date done must be a real day on or after the check.
export function closeActionProblem(check: { date: string }, doneOn: string): string | null {
  if (!isIsoDay(doneOn)) return "Choose the day the action was done.";
  if (doneOn < check.date) return "The action can't be done before the check it came from.";
  return null;
}
