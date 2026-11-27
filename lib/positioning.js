// lib/positioning.js (v401): the business's positioning in three short texts the owner writes:
//   usp         - why a buyer picks you over the alternatives (the unique selling point)
//   valueProposition - the result you deliver, in one sentence (the value proposition)
//   persona     - the buyer you sell to first, in a sentence or two (the target persona)
// The app stores the text as typed (trimmed and length-limited). It does not write it for the owner. Pure.
export const POSITIONING_LIMITS = { usp: 300, valueProposition: 300, persona: 600 };
export const POSITIONING_FIELDS = [
  { key: 'usp', label: 'Why a buyer picks you (USP)', hint: 'One or two lines: what you do that the alternatives do not.' },
  { key: 'valueProposition', label: 'The result you deliver (value proposition)', hint: 'One sentence: the outcome the buyer gets.' },
  { key: 'persona', label: 'Who buys first (persona)', hint: 'Who they are, what they run, and what keeps them up at night.' },
];

/** Trims and limits each text. Anything that is not text becomes blank. */
export function sanitizePositioning(raw) {
  const out = {};
  for (const f of POSITIONING_FIELDS) {
    const v = raw && typeof raw[f.key] === 'string' ? raw[f.key] : '';
    out[f.key] = v.trim().slice(0, POSITIONING_LIMITS[f.key]);
  }
  return out;
}

/** Which of the three texts are still blank. */
export function positioningGaps(p) {
  return POSITIONING_FIELDS.filter((f) => !p || !String(p[f.key] || '').trim()).map((f) => f.key);
}
