// lib/support-routing.js - smart support: who takes a ticket, how close it is to its target, what to do when it is missed, and the measures per agent. Pure.
import { decideSupport } from './support-bot.js';
const H = 3600000;
export const DUE_SOON = 0.75; // share of the target used before a ticket is flagged

/** on_track | due_soon | breached | done, from the ticket's own dates. */
export function slaStatus(t, now = Date.now()) {
  if (!t || t.status === 'resolved') return 'done';
  const due = Date.parse(t.dueAt), opened = Date.parse(t.openedAt);
  if (!(due > 0)) return 'on_track';
  if (now > due) return 'breached';
  const total = due - opened;
  return total > 0 && (now - opened) / total >= DUE_SOON ? 'due_soon' : 'on_track';
}

/** The agent for a new ticket: managers first for complaints and high priority, then the least loaded; viewers never take tickets. */
export function pickAgent(ticket, members = [], openTickets = [], now = Date.now()) {
  const agents = (Array.isArray(members) ? members : []).filter((m) => m && m.id && m.role !== 'viewer');
  if (!agents.length) return null;
  const load = new Map(agents.map((a) => [String(a.id), 0]));
  for (const t of Array.isArray(openTickets) ? openTickets : []) {
    if (t && t.status !== 'resolved' && load.has(String(t.assignedTo))) load.set(String(t.assignedTo), load.get(String(t.assignedTo)) + 1);
  }
  const senior = (m) => (m.role === 'owner' || m.role === 'manager' ? 0 : 1);
  const needsSenior = ticket?.kind === 'complaint' || ticket?.priority === 'high';
  return [...agents].sort((a, b) => ((needsSenior ? senior(a) - senior(b) : 0) || load.get(String(a.id)) - load.get(String(b.id)) || String(a.name || '').localeCompare(String(b.name || ''))))[0];
}

/** What to do about a ticket against its target: remind, tell the owner, or reassign after two hours late. */
export function escalationFor(t, now = Date.now()) {
  const s = slaStatus(t, now);
  if (s === 'breached') {
    const late = (now - Date.parse(t.dueAt)) / H;
    return late >= 2 ? { level: 2, action: 'tell_owner_and_reassign' } : { level: 1, action: 'tell_owner' };
  }
  if (s === 'due_soon') return { level: 0, action: 'remind_agent' };
  return { level: 0, action: 'none' };
}

/** The customer's record in the queue: how often they write, and whether they are open now. */
export function customerHistory(email, tickets = []) {
  const e = String(email || '').toLowerCase();
  if (!e) return null;
  const mine = (Array.isArray(tickets) ? tickets : []).filter((t) => String(t?.customerEmail || '').toLowerCase() === e);
  return { tickets: mine.length, openNow: mine.filter((t) => t.status !== 'resolved').length, repeat: mine.length > 1 };
}

/** A ready answer from the owner's library for this ticket, or null. The agent sends it with one tap. */
export function suggestedAnswer(ticket, library = []) {
  const question = ticket?.question || String(ticket?.summary || '').replace(/^(WhatsApp|SMS):\s*/, '');
  const d = decideSupport(question, library);
  return d.action === 'reply' ? d.reply : null;
}

/** The support measures per agent and overall: load, on time, breaches, and the reasons customers write in. */
export function smartSupportKpis(tickets = [], members = [], now = Date.now()) {
  const list = Array.isArray(tickets) ? tickets : [];
  const answered = list.filter((t) => t.resolvedAt);
  const late = answered.filter((t) => Date.parse(t.resolvedAt) > Date.parse(t.dueAt)).length;
  const reasons = {};
  for (const t of list) reasons[t.kind || 'support_request'] = (reasons[t.kind || 'support_request'] || 0) + 1;
  const agents = (Array.isArray(members) ? members : []).filter((m) => m && m.role !== 'viewer').map((m) => {
    const mine = list.filter((t) => String(t.assignedTo) === String(m.id));
    return { id: m.id, name: m.name || 'Team member', open: mine.filter((t) => t.status !== 'resolved').length, resolved: mine.filter((t) => t.status === 'resolved').length, breached: mine.filter((t) => slaStatus(t, now) === 'breached').length };
  });
  return {
    breachRatePct: answered.length ? Math.round((late / answered.length) * 100) : null,
    autoAnsweredPct: list.length ? Math.round((list.filter((t) => t.auto === true).length / list.length) * 100) : null,
    unassigned: list.filter((t) => t.status !== 'resolved' && !t.assignedTo).length,
    reasons,
    agents,
    repeatCustomers: new Set(list.map((t) => String(t.customerEmail || '').toLowerCase()).filter((e) => e && list.filter((x) => String(x.customerEmail || '').toLowerCase() === e).length > 1)).size,
  };
}
