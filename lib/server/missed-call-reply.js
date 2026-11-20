// Missed-call text-back (pass 341). When a call to the business's Twilio number is missed, the caller gets one short text straight away,
// so the call does not go cold. Only a caller who has just rung is texted, at most once in 24 hours, with plain wording and no offers.
// It never fails the call: the lead is already recorded before this runs, and any error here is swallowed. Pure decision first, then the send.
import { collection, doc, getDoc, setDoc } from '../server-firestore.js';
import { twilioFor } from './twilio-account.js';
import { textBackRefusal, textBackBody } from '../missed-call-text-rules.js';

// Sends the text if allowed. Returns { sent, reason }. Never throws.
export async function textBackMissedCall(db, uid, from, businessName, now = Date.now()) {
  try {
    const key = `${uid}_${String(from || '').replace(/\D/g, '')}`;
    const ref = doc(collection(db, 'missed_call_texts'), key);
    const snap = await getDoc(ref).catch(() => null);
    const lastSentAt = snap?.exists?.() ? snap.data()?.sentAt : null;
    // The owner's one pause (users/{uid}/settings/business.automationPaused) stops every text that contacts people, this one included.
    const settings = await getDoc(doc(collection(db, 'users'), uid, 'settings', 'business')).then((s) => s.data() || {}).catch(() => ({}));
    const refusal = textBackRefusal({ from, lastSentAt, now: new Date(now).getTime(), paused: settings.automationPaused === true });
    if (refusal) return { sent: false, reason: refusal };
    const tw = await twilioFor(db, uid).catch(() => null);
    if (!tw) return { sent: false, reason: 'Twilio is not connected, so no text was sent.' };
    await tw.client.messages.create({ from: tw.from, to: from, body: textBackBody(businessName) });
    await setDoc(ref, { uid, from, sentAt: new Date(now).toISOString() });
    return { sent: true, reason: null };
  } catch {
    return { sent: false, reason: 'The text could not be sent.' };
  }
}
