// Personal data requests (v332). A register of requests from people who want to see, correct, erase, or withdraw consent for their
// data, against the response deadline. Ported from the AutoLeads register (pass 345), so the two apps agree.
//
// Sri Lanka's Personal Data Protection Act No. 9 of 2022, s.17(1) as it stood: 21 working days. The Personal Data Protection
// (Amendment) Act No. 22 of 2025 (certified 30 Oct 2025) changes s.17 to one month from receipt, extendable by two months for reasons
// given. Its commencement is set by Ministerial Order and is not confirmed here. Until that is known, the due date is the EARLIER of the
// two, so the app is never late under either rule. Working days are Monday to Friday; public holidays are not excluded, so the date is
// never later than the legal one.
//
// The owner decides the outcome. Nothing here answers the person. Pure: no I/O.

export const REQUEST_KINDS = ["access", "correction", "erasure", "withdrawal"] as const;
export type DataRequestKind = (typeof REQUEST_KINDS)[number];
export const REQUEST_KIND_LABELS: Record<DataRequestKind, string> = {
  access: "See my data",
  correction: "Correct my data",
  erasure: "Erase my data",
  withdrawal: "Withdraw consent",
};
export const DEADLINE_WORKING_DAYS = 21;
export const DUE_SOON_WORKING_DAYS = 3;

export type DataRequestState = "open" | "due_soon" | "overdue" | "done";
export interface DataRequest {
  id: string;
  kind: DataRequestKind;
  name: string;
  email: string;
  receivedOn: string; // ISO yyyy-mm-dd
  dueOn: string; // ISO yyyy-mm-dd
  status: "open" | "done";
  doneOn: string | null;
  notes: string;
  createdAt: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const clean = (s: unknown, max: number): string =>
  String(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** The calendar date `n` working days after `iso`, skipping Saturdays and Sundays. Null for a bad date. */
export function addWorkingDays(iso: string, n: number): string | null {
  if (!DATE_RE.test(String(iso))) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

/** The date one calendar month after `iso`, clamped to the end of a shorter month. Null for a bad date. */
export function addOneMonth(iso: string): string | null {
  if (!DATE_RE.test(String(iso))) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  const day = d.getUTCDate();
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out.toISOString().slice(0, 10);
}

/** The answer-by date for a request received on `iso`: the earlier of 21 working days and one calendar month. */
export function deadlineFor(iso: string): string | null {
  const byDays = addWorkingDays(iso, DEADLINE_WORKING_DAYS);
  const byMonth = addOneMonth(iso);
  if (!byDays || !byMonth) return null;
  return byDays <= byMonth ? byDays : byMonth;
}

/** One request, checked and cleaned. Null when there is no name, or no usable date. */
export function sanitizeRequest(
  input: Partial<Record<keyof DataRequest, unknown>> = {},
  { today }: { today: string }
): Omit<DataRequest, "id" | "createdAt"> | null {
  const name = clean(input.name, 120);
  if (!name) return null;
  const receivedOn = DATE_RE.test(String(input.receivedOn ?? "")) ? String(input.receivedOn) : today;
  const dueOn = deadlineFor(receivedOn);
  if (!dueOn) return null;
  const email = clean(input.email, 254).toLowerCase();
  const notes = clean(input.notes, 1000);
  return {
    kind: (REQUEST_KINDS as readonly string[]).includes(String(input.kind)) ? (input.kind as DataRequestKind) : "access",
    name,
    email: EMAIL_RE.test(email) ? email : "",
    receivedOn,
    dueOn,
    status: "open",
    doneOn: null,
    notes,
  };
}

/** open, due_soon (within DUE_SOON_WORKING_DAYS of the deadline), overdue, or done. */
export function requestState(req: Pick<DataRequest, "status" | "dueOn"> | null | undefined, today: string): DataRequestState {
  if (!req) return "open";
  if (req.status === "done") return "done";
  if (!DATE_RE.test(String(req.dueOn ?? ""))) return "open";
  if (today > req.dueOn) return "overdue";
  const soon = addWorkingDays(today, DUE_SOON_WORKING_DAYS);
  return soon && req.dueOn <= soon ? "due_soon" : "open";
}

export const REQUEST_STATE_LABELS: Record<DataRequestState, string> = { open: "Open", due_soon: "Due soon", overdue: "Overdue", done: "Done" };

/** Requests that need attention first: overdue, then due soon, earliest deadline first within each. */
export function requestsNeedingAttention<T extends Pick<DataRequest, "status" | "dueOn">>(list: readonly T[] = [], today: string): (T & { state: DataRequestState })[] {
  const rank: Record<DataRequestState, number> = { overdue: 0, due_soon: 1, open: 2, done: 3 };
  return list
    .map((r) => ({ ...r, state: requestState(r, today) }))
    .sort((a, b) => rank[a.state] - rank[b.state] || String(a.dueOn).localeCompare(String(b.dueOn)));
}
