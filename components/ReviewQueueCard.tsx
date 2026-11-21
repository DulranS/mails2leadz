"use client";

// Owner review: the large discounts, expenses, sales returns and cash refunds a team member made, until someone marks them
// checked. It flags only (nothing is reversed). Settings > "Ask me to check..." sets the amount. Owner and Manager see it.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/format";
import { reviewQueue } from "@/lib/reviewQueue";
import { Button, Card } from "@/components/ui";

const SHOW = 8;

export default function ReviewQueueCard() {
  const { settings, discounts, expenses, saleReturns, customerDeposits, members, reviewMarks, markReviewed } = useData();
  const { role } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const canMark = can(role, "manage:products");
  const money = (n: number) => formatMoney(n, settings.currency);

  const items = useMemo(
    () =>
      reviewQueue({
        threshold: settings.reviewAbove ?? 0,
        discounts,
        expenses,
        returns: saleReturns,
        deposits: customerDeposits,
        members,
        marks: reviewMarks,
      }),
    [settings.reviewAbove, discounts, expenses, saleReturns, customerDeposits, members, reviewMarks]
  );

  if (!canMark || items.length === 0) return null;

  async function check(key: string) {
    setBusy(key);
    try {
      await markReviewed(key);
    } catch (e) {
      toast.error("Couldn't mark that as checked", toastableErrorMessage(e));
    }
    setBusy(null);
  }

  const shown = showAll ? items : items.slice(0, SHOW);

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium">To check: {items.length} large entr{items.length === 1 ? "y" : "ies"} from your team</div>
        <div className="text-xs text-muted">Over {money(settings.reviewAbove ?? 0)}. Marking one checked changes nothing else.</div>
      </div>
      <div className="divide-y divide-line mt-2">
        {shown.map((it) => (
          <div key={it.key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
            <div className="min-w-0">
              <div className="text-sm break-words">{it.what}</div>
              <div className="text-muted mt-0.5">
                {it.byName} · {it.date}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm">{money(it.amount)}</span>
              <Button variant="ghost" className="text-xs" disabled={busy !== null} onClick={() => check(it.key)}>
                {busy === it.key ? "Saving…" : "Looks right"}
              </Button>
            </div>
          </div>
        ))}
      </div>
      {items.length > SHOW && (
        <button type="button" className="text-xs text-muted hover:text-fg mt-2" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </Card>
  );
}
