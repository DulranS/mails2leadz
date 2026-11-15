// lib/ticket-categories.js - sorts each support question into a category from the customer's own words, so the owner sees what customers keep asking about (spec 5.1). Pure.
export const TICKET_CATEGORIES = ['billing', 'delivery', 'booking', 'product', 'account', 'general'];

// First match wins. Patterns are read on the customer's words, lower case.
const RULES = [
  ['billing', /invoice|refund|charge|payment|paid|pricing|overcharg|receipt/i],
  ['delivery', /deliver|shipping|shipped|tracking|parcel|courier|not arrived|late order/i],
  ['booking', /\bbook|appointment|reschedul|time slot/i],
  ['product', /broken|defect|faulty|damag|not working|doesn'?t work|poor quality|wrong item|missing part/i],
  ['account', /log ?in|password|sign ?in|locked out|access to my account/i],
];

/** The category for a question's text. Nothing matches -> general. */
export function categoryFor(text = '') {
  const s = String(text || '').slice(0, 1000);
  for (const [category, re] of RULES) if (re.test(s)) return category;
  return 'general';
}

/** Only a known category is kept; anything else becomes general. */
export function cleanCategory(v) {
  return TICKET_CATEGORIES.includes(v) ? v : 'general';
}

/** How many tickets sit in each category. Tickets from before categories count as general. */
export function categoryCounts(tickets = []) {
  const out = Object.fromEntries(TICKET_CATEGORIES.map((c) => [c, 0]));
  for (const t of Array.isArray(tickets) ? tickets : []) {
    if (!t) continue;
    out[cleanCategory(t.category)] += 1;
  }
  return out;
}
