// lib/independence.js
// Three honest questions about a business that is meant to be a company, not a job:
//   1. WHY do customers choose you? Price is the weakest reason (anyone can undercut it); convenience, status or identity, and
//      "I must solve this and you are the real option" are the reasons customers cannot easily substitute.
//   2. Would it run if you were absent? Which of the six processes depend on you today, and which are automated or handed over.
//   3. Is it scaling without more people? Customers and revenue per person.
// Pure functions over the owner's own data. Nothing is guessed: with too little data they say what is missing.

export const WIN_REASONS = [
  { id: 'convenience', label: 'Convenience: easier or faster than the alternative', sticky: true },
  { id: 'only_option', label: 'A problem they must solve and you are the real option', sticky: true },
  { id: 'identity', label: 'Status or identity: they want to be associated with you', sticky: true },
  { id: 'trust', label: 'Trust or relationship (including a referral)', sticky: true },
  { id: 'quality', label: 'Quality of the work or product', sticky: false },
  { id: 'price', label: 'Price: the weakest reason, others can undercut it', sticky: false },
  { id: 'other', label: 'Something else', sticky: false },
];
export const WIN_REASON_IDS = WIN_REASONS.map((r) => r.id);
export const winReasonLabel = (id) => (WIN_REASONS.find((r) => r.id === id) || {}).label || '';
export const MIN_REASONS = 5; // below this the split is noise: say how many are still missing

const WON = new Set(['closed_won', 'won']);

/** @param {Array} deals normalised deals { stage, winReason } (one per customer) */
export function computeWhyChosen(deals = []) {
  const won = deals.filter((d) => d && WON.has(String(d.stage)));
  const counts = Object.fromEntries(WIN_REASON_IDS.map((id) => [id, 0]));
  let recorded = 0;
  for (const d of won) {
    if (WIN_REASON_IDS.includes(d.winReason)) { counts[d.winReason] += 1; recorded += 1; }
  }
  const rows = WIN_REASONS.map((r) => ({ id: r.id, label: r.label, count: counts[r.id], sticky: r.sticky })).filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
  const sticky = rows.filter((r) => r.sticky).reduce((a, r) => a + r.count, 0);
  const stickyPct = recorded ? Math.round((sticky / recorded) * 100) : null;
  const pricePct = recorded ? Math.round((counts.price / recorded) * 100) : null;
  let verdict = null;
  if (won.length === 0) verdict = 'Appears after your first win.';
  else if (recorded < MIN_REASONS) verdict = `Record why each customer chose you (Customers, Details). ${recorded} of ${won.length} done; ${MIN_REASONS} give a first read.`;
  else if (pricePct >= 50) verdict = 'Most customers chose you on price. Anyone can undercut that. Find what makes you hard to replace: speed, a problem only you solve, or a name people want to be attached to.';
  else if (stickyPct >= 60) verdict = 'Most customers chose you for reasons that are hard to copy. Protect that and say it in your outreach.';
  else verdict = 'A mix. Look at the top reason and make it the first line of your outreach.';
  return { won: won.length, recorded, missing: won.length - recorded, rows, stickyPct, pricePct, verdict, enough: recorded >= MIN_REASONS };
}

const owner = (sop) => (sop && sop.owner) || 'me';

/**
 * @param {object} a
 *   waiting / unconverted: enquiries and replies waiting for a human; overdueCount: unpaid overdue invoices;
 *   stuckOnboarding / renewalsSoon / atRisk: customers needing attention; autopilotOn: outreach sends by itself;
 *   coverage: result of computeSopCoverage; people: 1 + team members; customers, revenue90: for the scale figures
 */
export function computeAwayCheck({ waiting = 0, unconverted = 0, overdueCount = 0, stuckOnboarding = 0, renewalsSoon = 0, atRisk = 0, autopilotOn = false, coverage = null, people = 1, customers = 0, revenue90 = 0 } = {}) {
  const handed = (pid) => !!(coverage && coverage.byProcess && coverage.byProcess[pid] && coverage.byProcess[pid].handed);
  const rows = [];
  const add = (id, label, live, liveText, automated) => {
    if (automated) rows.push({ id, label, state: 'runs', detail: 'Runs by itself' });
    else if (handed(id)) rows.push({ id, label, state: 'covered', detail: 'Written down and owned by someone else' });
    else rows.push({ id, label, state: 'needs_you', detail: live > 0 ? liveText : 'Only you know how. Write it down as an SOP and hand it over.' });
  };
  add('outreach', 'Finding and contacting leads', 0, '', autopilotOn);
  add('sales', 'Replying and closing', waiting + unconverted, `${waiting + unconverted} reply or enquiry waiting for you now`, false);
  add('onboarding', 'Onboarding new customers', stuckOnboarding, `${stuckOnboarding} customer stuck in onboarding`, false);
  add('delivery', 'Delivering the work or product', 0, '', false);
  add('billing', 'Invoicing and collecting', overdueCount, `${overdueCount} overdue invoice to chase`, false);
  add('support', 'Support and retention', renewalsSoon + atRisk, `${renewalsSoon + atRisk} renewal or at-risk customer to look after`, false);
  const needsYou = rows.filter((r) => r.state === 'needs_you').length;
  const verdict = needsYou <= 1 ? 'It mostly runs without you.' : needsYou <= 3 ? 'It partly depends on you.' : 'Right now this is still a job. Everything waits for you.';
  const p = Math.max(1, Math.floor(Number(people) || 1));
  return {
    rows, needsYou, verdict, people: p,
    customersPerPerson: customers > 0 ? Math.round((customers / p) * 10) / 10 : null,
    revenuePerPerson90: revenue90 > 0 ? Math.round(revenue90 / p) : null,
  };
}
