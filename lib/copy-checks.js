// lib/copy-checks.js - plain checks on a message, from the sales and persuasion notes: no fake pressure, no fear, no promises you cannot prove, and speak to the reader. Pure; no AI call.
const RULES = [
  { id: 'pressure', re: /\b(act now|last chance|hurry|only today|don'?t miss out|limited time only|before it'?s gone)\b/i, text: 'This creates pressure. Use urgency only when it is real, such as a true end date.' },
  { id: 'fear', re: /\b(you'?re losing|you are losing|you'?ll regret|before it'?s too late|disaster|danger|you will lose)\b/i, text: 'This plays on fear. Lead with the benefit the reader gets instead.' },
  { id: 'overpromise', re: /\b(guaranteed (results|success|profit|sales)|100%|risk[- ]free|best in the world|number one|#1|will double|always works)\b/i, text: 'This promises more than you can prove. Replace it with a specific result you can show.' },
];

/** Returns the warnings for a message. An empty list means nothing was flagged. */
export function copyChecks(text = '') {
  const t = String(text || '');
  const warnings = RULES.filter((r) => r.re.test(t)).map((r) => ({ id: r.id, text: r.text }));
  if (t.trim() && !/\byou(r|rs|'re|'ll)?\b/i.test(t)) warnings.push({ id: 'reader', text: 'The message never speaks to the reader. Say what it does for them ("you" or "your").' });
  if (t.split(/\s+/).filter(Boolean).length > 120) warnings.push({ id: 'length', text: 'This is long. Shorter messages with one clear ask get more replies.' });
  return { warnings };
}
