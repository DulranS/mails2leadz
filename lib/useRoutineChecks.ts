"use client";

// The inputs the Routines checks read, gathered once from the live data and turned into checks (lib/routines.ts). A hook in
// its own file so the Routines page and the Dashboard hint always agree, and because a Next.js page file may not export it.
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { todayIso } from "@/lib/format";
import { computeRoutines, type RoutineCheck } from "@/lib/routines";

function addDays(iso: string, n: number) {
  return new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
}

// The inputs the checks read, gathered once. Shared with the Dashboard hint so both always agree.
export function useRoutineChecks(): RoutineCheck[] {
  const { sales, cashCounts, receivablesAging, payablesAging, billsPayable, collectionNotes, bankStatementLines, products, ledgers, stockAdjustments, settings } = useData();
  return useMemo(() => {
    const today = todayIso();
    const since = addDays(today, -30);
    const contacts: Record<string, string> = {};
    for (const n of collectionNotes) {
      if (n.subjectKind !== "customer") continue;
      if (!contacts[n.subjectKey] || n.date > contacts[n.subjectKey]) contacts[n.subjectKey] = n.date;
    }
    return computeRoutines({
      today,
      cashSalesLast30: sales.filter((s) => s.paymentMethod === "cash" && s.date > since && s.date <= today).length,
      cashCountDates: cashCounts.map((c) => c.date),
      overdueCustomerKeys: receivablesAging.lines.filter((l) => l.daysOverdue > 0 && l.amountOutstanding > 0).map((l) => (l.customer ?? "").trim().toLowerCase()),
      contactDatesByCustomer: contacts,
      outstandingPayables: [...payablesAging.lines, ...billsPayable.lines].filter((l) => l.amountOutstanding > 0).map((l) => ({ daysOverdue: l.daysOverdue })),
      bankLines: bankStatementLines.map((l) => ({ date: l.date, status: l.status })),
      stockItemsOnHand: products.filter((p) => p.type === "product" && p.active && (ledgers.get(p.id)?.qtyOnHand ?? 0) > 0).length,
      stockCountDates: stockAdjustments.filter((a) => a.reason === "count_correction").map((a) => a.date),
      booksClosedThrough: settings.booksClosedThrough,
    });
  }, [sales, cashCounts, receivablesAging, payablesAging, billsPayable, collectionNotes, bankStatementLines, products, ledgers, stockAdjustments, settings.booksClosedThrough]);
}
