// lib/reply-intents.js - what a prospect's reply means, and what the app suggests (pure, no AI, testable).
// Kept outside the route file because Next.js route files may only export HTTP handlers and config.

export const INTENTS = ['interested', 'meeting_request', 'pricing_question', 'question', 'not_now', 'not_interested', 'unsubscribe', 'out_of_office', 'other'];

// intent -> { stage to suggest (null = leave as is), label, advice }
export const INTENT_RULES = {
  interested: { stage: 'qualified', label: 'Interested', advice: 'Reply today and suggest one concrete next step.' },
  meeting_request: { stage: 'demo', label: 'Wants to meet', advice: 'Offer two or three times and confirm quickly.' },
  pricing_question: { stage: 'qualified', label: 'Asked about price', advice: 'Answer plainly. A clear price or range beats a vague one.' },
  question: { stage: 'qualified', label: 'Has a question', advice: 'Answer the question first, then ask one question back.' },
  not_now: { stage: null, label: 'Not now', advice: 'Thank them and set a reminder to check back in a few weeks.' },
  not_interested: { stage: 'closed_lost', label: 'Not interested', advice: 'Thank them politely and stop contacting them.' },
  unsubscribe: { stage: 'closed_lost', label: 'Asked to stop', advice: 'Honour it: send no more messages to this person.' },
  out_of_office: { stage: null, label: 'Out of office', advice: 'Not a real reply. Try again after they are back.' },
  other: { stage: null, label: 'Unclear', advice: 'Read it yourself and decide.' },
};

export function ruleFor(intent) {
  return INTENT_RULES[intent] ? { intent, ...INTENT_RULES[intent] } : { intent: 'other', ...INTENT_RULES.other };
}

// ---- cheap, rule-based first pass (no AI): the two things that are safe to recognise from plain wording ----
// An out-of-office / automatic reply is not a real answer, and an explicit "stop emailing me" is an opt-out.
// Everything else is left to the AI (or to the owner).
const OOO_RE = /(out of (the )?office|automatic reply|auto[- ]?reply|autoreply|auto-?response|away from (my )?(desk|email)|on (annual )?(leave|vacation|holiday)|i (am|'m) (currently )?(away|on leave)|will (be )?(back|return) (on|from|in)|limited access to (my )?email|abwesenheitsnotiz)/i;
const OPT_OUT_RE = /(\bunsubscribe\b|\bstop (emailing|contacting|messaging|sending)\b|\bremove me\b|\bdo not (email|contact)\b|\bdon'?t (email|contact) me\b|\btake me off\b|\bopt[- ]?out\b|\bno more emails?\b)/i;

// Gmail's preview of a short reply runs on into the quoted original ("On Mon ... wrote: Hi, ... unsubscribe"), and OUR OWN
// footer contains the word "unsubscribe". Only what the person wrote themselves may count, so cut at the first quote marker.
const QUOTE_CUT_RE = /(\bOn\s.{3,160}?\bwrote:|\bLe\s.{3,160}?\bécrit\s*:|-{2,}\s*(Original Message|Forwarded message)|\bFrom:\s.{0,120}?\bSent:|_{5,})/is;
export function ownWords(text) {
  const t = String(text || '').slice(0, 1500);
  const m = QUOTE_CUT_RE.exec(t);
  return m ? t.slice(0, m.index) : t;
}

/** @returns {'unsubscribe'|'out_of_office'|null} */
export function quickIntent(text) {
  const t = ownWords(text);
  if (!t.trim()) return null;
  if (OOO_RE.test(t)) return 'out_of_office'; // checked first: out-of-office texts often say "I will not see your email"
  if (OPT_OUT_RE.test(t)) return 'unsubscribe';
  return null;
}

// Stages a reply may MOVE a deal to by itself: forward only, open stages only. Never won, never lost (those stay a human decision).
const OPEN_ORDER = ['new', 'contacted', 'qualified', 'demo', 'proposal', 'negotiation'];
/** Stage the deal should be at after this reply: the suggested one if it is further along than where the deal is, else null (leave it). */
export function forwardStage(currentStage, suggestedStage) {
  const to = OPEN_ORDER.indexOf(suggestedStage);
  if (to < 0) return null;
  const from = currentStage ? OPEN_ORDER.indexOf(currentStage) : -1;
  if (currentStage && from < 0) return null; // won / lost / unknown: a person decides
  return to > from ? suggestedStage : null;
}
