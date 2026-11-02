// lib/pipeline-alerts.js - pipeline automation that never contacts anyone (pure: deals and tasks in, plans out).
//  - Stalled deals: an open deal that has sat in its stage too long gets ONE follow-up task for the owner, per stage entry.
//  - Old lost deals: a deal lost for a reason that can be revisited, 90+ days ago, gets ONE task suggesting a look.
//  - Booking reminders: a confirmed booking starting within the next two days gets one reminder to the customer.
// The owner decides every action. Tasks are internal; only the booking reminder is an email, and it is the same
// transactional kind of message as the booking confirmation the customer asked for.
import { OPEN_STAGES, WON_STAGES, normalizeStage, REVIVABLE_REASONS, STAGE_LABELS, lostReasonLabel, LOST_REASONS } from './deal-utils.js';

const DAY = 86400000;
export const STALL_DAYS = { new: 7, contacted: 7, qualified: 10, demo: 10, proposal: 7, negotiation: 14 };
export const STALL_DEFAULT_DAYS = 14;
export const LOST_REVIVAL_AFTER_DAYS = 90;
export const REMINDER_WINDOW_HOURS = 48;

export const toMs = (v) => {
  if (!v) return null;
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime();
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/** One follow-up task per open deal per stage entry, however many daily runs see it. */
export function planStallAlerts({ deals = [], tasks = [], now = Date.now(), max = 50, stallDays = STALL_DAYS } = {}) {
  const out = [];
  const seen = new Set(tasks.filter((t) => t && t.kind === 'stall_alert').map((t) => t.stageKey));
  for (const deal of Array.isArray(deals) ? deals : []) {
    if (out.length >= max) break;
    if (!deal || !deal.email) continue;
    const stage = normalizeStage(deal.stage);
    if (!OPEN_STAGES.includes(stage)) continue;
    const since = toMs(deal.stageTimes?.[stage]) ?? toMs(deal.lastUpdate) ?? toMs(deal.createdAt);
    if (!since) continue;
    const days = Math.floor((now - since) / DAY);
    if (days < (stallDays[stage] ?? STALL_DEFAULT_DAYS)) continue;
    const email = String(deal.email).trim().toLowerCase();
    const stageKey = `${email}:${stage}:${since}`;
    if (seen.has(stageKey)) continue;
    seen.add(stageKey);
    out.push({
      email,
      task: {
        leadEmail: email, kind: 'stall_alert', stageKey, stage,
        scheduledFor: new Date(now).toISOString(),
        reason: `In ${STAGE_LABELS[stage] || stage} for ${days} days with no stage change. Follow up, move the stage, or mark it lost.`,
        status: 'pending', completedAt: null,
      },
    });
  }
  return out;
}

/** One suggestion per lost deal, 90+ days after it was lost, for reasons that can be revisited. Nothing is sent. */
export function planLostRevivals({ deals = [], tasks = [], now = Date.now(), max = 50, afterDays = LOST_REVIVAL_AFTER_DAYS } = {}) {
  const out = [];
  const done = new Set(tasks.filter((t) => t && t.kind === 'lost_revival').map((t) => t.leadEmail));
  for (const deal of Array.isArray(deals) ? deals : []) {
    if (out.length >= max) break;
    if (!deal || !deal.email || normalizeStage(deal.stage) !== 'closed_lost') continue;
    if (!REVIVABLE_REASONS.includes(deal.lostReason)) continue; // a reason the owner must respect is never suggested again
    const since = toMs(deal.lostAt) ?? toMs(deal.stageTimes?.closed_lost) ?? toMs(deal.closedAt) ?? toMs(deal.lastUpdate);
    if (!since) continue;
    const days = Math.floor((now - since) / DAY);
    if (days < afterDays) continue;
    const email = String(deal.email).trim().toLowerCase();
    if (done.has(email)) continue;
    done.add(email);
    out.push({
      email,
      task: {
        leadEmail: email, kind: 'lost_revival', stage: 'closed_lost',
        scheduledFor: new Date(now).toISOString(),
        reason: `Lost ${days} days ago (${lostReasonLabel(deal.lostReason)}). Worth a look if it still fits. Draft a message from the CRM only if you want one; nothing is sent by this task.`,
        status: 'pending', completedAt: null,
      },
    });
  }
  return out;
}

/** One alert per subscription renewal, in the window before it renews. Nothing is sent to the customer. */
export function planRenewalAlerts({ deals = [], tasks = [], now = Date.now(), withinDays = 14, max = 50 } = {}) {
  const out = [];
  const seen = new Set(tasks.filter((t) => t && t.kind === 'renewal_due').map((t) => t.stageKey));
  for (const deal of Array.isArray(deals) ? deals : []) {
    if (out.length >= max) break;
    if (!deal || !deal.email || !WON_STAGES.includes(normalizeStage(deal.stage))) continue;
    if (!(Number(deal.recurringMonthly) > 0) || deal.churnedAt) continue;
    const at = toMs(deal.renewalAt);
    if (!at) continue;
    const days = Math.ceil((at - now) / DAY);
    if (days < 0 || days > withinDays) continue;
    const email = String(deal.email).trim().toLowerCase();
    const stageKey = `${email}:renewal:${at}`;
    if (seen.has(stageKey)) continue;
    seen.add(stageKey);
    out.push({
      email,
      task: {
        leadEmail: email, kind: 'renewal_due', stageKey, stage: normalizeStage(deal.stage),
        scheduledFor: new Date(now).toISOString(),
        reason: `Renews in ${days} day${days === 1 ? '' : 's'} (${new Date(at).toISOString().slice(0, 10)}). A check-in before it renews is worth considering; nothing is sent by this alert.`,
        status: 'pending', completedAt: null,
      },
    });
  }
  return out;
}

/** Confirmed bookings starting within the next REMINDER_WINDOW_HOURS that have not been reminded yet. */
export function dueBookingReminders(bookings = [], now = Date.now(), windowHours = REMINDER_WINDOW_HOURS) {
  const horizon = now + windowHours * 3600000;
  return (Array.isArray(bookings) ? bookings : []).filter((b) => {
    if (!b || b.status !== 'confirmed' || !b.email || b.reminderSentAt) return false;
    const start = toMs(b.startIso);
    return start !== null && start > now && start <= horizon;
  });
}

/** The reminder text. Plain, with the customer's own manage link when one can be made. */
export function reminderText({ name = '', serviceName = 'booking', startLabel = '', manageLink = '', businessName = '' }) {
  const lines = [
    `Hello${name ? ` ${name}` : ''},`, '',
    `A reminder: your ${serviceName} is on ${startLabel}.`,
    manageLink ? `To move or cancel it, use this link (at least 24 hours before): ${manageLink}` : '',
    '', businessName || '',
  ];
  return { subject: `Reminder: ${serviceName} on ${startLabel}`, text: lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').replace(/\n+$/, '') };
}

/**
 * The owner's daily digest of NEW alerts (sent to the owner only, never to a customer). Null when there is nothing new.
 * Stored alerts live in their own collection, never in the follow-up queue, which drafts and sends customer email.
 */
export function alertsDigest({ stalled = [], revivals = [], renewals = [], monthly = null, senderName = '' } = {}) {
  const s = Array.isArray(stalled) ? stalled : [];
  const r = Array.isArray(revivals) ? revivals : [];
  const w = Array.isArray(renewals) ? renewals : [];
  if (!s.length && !r.length && !w.length && !monthly) return null;
  const out = ['Pipeline check, from your own records. Nothing has been sent to anyone.', ''];
  if (monthly && monthly.won + monthly.lost > 0) {
    const rate = monthly.winRate === null ? 'no win rate yet' : `win rate ${monthly.winRate}%`;
    out.push(`Last month (${monthly.year}-${String(monthly.month).padStart(2, '0')}): ${monthly.won} won (${monthly.wonValue.toFixed(2)}), ${monthly.lost} lost, ${rate}.`);
    if (monthly.topLost.length) out.push(`Most common reasons lost: ${monthly.topLost.map((x) => `${x.reason} (${x.count})`).join(', ')}.`);
    out.push('');
  }
  if (w.length) {
    out.push(`Renewing soon (${w.length}):`);
    for (const a of w) out.push(`- ${a.email}: ${a.task.reason}`);
    out.push('');
  }
  if (s.length) {
    out.push(`Waiting in one stage too long (${s.length}):`);
    for (const a of s) out.push(`- ${a.email}: ${a.task.reason}`);
    out.push('');
  }
  if (r.length) {
    out.push(`Lost a while ago, worth a look (${r.length}):`);
    for (const a of r) out.push(`- ${a.email}: ${a.task.reason}`);
    out.push('');
  }
  out.push(senderName || '');
  const open = s.length + r.length + w.length;
  return { subject: open ? `Pipeline check: ${open} to look at` : 'Pipeline check: last month', text: out.join('\n').replace(/\n+$/, '') };
}

/**
 * The owner's own stall thresholds, typed as "proposal 7, negotiation 14" (or an object). Only open stages, whole days 1-180.
 * Anything else is dropped, and a missing stage keeps its default. Returns only the stages the owner set.
 */
export function sanitizeStallDays(input) {
  const out = {};
  const pairs = input && typeof input === 'object' && !Array.isArray(input)
    ? Object.entries(input)
    : String(input || '').split(/[,;\n]+/).map((x) => x.trim().split(/\s+/)).filter((x) => x.length === 2);
  for (const [stage, days] of pairs) {
    const k = String(stage || '').trim().toLowerCase();
    const v = Number(days);
    if (!OPEN_STAGES.includes(k) || !Number.isInteger(v) || v < 1 || v > 180) continue;
    out[k] = v;
  }
  return out;
}

/** The thresholds in use: the defaults, with the owner's own values on top. */
export function stallThresholds(saved) {
  return { ...STALL_DAYS, ...sanitizeStallDays(saved) };
}

/** Won and lost counts for the previous calendar month (UTC), from the close dates the deals already record. */
export function lastMonthWinLoss(deals = [], now = Date.now()) {
  const d = new Date(now);
  const y = d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
  const m = d.getUTCMonth() === 0 ? 11 : d.getUTCMonth() - 1;
  const inMonth = (ms) => ms !== null && new Date(ms).getUTCFullYear() === y && new Date(ms).getUTCMonth() === m;
  let won = 0;
  let wonValue = 0;
  let lost = 0;
  const reasons = {};
  for (const deal of Array.isArray(deals) ? deals : []) {
    if (!deal) continue;
    const stage = normalizeStage(deal.stage);
    if (stage === 'closed_won' && inMonth(toMs(deal.stageTimes?.closed_won) ?? toMs(deal.closedAt))) {
      won++;
      wonValue += Number(deal.value) || 0;
    } else if (stage === 'closed_lost' && inMonth(toMs(deal.lostAt) ?? toMs(deal.stageTimes?.closed_lost) ?? toMs(deal.closedAt))) {
      lost++;
      const r = deal.lostReason || 'none';
      reasons[r] = (reasons[r] || 0) + 1;
    }
  }
  const topLost = Object.entries(reasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, count]) => ({ reason: id === 'none' ? 'Not recorded' : lostReasonLabel(id), count }));
  const rate = won + lost ? Math.round((won / (won + lost)) * 100) : null;
  return { year: y, month: m + 1, won, wonValue: Math.round(wonValue * 100) / 100, lost, winRate: rate, topLost };
}
