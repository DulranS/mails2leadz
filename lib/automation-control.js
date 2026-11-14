// lib/automation-control.js - one view of what runs on its own, what is paused, and what needs keys or the owner. Pure.
import { SWITCHES, SENDS_TO_PEOPLE, switchState } from './switches.js';

export const ALWAYS_ON = [
  'Lead capture from forms, ads, WhatsApp, SMS and Balancr',
  'Lead enrichment, scoring and routing to the least busy person',
  'Follow-ups scheduled, and stopped as soon as someone replies',
  'Forecast, deal health, deals at risk and the weekly list',
  'Support questions routed, with two-hour target alerts',
  'Ad spend synced daily, with monthly ROI figures',
  'Invoice drafts for won deals; deals marked won when paid',
];

export const NEEDS_YOU = [
  'Approving broadcasts (every batch is approved by you, by design)',
  'Sending invoices and agreements to customers',
  'Publishing social posts (you type POST)',
];

/** What runs now, what is paused, what waits for keys, and what is still off. */
export function automationSummary(settings = {}, env = {}) {
  const running = [], pausedList = [], needsKeys = [], off = [];
  for (const id of Object.keys(SWITCHES)) {
    const st = switchState(id, settings, env);
    const row = { id, label: SWITCHES[id].label };
    if (st.status === 'on') running.push(row);
    else if (st.status === 'paused') pausedList.push(row);
    else if (st.status === 'needs_keys') needsKeys.push({ ...row, missing: st.missing });
    else off.push(row);
  }
  return { paused: settings?.automationPaused === true, running, pausedSwitches: pausedList, needsKeys, off, alwaysOn: ALWAYS_ON, needsYou: NEEDS_YOU, sendsToPeople: [...SENDS_TO_PEOPLE] };
}
