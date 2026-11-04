// lib/call-summary.js - turns a call or meeting transcript into a short, structured note. Pure: the prompt, and the check on the reply.
export const CALL_SUMMARY_SYSTEM = [
  'You summarise sales calls for the business owner.',
  'Return only JSON with these keys: "summary" (under 500 characters), "nextStep" (under 200 characters), "dueDate" ("YYYY-MM-DD" or ""),',
  '"objections" (up to 5 short strings), "sentiment" ("positive", "neutral" or "negative").',
  'Use only what the transcript says. Do not invent prices, dates, promises or commitments.',
].join(' ');

export function callSummaryPrompt(transcript) {
  return `Transcript:\n${String(transcript || '').slice(0, 20000)}`;
}

/** Checks the model's reply and keeps only sane fields. Returns {ok, value} or {error}. */
export function parseCallSummary(obj) {
  const summary = String(obj?.summary || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (summary.length < 10) return { error: 'The summary came back empty. Try again.' };
  const nextStep = String(obj?.nextStep || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const dueRaw = String(obj?.dueDate || '').trim();
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) && !Number.isNaN(Date.parse(`${dueRaw}T00:00:00Z`)) ? dueRaw : '';
  const objections = (Array.isArray(obj?.objections) ? obj.objections : [])
    .map((o) => String(o || '').replace(/\s+/g, ' ').trim().slice(0, 120)).filter(Boolean).slice(0, 5);
  const sentiment = ['positive', 'neutral', 'negative'].includes(obj?.sentiment) ? obj.sentiment : 'neutral';
  return { ok: true, value: { summary, nextStep, dueDate, objections, sentiment } };
}
