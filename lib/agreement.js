// lib/agreement.js - a contract or NDA draft with the parties, dates and prices filled from the deal; the legal terms are placeholders for a lawyer. Pure.
const KINDS = { nda: 'Mutual Non-Disclosure Agreement', service: 'Service Agreement' };

export function agreementDraft({ kind = 'service', seller = '', buyer = '', date = '', value = null, currency = 'USD', scope = '' } = {}) {
  const title = KINDS[kind];
  if (!title) return { ok: false, error: 'Choose an agreement: a service agreement or an NDA.' };
  const who = { seller: String(seller || '[YOUR BUSINESS]').slice(0, 160), buyer: String(buyer || '[CUSTOMER]').slice(0, 160) };
  const when = String(date || '[DATE]').slice(0, 20);
  const lines = [`# ${title}`, '', `This agreement is made on ${when} between ${who.seller} ("the Provider") and ${who.buyer} ("the Client").`, ''];
  if (kind === 'nda') {
    lines.push('1. Each party may share confidential information with the other only to evaluate a possible business relationship.');
    lines.push('2. Confidential information must be protected with at least reasonable care and not disclosed to anyone else.');
    lines.push('3. [TERM OF CONFIDENTIALITY, EXCLUSIONS AND REMEDIES - TO BE SET BY A LAWYER]');
  } else {
    lines.push(`1. Scope of work: ${scope ? String(scope).slice(0, 600) : '[DESCRIBE THE WORK]'}.`);
    lines.push(`2. Fees: ${value !== null && Number(value) > 0 ? `${Number(value).toFixed(2)} ${String(currency).toUpperCase().slice(0, 3)}` : '[FEE AND PAYMENT TERMS]'}.`);
    lines.push('3. [DELIVERY, ACCEPTANCE, LIABILITY, CANCELLATION AND DISPUTE TERMS - TO BE SET BY A LAWYER]');
  }
  lines.push('');
  lines.push('Signed by the parties: ______________________   ______________________');
  lines.push('');
  lines.push('This is a draft to be reviewed by a qualified lawyer before anyone signs. It is not legal advice.');
  return { ok: true, text: lines.join('\n') };
}
