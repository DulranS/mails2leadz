// lib/journey-presets.js - starting journeys for onboarding, renewal and win-back. Pure: templates you edit before use; nothing is sent.
export const JOURNEY_PRESETS = {
  onboarding: { name: 'Onboarding', text: '0 | email | Welcome. Here is what happens next and who to contact.\n3 | email | Have you had a chance to get started? Reply if you need a hand.\n7 | email | A quick check-in: is anything unclear?' },
  renewal: { name: 'Renewal', text: '0 | email | Your plan renews in about a month. Here is what you have achieved so far.\n23 | email | Renewal is coming up in a week. Reply if you would like to change anything.\n7 | email | Last reminder before your renewal date.' },
  winback: { name: 'Win-back', text: '0 | email | We have missed you. Here is what is new.\n14 | email | A short note in case the timing was wrong.' },
};
