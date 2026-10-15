// lib/content.js - pure logic for the inbound content planner (/content).
// The AI drafts and schedules posts; the owner posts them with one tap and logs how they did. Nothing here talks to a
// social network: each network needs its own approved developer app, so posting stays a deliberate human step.

import { normalizeSrc } from './inbound.js';

// link: 'inline' = a pasted web address is clickable in the post; 'bio' = captions do not make links clickable, so the post says
// "link in bio" and the owner sets the tagged link as their profile link once.
export const PLATFORMS = [
  { id: 'linkedin', label: 'LinkedIn', open: 'https://www.linkedin.com/feed/', maxChars: 3000, maxTags: 3, link: 'inline' },
  { id: 'instagram', label: 'Instagram', open: 'https://www.instagram.com/', maxChars: 2200, maxTags: 8, link: 'bio' },
  { id: 'facebook', label: 'Facebook', open: 'https://www.facebook.com/', maxChars: 2000, maxTags: 5, link: 'inline' },
  { id: 'tiktok', label: 'TikTok', open: 'https://www.tiktok.com/upload', maxChars: 1500, maxTags: 6, link: 'bio' },
  { id: 'x', label: 'X (Twitter)', open: 'https://x.com/compose/post', maxChars: 280, maxTags: 2, link: 'inline' },
];
export const PILLARS = [
  { id: 'educate', label: 'Teach something useful' },
  { id: 'offer', label: 'Show what you offer' },
  { id: 'story', label: 'Behind the scenes / your story' },
  { id: 'engage', label: 'Ask your audience' },
  { id: 'proof', label: 'Results & customer stories' },
];
export const POST_STATUS = ['scheduled', 'posted', 'skipped'];

export const MIN_PER_GROUP = 3; // posts with logged results needed before a platform / theme is called "best"
export const MIN_POSTS_TO_LEARN = 5; // posts with results before the AI is told what works

const platformOf = (id) => PLATFORMS.find((p) => p.id === id) || null;
export const platformLabel = (id) => platformOf(id)?.label || id;
export const platformUrl = (id) => platformOf(id)?.open || '';
export const pillarLabel = (id) => PILLARS.find((p) => p.id === id)?.label || 'Other';

// ---- dates: plain "YYYY-MM-DD" in the owner's own timezone (no timezone arithmetic bugs) ----
export function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(dateStr, n) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return localDateStr(new Date(y, m - 1, d + n)); // noon-free local calendar math: DST safe because only the date is used
}
export const isDateStr = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(`${v}T00:00:00`));

// ---- text cleaning ----
const oneLine = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const multiLine = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
export const hasPlaceholders = (body) => /\[[^\]\n]{3,80}\]/.test(String(body || ''));

function cleanHashtags(list, max) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const tag = String(raw || '').replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 40);
    if (tag.length >= 2 && !out.includes(`#${tag}`)) out.push(`#${tag}`);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * The AI's JSON -> posts that are safe to store and show. Unknown platforms/themes and over-length X posts are dropped,
 * empty bodies are dropped, dates are offsets from today (0..13). The AI's answer is never trusted as is.
 */
export function validateAiPlan(data, { platforms, count = 5, today } = {}) {
  const allowed = new Set((platforms && platforms.length ? platforms : PLATFORMS.map((p) => p.id)).filter((id) => platformOf(id)));
  const out = [];
  for (const item of Array.isArray(data?.posts) ? data.posts : []) {
    const platform = String(item?.platform || '').toLowerCase().trim();
    if (!allowed.has(platform)) continue;
    const cfg = platformOf(platform);
    // The AI never invents web addresses: any it writes are removed (the app adds the owner's real, tagged enquiry link later).
    const body = multiLine(String(item?.body ?? '').replace(/(https?:\/\/|www\.)\S+/gi, '').replace(/[ \t]{2,}/g, ' '), cfg.maxChars + 1);
    if (body.length < 20 || body.length > cfg.maxChars) continue; // too short to be a post, or would be cut off by the network
    const pillar = PILLARS.some((p) => p.id === item?.pillar) ? item.pillar : 'educate';
    const offset = Math.min(13, Math.max(0, Math.round(Number(item?.dayOffset)) || 0));
    out.push({
      platform,
      pillar,
      body,
      hashtags: cleanHashtags(item?.hashtags, cfg.maxTags),
      visual: oneLine(item?.visual, 300),
      scheduledFor: today ? addDays(today, offset) : null,
      status: 'scheduled',
      source: 'ai',
    });
    if (out.length >= count) break;
  }
  return out;
}

