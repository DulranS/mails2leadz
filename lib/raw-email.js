// lib/raw-email.js - a plain-text email as the base64url string the Gmail API wants. Pure (no network), so it is tested.
// Every header value is forced onto ONE line, so pasted or AI-written text can never add extra headers (header injection).
const oneLine = (v) => String(v ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').trim();
const encodeSubject = (s) => (/[^\x00-\x7F]/.test(s) ? `=?utf-8?B?${Buffer.from(s, 'utf-8').toString('base64')}?=` : s);

export function buildRawEmail({ from = '', fromName = '', to, subject, body, extraHeaders = '' }) {
  const addr = oneLine(from);
  const name = oneLine(fromName).replace(/[<>"]/g, '');
  let m = addr ? `From: ${name ? `${name} <${addr}>` : addr}\r\n` : '';
  m += `To: ${oneLine(to)}\r\n`;
  m += `Subject: ${encodeSubject(oneLine(subject))}\r\n`;
  m += 'MIME-Version: 1.0\r\n';
  m += extraHeaders; // fixed strings built by lib/server/unsubscribe.js (List-Unsubscribe), never user input
  m += 'Content-Type: text/plain; charset=utf-8\r\n\r\n';
  m += `${String(body ?? '').replace(/\r?\n/g, '\r\n')}\r\n`;
  return Buffer.from(m).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
