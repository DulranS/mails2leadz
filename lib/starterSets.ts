// Starter sets (v205b): a sensible first set of operations and management records for each kind of business, so a new business is not
// starting from an empty page. Each set is a list of KPIs (each with the decision it informs), areas of responsibility, and standard
// procedures. Applying a set skips anything already there by name, so it is safe to apply twice. Pure data and selection.

export type BusinessKind = "retail" | "food" | "services" | "manufacturing" | "venue" | "wholesale" | "rental" | "trades" | "membership" | "consultancy" | "healthcare" | "other";

export const BUSINESS_KINDS: { id: BusinessKind; label: string }[] = [
  { id: "retail", label: "Shop or retail" },
  { id: "food", label: "Food, drink or restaurant" },
  { id: "services", label: "Services or appointments" },
  { id: "manufacturing", label: "Making or manufacturing" },
  { id: "venue", label: "Venue, events or hall" },
  { id: "wholesale", label: "Wholesale or distribution" },
  { id: "rental", label: "Hire or rental (equipment, vehicles, property)" },
  { id: "trades", label: "Trades or construction" },
  { id: "membership", label: "Membership, gym or club" },
  { id: "consultancy", label: "Consultancy or agency (billed time)" },
  { id: "healthcare", label: "Clinic, pharmacy or care service" },
  { id: "other", label: "Something else" },
];

export interface StarterKpi { name: string; unit: string; target: number; direction: "higher" | "lower"; period: "week" | "month"; decisionQuestion: string }
export interface StarterProcedure { title: string; body: string }

export interface StarterSet {
  kpis: StarterKpi[];
  responsibilities: string[]; // areas of work; each is started with the owner as the person responsible, to be changed
  procedures: StarterProcedure[];
}

const COMMON: StarterSet = {
  kpis: [
    { name: "Days of cash on hand", unit: "days", target: 60, direction: "higher", period: "month", decisionQuestion: "Can we pay bills and staff without borrowing this month?" },
    { name: "Overdue receivables", unit: "%", target: 5, direction: "lower", period: "month", decisionQuestion: "Do we chase customers harder or change terms?" },
  ],
  responsibilities: ["Cash and payments", "Customer complaints", "Health and safety"],
  procedures: [
    { title: "Opening checks", body: "1. Check the premises are safe and clean.\n2. Count the opening float and record it.\n3. Check today's bookings, orders and deliveries.\n4. Note anything the last shift left for you." },
    { title: "Closing checks", body: "1. Count the takings and record the figure.\n2. Lock up and check exits, equipment and lights.\n3. Write what the next shift needs to know." },
    { title: "Workplace policy: leave and absence", body: "1. Staff tell their manager as early as they can, and give the dates.\n2. The manager records the leave on the rota and checks cover for the shifts.\n3. Sick leave is recorded the same day, and a return-to-work conversation is held." },
    { title: "Workplace policy: conduct and safety", body: "1. Treat customers, colleagues and suppliers with respect; raise concerns with a manager.\n2. Report every accident, near miss and unsafe condition in the incident log the same day.\n3. Wear the protective equipment the task needs and follow the site's safety rules." },
    { title: "Workplace policy: customer and staff data", body: "1. Collect only the personal details the job needs.\n2. Keep them only in the business's systems, never on personal phones or paper left out.\n3. Report any loss or wrong sharing of personal data to the owner straight away." },
    { title: "Retiring a product or service", body: "1. Check how much stock is left and how it has been selling.\n2. Decide the clearance price with the dead-stock advice, and set the markdown.\n3. Tell customers who buy it what replaces it, if anything.\n4. Set the item to inactive once the stock is cleared, and record the decision as a decision." },
    { title: "Launching a new product or service", body: "1. Write down what it is, who it is for, and what it costs to deliver per unit.\n2. Set the selling price and check the margin is what the business needs.\n3. Write the steps of delivering it, and check who can do each step.\n4. Record the approval as a decision, with an owner and the day it will launch.\n5. Train the people who will deliver it, and record it under training.\n6. Launch it, then review its first month against the margin and demand you expected." },
  ],
};

