// lib/server/notify-owner.js - the webhook message the Python worker used to send ("Run it on my computer" finished), now sent by the server.
// Slack and Discord read a JSON body; ntfy reads plain text with a Title header. The address is checked again before every send
// (no private or local addresses), and a failed send never breaks the search that caused it.
import { assertPublicUrl, defaultCtx } from './lead-finder-io.js';

const TIMEOUT_MS = 15000;

/** The message for one finished queued search. Plain words, no ids. */
export function queueNoticeText(request, result) {
  const where = request.location ? `${request.query} in ${request.location}` : String(request.query || 'a search');
  if (result.status === 'failed') return { title: 'Lead search did not finish', text: `${where}: ${result.note || 'the search stopped.'}` };
  return { title: 'Lead search finished', text: `${where}: ${result.added || 0} added to your Lead Inbox, ${result.skipped || 0} already known.` };
}

/** Send one message. Returns { sent, status } or { sent: false, reason }. Never throws. */
export async function sendNotice(url, { title, text }) {
  if (!url) return { sent: false, reason: 'no address set' };
  try {
    await assertPublicUrl(url, defaultCtx());
    const ntfy = new URL(url).hostname.includes('ntfy');
    const res = await fetch(url, {
      method: 'POST',
      headers: ntfy ? { 'Content-Type': 'text/plain', Title: title } : { 'Content-Type': 'application/json' },
      body: ntfy ? text : JSON.stringify({ text: `${title}\n${text}`, content: `**${title}**\n${text}` }),
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { sent: res.ok, status: res.status };
  } catch (e) {
    return { sent: false, reason: String(e?.message || 'could not send').slice(0, 120) };
  }
}
