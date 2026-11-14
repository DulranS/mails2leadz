// lib/funnel.js - the acquisition funnel in numbers: what each lead, deal and customer costs and how many move on. Pure. A missing number is shown as null, never guessed.
const per = (a, b) => (b > 0 && a !== null && a !== undefined ? Math.round((a / b) * 1000) / 1000 : null);

/** Rates from counts. spend is the total for the period; leads, qualified, won, newCustomers and churn counts come from the records. */
export function funnelRates({ spend = null, leads = 0, qualified = 0, won = 0, newCustomers = 0, customersAtStart = 0, customersLost = 0, ltv = null } = {}) {
  const cpl = per(spend, leads);
  const cac = per(spend, newCustomers);
  return {
    costPerLead: cpl,
    leadToQualified: per(qualified, leads),
    qualifiedToWon: per(won, qualified),
    leadToWon: per(won, leads),
    costPerNewCustomer: cac,
    ltvToCac: ltv !== null && cac ? Math.round((ltv / cac) * 100) / 100 : null,
    churnRate: per(customersLost, customersAtStart),
  };
}
