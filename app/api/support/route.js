// app/api/support/route.js - the support queue: routing, SLA, escalation, customer history, ready answers, assignment and replies. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { collection, doc, getDoc, getDocs, query, limit, setDoc } from '../../../lib/server-firestore.js';
import { ticketsFor, setTicket } from '../../../lib/server/support-queue.js';
import { replyToTicket } from '../../../lib/server/support-reply.js';
import { slaStatus, escalationFor, customerHistory, suggestedAnswer, smartSupportKpis } from '../../../lib/support-routing.js';
import { cleanLibrary } from '../../../lib/support-bot.js';

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const now = Date.now();
  const { tickets, kpis } = await ticketsFor(db, who.uid, now);
  const biz = (await getDoc(doc(db, 'users', who.uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
  const members = (await getDoc(doc(db, 'users', who.uid, 'settings', 'team')).catch(() => null))?.data?.()?.members || [];
  const library = cleanLibrary(biz.supportLibrary);
  const enriched = tickets.map((t) => ({
    ...t,
    sla: slaStatus(t, now),
    escalation: escalationFor(t, now),
    history: customerHistory(t.customerEmail, tickets),
    suggested: t.status !== 'resolved' ? suggestedAnswer(t, library) : null,
  }));
  return NextResponse.json({ tickets: enriched, kpis, smart: smartSupportKpis(tickets, members, now), members: members.map((m) => ({ id: m.id, name: m.name || 'Team member', role: m.role })) }, { headers: NO_STORE });
}

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  const id = String(body?.id || '');
  if (body?.reply !== undefined) {
    const r = await replyToTicket(db, who.uid, id, String(body.reply || ''));
    return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: NO_STORE });
  }
  if (body?.assign !== undefined) {
    await setDoc(doc(db, 'users', who.uid, 'support_tickets', id), { assignedTo: String(body.assign || ''), assignedName: String(body.assignedName || ''), updatedAt: new Date().toISOString() }, { merge: true });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
  const r = await setTicket(db, who.uid, id, String(body?.status || ''), String(body?.note || ''));
  return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: NO_STORE });
}
