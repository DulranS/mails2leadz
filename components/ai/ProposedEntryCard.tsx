"use client";

import { useRef, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { Badge, Button, Card } from "@/components/ui";
import { QuickSaleForm, QuickStockForm, QuickExpenseForm } from "@/components/QuickForms";
import { describeEntry } from "./entryDescribe";
import type { ProposedEntry } from "@/lib/aiTypes";
import { CashIcon, PackageIcon, ReceiptIcon } from "@/components/icons";

// Renders one AI-proposed entry pre-filled into the exact same
// QuickSaleForm/QuickStockForm/QuickExpenseForm used by the manual "I sold
// something" / "I bought stock" / "I paid a bill" quick actions — same
// validation, same useData().addSale/addPurchase/addExpense call, same
// audit trail. The AI never gets a shortcut past that path; it only ever
// gets to pre-fill the form a human still reviews and submits.
export function ProposedEntryCard({
  entry,
  onStatusChange,
}: {
  entry: ProposedEntry;
  // Called after the user confirms (via the embedded Quick*Form's own
  // submit — its button literally reads "Sell"/"Buy"/"Add expense") or
  // discards this proposal. The caller is responsible for persisting the
  // new status back to the stored chat message (see
  // AiAssistantContext.updateProposalStatus) — this component only owns
  // its own in-memory render state, so without a wired-up onStatusChange
  // a confirmed/discarded card would revert to its original "pending" form
  // the next time this message loads (e.g. reopening the chat).
  onStatusChange?: (status: "confirmed" | "discarded") => void;
}) {
  const { settings } = useData();
  const [status, setStatus] = useState<"pending" | "confirmed" | "discarded">(entry.status ?? "pending");
  const formWrapRef = useRef<HTMLDivElement>(null);

  const lowConfidence = entry.confidence !== undefined && entry.confidence < 0.6;
  const unmatchedProduct = (entry.kind === "sale" || entry.kind === "purchase") && !entry.matchedProductId;
  // A match that exists but is weak (below the bar lib/aiAutoConfirm.ts
  // requires to skip review), and any foreign-currency proposal — see
  // that file's isAutoConfirmable for the full reasoning. Both cases mean
  // "there's a form here to fill in, not just confirm": a foreign-currency
  // entry's exchange rate field only appears once the form is expanded
  // (CurrencyRateFields in components/QuickForms.tsx), so this can't stay
  // collapsed into a one-tap "Looks right" or the rate would never get set.
  const weakMatch =
    (entry.kind === "sale" || entry.kind === "purchase") &&
    Boolean(entry.matchedProductId) &&
    (entry.matchConfidence ?? 0) < 0.7;
  const foreignCurrency = (entry.kind === "sale" || entry.kind === "purchase") && Boolean(entry.currency);
  const needsAttention = lowConfidence || unmatchedProduct || weakMatch || foreignCurrency;

  // For a clean, high-confidence proposal the form is fully correct
  // already — the fastest, easiest path is one tap, not hunting for the
  // submit button at the bottom of a form that may run past the fold on a
  // phone. The form itself is still mounted (just visually collapsed), so
  // "Looks right" submits through the exact same <form onSubmit> as a
  // manual edit — same validation, same addSale/addPurchase/addExpense
  // call, same audit trail. Nothing about the underlying flow changes;
  // this only changes what's on screen by default. Anything that needs a
  // human decision (low confidence, no matched product) always opens
  // straight into the full form instead, since there's nothing to
  // one-tap-confirm yet.
  //
  // NOTE: these hooks must stay above the discarded/confirmed early
  // returns below — React requires the same hooks in the same order on
  // every render, and this component does return early for those two
  // statuses.
  const [expanded, setExpanded] = useState(needsAttention);
  // Guards against a double-tap firing two writes: requestSubmit() doesn't
  // return a promise, and the hidden form's own `busy` state only disables
  // *its* (invisible) submit button, not this one. A successful submit
  // unmounts this whole branch via `confirm()` below, so the timeout here
  // only matters as a fallback if the write fails (e.g. an oversell error
  // toast) and the card stays pending — it re-enables the button rather
  // than leaving it stuck forever.
  const [submitting, setSubmitting] = useState(false);

  function quickConfirm() {
    if (submitting) return;
    setSubmitting(true);
    formWrapRef.current?.querySelector("form")?.requestSubmit();
    setTimeout(() => setSubmitting(false), 4000);
  }

  // Once-only: clicking Sell/Buy/Add expense (or Discard) flips local
  // render state immediately so the button can't be clicked a second time,
  // and hands off to onStatusChange to persist it — see that prop's doc
  // comment above for why the persistence half matters.
  function confirm() {
    setStatus("confirmed");
    onStatusChange?.("confirmed");
  }
  function discard() {
    setStatus("discarded");
    onStatusChange?.("discarded");
  }

  const label = entry.kind === "sale" ? "Proposed sale" : entry.kind === "purchase" ? "Proposed purchase" : "Proposed expense";
  const Icon = entry.kind === "sale" ? CashIcon : entry.kind === "purchase" ? PackageIcon : ReceiptIcon;

  if (status === "discarded") {
    return (
      <Card className="opacity-60 py-3">
        <div className="text-xs text-muted">Discarded — {describeEntry(entry, settings.currency)}</div>
      </Card>
    );
  }

  if (status === "confirmed") {
    return (
      <Card className="border-good/30 py-3">
        <div className="flex items-center gap-2 text-sm text-good">
          <span>✓</span>
          <span>
            {entry.sourceNote === "Logged automatically" ? "Logged automatically" : "Logged"} — {describeEntry(entry, settings.currency)}
          </span>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted font-medium flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5" />
            {label}
          </div>
          <div className="text-sm text-fg mt-0.5">{describeEntry(entry, settings.currency)}</div>
        </div>
        {needsAttention && (
          <Badge tone="amber">{unmatchedProduct ? "pick a product" : foreignCurrency ? "set exchange rate" : "double-check"}</Badge>
        )}
      </div>

      {!expanded && (
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Button onClick={quickConfirm} disabled={submitting} className="flex-1 min-w-[140px]">
            {submitting ? "Logging…" : "✓ Looks right — log it"}
          </Button>
          <Button variant="ghost" onClick={() => setExpanded(true)} disabled={submitting}>
            Edit details
          </Button>
        </div>
      )}

      {/* The form stays mounted even while visually collapsed — collapsing
          only hides it (see the comment on `expanded` above for why), so
          "Looks right — log it" can submit the real, unmodified <form>
          rather than a duplicate write path. */}
      <div ref={formWrapRef} className={expanded ? undefined : "hidden"}>
        {entry.kind === "sale" && (
          <QuickSaleForm
            initial={{
              productId: entry.matchedProductId,
              qty: entry.qty,
              unitPrice: entry.unitPrice,
              currency: entry.currency,
              date: entry.date,
              customer: entry.customer,
              paymentMethod: entry.paymentMethod,
              notes: entry.notes,
            }}
            onDone={confirm}
          />
        )}
        {entry.kind === "purchase" && (
          <QuickStockForm
            initial={{
              productId: entry.matchedProductId,
              qty: entry.qty,
              unitCost: entry.unitCost,
              currency: entry.currency,
              date: entry.date,
              supplier: entry.supplier,
              notes: entry.notes,
              paymentMethod: entry.paymentMethod,
            }}
            onDone={confirm}
          />
        )}
        {entry.kind === "expense" && (
          <QuickExpenseForm
            initial={{
              name: entry.name,
              amount: entry.amount,
              category: entry.category,
              isRecurring: entry.isRecurring,
              date: entry.date,
            }}
            onDone={confirm}
          />
        )}
      </div>

      <button type="button" className="text-xs text-muted hover:text-bad mt-3" onClick={discard}>
        Discard this suggestion
      </button>
    </Card>
  );
}
