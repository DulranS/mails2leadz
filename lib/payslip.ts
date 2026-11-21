// A payslip for one employee and one month: what they are paid, what comes off, what they take home.
//
// Printed on demand from the employee record plus the month's extras the owner types in. Nothing is stored and nothing
// is filed anywhere. The recurring payroll expense already in the books is the basic pay plus the employer's EPF/ETF;
// overtime and allowances are extra cost that is only booked if the owner records them (see payslipExtrasExpenseName).
//
//   basic          = the employee's pay for one pay period (weekly, monthly or yearly, as set up)
//   no-pay         = basic / days in the period (7, 30 or 365) x no-pay days, never more than the basic
//   hourly rate    = the basic worked out as a month / hours in a month (default 240)
//   overtime       = hours x hourly rate x multiplier (default 1.5)
//   gross          = basic - no-pay + overtime + commission + allowances
//   EPF base       = basic - no-pay + commission + allowances   (overtime is left out of the EPF base)
//   employee EPF   = 8% of the EPF base, only when EPF/ETF applies to the person (comes off pay)
//   tax            = the employee's tax % of gross (the same simple rule the Employees page uses for take-home)
//   net pay        = gross - employee EPF - tax - other deductions
//   employer EPF 12% and ETF 3% of the EPF base are shown for the business; they are not taken from the employee.
// The rates are the fixed ones already used on the Employees page. This is an arithmetic aid, not tax or legal advice.
import type { Employee, Settings } from "./types";
import { taxForPeriod, TAX_MODE_LABEL, type TaxMode } from "./payTax";
import { monthlyNormalizedAmount, SL_EPF_EMPLOYEE_PCT, SL_EPF_EMPLOYER_PCT, SL_ETF_EMPLOYER_PCT } from "./calculations";
import { buildLetterheadHtml, escapeHtml, printBaseStyles } from "./print";

export const DEFAULT_OVERTIME_MULTIPLIER = 1.5;
export const DEFAULT_HOURS_PER_MONTH = 240;

export interface PayslipInput {
  month: string; // YYYY-MM, shown on the slip
  overtimeHours: number;
  overtimeMultiplier: number;
  hoursPerMonth: number;
  commission: number;
  allowances: number;
  noPayDays: number;
  otherDeductions: number;
}

export interface Payslip {
  employeeName: string;
  role: string;
  month: string;
  periodLabel: string; // "monthly", "weekly" or "yearly"
  basic: number;
  noPayDays: number;
  noPayDeduction: number;
  hourlyRate: number;
  overtimeHours: number;
  overtimeMultiplier: number;
  overtimePay: number;
  commission: number;
  allowances: number;
  gross: number;
  epfBase: number;
  epfApplies: boolean;
  employeeEpf: number;
  taxPct: number;
  taxMode: TaxMode;
  tax: number;
  otherDeductions: number;
  totalDeductions: number;
  net: number;
  employerEpf: number;
  employerEtf: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function periodDays(freq: Employee["payFrequency"]): number {
  return freq === "weekly" ? 7 : freq === "yearly" ? 365 : 30;
}

export const emptyPayslipInput = (month: string): PayslipInput => ({
  month,
  overtimeHours: 0,
  overtimeMultiplier: DEFAULT_OVERTIME_MULTIPLIER,
  hoursPerMonth: DEFAULT_HOURS_PER_MONTH,
  commission: 0,
  allowances: 0,
  noPayDays: 0,
  otherDeductions: 0,
});

// First problem in plain words, or null when a slip can be worked out.
export function validatePayslipInput(e: Pick<Employee, "payRate" | "payFrequency">, i: PayslipInput): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(i.month)) return "Choose the month.";
  const nums: [string, number][] = [
    ["Overtime hours", i.overtimeHours], ["Commission", i.commission], ["Allowances", i.allowances],
    ["No-pay days", i.noPayDays], ["Other deductions", i.otherDeductions],
  ];
  for (const [label, v] of nums) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return `${label} must be 0 or more.`;
  }
  if (i.overtimeHours > 744) return "Overtime hours cannot be more than the hours in a month (744).";
  if (!(i.overtimeMultiplier >= 1 && i.overtimeMultiplier <= 5)) return "The overtime rate must be between 1 and 5 times the hourly rate.";
  if (!(i.hoursPerMonth >= 100 && i.hoursPerMonth <= 400)) return "Hours in a month must be between 100 and 400.";
  if (i.noPayDays > periodDays(e.payFrequency)) return `No-pay days cannot be more than the ${periodDays(e.payFrequency)} days in the pay period.`;
  if (!Number.isFinite(e.payRate) || e.payRate < 0) return "This employee has no valid pay set.";
  return null;
}

