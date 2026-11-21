"use client";

// The escalations for the signed-in business, computed once from the records already loaded (lib/escalations.ts). Used by the
// Escalations tab and by the Agenda, so the two always agree.
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { todayIso } from "@/lib/format";
import { escalationsFor, type Escalation } from "@/lib/escalations";
import { financialExceptions } from "@/lib/exceptions";

export function useEscalations(): Escalation[] {
  const { businessLog, incidents, qualityChecks, risks, requests, maintenanceItems, complianceItems, priceHistory, payablesAging, billsPayable, settings, sales } = useData();
  const today = todayIso();
  return useMemo(
    () => {
      const operational = escalationsFor(
        {
          decisions: businessLog.filter((e) => e.kind === "decision"),
          incidents: incidents.map((i) => ({ description: i.description, status: i.status, date: i.date })),
          qualityChecks,
          risks: risks.map((r) => ({ title: r.title, status: r.status, reviewOn: r.reviewOn })),
          requests: requests.map((r) => ({ title: r.title, status: r.status, createdAt: r.createdAt })),
          maintenance: maintenanceItems,
          compliance: complianceItems.map((c) => ({ name: c.name, expiresOn: c.expiresOn, reminderDays: c.reminderDays })),
        },
        today,
        Date.now()
      );
      // Financial exceptions: a large price change, or a payable overdue for more than a week (lib/exceptions.ts).
      const financial = financialExceptions(
        { priceChanges: priceHistory, payables: [...payablesAging.lines, ...billsPayable.lines], sales },
        today,
        Date.now(),
        settings.currency
      );
      return [...financial, ...operational].sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.severity] - ({ high: 0, medium: 1, low: 2 })[b.severity] || b.daysLate - a.daysLate);
    },
    [businessLog, incidents, qualityChecks, risks, requests, maintenanceItems, complianceItems, priceHistory, payablesAging, billsPayable, sales, settings.currency, today]
  );
}
