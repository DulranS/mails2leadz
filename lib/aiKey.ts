// Which key pays for the AI Assistant, decided per business (strategy, Nov 2026: SaaS accounts use their own AI keys).
//
// 1. A business with its own DeepSeek key saved and switched on (Integrations > AI assistant) always uses that key. Its
//    usage is billed by DeepSeek to the business, not to Balancr.
// 2. Otherwise the operator's DEEPSEEK_API_KEY is used ONLY for the businesses the operator runs, listed in
//    AI_OPERATOR_BUSINESS_IDS (comma-separated). Nobody else, not the public demo and not any other account, gets the
//    operator's key. Team members of a listed business work inside that business, so they are covered too.
// 3. Otherwise the AI Assistant says so and does not run.
//
// Server-only (reads the Admin SDK and the operator key). The pure rule is chooseAiKey, so it can be checked without I/O.
import { revealedValues, loadSecretKey, openValue } from "./secretBox";
import type { Firestore } from "firebase-admin/firestore";
import { AiAuthError } from "./firebaseAdmin";
import type { AccountKind } from "./guardrails";

export const AI_KEY_PROVIDER_ID = "ai_assistant";
export const AI_KEY_MISSING_MESSAGE =
  "The AI Assistant needs your own DeepSeek key. Add it on the Integrations page under AI assistant and switch it on.";

import { chooseAiKey, operatorBusinessIds, type ResolvedAiKey } from "./aiKeyRule";
export { chooseAiKey, operatorBusinessIds, type ResolvedAiKey };

export async function resolveAiKey(
  db: Firestore,
  businessId: string,
  accountKind: AccountKind,
  env: Record<string, string | undefined> = process.env
): Promise<ResolvedAiKey> {
  const snap = await db.doc(`users/${businessId}/integrations/${AI_KEY_PROVIDER_ID}`).get();
  const raw = snap.data() as { values?: Record<string, unknown>; enabled?: boolean } | undefined;
  const data = raw ? { enabled: raw.enabled, values: revealedValues(raw.values) } : undefined;
  const accountSnap = await db.doc(`users/${businessId}/meta/account`).get();
  const adminAccount = (accountSnap.data() as { adminAccount?: boolean } | undefined)?.adminAccount === true;
  const resolved = chooseAiKey({
    ownKey: data?.values?.apiKey,
    enabled: data?.enabled,
    accountKind,
    businessId,
    operatorIds: operatorBusinessIds(env),
    operatorKey: env.DEEPSEEK_API_KEY || (await storedOperatorKey(db, env)),
    adminAccount,
  });
  if (!resolved) throw new AiAuthError(AI_KEY_MISSING_MESSAGE, 402);
  return resolved;
}

// The operator's DeepSeek key saved from the admin panel (pass 308). Stored encrypted under BALANCR_ENC_KEY.
export async function storedOperatorKey(
  db: Firestore,
  env: Record<string, string | undefined> = process.env
): Promise<string | null> {
  const snap = await db.doc("system/operator_ai").get();
  const sealed = (snap.data() as { deepseekKey?: unknown } | undefined)?.deepseekKey;
  if (typeof sealed !== "string" || !sealed) return null;
  return openValue(sealed, loadSecretKey(env.BALANCR_ENC_KEY));
}
