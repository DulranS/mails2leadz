// lib/next-actions.js - turns the numbers into "what should I do today?".
// Deterministic (no AI, no cost), ordered by money at stake, max 5 items.

import { makeMoney } from './currency.js';
import { autopilotAlert, autoPostAlert } from './autosend.js';

/**
 * @param {object} a
 * @param {object} a.metrics                 result of computeBusinessMetrics
 * @param {Array}  a.unconvertedReplies      [{email, business}] replied but not yet a qualified deal
 * @param {number} a.dueFollowUps            pending follow-up tasks that are due now
 * @param {number} a.monthlyGoal             0 = none set
 * @param {boolean} a.hasProfile             business profile filled in
 * @param {number} a.sentRecently            emails sent in the last 90 days
 * @param {object} a.billing                 result of computeBilling (optional)
 * @param {object} a.unbilled                result of computeUnbilled (optional)
 * @param {object} a.customers               result of computeCustomers (optional)
 * @param {object} a.subsDue                 result of computeSubscriptionsDue (optional)
 * @param {object} a.recurring               result of computeRecurring (optional): renewals due / lapsed
 * @param {number} a.qualGaps                qualified-or-later deals with no qualification answers yet
 * @param {object} a.inbox                   { hotWithEmail } leads waiting in the Lead Inbox (optional)
 * @param {object} a.autopilot               { settings, lastAutoSend } from users/{uid}/settings/autopilot (optional): a stopped Autosend is surfaced
 * @param {number} a.limit                   how many items to return (default 5; the morning email filters a longer list itself)
 * @param {object} a.content                 result of contentActionInfo (optional): { dueToday, overdue, scheduledNext7, total }
 */
