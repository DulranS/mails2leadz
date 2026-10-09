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
