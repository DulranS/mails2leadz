// Red, amber, green for a KPI (v196b): green when the latest reading meets the target; amber when it misses by no more than the amber
// band (a share of the target, 10% by default, set per KPI); red beyond that. Nothing is shown for a KPI with no reading. Pure.
import { kpiStatus } from "./operations";
import type { KpiReading } from "./operations";

export const DEFAULT_AMBER_PCT = 10;
export type Rag = "green" | "amber" | "red" | "none";

export function kpiRag(kpi: { target: number; direction: "higher" | "lower"; amberPct?: number; readings?: KpiReading[] }): { rag: Rag; latest?: number } {
  const s = kpiStatus(kpi);
  if (!s.latest) return { rag: "none" };
  if (s.onTarget) return { rag: "green", latest: s.latest.value };
  const band = Math.abs(kpi.target) * ((kpi.amberPct ?? DEFAULT_AMBER_PCT) / 100);
  const miss = kpi.direction === "higher" ? kpi.target - s.latest.value : s.latest.value - kpi.target;
  const within = band === 0 ? false : miss <= band;
  return { rag: within ? "amber" : "red", latest: s.latest.value };
}
