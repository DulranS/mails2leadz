"use client";

// The owner's "Your plan" card (Settings → Account). Billing is manual — the
// platform owner records payments by hand — so this card's job is to leave the
// customer with no open questions: what they're on, what it costs, when it renews,
// what happens if it lapses, how to pay, and proof of what they've already paid.
//
// Payment history is read from users/{id}/meta/billingHistory, which the rules allow
// for the OWNER only (a Manager has no business seeing what the software costs).
// If the read is refused or the doc doesn't exist yet, the section simply doesn't
// render — it never blocks the rest of the card.

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { getFirebase } from "@/lib/firebase";
import { Badge, Card } from "@/components/ui";
import SupportContact from "@/components/SupportContact";
import { formatDate, formatMoney, daysUntilIso } from "@/lib/format";
import { renewalLastAccessIso, trialLastAccessIso } from "@/lib/accountAccess";
import { PAYMENT_METHOD_LABELS, type BillingPayment } from "@/lib/billing";
import { PRICING_CURRENCY } from "@/lib/pricing";

const PAYMENT_INSTRUCTIONS = (process.env.NEXT_PUBLIC_PAYMENT_INSTRUCTIONS ?? "").trim();

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm text-right">{children}</span>
    </div>
  );
}

export default function PlanCard() {
  const {
    businessId,
    plan,
    billingAmount,
    billingCycle,
    renewalDueDate,
    lastPaidAt,
    trialEndsAt,
    autoLockOverdue,
    complimentary,
  } = useAuth();
  const [payments, setPayments] = useState<BillingPayment[] | null>(null);

  useEffect(() => {
    if (!businessId || complimentary) return;
    let cancelled = false;
    (async () => {
      try {
        const { db } = getFirebase();
        const snap = await getDoc(doc(db, "users", businessId, "meta", "billingHistory"));
        const list = (snap.data() as { payments?: BillingPayment[] } | undefined)?.payments ?? [];
        if (!cancelled) setPayments(list.slice().reverse());
      } catch {
        // Not the owner, or offline — just don't show history.
        if (!cancelled) setPayments(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId, complimentary, lastPaidAt]);

  const nothingOnFile = !plan && !trialEndsAt && !renewalDueDate && !lastPaidAt && billingAmount == null;
  // Payment instructions appear when payment is actually near: the last week of a trial
  // (day 1 of a "no card needed" trial shouldn't already be asking for money) or within
  // two weeks of a renewal, and always once either date has passed.
  const needsToPay =
    (!!trialEndsAt && daysUntilIso(trialEndsAt) <= 7) ||
    (!trialEndsAt && !!renewalDueDate && daysUntilIso(renewalDueDate) <= 14);

  return (
    <Card className="max-w-md">
      <div className="text-sm font-medium mb-1">Your plan</div>
      <div className="text-xs text-muted mb-4">
        Billing here is handled directly rather than through an automatic payment gateway — this is what&apos;s on
        file for this account.
      </div>

      {complimentary ? (
        <div className="text-sm text-muted">
          This account is complimentary — there&apos;s nothing to pay and no renewal date.
        </div>
      ) : nothingOnFile ? (
        <div className="text-sm text-muted">
          No billing details on file yet — nothing to worry about, just ask whoever set up this account if you need to
          know more.
        </div>
      ) : (
        <div className="space-y-3">
          {plan && <Row label="Plan"><span className="font-medium">{plan}</span></Row>}
          {billingAmount != null && (
            <Row label="Billing">
              {/* Platform prices are always in PRICING_CURRENCY — the business's own
                  display currency (Settings → Currency) is unrelated to what it pays. */}
              {formatMoney(billingAmount, PRICING_CURRENCY)} / {billingCycle === "annual" ? "year" : billingCycle === "monthly" ? "month" : "cycle"}
            </Row>
          )}
          {trialEndsAt && (
            <Row label="Trial ends">
              <Badge tone={daysUntilIso(trialEndsAt) < 0 ? "bad" : daysUntilIso(trialEndsAt) <= 7 ? "amber" : "default"}>
                {formatDate(trialEndsAt)}
              </Badge>
            </Row>
          )}
          {trialEndsAt && trialLastAccessIso(trialEndsAt) && (
            <Row label="Access continues until">
              <span className="text-muted">{formatDate(trialLastAccessIso(trialEndsAt) as string)}</span>
            </Row>
          )}
          {renewalDueDate && (
            <Row label="Next renewal due">
              <Badge tone={daysUntilIso(renewalDueDate) < 0 ? "bad" : daysUntilIso(renewalDueDate) <= 7 ? "amber" : "default"}>
                {formatDate(renewalDueDate)}
              </Badge>
            </Row>
          )}
          {autoLockOverdue && !trialEndsAt && renewalDueDate && renewalLastAccessIso(renewalDueDate) && (
            <Row label="Access continues until (if unpaid)">
              <span className="text-muted">{formatDate(renewalLastAccessIso(renewalDueDate) as string)}</span>
            </Row>
          )}
          {lastPaidAt && (
            <Row label="Last payment recorded">
              <span className="text-muted">
                {new Date(lastPaidAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
            </Row>
          )}
        </div>
      )}

      {!complimentary && needsToPay && PAYMENT_INSTRUCTIONS && (
        <div className="mt-4 rounded-md border border-line bg-panel2/40 px-3 py-2.5">
          <div className="text-xs font-medium text-fg mb-0.5">How to pay</div>
          <div className="text-xs text-muted whitespace-pre-line">{PAYMENT_INSTRUCTIONS}</div>
          <div className="text-[11px] text-muted mt-1.5">
            Once you&apos;ve paid, send a quick note — your account is updated straight away.
          </div>
        </div>
      )}

      {payments && payments.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-medium text-fg mb-1.5">Payment history</div>
          <ul className="divide-y divide-line border border-line rounded-md">
            {payments.slice(0, 6).map((p) => (
              <li key={p.id} className="px-3 py-2 flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="text-fg">
                    {formatMoney(p.amount, PRICING_CURRENCY)}
                    <span className="text-muted"> · {new Date(p.at).toLocaleDateString()}</span>
                  </div>
                  <div className="text-muted truncate">
                    {PAYMENT_METHOD_LABELS[p.method]}
                    {p.reference ? ` · ref ${p.reference}` : ""}
                  </div>
                </div>
                <div className="text-muted text-right shrink-0">paid until {formatDate(p.coveredUntil)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-dashed border-line text-[11px] text-muted">
        Questions about billing or your plan? Get in touch with whoever set up this account.
        <SupportContact className="!justify-start mt-2 !text-xs" prefill="Hi, I have a question about my Balancr plan." />
      </div>
    </Card>
  );
}
