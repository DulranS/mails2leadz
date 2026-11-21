// Management review pack (v193c): the agenda for the operations and management review, assembled automatically from what is already
// recorded. Each section is a list of items that need a decision, an owner or a date. Pure: no I/O; the caller passes the records.
// A review that ends with a decision, an owner and a deadline for each item is what the pack is built to produce.

export interface ReviewPackInput {
  escalations: { title: string; area: string; daysLate: number; severity: "high" | "medium" | "low" }[];
  decisionsDue: { title: string; ownerName?: string; targetDate?: string }[];
  kpisOffTarget: { name: string; latest?: number; target: number; unit: string; hasDecision: boolean; rag?: "red" | "amber" }[];
  capacityProblems: { date: string; bookedHours: number; staffedHours: number }[];
  complianceDue: { name: string; state: "expired" | "due_soon"; daysLeft: number }[];
  incidentsOpen: { description: string; date: string }[];
  pendingRequests: number;
  proceduresToRead: number;
  risksToReview: { title: string; reviewOn?: string }[];
  objectivesOverdue: { title: string; targetDate?: string; progressPct?: number }[];
  areasWithNoOwner: string[];
  procedureGaps?: { title: string; status: "none" | "single" }[]; // procedures nobody, or one person only, is qualified for
  supplierIssues?: { supplier: string; onTimePct: number | null; overdueNow: number }[]; // suppliers late too often, or with overdue orders
  salesBehind?: { name: string; attainmentPct: number }[]; // people under the sales target threshold
  stockCountsDue?: { name: string; daysLate: number }[]; // high-value (class A) stock due or overdue a count
}

export interface ReviewSection {
  key: string;
  title: string;
  items: string[];
}

// The sections, in the order the review should take them. Empty sections are left out, so the pack only shows what needs time.
export function buildReviewPack(i: ReviewPackInput): ReviewSection[] {
  const sections: ReviewSection[] = [
    {
      key: "escalations",
      title: "Overdue and late (most serious first)",
      items: i.escalations.map((e) => `${e.severity.toUpperCase()}: ${e.title} (${e.area}, ${e.daysLate} day${e.daysLate === 1 ? "" : "s"} late)`),
    },
    {
      key: "decisions",
      title: "Decisions due",
      items: i.decisionsDue.map((d) => `${d.title}${d.ownerName ? ` · owner ${d.ownerName}` : " · NO OWNER"}${d.targetDate ? ` · by ${d.targetDate}` : ""}`),
    },
    {
      key: "kpis",
      title: "Numbers off target",
      items: [...i.kpisOffTarget].sort((a, b) => (a.rag === b.rag ? 0 : a.rag === "red" ? -1 : a.rag === "amber" ? 1 : 0)).map((k) => `${k.rag ? `${k.rag.toUpperCase()}: ` : ""}${k.name}: ${k.latest ?? "no figure"} ${k.unit} against ${k.target} ${k.unit}${k.hasDecision ? "" : " · no decision linked"}`),
    },
    {
      key: "capacity",
      title: "Capacity: days the team cannot cover",
      items: i.capacityProblems.map((c) => `${c.date}: ${c.bookedHours} hours booked, ${c.staffedHours} rostered`),
    },
    {
      key: "compliance",
      title: "Licences, insurance and contracts",
      items: i.complianceDue.map((c) => (c.state === "expired" ? `${c.name}: EXPIRED ${-c.daysLeft} day${c.daysLeft === -1 ? "" : "s"} ago` : `${c.name}: renew in ${c.daysLeft} day${c.daysLeft === 1 ? "" : "s"}`)),
    },
    {
      key: "incidents",
      title: "Incidents still open",
      items: i.incidentsOpen.map((x) => `${x.date}: ${x.description}`),
    },
    {
      key: "risks",
      title: "Risks due for review",
      items: i.risksToReview.map((r) => `${r.title}${r.reviewOn ? ` (review was due ${r.reviewOn})` : ""}`),
    },
    {
      key: "objectives",
      title: "Objectives behind their date",
      items: i.objectivesOverdue.map((o) => `${o.title}: ${o.progressPct ?? 0}% done, due ${o.targetDate ?? "no date"}`),
    },
    {
      key: "people",
      title: "Ownership and people",
      items: [
        ...i.areasWithNoOwner.map((a) => `${a}: no one is responsible for this area`),
        ...(i.procedureGaps ?? []).map((p) => (p.status === "none" ? `${p.title}: nobody is qualified for this procedure` : `${p.title}: only one person is qualified`)),
        ...(i.pendingRequests > 0 ? [`${i.pendingRequests} request${i.pendingRequests === 1 ? "" : "s"} waiting for a decision`] : []),
        ...(i.proceduresToRead > 0 ? [`${i.proceduresToRead} procedure version${i.proceduresToRead === 1 ? "" : "s"} still to be read by someone`] : []),
      ],
    },
  ];
  sections.push({
    key: "stock",
    title: "Stock counts due",
    items: (i.stockCountsDue ?? []).map((x) => `${x.name}: ${x.daysLate > 0 ? `${x.daysLate} day${x.daysLate === 1 ? "" : "s"} overdue for a count` : "due a count now"} (high-value)`),
  });
  sections.push({
    key: "sales",
    title: "Sales team behind target",
    items: (i.salesBehind ?? []).map((p) => `${p.name}: ${p.attainmentPct}% of target over the last 30 days`),
  });
  sections.push({
    key: "suppliers",
    title: "Suppliers",
    items: (i.supplierIssues ?? []).map((s) => `${s.supplier}: ${s.onTimePct !== null ? `${s.onTimePct}% on time` : "no on-time record"}${s.overdueNow ? `, ${s.overdueNow} order${s.overdueNow === 1 ? "" : "s"} overdue now` : ""}`),
  });
  return sections.filter((s) => s.items.length > 0);
}

// The pack as plain text, for pasting into a meeting note or a message the owner sends.
export function reviewPackText(sections: ReviewSection[], businessName: string, today: string): string {
  if (sections.length === 0) return `${businessName} management review, ${today}\n\nNothing needs a decision today.`;
  const body = sections.map((s) => `${s.title.toUpperCase()}\n${s.items.map((x) => `  - ${x}`).join("\n")}`).join("\n\n");
  return `${businessName} management review, ${today}\n\n${body}\n\nFor each item: decide, name the owner, and set the day it will be done by.`;
}
