// lib/routine-owner.js - who sends routine service messages (booking confirmations and reminders, review requests) when Balancr is also connected. Pure.
// Balancr sends these from its own records; AutoLeads keeps its sales follow-ups and never doubles a customer's messages.
export function routineOwner({ balancrConnected = false, setting = '' } = {}) {
  if (setting === 'autoleads' || setting === 'balancr') return setting;
  return balancrConnected ? 'balancr' : 'autoleads';
}
