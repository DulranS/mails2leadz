// POST /api/twilio/missed-call/{uid}  - Twilio posts a call's status here. A missed call becomes a new lead to return. Only requests signed by Twilio are accepted.
import { collection, addDoc } from '../../../../../lib/server-firestore.js';
import { getDb } from '../../../../../lib/server/route-helpers.js';
import { secretsFor } from '../../../../../lib/server/integration-secrets.js';
import { validTwilioRequest } from '../../../../../lib/twilio-signature.js';

const MISSED = ['no-answer', 'busy', 'failed', 'canceled'];
const TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>';

export async function POST(request) {
  try {
    const uid = decodeURIComponent(new URL(request.url).pathname.split('/').pop() || '');
    const db = getDb();
    const form = await request.formData();
    const params = Object.fromEntries(form.entries());
    const s = await secretsFor(db, uid, ['TWILIO_AUTH_TOKEN']).catch(() => ({}));
    if (!validTwilioRequest(request.url, params, s.TWILIO_AUTH_TOKEN, request.headers.get('x-twilio-signature'))) {
      return new Response('Forbidden', { status: 403 });
    }
    if (MISSED.includes(String(params.CallStatus || '')) && params.From) {
      await addDoc(collection(db, 'lead_inbox'), {
        userId: uid, name: '', email: '', phone: String(params.From).slice(0, 40), source: 'Missed call',
        status: 'new', receivedAt: new Date().toISOString(), note: `Call ${params.CallStatus}. Return the call or send a text.`,
      });
    }
    return new Response(TWIML, { status: 200, headers: { 'Content-Type': 'text/xml' } });
  } catch (e) {
    return new Response('Could not record that call.', { status: 500 });
  }
}