export function computePayslip(e: Pick<Employee, "name" | "role" | "payRate" | "payFrequency" | "taxPct" | "epfEtfApplicable" | "taxMode">, i: PayslipInput): Payslip {
  const basic = round2(e.payRate);
  const noPayDeduction = Math.min(basic, round2((basic / periodDays(e.payFrequency)) * i.noPayDays));
  const hourlyRate = round2(monthlyNormalizedAmount(e.payRate, e.payFrequency) / i.hoursPerMonth);
  const overtimePay = round2(i.overtimeHours * hourlyRate * i.overtimeMultiplier);
  const commission = round2(i.commission);
  const allowances = round2(i.allowances);
  const gross = round2(basic - noPayDeduction + overtimePay + commission + allowances);
  const epfBase = round2(basic - noPayDeduction + commission + allowances);
  const epfApplies = !!e.epfEtfApplicable;
  const employeeEpf = epfApplies ? round2((epfBase * SL_EPF_EMPLOYEE_PCT) / 100) : 0;
  const taxPct = Number.isFinite(e.taxPct) ? Math.max(0, e.taxPct) : 0;
  const taxMode: TaxMode = e.taxMode === "apit" || e.taxMode === "service_wht" ? e.taxMode : "flat";
  // v320: APIT or the 5% service withholding by the person's mode; flat keeps the percentage as before.
  const tax = taxForPeriod(taxMode, { periodGross: gross, monthlyBasic: monthlyNormalizedAmount(e.payRate, e.payFrequency), flatPct: taxPct });
  const otherDeductions = round2(i.otherDeductions);
  const totalDeductions = round2(employeeEpf + tax + otherDeductions);
  return {
    employeeName: e.name,
    role: e.role,
    month: i.month,
    periodLabel: e.payFrequency,
    basic,
    noPayDays: i.noPayDays,
    noPayDeduction,
    hourlyRate,
    overtimeHours: i.overtimeHours,
    overtimeMultiplier: i.overtimeMultiplier,
    overtimePay,
    commission,
    allowances,
    gross,
    epfBase,
    epfApplies,
    employeeEpf,
    taxPct,
    taxMode,
    tax,
    otherDeductions,
    totalDeductions,
    net: round2(gross - totalDeductions),
    employerEpf: epfApplies ? round2((epfBase * SL_EPF_EMPLOYER_PCT) / 100) : 0,
    employerEtf: epfApplies ? round2((epfBase * SL_ETF_EMPLOYER_PCT) / 100) : 0,
  };
}

// What this slip costs the business on top of the recurring payroll already in the books: overtime and allowances.
// Commission is recorded from its own card on the Employees page and the basic is already booked, so neither is here.
export function payslipExtras(p: Payslip): number {
  return round2(p.overtimePay + p.allowances);
}

// The fixed name used when the owner records a slip's extras, so the page can show "recorded" instead of offering it twice.
export function payslipExtrasExpenseName(employeeName: string, month: string): string {
  return `Payslip extras — ${employeeName} (${month})`;
}

export function buildPayslipHtml(p: Payslip, settings: Settings, todayLabel: string): string {
  const cur = settings.currency;
  const m = (n: number) => `${escapeHtml(cur)} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const earn: [string, number][] = [[`Basic pay (${p.periodLabel})`, p.basic]];
  if (p.overtimePay > 0) earn.push([`Overtime: ${p.overtimeHours} h at ${p.overtimeMultiplier}x the hourly rate of ${p.hourlyRate.toFixed(2)}`, p.overtimePay]);
  if (p.commission > 0) earn.push(["Commission", p.commission]);
  if (p.allowances > 0) earn.push(["Allowances", p.allowances]);
  const ded: [string, number][] = [];
  if (p.epfApplies) ded.push([`EPF, employee share (${SL_EPF_EMPLOYEE_PCT}%)`, p.employeeEpf]);
  if (p.taxMode === "apit" || p.taxMode === "service_wht") { if (p.tax > 0) ded.push([TAX_MODE_LABEL[p.taxMode], p.tax]); }
  else if (p.taxPct > 0) ded.push([`Tax (${p.taxPct}%)`, p.tax]);
  if (p.otherDeductions > 0) ded.push(["Other deductions", p.otherDeductions]);
  const row = ([l, v]: [string, number]) => `<tr><td>${escapeHtml(l)}</td><td style="text-align:right;">${m(v)}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Payslip ${escapeHtml(p.employeeName)} ${escapeHtml(p.month)}</title>${printBaseStyles()}</head>
    <body>
      ${buildLetterheadHtml(settings, "Payslip")}
      <h1>${escapeHtml(p.employeeName)}</h1>
      <div class="muted" style="margin:6px 0 18px;">${p.role ? `${escapeHtml(p.role)} &nbsp;·&nbsp; ` : ""}Pay for ${escapeHtml(p.month)}</div>
      <h3>Earnings</h3>
      <table style="width:100%;border-collapse:collapse;">
        ${earn.map(row).join("")}
        ${p.noPayDeduction > 0 ? `<tr><td>Less no-pay: ${p.noPayDays} day${p.noPayDays === 1 ? "" : "s"}</td><td style="text-align:right;">- ${m(p.noPayDeduction)}</td></tr>` : ""}
        <tr><td><strong>Gross pay</strong></td><td style="text-align:right;"><strong>${m(p.gross)}</strong></td></tr>
      </table>
      <h3 style="margin-top:18px;">Deductions</h3>
      <table style="width:100%;border-collapse:collapse;">
        ${ded.length ? ded.map(row).join("") : `<tr><td>None</td><td style="text-align:right;">${m(0)}</td></tr>`}
        <tr><td><strong>Total deductions</strong></td><td style="text-align:right;"><strong>${m(p.totalDeductions)}</strong></td></tr>
      </table>
      <h2 style="margin-top:20px;">Net pay: ${m(p.net)}</h2>
      ${p.epfApplies ? `<div class="muted" style="margin-top:14px;">Paid in by the employer on top of the pay above: EPF ${m(p.employerEpf)} and ETF ${m(p.employerEtf)}, worked out on ${m(p.epfBase)} (overtime is not included).</div>` : ""}
      <div class="footer">Prepared ${escapeHtml(todayLabel)}. Worked out from the pay set up for this employee and the figures entered for the month.</div>
    </body></html>`;
}
