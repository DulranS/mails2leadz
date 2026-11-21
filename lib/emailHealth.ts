// Remembers the outcome of the last email of each kind, so the admin panel can show a failure instead of the
// visitor's silent "check your email" page. Server-only (Admin SDK). Never throws: recording a result must
// never break the request that produced it.
import { getAdminDb } from "@/lib/firebaseAdmin";

export const EMAIL_HEALTH_DOC = "platform/emailHealth";

export type EmailKind = "trialConfirmation";

export interface EmailOutcome {
  ok: boolean;
  // Plain words for the admin, from explainEmailFailure or a fixed reason. Null on success.
  reason: string | null;
  at: string; // ISO time
}

export async function recordEmailOutcome(kind: EmailKind, outcome: { ok: boolean; reason?: string | null }): Promise<void> {
  try {
    const entry: EmailOutcome = { ok: outcome.ok, reason: outcome.ok ? null : outcome.reason ?? "Unknown reason", at: new Date().toISOString() };
    await getAdminDb().doc(EMAIL_HEALTH_DOC).set({ [kind]: entry }, { merge: true });
  } catch (err) {
    console.warn("[emailHealth] could not record the outcome", err);
  }
}

export async function readEmailHealth(): Promise<Partial<Record<EmailKind, EmailOutcome>>> {
  try {
    const snap = await getAdminDb().doc(EMAIL_HEALTH_DOC).get();
    return (snap.data() as Partial<Record<EmailKind, EmailOutcome>> | undefined) ?? {};
  } catch {
    return {};
  }
}
