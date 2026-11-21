"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, todayIso } from "@/lib/format";
import { openPrintWindow } from "@/lib/print";
import { computeCommissions } from "@/lib/commission";
import { unpaidDaysInMonth } from "@/lib/leave";
import {
  buildPayslipHtml, computePayslip, DEFAULT_HOURS_PER_MONTH, DEFAULT_OVERTIME_MULTIPLIER, payslipExtras,
  payslipExtrasExpenseName, validatePayslipInput, type PayslipInput,
} from "@/lib/payslip";
import { Badge, Button, Card, Field, Input, Label, Select } from "@/components/ui";

const num = (s: string) => (s.trim() === "" ? 0 : Number(s));

// Prepare and print one employee's payslip for a month. Worked out on screen from the employee's set-up pay and the
// month's extras typed here; nothing is saved. Overtime and allowances are extra cost the recurring payroll expense does
// not hold, so the owner can record them (once per person and month) with one press.
export default function PayslipCard() {
  const { employees, sales, saleReturns, discounts, leaveRecords, expenses, addExpense, settings, saleEconomics } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const people = useMemo(() => employees.filter((e) => e.active), [employees]);
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [overtimeHours, setOvertimeHours] = useState("");
  const [commission, setCommission] = useState("");
  const [allowances, setAllowances] = useState("");
  const [noPayDays, setNoPayDays] = useState("");
  const [otherDeductions, setOtherDeductions] = useState("");
  const [multiplier, setMultiplier] = useState(String(DEFAULT_OVERTIME_MULTIPLIER));
  const [hoursPerMonth, setHoursPerMonth] = useState(String(DEFAULT_HOURS_PER_MONTH));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[]>([]);

  const emp = people.find((e) => e.id === (employeeId || people[0]?.id));
  const input: PayslipInput = {
    month,
    overtimeHours: num(overtimeHours),
    overtimeMultiplier: num(multiplier),
    hoursPerMonth: num(hoursPerMonth),
    commission: num(commission),
    allowances: num(allowances),
    noPayDays: num(noPayDays),
    otherDeductions: num(otherDeductions),
  };
  const deliveryId = settings.deliveryProductId;
  const suggestedCommission = useMemo(() => {
    if (!emp) return 0;
    const profitBySaleId = new Map(saleEconomics.map((x) => [x.saleId, x.contributionMargin]));
    const line = computeCommissions(employees, sales, saleReturns, month, discounts, deliveryId ? [deliveryId] : [], profitBySaleId, settings.salesTargets).find((l) => l.employeeId === emp.id);
    return line?.earned ?? 0;
  }, [emp, employees, sales, saleReturns, discounts, month, deliveryId, saleEconomics, settings.salesTargets]);
  const suggestedNoPay = emp ? unpaidDaysInMonth(leaveRecords, emp.id, month) : 0;

  if (people.length === 0) return null;
  if (!emp) return null;

  const problem = validatePayslipInput(emp, input);
  const slip = problem ? null : computePayslip(emp, input);
  const extras = slip ? payslipExtras(slip) : 0;
  const extrasName = payslipExtrasExpenseName(emp.name, month);
  const extrasRecorded = done.includes(extrasName) || expenses.some((x) => x.name === extrasName);

  function print() {
    if (!slip) return;
    if (!openPrintWindow(buildPayslipHtml(slip, settings, todayIso()))) toast.error("Pop-up blocked", "Allow pop-ups for this site to print.");
  }

  async function recordExtras() {
    if (!slip || extras <= 0) return;
    setBusy(true);
    try {
      await addExpense({
        name: extrasName,
        amount: extras,
        category: "Payroll & labor",
        kind: "expense",
        isRecurring: false,
        recurrence: "none",
        startDate: todayIso(),
      });
      setDone((d) => [...d, extrasName]);
      toast.success("Recorded", `${emp?.name}: overtime and allowances, ${month}`);
    } catch (err) {
      toast.error("Couldn't record", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const row = (label: string, value: number, strong = false) => (
    <div className={`flex items-center justify-between py-1 ${strong ? "font-medium" : ""}`}>
      <span className={strong ? "" : "text-muted"}>{label}</span>
      <span className="num">{formatMoney(value, currency)}</span>
    </div>
  );

  return (
    <Card className="mt-6">
      <div className="font-medium">Payslip</div>
      <div className="text-xs text-muted mt-0.5 mb-3">
        Pick a person and a month, add that month&apos;s extras, and print their payslip. Nothing here is saved.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Employee</Label>
          <Select value={emp.id} onChange={(e) => setEmployeeId(e.target.value)}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>Month</Label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        <Field>
          <Label>Overtime hours</Label>
          <Input type="number" min="0" step="0.5" value={overtimeHours} onChange={(e) => setOvertimeHours(e.target.value)} placeholder="0" />
        </Field>
        <Field>
          <Label>Allowances</Label>
          <Input type="number" min="0" step="0.01" value={allowances} onChange={(e) => setAllowances(e.target.value)} placeholder="0" />
        </Field>
        <Field>
          <Label>Commission</Label>
          <Input type="number" min="0" step="0.01" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="0" />
          {suggestedCommission > 0 && num(commission) !== suggestedCommission && (
            <button type="button" className="text-xs text-amber-soft hover:underline mt-1 text-left" onClick={() => setCommission(String(suggestedCommission))}>
              Use this month&apos;s commission: {formatMoney(suggestedCommission, currency)}
            </button>
          )}
        </Field>
        <Field>
          <Label>No-pay days</Label>
          <Input type="number" min="0" step="0.5" value={noPayDays} onChange={(e) => setNoPayDays(e.target.value)} placeholder="0" />
          {suggestedNoPay > 0 && num(noPayDays) !== suggestedNoPay && (
            <button type="button" className="text-xs text-amber-soft hover:underline mt-1 text-left" onClick={() => setNoPayDays(String(suggestedNoPay))}>
              Use {suggestedNoPay} no-pay {suggestedNoPay === 1 ? "day" : "days"} from leave records
            </button>
          )}
        </Field>
        <Field className="sm:col-span-2">
          <Label>Other deductions (advance, loan repayment, and so on)</Label>
          <Input type="number" min="0" step="0.01" value={otherDeductions} onChange={(e) => setOtherDeductions(e.target.value)} placeholder="0" />
        </Field>
      </div>
      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer">Overtime rate and hours in a month</summary>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <Field>
            <Label>Overtime paid at (times the hourly rate)</Label>
            <Input type="number" min="1" max="5" step="0.25" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} />
          </Field>
          <Field>
            <Label>Hours in a month</Label>
            <Input type="number" min="100" max="400" step="1" value={hoursPerMonth} onChange={(e) => setHoursPerMonth(e.target.value)} />
          </Field>
        </div>
        <div className="mt-1">The hourly rate is the monthly pay divided by the hours in a month. Set both to what you agreed with your staff.</div>
      </details>

      {problem && <div className="mt-4 text-sm text-bad">{problem}</div>}

      {slip && (
        <div className="mt-4 border-t border-line pt-3 text-sm">
          {row(`Basic pay (${slip.periodLabel})`, slip.basic)}
          {slip.noPayDeduction > 0 && row(`Less no-pay (${slip.noPayDays} ${slip.noPayDays === 1 ? "day" : "days"})`, -slip.noPayDeduction)}
          {slip.overtimePay > 0 && row(`Overtime (${slip.overtimeHours} h)`, slip.overtimePay)}
          {slip.commission > 0 && row("Commission", slip.commission)}
          {slip.allowances > 0 && row("Allowances", slip.allowances)}
          {row("Gross pay", slip.gross, true)}
          {slip.employeeEpf > 0 && row("Employee EPF", -slip.employeeEpf)}
          {slip.tax > 0 && row(`Tax (${slip.taxPct}%)`, -slip.tax)}
          {slip.otherDeductions > 0 && row("Other deductions", -slip.otherDeductions)}
          {row("Net pay", slip.net, true)}
          {slip.epfApplies && (
            <div className="text-xs text-muted mt-1">
              The business also pays EPF {formatMoney(slip.employerEpf, currency)} and ETF {formatMoney(slip.employerEtf, currency)}. Overtime is not counted for EPF.
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button type="button" onClick={print}>Print payslip</Button>
            {extras > 0 &&
              (extrasRecorded ? (
                <Badge tone="good">Overtime and allowances recorded</Badge>
              ) : (
                <Button type="button" variant="ghost" disabled={busy} onClick={recordExtras}>
                  {busy ? "Recording…" : `Record overtime and allowances (${formatMoney(extras, currency)}) as an expense`}
                </Button>
              ))}
          </div>
        </div>
      )}
      <div className="text-[11px] text-muted mt-3">
        The basic pay and the employer&apos;s EPF/ETF on it are already in your books as this person&apos;s recurring payroll expense. Overtime and allowances are not, until you record them here. Commission is recorded from its own card above.
      </div>
    </Card>
  );
}
