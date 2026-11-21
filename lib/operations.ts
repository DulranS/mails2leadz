import { cleanVideoUrl } from "./procedureTraining";
import { SALES_MEASURES } from "./salesMeasures";
import { OPS_MEASURES } from "./opsMeasures";
const AUTOMATIC_MEASURE_KEYS: string[] = [...SALES_MEASURES.map((m) => m.key), ...OPS_MEASURES.map((m) => m.key)];
// Operations (v176): the things a business has to run and keep track of beyond the money. Pure: no I/O, no clock reads (the caller
// passes `today` and `at`), so the Operations page, the firestore rules and scripts/verify-operations.ts share one set of rules.
//
// Nothing here posts to the books or moves stock. An approved spend or expense claim is still recorded on the Expenses page; a
// maintenance cost is a note; a KPI reading and a review are records. Balancr changes no money because of any of them.

export const MAX_TITLE = 150;
export const MAX_TEXT = 2000;
export const MAX_BODY = 20000;
export const MAX_LOG = 200; // maintenance log entries and KPI readings kept per item
export const KPI_HISTORY = 260; // readings kept per KPI (about five years of weekly figures)
export const REQUEST_AMOUNT_MAX = 10_000_000;
export const INCIDENT_RECENT_DAYS = 90;
export const INCIDENT_STALE_DAYS = 14; // an open incident older than this is flagged
export const COMPLIANCE_REMINDER_DAYS = 30;
export const REVIEW_EVERY_MONTHS = 6;

// ---------- dates (ISO YYYY-MM-DD; UTC arithmetic so no server time zone matters) ----------

