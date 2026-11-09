// lib/kpi-economics.js - the money measures behind the playbook: order and contract values, price point, paid vs organic, CAC and LTV, and the guidance for the business model. Pure.
const r2 = (n) => Math.round(n * 100) / 100;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const PAID = ['meta', 'facebook', 'instagram', 'google_ads', 'tiktok', 'linkedin_ads', 'ads', 'paid'];
export const BUSINESS_MODELS = {
  b2b: { label: 'B2B (sales-led)', focus: ['Outbound to named accounts, with a short personal video or call', 'Case studies and a webinar to earn the first meeting', 'Score leads and route the hot ones to a person at once', 'Review each won account at 90 days to grow it'] },
  b2c: { label: 'B2C / D2C (online shop)', focus: ['Short-form video and creators for demand (UGC)', 'Retargeting and lookalike audiences for paid reach', 'A one-tap checkout, and an abandoned-cart reminder', 'Answer shipping and return questions fast; feed what customers ask into your videos'] },
  rental: { label: 'Rentals (bookings)', focus: ['Local search and map listings for "near me" intent', 'A live availability calendar and instant booking', 'Partnerships with local trades and event planners', 'Check-in and check-out texts, and a reminder to extend'] },
};

/** The money picture. Values are only as good as the invoices, deals and spend the owner records. */
export function economics({ invoices = [], deals = [], leads = [], customersLtv = {}, monthlySpend = 0, now = Date.now(), model = 'b2c' } = {}) {
  const year = now - 365 * 86400000;
  const paid = (Array.isArray(invoices) ? invoices : []).filter((i) => i && i.status === 'paid' && Number(i.amountPaid || i.total) > 0 && (Date.parse(i.paidAt || '') || 0) >= year);
  const amounts = paid.map((i) => Number(i.amountPaid) || Number(i.total) || 0);
  const won = (Array.isArray(deals) ? deals : []).filter((d) => d && d.stage === 'closed_won' && Number(d.value) > 0 && (Date.parse(d.stageTimes?.closed_won || d.closedAt || '') || 0) >= year);
  const wonValues = won.map((d) => Number(d.value));
  const sourceOf = (d) => String(d.source || 'unrecorded').toLowerCase();
  const paidWon = won.filter((d) => PAID.includes(sourceOf(d))).length;
  const ltvValues = Object.values(customersLtv || {}).map(Number).filter((x) => x > 0);
  const newCustomers = new Set(paid.map((i) => String(i.email || '').toLowerCase()).filter(Boolean)).size + won.length;
  const spend = Number(monthlySpend) > 0 ? Number(monthlySpend) * 12 : null;
  return {
    model: BUSINESS_MODELS[model] ? model : 'b2c',
    averageOrderValue: amounts.length ? r2(amounts.reduce((a, b) => a + b, 0) / amounts.length) : null,
    pricePoint: median(amounts) === null ? null : r2(median(amounts)),
    averageContractValue: wonValues.length ? r2(wonValues.reduce((a, b) => a + b, 0) / wonValues.length) : null,
    ltv: ltvValues.length ? r2(ltvValues.reduce((a, b) => a + b, 0) / ltvValues.length) : null,
    cac: spend !== null && newCustomers > 0 ? r2(spend / newCustomers) : null,
    ltvToCac: spend !== null && newCustomers > 0 && ltvValues.length ? r2((ltvValues.reduce((a, b) => a + b, 0) / ltvValues.length) / (spend / newCustomers)) : null,
    newCustomersLast12Months: newCustomers,
    channelMix: { paidWon, organicWon: won.length - paidWon, paidSharePct: won.length ? Math.round((paidWon / won.length) * 100) : null },
    leadsLast12Months: (Array.isArray(leads) ? leads : []).filter((l) => (Date.parse(l?.receivedAt || '') || 0) >= year).length,
    focus: BUSINESS_MODELS[BUSINESS_MODELS[model] ? model : 'b2c'].focus,
    note: 'Measured from your own records. CAC uses the monthly spend you enter. Ratios need enough customers to mean anything.',
  };
}
