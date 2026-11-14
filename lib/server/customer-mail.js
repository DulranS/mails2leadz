// lib/server/customer-mail.js - one plain email to a customer, from the owner's own connected Gmail. Never throws to the caller.
import { openMailbox } from './autosend.js';
import { buildRawEmail } from '../raw-email.js';
import { buildOptOut } from './unsubscribe.js';

export async function mailCustomer(db, uid, { to, subject, text, fromName = '', marketing = false } = {}) {
  try {
    if (!to || !subject || !text) return { sent: false, why: 'incomplete' };
    const box = await openMailbox(db, uid);
    if (!box.ok) return { sent: false, why: box.reason };
    // Marketing mail carries the RFC 8058 one-click unsubscribe headers that Gmail and Yahoo require for bulk senders.
    const extraHeaders = marketing ? buildOptOut(uid, to).headers : '';
    const sent = await box.sendRaw(buildRawEmail({ from: box.email, fromName, to, subject, body: text, extraHeaders }));
    return { sent: true, id: sent?.id || null };
  } catch (e) {
    console.error('[customer-mail] failed:', String(e?.message || '').slice(0, 120));
    return { sent: false, why: 'send_failed' };
  }
}