/** Results are whole numbers >= 0; anything else is treated as "not logged". */
export function sanitizeResults(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const n = (v) => {
    const x = Math.round(Number(v));
    return Number.isFinite(x) && x >= 0 && x <= 1e9 ? x : null;
  };
  const out = { reach: n(raw.reach), engagement: n(raw.engagement), leads: n(raw.leads) };
  return out.reach === null && out.engagement === null && out.leads === null ? null : out;
}

// ---- enquiry links: the tagged link that ties a post to the enquiries it brings ----
const KEY_RE = /^[A-Za-z0-9_-]{6,128}\.[a-f0-9]{48}$/; // the owner's enquiry key: "<uid>.<secret>" (see lib/server/ingest-key.js)
export const DEFAULT_CTA = 'Questions, or want to work together? Send us an enquiry:';
export const BIO_CTA = 'Questions, or want to work together? Send us an enquiry: the link is in our bio.';
export const MAX_CTA = 120;
const URL_G = /(https?:\/\/|www\.)\S+/gi;

export const linkMode = (platform) => platformOf(platform)?.link || 'inline';
/** The channel tag a platform's links carry. Platform ids are already valid tags, and lib/inbound.js knows their names. */
export const platformSrc = (platform) => (platformOf(platform) ? normalizeSrc(platform) : '');
/** One campaign tag per post, so each post's own enquiries can be counted. */
export const postCampaign = (postId) => (postId ? normalizeSrc(`p-${postId}`).slice(0, 60) : '');
export const cleanCta = (v) => oneLine(String(v ?? '').replace(URL_G, ''), MAX_CTA);

/** https://<app>/enquire?k=<key>&src=<platform>[&c=<campaign>] or '' when the address or key cannot be trusted. */
export function buildContentLink({ origin, key, platform, campaign } = {}) {
  const base = String(origin || '').replace(/\/+$/, '');
  const okOrigin = /^https:\/\/[^\s/]+$/.test(base) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(base); // http only on the owner's own computer
  const src = platformSrc(platform);
  if (!okOrigin || !KEY_RE.test(String(key || '')) || !src) return '';
  const c = normalizeSrc(campaign).slice(0, 60);
  return `${base}/enquire?k=${encodeURIComponent(key)}&src=${src}${c ? `&c=${c}` : ''}`;
}

/** Length as the network counts it: on X every web address counts as 23 characters, wherever it is and however long. */
export function postLength(platform, text) {
  const t = String(text || '');
  return platform === 'x' ? t.replace(URL_G, 'x'.repeat(23)).length : t.length;
}
const withTags = (body, hashtags) => `${body}${hashtags?.length ? `\n\n${hashtags.join(' ')}` : ''}`;

/** True when the post already carries an enquiry link (inline) or the link-in-bio line (bio platforms). */
export function hasEnquiryCta(body, platform) {
  const b = String(body || '');
  return /\/enquire\?k=/.test(b) || (linkMode(platform) === 'bio' && /link (is )?in (our |my |the )?bio/i.test(b));
}

/**
 * Adds the call to action to a post. Deterministic (no AI, no cost, never invents anything).
 * inline platform -> "<CTA> <tagged link>" at the end; bio platform -> a "link in bio" line (the link itself is returned, to set once as the profile link).
 * @returns {{added:boolean, body:string, link:string, mode:'inline'|'bio', campaign:string, reason?:'no_key'|'already'|'too_long'}}
 */
