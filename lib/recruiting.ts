// Recruiting (v230): every candidate for a role moves through a set of stages, and the business can see where each one is, how long hiring
// takes, who has been waiting too long, and which hires have not yet been onboarded. Pure: no I/O. Stage moves are recorded with their dates,
// so time to hire is measured, not estimated.

export const CANDIDATE_STAGES = ["applied", "interview", "offer", "hired", "rejected"] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];
export const STAGE_LABEL: Record<CandidateStage, string> = { applied: "Applied", interview: "Interview", offer: "Offer made", hired: "Hired", rejected: "Not taken forward" };
export const STALE_AFTER_DAYS = 14;

export interface Candidate {
  id: string;
  name: string;
  role: string;
  source?: string;
  contact?: string;
  stage: CandidateStage;
  stageDates: Partial<Record<CandidateStage, string>>; // the day each stage was reached
  onboardingStarted?: boolean;
  notes?: string;
  // Checks before a hire: the fact and the day it was done. ID numbers and documents are never stored here.
  checks?: { referencesCheckedOn?: string; rightToWorkCheckedOn?: string };
}

const DAY = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(Date.parse(`${s}T00:00:00Z`)).toISOString().slice(0, 10) === s;

export function validateCandidate(i: { name: string; role: string; appliedOn: string }, today: string): string | null {
  if (!i.name || i.name.trim().length < 2) return "Who applied? Enter the candidate's name.";
  if (!i.role || i.role.trim().length < 2) return "Which role is this for?";
  if (!isDay(i.appliedOn) || i.appliedOn > today) return "The day they applied must be a real day, not in the future.";
  return null;
}

// Move a candidate to a stage. Moving on keeps the earlier stage dates; the day reached is recorded once. Rejecting does not erase the path.
export function moveStage(c: Candidate, to: CandidateStage, today: string): Candidate {
  if (c.stage === to) return c;
  if (c.stage === "hired" || c.stage === "rejected") return c; // a closed outcome is not reopened here
  const stageDates = { ...c.stageDates };
  if (!stageDates[to]) stageDates[to] = today;
  return { ...c, stage: to, stageDates };
}

// Days from applying to being hired, for hired candidates.
export function timeToHireDays(c: Candidate): number | null {
  if (c.stage !== "hired" || !c.stageDates.hired || !c.stageDates.applied) return null;
  return days(c.stageDates.applied, c.stageDates.hired);
}

export function pipelineSummary(candidates: Candidate[], today: string) {
  const open = candidates.filter((c) => c.stage !== "hired" && c.stage !== "rejected");
  const counts = Object.fromEntries(CANDIDATE_STAGES.map((s) => [s, candidates.filter((c) => c.stage === s).length])) as Record<CandidateStage, number>;
  const hires = candidates.filter((c) => c.stage === "hired");
  const times = hires.map(timeToHireDays).filter((d): d is number => d !== null);
  const stale = open
    .map((c) => {
      const since = c.stageDates[c.stage] ?? c.stageDates.applied ?? today;
      return { candidate: c, daysInStage: days(since, today) };
    })
    .filter((x) => x.daysInStage >= STALE_AFTER_DAYS)
    .sort((a, b) => b.daysInStage - a.daysInStage);
  return {
    open: open.length,
    counts,
    averageTimeToHireDays: times.length ? Math.round((times.reduce((t, x) => t + x, 0) / times.length) * 10) / 10 : null,
    stale,
    awaitingOnboarding: hires.filter((c) => !c.onboardingStarted),
  };
}

// A hire needs both checks recorded, on a day that has come. Returns the reason it cannot be made yet, or null.
export function hireProblem(c: Candidate, today: string): string | null {
  const refs = c.checks?.referencesCheckedOn, rtw = c.checks?.rightToWorkCheckedOn;
  if (!refs || refs > today) return "Record that references have been checked before hiring.";
  if (!rtw || rtw > today) return "Record that the right to work has been checked before hiring.";
  return null;
}
