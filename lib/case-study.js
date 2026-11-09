// lib/case-study.js - case-study drafts from won accounts that agreed in writing. Pure: who qualifies, the prompt, and a check that no number is invented.
export function consentedWins(deals = []) {
  return (Array.isArray(deals) ? deals : []).filter((d) => d && d.stage === 'closed_won' && d.caseStudyConsent === true && d.email);
}

export function caseStudyPrompt(deal, notes = []) {
  const facts = [`Customer: ${deal.businessName || deal.email}`, deal.product ? `Bought: ${deal.product}` : '', ...((Array.isArray(notes) ? notes : []).map((n) => `Note: ${String(n.summary || '').slice(0, 400)}`))].filter(Boolean);
  return { facts: facts.join('\n'), prompt: `Write a short case study from these facts only.\n${facts.join('\n')}` };
}

export const CASE_STUDY_SYSTEM = 'You write short customer case studies for a small business. Return only JSON with keys: "title", "challenge", "solution", "result" (each under 300 characters). Use only the facts given. Never invent numbers, percentages, dates, names or quotes. Where a quote or a number would help, write [CUSTOMER QUOTE] or [FIGURE] instead.';

/** Checks the reply: every number in it must already be in the facts. Returns {ok, value} or {error}. */
export function parseCaseStudy(obj, facts = '') {
  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const value = { title: clean(obj?.title), challenge: clean(obj?.challenge), solution: clean(obj?.solution), result: clean(obj?.result) };
  if (!value.title || !value.solution) return { error: 'The draft came back incomplete. Try again.' };
  const allowed = new Set((String(facts).match(/\d+(\.\d+)?/g) || []));
  const text = Object.values(value).join(' ');
  for (const n of text.match(/\d+(\.\d+)?/g) || []) {
    if (!allowed.has(n)) return { error: 'The draft added a number that is not in your notes, so it was not kept. Add the figure to your notes or use [FIGURE].' };
  }
  return { ok: true, value };
}
