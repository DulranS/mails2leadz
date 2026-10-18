import assert from 'node:assert/strict';
import { validateAiPlan, sanitizeResults, summarizeContent, performanceHint, contentActionInfo, groupPosts, addDays, localDateStr, isDateStr, hasPlaceholders, PLATFORMS, composeUrl, composePrefills } from '../lib/content.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const TODAY = '2026-10-13';

t('date helpers: local calendar math, month/year/DST boundaries', () => {
  assert.equal(addDays('2026-10-13', 7), '2026-10-20');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-03-28', 2), '2026-03-30'); // across a DST change in many zones
  assert.equal(localDateStr(new Date(2026, 0, 5)), '2026-01-05');
  assert.ok(isDateStr('2026-10-13') && !isDateStr('13/10/2026') && !isDateStr('2026-13-45') && !isDateStr(undefined));
});

const body = (c = 'x') => `A useful tip for your customers: ${c.repeat(30)}`;
t('AI plan: unknown platform, short, over-length X, bad themes and hostile hashtags are handled', () => {
  const posts = validateAiPlan({ posts: [
    { platform: 'LinkedIn', pillar: 'educate', dayOffset: 1, body: body(), hashtags: ['#Sales', 'Growth', 'a', 'b c!', 'x'.repeat(100), '##Extra'], visual: '  A clean\n photo of a desk ' },
    { platform: 'myspace', body: body() },
    { platform: 'instagram', body: 'too short' },
    { platform: 'x', body: 'y'.repeat(300) },
    { platform: 'x', pillar: 'weird', dayOffset: 99, body: body('z').slice(0, 120) },
    { platform: 'facebook', pillar: 'engage', dayOffset: -4, body: body('q') },
    null, 'junk',
  ] }, { platforms: ['linkedin', 'x', 'facebook'], count: 5, today: TODAY });
  assert.deepEqual(posts.map((p) => p.platform), ['linkedin', 'x', 'facebook']);
  assert.equal(posts[0].scheduledFor, '2026-10-14');
  assert.ok(posts[0].hashtags.length <= 3 && posts[0].hashtags.every((h) => /^#[\p{L}\p{N}_]{2,40}$/u.test(h)));
  assert.equal(posts[0].visual, 'A clean photo of a desk');
  assert.equal(posts[1].pillar, 'educate');          // unknown theme falls back
  assert.equal(posts[1].scheduledFor, '2026-10-26'); // 99 clamps to 13 days
  assert.equal(posts[2].scheduledFor, TODAY);        // negative clamps to today
  assert.ok(posts.every((p) => p.status === 'scheduled' && p.source === 'ai'));
});
t('AI plan: respects the count and survives garbage', () => {
  const many = { posts: Array.from({ length: 10 }, (_, i) => ({ platform: 'linkedin', dayOffset: i, body: body(String(i)) })) };
  assert.equal(validateAiPlan(many, { platforms: ['linkedin'], count: 3, today: TODAY }).length, 3);
  for (const bad of [null, undefined, {}, { posts: 'x' }, []]) assert.deepEqual(validateAiPlan(bad, { today: TODAY }), []);
});
t('placeholders the owner must fill in are detected', () => {
  assert.ok(hasPlaceholders('We helped a client [add your real example] last month.'));
  assert.ok(!hasPlaceholders('Plain text with [] and [a] only.'));
});
t('results: whole numbers >= 0 only', () => {
  assert.deepEqual(sanitizeResults({ reach: '120', engagement: 4.6, leads: 1 }), { reach: 120, engagement: 5, leads: 1 });
  assert.deepEqual(sanitizeResults({ reach: -5, engagement: 'abc', leads: 2 }), { reach: null, engagement: null, leads: 2 });
  assert.equal(sanitizeResults({ reach: 'x' }), null);
  assert.equal(sanitizeResults(null), null);
});

const post = (o) => ({ platform: 'linkedin', pillar: 'educate', status: 'scheduled', scheduledFor: TODAY, ...o });
t('summary: due today / overdue / next 7 days / posted this week', () => {
  const s = summarizeContent([
    post({}), post({ scheduledFor: '2026-10-10' }), post({ scheduledFor: '2026-10-15' }), post({ scheduledFor: '2026-10-30' }),
    post({ status: 'posted', postedOn: '2026-10-12' }), post({ status: 'posted', postedOn: '2026-10-01' }), post({ status: 'skipped' }),
  ], TODAY);
  assert.equal(s.dueToday, 1);
  assert.equal(s.overdue, 1);
  assert.equal(s.scheduledNext7, 3);
  assert.equal(s.postedThisWeek, 1);
  assert.equal(s.postedTotal, 2);
  assert.deepEqual(contentActionInfo([post({})], TODAY), { dueToday: 1, overdue: 0, scheduledNext7: 1, total: 1 });
});

const done = (platform, pillar, leads, engagement = 10, reach = 100) => post({ platform, pillar, status: 'posted', postedOn: TODAY, results: { reach, engagement, leads } });
t('analytics: too early to call with little data, then names a leader only with enough posts in 2+ groups', () => {
  assert.equal(summarizeContent([done('linkedin', 'educate', 2), done('instagram', 'offer', 0)], TODAY).bestPlatform, null);
  const rich = [
    done('linkedin', 'educate', 3), done('linkedin', 'educate', 2), done('linkedin', 'offer', 4),
    done('instagram', 'offer', 0), done('instagram', 'offer', 1), done('instagram', 'educate', 0),
  ];
  const s = summarizeContent(rich, TODAY);
  assert.equal(s.withResults, 6);
  assert.equal(s.totalLeads, 10);
  assert.equal(s.bestPlatform.key, 'linkedin');
  assert.equal(s.bestPlatform.posts, 3);
  assert.equal(s.needsMoreData, false);
  // only ONE group with enough data -> no leader
  assert.equal(summarizeContent([done('linkedin', 'educate', 3), done('linkedin', 'educate', 2), done('linkedin', 'educate', 4), done('x', 'educate', 9), done('x', 'educate', 9)], TODAY).bestPlatform, null);
});
t('AI hint contains only ids from the fixed lists, and only once there is enough data', () => {
  assert.equal(performanceHint([done('linkedin', 'educate', 3)], TODAY), null);
  const rich = [done('linkedin', 'educate', 3), done('linkedin', 'educate', 2), done('linkedin', 'educate', 4), done('instagram', 'offer', 0), done('instagram', 'offer', 1), done('instagram', 'offer', 0)];
  const h = performanceHint(rich, TODAY);
  assert.deepEqual(h, { bestPlatform: 'linkedin', bestPillar: 'educate' });
  assert.ok(PLATFORMS.some((p) => p.id === h.bestPlatform));
});
t('calendar grouping', () => {
  const g = groupPosts([post({ scheduledFor: '2026-10-01' }), post({}), post({ scheduledFor: '2026-10-20' }), post({ scheduledFor: '2026-10-14' }), post({ status: 'posted', postedOn: TODAY })], TODAY);
  assert.equal(g.overdue.length, 1); assert.equal(g.today.length, 1); assert.equal(g.done.length, 1);
  assert.deepEqual(g.upcoming.map((p) => p.scheduledFor), ['2026-10-14', '2026-10-20']);
});
t('post now: X and LinkedIn open with the text filled in; others just open; too long falls back to the plain page', () => {
  const x = composeUrl('x', 'Hello & welcome #1');
  assert.equal(x, 'https://x.com/intent/post?text=Hello%20%26%20welcome%20%231');
  assert.ok(composeUrl('linkedin', 'Short post').startsWith('https://www.linkedin.com/feed/?shareActive=true&text=Short%20post'));
  assert.equal(composeUrl('x', 'a'.repeat(281)), 'https://x.com/compose/post'); // over X's limit
  assert.equal(composeUrl('linkedin', 'é'.repeat(2000)), 'https://www.linkedin.com/feed/'); // would not fit in a link
  assert.equal(composeUrl('instagram', 'text'), 'https://www.instagram.com/');
  assert.equal(composeUrl('x', '   '), 'https://x.com/compose/post');
  assert.deepEqual(['x', 'linkedin', 'facebook', 'tiktok', 'instagram'].map(composePrefills), [true, true, false, false, false]);
});
console.log(`\n${n} content tests ok`);
