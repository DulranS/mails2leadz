// Why leads are lost: the reasons typed on Lost leads, counted, most common first. Pure: no I/O.
// Reasons match ignoring case and spacing, so "Price" and " price " are one reason. A lost lead with no reason is counted as "No reason given".
import type { Lead } from "./types";

export const NO_REASON = "No reason given";

export function lostReasonCounts(leads: Lead[]): { reason: string; count: number }[] {
  const groups = new Map<string, { reason: string; count: number }>();
  for (const l of leads) {
    if (l.stage !== "lost") continue;
    const shown = (l.lostReason ?? "").trim().replace(/\s+/g, " ");
    const label = shown || NO_REASON;
    const key = label.toLowerCase();
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { reason: label, count: 1 });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}