export function buildNextActions({ finder = null, experiments = null, runway = null, capacity = null, metrics, unconvertedReplies = [], dueFollowUps = 0, monthlyGoal = 0, hasProfile = true, sentRecently = 0, billing = null, unbilled = null, customers = null, qualGaps = 0, inbox = null, content = null, subsDue = null, recurring = null, autopilot = null, limit = 5 }) {
  const out = [];
  const m = metrics;
  const money = makeMoney(m.settings.currency);
  const avg = m.settings.avgDealValue;
  const qualifiedChance = m.settings.probabilities.qualified ?? 0.25;

  // The automatic spine must never stop silently.
  const stopped = autopilot ? autopilotAlert(autopilot.settings, autopilot.lastAutoSend) : null;
  if (stopped) out.push(stopped);
  const postFail = autopilot ? autoPostAlert(autopilot.settings) : null;
  if (postFail) out.push(postFail);

  // Someone contacted YOU: the warmest lead there is, and the chance fades by the hour. Always first.
  const waiting = m.present?.inboundWaiting || [];
  if (waiting.length > 0) {
    const oldest = waiting[0].ageHours;
    const names = waiting.slice(0, 3).map((w) => w.business || w.email).join(', ');
    out.push({
      id: 'inbound', priority: 0, tone: 'hot',
      title: `${waiting.length} new enquir${waiting.length === 1 ? 'y is' : 'ies are'} waiting for your reply${oldest >= 1 ? ` (oldest ${oldest}h)` : ''}`,
      detail: `${names}${waiting.length > 3 ? ' and more' : ''}. A reply is probably already drafted: review it and press Send. Enquiries answered within the hour convert far better than those answered tomorrow.`,
      href: '/dashboard', cta: 'Reply now',
    });
  }

  if (unconvertedReplies.length > 0) {
    const names = unconvertedReplies.slice(0, 3).map((r) => r.business || r.email).join(', ');
    out.push({
      id: 'replies', priority: 1, tone: 'hot',
      title: `${unconvertedReplies.length} ${unconvertedReplies.length === 1 ? 'person has' : 'people have'} replied and no deal exists yet`,
      detail: `${names}${unconvertedReplies.length > 3 ? ' and more' : ''}. Open the Replies panel and tap 💼 Deal. Worth about ${money(unconvertedReplies.length * avg * qualifiedChance)} in expected revenue.`,
      href: '/dashboard', cta: 'Open replies',
    });
  }

  // Money already earned comes first: chasing an overdue invoice is the cheapest revenue there is.
  if (billing && billing.overdue.count > 0) {
    out.push({
      id: 'overdue', priority: 1, tone: 'hot',
      title: `${billing.overdue.count} invoice${billing.overdue.count === 1 ? ' is' : 's are'} overdue: ${money(billing.overdue.amount)}`,
      detail: `The oldest is ${billing.overdue.oldestDays} day${billing.overdue.oldestDays === 1 ? '' : 's'} late. A short, polite reminder usually gets paid; the AI can draft it for you.`,
      href: '/billing', cta: 'Collect now',
    });
  }

  if (unbilled && unbilled.count > 0) {
    out.push({
      id: 'unbilled', priority: 2, tone: 'warn',
      title: `${unbilled.count} won deal${unbilled.count === 1 ? ' has' : 's have'} no invoice yet`,
      detail: `${money(unbilled.amount)} was won but never billed${unbilled.estimatedCount > 0 ? ' (some amounts use your default deal value)' : ''}. Invoice it so it turns into cash.`,
      href: '/billing', cta: 'Open billing',
    });
  }

  // Subscriptions: the next monthly invoice, and the renewal moments when customers are most likely to leave.
  if (subsDue && subsDue.count > 0) {
    out.push({
      id: 'subsdue', priority: 2, tone: 'warn',
      title: `${subsDue.count} subscriber${subsDue.count === 1 ? ' is' : 's are'} due their next invoice: ${money(subsDue.amount)}`,
      detail: 'Their last invoice is about a month old or older. Raise this month\'s invoice so the recurring revenue turns into cash.',
      href: '/billing', cta: 'Invoice now',
    });
  }
  if (recurring?.any && recurring.renewals.lapsed.count > 0) {
    out.push({
      id: 'renewals_lapsed', priority: 2, tone: 'warn',
      title: `${recurring.renewals.lapsed.count} renewal date${recurring.renewals.lapsed.count === 1 ? ' has' : 's have'} passed (${money(recurring.renewals.lapsed.mrr)}/month)`,
      detail: 'There is no record of these customers leaving. Confirm they renewed (set the next date) or mark them as churned, so recurring revenue and churn stay true.',
      href: '/customers', cta: 'Check renewals',
    });
  }
  if (recurring?.any && recurring.renewals.dueSoon.count > 0) {
    out.push({
      id: 'renewals_soon', priority: 3, tone: 'info',
      title: `${recurring.renewals.dueSoon.count} subscriber${recurring.renewals.dueSoon.count === 1 ? ' renews' : 's renew'} in the next 30 days (${money(recurring.renewals.dueSoon.mrr)}/month)`,
      detail: 'A short check-in before the renewal date is the cheapest way to keep them. Draft one from the Customers page.',
      href: '/customers', cta: 'Open customers',
    });
  }

  // Happy customers are the cheapest, warmest leads there are: referrals close far more often than cold email.
  if (customers && customers.referralReady > 0) {
    out.push({
      id: 'referrals', priority: 3, tone: 'info',
      title: `${customers.referralReady} happy customer${customers.referralReady === 1 ? ' is' : 's are'} ready to be asked for a referral`,
      detail: 'They are activated, healthy and have been with you 30+ days. The AI drafts a short, personal ask with their own enquiry link, so any introduction is credited to them.',
      href: '/customers', cta: 'Ask for referrals',
    });
  }

  if (customers && customers.atRisk.count > 0) {
    out.push({
      id: 'atrisk', priority: 2, tone: 'warn',
      title: `${customers.atRisk.count} customer${customers.atRisk.count === 1 ? ' is' : 's are'} at risk (${money(customers.atRisk.value)})`,
      detail: 'They have gone quiet or have a support issue waiting. A personal check-in now is far cheaper than winning a new customer.',
      href: '/customers', cta: 'Open customers',
    });
  } else if (customers && customers.stuckOnboarding > 0) {
    out.push({
      id: 'onboarding', priority: 3, tone: 'info',
      title: `${customers.stuckOnboarding} customer${customers.stuckOnboarding === 1 ? ' is' : 's are'} not activated yet`,
      detail: 'They bought over a week ago but have not had their first result. Customers who get value early stay and refer others.',
      href: '/customers', cta: 'Open customers',
    });
  }

  if (dueFollowUps > 0) {
    out.push({
      id: 'followups', priority: 2, tone: 'warn',
      title: `${dueFollowUps} follow-up${dueFollowUps === 1 ? ' is' : 's are'} due`,
      detail: 'Following up is usually what turns a reply into a deal. Review and send them from the follow-up queue.',
      href: '/dashboard', cta: 'Open follow-up queue',
    });
  }

  if (m.present.staleCount > 0) {
    out.push({
      id: 'stale', priority: 2, tone: 'warn',
      title: `${m.present.staleCount} deal${m.present.staleCount === 1 ? ' has' : 's have'} gone quiet for 2+ weeks`,
      detail: `${money(m.present.staleValue)} of pipeline is at risk. A short check-in now is cheaper than a new lead.`,
      href: '/crm', cta: 'Open CRM',
    });
  }

  // The nightly search found everything there was to find in an area: say so, or the pipeline quietly goes empty.
  if (finder && finder.enabled && Array.isArray(finder.dry) && finder.dry.length > 0) {
    const all = finder.dry.length >= (finder.total || 0);
    out.push({
      id: 'finder_dry', priority: all ? 1 : 2, tone: all ? 'warn' : 'info',
      title: all ? 'Your nightly searches have stopped finding new leads' : `${finder.dry.length === 1 ? 'A nightly search has' : `${finder.dry.length} nightly searches have`} stopped finding new leads`,
      detail: `${finder.dry.slice(0, 3).join('; ')}. Every business in that area has been seen already. Widen the area or try a related type of business (Lead Inbox has ideas for who to look for next).`,
      href: '/inbox', cta: 'Widen the search',
    });
  }
  // The money decides how many tests you get: say so before it is too late to do anything about it.
  if (runway && runway.set && (runway.state === 'short' || runway.state === 'watch')) {
    out.push({
      id: 'runway', priority: runway.state === 'short' ? 1 : 2, tone: runway.state === 'short' ? 'warn' : 'info',
      title: `Your cash lasts about ${runway.months} months at this rate`,
      detail: runway.message, href: '/business', cta: 'See runway',
    });
  }
  // A test with a judging date nobody acted on is just a habit. Decide it.
  if (experiments && Array.isArray(experiments.due) && experiments.due.length > 0) {
    const e = experiments.due[0];
    out.push({
      id: 'experiment_review', priority: 2, tone: 'info',
      title: e.daysLeft < 0 ? `Judge your test: ${e.title}` : `Judging day for your test: ${e.title}`,
      detail: `${experiments.due.length > 1 ? `${experiments.due.length} tests are due. ` : ''}Enter the real number and decide: double down, change one thing, or stop.`,
      href: '/bets', cta: 'Decide now',
    });
  }
  // Selling past what you can deliver loses the customers you already have: say so before the next campaign.
  if (capacity && capacity.set && (capacity.state === 'near' || capacity.state === 'full' || capacity.state === 'over')) {
    out.push({
      id: 'capacity', priority: capacity.state === 'near' ? 2 : 1, tone: capacity.state === 'near' ? 'info' : 'warn',
      title: capacity.state === 'near' ? `Delivery is ${capacity.pct}% full (${capacity.used} of ${capacity.max})` : `Delivery is full (${capacity.used} of ${capacity.max})`,
      detail: `${capacity.message}${capacity.wouldOverflow ? ` ${capacity.incoming} deal${capacity.incoming === 1 ? ' is' : 's are'} close to starting, more than the ${capacity.free} place${capacity.free === 1 ? '' : 's'} left.` : ''}`,
      href: '/customers', cta: 'See customers',
    });
  }

  if (monthlyGoal > 0) {
    const won = m.past.wonByMonth[m.past.wonByMonth.length - 1]?.revenue || 0;
    const gap = monthlyGoal - won;
    if (gap > 0) {
      const covers = m.future.horizons[0].expected;
      if (covers < gap) {
        out.push({
          id: 'goal', priority: 3, tone: 'info',
          title: `${money(gap)} to go on this month's ${money(monthlyGoal)} goal`,
          detail: `Your pipeline is expected to bring about ${money(covers)} in the next 30 days, so you need roughly ${money(gap - covers)} more: more qualified conversations, or faster closes on open deals.`,
          href: '/dashboard', cta: 'Find more leads',
        });
      }
    }
  }

  if (m.present.openCount === 0 && sentRecently > 0 && unconvertedReplies.length === 0) {
    out.push({
      id: 'empty', priority: 3, tone: 'info',
      title: 'No qualified deals in play',
      detail: 'Outreach only turns into revenue once replies become deals. Keep sending, and turn every positive reply into a deal.',
      href: '/dashboard', cta: 'Go to dashboard',
    });
  }

  // Open deals feed the forecast; won deals feed revenue/ROI. Both need real values.
  const estimated = m.deals.filter((d) => d.estimated && !['new', 'contacted', 'replied', 'closed_lost'].includes(d.stage)).length;
  if (estimated > 0) {
    out.push({
      id: 'values', priority: 4, tone: 'info',
      title: `Set a real value on ${estimated} deal${estimated === 1 ? '' : 's'}`,
      detail: 'They use your default value, so the forecast is a guess until you enter the real figure.',
      href: '#deals', cta: 'Set values',
    });
  }

  if (m.past.winBack && m.past.winBack.count > 0) {
    out.push({
      id: 'winback', priority: 4, tone: 'info',
      title: `${m.past.winBack.count} deal${m.past.winBack.count === 1 ? '' : 's'} lost on timing are worth another try`,
      detail: `${money(m.past.winBack.value)} was lost because of bad timing or silence over 3 months ago. Open each one in the CRM: \"Draft a check-in email\" writes a light, no-pressure message that you edit and send yourself.`,
      href: '/crm', cta: 'Open CRM',
    });
  }

  if (qualGaps > 0) {
    out.push({
      id: 'qualification', priority: 4, tone: 'info',
      title: `Qualify ${qualGaps} open deal${qualGaps === 1 ? '' : 's'}`,
      detail: 'Four quick answers (budget, decision maker, need, timeline) show which deals deserve your time and which will stall.',
      href: '/crm', cta: 'Open CRM',
    });
  }

  // Acquisition: good leads are already found and scored; they only turn into money once someone drafts, reviews and sends.
  // When nothing is in play at all this matters more than anything except money already owed.
  if (inbox && inbox.hotWithEmail > 0) {
    const idle = sentRecently === 0 || m.present.openCount === 0;
    out.push({
      id: 'inbox', priority: idle ? 2 : 3, tone: idle ? 'warn' : 'info',
      title: `${inbox.hotWithEmail} hot lead${inbox.hotWithEmail === 1 ? '' : 's'} with an email ${inbox.hotWithEmail === 1 ? 'is' : 'are'} waiting in your Lead Inbox`,
      detail: 'Already found, checked and scored. Load them into the sender, let the AI draft the first emails, read them and send.',
      href: '/inbox', cta: 'Open Lead Inbox',
    });
  }

  // Inbound: posts that are due, or a calendar that has run dry (only for people who already use the planner).
  if (content && content.overdue + content.dueToday > 0) {
    const n = content.overdue + content.dueToday;
    out.push({
      id: 'content', priority: 3, tone: 'info',
      title: `${n} post${n === 1 ? ' is' : 's are'} due to go out${content.overdue > 0 ? ` (${content.overdue} overdue)` : ' today'}`,
      detail: 'Consistent posting is what brings enquiries in without chasing. It is one tap per post: copy, paste, mark as posted.',
      href: '/content', cta: 'Open Content',
    });
  } else if (content && content.total > 0 && content.scheduledNext7 === 0) {
    out.push({
      id: 'content-empty', priority: 4, tone: 'info',
      title: 'Nothing is planned to post in the next 7 days',
      detail: 'Draft next week in one click and the calendar fills with posts and design briefs.',
      href: '/content', cta: 'Plan my week',
    });
  }

  if (!hasProfile) {
    out.push({
      id: 'profile', priority: 1, tone: 'hot',
      title: 'Tell the AI what you sell',
      detail: 'AI drafts need your offer to write anything useful. It takes two minutes.',
      href: '/account', cta: 'Open Account',
    });
  }

  return out.sort((a, b) => a.priority - b.priority).slice(0, limit);
}
