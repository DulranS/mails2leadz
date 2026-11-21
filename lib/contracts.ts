// Contract register (v249): the contracts the business has signed with suppliers, customers, landlords, staff and others: who, what, how much, and when
// they end or renew. Shows which are coming up for renewal, so none rolls over without a decision. Pure. Signing and e-signature are not done here.

export const CONTRACT_KINDS = ["supplier", "customer", "premises", "staff", "service", "other"] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];
export const RENEW_WARNING_DAYS = 60;
const DAY = 86_400_000;
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(Date.parse(`${s}T00:00:00Z`)).toISOString().slice(0, 10) === s;

export interface Contract {
  id: string;
  title: string;
  counterparty: string;
  kind: ContractKind;
  startDate: string;
  endDate?: string; // empty for an open-ended contract
  value?: number; // the amount it is worth per year, if known
  noticeDays?: number; // how many days' notice is needed to end or change it
  notes?: string;
}

export function validateContract(i: { title: string; counterparty: string; kind: string; startDate: string; endDate?: string }): string | null {
  if (!i.title || i.title.trim().length < 3) return "Say what the contract is for.";
  if (!i.counterparty || i.counterparty.trim().length < 2) return "Name the other party.";
  if (!(CONTRACT_KINDS as readonly string[]).includes(i.kind)) return "Choose the kind of contract.";
  if (!isDay(i.startDate)) return "Enter the day it started.";
  if (i.endDate && (!isDay(i.endDate) || i.endDate < i.startDate)) return "The end day must be a real day, after the start.";
  return null;
}

export function contractStatus(c: Contract, today: string): "open_ended" | "active" | "renew_soon" | "ended" {
  if (!c.endDate) return "open_ended";
  if (c.endDate < today) return "ended";
  const left = Math.round((Date.parse(`${c.endDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
  // A contract with notice to give is due for a decision once the notice window opens, not only at the end.
  const decideBy = left - (c.noticeDays ?? 0);
  return decideBy <= RENEW_WARNING_DAYS ? "renew_soon" : "active";
}

export function contractSummary(contracts: Contract[], today: string) {
  const rows = contracts.map((c) => ({ c, status: contractStatus(c, today) }));
  const rank = { renew_soon: 0, ended: 1, active: 2, open_ended: 3 } as const;
  rows.sort((a, b) => rank[a.status] - rank[b.status] || (a.c.endDate ?? "9999").localeCompare(b.c.endDate ?? "9999"));
  return {
    rows,
    renewSoon: rows.filter((r) => r.status === "renew_soon").length,
    ended: rows.filter((r) => r.status === "ended").length,
    yearlyValue: Math.round(contracts.reduce((t, c) => t + (c.value ?? 0), 0) * 100) / 100,
  };
}
