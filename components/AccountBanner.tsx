"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { daysUntilIso, formatDate } from "@/lib/format";
import { trialLastAccessIso, renewalLastAccessIso } from "@/lib/accountAccess";

// The one piece of account-management visibility this app was missing: an
// owner on a trial, or one whose manual billing renewal is coming up, had
// no way to see that inside the app at all — meta/account (see
// AccountStatus in lib/types.ts) is admin-set and owner-read, but nothing
// ever surfaced it. This is the proactive half of that; Settings has the
// full "Your plan" picture for whenever they go looking. Owner-only (the
// business's billing relationship isn't a manager/staff concern), and only
// appears when there's actually something time-sensitive to flag — no
// noise on a normal paid account with nothing due soon.
export default function AccountBanner() {
  const { role, plan, trialEndsAt, renewalDueDate, autoLockOverdue } = useAuth();
  if (role !== "owner") return null;

  // Trial takes priority over renewal — an account is either on a trial or
  // on a billing cycle, never meaningfully both at once in this model.
  if (trialEndsAt) {
    const days = daysUntilIso(trialEndsAt);
    if (days > 14) return null; // not worth mentioning yet
    const ended = days < 0;
    // After the trial date there's a short grace period, then the account
    // locks automatically (lib/accountAccess.ts) — tell them the actual day.
    const lastDay = trialLastAccessIso(trialEndsAt);
    return (
      <div
        className={`sticky top-0 z-40 text-xs sm:text-sm font-medium text-center py-2 px-4 ${
          ended ? "bg-bad text-white" : days <= 3 ? "bg-amber text-ink" : "bg-panel2 text-fg border-b border-line"
        }`}
      >
        {ended
          ? `Your trial ended ${formatDate(trialEndsAt)}${lastDay ? ` — access pauses after ${formatDate(lastDay)}` : ""}.`
          : days === 0
          ? "Your trial ends today."
          : `Your trial ends in ${days} day${days === 1 ? "" : "s"} (${formatDate(trialEndsAt)}).`}{" "}
        <Link href="/settings?tab=account" className="underline underline-offset-2">
          {ended ? "Get in touch to keep your access" : "See details"}
        </Link>
      </div>
    );
  }

  if (renewalDueDate) {
    const days = daysUntilIso(renewalDueDate);
    if (days > 7) return null;
    const overdue = days < 0;
    // Only when the admin switched auto-lock on for this account: say the real
    // last day so it never comes as a surprise.
    const lastDay = autoLockOverdue ? renewalLastAccessIso(renewalDueDate) : null;
    return (
      <div
        className={`sticky top-0 z-40 text-xs sm:text-sm font-medium text-center py-2 px-4 ${
          overdue ? "bg-bad text-white" : "bg-amber text-ink"
        }`}
      >
        {overdue
          ? `Your ${plan ?? "plan"} renewal was due ${formatDate(renewalDueDate)}${lastDay ? ` — access pauses after ${formatDate(lastDay)}` : ""}.`
          : days === 0
          ? `Your ${plan ?? "plan"} renewal is due today.`
          : `Your ${plan ?? "plan"} renewal is due in ${days} day${days === 1 ? "" : "s"} (${formatDate(renewalDueDate)}).`}{" "}
        <Link href="/settings?tab=account" className="underline underline-offset-2">
          See details
        </Link>
      </div>
    );
  }

  return null;
}
