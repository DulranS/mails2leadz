import assert from 'node:assert/strict';
import { sanitizeWebhookUrl, planAutoPosts, webhookPayload, REVIEW_HOURS } from '../lib/post-webhook.js';
import { sanitizeAutoSend, autoPostAlert, lastRunLine } from '../lib/autosend.js';
import { buildNextActions } from '../lib/next-actions.js';
import { computeBusinessMetrics } from '../lib/business-metrics.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = Date.parse('2026-10-20T06:00:00Z');
const TODAY = '2026-10-20';
const post = (o = {}) => ({ id: 'p', platform: 'linkedin', status: 'scheduled', scheduledFor: TODAY, body: 'A real post about our work.', createdAt: '2026-10-10T00:00:00Z', ...o });

t('webhook address: https only, no credentials, no spaces; junk becomes off', () => {
  assert.equal(sanitizeWebhookUrl(' https://hooks.zapier.com/hooks/catch/1/abc/ '), 'https://hooks.zapier.com/hooks/catch/1/abc/');
  for (const bad of ['http://hooks.x.com/a', 'ftp://x.com', 'https://u:p@x.com/a', 'https://x.com/a b', 'javascript:alert(1)', '', null, 5, 'https://' + 'a'.repeat(600) + '.com']) assert.equal(sanitizeWebhookUrl(bad), '');
});
t('settings: auto-post needs an address, defaults off, and clearing the address turns it off', () => {
  assert.equal(sanitizeAutoSend({}).autoPost, false);
  assert.equal(sanitizeAutoSend({ autoPost: true }).autoPost, false); // no address: nothing to call
  const on = sanitizeAutoSend({ autoPost: true, postWebhookUrl: 'https://hook.make.com/x' });
  assert.equal(on.autoPost, true); assert.equal(on.postWebhookUrl, 'https://hook.make.com/x');
  assert.equal(sanitizeAutoSend({ postWebhookUrl: '' }, on).autoPost, false);
  assert.equal(sanitizeAutoSend({ autoPost: false }, on).autoPost, false);
  assert.equal(sanitizeAutoSend({ autoSend: true }, on).autoPost, true); // unrelated edits keep it
});
t('plan: due and overdue scheduled posts go, oldest first; future, posted, skipped, stale, empty, unknown-network ones do not', () => {
  const posts = [post({ id: 'today' }), post({ id: 'yday', scheduledFor: '2026-10-19' }), post({ id: 'future', scheduledFor: '2026-10-21' }), post({ id: 'done', status: 'posted' }),
    post({ id: 'skipped', status: 'skipped' }), post({ id: 'stale', scheduledFor: '2026-10-10' }), post({ id: 'empty', body: '  ' }), post({ id: 'myspace', platform: 'myspace' }), post({ id: 'nodate', scheduledFor: '' })];
  const { send, held } = planAutoPosts(posts, TODAY, NOW);
  assert.deepEqual(send.map((p) => p.id), ['yday', 'today']);
  assert.deepEqual(held.map((h) => [h.post.id, h.why]).sort(), [['empty', 'unusable'], ['myspace', 'unusable'], ['stale', 'stale']]);
});
t('plan: a post with an unfilled [placeholder] is never sent; an AI draft waits for the review window; the cap holds', () => {
  const { send, held } = planAutoPosts([post({ id: 'ph', body: 'We helped [customer name] grow.' }), post({ id: 'ai', autoDrafted: true, createdAt: new Date(NOW - 2 * 3600000).toISOString() }),
    post({ id: 'ai-old', autoDrafted: true, createdAt: new Date(NOW - (REVIEW_HOURS + 1) * 3600000).toISOString() }), post({ id: 'hand', createdAt: new Date(NOW - 60000).toISOString() })], TODAY, NOW);
  assert.deepEqual(send.map((p) => p.id).sort(), ['ai-old', 'hand']); // a post the owner wrote themselves is not delayed
  assert.deepEqual(held.map((h) => [h.post.id, h.why]).sort(), [['ai', 'review'], ['ph', 'placeholder']]);
  const many = Array.from({ length: 10 }, (_, i) => post({ id: `m${i}`, scheduledFor: `2026-10-${String(18 + (i % 3)).padStart(2, '0')}` }));
  const capped = planAutoPosts(many, TODAY, NOW, 4);
  assert.equal(capped.send.length, 4); assert.equal(capped.held.filter((h) => h.why === 'cap').length, 6);
});
t('payload: ready-to-publish text with hashtags and the tagged link where the network can use it; Instagram gets none inline', () => {
  const link = 'https://app.x/enquire?k=K&src=linkedin';
  const li = webhookPayload(post({ id: 'a', hashtags: ['#web', '#sme'], visual: 'A desk' }), { link });
  assert.equal(li.event, 'post.due'); assert.equal(li.postId, 'a'); assert.equal(li.platform, 'linkedin'); assert.equal(li.linkInText, true);
  assert.equal(li.text, `A real post about our work.\n\nEnquire here: ${link}\n\n#web #sme`); assert.equal(li.visualBrief, 'A desk');
  const ig = webhookPayload(post({ platform: 'instagram', hashtags: ['#a'] }), { link });
  assert.equal(ig.linkInText, false); assert.ok(!ig.text.includes('enquire')); assert.equal(ig.text, 'A real post about our work.\n\n#a');
  assert.equal(webhookPayload(post(), {}).linkInText, false); // no enquiry key yet: still posts, just without the link
});
t('a failed publish is never silent: it becomes a warning on the Business page, and a good run reports what was published', () => {
  assert.equal(autoPostAlert({ autoPost: true, autoPostError: '' }), null);
  assert.equal(autoPostAlert({ autoPost: false, autoPostError: 'x' }), null);
  const q = computeBusinessMetrics({ deals: [], now: NOW });
  const list = buildNextActions({ metrics: q, autopilot: { settings: { autoPost: true, autoPostError: 'Your automation answered with HTTP 500.' } } });
  const a = list.find((x) => x.id === 'autopost_failed');
  assert.equal(a.priority, 2); assert.match(a.detail, /HTTP 500/); assert.match(a.detail, /tried again tomorrow/);
  assert.equal(lastRunLine(null, { at: 'y', published: 2 }), '2 posts published');
});
console.log(`\n${n} post-webhook tests ok`);
