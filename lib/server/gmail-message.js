// lib/server/gmail-message.js - read a Gmail API message payload (format "full") as plain text. Pure: no network, testable.
// Why: Gmail's `snippet` is a ~200-character preview. Everything that decides what a reply MEANS (is it an out-of-office, did they
// ask a question, what should the answer say) needs the whole text, including replies that only come as HTML.
import { htmlToText, cleanReplyText } from '../reply-text.js';

// Node's base64 decoder accepts the URL-safe alphabet Gmail uses ("-" and "_").
export const decodeB64Url = (data) => {
  try { return Buffer.from(String(data || ''), 'base64').toString('utf8'); } catch { return ''; }
};

export function headerMap(headers) {
  const out = {};
  for (const h of Array.isArray(headers) ? headers : []) {
    const name = String(h?.name || '').toLowerCase();
    if (name && !(name in out)) out[name] = String(h.value ?? '');
  }
  return out;
}

function collect(part, acc, depth = 0) {
  if (!part || depth > 10) return; // a hostile message cannot make this recurse forever
  if (Array.isArray(part.parts) && part.parts.length) { for (const p of part.parts) collect(p, acc, depth + 1); return; }
  if (part.filename || !part.body?.data) return; // attachments and parts too large to be inlined are not the reply's words
  const mime = String(part.mimeType || '').toLowerCase();
  if (mime === 'text/plain') acc.plain.push(decodeB64Url(part.body.data));
  else if (mime === 'text/html') acc.html.push(decodeB64Url(part.body.data));
}

/** Whole readable text of a message (text/plain preferred, HTML converted when that is all there is). '' when there is none. */
export function extractText(payload) {
  const acc = { plain: [], html: [] };
  collect(payload, acc);
  const plain = acc.plain.join('\n').trim();
  if (plain) return plain;
  return htmlToText(acc.html.join('\n')).trim();
}

/** RFC 3834 and the common vendor headers: an automatic answer is not a person replying. */
export function isAutoReplyHeaders(h = {}) {
  const auto = String(h['auto-submitted'] || '').trim().toLowerCase();
  if (auto && auto !== 'no') return true;
  for (const k of ['x-autoreply', 'x-autorespond']) { const v = String(h[k] || '').trim().toLowerCase(); if (v && v !== 'no') return true; }
  return /auto[_-]?(reply|response)/i.test(String(h.precedence || ''));
}

/**
 * One Gmail message (format "full") -> what the app needs to know about it.
 * `text` = only the sender's own words (quoted history removed); `hasFullText` says whether it came from the body or only the preview.
 */
export function readMessage(message) {
  const headers = headerMap(message?.payload?.headers);
  const body = extractText(message?.payload);
  const snippet = String(message?.snippet || '');
  return {
    id: message?.id || '',
    threadId: message?.threadId || '',
    from: headers.from || '',
    to: headers.to || '',
    subject: headers.subject || '',
    date: headers.date || '',
    body,                                   // everything, quotes included (for showing a thread)
    text: cleanReplyText(body || snippet),  // the sender's own words (for reading and classifying)
    hasFullText: !!body,
    snippet,
    autoReply: isAutoReplyHeaders(headers),
  };
}

/**
 * When Gmail cannot be reached (no connection, expired access) the app can still show what it saved when the reply was found:
 * our email and their reply. @returns {{threadId, messages, totalMessages, source:'saved'}|null}  null = nothing saved to show
 */
export function buildSavedThread(sent, { myEmail = '' } = {}) {
  if (!sent || typeof sent !== 'object') return null;
  const reply = String(sent.replyText || '').trim();
  if (!reply) return null;
  const mine = {
    id: sent.messageId || 'sent', threadId: sent.threadId || '', from: myEmail || 'You', to: sent.to || '', subject: sent.subject || '',
    date: sent.sentAt || '', body: String(sent.body || ''), text: String(sent.body || ''), snippet: '',
  };
  const theirs = {
    id: sent.replyMessageId || 'reply', threadId: sent.replyThreadId || sent.threadId || '', from: sent.replyFrom || sent.to || '', to: myEmail || '',
    subject: sent.replySubject || '', date: sent.replyDate || sent.repliedAt || '', body: reply, text: reply, snippet: '',
  };
  const messages = [mine, theirs].filter((m) => m.body);
  return { threadId: theirs.threadId, messages, totalMessages: messages.length, source: 'saved' };
}
