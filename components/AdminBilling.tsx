"use client";

// The two billing pieces of the admin "Manage accounts" card that used to be a
// single confirm() dialog and a timestamp:
//
//   RecordPaymentForm — replaces "Mark paid?" with a small form (plan, cycle,
//   amount, method, reference) that shows exactly where the renewal date is
//   going BEFORE anything is written. The same form handles a trial's first
//   payment (Convert to paid), so there is one way to take money, not two.
//
//   PaymentHistory — the list of recorded payments with a receipt to copy for the
//   customer and an Undo for the latest one (an accidental record used to mean
//   hand-editing the renewal date and remembering the old value).
//
// Nothing here talks to a payment processor or sends anything: the admin takes
// the money however it really arrives and records it. Rules: lib/billing.ts.
// Endpoint: app/api/admin/businesses/[businessId]/billing.

import { useEffect, useState, type FormEvent } from "react";
import { Button, Input, Label, Select } from "@/components/ui";
import {
  PAYMENT_METHOD_LABELS,
  nextRenewalDate,
  receiptMessage,
  type BillingPayment,
  type PaymentMethod,
} from "@/lib/billing";
import { PRICING_CURRENCY, TIERS, periodAmount, tierById, type BillingCycle } from "@/lib/pricing";

export interface BillingBusiness {
  businessId: string;
  ownerName: string;
  businessName: string | null;
  plan: string | null;
  billingAmount: number | null;
  billingCycle?: BillingCycle | null;
  renewalDueDate: string | null;
  trialEndsAt: string | null;
  autoLockOverdue: boolean;
}

const OTHER = "__other__";

