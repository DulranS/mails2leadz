// Does the open pipeline cover what is still needed this month?
//
// A pipeline that only just equals the target is a pipeline that will miss it: most leads are not won. The usual rule of
// thumb is to hold about three times what you still need. This divides the open leads' estimated value (the best case the
// Leads page already shows) by the revenue still to be earned this month toward the month's own revenue target (the one set
// on Statements > Budget). Both numbers already exist; this only relates them. Read-only: nothing is stored or changed.
//
// Said plainly on the page: leads carry no expected close date, so this compares ALL open leads with THIS month's gap. It is a
// "is there enough in the funnel" check, not a forecast of what will close this month.

export const HEALTHY_COVERAGE = 3;

export type CoverageLevel = "healthy" | "thin" | "short";

export interface PipelineCoverage {
  target: number; // this month's revenue target
  bookedSoFar: number; // revenue already booked this month (never below 0)
  stillNeeded: number; // target less booked, always above 0 here
  pipeline: number; // sum of the open leads' estimated values
  coverage: number; // pipeline / stillNeeded, one decimal
  level: CoverageLevel; // healthy at 3x or more, thin from 1x, short below 1x (cannot cover it even if every lead closed)
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function pipelineCoverage(
  openLeadValues: (number | null | undefined)[],
  revenueTarget: number | null | undefined,
  revenueSoFar: number | null | undefined
): PipelineCoverage | null {
  if (typeof revenueTarget !== "number" || !Number.isFinite(revenueTarget) || revenueTarget <= 0) return null;
  const booked = typeof revenueSoFar === "number" && Number.isFinite(revenueSoFar) ? Math.max(0, revenueSoFar) : 0;
  const stillNeeded = revenueTarget - booked;
  if (stillNeeded <= 0.005) return null; // the target is already met: nothing to cover

  let pipeline = 0;
  let valued = 0;
  for (const v of openLeadValues) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      pipeline += v;
      valued++;
    }
  }
  if (valued === 0) return null; // open leads with no value entered: cannot say anything

  const ratio = pipeline / stillNeeded;
  return {
    target: round2(revenueTarget),
    bookedSoFar: round2(booked),
    stillNeeded: round2(stillNeeded),
    pipeline: round2(pipeline),
    coverage: Math.round(ratio * 10) / 10,
    level: ratio >= HEALTHY_COVERAGE ? "healthy" : ratio >= 1 ? "thin" : "short",
  };
}
