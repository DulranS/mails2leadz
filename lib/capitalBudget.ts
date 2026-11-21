// Capital budgeting (v220b): the investment decisions a business makes with its cash. Each project is a one-off outlay followed by yearly
// cash flows (incremental, after tax, in the business's currency), discounted at a rate that reflects its risk. Pure: no I/O.

export interface Project {
  name: string;
  outlay: number; // money out at the start (positive number)
  flows: number[]; // cash in each year, year 1 first
}

// Present value of the yearly flows at the discount rate (a fraction, e.g. 0.12 for 12%).
export function presentValue(flows: number[], rate: number): number {
  return flows.reduce((t, cf, i) => t + cf / Math.pow(1 + rate, i + 1), 0);
}

export function npv(p: Project, rate: number): number {
  return round2(presentValue(p.flows, rate) - p.outlay);
}

// The rate at which NPV is zero, by bisection between -99% and 1000%. Null when there is no sign change (no meaningful IRR).
export function irr(p: Project): number | null {
  const f = (r: number) => presentValue(p.flows, r) - p.outlay;
  let lo = -0.99, hi = 10;
  const flo = f(lo), fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || Math.sign(flo) === Math.sign(fhi)) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < 1e-7) return round4(mid);
    if (Math.sign(fm) === Math.sign(flo)) lo = mid;
    else hi = mid;
  }
  return round4((lo + hi) / 2);
}

// Years until the cumulative cash returns the outlay, with the last year's part counted fractionally. Null if it never pays back.
export function paybackYears(p: Project, discountRate = 0): number | null {
  let cumulative = -p.outlay;
  for (let i = 0; i < p.flows.length; i++) {
    const cf = p.flows[i] / Math.pow(1 + discountRate, i + 1);
    if (cumulative + cf >= 0) return round2(i + (cf === 0 ? 0 : -cumulative / cf));
    cumulative += cf;
  }
  return null;
}

// Profit per unit of outlay: the present value of what comes back for each unit invested. Above 1 creates value.
export function profitabilityIndex(p: Project, rate: number): number | null {
  if (p.outlay <= 0) return null;
  return round2(presentValue(p.flows, rate) / p.outlay);
}

// When funds are limited, fund the projects with the highest profitability index first, while the money lasts; a project that does not fit
// is skipped rather than split. Returns what is funded, what is not, and what is left unspent.
export function capitalRationing(projects: Project[], rate: number, budget: number) {
  const ranked = projects
    .filter((p) => p.outlay > 0 && npv(p, rate) > 0)
    .map((p) => ({ project: p, index: profitabilityIndex(p, rate) ?? 0 }))
    .sort((a, b) => b.index - a.index);
  let left = budget;
  const funded: Project[] = [], skipped: Project[] = [];
  for (const { project } of ranked) {
    if (project.outlay <= left) {
      funded.push(project);
      left -= project.outlay;
    } else skipped.push(project);
  }
  return { funded, skipped, unspent: round2(left), valueCreated: round2(funded.reduce((t, p) => t + npv(p, rate), 0)) };
}

// For projects that cannot both be done, or that run for different lengths: the equal yearly amount each is worth over its life. The better
// project is the one with the higher equivalent annual annuity.
export function equivalentAnnualAnnuity(p: Project, rate: number): number {
  const n = p.flows.length;
  if (n === 0) return 0;
  const annuityFactor = rate === 0 ? n : (1 - Math.pow(1 + rate, -n)) / rate;
  return round2(npv(p, rate) / annuityFactor);
}

// A real rate from a nominal rate and expected inflation (Fisher): the return after the loss of buying power.
export function realRate(nominal: number, inflation: number): number {
  return round4((1 + nominal) / (1 + inflation) - 1);
}

// The share of value that depends on the terminal value (what the project is assumed to be worth after the forecast years). A high share
// means the decision rests on a guess about the distant future, and should be tested harder.
export function terminalValueShare(pvForecast: number, pvTerminal: number): number | null {
  const total = pvForecast + pvTerminal;
  if (total <= 0) return null;
  return round2((pvTerminal / total) * 100);
}
export const TERMINAL_SHARE_WARN_PCT = 75;

// After an investment: each year's actual cash against what was forecast, and whether the project is keeping its promise. A negative
// cumulative variance means it is behind the case that justified it.
export function postInvestmentAudit(forecast: number[], actual: number[]) {
  let cumulative = 0;
  const years = Math.max(forecast.length, actual.length);
  const rows = Array.from({ length: years }, (_, i) => {
    const f = forecast[i] ?? 0, a = actual[i] ?? 0;
    cumulative += a - f;
    return { year: i + 1, forecast: f, actual: a, variance: round2(a - f), cumulativeVariance: round2(cumulative) };
  });
  return { rows, behindPlan: cumulative < 0, finalVariance: round2(cumulative) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

// Projects typed one per line: "name; outlay; year1, year2, year3". Lines that do not parse are reported, not guessed at.
export function parseProjects(text: string): { projects: Project[]; errors: string[] } {
  const projects: Project[] = [], errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(";").map((s) => s.trim());
    const outlay = Number(parts[1]);
    const flows = (parts[2] ?? "").split(",").map((s) => Number(s.trim()));
    if (parts.length < 3 || !parts[0] || !Number.isFinite(outlay) || outlay <= 0 || flows.length === 0 || !flows.every(Number.isFinite)) {
      errors.push(`Line ${i + 1} is not "name; outlay; year1, year2, ...".`);
      return;
    }
    projects.push({ name: parts[0].slice(0, 120), outlay, flows });
  });
  return { projects, errors };
}
