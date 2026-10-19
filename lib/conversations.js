// lib/conversations.js - "Log a conversation": a reply that came in OUTSIDE email (WhatsApp, SMS, a call, a LinkedIn / Instagram / TikTok message,
// in person) enters the same pipeline as an email reply: the deal moves forward, follow-ups to that person stop, and the exchange is kept.
// Pure functions (no Firebase, no AI): the page does the I/O. The app cannot read those apps, so the owner pastes or types what was said.
import { buildDealWrite, normalizeStage, isClosed } from './deal-utils.js';
import { forwardStage, ruleFor } from './reply-intents.js';

export const CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp' }, { id: 'sms', label: 'SMS' }, { id: 'call', label: 'Phone call' }, { id: 'linkedin', label: 'LinkedIn' },
  { id: 'instagram', label: 'Instagram' }, { id: 'tiktok', label: 'TikTok' }, { id: 'facebook', label: 'Facebook' }, { id: 'in_person', label: 'In person' }, { id: 'other', label: 'Other' },
];
export const channelLabel = (id) => CHANNELS.find((c) => c.id === id)?.label || 'Other';
export const MAX_TEXT = 2000;
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/;

/** Whatever the form sends -> a safe value, or a plain-words error. An email is needed: invoices, follow-ups and the pipeline are keyed by it. */
export function sanitizeConversation(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const email = String(r.email || '').trim().toLowerCase();
  const text = String(r.text || '').replace(/\r\n/g, '\n').trim().slice(0, MAX_TEXT);
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Add their email address (ask for it in your reply): invoices, follow-ups and the pipeline all use it.' };
  if (text.length < 2) return { ok: false, error: 'Type or paste what they said (or what you agreed on the call).' };
  return {
    ok: true,
    value: {
      email, text,
      channel: CHANNELS.some((c) => c.id === r.channel) ? r.channel : 'other',
      businessName: String(r.businessName || '').replace(/\s+/g, ' ').trim().slice(0, 100),
    },
  };
}

/** The stage the deal should get from what was said. Open deals only move forward; "not interested" / "stop" suggests Lost (the owner confirms by saving). */
export function defaultStageFor(existing, intent) {
  const rule = ruleFor(intent);
  if (existing && isClosed(existing.stage)) return normalizeStage(existing.stage); // won or lost: a person decides
  if (rule.stage === 'closed_lost') return 'closed_lost';
  if (existing) return forwardStage(existing.stage, rule.stage) || normalizeStage(existing.stage);
  return rule.stage || 'contacted';
}

/**
 * What saving does. `stage` is what the owner confirmed (default: defaultStageFor). Returns the deal write, whether follow-ups stop,
 * and the log row. A new deal is credited to the channel it came through (source "other", detail = the channel).
 */
export function planConversation({ uid, value, existing = null, stage, intent = 'other', lostReason = '', stopFollowUps = true, summary = '', ownerId, now = new Date() }) {
  const nextStage = normalizeStage(stage ?? defaultStageFor(existing, intent));
  const lost = nextStage === 'closed_lost';
  const write = buildDealWrite({
    uid, email: value.email, existing: existing || undefined, stage: nextStage, businessName: value.businessName || undefined, touch: true,
    lostReason: lost ? (lostReason || (intent === 'unsubscribe' || intent === 'not_interested' ? 'not_interested' : 'other')) : undefined,
    source: 'other', sourceDetail: value.channel, ownerId, now,
  });
  const iso = now.toISOString();
  return {
    write,
    stageChanged: !existing || normalizeStage(existing.stage) !== nextStage,
    stopFollowUps: !!stopFollowUps && intent !== 'out_of_office',
    row: { email: value.email, businessName: value.businessName || existing?.businessName || '', channel: value.channel, text: value.text, intent, summary: String(summary || '').slice(0, 220), stage: nextStage, at: iso },
  };
}
