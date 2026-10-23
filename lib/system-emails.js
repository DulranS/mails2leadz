// lib/system-emails.js - the emails the PLATFORM sends to its own users (not the outreach the owner sends to leads).
// Short, plain, one action each. Pure: they return { subject, text }. No tracking, nothing to unsubscribe from: these are
// service messages (an invite someone asked for, and the state of a plan or payment).

const brand = (b) => String(b || 'AutoLeads').trim().slice(0, 60) || 'AutoLeads';
const open = (url, label = 'Open it here') => (url ? `\n\n${label}: ${url}` : '');
const sign = (b) => `\n\n${brand(b)}`;

export function teamInviteEmail({ ownerName = '', role = 'manager', link = '', expiresAt = '', brandName = '' } = {}) {
  const who = String(ownerName || '').trim() || 'Someone';
  const what = role === 'viewer' ? 'view' : 'work in';
  const until = expiresAt ? ` The link works until ${String(expiresAt).slice(0, 10)}.` : '';
  return {
    subject: `${who} invited you to ${what} their ${brand(brandName)} workspace`,
    text: `${who} invited you to ${what} their workspace as a ${role === 'viewer' ? 'viewer (you can see everything and change nothing)' : 'manager (you can do the daily work)'}.\n\nSign in with your own account and open the link to join.${until}${open(link, 'Join the workspace')}\n\nIf you were not expecting this, ignore this message and nothing happens.${sign(brandName)}`,
  };
}

export function trialEndingEmail({ daysLeft = 3, url = '', brandName = '' } = {}) {
  const d = Math.max(0, Math.round(Number(daysLeft) || 0));
  return {
    subject: d <= 1 ? `Your ${brand(brandName)} trial ends tomorrow` : `Your ${brand(brandName)} trial ends in ${d} days`,
    text: `Your free trial ends in ${d} day${d === 1 ? '' : 's'}. Pick a plan before then to keep sending, and nothing is lost either way: your leads, customers and numbers stay.${open(url, 'Choose a plan')}${sign(brandName)}`,
  };
}

export function trialEndedEmail({ url = '', brandName = '' } = {}) {
  return {
    subject: `Your ${brand(brandName)} trial has ended`,
    text: `Your free trial has ended, so sending and AI are paused. Your leads, customers and numbers are all still there and you can still look at them. Choose a plan to switch everything back on.${open(url, 'Choose a plan')}${sign(brandName)}`,
  };
}

export function paymentFailedEmail({ url = '', brandName = '' } = {}) {
  return {
    subject: `Your ${brand(brandName)} payment did not go through`,
    text: `The latest payment for your plan did not go through. Update your card and it will be tried again; until then everything keeps working for a few days.${open(url, 'Update payment details')}${sign(brandName)}`,
  };
}

export const EMAIL_KINDS = { invite: teamInviteEmail, trial_ending: trialEndingEmail, trial_ended: trialEndedEmail, payment_failed: paymentFailedEmail };
