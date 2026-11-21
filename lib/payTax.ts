// Sri Lankan tax on pay (v320). Pure: no I/O, so it runs in the verifier.
//
// Three ways a person's pay is taxed, set per person (Employee.taxMode):
//   "flat"        the owner's own percentage (the v1 behaviour, kept as it was)
//   "apit"        employment income, withheld as APIT by the employer, from the progressive bands below
//   "service_wht" a service payment to a resident individual, withheld at 5% when the monthly payment is over LKR 100,000
//
// Sources (checked 20 Nov 2026):
//   APIT bands, year of assessment 2026/27 (1 Apr 2026 to 31 Mar 2027): br.lk APIT guide (19 Oct 2026) and the CMA Sri Lanka rate
//     schedule, which agree with each other, and with the two printed examples in the br.lk guide (Rs 8,000 at Rs 250,000 a month,
//     Rs 18,500 at Rs 300,000 a month). The IRD's own APIT tables (DIR, Inland Revenue Act No. 24 of 2017) are the authority; confirm
//     against them before live payroll. The 2026 amendment act did not change APIT rates (KPMG, June 2026).
//   WHT 5% on service payments to resident individuals over LKR 100,000 a month. Citation status (21 Nov 2026): the notice number
//     SEC/PN/IT/2026/02 and its section 10.3 could NOT be verified. The circular dated 8 June 2026 that was located is SEC/2026/E/04 (IRD PDF
//     is image-only, so its text was not read). Whole-payment reading (used here) rests on one secondary source (Regfollower, 10 July 2026).
//     Open point: IRD to confirm whole payment vs the part over 100,000, and whether the threshold is per payer or per recipient.
//     The owner marks who is covered; treat the result as a provisional figure until the IRD answer is in.
const round2 = (n: number) => Math.round(n * 100) / 100;

export const APIT_YEAR = "2026/27";
export const APIT_CHECKED_ON = "2026-11-20";
export const APIT_RELIEF_ANNUAL = 1_800_000; // tax-free relief per year (Rs 150,000 a month)
// Bands on the income above the relief, cumulative widths: first 1,000,000 at 6%, next 500,000 at 18%, 24%, 30%, balance at 36%.
export const APIT_BANDS: { width: number; rate: number }[] = [
  { width: 1_000_000, rate: 6 },
  { width: 500_000, rate: 18 },
  { width: 500_000, rate: 24 },
  { width: 500_000, rate: 30 },
  { width: Number.POSITIVE_INFINITY, rate: 36 },
];
export const WHT_SERVICE_PCT = 5;
export const WHT_SERVICE_MONTHLY_THRESHOLD = 100_000; // "exceeds Rs. 100,000" a month: strictly above

export type TaxMode = "flat" | "apit" | "service_wht";
export const TAX_MODE_LABEL: Record<TaxMode, string> = {
  flat: "Flat % (your own rate)",
  apit: "APIT (employment, bands)",
  service_wht: "5% withholding (service payment)",
};

// APIT for a year's income, from the bands above.
export function annualApit(annualIncome: number): number {
  let taxable = Math.max(0, (Number.isFinite(annualIncome) ? annualIncome : 0) - APIT_RELIEF_ANNUAL);
  let tax = 0;
  for (const band of APIT_BANDS) {
    if (taxable <= 0) break;
    const part = Math.min(taxable, band.width);
    tax += (part * band.rate) / 100;
    taxable -= part;
  }
  return round2(tax);
}

// APIT for one month: the year's tax on the month's pay repeated for twelve months, divided by twelve. Assumes the month's pay is the
// year's pay; a pay rise or a bonus later in the year changes the true figure at the year-end adjustment.
export function monthlyApit(monthlyIncome: number): number {
  if (!(monthlyIncome > 0)) return 0;
  return round2(annualApit(monthlyIncome * 12) / 12);
}

// Tax on one pay period (weekly, monthly or yearly), scaled from the monthly figure for the basic monthly pay.
export function apitForPeriod(periodGross: number, monthlyBasic: number): number {
  if (!(periodGross > 0) || !(monthlyBasic > 0)) return 0;
  return round2((monthlyApit(monthlyBasic) * periodGross) / monthlyBasic);
}

// The 5% service withholding on one period's payment. The threshold is tested on the monthly figure.
export function serviceWhtForPeriod(periodGross: number, monthlyPayment: number): number {
  if (!(periodGross > 0) || !(monthlyPayment > WHT_SERVICE_MONTHLY_THRESHOLD)) return 0;
  return round2((periodGross * WHT_SERVICE_PCT) / 100);
}

// The tax taken from one period's pay under the person's mode. `flatPct` is only used for "flat".
export function taxForPeriod(mode: TaxMode | undefined, input: { periodGross: number; monthlyBasic: number; flatPct: number }): number {
  const gross = Math.max(0, input.periodGross || 0);
  if (mode === "apit") return apitForPeriod(gross, input.monthlyBasic);
  if (mode === "service_wht") return serviceWhtForPeriod(gross, input.monthlyBasic);
  const pct = Number.isFinite(input.flatPct) ? Math.max(0, input.flatPct) : 0;
  return round2((gross * pct) / 100);
}

// Take-home estimate for the Employees list. EPF is taken off as before (employee share 8%) when it applies.
export function takeHomeEstimate(
  payRate: number,
  e: { taxMode?: TaxMode; taxPct: number; epfEtfApplicable?: boolean; payFrequency?: string },
  epfEmployeePct: number,
): number {
  const epf = e.epfEtfApplicable ? payRate * (epfEmployeePct / 100) : 0;
  const tax = taxForPeriod(e.taxMode, { periodGross: payRate, monthlyBasic: payRate, flatPct: e.taxPct });
  return round2(payRate - tax - epf);
}

// A tax mode from a CSV cell or stored value. Anything unknown is "flat", so an old record keeps its percentage.
export function parseTaxMode(v: unknown): TaxMode {
  const t = String(v ?? "").trim().toLowerCase();
  return t === "apit" || t === "service_wht" ? t : "flat";
}
