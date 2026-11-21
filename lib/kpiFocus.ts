// Dashboard focus (v234b): a management dashboard works best with five to seven measures, and needs both kinds: leading measures that predict
// results (orders in progress, calls made) and lagging measures that record them (revenue, cash collected). Pure: no I/O.

export const FOCUS_MIN = 5;
export const FOCUS_MAX = 7;
export const KPI_TIMINGS = ["leading", "lagging"] as const;

export function focusCheck(kpis: { timing?: string }[]) {
  const count = kpis.length;
  const leading = kpis.filter((k) => k.timing === "leading").length;
  const lagging = kpis.filter((k) => k.timing === "lagging").length;
  const unclassified = count - leading - lagging;
  const sizeStatus: "none" | "too_few" | "ok" | "too_many" = count === 0 ? "none" : count < FOCUS_MIN ? "too_few" : count > FOCUS_MAX ? "too_many" : "ok";
  const messages: string[] = [];
  if (sizeStatus === "too_few") messages.push(`Add ${FOCUS_MIN - count} more to reach ${FOCUS_MIN}.`);
  if (sizeStatus === "too_many") messages.push(`Keep to ${FOCUS_MAX}: put the rest in a second review.`);
  if (count > 0 && (leading === 0 || lagging === 0)) messages.push(leading === 0 ? "No leading measure yet: something that predicts the results." : "No lagging measure yet: something that records the results.");
  if (unclassified > 0) messages.push(`${unclassified} measure${unclassified === 1 ? " has" : "s have"} no leading or lagging label.`);
  return { count, leading, lagging, unclassified, sizeStatus, balanced: leading > 0 && lagging > 0, messages };
}
