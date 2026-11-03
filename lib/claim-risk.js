// lib/claim-risk.js - flags draft wording that makes price, result, guarantee, urgency or superlative claims. A rule-based filter:
// it catches common wording, not every claim, and it never approves a draft. A flagged draft is held for the owner's review.
const PATTERNS = {
  price: /(£|\$|€|\bLKR\b|\bRs\.?\s?\d|\b\d[\d,.]*\s?(%|percent|usd|gbp|eur|lkr)\b)/i,
  guarantee: /\b(guarantee[sd]?|100\s?%|risk[- ]free|money[- ]back)\b/i,
  results: /\b(double your|triple your|\d+\s?x\s+(your|more)|increase your (sales|revenue|leads)|in \d+ (days|weeks)|\d+\s?%\s+(more|increase|growth|off|discount))\b/i,
  urgency: /\b(limited time|last chance|only today|today only|act now|expires?|hurry|ends (soon|tonight|today)|only \d+ (left|spots?))\b/i,
  superlative: /\b(best|#1|number one|top[- ]rated|leading|cheapest|fastest)\b/i,
};

export function claimRisk(text) {
  const s = String(text || '');
  const reasons = Object.entries(PATTERNS).filter(([, re]) => re.test(s)).map(([k]) => k);
  return { flagged: reasons.length > 0, reasons };
}
