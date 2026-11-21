// Leaver handover (v198b): when someone leaves, the business needs two things: the steps that close their access and their equipment, and
// the list of what they still own (KPIs they are accountable for, decisions they are making, areas of work they are responsible for),
// so each item can be given to someone else on purpose. Nothing is reassigned or removed by this. Pure.

export const LEAVER_STEPS = [
  "Collect equipment, keys, cards and devices, and note what came back",
  "Revoke every system and app login, including shared passwords and the business email",
  "Settle final pay and any leave owed, and confirm the last working day",
  "Hand over each owned item below to the person named, and record the change on that item",
  "Take the person off the rota from their end date",
  "Record the leaving date on their employee record",
] as const;

export interface OwnedItem {
  area: "KPI" | "Decision" | "Responsibility";
  title: string;
}

export function ownedItemsFor(
  name: string,
  records: {
    kpis: { name: string; ownerName?: string }[];
    decisions: { title: string; ownerName?: string; status?: string }[];
    responsibilities: { title: string; ownerName?: string }[];
  },
): OwnedItem[] {
  const who = name.trim().toLowerCase();
  if (!who) return [];
  const mine = (owner?: string) => (owner ?? "").trim().toLowerCase() === who;
  return [
    ...records.kpis.filter((k) => mine(k.ownerName)).map((k) => ({ area: "KPI" as const, title: k.name })),
    ...records.decisions.filter((d) => mine(d.ownerName) && (d.status ?? "open") === "open").map((d) => ({ area: "Decision" as const, title: d.title })),
    ...records.responsibilities.filter((r) => mine(r.ownerName)).map((r) => ({ area: "Responsibility" as const, title: r.title })),
  ];
}
