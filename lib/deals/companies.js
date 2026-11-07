// lib/deals/companies.js - turns Companies House records into a company summary and transparent signals. Pure. Not investment advice.
// Field names follow the Companies House public API as known at writing; verify against the current reference.
export const SIGNAL_WEIGHTS = { accountsOverdue: -20, insolvency: -40, unsatisfiedCharges: -15, leadershipTurnover: -10, established: +10, sectorFit: +10, activeFiling: +5 };

const yearsSince = (iso, now = Date.now()) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? (now - t) / (365.25 * 86400000) : null; };

/** A search hit from the Companies House search reply. */
export function parseSearch(json) {
  return (json?.items || []).map((i) => ({
    companyNumber: String(i.company_number || ''),
    name: String(i.title || '').slice(0, 160),
    status: String(i.company_status || ''),
    incorporated: String(i.date_of_creation || ''),
    address: String(i.address_snippet || '').slice(0, 200),
  })).filter((x) => x.companyNumber);
}

/** The owner-facing summary from a profile, its charges and its officers. */
export function parseProfile({ profile = {}, charges = {}, officers = {} }, { now = Date.now() } = {}) {
  const resigned = (officers.items || []).filter((o) => o.resigned_on && (yearsSince(o.resigned_on, now) ?? 99) < 2).length;
  return {
    companyNumber: String(profile.company_number || ''),
    name: String(profile.company_name || ''),
    status: String(profile.company_status || ''),
    ageYears: yearsSince(profile.date_of_creation, now),
    sic: (profile.sic_codes || []).slice(0, 5),
    accountsOverdue: !!profile.accounts?.overdue,
    lastAccountsTo: profile.accounts?.last_accounts?.made_up_to || null,
    insolvency: !!profile.has_insolvency_history,
    unsatisfiedCharges: Number(charges.unsatisfied_count ?? (charges.items || []).filter((c) => c.status !== 'satisfied').length) || 0,
    recentResignations: resigned,
  };
}

/** Each signal with its reason and weight. The score is a sum, clamped 0 to 100, from a base of 50. Nothing here is a buy recommendation. */
export function scoreSignals(company, { sicFit = [] } = {}) {
  const reasons = [];
  const add = (text, w) => reasons.push({ text, weight: w });
  if (company.accountsOverdue) add('Annual accounts are overdue at Companies House.', SIGNAL_WEIGHTS.accountsOverdue);
  if (company.insolvency) add('The company has an insolvency history.', SIGNAL_WEIGHTS.insolvency);
  if (company.unsatisfiedCharges > 0) add(`${company.unsatisfiedCharges} charge(s) over assets are still unsatisfied.`, SIGNAL_WEIGHTS.unsatisfiedCharges);
  if (company.recentResignations >= 2) add(`${company.recentResignations} officer resignations in the last two years.`, SIGNAL_WEIGHTS.leadershipTurnover);
  if (company.ageYears !== null && company.ageYears >= 10 && company.status === 'active') add('Trading for ten years or more and active.', SIGNAL_WEIGHTS.established);
  if (company.sic.some((c) => sicFit.includes(String(c)))) add('Its activity code matches your target sectors.', SIGNAL_WEIGHTS.sectorFit);
  if (company.lastAccountsTo) add('Accounts are filed.', SIGNAL_WEIGHTS.activeFiling);
  const score = Math.max(0, Math.min(100, 50 + reasons.reduce((a, r) => a + r.weight, 0)));
  return { score, reasons, redFlags: reasons.filter((r) => r.weight < 0).map((r) => r.text) };
}
