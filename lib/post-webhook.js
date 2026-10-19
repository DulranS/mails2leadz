// lib/post-webhook.js - automatic posting WITHOUT a developer app per social network: the due posts are handed to a webhook the owner controls
// (a Zapier / Make / Buffer / n8n "catch hook" that publishes to LinkedIn, Facebook, Instagram, X...). Those tools already hold the approved
// network connections, so we need none. Pure functions (no network, no Firebase): tested.
import { hasPlaceholders, withEnquiryLink, isDateStr, addDays, platformLabel, PLATFORMS } from './content.js';

export const POSTS_PER_RUN_MAX = 6; // one daily job never posts more than this
export const POST_MAX_OVERDUE_DAYS = 3; // a post older than this is stale: it is left for the owner to decide
export const REVIEW_HOURS = 20; // an AI-drafted post waits this long after it was drafted, so the owner can read it first

/** A webhook address: https only, no spaces, not absurdly long. Anything else becomes '' (off). The server also refuses non-public hosts when it calls it. */
export function sanitizeWebhookUrl(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length > 500 || !/^https:\/\/[^\s]+$/i.test(s)) return '';
  try { const u = new URL(s); return u.username || u.password ? '' : u.toString(); } catch { return ''; }
}

const msOf = (v) => { if (!v) return 0; if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime(); const t = new Date(v).getTime(); return Number.isFinite(t) ? t : 0; };

/**
 * Which posts go out in this run. Scheduled, due today or a few days overdue, with a real body, no unfilled [placeholder], on a known network,
 * and (for AI drafts) old enough that the owner has had a chance to read them. Oldest first, capped.
 * @returns {{ send: Array, held: Array<{post, why}> }}
 */
export function planAutoPosts(posts, today, now = Date.now(), max = POSTS_PER_RUN_MAX) {
  const send = []; const held = [];
  const earliest = addDays(today, -POST_MAX_OVERDUE_DAYS);
  const due = (posts || []).filter((p) => p && p.status === 'scheduled' && isDateStr(p.scheduledFor) && p.scheduledFor <= today);
  due.sort((a, b) => String(a.scheduledFor).localeCompare(String(b.scheduledFor)) || msOf(a.createdAt) - msOf(b.createdAt));
  for (const p of due) {
    const body = String(p.body || '').trim();
    if (!body || !PLATFORMS.some((x) => x.id === p.platform)) { held.push({ post: p, why: 'unusable' }); continue; }
    if (hasPlaceholders(body)) { held.push({ post: p, why: 'placeholder' }); continue; }
    if (p.scheduledFor < earliest) { held.push({ post: p, why: 'stale' }); continue; }
    if (p.autoDrafted && msOf(p.createdAt) && now - msOf(p.createdAt) < REVIEW_HOURS * 3600000) { held.push({ post: p, why: 'review' }); continue; }
    if (send.length >= max) { held.push({ post: p, why: 'cap' }); continue; }
    send.push(p);
  }
  return { send, held };
}

/** What the webhook receives. `text` is ready to publish as is (hashtags and the tagged enquiry link included where the network can use them). */
export function webhookPayload(post, { link = '' } = {}) {
  const withLink = withEnquiryLink(post.body, link, post.platform);
  const tags = Array.isArray(post.hashtags) && post.hashtags.length ? `\n\n${post.hashtags.join(' ')}` : '';
  return {
    event: 'post.due', source: 'autoleads', postId: post.id || '', platform: post.platform, platformLabel: platformLabel(post.platform),
    text: `${withLink.text}${tags}`, body: withLink.text, hashtags: Array.isArray(post.hashtags) ? post.hashtags : [], link: link || '',
    linkInText: withLink.mode === 'inline' || withLink.mode === 'present', visualBrief: String(post.visual || ''), scheduledFor: post.scheduledFor,
  };
}

export const testPayload = () => ({ event: 'test', source: 'autoleads', text: 'This is a test from AutoLeads. If your automation received it, automatic posting is connected. Nothing was posted.', platform: 'linkedin', platformLabel: 'LinkedIn' });
