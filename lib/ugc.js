// lib/ugc.js - a brief for creators or customers who make short videos for you. Pure: built only from the owner's own offer and audience.
export function ugcBrief({ businessName = '', offer = '', idealCustomer = '' } = {}) {
  const name = businessName || '[YOUR BUSINESS]';
  return [
    `# Short video brief: ${name}`,
    '',
    `What we sell: ${offer || '[ONE SENTENCE ON THE OFFER]'}`,
    `Who it is for: ${idealCustomer || '[THE CUSTOMER, IN ONE SENTENCE]'}`,
    '',
    'Length: 20 to 40 seconds, vertical (9:16).',
    'Open with the problem in the first three seconds, in the customer\'s own words.',
    'Show the product or service being used, not just described.',
    'End with one clear next step, such as "message us to book" or "link in bio".',
    'Say honestly what it is. No claims we cannot back up, and no invented results.',
    '',
    'Please do not use music you do not have a licence for.',
    'Get written permission before using anyone else\'s image.',
  ].join('\n');
}
