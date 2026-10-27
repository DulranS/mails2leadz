// lib/post-sale.js - the messages to customers who have already bought (reviews, feedback, referrals, check-ins).
// One source for the wording: the Customers page button and the nightly job both use postSaleMessages, so they say the same things.
import { SALES_GUARDRAILS, profileBlock } from './ai-client.js';
import { clip } from './server/route-helpers.js';

// Check-ins to people who ALREADY bought (they are customers, not prospects: no sales-sequence limits apply).
export const POST_SALE_BRIEF = {
  onboarding: 'A warm welcome a day after they said yes. Thank them, say what happens next in general terms, and ask if there is anything they need from you or anything they are unsure about.',
  delivery_check: 'A short check-in about a week in. Ask how things are going, invite honest feedback, and offer to fix anything that is not right.',
  upsell_opportunity: 'A one-month check-in. Ask what is working and what is not. Only if it fits the business profile, mention ONE relevant way you could help further, softly. No pressure, no discounts.',
  quarterly_review: 'A friendly quarterly review invitation. Offer a short call to look at how things are going and plan the next quarter together.',
  churn_winback: 'A short, honest note to a customer who stopped (cancelled or did not renew). Do not guilt, pressure or discount. Say you were glad to work with them, ask ONE open question about what would have made it better, and say the door is open if their needs change. Never claim to know why they left, and never invent changes or new features.',
  feedback_ask: 'A short, warm, personal note to a customer who has had their result. Thank them, then ask ONE simple thing: in a sentence or two, how did it go, and is there a result they noticed? Say you would love to mention it if they are happy for you to, and that they can say no. No incentives, no pressure, no guilt, no pre-written praise for them to copy. Never invent or assume any result.',
  review_ask: 'A short, warm, personal note to a customer who has been happy with the result. Thank them, then ask ONE simple thing: if they have a minute, would they leave a short, honest review on the page linked below. Say that a few honest words help other businesses find us, and that it is completely fine to say no. Never offer a reward, discount or anything in return for a review (review platforms forbid it). Do not write the review for them and do not suggest what it should say. Never invent or assume any result.',
  referral_ask: 'A short, warm, personal note to a customer who is doing well. Thank them genuinely, then ask for ONE introduction to someone who has the same need (the kind of business in "Who we help"). Make it easy: if a personal link is given, say they can simply pass it on or forward the email. No incentives, no pressure, no guilt; say you will look after anyone they send. Do not mention results or numbers that are not provided.',
};

export function postSaleMessages({ profile, purpose, businessName, to, refLink = '', senderName = '' }) {
      const system = `You write short, warm customer-care emails for a small business to a customer who has ALREADY bought.\n${SALES_GUARDRAILS.replace('one clear low-pressure call to action (e.g. a short reply or a quick call)', 'one easy question or next step')}\n${POST_SALE_BRIEF[purpose]}\nNever invent project details, results, dates or numbers; if you would need them, keep the wording general.\nReturn JSON only: {"subject": string, "body": string}. The body is plain text with a greeting and a sign-off.`;
      const prompt = `${profileBlock(profile)}\n\nCustomer: ${clip(businessName || to, 100)}\n${purpose === 'review_ask' ? (refLink ? 'Public review link the customer can use (the ONLY link you may include, exactly as written): ' + refLink + '\n' : 'No review link is set: ask them to reply and say you will send it.\n') : ''}${purpose === 'referral_ask' ? (refLink ? `Personal link the customer can pass on (the ONLY link you may include, exactly as written): ${refLink}\n` : 'No link is available: ask them to reply with an introduction.\n') : ''}Sign off as: ${clip(senderName || profile.businessName || 'the sender', 80)}\n\nWrite the email.`;
  return { system, prompt };
}

// Customer asks the nightly job may draft on its own. Referrals need a personal link built from the request, so they stay a button.
export const ASK_FIELD = { review_ask: 'reviewAskedAt', feedback_ask: 'feedbackAskedAt' };

/** Who to ask next, and what: reviews first, then feedback. Never a customer already in the queue, and never more than max. */
export function pickAsks(customers = [], { max = 5, skip = new Set() } = {}) {
  const out = [];
  for (const c of Array.isArray(customers) ? customers : []) {
    if (out.length >= max) break;
    if (!c?.email || skip.has(c.email)) continue;
    const purpose = c.review?.eligible ? 'review_ask' : c.feedback?.eligible ? 'feedback_ask' : '';
    if (!purpose) continue;
    out.push({ email: c.email, business: c.businessName || c.email, purpose });
  }
  return out;
}
