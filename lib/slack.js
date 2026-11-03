// lib/slack.js - Slack alerts for the events the app already emits (hot replies, enquiries, bookings, payments, accepted quotes).
// The owner pastes an incoming-webhook URL once (Account); nothing else is needed on the server. Pure helpers.
const SLACK_RE = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{8,200}$/;

export function isSlackWebhook(url) {
  return typeof url === 'string' && SLACK_RE.test(url.trim());
}

const LABEL = {
  'quote.accepted': 'Quote accepted',
  'payment.received': 'Payment received',
  'booking.requested': 'Booking requested',
  'booking.confirmed': 'Booking confirmed',
  'reply.hot': 'Hot reply',
  'enquiry.received': 'New enquiry',
};

/** One short line for the event. Only fields the event already carries; nothing is looked up. */
export function slackText(event, data = {}) {
  const label = LABEL[event];
  if (!label) return null;
  const who = String(data.name || data.businessName || data.email || '').slice(0, 120);
  const amount = data.amount !== undefined && data.amount !== null && data.amount !== '' ? ` (${String(data.amount).slice(0, 30)})` : '';
  const detail = String(data.summary || data.detail || '').replace(/\s+/g, ' ').slice(0, 200);
  return [label + (who ? `: ${who}` : '') + amount, detail].filter(Boolean).join(' - ');
}