export function isIsoDay(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

export function addIsoDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

export function addIsoMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate(); // last day of the target month
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

// Whole days from `from` to `to` (negative when `to` is earlier).
export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

// The first day of the week (Monday) or month that contains `iso`.
export function periodStartOf(iso: string, period: "week" | "month"): string {
  if (period === "month") return `${iso.slice(0, 7)}-01`;
  const dow = new Date(Date.parse(`${iso}T00:00:00Z`)).getUTCDay(); // 0 = Sunday
  return addIsoDays(iso, -((dow + 6) % 7));
}

function text(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

// ---------- 1. requests and approvals (spend requests, expense claims, shift changes) ----------

export type RequestKind = "spend" | "claim" | "shift" | "payment"; // "payment": a supplier payment waiting for a second signer (not in the picker)
export type RequestStatus = "pending" | "approved" | "declined" | "cancelled";
export const REQUEST_KINDS: { value: RequestKind; label: string; hint: string }[] = [
  { value: "spend", label: "Spend", hint: "Something to buy or pay for before it is bought." },
  { value: "claim", label: "Expense claim", hint: "Money you paid yourself that the business should pay back." },
  { value: "shift", label: "Shift change", hint: "A shift you want to swap, move or leave." },
];

export interface RequestInput {
  kind: string;
  title: string;
  date: string;
  amount?: number;
  details?: string;
  shiftId?: string; // shift change: the rota shift to swap
  coverEmployeeId?: string; // shift change: who takes it
  coverEmployeeName?: string;
  payload?: Record<string, unknown>; // a supplier payment: the payment to record once approved
}

export function validateRequestInput(i: RequestInput): string | null {
  if (i.kind === "payment") {
    if (!i.payload || typeof i.payload.purchaseId !== "string") return "A supplier payment needs its details.";
  } else if (!REQUEST_KINDS.some((k) => k.value === i.kind)) return "Choose what kind of request this is.";
  if (text(i.title, MAX_TITLE).length < 2) return "Give the request a short title.";
  if (!isIsoDay(i.date)) return "Choose the date.";
  if (i.kind !== "shift") {
    if (typeof i.amount !== "number" || !Number.isFinite(i.amount) || i.amount <= 0) return "Enter the amount.";
    if (i.amount > REQUEST_AMOUNT_MAX) return "That amount is too large to request here.";
  }
  return null;
}

// A new request, cleaned. Shift changes carry no amount.
export function cleanRequestInput(i: RequestInput): { kind: RequestKind; title: string; date: string; amount?: number; details?: string; shiftId?: string; coverEmployeeId?: string; coverEmployeeName?: string } {
  const details = text(i.details, MAX_TEXT);
  const swap = i.kind === "shift" && i.shiftId && /^[A-Za-z0-9_-]{6,200}$/.test(i.shiftId);
  return {
    kind: i.kind as RequestKind,
    title: text(i.title, MAX_TITLE),
    date: i.date,
    ...(i.kind !== "shift" && typeof i.amount === "number" ? { amount: Math.round(i.amount * 100) / 100 } : {}),
    ...(details ? { details } : {}),
    ...(swap ? { shiftId: i.shiftId } : {}),
    ...(swap && i.coverEmployeeId ? { coverEmployeeId: i.coverEmployeeId, coverEmployeeName: text(i.coverEmployeeName, 120) } : {}),
  };
}

export interface RequestLike {
  id: string;
  kind: RequestKind;
  status: RequestStatus;
  amount?: number;
  createdByUid?: string;
  reimbursedAt?: number;
}

export type RequestPlan = { ok: true; patch: Record<string, unknown> } | { ok: false; error: string };

// Approve or decline a pending request. A manager may decide only up to `managerLimit` (set by the owner); the owner has no limit.
// Shift changes have no amount, so any manager may decide them.
export function decideRequestPlan(
  req: RequestLike,
  decision: "approved" | "declined",
  by: { role: string; name: string },
  at: number,
  managerLimit: number | undefined,
  uid?: string,
): RequestPlan {
  if (req.status !== "pending") return { ok: false, error: "This request has already been decided." };
  if (req.kind === "payment" && decision === "approved" && req.createdByUid && uid === req.createdByUid) {
    return { ok: false, error: "The person who recorded a supplier payment can't approve it. A second signer has to." };
  }
  if (by.role !== "owner" && by.role !== "manager") return { ok: false, error: "Only an Owner or Manager can approve or decline." };
  if (by.role === "manager" && req.kind !== "shift" && typeof req.amount === "number") {
    if (managerLimit === undefined) return { ok: false, error: "Managers have no approval limit set. Ask the owner to decide this one." };
    if (req.amount > managerLimit) return { ok: false, error: `Above the limit managers can approve (${managerLimit}). Ask the owner to decide it.` };
  }
  return { ok: true, patch: { status: decision, decidedAt: at, decidedByName: by.name } };
}

// The person who asked can withdraw a request that is still pending. Nothing else can change once it is decided.
export function cancelRequestPlan(req: RequestLike, uid: string, at: number): RequestPlan {
  if (req.status !== "pending") return { ok: false, error: "Only a pending request can be cancelled." };
  if (req.createdByUid !== uid) return { ok: false, error: "Only the person who asked can cancel this request." };
  return { ok: true, patch: { status: "cancelled", decidedAt: at } };
}

// An approved expense claim is paid back by the business, recorded on the Expenses page. This only notes that it was done.
export function reimburseClaimPlan(req: RequestLike, at: number): RequestPlan {
  if (req.kind !== "claim") return { ok: false, error: "Only an expense claim is reimbursed." };
  if (req.status !== "approved") return { ok: false, error: "Approve the claim before marking it reimbursed." };
  if (req.reimbursedAt) return { ok: false, error: "This claim is already marked reimbursed." };
  return { ok: true, patch: { reimbursedAt: at } };
}

export interface RequestSummary {
  pending: number;
  pendingValue: number; // spend and claims still waiting
  oldestPendingDays: number | null;
  claimsToReimburse: number; // approved claims not yet marked reimbursed
}

export function summarizeRequests(list: (RequestLike & { createdAt: number; date?: string })[], today: string): RequestSummary {
  let pending = 0, pendingValue = 0, claimsToReimburse = 0;
  let oldest: number | null = null;
  for (const r of list) {
    if (r.status === "pending") {
      pending++;
      if (typeof r.amount === "number" && r.kind !== "shift") pendingValue += r.amount;
      const days = r.date ? dayDiff(r.date, today) : null;
      if (days !== null && (oldest === null || days > oldest)) oldest = days;
    }
    if (r.kind === "claim" && r.status === "approved" && !r.reimbursedAt) claimsToReimburse++;
  }
  return {
    pending,
    pendingValue: Math.round(pendingValue * 100) / 100,
    oldestPendingDays: oldest === null ? null : Math.max(0, oldest),
    claimsToReimburse,
  };
}

// ---------- 2. procedures and staff acknowledgement ----------

export interface ProcedureAck {
  name: string;
  version: number;
  at: number;
}

export interface ProcedureLike {
  id: string;
  title: string;
  body: string;
  version: number;
  acks?: Record<string, ProcedureAck>;
  reviewEveryDays?: number;
  lastReviewed?: string;
}

export function validateProcedure(i: { title: string; body: string; reviewEveryDays?: number; videoUrl?: string }): string | null {
  if (text(i.title, MAX_TITLE).length < 2) return "Give the procedure a title.";
  if (!i.body || i.body.trim().length < 2) return "Write out the steps.";
  if (i.body.length > MAX_BODY) return `The steps can be at most ${MAX_BODY} characters.`;
  if (i.reviewEveryDays !== undefined && (!Number.isInteger(i.reviewEveryDays) || i.reviewEveryDays < 1 || i.reviewEveryDays > 3650)) {
    return "Review every how many days? Enter a whole number from 1 to 3650.";
  }
  const video = cleanVideoUrl(i.videoUrl);
  if (!video.ok) return video.error;
  return null;
}

// Editing the title or the steps makes a new version, so everyone must read it again. Changing only the review settings does not.
export function nextVersion(prev: { title: string; body: string; version: number }, next: { title: string; body: string }): number {
  const changed = text(prev.title, MAX_TITLE) !== text(next.title, MAX_TITLE) || prev.body.trim() !== next.body.trim();
  return changed ? prev.version + 1 : prev.version;
}

export type AckPlan = { ok: true; patch: { acks: Record<string, ProcedureAck> } } | { ok: false; error: string };

// A person confirms they have read the current version. Accountants cannot acknowledge (they read the books, not the floor).
export function acknowledgePlan(p: ProcedureLike, by: { uid: string; name: string; role: string }, at: number): AckPlan {
  if (by.role === "accountant") return { ok: false, error: "Accountants do not acknowledge procedures." };
  return {
    ok: true,
    patch: { acks: { ...(p.acks ?? {}), [by.uid]: { name: by.name, version: p.version, at } } },
  };
}

export interface MemberLike {
  uid: string;
  name: string;
  role: string;
  active: boolean;
}

// Active team members who still have to read the current version of this procedure.
export function pendingAcks(p: ProcedureLike, members: MemberLike[]): MemberLike[] {
  return members.filter(
    (m) => m.active && m.role !== "accountant" && p.acks?.[m.uid]?.version !== p.version,
  );
}

// Procedures due for a re-read. A procedure with no review rhythm is never due.
export function procedureReviewDue(p: Pick<ProcedureLike, "reviewEveryDays" | "lastReviewed"> & { createdDay?: string }, today: string): { due: boolean; dueOn?: string } {
  if (!p.reviewEveryDays) return { due: false };
  const from = p.lastReviewed ?? p.createdDay;
  if (!from) return { due: false };
  const dueOn = addIsoDays(from, p.reviewEveryDays);
  return { due: dueOn <= today, dueOn };
}

// ---------- 3. compliance register (licences, permits, insurance, certificates, training, leases, contracts) ----------

export const COMPLIANCE_CATEGORIES: { value: string; label: string }[] = [
  { value: "licence", label: "Licence" },
  { value: "permit", label: "Permit" },
  { value: "insurance", label: "Insurance policy" },
  { value: "certificate", label: "Certificate" },
  { value: "training", label: "Training" },
  { value: "lease", label: "Lease or rent agreement" },
  { value: "contract", label: "Contract" },
  { value: "registration", label: "Registration" },
  { value: "intellectual_property", label: "Trademark, domain or copyright" },
  { value: "data_protection", label: "Data protection registration or privacy notice" },
  { value: "environmental", label: "Environmental permit, waste carrier or emissions" },
  { value: "other", label: "Other" },
];

export function documentUrlProblem(url: unknown): string | null {
  if (url === undefined || url === null || url === "") return null;
  if (typeof url !== "string" || url.length > 500) return "The link is too long or not text.";
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return "The link must start with https://.";
  } catch {
    return "That link doesn't look right. Paste the full address, starting with https://.";
  }
  return null;
}

export interface ComplianceInput {
  name: string;
  category: string;
  expiresOn: string;
  issuedOn?: string;
  holder?: string;
  reminderDays?: number;
  documentUrl?: string;
}

export function validateCompliance(i: ComplianceInput): string | null {
  if (text(i.name, MAX_TITLE).length < 2) return "Give the item a name.";
  if (!COMPLIANCE_CATEGORIES.some((c) => c.value === i.category)) return "Choose what kind of item this is.";
  if (!isIsoDay(i.expiresOn)) return "Choose the date it expires or ends.";
  if (i.issuedOn !== undefined && i.issuedOn !== "" && !isIsoDay(i.issuedOn)) return "The issue date is not a valid date.";
  if (i.issuedOn && i.issuedOn > i.expiresOn) return "It can't be issued after it expires.";
  if (i.reminderDays !== undefined && (!Number.isInteger(i.reminderDays) || i.reminderDays < 0 || i.reminderDays > 365)) {
    return "Remind me how many days before? Enter a whole number from 0 to 365.";
  }
  return documentUrlProblem(i.documentUrl);
}

export type ComplianceState = "expired" | "due_soon" | "ok";

// Where a compliance item stands today. "due_soon" starts `reminderDays` before expiry (30 by default).
export function complianceState(i: { expiresOn: string; reminderDays?: number }, today: string): { state: ComplianceState; daysLeft: number } {
  const daysLeft = dayDiff(today, i.expiresOn);
  if (daysLeft < 0) return { state: "expired", daysLeft };
  const window = i.reminderDays ?? COMPLIANCE_REMINDER_DAYS;
  return { state: daysLeft <= window ? "due_soon" : "ok", daysLeft };
}

export function complianceSummary(items: { expiresOn: string; reminderDays?: number }[], today: string) {
  let expired = 0, dueSoon = 0;
  for (const i of items) {
    const s = complianceState(i, today).state;
    if (s === "expired") expired++;
    else if (s === "due_soon") dueSoon++;
  }
  return { expired, dueSoon, total: items.length };
}

// ---------- 4. incidents and near misses ----------

export const INCIDENT_KINDS: { value: string; label: string }[] = [
  { value: "near_miss", label: "Near miss" },
  { value: "injury", label: "Injury" },
  { value: "damage", label: "Damage or breakage" },
  { value: "customer", label: "Customer incident" },
  { value: "other", label: "Other" },
];
export const INCIDENT_SEVERITIES: { value: string; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export interface IncidentInput {
  kind: string;
  date: string;
  description: string;
  severity: string;
  place?: string;
  actionTaken?: string;
}

export function validateIncident(i: IncidentInput): string | null {
  if (!INCIDENT_KINDS.some((k) => k.value === i.kind)) return "Choose what kind of incident this was.";
  if (!isIsoDay(i.date)) return "Choose the date it happened.";
  if (text(i.description, MAX_TEXT).length < 5) return "Describe what happened.";
  if (!INCIDENT_SEVERITIES.some((s) => s.value === i.severity)) return "Choose how serious it was.";
  return null;
}

export function incidentSummary(
  list: { kind: string; date: string; status: "open" | "closed"; openedAt?: string }[],
  today: string,
) {
  const byKind: Record<string, number> = {};
  let openCount = 0, stale = 0, nearMisses = 0;
  for (const i of list) {
    if (dayDiff(i.date, today) >= 0 && dayDiff(i.date, today) <= INCIDENT_RECENT_DAYS) {
      byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
      if (i.kind === "near_miss") nearMisses++;
    }
    if (i.status === "open") {
      openCount++;
      if (dayDiff(i.date, today) > INCIDENT_STALE_DAYS) stale++;
    }
  }
  return { openCount, stale, nearMisses, byKind, recentDays: INCIDENT_RECENT_DAYS };
}

// ---------- 5. equipment and vehicle maintenance ----------

export interface MaintenanceEntryLike {
  id: string;
  date: string;
  km?: number;
  note?: string;
  cost?: number;
  byName?: string;
}

export interface MaintenanceInput {
  name: string;
  intervalDays?: number;
  intervalKm?: number;
  currentKm?: number;
}

export function validateMaintenance(i: MaintenanceInput): string | null {
  if (text(i.name, MAX_TITLE).length < 2) return "Name the equipment or vehicle.";
  const hasDays = i.intervalDays !== undefined && i.intervalDays !== null;
  const hasKm = i.intervalKm !== undefined && i.intervalKm !== null;
  if (!hasDays && !hasKm) return "Set a service interval in days, in km, or both.";
  if (hasDays && (!Number.isInteger(i.intervalDays) || (i.intervalDays as number) < 1 || (i.intervalDays as number) > 3650)) {
    return "Service every how many days? Enter a whole number from 1 to 3650.";
  }
  if (hasKm && (!Number.isFinite(i.intervalKm) || (i.intervalKm as number) < 1 || (i.intervalKm as number) > 1_000_000)) {
    return "Service every how many km? Enter a number from 1 to 1,000,000.";
  }
  if (i.currentKm !== undefined && i.currentKm !== null && (!Number.isFinite(i.currentKm) || i.currentKm < 0)) {
    return "The current reading must be zero or more.";
  }
  return null;
}

export type MaintenanceState = "never" | "ok" | "due_soon" | "overdue";

export interface MaintenanceItemLike {
  intervalDays?: number;
  intervalKm?: number;
  lastDoneDate?: string;
  lastDoneKm?: number;
  currentKm?: number;
}

// When the next service falls due, by date and by distance, and the worse of the two. Distance is only judged when a
// current reading is known. "due_soon" starts 14 days or 500 km before the due point.
export function maintenanceState(item: MaintenanceItemLike, today: string) {
  const dueDate = item.intervalDays && item.lastDoneDate ? addIsoDays(item.lastDoneDate, item.intervalDays) : undefined;
  const daysLeft = dueDate ? dayDiff(today, dueDate) : undefined;
  const dueKm = item.intervalKm !== undefined && item.lastDoneKm !== undefined ? item.lastDoneKm + item.intervalKm : undefined;
  const kmLeft = dueKm !== undefined && item.currentKm !== undefined ? dueKm - item.currentKm : undefined;

  const rank = { never: 0, ok: 1, due_soon: 2, overdue: 3 } as const;
  let state: MaintenanceState = "ok";
  if (item.intervalDays && !item.lastDoneDate) state = "never";
  if (item.intervalKm !== undefined && item.lastDoneKm === undefined && state === "ok") state = "never";
  if (daysLeft !== undefined) {
    const s: MaintenanceState = daysLeft < 0 ? "overdue" : daysLeft <= 14 ? "due_soon" : "ok";
    if (rank[s] > rank[state]) state = s;
  }
  if (kmLeft !== undefined) {
    const s: MaintenanceState = kmLeft < 0 ? "overdue" : kmLeft <= 500 ? "due_soon" : "ok";
    if (rank[s] > rank[state]) state = s;
  }
  return { state, dueDate, daysLeft, dueKm, kmLeft };
}

export type MaintenanceDonePlan =
  | { ok: true; entry: MaintenanceEntryLike; patch: Record<string, unknown> }
  | { ok: false; error: string };

// Log a service done. The cost is a note for your own records; it posts no expense.
export function maintenanceDonePlan(
  item: MaintenanceItemLike & { log?: MaintenanceEntryLike[] },
  input: { date: string; km?: number; note?: string; cost?: number },
  by: { name: string },
  today: string,
  newId: string,
): MaintenanceDonePlan {
  if (!isIsoDay(input.date)) return { ok: false, error: "Choose the date it was done." };
  if (input.date > today) return { ok: false, error: "The date it was done can't be in the future." };
  if (input.km !== undefined && (!Number.isFinite(input.km) || input.km < 0)) return { ok: false, error: "The reading must be zero or more." };
  if (input.km !== undefined && item.lastDoneKm !== undefined && input.km < item.lastDoneKm) {
    return { ok: false, error: `The reading is below the last service (${item.lastDoneKm}). Check it.` };
  }
  if (input.cost !== undefined && (!Number.isFinite(input.cost) || input.cost < 0)) return { ok: false, error: "The cost must be zero or more." };
  if ((item.log?.length ?? 0) >= MAX_LOG) return { ok: false, error: `This item has ${MAX_LOG} services logged. Start a new item for the next run.` };
  const note = text(input.note, MAX_TEXT);
  const entry: MaintenanceEntryLike = {
    id: newId,
    date: input.date,
    ...(input.km !== undefined ? { km: input.km } : {}),
    ...(note ? { note } : {}),
    ...(input.cost !== undefined ? { cost: Math.round(input.cost * 100) / 100 } : {}),
    byName: by.name,
  };
  const patch: Record<string, unknown> = {
    log: [...(item.log ?? []), entry],
    lastDoneDate: !item.lastDoneDate || input.date > item.lastDoneDate ? input.date : item.lastDoneDate,
  };
  if (input.km !== undefined) {
    patch.lastDoneKm = input.km;
    patch.currentKm = Math.max(item.currentKm ?? 0, input.km);
  }
  return { ok: true, entry, patch };
}

// ---------- 6. KPIs with targets ----------

export const KPI_DIRECTIONS: { value: "higher" | "lower"; label: string }[] = [
  { value: "higher", label: "Higher is better" },
  { value: "lower", label: "Lower is better" },
];

export interface KpiInput {
  name: string;
  ownerName?: string;
  decisionQuestion?: string;
  amberPct?: number;
  source?: string; // an automatic measure (sales or operations); validated against both lists
  timing?: string; // "leading" predicts a result; "lagging" records one (lib/kpiFocus.ts)
  unit: string;
  target: number;
  direction: string;
  period: string;
}

export function validateKpi(i: KpiInput): string | null {
  if (text(i.name, MAX_TITLE).length < 2) return "Name the measure, e.g. \"Orders on time\".";
  if (text(i.unit, 20).length === 0) return "Give the unit, e.g. %, orders, days.";
  if (!Number.isFinite(i.target)) return "Enter the target.";
  if (!KPI_DIRECTIONS.some((d) => d.value === i.direction)) return "Choose whether higher or lower is better.";
  if (i.period !== "week" && i.period !== "month") return "Record it weekly or monthly.";
  if (i.source && !AUTOMATIC_MEASURE_KEYS.includes(i.source)) return "Choose an automatic measure from the list, or leave it typed in.";
  if (i.timing !== undefined && i.timing !== "" && i.timing !== "leading" && i.timing !== "lagging") return "Say whether it is leading (predicts a result) or lagging (records one).";
  return null;
}

export interface KpiReading {
  id: string;
  period: string; // first day of the week or month
  value: number;
  note?: string;
}

// Record the figure for the week or month that contains `day`. A figure already recorded for that period is replaced.
export function recordKpiReadingPlan(
  kpi: { period: string; readings?: KpiReading[] },
  input: { day: string; value: number; note?: string },
  newId: string,
): { ok: true; patch: { readings: KpiReading[] } } | { ok: false; error: string } {
  if (!isIsoDay(input.day)) return { ok: false, error: "Choose the day." };
  if (!Number.isFinite(input.value)) return { ok: false, error: "Enter the figure." };
  const period = periodStartOf(input.day, kpi.period as "week" | "month");
  const note = text(input.note, 200);
  const reading: KpiReading = { id: newId, period, value: Math.round(input.value * 1000) / 1000, ...(note ? { note } : {}) };
  const kept = (kpi.readings ?? []).filter((r) => r.period !== period);
  const all = [...kept, reading].sort((a, b) => a.period.localeCompare(b.period));
  return { ok: true, patch: { readings: all.slice(-KPI_HISTORY) } };
}

export function kpiStatus(kpi: { target: number; direction: "higher" | "lower"; readings?: KpiReading[] }) {
  const sorted = [...(kpi.readings ?? [])].sort((a, b) => a.period.localeCompare(b.period));
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  if (!latest) return { latest: undefined, previous: undefined, onTarget: null as boolean | null, trend: "none" as const, change: null as number | null };
  const onTarget = kpi.direction === "higher" ? latest.value >= kpi.target : latest.value <= kpi.target;
  let trend: "up" | "down" | "flat" | "none" = "none";
  let change: number | null = null;
  if (previous) {
    change = Math.round((latest.value - previous.value) * 1000) / 1000;
    trend = change > 0 ? "up" : change < 0 ? "down" : "flat";
  }
  return { latest, previous, onTarget, trend, change };
}

// ---------- 7. performance reviews and goals ----------

export interface ReviewGoal {
  id: string;
  text: string;
  dueDate?: string;
  done: boolean;
}

export interface ReviewInput {
  employeeName: string;
  date: string;
  rating: number;
  strengths?: string;
  improvements?: string;
  goals: { text: string; dueDate?: string; done?: boolean }[];
  nextReviewOn?: string;
}

export function validateReview(i: ReviewInput): string | null {
  if (text(i.employeeName, MAX_TITLE).length < 2) return "Choose who the review is for.";
  if (!isIsoDay(i.date)) return "Choose the date of the review.";
  if (!Number.isInteger(i.rating) || i.rating < 1 || i.rating > 5) return "Rate from 1 (needs a lot of work) to 5 (excellent).";
  if (i.goals.length > 10) return "Keep to 10 goals or fewer per review.";
  for (const g of i.goals) {
    if (text(g.text, 300).length < 3) return "Each goal needs a few words describing it.";
    if (g.dueDate !== undefined && g.dueDate !== "" && !isIsoDay(g.dueDate)) return "A goal's due date is not a valid date.";
  }
  if (i.nextReviewOn !== undefined && i.nextReviewOn !== "" && (!isIsoDay(i.nextReviewOn) || i.nextReviewOn < i.date)) {
    return "The next review must be a date after this one.";
  }
  return null;
}

export function cleanGoals(goals: ReviewInput["goals"], newId: () => string): ReviewGoal[] {
  return goals.map((g) => ({
    id: newId(),
    text: text(g.text, 300),
    ...(g.dueDate && isIsoDay(g.dueDate) ? { dueDate: g.dueDate } : {}),
    done: !!g.done,
  }));
}

// Employees who have never had a review, or whose last one is more than `everyMonths` old (or past the date they set).
export function reviewsDue(
  employees: { id: string; name: string; active: boolean }[],
  reviews: { employeeId: string; date: string; nextReviewOn?: string }[],
  today: string,
  everyMonths = REVIEW_EVERY_MONTHS,
) {
  const out: { employeeId: string; name: string; state: "never" | "due"; lastDate?: string; dueOn?: string }[] = [];
  for (const e of employees) {
    if (!e.active) continue;
    const mine = reviews.filter((r) => r.employeeId === e.id).sort((a, b) => a.date.localeCompare(b.date));
    const last = mine[mine.length - 1];
    if (!last) {
      out.push({ employeeId: e.id, name: e.name, state: "never" });
      continue;
    }
    const cadence = addIsoMonths(last.date, everyMonths);
    const dueOn = last.nextReviewOn && last.nextReviewOn < cadence ? last.nextReviewOn : cadence;
    if (dueOn <= today) out.push({ employeeId: e.id, name: e.name, state: "due", lastDate: last.date, dueOn });
  }
  return out.sort((a, b) => (a.state === b.state ? a.name.localeCompare(b.name) : a.state === "never" ? -1 : 1));
}

// ---------- the Operations page headline ----------

// Screens only the owner sees: exit records hold severance and personal notes; the group view spans every business the login runs.
export const OWNER_ONLY_TABS: string[] = ["exitrecords", "group", "profitsplit", "systemcheck", "yearend"];

export const OPERATIONS_TABS = [
  { key: "requests", label: "Requests" },
  { key: "procedures", label: "Procedures" },
  { key: "compliance", label: "Compliance" },
  { key: "incidents", label: "Incidents" },
  { key: "equipment", label: "Equipment" },
  { key: "kpis", label: "KPIs" },
  { key: "reviews", label: "Reviews" },
  { key: "risks", label: "Risks" },
  { key: "quality", label: "Quality" },
  { key: "competitors", label: "Competitors" },
  { key: "objectives", label: "Objectives" },
  { key: "correspondence", label: "Correspondence" },
  { key: "inspections", label: "Inspections" },
  { key: "partners", label: "Partners" },
  { key: "webOrders", label: "Web orders" },
  { key: "waitlist", label: "Waitlist" },
  { key: "backorders", label: "Backorders" },
  { key: "decisions", label: "Decisions" },
  { key: "handover", label: "Shift handover" },
  { key: "escalations", label: "Escalations" },
  { key: "responsibilities", label: "Responsibilities" },
  { key: "capacity", label: "Capacity" },
  { key: "review", label: "Management review" },
  { key: "coverage", label: "Coverage" },
  { key: "suppliers", label: "Supplier performance" },
  { key: "leavers", label: "Leavers" },
  { key: "salesteam", label: "Sales team" },
  { key: "cyclecounts", label: "Cycle counts" },
  { key: "starter", label: "Starter setup" },
  { key: "priorities", label: "Stock priorities" },
  { key: "close", label: "Month-end close" },
  { key: "costvariance", label: "Cost variance" },
  { key: "royalties", label: "Royalties" },
  { key: "royaltyinbox", label: "Royalty inbox" },
  { key: "appraisal", label: "Investment appraisal" },
  { key: "choices", label: "Loans and waiting" },
  { key: "pricecheck", label: "Quantity pricing" },
  { key: "sourcing", label: "Sourcing risk" },
  { key: "cycletime", label: "Cycle time" },
  { key: "recruiting", label: "Recruiting" },
  { key: "taxsetaside", label: "Tax set-aside" },
  { key: "exitrecords", label: "Exit records (owner)" },
  { key: "obligations", label: "Obligations calendar" },
  { key: "succession", label: "Succession and organisation" },
  { key: "loops", label: "Feedback loops" },
  { key: "scenarios", label: "Scenario plan" },
  { key: "complexity", label: "Financial complexity" },
  { key: "marketrates", label: "Market rates" },
  { key: "group", label: "Group view (all your businesses)" },
  { key: "contracts", label: "Contracts" },
  { key: "profitsplit", label: "Profit split (owner)" },
  { key: "sustainability", label: "Sustainability and community" },
  { key: "partnerrevenue", label: "Partner revenue" },
  { key: "customerprofit", label: "Customer profit (which customers pay)" },
  { key: "systemcheck", label: "System check (owner)" },
  { key: "trialbalance", label: "Trial balance" },
  { key: "journal", label: "Journal (double entry)" },
  { key: "contractorshare", label: "Contractor and talent shares" },
  { key: "yearend", label: "Year-end close (owner)" },
  { key: "deliveryrun", label: "Delivery run" },
] as const;
export type OperationsTab = (typeof OPERATIONS_TABS)[number]["key"];

// Which tabs a role may open. Staff run the floor (requests, procedures, incidents, equipment). Accountants see what the books
// need (compliance and KPIs). Reviews are for the Owner and Manager only.
export function tabsForRole(role: string | null): OperationsTab[] {
  // Exit records hold severance and exit notes: the owner alone sees them.
  if (role === "owner") return OPERATIONS_TABS.map((t) => t.key);
  if (role === "manager") return OPERATIONS_TABS.map((t) => t.key).filter((k) => !OWNER_ONLY_TABS.includes(k));
  if (role === "staff") return ["requests", "procedures", "incidents", "equipment", "quality", "correspondence", "inspections", "waitlist", "backorders", "handover"];
  if (role === "accountant") return ["compliance", "kpis"];
  return [];
}

// Screens a type of business does not normally use. Core screens (requests, procedures, starter setup, compliance, KPIs, reviews, risks, quality,
// the team and records) are never hidden. "Show every screen" in the starter set turns this off.
const SCREENS_NOT_FOR_KIND: Record<string, string[]> = {
  services: ["cyclecounts", "priorities", "royalties", "royaltyinbox", "costvariance", "sourcing", "deliveryrun", "backorders"],
  consultancy: ["cyclecounts", "priorities", "royalties", "royaltyinbox", "costvariance", "sourcing", "deliveryrun", "backorders"],
  membership: ["cyclecounts", "priorities", "royalties", "royaltyinbox", "costvariance", "sourcing", "deliveryrun", "backorders"],
  rental: ["cyclecounts", "royalties", "royaltyinbox", "deliveryrun", "costvariance"],
  trades: ["royalties", "royaltyinbox", "cyclecounts"],
  healthcare: ["royalties", "royaltyinbox", "deliveryrun", "priorities", "backorders"],
};

// The screens to show: the role's screens, less those that do not fit the business type unless every screen is wanted.
export function visibleTabs(role: string | null, kind: string | undefined, showAll: boolean | undefined): OperationsTab[] {
  const base = tabsForRole(role);
  // The type shapes what owners and managers see; staff and accountants keep the screens their role was given.
  if (showAll || !kind || (role !== "owner" && role !== "manager")) return base;
  const hidden = SCREENS_NOT_FOR_KIND[kind] ?? [];
  return base.filter((k) => !hidden.includes(k));
}

export interface ProcedureInput {
  title: string;
  body: string;
  reviewEveryDays?: number;
  markReviewed?: boolean; // set the last review to today (the procedure was re-read and is still right)
  videoUrl?: string; // v286: https link to a recorded video; empty clears it
}
