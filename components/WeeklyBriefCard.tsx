"use client";

// Owner or manager: writes a short brief of the last seven days from figures computed on this page. It shows the figures
// beside the text, so the owner can check every number. Nothing is saved or sent.
import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, todayIso } from "@/lib/format";
import { buildBriefFacts, type BriefFacts } from "@/lib/ownerBrief";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";
import { Card, Button } from "@/components/ui";

export default function WeeklyBriefCard() {
  const { user, businessId, role } = useAuth();
  const data = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [facts, setFacts] = useState<BriefFacts | null>(null);
  const today = todayIso();
  const preview = useMemo(
    () =>
      buildBriefFacts({
        sales: data.sales,
        payments: data.receivablePayments,
        expenses: data.expenses,
        leads: data.leads,
        returns: data.saleReturns,
        discounts: data.discounts,
        today,
      }),
    [data.sales, data.receivablePayments, data.expenses, data.leads, data.saleReturns, data.discounts, today]
  );
  if (role !== "owner" && role !== "manager") return null;
  const currency = data.settings.currency;

  async function write() {
    setBusy(true);
    try {
      if (!user) throw new Error("Sign in again to write the brief.");
      const idToken = await user.getIdToken();
      const res = await fetch("/api/ai/brief", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${idToken}`,
          ...(businessId ? { [BUSINESS_ID_HEADER]: businessId } : {}),
        },
        body: JSON.stringify({ facts: preview }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Couldn't write the brief.");
      setText(String(payload.text));
      setFacts(preview);
    } catch (err) {
      toast.error("Couldn't write the brief", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, string][] = [
    ["Sales, last 7 days", `${formatMoney(preview.salesThisWeek, currency)} (${preview.salesCountThisWeek} lines)`],
    ["Sales, the 7 days before", formatMoney(preview.salesLastWeek, currency)],
    ["Customer payments received", formatMoney(preview.cashCollectedThisWeek, currency)],
    ["One-off expenses this week", formatMoney(preview.oneOffExpensesThisWeek, currency)],
    ["Overdue balances", `${formatMoney(preview.overdueOwed, currency)} (${preview.overdueInvoices} invoices)`],
    ["New leads", String(preview.newLeadsThisWeek)],
  ];

  return (
    <Card className="mb-4 !p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">This week in brief</div>
          <div className="text-xs text-muted">Written from the figures below. Nothing is saved or sent.</div>
        </div>
        <Button onClick={write} disabled={busy}>
          {busy ? "Writing…" : text ? "Write again" : "Write brief"}
        </Button>
      </div>
      {text && <p className="text-sm mt-3 leading-relaxed">{text}</p>}
      <details className="mt-3" open={!text}>
        <summary className="text-xs text-muted cursor-pointer">The figures this brief uses</summary>
        <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-muted">{label}</dt>
              <dd className="num">{value}</dd>
            </div>
          ))}
        </dl>
        {facts && <div className="text-[11px] text-muted mt-2">Figures as of {today}.</div>}
      </details>
    </Card>
  );
}
