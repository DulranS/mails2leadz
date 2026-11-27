// lib/server/customer-mail.js - one plain email to a customer, from the owner's own connected Gmail. Never throws to the caller.
import { openMailbox } from './autosend.js';
import { buildRawEmail } from '../raw-email.js';
import { buildOptOut, postalAddressProblem } from './unsubscribe.js';
import { getSenderAddress } from './route-helpers.js';
import { bodyWithNotice, markNoticeGiven } from './privacy-notices.js';

export async function mailCustomer(db, uid, { to, subject, text, fromName = '', marketing = false } = {}) {
  try {
    if (!to || !subject || !text) return { sent: false, why: 'incomplete' };
    // v402: marketing mail needs the owner's postal address on file (CAN-SPAM, CASL, UK PECR guidance). No address, no send.
    if (marketing && postalAddressProblem(await getSenderAddress(db, uid))) return { sent: false, why: 'no_postal_address' };
    const box = await openMailbox(db, uid);
    if (!box.ok) return { sent: false, why: box.reason };
    // Marketing mail carries the RFC 8058 one-click unsubscribe headers that Gmail and Yahoo require for bulk senders.
    const extraHeaders = marketing ? buildOptOut(uid, to).headers : '';
    // A sourced person still owed the privacy notice gets it here too (pass 335). A failed check ends in send_failed, not a send.
    const noticed = await bodyWithNotice(db, uid, to, text, fromName);
    const sent = await box.sendRaw(buildRawEmail({ from: box.email, fromName, to, subject, body: noticed.body, extraHeaders }));
    if (noticed.notice) await markNoticeGiven(db, noticed.notice).catch(() => {});
    return { sent: true, id: sent?.id || null, threadId: sent?.threadId || null };
  } catch (e) {
    console.error('[customer-mail] failed:', String(e?.message || '').slice(0, 120));
    return { sent: false, why: 'send_failed' };
  }
}
