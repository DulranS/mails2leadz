// lib/support-bot.js - answers customers' WhatsApp and SMS questions only from the owner's own written answers, and hands everything else to a person. Pure.
// Nothing is generated: a reply is always one of the owner's answers, or nothing. Complaints, refunds, legal or payment matters and requests for a person always go to the support queue.
export const MAX_REPLY = 480;
const STOP = new Set(['the', 'and', 'for', 'you', 'your', 'are', 'can', 'how', 'what', 'when', 'with', 'this', 'that', 'have', 'does', 'do', 'is', 'it', 'a', 'an', 'to', 'of', 'in', 'on', 'my', 'me', 'i', 'please', 'hi', 'hello']);
const ESCALATE = /(refund|money back|chargeback|complain|complaint|lawyer|solicitor|legal|angry|furious|scam|fraud|broken|damaged|not working|doesn'?t work|cancel my|speak to (a |some)?(person|human|someone|manager)|talk to (a |some)?(person|human|someone|manager)|human|manager|urgent|emergency|charged twice|overcharged|wrong (item|order)|payment (failed|issue|problem))/i;
const AUTO_TEXT = /^\s*(this is an automatic reply|automatic reply|out of office|auto-?reply)/i;

const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/** The owner's library: [{q, a}]. Keeps the first 30 entries and trims the text. */
export function cleanLibrary(list) {
  return (Array.isArray(list) ? list : []).map((x) => ({ q: String(x?.q || '').trim().slice(0, 200), a: String(x?.a || '').trim().slice(0, MAX_REPLY) }))
    .filter((x) => x.q && x.a).slice(0, 30);
}

/** Decides what to do with one message: answer from the library, or hand it to a person. Never answers STOP or automatic replies. */
export function decideSupport(body, library = []) {
  const text = String(body || '').trim();
  if (!text || AUTO_TEXT.test(text)) return { action: 'escalate', reason: 'automatic_or_empty', kind: 'support_request' };
  if (ESCALATE.test(text)) return { action: 'escalate', reason: 'needs_a_person', kind: /complain|refund|broken|damaged|not working|angry|wrong|overcharg|charged|payment/i.test(text) ? 'complaint' : 'support_request' };
  const msg = new Set(words(text));
  let best = null;
  for (const entry of cleanLibrary(library)) {
    const q = words(entry.q);
    if (!q.length) continue;
    const hits = q.filter((w) => msg.has(w)).length;
    const score = hits / q.length;
    if (hits >= 2 && score >= 0.5 && (!best || score > best.score)) best = { score, entry };
  }
  if (best) return { action: 'reply', reply: `${best.entry.a}\n\n(Automatic reply. Reply here if you need a person.)`.slice(0, MAX_REPLY + 60), score: Math.round(best.score * 100) / 100 };
  return { action: 'escalate', reason: 'no_answer_in_library', kind: 'support_request' };
}
