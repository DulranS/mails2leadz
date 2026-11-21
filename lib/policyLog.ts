// Accounting policy changes (pass 350). A change to a setting that alters how past or future figures are worked out is written to the audit
// log under this entity, so the owner can see it and the red flag can count it. The cost-of-goods method is audited where it is changed
// (DataContext.updateSettings) under the same entity. Pure.

export const POLICY_ENTITY = "accounting policy";
export const POLICY_WINDOW_DAYS = 365;
export const FREQUENT_POLICY_CHANGES = 2;

export const ACCOUNTING_POLICY_SETTINGS = [
  { key: "taxRatePct", label: "Income tax rate", kind: "number" },
  { key: "salesTaxEnabled", label: "Sales tax charged", kind: "boolean" },
  { key: "salesTaxRatePct", label: "Sales tax rate", kind: "number" },
] as const;

export interface PolicyChange { key: string; label: string; from: string; to: string }

const norm = (kind: "number" | "boolean", v: unknown): unknown =>
  kind === "boolean" ? Boolean(v) : v === undefined || v === null || v === "" ? null : Number(v);
const show = (kind: "number" | "boolean", v: unknown): string =>
  kind === "boolean" ? (v ? "on" : "off") : v === undefined || v === null || v === "" ? "not set" : String(v);

/** The settings in one save that differ from what was stored. A setting not in the save is not a change. */
export function policyChanges(prev: Record<string, unknown>, next: Record<string, unknown>): PolicyChange[] {
  const out: PolicyChange[] = [];
  for (const { key, label, kind } of ACCOUNTING_POLICY_SETTINGS) {
    if (next[key] === undefined) continue;
    if (norm(kind, prev[key]) === norm(kind, next[key])) continue;
    out.push({ key, label, from: show(kind, prev[key]), to: show(kind, next[key]) });
  }
  return out;
}

export function policySummary(c: PolicyChange): string {
  return `${c.label} changed from ${c.from} to ${c.to}`;
}

/** How many policy changes were logged in the last year. */
export function policyChangesInWindow(entries: ReadonlyArray<{ at: number; entity: string }>, nowMs: number): number {
  const since = nowMs - POLICY_WINDOW_DAYS * 86400000;
  return entries.filter((e) => e && e.entity === POLICY_ENTITY && Number(e.at) >= since).length;
}

/** The depreciation method in words, for the audit log. */
export const depreciationMethodLabel = (m: string | undefined): string => (m === "reducing_balance" ? "reducing balance" : "straight line");
