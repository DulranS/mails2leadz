// Customer feedback: the one question that predicts repeat business, "how likely are you to recommend us, 0 to 10?"
//
// A plain record, never part of the books. The owner asks (face to face, by phone, or with the ready-written message on
// the Feedback page) and types the answers in; Balancr sends nothing and tracks nothing.
//
//   Promoter  = 9 or 10      Passive = 7 or 8      Detractor = 0 to 6
//   NPS       = round((promoters - detractors) / answers x 100), from -100 to +100, over the last 90 days
//   Trend     = this 90 days minus the 90 days before it (needs answers in both)
//   Too few   = under 10 answers in the window: the score is shown but flagged as unreliable
//   To follow up = detractors in the last 180 days nobody has got back to yet, oldest first
//   Ask for a referral = promoters in the last 90 days, newest first
import type { FeedbackChannel, FeedbackEntry } from "./types";
import { addDays, isIsoDate } from "./playbook";

export const FEEDBACK_WINDOW_DAYS = 90;
export const FOLLOW_UP_LOOKBACK_DAYS = 180;
export const MIN_RELIABLE_ANSWERS = 10;
export const MAX_FEEDBACK_COMMENT = 1000;

export const FEEDBACK_CHANNELS: { value: FeedbackChannel; label: string }[] = [
  { value: "in_person", label: "In person" },
  { value: "whatsapp", label: "WhatsApp or text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone call" },
  { value: "online_review", label: "Online review (Google, Facebook, a review site)" },
  { value: "other", label: "Other" },
];

export interface FeedbackInput {
  customerName: string;
  contact?: string;
  score: number;
  comment?: string;
  receivedOn: string;
  channel?: FeedbackChannel;
  followedUp: boolean;
}

export type NpsGroup = "promoter" | "passive" | "detractor";

export function npsGroup(score: number): NpsGroup {
  return score >= 9 ? "promoter" : score >= 7 ? "passive" : "detractor";
}

const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;

export function validateFeedbackInput(i: FeedbackInput): string | null {
  if (!(i.customerName ?? "").trim()) return "Who gave this answer?";
  if (i.customerName.trim().length > 100) return "The customer name is too long (most 100 characters).";
  if (typeof i.score !== "number" || !Number.isInteger(i.score) || i.score < 0 || i.score > 10) return "The score is a whole number from 0 to 10.";
  if ((i.comment ?? "").length > MAX_FEEDBACK_COMMENT) return `The comment is too long (most ${MAX_FEEDBACK_COMMENT.toLocaleString("en-US")} characters).`;
  if ((i.contact ?? "").length > 100) return "The contact is too long (most 100 characters).";
  if (!isIsoDate(i.receivedOn)) return "Received on is not a real date.";
  if (i.channel !== undefined && !FEEDBACK_CHANNELS.some((c) => c.value === i.channel)) return "Choose how the answer came in.";
  if (typeof i.followedUp !== "boolean") return "Say whether someone has got back to them.";
  return null;
}

// No undefined or blank optional fields reach the database.
export function cleanFeedbackInput(i: FeedbackInput): FeedbackInput {
  const t = (s?: string) => (s ?? "").trim();
  return {
    customerName: t(i.customerName).replace(/\s+/g, " "),
    score: i.score,
    receivedOn: i.receivedOn,
    followedUp: i.followedUp,
    ...(t(i.contact) ? { contact: t(i.contact) } : {}),
    ...(t(i.comment) ? { comment: (i.comment ?? "").replace(/\r\n/g, "\n").trim() } : {}),
    ...(i.channel ? { channel: i.channel } : {}),
  };
}

export interface NpsWindow {
  answers: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps: number | null; // null with no answers
  average: number | null; // mean score to one decimal
}

function windowStats(list: FeedbackEntry[]): NpsWindow {
  let promoters = 0, passives = 0, detractors = 0, sum = 0;
  for (const e of list) {
    sum += e.score;
    const g = npsGroup(e.score);
    if (g === "promoter") promoters++;
    else if (g === "passive") passives++;
    else detractors++;
  }
  const answers = list.length;
  return {
    answers,
    promoters,
    passives,
    detractors,
    nps: answers > 0 ? Math.round(((promoters - detractors) / answers) * 100) : null,
    average: answers > 0 ? round1(sum / answers) : null,
  };
}

