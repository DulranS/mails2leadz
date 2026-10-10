// lib/next-actions.js - turns the numbers into "what should I do today?".
// Deterministic (no AI, no cost), ordered by money at stake, max 5 items.

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`;

/**
 * @param {object} a
 * @param {object} a.metrics                 result of computeBusinessMetrics
 * @param {Array}  a.unconvertedReplies      [{email, business}] replied but not yet a qualified deal
 * @param {number} a.dueFollowUps            pending follow-up tasks that are due now
 * @param {number} a.monthlyGoal             0 = none set
 * @param {boolean} a.hasProfile             business profile filled in
 * @param {number} a.sentRecently            emails sent in the last 90 days
 */
export function buildNextActions({ metrics, unconvertedReplies = [], dueFollowUps = 0, monthlyGoal = 0, hasProfile = true, sentRecently = 0 }) {
  const out = [];
  const m = metrics;
  const avg = m.settings.avgDealValue;
  const qualifiedChance = m.settings.probabilities.qualified ?? 0.25;

  if (unconvertedReplies.length > 0) {
    const names = unconvertedReplies.slice(0, 3).map((r) => r.business || r.email).join(', ');
    out.push({
      id: 'replies', priority: 1, tone: 'hot',
      title: `${unconvertedReplies.length} ${unconvertedReplies.length === 1 ? 'person has' : 'people have'} replied and no deal exists yet`,
      detail: `${names}${unconvertedReplies.length > 3 ? ' and more' : ''}. Open the Replies panel and tap 💼 Deal. Worth about ${money(unconvertedReplies.length * avg * qualifiedChance)} in expected revenue.`,
      href: '/dashboard', cta: 'Open replies',
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

  if (!hasProfile) {
    out.push({
      id: 'profile', priority: 1, tone: 'hot',
      title: 'Tell the AI what you sell',
      detail: 'AI drafts need your offer to write anything useful. It takes two minutes.',
      href: '/account', cta: 'Open Account',
    });
  }

  return out.sort((a, b) => a.priority - b.priority).slice(0, 5);
}
