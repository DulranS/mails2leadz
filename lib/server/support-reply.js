// lib/server/support-reply.js - the agent's reply to a customer's WhatsApp or SMS question, from the number the customer wrote to. Never throws.
import { doc, getDoc, setDoc } from '../server-firestore.js';
import { twilioFor } from './twilio-account.js';

export async function replyToTicket(db, uid, ticketId, text, now = Date.now()) {
  try {
    const ref = doc(db, 'users', uid, 'support_tickets', String(ticketId));
    const snap = await getDoc(ref).catch(() => null);
    if (!snap?.exists?.()) return { ok: false, error: 'Not found.' };
    const t = snap.data();
    if (t.channel !== 'whatsapp' && t.channel !== 'sms') return { ok: false, error: 'Only WhatsApp and SMS questions can be answered here. Email replies are sent from your inbox.' };
    const body = String(text || '').trim().slice(0, 1000);
    if (body.length < 2) return { ok: false, error: 'Write the reply first.' };
    if (!t.customerPhone || !t.toNumber) return { ok: false, error: 'This question has no number to reply to.' };
    const tw = await twilioFor(db, uid);
    if (!tw) return { ok: false, error: 'Connect Twilio under Integrations to send replies.' };
    const from = t.channel === 'whatsapp' ? `whatsapp:${String(t.toNumber).replace(/^whatsapp:/i, '')}` : String(t.toNumber).replace(/^whatsapp:/i, '');
    const to = t.channel === 'whatsapp' ? `whatsapp:${String(t.customerPhone).replace(/^whatsapp:/i, '')}` : String(t.customerPhone).replace(/^whatsapp:/i, '');
    await tw.client.messages.create({ from, to, body });
    await setDoc(ref, { status: 'resolved', resolvedAt: new Date(now).toISOString(), lastReply: body.slice(0, 500), lastReplyAt: new Date(now).toISOString() }, { merge: true });
    return { ok: true };
  } catch (e) {
    console.error('[support-reply] failed:', uid, String(e?.message || '').slice(0, 120));
    return { ok: false, error: 'The reply could not be sent. Try again.' };
  }
}
