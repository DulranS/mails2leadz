// lib/server/support-queue.js - the support tickets: created when a complaint or support alert is raised, updated by the owner. Never throws.
import { collection, doc, getDoc, getDocs, query, limit, addDoc, setDoc } from '../server-firestore.js';
import { ticketFor, supportKpis, TICKET_STATUSES } from '../support.js';
import { pickAgent } from '../support-routing.js';

export async function openTicketFor(db, uid, alert, now = Date.now(), extra = {}) {
  try {
    const ticket = ticketFor(alert, now, extra);
    const members = (await getDoc(doc(db, 'users', uid, 'settings', 'team')).catch(() => null))?.data?.()?.members || [];
    const open = (await getDocs(query(collection(db, 'users', uid, 'support_tickets'), limit(200)))).docs.map((d) => d.data());
    const agent = pickAgent(ticket, members, open, now);
    if (agent) Object.assign(ticket, { assignedTo: String(agent.id), assignedName: String(agent.name || '') });
    await addDoc(collection(db, 'users', uid, 'support_tickets'), ticket);
  } catch (e) { console.error('[support] ticket failed:', String(e?.message || '').slice(0, 120)); }
}

export async function ticketsFor(db, uid, now = Date.now()) {
  const tickets = (await getDocs(query(collection(db, 'users', uid, 'support_tickets'), limit(200)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  tickets.sort((a, b) => (Date.parse(a.dueAt) || 0) - (Date.parse(b.dueAt) || 0));
  return { tickets, kpis: supportKpis(tickets, now) };
}

export async function setTicket(db, uid, id, status, note = '', now = Date.now()) {
  if (!TICKET_STATUSES.includes(status)) return { ok: false, error: 'Unknown status.' };
  const patch = { status, updatedAt: new Date(now).toISOString() };
  if (status === 'resolved') patch.resolvedAt = new Date(now).toISOString();
  if (note) patch.note = String(note).slice(0, 500);
  await setDoc(doc(db, 'users', uid, 'support_tickets', String(id)), patch, { merge: true });
  return { ok: true };
}
