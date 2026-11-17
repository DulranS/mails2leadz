// lib/server/ai-operator-keys.js - the rule for WHO may use the operator's own AI keys. Pure (no I/O), so it can be tested offline.
//
// The operator's DeepSeek / OpenAI / Anthropic keys (the server's or the ones saved in the app) are never a default for anyone.
//  * SaaS mode (SAAS_MODE=on): only the accounts listed in AI_OPERATOR_UIDS (the operator's own Firebase uid, comma-separated).
//    Team members work inside the owner's account, so their requests carry the owner's uid and are covered by the same check.
//  * Self-hosted (SAAS_MODE off): the install belongs to its owner, so its keys are the owner's own.
// Every other account must save its own AI key (Integrations), encrypted per account.
import { saasEnabled } from '../tenant.js';

/** The operator's account ids from AI_OPERATOR_UIDS. Blank entries are ignored. */
export function operatorUids(env = process.env) {
  return new Set(String(env.AI_OPERATOR_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean));
}

/** May this account use the operator's AI keys? See the header. */
export function operatorKeysAllowed(uid, env = process.env, saas = saasEnabled(env)) {
  if (!saas) return true;
  return !!uid && operatorUids(env).has(String(uid));
}
