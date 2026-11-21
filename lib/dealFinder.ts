// Deal finder: turns a list you already have (pasted, or any source you have the right to use) into leads, and ranks your open
// leads so you work the best ones first. Balancr does not go and fetch lists from other sites; every lead comes from you.
//
// Pure. Parsing reuses the bulk lead import (lib/leadImport.ts), so pasted rows get the same checks and duplicate handling as a
// spreadsheet. Ranking uses only your own record: the win rate per lead source from the leads you have already decided.
import { isoFromEpoch } from "./playbook";
import type { Lead, LeadStage } from "./types";

export const DEAL_STAGE_WEIGHT: Record<string, number> = { new: 0, contacted: 5, follow_up: 10, qualified: 15, proposal_sent: 20 };
export const FALLBACK_WIN_RATE = 0.25; // used when a source has too few decided leads to judge
export const MIN_DECIDED_PER_SOURCE = 3;

const HEADER_WORDS = new Set([
  "name", "businessname", "company", "companyname", "fullname", "customer", "lead", "phone", "contact", "mobile", "whatsapp",
  "email", "telephone", "source", "leadsource", "channel", "value", "estvalue", "dealvalue", "estimatedvalue", "notes", "note",
  "nextfollowupdate", "followupdate",
]);
const POSITIONAL = ["name", "contact", "source", "estValue", "notes"];

// Pasted text, one lead per line. Tab or comma separated. A first line that names the columns is used as the header; otherwise the
// columns are read as: name, contact, source, estimated value, notes.
export function parsePastedList(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const split = (l: string) => (l.includes("\t") ? l.split("\t") : l.split(",")).map((c) => c.trim());
  const first = split(lines[0]);
  const hasHeader = first.some((c) => HEADER_WORDS.has(c.toLowerCase().replace(/[^a-z]/g, "")));
  const headers = hasHeader ? first : POSITIONAL;
  const body = hasHeader ? lines.slice(1) : lines;
  return body.map((l) => {
    const cells = split(l);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
}

const isOpen = (s: LeadStage) => s !== "won" && s !== "lost";

// Win rate for each lead source, from leads already won or lost. A source with fewer than MIN_DECIDED_PER_SOURCE decided leads is
// not judged: it gets the fallback rate and is marked unknown.
export function sourceWinRates(leads: Pick<Lead, "source" | "stage">[]): (source?: string) => { rate: number; known: boolean } {
  const tally = new Map<string, { won: number; decided: number }>();
  for (const l of leads) {
    if (l.stage !== "won" && l.stage !== "lost") continue;
    const k = (l.source ?? "").trim().toLowerCase();
    const t = tally.get(k) ?? { won: 0, decided: 0 };
    t.decided += 1;
    if (l.stage === "won") t.won += 1;
    tally.set(k, t);
  }
  return (source) => {
    const t = tally.get((source ?? "").trim().toLowerCase());
    if (!t || t.decided < MIN_DECIDED_PER_SOURCE) return { rate: FALLBACK_WIN_RATE, known: false };
    return { rate: t.won / t.decided, known: true };
  };
}

export interface LeadScore {
  score: number; // 0 to 100: how ready this lead is to work now
  expectedValue: number; // estimated value times the win rate of its source
  reasons: string[]; // short plain-words reasons, shown next to the lead
}

export function scoreLead(
  lead: Pick<Lead, "contact" | "source" | "stage" | "estValue" | "nextFollowUpDate" | "createdAt">,
  i: { today: string; winRateOf: (source?: string) => { rate: number; known: boolean } }
): LeadScore {
  let score = 0;
  const reasons: string[] = [];
  if (lead.contact && lead.contact.trim()) {
    score += 25;
  } else {
    reasons.push("no contact yet");
  }
  const value = lead.estValue && lead.estValue > 0 ? lead.estValue : 0;
  if (value > 0) {
    score += 15;
  } else {
    reasons.push("no estimated value");
  }
  const win = i.winRateOf(lead.source);
  if (win.known) {
    if (win.rate >= 0.4) {
      score += 20;
      reasons.push(`${Math.round(win.rate * 100)}% of ${lead.source ?? "this source"} leads are won`);
    } else if (win.rate >= 0.2) {
      score += 10;
      reasons.push(`${Math.round(win.rate * 100)}% of ${lead.source ?? "this source"} leads are won`);
    }
  } else {
    score += 5;
  }
  const stageW = DEAL_STAGE_WEIGHT[lead.stage] ?? 0;
  score += stageW;
  if (stageW >= 15) reasons.push("qualified or further along");
  if (lead.nextFollowUpDate) {
    const f = lead.nextFollowUpDate;
    if (f < i.today) {
      score += 10;
      reasons.push("follow-up overdue");
    } else if (f === i.today) {
      score += 10;
      reasons.push("follow-up due today");
    } else if (f <= addDaysIso(i.today, 7)) {
      score += 5;
      reasons.push("follow-up this week");
    }
  }
  if (typeof lead.createdAt === "number" && lead.createdAt > 0) {
    const created = isoFromEpoch(lead.createdAt);
    if (created >= addDaysIso(i.today, -14)) {
      score += 5;
      reasons.push("came in the last two weeks");
    }
  }
  return { score: Math.min(100, score), expectedValue: Math.round(value * win.rate * 100) / 100, reasons };
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface RankedLead<T> {
  lead: T;
  score: number;
  expectedValue: number;
  reasons: string[];
}

// Open leads only, best first: expected value, then readiness score, then name.
export function rankOpenLeads<T extends Pick<Lead, "name" | "contact" | "source" | "stage" | "estValue" | "nextFollowUpDate" | "createdAt">>(
  leads: T[],
  today: string
): RankedLead<T>[] {
  const winRateOf = sourceWinRates(leads);
  return leads
    .filter((l) => isOpen(l.stage))
    .map((l) => ({ lead: l, ...scoreLead(l, { today, winRateOf }) }))
    .sort((a, b) => b.expectedValue - a.expectedValue || b.score - a.score || a.lead.name.localeCompare(b.lead.name));
}
