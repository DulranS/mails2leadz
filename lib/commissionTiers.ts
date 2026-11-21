// Commission tiers (v239): the rate rises with the share of the monthly sales target a person achieves. Each tier says "from this share of target,
// this rate". The highest tier reached sets the rate. With no tiers, or no target set, the person's single rate applies exactly as before. Pure.

export interface CommissionTier { fromPct: number; pct: number } // fromPct: % of the monthly target reached; pct: commission % at that level

export function validateTiers(tiers: CommissionTier[]): string | null {
  if (tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.fromPct - b.fromPct);
  if (sorted.some((t) => !Number.isFinite(t.fromPct) || t.fromPct < 0 || t.fromPct > 1000)) return "A tier must start at 0% to 1000% of target.";
  if (sorted.some((t) => !Number.isFinite(t.pct) || t.pct < 0 || t.pct > 100)) return "A tier's commission must be between 0% and 100%.";
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].fromPct === sorted[i - 1].fromPct) return "Two tiers cannot start at the same share of target.";
    if (sorted[i].pct < sorted[i - 1].pct) return "A higher tier should not pay less than the one below it.";
  }
  return null;
}

// The rate that applies to a month: the highest tier whose start the net sales have reached.
export function tierPctFor(basePct: number, tiers: CommissionTier[] | undefined, netSales: number, target: number | undefined) {
  if (!tiers || tiers.length === 0 || !(target && target > 0)) return { pct: basePct, achievedPct: null as number | null, reachedFromPct: null as number | null };
  const achievedPct = Math.round((netSales / target) * 1000) / 10;
  const reached = [...tiers].filter((t) => achievedPct >= t.fromPct).sort((a, b) => b.fromPct - a.fromPct)[0];
  return reached ? { pct: reached.pct, achievedPct, reachedFromPct: reached.fromPct } : { pct: basePct, achievedPct, reachedFromPct: null };
}

// "100:8, 120:10" typed on the employee form: share of target, then rate. Lines that do not parse are reported.
export function parseTierText(text: string): { tiers: CommissionTier[]; errors: string[] } {
  const tiers: CommissionTier[] = [], errors: string[] = [];
  for (const raw of text.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)) {
    const [a, b] = raw.split(":").map((x) => Number(x.trim()));
    if (raw.split(":").length !== 2 || !Number.isFinite(a) || !Number.isFinite(b)) { errors.push(`"${raw}" is not "share of target:rate".`); continue; }
    tiers.push({ fromPct: a, pct: b });
  }
  return { tiers, errors };
}
