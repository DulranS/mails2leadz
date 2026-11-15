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

// Balancr's contact is free text: "phone · email", or either one alone. Split it into its parts.
const CONTACT_EMAIL = /[^\s@,;<>()·]+@[^\s@,;<>()·]+\.[^\s@,;<>()·]{2,}/;
const CONTACT_PHONE = /\+?\d[\d\s().-]{6,}\d/;
export function splitContact(contact) {
  const text = String(contact || '');
  const em = text.match(CONTACT_EMAIL);
  const email = em ? em[0].toLowerCase() : '';
  const rest = em ? text.replace(em[0], ' ') : text;
  const ph = rest.match(CONTACT_PHONE);
  const phone = ph && digits(ph[0]).length >= 8 && digits(ph[0]).length <= 15 ? ph[0].replace(/\s+/g, ' ').trim() : '';
  return { email, phone };
}

/** The AutoLeads deal a Balancr contact belongs to: by e-mail, or by the last nine digits of a phone number. */
export function matchDealByContact(contact, deals = []) {
  const { email, phone } = splitContact(contact);
  if (!email && !phone) return null;
  const list = Array.isArray(deals) ? deals : [];
  const byEmail = email ? list.find((d) => d?.email && String(d.email).toLowerCase() === email) : null;
  if (byEmail) return byEmail;
  const want = digits(phone).slice(-9);
  return want.length === 9 ? (list.find((d) => d?.phone && digits(d.phone).slice(-9) === want) || null) : null;
}

/** The AutoLeads deal a Balancr lead belongs to. Balancr's own ids come first: the lead id we stored when we sent the deal,
 *  then the external id that carries our deal id. The contact is only the fallback. */
export function matchDealForLead(lead = {}, deals = []) {
  const list = Array.isArray(deals) ? deals : [];
  const id = String(lead?.id || '');
  if (id) {
    const byLead = list.find((d) => d?.balancrLeadId && String(d.balancrLeadId) === id);
    if (byLead) return byLead;
  }
  const ext = String(lead?.externalId || '');
  if (ext.startsWith('autoleads:')) {
    const dealId = ext.slice('autoleads:'.length);
    const byExt = list.find((d) => d?.id && String(d.id) === dealId);
    if (byExt) return byExt;
  }
  return matchDealByContact(lead?.contact, list);
}

/** Balancr invoice status to AutoLeads: only a fully paid invoice is marked paid. */
export function invoicePaidState(balancrStatus) {
  return balancrStatus === 'paid' ? 'paid' : balancrStatus === 'overdue' ? 'overdue' : 'open';
}
