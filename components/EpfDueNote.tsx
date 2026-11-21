"use client";
import { formatMoney } from "@/lib/format";
import { monthlyEpfEtfLiability } from "@/lib/calculations";
import { epfDueInfo, daysUntilDue, lateSurchargeRate, lateSurchargeAmount, EPF_DUE_CHECKED_ON } from "@/lib/epf-due";
import type { Employee } from "@/lib/types";

// The EPF/ETF figure for last month, when it is due, and the surcharge if it is late (pass 303).
export default function EpfDueNote({ employees, currency }: { employees: Employee[]; currency: string }) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const payMonth = prev.toISOString().slice(0, 7);
  const { date: due, holidaysChecked } = epfDueInfo(payMonth);
  const days = daysUntilDue(due, today);
  const amount = monthlyEpfEtfLiability(employees);
  const label = prev.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  if (amount <= 0) return null;
  const late = -days;
  const rate = lateSurchargeRate(late);
  const holidayNote = holidaysChecked
    ? "Holidays checked against the 2026 Sri Lanka calendar (subject to variation)."
    : "No holiday calendar is loaded for this year, so the date skips weekends only. Confirm with the EPF and ETF Boards.";
  return (
    <div className={`text-xs mt-2 ${days < 0 ? "text-bad" : days <= 5 ? "text-amber" : "text-muted"}`}>
      EPF/ETF for {label}, about {formatMoney(amount, currency)}, is due by {due}
      {days < 0 ? ` (overdue by ${late} day${late === 1 ? "" : "s"})` : days === 0 ? " (today)" : ` (${days} day${days === 1 ? "" : "s"} left)`}.
      {days < 0
        ? ` Surcharge so far: ${Math.round(rate * 100)}% of the contribution, about ${formatMoney(lateSurchargeAmount(amount, late), currency)}.`
        : " Late payment adds 5% of the contribution for the first 10 days, 15% up to a month, then more."}{" "}
      {holidayNote} The ETF deadline is the same day. Checked {EPF_DUE_CHECKED_ON}.
    </div>
  );
}
