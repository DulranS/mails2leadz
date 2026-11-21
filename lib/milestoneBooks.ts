// Progress-billing milestones are a tracker: marking one "invoiced" or "paid" posts nothing to revenue,
// receivables or cash (see ProjectMilestone in lib/types.ts). The books only move when a sale tagged to the
// project is recorded. This compares the two and reports what the schedule says was billed that no recorded
// sale covers yet. Read-only; it changes no figure and posts nothing.
//
// Tax: a milestone amount may be quoted with or without sales tax, and the schedule does not say which. So the
// comparison is made against the project's sales both before and after tax, and only the larger counts as
// "covered". A gap is therefore never an artefact of tax, only of a sale that is genuinely missing (or short).

export interface MilestoneBooksGap {
  billedOnSchedule: number; // milestones marked invoiced or paid
  recordedNet: number; // sales tagged to the project, before tax
  recordedGross: number; // the same, with the tax charged on them
  notInBooks: number; // billed on the schedule, beyond what any recorded sale covers (0 when covered)
}

// Smaller than this is rounding, not a missing sale.
export const MILESTONE_GAP_TOLERANCE = 1;

export function milestoneBooksGap(
  billedOnSchedule: number,
  sales: { unitPrice: number; qty: number; taxAmount?: number }[]
): MilestoneBooksGap {
  let net = 0;
  let tax = 0;
  for (const s of sales) {
    const n = s.unitPrice * s.qty;
    if (Number.isFinite(n)) net += n;
    if (typeof s.taxAmount === "number" && Number.isFinite(s.taxAmount)) tax += s.taxAmount;
  }
  const billed = Number.isFinite(billedOnSchedule) && billedOnSchedule > 0 ? billedOnSchedule : 0;
  const gross = net + tax;
  const covered = Math.max(net, gross);
  const gap = billed - covered;
  return {
    billedOnSchedule: billed,
    recordedNet: net,
    recordedGross: gross,
    notInBooks: gap > MILESTONE_GAP_TOLERANCE ? gap : 0,
  };
}
