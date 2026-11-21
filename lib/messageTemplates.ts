// Ready-to-send outreach messages for leads, customers and support cases.
//
// Plain text the owner reads, edits and sends themselves through WhatsApp, email or by copying it. Balancr sends nothing,
// schedules nothing and tracks no opens: there is no outside messaging service in this app. Every first-contact message
// ends with an easy way to say no, so what goes out is permission-based, not pressure.
//
// Placeholders are filled here, never left as braces: a missing business name or topic falls back to plain wording.
import type { LeadStage } from "./types";

export type MessageAudience = "lead" | "customer" | "support";

export interface MessageVars {
  name: string; // the person's name (first name is used in the greeting)
  business?: string; // the sender's business
  topic?: string; // what the lead was about, for example "a bulk order of tiles"
  subject?: string; // the support case subject
}

export interface MessageTemplate {
  id: string;
  audience: MessageAudience;
  label: string;
  hint: string; // when to use it
  email: string; // subject line when sent as an email
  build: (v: { first: string; business: string; topic: string; subject: string }) => string;
}

export const OPT_OUT = "If now is not the right time, just tell me and I won't message again.";

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: "intro",
    audience: "lead",
    label: "First hello",
    hint: "A first message to someone who has not heard from you.",
    email: "A quick hello",
    build: ({ first, business, topic }) =>
      `Hi ${first}, this is ${business}. I'm getting in touch about ${topic}. Would you be open to a short chat this week? ${OPT_OUT}`,
  },
  {
    id: "follow_up",
    audience: "lead",
    label: "Gentle follow-up",
    hint: "You messaged already and have not heard back.",
    email: "Following up",
    build: ({ first, business, topic }) =>
      `Hi ${first}, just following up on my earlier message about ${topic}. Is this still something you're looking at? Happy to answer any questions. ${OPT_OUT} ${business}`,
  },
  {
    id: "qualify",
    audience: "lead",
    label: "Check it is a fit",
    hint: "Before you spend time on a quote: what they need, by when, and what they have in mind to spend.",
    email: "A few quick questions",
    build: ({ first, business, topic }) =>
      `Hi ${first}, thanks for your interest in ${topic}. So I can give you something useful, could you tell me three things: what exactly you need, when you need it by, and roughly what budget you have in mind? Then I'll tell you honestly whether we're the right fit. ${business}`,
  },
  {
    id: "quote_chase",
    audience: "lead",
    label: "After sending a quote",
    hint: "A quote is out and there has been no answer.",
    email: "Your quote",
    build: ({ first, business, topic }) =>
      `Hi ${first}, I sent you our quote for ${topic}. Is there anything you'd like me to explain or change? If you've decided to go another way, that's fine, just let me know. ${business}`,
  },
  {
    id: "winback_lead",
    audience: "lead",
    label: "Reopen a lost lead",
    hint: "A lead that went quiet or said no for now.",
    email: "Checking in",
    build: ({ first, business, topic }) =>
      `Hi ${first}, it's ${business}. A while ago we spoke about ${topic}. If anything has changed on your side, I'd be glad to pick it up again. ${OPT_OUT}`,
  },
  {
    id: "thanks",
    audience: "customer",
    label: "Thank you and check-in",
    hint: "A day or two after a sale or delivery.",
    email: "Thank you",
    build: ({ first, business }) =>
      `Hi ${first}, thank you for your order with ${business}. Is everything as you expected? If anything isn't right, reply here and we'll sort it out.`,
  },
  {
    id: "referral",
    audience: "customer",
    label: "Ask for a referral",
    hint: "A happy customer who has had a good experience.",
    email: "A small favour",
    build: ({ first, business }) =>
      `Hi ${first}, we're glad you're happy with ${business}. If you know someone who could use what we do, we'd be glad to look after them the same way. A quick introduction is all it takes. Thank you!`,
  },
  {
    id: "winback_customer",
    audience: "customer",
    label: "Win back a quiet customer",
    hint: "Someone who used to buy and has gone quiet.",
    email: "We miss you",
    build: ({ first, business }) =>
      `Hi ${first}, it's been a while since your last order with ${business}. Is there anything we could do better? We'd be glad to see you again. ${OPT_OUT}`,
  },
  {
    id: "feedback_ask",
    audience: "customer",
    label: "Ask how we did (0 to 10)",
    hint: "A week or two after a sale: the one question that shows how likely they are to recommend you. Log the number on the Feedback page.",
    email: "One quick question",
    build: ({ first, business }) =>
      `Hi ${first}, one quick question about ${business}: on a scale of 0 to 10, how likely are you to recommend us to a friend or colleague? Just reply with a number, and tell me what is behind it if you like. ${OPT_OUT}`,
  },
  {
    id: "feedback_followup",
    audience: "customer",
    label: "Reply to a low score",
    hint: "Someone gave 6 or less: thank them for being honest and offer to put it right.",
    email: "Thank you for telling us",
    build: ({ first, business }) =>
      `Hi ${first}, thank you for being honest with us. We'd like to understand what went wrong and put it right if we can. Could you tell me a little more, or would a quick call suit you better? ${business}`,
  },
  {
    id: "support_check",
    audience: "support",
    label: "Check the issue is fixed",
    hint: "After you mark a case resolved.",
    email: "Is everything sorted?",
    build: ({ first, business, subject }) =>
      `Hi ${first}, we've marked your issue about "${subject}" as resolved. Is everything fine on your side? If not, tell us and we'll put it right. ${business}`,
  },
  {
    id: "support_update",
    audience: "support",
    label: "Update on an open case",
    hint: "A case has been open a while and they are waiting.",
    email: "An update on your request",
    build: ({ first, business, subject }) =>
      `Hi ${first}, a quick update on "${subject}": we're still working on it and haven't forgotten you. I'll come back to you as soon as I have an answer. Thank you for your patience. ${business}`,
  },
];

export function templatesFor(audience: MessageAudience): MessageTemplate[] {
  return MESSAGE_TEMPLATES.filter((t) => t.audience === audience);
}

// The template that fits where a lead is.
export function suggestedLeadTemplate(stage: LeadStage): string {
  switch (stage) {
    case "new": return "intro";
    case "contacted": return "follow_up";
    case "qualified": return "quote_chase";
    case "follow_up": return "follow_up";
    case "proposal_sent": return "quote_chase";
    case "won": return "thanks";
    case "lost": return "winback_lead";
    default: return "intro";
  }
}

export function firstName(name: string): string {
  const t = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return t || "there";
}

export interface BuiltMessage {
  subject: string;
  body: string;
}

// Fills a template. Unknown ids fall back to the first template of the audience's list so the caller never gets blank text.
export function buildMessage(id: string, vars: MessageVars): BuiltMessage {
  const t = MESSAGE_TEMPLATES.find((x) => x.id === id) ?? MESSAGE_TEMPLATES[0];
  const clean = (s: string | undefined, fallback: string) => ((s ?? "").replace(/\s+/g, " ").trim() || fallback);
  const body = t.build({
    first: firstName(vars.name),
    business: clean(vars.business, "our team"),
    topic: clean(vars.topic, "what we can do for you"),
    subject: clean(vars.subject, "your request"),
  });
  return { subject: t.email, body };
}
