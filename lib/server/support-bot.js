// lib/server/support-bot.js - handles one incoming WhatsApp or SMS question: answers from the owner's library (when auto-replies are on) or opens a ticket. Never throws.
import { doc, getDoc, setDoc } from '../server-firestore.js';
import { switchState } from '../switches.js';
import { twilioFor } from './twilio-account.js';
import { openTicketFor } from './support-queue.js';
import { decideSupport, cleanLibrary } from '../support-bot.js';

const DAILY_CAP = 5; // automatic replies to one customer per day

export async function handleSupportMessage(db, uid, { channel = 'sms', from, to, body, env = process.env, now = Date.now() } = {}) {
  try {
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    const library = cleanLibrary(biz.supportLibrary);
    const decision = decideSupport(body, library);
    const enabled = switchState('supportAutoReply', biz, env).status === 'on';
    const day = new Date(now).toISOString().slice(0, 10);
    const capRef = doc(db, 'users', uid, 'support_reply_counts', `${String(from).replace(/\D/g, '')}_${day}`);
    const count = (await getDoc(capRef).catch(() => null))?.data?.()?.count || 0;

    if (decision.action === 'reply' && enabled && count < DAILY_CAP) {
      const tw = await twilioFor(db, uid);
      if (tw) {
        const fromAddr = channel === 'whatsapp' ? `whatsapp:${String(to).replace(/^whatsapp:/i, '')}` : String(to).replace(/^whatsapp:/i, '');
        const toAddr = channel === 'whatsapp' ? `whatsapp:${String(from).replace(/^whatsapp:/i, '')}` : String(from).replace(/^whatsapp:/i, '');
        await tw.client.messages.create({ from: fromAddr, to: toAddr, body: decision.reply });
        await setDoc(capRef, { count: count + 1, day }, { merge: true });
        await openTicketFor(db, uid, { stageKey: `auto:${now}`, leadEmail: String(from), stage: 'support_request', reason: `Answered automatically: ${String(body).slice(0, 160)}` }, now, { status: 'resolved', auto: true, resolvedAt: new Date(now).toISOString() });
        return { answered: true };
      }
    }
    // Anything not answered goes to a person, in the support queue with the message attached.
    await openTicketFor(db, uid, { stageKey: `msg:${now}`, leadEmail: '', stage: decision.kind || 'support_request', reason: `${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}: ${String(body).slice(0, 240)}` }, now, { channel, customerPhone: String(from), toNumber: String(to), question: String(body).slice(0, 300) });
    return { answered: false, reason: decision.reason || (enabled ? 'no_answer' : 'auto_replies_off') };
  } catch (e) {
    console.error('[support-bot] failed:', uid, String(e?.message || '').slice(0, 120));
    return { answered: false, reason: 'error' };
  }
}
