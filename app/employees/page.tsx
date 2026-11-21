"use client";

import { useMemo, useState } from "react";
import { parseTierText, validateTiers } from "@/lib/commissionTiers";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { can } from "@/lib/permissions";
import { missingOnboardingSteps, onboardingTasks } from "@/lib/onboarding";
import { procedureTrainingTasks } from "@/lib/procedureTraining";
import { allocateBonus, bonusPool } from "@/lib/bonusPool";
import { timeValueFor } from "@/lib/timeValue";
import { useRequireRole } from "@/lib/roleGuard";
import { takeHomeEstimate, TAX_MODE_LABEL, type TaxMode } from "@/lib/payTax";
import { monthlyNormalizedAmount, monthlyEpfEtfLiability, employerCostPerPeriod, SL_EPF_EMPLOYER_PCT, SL_EPF_EMPLOYEE_PCT, SL_ETF_EMPLOYER_PCT } from "@/lib/calculations";
import { formatMoney, todayIso } from "@/lib/format";
import { computeCommissions, commissionExpenseName, type CommissionLine } from "@/lib/commission";
import type { Employee, Recurrence } from "@/lib/types";
import PayslipCard from "@/components/PayslipCard";
import EpfDueNote from "@/components/EpfDueNote";
import LeaveCard from "@/components/LeaveCard";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Label,
  Modal,
  PageHeader,
  Select,
  Stat,
  StatGridSkeleton,
  Table,
  TableCardSkeleton,
  EmptyState,
} from "@/components/ui";

// The tax column in the list: the rule for APIT or 5% withholding, or the owner\'s own percentage.
function taxShort(e: { taxMode?: TaxMode; taxPct: number }) {
  if (e.taxMode === "apit") return "APIT";
  if (e.taxMode === "service_wht") return "5% WHT";
  return `${e.taxPct}%`;
}

