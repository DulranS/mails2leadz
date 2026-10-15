// lib/server/reply-check.js - ONE reply check, used by both /api/check-replies (the dashboard, with the signed-in user's Gmail token)
// and /api/cron/check-replies (the timed job, with the owner's stored read-only Gmail connection).
//
// For every unreplied email in this batch it asks Gmail whether the lead answered, READS THE WHOLE REPLY (not Gmail's ~200-character
// preview), and then:
//   * an automatic answer (Auto-Submitted header, or short out-of-office wording) is remembered and does NOT count as a reply
//   * a real reply marks the email replied, saves the reply text, cancels pending follow-ups and is triaged (opt-out wording is
//     suppressed, a positive reply moves the deal forward; nothing is ever sent)
//   * bounce notices from the mail system suppress addresses that do not exist
// Gmail and the database are passed in, so the whole loop can be tested without either.
import { pickEmailsToCheck, REPLY_CHECK_BATCH } from '../reply-pick.js';
import { quickIntent } from '../reply-intents.js';
import { REPLY_TEXT_MAX } from '../reply-text.js';
import { readMessage } from './gmail-message.js';
import { hardBounceRecipients } from './bounces.js';

export class GmailAuthError extends Error {
  constructor(message = 'Gmail access is no longer valid') { super(message); this.name = 'GmailAuthError'; this.code = 'GMAIL_AUTH'; }
}
/** Google says the access token / refresh token is expired, revoked or wrong. Every further call in this run would fail the same way. */
export const isGmailAuthError = (e) =>
  e?.code === 401 || e?.status === 401 || e?.response?.status === 401 || /invalid_grant|invalid_token|invalid credentials|login required|token has been (expired|revoked)/i.test(String(e?.message || ''));

const RATE_LIMIT_DELAY_MS = 100; // between Gmail calls
const MAX_RETRIES = 2;
const isValidEmail = (email) => typeof email === 'string' && email.trim().length >= 5 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

async function defaultDeps() {
  const fs = await import('../server-firestore.js');
  const [{ cancelPendingFollowUps }, { triageReply }, { loadAutopilot }, { suppressContact }] = await Promise.all([
    import('../reply-sync.js'), import('./reply-triage.js'), import('./prepare-drafts.js'), import('./suppress.js'),
  ]);
  return { collection: fs.collection, query: fs.query, where: fs.where, getDocs: fs.getDocs, updateDoc: fs.updateDoc, isAdminMode: fs.isAdminMode, cancelPendingFollowUps, triageReply, loadAutopilot, suppressContact };
}

/**
 * @param {object} o
 * @param {object} o.db            Firestore handle (server-firestore.js)
 * @param {object} o.gmail         googleapis Gmail client for the owner's mailbox
 * @param {string} o.userId
 * @param {string} o.senderEmail   the mailbox address the replies arrive at
 * @param {(info:object)=>Promise<void>|void} [o.trackReply]  called once per real reply (company tracking); never fails the check
 * @param {number} [o.deadline]    ms timestamp; stop starting new look-ups after it (the rest is reported as `waiting`)
 * @param {number} [o.max]         emails per call
 * @param {object} [deps]          test seam: replaces every database / triage helper
 * @returns {Promise<{replyCount,checked,eligible,waiting,errors,bounced,autoReplies,triage,replies}>}
 * @throws {GmailAuthError} when Gmail refuses the credentials (the caller decides what the owner should be told)
 */
