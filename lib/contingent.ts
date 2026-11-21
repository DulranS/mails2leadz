// Contingent liabilities and commitments (v329). Things that could cost the business money but are not yet owed: a guarantee given
// for someone else's debt, a claim or lawsuit, a disputed tax assessment, or a signed commitment to buy or pay later.
//
// They are shown as a MEMO on the balance sheet and are NOT added to liabilities. A liability is recognised when the outflow is
// probable and can be measured (the IAS 37 / SLFRS 137 approach). Until then the item is disclosed, not booked. The owner or their
// adviser decides whether an item has crossed that line; this module only records it and totals the open exposure.
//
// Pure: no I/O.

export const CONTINGENCY_KINDS = ["guarantee", "litigation", "tax_dispute", "commitment", "other"] as const;
export type ContingencyKind = (typeof CONTINGENCY_KINDS)[number];

export const CONTINGENCY_KIND_LABELS: Record<ContingencyKind, string> = {
  guarantee: "Guarantee given",
  litigation: "Claim or lawsuit",
  tax_dispute: "Disputed tax",
  commitment: "Commitment to pay",
  other: "Other",
};

export const CONTINGENCY_STATUSES = ["open", "settled"] as const;
export type ContingencyStatus = (typeof CONTINGENCY_STATUSES)[number];

export interface Contingency {
  id: string;
  description: string;
  kind: ContingencyKind;
  amount: number; // the most the business could have to pay, base currency
  status: ContingencyStatus;
  date: string; // ISO yyyy-mm-dd: when it arose
  counterparty?: string;
  note?: string;
  createdAt: number;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s: unknown, max: number): string =>
  String(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * One item, checked and cleaned. Returns null when there is no description or the amount is not a positive number.
 * A new item is always "open". Only an existing item can be settled.
 */
export function sanitizeContingency(
  input: Partial<Record<keyof Contingency, unknown>> = {},
  { today }: { today: string }
): Omit<Contingency, "id" | "createdAt"> | null {
  const description = clean(input.description, 300);
  if (!description) return null;
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const kind = (CONTINGENCY_KINDS as readonly string[]).includes(String(input.kind))
    ? (input.kind as ContingencyKind)
    : "other";
  const date = ISO_RE.test(String(input.date ?? "")) ? String(input.date) : today;
  const counterparty = clean(input.counterparty, 120);
  const note = clean(input.note, 500);
  return {
    description,
    kind,
    amount,
    status: "open",
    date,
    ...(counterparty ? { counterparty } : {}),
    ...(note ? { note } : {}),
  };
}

/** Total of the open items, rounded to the cent. Items that are settled, or have no usable amount, are left out. */
export function openContingencyTotal(list: readonly Pick<Contingency, "amount" | "status">[] = []): number {
  const total = list.reduce((sum, c) => {
    const amount = Number(c?.amount);
    return c?.status === "open" && Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
  }, 0);
  return Math.round(total * 100) / 100;
}

/** The open items, largest first. */
export function openContingencies<T extends Pick<Contingency, "amount" | "status">>(list: readonly T[] = []): T[] {
  return list.filter((c) => c?.status === "open").sort((a, b) => Number(b.amount) - Number(a.amount));
}
