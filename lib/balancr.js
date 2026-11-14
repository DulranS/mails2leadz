// lib/balancr.js - rules for syncing with Balancr: stage names, how a deal becomes a lead, how a lead is matched back, and invoice status. Pure.
// Balancr lead stages: new, contacted, qualified, follow_up, proposal_sent, won, lost.
export const BALANCR_STAGES = ['new', 'contacted', 'qualified', 'follow_up', 'proposal_sent', 'won', 'lost'];

const TO_BALANCR = { new: 'new', contacted: 'contacted', qualified: 'qualified', demo: 'qualified', proposal: 'proposal_sent', negotiation: 'proposal_sent', closed_won: 'won', closed_lost: 'lost' };
const FROM_BALANCR = { new: 'new', contacted: 'contacted', follow_up: 'contacted', qualified: 'qualified', proposal_sent: 'proposal', won: 'closed_won', lost: 'closed_lost' };

export const toBalancrStage = (stage) => TO_BALANCR[stage] || 'new';
export const fromBalancrStage = (stage) => FROM_BALANCR[stage] || null;

/** The body that creates a Balancr lead for a deal. The external id stops a repeat from making a second lead. Consent is only ever what the owner recorded. */
export function leadBodyFor(deal) {
  const name = String(deal?.businessName || deal?.name || '').trim().slice(0, 120);
  const email = String(deal?.email || '').trim().toLowerCase();
  const phone = String(deal?.phone || '').trim();
  if (name.length < 2 || (!email && !phone)) return null;
  return {
    name,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    message: 'From AutoLeads',
    source: 'AutoLeads',
    externalId: `autoleads:${deal.id}`,
    consentToContact: deal.marketingConsent === true,
  };
}

const digits = (s) => String(s || '').replace(/\D/g, '');

/** The AutoLeads deal a Balancr lead belongs to: matched by e-mail, or by the last nine digits of a phone number. */
export function matchDealByContact(contact, deals = []) {
  const c = String(contact || '').trim();
  if (!c) return null;
  const email = c.toLowerCase();
  const phone = digits(c);
  return (Array.isArray(deals) ? deals : []).find((d) => {
    if (d?.email && String(d.email).toLowerCase() === email && email.includes('@')) return true;
    return phone.length >= 9 && d?.phone && digits(d.phone).slice(-9) === phone.slice(-9);
  }) || null;
}

/** Balancr invoice status to AutoLeads: only a fully paid invoice is marked paid. */
export function invoicePaidState(balancrStatus) {
  return balancrStatus === 'paid' ? 'paid' : balancrStatus === 'overdue' ? 'overdue' : 'open';
}
