// Staged investment (v222b): a project that unfolds over several stages. The value of its cash-generating asset moves up or down at each
// stage (a binomial tree). At every stage the owner decides: continue (take this stage's cash, pay the stage cost, and carry on) or stop
// (take the salvage value now). The value of the project is what it is worth with those choices, and the value of the choices is what is
// added on top of a committed project that cannot stop. Pure: no I/O. Probabilities and factors are the owner's estimates.

export interface StagedProject {
  stages: number; // how many stages, at least 1
  initialValue: number; // value of the cash-generating asset today
  up: number; // factor for an up move, above 1 (for example 1.2)
  down: number; // factor for a down move, below 1 (for example 0.8)
  probUp: number; // chance of an up move at each stage, 0 to 1
  rate: number; // discount rate per stage, as a fraction
  cashYieldPct: number; // cash this stage, as a percentage of the asset's value at that point
  stageCost: number; // paid each stage to continue
  salvage: number; // received if the project is stopped at a stage
}

export interface StagedResult {
  withChoices: number; // value with the option to stop at each stage
  committed: number; // value if the project must run to the end
  flexibility: number; // what the option to stop is worth (withChoices - committed)
  stopAtStartIsBetter: boolean; // stopping now is worth more than continuing
}

export function stagedValue(p: StagedProject): StagedResult {
  const withChoices = solve(p, true);
  const committed = solve(p, false);
  return {
    withChoices: round2(withChoices),
    committed: round2(committed),
    flexibility: round2(withChoices - committed),
    stopAtStartIsBetter: p.salvage > committed && p.salvage >= withChoices - 1e-9,
  };
}

function solve(p: StagedProject, canStop: boolean): number {
  // Value of the node at stage t where j of the t moves so far were up.
  const memo = new Map<string, number>();
  const at = (t: number, j: number): number => {
    if (t >= p.stages) return 0;
    const key = `${t}:${j}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const value = p.initialValue * Math.pow(p.up, j) * Math.pow(p.down, t - j);
    const cash = value * (p.cashYieldPct / 100) - p.stageCost;
    const next = (p.probUp * at(t + 1, j + 1) + (1 - p.probUp) * at(t + 1, j)) / (1 + p.rate);
    const cont = cash + next;
    const result = canStop ? Math.max(cont, p.salvage) : cont;
    memo.set(key, result);
    return result;
  };
  return at(0, 0);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Estimates for the staged project from the business's own history (monthly totals, oldest first): the share of months that rose, and the
// average rise and fall in those months. Null when the history is too short to say anything (fewer than six months, or no rises or falls).
// They are a starting point to check against the business, not a forecast.
export function estimateFromHistory(monthly: number[]): { probUp: number; up: number; down: number; months: number } | null {
  const series = monthly.filter((v) => Number.isFinite(v) && v > 0);
  if (series.length < 6) return null;
  const ratios: number[] = [];
  for (let i = 1; i < series.length; i++) ratios.push(series[i] / series[i - 1]);
  const ups = ratios.filter((r) => r > 1), downs = ratios.filter((r) => r < 1);
  if (ups.length === 0 || downs.length === 0) return null;
  const avg = (xs: number[]) => xs.reduce((t, x) => t + x, 0) / xs.length;
  return {
    probUp: Math.round((ups.length / ratios.length) * 100) / 100,
    up: Math.round(avg(ups) * 1000) / 1000,
    down: Math.round(avg(downs) * 1000) / 1000,
    months: series.length,
  };
}
