import { groupNumber } from './format.js';
// lib/pitch.js - a pitch outline built only from the owner's own details and numbers. Pure: nothing is invented; missing parts are marked for the owner to fill.
export function pitchOutline({ businessName = '', offer = '', idealCustomer = '', measures = {}, pricePoint = null, averageContractValue = null } = {}) {
  const name = String(businessName || '[YOUR BUSINESS]');
  const lines = [];
  lines.push(`# ${name}`);
  lines.push('');
  lines.push('## The problem');
  lines.push(`[WHO HAS THE PROBLEM]${idealCustomer ? ` - for example: ${idealCustomer}` : ''}. Describe the problem in their words.`);
  lines.push('');
  lines.push('## What we do');
  lines.push(offer ? offer : '[ONE SENTENCE ON WHAT YOU SELL]');
  lines.push('');
  lines.push('## Traction');
  if (measures.won !== undefined) lines.push(`- Customers won in the last twelve months: ${measures.won}`);
  if (measures.winRatePct !== undefined && measures.winRatePct !== null) lines.push(`- Win rate: ${measures.winRatePct}%`);
  if (measures.wonValue !== undefined) lines.push(`- Value won in the last twelve months: ${groupNumber(measures.wonValue)}`);
  if (lines[lines.length - 1] === '') lines.push('[ADD YOUR FIGURES]');
  lines.push('');
  lines.push('## Pricing');
  lines.push(pricePoint !== null ? `- Typical price: ${groupNumber(pricePoint)}` : '- [YOUR PRICES]');
  if (averageContractValue !== null) lines.push(`- Average contract value: ${groupNumber(averageContractValue)}`);
  lines.push('');
  lines.push('## The team');
  lines.push('[WHO IS DOING THE WORK, AND WHY THEY ARE THE RIGHT PEOPLE]');
  lines.push('');
  lines.push('## The ask');
  lines.push('[WHAT YOU NEED, AND WHAT IT WILL DO]');
  lines.push('');
  lines.push('Every figure above came from your own records. Anything in [square brackets] is yours to write.');
  return lines.join('\n');
}
