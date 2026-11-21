// Verifies computeLeadConversion (lib/calculations.ts) — the lead
// win-rate / lead-to-customer conversion KPI surfaced on the Leads page
// and the Business health page's Customer acquisition section.
//
// Run: npx tsx scripts/verify-lead-conversion.ts

import { computeLeadConversion } from "../lib/calculations";
import type { Lead } from "../lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

const DAY = 24 * 60 * 60 * 1000;
const ASOF = "2026-09-25";
const asOfMs = new Date(ASOF).getTime();

let seq = 0;
function lead(overrides: Partial<Lead>): Lead {
  seq += 1;
  return {
    id: `l${seq}`,
    name: `Lead ${seq}`,
    stage: "new",
    createdAt: asOfMs,
    ...overrides,
  };
}

// --- empty state: no leads at all -------------------------------------
{
  const r = computeLeadConversion([], ASOF, 6);
  assert(r.totalLeads === 0, "no leads => totalLeads 0");
  assert(r.winRatePct === null, "no leads => winRatePct null, not 0%");
  assert(r.conversionRatePct === null, "no leads => conversionRatePct null, not 0%");
  assert(r.bySource.length === 0, "no leads => empty bySource");
}

// --- basic win/lost/open split -----------------------------------------
{
  const leads: Lead[] = [
    lead({ stage: "won" }),
    lead({ stage: "won" }),
    lead({ stage: "lost" }),
    lead({ stage: "contacted" }), // still open
  ];
  const r = computeLeadConversion(leads, ASOF, 6);
  assert(r.totalLeads === 4, "4 leads created in window => totalLeads 4");
  assert(r.wonLeads === 2 && r.lostLeads === 1 && r.openLeads === 1, "2 won, 1 lost, 1 open");
  assert(r.winRatePct === (2 / 3) * 100, "winRate = won / (won+lost) = 66.7%, open leads excluded");
  assert(r.conversionRatePct === (2 / 4) * 100, "conversionRate = won / all leads = 50%, open leads count against it");
}

// --- open-only leads: winRate null, conversionRate is not ---------------
{
  const leads: Lead[] = [lead({ stage: "new" }), lead({ stage: "proposal_sent" })];
  const r = computeLeadConversion(leads, ASOF, 6);
  assert(r.winRatePct === null, "nothing decided yet => winRatePct null (not 0%)");
  assert(r.conversionRatePct === 0, "conversionRate is a real 0% when there are leads but none won yet");
}

// --- window boundary: createdAt outside the window is excluded ---------
{
  const inWindow = lead({ stage: "won", createdAt: asOfMs - 30 * DAY });
  const justOutside = lead({ stage: "won", createdAt: asOfMs - 6 * 30 * DAY - DAY });
  const r = computeLeadConversion([inWindow, justOutside], ASOF, 6);
  assert(r.totalLeads === 1, "a lead created just before the 6mo window start is excluded");
}

// --- bySource: label + fallback + per-source win rate -------------------
{
  const leads: Lead[] = [
    lead({ stage: "won", source: "Referral" }),
    lead({ stage: "lost", source: "Referral" }),
    lead({ stage: "won", source: "Facebook" }),
    lead({ stage: "won", source: "Facebook" }),
    lead({ stage: "new" }), // no source
  ];
  const r = computeLeadConversion(leads, ASOF, 6);
  const bySource = new Map(r.bySource.map((s) => [s.source, s]));
  assert(bySource.get("Referral")?.winRatePct === 50, "Referral: 1 won of 2 decided = 50%");
  assert(bySource.get("Facebook")?.winRatePct === 100, "Facebook: 2 won of 2 decided = 100%");
  assert(bySource.get("Not recorded")?.totalLeads === 1, "a lead with no source falls into 'Not recorded'");
  assert(bySource.get("Not recorded")?.winRatePct === null, "'Not recorded' has nothing decided => null, not 0%");
  assert(
    r.bySource[0].source === "Referral" && r.bySource[0].totalLeads === 2,
    "bySource sorted by lead count, highest first (Referral and Facebook tie at 2, Referral logged first)"
  );
}

// --- a lead that's merely marked "won" still counts, converted or not ---
{
  // Win rate is about the pipeline decision (stage), not the separate
  // "Convert to customer" click that comes after — a won lead nobody's
  // converted yet should still count as won here.
  const r = computeLeadConversion([lead({ stage: "won" })], ASOF, 6);
  assert(r.wonLeads === 1, "a won lead counts even before convertedToCustomerAt is set");
}

if (process.exitCode === 1) {
  console.error("\nSOME CHECKS FAILED");
} else {
  console.log("\nALL CHECKS PASSED");
}
