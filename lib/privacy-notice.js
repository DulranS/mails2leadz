// lib/privacy-notice.js - the privacy notice owed to people whose details you did not get from them directly
// (sourced candidates, bought lists). GDPR / UK GDPR Article 14: tell them within one month of getting the details, or at the
// first contact if that comes sooner.
//
// Pure: no I/O. Storage and sending live in lib/server/privacy-notices.js and the send paths.

export const NOTICE_COLLECTION = 'privacy_notices';

// Plain words for the lawful bases the owner picks in the sourcing form (lib/recruit-sourcing.js and the list gate).
const BASIS_TEXT = {
  legitimate_interests_b2b: 'our legitimate interest in contacting businesses like yours',
  consent: 'your consent',
  contract: 'an existing contract with you',
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const clip = (v, max) =>
  String(v ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/**
 * One stable key per person. Matches lib/lead-inbox.js inboxKey for e-mail and phone, so an erasure finds the same inbox lead.
 * '' when there is nothing to key on.
 */
export function noticeKey(row) {
  const email = clip(row?.email, 120).toLowerCase();
  if (email) return `e:${email}`;
  const phone = String(row?.phone || row?.whatsapp_number || '').replace(/\D/g, '');
  if (phone.length >= 7) return `t:${phone}`;
  const link = clip(row?.website || row?.profile, 300).toLowerCase();
  return link ? `u:${link}` : '';
}

/** One record per owner and person. encodeURIComponent keeps '/' out of the document id. */
export function noticeDocId(uid, key) {
  return `${uid}:${encodeURIComponent(key)}`;
}

/** The notice itself, as the person reads it. `controller` is who they are dealing with; `source` says where their details came from. */
export function noticeText({ controller, source, lawfulBasis, purpose }) {
  const who = clip(controller, 120) || 'the sender of this email';
  const from = clip(source, 120) || 'a list';
  const why = clip(purpose, 200) || 'we think our message may interest you';
  const basis = BASIS_TEXT[lawfulBasis] || clip(lawfulBasis, 120) || 'our legitimate interest';
  return [
    'About how we got your details:',
    `We found your details through ${from}. We are contacting you because ${why}.`,
    `We rely on ${basis}. ${who} uses your name and contact details for this purpose only.`,
    'You can ask what we hold about you, ask us to correct or delete it, or ask us to stop contacting you. Reply to this email to do any of these.',
  ].join('\n');
}

/** The body with the notice added after it, before the opt-out footer. */
export function withNotice(body, notice) {
  const text = String(body ?? '');
  return notice ? `${text}\n\n---\n${notice}` : text;
}

/**
 * Records whose notice date has passed and that have not been given yet. `records` are plain objects with noticeBy (YYYY-MM-DD),
 * givenAt (null until sent) and the other fields. `today` is YYYY-MM-DD. The notice is due ON its date, so it is overdue only after.
 */
export function overdueNotices(records, today) {
  if (!ISO_DAY.test(String(today || ''))) return [];
  return (Array.isArray(records) ? records : [])
    .filter((r) => r && !r.givenAt && ISO_DAY.test(String(r.noticeBy || '')) && r.noticeBy < today)
    .sort((a, b) => a.noticeBy.localeCompare(b.noticeBy));
}