export async function runReplyCheck({ db, gmail, userId, senderEmail, trackReply, deadline = 0, max = REPLY_CHECK_BATCH, now = Date.now() }, deps) {
  const d = deps || (await defaultDeps());
  const out = { replyCount: 0, checked: 0, eligible: 0, waiting: 0, errors: 0, bounced: [], autoReplies: 0, triage: [], replies: [] };

  const snapshot = await d.getDocs(d.query(d.collection(db, 'sent_emails'), d.where('userId', '==', userId), d.where('replied', '==', false)));
  if (snapshot.empty) return out;

  // Rotate: never-checked first (newest first), then the one checked longest ago, last 60 days only (see lib/reply-pick.js).
  const { picked, eligible, waiting } = pickEmailsToCheck(
    snapshot.docs.map((x) => ({ d: x, sentAt: x.data().sentAt, replyCheckedAt: x.data().replyCheckedAt })),
    now,
    { max },
  );
  const docs = picked.map((x) => x.d);
  out.eligible = eligible;
  out.waiting = waiting;
  if (docs.length === 0) return out;

  const apSettings = d.isAdminMode() ? await d.loadAutopilot(db, userId) : null;
  let looked = 0;

  for (const doc of docs) {
    if (deadline && Date.now() > deadline) { out.waiting += docs.length - looked; break; } // out of time: the rest goes first next call
    looked++;
    out.checked++;
    const sent = doc.data();
    const toEmail = sent.to;
    if (!isValidEmail(toEmail)) continue;
    const stamp = () => d.updateDoc(doc.ref, { replyCheckedAt: nowIso() }).catch(() => {}); // so the rotation moves on

    let success = false;
    for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
      try {
        // Quotes/backslashes inside the subject would break the Gmail search phrase and silently hide the reply.
        const safeSubject = String(sent.subject || '').replace(/["\\\r\n]+/g, ' ').trim();
        const list = await gmail.users.messages.list({ userId: 'me', q: `to:${senderEmail} from:${toEmail} in:inbox "${safeSubject}"`, maxResults: 1 });
        const found = list.data.messages?.[0];

        if (!found) { await stamp(); success = true; break; }
        if (sent.autoReplyMessageId === found.id) { await stamp(); success = true; break; } // an auto-answer we already set aside

        // The WHOLE message, not a preview.
        const full = await gmail.users.messages.get({ userId: 'me', id: found.id, format: 'full' });
        const msg = readMessage(full.data);

        // An automatic answer is not a reply: do not stop the follow-ups or inflate the reply rate. It is remembered so the next check
        // does not pick it up again; a REAL reply later is a different message.
        if (msg.autoReply || quickIntent(`${msg.subject} ${msg.text}`) === 'out_of_office') {
          await d.updateDoc(doc.ref, { autoReplyMessageId: found.id, autoReplyAt: nowIso(), replyCheckedAt: nowIso() });
          out.autoReplies++;
          success = true;
          break;
        }

        await d.updateDoc(doc.ref, {
          replied: true,
          repliedAt: nowIso(),
          followUpAt: null, // cancel scheduled follow-ups
          replyMessageId: found.id,
          replyThreadId: msg.threadId || full.data.threadId || '',
          replyFrom: msg.from,
          replyDate: msg.date,
          replySubject: msg.subject,
          replyText: msg.text.slice(0, REPLY_TEXT_MAX), // what they actually wrote (quoted history removed)
          replyHasFullText: msg.hasFullText,
        });
        out.replyCount++;
        out.replies.push({
          email: toEmail, threadId: msg.threadId, messageId: found.id, replyCount: 1, lastReplyAt: nowIso(),
          replyFrom: msg.from, replySubject: msg.subject, originalSubject: sent.subject, replyText: msg.text.slice(0, 600),
        });

        await d.cancelPendingFollowUps(db, userId, toEmail); // stop chasing

        // Read the reply: opt-out wording is suppressed, a positive reply moves the deal forward (never sends anything).
        if (d.isAdminMode()) {
          const t = await d.triageReply(db, { uid: userId, sentRef: doc.ref, email: toEmail, businessName: sent.businessName, replyText: `${msg.subject}\n${msg.text}`, originalSubject: sent.subject, settings: apSettings });
          if (t) out.triage.push(t);
        }
        if (trackReply) {
          try {
            await trackReply({ userId, companyName: sent.businessName || 'Unknown Company', domain: String(toEmail).split('@')[1] || null, email: toEmail, contactName: sent.contactName || '', csvSource: sent.csvSource || 'unknown', action: 'reply' });
          } catch (e) { console.warn('[reply-check] company tracking skipped:', e?.message); }
        }
        success = true;
      } catch (err) {
        if (isGmailAuthError(err)) throw new GmailAuthError(String(err?.message || '').slice(0, 200));
        out.errors++;
        if (attempt === MAX_RETRIES - 1) console.warn(`[reply-check] giving up on one email after ${MAX_RETRIES} attempts:`, String(err?.message || err).slice(0, 160));
        else await sleep(RATE_LIMIT_DELAY_MS);
      }
    }
    if (looked < docs.length) await sleep(RATE_LIMIT_DELAY_MS);
  }

  // Bounces: a notice from the mail system saying an address does not exist. Suppress it so we never mail it again (repeated mail to
  // dead addresses hurts the owner's own Gmail sending reputation). Best effort: never fails the check.
  try {
    if (d.isAdminMode()) {
      const ours = [...new Set(docs.map((x) => String(x.data().to || '').toLowerCase()).filter(Boolean))];
      const list = await gmail.users.messages.list({ userId: 'me', q: 'from:(mailer-daemon OR postmaster) newer_than:14d', maxResults: 15 });
      for (const m of list.data.messages || []) {
        const msg = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['subject'] });
        for (const addr of hardBounceRecipients(msg.data.snippet, ours)) {
          if (out.bounced.includes(addr)) continue;
          await d.suppressContact(db, { uid: userId, email: addr, reason: 'bounced', source: 'bounce' });
          out.bounced.push(addr);
        }
      }
    }
  } catch (e) {
    console.warn('[reply-check] bounce scan skipped:', e?.message);
  }
  return out;
}