const BY_KIND: Record<BusinessKind, StarterSet> = {
  retail: {
    kpis: [
      { name: "Stock accuracy", unit: "%", target: 98, direction: "higher", period: "month", decisionQuestion: "Do we count more often or fix how stock is received?" },
      { name: "Stock turns over in 60 days", unit: "%", target: 50, direction: "higher", period: "month", decisionQuestion: "Which lines should we stop buying or discount?" },
    ],
    responsibilities: ["Buying and ordering", "Receiving stock", "Pricing and promotions"],
    procedures: [{ title: "Receiving a delivery", body: "1. Check the delivery against the purchase order.\n2. Count each line and note any shortfall or damage.\n3. Put stock in its place and update the count." }],
  },
  food: {
    kpis: [
      { name: "Food waste", unit: "%", target: 4, direction: "lower", period: "week", decisionQuestion: "Do we cut portions, menu lines or order quantities?" },
      { name: "Food safety checks done on time", unit: "%", target: 100, direction: "higher", period: "week", decisionQuestion: "Do we need more people on the checks, or a simpler check?" },
    ],
    responsibilities: ["Food safety", "Kitchen and prep", "Front of house"],
    procedures: [{ title: "Temperature checks", body: "1. Record fridge and freezer temperatures at the start and end of each shift.\n2. Note any reading out of range and act at once.\n3. Tell the manager before the end of the shift." }],
  },
  services: {
    kpis: [
      { name: "Appointments kept (not missed)", unit: "%", target: 90, direction: "higher", period: "week", decisionQuestion: "Do we need reminders, deposits or a waitlist?" },
      { name: "Staff utilisation", unit: "%", target: 75, direction: "higher", period: "week", decisionQuestion: "Do we need more people, or more bookings?" },
    ],
    responsibilities: ["Scheduling and bookings", "Quality of work", "Client follow-up"],
    procedures: [
      { title: "Booking a client", body: "1. Confirm the service, the time and the person.\n2. Take a contact number and any notes.\n3. Send the reminder the day before." },
      { title: "Designing a service (service blueprint)", body: "1. Write each step the customer sees, in order, from first contact to the result.\n2. For each customer step, write what staff do behind it, and who does it.\n3. List the systems, tools and records each step needs.\n4. Mark the points where things most often go wrong, and what to do when they do.\n5. Write the evidence that shows each step was done well (a note, a photo, a signed form)." },
    ],
  },
  manufacturing: {
    kpis: [
      { name: "First-time-right output", unit: "%", target: 97, direction: "higher", period: "week", decisionQuestion: "Do we change the process, the materials or the training?" },
      { name: "Scrap and rework", unit: "%", target: 3, direction: "lower", period: "week", decisionQuestion: "Which step is losing the most material?" },
      { name: "Machine downtime", unit: "%", target: 2, direction: "lower", period: "month", decisionQuestion: "Do we service more often or replace the machine?" },
    ],
    responsibilities: ["Production planning", "Quality control", "Maintenance"],
    procedures: [{ title: "Start of shift machine check", body: "1. Check guards and emergency stops.\n2. Check oil, air and power levels.\n3. Run a test piece and check it against the spec.\n4. Record the check before production starts." }],
  },
  venue: {
    kpis: [
      { name: "Venue utilisation", unit: "%", target: 60, direction: "higher", period: "month", decisionQuestion: "Do we book more events, change prices or shorten the season?" },
      { name: "Incidents at events", unit: "count", target: 0, direction: "lower", period: "month", decisionQuestion: "Do we change the crowd plan, staffing or the risk assessment?" },
    ],
    responsibilities: ["Event booking and scheduling", "Crowd and safety", "Front of house and tickets"],
    procedures: [{ title: "Before every event", body: "1. Check fire exits are clear and lit.\n2. Check the stage, sound and lighting.\n3. Brief the staff on exits, first aid and who to call.\n4. Confirm the headcount limit with the crowd plan." }],
  },
  wholesale: {
    kpis: [
      { name: "Orders delivered on time", unit: "%", target: 95, direction: "higher", period: "week", decisionQuestion: "Do we need another driver, another depot or other suppliers?" },
      { name: "Order accuracy", unit: "%", target: 99, direction: "higher", period: "week", decisionQuestion: "Do we change picking, labelling or checking?" },
    ],
    responsibilities: ["Order picking and dispatch", "Transport", "Credit control"],
    procedures: [{ title: "Dispatching an order", body: "1. Pick against the order and check each line.\n2. Load and check the count against the delivery note.\n3. Record the delivery and get a signature." }],
  },
  rental: {
    kpis: [
      { name: "Items out on hire", unit: "%", target: 80, direction: "higher", period: "week", decisionQuestion: "Do we need more of the items people ask for?" },
      { name: "Hires returned on time", unit: "%", target: 95, direction: "higher", period: "week", decisionQuestion: "Do we change deposits, reminders or the hire terms?" },
    ],
    responsibilities: ["Bookings and availability", "Checking items out and in", "Maintenance and inspections"],
    procedures: [{ title: "Checking an item out on hire", body: "1. Confirm the booking and the return date.\n2. Inspect the item and note its condition and any damage.\n3. Take the deposit and record the hire against the item." }],
  },
  trades: {
    kpis: [
      { name: "Jobs finished within the quote", unit: "%", target: 90, direction: "higher", period: "month", decisionQuestion: "Are our quotes too low, or are jobs running over?" },
      { name: "Materials wasted on jobs", unit: "%", target: 3, direction: "lower", period: "month", decisionQuestion: "Do we order closer to what each job needs?" },
    ],
    responsibilities: ["Quoting and job planning", "Site work and safety", "Subcontractors and materials"],
    procedures: [{ title: "Starting a job on site", body: "1. Check the job sheet, the drawings and the risks for the site.\n2. Brief the crew on the work, the safety rules and the materials.\n3. Record the start, and who is on the job." }],
  },
  membership: {
    kpis: [
      { name: "Members renewing", unit: "%", target: 85, direction: "higher", period: "month", decisionQuestion: "Which members are slipping, and what would keep them?" },
      { name: "Monthly cancellations", unit: "people", target: 5, direction: "lower", period: "month", decisionQuestion: "Why are people leaving, and what do we change?" },
    ],
    responsibilities: ["Joining and renewals", "Classes or sessions", "Member support"],
    procedures: [{ title: "Renewing or cancelling a membership", body: "1. Confirm the member's plan, the renewal date and any payment due.\n2. Ask one question about how they are getting on, and record the answer.\n3. Renew, change or end the membership, and tell the member what happens next." }],
  },
  consultancy: {
    kpis: [
      { name: "Billable utilisation", unit: "%", target: 75, direction: "higher", period: "month", decisionQuestion: "Do we have too much spare time, or too little to deliver?" },
      { name: "Projects delivered on budget", unit: "%", target: 90, direction: "higher", period: "month", decisionQuestion: "Is our estimating or our scope control off?" },
    ],
    responsibilities: ["Client work and delivery", "Estimating and scope", "Billing and collections"],
    procedures: [{ title: "Closing a project", body: "1. Check the deliverables against the agreed scope.\n2. Record the hours and any change that cost time.\n3. Send the final invoice and the handover, and note what to do differently next time." }],
  },
  healthcare: {
    kpis: [
      { name: "Appointments kept (not missed)", unit: "%", target: 90, direction: "higher", period: "week", decisionQuestion: "Which reminders or slots need changing to cut missed visits?" },
      { name: "Medicines out of stock", unit: "items", target: 0, direction: "lower", period: "month", decisionQuestion: "Which lines need a higher reorder level or a second supplier?" },
    ],
    responsibilities: ["Patient bookings and records", "Medicines, supplies and cold storage", "Clinical and safety checks"],
    procedures: [{ title: "Checking in a patient", body: "1. Confirm identity and the appointment, and check the record is up to date.\n2. Check for allergies and any changes since the last visit before treatment.\n3. Record the visit, the staff member and any consent given." }],
  },
  other: { kpis: [], responsibilities: [], procedures: [] },
};

