// lib/automation-mode.js - one owner action that turns the automation on. Pure: the settings to write, given one explicit confirmation.
// The owner confirms once, in words, that the contacts on their lists may be emailed and their sign-ups shared with ad platforms,
// and that paid enrichment credits may be used. Opt-outs, the suppression list, daily caps and the claim hold still apply.
export const ALL_ANGLES = '*';
export const AUTOMATION_CONFIRMATION = 'I confirm I may contact the people on my lists and share their sign-ups with ad platforms, and I accept paid enrichment credits being used.';

export function automationPatch({ confirmed = false, now = Date.now() } = {}) {
  if (confirmed !== true) return { error: 'Tick the confirmation to turn automation on.' };
  const at = new Date(now).toISOString();
  return {
    business: {
      dataSharingConfirmed: true,
      switches: { enrichDeals: true, tiktokSync: true, googleSync: true, holdClaimRisk: true },
    },
    autopilot: {
      autoSend: true,
      autoSendApprovedAt: at,
      autoSendApprovedAngles: [ALL_ANGLES],
    },
  };
}
