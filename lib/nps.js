// lib/nps.js - would customers recommend you? One question, 0 to 10, asked of each customer: 9-10 promoters, 7-8 passive, 0-6 detractors.
// Score = % promoters minus % detractors (-100 to 100). Shown only from 5 answers, because fewer is noise. The scores are what customers
// told you, entered by you; the app never guesses one.
export const MIN_RESPONSES = 5;
const WON = new Set(['closed_won', 'won']);

export const cleanScore = (v) => { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= 10 ? n : null; };

/** @param {Array<{stage:string, nps?:number|null, businessName?:string, email?:string}>} deals normalised deals (one per customer) */
export function computeNps(deals = []) {
  const won = deals.filter((d) => d && WON.has(String(d.stage)));
  const answered = won.filter((d) => cleanScore(d.nps) !== null);
  const promoters = answered.filter((d) => d.nps >= 9).length;
  const passives = answered.filter((d) => d.nps >= 7 && d.nps <= 8).length;
  const detractors = answered.filter((d) => d.nps <= 6);
  const n = answered.length;
  const enough = n >= MIN_RESPONSES;
  const score = enough ? Math.round(((promoters - detractors.length) / n) * 100) : null;
  return {
    customers: won.length, responses: n, enough, score, promoters, passives, detractors: detractors.length,
    detractorList: detractors.sort((a, b) => a.nps - b.nps).slice(0, 5).map((d) => ({ email: d.email || '', name: d.businessName || d.email || 'A customer', score: d.nps })),
    verdict: won.length === 0 ? 'Appears after your first win.'
      : !enough ? `Ask each customer how likely they are to recommend you, 0 to 10, and enter it (Customers, Details). ${n} of ${MIN_RESPONSES} answers so far.`
      : score >= 50 ? 'Customers would recommend you. That is what free growth is built on.'
      : score >= 0 ? 'More customers are happy than not, but not enough to grow by word of mouth. Look at why the detractors scored low.'
      : 'More customers would warn people off than recommend you. Fix delivery before spending more on sales.',
  };
}