// The set for a kind of business: its own items after the common ones, in a fixed order, with the duplicates by name removed.
export function starterSetFor(kind: BusinessKind): StarterSet {
  const own = BY_KIND[kind];
  const uniq = <T extends { name?: string; title?: string }>(items: T[]) => {
    const seen = new Set<string>();
    return items.filter((i) => {
      const k = (i.name ?? i.title ?? "").toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  return {
    kpis: uniq([...COMMON.kpis, ...own.kpis]),
    responsibilities: [...new Set([...COMMON.responsibilities, ...own.responsibilities])],
    procedures: uniq([...COMMON.procedures, ...own.procedures]),
  };
}

// What is left to add, given what the business already has: nothing is added twice.
export function starterAdditions(kind: BusinessKind, have: { kpis: string[]; responsibilities: string[]; procedures: string[] }) {
  const set = starterSetFor(kind);
  const lower = (xs: string[]) => new Set(xs.map((x) => x.trim().toLowerCase()));
  const hk = lower(have.kpis), hr = lower(have.responsibilities), hp = lower(have.procedures);
  return {
    kpis: set.kpis.filter((k) => !hk.has(k.name.toLowerCase())),
    responsibilities: set.responsibilities.filter((r) => !hr.has(r.toLowerCase())),
    procedures: set.procedures.filter((p) => !hp.has(p.title.toLowerCase())),
  };
}
