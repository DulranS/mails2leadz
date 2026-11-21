// The pure rule for which AI key an account uses (no I/O), split out so it can be checked offline.
// The rules themselves are documented in lib/aiKey.ts.
import type { AccountKind } from "./guardrails";

export interface ResolvedAiKey {
  apiKey: string;
  source: "own" | "operator";
}

export function operatorBusinessIds(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set(
    (env.AI_OPERATOR_BUSINESS_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function chooseAiKey(input: {
  ownKey?: string | null;
  enabled?: boolean;
  // Kept for callers that pass it; the rule no longer depends on the account kind (the demo gets no operator key).
  accountKind?: AccountKind;
  businessId: string;
  operatorIds: Set<string>;
  operatorKey?: string | null;
  // Admin accounts (pass 308) may use the operator's key, like the businesses listed in AI_OPERATOR_BUSINESS_IDS.
  adminAccount?: boolean;
}): ResolvedAiKey | null {
  const own = (input.ownKey ?? "").trim();
  if (own && input.enabled === true) return { apiKey: own, source: "own" };
  const operatorKey = (input.operatorKey ?? "").trim();
  const operatorAllowed = input.operatorIds.has(input.businessId) || input.adminAccount === true;
  if (operatorKey && operatorAllowed) return { apiKey: operatorKey, source: "operator" };
  return null;
}

