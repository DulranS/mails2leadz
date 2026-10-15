import assert from 'node:assert/strict';
import { buildContentLink, addEnquiryCta, postLength, hasEnquiryCta, platformSrc, postCampaign, trackedByPost, enquiriesByPlatform, effectiveResults, linkMode, validateAiPlan, sanitizeResults, summarizeContent, performanceHint, contentActionInfo, groupPosts, addDays, localDateStr, isDateStr, hasPlaceholders, PLATFORMS } from '../lib/content.js';

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

// ---- enquiry links in posts (closes the posts -> channel table loop) ----
const KEY = `uid123abc.${'a1b2c3'.repeat(8)}`;
const ORIGIN = 'https://app.example.com';
t('content link: tagged with the platform and the post, and refuses anything it cannot trust', () => {
  assert.equal(buildContentLink({ origin: ORIGIN, key: KEY, platform: 'linkedin', campaign: 'p-Ab12' }), `${ORIGIN}/enquire?k=${KEY}&src=linkedin&c=p-ab12`);
  assert.equal(buildContentLink({ origin: `${ORIGIN}/`, key: KEY, platform: 'x' }), `${ORIGIN}/enquire?k=${KEY}&src=x`);
  assert.ok(buildContentLink({ origin: 'http://localhost:3000', key: KEY, platform: 'facebook' }).startsWith('http://localhost:3000/enquire'));
  for (const bad of [
    { origin: 'http://evil.example', key: KEY, platform: 'x' },          // plain http on a real host
    { origin: 'https://a.com/path', key: KEY, platform: 'x' },           // origin only
    { origin: ORIGIN, key: 'nope', platform: 'x' },                      // not a real key
    { origin: ORIGIN, key: `${KEY}&x=1`, platform: 'x' },                // injection through the key
    { origin: ORIGIN, key: KEY, platform: 'myspace' },
    {}, undefined,
  ]) assert.equal(buildContentLink(bad), '');
  assert.equal(platformSrc('x'), 'x'); assert.equal(postCampaign('AbC_123'), 'p-abc-123'); assert.equal(postCampaign(''), '');
});
t('inline platforms get "<CTA> <link>", bio platforms get a link-in-bio line and no URL', () => {
  const li = addEnquiryCta({ id: 'P1', platform: 'linkedin', body: 'Three tips for your first hire.' }, { origin: ORIGIN, key: KEY });
  assert.ok(li.added && li.mode === 'inline');
  assert.ok(li.body.startsWith('Three tips for your first hire.\n\n') && li.body.endsWith(li.link));
  assert.ok(li.link.includes('src=linkedin&c=p-p1'));
  const ig = addEnquiryCta({ id: 'P2', platform: 'instagram', body: 'A day in the workshop.' }, { origin: ORIGIN, key: KEY });
  assert.ok(ig.added && ig.mode === 'bio');
  assert.ok(!ig.body.includes('http') && /link is in our bio/i.test(ig.body));
  assert.ok(ig.link.includes('src=instagram') && !ig.link.includes('&c='));  // one shared bio link per platform
  const custom = addEnquiryCta({ id: 'P3', platform: 'facebook', body: 'Open Saturday.' }, { origin: ORIGIN, key: KEY, cta: '  Book a visit:\n http://sneaky.example  ' });
  assert.ok(custom.body.includes('Book a visit: ') && !custom.body.includes('sneaky'));
});
t('adding a link is idempotent, needs a key, and respects the platform limit (X counts a link as 23 characters)', () => {
  const once = addEnquiryCta({ id: 'P1', platform: 'linkedin', body: 'Hello there, friends.' }, { origin: ORIGIN, key: KEY });
  assert.equal(addEnquiryCta({ id: 'P1', platform: 'linkedin', body: once.body }, { origin: ORIGIN, key: KEY }).reason, 'already');
  assert.ok(hasEnquiryCta(once.body, 'linkedin') && !hasEnquiryCta('No link here', 'linkedin'));
  assert.equal(addEnquiryCta({ id: 'P1', platform: 'instagram', body: 'Caption. Link in bio!' }, { origin: ORIGIN, key: KEY }).reason, 'already');
  assert.equal(addEnquiryCta({ id: 'P1', platform: 'linkedin', body: 'Hello there, friends.' }, { origin: ORIGIN, key: '' }).reason, 'no_key');
  assert.equal(addEnquiryCta({ platform: 'myspace', body: 'x'.repeat(30) }, { origin: ORIGIN, key: KEY }).reason, 'no_key');
  assert.equal(postLength('x', `hi ${ORIGIN}/enquire?k=${KEY}&src=x`), 3 + 23);
  assert.equal(postLength('linkedin', 'hi http://a.co'), 'hi http://a.co'.length);
  const room = addEnquiryCta({ id: 'P4', platform: 'x', body: 'y'.repeat(200), hashtags: ['#a1'] }, { origin: ORIGIN, key: KEY });
  assert.ok(room.added && postLength('x', `${room.body}\n\n#a1`) <= 280);                // fits because the link counts 23, not its real ~100
  assert.ok(room.body.endsWith(room.link) && !room.body.includes('Questions'));          // the long CTA did not fit, the bare link did
  const full = addEnquiryCta({ id: 'P5', platform: 'x', body: 'z'.repeat(270) }, { origin: ORIGIN, key: KEY });
  assert.ok(!full.added && full.reason === 'too_long' && full.body === 'z'.repeat(270));
});
t('the AI can never put its own web addresses into a post', () => {
  const [p] = validateAiPlan({ posts: [{ platform: 'linkedin', body: 'Read more at https://totally-made-up.example/offer today or www.fake.com now, friends.' }] }, { platforms: ['linkedin'], today: TODAY });
  assert.ok(p && !/http|www\./i.test(p.body) && /Read more at/.test(p.body));
});
t('enquiries counted per post and per platform from the tagged links', () => {
  const enq = [
    { src: 'linkedin', campaign: 'p-a1', receivedAt: '2026-10-10T08:00:00Z' }, { src: 'linkedin', campaign: 'p-a1', receivedAt: '2026-10-11T08:00:00Z' },
    { src: 'instagram', campaign: '', receivedAt: '2026-10-12T08:00:00Z' }, { src: 'website', receivedAt: '2026-10-12T09:00:00Z' }, { src: 'linkedin', campaign: 'p-b2', receivedAt: '2026-08-01T00:00:00Z' }, null,
  ];
  const t1 = trackedByPost(enq);
  assert.equal(t1.get('p-a1'), 2); assert.equal(t1.get('p-b2'), 1); assert.equal(t1.size, 2);
  assert.deepEqual(enquiriesByPlatform(enq).map((r) => [r.platform, r.enquiries]), [['linkedin', 3], ['instagram', 1]]);
  assert.deepEqual(enquiriesByPlatform(enq, Date.parse('2026-10-01T00:00:00Z')).map((r) => [r.platform, r.enquiries]), [['linkedin', 2], ['instagram', 1]]);
  assert.deepEqual(enquiriesByPlatform(null), []);
});
t('a post is judged on the larger of logged and link-counted enquiries; unposted posts never count', () => {
  const tr = new Map([['p-a1', 3]]);
  assert.deepEqual(effectiveResults({ status: 'posted', linkCampaign: 'p-a1', results: { reach: 100, engagement: 5, leads: 1 } }, tr), { reach: 100, engagement: 5, leads: 3 });
  assert.deepEqual(effectiveResults({ status: 'posted', linkCampaign: 'p-a1', results: { reach: 100, engagement: 5, leads: 7 } }, tr).leads, 7);
  assert.deepEqual(effectiveResults({ status: 'posted', linkCampaign: 'p-a1' }, tr), { reach: null, engagement: null, leads: 3 });
  assert.equal(effectiveResults({ status: 'scheduled', linkCampaign: 'p-a1' }, tr), null);
  assert.equal(effectiveResults({ status: 'posted', linkCampaign: 'p-zz' }, tr), null);
  // and it feeds the learning: five posted posts that never had numbers typed in, but whose links brought enquiries
  const mk = (i, platform, n) => ({ id: `i${i}`, platform, pillar: 'educate', status: 'posted', postedOn: TODAY, scheduledFor: TODAY, linkCampaign: `p-i${i}`, body: 'b' });
  const posts = [mk(1, 'linkedin'), mk(2, 'linkedin'), mk(3, 'linkedin'), mk(4, 'facebook'), mk(5, 'facebook'), mk(6, 'facebook')];
  const tracked = new Map([['p-i1', 2], ['p-i2', 1], ['p-i3', 2]]);
  assert.equal(summarizeContent(posts, TODAY).withResults, 0);             // without the links nothing is known
  const s = summarizeContent(posts, TODAY, tracked);
  assert.equal(s.withResults, 3); assert.equal(s.totalLeads, 5);
  assert.equal(summarizeContent(posts, TODAY, new Map()).totalLeads, 0);
  assert.equal(linkMode('instagram'), 'bio'); assert.equal(linkMode('x'), 'inline');
});
console.log(`\n${n} content tests ok`);
