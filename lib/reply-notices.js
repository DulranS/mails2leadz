// lib/reply-notices.js - "while you were away": turns the result of an unattended reply check into one short notice.
// Pure. A notice is only written when something noteworthy happened (a reply, a deal moved, an opt-out, a broken connection).

/** @returns {null | {replies:number, lines:string[], autoReplies:number}} */
export function buildNotice({ replyCount = 0, triage = [], autoReplies = 0, bounced = 0 } = {}) {
  const lines = [];
  for (const t of triage || []) {
    if (!t) continue;
    lines.push(`${t.email}: ${String(t.label || 'replied').toLowerCase()}${t.action ? `, ${t.action}` : ''}${t.summary ? ` ("${String(t.summary).slice(0, 90)}")` : ''}`);
  }
  const b = Array.isArray(bounced) ? bounced.length : Number(bounced) || 0;
  if (!replyCount && !lines.length && !b) return null;
  if (b) lines.push(`${b} email${b === 1 ? '' : 's'} bounced: those addresses are now suppressed`);
  return { replies: Number(replyCount) || 0, lines: lines.slice(0, 12), autoReplies: Number(autoReplies) || 0 };
}

/** One sentence for the dashboard banner. */
export function noticeHeadline(n) {
  if (!n) return '';
  if (n.type === 'gmail_expired') return 'Gmail access for automatic reply checking expired. Reconnect it in Account.';
  const r = n.replies || 0;
  return r > 0 ? `While you were away: ${r} new repl${r === 1 ? 'y' : 'ies'}.` : 'While you were away: some updates.';
}
