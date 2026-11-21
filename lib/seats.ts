// Advisory seat check: is an account using more logins than its plan was built for?
//
// Plans never gate features (see lib/pricing.ts), so the only way a small plan can quietly carry a
// big team is by inviting people. This does NOT block anything: it only tells the operator, in the
// admin console, so the upgrade conversation happens on purpose. Unknown plan, a plan with no stated
// number, or an unknown count all mean "no flag", never a guess.
import { tierById } from "./pricing";

export interface SeatCheck {
  used: number;
  guide: number | null;
  over: boolean;
}

export function seatCheck(plan: string | null | undefined, activeLogins: number | null | undefined): SeatCheck | null {
  if (activeLogins == null || !Number.isFinite(activeLogins) || activeLogins < 0) return null;
  const guide = tierById(plan)?.seatGuide ?? null;
  return { used: activeLogins, guide, over: guide != null && activeLogins > guide };
}