export function addEnquiryCta(post, { origin, key, cta } = {}) {
  const platform = post?.platform;
  const cfg = platformOf(platform);
  const body = String(post?.body ?? '');
  const mode = linkMode(platform);
  const none = (reason) => ({ added: false, body, link: '', mode, campaign: '', reason });
  if (!cfg) return none('no_key');
  if (hasEnquiryCta(body, platform)) return none('already');
  const campaign = mode === 'inline' ? postCampaign(post?.id) : '';
  const link = buildContentLink({ origin, key, platform, campaign });
  if (!link) return none('no_key');
  const line = cleanCta(cta);
  const options = mode === 'inline'
    ? [`${line || DEFAULT_CTA} ${link}`, link]
    : [line ? `${line} (link in bio)` : BIO_CTA, 'Link in bio.'];
  for (const text of options) {
    const next = `${body.replace(/\s+$/, '')}\n\n${text}`;
    if (postLength(platform, withTags(next, post?.hashtags)) <= cfg.maxChars) return { added: true, body: next, link, mode, campaign };
  }
  return { ...none('too_long'), link, campaign };
}

// ---- analytics ----
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

/** Enquiries received through each post's own link: Map(campaign tag -> count). */
export function trackedByPost(enquiries = []) {
  const m = new Map();
  for (const e of Array.isArray(enquiries) ? enquiries : []) {
    const c = normalizeSrc(e?.campaign);
    if (c) m.set(c, (m.get(c) || 0) + 1);
  }
  return m;
}

/**
 * Enquiries per platform from the tagged links (any post, any bio link), optionally only those received since `sinceMs`.
 * @returns {Array<{platform:string,label:string,enquiries:number}>} only platforms with at least one, most first
 */
export function enquiriesByPlatform(enquiries = [], sinceMs = 0) {
  const m = new Map();
  for (const e of Array.isArray(enquiries) ? enquiries : []) {
    const at = Date.parse(e?.receivedAt || '');
    if (sinceMs && !(at >= sinceMs)) continue;
    const id = PLATFORMS.find((p) => platformSrc(p.id) === normalizeSrc(e?.src))?.id;
    if (id) m.set(id, (m.get(id) || 0) + 1);
  }
  return [...m.entries()].map(([platform, enquiries]) => ({ platform, label: platformLabel(platform), enquiries })).sort((a, b) => b.enquiries - a.enquiries);
}

/**
 * The results a post is judged on: what the owner logged, but never fewer enquiries than the post's own link counted.
 * A posted post whose link brought enquiries counts as "has results" even if the owner never typed numbers in.
 */
export function effectiveResults(p, tracked) {
  const base = sanitizeResults(p?.results);
  const t = p?.linkCampaign && tracked instanceof Map ? tracked.get(normalizeSrc(p.linkCampaign)) || 0 : 0;
  if (!t) return base;
  if (base) return { ...base, leads: Math.max(base.leads || 0, t) };
  return p.status === 'posted' ? { reach: null, engagement: null, leads: t } : null;
}
const hasResults = (p, tracked) => p.status === 'posted' && !!effectiveResults(p, tracked);

function groupStats(posts, keyFn, labelFn, tracked) {
  const map = new Map();
  for (const p of posts.filter((x) => hasResults(x, tracked))) {
    const k = keyFn(p);
    const row = map.get(k) || { key: k, label: labelFn(k), posts: 0, leads: 0, engagement: 0, reach: 0 };
    const r = effectiveResults(p, tracked);
    row.posts += 1;
    row.leads += r.leads || 0;
    row.engagement += r.engagement || 0;
    row.reach += r.reach || 0;
    map.set(k, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, avgLeads: r.leads / r.posts, avgEngagement: r.engagement / r.posts, engagementRate: r.reach > 0 ? r.engagement / r.reach : null }))
    .sort((a, b) => b.avgLeads - a.avgLeads || b.avgEngagement - a.avgEngagement);
}

