// Playbook arithmetic: what needs attention among the written procedures and contracts.
//
// Dates only, no money and no books: nothing here changes a figure anywhere. Everything is a plain rule the page shows in
// words next to the entry it applies to.
//
//   Procedures (or any entry with a review schedule)
//     due on = last reviewed (or the day it was written) + review every N days
//     "Review overdue" past that day, "Review due soon" in the 14 days before it.
//   Contracts (any entry with an end date)
//     decide by = end date - notice days (0 if none given)
//     "Ended" after the end date; "Act now" from the decide-by day until the end (renew, renegotiate or end it before you
//     are locked in); "Ending soon" in the 30 days before the decide-by day; otherwise "Running".
import type { PlaybookEntry, PlaybookKind } from "./types";
import { buildLetterheadHtml, escapeHtml, printBaseStyles } from "./print";
import type { Settings } from "./types";

export const MAX_PLAYBOOK_TITLE = 150;
export const MAX_PLAYBOOK_BODY = 20000;
export const REVIEW_SOON_DAYS = 14;
export const CONTRACT_SOON_DAYS = 30;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = ISO.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function toUtc(iso: string): number {
  const m = ISO.exec(iso)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function addDays(iso: string, n: number): string {
  return new Date(toUtc(iso) + n * 86400000).toISOString().slice(0, 10);
}

// b - a in whole days
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

// The calendar day an epoch-millisecond timestamp falls on, where the person is (not UTC).
export function isoFromEpoch(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type ReviewState = "none" | "ok" | "due_soon" | "overdue";
export interface ReviewStatus {
  state: ReviewState;
  dueOn: string | null;
  daysOverdue: number; // above 0 only when overdue
}

export function reviewStatus(e: Pick<PlaybookEntry, "reviewEveryDays" | "lastReviewed" | "createdAt">, today: string): ReviewStatus {
  const every = e.reviewEveryDays;
  if (typeof every !== "number" || !Number.isFinite(every) || every < 1) return { state: "none", dueOn: null, daysOverdue: 0 };
  const base = isIsoDate(e.lastReviewed) ? e.lastReviewed : isoFromEpoch(e.createdAt);
  const dueOn = addDays(base, Math.round(every));
  const late = daysBetween(dueOn, today);
  if (late > 0) return { state: "overdue", dueOn, daysOverdue: late };
  if (-late <= REVIEW_SOON_DAYS) return { state: "due_soon", dueOn, daysOverdue: 0 };
  return { state: "ok", dueOn, daysOverdue: 0 };
}

export type ContractState = "none" | "running" | "ending_soon" | "act_now" | "ended";
export interface ContractStatus {
  state: ContractState;
  endsOn: string | null;
  decideBy: string | null;
  daysToEnd: number | null; // negative once ended
  daysToDecide: number | null; // negative once the decide-by day has passed
}

export function contractStatus(e: Pick<PlaybookEntry, "endDate" | "noticeDays">, today: string): ContractStatus {
  if (!isIsoDate(e.endDate)) return { state: "none", endsOn: null, decideBy: null, daysToEnd: null, daysToDecide: null };
  const notice = typeof e.noticeDays === "number" && Number.isFinite(e.noticeDays) && e.noticeDays > 0 ? Math.round(e.noticeDays) : 0;
  const decideBy = addDays(e.endDate, -notice);
  const daysToEnd = daysBetween(today, e.endDate);
  const daysToDecide = daysBetween(today, decideBy);
  let state: ContractState;
  if (daysToEnd < 0) state = "ended";
  else if (daysToDecide <= 0) state = "act_now";
  else if (daysToDecide <= CONTRACT_SOON_DAYS) state = "ending_soon";
  else state = "running";
  return { state, endsOn: e.endDate, decideBy, daysToEnd, daysToDecide };
}

// "act" = do something now, "watch" = coming up, null = nothing to flag.
export type Attention = "act" | "watch" | null;
export function attention(e: PlaybookEntry, today: string): Attention {
  const r = reviewStatus(e, today).state;
  const c = contractStatus(e, today).state;
  if (r === "overdue" || c === "act_now") return "act";
  if (r === "due_soon" || c === "ending_soon") return "watch";
  return null;
}

export function sortPlaybook(entries: PlaybookEntry[], today: string): PlaybookEntry[] {
  const rank = (e: PlaybookEntry) => {
    const a = attention(e, today);
    return a === "act" ? 0 : a === "watch" ? 1 : 2;
  };
  return [...entries].sort((x, y) => rank(x) - rank(y) || x.title.localeCompare(y.title, undefined, { sensitivity: "base" }));
}

export interface PlaybookSummary {
  procedures: number;
  contracts: number;
  other: number;
  act: number;
  watch: number;
}

export function summarizePlaybook(entries: PlaybookEntry[], today: string): PlaybookSummary {
  const s: PlaybookSummary = { procedures: 0, contracts: 0, other: 0, act: 0, watch: 0 };
  for (const e of entries) {
    if (e.kind === "procedure") s.procedures++;
    else if (e.kind === "contract") s.contracts++;
    else s.other++;
    const a = attention(e, today);
    if (a === "act") s.act++;
    else if (a === "watch") s.watch++;
  }
  return s;
}

export interface PlaybookInput {
  kind: PlaybookKind;
  title: string;
  body: string;
  owner?: string;
  reviewEveryDays?: number;
  lastReviewed?: string;
  counterparty?: string;
  startDate?: string;
  endDate?: string;
  noticeDays?: number;
}

// Returns the first problem in plain words, or null if the entry can be saved.
export function validatePlaybookInput(i: PlaybookInput): string | null {
  if (!["procedure", "contract", "other"].includes(i.kind)) return "Choose what this is: a procedure, a contract or something else.";
  const title = (i.title ?? "").trim();
  if (!title) return "Give it a title.";
  if (title.length > MAX_PLAYBOOK_TITLE) return `The title is too long (most ${MAX_PLAYBOOK_TITLE} characters).`;
  if ((i.body ?? "").length > MAX_PLAYBOOK_BODY) return `The text is too long (most ${MAX_PLAYBOOK_BODY.toLocaleString("en-US")} characters). Split it into two entries.`;
  if (i.reviewEveryDays !== undefined && (!Number.isInteger(i.reviewEveryDays) || i.reviewEveryDays < 1 || i.reviewEveryDays > 3650)) return "Review every must be a whole number of days from 1 to 3650.";
  if (i.noticeDays !== undefined && (!Number.isInteger(i.noticeDays) || i.noticeDays < 0 || i.noticeDays > 3650)) return "Notice must be a whole number of days from 0 to 3650.";
  for (const [label, v] of [["Last reviewed", i.lastReviewed], ["Start date", i.startDate], ["End date", i.endDate]] as const) {
    if (v !== undefined && !isIsoDate(v)) return `${label} is not a real date.`;
  }
  if (i.startDate && i.endDate && i.endDate < i.startDate) return "The end date is before the start date.";
  if (i.noticeDays !== undefined && i.noticeDays > 0 && !i.endDate) return "Notice days only make sense with an end date.";
  return null;
}

// Removes empty optional fields so nothing undefined or blank is written to the database.
export function cleanPlaybookInput(i: PlaybookInput): PlaybookInput {
  const t = (s?: string) => (s ?? "").trim();
  return {
    kind: i.kind,
    title: t(i.title),
    body: (i.body ?? "").replace(/\r\n/g, "\n").trim(),
    ...(t(i.owner) ? { owner: t(i.owner) } : {}),
    ...(i.reviewEveryDays !== undefined ? { reviewEveryDays: i.reviewEveryDays } : {}),
    ...(t(i.lastReviewed) ? { lastReviewed: t(i.lastReviewed) } : {}),
    ...(i.kind === "contract" && t(i.counterparty) ? { counterparty: t(i.counterparty) } : {}),
    ...(i.kind === "contract" && t(i.startDate) ? { startDate: t(i.startDate) } : {}),
    ...(i.kind === "contract" && t(i.endDate) ? { endDate: t(i.endDate) } : {}),
    ...(i.kind === "contract" && i.noticeDays !== undefined && t(i.endDate) ? { noticeDays: i.noticeDays } : {}),
  };
}

// A printable page for one entry: letterhead, title, who owns it and when it was last reviewed, then the text exactly as
// written (line breaks kept). Everything typed is escaped.
export function buildPlaybookHtml(e: PlaybookEntry, settings: Settings, today: string): string {
  const kindLabel = e.kind === "procedure" ? "Procedure" : e.kind === "contract" ? "Contract summary" : "Notes";
  const meta: string[] = [];
  if (e.owner) meta.push(`<strong>Owner:</strong> ${escapeHtml(e.owner)}`);
  if (e.counterparty) meta.push(`<strong>With:</strong> ${escapeHtml(e.counterparty)}`);
  if (e.startDate) meta.push(`<strong>From:</strong> ${escapeHtml(e.startDate)}`);
  if (e.endDate) meta.push(`<strong>Until:</strong> ${escapeHtml(e.endDate)}`);
  if (e.noticeDays) meta.push(`<strong>Notice:</strong> ${e.noticeDays} days`);
  if (e.lastReviewed) meta.push(`<strong>Last reviewed:</strong> ${escapeHtml(e.lastReviewed)}`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(e.title)}</title>${printBaseStyles()}</head>
    <body>
      ${buildLetterheadHtml(settings, kindLabel)}
      <h1>${escapeHtml(e.title)}</h1>
      ${meta.length ? `<div class="muted" style="margin:6px 0 18px;">${meta.join(" &nbsp;·&nbsp; ")}</div>` : ""}
      <div style="white-space:pre-wrap;font-size:14px;line-height:1.55;">${escapeHtml(e.body)}</div>
      <div class="footer">Printed ${escapeHtml(today)}.${e.kind === "contract" ? " This is a summary kept for reference, not the signed agreement." : ""}</div>
    </body></html>`;
}