function money(n: number): string {
  return `${PRICING_CURRENCY} ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function RecordPaymentForm({
  business,
  passcode,
  onRecorded,
  onCancel,
}: {
  business: BillingBusiness;
  passcode: string;
  onRecorded: () => void;
  onCancel: () => void;
}) {
  const existingTier = tierById(business.plan);
  const [planChoice, setPlanChoice] = useState<string>(
    existingTier ? existingTier.id : business.plan ? OTHER : ""
  );
  const [customPlan, setCustomPlan] = useState(existingTier ? "" : business.plan ?? "");
  const [cycle, setCycle] = useState<BillingCycle>(business.billingCycle ?? "monthly");
  const [amount, setAmount] = useState(
    business.billingAmount != null
      ? String(business.billingAmount)
      : existingTier
      ? String(periodAmount(existingTier, business.billingCycle ?? "monthly"))
      : ""
  );
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [paidUntilOverride, setPaidUntilOverride] = useState("");
  // Recommended default for a first payment: an unpaid renewal is then enforced
  // by the system instead of by remembering to chase it. Only offered while the
  // account has no setting yet; an existing choice is never overridden.
  const [autoLock, setAutoLock] = useState(true);
  // On by default: the customer is emailed a receipt the moment this is saved, so the admin
  // never has to type "got it, thanks" by hand. Untick for a payment you'd rather confirm yourself.
  const [emailReceipt, setEmailReceipt] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<BillingPayment | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<string>("skipped");
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");

  const planName = planChoice === OTHER ? customPlan.trim() : planChoice;
  const tier = tierById(planName);
  const computedUntil = nextRenewalDate(business.renewalDueDate, cycle, new Date());
  const paidUntil = paidUntilOverride || computedUntil;
  const isFirst = !business.renewalDueDate;

  // Picking a plan or cycle re-suggests the public list price. The admin can
  // still overwrite it — an agreed discount is normal, silently keeping a stale
  // number after a plan change is not.
  function suggest(nextTierId: string, nextCycle: BillingCycle) {
    const t = tierById(nextTierId);
    if (t) setAmount(String(periodAmount(t, nextCycle)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter the amount you received.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/businesses/${business.businessId}/billing`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify({
          recordPayment: {
            amount: parsed,
            ...(planName ? { plan: planName } : {}),
            cycle,
            method,
            reference,
            ...(paidUntilOverride ? { renewalDueDate: paidUntilOverride } : {}),
            ...(!business.autoLockOverdue ? { autoLockOverdue: autoLock } : {}),
          },
          notifyCustomer: emailReceipt,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't record the payment.");
      setReceiptStatus(typeof data.receiptEmail === "string" ? data.receiptEmail : "skipped");
      setDone(data.payment as BillingPayment);
      onRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record the payment.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const receipt = receiptMessage(done, {
      ownerName: business.ownerName,
      businessName: business.businessName,
      currency: PRICING_CURRENCY,
    });
    return (
      <div className="mt-3 rounded-md border border-good/30 bg-good/10 px-3 py-3 text-xs">
        <div className="text-good font-medium">
          Recorded {money(done.amount)} — paid until {fmtDate(done.coveredUntil)}.
        </div>
        <div className="text-muted mt-1">
          They&apos;re unlocked straight away if they were locked.{" "}
          {receiptStatus === "sent"
            ? "A receipt has been emailed to them."
            : receiptStatus === "skipped"
            ? "No receipt was emailed — send one yourself if you like:"
            : receiptStatus === "not_configured"
            ? "Automatic email isn't switched on, so no receipt went out — send one yourself:"
            : "The receipt email couldn't be sent — send one yourself:"}
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            onClick={async () => {
              setCopied((await copyText(receipt)) ? "copied" : "failed");
              setTimeout(() => setCopied("idle"), 2500);
            }}
          >
            {copied === "copied" ? "Copied ✓" : copied === "failed" ? "Copy failed" : "Copy receipt"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2.5 rounded-md border border-line bg-panel2/40 p-3">
      <div className="text-xs font-medium text-fg">
        {isFirst || business.trialEndsAt ? "Record first payment" : "Record a payment"}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <Label>Plan</Label>
          <Select
            value={planChoice}
            onChange={(e) => {
              setPlanChoice(e.target.value);
              setPaidUntilOverride("");
              suggest(e.target.value, cycle);
            }}
          >
            <option value="">Choose a plan…</option>
            {TIERS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value={OTHER}>Other / custom</option>
          </Select>
        </div>
        <div>
          <Label>Cycle</Label>
          <Select
            value={cycle}
            onChange={(e) => {
              const c = e.target.value as BillingCycle;
              setCycle(c);
              setPaidUntilOverride("");
              suggest(planChoice, c);
            }}
          >
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </Select>
        </div>
      </div>
      {planChoice === OTHER && (
        <Input value={customPlan} onChange={(e) => setCustomPlan(e.target.value)} placeholder="Plan name, e.g. Custom — retail chain" />
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <Label>Amount received ({PRICING_CURRENCY})</Label>
          <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="4900" />
        </div>
        <div>
          <Label>Paid via</Label>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {tier && (
        <div className="text-[11px] text-muted -mt-1">
          {tier.name} list price: {money(periodAmount(tier, cycle))} / {cycle === "annual" ? "year" : "month"} — change the
          amount above if you agreed something different.
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <Label>Reference (optional)</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank ref / receipt no." maxLength={120} />
        </div>
        <div>
          <Label>Paid until</Label>
          <Input type="date" value={paidUntil} onChange={(e) => setPaidUntilOverride(e.target.value)} />
        </div>
      </div>
      <div className="text-[11px] text-muted">
        {business.renewalDueDate
          ? `Renewal moves from ${fmtDate(business.renewalDueDate)} to ${fmtDate(paidUntil)}.`
          : `Renewal will be set to ${fmtDate(paidUntil)}.`}
        {business.trialEndsAt ? " Their trial is closed and they become a paying account." : ""}
      </div>
      {!business.autoLockOverdue && (
        <label className="flex items-start gap-2 text-xs text-muted cursor-pointer">
          <input type="checkbox" checked={autoLock} onChange={(e) => setAutoLock(e.target.checked)} className="mt-0.5" />
          <span>
            Lock this account automatically if a renewal goes 7 days unpaid (recommended — you won&apos;t have to chase
            or remember; recording their payment unlocks it instantly).
          </span>
        </label>
      )}
      <label className="flex items-start gap-2 text-xs text-muted cursor-pointer">
        <input type="checkbox" checked={emailReceipt} onChange={(e) => setEmailReceipt(e.target.checked)} className="mt-0.5" />
        <span>Email them a receipt now (amount, plan, and what they&apos;re covered until).</span>
      </label>
      {error && <div className="text-xs text-bad bg-bad/10 border border-bad/30 rounded-md px-3 py-2">{error}</div>}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={busy} className="flex-1">
          {busy ? "Recording…" : "Record payment"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function PaymentHistory({
  business,
  passcode,
  reloadKey,
  onChanged,
}: {
  business: BillingBusiness;
  passcode: string;
  reloadKey: number;
  onChanged: () => void;
}) {
  const [payments, setPayments] = useState<BillingPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch(`/api/admin/businesses/${business.businessId}/billing`, {
        headers: { "x-admin-passcode": passcode },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't load the payment history.");
      setPayments(data.payments as BillingPayment[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the payment history.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  async function undo() {
    if (!payments?.[0]) return;
    const p = payments[0];
    if (!confirm(`Undo the ${money(p.amount)} payment recorded on ${new Date(p.at).toLocaleDateString()}? The renewal date goes back to what it was before.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/businesses/${business.businessId}/billing`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify({ undoLastPayment: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't undo the payment.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't undo the payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 text-xs">
      {error && <div className="text-bad bg-bad/10 border border-bad/30 rounded-md px-3 py-2 mb-2">{error}</div>}
      {!payments && !error && <div className="text-muted">Loading payments…</div>}
      {payments && payments.length === 0 && (
        <div className="text-muted">No payments recorded yet — use Record payment when one comes in.</div>
      )}
      {payments && payments.length > 0 && (
        <ul className="divide-y divide-line border border-line rounded-md">
          {payments.map((p, i) => (
            <li key={p.id} className="px-3 py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-fg">
                  {money(p.amount)}
                  <span className="text-muted"> · {new Date(p.at).toLocaleDateString()} · {PAYMENT_METHOD_LABELS[p.method]}</span>
                </div>
                <div className="text-muted mt-0.5 truncate">
                  {p.plan ? `${p.plan} · ` : ""}
                  paid until {fmtDate(p.coveredUntil)}
                  {p.reference ? ` · ref ${p.reference}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const ok = await copyText(
                      receiptMessage(p, {
                        ownerName: business.ownerName,
                        businessName: business.businessName,
                        currency: PRICING_CURRENCY,
                      })
                    );
                    setCopiedId(ok ? p.id : null);
                    setTimeout(() => setCopiedId(null), 2000);
                  }}
                >
                  {copiedId === p.id ? "Copied ✓" : "Receipt"}
                </Button>
                {i === 0 && (
                  <Button variant="ghost" disabled={busy} onClick={undo}>
                    Undo
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