export default function EmployeesPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner"]);
  const { employees, addEmployee, updateEmployee, deleteEmployee, monthlyPayroll, settings, loading, tasks, addBusinessTask, procedures } = useData();
  const { role } = useAuth();
  const canTasks = can(role, "manage:tasks");
  const [onboarding, setOnboarding] = useState<string | null>(null);

  // New-hire checklist: ordinary tasks due from today, skipping any step already on this person's list.
  async function startOnboarding(name: string) {
    const base = onboardingTasks(name, todayIso());
    if (!base) return toast.error("Can't start onboarding", "This employee needs a name first.");
    // v286: plus one read-and-confirm task per written procedure they have not read yet.
    const list = [...base, ...(procedureTrainingTasks(name, todayIso(), procedures) ?? [])];
    const todo = missingOnboardingSteps(list, tasks.map((t) => ({ title: t.title, assigneeName: t.assigneeName })));
    if (todo.length === 0) return toast.success(`${name}'s checklist is already on the Tasks page`);
    if (!window.confirm(`Add ${todo.length} onboarding tasks for ${name}, due from today? They show on the Tasks page and the Agenda.`)) return;
    setOnboarding(name);
    try {
      for (const t of todo) await addBusinessTask(t);
      toast.success(`Added ${todo.length} onboarding tasks for ${name}`);
    } catch (err) {
      toast.error("Couldn't add all the onboarding tasks", toastableErrorMessage(err));
    }
    setOnboarding(null);
  }
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const currency = settings.currency;

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees]);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(e: Employee) {
    setEditing(e);
    setModalOpen(true);
  }

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Employees &amp; payroll" action={<Button disabled>+ Add employee</Button>} />
        <StatGridSkeleton count={3} className="lg:grid-cols-3" />
        <TableCardSkeleton rows={6} cols={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Employees &amp; payroll" action={<Button onClick={openNew}>+ Add employee</Button>} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Stat label="Active staff" value={activeEmployees.length.toString()} />
        <Stat label="Payroll / month" value={formatMoney(monthlyPayroll, currency)} tone="bad" sub="gross pay + employer EPF/ETF, booked as a recurring expense" />
        <Stat
          label="EPF/ETF payable / month"
          value={formatMoney(monthlyEpfEtfLiability(activeEmployees), currency)}
          sub="employer + employee shares owed to the funds"
        />
        <Stat
          label="Est. take-home / month"
          value={formatMoney(
            activeEmployees.reduce(
              (s, e) => s + takeHomeEstimate(monthlyNormalizedAmount(e.payRate, e.payFrequency), e, SL_EPF_EMPLOYEE_PCT),
              0
            ),
            currency
          )}
          sub="after tax % and employee EPF share"
        />
      </div>

      {employees.length === 0 ? (
        <EmptyState
          title="No employees yet"
          body="Add staff or contractors here — their pay is booked automatically as a recurring expense (Payroll & labor) and flows straight into your P&L, same as rent or any other bill."
        />
      ) : (
        <>
          {/* Mobile: one card per employee. Same data as the table below,
              never rendered at the same time. */}
          <div className="sm:hidden space-y-2.5">
            {employees.map((e) => (
              <Card key={e.id} className="!p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{e.name}</div>
                    <div className="text-xs text-muted mt-0.5">{e.role || "—"}</div>
                  </div>
                  <Badge tone={e.active ? "good" : "default"}>{e.active ? "active" : "inactive"}</Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                  <div>
                    <span className="text-muted">Gross pay </span>
                    <span className="num">{formatMoney(e.payRate, currency)}</span>
                    <span className="text-muted"> / {e.payFrequency}</span>
                  </div>
                  <div>
                    <span className="text-muted">Tax </span>
                    <span className="num">{taxShort(e)}</span>
                  </div>
                  <div>
                    <span className="text-muted">Take-home </span>
                    <span className="num">{formatMoney(takeHomeEstimate(e.payRate, e, SL_EPF_EMPLOYEE_PCT), currency)}</span>
                  </div>
                  <div>
                    <span className="text-muted">Cost to business </span>
                    <span className="num">{formatMoney(employerCostPerPeriod(e.payRate, e.epfEtfApplicable), currency)}</span>
                  </div>
                </div>
                {e.epfEtfApplicable && <div className="mt-1"><Badge tone="amber">EPF/ETF</Badge></div>}
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
                  <button onClick={() => openEdit(e)} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
                    Edit
                  </button>
                  {canTasks && (
                    <button onClick={() => startOnboarding(e.name)} disabled={onboarding !== null} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
                      {onboarding === e.name ? "Adding…" : "Start onboarding"}
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop: the full table, unchanged. */}
          <Card className="hidden sm:block">
          <Table>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 px-3 font-medium">Role</th>
                <th className="py-2 px-3 font-medium">Cadence</th>
                <th className="py-2 px-3 font-medium text-right">Gross pay</th>
                <th className="py-2 px-3 font-medium">EPF/ETF</th>
                <th className="py-2 px-3 font-medium text-right">Tax %</th>
                <th className="py-2 px-3 font-medium text-right">Est. take-home</th>
                <th className="py-2 px-3 font-medium text-right">Cost to business</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 pl-3 font-medium text-right">·</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-3 font-medium">{e.name}</td>
                  <td className="py-2.5 px-3 text-muted">{e.role || "—"}</td>
                  <td className="py-2.5 px-3 text-muted">{e.payFrequency}</td>
                  <td className="py-2.5 px-3 num text-right">{formatMoney(e.payRate, currency)}</td>
                  <td className="py-2.5 px-3">
                    <Badge tone={e.epfEtfApplicable ? "amber" : "default"}>{e.epfEtfApplicable ? "yes" : "no"}</Badge>
                  </td>
                  <td className="py-2.5 px-3 num text-right text-muted">{taxShort(e)}</td>
                  <td className="py-2.5 px-3 num text-right text-muted">
                    {formatMoney(takeHomeEstimate(e.payRate, e, SL_EPF_EMPLOYEE_PCT), currency)}
                  </td>
                  <td className="py-2.5 px-3 num text-right text-muted">
                    {formatMoney(employerCostPerPeriod(e.payRate, e.epfEtfApplicable), currency)}
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge tone={e.active ? "good" : "default"}>{e.active ? "active" : "inactive"}</Badge>
                  </td>
                  <td className="py-2.5 pl-3 text-right">
                    <button onClick={() => openEdit(e)} className="text-xs text-muted hover:text-fg">
                      Edit
                    </button>
                    {canTasks && (
                      <button onClick={() => startOnboarding(e.name)} disabled={onboarding !== null} className="text-xs text-muted hover:text-fg ml-3">
                        Start onboarding
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          </Card>
        </>
      )}

      <CommissionCard />
      <BonusPoolCard />
      <TimeValueCard />

      <EpfDueNote employees={activeEmployees} currency={currency} />
      <PayslipCard />

      <LeaveCard />

      <div className="text-[11px] text-muted mt-3">
        Tax % is each employee&apos;s own withholding/PAYE rate, deducted from take-home only. When EPF/ETF applies,
        the business also owes the employer&apos;s {SL_EPF_EMPLOYER_PCT}% EPF + {SL_ETF_EMPLOYER_PCT}% ETF on top of
        gross pay, and the employee&apos;s own {SL_EPF_EMPLOYEE_PCT}% EPF share comes out of their take-home. What
        gets booked as the payroll expense is gross pay plus the employer&apos;s EPF/ETF share — the real cash cost
        to the business, not just what the employee is handed.
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit employee" : "Add employee"}>
        <EmployeeForm
          initial={editing}
          onCancel={() => setModalOpen(false)}
          onSave={async (values) => {
            try {
              if (editing) await updateEmployee(editing.id, values);
              else await addEmployee(values);
              toast.success(editing ? "Employee updated" : "Employee added", values.name);
              setModalOpen(false);
            } catch (err) {
              toast.error("Couldn't save", toastableErrorMessage(err));
            }
          }}
          onDelete={
            editing
              ? async () => {
                  if (!confirm(`Remove "${editing.name}"? Their linked payroll expense will be removed too.`)) return;
                  try {
                    await deleteEmployee(editing.id);
                    toast.success("Employee removed", editing.name);
                    setModalOpen(false);
                  } catch (err) {
                    toast.error("Couldn't remove employee", toastableErrorMessage(err));
                  }
                }
              : undefined
          }
        />
      </Modal>
    </>
  );
}

function EmployeeForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Employee | null;
  onSave: (values: Omit<Employee, "id" | "createdAt" | "linkedExpenseId">) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [payRate, setPayRate] = useState(initial?.payRate.toString() ?? "");
  const [payFrequency, setPayFrequency] = useState<Exclude<Recurrence, "none">>(initial?.payFrequency ?? "monthly");
  const [taxPct, setTaxPct] = useState(initial?.taxPct?.toString() ?? "0");
  const [taxMode, setTaxMode] = useState<TaxMode>(initial?.taxMode ?? "flat");
  const [epfEtfApplicable, setEpfEtfApplicable] = useState(initial ? initial.epfEtfApplicable ?? false : true);
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayIso());
  const [weeklyOffDay, setWeeklyOffDay] = useState(initial?.weeklyOffDay !== undefined ? String(initial.weeklyOffDay) : "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [commissionPct, setCommissionPct] = useState(initial?.commissionPct ? initial.commissionPct.toString() : "");
  const [tierText, setTierText] = useState((initial?.commissionTiers ?? []).map((t) => `${t.fromPct}:${t.pct}`).join(", "));
  const tiersParsed = parseTierText(tierText);
  const tiersProblem = tiersParsed.errors[0] ?? validateTiers(tiersParsed.tiers);
  const [commissionMemberUid, setCommissionMemberUid] = useState(initial?.commissionMemberUid ?? "");
  const [commissionBasis, setCommissionBasis] = useState<"sales" | "profit">(initial?.commissionBasis === "profit" ? "profit" : "sales");
  const [leaveDaysPerYear, setLeaveDaysPerYear] = useState(initial?.leaveDaysPerYear ? initial.leaveDaysPerYear.toString() : "");
  const { members } = useData();
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({
          name,
          role,
          payRate: Number(payRate),
          payFrequency,
          taxPct: taxMode === "flat" ? Number(taxPct) : 0,
          taxMode,
          epfEtfApplicable,
          startDate,
          weeklyOffDay: weeklyOffDay === "" ? undefined : Number(weeklyOffDay),
          endDate: active ? undefined : initial?.endDate ?? todayIso(),
          active,
          notes,
          // Always sent (0 / empty = no commission) so that clearing them really clears them.
          commissionPct: Math.min(100, Math.max(0, Number(commissionPct) || 0)),
          commissionTiers: tiersParsed.tiers.length > 0 ? tiersParsed.tiers : undefined,
          commissionMemberUid,
          commissionBasis,
          // Always sent (0 = leave not tracked for this person) so that clearing it really clears it.
          leaveDaysPerYear: Math.min(366, Math.max(0, Math.round((Number(leaveDaysPerYear) || 0) * 2) / 2)),
        });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <Field>
        <Label>Name</Label>
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kasun Perera" />
      </Field>
      <Field>
        <Label>Role (optional)</Label>
        <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Mechanic, Sales" />
      </Field>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field>
          <Label>Gross pay</Label>
          <Input required type="number" min="0" step="0.01" value={payRate} onChange={(e) => setPayRate(e.target.value)} />
        </Field>
        <Field>
          <Label>Cadence</Label>
          <Select value={payFrequency} onChange={(e) => setPayFrequency(e.target.value as Exclude<Recurrence, "none">)}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </Field>
        <Field className="col-span-2 sm:col-span-1">
          <Label>Tax method</Label>
          <Select value={taxMode} onChange={(e) => setTaxMode(e.target.value as TaxMode)}>
            {(Object.keys(TAX_MODE_LABEL) as TaxMode[]).map((m) => <option key={m} value={m}>{TAX_MODE_LABEL[m]}</option>)}
          </Select>
        </Field>
        {taxMode === "flat" ? (
          <Field className="col-span-2 sm:col-span-1">
            <Label>Tax %</Label>
            <Input required type="number" min="0" max="100" step="0.5" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
          </Field>
        ) : null}
      </div>
      <Field>
        <Label>Start date</Label>
        <Input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </Field>
      <Field>
        <Label>Regular day off (optional)</Label>
        <Select value={weeklyOffDay} onChange={(e) => setWeeklyOffDay(e.target.value)}>
          <option value="">None set</option>
          {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => (
            <option key={d} value={String(i)}>{d}</option>
          ))}
        </Select>
        <div className="text-xs text-muted mt-1">The rota flags any shift set on this day.</div>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Sales commission % (optional)</Label>
          <Input type="number" min="0" max="100" step="0.1" value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} placeholder="e.g. 2" />
        </Field>
        <Field>
          <Label>Higher rates for hitting target (optional): share of target : rate, e.g. 100:8, 120:10</Label>
          <Input value={tierText} onChange={(e) => setTierText(e.target.value)} placeholder="100:8, 120:10" />
          {tiersProblem && <div className="text-xs text-bad mt-1">{tiersProblem}</div>}
        </Field>
        <Field>
          <Label>Whose sales count</Label>
          <Select value={commissionMemberUid} onChange={(e) => setCommissionMemberUid(e.target.value)}>
            <option value="">No login linked</option>
            {members.filter((m) => m.active).map((m) => (
              <option key={m.id} value={m.id}>{m.name || m.email}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field>
        <Label>Commission is paid on</Label>
        <Select value={commissionBasis} onChange={(e) => setCommissionBasis(e.target.value as "sales" | "profit")}>
          <option value="sales">Net sales (simple to explain)</option>
          <option value="profit">Profit on those sales (lines pay up with what the business keeps)</option>
        </Select>
      </Field>
      <div className="text-[11px] text-muted -mt-2">
        {commissionBasis === "profit"
          ? "Profit is what each sale left after the cost of the goods and per-sale costs, after any return or discount, counted in the month of the sale. A month that lost money earns nothing. Only worth using if your items have costs recorded. "
          : ""}
        Commission is this share of the sales that person&apos;s login records (before sales tax, less returns and discounts). Delivery charges are not commissionable. It is only worked out and shown on this page; you record it as an expense when you pay it. The salesperson needs their own login (Team access) so their sales can be told apart.
      </div>
      <Field>
        <Label>Paid leave days a year (optional)</Label>
        <Input type="number" min="0" max="366" step="0.5" value={leaveDaysPerYear} onChange={(e) => setLeaveDaysPerYear(e.target.value)} placeholder="e.g. 21" />
        <div className="text-[11px] text-muted mt-1">All paid kinds together (annual, casual, sick). Leave you log is counted against it. You decide the number; leave blank to not track it.</div>
      </Field>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={epfEtfApplicable} onChange={(e) => setEpfEtfApplicable(e.target.checked)} className="accent-amber" />
        EPF/ETF applies — adds employer {SL_EPF_EMPLOYER_PCT}% EPF + {SL_ETF_EMPLOYER_PCT}% ETF on top of gross pay,
        deducts employee&apos;s {SL_EPF_EMPLOYEE_PCT}% EPF from take-home. Turn off for the owner, family labor, or
        anyone not legally an EPF/ETF-covered employee.
      </label>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-amber" />
        Active — unchecking stops the recurring payroll expense going forward
      </label>
      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex items-center justify-between pt-2">
        <div>
          {onDelete && (
            <Button type="button" variant="danger" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}

// A month's commission, per salesperson. Worked out from the sales and returns already recorded
// (lib/commission.ts); nothing is booked until the owner presses Record, and the expense carries a fixed name so a
// second press for the same person and month is not offered.
// Time and value (v288): hours clocked, what they cost, profit per hour worked, and how much revenue repeats without new hours sold.
function TimeValueCard() {
  const { timeEntries, monthlyPnL, settings } = useData();
  const currency = settings.currency;
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const pnl = monthlyPnL.find((m) => m.month === month);
  const v = timeValueFor({
    entries: timeEntries,
    month,
    totalRevenue: pnl?.totalRevenue ?? 0,
    recurringRevenue: pnl?.recurringRevenue ?? 0,
    netProfitAfterTax: pnl?.netProfitAfterTax ?? 0,
  });
  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-medium">Time and value</div>
          <div className="text-xs text-muted">What the clocked hours cost, what the business keeps per hour worked, and how much revenue repeats without new hours sold.</div>
        </div>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
        <div><div className="text-xs text-muted">Hours worked</div><div className="num">{v.hours.toFixed(1)}</div><div className="text-xs text-muted">{v.billableHours.toFixed(1)} billable</div></div>
        <div><div className="text-xs text-muted">Labour from clock entries</div><div className="num">{formatMoney(v.labourCost, currency)}</div></div>
        <div><div className="text-xs text-muted">Profit after tax per hour</div><div className="num">{v.profitPerHour === null ? "No hours" : formatMoney(v.profitPerHour, currency)}</div></div>
        <div><div className="text-xs text-muted">Recurring share of revenue</div><div className="num">{v.recurringSharePct === null ? "No revenue" : `${v.recurringSharePct}%`}</div></div>
      </div>
      {v.byPerson.length > 0 && (
        <ul className="text-sm space-y-1">
          {v.byPerson.map((p) => (
            <li key={p.name} className="flex justify-between"><span>{p.name}</span><span className="num">{p.hours.toFixed(1)} h</span></li>
          ))}
        </ul>
      )}
      <div className="text-xs text-muted mt-3">Labour from clock entries is a cost view. Payroll is booked separately, so do not add the two together.</div>
    </Card>
  );
}

// Results bonus pool (v287): a share of the month's profit after tax above a minimum, split by pay rate. Calculated only: nothing is booked or paid.
function BonusPoolCard() {
  const { employees, monthlyPnL, settings } = useData();
  const currency = settings.currency;
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const sharePct = settings.bonusSharePct ?? 0;
  const minProfit = settings.bonusMinProfit ?? 0;
  if (!(sharePct > 0)) return null;
  const profit = monthlyPnL.find((m) => m.month === month)?.netProfitAfterTax ?? 0;
  const pool = bonusPool(profit, { sharePct, minProfit });
  const shares = allocateBonus(pool, employees.filter((e) => e.active).map((e) => ({ uid: e.id, name: e.name, weight: e.payRate })));
  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-medium">Results bonus</div>
          <div className="text-xs text-muted">{sharePct}% of the profit above {formatMoney(minProfit, currency)}, shared by pay rate. Calculated only: nothing is booked or paid.</div>
        </div>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <div className="text-sm mb-2">Profit after tax: {formatMoney(profit, currency)}. Pool: {formatMoney(pool, currency)}.</div>
      {shares.length === 0 ? (
        <div className="text-xs text-muted">No pool this month: profit is not above the minimum, or nobody active has a pay rate.</div>
      ) : (
        <ul className="text-sm space-y-1">
          {shares.map((s) => (
            <li key={s.uid} className="flex justify-between"><span>{s.name}</span><span className="num">{formatMoney(s.amount, currency)}</span></li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CommissionCard() {
  const { employees, sales, saleReturns, discounts, expenses, addExpense, settings, saleEconomics } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const deliveryId = settings.deliveryProductId;
  const profitBySaleId = useMemo(() => new Map(saleEconomics.map((x) => [x.saleId, x.contributionMargin])), [saleEconomics]);
  const lines = useMemo(
    () => computeCommissions(employees, sales, saleReturns, month, discounts, deliveryId ? [deliveryId] : [], profitBySaleId, settings.salesTargets),
    [employees, sales, saleReturns, discounts, month, deliveryId, profitBySaleId, settings.salesTargets]
  );
  const configured = employees.some((e) => (e.commissionPct ?? 0) > 0 && !!e.commissionMemberUid);
  if (!configured) return null;

  async function record(l: CommissionLine) {
    setBusyId(l.employeeId);
    try {
      await addExpense({
        name: commissionExpenseName(l.name, month),
        amount: l.earned,
        category: "Payroll & labor",
        kind: "expense",
        isRecurring: false,
        recurrence: "none",
        startDate: todayIso(),
      });
      setDone((d) => [...d, commissionExpenseName(l.name, month)]);
      toast.success("Commission recorded", `${l.name}, ${month}`);
    } catch (err) {
      toast.error("Couldn't record commission", toastableErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <div className="font-medium">Sales commission</div>
          <div className="text-xs text-muted mt-0.5">
            Share of each salesperson&apos;s sales (or of their profit, if you chose that) for the month, before sales tax. Invoiced sales count when made, not when paid.
          </div>
        </div>
        <Field>
          <Label>Month</Label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
      </div>
      {lines.length === 0 ? (
        <div className="text-sm text-muted">Nothing to show for this month.</div>
      ) : (
        <div className="divide-y divide-line">
          {lines.map((l) => {
            const name = commissionExpenseName(l.name, month);
            const recorded = done.includes(name) || expenses.some((x) => x.name === name);
            return (
              <div key={l.employeeId} className="py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{l.name} <span className="text-muted font-normal">· {l.pct}% of {l.basis === "profit" ? "profit" : "sales"}</span></div>
                  <div className="text-xs text-muted mt-0.5">
                    {l.saleCount} {l.saleCount === 1 ? "sale" : "sales"} · sold <span className="num">{formatMoney(l.salesBase, currency)}</span>
                    {l.basis === "profit" && <> · profit on them <span className="num">{formatMoney(l.netBase, currency)}</span></>}
                    {l.returnsBase > 0 && <> · returns <span className="num">{formatMoney(l.returnsBase, currency)}</span></>}
                    {l.discountsBase > 0 && <> · discounts <span className="num">{formatMoney(l.discountsBase, currency)}</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="num font-medium">{formatMoney(l.earned, currency)}</div>
                  {recorded ? (
                    <Badge tone="good">Recorded</Badge>
                  ) : (
                    <Button type="button" variant="ghost" disabled={l.earned <= 0 || busyId === l.employeeId} onClick={() => record(l)}>
                      {busyId === l.employeeId ? "Recording…" : "Record as expense"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="text-[11px] text-muted mt-3">
        Recording adds a one-off &quot;Payroll &amp; labor&quot; expense dated today, so it lands in today&apos;s month. Record it when you pay it.
      </div>
    </Card>
  );
}
