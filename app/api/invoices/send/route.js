// app/api/invoices/send/route.js - the owner emails an invoice from the Billing page, through their own connected Gmail.
// The email carries the pay-by-card line when the account has card payments set up. Nothing is sent to anyone else.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { getDoc, updateDoc, doc } from '../../../../lib/server-firestore.js';
import { openMailbox } from '../../../../lib/server/autosend.js';
import { buildRawEmail } from '../../../../lib/raw-email.js';
import { invoiceEmailText } from '../../../../lib/billing-automation.js';
import { invoiceState } from '../../../../lib/billing.js';
import { paymentsReady, payLinkFor } from '../../../../lib/server/payments.js';
import { secretsFor, PAYMENT_NAMES } from '../../../../lib/server/integration-secrets.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const MAILBOX_MESSAGE = {
  no_gmail: 'Connect your Gmail in Account first.',
  no_send_access: 'Reconnect Gmail in Account and allow it to send email.',
  auth: 'Gmail access has expired. Reconnect Gmail in Account.',
  gmail_unreachable: 'Gmail could not be reached. Try again in a minute.',
};

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const uid = who.uid;
  const id = String(body?.id || '').slice(0, 80);
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return json({ error: 'Choose the invoice to send.' }, 400);

  const db = getDb();
  const gate = await guardTenant(db, uid);
  if (gate.response) return gate.response;

  const snap = await getDoc(doc(db, 'invoices', id));
  if (!snap.exists() || snap.data().userId !== uid) return json({ error: 'This invoice could not be found.' }, 404);
  const inv = { id, ...snap.data() };
  const { state } = invoiceState(inv);
  if (state === 'paid' || state === 'void') return json({ error: 'This invoice is already settled, so there is nothing to send.' }, 409);
  if (!inv.email) return json({ error: 'This invoice has no customer email.' }, 409);

  const biz = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
  const bs = biz.exists() ? biz.data() : {};
  const currency = String(bs.currency || 'USD');
  const senderName = String(bs?.profile?.businessName || '').replace(/[\r\n]/g, ' ').slice(0, 80);
  const paymentInfo = String(bs.paymentInstructions || '').slice(0, 400);
  const payLink = paymentsReady(await secretsFor(db, uid, PAYMENT_NAMES)) ? (payLinkFor(uid, id) || '') : '';

  const box = await openMailbox(db, uid);
  if (!box.ok) return json({ error: MAILBOX_MESSAGE[box.reason] || 'Gmail is not available right now.' }, 409);

  const text = invoiceEmailText({
    name: inv.businessName, amount: inv.amount, currency, dueAt: inv.dueAt, note: inv.note, senderName, paymentInfo,
    taxAmount: inv.taxAmount, total: inv.total, payLink,
  });
  let sent;
  try {
    sent = await box.sendRaw(buildRawEmail({ from: box.email, fromName: senderName, to: inv.email, subject: text.subject, body: text.body }));
  } catch (e) {
    console.error('[invoices/send] gmail failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Gmail did not accept the message. Nothing was recorded as sent. Try again.' }, 502);
  }
  try {
    await updateDoc(doc(db, 'invoices', id), { emailedAt: new Date().toISOString(), emailedBy: 'owner-app', emailedMessageId: sent?.id || null });
  } catch (e) {
    console.error('[invoices/send] recording failed:', String(e?.message || '').slice(0, 120));
    return json({ ok: true, payLink: !!payLink, warning: 'The email was sent, but the app could not record it. Do not send it again; check your Sent folder.' });
  }
  return json({ ok: true, payLink: !!payLink });
}
