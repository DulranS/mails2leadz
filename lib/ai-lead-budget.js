// lib/ai-lead-budget.js - the per-lead AI spend meter and cap (pass 329). Pure: no I/O.
// Each lead-linked AI call is recorded against that lead, keyed by a hash of its email, so the meter holds no address.
// A lead that has used its budget gets no more AI calls; the owner writes that one by hand.
import crypto from 'node:crypto';

export const DEFAULT_LEAD_BUDGET_USD = 0.5;

/** A stable, non-reversible key for one lead: the lower-cased email, hashed. Null when there is no email. */
export function leadKeyFor(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  return crypto.createHash('sha256').update(e).digest('hex').slice(0, 32);
}

/** Whether a lead has used up its AI budget. A missing or zero budget uses the default. */
export function leadBudgetState({ costUsd = 0, budgetUsd = DEFAULT_LEAD_BUDGET_USD } = {}) {
  const spent = Number(costUsd) || 0;
  const cap = Number(budgetUsd) > 0 ? Number(budgetUsd) : DEFAULT_LEAD_BUDGET_USD;
  return { spent, cap, over: spent >= cap, remaining: Math.max(0, cap - spent) };
}
