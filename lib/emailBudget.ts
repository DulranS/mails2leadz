// A hard daily ceiling on emails that a STRANGER can cause us to send.
//
// The per-IP and per-address limits in app/api/trial-requests/route.ts slow one person down, but a
// determined troll with many connections and many Gmail addresses could still spend the whole Resend
// allowance (the free plan is only 100 emails a day) and damage the sending domain's reputation — and
// then the confirmation emails real prospects are waiting for, and the welcome emails customers need,
// stop arriving. This is the backstop: once the day's budget for a kind of public email is used up, no
// more of that kind go out until the next UTC day. Admin-triggered and cron emails (welcome, receipts,
// reminders, your digest) are NOT counted here and can never be starved by it.
//
// Two separate budgets, so spam on one form cannot use up the other's:
//   confirm  — "confirm your email" and "you already have an account", sent to whatever address was typed
//   feedback — the "someone left a note" nudge to your own inbox (the note itself is always saved)
//
// One counter document (platform/publicEmailBudget — no Firestore rule opens `platform`, so only the
// server can touch it), updated in a transaction. FAILS CLOSED: if the counter can't be read, the email
// is not sent — unlike the rate limiter, which fails open, because here the cost of a wrong "yes" is
// the very thing this exists to prevent and the cost of a wrong "no" is one delayed email.
import { getAdminDb } from "@/lib/firebaseAdmin";

export type PublicEmailKind = "confirm" | "feedback";

export const DEFAULT_PUBLIC_EMAIL_CAPS: Record<PublicEmailKind, number> = { confirm: 60, feedback: 30 };
const ENV_NAMES: Record<PublicEmailKind, string> = {
  confirm: "PUBLIC_EMAIL_CONFIRM_MAX_PER_DAY",
  feedback: "PUBLIC_EMAIL_FEEDBACK_MAX_PER_DAY",
};
export const BUDGET_DOC = "platform/publicEmailBudget";

export function dailyCap(kind: PublicEmailKind, env: Record<string, string | undefined> = process.env): number {
  const n = Math.floor(Number(env[ENV_NAMES[kind]]));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 1000) : DEFAULT_PUBLIC_EMAIL_CAPS[kind];
}

export interface BudgetDoc {
  day?: string;
  confirm?: number;
  feedback?: number;
}

// Pure: given what is stored, may one more email of this kind go out today, and what to store next.
export function nextBudget(
  stored: BudgetDoc | undefined,
  kind: PublicEmailKind,
  today: string,
  cap: number
): { ok: boolean; next: BudgetDoc } {
  const base: BudgetDoc = stored?.day === today ? stored : { day: today, confirm: 0, feedback: 0 };
  const used = base[kind] ?? 0;
  if (used >= cap) return { ok: false, next: base };
  return { ok: true, next: { ...base, day: today, [kind]: used + 1 } };
}

export async function reservePublicEmail(kind: PublicEmailKind, now = new Date()): Promise<boolean> {
  try {
    const db = getAdminDb();
    const ref = db.doc(BUDGET_DOC);
    const today = now.toISOString().slice(0, 10);
    const cap = dailyCap(kind);
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const verdict = nextBudget(snap.exists ? (snap.data() as BudgetDoc) : undefined, kind, today, cap);
      if (verdict.ok) tx.set(ref, verdict.next);
      return verdict.ok;
    });
  } catch (err) {
    console.error(`[emailBudget] could not check the ${kind} budget — not sending`, err);
    return false;
  }
}
