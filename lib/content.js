// lib/content.js - pure logic for the inbound content planner (/content).
// The AI drafts and schedules posts; the owner posts them with one tap and logs how they did. Nothing here talks to a
// social network: each network needs its own approved developer app, so posting stays a deliberate human step.

export const PLATFORMS = [
  { id: 'linkedin', label: 'LinkedIn', open: 'https://www.linkedin.com/feed/', maxChars: 3000, maxTags: 3 },
  { id: 'instagram', label: 'Instagram', open: 'https://www.instagram.com/', maxChars: 2200, maxTags: 8 },
  { id: 'facebook', label: 'Facebook', open: 'https://www.facebook.com/', maxChars: 2000, maxTags: 5 },
  { id: 'tiktok', label: 'TikTok', open: 'https://www.tiktok.com/upload', maxChars: 1500, maxTags: 6 },
  { id: 'x', label: 'X (Twitter)', open: 'https://x.com/compose/post', maxChars: 280, maxTags: 2 },
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
    const body = multiLine(item?.body, cfg.maxChars + 1);
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

// ---- analytics ----
const hasResults = (p) => p.status === 'posted' && !!sanitizeResults(p.results);
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

function groupStats(posts, keyFn, labelFn) {
  const map = new Map();
  for (const p of posts.filter(hasResults)) {
    const k = keyFn(p);
    const row = map.get(k) || { key: k, label: labelFn(k), posts: 0, leads: 0, engagement: 0, reach: 0 };
    const r = sanitizeResults(p.results);
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

/** Everything the /content page and "Do this next" need. `today` = "YYYY-MM-DD". */
export function summarizeContent(posts = [], today = localDateStr()) {
  const list = posts.filter((p) => p && p.platform);
  const weekStart = addDays(today, -6); // the last 7 days including today
  const open = list.filter((p) => p.status === 'scheduled' && isDateStr(p.scheduledFor));
  const dueToday = open.filter((p) => p.scheduledFor === today);
  const overdue = open.filter((p) => p.scheduledFor < today);
  const next7 = open.filter((p) => p.scheduledFor > today && p.scheduledFor <= addDays(today, 7));
  const posted = list.filter((p) => p.status === 'posted');
  const postedThisWeek = posted.filter((p) => isDateStr(p.postedOn) && p.postedOn >= weekStart && p.postedOn <= today);
  const withResults = posted.filter(hasResults);

  const byPlatform = groupStats(list, (p) => p.platform, platformLabel);
  const byPillar = groupStats(list, (p) => p.pillar || 'educate', pillarLabel);
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
    totalLeads: withResults.reduce((a, p) => a + (sanitizeResults(p.results).leads || 0), 0),
    avgReach: Math.round(avg(withResults.map((p) => sanitizeResults(p.results).reach || 0))),
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
export function performanceHint(posts, today) {
  const s = summarizeContent(posts, today);
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

// Platforms where a link inside the post is clickable. Instagram and TikTok posts are not: their link lives in the bio.
export const LINK_PLATFORMS = ['linkedin', 'facebook', 'x'];
const X_LINK_COST = 23; // X counts every link as 23 characters

/**
 * Add the owner's tagged enquiry link to a post, so an enquiry it brings is credited to THIS platform in Business Value.
 * @returns {{text:string, mode:'inline'|'bio'|'present'|'too_long'}}  bio = this platform cannot click links in posts (use the bio);
 *          present = the link is already in the text; too_long = it would not fit (X): leave the post as it is.
 */
export function withEnquiryLink(body, link, platformId) {
  const text = String(body || '').trimEnd();
  if (!link) return { text, mode: 'bio' };
  if (!LINK_PLATFORMS.includes(platformId)) return { text, mode: 'bio' };
  if (text.includes(link)) return { text, mode: 'present' };
  const sep = platformId === 'x' ? '\n' : '\n\nEnquire here: ';
  const out = `${text}${sep}${link}`;
  if (platformId === 'x') {
    const counted = text.length + 1 + X_LINK_COST;
    return counted <= 280 ? { text: out, mode: 'inline' } : { text, mode: 'too_long' };
  }
  return { text: out, mode: 'inline' };
}
