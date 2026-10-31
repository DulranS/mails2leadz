// lib/server/voice-agent.js - the AI phone assistant, as pure logic. Each turn: Twilio speaks, listens, and posts what was heard;
// the AI writes the next reply; we answer with TwiML. Rules that cannot be configured away:
//  - it says at the start that it is an automated assistant, and says so again if asked;
//  - it stops and records an opt-out the moment the person asks not to be called;
//  - it only calls people with recorded voice consent, inside calling hours, within a daily cap (see the route);
//  - it never quotes prices or makes promises; anything outside its purpose goes to a person at the business.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const MAX_TURNS = 6;
export const CALL_HOURS = { from: 9, to: 18 }; // local time, the owner's time zone
export const DEFAULT_DAILY_CAP = 20;

const key = (env = process.env) => env.PAY_SECRET || env.UNSUBSCRIBE_SECRET || env.WEBHOOK_SECRET || '';
const sign = (payload, k) => createHmac('sha256', k).update(payload).digest('base64url');

export function signVoiceToken(uid, callId, k = key()) {
  if (!k || !uid || !callId) return null;
  const payload = Buffer.from(JSON.stringify({ u: String(uid), c: String(callId) })).toString('base64url');
  return `${payload}.${sign(payload, k)}`;
}

/** @returns {{uid:string,callId:string}|null} */
export function verifyVoiceToken(token, k = key()) {
  try {
    if (!k || typeof token !== 'string' || token.length > 600) return null;
    const [payload, sig, extra] = token.split('.');
    if (!payload || !sig || extra !== undefined) return null;
    const expected = Buffer.from(sign(payload, k), 'base64url');
    const given = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const { u, c } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return u && c ? { uid: String(u), callId: String(c) } : null;
  } catch {
    return null;
  }
}

const XML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
export const escapeXml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => XML[c]);

/** TwiML for one turn: speak, then listen (speech) and post back to gatherAction. Or speak and hang up. */
export function buildTwiml({ say, gatherAction = '', hangup = false }) {
  const head = '<?xml version="1.0" encoding="UTF-8"?><Response>';
  if (hangup || !gatherAction) return `${head}<Say>${escapeXml(say)}</Say><Hangup/></Response>`;
  return `${head}<Gather input="speech" action="${escapeXml(gatherAction)}" method="POST" speechTimeout="auto" timeout="6"><Say>${escapeXml(say)}</Say></Gather>`
    + `<Say>I did not catch that. Thank you for your time. Goodbye.</Say><Hangup/></Response>`;
}

const STOP_RE = /\b(stop calling|stop the calls?|don'?t call|do not call|remove me|take me off|no more calls|unsubscribe)\b/i;
export const wantsStop = (text) => STOP_RE.test(String(text || ''));

/** Local-time window check. tzOffsetMin is minutes east of UTC. */
export function withinCallingHours(nowMs, tzOffsetMin = 0, { from = CALL_HOURS.from, to = CALL_HOURS.to } = {}) {
  const hour = new Date(nowMs + Number(tzOffsetMin || 0) * 60000).getUTCHours();
  return hour >= from && hour < to;
}

export function greetingFor({ business, purpose }) {
  return `Hello, this is an automated assistant calling for ${business} about ${purpose}. This call may be written down for the business's records. Is now an okay time to talk? You can say stop calling at any time.`;
}

export function systemPromptFor({ business, purpose }) {
  return `You are an automated phone assistant for ${business}. You are an AI, not a person: if asked, say so plainly.
Your only job is this purpose: ${purpose}.
Rules: reply in at most two short sentences, in plain speech with no lists or symbols. Never invent prices, dates, discounts, availability or promises. Never ask for card or bank details. Never give legal, medical or financial advice. If the person asks about anything outside the purpose, say that a person from ${business} will follow up. If they ask not to be called, say you will remove them and say goodbye.
Reply with the words to speak only.`;
}

export const fallbackLine = (business) => `Thank you. A person from ${business} will follow up with you. Goodbye.`;
export const stopLine = (business) => `Understood. You will not be called again. Thank you, goodbye from ${business}.`;
export const endLine = (business) => `Thank you for your time. A person from ${business} may follow up. Goodbye.`;
