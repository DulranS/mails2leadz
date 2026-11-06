// lib/bid-draft.js - a first draft of a tender or bid response, from the owner's pasted tender and business profile. Pure: prompt and reply check.
// Nothing is submitted. Prices, dates, certificates and references are left as clearly marked placeholders for the owner to fill.
export const BID_SYSTEM = [
  'You draft tender and bid responses for a small business owner.',
  'Return only JSON with these keys: "executiveSummary" (under 600 characters), "understandingOfRequirement" (under 800 characters),',
  '"proposedApproach" (under 800 characters), "relevantExperience" (under 500 characters, use [PLACEHOLDER] where the owner must add their own),',
  '"pricingNotes" (no numbers; say what the owner must price), "complianceChecklist" (up to 10 short strings), "questionsForBuyer" (up to 5 short strings).',
  'Use only what the tender and profile say. Never invent prices, certificates, references, dates or past clients. Mark anything the owner must confirm as [PLACEHOLDER].',
].join(' ');

export function bidDraftPrompt(tenderText, profile = '') {
  return `Tender:\n${String(tenderText || '').slice(0, 20000)}\n\nBusiness profile:\n${String(profile || '').slice(0, 2000)}`;
}

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const list = (v, max, n) => (Array.isArray(v) ? v : []).map((x) => clip(x, n)).filter(Boolean).slice(0, max);

export function parseBidDraft(obj) {
  const value = {
    executiveSummary: clip(obj?.executiveSummary, 600),
    understandingOfRequirement: clip(obj?.understandingOfRequirement, 800),
    proposedApproach: clip(obj?.proposedApproach, 800),
    relevantExperience: clip(obj?.relevantExperience, 500),
    pricingNotes: clip(obj?.pricingNotes, 400),
    complianceChecklist: list(obj?.complianceChecklist, 10, 160),
    questionsForBuyer: list(obj?.questionsForBuyer, 5, 200),
  };
  if (value.executiveSummary.length < 20) return { error: 'The draft came back empty. Try again with more of the tender text.' };
  return { ok: true, value };
}
