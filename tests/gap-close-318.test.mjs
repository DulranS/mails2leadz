// Pass 318: per-topic marketing stops. A person can stop follow-up reminders, or campaigns and offers, without stopping the rest.
// A sales-wide stop, a stop-all, a bounce or a Lost deal still stops marketing. Invoices and replies are never stopped by a topic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { blockDecision, topicBlocked, kindOfSource, resubscribeDecision, TOPICS, TOPIC_SOURCE } from '../lib/contact-rules.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('the two topics are follow-up reminders and campaigns', () => {
  assert.deepEqual(TOPICS, ['follow_ups', 'campaigns']);
});

t('a follow-up stop blocks follow-ups only; a campaign still goes', () => {
  assert.equal(blockDecision({ topics: ['follow_ups'] }, 'marketing', 'follow_ups'), true);
  assert.equal(blockDecision({ topics: ['follow_ups'] }, 'marketing', 'campaigns'), false);
});

t('a campaign stop blocks campaigns only; a follow-up still goes', () => {
  assert.equal(blockDecision({ topics: ['campaigns'] }, 'marketing', 'campaigns'), true);
  assert.equal(blockDecision({ topics: ['campaigns'] }, 'marketing', 'follow_ups'), false);
});

t('a topic stop never blocks an invoice or a reply', () => {
  assert.equal(blockDecision({ topics: ['follow_ups', 'campaigns'] }, 'transactional', 'follow_ups'), false);
  assert.equal(blockDecision({ topics: ['campaigns'] }, 'transactional', 'campaigns'), false);
});

t('a sales-wide stop, a lost deal and an overdue balance still stop every marketing topic', () => {
  assert.equal(blockDecision({ kind: 'marketing' }, 'marketing', 'follow_ups'), true);
  assert.equal(blockDecision({ kind: 'marketing' }, 'marketing', 'campaigns'), true);
  assert.equal(blockDecision({ lostReason: 'Went elsewhere' }, 'marketing', 'follow_ups'), true);
  assert.equal(blockDecision({ owesTooLong: true }, 'marketing', 'campaigns'), true);
});

t('with no stop on the record, marketing goes out on both topics', () => {
  assert.equal(blockDecision({}, 'marketing', 'follow_ups'), false);
  assert.equal(blockDecision({}, 'marketing'), false);
});

t('a stop-all still blocks everything', () => {
  assert.equal(blockDecision({ kind: 'all' }, 'marketing', 'campaigns'), true);
  assert.equal(topicBlocked({ kind: 'all' }, 'follow_ups'), true);
});

t('topicBlocked: a sales stop covers both topics; a topic stop covers only its own', () => {
  assert.equal(topicBlocked({ kind: 'marketing' }, 'campaigns'), true);
  assert.equal(topicBlocked({ topics: ['campaigns'] }, 'follow_ups'), false);
  assert.equal(topicBlocked({ topics: ['campaigns'] }, 'campaigns'), true);
  assert.equal(topicBlocked({}, 'campaigns'), false);
});

t('a topic-only stop is not a sales stop: it has no kind of its own', () => {
  assert.equal(kindOfSource(TOPIC_SOURCE), null);
  assert.equal(kindOfSource('unsubscribe_link'), 'marketing');
  assert.equal(kindOfSource('voice_call'), 'marketing');
  assert.equal(kindOfSource('bounce'), 'all');
  assert.equal(kindOfSource('all_mail'), 'all');
});

t('a topic stop can be switched back on from its own link', () => {
  assert.deepEqual(resubscribeDecision(TOPIC_SOURCE), { ok: true, changed: true });
});

t('the unsubscribe route and page offer the topic stops, and the send paths pass a topic', () => {
  const route = fs.readFileSync(new URL('../app/api/unsubscribe/route.js', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../app/unsubscribe/page.js', import.meta.url), 'utf8');
  const suppress = fs.readFileSync(new URL('../lib/server/suppress.js', import.meta.url), 'utf8');
  const followUp = fs.readFileSync(new URL('../app/api/send-followup/route.js', import.meta.url), 'utf8');
  const queue = fs.readFileSync(new URL('../lib/server/queue-checks.js', import.meta.url), 'utf8');
  assert.ok(route.includes("'stop_topic'") && route.includes('TOPICS.includes(topic)'));
  assert.ok(page.includes('Stop follow-up reminders') && page.includes('Stop campaigns and offers'));
  assert.ok(suppress.includes('keptSource') && suppress.includes('stopsFollowUps'));
  assert.ok(followUp.includes("'follow_ups'"));
  assert.ok(queue.includes("QUEUE_KINDS.FOLLOWUP ? 'follow_ups' : 'campaigns'"));
});

console.log(`gap-close-318: ${n} checks pass`);
