// Tells the OWNER (never a customer) when the AI provider is failing for a reason only the owner can fix.
//
// The customer-facing message for a provider failure is deliberately vague (lib/apiError.ts), and the
// real detail only goes to the server log. That is right for customers, but it leaves a gap: if the
// prepaid DeepSeek balance runs out, the key is revoked, or the model name is retired, the assistant
// quietly stops for everyone and the owner finds out from a customer, days later, if at all.
//
// So for exactly those failures (401 bad key, 402 empty balance, 403 blocked key, 404 model gone) one
// plain email goes to ADMIN_NOTIFICATION_EMAIL, at most once per UTC day. Busy (429), timeouts and 5xx
// are temporary and never email. One counter document (platform/aiProviderAlert; no Firestore rule opens
// `platform`, so only the server can touch it), claimed in a transaction so concurrent failures send one
// email, not many. It only ever tells; it changes nothing about any account. Best effort: any failure
// here is logged and swallowed, because it must never turn a handled AI error into a worse one.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { adminInbox } from "@/lib/envDefaults";
import { isEmailConfigured, sendEmail } from "@/lib/email";

export const ALERT_DOC = "platform/aiProviderAlert";

export function needsOwnerAttention(status?: number): boolean {
  return status === 401 || status === 402 || status === 403 || status === 404;
}

export function alertText(status: number | undefined): { subject: string; text: string } {
  const why =
    status === 402
      ? "The AI provider says the account balance is empty. Top up the DeepSeek balance."
      : status === 404
        ? "The AI provider does not recognise the model name. Set AI_MODEL in your host's environment variables to the current model name from the provider's docs, then redeploy."
        : "The AI provider refused the API key. Check DEEPSEEK_API_KEY in your host's environment variables and in the provider's dashboard.";
  return {
    subject: "Balancr: the AI assistant has stopped working",
    text:
      `${why}\n\n` +
      "What customers see: a short \"temporarily unavailable\" message, and those attempts do not use up their daily messages. " +
      "Everything else in Balancr keeps working.\n\n" +
      `Provider status code: ${status ?? "none"}. You get at most one of these emails a day.`,
  };
}

export async function alertOwnerOfAiProviderProblem(status: number | undefined): Promise<void> {
  try {
    const to = adminInbox();
    if (!to || !isEmailConfigured() || !needsOwnerAttention(status)) return;
    const db = getAdminDb();
    const ref = db.doc(ALERT_DOC);
    const day = new Date().toISOString().slice(0, 10);
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.data()?.day === day) return false;
      tx.set(ref, { day, status: status ?? null, at: new Date().toISOString() });
      return true;
    });
    if (!claimed) return;
    const { subject, text } = alertText(status);
    await sendEmail({ to, subject, text });
  } catch (err) {
    console.error("[aiProviderAlert] could not alert the owner", err);
  }
}
