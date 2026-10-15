import assert from 'node:assert/strict';
import {
  sanitizeAutopilotSettings, AUTOPILOT_DEFAULTS, queueDocId, pickInboxLeads, pickDueFollowUps,
  isDraftStale, toReviewItem, summarizeQueue, QUEUE_KINDS, DRAFT_MAX_AGE_DAYS,
} from '../lib/draft-queue.js';
import { quickIntent, forwardStage } from '../lib/reply-intents.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('autopilot is OFF by default and settings are clamped / unknown keys dropped', () => {
  assert.equal(AUTOPILOT_DEFAULTS.enabled, false);
  const s = sanitizeAutopilotSettings({ enabled: true, firstPerRun: 999, followUpsPerRun: -5, evil: 'x', senderName: ' Ann\nLee ' });
  assert.equal(s.enabled, true);
  assert.equal(s.firstPerRun, 10);
  assert.equal(s.followUpsPerRun, 0);
  assert.equal(s.senderName, 'Ann Lee');
  assert.ok(!('evil' in s));
  assert.equal(sanitizeAutopilotSettings({}, { ...AUTOPILOT_DEFAULTS, enabled: true }).enabled, true); // untouched keys keep their value
});

t('queue ids are stable per lead (and per follow-up step), so a draft is never created twice', () => {
  assert.equal(queueDocId('u1', 'first', ' A@B.com '), 'u1_first_a@b.com');
  assert.equal(queueDocId('u1', 'followup', 'a@b.com', 2), 'u1_fu2_a@b.com');
  assert.notEqual(queueDocId('u1', 'followup', 'a@b.com', 1), queueDocId('u1', 'followup', 'a@b.com', 2));
});

const lead = (email, q, score, extra = {}) => ({ email, business_name: `Biz ${email}`, lead_quality: q, lead_quality_score: String(score), status: 'new', ...extra });
t('only HOT leads with an email are picked by default, best first, deduped, capped', () => {
  const leads = [lead('w@x.com', 'WARM', 70), lead('h2@x.com', 'HOT', 80), lead('h1@x.com', 'HOT', 95), lead('', 'HOT', 99), lead('h1@x.com', 'HOT', 50), lead('c@x.com', 'COLD', 99), lead('l@x.com', 'HOT', 99, { status: 'loaded' })];
  assert.deepEqual(pickInboxLeads(leads).map((l) => l.email), ['h1@x.com', 'h2@x.com']);
  assert.deepEqual(pickInboxLeads(leads, { includeWarm: true }).map((l) => l.email), ['h1@x.com', 'h2@x.com', 'w@x.com']);
  assert.equal(pickInboxLeads(leads, { max: 1 }).length, 1);
  assert.deepEqual(pickInboxLeads(leads, { skip: new Set(['h1@x.com']) }).map((l) => l.email), ['h2@x.com']);
});

t('follow-ups: only due, open, email, prospect tasks; one per lead; earliest first', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  const tasks = [
    { id: 'a', leadEmail: 'A@x.com', channel: 'email', scheduledFor: '2026-10-14T00:00:00Z', status: 'pending', followUpStage: 'follow_up_1' },
    { id: 'a2', leadEmail: 'a@x.com', channel: 'email', scheduledFor: '2026-10-10T00:00:00Z', status: 'pending', followUpStage: 'follow_up_2' },
    { id: 'b', leadEmail: 'b@x.com', channel: 'email', scheduledFor: '2026-10-20T00:00:00Z', status: 'pending' },
    { id: 'c', leadEmail: 'c@x.com', channel: 'sms', scheduledFor: '2026-10-01T00:00:00Z', status: 'pending' },
    { id: 'd', leadEmail: 'd@x.com', channel: 'email', scheduledFor: '2026-10-01T00:00:00Z', status: 'completed' },
    { id: 'e', leadEmail: 'e@x.com', channel: 'email', scheduledFor: '2026-10-01T00:00:00Z', status: 'pending', followUpStage: 'onboarding' },
    { id: 'f', leadEmail: 'f@x.com', channel: 'email', status: 'pending' },
  ];
  const got = pickDueFollowUps(tasks, { now, postSaleStages: ['onboarding'] });
  assert.deepEqual(got.map((x) => x.id), ['f', 'a2']); // unscheduled first, same order as the dashboard's own due list
  assert.deepEqual(pickDueFollowUps(tasks, { now, postSaleStages: ['onboarding'], skip: new Set(['a@x.com']) }).map((x) => x.id), ['f']);
});

