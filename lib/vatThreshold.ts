// Sri Lanka VAT registration check (v291). Information only: Balancr never registers anyone or files anything.
// Thresholds: registration is due when taxable supplies exceed LKR 60 million in the 12 months then ending, or LKR 15 million in any
// single taxable quarter. In June 2026 the government announced that its proposed cut to LKR 36 million had been dropped, so these
// apply. Checked 16 Nov 2026 against beancount.io (24 Sep 2026), which reports that announcement. Confirm with the IRD before relying on it.
// The quarter test uses the best 3-month stretch in the last 12 months as a stand-in for a calendar quarter. That is stricter than
// checking calendar quarters only, so it warns earlier, never later.
// Pure: no I/O. Amounts in the business's currency; the thresholds are in LKR, so other currencies are not checked.

export const VAT_LK = {
  currency: "LKR",
  annual: 60_000_000,
  quarter: 15_000_000,
  warnAt: 0.8, // from 80% of either threshold, the status is "approaching"
  checkedOn: "2026-11-16",
  source: "KPMG, Value Added Tax Amendment Act No. 14 of 2026 (July 2026): \"LKR 60 Mn per year maintained\", \"foregoing the proposal to reduce the threshold to LKR 36 Mn\"",
};

// SSCL (Social Security Contribution Levy) registration, from 1 July 2026 (v333). Source: KPMG Sri Lanka on the Social Security
// Contribution Levy (Amendment) Act No. 10 of 2026, s.4(1)(d): registration is due when turnover for a quarter exceeds, or is likely to
// exceed, LKR 9 million, or for four consecutive quarters exceeds, or is likely to exceed, LKR 36 million. Registration is due within
// 15 days of the threshold being met or likely to be met. The earlier LKR 15m a quarter and LKR 60m a year applied to periods before 1 July 2026.
// Hiru News (23 June 2026) reported that a cut to LKR 36m for VAT and SSCL was dropped. That report concerns the VAT threshold, which the
// VAT Amendment Act No. 14 of 2026 keeps at LKR 60m. The SSCL cut is in the Act No. 10 text above, so it is applied.
export const SSCL_LK = {
  currency: "LKR",
  annual: 36_000_000, // four consecutive quarters, the same as the last 12 months
  quarter: 9_000_000,
  warnAt: 0.8,
  checkedOn: "2026-11-20",
  source: "KPMG on the SSCL (Amendment) Act No. 10 of 2026, s.4(1)(d), effective 1 July 2026",
};

export interface VatTurnoverMonth { month: string; salesRevenue: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Taxable sales over the last 12 months up to asOfMonth ("YYYY-MM"), and the best 3-month stretch within them. */
export function vatTurnover(months: VatTurnoverMonth[], asOfMonth: string): { last12Months: number; bestQuarter: number } {
  const upTo = months.filter((m) => m.month <= asOfMonth).sort((a, b) => a.month.localeCompare(b.month));
  const last12 = upTo.slice(-12).map((m) => (Number.isFinite(m.salesRevenue) ? m.salesRevenue : 0));
  const last12Months = r2(last12.reduce((s, x) => s + x, 0));
  const width = Math.min(3, last12.length);
  let bestQuarter = 0;
  for (let i = 0; i + width <= last12.length; i++) {
    bestQuarter = Math.max(bestQuarter, last12.slice(i, i + width).reduce((s, x) => s + x, 0));
  }
  return { last12Months, bestQuarter: r2(bestQuarter) };
}

export type VatStatus = "not_applicable" | "below" | "approaching" | "over";

/** Where the business stands against the two thresholds. "over" means it exceeds one (registration due); "approaching" is 80% or more of one. */
export function vatThresholdStatus(
  input: { currency: string; last12Months: number; bestQuarter: number },
  thresholds = VAT_LK,
) {
  if (input.currency !== thresholds.currency) {
    return { applies: false, status: "not_applicable" as VatStatus, annualPct: 0, quarterPct: 0 };
  }
  const annualPct = r2((input.last12Months / thresholds.annual) * 100);
  const quarterPct = r2((input.bestQuarter / thresholds.quarter) * 100);
  const over = input.last12Months > thresholds.annual || input.bestQuarter > thresholds.quarter;
  // Compare the unrounded ratios: a rounded percentage can show 80.00% for a figure just under 80% (pass 318).
  const near = input.last12Months / thresholds.annual >= thresholds.warnAt || input.bestQuarter / thresholds.quarter >= thresholds.warnAt;
  const status: VatStatus = over ? "over" : near ? "approaching" : "below";
  return { applies: true, status, annualPct, quarterPct };
}

// UK VAT registration (v299). Registration is due when taxable turnover over any rolling 12 months passes £90,000, and must be
// notified within 30 days of the end of that month (https://www.gov.uk/register-for-vat). There is no quarterly test, so the quarter
// limit is infinite and the quarter reading stays at 0%. Checked 17 Nov 2026 against gov.uk. Confirm with HMRC before relying on it.
export const VAT_UK = {
  currency: "GBP",
  annual: 90_000,
  quarter: Number.POSITIVE_INFINITY,
  warnAt: 0.8,
  checkedOn: "2026-11-17",
  source: "GOV.UK, register for VAT (rolling 12-month £90,000 test)",
};

/** The threshold rules for a business's currency: Sri Lanka (LKR) or UK (GBP). Null for any other currency, where no check is made. */
export function vatRuleFor(currency: string): typeof VAT_LK | typeof VAT_UK | null {
  if (currency === VAT_LK.currency) return VAT_LK;
  if (currency === VAT_UK.currency) return VAT_UK;
  return null;
}