export interface FeedbackSummary extends NpsWindow {
  previous: NpsWindow; // the 90 days before
  trend: number | null; // nps minus previous nps; null unless both windows have answers
  tooFew: boolean; // fewer than MIN_RELIABLE_ANSWERS in the window (including none)
  toFollowUp: FeedbackEntry[];
  referralCandidates: FeedbackEntry[];
}

export function summarizeFeedback(entries: FeedbackEntry[], today: string): FeedbackSummary {
  const from = addDays(today, -FEEDBACK_WINDOW_DAYS);
  const prevFrom = addDays(today, -2 * FEEDBACK_WINDOW_DAYS);
  const lookback = addDays(today, -FOLLOW_UP_LOOKBACK_DAYS);
  const valid = entries.filter((e) => isIsoDate(e.receivedOn) && e.receivedOn <= today && Number.isInteger(e.score) && e.score >= 0 && e.score <= 10);
  const current = valid.filter((e) => e.receivedOn >= from);
  const previousList = valid.filter((e) => e.receivedOn >= prevFrom && e.receivedOn < from);
  const now = windowStats(current);
  const previous = windowStats(previousList);
  return {
    ...now,
    previous,
    trend: now.nps !== null && previous.nps !== null ? now.nps - previous.nps : null,
    tooFew: now.answers < MIN_RELIABLE_ANSWERS,
    toFollowUp: valid
      .filter((e) => e.receivedOn >= lookback && npsGroup(e.score) === "detractor" && !e.followedUp)
      .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn) || a.customerName.localeCompare(b.customerName, undefined, { sensitivity: "base" })),
    referralCandidates: current
      .filter((e) => npsGroup(e.score) === "promoter")
      .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || a.customerName.localeCompare(b.customerName, undefined, { sensitivity: "base" })),
  };
}

// A plain-words reading of the score. Never stronger than the number of answers allows.
export function npsVerdict(s: Pick<FeedbackSummary, "nps" | "answers" | "tooFew">): string {
  if (s.nps === null) return "No answers yet. Ask a few customers the one question to get a first reading.";
  if (s.tooFew) return `Only ${s.answers} ${s.answers === 1 ? "answer" : "answers"} so far: treat this as a first impression, not a score. Aim for ${MIN_RELIABLE_ANSWERS} or more.`;
  if (s.nps >= 50) return "Customers are recommending you. Ask the happy ones for introductions.";
  if (s.nps >= 30) return "Healthy: more fans than critics. Look at what the critics say to get higher.";
  if (s.nps >= 0) return "Room to improve: fans and critics are close. Follow up every low score.";
  return "More critics than fans. Fix what they name before spending more on finding new customers.";
}

export const customerKey = (s: string) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Customers who bought recently and have not been asked lately: the people to ask next. Inputs are plain
// name/date pairs so the caller can feed it sales without this file depending on their shape.
//   asked      = has a feedback answer in the last 180 days (spelling and spacing ignored)
//   boughtSince = last purchase within the last 60 days
export function customersToAsk(
  purchases: { customerName: string; date: string }[],
  entries: FeedbackEntry[],
  today: string,
  limit = 8
): { name: string; lastPurchase: string }[] {
  const boughtFrom = addDays(today, -60);
  const askedFrom = addDays(today, -FOLLOW_UP_LOOKBACK_DAYS);
  const asked = new Set(entries.filter((e) => e.receivedOn >= askedFrom).map((e) => customerKey(e.customerName)));
  const last = new Map<string, { name: string; lastPurchase: string }>();
  for (const p of purchases) {
    const k = customerKey(p.customerName);
    if (!k || !isIsoDate(p.date) || p.date > today || p.date < boughtFrom) continue;
    const cur = last.get(k);
    if (!cur || p.date > cur.lastPurchase) last.set(k, { name: p.customerName.trim(), lastPurchase: p.date });
  }
  return [...last.entries()]
    .filter(([k]) => !asked.has(k))
    .map(([, v]) => v)
    .sort((a, b) => b.lastPurchase.localeCompare(a.lastPurchase) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .slice(0, limit);
}