t('drafts go stale after the max age', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  assert.equal(isDraftStale(new Date(now - 86400000).toISOString(), now), false);
  assert.equal(isDraftStale(new Date(now - (DRAFT_MAX_AGE_DAYS + 1) * 86400000).toISOString(), now), true);
  assert.equal(isDraftStale(undefined, now), true);
});

t('review items match the shape the review window already uses; summary counts kinds', () => {
  const first = toReviewItem({ kind: 'first', email: 'a@x.com', business: 'A', quality: 'HOT', subject: 's', body: 'b' }, 'id1');
  assert.deepEqual([first.id, first.queueId, first.selected, first.state], ['a@x.com', 'id1', true, 'draft']);
  const fu = toReviewItem({ kind: 'followup', email: 'a@x.com', business: 'A', subject: 's', body: 'b', number: 2, isFinal: false, taskId: 't1' }, 'id2');
  assert.equal(fu.task.id, 't1');
  assert.equal(fu.number, 2);
  assert.deepEqual(summarizeQueue([{ kind: QUEUE_KINDS.FIRST }, { kind: QUEUE_KINDS.FOLLOWUP }, { kind: QUEUE_KINDS.FIRST }]), { first: 2, followup: 1, inbound: 0, total: 3 });
});

t('quickIntent: out-of-office and explicit opt-out are recognised, ordinary replies are not', () => {
  assert.equal(quickIntent('Automatic reply: I am out of office until Monday'), 'out_of_office');
  assert.equal(quickIntent('Thanks, I am on leave until 3 Nov. I will be back on 4 Nov.'), 'out_of_office');
  assert.equal(quickIntent('Please stop emailing me.'), 'unsubscribe');
  assert.equal(quickIntent('UNSUBSCRIBE'), 'unsubscribe');
  assert.equal(quickIntent('Out of office. Please do not email me again'), 'out_of_office'); // auto-reply wins; a person can opt out again
  assert.equal(quickIntent('Sounds interesting, can we talk Tuesday?'), null);
  assert.equal(quickIntent('How much does it cost?'), null);
  assert.equal(quickIntent(''), null);
});

t('quickIntent ignores quoted text: our own unsubscribe footer in the quoted original must never count', () => {
  const preview = 'Sounds great, send me details On Mon, Oct 12, 2026 at 9:00 AM Sam <sam@biz.com> wrote: Hi there, we help ... If you would rather not hear from us, unsubscribe here';
  assert.equal(quickIntent(preview), null);
  assert.equal(quickIntent('Re: Quick idea Sounds great On Tue, 13 Oct 2026, Sam wrote: ... out of office ...'), null);
  assert.equal(quickIntent('Please unsubscribe me On Mon, Oct 12 Sam wrote: Hi'), 'unsubscribe'); // their own words before the quote still count
});

t('forwardStage only moves a deal forward through OPEN stages; never Won, never Lost, never backwards', () => {
  assert.equal(forwardStage(null, 'qualified'), 'qualified'); // no deal yet: create it
  assert.equal(forwardStage('contacted', 'qualified'), 'qualified');
  assert.equal(forwardStage('qualified', 'demo'), 'demo');
  assert.equal(forwardStage('demo', 'qualified'), null); // never backwards
  assert.equal(forwardStage('proposal', 'qualified'), null);
  assert.equal(forwardStage('qualified', 'qualified'), null);
  assert.equal(forwardStage('closed_won', 'qualified'), null); // a person decides
  assert.equal(forwardStage('closed_lost', 'qualified'), null);
  assert.equal(forwardStage('qualified', 'closed_lost'), null); // never auto-Lost
  assert.equal(forwardStage('contacted', null), null);
});

console.log(`${n} draft-queue tests passed`);
