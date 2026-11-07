// lib/support.js - the support queue for paying customers: a two-hour response target, status, and the measures the owner runs the work by. Pure.
const H = 3600000;
export const SLA_HOURS = 2;
export const TICKET_STATUSES = ['open', 'in_progress', 'resolved'];

/** A ticket from a complaint or support request that raised an alert. */
export function ticketFor(alert, now = Date.now()) {
  return { source: alert.stageKey, kind: alert.stage, customerEmail: alert.leadEmail || '', summary: String(alert.reason || '').slice(0, 300), status: 'open', openedAt: new Date(now).toISOString(), dueAt: new Date(now + SLA_HOURS * H).toISOString(), priority: alert.stage === 'complaint' ? 'high' : 'normal' };
}

/** The support measures: what is open, what is past its target, how fast it is answered, and how often the target is met. */
export function supportKpis(tickets = [], now = Date.now()) {
  const open = tickets.filter((t) => t.status !== 'resolved');
  const overdue = open.filter((t) => Date.parse(t.dueAt) < now);
  const answered = tickets.filter((t) => t.resolvedAt);
  const hours = answered.map((t) => (Date.parse(t.resolvedAt) - Date.parse(t.openedAt)) / H).filter((h) => Number.isFinite(h) && h >= 0).sort((a, b) => a - b);
  const median = hours.length ? hours[Math.floor(hours.length / 2)] : null;
  const onTime = answered.filter((t) => Date.parse(t.resolvedAt) <= Date.parse(t.dueAt)).length;
  const weekAgo = now - 7 * 24 * H;
  return {
    open: open.length,
    overdue: overdue.length,
    complaintsOpen: open.filter((t) => t.kind === 'complaint').length,
    resolvedThisWeek: answered.filter((t) => Date.parse(t.resolvedAt) >= weekAgo).length,
    medianHoursToResolve: median === null ? null : Math.round(median * 10) / 10,
    targetMetPct: answered.length ? Math.round((onTime / answered.length) * 100) : null,
    slaHours: SLA_HOURS,
  };
}