/** Everything the /content page and "Do this next" need. `today` = "YYYY-MM-DD"; `tracked` = trackedByPost(...) (optional). */
export function summarizeContent(posts = [], today = localDateStr(), tracked = new Map()) {
  const list = posts.filter((p) => p && p.platform);
  const weekStart = addDays(today, -6); // the last 7 days including today
  const open = list.filter((p) => p.status === 'scheduled' && isDateStr(p.scheduledFor));
  const dueToday = open.filter((p) => p.scheduledFor === today);
  const overdue = open.filter((p) => p.scheduledFor < today);
  const next7 = open.filter((p) => p.scheduledFor > today && p.scheduledFor <= addDays(today, 7));
  const posted = list.filter((p) => p.status === 'posted');
  const postedThisWeek = posted.filter((p) => isDateStr(p.postedOn) && p.postedOn >= weekStart && p.postedOn <= today);
  const withResults = posted.filter((p) => hasResults(p, tracked));

  const byPlatform = groupStats(list, (p) => p.platform, platformLabel, tracked);
  const byPillar = groupStats(list, (p) => p.pillar || 'educate', pillarLabel, tracked);
  // A leader is only named when at least two groups have enough data to compare: otherwise it is noise.
  const rated = (rows) => rows.filter((r) => r.posts >= MIN_PER_GROUP);
  const best = (rows) => (rated(rows).length >= 2 && rated(rows)[0].avgLeads + rated(rows)[0].avgEngagement > 0 ? rated(rows)[0] : null);

  return {
    total: list.length,
    dueToday: dueToday.length,
    overdue: overdue.length,
    scheduledNext7: next7.length + dueToday.length + overdue.length,
    postedThisWeek: postedThisWeek.length,
    postedTotal: posted.length,
    withResults: withResults.length,
    totalLeads: withResults.reduce((a, p) => a + (effectiveResults(p, tracked).leads || 0), 0),
    avgReach: Math.round(avg(withResults.map((p) => effectiveResults(p, tracked).reach || 0))),
    byPlatform,
    byPillar,
    bestPlatform: best(byPlatform),
    bestPillar: best(byPillar),
    needsMoreData: withResults.length < MIN_POSTS_TO_LEARN,
  };
}

/**
 * What the AI is allowed to learn from past posts: only ids from the fixed lists, never post text or names.
 * null until there is enough data (so a couple of lucky posts do not steer the whole plan).
 */
export function performanceHint(posts, today, tracked) {
  const s = summarizeContent(posts, today, tracked);
  if (s.withResults < MIN_POSTS_TO_LEARN) return null;
  const hint = {};
  if (s.bestPlatform && PLATFORMS.some((p) => p.id === s.bestPlatform.key)) hint.bestPlatform = s.bestPlatform.key;
  if (s.bestPillar && PILLARS.some((p) => p.id === s.bestPillar.key)) hint.bestPillar = s.bestPillar.key;
  return Object.keys(hint).length ? hint : null;
}

/** Inputs for the "Do this next" list. */
export function contentActionInfo(posts = [], today = localDateStr()) {
  const s = summarizeContent(posts, today);
  return { dueToday: s.dueToday, overdue: s.overdue, scheduledNext7: s.scheduledNext7, total: s.total };
}

/** Calendar grouping for the page: overdue, today, upcoming (by date), then done. */
export function groupPosts(posts = [], today = localDateStr()) {
  const byDate = (a, b) => String(a.scheduledFor).localeCompare(String(b.scheduledFor));
  const open = posts.filter((p) => p.status === 'scheduled');
  return {
    overdue: open.filter((p) => isDateStr(p.scheduledFor) && p.scheduledFor < today).sort(byDate),
    today: open.filter((p) => p.scheduledFor === today),
    upcoming: open.filter((p) => !isDateStr(p.scheduledFor) || p.scheduledFor > today).sort(byDate),
    done: posts.filter((p) => p.status !== 'scheduled').sort((a, b) => String(b.postedOn || b.scheduledFor).localeCompare(String(a.postedOn || a.scheduledFor))),
  };
}
